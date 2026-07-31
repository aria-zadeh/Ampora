/**
 * All-day event support (AddEventModal's All-day toggle; the Day/3-Day
 * all-day strip) — pure-logic coverage for `components/calendar/allDayEvents.ts`.
 * That module has zero react-native/store imports specifically so it can live
 * under this suite (`vitest.config.ts` only ever runs `core/**` test files,
 * but happily imports any pure module reachable from one via the `@/*` alias
 * — see `blockingEvent.test.ts` for the same pattern).
 */
import { describe, expect, it } from 'vitest'
import {
  ALLDAY_MAX_ROWS,
  ALLDAY_CHIP_H,
  ALLDAY_CHIP_GAP,
  bucketAllDayEvents,
  allDayStripHeight,
  allDaySpan,
  allDayDisplayEnd,
} from '@/components/calendar/allDayEvents'
import { makeCalEvent, mondayAt, MS_PER_DAY, MS_PER_HOUR } from './helpers/fixtures'

// Three consecutive local-midnight day-starts, anchored on the fixture's
// fixed reference Monday (see `mondayAt` in helpers/fixtures.ts).
const DAY0 = mondayAt(0)
const DAY1 = DAY0 + MS_PER_DAY
const DAY2 = DAY0 + 2 * MS_PER_DAY

describe('bucketAllDayEvents', () => {
  it('returns one empty bucket per day when there are no events', () => {
    expect(bucketAllDayEvents([], [DAY0, DAY1, DAY2])).toEqual([[], [], []])
  })

  it('ignores non-all-day events entirely (they render in the time grid instead)', () => {
    const timed = makeCalEvent({ start: DAY0, end: DAY0 + MS_PER_HOUR, allDay: false })
    expect(bucketAllDayEvents([timed], [DAY0])).toEqual([[]])
  })

  it('places a single-day all-day event in only its own day bucket', () => {
    const event = makeCalEvent({ id: 'e1', start: DAY0, end: DAY1, allDay: true })
    const buckets = bucketAllDayEvents([event], [DAY0, DAY1, DAY2])
    expect(buckets[0].map((e) => e.id)).toEqual(['e1'])
    expect(buckets[1]).toEqual([])
    expect(buckets[2]).toEqual([])
  })

  it('places a multi-day all-day event in every day it overlaps', () => {
    const event = makeCalEvent({ id: 'break', start: DAY0, end: DAY2, allDay: true }) // active Mon+Tue, not Wed
    const buckets = bucketAllDayEvents([event], [DAY0, DAY1, DAY2])
    expect(buckets[0].map((e) => e.id)).toEqual(['break'])
    expect(buckets[1].map((e) => e.id)).toEqual(['break'])
    expect(buckets[2]).toEqual([]) // half-open: event.end === DAY2, so day index 2 is not covered
  })

  it('excludes an event that only touches a day boundary (half-open, matches the rest of the codebase)', () => {
    const event = makeCalEvent({ start: DAY0 - MS_PER_DAY, end: DAY0, allDay: true }) // ends exactly at DAY0
    expect(bucketAllDayEvents([event], [DAY0])).toEqual([[]])
  })

  it('sorts each bucket by start time, independent of input order', () => {
    const later = makeCalEvent({ id: 'later', start: DAY0 + MS_PER_HOUR, end: DAY1, allDay: true })
    const earlier = makeCalEvent({ id: 'earlier', start: DAY0, end: DAY1, allDay: true })
    expect(bucketAllDayEvents([later, earlier], [DAY0])[0].map((e) => e.id)).toEqual(['earlier', 'later'])
    expect(bucketAllDayEvents([earlier, later], [DAY0])[0].map((e) => e.id)).toEqual(['earlier', 'later'])
  })
})

describe('allDayStripHeight', () => {
  it('is 0 when no day has any events (the strip takes no space in the common case)', () => {
    expect(allDayStripHeight([[], [], []])).toBe(0)
  })

  it('is one row tall when the busiest day has exactly 1 event', () => {
    const one = [makeCalEvent()]
    expect(allDayStripHeight([one, []])).toBe(1 * (ALLDAY_CHIP_H + ALLDAY_CHIP_GAP) + 4)
  })

  it('caps at ALLDAY_MAX_ROWS even when a day has more events than that (the rest become "+N")', () => {
    const many = [makeCalEvent(), makeCalEvent(), makeCalEvent(), makeCalEvent()]
    expect(allDayStripHeight([many])).toBe(ALLDAY_MAX_ROWS * (ALLDAY_CHIP_H + ALLDAY_CHIP_GAP) + 4)
  })

  it('is driven by the single busiest day, not the total across days', () => {
    const busy = [makeCalEvent(), makeCalEvent()]
    const quiet = [makeCalEvent()]
    expect(allDayStripHeight([quiet, busy])).toBe(2 * (ALLDAY_CHIP_H + ALLDAY_CHIP_GAP) + 4)
  })
})

describe('allDaySpan', () => {
  it('spans exactly 24h when the start and end pickers show the same day', () => {
    const picked = mondayAt(14, 30) // arbitrary time-of-day on Monday
    expect(allDaySpan(picked, picked)).toEqual({ start: DAY0, end: DAY1 })
  })

  it('ignores the time-of-day on both pickers — only the date matters', () => {
    const a = allDaySpan(mondayAt(0), mondayAt(23, 59))
    const b = allDaySpan(mondayAt(9), mondayAt(17))
    expect(a).toEqual({ start: DAY0, end: DAY1 })
    expect(a).toEqual(b)
  })

  it('spans through the end of the picked end date for a multi-day event', () => {
    // Start picker shows Monday, end picker shows Tuesday -> covers both days.
    expect(allDaySpan(DAY0, DAY1)).toEqual({ start: DAY0, end: DAY2 })
  })

  it('clamps forward to a single day anchored at start when the end date precedes the start date', () => {
    // Start picker shows Tuesday, end picker shows Monday (before start).
    expect(allDaySpan(DAY1, DAY0)).toEqual({ start: DAY1, end: DAY2 })
  })
})

describe('allDaySpan + allDayDisplayEnd round-trip', () => {
  it('round-trips a stored single-day span through the display transform and back unchanged', () => {
    const stored = { start: DAY0, end: DAY1 }
    expect(allDaySpan(stored.start, allDayDisplayEnd(stored.end))).toEqual(stored)
  })

  it('round-trips a stored multi-day span through the display transform and back unchanged', () => {
    const stored = { start: DAY0, end: DAY0 + 3 * MS_PER_DAY }
    expect(allDaySpan(stored.start, allDayDisplayEnd(stored.end))).toEqual(stored)
  })
})
