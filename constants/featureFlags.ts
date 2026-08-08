/**
 * Compile-time-ish feature flags for Ampora — Phase 5 (Ignition).
 *
 * These are plain constants (not runtime-remote flags) so tree-shaking and
 * dead-code elimination can drop disabled branches, and so the RN/web build
 * never even reaches native-only code paths while a flag is off.
 *
 * IGNITION_NATIVE gates the real OS app-blocking implementation
 * (`core/blocking/NativeBlockingStrategy.ts`, backed by the isolated Swift +
 * config-plugin package in `native/modules/ampora-ignition/`).
 *
 * IT IS NOT EDITED BY HAND. It mirrors `native.config.json` (or the
 * `AMPORA_NATIVE=1` EAS override) via `app.config.ts`, which republishes the
 * flag as `EXPO_PUBLIC_AMPORA_NATIVE` — a variable `babel-preset-expo` inlines
 * into the bundle at transform time, so the value below is a compile-time
 * constant and the disabled branch is dead code Metro can drop. Change it with
 * `npm run native:on` / `npm run native:off`, never by editing this file.
 *
 * It is true only when BOTH of these hold:
 *   1. Apple has granted the Family Controls (Distribution) entitlement for all
 *      four bundle IDs (main app + the three extensions), AND
 *   2. the `ampora-ignition` native module is actually linked into the build.
 * Even then `getBlockingStrategy()` re-checks (2) at runtime via
 * `requireOptionalNativeModule`, so a flag-on/module-absent build still falls
 * back to the SoftBlockingStrategy rather than a broken native one (NFR-7).
 *
 * On Windows and on web this is ALWAYS false: `native.config.json` is committed
 * all-false on every shared branch (see `native/README.md`) and the web bundle
 * never receives a native package regardless of the flag.
 */
export const FEATURE_FLAGS = {
  /**
   * Real OS-level app shielding via iOS Family Controls. Derived from
   * `native.config.json` → `app.config.ts` → `EXPO_PUBLIC_AMPORA_NATIVE`.
   * While false, `getBlockingStrategy()` always returns the
   * SoftBlockingStrategy. Defaults to false when the variable is absent (plain
   * Node/vitest, or any bundler that did not run through `app.config.ts`) —
   * the fail-safe direction is "no native lock".
   */
  IGNITION_NATIVE: process.env.EXPO_PUBLIC_AMPORA_NATIVE === '1',

  /**
   * Real billing via RevenueCat (`react-native-purchases`), wired through
   * `core/iap/NativePurchaseStrategy.ts`. Derived exactly like
   * IGNITION_NATIVE, just off the sibling flag: `native.config.json` →
   * `app.config.ts` → `EXPO_PUBLIC_AMPORA_PURCHASES` (`app.config.ts` already
   * republishes both flags side by side — see its docstring). While false,
   * `getPurchaseStrategy()` (`core/iap/index.ts`) always returns the
   * MockPurchaseStrategy, so `app/paywall.tsx` behaves exactly as it did
   * before real purchasing existed. Defaults to false when the variable is
   * absent (plain Node/vitest, or any bundler that did not run through
   * `app.config.ts`) — the fail-safe direction is "no real purchasing",
   * matching IGNITION_NATIVE.
   *
   * On Windows and on web this is ALWAYS false: `native.config.json` is
   * committed all-false on every shared branch (see `native/README.md`) and
   * the web bundle never receives a native package regardless of the flag.
   */
  IAP_NATIVE: process.env.EXPO_PUBLIC_AMPORA_PURCHASES === '1',

  /**
   * Dev-only paywall bypass. When true, the paywall renders a "Skip (dev)"
   * button so premium screens can be reached without a real purchase during
   * development. Gated on `__DEV__` so it is stripped from production builds.
   */
  DEV_BYPASS_PAYWALL: __DEV__,

  /**
   * Sign-in bypass. When true, `app/auth.tsx` renders a "Skip sign-in" button
   * and `app/_layout.tsx` stops redirecting an unauthenticated launch to
   * `/auth`. Exists so the app is openable while sign-in is being sorted out.
   *
   * True in two cases:
   *   1. `__DEV__` — any local dev run, always.
   *   2. `EXPO_PUBLIC_DEV_AUTH_BYPASS === '1'` — an explicit opt-in that works
   *      in PRODUCTION builds too. `vercel.json` sets it for the deployed web
   *      preview, at Aria's explicit request (2026-08-07), because that URL is
   *      not public-facing yet and sign-in was blocking all use of it.
   *
   * **Read this before shipping.** Case 2 means this is NOT automatically off
   * in a release build any more. Before any TestFlight or App Store submission,
   * remove `EXPO_PUBLIC_DEV_AUTH_BYPASS` from `vercel.json` and from any build
   * environment. An App Store build is unaffected today only because nothing
   * sets the variable for it, which is a fact about the build config rather
   * than a guarantee in the code.
   *
   * What limits the damage, and why case 2 is defensible on a preview URL: the
   * bypass fabricates NO session. There is no user id and no JWT, so cloud sync
   * never runs (`app/_layout.tsx`'s sync effect is gated on a real `authUser`),
   * every cloud call in `services/supabase.ts` independently no-ops, and RLS
   * would reject the calls regardless. Someone who opens the deployed URL and
   * taps the button gets an empty local-only app in their own browser. They
   * cannot reach anyone else's data. It is still not the anonymous local-only
   * mode FR-87 forbids, because it is a build-time escape hatch rather than a
   * product mode, and no shipped store build enables it.
   */
  DEV_BYPASS_AUTH:
    __DEV__ || process.env.EXPO_PUBLIC_DEV_AUTH_BYPASS === '1',
} as const

export type FeatureFlags = typeof FEATURE_FLAGS
