/**
 * Tests for `core/recurrence.ts` (PRD FR-15, FR-16, §9.5.6; doc
 * `03_AI_Breakdown_and_Subtasks.md` §2.9).
 *
 * DST strategy: several suites below deliberately cross a real US DST
 * transition (spring-forward and fall-back) to prove occurrences stay
 * wall-clock-local (doc `09_Decisions.md`) rather than drifting by raw
 * millisecond arithmetic. Since `core/recurrence.ts` never reads `Date.now()`
 * and instead relies entirely on the JS engine's local-time normalization
 * (`Date#setDate`/`setHours`, matching `core/scheduler/time.ts#startOfDay`),
 * the ONLY way to test this deterministically — independent of whatever
 * timezone the machine or CI runner happens to be in — is to pin
 * `process.env.TZ` to a real DST-observing zone for this file's run and
 * restore it afterward. Verified empirically (Node respects a runtime
 * `process.env.TZ` mutation for both `Intl` and `Date` local-time methods)
 * before relying on it here. `America/New_York` 2026 transitions used below:
 * spring-forward Sun Mar 8 2026 02:00->03:00, fall-back Sun Nov 1 2026
 * 02:00->01:00.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  advanceMissedOccurrence,
  expandOccurrences,
  MAX_OCCURRENCES,
  MAX_STEPS,
  nextOccurrenceFromCompletion,
  nextOccurrenceOnOrAfter,
  RECURRENCE_LIMITS,
  rollToNextOccurrence,
  type Occurrence,
} from '@/core/recurrence'
import { MS_PER_DAY, MS_PER_HOUR, MS_PER_MIN } from '@/core/scheduler/types'
import { makeTask } from './helpers/fixtures'
import type { RecurrenceRule } from '@/types'

const ORIGINAL_TZ = process.env.TZ
beforeAll(() => {
  process.env.TZ = 'America/New_York'
})
afterAll(() => {
  process.env.TZ = ORIGINAL_TZ
})

// ---------------------------------------------------------------------------
// Local helpers (kept private to this file — not entity factories, so they
// don't belong in the shared `./helpers/fixtures`).
// ---------------------------------------------------------------------------

/** Epoch ms for a local wall-clock instant, month is 0-based like `Date`. */
function localMs(year: number, month: number, day: number, hour = 0, minute = 0, second = 0, ms = 0): number {
  return new Date(year, month, day, hour, minute, second, ms).getTime()
}

/** Mirrors `core/recurrence.ts`'s private `addDays` (setDate-based, DST-safe) for building expected boundaries. */
function addCalendarDays(t: number, days: number): number {
  const d = new Date(t)
  d.setDate(d.getDate() + days)
  return d.getTime()
}

function expectLocalTime(t: number, hour: number, minute: number): void {
  const d = new Date(t)
  expect(d.getHours()).toBe(hour)
  expect(d.getMinutes()).toBe(minute)
}

function dates(occs: Occurrence[]): number[] {
  return occs.map((o) => o.date)
}

// ---------------------------------------------------------------------------
// expandOccurrences — daily
// ---------------------------------------------------------------------------

describe('recurrence: expandOccurrences — daily', () => {
  it('interval 1 produces one occurrence per day', () => {
    const anchor = localMs(2026, 0, 1, 9, 0) // Thu Jan 1, 2026, 9:00
    const rule: RecurrenceRule = { freq: 'daily', interval: 1 }
    const occs = expandOccurrences(rule, anchor, anchor, localMs(2026, 0, 6, 9, 0))
    expect(dates(occs)).toEqual([
      localMs(2026, 0, 1),
      localMs(2026, 0, 2),
      localMs(2026, 0, 3),
      localMs(2026, 0, 4),
      localMs(2026, 0, 5),
    ])
  })

  it('interval > 1 steps by N days', () => {
    const anchor = localMs(2026, 0, 1, 9, 0)
    const rule: RecurrenceRule = { freq: 'daily', interval: 3 }
    const occs = expandOccurrences(rule, anchor, anchor, localMs(2026, 0, 11, 9, 0))
    expect(dates(occs)).toEqual([localMs(2026, 0, 1), localMs(2026, 0, 4), localMs(2026, 0, 7), localMs(2026, 0, 10)])
  })

  it('"every weekday" (freq:daily, interval:1, byWeekday:[1,2,3,4,5]) skips the weekend without consuming an index', () => {
    // Jan 1 2026 is a Thursday; Jan 3/4 are Sat/Sun.
    const anchor = localMs(2026, 0, 1, 9, 0)
    const rule: RecurrenceRule = { freq: 'daily', interval: 1, byWeekday: [1, 2, 3, 4, 5] }
    const occs = expandOccurrences(rule, anchor, anchor, localMs(2026, 0, 9, 9, 0))
    expect(dates(occs)).toEqual([
      localMs(2026, 0, 1), // Thu
      localMs(2026, 0, 2), // Fri
      localMs(2026, 0, 5), // Mon (Sat/Sun skipped)
      localMs(2026, 0, 6), // Tue
      localMs(2026, 0, 7), // Wed
      localMs(2026, 0, 8), // Thu
    ])
  })

  it('"every weekday" with a count limit spends the count only on qualifying days, not the skipped weekend', () => {
    const anchor = localMs(2026, 0, 1, 9, 0)
    const rule: RecurrenceRule = { freq: 'daily', interval: 1, byWeekday: [1, 2, 3, 4, 5], count: 4 }
    const occs = expandOccurrences(rule, anchor, anchor, localMs(2026, 0, 20, 9, 0))
    // If the weekend consumed count slots, this would stop at Jan 4/5. It
    // should instead reach 4 real weekday occurrences, spanning the weekend.
    expect(dates(occs)).toEqual([
      localMs(2026, 0, 1),
      localMs(2026, 0, 2),
      localMs(2026, 0, 5),
      localMs(2026, 0, 6),
    ])
  })
})

// ---------------------------------------------------------------------------
// expandOccurrences — weekly
// ---------------------------------------------------------------------------

describe('recurrence: expandOccurrences — weekly', () => {
  it('defaults to the anchor\'s own weekday when byWeekday is unset', () => {
    const anchor = localMs(2026, 0, 5, 9, 0) // Monday
    const rule: RecurrenceRule = { freq: 'weekly', interval: 1 }
    const occs = expandOccurrences(rule, anchor, anchor, localMs(2026, 0, 20, 9, 0))
    expect(dates(occs)).toEqual([localMs(2026, 0, 5), localMs(2026, 0, 12), localMs(2026, 0, 19)])
  })

  it('explicit byWeekday produces multiple occurrences per week, in date order', () => {
    const anchor = localMs(2026, 0, 5, 9, 0) // Monday
    const rule: RecurrenceRule = { freq: 'weekly', interval: 1, byWeekday: [1, 3, 5] } // Mon/Wed/Fri
    const occs = expandOccurrences(rule, anchor, anchor, localMs(2026, 0, 17, 9, 0))
    expect(dates(occs)).toEqual([
      localMs(2026, 0, 5), // Mon
      localMs(2026, 0, 7), // Wed
      localMs(2026, 0, 9), // Fri
      localMs(2026, 0, 12), // Mon
      localMs(2026, 0, 14), // Wed
      localMs(2026, 0, 16), // Fri
    ])
  })

  it('never emits a byWeekday date before the anchor\'s own date, even in the anchor\'s own week', () => {
    const anchor = localMs(2026, 0, 6, 9, 0) // Tuesday, NOT in byWeekday below
    const rule: RecurrenceRule = { freq: 'weekly', interval: 1, byWeekday: [1, 3, 5] } // Mon/Wed/Fri
    const occs = expandOccurrences(rule, anchor, anchor, localMs(2026, 0, 10, 9, 0))
    // Monday Jan 5 is before the Tuesday anchor, so the series starts at
    // Wednesday Jan 7, not Jan 5.
    expect(dates(occs)).toEqual([localMs(2026, 0, 7), localMs(2026, 0, 9)])
  })

  it('interval > 1 (biweekly) doubles the week gap', () => {
    const anchor = localMs(2026, 0, 5, 9, 0) // Monday
    const rule: RecurrenceRule = { freq: 'weekly', interval: 2 }
    const occs = expandOccurrences(rule, anchor, anchor, localMs(2026, 1, 3, 9, 0))
    expect(dates(occs)).toEqual([localMs(2026, 0, 5), localMs(2026, 0, 19), localMs(2026, 1, 2)])
  })
})

// ---------------------------------------------------------------------------
// expandOccurrences — monthly
// ---------------------------------------------------------------------------

describe('recurrence: expandOccurrences — monthly', () => {
  it('interval 1 lands on the same day-of-month each month', () => {
    const anchor = localMs(2026, 0, 15, 9, 0)
    const rule: RecurrenceRule = { freq: 'monthly', interval: 1 }
    const occs = expandOccurrences(rule, anchor, anchor, localMs(2026, 3, 20, 9, 0))
    expect(dates(occs)).toEqual([localMs(2026, 0, 15), localMs(2026, 1, 15), localMs(2026, 2, 15), localMs(2026, 3, 15)])
  })

  it('interval > 1 (quarterly) steps by N months', () => {
    const anchor = localMs(2026, 0, 15, 9, 0)
    const rule: RecurrenceRule = { freq: 'monthly', interval: 3 }
    const occs = expandOccurrences(rule, anchor, anchor, localMs(2026, 7, 1, 9, 0))
    expect(dates(occs)).toEqual([localMs(2026, 0, 15), localMs(2026, 3, 15), localMs(2026, 6, 15)])
  })

  it('ignores byWeekday entirely (not meaningful for monthly)', () => {
    const anchor = localMs(2026, 0, 15, 9, 0)
    const withByWeekday: RecurrenceRule = { freq: 'monthly', interval: 1, byWeekday: [1, 2, 3] }
    const without: RecurrenceRule = { freq: 'monthly', interval: 1 }
    const range: [number, number] = [anchor, localMs(2026, 4, 1, 9, 0)]
    expect(dates(expandOccurrences(withByWeekday, anchor, ...range))).toEqual(
      dates(expandOccurrences(without, anchor, ...range))
    )
  })
})

// ---------------------------------------------------------------------------
// expandOccurrences — end conditions: never / count / until
// ---------------------------------------------------------------------------

describe('recurrence: expandOccurrences — end conditions', () => {
  it('never (no count/until) is bounded only by the requested range', () => {
    const anchor = localMs(2026, 0, 1, 9, 0)
    const rule: RecurrenceRule = { freq: 'daily', interval: 1 }
    const occs = expandOccurrences(rule, anchor, anchor, localMs(2026, 0, 11, 9, 0))
    expect(occs).toHaveLength(10)
  })

  it('count stops the series after exactly N occurrences regardless of how wide the range is', () => {
    const anchor = localMs(2026, 0, 1, 9, 0)
    const rule: RecurrenceRule = { freq: 'daily', interval: 1, count: 3 }
    const occs = expandOccurrences(rule, anchor, anchor, localMs(2026, 2, 1, 9, 0)) // a 2-month-wide range
    expect(dates(occs)).toEqual([localMs(2026, 0, 1), localMs(2026, 0, 2), localMs(2026, 0, 3)])
  })

  it('until is inclusive of an occurrence landing exactly on the boundary instant', () => {
    const anchor = localMs(2026, 0, 1, 9, 0)
    const until = localMs(2026, 0, 3, 9, 0) // exactly the 3rd occurrence's instant
    const rule: RecurrenceRule = { freq: 'daily', interval: 1, until }
    const occs = expandOccurrences(rule, anchor, anchor, localMs(2026, 0, 10, 9, 0))
    expect(dates(occs)).toEqual([localMs(2026, 0, 1), localMs(2026, 0, 2), localMs(2026, 0, 3)])
  })

  it('until excludes an occurrence strictly after the boundary instant', () => {
    const anchor = localMs(2026, 0, 1, 9, 0)
    const until = localMs(2026, 0, 3, 9, 0) - 1 // one ms before the 3rd occurrence
    const rule: RecurrenceRule = { freq: 'daily', interval: 1, until }
    const occs = expandOccurrences(rule, anchor, anchor, localMs(2026, 0, 10, 9, 0))
    expect(dates(occs)).toEqual([localMs(2026, 0, 1), localMs(2026, 0, 2)])
  })
})

// ---------------------------------------------------------------------------
// expandOccurrences — range window [rangeStart, rangeEnd)
// ---------------------------------------------------------------------------

describe('recurrence: expandOccurrences — range window', () => {
  it('rangeStart is inclusive and rangeEnd is exclusive', () => {
    const anchor = localMs(2026, 0, 1, 9, 0)
    const rule: RecurrenceRule = { freq: 'daily', interval: 1 }
    const occs = expandOccurrences(rule, anchor, localMs(2026, 0, 2, 9, 0), localMs(2026, 0, 4, 9, 0))
    // Jan 1 excluded (before rangeStart), Jan 4 excluded (== rangeEnd), Jan 2/3 included.
    expect(dates(occs)).toEqual([localMs(2026, 0, 2), localMs(2026, 0, 3)])
  })

  it('an empty/inverted range returns nothing', () => {
    const anchor = localMs(2026, 0, 1, 9, 0)
    const rule: RecurrenceRule = { freq: 'daily', interval: 1 }
    expect(expandOccurrences(rule, anchor, anchor, anchor)).toEqual([])
    expect(expandOccurrences(rule, anchor, localMs(2026, 0, 5), localMs(2026, 0, 1))).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// FR-15 field: exceptions — skip one occurrence without breaking the series
// ---------------------------------------------------------------------------

describe('recurrence: exceptions (FR-15)', () => {
  it('skips exactly the excepted date and leaves the rest of the series untouched', () => {
    const anchor = localMs(2026, 0, 1, 9, 0)
    const rule: RecurrenceRule = { freq: 'daily', interval: 1, exceptions: [localMs(2026, 0, 3)] }
    const occs = expandOccurrences(rule, anchor, anchor, localMs(2026, 0, 6, 9, 0))
    expect(dates(occs)).toEqual([localMs(2026, 0, 1), localMs(2026, 0, 2), localMs(2026, 0, 4), localMs(2026, 0, 5)])
  })

  it('an excepted date still consumes a count slot (checked against the raw series, not backfilled)', () => {
    const anchor = localMs(2026, 0, 1, 9, 0)
    const rule: RecurrenceRule = {
      freq: 'daily',
      interval: 1,
      count: 5,
      exceptions: [localMs(2026, 0, 3)], // the 3rd raw occurrence
    }
    // A wide range: if exceptions did NOT consume a count slot, a 6th
    // occurrence (Jan 6) would appear to make up for the skipped one.
    const occs = expandOccurrences(rule, anchor, anchor, localMs(2026, 0, 20, 9, 0))
    expect(dates(occs)).toEqual([
      localMs(2026, 0, 1),
      localMs(2026, 0, 2),
      // Jan 3 excepted, but still "spent" — no Jan 6 makeup slot.
      localMs(2026, 0, 4),
      localMs(2026, 0, 5),
    ])
    expect(occs).toHaveLength(4) // one fewer than count:5
  })

  it('nextOccurrenceOnOrAfter also skips an excepted date', () => {
    const anchor = localMs(2026, 0, 1, 9, 0)
    const rule: RecurrenceRule = { freq: 'daily', interval: 1, exceptions: [localMs(2026, 0, 2)] }
    const next = nextOccurrenceOnOrAfter(rule, anchor, anchor + 1)
    expect(next?.date).toBe(localMs(2026, 0, 3))
  })
})

// ---------------------------------------------------------------------------
// FR-15 field: startWindow — per-occurrence clock-time window
// ---------------------------------------------------------------------------

describe('recurrence: startWindow (FR-15)', () => {
  it('projects the window onto each occurrence\'s own date when set', () => {
    const anchor = localMs(2026, 0, 1, 9, 0)
    const rule: RecurrenceRule = { freq: 'daily', interval: 1, startWindow: { start: 9 * 60, end: 17 * 60 } }
    const [occ] = expandOccurrences(rule, anchor, anchor, localMs(2026, 0, 2, 9, 0))
    expect(occ.windowStart).toBeDefined()
    expect(occ.windowEnd).toBeDefined()
    expectLocalTime(occ.windowStart!, 9, 0)
    expectLocalTime(occ.windowEnd!, 17, 0)
    // Same calendar date as the occurrence itself.
    expect(new Date(occ.windowStart!).toDateString()).toBe(new Date(occ.date).toDateString())
  })

  it('is undefined when the rule has no startWindow', () => {
    const anchor = localMs(2026, 0, 1, 9, 0)
    const rule: RecurrenceRule = { freq: 'daily', interval: 1 }
    const [occ] = expandOccurrences(rule, anchor, anchor, localMs(2026, 0, 2, 9, 0))
    expect(occ.windowStart).toBeUndefined()
    expect(occ.windowEnd).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// Monthly edge cases: 31st in a 30-day month, and Feb 29
// ---------------------------------------------------------------------------

describe('recurrence: monthly edge cases', () => {
  it('the 31st clamps into short months without permanently truncating later ones (Jan31 -> Feb28 -> Mar31 -> Apr30 -> May31)', () => {
    const anchor = localMs(2026, 0, 31, 9, 0) // Jan 31, 2026 (not a leap year)
    const rule: RecurrenceRule = { freq: 'monthly', interval: 1 }

    const feb = nextOccurrenceOnOrAfter(rule, anchor, anchor + 1)
    expect(feb?.date).toBe(localMs(2026, 1, 28)) // Feb has 28 days in 2026

    const mar = nextOccurrenceOnOrAfter(rule, anchor, localMs(2026, 2, 1))
    expect(mar?.date).toBe(localMs(2026, 2, 31)) // back to 31 - not stuck at 28

    const apr = nextOccurrenceOnOrAfter(rule, anchor, localMs(2026, 3, 1))
    expect(apr?.date).toBe(localMs(2026, 3, 30)) // April has 30 days

    const may = nextOccurrenceOnOrAfter(rule, anchor, localMs(2026, 4, 1))
    expect(may?.date).toBe(localMs(2026, 4, 31))
  })

  it('Feb 29 (leap) clamps to Feb 28 on a non-leap year, then back to Feb 29 on the next leap year', () => {
    const anchor = localMs(2028, 1, 29, 9, 0) // Feb 29, 2028 (leap)
    const rule: RecurrenceRule = { freq: 'monthly', interval: 1 }

    const plusOneMonth = nextOccurrenceOnOrAfter(rule, anchor, anchor + 1)
    expect(plusOneMonth?.date).toBe(localMs(2028, 2, 29)) // Mar 29, 2028

    const plusOneYear = nextOccurrenceOnOrAfter(rule, anchor, localMs(2029, 1, 1))
    expect(plusOneYear?.date).toBe(localMs(2029, 1, 28)) // 2029 is not a leap year

    const plusFourYears = nextOccurrenceOnOrAfter(rule, anchor, localMs(2032, 1, 1))
    expect(plusFourYears?.date).toBe(localMs(2032, 1, 29)) // 2032 is a leap year again
  })
})

// ---------------------------------------------------------------------------
// DST boundaries — America/New_York, both directions (doc `09` "wall-clock-local")
// ---------------------------------------------------------------------------

describe('recurrence: DST boundaries', () => {
  it('spring forward (Mar 8 2026): a daily 9am recurrence stays at 9am local, and the crossed day is 1 hour short', () => {
    const anchor = localMs(2026, 2, 7, 9, 0) // Sat Mar 7, 9:00 (day before the transition)
    const rule: RecurrenceRule = { freq: 'daily', interval: 1 }
    const occs = expandOccurrences(rule, anchor, anchor, localMs(2026, 2, 11, 9, 0))
    expect(occs).toHaveLength(4) // Mar 7, 8, 9, 10

    occs.forEach((o) => expectLocalTime(o.at, 9, 0))

    // Mar 7 09:00 -> Mar 8 09:00 straddles the 02:00->03:00 jump, so only 23h
    // of real time elapses even though the wall clock reads "+1 day, same
    // time" - proof the recurrence steps by calendar day (`setDate`), not by
    // adding a fixed 24h in milliseconds.
    expect(occs[1].at - occs[0].at).toBe(23 * MS_PER_HOUR)
    // Normal days on either side of the transition.
    expect(occs[2].at - occs[1].at).toBe(24 * MS_PER_HOUR)
    expect(occs[3].at - occs[2].at).toBe(24 * MS_PER_HOUR)
  })

  it('fall back (Nov 1 2026): a daily 9am recurrence stays at 9am local, and the crossed day is 1 hour long', () => {
    const anchor = localMs(2026, 9, 31, 9, 0) // Sat Oct 31, 9:00 (day before the transition)
    const rule: RecurrenceRule = { freq: 'daily', interval: 1 }
    const occs = expandOccurrences(rule, anchor, anchor, localMs(2026, 10, 3, 9, 0))
    expect(occs).toHaveLength(3) // Oct 31, Nov 1, Nov 2

    occs.forEach((o) => expectLocalTime(o.at, 9, 0))

    expect(occs[1].at - occs[0].at).toBe(25 * MS_PER_HOUR) // straddles the 02:00->01:00 fall-back
    expect(occs[2].at - occs[1].at).toBe(24 * MS_PER_HOUR)
  })

  it('a weekly recurrence also keeps its wall-clock time crossing spring-forward mid-week', () => {
    const anchor = localMs(2026, 1, 22, 9, 0) // Sunday Feb 22, 2026, 9:00
    const rule: RecurrenceRule = { freq: 'weekly', interval: 1 }
    const occs = expandOccurrences(rule, anchor, anchor, localMs(2026, 2, 16, 9, 0))
    expect(dates(occs)).toEqual([localMs(2026, 1, 22), localMs(2026, 2, 1), localMs(2026, 2, 8), localMs(2026, 2, 15)])
    occs.forEach((o) => expectLocalTime(o.at, 9, 0))
  })

  it('an anchor time inside the spring-forward gap (2:30am, which does not exist on Mar 8) resolves forward rather than crashing', () => {
    const anchor = localMs(2026, 2, 1, 2, 30) // March 1, 2:30am - a normal day
    const rule: RecurrenceRule = { freq: 'daily', interval: 1 }
    const occs = expandOccurrences(rule, anchor, anchor, localMs(2026, 2, 10, 0, 0))

    const mar8 = occs.find((o) => new Date(o.date).getMonth() === 2 && new Date(o.date).getDate() === 8)
    expect(mar8).toBeDefined()
    // 2:30am does not exist that day - it resolves to 3:30am (the gap width
    // added), not a thrown error and not silently dropped from the series.
    expectLocalTime(mar8!.at, 3, 30)

    // Every other day in range cleanly keeps 2:30am.
    const others = occs.filter((o) => o !== mar8)
    expect(others.length).toBeGreaterThan(0)
    others.forEach((o) => expectLocalTime(o.at, 2, 30))

    // Strictly increasing throughout - the gap never produces a duplicate or backward step.
    for (let i = 1; i < occs.length; i++) expect(occs[i].at).toBeGreaterThan(occs[i - 1].at)
  })

  it('an anchor time inside the fall-back ambiguous hour (1:30am, which occurs twice on Nov 1) still reads back consistently', () => {
    const anchor = localMs(2026, 9, 29, 1, 30) // Oct 29, 1:30am
    const rule: RecurrenceRule = { freq: 'daily', interval: 1 }
    const occs = expandOccurrences(rule, anchor, anchor, localMs(2026, 10, 4, 0, 0))
    expect(occs.length).toBeGreaterThan(0)
    occs.forEach((o) => expectLocalTime(o.at, 1, 30))
    for (let i = 1; i < occs.length; i++) expect(occs[i].at).toBeGreaterThan(occs[i - 1].at)
  })
})

// ---------------------------------------------------------------------------
// MAX_STEPS / MAX_OCCURRENCES guards — an unbounded rule must terminate
// ---------------------------------------------------------------------------

describe('recurrence: MAX_STEPS / MAX_OCCURRENCES guards', () => {
  it('exposes its safety ceilings for direct assertions', () => {
    expect(RECURRENCE_LIMITS).toEqual({ MAX_STEPS, MAX_OCCURRENCES })
    expect(MAX_STEPS).toBe(10_000)
    expect(MAX_OCCURRENCES).toBe(1000)
  })

  it('expandOccurrences caps the returned array at MAX_OCCURRENCES even for a fully unbounded rule', () => {
    const anchor = localMs(2026, 0, 1, 9, 0)
    const rule: RecurrenceRule = { freq: 'daily', interval: 1 } // no count/until
    const occs = expandOccurrences(rule, anchor, anchor, addCalendarDays(anchor, 5000))
    expect(occs).toHaveLength(MAX_OCCURRENCES)
  })

  it('expandOccurrences never walks past MAX_STEPS candidate dates, so a range far beyond reach returns empty (not a hang)', () => {
    const anchor = localMs(2026, 0, 1, 9, 0)
    const rule: RecurrenceRule = { freq: 'daily', interval: 1 }
    const farRangeStart = addCalendarDays(anchor, MAX_STEPS + 5000)
    const occs = expandOccurrences(rule, anchor, farRangeStart, addCalendarDays(farRangeStart, 1))
    expect(occs).toEqual([])
  })

  it('nextOccurrenceOnOrAfter finds an occurrence exactly at the MAX_STEPS boundary, and returns null just beyond it', () => {
    const anchor = localMs(2026, 0, 1, 0, 0) // local midnight anchor - avoids time-of-day noise
    const rule: RecurrenceRule = { freq: 'daily', interval: 1 } // unbounded
    const lastReachable = addCalendarDays(anchor, MAX_STEPS - 1) // step = MAX_STEPS - 1 is the final generated candidate
    const found = nextOccurrenceOnOrAfter(rule, anchor, lastReachable)
    expect(found?.date).toBe(lastReachable)

    const justBeyond = addCalendarDays(anchor, MAX_STEPS)
    expect(nextOccurrenceOnOrAfter(rule, anchor, justBeyond)).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// nextOccurrenceOnOrAfter
// ---------------------------------------------------------------------------

describe('recurrence: nextOccurrenceOnOrAfter', () => {
  const anchor = localMs(2026, 0, 1, 9, 0)
  const rule: RecurrenceRule = { freq: 'daily', interval: 1 }

  it('is inclusive: minInstant exactly equal to an occurrence returns that occurrence', () => {
    const target = localMs(2026, 0, 5, 9, 0)
    expect(nextOccurrenceOnOrAfter(rule, anchor, target)?.at).toBe(target)
  })

  it('returns the next occurrence when minInstant falls between two occurrences', () => {
    const between = localMs(2026, 0, 5, 9, 0) + 1
    expect(nextOccurrenceOnOrAfter(rule, anchor, between)?.date).toBe(localMs(2026, 0, 6))
  })

  it('respects count: returns null once the series is exhausted', () => {
    const capped: RecurrenceRule = { ...rule, count: 3 }
    expect(nextOccurrenceOnOrAfter(capped, anchor, localMs(2026, 0, 3, 9, 0))).not.toBeNull()
    expect(nextOccurrenceOnOrAfter(capped, anchor, localMs(2026, 0, 4, 9, 0))).toBeNull()
  })

  it('respects until: returns null once the series is exhausted', () => {
    const untilRule: RecurrenceRule = { ...rule, until: localMs(2026, 0, 3, 9, 0) }
    expect(nextOccurrenceOnOrAfter(untilRule, anchor, localMs(2026, 0, 3, 9, 0))).not.toBeNull()
    expect(nextOccurrenceOnOrAfter(untilRule, anchor, localMs(2026, 0, 4, 9, 0))).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// nextOccurrenceFromCompletion (FR-15 "from-completion" anchor mode)
// ---------------------------------------------------------------------------

describe('recurrence: nextOccurrenceFromCompletion', () => {
  it('daily: the gap is measured from the completion instant, not any fixed calendar slot', () => {
    const completedAt = localMs(2026, 0, 1, 14, 30) // an odd, arbitrary completion time
    const rule: RecurrenceRule = { freq: 'daily', interval: 3, anchor: 'completion' }
    expect(nextOccurrenceFromCompletion(rule, completedAt)).toBe(localMs(2026, 0, 4, 14, 30))
  })

  it('weekly: steps by interval * 7 days', () => {
    const completedAt = localMs(2026, 0, 1, 14, 30)
    const rule: RecurrenceRule = { freq: 'weekly', interval: 1, anchor: 'completion' }
    expect(nextOccurrenceFromCompletion(rule, completedAt)).toBe(localMs(2026, 0, 8, 14, 30))
  })

  it('monthly: steps by calendar month, clamped like the schedule-anchored path', () => {
    const completedAt = localMs(2026, 0, 31, 14, 30)
    const rule: RecurrenceRule = { freq: 'monthly', interval: 1, anchor: 'completion' }
    expect(nextOccurrenceFromCompletion(rule, completedAt)).toBe(localMs(2026, 1, 28, 14, 30))
  })

  it('ignores byWeekday entirely - the next date is completedAt + interval regardless of what weekday it lands on', () => {
    const completedAt = localMs(2026, 0, 3, 9, 0) // Saturday
    const rule: RecurrenceRule = { freq: 'daily', interval: 1, anchor: 'completion', byWeekday: [1, 2, 3, 4, 5] }
    // Would be Sunday - NOT skipped, because from-completion mode ignores byWeekday.
    expect(nextOccurrenceFromCompletion(rule, completedAt)).toBe(localMs(2026, 0, 4, 9, 0))
  })

  it('returns null once until is exceeded', () => {
    const completedAt = localMs(2026, 0, 30, 9, 0)
    const rule: RecurrenceRule = {
      freq: 'daily',
      interval: 3,
      anchor: 'completion',
      until: localMs(2026, 1, 1, 9, 0),
    }
    expect(nextOccurrenceFromCompletion(rule, completedAt)).toBeNull()
  })

  it('returns null when count <= 1 (the just-completed occurrence was the last one)', () => {
    const completedAt = localMs(2026, 0, 1, 9, 0)
    expect(
      nextOccurrenceFromCompletion({ freq: 'daily', interval: 1, anchor: 'completion', count: 1 }, completedAt)
    ).toBeNull()
    expect(
      nextOccurrenceFromCompletion({ freq: 'daily', interval: 1, anchor: 'completion', count: 0 }, completedAt)
    ).toBeNull()
    expect(
      nextOccurrenceFromCompletion({ freq: 'daily', interval: 1, anchor: 'completion', count: 2 }, completedAt)
    ).not.toBeNull()
  })
})

// ---------------------------------------------------------------------------
// rollToNextOccurrence (doc `03` §2.9 genuine-completion rollover)
// ---------------------------------------------------------------------------

describe('recurrence: rollToNextOccurrence', () => {
  it('a non-recurring task never rolls (returns null)', () => {
    const task = makeTask({ status: 'done', due: localMs(2026, 0, 1, 9, 0) })
    expect(rollToNextOccurrence(task, localMs(2026, 0, 1, 9, 5))).toBeNull()
  })

  it('advances due, resets status/progress/subtasks/firstMove, and decrements count', () => {
    const due = localMs(2026, 0, 1, 9, 0)
    const now = localMs(2026, 0, 1, 9, 5) // completed just after due
    const task = makeTask({
      due,
      status: 'done',
      completedAt: now,
      progressMin: 45,
      recurrence: { freq: 'daily', interval: 1, count: 5 },
      subtasks: [
        { id: 's1', title: 'Step 1', estimatedMin: 20, completedAt: now },
        { id: 's2', title: 'Step 2', estimatedMin: 25, completedAt: now },
      ],
      firstMove: { id: 'fm1', text: 'Open the doc', done: true },
    })

    const next = rollToNextOccurrence(task, now)
    expect(next).not.toBeNull()
    expect(next!.due).toBe(localMs(2026, 0, 2, 9, 0))
    expect(next!.status).toBe('todo')
    expect(next!.completedAt).toBeUndefined()
    expect(next!.progressMin).toBe(0)
    expect(next!.subtasks.every((s) => s.completedAt === undefined)).toBe(true)
    expect(next!.subtasks).toHaveLength(2) // template preserved, just unchecked
    expect(next!.firstMove?.done).toBe(false)
    expect(next!.recurrence?.count).toBe(4)
    expect(next!.updatedAt).toBe(now)
  })

  it('returns null once the series has ended (count exhausted)', () => {
    const due = localMs(2026, 0, 1, 9, 0)
    const now = localMs(2026, 0, 1, 9, 5)
    const task = makeTask({
      due,
      status: 'done',
      recurrence: { freq: 'daily', interval: 1, count: 1 }, // this was the last occurrence
    })
    expect(rollToNextOccurrence(task, now)).toBeNull()
  })

  it('returns null once the series has ended (until exceeded)', () => {
    const due = localMs(2026, 0, 1, 9, 0)
    const now = localMs(2026, 0, 1, 9, 5)
    const task = makeTask({
      due,
      status: 'done',
      recurrence: { freq: 'daily', interval: 1, until: localMs(2026, 0, 1, 12, 0) }, // next occurrence (Jan 2) exceeds this
    })
    expect(rollToNextOccurrence(task, now)).toBeNull()
  })

  it('a task with no firstMove keeps firstMove undefined rather than fabricating one', () => {
    const due = localMs(2026, 0, 1, 9, 0)
    const now = localMs(2026, 0, 1, 9, 5)
    const task = makeTask({ due, status: 'done', recurrence: { freq: 'daily', interval: 1 } })
    expect(task.firstMove).toBeUndefined()
    expect(rollToNextOccurrence(task, now)!.firstMove).toBeUndefined()
  })

  it('anchor: "completion" computes the next due from `now` (the completion instant), not the stale `task.due`', () => {
    const due = localMs(2026, 0, 1, 9, 0) // the ORIGINAL scheduled due date
    const now = localMs(2026, 0, 10, 16, 45) // completed much later, and at an odd time
    const task = makeTask({
      due,
      status: 'done',
      recurrence: { freq: 'daily', interval: 3, anchor: 'completion' },
    })
    const next = rollToNextOccurrence(task, now)
    // Based on `now` + 3 days, NOT `due` + 3 days.
    expect(next!.due).toBe(localMs(2026, 0, 13, 16, 45))
  })

  it('falls back to `now` as the current-due anchor when the task has no due date at all', () => {
    const now = localMs(2026, 0, 1, 9, 0)
    const task = makeTask({ due: undefined, status: 'done', recurrence: { freq: 'daily', interval: 1 } })
    const next = rollToNextOccurrence(task, now)
    expect(next!.due).toBe(localMs(2026, 0, 2, 9, 0))
  })
})

// ---------------------------------------------------------------------------
// advanceMissedOccurrence (FR-16: drop by default, carry-forward opt-in)
// ---------------------------------------------------------------------------

describe('recurrence: advanceMissedOccurrence', () => {
  it('FR-16 default (carryForward unset) is drop: a single missed occurrence catches up to the next one on/after now', () => {
    const currentDue = localMs(2026, 0, 1, 9, 0)
    const now = localMs(2026, 0, 2, 9, 0) // exactly the next occurrence's instant
    const rule: RecurrenceRule = { freq: 'daily', interval: 1 } // carryForward unset
    const advance = advanceMissedOccurrence(rule, currentDue, now)
    expect(advance).not.toBeNull()
    expect(advance!.due).toBe(localMs(2026, 0, 2, 9, 0))
    expect(advance!.carryForward).toBe(false)
  })

  it('drop, multi-step catch-up: several missed occurrences collapse into ONE jump to now, and count decrements by every step consumed', () => {
    const currentDue = localMs(2026, 0, 1, 9, 0)
    const now = localMs(2026, 0, 4, 9, 0) // 3 days later - Jan 2 and Jan 3 were both missed in between
    const rule: RecurrenceRule = { freq: 'daily', interval: 1, count: 10, carryForward: false }
    const advance = advanceMissedOccurrence(rule, currentDue, now)
    expect(advance).not.toBeNull()
    // Caught all the way up to "now" in one jump - not stacked onto Jan 2.
    expect(advance!.due).toBe(localMs(2026, 0, 4, 9, 0))
    expect(advance!.carryForward).toBe(false)
    // 3 occurrences were consumed catching up (Jan 2, Jan 3, Jan 4), so the
    // count a caller should persist drops by 3, not by 1.
    expect(advance!.nextCount).toBe(7)
  })

  it('carry-forward advances by exactly ONE occurrence step from the missed due date, ignoring how far "now" has moved on', () => {
    const currentDue = localMs(2026, 0, 1, 9, 0)
    const now = localMs(2026, 0, 6, 9, 0) // 5 days later - carry-forward should NOT jump all the way here
    const rule: RecurrenceRule = { freq: 'daily', interval: 1, count: 10, carryForward: true }
    const advance = advanceMissedOccurrence(rule, currentDue, now)
    expect(advance).not.toBeNull()
    expect(advance!.due).toBe(localMs(2026, 0, 2, 9, 0)) // exactly one step, not caught up to `now`
    expect(advance!.carryForward).toBe(true)
    expect(advance!.nextCount).toBe(9) // decremented by exactly 1
  })

  it('drop returns null once the series is exhausted mid-catch-up', () => {
    const currentDue = localMs(2026, 0, 1, 9, 0)
    const now = localMs(2026, 0, 10, 9, 0) // would need many steps to catch up
    const rule: RecurrenceRule = { freq: 'daily', interval: 1, count: 2, carryForward: false }
    expect(advanceMissedOccurrence(rule, currentDue, now)).toBeNull()
  })

  it('carry-forward returns null when the missed occurrence was already the last one', () => {
    const currentDue = localMs(2026, 0, 1, 9, 0)
    const now = localMs(2026, 0, 2, 9, 0)
    const rule: RecurrenceRule = { freq: 'daily', interval: 1, count: 1, carryForward: true }
    expect(advanceMissedOccurrence(rule, currentDue, now)).toBeNull()
  })

  it('drop-mode terminates (returns null) rather than spinning when "now" is far beyond MAX_STEPS reach', () => {
    const currentDue = localMs(2026, 0, 1, 0, 0)
    const rule: RecurrenceRule = { freq: 'daily', interval: 1 } // unbounded
    const justBeyondReach = addCalendarDays(currentDue, MAX_STEPS + 1)
    expect(advanceMissedOccurrence(rule, currentDue, justBeyondReach)).toBeNull()
  })

  it('drop-mode succeeds exactly at the MAX_STEPS reachable boundary', () => {
    const currentDue = localMs(2026, 0, 1, 0, 0)
    const rule: RecurrenceRule = { freq: 'daily', interval: 1 }
    const exactlyAtReach = addCalendarDays(currentDue, MAX_STEPS)
    const advance = advanceMissedOccurrence(rule, currentDue, exactlyAtReach)
    expect(advance?.due).toBe(exactlyAtReach)
  })
})
