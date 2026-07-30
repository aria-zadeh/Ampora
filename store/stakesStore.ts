/**
 * Stakes store — Ignition's wellbeing-governed SESSION layer (PRD FR-40..FR-46,
 * FR-77/78, §9.9 session lifecycle, §9.10 safety layer, §9.13 BlockingStrategy;
 * doc `04` for the model, doc `05` for enforcement).
 *
 * The unit of a lock is a FOCUS SESSION. That one decision is what this store
 * exists to enforce, because it fixes both failure modes of the model it
 * replaces (doc `04` §1):
 *   - lock-until-start LEAKED: doing the 2-minute first move handed the apps
 *     back, so the start got faked into an unlock. Hence `serveSession` is
 *     driven by focus time SERVED, and `completeStake` refuses to release a
 *     `hold: 'session'` lock no matter who calls it.
 *   - lock-until-done TRAPPED: a real task outruns the 180-minute daily cap.
 *     Hence `until_done` is opt-in, eligibility-checked, and converts to a
 *     normal session release the moment the single-session cap is reached.
 *
 * This store owns every wellbeing guardrail: daily lock cap, single-session
 * cap, quiet hours, never-lock categories, panic valve + de-escalation, and
 * pause-for-today. It talks to enforcement ONLY through `getBlockingStrategy()`
 * (soft in-app lock today; native OS shield later behind the feature flag), so
 * the safety rules are identical regardless of backend.
 *
 * Wellbeing stance (non-negotiable, §9.10, doc `04` §7): the app errs toward
 * the user. Caps clamp or refuse rather than trap. The panic valve and pause
 * are always available. Repeated panics DE-ESCALATE (lower stake strength,
 * offer a pause) — the app never responds to struggle by demanding more.
 *
 * Local-first via MMKV (persist key "ampora-stakes"). Enforcement side-effects
 * (applyShield/removeShield) run fire-and-forget and fail-safe: an enforcement
 * error never leaves the user locked (NFR-7, doc `05` §3.10).
 */

import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { getBlockingStrategy, getLockState, setLockSession } from '@/core/blocking'
import {
  SESSION_MIN_BOUNDS,
  STAKE_STRENGTH_BOUNDS,
  clampTo,
  isAllAppsCategory,
  isNeverLockCategory,
} from '@/core/blocking/limits'
import { newId } from '@/core/id'
import { mmkv, mmkvStateStorage } from '@/store/mmkv'
import { STAKES_PERSIST_VERSION, migrateStakes } from '@/store/migrations/stakes'
import { normalizeSettings } from '@/store/migrations/settings'
import { useSettingsStore } from '@/store/settingsStore'
import { useTaskStore } from '@/store/taskStore'
import type { LockEvent, Settings, StakeApp, StakeSelection, StakeSession } from '@/types'

// ---------------------------------------------------------------------------
// Device identity (per-device stakes, FR-41b — a lock on one device never
// locks another). Generated once and cached in MMKV, outside the persisted
// zustand blob so it survives store resets.
// ---------------------------------------------------------------------------

const DEVICE_ID_KEY = 'ampora-device-id'

/** Stable per-install device id. Created on first read and cached in MMKV. */
export function getDeviceId(): string {
  const existing = mmkv.getString(DEVICE_ID_KEY)
  if (existing) return existing
  const id = newId()
  mmkv.set(DEVICE_ID_KEY, id)
  return id
}

// ---------------------------------------------------------------------------
// Wellbeing helpers (pure) — quiet hours + never-lock. Kept as free functions
// so they are unit-testable and reusable by UI copy.
// ---------------------------------------------------------------------------

/** Minutes-from-midnight (0-1439) for an epoch-ms instant, local time. */
function minutesOfDay(atMs: number): number {
  const d = new Date(atMs)
  return d.getHours() * 60 + d.getMinutes()
}

/**
 * Whether `atMs` falls inside a minutes-from-midnight window. Handles windows
 * that wrap past midnight (e.g. 23:00-08:00, the default quiet hours). `start`
 * inclusive, `end` exclusive, matching `TimeWindow` semantics in types.
 */
export function isWithinWindow(atMs: number, window: { start: number; end: number }): boolean {
  const m = minutesOfDay(atMs)
  if (window.start === window.end) return false // empty window
  if (window.start < window.end) return m >= window.start && m < window.end
  // Wrapping window (spans midnight): inside if after start OR before end.
  return m >= window.start || m < window.end
}

/** Are we currently in the user's quiet hours? Stakes must not start; active ones release. */
export function isQuietHours(settings: Settings, atMs: number): boolean {
  return isWithinWindow(atMs, settings.quietHours)
}

/**
 * Whether a leisure-app category is lockable, i.e. NOT on the never-lock list
 * (phone, messages, maps, accessibility, OS settings, Ampora itself — §9.10,
 * doc `05` §4). Case-insensitive. A missing/empty category is treated as
 * lockable (the caller supplies a real leisure category).
 *
 * This is now ENFORCED, not merely available: `setSelection` runs every token
 * through it, and `components/stakes/AppPicker.tsx` filters its catalog with
 * it, so a protected category can never reach a shield.
 *
 * Takes only the field it reads, so a picker holding one settings value can
 * call it without materializing a whole `Settings`.
 */
export function isLockable(
  category: string | undefined,
  settings: Pick<Settings, 'neverLockCategories'>
): boolean {
  return !isNeverLockCategory(category, settings.neverLockCategories)
}

// ---------------------------------------------------------------------------
// De-escalation + recovery tuning (§9.10, doc `05` §3.9)
// ---------------------------------------------------------------------------

/**
 * A persisted `activeSession` older than this on launch is considered stale and
 * released rather than resumed (doc `05` §3.6 recovery bound). No legitimate
 * soft lock survives this long across an app restart, and the daily cap
 * (default 180m) already ceilings any real session well under it. Generous so a
 * genuine mid-session reload still recovers.
 */
const STALE_ACTIVE_SESSION_MAX_AGE_MS = 6 * 60 * 60 * 1000 // 6h

/** Panic count at/above which we offer to pause stakes and drop stake strength. */
const PANIC_DEESCALATE_THRESHOLD = 2
/** How much to drop the stake strength per de-escalation step. */
const STRENGTH_DEESCALATE_STEP = 0.2

/**
 * How long after a scheduled stake's arm moment it may still auto-arm. Without
 * this guard, opening the app at 9pm would arm a lock that was cued at 3pm —
 * the single most important rule in the auto-arm driver (ARCH_PLAN A4).
 * Exported for the scheduled-trigger driver that lands with the notification
 * plumbing.
 */
export const LATE_ARM_GRACE_MS = 10 * 60 * 1000 // 10 min

// ---------------------------------------------------------------------------
// Config + result types
// ---------------------------------------------------------------------------

/** Everything needed to arm (or schedule) one stake. */
export interface StakeConfig {
  taskId: string
  hold: StakeSession['hold']
  trigger: StakeSession['trigger']
  /** hold='session' only. Clamped to `[15, min(50, singleSessionCap, remainingCap)]`. */
  sessionMin?: number
  /** Scheduled trigger time, epoch ms. */
  scheduledAt?: number
  /** Scheduled only: arm anyway if not started within X minutes of the cue. */
  startWindowMin?: number
  verification: StakeSession['verification']
  /** 0..1; defaults to `settings.stakeStrength`. */
  strength?: number
}

/** Optional knobs for `startStake`. */
export interface StartStakeOptions {
  /** Set by the auto-arm driver so the scheduled row is consumed, not duplicated. */
  fromScheduledId?: string
}

/** Why `startStake` refused (so the UI can show calm, specific copy). */
export type StartStakeRefusal =
  | 'quiet_hours'
  | 'cap_reached'
  | 'paused'
  | 'already_active'
  /** Nothing has been chosen to put on the line yet. */
  | 'no_selection'
  /** `until_done` was requested for a task that does not fit one capped session. */
  | 'not_eligible'
  /** Defensive catch-all: something unexpected went wrong arming (never crashes the UI). */
  | 'error'

/** Result of attempting to start a stake. */
export type StartStakeResult =
  | { ok: true; session: StakeSession }
  | { ok: false; reason: StartStakeRefusal }

/** Pre-flight result, so refusal copy can be shown BEFORE the user commits. */
export type CanStartStakeResult = { ok: true } | { ok: false; reason: StartStakeRefusal }

/** How an `until_done` hold was satisfied (FR-77, FR-78). */
export type CompleteVia = 'proof' | 'task_done' | 'override'

/** Why `setSelection` refused (doc `05` §4). */
export type SetSelectionRefusal =
  /** A protected never-lock category was included. */
  | 'never_lock'
  /** An "all apps" category would sweep system-critical apps in behind it. */
  | 'all_apps'

/** Result of writing a stake selection. */
export type SetSelectionResult =
  | { ok: true; selection: StakeSelection | null }
  | { ok: false; reason: SetSelectionRefusal; blocked: string[] }

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

interface StakesState {
  /** Leisure apps the user opted to be able to lock (FR-40). Soft/Android view. */
  apps: StakeApp[]
  /** What `applyShield` shields: opaque tokens plus a count (doc `05` §7). */
  selection: StakeSelection | null
  /** The single active stake session, or null. Per-device (FR-41b), one at a time (FR-41c). */
  activeSession: StakeSession | null
  /** Scheduled-but-not-yet-armed stakes, keyed by id (FR-41a). */
  scheduledStakes: Record<string, StakeSession>
  /** All sessions (active + historical) keyed by id, for the Proof Log / analytics. */
  sessions: Record<string, StakeSession>
  /** Lifecycle events for analytics + de-escalation (§9.9). */
  events: LockEvent[]
  /** Accrued lock minutes for the current local day; auto-resets across days. */
  todayLockMin: number
  /** The local day (`toDateString()`) `todayLockMin` accrues for. */
  todayLockDay: string
  /** If set (epoch ms), stakes are paused until this instant (user opted for a break). */
  stakesPausedUntil: number | null
  /** Panic-valve uses in the current de-escalation window (reset on a good outcome). */
  recentPanics: number

  // -- Stake-app opt-in --
  setApps: (apps: StakeApp[]) => void
  addApp: (app: StakeApp) => void
  removeApp: (appId: string) => void

  /**
   * Write what is on the line. Every token is validated against the never-lock
   * categories, and an "all apps" category is REFUSED outright (doc `05` §4),
   * because on iOS the selection is opaque and a blanket category would sweep
   * phone/messages/maps in behind it. Pass `null` to clear.
   */
  setSelection: (selection: StakeSelection | null) => SetSelectionResult

  // -- Session lifecycle --
  /**
   * Arm a stake NOW. Enforces every wellbeing gate BEFORE locking (already
   * active / no selection / not eligible / paused / quiet hours / daily cap),
   * clamps the session length to what the caps allow, applies the shield via
   * `getBlockingStrategy()`, schedules the auto-expiry backstop, and logs
   * `shield_on`. Never throws.
   */
  startStake: (config: StakeConfig, opts?: StartStakeOptions) => StartStakeResult

  /**
   * Persist a scheduled stake and post its cue notifications (FR-41a).
   *
   * STUBBED. Implemented with the notification plumbing it depends on
   * (`services/stakeScheduling.ts` + selective cancellation + the response
   * listener). Declared now so the store's type surface is stable.
   */
  scheduleStake: (config: StakeConfig) => StartStakeResult

  /**
   * Cancel a scheduled stake and its cues.
   *
   * STUBBED alongside `scheduleStake` — it currently drops the row but posts no
   * cancellation, because nothing posts a cue yet.
   */
  cancelScheduledStake: (id: string) => void

  /**
   * Arm any scheduled stake whose window has come due. Idempotent and safe to
   * call on every foreground and 30s tick.
   *
   * STUBBED. The rules are fixed (ARCH_PLAN A4): arm at
   * `scheduledAt + startWindowMin`, never later than `LATE_ARM_GRACE_MS` after
   * that, never inside quiet hours, release early if the task is already done,
   * and skip (retry next tick) while another session is active.
   */
  autoArmDueStakes: (atMs?: number) => void

  /**
   * THE `hold: 'session'` UNLOCK. Removes the shield, logs `session_complete`
   * then `shield_off`, and ends the session `session_served`.
   *
   * It fires from focus time SERVED IN THE FOREGROUND and from nothing else.
   * Never from a first-move completion — that leak is the entire reason this
   * store was rebuilt (doc `04` §1, §5).
   */
  serveSession: (sessionId: string) => void

  /**
   * Credit `sec` seconds of foreground focus to the active session, and serve
   * it once `focusSec >= sessionMin * 60`. Called roughly once a second by the
   * session timer, which counts only while Ampora is foregrounded (FR-77b).
   */
  accrueFocus: (sessionId: string, sec: number) => void

  /**
   * THE `hold: 'until_done'` UNLOCK: verified completion (FR-77), an
   * "Unlock anyway" override (FR-78), or the task being completed during the
   * session. Removes the shield, ends `completed`, logs `shield_off`, and
   * resets `recentPanics`.
   *
   * Deliberately a NO-OP for `hold: 'session'`: a session hold is served by
   * time, so finishing the work early does not hand the apps back. Enforcing
   * that here rather than in the UI is what makes the anti-leak rule
   * unbypassable.
   */
  completeStake: (sessionId: string, via?: CompleteVia) => void

  /**
   * Panic valve (FR-42). Call AFTER the UI's 60s friction countdown. Removes
   * the shield, ends the session `panic_valve`, increments `recentPanics`, and
   * DE-ESCALATES (lowers `settings.stakeStrength`) when panics cross the
   * threshold. Logs `panic_valve` + `shield_off`. Always succeeds — never traps.
   */
  panicValve: (sessionId: string) => void

  /** Pause all stakes for the rest of the local day (de-escalation opt-in). Ends any active session. */
  pauseStakesForToday: () => void
  /** Clear a pause early (user chose to resume). */
  resumeStakes: () => void

  /**
   * Launch reconciliation for a persisted `activeSession` (doc `05` §3.6). The
   * soft in-app lock state is module-level and NOT persisted, so after a cold
   * start a persisted `activeSession` is never backed by a live lock. This
   * re-derives whether the session should still hold: it SERVES it when the
   * session length or the single-session cap has already elapsed, RELEASES it
   * (never leaving the user trapped by a ghost lock) when there is no live lock,
   * when it predates `now` beyond the recovery bound, during quiet hours, or
   * when the daily cap is exhausted — otherwise it re-applies the shield and
   * re-arms the auto-expiry so a genuine mid-session reload recovers cleanly.
   * Safe to call once on app launch; a no-op with no active session. Never throws.
   */
  reconcileActiveSession: (atMs?: number) => void

  /**
   * Accrual + auto-expiry tick. Call ~once/minute while a session is active.
   * Accrues `todayLockMin`, resets it across day boundaries, and auto-releases
   * on the daily cap (`expired`), quiet hours (`expired`), the served session
   * length (`session_served`), or the single-session cap (`session_served`).
   */
  tick: (atMs?: number) => void

  // -- Wellbeing queries (for UI) --
  /** Pre-flight the wellbeing gates so refusal copy can be shown before arming (doc `05` §4). */
  canStartStake: (atMs?: number) => CanStartStakeResult
  /** The session length that would actually be used, clamped to every cap. */
  effectiveSessionMin: (requested?: number) => number
  /** Whether `until_done` may be offered for this task (short, fits one capped session). */
  isUntilDoneEligible: (taskId: string) => boolean
  /** Should we surface the "pause stakes for today?" sheet? True once panics cross the threshold. */
  shouldOfferPause: () => boolean
  /** Remaining lock minutes before the daily cap (never negative). */
  remainingCapMin: () => number
  /** Whether stakes are currently paused. */
  isPaused: (atMs?: number) => boolean
}

/**
 * Read the live Settings snapshot with every wellbeing field guaranteed
 * well-formed, by running it through the same `normalizeSettings` the settings
 * store uses on read and write. With that store's deep `merge` in place this is
 * redundancy rather than load-bearing — which is the right relationship for a
 * guardrail. Never throws: a settings read that failed here would fail at the
 * exact moment a stake arms.
 */
function currentSettings(): Settings {
  try {
    const raw = (useSettingsStore.getState().settings ?? {}) as Partial<Settings>
    return normalizeSettings(raw) as Settings
  } catch {
    return normalizeSettings({}) as Settings
  }
}

/** Minutes elapsed on the wall clock since a session armed (0 if it never did). */
function elapsedMinSince(session: StakeSession, now: number): number {
  if (session.startedAt == null) return 0
  return Math.max(0, (now - session.startedAt) / 60_000)
}

export const useStakesStore = create<StakesState>()(
  persist(
    (set, get) => {
      /** Append a LockEvent (helper; returns the new events array). */
      const logEvent = (sessionId: string, type: LockEvent['type'], at: number): LockEvent[] => {
        const event: LockEvent = { id: newId(), sessionId, type, at }
        const events = [...get().events, event]
        set({ events })
        return events
      }

      /** Roll `todayLockMin` over to a fresh day if the local date changed. */
      const ensureToday = (atMs: number): void => {
        const day = new Date(atMs).toDateString()
        if (get().todayLockDay !== day) {
          set({ todayLockDay: day, todayLockMin: 0 })
        }
      }

      /**
       * End the active session with an outcome, remove the shield, log
       * `shield_off`. A `session_served` outcome logs `session_complete` FIRST,
       * so the event log reads "the time was served, then the shield came off"
       * rather than leaving the reason for the release implicit (§9.9).
       */
      const endActive = (outcome: NonNullable<StakeSession['outcome']>, at: number): void => {
        const active = get().activeSession
        if (!active) return
        const ended: StakeSession = { ...active, endedAt: at, outcome }
        set((state) => ({
          activeSession: null,
          sessions: { ...state.sessions, [ended.id]: ended },
        }))
        if (outcome === 'session_served') logEvent(ended.id, 'session_complete', at)
        logEvent(ended.id, 'shield_off', at)
        // Fire-and-forget, fail-safe: an enforcement error must not throw here.
        const strategy = getBlockingStrategy()
        void Promise.resolve(strategy.removeShield()).catch((err) => {
          console.warn('removeShield failed (leaving user unlocked):', err)
        })
        // Cancel the auto-expiry backstop by scheduling it for "now": there is
        // nothing left to expire, and a stale monitor firing later would try to
        // release a session that no longer exists.
        void Promise.resolve(strategy.scheduleAutoExpiry(at)).catch(() => {
          // A backstop we could not cancel is harmless — release is idempotent.
        })
      }

      /** Remaining daily-cap minutes, never negative. */
      const remainingCap = (): number => {
        const settings = currentSettings()
        return Math.max(0, settings.dailyLockCapMin - get().todayLockMin)
      }

      /**
       * The session length that will actually be used: the request (or the
       * user's default), clamped to the 15..50 range AND to every cap that is
       * lower right now. A caller can ask for 45 minutes and get 8, because
       * 8 is all the daily budget left — under-locking is always the safe
       * direction.
       */
      const effectiveSessionMin = (requested?: number): number => {
        const settings = currentSettings()
        const ceiling = Math.min(SESSION_MIN_BOUNDS.max, settings.singleSessionCapMin, Math.max(1, remainingCap()))
        const floor = Math.min(SESSION_MIN_BOUNDS.min, ceiling)
        const wanted = requested ?? settings.defaultSessionMin
        return Math.max(1, Math.round(clampTo(wanted, { min: floor, max: ceiling }, settings.defaultSessionMin)))
      }

      /** The wellbeing gates, in the order §9.10 requires. Shared by `canStartStake` and `startStake`. */
      const wellbeingGate = (now: number): CanStartStakeResult => {
        const state = get()
        if (state.activeSession) return { ok: false, reason: 'already_active' }
        if (state.stakesPausedUntil != null && now < state.stakesPausedUntil) {
          return { ok: false, reason: 'paused' }
        }
        if (isQuietHours(currentSettings(), now)) return { ok: false, reason: 'quiet_hours' }
        if (remainingCap() <= 0) return { ok: false, reason: 'cap_reached' }
        return { ok: true }
      }

      /** Whether a selection actually puts anything on the line. */
      const hasSelection = (selection: StakeSelection | null): boolean => {
        if (!selection) return false
        const tokens =
          selection.applicationTokens.length + selection.categoryTokens.length + selection.webDomainTokens.length
        return tokens > 0 || selection.count > 0
      }

      const isUntilDoneEligible = (taskId: string): boolean => {
        try {
          const task = useTaskStore.getState().tasks[taskId]
          if (!task) return false
          const remainingWork = Math.max(0, (task.durationMin ?? 0) - (task.progressMin ?? 0))
          if (remainingWork <= 0) return false
          // It must fit inside ONE session under the caps. This is the check
          // that keeps `until_done` on short concrete things and off essays
          // (doc `04` §2).
          return remainingWork <= effectiveSessionMin()
        } catch {
          // Unknown eligibility reads as NOT eligible: the safe direction is the
          // gentler hold.
          return false
        }
      }

      return {
        apps: [],
        selection: null,
        activeSession: null,
        scheduledStakes: {},
        sessions: {},
        events: [],
        todayLockMin: 0,
        todayLockDay: new Date().toDateString(),
        stakesPausedUntil: null,
        recentPanics: 0,

        setApps: (apps) => set({ apps }),
        addApp: (app) =>
          set((state) => ({
            apps: state.apps.some((a) => a.id === app.id) ? state.apps : [...state.apps, app],
          })),
        removeApp: (appId) => set((state) => ({ apps: state.apps.filter((a) => a.id !== appId) })),

        setSelection: (selection) => {
          if (selection == null) {
            set({ selection: null })
            return { ok: true, selection: null }
          }
          const settings = currentSettings()

          // Doc `05` §4: an "all apps" category would sweep phone, messages,
          // maps and Ampora itself in behind it, and on iOS the tokens are
          // opaque so we could never filter them back out. Refuse and ask for
          // specific leisure apps.
          const allApps = selection.categoryTokens.filter((t) => isAllAppsCategory(t))
          if (allApps.length > 0) {
            return { ok: false, reason: 'all_apps', blocked: allApps }
          }

          // Never-lock enforcement, in code and not merely in the picker copy
          // (FR-40). Categories and application tokens are both checked, since a
          // soft-path token IS a readable identifier.
          const blocked = [...selection.categoryTokens, ...selection.applicationTokens].filter(
            (token) => !isLockable(token, settings)
          )
          if (blocked.length > 0) {
            return { ok: false, reason: 'never_lock', blocked }
          }

          const tokenCount =
            selection.applicationTokens.length + selection.categoryTokens.length + selection.webDomainTokens.length
          const next: StakeSelection = {
            ...selection,
            // `count` is stored rather than derived (a keyed native picker may
            // report a count we cannot recompute), but a nonsense count is
            // repaired from the tokens we can actually see.
            count: Number.isFinite(selection.count) && selection.count > 0 ? Math.round(selection.count) : tokenCount,
            pickedAt: Number.isFinite(selection.pickedAt) ? selection.pickedAt : Date.now(),
          }
          set({ selection: next })
          return { ok: true, selection: next }
        },

        startStake: (config, opts = {}) => {
          // The whole body is wrapped so NO unhandled error can reach the UI
          // while arming a stake. Any unexpected failure degrades to a graceful
          // `{ ok: false, reason: 'error' }`, which callers treat as "run
          // unlocked" — the correct fail-safe direction (NFR-7).
          try {
            const now = Date.now()
            ensureToday(now)
            const settings = currentSettings()
            const state = get()

            // --- Gate BEFORE locking (§9.10). Order is deliberate: identity and
            //     config validity first (cheap, and not wellbeing decisions),
            //     then the wellbeing core in its documented order. ---

            if (state.activeSession) return { ok: false, reason: 'already_active' }

            if (!hasSelection(state.selection)) return { ok: false, reason: 'no_selection' }

            if (config.hold === 'until_done') {
              // `until_done` needs BOTH an image verification method and a task
              // that fits one capped session (doc `04` §2). Without the image
              // method there is no unlock condition at all, which would be a
              // lock with no exit — the exact thing this store must never build.
              const imageBacked = config.verification === 'photo' || config.verification === 'screenshot'
              if (!imageBacked || !isUntilDoneEligible(config.taskId)) {
                return { ok: false, reason: 'not_eligible' }
              }
            }

            // Paused for today (or a timed pause still in effect).
            if (state.stakesPausedUntil != null && now < state.stakesPausedUntil) {
              return { ok: false, reason: 'paused' }
            }

            // Quiet hours: do not start; log the release-style event for the record.
            if (isQuietHours(settings, now)) {
              const sid = newId()
              logEvent(sid, 'quiet_hours_release', now)
              return { ok: false, reason: 'quiet_hours' }
            }

            // Daily cap: refuse if no budget left. Otherwise the session length
            // is clamped to what remains, so a session can never exceed the cap.
            const remaining = remainingCap()
            if (remaining <= 0) {
              const sid = newId()
              logEvent(sid, 'cap_reached', now)
              return { ok: false, reason: 'cap_reached' }
            }

            const strength = clampTo(config.strength ?? settings.stakeStrength, STAKE_STRENGTH_BOUNDS, settings.stakeStrength)
            const sessionMin = effectiveSessionMin(config.sessionMin)

            const session: StakeSession = {
              id: newId(),
              taskId: config.taskId,
              deviceId: getDeviceId(),
              hold: config.hold,
              trigger: config.trigger,
              verification: config.verification,
              strength,
              startedAt: now,
              focusSec: 0,
            }
            // `sessionMin` is the unlock currency for the session hold. An
            // `until_done` hold does not use it to unlock, but it still carries
            // it so the banner can show the cap that will convert the lock.
            session.sessionMin = sessionMin
            if (config.scheduledAt != null) session.scheduledAt = config.scheduledAt
            if (config.startWindowMin != null) session.startWindowMin = config.startWindowMin

            set((prev) => {
              const scheduledStakes = { ...prev.scheduledStakes }
              // Consume the scheduled row that produced this arming, so the
              // auto-arm driver cannot fire it twice.
              if (opts.fromScheduledId) delete scheduledStakes[opts.fromScheduledId]
              return {
                activeSession: session,
                scheduledStakes,
                sessions: { ...prev.sessions, [session.id]: session },
              }
            })
            logEvent(session.id, 'shield_on', now)

            // Apply enforcement, fail-safe. If it rejects, unlock rather than trap.
            const strategy = getBlockingStrategy()
            const selection = state.selection as StakeSelection
            void Promise.resolve(strategy.applyShield(selection))
              .then(() => {
                // Attach the session to the in-app lock state so the lock UI can
                // render minutes remaining and the panic valve. Skipped if the
                // session already ended while the shield was applying.
                if (get().activeSession?.id === session.id) setLockSession(session)
              })
              .catch((err) => {
                console.warn('applyShield failed (releasing to keep user unlocked):', err)
                endActive('expired', Date.now())
              })

            // Backstop so a forgotten lock releases even with the app closed
            // (doc `05` §3.5). The in-app wall clock stays the source of truth.
            const expiryMin = config.hold === 'until_done' ? settings.singleSessionCapMin : sessionMin
            void Promise.resolve(strategy.scheduleAutoExpiry(now + expiryMin * 60_000)).catch((err) => {
              // A missing backstop is not a reason to refuse the lock: the
              // in-app tick and launch reconciliation both release it anyway.
              console.warn('scheduleAutoExpiry failed (in-app release still applies):', err)
            })

            return { ok: true, session }
          } catch (err) {
            // Fail-safe: never let arming throw into the UI. Nothing is locked
            // on this path (the set() above only runs on the success return).
            console.warn('startStake failed (running unlocked):', err)
            return { ok: false, reason: 'error' }
          }
        },

        // -------------------------------------------------------------------
        // Scheduled-trigger driver — STUBBED ON PURPOSE.
        //
        // These three land with the notification plumbing they depend on:
        // selective cancellation in `services/notifications.ts` (which today
        // calls `cancelAllScheduledNotificationsAsync()` on every task edit and
        // would destroy any stake cue), a `services/stakeScheduling.ts` that
        // posts `stake-cue-<id>` / `stake-arm-<id>`, and a notification response
        // listener (the app has none at all today, so tapping a cue does
        // nothing). Shipping the driver without them would schedule stakes that
        // silently never fire, which is worse than not offering them.
        // -------------------------------------------------------------------

        scheduleStake: (_config) => {
          console.warn('scheduleStake: scheduled triggers are not wired yet (needs stake cue notifications).')
          return { ok: false, reason: 'error' }
        },

        cancelScheduledStake: (id) => {
          set((state) => {
            if (!(id in state.scheduledStakes)) return state
            const next = { ...state.scheduledStakes }
            delete next[id]
            return { scheduledStakes: next }
          })
        },

        autoArmDueStakes: (_atMs) => {
          // No-op until `scheduleStake` can actually create a row. Safe to call
          // on every foreground and tick, which is how it will be driven.
        },

        serveSession: (sessionId) => {
          const now = Date.now()
          ensureToday(now)
          const active = get().activeSession
          if (!active || active.id !== sessionId) return
          // `endActive` logs `session_complete` then `shield_off` for this outcome.
          endActive('session_served', now)
          // Serving a session is a good outcome: it clears the de-escalation window.
          set({ recentPanics: 0 })
        },

        accrueFocus: (sessionId, sec) => {
          const active = get().activeSession
          if (!active || active.id !== sessionId) return
          const add = Number.isFinite(sec) && sec > 0 ? sec : 0
          if (add === 0) return
          const focusSec = (active.focusSec ?? 0) + add
          const updated: StakeSession = { ...active, focusSec }
          set((state) => ({
            activeSession: updated,
            sessions: { ...state.sessions, [updated.id]: updated },
          }))
          // The session hold unlocks HERE and nowhere else: focus time served in
          // the foreground (FR-77b). `until_done` accrues the same seconds (they
          // are useful in the log) but is not released by them.
          if (updated.hold !== 'session') return
          const requiredSec = (updated.sessionMin ?? 0) * 60
          if (requiredSec > 0 && focusSec >= requiredSec) {
            get().serveSession(sessionId)
          }
        },

        completeStake: (sessionId, _via) => {
          const now = Date.now()
          ensureToday(now)
          const active = get().activeSession
          if (!active || active.id !== sessionId) return
          // THE ANTI-LEAK RULE, enforced in the store so no screen can bypass
          // it: a session hold is served by time, not by finishing the work.
          // Finishing early is celebrated in the UI; the apps stay on the line
          // until the session is served or the panic valve is used.
          if (active.hold !== 'until_done') return
          endActive('completed', now)
          // A good outcome clears the de-escalation window.
          set({ recentPanics: 0 })
        },

        panicValve: (sessionId) => {
          const now = Date.now()
          ensureToday(now)
          const active = get().activeSession
          // Only the active session can be panic-valved; ignore stale ids.
          if (!active || active.id !== sessionId) return

          logEvent(sessionId, 'panic_valve', now)
          endActive('panic_valve', now)

          // De-escalation: count the panic, and if it crosses the threshold,
          // lower the user's stake strength one notch (the UI offers the pause
          // via shouldOfferPause()). Never punish — this makes future stakes
          // gentler. The strength now lives in Settings (FR-44), so this is the
          // one place the store writes across to it.
          const recentPanics = get().recentPanics + 1
          set({ recentPanics })
          if (recentPanics >= PANIC_DEESCALATE_THRESHOLD) {
            try {
              const settingsStore = useSettingsStore.getState()
              const next = clampTo(
                settingsStore.settings.stakeStrength - STRENGTH_DEESCALATE_STEP,
                STAKE_STRENGTH_BOUNDS,
                STAKE_STRENGTH_BOUNDS.min
              )
              settingsStore.updateSettings({ stakeStrength: next })
            } catch (err) {
              // De-escalation is a kindness, not a guardrail. Failing to lower
              // the strength must never break the unlock that just happened.
              console.warn('de-escalation failed (user is already unlocked):', err)
            }
          }
        },

        pauseStakesForToday: () => {
          const now = Date.now()
          // End of the current local day.
          const endOfDay = new Date(now)
          endOfDay.setHours(23, 59, 59, 999)
          endActive('panic_valve', now) // release any active lock gently
          set({ stakesPausedUntil: endOfDay.getTime() })
        },

        resumeStakes: () => set({ stakesPausedUntil: null }),

        reconcileActiveSession: (atMs) => {
          try {
            const now = atMs ?? Date.now()
            const active = get().activeSession
            if (!active) return // nothing persisted to reconcile

            ensureToday(now)
            const settings = currentSettings()

            // NOT-YET-STARTED EXEMPTION. A scheduled stake exists, persisted,
            // before it ever arms — so it has no live lock BY DESIGN, and the
            // `!lockLive` release below would destroy it on every cold start.
            // Nothing is locked, so move it back to the scheduled set (where the
            // auto-arm driver owns it) instead of releasing it.
            if (active.startedAt == null) {
              set((state) => ({
                activeSession: null,
                scheduledStakes: { ...state.scheduledStakes, [active.id]: active },
              }))
              return
            }

            const elapsedMin = elapsedMinSince(active, now)

            // Served while the app was away? That is a BETTER outcome than
            // 'expired', so it is checked first. For the session hold this is a
            // wall-clock backstop only — `accrueFocus` is the real unlock and it
            // counts foreground seconds — but a session whose whole window has
            // passed must not linger as a live lock either way.
            const servedSessionLength =
              active.hold === 'session' && (active.sessionMin ?? 0) > 0 && elapsedMin >= (active.sessionMin as number)
            // The single-session cap converts ANY hold to a release, which is
            // what stops a wrong `until_done` estimate becoming a marathon lock.
            const hitSingleSessionCap = elapsedMin >= settings.singleSessionCapMin
            if (servedSessionLength || hitSingleSessionCap) {
              endActive('session_served', now)
              return
            }

            // Release (fail toward the user, never trap) when the session can no
            // longer legitimately hold:
            //  - no live soft lock (module-level lock state doesn't survive a
            //    cold start, so a started session with no live lock is stale),
            //  - it predates `now` beyond the sane recovery bound,
            //  - we're inside quiet hours (stakes always release here),
            //  - the daily cap is already exhausted.
            const lockLive = getLockState().locked
            const tooOld = now - (active.startedAt as number) > STALE_ACTIVE_SESSION_MAX_AGE_MS
            const inQuiet = isQuietHours(settings, now)
            const capExhausted = remainingCap() <= 0

            if (!lockLive || tooOld || inQuiet || capExhausted) {
              // `endActive` also removes the shield (fail-safe) so any lingering
              // enforcement is cleared, and logs shield_off for the record.
              endActive('expired', now)
              return
            }

            // Legit still-active session within bounds: the persisted session is
            // real but its in-app lock state was lost on reload — re-apply the
            // shield so the focus/lock UI reflects it, and re-arm the auto-expiry
            // backstop that died with the process. Fail-safe on rejection.
            const strategy = getBlockingStrategy()
            const selection = get().selection
            if (!selection) {
              // Nothing to shield any more (the user cleared their selection):
              // releasing is the only honest option.
              endActive('expired', now)
              return
            }
            void Promise.resolve(strategy.applyShield(selection))
              .then(() => {
                if (get().activeSession?.id === active.id) setLockSession(active)
              })
              .catch((err) => {
                console.warn('reconcileActiveSession re-apply failed (releasing):', err)
                endActive('expired', Date.now())
              })
            const remainingMin =
              active.hold === 'until_done'
                ? Math.max(0, settings.singleSessionCapMin - elapsedMin)
                : Math.max(0, (active.sessionMin ?? settings.defaultSessionMin) - elapsedMin)
            void Promise.resolve(strategy.scheduleAutoExpiry(now + remainingMin * 60_000)).catch(() => {
              // The in-app tick still releases; a missing backstop is not fatal.
            })
          } catch (err) {
            // Never let launch reconciliation throw. On any unexpected failure,
            // release rather than risk a trapped user.
            console.warn('reconcileActiveSession failed (releasing any active session):', err)
            try {
              if (get().activeSession) endActive('expired', atMs ?? Date.now())
            } catch {
              // Give up silently — nothing more we can safely do here.
            }
          }
        },

        tick: (atMs) => {
          const now = atMs ?? Date.now()
          ensureToday(now)
          const active = get().activeSession
          if (!active) return

          const settings = currentSettings()

          // Accrue a minute of lock time (tick is expected ~once/minute).
          const todayLockMin = get().todayLockMin + 1
          set({ todayLockMin })

          // Auto-expire at the daily cap.
          if (todayLockMin >= settings.dailyLockCapMin) {
            logEvent(active.id, 'cap_reached', now)
            endActive('expired', now)
            return
          }

          // Auto-release at the quiet-hours boundary.
          if (isQuietHours(settings, now)) {
            logEvent(active.id, 'quiet_hours_release', now)
            endActive('expired', now)
            return
          }

          // Single-session cap: a WALL-CLOCK ceiling, deliberately. If it read
          // served focus time instead, backgrounding the app would suspend the
          // ceiling and the lock could outlive the cap indefinitely. This is
          // also the `until_done` cap-to-release conversion (doc `04` §7).
          if (elapsedMinSince(active, now) >= settings.singleSessionCapMin) {
            endActive('session_served', now)
            return
          }

          // Session length: a SERVED-TIME check, equally deliberately. The
          // session hold unlocks on foreground focus time (FR-77b), so wall
          // clock must not be able to serve it. `accrueFocus` normally gets here
          // first; this is the backstop for a dropped timer tick.
          if (active.hold === 'session') {
            const requiredSec = (active.sessionMin ?? 0) * 60
            if (requiredSec > 0 && (active.focusSec ?? 0) >= requiredSec) {
              endActive('session_served', now)
              set({ recentPanics: 0 })
            }
          }
        },

        canStartStake: (atMs) => wellbeingGate(atMs ?? Date.now()),

        effectiveSessionMin: (requested) => effectiveSessionMin(requested),

        isUntilDoneEligible: (taskId) => isUntilDoneEligible(taskId),

        shouldOfferPause: () => get().recentPanics >= PANIC_DEESCALATE_THRESHOLD,

        remainingCapMin: () => remainingCap(),

        isPaused: (atMs) => {
          const now = atMs ?? Date.now()
          const until = get().stakesPausedUntil
          return until != null && now < until
        },
      }
    },
    {
      name: 'ampora-stakes',
      storage: createJSONStorage(() => mmkvStateStorage),
      version: STAKES_PERSIST_VERSION,
      // v0 -> v1: mode/completionCondition become hold/trigger, and a persisted
      // `activeSession` is RETIRED rather than resurrected — the app would
      // rather under-lock than trap someone across an upgrade (NFR-7). See
      // `store/migrations/stakes.ts` for the full reasoning. The assertion is
      // safe: zustand merges this slice over the complete initial state.
      migrate: (persisted, version) => migrateStakes(persisted, version) as StakesState,
      // `activeSession` is intentionally persisted so a session survives a
      // reload and can be re-validated/released on next launch (doc `05` §3.6
      // recovery). The blocking strategy is re-derived, never persisted.
    }
  )
)

// ---------------------------------------------------------------------------
// Selectors
// ---------------------------------------------------------------------------

export function selectActiveStake(state: StakesState): StakeSession | null {
  return state.activeSession
}

export function selectStakeEvents(state: StakesState): LockEvent[] {
  return state.events
}

export function selectEligibleApps(state: StakesState): StakeApp[] {
  return state.apps.filter((a) => a.eligible)
}

export function selectStakeSelection(state: StakesState): StakeSelection | null {
  return state.selection
}
