/**
 * 9.5.1 Free-time construction.
 *
 * Build a timeline from `now` to `cutoff`, then SUBTRACT (in the PRD's order):
 *   1. busy CalEvents (with any fixed-task buffers already folded in by caller),
 *   2. fixed (non-autoSchedule) tasks that have a due/time, as busy,
 *   3. time OUTSIDE the relevant SchedulingHours windows (per weekday),
 *   4. quiet hours,
 *   5. pinned ScheduledBlocks.
 *
 * Output: sorted, non-overlapping FreeInterval[].
 *
 * Pure: no clock reads, inputs never mutated.
 */

import type { CalEvent, ScheduledBlock, SchedulingHours, Task } from '@/types'
import {
  MS_PER_DAY,
  MS_PER_MIN,
  type FreeInterval,
  type Span,
} from './types'
import {
  clampSpans,
  dayWindowsToSpans,
  startOfDay,
  subtractSpans,
  unionSpans,
} from './time'

export interface FreeTimeInput {
  now: number
  cutoff: number
  tasks: Task[]
  calEvents: CalEvent[]
  prevBlocks: ScheduledBlock[]
  schedulingHours: SchedulingHours
  quietHours: { start: number; end: number }
}

/**
 * Build the base "allowed" timeline: the union, per day in [now, cutoff), of
 * that weekday's scheduling-hours windows — intersected with [now, cutoff).
 * Everything outside these spans is implicitly unavailable (subtraction #3).
 */
export function buildSchedulingHoursSpans(
  now: number,
  cutoff: number,
  hours: SchedulingHours
): Span[] {
  const spans: Span[] = []
  // Iterate day by day from the local day containing `now` up to cutoff.
  for (let dayStart = startOfDay(now); dayStart < cutoff; dayStart += MS_PER_DAY) {
    const weekday = new Date(dayStart).getDay() // 0=Sun..6=Sat
    const perDay = hours.perDay.find((d) => d.day === weekday)
    if (!perDay || perDay.windows.length === 0) continue
    for (const span of dayWindowsToSpans(dayStart, perDay.windows)) {
      spans.push(span)
    }
  }
  // Clamp to [now, cutoff) so we never plan in the past or beyond the horizon.
  return clampSpans(unionSpans(spans), now, cutoff)
}

/** Quiet-hours busy spans across the horizon (subtraction #4). Handles wrap-around windows. */
export function buildQuietHoursSpans(
  now: number,
  cutoff: number,
  quiet: { start: number; end: number }
): Span[] {
  if (quiet.start === quiet.end) return []
  const spans: Span[] = []
  // Expand one day earlier so a wrap-around window (e.g. 23:00-08:00) that
  // started "yesterday" still masks the early hours of the first day.
  for (
    let dayStart = startOfDay(now) - MS_PER_DAY;
    dayStart < cutoff;
    dayStart += MS_PER_DAY
  ) {
    if (quiet.start < quiet.end) {
      // Same-day window.
      spans.push({
        start: dayStart + quiet.start * MS_PER_MIN,
        end: dayStart + quiet.end * MS_PER_MIN,
      })
    } else {
      // Wrap-around: [start..midnight) + [midnight..end).
      spans.push({
        start: dayStart + quiet.start * MS_PER_MIN,
        end: dayStart + MS_PER_DAY,
      })
      spans.push({
        start: dayStart,
        end: dayStart + quiet.end * MS_PER_MIN,
      })
    }
  }
  return clampSpans(unionSpans(spans), now, cutoff)
}

/** Busy spans from calendar events flagged `busy` (subtraction #1). */
export function busyEventSpans(calEvents: CalEvent[], now: number, cutoff: number): Span[] {
  const spans: Span[] = []
  for (const ev of calEvents) {
    if (!ev.busy) continue
    spans.push({ start: ev.start, end: ev.end })
  }
  return clampSpans(unionSpans(spans), now, cutoff)
}

/**
 * Busy spans from FIXED tasks (subtraction #2): a task that is NOT
 * auto-scheduled but carries a due/time is treated as occupying its duration
 * ending at its due instant (best effort — fixed tasks have no explicit start
 * in the model, so we back off `durationMin` from `due`). Buffers included.
 */
export function fixedTaskSpans(tasks: Task[], now: number, cutoff: number): Span[] {
  const spans: Span[] = []
  for (const t of tasks) {
    if (t.autoSchedule) continue
    if (t.status === 'done') continue
    if (t.due == null) continue
    const durMs = Math.max(0, t.durationMin - (t.progressMin ?? 0)) * MS_PER_MIN
    const before = (t.bufferBeforeMin ?? 0) * MS_PER_MIN
    const after = (t.bufferAfterMin ?? 0) * MS_PER_MIN
    const end = t.due + after
    const start = t.due - durMs - before
    spans.push({ start, end })
  }
  return clampSpans(unionSpans(spans), now, cutoff)
}

/** Busy spans from pinned blocks (subtraction #5). Pinned = immovable input. */
export function pinnedBlockSpans(blocks: ScheduledBlock[], now: number, cutoff: number): Span[] {
  const spans: Span[] = []
  for (const b of blocks) {
    if (!b.pinned) continue
    spans.push({ start: b.start, end: b.end })
  }
  return clampSpans(unionSpans(spans), now, cutoff)
}

/**
 * The public builder. Composes the subtractions in PRD order and returns a
 * sorted, non-overlapping FreeInterval[].
 */
export function buildFreeIntervals(input: FreeTimeInput): FreeInterval[] {
  const { now, cutoff } = input
  if (cutoff <= now) return []

  // Base allowed time = inside scheduling hours (subtraction #3 is implicit:
  // we START from scheduling-hours spans rather than the full timeline).
  let free = buildSchedulingHoursSpans(now, cutoff, input.schedulingHours)
  if (free.length === 0) return []

  // Gather all busy spans, then subtract their union once (order within the
  // union does not matter — subtraction is set difference).
  const busy = unionSpans([
    ...busyEventSpans(input.calEvents, now, cutoff),
    ...fixedTaskSpans(input.tasks, now, cutoff),
    ...buildQuietHoursSpans(now, cutoff, input.quietHours),
    ...pinnedBlockSpans(input.prevBlocks, now, cutoff),
  ])

  free = subtractSpans(free, busy)

  return free.map((s) => ({ start: s.start, end: s.end }))
}
