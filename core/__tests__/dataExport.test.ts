import { describe, expect, it, vi } from 'vitest'

// Shared spies + a call-order log, defined via `vi.hoisted` so they exist
// before Vitest hoists the `vi.mock(...)` factories below (which reference
// them) above these imports. `callOrder` is what lets the 'wipeAllData
// neutralizes the cloud-push pipeline' test below assert ORDERING, not just
// that each call happened — the safety property only holds if
// resetPushBaselines()/reset() run BEFORE mmkv.clearAll(), see that test.
const { resetPushBaselinesMock, syncStoreResetMock, mmkvClearAllMock, callOrder } = vi.hoisted(() => {
  const callOrder: string[] = []
  return {
    callOrder,
    resetPushBaselinesMock: vi.fn(() => {
      callOrder.push('resetPushBaselines')
    }),
    syncStoreResetMock: vi.fn(() => {
      callOrder.push('syncStore.reset')
    }),
    mmkvClearAllMock: vi.fn(() => {
      callOrder.push('mmkv.clearAll')
    }),
  }
})

// `core/dataExport.ts` also wires `buildExport`/`wipeAllData` to every
// Zustand+MMKV store (that's the "pure-ish" in the file's own header
// comment). Those stores transitively import `react-native`, which Vitest's
// `node` environment cannot parse (Flow syntax) — so importing the module at
// all requires stubbing its store dependencies out first. The stubs mostly
// only need to exist, not behave — except `mmkv` and the syncStore mocks
// just below, which the new 'wipeAllData neutralizes the cloud-push
// pipeline' test at the bottom of this file DOES exercise for real (it
// calls the real `wipeAllData()`), so those two need working `getString`/
// `set`/`clearAll` (mmkv) and `getState`/`resetPushBaselines` (syncStore)
// rather than bare stubs.
vi.mock('@/store/mmkv', () => ({
  mmkv: {
    getString: vi.fn(() => undefined),
    set: vi.fn(),
    clearAll: mmkvClearAllMock,
  },
}))
vi.mock('@/store/taskStore', () => ({
  useTaskStore: { getState: () => ({ tasks: {} }), setState: vi.fn() },
}))
vi.mock('@/store/listStore', () => ({
  useListStore: { getState: () => ({ lists: {}, tags: {} }), setState: vi.fn() },
}))
vi.mock('@/store/projectStore', () => ({
  useProjectStore: { getState: () => ({ projects: {} }), setState: vi.fn() },
}))
vi.mock('@/store/scheduleStore', () => ({
  useScheduleStore: { getState: () => ({ blocks: {}, clear: vi.fn() }) },
}))
vi.mock('@/store/settingsStore', () => ({
  useSettingsStore: { getState: () => ({ settings: {} }) },
}))
vi.mock('@/store/sessionStore', () => ({
  useSessionStore: { getState: () => ({ active: null, history: [] }), setState: vi.fn() },
}))
vi.mock('@/store/eventLogStore', () => ({
  useEventLogStore: { getState: () => ({ events: [], clearEvents: vi.fn() }) },
}))
vi.mock('@/store/proofStore', () => ({
  useProofStore: { getState: () => ({ proofs: [], clear: vi.fn() }) },
}))
// `core/dataExport.ts` also now imports `resetPushBaselines`/`useSyncStore`
// from `@/store/syncStore` (wipeAllData neutralizes the cloud-push pipeline
// before clearing local state — see that function's doc comment). The REAL
// `store/syncStore.ts` transitively imports `@/store/stakesStore` ->
// `constants/featureFlags.ts`, which reads the bare `__DEV__` global at
// module scope — undefined under Vitest's plain-node environment, so
// importing the real module throws `ReferenceError: __DEV__ is not defined`
// before a single test in this file can run. Mocked here with the hoisted
// spies above so the 'wipeAllData neutralizes the cloud-push pipeline' test
// at the bottom of this file can assert both that they were called AND in
// what order. `store/syncStore.ts`'s OWN real behavior (the debounced push
// pipeline, `reconcileTasks`, etc.) is covered directly in
// `core/__tests__/syncStore.test.ts`.
vi.mock('@/store/syncStore', () => ({
  useSyncStore: { getState: () => ({ reset: syncStoreResetMock }) },
  resetPushBaselines: resetPushBaselinesMock,
}))

import {
  DELETE_ACCOUNT_CONFIRM_PHRASE,
  exportFileName,
  isDeleteAccountConfirmed,
  wipeAllData,
} from '@/core/dataExport'

describe('dataExport: isDeleteAccountConfirmed', () => {
  it('matches the exact phrase', () => {
    expect(isDeleteAccountConfirmed(DELETE_ACCOUNT_CONFIRM_PHRASE)).toBe(true)
  })

  it('ignores case (no case-sensitivity trap for a 13+ audience)', () => {
    expect(isDeleteAccountConfirmed('delete')).toBe(true)
    expect(isDeleteAccountConfirmed('Delete')).toBe(true)
    expect(isDeleteAccountConfirmed('dElEtE')).toBe(true)
  })

  it('trims surrounding whitespace', () => {
    expect(isDeleteAccountConfirmed(`  ${DELETE_ACCOUNT_CONFIRM_PHRASE}  `)).toBe(true)
    expect(isDeleteAccountConfirmed(`\n${DELETE_ACCOUNT_CONFIRM_PHRASE}\t`)).toBe(true)
  })

  it('rejects empty, partial, and near-miss input', () => {
    expect(isDeleteAccountConfirmed('')).toBe(false)
    expect(isDeleteAccountConfirmed('DELET')).toBe(false)
    expect(isDeleteAccountConfirmed('DELETE ME')).toBe(false)
    expect(isDeleteAccountConfirmed(' DELETE ACCOUNT ')).toBe(false)
  })

  it('does not match with internal whitespace inserted', () => {
    expect(isDeleteAccountConfirmed('DE LETE')).toBe(false)
  })
})

describe('dataExport: exportFileName', () => {
  it('formats a stable, dated filename', () => {
    const jan5 = new Date(2026, 0, 5, 10, 30).getTime()
    expect(exportFileName(jan5)).toBe('ampora-export-2026-01-05.json')
  })

  it('zero-pads single-digit months and days', () => {
    const mar9 = new Date(2026, 2, 9, 0, 0).getTime()
    expect(exportFileName(mar9)).toBe('ampora-export-2026-03-09.json')
  })
})

describe('dataExport: wipeAllData neutralizes the cloud-push pipeline before clearing', () => {
  // Pins the ordering `wipeAllData`'s own doc comment promises: the wipe is
  // supposed to be device-only and reversible (sign back in to get
  // everything back), which only holds if the debounced push-on-mutation
  // pipeline in `store/syncStore.ts` is neutralized BEFORE this function
  // clears any store — otherwise the very act of clearing would look, to
  // that pipeline's next diff, exactly like the user deleting everything,
  // and the following debounce tick would hard-delete their cloud data. See
  // `core/__tests__/syncStore.test.ts` for the same guarantee proven against
  // the REAL (unmocked) push pipeline, not just this call-order check.
  it('calls resetPushBaselines() and useSyncStore.reset() before clearAll()', () => {
    resetPushBaselinesMock.mockClear()
    syncStoreResetMock.mockClear()
    mmkvClearAllMock.mockClear()
    callOrder.length = 0

    wipeAllData()

    expect(resetPushBaselinesMock).toHaveBeenCalledTimes(1)
    expect(syncStoreResetMock).toHaveBeenCalledTimes(1)
    expect(mmkvClearAllMock).toHaveBeenCalledTimes(1)
    // The actual safety property: both push-pipeline neutralizers ran BEFORE
    // the store was wiped, not just "at some point during the call".
    expect(callOrder.indexOf('resetPushBaselines')).toBeLessThan(callOrder.indexOf('mmkv.clearAll'))
    expect(callOrder.indexOf('syncStore.reset')).toBeLessThan(callOrder.indexOf('mmkv.clearAll'))
  })
})
