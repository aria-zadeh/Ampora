/**
 * Stakes store — Ampora Phase 5 (Ignition), the wellbeing-governed session
 * layer (PRD FR-40..FR-47, §9.10 safety layer, §9.13 BlockingStrategy).
 *
 * This store owns Ignition SESSION logic and every wellbeing guardrail:
 * daily lock cap, quiet hours, never-lock categories, panic valve +
 * de-escalation, and pause-for-today. It talks to enforcement ONLY through
 * `getBlockingStrategy()` (soft in-app lock today; native OS shield later via
 * the feature flag), so the safety rules are identical regardless of backend.
 *
 * Wellbeing stance (non-negotiable, §9.10 / doc 09 §5): the app errs toward
 * the user. Caps clamp or refuse rather than trap. The panic valve and pause
 * are always available. Repeated panics DE-ESCALATE (lower default strength,
 * offer a pause) — the app never responds to struggle by demanding more.
 *
 * Local-first via MMKV (persist key "ampora-stakes"), same pattern as the
 * other stores. Enforcement side-effects (applyShield/removeShield) run
 * fire-and-forget and fail-safe: an enforcement error never leaves the user
 * locked (NFR-7, doc 06 §3.10).
 */

import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { getBlockingStrategy } from '@/core/blocking'
import { newId } from '@/core/id'
import { FEATURE_FLAGS } from '@/constants/featureFlags'
import { mmkv, mmkvStateStorage } from '@/store/mmkv'
import { useSettingsStore } from '@/store/settingsStore'
import type { LockEvent, Settings, StakeApp, StakeSession } from '@/types'

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
 * doc 06 §4). Case-insensitive. A missing/empty category is treated as
 * lockable (the caller supplies a real leisure category).
 */
export function isLockable(category: string | undefined, settings: Settings): boolean {
  if (!category) return true
  const needle = category.trim().toLowerCase()
  return !settings.neverLockCategories.some((c) => c.trim().toLowerCase() === needle)
}

// ---------------------------------------------------------------------------
// De-escalation tuning (§9.10, doc 06 §3.9). After repeated panic-valve use in
// a short window, lower the default stake strength and offer to pause.
// ---------------------------------------------------------------------------

/** Panic count at/above which we offer to pause stakes and drop default strength. */
const PANIC_DEESCALATE_THRESHOLD = 2
/** How much to drop the default strength per de-escalation step. */
const STRENGTH_DEESCALATE_STEP = 0.2
/** Starting default stake strength for a fresh, non-struggling user. */
const BASE_DEFAULT_STRENGTH = 0.6

// ---------------------------------------------------------------------------
// Options + result types
// ---------------------------------------------------------------------------

/** Optional knobs when starting a stake; sensible defaults applied in `startStake`. */
export interface StartStakeOptions {
  /** Which subtask/first-move the condition refers to (`Task.subtasks[].id` etc.). */
  conditionRefId?: string
  /** Beat-the-clock: minutes to start before the cooldown lock applies. */
  timerMinutes?: number
  /** Beat-the-clock: bounded cooldown lock minutes if the timer lapses. */
  cooldownMinutes?: number
  /** Calibrated stake strength 0..1; defaults to the store's current default. */
  strength?: number
}

/** Why `startStake` refused (so the UI can show calm, specific copy). */
export type StartStakeRefusal =
  | 'quiet_hours'
  | 'cap_reached'
  | 'paused'
  | 'mode_disabled'
  | 'already_active'

/** Result of attempting to start a stake. */
export type StartStakeResult =
  | { ok: true; session: StakeSession }
  | { ok: false; reason: StartStakeRefusal }

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

interface StakesState {
  /** Leisure apps the user opted to be able to lock (FR-40). */
  apps: StakeApp[]
  /** The single active stake session, or null. Per-device (FR-41b). */
  activeSession: StakeSession | null
  /** All sessions (active + historical) keyed by id, for the Proof Log / analytics. */
  sessions: Record<string, StakeSession>
  /** Lifecycle events for analytics + de-escalation (§9.9). */
  events: LockEvent[]
  /** Accrued lock minutes for the current local day; auto-resets across days. */
  todayLockMin: number
  /** The local day (YYYY-MM-DD-ish, `toDateString()`) `todayLockMin` accrues for. */
  todayLockDay: string
  /** If set (epoch ms), stakes are paused until this instant (user opted for a break). */
  stakesPausedUntil: number | null
  /** Panic-valve uses in the current de-escalation window (reset on completion). */
  recentPanics: number
  /** The default stake strength offered for a new stake (lowered by de-escalation). */
  defaultStrength: number

  // -- Stake-app opt-in --
  setApps: (apps: StakeApp[]) => void
  addApp: (app: StakeApp) => void
  removeApp: (appId: string) => void

  // -- Session lifecycle --
  /**
   * Start a stake for `taskId`. Enforces ALL wellbeing caps BEFORE locking:
   * refuses during quiet hours / when paused / when the mode is flag-disabled /
   * when already active, and clamps `timerMinutes`/`cooldownMinutes` to the
   * remaining daily cap (refusing outright only if zero cap remains). Applies
   * the shield via `getBlockingStrategy()` and logs a `shield_on` event.
   */
  startStake: (
    taskId: string,
    mode: StakeSession['mode'],
    completionCondition: StakeSession['completionCondition'],
    opts?: StartStakeOptions
  ) => StartStakeResult

  /**
   * Panic valve (FR-42). Call AFTER the UI's 60s friction countdown. Removes
   * the shield, ends the session `panic_valve`, increments `recentPanics`, and
   * DE-ESCALATES (lowers `defaultStrength`) when panics cross the threshold.
   * Logs `panic_valve` + `shield_off`. Always succeeds — never traps.
   */
  panicValve: (sessionId: string) => void

  /**
   * Complete a stake: remove the shield, end the session `completed`, log
   * `shield_off`, and RESET `recentPanics` (a good outcome clears the
   * de-escalation window).
   */
  completeStake: (sessionId: string) => void

  /** Pause all stakes for the rest of the local day (de-escalation opt-in). Ends any active session. */
  pauseStakesForToday: () => void
  /** Clear a pause early (user chose to resume). */
  resumeStakes: () => void

  /**
   * Accrual + auto-expiry tick. Call ~once/minute while a session is active.
   * Accrues `todayLockMin`, resets it across day boundaries, and auto-releases
   * the active session if the daily cap is hit (`expired`) or quiet hours are
   * entered (`quiet_hours_release`).
   */
  tick: (atMs?: number) => void

  // -- Wellbeing queries (for UI) --
  /** Should we surface the "pause stakes for today?" sheet? True once panics cross the threshold. */
  shouldOfferPause: () => boolean
  /** Remaining lock minutes before the daily cap (never negative). */
  remainingCapMin: () => number
  /** Whether stakes are currently paused. */
  isPaused: (atMs?: number) => boolean
}

/** Reads the live Settings snapshot (caps, quiet hours, never-lock, strength bounds). */
function currentSettings(): Settings {
  return useSettingsStore.getState().settings
}

/** Clamp `n` into `[min, max]`. */
function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n))
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

      /** End the active session with an outcome, remove the shield, log shield_off. */
      const endActive = (outcome: NonNullable<StakeSession['outcome']>, at: number): void => {
        const active = get().activeSession
        if (!active) return
        const ended: StakeSession = { ...active, endedAt: at, outcome }
        set((state) => ({
          activeSession: null,
          sessions: { ...state.sessions, [ended.id]: ended },
        }))
        logEvent(ended.id, 'shield_off', at)
        // Fire-and-forget, fail-safe: an enforcement error must not throw here.
        void Promise.resolve(getBlockingStrategy().removeShield(ended)).catch((err) => {
          console.warn('removeShield failed (leaving user unlocked):', err)
        })
      }

      return {
        apps: [],
        activeSession: null,
        sessions: {},
        events: [],
        todayLockMin: 0,
        todayLockDay: new Date().toDateString(),
        stakesPausedUntil: null,
        recentPanics: 0,
        defaultStrength: BASE_DEFAULT_STRENGTH,

        setApps: (apps) => set({ apps }),
        addApp: (app) =>
          set((state) => ({
            apps: state.apps.some((a) => a.id === app.id) ? state.apps : [...state.apps, app],
          })),
        removeApp: (appId) => set((state) => ({ apps: state.apps.filter((a) => a.id !== appId) })),

        startStake: (taskId, mode, completionCondition, opts = {}) => {
          const now = Date.now()
          ensureToday(now)
          const settings = currentSettings()
          const state = get()

          // --- Wellbeing gate (enforce BEFORE locking, §9.10) ---

          if (state.activeSession) return { ok: false, reason: 'already_active' }

          if (mode === 'beat_the_clock' && !FEATURE_FLAGS.BEAT_THE_CLOCK) {
            return { ok: false, reason: 'mode_disabled' }
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

          // Daily cap: refuse if no budget left; otherwise clamp the bounded
          // timers to what remains so a session can never exceed the cap.
          const remaining = Math.max(0, settings.dailyLockCapMin - state.todayLockMin)
          if (remaining <= 0) {
            const sid = newId()
            logEvent(sid, 'cap_reached', now)
            return { ok: false, reason: 'cap_reached' }
          }

          const bounds = settings.stakeStrengthBounds
          const strength = clamp(opts.strength ?? state.defaultStrength, bounds.min, bounds.max)

          const timerMinutes =
            opts.timerMinutes != null ? Math.max(0, Math.round(opts.timerMinutes)) : undefined
          // Cooldown is a real lock window, so clamp it to the remaining cap.
          const cooldownMinutes =
            opts.cooldownMinutes != null
              ? clamp(Math.round(opts.cooldownMinutes), 0, remaining)
              : undefined

          const session: StakeSession = {
            id: newId(),
            taskId,
            deviceId: getDeviceId(),
            mode,
            completionCondition,
            conditionRefId: opts.conditionRefId,
            timerMinutes,
            cooldownMinutes,
            strength,
            startedAt: now,
          }

          set((prev) => ({
            activeSession: session,
            sessions: { ...prev.sessions, [session.id]: session },
          }))
          logEvent(session.id, 'shield_on', now)

          // Apply enforcement, fail-safe. If it rejects, unlock rather than trap.
          void Promise.resolve(getBlockingStrategy().applyShield(session)).catch((err) => {
            console.warn('applyShield failed (releasing to keep user unlocked):', err)
            const at = Date.now()
            endActive('expired', at)
          })

          return { ok: true, session }
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
          // lower the default strength one notch (the UI offers the pause via
          // shouldOfferPause()). Never punish — this makes future stakes gentler.
          const recentPanics = get().recentPanics + 1
          const settings = currentSettings()
          let defaultStrength = get().defaultStrength
          if (recentPanics >= PANIC_DEESCALATE_THRESHOLD) {
            defaultStrength = clamp(
              defaultStrength - STRENGTH_DEESCALATE_STEP,
              settings.stakeStrengthBounds.min,
              settings.stakeStrengthBounds.max
            )
          }
          set({ recentPanics, defaultStrength })
        },

        completeStake: (sessionId) => {
          const now = Date.now()
          ensureToday(now)
          const active = get().activeSession
          if (!active || active.id !== sessionId) return
          endActive('completed', now)
          // A good outcome clears the de-escalation window.
          set({ recentPanics: 0 })
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
          }
        },

        shouldOfferPause: () => get().recentPanics >= PANIC_DEESCALATE_THRESHOLD,

        remainingCapMin: () => {
          const settings = currentSettings()
          return Math.max(0, settings.dailyLockCapMin - get().todayLockMin)
        },

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
      // Persist only durable state; `activeSession` is intentionally persisted
      // too so a session survives a reload and can be re-validated/released on
      // next launch (doc 06 §3.6 recovery). The blocking strategy is re-derived,
      // never persisted.
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
