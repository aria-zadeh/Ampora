/**
 * SoftBlockingStrategy — the ACTIVE Ignition enforcement (Phase 5).
 *
 * This is the "soft lock" that works TODAY on web and dev builds with NO
 * Apple entitlement and NO native module. It does NOT block apps at the OS
 * level. Instead it drives an IN-APP focus lock: `applyShield` flips a shared
 * in-app "locked" state that the focus/lock UI subscribes to (via
 * `subscribeLockState`) to keep the user on task, and `removeShield` clears
 * it. The commitment here is behavioral, not system-enforced — which is
 * exactly what we can ship without the Family Controls (Distribution)
 * entitlement the user does not have yet.
 *
 * Pure TS: no native imports, no MMKV, no react-native. Safe on web.
 *
 * NOTE on separation of concerns: this strategy owns ONLY the in-app lock
 * *state*. LockEvent logging, wellbeing caps, quiet hours, panic-valve
 * friction, and de-escalation all live in `store/stakesStore.ts` (§9.10), so
 * the same wellbeing rules apply no matter which strategy is active.
 */

import type { StakeSession } from '@/types'
import {
  type BlockingStrategy,
  type LockState,
  type LockStateListener,
  LockStateEmitter,
} from './BlockingStrategy'

/**
 * The single in-app lock-state emitter. Module-level so there is exactly one
 * source of truth for "is the app soft-locked" across the whole app, and the
 * lock UI can subscribe without holding a strategy reference.
 */
const lockState = new LockStateEmitter()

/** Subscribe the focus/lock UI to in-app lock changes. Replays current state; returns an unsubscribe fn. */
export function subscribeLockState(listener: LockStateListener): () => void {
  return lockState.subscribe(listener)
}

/** Read the current in-app lock state synchronously (e.g. for initial render). */
export function getLockState(): LockState {
  return lockState.getState()
}

export class SoftBlockingStrategy implements BlockingStrategy {
  readonly kind = 'soft' as const

  /** The in-app lock is always available — no OS support required. */
  isAvailable(): boolean {
    return true
  }

  /** No permission needed for an in-app lock. Resolves true. */
  async requestAuthorization(): Promise<boolean> {
    return true
  }

  /** Set the in-app "locked" state for this session. Never throws (fail-safe). */
  async applyShield(session: StakeSession): Promise<void> {
    lockState.set({ locked: true, session })
  }

  /**
   * Clear the in-app lock. Idempotent: only clears if the given session is the
   * one currently locking (or if it is called with the active session), so a
   * stale removeShield for an already-replaced session cannot unlock a newer
   * one. If nothing is locked, this is a no-op.
   */
  async removeShield(session: StakeSession): Promise<void> {
    const current = lockState.getState()
    if (!current.locked) return
    if (current.session && current.session.id !== session.id) return
    lockState.set({ locked: false, session: null })
  }
}

/** A ready-to-use shared instance (the strategy is stateless beyond the module-level emitter). */
export const softBlockingStrategy = new SoftBlockingStrategy()
