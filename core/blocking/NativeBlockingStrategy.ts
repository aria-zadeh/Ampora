/**
 * NativeBlockingStrategy — the ISOLATED, real OS app-blocking implementation
 * (iOS Family Controls, doc `05` §3).
 *
 * ============================ READ THIS FIRST ============================
 * This file is a STUB on purpose. It is only ever constructed when
 * `FEATURE_FLAGS.IGNITION_NATIVE` is true (see `./index`), which is FALSE
 * today. Its methods refuse LOUDLY so that if it is ever reached without the
 * entitlement + native module in place, the failure is obvious rather than a
 * silent pretend-lock. The one exception is `removeShield`, which degrades to a
 * warning-only no-op: an unlock path must never be the thing that throws
 * (NFR-7).
 *
 * CRITICAL BUILD CONSTRAINT: this file has ZERO imports that can fail. It does
 * not import the native package, a config plugin, or even `react-native` — the
 * native module arrives by CONSTRUCTOR INJECTION from `./index`, which resolves
 * it through `requireOptionalNativeModule` (a module NAME, so Metro has nothing
 * to statically resolve). A `require()` inside a try/catch would NOT be
 * isolation: Metro resolves string-literal requires at bundle time regardless
 * of the try/catch, so a not-installed package still breaks the bundle.
 * ========================================================================
 *
 * The REAL implementation, when the entitlement lands (doc `05` §3):
 *
 *   getPermissionStatus():
 *     map the module's authorization status (notDetermined | approved | denied)
 *     onto 'undetermined' | 'granted' | 'denied'. Re-checked on every foreground
 *     because it can lag (§3.1). Never throws — uncertain reads 'undetermined'.
 *
 *   requestPermission():
 *     request `.individual` authorization (Apple's Screen Time consent sheet).
 *
 *   pickStakeApps():
 *     present FamilyActivityPicker, persist the returned FamilyActivitySelection
 *     tokens in the App Group so the extensions can read them, and return a
 *     StakeSelection carrying the opaque tokens plus the COUNT (§3.2). Names are
 *     never available and must never be implied by the UI.
 *
 *   applyShield(selection):
 *     store = ManagedSettingsStore()
 *     store.shield.applications         = selection.applicationTokens
 *     store.shield.applicationCategories = .specific(selection.categoryTokens)
 *     store.shield.webDomains           = selection.webDomainTokens
 *     (§3.3). Fail-safe: on any error leave the user UNLOCKED and log.
 *
 *   removeShield():
 *     null out all three shield fields and clear the App Group session state
 *     (§3.4). Idempotent.
 *
 *   isShieldActive():
 *     read the ManagedSettingsStore shield back. False when uncertain.
 *
 *   scheduleAutoExpiry(at):
 *     schedule a DeviceActivity monitor whose interval ends at `at`, so a
 *     forgotten lock releases at the session end / daily cap / single-session
 *     cap / quiet-hours boundary even with the app closed (§3.5). The in-app
 *     wall clock stays the source of truth — extension events fire prematurely
 *     on some iOS versions — so this is a backstop, never the primary path.
 *
 * The Swift side lives under `native/` (DeviceActivityMonitor,
 * ShieldConfiguration, ShieldAction) and is excluded from this tsconfig.
 */

import type { StakeSelection } from '@/types'
import type { BlockingPermissionStatus, BlockingStrategy } from './BlockingStrategy'

/**
 * The shape `./index` injects. Declared LOCALLY and structurally, never
 * imported from the native package, so `tsc` on a Windows/web checkout never
 * needs the native tree to exist. The real member list lands with the real
 * implementation; `unknown` here keeps the stub honest about knowing nothing.
 */
export interface IgnitionNativeModule {
  readonly [key: string]: unknown
}

const NOT_ENABLED_MESSAGE =
  'Native Ignition is not implemented yet (needs the Apple Family Controls entitlement + the native module). ' +
  'See native/README.md, then implement core/blocking/NativeBlockingStrategy.ts and flip ' +
  'FEATURE_FLAGS.IGNITION_NATIVE. Falling back to the in-app soft lock.'

/**
 * Stub native strategy. Every method refuses loudly because the native side is
 * not wired up. `getBlockingStrategy()` only constructs this when the flag is
 * on AND a native module actually resolved, so in normal operation these
 * methods are unreachable today.
 */
export class NativeBlockingStrategy implements BlockingStrategy {
  readonly kind = 'native' as const

  /**
   * The resolved native module, injected by `getBlockingStrategy()`. Held (and
   * unused) so the real implementation has its handle without this file ever
   * importing the package.
   */
  constructor(private readonly nativeModule: IgnitionNativeModule) {}

  /** Cannot authorize without a real implementation. Never throws. */
  async getPermissionStatus(): Promise<BlockingPermissionStatus> {
    console.warn(NOT_ENABLED_MESSAGE)
    return 'undetermined'
  }

  /** Nothing to request yet. Warn-only; never throws. */
  async requestPermission(): Promise<void> {
    console.warn(NOT_ENABLED_MESSAGE)
  }

  /** Throws — reaching this means the flag was enabled without a real impl. */
  async pickStakeApps(): Promise<StakeSelection> {
    throw new Error(NOT_ENABLED_MESSAGE)
  }

  /**
   * Throws — a shield that silently does nothing would be worse than an error,
   * because the user would believe their apps were on the line. The store's
   * fail-safe catches this and releases, leaving the user unlocked.
   */
  async applyShield(_selection: StakeSelection): Promise<void> {
    throw new Error(NOT_ENABLED_MESSAGE)
  }

  /**
   * Warn-only (does NOT throw): `removeShield` must never be the thing that
   * traps a user, so on a stub it degrades to a no-op after warning rather than
   * propagating an error out of an unlock path (NFR-7).
   */
  async removeShield(): Promise<void> {
    console.warn(NOT_ENABLED_MESSAGE)
  }

  /** Nothing is shielded by a stub. Never throws. */
  async isShieldActive(): Promise<boolean> {
    return false
  }

  /** Warn-only no-op: failing to schedule a backstop must not break arming. */
  async scheduleAutoExpiry(_at: number): Promise<void> {
    console.warn(NOT_ENABLED_MESSAGE)
  }

  /** Whether an injected module is present at all (used by `./index` diagnostics). */
  hasNativeModule(): boolean {
    return this.nativeModule != null
  }
}
