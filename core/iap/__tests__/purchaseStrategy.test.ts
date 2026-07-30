/**
 * PurchaseStrategy seam tests (PRD FR-88, ARCH_PLAN B7).
 *
 * Two things are asserted here, matching the two halves of the seam:
 *
 *   1. MockPurchaseStrategy reproduces exactly the behaviour `app/paywall.tsx`
 *      had before this seam existed — no transaction, always "succeeds",
 *      nothing to restore, no external entitlement. This is what keeps the
 *      Windows/web build unchanged.
 *
 *   2. NativePurchaseStrategy's fail-safe contract holds when
 *      `react-native-purchases` cannot be resolved. Under this plain-Node
 *      vitest harness the package genuinely is not installed (it is
 *      deliberately absent from package.json — see
 *      `native/package-additions.json`), so `require('react-native-purchases')`
 *      throws a real MODULE_NOT_FOUND here, exercising the exact same
 *      fallback branch Metro's resolver alias produces in the app at runtime
 *      when the native flag is off. Every method must still resolve a safe
 *      value, never throw — an unknown entitlement must never lock a paying
 *      user out.
 *
 * Deliberately does NOT import `./index` (`getPurchaseStrategy`): that file
 * imports `constants/featureFlags.ts`, which references the bare `__DEV__`
 * global that Metro/Babel inlines but plain Node never defines. See
 * `core/iap/index.ts`'s own docstring note for test authors.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  MockPurchaseStrategy,
  PLACEHOLDER_OFFERINGS,
  mockPurchaseStrategy,
} from '@/core/iap/MockPurchaseStrategy'
import {
  NativePurchaseStrategy,
  __resetPurchasesModuleCacheForTests,
  inferPlanFromProductIdentifier,
  isUserCancelled,
  packageTypeToPlan,
} from '@/core/iap/NativePurchaseStrategy'

describe('MockPurchaseStrategy (today\'s ship-now behaviour)', () => {
  it('is tagged "mock"', () => {
    expect(mockPurchaseStrategy.kind).toBe('mock')
  })

  it('init() resolves without doing anything observable', async () => {
    await expect(mockPurchaseStrategy.init()).resolves.toBeUndefined()
  })

  it('getOfferings() returns the placeholder monthly + annual pair', async () => {
    const offerings = await mockPurchaseStrategy.getOfferings()
    expect(offerings).toBe(PLACEHOLDER_OFFERINGS)
    expect(offerings.find((o) => o.plan === 'monthly')?.localizedPrice).toBe('$6.99')
    const annual = offerings.find((o) => o.plan === 'annual')
    expect(annual?.localizedPrice).toBe('$74.99')
    expect(annual?.priceNote).toMatch(/save/i)
  })

  it('purchase() always "succeeds" with no real transaction, for both plans', async () => {
    await expect(mockPurchaseStrategy.purchase('monthly')).resolves.toEqual({ ok: true })
    await expect(mockPurchaseStrategy.purchase('annual')).resolves.toEqual({ ok: true })
  })

  it('restore() honestly reports nothing to restore (no real purchase was ever made)', async () => {
    await expect(mockPurchaseStrategy.restore()).resolves.toEqual({ ok: false })
  })

  it('getEntitlement() defers to local settings state (never asserts an external entitlement)', async () => {
    await expect(mockPurchaseStrategy.getEntitlement()).resolves.toBeNull()
  })

  it('a fresh instance behaves identically to the shared singleton (the strategy is stateless)', async () => {
    const fresh = new MockPurchaseStrategy()
    expect(fresh.kind).toBe('mock')
    await expect(fresh.getOfferings()).resolves.toEqual(PLACEHOLDER_OFFERINGS)
  })
})

describe('NativePurchaseStrategy pure helpers', () => {
  it('packageTypeToPlan maps MONTHLY/ANNUAL only; everything else is not an Ampora plan', () => {
    expect(packageTypeToPlan('MONTHLY')).toBe('monthly')
    expect(packageTypeToPlan('ANNUAL')).toBe('annual')
    expect(packageTypeToPlan('WEEKLY')).toBeNull()
    expect(packageTypeToPlan('LIFETIME')).toBeNull()
    expect(packageTypeToPlan('UNKNOWN')).toBeNull()
    expect(packageTypeToPlan('CUSTOM')).toBeNull()
  })

  it('inferPlanFromProductIdentifier is a best-effort display hint only', () => {
    expect(inferPlanFromProductIdentifier('ampora_annual_v1')).toBe('annual')
    expect(inferPlanFromProductIdentifier('com.ampora.yearly')).toBe('annual')
    expect(inferPlanFromProductIdentifier('ampora_monthly_v1')).toBe('monthly')
    expect(inferPlanFromProductIdentifier('some_unrelated_sku')).toBeUndefined()
  })

  it('isUserCancelled recognizes the modern error code and the deprecated boolean, and is safe on garbage input', () => {
    expect(isUserCancelled({ code: 'PURCHASE_CANCELLED_ERROR' })).toBe(true)
    expect(isUserCancelled({ userCancelled: true })).toBe(true)
    expect(isUserCancelled({ code: 'STORE_PROBLEM_ERROR', userCancelled: false })).toBe(false)
    expect(isUserCancelled(null)).toBe(false)
    expect(isUserCancelled(undefined)).toBe(false)
    expect(isUserCancelled('a plain string error')).toBe(false)
    expect(isUserCancelled(new Error('boom'))).toBe(false)
  })
})

describe('NativePurchaseStrategy fail-safe contract (module genuinely absent under plain Node)', () => {
  beforeEach(() => {
    __resetPurchasesModuleCacheForTests()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  it('is tagged "native"', () => {
    expect(new NativePurchaseStrategy().kind).toBe('native')
  })

  it('init() never throws even with no module and no API key', async () => {
    await expect(new NativePurchaseStrategy().init()).resolves.toBeUndefined()
  })

  it('getOfferings() resolves an empty array rather than throwing', async () => {
    await expect(new NativePurchaseStrategy().getOfferings()).resolves.toEqual([])
  })

  it('purchase() resolves a failure result rather than throwing or crashing', async () => {
    await expect(new NativePurchaseStrategy().purchase('monthly')).resolves.toEqual({
      ok: false,
      reason: 'failed',
    })
  })

  it('restore() resolves { ok: false } rather than throwing', async () => {
    await expect(new NativePurchaseStrategy().restore()).resolves.toEqual({ ok: false })
  })

  it('getEntitlement() resolves null rather than throwing — an unknown state must never lock a paying user out', async () => {
    await expect(new NativePurchaseStrategy().getEntitlement()).resolves.toBeNull()
  })
})
