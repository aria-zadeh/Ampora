/**
 * BlockingStrategy — the single seam between Ampora's Ignition session logic
 * and however a lock is actually enforced (PRD §9.13, doc 06 §7).
 *
 * All Ignition session logic (caps, panic valve, de-escalation — in
 * `store/stakesStore.ts`) talks ONLY to this interface, never to a platform
 * API directly. That keeps the wellbeing/caps logic identical across:
 *   - SoftBlockingStrategy: an IN-APP focus lock (the active, ship-today impl;
 *     no OS blocking, works on web + dev builds with no entitlement).
 *   - NativeBlockingStrategy: real iOS Family Controls shielding (isolated,
 *     behind `FEATURE_FLAGS.IGNITION_NATIVE`, not wired into the build yet).
 *
 * Consumers must obtain their strategy via `getBlockingStrategy()` in
 * `./index`, never by constructing an implementation directly, so the native
 * impl swaps in by flipping the feature flag with zero call-site changes.
 *
 * Portability note: this file is pure TS (a type + a tiny emitter). No
 * react-native / expo / MMKV imports, so it is safe to import anywhere,
 * including on web and in a future server context.
 */

import type { StakeSession } from '@/types'

/**
 * The enforcement contract. Kept intentionally small — richer platform
 * concerns (picking apps, permission status enums, auto-expiry scheduling
 * from doc 06 §7) are the native impl's private business and are added there
 * when the entitlement lands; the shared session logic only needs these.
 */
export interface BlockingStrategy {
  /** Which enforcement backs this strategy. `"soft"` = in-app only, `"native"` = OS shield. */
  readonly kind: 'soft' | 'native'

  /**
   * Whether this strategy can enforce a lock in the current environment.
   * Soft is always available; native is only available on a build with the
   * Family Controls entitlement + native module present.
   */
  isAvailable(): boolean

  /**
   * Ask the OS/user for whatever permission the strategy needs before it can
   * lock (Screen Time consent on iOS). Resolves `true` if authorized. Soft
   * needs nothing, so it resolves `true` immediately. MUST never throw —
   * fail-safe returns `false` rather than rejecting (doc 06 §3.10).
   */
  requestAuthorization(): Promise<boolean>

  /**
   * Apply the lock for `session`. Soft: set the in-app "locked" state that the
   * focus/lock UI reads to keep the user on task. Native: apply the
   * ManagedSettings shield for the selected app tokens.
   *
   * Fail-safe: implementations should resolve (not reject) on internal error
   * and leave the user UNLOCKED, because the product would rather under-lock
   * than trap someone (NFR-7, doc 06 §3.10). Event logging is the store's job.
   */
  applyShield(session: StakeSession): Promise<void>

  /**
   * Remove the lock for `session` (completion, panic valve, cap, quiet hours,
   * or recovery). Soft: clear the in-app "locked" state. Native: clear the
   * shield tokens. Idempotent — safe to call when nothing is locked.
   */
  removeShield(session: StakeSession): Promise<void>
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
  /** The session driving the current lock, or null when unlocked. */
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
