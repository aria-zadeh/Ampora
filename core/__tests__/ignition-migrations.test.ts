/**
 * Ignition v0 -> v1 persisted-state migrations.
 *
 * These are pure functions (types + `core/blocking/limits`, no MMKV, no store),
 * so they are testable directly. What is asserted here is not shape-shuffling
 * but the three wellbeing promises the migration makes:
 *
 *   1. an upgrade never resurrects a lock,
 *   2. an upgrade never silently upgrades a stake to a stricter hold,
 *   3. an upgrade never deletes a row from the user's Proof Log.
 */

import { describe, expect, it } from 'vitest'
import {
  ALL_APPS_CATEGORY_TOKENS,
  NEVER_LOCK_CATEGORIES,
  isAllAppsCategory,
  isNeverLockCategory,
} from '@/core/blocking/limits'
import { migrateProofMethod, migrateProofs } from '@/store/migrations/proofs'
import { clampWellbeing, mergeSettingsState, migrateSettings, normalizeSettings } from '@/store/migrations/settings'
import { migrateLockEvents, migrateStakeSession, migrateStakes } from '@/store/migrations/stakes'
import type { Settings } from '@/types'

const NOW = Date.UTC(2026, 6, 28, 12, 0, 0)

/** A v0 stakes blob, shaped exactly as the old store wrote it. */
function legacyStakesBlob(overrides: Record<string, unknown> = {}) {
  return {
    apps: [{ id: 'tiktok', platform: 'ios', tokenOrPackage: 'com.zhiliaoapp.musically', eligible: true }],
    activeSession: {
      id: 'active-1',
      taskId: 'task-1',
      deviceId: 'device-1',
      mode: 'lock_until_done',
      completionCondition: 'task',
      conditionRefId: 'sub-9',
      strength: 0.8,
      startedAt: NOW - 20 * 60_000,
    },
    sessions: {
      'past-1': {
        id: 'past-1',
        taskId: 'task-0',
        deviceId: 'device-1',
        mode: 'beat_the_clock',
        completionCondition: 'first_move',
        timerMinutes: 15,
        cooldownMinutes: 30,
        strength: 0.6,
        startedAt: NOW - 86_400_000,
        endedAt: NOW - 86_000_000,
        outcome: 'completed',
      },
    },
    events: [
      { id: 'e1', sessionId: 'past-1', type: 'shield_on', at: NOW - 86_400_000 },
      { id: 'e2', sessionId: 'past-1', type: 'cooldown_start', at: NOW - 86_300_000 },
      { id: 'e3', sessionId: 'past-1', type: 'shield_off', at: NOW - 86_000_000 },
    ],
    todayLockMin: 42,
    todayLockDay: new Date(NOW).toDateString(),
    stakesPausedUntil: null,
    recentPanics: 1,
    defaultStrength: 0.4,
    ...overrides,
  }
}

describe('stakes migration (v0 -> v1)', () => {
  it('never resurrects a lock: a persisted activeSession comes back retired and unlocked', () => {
    const out = migrateStakes(legacyStakesBlob(), 0, NOW)

    expect(out.activeSession).toBeNull()
    // The session itself is preserved — it is the user's own record.
    expect(out.sessions['active-1']).toBeDefined()
    expect(out.sessions['active-1'].outcome).toBe('expired')
    expect(out.sessions['active-1'].endedAt).toBe(NOW)
  })

  it('downgrades lock_until_done to the session hold rather than until_done', () => {
    // `until_done` needs an eligibility check and an image verification method
    // that no v0 row carries, so downgrading is the only safe direction.
    const out = migrateStakes(legacyStakesBlob(), 0, NOW)
    expect(out.sessions['active-1'].hold).toBe('session')
    expect(out.sessions['past-1'].hold).toBe('session')
  })

  it('drops the completion condition entirely instead of translating it', () => {
    const out = migrateStakes(legacyStakesBlob(), 0, NOW)
    const session: object = out.sessions['past-1']
    // Translating `first_move` forward would carry the anti-pattern with it:
    // doing the first move must never end a lock.
    expect('completionCondition' in session).toBe(false)
    expect('conditionRefId' in session).toBe(false)
    expect('mode' in session).toBe(false)
    expect('timerMinutes' in session).toBe(false)
    expect('cooldownMinutes' in session).toBe(false)
  })

  it('collapses a bounded v0 lock window into sessionMin, clamped to 15..50', () => {
    const out = migrateStakes(legacyStakesBlob(), 0, NOW)
    // cooldownMinutes (the real lock duration) wins over timerMinutes (the grace).
    expect(out.sessions['past-1'].sessionMin).toBe(30)

    const long = migrateStakeSession({ id: 's', cooldownMinutes: 240 })
    expect(long?.sessionMin).toBe(50)

    const none = migrateStakeSession({ id: 's' })
    expect(none?.sessionMin).toBeUndefined()
  })

  it('defaults every migrated row to trigger=manual and verification=honor', () => {
    const out = migrateStakes(legacyStakesBlob(), 0, NOW)
    expect(out.sessions['past-1'].trigger).toBe('manual')
    // Honor is the tier that gates nothing, so a historical row can never be
    // mistaken for evidence that was collected.
    expect(out.sessions['past-1'].verification).toBe('honor')
  })

  it('drops cooldown_start events rather than remapping them', () => {
    const events = migrateLockEvents(legacyStakesBlob().events)
    expect(events.map((e) => e.type)).toEqual(['shield_on', 'shield_off'])
  })

  it('starts with no selection and no scheduled stakes, and drops defaultStrength', () => {
    const out = migrateStakes(legacyStakesBlob(), 0, NOW)
    expect(out.selection).toBeNull()
    expect(out.scheduledStakes).toEqual({})
    // Its new home is settings.stakeStrength, bridged in settingsStore.
    expect('defaultStrength' in (out as object)).toBe(false)
  })

  it('carries the daily accrual forward so an upgrade cannot reset the cap', () => {
    const out = migrateStakes(legacyStakesBlob(), 0, NOW)
    expect(out.todayLockMin).toBe(42)
    expect(out.recentPanics).toBe(1)
  })

  it('survives a garbage blob without throwing', () => {
    expect(() => migrateStakes(null, 0, NOW)).not.toThrow()
    expect(() => migrateStakes('not an object', 0, NOW)).not.toThrow()
    const out = migrateStakes({ sessions: { bad: { noId: true } }, events: 'nope' }, 0, NOW)
    expect(out.sessions).toEqual({})
    expect(out.events).toEqual([])
    expect(out.activeSession).toBeNull()
  })
})

describe('settings migration (v0 -> v1)', () => {
  it('retires stakeStrengthBounds and installs the new wellbeing fields', () => {
    const out = migrateSettings({ settings: { stakeStrengthBounds: { min: 0, max: 1 } } }, 0)
    expect('stakeStrengthBounds' in (out.settings as object)).toBe(false)
    expect(out.settings.stakeStrength).toBe(0.6)
    expect(out.settings.singleSessionCapMin).toBe(50)
    expect(out.settings.defaultSessionMin).toBe(45)
  })

  it('clamps every wellbeing numeric, including a daily cap someone tried to raise', () => {
    const clamped = clampWellbeing({
      dailyLockCapMin: 600, // FR-46: user-lowerable, never user-raisable
      singleSessionCapMin: 999,
      defaultSessionMin: -5,
      stakeStrength: 7,
    })
    expect(clamped.dailyLockCapMin).toBe(180)
    expect(clamped.singleSessionCapMin).toBe(50)
    expect(clamped.defaultSessionMin).toBe(15)
    expect(clamped.stakeStrength).toBe(1)
  })

  it('never lets defaultSessionMin exceed the single-session cap', () => {
    const clamped = clampWellbeing({ singleSessionCapMin: 20, defaultSessionMin: 45 })
    expect(clamped.defaultSessionMin).toBe(20)
  })

  it('re-adds any protected never-lock category a blob lost', () => {
    const clamped = clampWellbeing({ neverLockCategories: ['games'] })
    for (const category of NEVER_LOCK_CATEGORIES) {
      expect(clamped.neverLockCategories).toContain(category)
    }
    expect(clamped.neverLockCategories).toContain('games')
  })

  it('repairs a malformed quiet-hours window instead of dropping it', () => {
    expect(clampWellbeing({ quietHours: undefined }).quietHours).toEqual({ start: 23 * 60, end: 8 * 60 })
    // A wrapping window is legitimate and must survive.
    expect(clampWellbeing({ quietHours: { start: 1380, end: 480 } }).quietHours).toEqual({ start: 1380, end: 480 })
  })

  it('deep-merges a persisted blob over the defaults instead of replacing them', () => {
    const current = {
      settings: normalizeSettings({
        dailyLockCapMin: 180,
        singleSessionCapMin: 50,
        defaultSessionMin: 45,
        stakeStrength: 0.6,
        quietHours: { start: 23 * 60, end: 8 * 60 },
        neverLockCategories: [...NEVER_LOCK_CATEGORIES],
        maxNotificationsPerHour: 1,
        themePreference: 'system',
        onboardingComplete: false,
      }) as Settings,
    }
    // An older blob that only knew about the daily cap.
    const merged = mergeSettingsState({ settings: { dailyLockCapMin: 60 } }, current)

    expect(merged.settings.dailyLockCapMin).toBe(60) // persisted value wins
    expect(merged.settings.themePreference).toBe('system') // default survives
    expect(merged.settings.singleSessionCapMin).toBe(50) // new default filled in
  })

  it('re-clamps on merge, so a restored blob cannot reintroduce an out-of-bounds cap', () => {
    const current = { settings: normalizeSettings({}) as Settings }
    const merged = mergeSettingsState({ settings: { dailyLockCapMin: 10_000 } }, current)
    expect(merged.settings.dailyLockCapMin).toBe(180)
  })

  it('preserves sibling keys stored alongside `settings`', () => {
    const out: Record<string, unknown> = { ...migrateSettings({ settings: {}, calendarSyncCalendarIds: ['cal-1'] }, 0) }
    expect(out.calendarSyncCalendarIds).toEqual(['cal-1'])
  })
})

describe('proofs migration (v0 -> v1)', () => {
  it('remaps the retired tiers rather than deleting the rows', () => {
    expect(migrateProofMethod('word_count')).toBe('honor') // a self-reported claim
    expect(migrateProofMethod('screen_aware')).toBe('focus_time') // app-observed activity
  })

  it('passes the four supported methods through untouched', () => {
    for (const method of ['honor', 'focus_time', 'photo', 'screenshot'] as const) {
      expect(migrateProofMethod(method)).toBe(method)
    }
  })

  it('keeps every well-formed row, with its image and verdict intact', () => {
    const out = migrateProofs(
      {
        proofs: {
          p1: { id: 'p1', sessionId: 's1', method: 'word_count', at: 10 },
          p2: { id: 'p2', sessionId: 's1', method: 'photo', uri: 'file://a.jpg', aiVerdict: 'uncertain', overridden: true, at: 20 },
          p3: { id: 'p3', sessionId: 's2', method: 'screen_aware', at: 30 },
        },
      },
      0
    )
    expect(Object.keys(out.proofs)).toHaveLength(3)
    expect(out.proofs.p1.method).toBe('honor')
    expect(out.proofs.p2).toEqual({
      id: 'p2',
      sessionId: 's1',
      method: 'photo',
      uri: 'file://a.jpg',
      aiVerdict: 'uncertain',
      overridden: true,
      at: 20,
    })
    expect(out.proofs.p3.method).toBe('focus_time')
  })

  it('falls back to honor for an unrecognised method instead of dropping the row', () => {
    const out = migrateProofs({ proofs: { p1: { id: 'p1', sessionId: 's', method: 'telepathy', at: 1 } } }, 0)
    expect(out.proofs.p1.method).toBe('honor')
  })

  it('survives a garbage blob without throwing', () => {
    expect(migrateProofs(null, 0).proofs).toEqual({})
    expect(migrateProofs({ proofs: [1, 2, 3] }, 0).proofs).toEqual({})
  })
})

describe('never-lock enforcement helpers', () => {
  it('matches protected categories case- and whitespace-insensitively', () => {
    expect(isNeverLockCategory(' Phone ', NEVER_LOCK_CATEGORIES)).toBe(true)
    expect(isNeverLockCategory('MESSAGES', NEVER_LOCK_CATEGORIES)).toBe(true)
    expect(isNeverLockCategory('ampora', NEVER_LOCK_CATEGORIES)).toBe(true)
    expect(isNeverLockCategory('instagram', NEVER_LOCK_CATEGORIES)).toBe(false)
    expect(isNeverLockCategory(undefined, NEVER_LOCK_CATEGORIES)).toBe(false)
  })

  it('recognises an "all apps" category, which must be refused outright', () => {
    for (const token of ALL_APPS_CATEGORY_TOKENS) {
      expect(isAllAppsCategory(token.toUpperCase())).toBe(true)
    }
    expect(isAllAppsCategory('com.burbn.instagram')).toBe(false)
    expect(isAllAppsCategory(undefined)).toBe(false)
  })
})
