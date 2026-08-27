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
   * `/auth`. Exists so the app is openable during local development while
   * sign-in is being sorted out.
   *
   * `__DEV__` only, always. Do not add a production or build-time opt-in
   * back here.
   *
   * History, so this does not come back by accident. From 2026-08-07 to
   * 2026-08-24 this also read `EXPO_PUBLIC_DEV_AUTH_BYPASS === '1'`, an
   * explicit opt-in that `vercel.json` set on the deployed web preview's
   * build command, at Aria's request, because that URL was not public-facing
   * yet and sign-in was blocking all use of it. It fabricated no session, no
   * user id and no JWT, so cloud sync never ran and every cloud call in
   * `services/supabase.ts` independently no-op'd, and RLS would have
   * rejected the calls regardless, so a visitor got an empty local-only app
   * and could not reach anyone else's data. It was still a production escape
   * hatch around FR-87's "no anonymous mode" requirement, so it had to come
   * out before any public or App-Store-facing build. Removed 2026-08-24
   * along with the `EXPO_PUBLIC_DEV_AUTH_BYPASS=1` prefix in `vercel.json`'s
   * build command. If the deployed preview ever needs to be reachable again
   * without a real sign-in, treat that as a fresh product decision, not a
   * flag to flip back on.
   *
   * Two things about that `vercel.json` build command, both learned by
   * breaking it and still relevant to any future `EXPO_PUBLIC_*` build-time
   * variable, so they stay written down here rather than only in a commit
   * message:
   *
   *   - **`vercel.json` cannot carry comments.** Not `//`, and not
   *     `_comment_` keys either. Vercel validates the file against a strict
   *     schema and fails the whole deploy with "should NOT have additional
   *     property". Explain any build command choices here instead.
   *   - **The `--clear` in that command is load-bearing, not caution, and
   *     stays even now that the variable is gone.** `babel-preset-expo`
   *     inlines `EXPO_PUBLIC_*` at transform time, but Metro's transform
   *     cache is not keyed on those values, so a cached build silently
   *     reuses whatever a variable was on the previous run. Verified
   *     2026-08-07 on this exact flag: the same command without `--clear`
   *     inlined it to `false` despite the variable being set, and the button
   *     did not render. That transform-cache problem applies to any
   *     `EXPO_PUBLIC_*` variable this project adds later, not only this one.
   */
  DEV_BYPASS_AUTH: __DEV__,
} as const

export type FeatureFlags = typeof FEATURE_FLAGS
