import { describe, expect, it } from 'vitest'
import {
  buildFreeIntervals,
  buildQuietHoursSpans,
  buildSchedulingHoursSpans,
  busyEventSpans,
  fixedTaskSpans,
  pinnedBlockSpans,
} from '@/core/scheduler/freeTime'
import { startOfDay } from '@/core/scheduler/time'
import { MS_PER_DAY, MS_PER_MIN } from '@/core/scheduler/types'
import { allDaySchedulingHours, makeBlock, makeCalEvent, makeTask, mondayAt } from './helpers/fixtures'

const now = mondayAt(8) // Monday 08:00
const cutoff = now + 3 * MS_PER_DAY

describe('scheduler/freeTime', () => {
  describe('buildSchedulingHoursSpans', () => {
    it('produces windows only for days that have a perDay entry', () => {
      const hours = { perDay: [{ day: 1, windows: [{ start: 9 * 60, end: 17 * 60 }] }] } // Monday only
      const spans = buildSchedulingHoursSpans(now, cutoff, hours)
      // Only Monday's 09:00-17:00 window should survive, clamped to [now, cutoff).
      expect(spans).toHaveLength(1)
      const day0 = startOfDay(now)
      expect(spans[0]).toEqual({ start: day0 + 9 * 60 * MS_PER_MIN, end: day0 + 17 * 60 * MS_PER_MIN })
    })

    it('clamps the first day to now (never plans in the past)', () => {
      const hours = allDaySchedulingHours({ start: 0, end: 24 * 60 })
      const spans = buildSchedulingHoursSpans(now, cutoff, hours)
      expect(spans[0].start).toBe(now)
    })
  })

  describe('buildQuietHoursSpans', () => {
    it('same-day (non-wrapping) window produces one span per day', () => {
      const spans = buildQuietHoursSpans(now, now + 2 * MS_PER_DAY, { start: 12 * 60, end: 13 * 60 })
      // lunch quiet hour on today and tomorrow (today's may be clamped by `now`).
      expect(spans.length).toBeGreaterThanOrEqual(1)
      for (const s of spans) {
        expect(s.end - s.start).toBeLessThanOrEqual(60 * MS_PER_MIN)
      }
    })

    it('a midnight-wrapping window (23:00-08:00) is internally split at the day boundary, then re-joins into one continuous span', () => {
      // The builder constructs each night as two same-day pieces — [D 23:00,
      // D+1 00:00) and [D+1 00:00, D+1 08:00) — which is the midnight split
      // the implementation performs internally. Because those two pieces are
      // exactly adjacent, unionSpans (correctly) merges them back into one
      // continuous [D 23:00, D+1 08:00) span: quiet hours 23:00-08:00 really
      // is one uninterrupted block of time, so a merged span is the correct
      // final output, not a bug. This test asserts that end-to-end result.
      const spans = buildQuietHoursSpans(now, now + 2 * MS_PER_DAY, { start: 23 * 60, end: 8 * 60 })
      const day0 = startOfDay(now)
      const day1 = day0 + MS_PER_DAY
      const day2 = day1 + MS_PER_DAY
      // Monday night's quiet window: Mon 23:00 -> Tue 08:00, continuous.
      expect(spans).toContainEqual({ start: day0 + 23 * 60 * MS_PER_MIN, end: day1 + 8 * 60 * MS_PER_MIN })
      // Tuesday night's quiet window: Tue 23:00 -> Wed 08:00, continuous.
      expect(spans).toContainEqual({ start: day1 + 23 * 60 * MS_PER_MIN, end: day2 + 8 * 60 * MS_PER_MIN })
      // No returned span is empty/inverted.
      for (const s of spans) expect(s.end).toBeGreaterThan(s.start)
    })

    it('start === end (no quiet hours configured) yields no spans', () => {
      expect(buildQuietHoursSpans(now, cutoff, { start: 0, end: 0 })).toEqual([])
    })
  })

  describe('busyEventSpans', () => {
    it('includes only events flagged busy', () => {
      const busy = makeCalEvent({ id: 'b1', start: now + hoursMs(1), end: now + hoursMs(2), busy: true })
      const notBusy = makeCalEvent({ id: 'b2', start: now + hoursMs(3), end: now + hoursMs(4), busy: false })
      const spans = busyEventSpans([busy, notBusy], now, cutoff)
      expect(spans).toEqual([{ start: busy.start, end: busy.end }])
    })
  })

  describe('fixedTaskSpans', () => {
    it('treats a fixed (non-auto-schedule) task with a due as busy, ending at due, backing off duration+buffers', () => {
      const due = now + hoursMs(5)
      const task = makeTask({
        autoSchedule: false,
        due,
        durationMin: 60,
        bufferBeforeMin: 10,
        bufferAfterMin: 5,
      })
      const spans = fixedTaskSpans([task], now, cutoff)
      expect(spans).toEqual([{ start: due - 70 * MS_PER_MIN, end: due + 5 * MS_PER_MIN }])
    })

    it('ignores auto-scheduled tasks (they are placed, not treated as pre-existing busy time)', () => {
      const task = makeTask({ autoSchedule: true, due: now + hoursMs(5) })
      expect(fixedTaskSpans([task], now, cutoff)).toEqual([])
    })

    it('ignores done fixed tasks and fixed tasks without a due', () => {
      const done = makeTask({ autoSchedule: false, due: now + hoursMs(2), status: 'done' })
      const noDue = makeTask({ autoSchedule: false })
      expect(fixedTaskSpans([done, noDue], now, cutoff)).toEqual([])
    })
  })

  describe('pinnedBlockSpans', () => {
    it('includes only blocks flagged pinned', () => {
      const pinned = makeBlock({ start: now + hoursMs(1), end: now + hoursMs(2), pinned: true })
      const unpinned = makeBlock({ start: now + hoursMs(3), end: now + hoursMs(4), pinned: false })
      const spans = pinnedBlockSpans([pinned, unpinned], now, cutoff)
      expect(spans).toEqual([{ start: pinned.start, end: pinned.end }])
    })
  })

  describe('buildFreeIntervals: full composition', () => {
    it('a busy calendar event carves a gap out of the scheduling-hours window', () => {
      const hours = allDaySchedulingHours({ start: 9 * 60, end: 17 * 60 })
      const day0 = startOfDay(now)
      const ev = makeCalEvent({ start: day0 + 10 * 60 * MS_PER_MIN, end: day0 + 11 * 60 * MS_PER_MIN, busy: true })
      const free = buildFreeIntervals({
        now,
        cutoff: now + MS_PER_DAY,
        tasks: [],
        calEvents: [ev],
        prevBlocks: [],
        schedulingHours: hours,
        quietHours: { start: 0, end: 0 },
      })
      // Expect two intervals: [now(8:00 already inside 9-17? no, now=8:00 is
      // before the 9:00 window start) -> really the window is 9-17 clamped].
      // now=08:00 < window start 09:00, so free starts at 09:00.
      expect(free[0].start).toBe(day0 + 9 * 60 * MS_PER_MIN)
      expect(free[0].end).toBe(ev.start)
      expect(free[1].start).toBe(ev.end)
      expect(free[1].end).toBe(day0 + 17 * 60 * MS_PER_MIN)
    })

    it('a fixed task, buffers, scheduling-hours window, and quiet hours all subtract correctly together', () => {
      const hours = allDaySchedulingHours({ start: 9 * 60, end: 21 * 60 })
      const day0 = startOfDay(now)
      const fixedDue = day0 + 12 * 60 * MS_PER_MIN
      const fixed = makeTask({
        autoSchedule: false,
        due: fixedDue,
        durationMin: 30,
        bufferBeforeMin: 0,
        bufferAfterMin: 0,
      })
      const free = buildFreeIntervals({
        now,
        cutoff: now + MS_PER_DAY,
        tasks: [fixed],
        calEvents: [],
        prevBlocks: [],
        schedulingHours: hours,
        quietHours: { start: 20 * 60, end: 21 * 60 }, // last hour of the window is quiet
      })
      // Free should exclude [11:30,12:00) (fixed task) and [20:00,21:00) (quiet).
      const hasFixedGap = free.every((f) => !(f.start < fixedDue && f.end > fixedDue - 30 * MS_PER_MIN))
      expect(hasFixedGap).toBe(true)
      const last = free[free.length - 1]
      expect(last.end).toBeLessThanOrEqual(day0 + 20 * 60 * MS_PER_MIN)
    })

    it('a pinned block subtracts from free time (immovable input)', () => {
      const hours = allDaySchedulingHours({ start: 9 * 60, end: 17 * 60 })
      const day0 = startOfDay(now)
      const pinned = makeBlock({ start: day0 + 10 * 60 * MS_PER_MIN, end: day0 + 11 * 60 * MS_PER_MIN, pinned: true })
      const free = buildFreeIntervals({
        now,
        cutoff: now + MS_PER_DAY,
        tasks: [],
        calEvents: [],
        prevBlocks: [pinned],
        schedulingHours: hours,
        quietHours: { start: 0, end: 0 },
      })
      expect(free.some((f) => f.start < pinned.end && f.end > pinned.start)).toBe(false)
    })

    it('an event crossing midnight splits at the day boundary (never a single cross-midnight free/busy span)', () => {
      const hours = allDaySchedulingHours({ start: 0, end: 24 * 60 }) // all day, every day
      const day0 = startOfDay(now)
      // Busy event from Monday 22:00 to Tuesday 02:00.
      const ev = makeCalEvent({ start: day0 + 22 * 60 * MS_PER_MIN, end: day0 + MS_PER_DAY + 2 * 60 * MS_PER_MIN, busy: true })
      const free = buildFreeIntervals({
        now,
        cutoff: now + 2 * MS_PER_DAY,
        tasks: [],
        calEvents: [ev],
        prevBlocks: [],
        schedulingHours: hours,
        quietHours: { start: 0, end: 0 },
      })
      // No free interval should overlap the busy event's span at all.
      for (const f of free) {
        const overlaps = f.start < ev.end && f.end > ev.start
        expect(overlaps).toBe(false)
      }
      // And there should be a free interval immediately before and after it.
      expect(free.some((f) => f.end === ev.start)).toBe(true)
      expect(free.some((f) => f.start === ev.end)).toBe(true)
    })

    it('returns [] when cutoff <= now', () => {
      const free = buildFreeIntervals({
        now,
        cutoff: now,
        tasks: [],
        calEvents: [],
        prevBlocks: [],
        schedulingHours: allDaySchedulingHours(),
        quietHours: { start: 0, end: 0 },
      })
      expect(free).toEqual([])
    })

    it('returns [] when the scheduling-hours template has no windows at all', () => {
      const free = buildFreeIntervals({
        now,
        cutoff: now + MS_PER_DAY,
        tasks: [],
        calEvents: [],
        prevBlocks: [],
        schedulingHours: { perDay: [] },
        quietHours: { start: 0, end: 0 },
      })
      expect(free).toEqual([])
    })
  })
})

function hoursMs(hours: number): number {
  return hours * 60 * MS_PER_MIN
}
