/**
 * Purchase strategy selection — the ONE place the app decides how a
 * subscription purchase is carried out (PRD FR-88, ARCH_PLAN B7).
 *
 * Mirrors `core/blocking/index.ts` exactly. Everything in the app (the
 * paywall) must call `getPurchaseStrategy()` and never construct a strategy
 * directly, so the real RevenueCat impl swaps in by flipping
 * `FEATURE_FLAGS.IAP_NATIVE` with zero call-site changes.
 *
 * On Windows, on web, and on every shared branch (`native.config.json` is
 * committed all-false, always) `FEATURE_FLAGS.IAP_NATIVE` is false, so this
 * always returns the mock.
 *
 * NOTE for test authors: this file (unlike its siblings) imports
 * `constants/featureFlags.ts`, which references the bare `__DEV__` global —
 * undefined under the plain-Node vitest harness (`vitest.config.ts` has no
 * Metro/RN runtime). Do not import `./index` from a `core/iap/__tests__/*`
 * test; import `MockPurchaseStrategy`/`NativePurchaseStrategy` directly
 * instead, exactly as `core/blocking/index.ts` is never imported by
 * `core/__tests__/*` either.
 */

import { FEATURE_FLAGS } from '@/constants/featureFlags'
import type { PurchaseStrategy } from './PurchaseStrategy'
import { mockPurchaseStrategy } from './MockPurchaseStrategy'
import { NativePurchaseStrategy } from './NativePurchaseStrategy'

/** Memoized native instance (only constructed once, the first time it's actually selected). */
let nativeStrategy: NativePurchaseStrategy | null = null

/**
 * Returns the active purchase strategy. Native only when
 * `FEATURE_FLAGS.IAP_NATIVE` is on; the mock otherwise. Never throws — safe
 * to call on any platform, including web.
 */
export function getPurchaseStrategy(): PurchaseStrategy {
  if (!FEATURE_FLAGS.IAP_NATIVE) return mockPurchaseStrategy
  try {
    nativeStrategy ??= new NativePurchaseStrategy()
    return nativeStrategy
  } catch (err) {
    console.warn('getPurchaseStrategy: native construction failed, using the mock strategy:', err)
    return mockPurchaseStrategy
  }
}

export type { IapOffering, IapPlan, PurchaseResult, PurchaseStrategy, RestoreResult } from './PurchaseStrategy'
export { MockPurchaseStrategy, mockPurchaseStrategy, PLACEHOLDER_OFFERINGS } from './MockPurchaseStrategy'
export { NativePurchaseStrategy } from './NativePurchaseStrategy'
