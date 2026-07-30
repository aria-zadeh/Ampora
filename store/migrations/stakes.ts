/**
 * `ampora-stakes` persisted-state migration (v0 -> v1).
 *
 * v0 modelled a stake as a MODE plus a COMPLETION CONDITION
 * (`lock_until_start` / `lock_until_done` / `beat_the_clock` x `first_move` /
 * `subtask` / `task`). v1 models it as a HOLD plus a TRIGGER (doc `04` §1-2,
 * FR-41). Three rules govern the conversion, and none of them is a matter of
 * taste:
 *
 * **1. Never resurrect a lock across an upgrade.** A persisted `activeSession`
 * is retired as `expired` and moved into history. The soft lock is module-level
 * state that does not survive a reload anyway, and the product would rather
 * under-lock than trap someone (NFR-7). An upgrade is exactly the moment a
 * ghost lock would be least explicable to the user.
 *
 * **2. `lock_until_done` migrates to `hold: 'session'`, NOT `until_done`.**
 * The new `until_done` hold requires an estimate-fits-one-session eligibility
 * check and an image verification method, neither of which a v0 row carries.
 * Historical rows are analytics only, and downgrading is the safe direction:
 * the worst case is a past session reads as slightly gentler than it was.
 * `lock_until_start` and `beat_the_clock` map to `'session'` for the plainer
 * reason that both were "get started" devices and the session hold is exactly
 * their replacement.
 *
 * **3. `completionCondition` is dropped entirely, not translated.** That
 * deletion IS the anti-leak change: "unlocks when you do the first move" is the
 * behaviour the session hold exists to remove (doc `04` §1, §5). Translating it
 * would carry the leak forward under a new name.
 *
 * `cooldown_start` events are dropped rather than remapped: rewriting them as
 * `shield_on` would fabricate history that never happened.
 *
 * Pure module: types + `core/blocking/limits` only. No MMKV, no store imports.
 */

import {
  DEFAULT_STAKE_STRENGTH,
  SESSION_MIN_BOUNDS,
  STAKE_STRENGTH_BOUNDS,
  clampTo,
} from '@/core/blocking/limits'
import type { LockEvent, StakeApp, StakeSelection, StakeSession } from '@/types'

/** The current persisted schema version for `ampora-stakes`. */
export const STAKES_PERSIST_VERSION = 1

/** The v0 stake session shape, as previously written to MMKV. */
interface LegacyStakeSession {
  id?: unknown
  taskId?: unknown
  deviceId?: unknown
  mode?: unknown
  completionCondition?: unknown
  conditionRefId?: unknown
  timerMinutes?: unknown
  cooldownMinutes?: unknown
  strength?: unknown
  startedAt?: unknown
  endedAt?: unknown
  outcome?: unknown
}

/** The v0 lock-event shape (its `type` union included `cooldown_start`). */
interface LegacyLockEvent {
  id?: unknown
  sessionId?: unknown
  type?: unknown
  at?: unknown
}

/** What the stakes store persists (actions are not serialized). */
export interface PersistedStakesState {
  apps: StakeApp[]
  selection: StakeSelection | null
  activeSession: StakeSession | null
  scheduledStakes: Record<string, StakeSession>
  sessions: Record<string, StakeSession>
  events: LockEvent[]
  todayLockMin: number
  todayLockDay: string
  stakesPausedUntil: number | null
  recentPanics: number
}

/** Outcomes that survive the migration unchanged (`session_served` is v1-only). */
const LEGACY_OUTCOMES = new Set(['completed', 'panic_valve', 'timed_out', 'expired'])

/** v1 event types. `cooldown_start` is deliberately absent — see the header. */
const V1_EVENT_TYPES = new Set<LockEvent['type']>([
  'shield_on',
  'shield_off',
  'panic_valve',
  'session_complete',
  'auto_arm',
  'cap_reached',
  'quiet_hours_release',
])

function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' && v !== '' ? v : fallback
}

function finiteNum(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined
}

/**
 * Convert one v0 session row. Returns null for a row too malformed to identify
 * (no id), because a session with no id cannot be keyed, referenced by an
 * event, or shown in the Proof Log — keeping it would only corrupt the record.
 */
export function migrateStakeSession(raw: LegacyStakeSession | StakeSession | undefined): StakeSession | null {
  if (!raw || typeof raw !== 'object') return null
  const legacy = raw as LegacyStakeSession
  const id = str(legacy.id)
  if (!id) return null

  // Rule 2: every v0 mode collapses to the session hold.
  const hold: StakeSession['hold'] = 'session'

  // A bounded v0 lock window becomes the session length. `cooldownMinutes` was
  // the real lock duration, `timerMinutes` only the grace before it; prefer the
  // former and fall back to the latter, then clamp into the v1 15..50 range.
  const bounded = finiteNum(legacy.cooldownMinutes) ?? finiteNum(legacy.timerMinutes)
  const sessionMin =
    bounded !== undefined && bounded > 0
      ? Math.round(clampTo(bounded, SESSION_MIN_BOUNDS, SESSION_MIN_BOUNDS.min))
      : undefined

  const outcome = typeof legacy.outcome === 'string' && LEGACY_OUTCOMES.has(legacy.outcome)
    ? (legacy.outcome as StakeSession['outcome'])
    : undefined

  const session: StakeSession = {
    id,
    taskId: str(legacy.taskId),
    deviceId: str(legacy.deviceId),
    hold,
    // v0 had no scheduled trigger: every stake was armed by a tap.
    trigger: 'manual',
    // v0 rows carry no verification method. `honor` is the honest reading —
    // nothing was ever collected — and it is also the tier that gates nothing,
    // so a historical row can never be mistaken for evidence.
    verification: 'honor',
    strength: clampTo(legacy.strength, STAKE_STRENGTH_BOUNDS, DEFAULT_STAKE_STRENGTH),
  }
  if (sessionMin !== undefined) session.sessionMin = sessionMin
  const startedAt = finiteNum(legacy.startedAt)
  if (startedAt !== undefined) session.startedAt = startedAt
  const endedAt = finiteNum(legacy.endedAt)
  if (endedAt !== undefined) session.endedAt = endedAt
  if (outcome !== undefined) session.outcome = outcome
  return session
}

/** Drop `cooldown_start`; keep every other well-formed event verbatim. */
export function migrateLockEvents(raw: unknown): LockEvent[] {
  if (!Array.isArray(raw)) return []
  const out: LockEvent[] = []
  for (const item of raw as LegacyLockEvent[]) {
    if (!item || typeof item !== 'object') continue
    const id = str(item.id)
    const type = item.type
    const at = finiteNum(item.at)
    if (!id || at === undefined) continue
    if (typeof type !== 'string' || !V1_EVENT_TYPES.has(type as LockEvent['type'])) continue
    out.push({ id, sessionId: str(item.sessionId), type: type as LockEvent['type'], at })
  }
  return out
}

/**
 * v0 -> v1 migration for the `ampora-stakes` blob.
 *
 * `nowMs` is injectable so the retirement timestamp is testable; it defaults to
 * the wall clock.
 */
export function migrateStakes(persisted: unknown, _version: number, nowMs = Date.now()): PersistedStakesState {
  const raw = (persisted && typeof persisted === 'object' ? persisted : {}) as Record<string, unknown>

  const sessions: Record<string, StakeSession> = {}
  const rawSessions = raw.sessions
  if (rawSessions && typeof rawSessions === 'object') {
    for (const value of Object.values(rawSessions as Record<string, LegacyStakeSession>)) {
      const migrated = migrateStakeSession(value)
      if (migrated) sessions[migrated.id] = migrated
    }
  }

  // Rule 1: retire, never resurrect. The session is preserved in history (it is
  // the user's own record) but it comes back UNLOCKED, with an honest outcome.
  const active = migrateStakeSession(raw.activeSession as LegacyStakeSession | undefined)
  if (active) {
    sessions[active.id] = {
      ...active,
      endedAt: active.endedAt ?? nowMs,
      outcome: active.outcome ?? 'expired',
    }
  }

  const apps = Array.isArray(raw.apps) ? (raw.apps as StakeApp[]) : []
  const todayLockMin = Math.max(0, Math.round(finiteNum(raw.todayLockMin) ?? 0))
  const pausedUntil = finiteNum(raw.stakesPausedUntil)

  return {
    apps,
    // v0 had no `StakeSelection`; the user re-picks through the AppPicker. Note
    // this is what makes `startStake` refuse with `no_selection` after an
    // upgrade rather than shielding something the user never confirmed.
    selection: null,
    activeSession: null,
    scheduledStakes: {},
    sessions,
    events: migrateLockEvents(raw.events),
    todayLockMin,
    todayLockDay: str(raw.todayLockDay, new Date(nowMs).toDateString()),
    stakesPausedUntil: pausedUntil ?? null,
    recentPanics: Math.max(0, Math.round(finiteNum(raw.recentPanics) ?? 0)),
    // `defaultStrength` is intentionally absent: its new home is
    // `settings.stakeStrength`, bridged once in `settingsStore`'s
    // `onRehydrateStorage` BEFORE this migration overwrites the blob.
  }
}
