/**
 * NativeBlockingStrategy — the ISOLATED, real OS app-blocking implementation
 * (iOS Family Controls). Phase 5.
 *
 * ============================ READ THIS FIRST ============================
 * This file is a STUB on purpose. It is only ever constructed when
 * `FEATURE_FLAGS.IGNITION_NATIVE` is true (see `./index`), which is FALSE
 * today. Its methods warn/throw so that if it is ever reached without the
 * entitlement + native module in place, the failure is loud and obvious
 * rather than silently pretending to lock.
 *
 * CRITICAL BUILD CONSTRAINT: this file MUST NOT statically import any native
 * app-blocking package (`react-native-device-activity`, `expo-app-blocker`,
 * or the in-repo config plugin). A top-level `import` of a native module
 * would break the web export and any build that lacks the native side. When
 * this strategy is really enabled, load the native module LAZILY inside each
 * method (dynamic `import()` / `require()`), so this file stays import-safe on
 * web and in dev builds without the module.
 * ========================================================================
 *
 * The REAL intended implementation (do this when the entitlement lands):
 *
 *   kind = 'native'
 *
 *   isAvailable():
 *     return true only if the native module is linked AND the platform is iOS
 *     with the Family Controls entitlement. Otherwise false, so `getBlockingStrategy()`
 *     falls back to the SoftBlockingStrategy. Never throw.
 *
 *   requestAuthorization():
 *     const native = await import('react-native-device-activity')  // LAZY
 *     const status = await native.getAuthorizationStatus()          // notDetermined | approved | denied
 *     if (status !== 'approved') await native.requestAuthorization('individual')
 *     return (await native.getAuthorizationStatus()) === 'approved'
 *     // Re-check on every app foreground (status can lag) — doc 06 §3.1.
 *     // Fail-safe: on any error, return false (never trap the user).
 *
 *   applyShield(session):
 *     const native = await import('react-native-device-activity')  // LAZY
 *     // Load the FamilyActivitySelection tokens the user picked (persisted in
 *     // the App Group, doc 06 §3.2), then:
 *     //   store.shield.applications = selection.applicationTokens
 *     //   store.shield.applicationCategories = .specific(selection.categoryTokens)
 *     //   store.shield.webDomains = selection.webDomainTokens
 *     // Write session state (mode, condition, startedAt, strength) into the
 *     // App Group so the extensions can read it (doc 06 §3.3).
 *     // If mode === 'beat_the_clock', schedule a DeviceActivity monitor for
 *     // the timer/cooldown window (doc 06 §3.5). Always schedule an
 *     // auto-expiry monitor for the daily cap + quiet-hours boundary so a
 *     // forgotten lock releases even with the app closed (doc 06 §3.6).
 *     // Fail-safe: if applying the shield throws, leave the user UNLOCKED and
 *     // log — never trap on error (doc 06 §3.10, NFR-7).
 *     //
 *     // Native Swift side lives in native/ignition/*.swift:
 *     //   - DeviceActivityMonitor.swift  (interval/threshold callbacks)
 *     //   - ShieldConfiguration.swift    (the block screen content)
 *     //   - ShieldAction.swift           (shield button handling -> panic valve)
 *
 *   removeShield(session):
 *     const native = await import('react-native-device-activity')  // LAZY
 *     //   store.shield.applications = nil
 *     //   store.shield.applicationCategories = nil
 *     //   store.shield.webDomains = nil
 *     // Clear session state in the App Group (doc 06 §3.4). Idempotent.
 *
 * See `native/ignition/README.md` for the full enable checklist (entitlement,
 * install the module, wire this file, flip the flag).
 */

import type { StakeSession } from '@/types'
import type { BlockingStrategy } from './BlockingStrategy'

const NOT_ENABLED_MESSAGE =
  'Native Ignition is not enabled (needs the Apple Family Controls entitlement + native module). ' +
  'See native/ignition/README.md, then flip FEATURE_FLAGS.IGNITION_NATIVE and implement ' +
  'core/blocking/NativeBlockingStrategy.ts. Falling back to the in-app soft lock.'

/**
 * Stub native strategy. All methods refuse loudly because the native side is
 * not wired up. `getBlockingStrategy()` guards construction behind
 * `FEATURE_FLAGS.IGNITION_NATIVE && isAvailable()`, so in normal operation
 * these methods are never reached today.
 */
export class NativeBlockingStrategy implements BlockingStrategy {
  readonly kind = 'native' as const

  /**
   * Not available: the native module is absent. Returning false here means
   * even if the flag were flipped by mistake, `getBlockingStrategy()` still
   * falls back to the soft strategy instead of handing back a broken lock.
   */
  isAvailable(): boolean {
    return false
  }

  /** Fail-safe: cannot authorize without the native module. Warn and return false. */
  async requestAuthorization(): Promise<boolean> {
    console.warn(NOT_ENABLED_MESSAGE)
    return false
  }

  /**
   * Throws — reaching this means the flag was enabled without a real impl.
   * (The store's fail-safe should catch this and leave the user unlocked.)
   */
  async applyShield(_session: StakeSession): Promise<void> {
    throw new Error(NOT_ENABLED_MESSAGE)
  }

  /**
   * Warn-only (does NOT throw): removeShield must never be the thing that
   * traps a user, so on a stub it degrades to a no-op after warning rather
   * than propagating an error out of an unlock path.
   */
  async removeShield(_session: StakeSession): Promise<void> {
    console.warn(NOT_ENABLED_MESSAGE)
  }
}
