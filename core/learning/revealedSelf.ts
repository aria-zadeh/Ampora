/**
 * Revealed Self — Ampora Learning Engine (PRD FR-52, §9.5.7).
 *
 * "You plan X but you actually do Y." Compares the hour a user PLANS to start
 * a given task type against the hour they ACTUALLY start it, and only makes a
 * claim when the gap is both LARGE and CONSISTENT over a healthy sample (>= ~8
 * observations). This is the emotionally sensitive, non-shaming insight: it is
 * always framed as information, never judgment, and callers keep it optional.
 *
 * Pure and deterministic given the signals. No I/O, no clock read.
 * Cold-start safe: below the sample floor or below the gap floor it returns
 * `confident: false` and callers should show nothing (or a soft "still
 * learning") rather than a shaky claim.
 */

import type { BehavioralSignal } from '@/types'

/** Minimum paired (planned + actual) observations before we will make a claim (FR-52 "~8 samples"). */
export const REVEALED_SELF_MIN_SAMPLES = 8

/** The planned-vs-revealed hour gap (in hours) must be at least this to be worth surfacing. */
export const REVEALED_SELF_MIN_GAP_HOURS = 2

/** Consistency gate: the median absolute deviation of actual-start hours must be within this (hours). */
const REVEALED_SELF_MAX_MAD_HOURS = 2.5

export interface RevealedSelf {
  /** The task type this insight is about (echoes the query). */
  taskType: string
  /** The hour (0-23) the user typically PLANS to start this task type. */
  plannedHour: number
  /** The hour (0-23) the user typically ACTUALLY starts it. */
  revealedHour: number
  /** True only when the gap is large AND consistent over enough samples. */
  confident: boolean
  /** How many paired observations backed this (for a "based on N" caption). */
  sampleCount: number
}

/**
 * Compute the Revealed Self for one task type.
 *
 * Requires signals that carry BOTH `plannedStart` and `actualStart` for the
 * type. `plannedHour` = median local hour of planned starts; `revealedHour` =
 * median local hour of actual starts. `confident` is true only when:
 *   - there are >= REVEALED_SELF_MIN_SAMPLES paired observations,
 *   - |revealedHour - plannedHour| >= REVEALED_SELF_MIN_GAP_HOURS, and
 *   - the actual-start hours are consistent (MAD within threshold), so we are
 *     describing a real pattern, not noise.
 *
 * Always returns an object (never throws); an unknown/sparse type yields
 * `confident: false` with best-effort hours (or the planned hour echoed).
 */
export function revealedSelf(signals: BehavioralSignal[], taskType: string): RevealedSelf {
  const paired = signals.filter(
    (s) => s.taskType === taskType && s.plannedStart != null && s.actualStart != null,
  )

  if (paired.length === 0) {
    return { taskType, plannedHour: 0, revealedHour: 0, confident: false, sampleCount: 0 }
  }

  const plannedHours = paired.map((s) => hourOf(s.plannedStart as number))
  const actualHours = paired.map((s) => hourOf(s.actualStart as number))

  const plannedHour = Math.round(median(plannedHours))
  const revealedHour = Math.round(median(actualHours))

  const gap = Math.abs(revealedHour - plannedHour)
  const consistency = medianAbsoluteDeviation(actualHours)

  const confident =
    paired.length >= REVEALED_SELF_MIN_SAMPLES &&
    gap >= REVEALED_SELF_MIN_GAP_HOURS &&
    consistency <= REVEALED_SELF_MAX_MAD_HOURS

  return { taskType, plannedHour, revealedHour, confident, sampleCount: paired.length }
}

/**
 * Convenience: compute Revealed Self for every task type present in the log,
 * returning only the confident ones (worst-gap first). Handy for a "here's
 * what we've noticed" surface without the caller enumerating types.
 */
export function allRevealedSelves(signals: BehavioralSignal[]): RevealedSelf[] {
  const types = new Set<string>()
  for (const s of signals) if (s.taskType) types.add(s.taskType)
  const out: RevealedSelf[] = []
  for (const type of types) {
    const r = revealedSelf(signals, type)
    if (r.confident) out.push(r)
  }
  return out.sort(
    (a, b) => Math.abs(b.revealedHour - b.plannedHour) - Math.abs(a.revealedHour - a.plannedHour),
  )
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

function hourOf(epochMs: number): number {
  return new Date(epochMs).getHours()
}

function median(nums: number[]): number {
  const sorted = [...nums].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

/** Median absolute deviation from the median — a robust spread measure. */
function medianAbsoluteDeviation(nums: number[]): number {
  if (nums.length === 0) return 0
  const m = median(nums)
  const deviations = nums.map((n) => Math.abs(n - m))
  return median(deviations)
}
