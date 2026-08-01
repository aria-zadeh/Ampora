/**
 * Settings store — the single `Settings` object (PRD §9.4, §9.10, §8.11).
 *
 * Local-first via MMKV. This store owns the values the WELLBEING layer is
 * enforced from (daily cap, single-session cap, quiet hours, never-lock
 * categories, stake strength), so as of v1 every read and every write goes
 * through `normalizeSettings` in `store/migrations/settings.ts`:
 *
 * - on read: `migrate` (v0 -> v1) then a DEEP `merge`, because zustand's
 *   default shallow merge would replace the whole `settings` object and drop
 *   any default added since the blob was written;
 * - on write: `updateSettings` clamps, where it previously did a raw spread
 *   with no validation at all. A value that cannot be stored cannot be
 *   enforced, so the clamp belongs on the write path, not only in the readers.
 */

import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { mmkv, mmkvStateStorage } from '@/store/mmkv'
import { startTrial } from '@/core/subscription'
import {
  SETTINGS_PERSIST_VERSION,
  mergeSettingsState,
  migrateSettings,
  normalizeSettings,
} from '@/store/migrations/settings'
import {
  DEFAULT_DAILY_LOCK_CAP_MIN,
  DEFAULT_SESSION_MIN,
  DEFAULT_SINGLE_SESSION_CAP_MIN,
  DEFAULT_STAKE_STRENGTH,
  NEVER_LOCK_CATEGORIES,
  STAKE_STRENGTH_BOUNDS,
  clampTo,
} from '@/core/blocking/limits'
import type { Settings } from '@/types'

const defaultSettings: Settings = {
  // Ignition / wellbeing (PRD §9.10). Bounds for these live in
  // `core/blocking/limits.ts` — they are code constants, not user data.
  dailyLockCapMin: DEFAULT_DAILY_LOCK_CAP_MIN,
  singleSessionCapMin: DEFAULT_SINGLE_SESSION_CAP_MIN,
  defaultSessionMin: DEFAULT_SESSION_MIN,
  quietHours: { start: 23 * 60, end: 8 * 60 }, // 23:00 - 08:00
  neverLockCategories: [...NEVER_LOCK_CATEGORIES],
  stakeStrength: DEFAULT_STAKE_STRENGTH,
  subscription: { status: 'trial' },

  // App preferences
  schedulingHours: {
    // Sensible default: Mon-Fri 3:00 PM - 9:00 PM (matches the PRD §7.3
    // "Study hours" example), none on weekends until the user sets their own.
    perDay: [1, 2, 3, 4, 5].map((day) => ({
      day,
      windows: [{ start: 15 * 60, end: 21 * 60 }],
    })),
  },
  maxNotificationsPerHour: 1,
  reminderKinds: { start: true, deadline: true, motivation: true },
  notificationNudgeDismissed: false,
  displayName: undefined,
  themePreference: 'system',
  onboardingComplete: false,

  // Calendar UI preferences (Phase 3). '3day' is the phone default (FR-23);
  // 60 px/hr is the middle-low zoom stop (FR-24). Optional on the type so
  // older persisted Settings still load — the Calendar screen defaults these
  // when a restored blob predates the fields.
  calendarView: '3day',
  calendarZoomPxPerHour: 60,

  // Scheduling defaults (PRD §8.11 / FR-9, FR-11, FR-14). Sensible engine
  // defaults a new auto-scheduled task inherits; per-task fields still override.
  defaultBufferBeforeMin: 0,
  defaultBufferAfterMin: 0,
  defaultSplittable: true,
  defaultMinBlockMin: 30,
  defaultMaxBlockMin: 120,
  workloadDistribution: 'balanced',
  autoScheduleCutoffWeeks: 4,
}

interface SettingsState {
  settings: Settings
  /**
   * Patch settings. Every numeric in the result is CLAMPED to its wellbeing
   * bound before it is stored (`normalizeSettings`), so no caller — a settings
   * screen, a sync merge, a future agent action — can write a daily cap, a
   * session length or a stake strength outside the rails.
   */
  updateSettings: (patch: Partial<Settings>) => void
  /**
   * Stamp a fresh 14-day trial window the first time the app runs. The default
   * subscription is `{ status: 'trial' }` with no `trialEndsAt`, which the
   * entitlement check reads as *expired* (so a brand-new user would hit the
   * paywall immediately). Calling this once at bootstrap gives new users the
   * real free trial. Idempotent: it only acts when status is still 'trial' and
   * no end date exists, so it never resets or extends an ongoing/lapsed plan.
   */
  ensureTrialStarted: () => void

  /**
   * Device calendar ids (from `services/calendarSync.ts#listCalendars`) the
   * user has opted into as "busy" input for the scheduling engine (FR-22).
   * Defaults to empty — reading every device calendar automatically would be
   * wrong (a birthdays/holidays calendar would block the whole schedule), so
   * nothing counts until the user explicitly picks a calendar in
   * `CalendarSyncSettings`. Kept as a sibling of `settings` rather than a
   * field on the `Settings` type itself (owned elsewhere right now); it still
   * persists via the same `persist` middleware below, riding along as a plain
   * extra key in the blob (the `settings`-scoped migration/merge machinery
   * above only reasons about `settings` itself, so on a genuine v0->v1
   * migration this one field alone would reset to its empty default rather
   * than carry forward — an acceptable, non-destructive degradation: the user
   * just reselects their calendars, nothing corrupts).
   */
  calendarSyncCalendarIds: string[]
  setCalendarSyncCalendarIds: (ids: string[]) => void
}

// ---------------------------------------------------------------------------
// Cross-store carry-over: `stakesStore.defaultStrength` -> `settings.stakeStrength`
//
// The v0 default strength lived in the STAKES blob, but its v1 home is Settings.
// Zustand migrations are per-store and cannot reach across, so the value is
// bridged here by reading the raw `ampora-stakes` string straight out of MMKV
// (synchronous, hence safe during rehydration).
//
// Order matters: this must run BEFORE the stakes migration rewrites that blob.
// `settingsStore` initialises first at import time and `app/_layout.tsx` touches
// settings before stakes — keep it that way deliberately.
//
// Guarded by a one-shot flag AND a try/catch: a malformed legacy blob must never
// be able to block settings hydration, because everything downstream (including
// the wellbeing layer) depends on settings loading.
// ---------------------------------------------------------------------------

const STRENGTH_MIGRATED_KEY = 'ampora-strength-migrated'

/** Read the v0 `defaultStrength` out of the raw stakes blob, or null. */
function readLegacyDefaultStrength(): number | null {
  try {
    if (mmkv.getBoolean(STRENGTH_MIGRATED_KEY)) return null
    const raw = mmkv.getString('ampora-stakes')
    if (!raw) return null
    const parsed = JSON.parse(raw) as { state?: { defaultStrength?: unknown } }
    const value = parsed?.state?.defaultStrength
    if (typeof value !== 'number' || !Number.isFinite(value)) return null
    return clampTo(value, STAKE_STRENGTH_BOUNDS, DEFAULT_STAKE_STRENGTH)
  } catch {
    // A malformed legacy blob is not worth a failed hydration. Skip the bridge.
    return null
  }
}

/** Mark the bridge as done so it never runs twice. Failure here is harmless. */
function markStrengthMigrated(): void {
  try {
    mmkv.set(STRENGTH_MIGRATED_KEY, true)
  } catch {
    // Ignore: worst case the bridge re-runs and writes the same value again.
  }
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      settings: defaultSettings,

      updateSettings: (patch) => {
        set((state) => ({ settings: normalizeSettings({ ...state.settings, ...patch }) }))
      },

      ensureTrialStarted: () => {
        set((state) => {
          const sub = state.settings.subscription
          if (sub.status === 'trial' && sub.trialEndsAt == null) {
            return { settings: { ...state.settings, subscription: startTrial() } }
          }
          return state
        })
      },

      calendarSyncCalendarIds: [],
      setCalendarSyncCalendarIds: (ids) => {
        set({ calendarSyncCalendarIds: ids })
      },
    }),
    {
      name: 'ampora-settings',
      storage: createJSONStorage(() => mmkvStateStorage),
      version: SETTINGS_PERSIST_VERSION,
      // The assertion is safe: `migrateSettings` returns the persisted slice and
      // `mergeSettingsState` (below) immediately merges it over the complete
      // initial state, restoring the actions.
      migrate: (persisted, version) => migrateSettings(persisted, version) as SettingsState,
      merge: (persisted, current) => mergeSettingsState(persisted, current),
      onRehydrateStorage: () => (state) => {
        if (!state) return
        const legacy = readLegacyDefaultStrength()
        markStrengthMigrated()
        if (legacy == null) return
        // Carry the user's de-escalated strength forward. Never raise it: if the
        // legacy value is gentler than the current one, the gentler value wins,
        // because de-escalation is the only thing that could have lowered it.
        if (legacy < state.settings.stakeStrength) {
          state.settings = { ...state.settings, stakeStrength: legacy }
        }
      },
    }
  )
)
