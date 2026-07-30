/**
 * Blocking strategy selection — the ONE place the app decides how a lock is
 * enforced (PRD §9.13, doc `05` §7).
 *
 * Everything in the app (the stakes store, the lock UI) must call
 * `getBlockingStrategy()` and never construct a strategy directly, so the real
 * native impl swaps in by flipping `FEATURE_FLAGS.IGNITION_NATIVE` with zero
 * call-site changes.
 *
 * Selection rule (three sync gates, in order):
 *   1. the feature flag is on, AND
 *   2. a native module actually resolved, AND
 *   3. construction succeeded
 * otherwise the SoftBlockingStrategy, which is available everywhere including
 * web. `isAvailable()` is deliberately NOT on the interface any more:
 * availability is "module present" (checked here, synchronously) plus
 * "`getPermissionStatus() !== 'denied'`" (checked asynchronously by the UI that
 * is about to arm a lock), and conflating the two into one boolean was what
 * made the old seam lie on the permission-denied path.
 *
 * On Windows, on web, and on every shared branch (`native.config.json` is
 * committed all-false, always — native/README.md) `FEATURE_FLAGS.
 * IGNITION_NATIVE` is false, so this always returns Soft.
 */

import { FEATURE_FLAGS } from '@/constants/featureFlags'
import type { BlockingStrategy } from './BlockingStrategy'
import { resolveIgnitionNativeModule } from './nativeModule'
import { NativeBlockingStrategy } from './NativeBlockingStrategy'
import { softBlockingStrategy } from './SoftBlockingStrategy'

/** Memoized native instance (only created if the flag is on AND a module resolved). */
let nativeStrategy: NativeBlockingStrategy | null = null

/**
 * Returns the active blocking strategy. Native only when explicitly enabled
 * AND a native module resolved; Soft otherwise. Never throws — safe to call on
 * any platform, including web.
 */
export function getBlockingStrategy(): BlockingStrategy {
  if (!FEATURE_FLAGS.IGNITION_NATIVE) return softBlockingStrategy
  try {
    const mod = resolveIgnitionNativeModule()
    // Flag on but the native module is absent (missing package/entitlement):
    // fail safe to the in-app soft lock rather than a broken native one.
    if (!mod) return softBlockingStrategy
    nativeStrategy ??= new NativeBlockingStrategy(mod)
    return nativeStrategy
  } catch (err) {
    console.warn('getBlockingStrategy: native resolution failed, using the soft lock:', err)
    return softBlockingStrategy
  }
}

export type {
  BlockingStrategy,
  BlockingPermissionStatus,
  LockState,
  LockStateListener,
} from './BlockingStrategy'
export { LockStateEmitter } from './BlockingStrategy'
export {
  SoftBlockingStrategy,
  subscribeLockState,
  getLockState,
  setLockSession,
} from './SoftBlockingStrategy'
export { NativeBlockingStrategy } from './NativeBlockingStrategy'
export { resolveIgnitionNativeModule } from './nativeModule'
export type {
  IgnitionNativeModule,
  IgnitionAuthorizationStatus,
  NativeStakeSelectionResult,
  NativeApplyShieldReason,
  NativeApplyShieldResult,
} from './nativeTypes'
export * from './limits'
