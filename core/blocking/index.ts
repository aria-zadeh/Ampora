/**
 * Blocking strategy selection — the ONE place the app decides how a lock is
 * enforced (PRD §9.13, doc 06 §7).
 *
 * Everything in the app (the stakes store, the lock UI) must call
 * `getBlockingStrategy()` and never construct a strategy directly. That way
 * the real native impl swaps in by flipping `FEATURE_FLAGS.IGNITION_NATIVE`
 * with zero call-site changes.
 *
 * Selection rule: use the NativeBlockingStrategy only when the flag is on AND
 * it reports itself available (native module + entitlement present); otherwise
 * always fall back to the SoftBlockingStrategy (which is available everywhere,
 * including web). Today the flag is false, so this always returns Soft.
 */

import { FEATURE_FLAGS } from '@/constants/featureFlags'
import type { BlockingStrategy } from './BlockingStrategy'
import { NativeBlockingStrategy } from './NativeBlockingStrategy'
import { softBlockingStrategy } from './SoftBlockingStrategy'

/** Memoized native instance (only created if the flag is ever on). */
let nativeStrategy: NativeBlockingStrategy | null = null

/**
 * Returns the active blocking strategy. Native only when explicitly enabled
 * AND available; Soft otherwise. Never throws — safe to call on any platform.
 */
export function getBlockingStrategy(): BlockingStrategy {
  if (FEATURE_FLAGS.IGNITION_NATIVE) {
    nativeStrategy ??= new NativeBlockingStrategy()
    if (nativeStrategy.isAvailable()) return nativeStrategy
    // Flag on but native not actually available (missing module/entitlement):
    // fail safe to the in-app soft lock rather than a broken native one.
  }
  return softBlockingStrategy
}

export type { BlockingStrategy, LockState, LockStateListener } from './BlockingStrategy'
export { LockStateEmitter } from './BlockingStrategy'
export { SoftBlockingStrategy, subscribeLockState, getLockState } from './SoftBlockingStrategy'
export { NativeBlockingStrategy } from './NativeBlockingStrategy'
