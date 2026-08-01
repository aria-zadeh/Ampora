/**
 * Project progress math (doc `06` §5, PRD FR-84/FR-85).
 *
 * Pure, I/O-free, react-native-free — `core/` is plain TypeScript so it runs
 * unmodified under the Vitest node harness (`vitest.config.ts`). No store
 * imports either; `store/projectStore.ts` is the only imperative caller.
 *
 * Percent is completed phases plus the fraction of the CURRENT phase (the
 * first not-done phase, lowest `order`) — a project is done-or-not per phase,
 * never a per-phase score or rating (finer-grained tracking is cut,
 * `V2_Changes.md` §6).
 */

import type { Phase } from '@/types'

/** The three end-of-session check-in answers (PRD FR-85, doc `06` §4/§5). */
export type CheckInAnswer = 'done' | 'keep_going' | 'stop_here'

/**
 * The phase currently being worked: the first not-done phase, lowest
 * `order`. Null once every phase is done, or the list is empty.
 */
export function findCurrentPhase(phases: Phase[]): Phase | null {
  let current: Phase | null = null
  for (const phase of phases) {
    if (phase.done) continue
    if (current == null || phase.order < current.order) current = phase
  }
  return current
}

function clampFraction(n: number | undefined): number {
  if (n == null || !Number.isFinite(n)) return 0
  return Math.min(1, Math.max(0, n))
}

/**
 * Percent complete, 0..100: completed phases plus the fraction of the
 * current phase (doc `06` §5). `currentPhaseFraction` (0..1) is how much of
 * the still-open current phase is done; ignored once every phase is already
 * marked done (there is no "current" phase left to carry a fraction).
 */
export function computePercent(phases: Phase[], currentPhaseFraction = 0): number {
  const total = phases.length
  if (total === 0) return 0
  const completed = phases.filter((p) => p.done).length
  const fraction = completed >= total ? 0 : clampFraction(currentPhaseFraction)
  const raw = ((completed + fraction) / total) * 100
  return Math.min(100, Math.max(0, Math.round(raw)))
}

/**
 * Apply an end-of-session check-in to a phase list (FR-85, doc `06` §5):
 * - `done` marks the CURRENT phase (first not-done, lowest `order`) complete.
 *   The next phase becomes current automatically — it is simply the new
 *   lowest-order not-done phase — so nothing else needs to move a pointer.
 * - `keep_going` / `stop_here` leave the current phase open. The session
 *   still gets partial credit via `currentPhaseFraction`, so a non-`done`
 *   (or skipped, inferred) check-in never stalls the percent bar.
 *
 * Returns a fresh `phases` array (or the same reference when nothing
 * changed) plus the resulting `percent`, so the caller can persist both in
 * one write.
 */
export function applyCheckIn(
  phases: Phase[],
  answer: CheckInAnswer,
  currentPhaseFraction = 0
): { phases: Phase[]; percent: number } {
  if (answer === 'done') {
    const phase = findCurrentPhase(phases)
    if (!phase) return { phases, percent: computePercent(phases, 0) }
    const nextPhases = phases.map((p) => (p.id === phase.id ? { ...p, done: true } : p))
    return { phases: nextPhases, percent: computePercent(nextPhases, 0) }
  }
  return { phases, percent: computePercent(phases, currentPhaseFraction) }
}
