import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// ---------------------------------------------------------------------------
// Structural guard on the paid-lock gate.
//
// WHY THIS IS A SOURCE-TEXT TEST, which is otherwise a bad idea.
//
// `core/entitlements.ts`'s `canUseLock` is a pure function and is properly
// unit-tested in `entitlements.test.ts`. What that cannot tell you is whether
// the gate is actually WIRED at every path that can arm a lock, which is the
// failure that would matter: a correct predicate nobody calls is worth
// nothing, and a gate covering three of four call sites reads exactly like a
// gate covering four.
//
// The obvious way to test the wiring is to import `store/stakesStore.ts` and
// drive it. That does not work here, and it was attempted rather than assumed:
// the store transitively reaches Expo's winter runtime, which throws
// `Cannot find module './ImportMetaRegistry'` under Vitest's plain-node
// environment no matter which of `react-native`, `expo-modules-core`,
// `@/core/blocking`, `@/store/mmkv` or `@/services/notifications` is mocked.
// `core/__tests__/dataExport.test.ts` and `syncStore.test.ts` both document
// hitting the same wall from different directions.
//
// So this asserts the SHAPE of the gate instead. It is deliberately narrow: it
// pins the number of arming entry points and the number of enforcement calls,
// so that ADDING either without thinking about entitlement breaks a build with
// a message saying why. It cannot prove the gate returns the right answer.
// `entitlements.test.ts` does that. The two together are what the store test
// would have given, minus the store's runtime behaviour.
//
// If you are here because this test failed: you probably added a new way to
// arm or shield. That is fine. Gate it, then update the count and the comment.
// ---------------------------------------------------------------------------

const SOURCE = readFileSync(
  join(process.cwd(), 'store', 'stakesStore.ts'),
  'utf8'
)

/** Count non-overlapping occurrences of a plain substring. */
function count(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1
}

describe('stakesStore: the paid-lock gate is wired, not just defined', () => {
  it('imports the entitlement predicate at all', () => {
    expect(SOURCE).toContain("import { canUseLock } from '@/core/entitlements'")
  })

  it('gates every arming entry point', () => {
    // Three call sites, audited individually 2026-08-25:
    //   1. `wellbeingGate`  - the shared pre-flight, behind `canStartStake`,
    //      which is what every screen asks before offering to arm.
    //   2. `startStake`     - the real arm. Deliberately repeats the check
    //      rather than calling `wellbeingGate`, so the pre-flight and the arm
    //      cannot disagree and show "you're good to go" then refuse.
    //   3. `scheduleStake`  - arming later still commits to a paid lock.
    // `autoArmDueStakes` needs no check of its own: it arms by calling
    // `startStake`, so it inherits #2.
    expect(count(SOURCE, 'canUseLock(')).toBe(3)
  })

  it('has exactly two shield-application sites, both accounted for', () => {
    // 1. inside `startStake`, downstream of the gate above.
    // 2. inside `reconcileActiveSession`, which is CORRECTLY ungated: it can
    //    only re-assert a shield for a session that is already started, still
    //    live at the OS level, inside the daily cap, outside quiet hours and
    //    not stale. It cannot create a lock, so it is not an arming path, and
    //    gating it would yank the lock out from under someone mid-session if
    //    their subscription lapsed while they were serving it.
    expect(count(SOURCE, 'strategy.applyShield(')).toBe(2)
  })

  it('refuses with a reason the caller can act on', () => {
    // The refusal is a distinct reason rather than being folded into a
    // wellbeing refusal, because "quiet hours" when the truth is "this is a
    // paid feature" is a lie of omission, and only one of the two is something
    // the user can do anything about.
    expect(SOURCE).toContain("reason: 'not_entitled'")
  })
})
