import { describe, expect, it } from 'vitest'
import { canUseAI, canUseLock, isAtLeast13, MIN_AGE_YEARS } from '@/core/entitlements'
import { mondayAt } from './helpers/fixtures'

const now = mondayAt(8)

type Subscription = {
  status: 'trial' | 'active' | 'lapsed'
  plan?: 'monthly' | 'annual'
  trialEndsAt?: number
}

// ---------------------------------------------------------------------------
// canUseLock / canUseAI — both are a direct pass-through to isActive, so the
// coverage here mirrors core/__tests__/subscription.test.ts's isActive
// suite: entitled on an active plan or a live trial, not entitled once
// lapsed or once the trial clock has run out.
// ---------------------------------------------------------------------------

describe('entitlements: canUseLock', () => {
  it('is true on an active plan', () => {
    expect(canUseLock({ status: 'active' }, now)).toBe(true)
  })

  it('is true during a live trial', () => {
    expect(canUseLock({ status: 'trial', trialEndsAt: now + 1 }, now)).toBe(true)
  })

  it('is false once the trial has ended', () => {
    expect(canUseLock({ status: 'trial', trialEndsAt: now - 1 }, now)).toBe(false)
  })

  it('is false once lapsed', () => {
    expect(canUseLock({ status: 'lapsed' }, now)).toBe(false)
  })
})

describe('entitlements: canUseAI', () => {
  it('is true on an active plan', () => {
    expect(canUseAI({ status: 'active' }, now)).toBe(true)
  })

  it('is true during a live trial', () => {
    expect(canUseAI({ status: 'trial', trialEndsAt: now + 1 }, now)).toBe(true)
  })

  it('is false once the trial has ended', () => {
    expect(canUseAI({ status: 'trial', trialEndsAt: now - 1 }, now)).toBe(false)
  })

  it('is false once lapsed', () => {
    expect(canUseAI({ status: 'lapsed' }, now)).toBe(false)
  })

  it('agrees with canUseLock (same underlying rule, named for two different call sites)', () => {
    const cases: Subscription[] = [
      { status: 'active' },
      { status: 'trial', trialEndsAt: now + 1 },
      { status: 'trial', trialEndsAt: now - 1 },
      { status: 'trial' },
      { status: 'lapsed' },
    ]
    for (const sub of cases) {
      expect(canUseAI(sub, now)).toBe(canUseLock(sub, now))
    }
  })
})

// ---------------------------------------------------------------------------
// isAtLeast13 — the age-gate predicate (app/onboarding/age-gate.tsx). Every
// case below is expressed as an explicit (birthYear, birthMonth, birthDay)
// against a fixed `now`, so each test is readable as "born on this date, is
// that at least 13 as of now" without leaning on relative date math that
// could hide the exact boundary being tested.
// ---------------------------------------------------------------------------

describe('entitlements: isAtLeast13', () => {
  // `now` is Monday 2026-01-05 (mondayAt fixture).

  it('is true for someone whose 13th birthday is today', () => {
    const bornExactly13YearsAgoToday = new Date(2013, 0, 5).getTime()
    expect(isAtLeast13(bornExactly13YearsAgoToday, now)).toBe(true)
  })

  it('is false for someone who turns 13 tomorrow (still 12 today), the classic off-by-one', () => {
    const turns13Tomorrow = new Date(2013, 0, 6).getTime()
    expect(isAtLeast13(turns13Tomorrow, now)).toBe(false)
  })

  it('is true for someone who turned 13 yesterday', () => {
    const turned13Yesterday = new Date(2013, 0, 4).getTime()
    expect(isAtLeast13(turned13Yesterday, now)).toBe(true)
  })

  it('is true for someone well over 13', () => {
    const bornInTwoThousand = new Date(2000, 0, 5).getTime()
    expect(isAtLeast13(bornInTwoThousand, now)).toBe(true)
  })

  it('is false for someone well under 13', () => {
    const bornIn2015 = new Date(2015, 6, 15).getTime()
    expect(isAtLeast13(bornIn2015, now)).toBe(false)
  })

  it('is false for a 12-year-old whose birthday later this same month has not happened yet', () => {
    // now = Jan 5, 2026. Birthday Jan 20 has not occurred yet this year.
    const birthdayLaterThisMonth = new Date(2013, 0, 20).getTime()
    expect(isAtLeast13(birthdayLaterThisMonth, now)).toBe(false)
  })

  it('correctly rolls across a year boundary when the birth month is later than now\'s month', () => {
    // Born December 2012. By Jan 5 2026 their birthday already passed in
    // December 2025, so they are 13, not 14 and not 12.
    const bornDecember2012 = new Date(2012, 11, 20).getTime()
    expect(isAtLeast13(bornDecember2012, now)).toBe(true)
  })

  it('handles a Feb 29 birth date without the JS Date leap-year rollover bug', () => {
    // Born Feb 29, 2012 (a leap year). As of "now" = Jan 5, 2026, their most
    // recent birthday (Feb 29 2024, the last leap year before 2026) makes
    // them 13, their 14th birthday has not happened yet.
    const leapDayBirth = new Date(2012, 1, 29).getTime()
    expect(isAtLeast13(leapDayBirth, now)).toBe(true)
  })

  it('a Feb 29 birth date is still under 13 before its equivalent birthday has occurred', () => {
    // Born Feb 29, 2016. Evaluated at Jan 5, 2029: their 13th birthday
    // (Feb 2029) has not happened yet, so they are still 12.
    const stillUnder13 = new Date(2016, 1, 29).getTime()
    const laterNow = new Date(2029, 0, 5).getTime()
    expect(isAtLeast13(stillUnder13, laterNow)).toBe(false)
  })

  it('MIN_AGE_YEARS is 13', () => {
    expect(MIN_AGE_YEARS).toBe(13)
  })
})
