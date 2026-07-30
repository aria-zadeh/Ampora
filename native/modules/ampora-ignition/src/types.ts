/**
 * types.ts — the TypeScript surface of the native `AmporaIgnition` Expo
 * module (backed by `../ios/AmporaIgnitionModule.swift`).
 *
 * ⚠️ KEPT IN SYNC BY HAND with `core/blocking/nativeTypes.ts`. That file is a
 * deliberately independent, structural copy of this same shape — it must
 * typecheck on a Windows/web checkout where this whole `native/` tree does not
 * exist and is excluded from `tsconfig.json` (ARCH_PLAN B6). If you change a
 * method signature here, change it there too, by hand. This is intentional
 * duplication, not drift to be "fixed" by importing one from the other.
 *
 * Every method is a Promise because Expo Modules bridges Swift `async`
 * functions to JS Promises automatically. None of them should ever need to be
 * synchronous — synchronous native calls are a much sharper footgun (they
 * block the JS thread) and nothing in the Ignition flow is latency-sensitive
 * enough to need one.
 */

/** Mirrors `FamilyControls.AuthorizationStatus`. Re-checked on every foreground — it can lag (docs/05 §3.1). */
export type IgnitionAuthorizationStatus = 'notDetermined' | 'approved' | 'denied'

/**
 * What `presentActivityPicker()` resolves with. Tokens are OPAQUE strings —
 * see `applicationTokens` below — never app identities (docs/05 §1, §3.2).
 */
export interface NativeStakeSelectionResult {
  /** True when the user dismissed the picker (swipe-down / Cancel) without saving a selection. */
  cancelled: boolean
  /**
   * Handle to re-read the full `FamilyActivitySelection` from the App Group.
   * Null only when `cancelled` is true or a `pickStakeApps` retry failed
   * before a selection was ever persisted.
   */
  selectionId: string | null
  /** "3 apps on the line" — STORED by the native side, not recomputed from the tokens (docs/05 §3.2). */
  count: number
  /**
   * Per-token opaque identifiers, stable ONLY within one encoding of the
   * selection on one OS build. They exist purely so a caller can diff "what
   * did I pick before" vs "what came back now" without ever decoding a real
   * app identity out of them — the actual `ApplicationToken` bytes never
   * leave the native side. A real `ApplicationToken` can change across an OS
   * upgrade (docs/05 §3.6); that instability shows up here as these strings
   * no longer matching, which is the token-mismatch signal `applyShield`
   * surfaces via `NativeApplyShieldResult.reason === 'selection_decode_failed'`.
   */
  applicationTokens: string[]
  categoryTokens: string[]
  webDomainTokens: string[]
  /** Epoch ms. */
  pickedAt: number
}

export type NativeApplyShieldReason =
  /** `selectionId` does not correspond to anything persisted in the App Group. */
  | 'selection_not_found'
  /** The stored `FamilyActivitySelection` failed to decode — the token-mismatch bug (docs/05 §3.6). */
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
 * The full native surface, as registered under the module name `"AmporaIgnition"`
 * (see `Name("AmporaIgnition")` in `AmporaIgnitionModule.swift`). Resolved via
 * `requireOptionalNativeModule<AmporaIgnitionNativeModule>('AmporaIgnition')`
 * in `./index.ts` — never via a static import of a class, so the module can be
 * entirely absent (web, Windows, native flag off) without breaking anything
 * that merely imports this file for types.
 */
export interface AmporaIgnitionNativeModule {
  /** Never throws. Reflects `AuthorizationCenter.shared.authorizationStatus` (nonisolated, synchronous on the native side). */
  getAuthorizationStatus(): Promise<IgnitionAuthorizationStatus>

  /** Shows Apple's Screen Time consent sheet if not already decided. Resolves with the status afterward either way. */
  requestAuthorization(): Promise<IgnitionAuthorizationStatus>

  /**
   * Presents `FamilyActivityPicker` as a modal sheet and resolves once the
   * user saves or dismisses it. `previousSelectionId`, when given, seeds the
   * picker with whatever was previously chosen (re-reading it from the App
   * Group) so re-opening the picker to add/remove an app does not reset the
   * whole selection.
   */
  presentActivityPicker(previousSelectionId?: string | null): Promise<NativeStakeSelectionResult>

  /**
   * Read the selection `selectionId` points at from the App Group and apply
   * it as the ManagedSettings shield (docs/05 §3.3). Never throws — failure
   * modes come back as `{ ok: false, reason }` so the caller can decide
   * whether a re-pick is warranted, but the shield is guaranteed NOT applied
   * when `ok` is false (fail-safe, docs/05 §3.10).
   */
  applyShield(selectionId: string): Promise<NativeApplyShieldResult>

  /** Unconditional, idempotent, never throws (docs/05 §3.4). Safe to call when nothing is shielded. */
  removeShield(): Promise<void>

  /** Never throws; resolves `false` when uncertain. */
  isShieldActive(): Promise<boolean>

  /**
   * Backstop for session end / daily cap / single-session cap / quiet hours
   * (docs/05 §3.5). Schedules a `DeviceActivitySchedule` ending at `atEpochMs`
   * so `intervalDidEnd` removes the shield even with the app closed. Calling
   * again REPLACES the previously scheduled expiry. Never throws.
   */
  scheduleAutoExpiry(atEpochMs: number): Promise<void>

  /** Cancels a previously scheduled auto-expiry, if any. Never throws. */
  cancelScheduledExpiry(): Promise<void>

  /**
   * BEYOND the shared `BlockingStrategy` interface. `applyShield` only ever
   * receives a `StakeSelection` (deliberately — the strategy "has no business
   * knowing about holds, triggers, outcomes or caps", per
   * `core/blocking/BlockingStrategy.ts`), so the ShieldConfiguration extension
   * has no other way to know whether to show the `session` or `until_done`
   * copy variant (docs/05 §3.7). Call this alongside `applyShield` to record
   * which copy to show; omitted or failing calls fall back to the `session`
   * copy (the default hold). Never throws.
   */
  setSessionDisplayHold(hold: 'session' | 'until_done'): Promise<void>

  /**
   * BEYOND the shared `BlockingStrategy` interface (`core/blocking/
   * BlockingStrategy.ts` has no equivalent method) — a closed-app backstop for
   * a `trigger: 'scheduled'` stake's arm moment (docs/05 §3.5, ARCH_PLAN A4).
   * Schedules a `DeviceActivitySchedule` whose interval STARTS at
   * `atEpochMs`, so `intervalDidStart` applies the shield for `selectionId`
   * even if Ampora is not running. The in-app foreground timer / notification
   * path stays the source of truth when the app IS running (ARCH_PLAN A4's
   * "Foregrounded" row) — this exists only for "Backgrounded" / "Killed".
   * Never throws.
   */
  scheduleScheduledArm(atEpochMs: number, selectionId: string): Promise<void>

  /** Cancels a previously scheduled scheduled-arm backstop, if any. Never throws. */
  cancelScheduledArm(): Promise<void>

  /**
   * BEYOND the shared interface. `ShieldActionExtension` cannot show rich UI
   * or run the 60s panic-valve friction itself (docs/05 §3.8), so it writes a
   * timestamp into the App Group and posts the "Open Ampora" notification; the
   * app is expected to call this once on every foreground (alongside
   * re-checking authorization status, docs/05 §3.1) and, if it returns
   * non-null, run the panic-valve friction screen. Reading it CLEARS it, so a
   * second foreground never re-triggers the same intent. Never throws; `null`
   * on any error or when nothing is pending.
   */
  consumePendingPanicValveIntent(): Promise<number | null>
}
