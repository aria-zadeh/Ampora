/**
 * nativeTypes.ts — the LOCAL, structural copy of the subset of RevenueCat's
 * `react-native-purchases` TS surface `NativePurchaseStrategy` calls (mirrors
 * `core/blocking/nativeTypes.ts`'s rationale exactly — ARCH_PLAN B6/B7).
 *
 * Deliberately NOT imported from `react-native-purchases`'s own types, even
 * though the shapes below describe the identical surface: this file must
 * typecheck on a Windows/web checkout where that package is NOT installed
 * (it is deliberately absent from `package.json` — see
 * `native/package-additions.json`). `tsc` on Windows must never need
 * `react-native-purchases` to exist in `node_modules`, which is only true if
 * nothing under `core/` imports real types from it. Keep this file in sync
 * BY HAND if the real SDK surface changes.
 *
 * Verified against the public SDK source
 * (github.com/RevenueCat/react-native-purchases, `src/purchases.ts` +
 * `@revenuecat/purchases-typescript-internal`) as of July 2026. Only the
 * fields `NativePurchaseStrategy.ts` actually reads are modeled — this is
 * intentionally not a full re-declaration of the SDK.
 */

/** Mirrors RevenueCat's `PACKAGE_TYPE` enum (string-valued). Only MONTHLY/ANNUAL map to an Ampora plan; everything else is ignored (FR-88 offers exactly two plans). */
export type RcPackageType =
  | 'UNKNOWN'
  | 'CUSTOM'
  | 'LIFETIME'
  | 'ANNUAL'
  | 'SIX_MONTH'
  | 'THREE_MONTH'
  | 'TWO_MONTH'
  | 'MONTHLY'
  | 'WEEKLY'

/** Mirrors RevenueCat's `StoreProduct` (subset actually read). */
export interface RcStoreProduct {
  /** The store product identifier (App Store Connect / Play Console SKU). */
  identifier: string
  /** Formatted price including the currency sign, e.g. "$6.99" — already locale-correct, never parsed. */
  priceString: string
  title: string
}

/** Mirrors RevenueCat's `PurchasesPackage` (subset actually read). */
export interface RcPackage {
  identifier: string
  packageType: RcPackageType
  product: RcStoreProduct
}

/** Mirrors RevenueCat's `PurchasesOffering` (subset actually read). */
export interface RcOffering {
  identifier: string
  availablePackages: RcPackage[]
}

/** Mirrors RevenueCat's `PurchasesOfferings` (subset actually read). */
export interface RcOfferings {
  current: RcOffering | null
}

/** Mirrors RevenueCat's `PurchasesEntitlementInfo` (subset actually read). */
export interface RcEntitlementInfo {
  identifier: string
  isActive: boolean
  productIdentifier: string
}

/** Mirrors RevenueCat's `PurchasesEntitlementInfos` (subset actually read). */
export interface RcEntitlementInfos {
  /** Map of ACTIVE entitlements only, keyed by the entitlement identifier configured in the RevenueCat dashboard. */
  active: Record<string, RcEntitlementInfo>
}

/** Mirrors RevenueCat's `CustomerInfo` (subset actually read). */
export interface RcCustomerInfo {
  entitlements: RcEntitlementInfos
}

/** Mirrors RevenueCat's `MakePurchaseResult`, returned by `purchasePackage` on success. */
export interface RcPurchaseResult {
  customerInfo: RcCustomerInfo
  productIdentifier: string
}

/**
 * Mirrors (a safe subset of) RevenueCat's `PurchasesError`, thrown/rejected by
 * `purchasePackage` on failure or cancellation. `userCancelled` is RevenueCat's
 * own (now-deprecated but still populated) flag; `code` is the modern
 * `PURCHASES_ERROR_CODE` string, checked defensively alongside it.
 */
export interface RcError {
  code?: string
  message?: string
  userCancelled?: boolean | null
}

/**
 * The subset of the `react-native-purchases` default export
 * `NativePurchaseStrategy` calls. Resolved via a Metro-aliased, lazily-invoked
 * `require()` call (see `NativePurchaseStrategy.ts`'s `resolvePurchasesModule`)
 * — NEVER a static `import`, so neither Metro (native off) nor `tsc` (package
 * not installed) ever needs the real package to exist.
 */
export interface RevenueCatModule {
  configure(config: { apiKey: string; appUserID?: string }): void
  isConfigured(): Promise<boolean>
  getOfferings(): Promise<RcOfferings>
  purchasePackage(pkg: RcPackage): Promise<RcPurchaseResult>
  restorePurchases(): Promise<RcCustomerInfo>
  getCustomerInfo(): Promise<RcCustomerInfo>
}
