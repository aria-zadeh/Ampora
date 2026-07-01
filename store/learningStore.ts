/**
 * Learning store — Ampora Phase 6 (PRD FR-50..55, §9.5.5-9.5.9).
 *
 * Thin state layer over the pure `core/learning` engine. It:
 *   - caches a recomputed `FocusProfile` (Focus DNA) so screens read it O(1),
 *   - recomputes weekly (or on demand) from the append-only `BehavioralSignal`
 *     log in `useBehavioralStore` (read imperatively — the pure engine never
 *     subscribes to React and this store never writes back to behavioralStore,
 *     so there is no loop),
 *   - exposes selectors the app uses: `selectFocusProfile`,
 *     `selectRevealedSelf(taskType)`, `selectEnergyState`.
 *
 * Cold-start safe end to end (FR-55): with little/no data the cached profile is
 * the neutral/empty one and the derived selectors report `confident: false`.
 *
 * Persistence: MMKV, name "ampora-learning" (only the cached profile + its
 * timestamp persist; raw signals live in behavioralStore).
 */

import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { mmkvStateStorage } from '@/store/mmkv'
import { useBehavioralStore } from '@/store/behavioralStore'
import { useSessionStore } from '@/store/sessionStore'
import { useTaskStore } from '@/store/taskStore'
import {
  focusDna,
  emptyFocusProfile,
  revealedSelf,
  energyState,
  estimation,
  type RevealedSelf,
  type EnergyState,
  type EstimationResult,
  type DurationObservation,
} from '@/core/learning'
import type { FocusProfile } from '@/types'

/** Recompute cadence for Focus DNA: weekly (FR-51 "recomputed weekly"). */
const WEEK_MS = 7 * 24 * 60 * 60 * 1000

interface LearningState {
  /** Cached Focus DNA. Null until first computed; selectors fall back to empty. */
  profile: FocusProfile | null
  /** Epoch ms of the last recompute, or null. */
  lastComputedAt: number | null

  /**
   * Recompute the cached `FocusProfile` from current signals. Reads the signal
   * log imperatively; never writes back. Safe to call anytime.
   */
  recompute: () => void
  /** Recompute only if stale (>= a week since last, or never computed). */
  recomputeIfStale: () => void
  /** Clear cached learning state (e.g. on sign-out / reset). */
  clear: () => void
}

export const useLearningStore = create<LearningState>()(
  persist(
    (set, get) => ({
      profile: null,
      lastComputedAt: null,

      recompute: () => {
        const signals = useBehavioralStore.getState().signals
        const tasks = Object.values(useTaskStore.getState().tasks)
        const now = Date.now()
        const profile = focusDna(signals, tasks, now)
        set({ profile, lastComputedAt: now })
      },

      recomputeIfStale: () => {
        const { lastComputedAt } = get()
        if (lastComputedAt == null || Date.now() - lastComputedAt >= WEEK_MS) {
          get().recompute()
        }
      },

      clear: () => set({ profile: null, lastComputedAt: null }),
    }),
    {
      name: 'ampora-learning',
      storage: createJSONStorage(() => mmkvStateStorage),
    },
  ),
)

// ---------------------------------------------------------------------------
// Duration observations for estimation calibration.
// `BehavioralSignal` has no durations; completed focus sessions do. We derive
// `DurationObservation`s from session history, keyed by task type. The type key
// resolver defaults to the task's `listId` (a per-class bucket) then title, so
// estimation is per-task-type without the store hard-coding a taxonomy.
// ---------------------------------------------------------------------------

/** Resolve a stable task-type key for a task id (listId, else title, else the id). */
function defaultTaskTypeKey(taskId: string): string | undefined {
  const task = useTaskStore.getState().tasks[taskId]
  if (!task) return undefined
  return task.listId ?? task.title ?? taskId
}

/**
 * Build duration observations from completed focus-session history for feeding
 * `estimation`. `plannedMin` is the session's planned length; `actualMin` is
 * the real focused time (`elapsedSec` -> minutes). Only ended sessions with a
 * positive elapsed time are used.
 */
export function durationObservations(
  resolveTaskType: (taskId: string) => string | undefined = defaultTaskTypeKey,
): DurationObservation[] {
  const history = Object.values(useSessionStore.getState().history)
  const out: DurationObservation[] = []
  for (const s of history) {
    if (s.endedAt == null) continue
    const actualMin = s.elapsedSec / 60
    if (actualMin <= 0 || s.plannedMin <= 0) continue
    out.push({
      taskType: resolveTaskType(s.taskId),
      plannedMin: s.plannedMin,
      actualMin,
      at: s.endedAt,
    })
  }
  return out
}

// ---------------------------------------------------------------------------
// Selectors — read the cached profile / derive on the fly from live signals.
// Callers should wrap array-returning derived reads with useMemo per Zustand v5
// selector discipline; these return primitives/objects computed from a raw read.
// ---------------------------------------------------------------------------

/**
 * Stable cold-start profile. MUST be a single shared reference: returning a
 * fresh `emptyFocusProfile()` from the selector on every render makes Zustand v5
 * see a new snapshot each time and infinite-loops (React #185).
 */
const EMPTY_PROFILE: FocusProfile = emptyFocusProfile(0)

/** The cached Focus DNA, or a neutral empty profile if not yet computed (cold start). */
export function selectFocusProfile(state: LearningState): FocusProfile {
  return state.profile ?? EMPTY_PROFILE
}

/** True while we are still in the low-data "learning" phase (no confident profile yet). */
export function selectIsLearning(state: LearningState): boolean {
  const p = state.profile
  return !p || (p.bestWindows.length === 0 && p.ignitionPoint === 0)
}

/**
 * Revealed Self for a task type. Not memoizable off `state` alone (it reads the
 * live signal log), so this is a plain helper you call in a `useMemo` keyed by
 * the signals length / taskType, not a `useX(selector)` argument.
 */
export function getRevealedSelf(taskType: string): RevealedSelf {
  const signals = useBehavioralStore.getState().signals
  return revealedSelf(signals, taskType)
}

/** Curried selector-style form of {@link getRevealedSelf} for call sites that prefer it. */
export function selectRevealedSelf(taskType: string) {
  return (_state: LearningState): RevealedSelf => getRevealedSelf(taskType)
}

/** Current energy state read from recent signals + now. */
export function getEnergyState(now: number = Date.now()): EnergyState {
  const signals = useBehavioralStore.getState().signals
  return energyState(signals, now)
}

/** Selector-style form of {@link getEnergyState}. */
export function selectEnergyState(_state: LearningState): EnergyState {
  return getEnergyState()
}

/** Estimation multiplier for a task type (or global when omitted). */
export function getEstimation(taskType?: string): EstimationResult {
  return estimation(durationObservations(), taskType)
}
