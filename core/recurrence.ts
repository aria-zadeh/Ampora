/**
 * Recurring tasks — occurrence expansion + rollover (PRD FR-15, FR-16, §9.4;
 * doc `03_AI_Breakdown_and_Subtasks.md` §2.9).
 *
 * Portability contract (matches `core/scheduler/`, `core/recovery.ts`,
 * `core/task-logic.ts`): pure, no I/O, no react-native / expo / MMKV imports.
 * No direct `Date.now()` — every function that needs "now" takes it as a
 * parameter, so this runs identically on-device and in a server-side Edge
 * Function, and is fully deterministic in tests.
 *
 * ---------------------------------------------------------------------------
 * VIRTUAL vs MATERIALIZED occurrences — the decision this module encodes
 * ---------------------------------------------------------------------------
 * Occurrences are expanded VIRTUALLY at schedule time, never materialized as
 * separate `Task` rows. A `Task` IS the recurring series (title, subtask
 * template, firstMove, durationMin, the `RecurrenceRule`) plus the CURRENT
 * occurrence's mutable state (`due`, `status`, `progressMin`, `subtasks[].
 * completedAt`). `core/scheduler/recompute.ts` calls `expandOccurrences` to
 * place additional `ScheduledBlock`s for FUTURE occurrences within the
 * auto-schedule cutoff — every one of them shares the task's real `taskId`,
 * exactly like a splittable task's multiple session blocks already do, so no
 * change was needed to `ScheduledBlock` or to recompute's stability/
 * reconciliation logic. When the CURRENT occurrence is completed,
 * `rollToNextOccurrence` advances the task in place: a fresh `due`, a fresh
 * unchecked copy of the subtask template, and `progressMin` reset to 0 (doc
 * `03` §2.9 "completing one occurrence does not affect the next").
 *
 * Materializing a real `Task` per future occurrence was rejected because (a)
 * it would flood the task list with N copies of every recurring task's title,
 * breaking every task-list/search/filter surface, and (b) "which row is the
 * real one" becomes ambiguous the moment the user edits the template (title,
 * subtasks, duration) — a virtual series has exactly one place that state
 * lives. The tradeoff: only the CURRENT occurrence carries meaningful
 * progress/subtask-completion state; occurrences #2+ shown on the calendar
 * are always "fresh full-duration" placeholders until they become current.
 *
 * ---------------------------------------------------------------------------
 * `RecurrenceRule.count` semantics (see also the tsdoc on the type itself)
 * ---------------------------------------------------------------------------
 * `count`, when present, always means "occurrences remaining starting at (and
 * including) the task's CURRENT `due`" — not a fixed lifetime total frozen at
 * creation. `rollToNextOccurrence` decrements it by 1 on every genuine
 * completion. This lets every function below treat "the anchor" uniformly as
 * "whatever `due` is right now" without needing a separately-persisted
 * original-anchor or occurrences-so-far field on `Task`.
 */

import type { RecurrenceRule, Task, TimeWindow } from '@/types'

const MS_PER_MIN = 60_000
const MS_PER_DAY = 86_400_000

/**
 * Hard ceiling on raw candidate-date steps walked by `generateCandidateDates`
 * in one call. This is what makes an unbounded (`until`/`count` both unset)
 * rule safe: regardless of how far `anchor` sits from the requested range (or
 * how large a monthly `interval` is), the generator can never loop forever —
 * it always terminates within this many steps (NFR-2).
 */
export const MAX_STEPS = 10_000
/** Hard ceiling on occurrences actually collected/returned by `expandOccurrences` in one call. */
export const MAX_OCCURRENCES = 1000

/** Exposed for tests that want to assert the safety ceilings directly. */
export const RECURRENCE_LIMITS = { MAX_STEPS, MAX_OCCURRENCES } as const

// ---------------------------------------------------------------------------
// Local calendar helpers — Date-based (not raw ms arithmetic) so DST and
// month-length are handled by the JS engine's local-time normalization,
// matching the existing pattern in `core/scheduler/time.ts#startOfDay`.
// Adding N days via `setDate` (rather than `+ N * MS_PER_DAY`) is what keeps
// a recurring task's wall-clock time-of-day stable across a DST transition:
// raw ms arithmetic would silently shift the hour by 1 on the day the clocks
// change; `setDate`/`setHours` re-derive from local wall-clock fields instead.
// ---------------------------------------------------------------------------

function startOfLocalDay(t: number): number {
  const d = new Date(t)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

function addDays(t: number, days: number): number {
  const d = new Date(t)
  d.setDate(d.getDate() + days)
  return d.getTime()
}

/** Adds `months` to `t`, clamping the day-of-month to the target month's length (Jan 31 + 1 month -> Feb 28/29, never rolling into March). */
function addMonthsClamped(t: number, months: number): number {
  const d = new Date(t)
  const day = d.getDate()
  d.setDate(1) // avoid overflow surprises while stepping the month itself
  d.setMonth(d.getMonth() + months)
  const daysInTarget = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
  d.setDate(Math.min(day, daysInTarget))
  return d.getTime()
}

function weekdayOf(t: number): number {
  return new Date(t).getDay() // 0 = Sunday, matching the rest of the codebase's convention
}

/** Projects `anchor`'s local wall-clock time-of-day onto `dayStart` (DST-safe via `Date#setHours`). */
function atTimeOfDay(dayStart: number, anchor: number): number {
  const a = new Date(anchor)
  const d = new Date(dayStart)
  d.setHours(a.getHours(), a.getMinutes(), a.getSeconds(), a.getMilliseconds())
  return d.getTime()
}

/** Projects a minutes-from-midnight instant onto `dayStart` (DST-safe via `Date#setHours` normalization). */
function atMinutesFromMidnight(dayStart: number, minutes: number): number {
  const d = new Date(dayStart)
  d.setHours(0, minutes, 0, 0)
  return d.getTime()
}

function normalizedInterval(rule: RecurrenceRule): number {
  const n = Math.floor(rule.interval)
  return Number.isFinite(n) && n > 0 ? n : 1
}

// ---------------------------------------------------------------------------
// Candidate date generation — freq/interval/byWeekday ONLY. End conditions
// (`until`/`count`), `exceptions`, and range filtering are layered on top by
// the public functions below, so this generator is the single place the
// freq-specific calendar-stepping math lives.
// ---------------------------------------------------------------------------

interface Candidate {
  /** 1-based index counting from the anchor's own occurrence (index 1 = anchor's own date). */
  index: number
  /** epoch ms, local midnight of the candidate's calendar date. */
  date: number
}

/**
 * Yields candidate occurrence DATES (local midnight) in strictly increasing
 * chronological order, starting with the anchor's own date as index 1. Bounded
 * to `MAX_STEPS` raw steps so a pathological or unbounded rule can never spin
 * forever, independent of how far the caller's requested range sits from the
 * anchor (NFR-2).
 */
function* generateCandidateDates(rule: RecurrenceRule, anchor: number): Generator<Candidate> {
  const interval = normalizedInterval(rule)
  const anchorDay = startOfLocalDay(anchor)

  if (rule.freq === 'daily') {
    let index = 0
    for (let step = 0; step < MAX_STEPS; step++) {
      const date = addDays(anchorDay, step * interval)
      if (rule.byWeekday && rule.byWeekday.length > 0 && !rule.byWeekday.includes(weekdayOf(date))) {
        continue // this day doesn't qualify — not a candidate at all, doesn't consume an index
      }
      index += 1
      yield { index, date }
    }
    return
  }

  if (rule.freq === 'weekly') {
    const days =
      rule.byWeekday && rule.byWeekday.length > 0
        ? [...new Set(rule.byWeekday)].sort((a, b) => a - b)
        : [weekdayOf(anchorDay)]
    const anchorWeekStart = addDays(anchorDay, -weekdayOf(anchorDay)) // Sunday of the anchor's week
    let index = 0
    let stepsUsed = 0
    for (let week = 0; stepsUsed < MAX_STEPS; week += interval) {
      const weekStart = addDays(anchorWeekStart, week * 7)
      for (const wd of days) {
        stepsUsed += 1
        if (stepsUsed > MAX_STEPS) return
        const date = addDays(weekStart, wd)
        if (date < anchorDay) continue // never emit a date before the anchor's own date
        index += 1
        yield { index, date }
      }
    }
    return
  }

  // monthly — byWeekday is not meaningful here (ignored).
  let index = 0
  for (let step = 0; step < MAX_STEPS; step++) {
    const date = addMonthsClamped(anchorDay, step * interval)
    index += 1
    yield { index, date }
  }
}

// ---------------------------------------------------------------------------
// Public occurrence shape
// ---------------------------------------------------------------------------

export interface Occurrence {
  /** epoch ms, local midnight of this occurrence's calendar date — the stable key used for `RecurrenceRule.exceptions` matching and drop/carry-forward day comparisons. */
  date: number
  /** epoch ms — this occurrence's actual instant (the anchor's wall-clock time-of-day, projected onto `date`). */
  at: number
  /** epoch ms bounds derived from `rule.startWindow`, projected onto `date`. Undefined when the rule has no per-occurrence window. */
  windowStart?: number
  windowEnd?: number
}

function toOccurrence(rule: RecurrenceRule, anchor: number, date: number): Occurrence {
  const occ: Occurrence = { date, at: atTimeOfDay(date, anchor) }
  if (rule.startWindow) {
    occ.windowStart = atMinutesFromMidnight(date, rule.startWindow.start)
    occ.windowEnd = atMinutesFromMidnight(date, rule.startWindow.end)
  }
  return occ
}

function exceptionDaySet(rule: RecurrenceRule): Set<number> {
  return new Set((rule.exceptions ?? []).map((e) => startOfLocalDay(e)))
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Expand a recurrence rule into concrete occurrences within [rangeStart,
 * rangeEnd) (PRD FR-15, FR-17). `anchor` is the epoch-ms instant of
 * occurrence #1 as far as THIS call is concerned — the task's current `due`
 * (see the `count` semantics note in the module doc above and on
 * `RecurrenceRule` itself).
 *
 * Applies, in order: the calendar cadence (freq/interval/byWeekday), the
 * `count`/`until` end conditions (checked against the RAW generated series,
 * so an excepted date still consumes a `count` slot), the `[rangeStart,
 * rangeEnd)` window, and finally `exceptions` (skipped without breaking the
 * series or affecting later dates).
 *
 * Pure, deterministic, and bounded — see `generateCandidateDates` — so
 * callers should pass a TIGHT range (the auto-schedule cutoff window, FR-17),
 * never the rule's whole lifetime; an unbounded rule is still safe either
 * way, but a tight range keeps this fast and keeps the returned occurrence
 * list meaningful for placement.
 */
export function expandOccurrences(
  rule: RecurrenceRule,
  anchor: number,
  rangeStart: number,
  rangeEnd: number
): Occurrence[] {
  if (rangeEnd <= rangeStart) return []
  const exceptionDays = exceptionDaySet(rule)
  const out: Occurrence[] = []

  for (const { index, date } of generateCandidateDates(rule, anchor)) {
    const at = atTimeOfDay(date, anchor)

    if (rule.count != null && index > rule.count) break
    if (rule.until != null && at > rule.until) break
    if (at >= rangeEnd) break // dates are strictly increasing -> nothing further can be in range
    if (out.length >= MAX_OCCURRENCES) break

    if (at < rangeStart) continue
    if (exceptionDays.has(date)) continue

    out.push(toOccurrence(rule, anchor, date))
  }

  return out
}

/**
 * The single occurrence at or after `minInstant` (used for one-step
 * advancement, where the size of the eventual gap is unknown up front — e.g.
 * a large monthly interval — so guessing a `rangeEnd` for `expandOccurrences`
 * would be unsafe). Applies the same cadence / end-condition / exceptions
 * rules as `expandOccurrences`. Returns null when the rule has no occurrence
 * at/after `minInstant` within its own end conditions or `MAX_STEPS`.
 */
export function nextOccurrenceOnOrAfter(
  rule: RecurrenceRule,
  anchor: number,
  minInstant: number
): Occurrence | null {
  const exceptionDays = exceptionDaySet(rule)
  for (const { index, date } of generateCandidateDates(rule, anchor)) {
    const at = atTimeOfDay(date, anchor)
    if (rule.count != null && index > rule.count) return null
    if (rule.until != null && at > rule.until) return null
    if (at < minInstant) continue
    if (exceptionDays.has(date)) continue
    return toOccurrence(rule, anchor, date)
  }
  return null
}

// ---------------------------------------------------------------------------
// FR-16: drop-missed (default) vs carry-forward, for Recovery Mode
// ---------------------------------------------------------------------------

export interface MissedAdvance {
  /** The task's `due` should become this epoch-ms instant. */
  due: number
  /** Whether the caller should PRESERVE (true) or RESET-to-fresh-template (false) progress/subtasks when applying this advance. */
  carryForward: boolean
  /**
   * What `RecurrenceRule.count` should become after this advance is applied
   * (present only when the rule has a `count`; a `drop` catch-up may consume
   * several occurrences in one call, so this can decrease by more than 1).
   * The caller should persist `{ ...rule, count: nextCount }` alongside `due`.
   */
  nextCount?: number
}

/**
 * FR-16: what should happen to a recurring task whose CURRENT occurrence
 * (`currentDue`) is now in the past (missed), as of `now`. Returns null when
 * the series has no occurrence left to advance to (`until`/`count`
 * exhausted) — the caller should treat the task like a finished one-off
 * (matching the non-recurring `moot_past_due` path in `core/recovery.ts`).
 *
 * - **drop** (default, `rule.carryForward` falsy): catches all the way up to
 *   `now` in one call, skipping past every missed occurrence in between — a
 *   missed occurrence never stacks onto the next one (FR-16 "do not stack two
 *   on the next day"). The caller should also reset progress/subtasks to a
 *   fresh template (`carryForward: false` on the result).
 * - **carry_forward** (`rule.carryForward` true): advances by exactly ONE
 *   occurrence step from the missed due date, regardless of `now` — the
 *   missed work is not silently discarded, it just becomes due next. If
 *   several occurrences were missed, repeated calls (repeated Recovery
 *   passes) catch up one step at a time rather than all at once. The caller
 *   should PRESERVE progress/subtasks (`carryForward: true` on the result) so
 *   unfinished checklist items stay put instead of being wiped.
 */
export function advanceMissedOccurrence(
  rule: RecurrenceRule,
  currentDue: number,
  now: number
): MissedAdvance | null {
  if (rule.carryForward) {
    const next = nextOccurrenceOnOrAfter(rule, currentDue, currentDue + 1)
    if (!next) return null
    return {
      due: next.at,
      carryForward: true,
      nextCount: rule.count != null ? rule.count - 1 : undefined,
    }
  }

  // Drop: catch fully up to `now`, decrementing a local remaining-count
  // budget as occurrences are consumed so `count` stays accurate even when
  // several missed occurrences are skipped in a single call.
  let cursor = currentDue
  let remaining = rule.count
  for (let i = 0; i < MAX_STEPS; i++) {
    const ruleForStep: RecurrenceRule = remaining != null ? { ...rule, count: remaining } : rule
    const next = nextOccurrenceOnOrAfter(ruleForStep, cursor, cursor + 1)
    if (!next) return null
    if (remaining != null) remaining -= 1
    if (next.at >= now) return { due: next.at, carryForward: false, nextCount: remaining }
    cursor = next.at
  }
  return null
}

// ---------------------------------------------------------------------------
// From-completion anchoring (FR-15) + genuine-completion rollover (doc 03 §2.9)
// ---------------------------------------------------------------------------

/**
 * FR-15 "from-completion" anchor mode: for `rule.anchor === 'completion'`,
 * the next occurrence's due date is computed from when the CURRENT occurrence
 * was actually completed — "every 3 days after I finish it" — rather than
 * from a fixed calendar rule. `freq`/`interval` still describe the SIZE of
 * the gap (3 days, 1 week, 1 month); `byWeekday` is ignored (there is no
 * fixed weekday to align to when the cadence floats with actual completion
 * time).
 *
 * Returns null once the series has ended (`until`, or `count <= 1` meaning
 * the just-completed occurrence was the last one).
 */
export function nextOccurrenceFromCompletion(rule: RecurrenceRule, completedAt: number): number | null {
  if (rule.count != null && rule.count <= 1) return null
  const interval = normalizedInterval(rule)
  let next: number
  if (rule.freq === 'monthly') next = addMonthsClamped(completedAt, interval)
  else if (rule.freq === 'weekly') next = addDays(completedAt, interval * 7)
  else next = addDays(completedAt, interval)
  if (rule.until != null && next > rule.until) return null
  return next
}

/**
 * Advance a recurring task to its NEXT occurrence after the current one was
 * GENUINELY completed (doc `03` §2.9: "each occurrence starts with a fresh
 * copy of the template... completing one occurrence does not affect the
 * next"). Returns a new Task with `due` advanced, `status` back to `'todo'`,
 * `completedAt` cleared, `progressMin` reset to 0, every subtask's
 * `completedAt` cleared, and the `firstMove` reset to not-done (a new
 * occurrence gets a fresh on-ramp too) — or `null` when the series has ended
 * (`until`/`count`), in which case the caller should leave the task
 * completed, exactly like a one-off task.
 *
 * Callers (`store/taskStore.ts`): call this AFTER a genuine todo/doing ->
 * done transition, on the resulting completed Task. Non-recurring tasks
 * always get `null` (nothing to roll to) — the caller's existing "leave it
 * done" behavior already does the right thing.
 */
export function rollToNextOccurrence(task: Task, now: number): Task | null {
  const rule = task.recurrence
  if (!rule) return null
  const currentDue = task.due ?? now

  const nextDue =
    rule.anchor === 'completion'
      ? nextOccurrenceFromCompletion(rule, now)
      : (nextOccurrenceOnOrAfter(rule, currentDue, currentDue + 1)?.at ?? null)

  if (nextDue == null) return null

  const nextRule: RecurrenceRule = rule.count != null ? { ...rule, count: rule.count - 1 } : rule

  return {
    ...task,
    due: nextDue,
    status: 'todo',
    completedAt: undefined,
    progressMin: 0,
    subtasks: task.subtasks.map((s) => ({ ...s, completedAt: undefined })),
    firstMove: task.firstMove ? { ...task.firstMove, done: false } : task.firstMove,
    recurrence: nextRule,
    updatedAt: now,
  }
}

// Re-exported for callers that need the `TimeWindow` shape without a second import.
export type { TimeWindow }
