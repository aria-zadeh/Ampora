import { describe, expect, it } from 'vitest'
import {
  clampSpans,
  dayWindowsToSpans,
  daysWithCapacity,
  intersectSpans,
  minutesOfDay,
  startOfDay,
  subtractSpans,
  totalMinutes,
  unionSpans,
} from '@/core/scheduler/time'
import { MS_PER_DAY, MS_PER_MIN } from '@/core/scheduler/types'
import { mondayAt } from './helpers/fixtures'

describe('scheduler/time: span algebra', () => {
  describe('unionSpans', () => {
    it('merges overlapping spans', () => {
      const out = unionSpans([
        { start: 0, end: 100 },
        { start: 50, end: 150 },
      ])
      expect(out).toEqual([{ start: 0, end: 150 }])
    })

    it('merges adjacent (touching) spans', () => {
      const out = unionSpans([
        { start: 0, end: 100 },
        { start: 100, end: 200 },
      ])
      expect(out).toEqual([{ start: 0, end: 200 }])
    })

    it('keeps disjoint spans separate and sorted', () => {
      const out = unionSpans([
        { start: 200, end: 300 },
        { start: 0, end: 100 },
      ])
      expect(out).toEqual([
        { start: 0, end: 100 },
        { start: 200, end: 300 },
      ])
    })

    it('drops zero/negative-length spans', () => {
      expect(unionSpans([{ start: 50, end: 50 }])).toEqual([])
      expect(unionSpans([{ start: 50, end: 40 }])).toEqual([])
    })

    it('returns [] for an empty input', () => {
      expect(unionSpans([])).toEqual([])
    })
  })

  describe('subtractSpans', () => {
    it('removes a fully-contained cut from the middle', () => {
      const out = subtractSpans([{ start: 0, end: 100 }], [{ start: 40, end: 60 }])
      expect(out).toEqual([
        { start: 0, end: 40 },
        { start: 60, end: 100 },
      ])
    })

    it('removes an overlapping cut at the start', () => {
      const out = subtractSpans([{ start: 0, end: 100 }], [{ start: -10, end: 20 }])
      expect(out).toEqual([{ start: 20, end: 100 }])
    })

    it('removes an overlapping cut at the end', () => {
      const out = subtractSpans([{ start: 0, end: 100 }], [{ start: 80, end: 200 }])
      expect(out).toEqual([{ start: 0, end: 80 }])
    })

    it('cut that fully covers the base leaves nothing', () => {
      const out = subtractSpans([{ start: 0, end: 100 }], [{ start: -10, end: 110 }])
      expect(out).toEqual([])
    })

    it('multiple cuts across a base span each carve out their own gap', () => {
      const out = subtractSpans(
        [{ start: 0, end: 100 }],
        [
          { start: 10, end: 20 },
          { start: 30, end: 40 },
          { start: 60, end: 70 },
        ]
      )
      expect(out).toEqual([
        { start: 0, end: 10 },
        { start: 20, end: 30 },
        { start: 40, end: 60 },
        { start: 70, end: 100 },
      ])
    })

    it('a cut disjoint from the base leaves the base untouched', () => {
      const out = subtractSpans([{ start: 0, end: 100 }], [{ start: 200, end: 300 }])
      expect(out).toEqual([{ start: 0, end: 100 }])
    })

    it('an empty cut list returns the (unioned) base unchanged', () => {
      const out = subtractSpans([{ start: 0, end: 100 }], [])
      expect(out).toEqual([{ start: 0, end: 100 }])
    })

    it('never mutates its input arrays', () => {
      const base = [{ start: 0, end: 100 }]
      const cut = [{ start: 40, end: 60 }]
      const baseCopy = JSON.parse(JSON.stringify(base))
      const cutCopy = JSON.parse(JSON.stringify(cut))
      subtractSpans(base, cut)
      expect(base).toEqual(baseCopy)
      expect(cut).toEqual(cutCopy)
    })
  })

  describe('clampSpans', () => {
    it('intersects spans with a [lo, hi) window', () => {
      const out = clampSpans(
        [
          { start: -50, end: 50 },
          { start: 80, end: 200 },
        ],
        0,
        100
      )
      expect(out).toEqual([
        { start: 0, end: 50 },
        { start: 80, end: 100 },
      ])
    })

    it('drops spans entirely outside the window', () => {
      const out = clampSpans([{ start: 200, end: 300 }], 0, 100)
      expect(out).toEqual([])
    })
  })

  describe('intersectSpans', () => {
    it('intersects two sorted, non-overlapping span lists', () => {
      const a = [
        { start: 0, end: 50 },
        { start: 100, end: 150 },
      ]
      const b = [{ start: 25, end: 125 }]
      const out = intersectSpans(a, b)
      expect(out).toEqual([
        { start: 25, end: 50 },
        { start: 100, end: 125 },
      ])
    })

    it('returns [] when there is no overlap', () => {
      expect(intersectSpans([{ start: 0, end: 10 }], [{ start: 20, end: 30 }])).toEqual([])
    })
  })

  describe('totalMinutes', () => {
    it('sums covered minutes across spans', () => {
      const mins = totalMinutes([
        { start: 0, end: 30 * MS_PER_MIN },
        { start: 60 * MS_PER_MIN, end: 90 * MS_PER_MIN },
      ])
      expect(mins).toBe(60)
    })
  })

  describe('daysWithCapacity', () => {
    it('counts distinct local days touched by a span list', () => {
      const day0 = startOfDay(mondayAt(9))
      const spans = [
        { start: day0 + 9 * 60 * MS_PER_MIN, end: day0 + 10 * 60 * MS_PER_MIN }, // day 0
        { start: day0 + MS_PER_DAY + 9 * 60 * MS_PER_MIN, end: day0 + MS_PER_DAY + 10 * 60 * MS_PER_MIN }, // day 1
      ]
      expect(daysWithCapacity(spans)).toBe(2)
    })

    it('a span crossing midnight counts both days', () => {
      const day0 = startOfDay(mondayAt(9))
      const spans = [{ start: day0 + 23 * 60 * MS_PER_MIN, end: day0 + MS_PER_DAY + 60 * MS_PER_MIN }]
      expect(daysWithCapacity(spans)).toBe(2)
    })
  })
})

describe('scheduler/time: clock helpers', () => {
  describe('startOfDay', () => {
    it('returns local midnight for an instant during the day', () => {
      const t = mondayAt(14, 37)
      const mid = startOfDay(t)
      const d = new Date(mid)
      expect(d.getHours()).toBe(0)
      expect(d.getMinutes()).toBe(0)
      expect(d.getSeconds()).toBe(0)
      expect(d.getMilliseconds()).toBe(0)
    })

    it('is idempotent on an already-midnight instant', () => {
      const t = mondayAt(0, 0)
      expect(startOfDay(t)).toBe(t)
    })
  })

  describe('minutesOfDay', () => {
    it('converts a clock time to minutes-from-midnight', () => {
      expect(minutesOfDay(mondayAt(0, 0))).toBe(0)
      expect(minutesOfDay(mondayAt(9, 30))).toBe(9 * 60 + 30)
      expect(minutesOfDay(mondayAt(23, 59))).toBe(23 * 60 + 59)
    })
  })

  describe('day-of-week convention', () => {
    it('the fixed Monday reference resolves to getDay() === 1', () => {
      expect(new Date(mondayAt(12)).getDay()).toBe(1)
    })
  })

  describe('dayWindowsToSpans', () => {
    it('converts minutes-from-midnight windows into absolute epoch-ms spans', () => {
      const dayStart = startOfDay(mondayAt(0))
      const spans = dayWindowsToSpans(dayStart, [{ start: 9 * 60, end: 17 * 60 }])
      expect(spans).toEqual([{ start: dayStart + 9 * 60 * MS_PER_MIN, end: dayStart + 17 * 60 * MS_PER_MIN }])
    })

    it('a window crossing midnight (end <= start) is skipped — callers must pre-split wrap-around windows', () => {
      const dayStart = startOfDay(mondayAt(0))
      // 23:00 -> 08:00 expressed naively (end < start) is NOT a valid single
      // TimeWindow; dayWindowsToSpans intentionally drops it rather than
      // silently misinterpreting the direction. Wrap-around handling lives one
      // layer up in buildQuietHoursSpans, which explicitly splits at midnight.
      const spans = dayWindowsToSpans(dayStart, [{ start: 23 * 60, end: 8 * 60 }])
      expect(spans).toEqual([])
    })

    it('multiple windows in a day each produce their own span', () => {
      const dayStart = startOfDay(mondayAt(0))
      const spans = dayWindowsToSpans(dayStart, [
        { start: 9 * 60, end: 12 * 60 },
        { start: 13 * 60, end: 17 * 60 },
      ])
      expect(spans).toHaveLength(2)
      expect(spans[0]).toEqual({ start: dayStart + 9 * 60 * MS_PER_MIN, end: dayStart + 12 * 60 * MS_PER_MIN })
      expect(spans[1]).toEqual({ start: dayStart + 13 * 60 * MS_PER_MIN, end: dayStart + 17 * 60 * MS_PER_MIN })
    })
  })
})
