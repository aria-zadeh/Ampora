/**
 * NativeBlockingStrategy — the real iOS Family Controls implementation of
 * `BlockingStrategy` (doc `05` §3), backed by the `native/modules/
 * ampora-ignition` Expo module.
 *
 * ============================ READ THIS FIRST ============================
 * Only ever constructed by `getBlockingStrategy()` (`./index.ts`) when
 * `FEATURE_FLAGS.IGNITION_NATIVE` is true AND a native module actually
 * resolved — both false on every Windows/web checkout and on every shared
 * branch (`native.config.json` is committed all-false, always). In normal
 * operation today this class is never instantiated.
 *
 * CRITICAL BUILD CONSTRAINT (unchanged from the stub this replaces): this
 * file has ZERO imports that can fail. It does not import the native
 * package, a config plugin, or a Swift type — the native module arrives by
 * CONSTRUCTOR INJECTION from `./index.ts`, which resolves it through
 * `./nativeModule.ts`'s `requireOptionalNativeModule` (a module NAME, so
 * Metro has nothing to statically resolve). `IgnitionNativeModule` itself
 * comes from `./nativeTypes.ts`, a LOCAL structural copy of the native
 * package's own types — never imported from `native/**` (ARCH_PLAN B6), so
 * `tsc` on Windows never needs that tree to exist.
 * ========================================================================
 *
 * FAIL-SAFE CONTRACT (doc `05` §3.10, and `BlockingStrategy.ts`'s own
 * docstring: "implementations should resolve (not reject) on internal error
 * and leave the user UNLOCKED"): every method below catches its own errors
 * and resolves a safe value rather than letting a native rejection propagate.
 * `store/stakesStore.ts` also wraps `applyShield`/`scheduleAutoExpiry` in its
 * own `.catch()` as a second layer — that is intentional belt-and-suspenders,
 * not evidence this class is expected to reject; it simply never should.
 */
import type { StakeSelection } from '@/types'

import type { BlockingPermissionStatus, BlockingStrategy } from './BlockingStrategy'
import { isAllAppsCategory } from './limits'
import type {
  IgnitionAuthorizationStatus,
  IgnitionNativeModule,
  NativeApplyShieldResult,
  NativeStakeSelectionResult,
} from './nativeTypes'

// Re-exported so `./index.ts` (and anything importing FROM this file, for
// back-compat with the pre-ARCH_PLAN-B6 layout where this type lived here)
// keeps working without a second source of truth.
export type { IgnitionNativeModule } from './nativeTypes'

function mapAuthorizationStatus(status: IgnitionAuthorizationStatus): BlockingPermissionStatus {
  switch (status) {
    case 'approved':
      return 'granted'
    case 'denied':
      return 'denied'
    default:
      return 'undetermined'
  }
}

function emptySelection(): StakeSelection {
  return {
    platform: 'ios',
    applicationTokens: [],
    categoryTokens: [],
    webDomainTokens: [],
    count: 0,
    pickedAt: Date.now(),
  }
}

/** Whether the native picker returned an "everything" category (doc `05` §4 — refuse it, never shield the never-lock list along with it). */
function isSuspiciousSelection(result: NativeStakeSelectionResult): boolean {
  return result.categoryTokens.some((token) => isAllAppsCategory(token))
}

export class NativeBlockingStrategy implements BlockingStrategy {
  readonly kind = 'native' as const

  /** Last selectionId a real (non-empty) pick produced, so a re-open of the picker can seed from it. */
  private lastSelectionId: string | null = null
  /** Diagnostics only — not read by `BlockingStrategy` callers, since `applyShield` returns `Promise<void>`. */
  private lastApplyShieldOutcome: NativeApplyShieldResult | null = null

  /**
   * The resolved native module, injected by `getBlockingStrategy()`. Held so
   * every method below can call straight into it without this file ever
   * importing the package that defines it.
   */
  constructor(private readonly nativeModule: IgnitionNativeModule) {}

  // -------------------------------------------------------------------------
  // BlockingStrategy (doc `05` §7)
  // -------------------------------------------------------------------------

  /** Re-checked on every foreground by callers — authorization status can lag (doc `05` §3.1). Never throws. */
  async getPermissionStatus(): Promise<BlockingPermissionStatus> {
    try {
      const status = await this.nativeModule.getAuthorizationStatus()
      return mapAuthorizationStatus(status)
    } catch (err) {
      console.warn('NativeBlockingStrategy.getPermissionStatus failed, reporting undetermined:', err)
      return 'undetermined'
    }
  }

  /** Shows Apple's Screen Time consent sheet. Never throws — an uncertain outcome is read back via `getPermissionStatus()`. */
  async requestPermission(): Promise<void> {
    try {
      await this.nativeModule.requestAuthorization()
    } catch (err) {
      console.warn('NativeBlockingStrategy.requestPermission failed (no permission granted, fail-safe):', err)
    }
  }

  /**
   * Presents the Screen Time picker. Never throws — cancellation, a picker
   * crash (doc `05` §2), or the module being absent all resolve an EMPTY
   * selection, which `startStake` refuses with `'no_selection'` (the honest
   * outcome, same as the soft path's `pickStakeApps`).
   */
  async pickStakeApps(): Promise<StakeSelection> {
    try {
      const result = await this.nativeModule.presentActivityPicker(this.lastSelectionId)

      if (result.cancelled || !result.selectionId) {
        return emptySelection()
      }

      if (isSuspiciousSelection(result)) {
        // doc `05` §4: refuse an "everything" category rather than shield the
        // never-lock list along with it. iOS tokens are normally fully
        // opaque, so this rarely matches in practice — kept for parity with
        // `core/blocking/limits.ts`'s soft-path check and in case a future
        // picker style ever hands back a literal category identifier.
        console.warn('NativeBlockingStrategy.pickStakeApps: refusing an all-apps category selection')
        return emptySelection()
      }

      this.lastSelectionId = result.selectionId
      return {
        platform: 'ios',
        applicationTokens: result.applicationTokens,
        categoryTokens: result.categoryTokens,
        webDomainTokens: result.webDomainTokens,
        count: result.count,
        selectionId: result.selectionId,
        pickedAt: result.pickedAt,
      }
    } catch (err) {
      console.warn('NativeBlockingStrategy.pickStakeApps failed, resolving an empty selection:', err)
      return emptySelection()
    }
  }

  /**
   * Applies the shield for `selection` (doc `05` §3.3). Never throws — on any
   * failure (authorization lost, token mismatch, an all-apps refusal, or a
   * thrown error) this resolves having left the user UNLOCKED, per
   * `BlockingStrategy.ts`'s documented contract. `store/stakesStore.ts`'s own
   * `.catch()` around this call is a second, redundant safety net — not a
   * sign this is expected to reject.
   */
  async applyShield(selection: StakeSelection): Promise<void> {
    if (!selection.selectionId) {
      console.warn('NativeBlockingStrategy.applyShield: selection has no selectionId, leaving unlocked')
      this.lastApplyShieldOutcome = { ok: false, reason: 'selection_not_found' }
      return
    }

    try {
      const result = await this.nativeModule.applyShield(selection.selectionId)
      this.lastApplyShieldOutcome = result
      if (!result.ok) {
        console.warn(
          `NativeBlockingStrategy.applyShield: native refused (${result.reason ?? 'unknown_error'}), leaving unlocked`
        )
      }
    } catch (err) {
      console.warn('NativeBlockingStrategy.applyShield threw, leaving unlocked (fail-safe, doc `05` §3.10):', err)
      this.lastApplyShieldOutcome = { ok: false, reason: 'unknown_error' }
    }
  }

  /** Unconditional, idempotent, never throws (doc `05` §3.4). Also cancels the expiry backstop — see the native side for why. */
  async removeShield(): Promise<void> {
    try {
      await this.nativeModule.removeShield()
    } catch (err) {
      console.warn('NativeBlockingStrategy.removeShield failed (still treating the user as unlocked):', err)
    }
  }

  /** Never throws; resolves `false` when uncertain. */
  async isShieldActive(): Promise<boolean> {
    try {
      return await this.nativeModule.isShieldActive()
    } catch (err) {
      console.warn('NativeBlockingStrategy.isShieldActive failed, reporting false:', err)
      return false
    }
  }

  /**
   * Backstop for session end / daily cap / single-session cap / quiet hours
   * (doc `05` §3.5). The in-app wall clock stays the source of truth; a
   * failure here is a missing safety net, never a reason to refuse the lock.
   * Never throws.
   */
  async scheduleAutoExpiry(at: number): Promise<void> {
    try {
      await this.nativeModule.scheduleAutoExpiry(at)
    } catch (err) {
      console.warn('NativeBlockingStrategy.scheduleAutoExpiry failed (backstop only, non-fatal):', err)
    }
  }

  // -------------------------------------------------------------------------
  // Beyond `BlockingStrategy` — native-only capabilities. `BlockingStrategy.ts`
  // itself is untouched; these are extra public methods on this class for
  // whichever future caller needs them (the scheduled-trigger auto-arm driver,
  // ARCH_PLAN A4/A6#13, and the shield's session-hold copy, doc `05` §3.7).
  // Callers must narrow to `NativeBlockingStrategy` (e.g. via `strategy.kind
  // === 'native'`) to reach these — they do not exist on `SoftBlockingStrategy`
  // because the soft path has no closed-app backstop or block-screen copy to
  // drive (doc `05` §6 desktop/Android note).
  // -------------------------------------------------------------------------

  /**
   * Closed-app backstop for a `trigger: 'scheduled'` stake's arm moment
   * (doc `05` §3.5, ARCH_PLAN A4's "Backgrounded" / "Killed" rows). Never
   * throws — a missed arm backstop means the scheduled trigger only takes
   * effect once the app is foregrounded, which is the documented, accepted
   * degradation (ARCH_PLAN A4: "This is acceptable and is not a compromise").
   */
  async scheduleScheduledArm(at: number, selection: StakeSelection): Promise<void> {
    if (!selection.selectionId) {
      console.warn('NativeBlockingStrategy.scheduleScheduledArm: selection has no selectionId, skipping')
      return
    }
    try {
      await this.nativeModule.scheduleScheduledArm(at, selection.selectionId)
    } catch (err) {
      console.warn('NativeBlockingStrategy.scheduleScheduledArm failed (backstop only, non-fatal):', err)
    }
  }

  /** Cancels a previously scheduled scheduled-arm backstop, if any. Never throws. */
  async cancelScheduledArm(): Promise<void> {
    try {
      await this.nativeModule.cancelScheduledArm()
    } catch (err) {
      console.warn('NativeBlockingStrategy.cancelScheduledArm failed (non-fatal):', err)
    }
  }

  /**
   * Sets which ShieldConfiguration copy variant to show (doc `05` §3.7).
   * Call alongside `applyShield`. Never throws — a failed call just leaves
   * the shield showing the `session` copy (the default hold), never garbled
   * or missing text.
   */
  async setSessionDisplayHold(hold: 'session' | 'until_done'): Promise<void> {
    try {
      await this.nativeModule.setSessionDisplayHold(hold)
    } catch (err) {
      console.warn('NativeBlockingStrategy.setSessionDisplayHold failed (non-fatal, copy falls back to session):', err)
    }
  }

  /**
   * Reads and clears a pending "Unlock early" tap recorded by the
   * ShieldAction extension (doc `05` §3.8, §3.9). Intended to be polled once
   * on every foreground, alongside `getPermissionStatus()`. Never throws;
   * `null` on any error or when nothing is pending.
   */
  async consumePendingPanicValveIntent(): Promise<number | null> {
    try {
      return await this.nativeModule.consumePendingPanicValveIntent()
    } catch (err) {
      console.warn('NativeBlockingStrategy.consumePendingPanicValveIntent failed, reporting none pending:', err)
      return null
    }
  }

  /** Whether an injected module is present at all (used by `./index.ts` diagnostics). Always true once constructed. */
  hasNativeModule(): boolean {
    return this.nativeModule != null
  }

  /** Diagnostics only: the last `applyShield` outcome, for a future UI to explain a refusal (e.g. "needs a re-pick"). */
  getLastApplyShieldOutcome(): NativeApplyShieldResult | null {
    return this.lastApplyShieldOutcome
  }
}
