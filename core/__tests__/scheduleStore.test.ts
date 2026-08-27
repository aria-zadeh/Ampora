import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ScheduleInput } from '@/core/scheduler/types'

// ---------------------------------------------------------------------------
// `store/scheduleStore.ts` isn't under `core/`, but this is where its tests
// live, matching `core/__tests__/syncStore.test.ts` (the vitest config's
// `include: ['core/**/__tests__/**/*.test.ts']` picks it up fine from here).
//
// What this file exists to pin down is NARROW and specific: that the settings
// the user can actually move in the Settings screen reach the scheduling
// engine. The engine itself is pure and exhaustively covered elsewhere
// (`recompute.test.ts`, `placement.test.ts`, `nfr.test.ts`); none of that
// catches a store that computes a perfectly good `ScheduleInput` and then
// forgets to put a field in it. `autoScheduleCutoffWeeks` shipped in exactly
// that state - a real Settings stepper, a real `Settings` field, a real
// engine parameter, and nothing connecting the two, so the engine silently
// used its own DEFAULT_CUTOFF_DAYS (14) while the UI displayed 4 weeks. The
// sibling `workloadDistribution` line carries a comment warning about the
// same trap, which is evidence this failure mode recurs here rather than
// being a one-off.
//
// Testing the real module means letting it load, which means mocking every
// native/network surface it imports: `@/store/mmkv` (MMKV), `react-native`
// (AppState), and `@/services/calendarSync` (expo-calendar). The engine is
// mocked too, but only to CAPTURE the input it was handed - the assertion is
// about what the store passes, not about what the engine then does with it.
// ---------------------------------------------------------------------------

const capturedInputs: ScheduleInput[] = []

vi.mock('@/store/mmkv', () => ({
  mmkvStateStorage: {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
  },
  // `store/settingsStore.ts` imports the raw `mmkv` handle as well as the
  // zustand storage adapter, so both have to exist on the mock or its import
  // fails at module scope.
  mmkv: {
    getString: () => undefined,
    set: () => {},
    delete: () => {},
    getBoolean: () => undefined,
    getNumber: () => undefined,
  },
}))

// `store/taskStore.ts` imports `celebrateCompletion` from here, and the real
// module pulls in expo-notifications/expo-haptics, whose package entry
// initialises Expo's winter runtime and fails outright under plain node
// (`Cannot find module './ImportMetaRegistry'`). Nothing in this file's
// assertions touches notifications.
vi.mock('@/services/notifications', () => ({
  celebrateCompletion: () => {},
  scheduleTaskReminders: () => {},
  cancelTaskReminders: () => {},
}))

vi.mock('react-native', () => ({
  AppState: { addEventListener: () => ({ remove: () => {} }), currentState: 'active' },
}))

vi.mock('@/services/calendarSync', () => ({
  fetchBusyEvents: async () => [],
  getEnabledCalendarIds: async () => [],
}))

vi.mock('@/core/scheduler', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/core/scheduler')>()
  return {
    ...actual,
    recompute: (input: ScheduleInput) => {
      capturedInputs.push(input)
      return { blocks: [], unschedulable: [] }
    },
  }
})

// `constants/featureFlags.ts` and Expo's own `async-require/setup.ts` both
// read the bare `__DEV__` global at module scope. It does not exist in
// Vitest's plain-node environment, so the import below throws
// `ReferenceError: __DEV__ is not defined` before a single test runs - the
// same wall `core/__tests__/dataExport.test.ts` and `syncStore.test.ts` both
// document hitting. They dodged it by mocking the offending modules; this
// file needs the real store, so it defines the global instead. `false` is the
// production-correct value (it is what a release build inlines), which also
// keeps `FEATURE_FLAGS.DEV_BYPASS_AUTH` off here.
;(globalThis as { __DEV__?: boolean }).__DEV__ = false

const { useScheduleStore } = await import('@/store/scheduleStore')
const { useSettingsStore } = await import('@/store/settingsStore')

/** Run one recompute and return the `ScheduleInput` the engine was handed. */
function recomputeAndCapture(): ScheduleInput {
  capturedInputs.length = 0
  useScheduleStore.getState().recompute()
  expect(capturedInputs).toHaveLength(1)
  return capturedInputs[0]
}

describe('scheduleStore: Settings reach the engine', () => {
  beforeEach(() => {
    capturedInputs.length = 0
  })

  it('passes the auto-schedule cutoff through as days, not weeks', () => {
    useSettingsStore.setState((s) => ({
      settings: { ...s.settings, autoScheduleCutoffWeeks: 6 },
    }))
    expect(recomputeAndCapture().cutoffDays).toBe(42)
  })

  it('tracks a change to the cutoff rather than caching the first value', () => {
    useSettingsStore.setState((s) => ({
      settings: { ...s.settings, autoScheduleCutoffWeeks: 1 },
    }))
    expect(recomputeAndCapture().cutoffDays).toBe(7)

    useSettingsStore.setState((s) => ({
      settings: { ...s.settings, autoScheduleCutoffWeeks: 12 },
    }))
    expect(recomputeAndCapture().cutoffDays).toBe(84)
  })

  it('falls back to the 4 weeks the Settings row itself renders when unset', () => {
    // Not DEFAULT_CUTOFF_DAYS (14). `SchedulingSettings.tsx` displays
    // `autoScheduleCutoffWeeks ?? 4`, so an unset value must plan the 28 days
    // the user is being shown, not the engine's bare default. This assertion
    // is the whole point of the `?? 4` in the store.
    useSettingsStore.setState((s) => {
      const next = { ...s.settings }
      delete next.autoScheduleCutoffWeeks
      return { settings: next }
    })
    expect(recomputeAndCapture().cutoffDays).toBe(28)
  })

  it('still passes the workload preference through', () => {
    // The neighbouring field, asserted here so the two cannot drift apart
    // again without a test noticing.
    useSettingsStore.setState((s) => ({
      settings: { ...s.settings, workloadDistribution: 'frontload' },
    }))
    expect(recomputeAndCapture().workload).toBe('frontload')
  })
})
