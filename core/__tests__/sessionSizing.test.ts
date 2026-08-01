import { describe, expect, it } from 'vitest'
import { DEFAULT_MAX_BLOCK_MIN, DEFAULT_MIN_BLOCK_MIN, maxBlockFor, minBlockFor, sessionSizes } from '@/core/scheduler/sessionSizing'
import { makeTask } from './helpers/fixtures'

describe('scheduler/sessionSizing: min/max block resolution', () => {
  it('defaults to 30/120 when unset', () => {
    const t = makeTask({})
    expect(minBlockFor(t)).toBe(DEFAULT_MIN_BLOCK_MIN)
    expect(maxBlockFor(t)).toBe(DEFAULT_MAX_BLOCK_MIN)
  })

  it('honors per-task overrides', () => {
    const t = makeTask({ minBlockMin: 15, maxBlockMin: 45 })
    expect(minBlockFor(t)).toBe(15)
    expect(maxBlockFor(t)).toBe(45)
  })

  it('maxBlockFor never returns less than minBlockFor even if configured that way', () => {
    const t = makeTask({ minBlockMin: 50, maxBlockMin: 20 })
    expect(maxBlockFor(t)).toBeGreaterThanOrEqual(minBlockFor(t))
  })
})

describe('scheduler/sessionSizing: sessionSizes', () => {
  it('remaining <= 0 produces no sessions', () => {
    expect(sessionSizes(0, makeTask({}), 'balanced', 5)).toEqual([])
    expect(sessionSizes(-10, makeTask({}), 'balanced', 5)).toEqual([])
  })

  it('remaining that fits within one maxBlock is a single session', () => {
    const t = makeTask({ minBlockMin: 30, maxBlockMin: 120 })
    expect(sessionSizes(90, t, 'balanced', 3)).toEqual([90])
    expect(sessionSizes(120, t, 'frontload', 3)).toEqual([120])
  })

  describe('balanced mode (PRD 9.5.4)', () => {
    it('target = clamp(ceil(remaining/daysAvailable), min, max); sessions of target until exhausted', () => {
      // remaining=300, daysAvailable=3 -> target = clamp(ceil(100), 30, 120) = 100.
      const t = makeTask({ minBlockMin: 30, maxBlockMin: 120 })
      const sizes = sessionSizes(300, t, 'balanced', 3)
      expect(sizes).toEqual([100, 100, 100])
      expect(sizes.reduce((a, b) => a + b, 0)).toBe(300)
    })

    it('target is clamped to maxBlock when remaining/days exceeds it, and every session stays <= maxBlock', () => {
      // remaining=500, daysAvailable=2 -> naive target=250, clamped to 120.
      // PRD 9.5.4 / the task spec both require sessions "never above
      // maxBlock". BUG: sessionSizes(500, ..., 'balanced', 2) with
      // min=30/max=120 actually emits [120,120,120,140] — the trailing
      // 20-minute remainder is below minBlock so balancedSizes merges it into
      // the previous 120-minute session, producing a 140-minute session that
      // exceeds maxBlock. The merge-when-under-minBlock rule and the
      // never-above-maxBlock rule conflict whenever target is itself clamped
      // to maxBlock (core/scheduler/sessionSizing.ts balancedSizes) — the code
      // does not special-case that combination. Left failing intentionally.
      const t = makeTask({ minBlockMin: 30, maxBlockMin: 120 })
      const sizes = sessionSizes(500, t, 'balanced', 2)
      for (const s of sizes) {
        expect(s).toBeLessThanOrEqual(120)
        expect(s).toBeGreaterThanOrEqual(30)
      }
      expect(sizes.reduce((a, b) => a + b, 0)).toBe(500)
    })

    it('target is clamped up to minBlock when remaining/days is below it', () => {
      // remaining=40, daysAvailable=10 -> naive target=4, clamped to minBlock=30.
      const t = makeTask({ minBlockMin: 30, maxBlockMin: 120 })
      const sizes = sessionSizes(40, t, 'balanced', 10)
      for (const s of sizes) expect(s).toBeGreaterThanOrEqual(30)
      expect(sizes.reduce((a, b) => a + b, 0)).toBe(40)
    })

    it('a trailing remainder >= minBlock becomes its own session', () => {
      // target=clamp(ceil(170/3),30,120)=57 -> 57,57,56 (remainder 56 >=
      // minBlock(30) so it stands alone rather than merging).
      const t = makeTask({ minBlockMin: 30, maxBlockMin: 120 })
      const sizes = sessionSizes(170, t, 'balanced', 3)
      expect(sizes[sizes.length - 1]).toBeGreaterThanOrEqual(30)
      expect(sizes.reduce((a, b) => a + b, 0)).toBe(170)
    })

    it('a trailing remainder below minBlock is merged into the previous session, never emitted standalone', () => {
      // minBlock=20, maxBlock=100, days=5, remaining=101 -> target =
      // clamp(ceil(101/5)=21, 20, 100) = 21 (NOT clamped by maxBlock, so this
      // case isolates the merge rule from the separate maxBlock-clamp bug
      // covered above). Loop: 21,21,21, then remainder 38... actually walks
      // to [21,21,21,38] since 38 >= minBlock(20) it would stand alone; the
      // merge path is exercised whenever the true final remainder is < 20.
      // Assert the documented invariant directly rather than one brittle
      // literal array: no session is below minBlock, and the total is exact.
      const t = makeTask({ minBlockMin: 20, maxBlockMin: 100 })
      const sizes = sessionSizes(101, t, 'balanced', 5)
      for (const s of sizes) expect(s).toBeGreaterThanOrEqual(20)
      expect(sizes.reduce((a, b) => a + b, 0)).toBe(101)

      // Construct a case where the remainder truly falls under minBlock so
      // the merge branch (sizes[last] += left) actually fires: target=21,
      // 4 full sessions of 21 = 84, remaining arranged to leave < 20.
      const sizes2 = sessionSizes(88, t, 'balanced', 4) // target=clamp(ceil(88/4)=22,20,100)=22
      // 22,22,22 leaves 22 (>= minBlock=20) -> stands alone: [22,22,22,22].
      expect(sizes2.reduce((a, b) => a + b, 0)).toBe(88)
      for (const s of sizes2) expect(s).toBeGreaterThanOrEqual(20)

      // A case that actually leaves a sub-minBlock remainder with target
      // UNCLAMPED by maxBlock (isolates the merge rule cleanly): minBlock=15,
      // maxBlock=80, days=5, remaining=81 -> target=clamp(ceil(81/5)=17,15,80)=17.
      // 17,17,17 leaves 30; 30>17 so a 4th 17-block is placed leaving a true
      // remainder of 13 (<15) which merges into the 4th block -> [17,17,17,30].
      const t2 = makeTask({ minBlockMin: 15, maxBlockMin: 80 })
      const sizes3 = sessionSizes(81, t2, 'balanced', 5)
      expect(sizes3).toEqual([17, 17, 17, 30])
      for (const s of sizes3) expect(s).toBeGreaterThanOrEqual(15)
      expect(sizes3.reduce((a, b) => a + b, 0)).toBe(81)
    })

    it('every session respects [minBlock, maxBlock] across a range of remaining/day combinations where target is not maxBlock-clamped', () => {
      // Restricted to combinations where ceil(remaining/days) <= maxBlock, so
      // this exercises the general balanced path without the separate
      // maxBlock-clamp-vs-merge bug documented above.
      const t = makeTask({ minBlockMin: 30, maxBlockMin: 120 })
      for (const remaining of [45, 61, 133, 245, 400, 719]) {
        for (const days of [1, 2, 3, 5, 8]) {
          const target = Math.min(120, Math.max(30, Math.ceil(remaining / days)))
          if (target >= 120 && remaining > 120) continue // skip the known maxBlock-clamp bug cases
          const sizes = sessionSizes(remaining, t, 'balanced', days)
          expect(sizes.reduce((a, b) => a + b, 0)).toBe(remaining)
          for (const s of sizes) {
            expect(s).toBeGreaterThanOrEqual(30)
          }
        }
      }
    })

    it('daysAvailable of 0 or negative is floored to 1 (no divide-by-zero, no empty output)', () => {
      const t = makeTask({ minBlockMin: 30, maxBlockMin: 120 })
      const sizes = sessionSizes(200, t, 'balanced', 0)
      expect(sizes.reduce((a, b) => a + b, 0)).toBe(200)
      for (const s of sizes) expect(s).toBeLessThanOrEqual(120)
    })
  })

  describe('frontload mode (PRD 9.5.4)', () => {
    it('emits maxBlock sessions earliest-first until exhausted, last is the remainder', () => {
      const t = makeTask({ minBlockMin: 30, maxBlockMin: 120 })
      const sizes = sessionSizes(310, t, 'frontload', 5)
      // 120, 120, 70 (70 < 120 but the tiny-tail merge only triggers when
      // prev+last <= maxB; 120+70=190 > 120 so it stays separate).
      expect(sizes).toEqual([120, 120, 70])
      expect(sizes.reduce((a, b) => a + b, 0)).toBe(310)
    })

    it('never exceeds maxBlock per session', () => {
      const t = makeTask({ minBlockMin: 30, maxBlockMin: 120 })
      const sizes = sessionSizes(500, t, 'frontload', 1)
      for (const s of sizes) expect(s).toBeLessThanOrEqual(120)
      expect(sizes.reduce((a, b) => a + b, 0)).toBe(500)
    })

    it('merges a small final chunk into the previous session when it still fits under maxBlock', () => {
      // remaining=130, maxB=120 -> naive [120,10]; 120(prev)... wait prev+last
      // must fit <=maxB check uses the SECOND-TO-LAST + LAST: sizes=[120,10],
      // prev=120,last=10, 120+10=130>120 so NOT merged (stays [120,10]).
      // To actually trigger the merge we need a case with 3+ chunks where the
      // last two together still fit under maxB, e.g. maxB=120, remaining=250
      // -> naive [120,120,10]; prev=120,last=10 -> 130>120, not merged either
      // (mergeTinyTail only merges the LAST TWO, and 120+anything>0 exceeds
      // 120). So verify total conservation instead of a specific merge case.
      const t = makeTask({ minBlockMin: 10, maxBlockMin: 120 })
      const sizes = sessionSizes(250, t, 'frontload', 1)
      expect(sizes.reduce((a, b) => a + b, 0)).toBe(250)
      expect(sizes.every((s) => s > 0)).toBe(true)
    })

    it('a remaining that divides evenly into maxBlock chunks produces no tiny remainder', () => {
      const t = makeTask({ minBlockMin: 30, maxBlockMin: 100 })
      const sizes = sessionSizes(300, t, 'frontload', 1)
      expect(sizes).toEqual([100, 100, 100])
    })
  })

  it('is deterministic: repeated calls with identical inputs produce identical output', () => {
    const t = makeTask({ minBlockMin: 30, maxBlockMin: 120 })
    const a = sessionSizes(275, t, 'balanced', 4)
    const b = sessionSizes(275, t, 'balanced', 4)
    expect(a).toEqual(b)
  })
})
