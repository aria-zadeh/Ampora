/**
 * NativePurchaseStrategy — the real RevenueCat (`react-native-purchases`)
 * implementation of `PurchaseStrategy` (PRD FR-88, ARCH_PLAN B7, owner
 * override: RevenueCat, not `expo-iap`).
 *
 * ============================ READ THIS FIRST ============================
 * Only ever returned by `getPurchaseStrategy()` (`./index.ts`) when
 * `FEATURE_FLAGS.IAP_NATIVE` is true — false on every Windows/web checkout
 * and on every shared branch (`native.config.json` is committed all-false,
 * always). In normal operation today this class's methods always take their
 * module-absent fallback branch.
 *
 * CRITICAL BUILD CONSTRAINT: this file has ZERO static imports of
 * `react-native-purchases`, and ZERO imports of `react-native` or
 * `constants/featureFlags` (unlike UI code, `core/**` must stay importable
 * under the plain-Node vitest harness — `vitest.config.ts` — which has no
 * Metro, no RN runtime, and no `__DEV__` global; `constants/featureFlags.ts`
 * references bare `__DEV__` and would throw if imported here). Platform
 * branching (iOS vs Android RevenueCat key) is therefore deliberately NOT
 * done in this file — see `readApiKey` below.
 *
 * A plain `import Purchases from 'react-native-purchases'` (or a top-level
 * `require(...)`) would ALSO make `tsc` try to resolve a package that is not
 * installed on Windows: `metro.config.js`'s resolver alias only patches
 * METRO's bundle-time resolution, it is invisible to `tsc`, which runs as a
 * wholly separate program with its own Node module resolution. The fix
 * mirrors this codebase's existing precedent for exactly this problem —
 * `components/verification/VerificationSheet.tsx`'s `loadImagePicker()`: a
 * `require()` CALL EXPRESSION (never a static `import`), written inside a
 * function, cast immediately to the LOCAL structural type in
 * `./nativeTypes.ts`. `tsc` treats a call to a generically-typed `require` as
 * an ordinary function call and never validates its string argument against
 * a real file on disk — only `import`/`export ... from` syntax triggers that
 * check. Metro's resolver alias (already present in `metro.config.js`'s
 * `OPTIONAL_NATIVE_PACKAGES` set) is what then makes the BUNDLE-time
 * resolution safe too: while native is off, the aliased specifier resolves
 * to `core/native/optionalStub.js`, which exports `null` — so the `require`
 * call below returns `null` cleanly (no throw) exactly like every other
 * optional-native call site in the app. Under plain Node (vitest, or any
 * script that bypasses Metro entirely), the package genuinely is not
 * installed, so the same `require()` throws a real `MODULE_NOT_FOUND` —
 * the surrounding try/catch handles that identically, which is exactly what
 * the resolver-fallback tests in `core/iap/__tests__/` exercise for real.
 * ========================================================================
 *
 * FAIL-SAFE CONTRACT (`./PurchaseStrategy.ts`'s own docstring): every method
 * below resolves rather than throws. A cancelled purchase is a normal
 * outcome (`{ ok: false, reason: 'cancelled' }`), never an exception.
 * `getEntitlement()` returns `null` whenever it cannot positively confirm an
 * active entitlement — an unknown state must never lock a paying user out.
 */
import type { Settings } from '@/types'
import type { IapOffering, IapPlan, PurchaseResult, PurchaseStrategy, RestoreResult } from './PurchaseStrategy'
import type { RcCustomerInfo, RcError, RcOfferings, RcPackage, RcPackageType, RevenueCatModule } from './nativeTypes'

/**
 * Must match the entitlement identifier configured in the RevenueCat
 * dashboard (a Mac/dashboard-side setup step this task cannot perform — see
 * the final report). One entitlement gates the whole app, matching FR-88
 * ("Subscription state gates app access") with no per-feature entitlements.
 */
const ENTITLEMENT_ID = 'premium'

/**
 * RevenueCat's own guidance is a public API key per store front (a
 * `Stripe`-publishable-key style value, safe to embed client-side, NOT a
 * secret like `GEMINI_API_KEY`). iOS-only for now: the rest of the native
 * quarantine (Family Controls / Ignition) is iOS-scoped today too, so an
 * Android key/product setup is left as documented future work rather than
 * guessed at here. Deliberately reads `process.env` directly (not
 * `constants/featureFlags.ts`) — see the file docstring for why this file
 * must not import that module.
 */
function readApiKey(): string | null {
  const key = process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY
  return key != null && key.length > 0 ? key : null
}

/** Maps RevenueCat's package-type taxonomy onto Ampora's two plans (FR-88 offers exactly two). Anything else (weekly, lifetime, custom, …) is not a plan Ampora sells. */
export function packageTypeToPlan(packageType: RcPackageType): IapPlan | null {
  if (packageType === 'MONTHLY') return 'monthly'
  if (packageType === 'ANNUAL') return 'annual'
  return null
}

/**
 * Best-effort only: used purely to populate `Settings['subscription'].plan`
 * for display (e.g. Settings screen, the "your X subscription is active"
 * copy). Never gates access — `isActive()` (`core/subscription.ts`) does not
 * look at `plan` at all — so an unrecognized product identifier degrading to
 * `undefined` is a display nicety, not a correctness risk.
 */
export function inferPlanFromProductIdentifier(productIdentifier: string): IapPlan | undefined {
  const id = productIdentifier.toLowerCase()
  if (id.includes('annual') || id.includes('year')) return 'annual'
  if (id.includes('month')) return 'monthly'
  return undefined
}

/**
 * RevenueCat's error carries both a modern `code` (checked first) and a
 * deprecated-but-still-populated `userCancelled` boolean (checked as a
 * fallback) — checking both is cheap and future-proofs against either being
 * absent on a given SDK version/platform.
 */
export function isUserCancelled(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  const e = err as RcError
  if (e.code === 'PURCHASE_CANCELLED_ERROR' || e.code === '1') return true
  return e.userCancelled === true
}

function toIapOffering(pkg: RcPackage): IapOffering | null {
  const plan = packageTypeToPlan(pkg.packageType)
  if (!plan) return null
  return {
    productId: pkg.product.identifier,
    plan,
    localizedPrice: pkg.product.priceString,
  }
}

let cachedModule: RevenueCatModule | null | undefined

/**
 * Resolve `react-native-purchases` by a lazy REQUIRE CALL EXPRESSION (never a
 * static import — see the file docstring for the full reasoning). Memoized;
 * never throws — any resolution failure (Metro-off stub, genuinely
 * uninstalled under plain Node, a broken native link) degrades to `null`,
 * treated identically to "not installed" by every caller (NFR-7-style
 * fail-safe, matching `core/blocking/nativeModule.ts`'s contract).
 */
function resolvePurchasesModule(): RevenueCatModule | null {
  if (cachedModule !== undefined) return cachedModule
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const required = require('react-native-purchases')
    const resolved = (required?.default ?? required) as RevenueCatModule | null
    cachedModule = resolved && typeof resolved.getOfferings === 'function' ? resolved : null
  } catch (err) {
    console.warn('NativePurchaseStrategy: require("react-native-purchases") threw, falling back to null:', err)
    cachedModule = null
  }
  return cachedModule
}

/** Test-only escape hatch: clears the memoized module so a test can simulate re-resolution. Not used by app code. */
export function __resetPurchasesModuleCacheForTests(): void {
  cachedModule = undefined
}

export class NativePurchaseStrategy implements PurchaseStrategy {
  readonly kind = 'native' as const

  /** Guards against re-configuring the SDK on every call; harmless if left false when the module is absent. */
  private configured = false

  /** Never throws. A failed/skipped init just leaves `configured` false, so every other method below still degrades gracefully. */
  async init(): Promise<void> {
    try {
      const mod = resolvePurchasesModule()
      if (!mod) return
      if (this.configured) return

      const alreadyConfigured = await mod.isConfigured().catch(() => false)
      if (alreadyConfigured) {
        this.configured = true
        return
      }

      const apiKey = readApiKey()
      if (!apiKey) {
        console.warn(
          'NativePurchaseStrategy.init: no RevenueCat API key configured (EXPO_PUBLIC_REVENUECAT_IOS_API_KEY), purchases unavailable this session'
        )
        return
      }

      mod.configure({ apiKey })
      this.configured = true
    } catch (err) {
      console.warn('NativePurchaseStrategy.init failed, purchases unavailable this session:', err)
    }
  }

  /** Never throws; resolves an empty array on any failure so the paywall falls back to placeholder pricing. */
  async getOfferings(): Promise<IapOffering[]> {
    try {
      const mod = resolvePurchasesModule()
      if (!mod) return []
      const offerings: RcOfferings = await mod.getOfferings()
      const packages = offerings.current?.availablePackages ?? []
      const result: IapOffering[] = []
      for (const pkg of packages) {
        const offering = toIapOffering(pkg)
        if (offering) result.push(offering)
      }
      return result
    } catch (err) {
      console.warn('NativePurchaseStrategy.getOfferings failed, resolving no offerings (UI falls back to placeholders):', err)
      return []
    }
  }

  /**
   * Never throws. A user-cancelled sheet resolves `{ ok: false, reason:
   * 'cancelled' }` — a normal outcome, not an error path — everything else
   * unexpected resolves `{ ok: false, reason: 'failed' }`.
   */
  async purchase(plan: IapPlan): Promise<PurchaseResult> {
    try {
      const mod = resolvePurchasesModule()
      if (!mod) return { ok: false, reason: 'failed' }

      const offerings: RcOfferings = await mod.getOfferings()
      const packages = offerings.current?.availablePackages ?? []
      const pkg = packages.find((p) => packageTypeToPlan(p.packageType) === plan)
      if (!pkg) {
        console.warn(`NativePurchaseStrategy.purchase: no "${plan}" package in the current RevenueCat offering`)
        return { ok: false, reason: 'failed' }
      }

      await mod.purchasePackage(pkg)
      return { ok: true }
    } catch (err) {
      if (isUserCancelled(err)) return { ok: false, reason: 'cancelled' }
      console.warn('NativePurchaseStrategy.purchase failed:', err)
      return { ok: false, reason: 'failed' }
    }
  }

  /** Never throws. `{ ok: false }` covers both "nothing to restore" and any failure — both read identically to the user (a calm, non-alarming message, never a crash). */
  async restore(): Promise<RestoreResult> {
    try {
      const mod = resolvePurchasesModule()
      if (!mod) return { ok: false }
      const info: RcCustomerInfo = await mod.restorePurchases()
      return { ok: Boolean(info.entitlements.active[ENTITLEMENT_ID]) }
    } catch (err) {
      console.warn('NativePurchaseStrategy.restore failed, reporting nothing restored:', err)
      return { ok: false }
    }
  }

  /** Never throws. Returns `null` whenever it cannot positively confirm an active entitlement (fail-open — see `./PurchaseStrategy.ts`). */
  async getEntitlement(): Promise<Settings['subscription'] | null> {
    try {
      const mod = resolvePurchasesModule()
      if (!mod) return null
      const info: RcCustomerInfo = await mod.getCustomerInfo()
      const active = info.entitlements.active[ENTITLEMENT_ID]
      if (!active) return null
      return { status: 'active', plan: inferPlanFromProductIdentifier(active.productIdentifier) }
    } catch (err) {
      console.warn('NativePurchaseStrategy.getEntitlement failed, reporting unknown (caller keeps its current state):', err)
      return null
    }
  }
}
