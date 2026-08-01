/**
 * SoftBlockingStrategy — the ACTIVE Ignition enforcement.
 *
 * This is the "soft lock" that works TODAY on web and dev builds with NO Apple
 * entitlement and NO native module. It does NOT block apps at the OS level.
 * Instead it drives an IN-APP focus lock: `applyShield` flips a shared in-app
 * "locked" state that the focus/lock UI subscribes to (via
 * `subscribeLockState`), and `removeShield` clears it. The commitment here is
 * behavioral, not system-enforced — which is exactly what ships without the
 * Family Controls (Distribution) entitlement.
 *
 * Pure TS: no native imports, no MMKV, no react-native. Safe on web.
 *
 * NOTE on separation of concerns: this strategy owns ONLY the in-app lock
 * *state*. LockEvent logging, holds, wellbeing caps, quiet hours, panic-valve
 * friction and de-escalation all live in `store/stakesStore.ts` (§9.10), so the
 * same wellbeing rules apply no matter which strategy is active.
 */

import type { StakeSelection, StakeSession } from '@/types'
import {
  type BlockingPermissionStatus,
  type BlockingStrategy,
  type LockState,
  type LockStateListener,
  LockStateEmitter,
} from './BlockingStrategy'

/**
 * The single in-app lock-state emitter. Module-level so there is exactly one
 * source of truth for "is the app soft-locked" across the whole app, and the
 * lock UI can subscribe without holding a strategy reference. Deliberately NOT
 * persisted: a soft lock must not survive a reload, which is why
 * `stakesStore.reconcileActiveSession` exists.
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

/**
 * Attach (or clear) the session a live lock belongs to. `applyShield` now takes
 * only a `StakeSelection`, so the strategy cannot know which session is driving
 * the lock — the store does, and it calls this right after arming so the lock
 * UI can render "N minutes left" and the panic valve. Clearing is implicit:
 * `removeShield()` resets the whole lock state.
 */
export function setLockSession(session: StakeSession | null): void {
  const current = lockState.getState()
  if (!current.locked) return
  lockState.set({ locked: true, session })
}

export class SoftBlockingStrategy implements BlockingStrategy {
  readonly kind = 'soft' as const

  /** No OS permission is involved in an in-app lock. */
  async getPermissionStatus(): Promise<BlockingPermissionStatus> {
    return 'granted'
  }

  /** Nothing to request. Resolves immediately. */
  async requestPermission(): Promise<void> {
    // Intentionally empty: the soft lock needs no platform consent.
  }

  /**
   * There is no system picker on the soft path, so this resolves an INERT empty
   * selection rather than pretending to have picked something — and an empty
   * selection makes `startStake` refuse with `'no_selection'`, which is the
   * honest outcome. The real selection is built by
   * `components/stakes/AppPicker.tsx` (a UI file, so it may read `Platform`)
   * and handed to `stakesStore.setSelection`. `platform` is the generic `'web'`
   * here precisely because this object carries no tokens to attribute.
   */
  async pickStakeApps(): Promise<StakeSelection> {
    return {
      platform: 'web',
      applicationTokens: [],
      categoryTokens: [],
      webDomainTokens: [],
      count: 0,
      pickedAt: Date.now(),
    }
  }

  /** Set the in-app "locked" state. Never throws (fail-safe). */
  async applyShield(_selection: StakeSelection): Promise<void> {
    // The selection is not used on the soft path (there is nothing to shield at
    // the OS level); the lock is the in-app state itself. It is still part of
    // the signature so the store's call site is identical for both strategies.
    lockState.set({ locked: true, session: lockState.getState().session })
  }

  /**
   * Clear the in-app lock. Unconditional and idempotent: no ownership check,
   * because "refused to unlock" is the one failure this product will not accept
   * (NFR-7). The store already guarantees a single active session.
   */
  async removeShield(): Promise<void> {
    lockState.set({ locked: false, session: null })
  }

  /** Whether the in-app lock is currently set. */
  async isShieldActive(): Promise<boolean> {
    return lockState.getState().locked
  }

  /**
   * No-op on the soft path. There is nothing to shield while the app is closed,
   * so there is nothing to auto-expire out of band — the store's in-app tick and
   * `reconcileActiveSession` are the release mechanism, and a soft lock does not
   * survive a reload anyway. The native strategy schedules a real
   * DeviceActivity monitor here (doc `05` §3.5).
   */
  async scheduleAutoExpiry(_at: number): Promise<void> {
    // Intentionally empty; see the docstring for why this is correct, not a gap.
  }
}

/** A ready-to-use shared instance (the strategy is stateless beyond the module-level emitter). */
export const softBlockingStrategy = new SoftBlockingStrategy()
