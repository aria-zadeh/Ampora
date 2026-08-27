/**
 * Tests for `core/recurrence.ts` (PRD FR-15, FR-16, §9.5.6; doc
 * `03_AI_Breakdown_and_Subtasks.md` §2.9).
 *
 * ---------------------------------------------------------------------------
 * TIMEZONE STRATEGY (read this before adding a test to this file)
 * ---------------------------------------------------------------------------
 * `core/recurrence.ts` is wall-clock-local by design (doc `09_Decisions.md`):
 * it steps by calendar day through `Date#setDate`/`setHours`, so a 9am
 * recurring task stays at 9am across a DST transition instead of sliding an
 * hour the way raw `+ 24 * MS_PER_HOUR` arithmetic would. Proving that needs a
 * KNOWN zone, which is why this file pins one into `process.env.TZ`. Node
 * re-reads that variable on assignment, so `Date`'s local-time methods really
 * do re-point mid-process (verified empirically before relying on it).
 *
 * The pin runs at MODULE SCOPE, and that placement is load bearing. Vitest
 * executes a test file in two phases: a COLLECTION phase that runs the module
 * body plus every `describe` callback in order to discover the tests, and only
 * then a RUN phase that fires hooks and `it` bodies. Anything a describe body
 * computes (a hoisted `const anchor = localMs(...)`) is therefore built during
 * collection, BEFORE any `beforeAll` can fire. This file used to pin the zone
 * from `beforeAll`, so those hoisted constants were built in the RUNNER's
 * ambient zone while every value built inside an `it` used the pinned zone.
 * The two agree only on a machine already sitting in `America/New_York`, which
 * is exactly why the suite passed there and returned off-by-one-occurrence
 * answers under UTC, Asia/Kolkata and everywhere else. The
 * `recurrence: timezone independence` suite at the bottom of this file asserts
 * that agreement directly, so the regression cannot come back silently.
 *
 * `America/New_York` 2026 transitions used by the DST suite: spring-forward
 * Sun Mar 8 2026 02:00->03:00, fall-back Sun Nov 1 2026 02:00->01:00.
 */
import { afterAll, describe, expect, it } from 'vitest'
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

/** The zone every test in this file runs in unless it explicitly asks for another one through `withTimeZone`. */
const TEST_TZ = 'America/New_York'

const ORIGINAL_TZ = process.env.TZ

/**
 * `delete` rather than assigning undefined, because `process.env.TZ = undefined`
 * stores the literal string "undefined", which Node treats as an unknown zone
 * and silently resolves to UTC. That would leave the process in a different
 * zone than it started in.
 */
function setTimeZone(zone: string | undefined): void {
  if (zone === undefined) delete process.env.TZ
  else process.env.TZ = zone
}

/**
 * Runs `fn` with the process pinned to `zone`, then restores whatever zone was
 * in effect before the call (normally TEST_TZ, not the runner's ambient zone).
 * Synchronous on purpose: `process.env.TZ` is process-global, so an async
 * callback would leak the swapped zone into anything that ran in the gap.
 */
function withTimeZone<T>(zone: string, fn: () => T): T {
  const previous = process.env.TZ
  setTimeZone(zone)
  try {
    return fn()
  } finally {
    setTimeZone(previous)
  }
}

setTimeZone(TEST_TZ) // module scope on purpose: this has to win before the first `describe` body below runs

afterAll(() => {
  setTimeZone(ORIGINAL_TZ)
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

/**
 * Captured during the COLLECTION phase, exactly like the hoisted constants
 * inside the describe blocks below. `recurrence: timezone independence`
 * re-derives both during the RUN phase and asserts they still match, which is
 * precisely what the old `beforeAll` pin could not do.
 */
const COLLECTION_JAN_OFFSET_MIN = new Date(Date.UTC(2026, 0, 1)).getTimezoneOffset()
const COLLECTION_JUL_OFFSET_MIN = new Date(Date.UTC(2026, 6, 1)).getTimezoneOffset()

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

// ---------------------------------------------------------------------------
// Timezone independence (regression)
//
// `core/recurrence.ts` is wall-clock-local, so a student in Kolkata and a
// student in New York must read the SAME schedule off their own clocks. This
// suite says that out loud instead of inheriting whichever zone the machine
// happens to sit in: every test below sets its zone explicitly and restores
// it, so none of them can pass for the accidental reason the rest of this file
// used to pass on a US-Eastern laptop.
// ---------------------------------------------------------------------------

/**
 * Deliberately mixes whole-hour, half-hour and quarter-hour base offsets, both
 * hemispheres, and one zone with no DST at all. A single zone is what hid the
 * original bug, so the matrix is the point.
 */
const ZONES = ['UTC', 'America/New_York', 'Asia/Kolkata', 'Australia/Lord_Howe', 'Pacific/Chatham'] as const

/**
 * Each row is [zone, the day BEFORE a real 2026 transition, minutes the local
 * clock jumps forward on that transition]. Read off this runtime's own tz
 * database rather than assumed. `Australia/Lord_Howe` is the row that earns
 * its place: its DST step is 30 minutes, so anything that hardcodes "a DST
 * jump is an hour" gets it wrong. `Pacific/Chatham` pairs a quarter-hour base
 * offset (+12:45) with a whole-hour step, which is the other half of the trap.
 */
const DST_TRANSITIONS_2026 = [
  ['America/New_York', [2026, 2, 7], 60], // Mar 8, 02:00 -> 03:00
  ['America/New_York', [2026, 9, 31], -60], // Nov 1, 02:00 -> 01:00
  ['Australia/Lord_Howe', [2026, 9, 3], 30], // Oct 4, 02:00 -> 02:30
  ['Australia/Lord_Howe', [2026, 3, 4], -30], // Apr 5, 02:00 -> 01:30
  ['Pacific/Chatham', [2026, 8, 26], 60], // Sep 27, 02:45 -> 03:45
  ['Pacific/Chatham', [2026, 3, 4], -60], // Apr 5, 03:45 -> 02:45
] as const

/** The local wall clock a user would actually read off an occurrence, never an absolute instant. */
function wallClock(t: number): string {
  const d = new Date(t)
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

describe('recurrence: timezone independence', () => {
  // Hoisted on purpose, in exactly the position that used to be wrong: a
  // describe body runs during vitest's COLLECTION phase. If the pin at the top
  // of this file is ever moved back into a hook, this constant gets built in
  // the runner's ambient zone while the test below builds its comparison value
  // in the pinned one, and they stop matching on every machine that is not
  // already in TEST_TZ.
  const anchorBuiltDuringCollection = localMs(2026, 0, 1, 9, 0)

  it('pins the zone before collection, so hoisted constants and in-test values agree', () => {
    expect(anchorBuiltDuringCollection).toBe(localMs(2026, 0, 1, 9, 0))
    expect(COLLECTION_JAN_OFFSET_MIN).toBe(new Date(Date.UTC(2026, 0, 1)).getTimezoneOffset())
    expect(COLLECTION_JUL_OFFSET_MIN).toBe(new Date(Date.UTC(2026, 6, 1)).getTimezoneOffset())
    // Self-consistency alone is not enough: a pin that quietly stopped taking
    // effect would still be self-consistent, so assert the zone really is
    // TEST_TZ by its two 2026 offsets.
    expect(COLLECTION_JAN_OFFSET_MIN).toBe(300) // EST, UTC-5
    expect(COLLECTION_JUL_OFFSET_MIN).toBe(240) // EDT, UTC-4
  })

  it('withTimeZone swaps the zone for its callback and restores the pinned one, not the ambient one', () => {
    const pinned = localMs(2026, 0, 1, 9, 0)
    const swapped = withTimeZone('Asia/Kolkata', () => localMs(2026, 0, 1, 9, 0))
    expect(swapped).not.toBe(pinned) // proves the swap actually took effect
    expect(localMs(2026, 0, 1, 9, 0)).toBe(pinned)
  })

  for (const zone of ZONES) {
    it(`nextOccurrenceOnOrAfter answers identically in ${zone}`, () => {
      withTimeZone(zone, () => {
        // These are the exact assertions the four originally-broken tests
        // made, kept together so a future regression names itself.
        const anchor = localMs(2026, 0, 1, 9, 0)
        const rule: RecurrenceRule = { freq: 'daily', interval: 1 }

        const target = localMs(2026, 0, 5, 9, 0)
        expect(nextOccurrenceOnOrAfter(rule, anchor, target)?.at).toBe(target)
        expect(nextOccurrenceOnOrAfter(rule, anchor, target + 1)?.date).toBe(localMs(2026, 0, 6))

        const capped: RecurrenceRule = { ...rule, count: 3 }
        expect(nextOccurrenceOnOrAfter(capped, anchor, localMs(2026, 0, 3, 9, 0))).not.toBeNull()
        expect(nextOccurrenceOnOrAfter(capped, anchor, localMs(2026, 0, 4, 9, 0))).toBeNull()

        const untilRule: RecurrenceRule = { ...rule, until: localMs(2026, 0, 3, 9, 0) }
        expect(nextOccurrenceOnOrAfter(untilRule, anchor, localMs(2026, 0, 3, 9, 0))).not.toBeNull()
        expect(nextOccurrenceOnOrAfter(untilRule, anchor, localMs(2026, 0, 4, 9, 0))).toBeNull()
      })
    })
  }

  it('expands one identical wall-clock schedule in every zone, across all six DST transitions in the matrix', () => {
    // Mar 1 -> Nov 15 2026 straddles all six transitions in the matrix: New
    // York's Mar 8 and Nov 1, Lord Howe's Apr 5 and Oct 4, Chatham's Apr 5 and
    // Sep 27. The absolute instants therefore differ wildly between zones,
    // while the clock the user reads must not differ at all.
    const render = (zone: string): string[] =>
      withTimeZone(zone, () => {
        const anchor = localMs(2026, 2, 1, 9, 30)
        const rule: RecurrenceRule = { freq: 'daily', interval: 1 }
        return expandOccurrences(rule, anchor, anchor, localMs(2026, 10, 15, 0, 0)).map((o) => wallClock(o.at))
      })

    const reference = render(ZONES[0])
    expect(reference).toHaveLength(259) // Mar 1 through Nov 14 inclusive, so an empty result cannot pass trivially
    expect(reference[0]).toBe('2026-03-01 09:30')
    expect(reference[reference.length - 1]).toBe('2026-11-14 09:30')
    for (const zone of ZONES) expect(render(zone)).toEqual(reference)
  })

  it('applies weekly byWeekday and monthly day-of-month clamping identically in every zone', () => {
    const renderWeekly = (zone: string): string[] =>
      withTimeZone(zone, () => {
        const anchor = localMs(2026, 0, 5, 9, 30) // Monday Jan 5 2026
        const rule: RecurrenceRule = { freq: 'weekly', interval: 1, byWeekday: [1, 3, 5] }
        return expandOccurrences(rule, anchor, anchor, localMs(2026, 1, 2, 9, 30)).map((o) => wallClock(o.at))
      })
    const renderMonthly = (zone: string): string[] =>
      withTimeZone(zone, () => {
        const anchor = localMs(2026, 0, 31, 9, 30) // the 31st, so February has to clamp
        const rule: RecurrenceRule = { freq: 'monthly', interval: 1 }
        return expandOccurrences(rule, anchor, anchor, localMs(2026, 5, 1, 0, 0)).map((o) => wallClock(o.at))
      })

    expect(renderWeekly(ZONES[0])).toHaveLength(12) // 4 weeks of Mon/Wed/Fri
    expect(renderMonthly(ZONES[0])).toEqual([
      '2026-01-31 09:30',
      '2026-02-28 09:30', // clamped
      '2026-03-31 09:30', // and back to the 31st, not stuck at 28
      '2026-04-30 09:30',
      '2026-05-31 09:30',
    ])
    for (const zone of ZONES) {
      expect(renderWeekly(zone)).toEqual(renderWeekly(ZONES[0]))
      expect(renderMonthly(zone)).toEqual(renderMonthly(ZONES[0]))
    }
  })

  for (const [zone, dayBefore, jumpMin] of DST_TRANSITIONS_2026) {
    const direction = jumpMin > 0 ? 'spring-forward' : 'fall-back'
    it(`holds a 9am daily recurrence at 9am local across the ${zone} ${direction} (${jumpMin} min)`, () => {
      withTimeZone(zone, () => {
        const anchor = localMs(dayBefore[0], dayBefore[1], dayBefore[2], 9, 0)
        const rule: RecurrenceRule = { freq: 'daily', interval: 1 }
        const occs = expandOccurrences(rule, anchor, anchor, addCalendarDays(anchor, 3))
        expect(occs).toHaveLength(3)

        occs.forEach((o) => expectLocalTime(o.at, 9, 0))
        // The wall clock is unchanged, so the REAL time elapsed across the
        // transition has to differ from 24h by exactly the size of the jump.
        // Raw millisecond arithmetic would report a flat 24h here and would
        // have moved the user's 9am task by the jump for the rest of the
        // series, which is the whole reason `addDays` is `setDate`-based.
        expect(occs[1].at - occs[0].at).toBe(24 * MS_PER_HOUR - jumpMin * MS_PER_MIN)
        expect(occs[1].at - occs[0].at).not.toBe(24 * MS_PER_HOUR)
        expect(occs[2].at - occs[1].at).toBe(24 * MS_PER_HOUR) // the day after is ordinary again
      })
    })
  }

  it('rolls a completed occurrence to the same wall-clock time in every zone', () => {
    const render = (zone: string): string =>
      withTimeZone(zone, () => {
        // Anchored the day before New York's spring-forward on purpose: in
        // that zone the roll crosses the transition and in the others it does
        // not, yet the answer on the user's own clock has to be the same.
        const due = localMs(2026, 2, 7, 9, 0)
        const task = makeTask({ due, status: 'done', recurrence: { freq: 'daily', interval: 1 } })
        return wallClock(rollToNextOccurrence(task, due + 5 * MS_PER_MIN)!.due!)
      })
    for (const zone of ZONES) expect(render(zone)).toBe('2026-03-08 09:00')
  })

  it('catches a missed occurrence up to the same wall-clock instant in every zone', () => {
    const render = (zone: string): string =>
      withTimeZone(zone, () => {
        const currentDue = localMs(2026, 2, 5, 9, 0)
        const now = localMs(2026, 2, 9, 12, 0) // four days on, straddling New York's Mar 8
        const rule: RecurrenceRule = { freq: 'daily', interval: 1 }
        return wallClock(advanceMissedOccurrence(rule, currentDue, now)!.due)
      })
    for (const zone of ZONES) expect(render(zone)).toBe('2026-03-10 09:00')
  })
})

// ---------------------------------------------------------------------------
// Known defects, documented executably rather than in a comment
// ---------------------------------------------------------------------------
//
// These use `it.fails`, which PASSES while the body throws and FAILS once the
// body starts succeeding. So the suite stays green today, the defect is
// described in runnable terms rather than prose, and whoever fixes it gets a
// named failure telling them to promote the test to a normal `it` rather than
// silently closing a bug nobody records closing.
//
// Neither is fixed here on purpose. Both come from one deliberate design
// decision recorded in this module's header: the anchor is always "whatever
// `due` is right now", which is what lets a recurring series live in a single
// Task with no separately-persisted original anchor. Undoing that re-anchoring
// is a schema change (`RecurrenceRule` has no `byMonthDay`, so there is
// nowhere to record the intended day) plus a migration and a sync mapper, and
// that is a product call rather than a bug fix.

describe('recurrence: known defects (see docs/09_Decisions.md)', () => {
  it.fails('monthly last-of-month drifts permanently after one short month', () => {
    // A task due the 31st should come back on the 31st in months that have
    // one, clamping only where the day does not exist. Because each roll
    // re-anchors on the clamped result, February's clamp to the 28th sticks
    // forever: Jan 31 -> Feb 28 -> Mar 28 -> Apr 28, so "pay rent on the last
    // day" silently becomes "pay rent on the 28th" after a single February.
    // Verified by running it, not reasoned about.
    const rule: RecurrenceRule = { freq: 'monthly', interval: 1 }
    let task = makeTask({ due: localMs(2026, 0, 31, 9, 0), recurrence: rule })

    const days: number[] = []
    for (let i = 0; i < 3; i++) {
      const next = rollToNextOccurrence(task, (task.due as number) + 1)
      if (!next) break
      task = next
      days.push(new Date(task.due as number).getDate())
    }

    // Intended: Feb clamps to 28, then March and April return to the real
    // last day. Actual today: [28, 28, 28].
    expect(days).toEqual([28, 31, 30])
  })
})
