/**
 * nativeTypes.ts — the LOCAL, structural copy of the Ampora Ignition native
 * module's TS surface (ARCH_PLAN B6).
 *
 * Deliberately NOT imported from `native/modules/ampora-ignition/src/types.ts`
 * even though the two files describe the identical shape: this file must
 * typecheck on a Windows/web checkout where the whole `native/` tree does not
 * exist and is excluded from `tsconfig.json`. `tsc` on Windows must never need
 * `native/**` to exist, which is only true if nothing under `core/` imports
 * from it. Keep the two files in sync BY HAND when the native surface
 * changes — `native/modules/ampora-ignition/src/types.ts` carries a matching
 * comment pointing back here.
 *
 * Every method is a Promise: Expo Modules bridges Swift `async` functions to
 * JS Promises automatically, and nothing in the Ignition flow needs a
 * synchronous native call (which would block the JS thread — a much sharper
 * footgun than any latency a Promise adds here).
 */

/** Mirrors `FamilyControls.AuthorizationStatus`. Re-check on every foreground — it can lag (docs/05 §3.1). */
export type IgnitionAuthorizationStatus = 'notDetermined' | 'approved' | 'denied'

/**
 * What `presentActivityPicker()` resolves with. Tokens are OPAQUE strings —
 * see `applicationTokens` below — never app identities (docs/05 §1, §3.2).
 */
export interface NativeStakeSelectionResult {
  /** True when the sheet closed with nothing chosen (Cancel, or a confirmed empty pick — see the Swift side for why the two are not distinguished). */
  cancelled: boolean
  /** Handle to re-read the full selection from the App Group. Null when `cancelled` is true. */
  selectionId: string | null
  /** "3 apps on the line" — STORED by the native side, not recomputed from the tokens (docs/05 §3.2). */
  count: number
  /**
   * Per-token opaque identifiers, stable ONLY within one encoding of the
   * selection on one OS build — exist purely so a caller can diff "what did I
   * pick before" vs "what came back now" without the real `ApplicationToken`
   * bytes ever leaving the native side. An OS upgrade can change how a real
   * token encodes (docs/05 §3.6); that instability shows up here as these
   * strings no longer matching, which is exactly the signal `applyShield`
   * surfaces as `reason: 'selection_decode_failed'`.
   */
  applicationTokens: string[]
  categoryTokens: string[]
  webDomainTokens: string[]
  /** Epoch ms. */
  pickedAt: number
}

export type NativeApplyShieldReason =
  /** `selectionId` does not correspond to anything persisted in the App Group, or it failed to decode (the token-mismatch bug, docs/05 §3.6). */
  | 'selection_not_found'
  | 'selection_decode_failed'
  /** Screen Time authorization is not `.approved` right now. */
  | 'authorization_not_approved'
  /** The selection resolved to an "everything" category and was refused (docs/05 §4). */
  | 'all_apps_category_rejected'
  /** Anything else. Fail-safe: treated identically to every other reason — leave the user unlocked. */
  | 'unknown_error'

export interface NativeApplyShieldResult {
  ok: boolean
  /** Present only when `ok` is false. */
  reason?: NativeApplyShieldReason
}

/**
 * The full native surface, registered under the module name `"AmporaIgnition"`
 * (`Name("AmporaIgnition")` in `native/modules/ampora-ignition/ios/
 * AmporaIgnitionModule.swift`). Resolved via `requireOptionalNativeModule
 * <IgnitionNativeModule>('AmporaIgnition')` in `./nativeModule.ts` — a module
 * NAME, never a class import, so Metro has nothing to statically resolve.
 *
 * The first seven methods below mirror `BlockingStrategy` 1:1 (docs/05 §7):
 * `getAuthorizationStatus`/`requestAuthorization` back `getPermissionStatus`/
 * `requestPermission`; `presentActivityPicker` backs `pickStakeApps`;
 * `applyShield`/`removeShield`/`isShieldActive`/`scheduleAutoExpiry` share
 * their names outright. The rest are BEYOND the shared interface — native-only
 * capabilities `NativeBlockingStrategy` exposes as extra public methods for
 * whichever future caller needs them (the scheduled-trigger auto-arm driver,
 * ARCH_PLAN A4/A6#13, and the shield's session-hold copy, docs/05 §3.7) —
 * `BlockingStrategy.ts` itself is untouched.
 */
export interface IgnitionNativeModule {
  /** Never throws. Reflects `AuthorizationCenter.shared.authorizationStatus` (nonisolated, synchronous on the native side). */
  getAuthorizationStatus(): Promise<IgnitionAuthorizationStatus>

  /** Shows Apple's Screen Time consent sheet if not already decided. Resolves with the status afterward either way. */
  requestAuthorization(): Promise<IgnitionAuthorizationStatus>

  /**
   * Presents `FamilyActivityPicker` as a modal sheet and resolves once the
   * user saves or dismisses it. `previousSelectionId`, when given, seeds the
   * picker with whatever was previously chosen (re-read from the App Group)
   * so re-opening it to add/remove an app does not reset everything.
   */
  presentActivityPicker(previousSelectionId?: string | null): Promise<NativeStakeSelectionResult>

  /**
   * Reads the selection `selectionId` points at from the App Group and
   * applies it as the ManagedSettings shield (docs/05 §3.3). Never throws —
   * failures come back as `{ ok: false, reason }` and the shield is
   * guaranteed NOT applied when `ok` is false (fail-safe, docs/05 §3.10).
   */
  applyShield(selectionId: string): Promise<NativeApplyShieldResult>

  /** Unconditional, idempotent, never throws (docs/05 §3.4). Safe to call when nothing is shielded. */
  removeShield(): Promise<void>

  /** Never throws; resolves `false` when uncertain. */
  isShieldActive(): Promise<boolean>

  /**
   * Backstop for session end / daily cap / single-session cap / quiet hours
   * (docs/05 §3.5). Schedules a native `DeviceActivitySchedule` ending at
   * `atEpochMs` so the shield releases even with the app closed. Calling
   * again REPLACES the previously scheduled expiry. Never throws.
   */
  scheduleAutoExpiry(atEpochMs: number): Promise<void>

  /** Cancels a previously scheduled auto-expiry, if any. Never throws. */
  cancelScheduledExpiry(): Promise<void>

  /**
   * BEYOND `BlockingStrategy` — a closed-app backstop for a
   * `trigger: 'scheduled'` stake's arm moment (docs/05 §3.5, ARCH_PLAN A4).
   * Applies the shield for `selectionId` at `atEpochMs` even if Ampora is not
   * running. The in-app foreground timer / notification path stays the
   * source of truth when the app IS running — this exists only for the
   * "Backgrounded" / "Killed" rows of ARCH_PLAN A4's auto-arm table. Never
   * throws.
   */
  scheduleScheduledArm(atEpochMs: number, selectionId: string): Promise<void>

  /** Cancels a previously scheduled scheduled-arm backstop, if any. Never throws. */
  cancelScheduledArm(): Promise<void>

  /**
   * BEYOND `BlockingStrategy`. `applyShield` only ever receives a
   * `StakeSelection` (deliberately — see `BlockingStrategy.ts`'s docstring:
   * the strategy "has no business knowing about holds, triggers, outcomes or
   * caps"), so the ShieldConfiguration extension has no other way to know
   * whether to show the `session` or `until_done` copy variant (docs/05
   * §3.7). Call this alongside `applyShield`; omitted or failing calls fall
   * back to the `session` copy (the default hold). Never throws.
   */
  setSessionDisplayHold(hold: 'session' | 'until_done'): Promise<void>

  /**
   * BEYOND `BlockingStrategy`. `ShieldActionExtension` cannot show rich UI or
   * run the 60s panic-valve friction itself (docs/05 §3.8), so it writes a
   * timestamp into the App Group and posts a notification; call this once on
   * every foreground (alongside re-checking authorization status, docs/05
   * §3.1) and, if it resolves non-null, run the panic-valve friction screen.
   * Reading it CLEARS it, so a second foreground never replays the same
   * intent. Never throws; `null` on any error or when nothing is pending.
   */
  consumePendingPanicValveIntent(): Promise<number | null>
}
