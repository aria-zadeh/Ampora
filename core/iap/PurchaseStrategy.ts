/**
 * PurchaseStrategy — the seam between Ampora's subscription/paywall UI and
 * however a purchase is actually carried out (PRD FR-88, ARCH_PLAN B7).
 *
 * Mirrors `core/blocking/BlockingStrategy.ts`'s shape and philosophy exactly:
 * app code (`app/paywall.tsx`) talks ONLY to this interface, obtained via
 * `getPurchaseStrategy()` (`./index.ts`), never to `react-native-purchases`
 * directly. That is what lets the real RevenueCat implementation swap in by
 * flipping `FEATURE_FLAGS.IAP_NATIVE` with zero call-site changes:
 *
 *   - MockPurchaseStrategy: today's ship-now behaviour. No transaction, no
 *     receipt, no store round-trip. Active on every Windows/web checkout and
 *     on every shared branch (`native.config.json` is committed all-false).
 *   - NativePurchaseStrategy: real Apple/Google billing via RevenueCat,
 *     isolated behind `FEATURE_FLAGS.IAP_NATIVE`
 *     (`core/iap/NativePurchaseStrategy.ts`).
 *
 * Portability note: this file is pure TS (types only, one `import type`). No
 * react-native / expo / RevenueCat imports, so it is safe to import anywhere,
 * including under the plain-Node vitest harness (`vitest.config.ts`).
 */

import type { Settings } from '@/types'

export type IapPlan = 'monthly' | 'annual'

/** One purchasable offering, as actually configured in the store (App Store Connect / Play Console) via RevenueCat. */
export interface IapOffering {
  /** The underlying store product identifier (App Store Connect / Play Console SKU). */
  productId: string
  plan: IapPlan
  /** Store-localized display price, e.g. "$6.99" — already formatted for the user's locale/currency. Never parsed; only ever displayed. */
  localizedPrice: string
  /**
   * Optional short merchandising note under the price (e.g. a per-month
   * equivalent or a savings callout for the annual plan). Additive beyond the
   * ARCH_PLAN B7 shape so the paywall can read real copy from the strategy
   * instead of a hardcoded string; omitted entirely when the strategy has
   * nothing to add (the UI then shows no note, never a fabricated one).
   */
  priceNote?: string
}

export type PurchaseResult = { ok: true } | { ok: false; reason: 'cancelled' | 'failed' }
export type RestoreResult = { ok: boolean }

export interface PurchaseStrategy {
  readonly kind: 'mock' | 'native'

  /**
   * Set up the billing connection (e.g. `Purchases.configure`). Never
   * throws — a failed init just leaves purchasing unavailable this session;
   * every other method below still resolves a safe fallback rather than
   * rejecting.
   */
  init(): Promise<void>

  /**
   * The plans actually purchasable right now. Resolves an EMPTY array
   * (never throws) when offerings cannot be fetched — `app/paywall.tsx`
   * falls back to its placeholder pricing in that case (requirement: real
   * prices when available, honest placeholders otherwise).
   */
  getOfferings(): Promise<IapOffering[]>

  /**
   * Buy `plan`. Never throws — a cancelled purchase is a normal outcome, not
   * an error, and resolves `{ ok: false, reason: 'cancelled' }` rather than a
   * rejection. `{ reason: 'failed' }` covers everything else (network,
   * billing unavailable, no matching product) and must never crash the app.
   */
  purchase(plan: IapPlan): Promise<PurchaseResult>

  /**
   * Re-link a previous purchase to this install (Apple requires every
   * subscription app to offer this — a reinstalling user must never be
   * asked to pay twice). Never throws.
   */
  restore(): Promise<RestoreResult>

  /**
   * The user's current entitlement as far as this strategy can determine.
   * NEVER THROWS and resolves `null` whenever it cannot positively confirm
   * an active paid entitlement — no module, no network, a transient billing
   * error, or simply nothing active. An unknown/negative state must never
   * lock a paying user out, so callers should only ever treat a non-null
   * result as authoritative and otherwise keep whatever subscription state
   * they already have. A non-null result only ever asserts a confirmed
   * CURRENT paid entitlement; it says nothing about trial state, which stays
   * local and orthogonal to this seam (`core/subscription.ts`).
   */
  getEntitlement(): Promise<Settings['subscription'] | null>
}
