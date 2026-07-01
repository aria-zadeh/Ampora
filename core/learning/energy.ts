/**
 * Energy / State — Ampora Learning Engine (PRD FR-53, §9.5.8).
 *
 * A soft, heuristic read of the user's CURRENT energy ("low" | "normal" |
 * "hyper") from recent behavior, plus a comparator that re-sorts today's tasks
 * to match that energy (put demanding work in high-energy moments, easy wins in
 * low-energy ones — §9.5.8 "energy re-sort").
 *
 * Pure and deterministic given (signals, now, task list). No I/O, no clock read
 * beyond the `now` you pass. Cold-start safe: with little data it reports
 * "normal" and the comparator falls back to a stable, deadline-aware order so
 * nothing feels random on day one.
 */

import type { BehavioralSignal, EnergyLevel, Task } from '@/types'

/** The heuristic energy read. Uses 'hyper' (not 'high') to match `BehavioralSignal.context.energy`. */
export type EnergyState = 'low' | 'normal' | 'hyper'

/** Look-back window (ms) for "recent" behavior when reading current energy. */
const RECENT_WINDOW_MS = 3 * 60 * 60 * 1000 // 3 hours

/** Minimum recent signals before we deviate from "normal" (cold-start guard). */
const MIN_RECENT_SIGNALS = 2

/**
 * Read the user's current energy state from recent signals + time of day.
 *
 * Signals in the last few hours dominate: a burst of recent completions reads
 * as 'hyper'; recent planned-but-abandoned starts read as 'low'. A recent
 * self-reported `context.energy` is treated as strong evidence. With too little
 * recent data we fall back to a gentle time-of-day prior (deep night = 'low',
 * otherwise 'normal') and never claim 'hyper' without behavioral support.
 */
export function energyState(signals: BehavioralSignal[], now: number): EnergyState {
  const recent = signals.filter((s) => {
    const t = s.actualStart ?? s.plannedStart
    return t != null && now - t <= RECENT_WINDOW_MS && t <= now
  })

  // Strongest signal: a very recent explicit self-report.
  const selfReported = latestSelfReport(recent)
  if (selfReported) return selfReported

  const hour = new Date(now).getHours()
  const nightPrior: EnergyState = hour >= 0 && hour < 6 ? 'low' : 'normal'

  if (recent.length < MIN_RECENT_SIGNALS) return nightPrior

  const completions = recent.filter((s) => s.completed).length
  const abandonments = recent.filter((s) => s.plannedStart != null && !s.completed).length

  // Momentum: several recent completions and few misses -> hyper.
  if (completions >= 2 && completions > abandonments) return 'hyper'
  // Friction: recent planned starts that fizzled and nothing landing -> low.
  if (abandonments >= 2 && completions === 0) return 'low'

  return nightPrior
}

/** Map a soft energy state to a numeric level for demand-matching (higher = more capacity). */
function energyCapacity(state: EnergyState): number {
  switch (state) {
    case 'hyper':
      return 2
    case 'normal':
      return 1
    case 'low':
      return 0
  }
}

/** Map a task's required energy to the same numeric scale. Undefined = 'normal'. */
function taskDemand(task: Task): number {
  const req: EnergyLevel = task.energyRequired ?? 'normal'
  switch (req) {
    case 'high':
      return 2
    case 'normal':
      return 1
    case 'low':
      return 0
  }
}

/**
 * A comparator that re-sorts TODAY's tasks to fit the current energy state.
 *
 * When energy is HIGH ('hyper') the most demanding tasks come first (ride the
 * wave). When energy is LOW, the easiest tasks come first (build momentum with
 * a win). At 'normal' energy demand is not used as a primary key. Ties — and
 * the whole ordering under cold start — fall back to a stable, deadline-aware
 * order (sooner `due` first, then higher `priority`, then `createdAt`) so the
 * result is deterministic and never feels arbitrary.
 *
 * Returns a `(a, b) => number` you can hand to `Array.prototype.sort`.
 */
export function energyResortComparator(state: EnergyState): (a: Task, b: Task) => number {
  const capacity = energyCapacity(state)
  return (a, b) => {
    if (state !== 'normal') {
      const da = taskDemand(a)
      const db = taskDemand(b)
      if (da !== db) {
        // High energy: demanding first (desc). Low energy: easy first (asc).
        return capacity >= 2 ? db - da : da - db
      }
    }
    return deadlineAwareTiebreak(a, b)
  }
}

/**
 * Non-mutating helper: return a NEW array of today's tasks sorted for the given
 * (or freshly-read) energy state. Convenience wrapper around the comparator.
 */
export function resortForEnergy(
  tasks: Task[],
  signals: BehavioralSignal[],
  now: number,
): Task[] {
  const state = energyState(signals, now)
  return [...tasks].sort(energyResortComparator(state))
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

/** Most recent explicit `context.energy` self-report among recent signals, if any. */
function latestSelfReport(recent: BehavioralSignal[]): EnergyState | null {
  let best: { at: number; energy: EnergyState } | null = null
  for (const s of recent) {
    const energy = s.context?.energy
    if (!energy) continue
    const at = s.actualStart ?? s.plannedStart ?? 0
    if (!best || at > best.at) best = { at, energy }
  }
  return best?.energy ?? null
}

/** Sooner deadline first; then higher priority; then earlier creation. Fully deterministic. */
function deadlineAwareTiebreak(a: Task, b: Task): number {
  const aDue = a.due ?? Number.POSITIVE_INFINITY
  const bDue = b.due ?? Number.POSITIVE_INFINITY
  if (aDue !== bDue) return aDue - bDue

  const aPri = a.priority ?? 0
  const bPri = b.priority ?? 0
  if (aPri !== bPri) return bPri - aPri

  return a.createdAt - b.createdAt
}
