/**
 * BlockingStrategy — the single seam between Ampora's Ignition session logic
 * and however a lock is actually enforced (PRD §9.13, doc `05` §7).
 *
 * All Ignition session logic (holds, caps, panic valve, de-escalation — in
 * `store/stakesStore.ts`) talks ONLY to this interface, never to a platform
 * API directly. That keeps the wellbeing rules identical across:
 *   - SoftBlockingStrategy: an IN-APP focus lock (the active, ship-today impl;
 *     no OS blocking, works on web + dev builds with no entitlement).
 *   - NativeBlockingStrategy: real iOS Family Controls shielding (isolated,
 *     behind `FEATURE_FLAGS.IGNITION_NATIVE`, still a refusing stub today).
 *
 * Consumers must obtain their strategy via `getBlockingStrategy()` in
 * `./index`, never by constructing an implementation directly, so the native
 * impl swaps in by flipping the feature flag with zero call-site changes.
 *
 * Note the shape of `applyShield`: it takes a `StakeSelection` (what to
 * shield), NOT a `StakeSession` (why we are shielding). The strategy has no
 * business knowing about holds, triggers, outcomes or caps — those are the
 * store's, and keeping them out of here is what makes a second platform a
 * drop-in. `removeShield()` correspondingly takes nothing: the store already
 * guarantees a single active session, and the fail-safe direction is "unlock",
 * so an unconditional release is the correct primitive (NFR-7).
 *
 * Portability note: this file is pure TS (a type + a tiny emitter). No
 * react-native / expo / MMKV imports, so it is safe to import anywhere,
 * including on web and in a future server context.
 */

import type { StakeSelection, StakeSession } from '@/types'

/** Whether the platform has granted whatever permission the strategy needs to shield. */
export type BlockingPermissionStatus = 'granted' | 'denied' | 'undetermined'

/**
 * The enforcement contract (doc `05` §7). Implementations: SoftBlockingStrategy
 * (today), NativeBlockingStrategy (iOS Family Controls), and later an Android
 * overlay strategy — all slotting in without touching shared logic.
 */
export interface BlockingStrategy {
  /** Which enforcement backs this strategy. `"soft"` = in-app only, `"native"` = OS shield. */
  readonly kind: 'soft' | 'native'

  /**
   * Current permission state. Soft needs nothing, so it is always `'granted'`.
   * Native reports the Screen Time authorization status, re-checked on every
   * foreground because it can lag (doc `05` §3.1). MUST never throw — an
   * uncertain state resolves `'undetermined'`, never a rejection.
   */
  getPermissionStatus(): Promise<BlockingPermissionStatus>

  /**
   * Ask the OS/user for that permission (Apple's Screen Time consent on iOS).
   * Resolves once the prompt is done; read `getPermissionStatus()` afterwards
   * for the outcome. MUST never throw (doc `05` §3.10).
   */
  requestPermission(): Promise<void>

  /**
   * Present the platform's app picker and resolve with what the user chose.
   * On iOS this is `FamilyActivityPicker` and the tokens are opaque — Ampora
   * can shield them but can never resolve them to app identities, so the UI
   * shows a count, never names (FR-40, NFR-4). On the soft path there is no
   * system picker, so the app's own picker supplies the selection.
   */
  pickStakeApps(): Promise<StakeSelection>

  /**
   * Shield everything in `selection`. Soft: set the in-app "locked" state that
   * the focus/lock UI reads to keep the user on task. Native: write the
   * ManagedSettings shield for the selected tokens.
   *
   * Fail-safe: implementations should resolve (not reject) on internal error
   * and leave the user UNLOCKED, because the product would rather under-lock
   * than trap someone (NFR-7, doc `05` §3.10). Event logging is the store's job.
   */
  applyShield(selection: StakeSelection): Promise<void>

  /**
   * Release the shield. Idempotent and unconditional — safe to call when
   * nothing is locked, and it never second-guesses whether the caller "owns"
   * the lock, because refusing to unlock is the one failure mode this product
   * will not accept.
   */
  removeShield(): Promise<void>

  /** Whether a shield is currently applied. Never throws; resolves `false` when uncertain. */
  isShieldActive(): Promise<boolean>

  /**
   * Schedule an automatic release at `at` (epoch ms) as a backstop for the
   * session end, the daily cap, the single-session cap and the quiet-hours
   * boundary, so a forgotten lock lifts even with the app closed (doc `05`
   * §3.5). The in-app wall clock stays the source of truth — platform events
   * fire prematurely on some iOS versions — so this is a safety net, never the
   * primary mechanism. Calling it again replaces any prior scheduled expiry.
   */
  scheduleAutoExpiry(at: number): Promise<void>
}

// ---------------------------------------------------------------------------
// In-app "lock state" emitter
//
// The SoftBlockingStrategy has no OS shield to point at, so it exposes its
// locked/unlocked state as a tiny observable that the focus/lock UI can
// subscribe to. Kept here (next to the interface) and dependency-free so it
// can be imported from UI without pulling in the store. This is a plain
// synchronous emitter, not an event bus — one value, many listeners.
// ---------------------------------------------------------------------------

/** The app's current in-app lock state, as seen by the focus/lock UI. */
export interface LockState {
  /** True while a soft lock is active. */
  locked: boolean
  /**
   * The session driving the current lock, or null when unlocked. The soft
   * strategy no longer receives a session (it shields a `StakeSelection`), so
   * this is populated by the store via `setLockSession` — the store is the one
   * place that knows which session a lock belongs to.
   */
  session: StakeSession | null
}

/** A subscriber notified whenever the in-app `LockState` changes. */
export type LockStateListener = (state: LockState) => void

/**
 * A minimal synchronous, replay-on-subscribe emitter for the in-app lock
 * state. New subscribers immediately receive the current value. Not exported
 * as a singleton here — `SoftBlockingStrategy` owns the instance and re-exports
 * a subscribe helper, so there is exactly one source of truth for lock state.
 */
export class LockStateEmitter {
  private state: LockState = { locked: false, session: null }
  private readonly listeners = new Set<LockStateListener>()

  /** Current snapshot (safe to read synchronously, e.g. for initial render). */
  getState(): LockState {
    return this.state
  }

  /**
   * Subscribe to lock-state changes. The listener is invoked immediately with
   * the current state (replay), then on every change. Returns an unsubscribe
   * function.
   */
  subscribe(listener: LockStateListener): () => void {
    this.listeners.add(listener)
    listener(this.state)
    return () => {
      this.listeners.delete(listener)
    }
  }

  /** Replace the state and notify listeners (no-op if unchanged by identity). */
  set(next: LockState): void {
    if (next.locked === this.state.locked && next.session === this.state.session) return
    this.state = next
    for (const listener of this.listeners) listener(this.state)
  }
}
