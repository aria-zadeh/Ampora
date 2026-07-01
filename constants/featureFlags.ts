/**
 * Compile-time-ish feature flags for Ampora — Phase 5 (Ignition).
 *
 * These are plain constants (not runtime-remote flags) so tree-shaking and
 * dead-code elimination can drop disabled branches, and so the RN/web build
 * never even reaches native-only code paths while a flag is off.
 *
 * IGNITION_NATIVE gates the real OS app-blocking implementation
 * (`core/blocking/NativeBlockingStrategy.ts`, backed by the isolated Swift +
 * config-plugin scaffolding in `native/ignition/`). It stays FALSE until:
 *   1. Apple grants the Family Controls (Distribution) entitlement for all
 *      four bundle IDs (main app + the three extensions), AND
 *   2. a native module (`react-native-device-activity` / `expo-app-blocker`
 *      or the in-repo config plugin) is installed and wired into
 *      NativeBlockingStrategy per `native/ignition/README.md`.
 * Flip it to `true` only once both are in place. Until then the app runs the
 * SoftBlockingStrategy (in-app focus lock), which works today on web and dev
 * builds with no entitlement.
 *
 * BEAT_THE_CLOCK gates the third stake mode. On by default — it is pure
 * in-app timer logic and needs no native support.
 */
export const FEATURE_FLAGS = {
  /**
   * Real OS-level app shielding via iOS Family Controls. FALSE until the
   * Apple Family Controls entitlement + a native module are in place (see
   * `native/ignition/README.md`). While false, `getBlockingStrategy()` always
   * returns the SoftBlockingStrategy.
   */
  IGNITION_NATIVE: false,

  /** The "Beat the clock" stake mode. Pure in-app timer, safe to ship today. */
  BEAT_THE_CLOCK: true,
} as const

export type FeatureFlags = typeof FEATURE_FLAGS
