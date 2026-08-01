/**
 * `core/blocking/NativeBlockingStrategy.ts#applyShield` — the fail-safe
 * contract from `docs/05_App_Blocking_Technical.md` §3.10 and §3.6, exercised
 * on a physical phone by `setup/04-test-the-lock.md`'s checklist items 9 and
 * 11 (both flagged there as needing Claude Code, not a device, to trigger):
 *
 *   9.  "A corrupted app selection does not trap anyone." A stored selection
 *       that no longer matches what iOS actually has (token-mismatch / decode
 *       failure, doc `05` §3.6) must never result in a lock with no way out.
 *   11. "Errors fail open, never fail locked." A throw from the native
 *       shield-apply call must leave the user unlocked, never stuck.
 *
 * `NativeBlockingStrategy` is constructor-injected with the native module
 * (see its file header — deliberately never imports `native/**`), so both
 * scenarios are reproduced here with a fake `IgnitionNativeModule` that
 * throws or reports the exact refusal reasons the real Swift side documents
 * in `core/blocking/nativeTypes.ts`. No mocking framework needed.
 *
 * What this file does NOT cover: the "gentle re-pick the apps" UI prompt
 * doc `05` §3.6 also promises for the corrupted-selection case. That prompt
 * is not wired up anywhere yet — `getLastApplyShieldOutcome()` is documented
 * as diagnostics "for a future UI" (see `NativeBlockingStrategy.ts`) and
 * nothing currently reads it. That is a real gap, not something to test here
 * (and not something this suite can reach either way: the UI that would show
 * it, `components/stakes/StakeSetupSheet.tsx`, and the store that would drive
 * it, `store/stakesStore.ts`, are both out of scope for this plain-node
 * Vitest harness — see `core/__tests__/stake-strength-bands.test.ts`).
 */
import { describe, expect, it } from 'vitest'

import { NativeBlockingStrategy } from '@/core/blocking/NativeBlockingStrategy'
import type { IgnitionNativeModule } from '@/core/blocking/nativeTypes'
import type { StakeSelection } from '@/types'

function makeSelection(overrides: Partial<StakeSelection> = {}): StakeSelection {
  return {
    platform: 'ios',
    applicationTokens: ['tok-1'],
    categoryTokens: [],
    webDomainTokens: [],
    count: 1,
    selectionId: 'sel-1',
    pickedAt: Date.now(),
    ...overrides,
  }
}

/**
 * A native module stub. Any method not overridden throws if called, so each
 * test only "wires up" the one entry point it means to exercise and any
 * unexpected call (e.g. `applyShield` reaching native when it should have
 * been refused before that, per item 9) fails the test loudly.
 */
function makeNativeModule(overrides: Partial<IgnitionNativeModule> = {}): IgnitionNativeModule {
  const notWired = (name: string) => (): never => {
    throw new Error(`unexpected call to native ${name}() in this test`)
  }
  return {
    getAuthorizationStatus: notWired('getAuthorizationStatus'),
    requestAuthorization: notWired('requestAuthorization'),
    presentActivityPicker: notWired('presentActivityPicker'),
    applyShield: notWired('applyShield'),
    removeShield: notWired('removeShield'),
    isShieldActive: notWired('isShieldActive'),
    scheduleAutoExpiry: notWired('scheduleAutoExpiry'),
    cancelScheduledExpiry: notWired('cancelScheduledExpiry'),
    scheduleScheduledArm: notWired('scheduleScheduledArm'),
    cancelScheduledArm: notWired('cancelScheduledArm'),
    setSessionDisplayHold: notWired('setSessionDisplayHold'),
    consumePendingPanicValveIntent: notWired('consumePendingPanicValveIntent'),
    ...overrides,
  }
}

describe('NativeBlockingStrategy.applyShield — checklist item 11: errors fail open, never fail locked', () => {
  it('resolves (does not reject) when the native applyShield call throws asynchronously', async () => {
    const nativeModule = makeNativeModule({
      applyShield: async () => {
        throw new Error('native shield-apply blew up')
      },
    })
    const strategy = new NativeBlockingStrategy(nativeModule)

    await expect(strategy.applyShield(makeSelection())).resolves.toBeUndefined()
  })

  it('resolves (does not reject) when the native applyShield call throws synchronously', async () => {
    const nativeModule = makeNativeModule({
      applyShield: (() => {
        throw new Error('native bridge threw before returning a promise')
      }) as unknown as IgnitionNativeModule['applyShield'],
    })
    const strategy = new NativeBlockingStrategy(nativeModule)

    await expect(strategy.applyShield(makeSelection())).resolves.toBeUndefined()
  })

  it('records the failure as unknown_error and leaves the user unlocked (no ok:true outcome) after a throw', async () => {
    const nativeModule = makeNativeModule({
      applyShield: async () => {
        throw new Error('boom')
      },
    })
    const strategy = new NativeBlockingStrategy(nativeModule)

    await strategy.applyShield(makeSelection())

    expect(strategy.getLastApplyShieldOutcome()).toEqual({ ok: false, reason: 'unknown_error' })
  })

  it('a healthy apply still resolves ok:true, so the fail-open path above is provably about the error case, not a strategy that always reports failure', async () => {
    const nativeModule = makeNativeModule({
      applyShield: async () => ({ ok: true }),
    })
    const strategy = new NativeBlockingStrategy(nativeModule)

    await strategy.applyShield(makeSelection())

    expect(strategy.getLastApplyShieldOutcome()).toEqual({ ok: true })
  })
})

describe('NativeBlockingStrategy.applyShield — checklist item 9: a corrupted app selection does not trap anyone', () => {
  it('never reaches native and resolves left-unlocked when the selection carries no selectionId at all', async () => {
    const nativeModule = makeNativeModule() // every method throws if called
    const strategy = new NativeBlockingStrategy(nativeModule)
    const selection = makeSelection({ selectionId: undefined })

    await expect(strategy.applyShield(selection)).resolves.toBeUndefined()
    expect(strategy.getLastApplyShieldOutcome()).toEqual({ ok: false, reason: 'selection_not_found' })
  })

  it('resolves left-unlocked, never throwing, when native reports the stored selectionId no longer matches anything in the App Group (the out-of-sync-with-iOS case)', async () => {
    const nativeModule = makeNativeModule({
      applyShield: async () => ({ ok: false, reason: 'selection_not_found' }),
    })
    const strategy = new NativeBlockingStrategy(nativeModule)

    await expect(strategy.applyShield(makeSelection())).resolves.toBeUndefined()
    expect(strategy.getLastApplyShieldOutcome()).toEqual({ ok: false, reason: 'selection_not_found' })
  })

  it('resolves left-unlocked, never throwing, when native reports the selection failed to decode (doc `05` §3.6\'s token-mismatch bug, e.g. after an OS upgrade)', async () => {
    const nativeModule = makeNativeModule({
      applyShield: async () => ({ ok: false, reason: 'selection_decode_failed' }),
    })
    const strategy = new NativeBlockingStrategy(nativeModule)

    await expect(strategy.applyShield(makeSelection())).resolves.toBeUndefined()
    expect(strategy.getLastApplyShieldOutcome()).toEqual({ ok: false, reason: 'selection_decode_failed' })
  })
})
