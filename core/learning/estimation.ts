/**
 * Estimation calibration — Ampora Learning Engine (PRD §9.5.6, FR-50).
 *
 * "Time blindness" soft padding: students routinely under-estimate how long a
 * task takes. This module learns, per task type, a MULTIPLIER to apply to the
 * user's own estimate so scheduled blocks better match reality — without ever
 * shrinking an estimate aggressively or ballooning it (both erode trust).
 *
 * The multiplier is an EWMA (exponentially-weighted moving average) of the
 * observed ratio actual/planned duration, so recent behavior counts more and
 * the value adapts as the user gets better (or worse) at estimating.
 *
 * Pure and deterministic. No I/O, no clock read. Cold-start safe: with no
 * per-type history it returns a NEUTRAL multiplier of 1.0 (we do not pretend to
 * know better than the user until we have evidence).
 */

import type { BehavioralSignal } from '@/types'

/** EWMA smoothing factor (0..1). Higher = react faster to recent observations. */
const EWMA_ALPHA = 0.3

/**
 * Clamp bounds on the learned multiplier. We never tell the scheduler a task
 * takes less than 80% of the user's estimate (dangerous — causes overruns),
 * nor more than 2.5x (a runaway ratio from one pathological session should not
 * triple every future block).
 */
export const ESTIMATION_MIN_MULTIPLIER = 0.8
export const ESTIMATION_MAX_MULTIPLIER = 2.5

/** Neutral multiplier used under cold start / no evidence. */
export const NEUTRAL_MULTIPLIER = 1.0

/** Per-observation ratio clamp, so a single 10-minute-plan / 5-hour-actual outlier can't dominate. */
const RATIO_CLAMP_MIN = 0.25
const RATIO_CLAMP_MAX = 4

export interface EstimationResult {
  /** The multiplier to apply to a fresh user estimate for this task type. */
  multiplier: number
  /** How many usable (planned+actual duration) observations backed it. */
  sampleCount: number
  /** False under cold start (multiplier is the neutral 1.0). */
  confident: boolean
}

/**
 * A `BehavioralSignal` does not itself carry planned/actual DURATION (only
 * start times). Callers that have durations (e.g. a completed focus session
 * with an estimate and a real elapsed time) pass them as `DurationObservation`s
 * alongside the signal log. This keeps the core pure and lets the store feed it
 * whatever duration history it has.
 */
export interface DurationObservation {
  taskType?: string
  plannedMin: number
  actualMin: number
  /** Epoch ms the observation was recorded — used only to order EWMA application (oldest first). */
  at: number
}

/**
 * Learn the estimation multiplier for a task type from duration observations.
 *
 * Filters to the type, orders oldest->newest, and folds each observed
 * `actual/planned` ratio (per-observation clamped) into an EWMA seeded at the
 * neutral 1.0. The final value is clamped to `[MIN, MAX]`. With no usable
 * observations, returns the neutral result (`confident: false`).
 *
 * `taskType` may be undefined to compute a GLOBAL multiplier across all types.
 */
export function estimation(
  observations: DurationObservation[],
  taskType?: string,
): EstimationResult {
  const relevant = observations
    .filter((o) => (taskType == null || o.taskType === taskType) && isUsable(o))
    .sort((a, b) => a.at - b.at)

  if (relevant.length === 0) {
    return { multiplier: NEUTRAL_MULTIPLIER, sampleCount: 0, confident: false }
  }

  let ewma = NEUTRAL_MULTIPLIER
  for (const o of relevant) {
    const ratio = clamp(o.actualMin / o.plannedMin, RATIO_CLAMP_MIN, RATIO_CLAMP_MAX)
    ewma = EWMA_ALPHA * ratio + (1 - EWMA_ALPHA) * ewma
  }

  const multiplier = round2(clamp(ewma, ESTIMATION_MIN_MULTIPLIER, ESTIMATION_MAX_MULTIPLIER))
  // "Confident" once we have a few observations; below that the multiplier is
  // still returned but callers should treat it as a soft hint.
  return { multiplier, sampleCount: relevant.length, confident: relevant.length >= 3 }
}

/**
 * Apply a learned multiplier to a raw estimate, returning padded minutes
 * (rounded to the nearest minute, never below 1). Convenience for the
 * scheduler / task editor.
 */
export function applyEstimation(rawMin: number, result: EstimationResult): number {
  return Math.max(1, Math.round(rawMin * result.multiplier))
}

/**
 * Build `DurationObservation`s from behavioral signals that happen to carry the
 * data needed (both start times AND a completed=true flag). Signals in the
 * current model don't include durations, so this returns [] unless a future
 * signal shape adds them — provided so callers have one import surface. Real
 * duration history should come from completed sessions (see store layer).
 */
export function observationsFromSignals(_signals: BehavioralSignal[]): DurationObservation[] {
  return []
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

function isUsable(o: DurationObservation): boolean {
  return (
    Number.isFinite(o.plannedMin) &&
    Number.isFinite(o.actualMin) &&
    o.plannedMin > 0 &&
    o.actualMin > 0
  )
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n))
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}
