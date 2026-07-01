/**
 * Focus DNA — Ampora Learning Engine (PRD FR-50, FR-51, §9.5.5).
 *
 * Pure, deterministic given (signals, tasks, now). No I/O, no clock read, no
 * platform deps — importable from the RN app, plain Node, and Edge Functions
 * (per the portable-engine rule, doc 08 §1). Everything here is derived from
 * the append-only `BehavioralSignal` log; it never mutates its inputs.
 *
 * Cold start (FR-55): with little/no data every function returns a
 * low-confidence, neutral result and reports `confident: false` / an empty
 * profile, so callers can show a "still learning" state and safe defaults for
 * the first 7-14 days rather than confident (and wrong) claims.
 */

import type { BehavioralSignal, FocusProfile, Task } from '@/types'

/** Minutes in an hour — used to convert an hour-of-day index to a `TimeWindow`-style minute offset. */
const MIN_PER_HOUR = 60

/**
 * How many completed signals we want before we trust the best-window
 * histogram at full strength. Below this we still surface windows but the
 * `score` is damped (see `confidenceFactor`) so the UI can show them faintly.
 */
export const FOCUS_DNA_FULL_CONFIDENCE_SAMPLES = 20

/**
 * Minimum completed signals in an hour bucket before that hour can seed a
 * "best window". One lucky completion at 3am should not become a claim.
 */
const MIN_COMPLETIONS_PER_WINDOW = 2

/**
 * A task is "dodged" when the user plans it but fails to start/complete it a
 * lot more often than average. We only flag a task type once we have enough
 * observations of it to be fair (avoids shaming on a single miss — FR-52 tone).
 */
const MIN_SAMPLES_PER_TASK_TYPE = 4
const DODGE_RATE_THRESHOLD = 0.5

/** A neutral, empty profile for the cold-start case (no/low data). */
export function emptyFocusProfile(now: number): FocusProfile {
  return {
    bestWindows: [],
    dodgedTaskTypes: [],
    conditionsThatHelp: [],
    ignitionPoint: 0,
    updatedAt: now,
  }
}

/**
 * A 0..1 confidence multiplier that ramps from 0 to 1 as completed-signal
 * count approaches `FOCUS_DNA_FULL_CONFIDENCE_SAMPLES`. Used to damp window
 * scores during cold start so nothing reads as a confident claim early on.
 */
export function confidenceFactor(sampleCount: number): number {
  if (sampleCount <= 0) return 0
  return Math.min(1, sampleCount / FOCUS_DNA_FULL_CONFIDENCE_SAMPLES)
}

/**
 * Group consecutive "hot" hours (hours with enough completions) into merged
 * windows. Input is a set of hour indices (0-23); output is `[start,end)`
 * hour ranges. Wrap-around (23 -> 0) is intentionally NOT merged: a late-night
 * and an early-morning window are conceptually distinct focus periods.
 */
function mergeHourRuns(hotHours: number[]): { startHour: number; endHour: number }[] {
  const sorted = [...new Set(hotHours)].sort((a, b) => a - b)
  const runs: { startHour: number; endHour: number }[] = []
  for (const h of sorted) {
    const last = runs[runs.length - 1]
    if (last && h === last.endHour) {
      last.endHour = h + 1
    } else {
      runs.push({ startHour: h, endHour: h + 1 })
    }
  }
  return runs
}

/**
 * Compute the best focus windows from a completed-signal hour histogram.
 *
 * Only `completed` signals count toward "when this person actually focuses".
 * Each hour bucket needs at least `MIN_COMPLETIONS_PER_WINDOW` completions to
 * qualify; qualifying hours are merged into contiguous windows, and each
 * window's `score` is (its share of completions in the window's hours,
 * normalized to the busiest hour) times the global `confidenceFactor`, so a
 * thin log yields faint scores.
 *
 * Windows are returned as minutes-from-midnight (`start`/`end`) to match the
 * `FocusProfile.bestWindows` / `TimeWindow` convention, sorted by score desc.
 */
export function bestWindows(
  signals: BehavioralSignal[],
): { start: number; end: number; score: number }[] {
  const completed = signals.filter((s) => s.completed)
  if (completed.length === 0) return []

  const byHour = new Array<number>(24).fill(0)
  for (const s of completed) {
    const h = clampHour(s.hourOfDay)
    byHour[h] += 1
  }

  const peak = Math.max(...byHour)
  if (peak === 0) return []

  const hotHours: number[] = []
  for (let h = 0; h < 24; h++) {
    if (byHour[h] >= MIN_COMPLETIONS_PER_WINDOW) hotHours.push(h)
  }
  if (hotHours.length === 0) return []

  const conf = confidenceFactor(completed.length)
  const runs = mergeHourRuns(hotHours)

  const windows = runs.map((run) => {
    // Window strength = its busiest hour's share of the global peak.
    let windowPeak = 0
    for (let h = run.startHour; h < run.endHour; h++) {
      if (byHour[h] > windowPeak) windowPeak = byHour[h]
    }
    const rawScore = windowPeak / peak
    return {
      start: run.startHour * MIN_PER_HOUR,
      end: run.endHour * MIN_PER_HOUR,
      score: round2(rawScore * conf),
    }
  })

  return windows.sort((a, b) => b.score - a.score)
}

/**
 * Task types the user reliably dodges: planned but not completed at a rate
 * well above baseline, with enough samples to be fair. Returns the task-type
 * keys, worst-first. Used for gentle, opt-in nudges — never for shame (FR-52).
 */
export function dodgedTaskTypes(signals: BehavioralSignal[]): string[] {
  const byType = new Map<string, { total: number; dodged: number }>()
  for (const s of signals) {
    const type = s.taskType
    if (!type) continue
    const rec = byType.get(type) ?? { total: 0, dodged: 0 }
    rec.total += 1
    // "Dodged" = it was planned (had a plannedStart) but not completed.
    if (s.plannedStart != null && !s.completed) rec.dodged += 1
    byType.set(type, rec)
  }

  const flagged: { type: string; rate: number }[] = []
  for (const [type, rec] of byType) {
    if (rec.total < MIN_SAMPLES_PER_TASK_TYPE) continue
    const rate = rec.dodged / rec.total
    if (rate >= DODGE_RATE_THRESHOLD) flagged.push({ type, rate })
  }

  return flagged.sort((a, b) => b.rate - a.rate).map((f) => f.type)
}

/**
 * Conditions that correlate with follow-through (doc 07 / FR-51
 * "conditionsThatHelp"). Derived from `signal.context`: a condition is
 * surfaced when, among signals carrying it, the completion rate is materially
 * higher than the overall completion rate. Cold-start safe (needs a handful of
 * examples per condition, else the condition is skipped).
 */
export function conditionsThatHelp(signals: BehavioralSignal[]): string[] {
  const withContext = signals.filter((s) => s.context)
  if (withContext.length < 4) return []

  const overallRate = completionRate(signals)
  const helps: { label: string; lift: number }[] = []

  // afterGym: boolean condition.
  evalBooleanCondition(withContext, 'after a workout', (s) => s.context?.afterGym === true, overallRate, helps)

  // energy=hyper: a self-reported high-energy state.
  evalBooleanCondition(withContext, 'high-energy days', (s) => s.context?.energy === 'hyper', overallRate, helps)

  // Well-rested: >= 7h sleep.
  evalBooleanCondition(
    withContext,
    'a good night of sleep',
    (s) => (s.context?.sleepHours ?? 0) >= 7,
    overallRate,
    helps,
  )

  return helps.sort((a, b) => b.lift - a.lift).map((h) => h.label)
}

/**
 * The Ignition Point (FR-51): the user's typical delay, in minutes, between
 * when a task was PLANNED to start and when they ACTUALLY started it. Computed
 * as the MEDIAN of `(actualStart - plannedStart)` over signals that have both,
 * clamped to be non-negative (starting early is not "ignition friction").
 * Returns 0 when there is not enough paired data (cold-start neutral).
 */
export function ignitionPoint(signals: BehavioralSignal[]): number {
  const delaysMin: number[] = []
  for (const s of signals) {
    if (s.plannedStart == null || s.actualStart == null) continue
    const deltaMin = (s.actualStart - s.plannedStart) / 60000
    if (deltaMin >= 0) delaysMin.push(deltaMin)
  }
  if (delaysMin.length < 3) return 0
  return Math.round(median(delaysMin))
}

/**
 * Assemble the full `FocusProfile` from the raw signal log. `tasks` is accepted
 * for future enrichment (e.g. weighting task types by outstanding load); it is
 * not required for the current derivation, so passing `[]` is fine. Always
 * returns a valid profile (empty/neutral under cold start).
 */
export function focusDna(
  signals: BehavioralSignal[],
  _tasks: Task[],
  now: number,
): FocusProfile {
  if (signals.length === 0) return emptyFocusProfile(now)
  return {
    bestWindows: bestWindows(signals),
    dodgedTaskTypes: dodgedTaskTypes(signals),
    conditionsThatHelp: conditionsThatHelp(signals),
    ignitionPoint: ignitionPoint(signals),
    updatedAt: now,
  }
}

// ---------------------------------------------------------------------------
// Small pure helpers
// ---------------------------------------------------------------------------

function clampHour(h: number): number {
  if (!Number.isFinite(h)) return 0
  if (h < 0) return 0
  if (h > 23) return 23
  return Math.floor(h)
}

function completionRate(signals: BehavioralSignal[]): number {
  if (signals.length === 0) return 0
  const done = signals.filter((s) => s.completed).length
  return done / signals.length
}

function evalBooleanCondition(
  signals: BehavioralSignal[],
  label: string,
  predicate: (s: BehavioralSignal) => boolean,
  overallRate: number,
  out: { label: string; lift: number }[],
): void {
  const matching = signals.filter(predicate)
  if (matching.length < 3) return
  const rate = completionRate(matching)
  const lift = rate - overallRate
  // Require a meaningful, positive lift (>= 10 percentage points) to claim help.
  if (lift >= 0.1) out.push({ label, lift })
}

function median(nums: number[]): number {
  const sorted = [...nums].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}
