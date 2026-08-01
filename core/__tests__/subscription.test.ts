import { describe, expect, it } from 'vitest'
import {
  TRIAL_DURATION_DAYS,
  isActive,
  isPaywallDismissible,
  startTrial,
  trialDaysLeft,
} from '@/core/subscription'
import { mondayAt, MS_PER_DAY } from './helpers/fixtures'

const now = mondayAt(8)

type Subscription = {
  status: 'trial' | 'active' | 'lapsed'
  plan?: 'monthly' | 'annual'
  trialEndsAt?: number
}

describe('subscription: startTrial', () => {
  it('returns a trial state ending TRIAL_DURATION_DAYS from now, plan unset', () => {
    const sub = startTrial(now)
    expect(sub.status).toBe('trial')
    expect(sub.plan).toBeUndefined()
    expect(sub.trialEndsAt).toBe(now + TRIAL_DURATION_DAYS * MS_PER_DAY)
  })
})

describe('subscription: trialDaysLeft', () => {
  it('is 0 for a non-trial status regardless of trialEndsAt', () => {
    expect(trialDaysLeft({ status: 'active', trialEndsAt: now + MS_PER_DAY }, now)).toBe(0)
    expect(trialDaysLeft({ status: 'lapsed', trialEndsAt: now + MS_PER_DAY }, now)).toBe(0)
  })

  it('is 0 for a trial with no trialEndsAt stamped yet', () => {
    expect(trialDaysLeft({ status: 'trial' }, now)).toBe(0)
  })

  it('is 0 once trialEndsAt has passed, never negative', () => {
    expect(trialDaysLeft({ status: 'trial', trialEndsAt: now - 1 }, now)).toBe(0)
    expect(trialDaysLeft({ status: 'trial', trialEndsAt: now - 10 * MS_PER_DAY }, now)).toBe(0)
  })

  it('rounds a partial final day UP to 1, not down to 0', () => {
    const threeHoursLeft = now + 3 * 60 * 60 * 1000
    expect(trialDaysLeft({ status: 'trial', trialEndsAt: threeHoursLeft }, now)).toBe(1)
  })

  it('reports whole days remaining for a fresh 14-day trial', () => {
    const sub = startTrial(now)
    expect(trialDaysLeft(sub, now)).toBe(14)
  })
})

describe('subscription: isActive', () => {
  it('an active plan is always entitled', () => {
    expect(isActive({ status: 'active' }, now)).toBe(true)
  })

  it('a trial with time left is entitled', () => {
    expect(isActive({ status: 'trial', trialEndsAt: now + MS_PER_DAY }, now)).toBe(true)
  })

  it('a trial exactly at or past trialEndsAt is not entitled', () => {
    expect(isActive({ status: 'trial', trialEndsAt: now }, now)).toBe(false)
    expect(isActive({ status: 'trial', trialEndsAt: now - 1 }, now)).toBe(false)
  })

  it('a trial with no trialEndsAt stamped is not entitled (never indefinite free access)', () => {
    expect(isActive({ status: 'trial' }, now)).toBe(false)
  })

  it('lapsed is never entitled', () => {
    expect(isActive({ status: 'lapsed' }, now)).toBe(false)
    expect(isActive({ status: 'lapsed', trialEndsAt: now + MS_PER_DAY }, now)).toBe(false)
  })
})

describe('subscription: isPaywallDismissible (FR-88 gate)', () => {
  // The exact cases that matter for app/paywall.tsx's non-dismissible state
  // (no header X, gestureEnabled: false, BackHandler swallowed): a lapsed
  // subscriber or an expired trial must never be dismissible, or the
  // routing gate in app/_layout.tsx is pure theater.
  const cases: [string, Subscription, boolean][] = [
    ['an active plan', { status: 'active' }, true],
    ['a trial with time left', { status: 'trial', trialEndsAt: now + MS_PER_DAY }, true],
    ['a trial that has ended', { status: 'trial', trialEndsAt: now - 1 }, false],
    ['a brand-new trial with no trialEndsAt yet', { status: 'trial' }, false],
    ['a lapsed subscription', { status: 'lapsed' }, false],
  ]

  it.each(cases)('%s -> dismissible = %s', (_label, subscription, expected) => {
    expect(isPaywallDismissible(subscription, now)).toBe(expected)
  })

  it('always agrees with isActive (same rule, named for the paywall call site)', () => {
    for (const [, subscription] of cases) {
      expect(isPaywallDismissible(subscription, now)).toBe(isActive(subscription, now))
    }
  })
})
