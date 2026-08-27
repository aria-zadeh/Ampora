/**
 * "Park a thought": one-tap intrusive-thought capture from inside a running
 * focus session (`app/focus/session.tsx#handleParkThoughtSubmit` +
 * `components/focus/ParkThoughtSheet.tsx`; PRD FR-5 Inbox, FR-62 Focus
 * session).
 *
 * `handleParkThoughtSubmit` has exactly one effect: it calls the REAL
 * `store/taskStore.ts#createTask` with just a title, the same call
 * `components/capture/BrainDumpSheet.tsx` and quick-add already rely on to
 * land a detail-less capture in the Inbox. This file exercises that real
 * function (not a re-implementation of it) and proves the two contracts the
 * feature depends on.
 *
 *   1. It creates a plain Inbox task: `isInbox: true`, `autoSchedule: false`,
 *      no duration, no due date, no subtasks, no First move. And it does so
 *      for every thought parked in a session, not just the first.
 *   2. It cannot mutate session or stake state. `sessionStore` is the REAL
 *      module (seeded with an active session so there is real, live state to
 *      disturb), and its snapshot is asserted unchanged, field for field,
 *      after `createTask` runs. `stakesStore` cannot be safely imported
 *      under Vitest's plain-node environment: it transitively pulls in
 *      `expo-modules-core` via `core/blocking/nativeModule.ts`, the identical
 *      crash `core/__tests__/syncStore.test.ts`'s own header comment already
 *      documents for this exact module. So it is replaced with spies on
 *      every action `app/focus/session.tsx` uses, and this test asserts none
 *      of them ever fire. `store/taskStore.ts` has zero import of either
 *      store (confirmed by reading it), so a passing test here reflects an
 *      actual absence of a code path, not a coincidence of the mocks.
 *
 * `@/store/mmkv` and `@/services/notifications` are mocked purely so the
 * real store modules can load at all under Vitest's plain-node environment
 * (both transitively touch `react-native`, which the `node` environment
 * cannot parse), the same pattern `core/__tests__/dataExport.test.ts` and
 * `core/__tests__/syncStore.test.ts` already use for the same reason.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/store/mmkv', () => {
  const backing = new Map<string, string>()
  return {
    mmkv: {
      getString: (key: string) => backing.get(key),
      set: (key: string, value: string) => {
        backing.set(key, value)
      },
      remove: (key: string) => {
        backing.delete(key)
      },
      clearAll: () => backing.clear(),
    },
    mmkvStateStorage: {
      getItem: (key: string) => backing.get(key) ?? null,
      setItem: (key: string, value: string) => {
        backing.set(key, value)
      },
      removeItem: (key: string) => {
        backing.delete(key)
      },
    },
  }
})

vi.mock('@/services/notifications', () => ({
  celebrateCompletion: vi.fn(async () => {}),
}))

// `store/stakesStore.ts` itself is never imported by `store/taskStore.ts`.
// This mock exists only so the assertions below can prove that at runtime,
// by asserting zero calls, rather than merely by reading the source.
const stakesSpies = vi.hoisted(() => ({
  startStake: vi.fn(),
  completeStake: vi.fn(),
  serveSession: vi.fn(),
  accrueFocus: vi.fn(),
}))
vi.mock('@/store/stakesStore', () => ({
  useStakesStore: {
    getState: () => ({ activeSession: null, ...stakesSpies }),
  },
}))

const { useTaskStore } = await import('@/store/taskStore')
const { useSessionStore } = await import('@/store/sessionStore')
const { useStakesStore } = await import('@/store/stakesStore')

/** Mirrors `handleParkThoughtSubmit` in `app/focus/session.tsx` exactly: the ONE call it makes. */
function parkThought(text: string) {
  return useTaskStore.getState().createTask({ title: text })
}

beforeEach(() => {
  useTaskStore.setState({ tasks: {} })
  useSessionStore.setState({ active: null, history: {} })
  Object.values(stakesSpies).forEach((spy) => spy.mockClear())
})

describe('park a thought: creates a plain Inbox task', () => {
  it('lands as an Inbox item with just the text: no duration, no due date, no schedule', () => {
    const task = parkThought('email professor about the extension')

    expect(task.title).toBe('email professor about the extension')
    expect(task.isInbox).toBe(true)
    expect(task.autoSchedule).toBe(false)
    expect(task.durationMin).toBe(0)
    expect(task.due).toBeUndefined()
    expect(task.status).toBe('todo')
  })

  it('never runs a breakdown: no subtasks, no First move, no notes', () => {
    const task = parkThought('buy stamps')

    expect(task.subtasks).toEqual([])
    expect(task.firstMove).toBeUndefined()
    expect(task.notes).toBeUndefined()
  })

  it('does not parse the raw text for a date or duration, unlike quick-add', () => {
    // If this ever got routed through `core/quick-add.ts#parseQuickAdd` (the
    // way `BrainDumpSheet` and the typed quick-add field do), a phrase like
    // this would produce a `due` and knock the task out of the Inbox. Park a
    // thought must not do that: it is raw capture, not a task draft.
    const task = parkThought('call mom tomorrow at 5pm')

    expect(task.title).toBe('call mom tomorrow at 5pm')
    expect(task.due).toBeUndefined()
    expect(task.isInbox).toBe(true)
  })

  it('persists into the task store, keyed by the returned id', () => {
    const task = parkThought('return library book')
    expect(useTaskStore.getState().tasks[task.id]).toEqual(task)
  })

  it('captures multiple thoughts in one session as separate Inbox tasks', () => {
    const first = parkThought('email professor')
    const second = parkThought('pay parking ticket')
    const third = parkThought('text Sam back')

    const ids = [first.id, second.id, third.id]
    expect(new Set(ids).size).toBe(3) // all distinct

    const tasks = useTaskStore.getState().tasks
    expect(Object.keys(tasks)).toHaveLength(3)
    for (const t of [first, second, third]) {
      expect(tasks[t.id].isInbox).toBe(true)
    }
    expect(tasks[first.id].title).toBe('email professor')
    expect(tasks[second.id].title).toBe('pay parking ticket')
    expect(tasks[third.id].title).toBe('text Sam back')
  })
})

describe('park a thought: never mutates session or stake state', () => {
  it('leaves an active focus session byte-for-byte unchanged', () => {
    const sessionId = useSessionStore.getState().startSession('task-123', 25)
    useSessionStore.getState().tick(90) // some real, non-zero elapsed time
    useSessionStore.getState().markSubtaskDone('subtask-1')

    const before = JSON.parse(JSON.stringify(useSessionStore.getState()))
    expect(before.active?.id).toBe(sessionId)
    expect(before.active?.elapsedSec).toBe(90)

    parkThought('an intrusive thought')
    parkThought('a second intrusive thought')

    const after = JSON.parse(JSON.stringify(useSessionStore.getState()))
    expect(after).toEqual(before)
  })

  it('never calls a stakes-store action and never touches the active stake', () => {
    parkThought('an intrusive thought')

    expect(stakesSpies.startStake).not.toHaveBeenCalled()
    expect(stakesSpies.completeStake).not.toHaveBeenCalled()
    expect(stakesSpies.serveSession).not.toHaveBeenCalled()
    expect(stakesSpies.accrueFocus).not.toHaveBeenCalled()
    expect(useStakesStore.getState().activeSession).toBeNull()
  })

  it('does not pause or complete the focus session (still active, not in history) after parking a thought', () => {
    useSessionStore.getState().startSession('task-456', 25)

    parkThought('an intrusive thought')

    const state = useSessionStore.getState()
    expect(state.active).not.toBeNull()
    expect(Object.keys(state.history)).toHaveLength(0)
  })
})
