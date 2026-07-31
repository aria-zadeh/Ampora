import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Task } from '@/types'

// ---------------------------------------------------------------------------
// `store/syncStore.ts` isn't under `core/`, but this is where its own tests
// live — `core/dataExport.ts`'s doc comment on `wipeAllData` already promised
// a `core/__tests__/syncStore.test.ts`; this is that file, and the vitest
// config's `include: ['core/**/__tests__/**/*.test.ts']` picks it up fine
// from here.
//
// Testing the real module means letting it actually load, which means
// mocking every store/service it imports: `@/store/mmkv` and
// `@/services/supabase` both touch native/network surfaces Vitest's
// plain-node environment can't run, and `@/store/stakesStore` transitively
// pulls in `constants/featureFlags.ts`'s bare `__DEV__` reference (undefined
// under Vitest) — the same crash `core/__tests__/dataExport.test.ts` hit.
// `useSyncStore`, `diffRecord`, `makeRecordPusher`, and `resetPushBaselines`
// are NOT mocked — those are the real implementation under test, exercised
// through fake-but-functional (get/set/subscribe) store stand-ins and a tiny
// in-memory "cloud" for tasks so ordering (not just call counts) is provable.
// ---------------------------------------------------------------------------

const {
  fakeTaskStore,
  fakeSettingsStore,
  fakeListStore,
  fakeProjectStore,
  fakeStakesStore,
  fakeProofStore,
  fakeEventLogStore,
  fakeCloudTasks,
  supabaseMocks,
  fakeUser,
} = vi.hoisted(() => {
  function makeFakeStore<S extends object>(initialState: S) {
    let state = initialState
    const listeners = new Set<(state: S, prevState: S) => void>()
    return {
      getState: () => state,
      setState: (partial: Partial<S> | ((s: S) => Partial<S>)) => {
        const prevState = state
        const patch =
          typeof partial === 'function' ? (partial as (s: S) => Partial<S>)(state) : partial
        state = { ...state, ...patch }
        listeners.forEach((l) => l(state, prevState))
      },
      subscribe: (listener: (state: S, prevState: S) => void) => {
        listeners.add(listener)
        return () => listeners.delete(listener)
      },
      /** Test-only: overwrite state WITHOUT notifying subscribers — for between-test cleanup, so resetting never itself schedules a phantom push. */
      __resetSilently: (next: S) => {
        state = next
      },
    }
  }

  const fakeTaskStore = makeFakeStore<{ tasks: Record<string, Task> }>({ tasks: {} })
  const fakeSettingsStore = makeFakeStore<{ settings: Record<string, unknown> }>({
    settings: { reminderKinds: [], notificationNudgeDismissed: false },
  })
  const fakeListStore = makeFakeStore<{
    lists: Record<string, unknown>
    tags: Record<string, unknown>
  }>({ lists: {}, tags: {} })
  const fakeProjectStore = makeFakeStore<{ projects: Record<string, unknown> }>({ projects: {} })
  const fakeStakesStore = makeFakeStore<{
    sessions: Record<string, unknown>
    events: unknown[]
  }>({ sessions: {}, events: [] })
  const fakeProofStore = makeFakeStore<{ proofs: Record<string, unknown> }>({ proofs: {} })
  const fakeEventLogStore = makeFakeStore<{ events: unknown[] }>({ events: [] })

  // A tiny in-memory "cloud" for tasks specifically — shared by the
  // pull/upsert/delete mocks below, so tests can prove ORDERING (did a
  // delete actually land before the next pull reads it back?), not just that
  // each mock function was called at some point.
  const fakeCloudTasks: Record<string, Task> = {}

  const fakeUser = { id: 'user-1' }

  const supabaseMocks = {
    getCurrentUser: vi.fn(async () => fakeUser as unknown),
    pullTasks: vi.fn(async () => Object.values(fakeCloudTasks)),
    upsertTask: vi.fn(async (task: Task) => {
      fakeCloudTasks[task.id] = task
    }),
    deleteTask: vi.fn(async (id: string) => {
      delete fakeCloudTasks[id]
    }),
    deleteTasks: vi.fn(async (ids: string[]) => {
      for (const id of ids) delete fakeCloudTasks[id]
    }),
    pullSettings: vi.fn(async () => null),
    upsertSettings: vi.fn(async () => {}),
    pullLists: vi.fn(async () => []),
    upsertLists: vi.fn(async () => {}),
    deleteLists: vi.fn(async () => {}),
    pullTags: vi.fn(async () => []),
    upsertTags: vi.fn(async () => {}),
    deleteTags: vi.fn(async () => {}),
    pullProjects: vi.fn(async () => []),
    upsertProjects: vi.fn(async () => {}),
    deleteProjects: vi.fn(async () => {}),
    pullStakeSessions: vi.fn(async () => []),
    upsertStakeSessions: vi.fn(async () => {}),
    deleteStakeSessions: vi.fn(async () => {}),
    pullLockEvents: vi.fn(async () => []),
    upsertLockEvents: vi.fn(async () => {}),
    pullProofs: vi.fn(async () => []),
    upsertProofs: vi.fn(async () => {}),
    deleteProofs: vi.fn(async () => {}),
    pullAppEvents: vi.fn(async () => []),
    upsertAppEvents: vi.fn(async () => {}),
  }

  return {
    fakeTaskStore,
    fakeSettingsStore,
    fakeListStore,
    fakeProjectStore,
    fakeStakesStore,
    fakeProofStore,
    fakeEventLogStore,
    fakeCloudTasks,
    supabaseMocks,
    fakeUser,
  }
})

vi.mock('@/store/mmkv', () => ({
  mmkvStateStorage: {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
  },
}))
vi.mock('@/store/taskStore', () => ({ useTaskStore: fakeTaskStore }))
vi.mock('@/store/settingsStore', () => ({ useSettingsStore: fakeSettingsStore }))
vi.mock('@/store/listStore', () => ({ useListStore: fakeListStore }))
vi.mock('@/store/projectStore', () => ({ useProjectStore: fakeProjectStore }))
vi.mock('@/store/stakesStore', () => ({ useStakesStore: fakeStakesStore }))
vi.mock('@/store/proofStore', () => ({ useProofStore: fakeProofStore }))
vi.mock('@/store/eventLogStore', () => ({ useEventLogStore: fakeEventLogStore }))
vi.mock('@/services/supabase', () => supabaseMocks)

import { useSyncStore, diffRecord, makeRecordPusher, resetPushBaselines } from '@/store/syncStore'

function makeTask(id: string, overrides: Partial<Task> = {}): Task {
  return {
    id,
    title: `Task ${id}`,
    durationMin: 30,
    progressMin: 0,
    autoSchedule: false,
    tags: [],
    subtasks: [],
    status: 'todo',
    createdAt: 1,
    updatedAt: 1,
    syncState: 'pending',
    ...overrides,
  }
}

/** Full isolation between tests: clear the fake cloud, silently reset the fake task store (no phantom push scheduled), forget every pusher's baseline, reset sync metadata, and clear mock call history. */
function resetTestState() {
  for (const id of Object.keys(fakeCloudTasks)) delete fakeCloudTasks[id]
  fakeTaskStore.__resetSilently({ tasks: {} })
  resetPushBaselines()
  useSyncStore.setState({ status: 'idle', lastSyncedAt: null, enabled: false })
  vi.clearAllMocks()
  supabaseMocks.getCurrentUser.mockResolvedValue(fakeUser as unknown)
}

beforeEach(() => {
  resetTestState()
})

// ---------------------------------------------------------------------------
// diffRecord — pure
// ---------------------------------------------------------------------------

describe('diffRecord', () => {
  it('reports new/changed items and separately reports removed ids', () => {
    const a = { id: 'a', v: 1 }
    const bOld = { id: 'b', v: 1 }
    const prev = { a, b: bOld }
    const cNew = { id: 'c', v: 1 }
    const next = { a, c: cNew } // a unchanged (same ref), b removed, c added

    const { changed, removedIds } = diffRecord(next, prev)

    expect(changed).toEqual([cNew])
    expect(removedIds).toEqual(['b'])
  })
})

// ---------------------------------------------------------------------------
// makeRecordPusher — the generic mechanism `pushTasks` (and every other
// entity's pusher: lists, tags, projects, stake sessions, proofs) is built
// from. Exercised directly here with throwaway upsert/delete spies, no store
// involved, so these pin the MECHANISM in isolation.
// ---------------------------------------------------------------------------

describe('makeRecordPusher', () => {
  interface Item {
    id: string
  }

  beforeEach(() => {
    useSyncStore.setState({ enabled: true })
  })

  it('flush() pushes an upsert for new/changed items and a delete for removed ones', async () => {
    const upsert = vi.fn(async (_items: Item[]) => {})
    const del = vi.fn(async (_ids: string[]) => {})
    const pusher = makeRecordPusher<Item>(upsert, del)

    pusher({ a: { id: 'a' }, b: { id: 'b' } })
    await pusher.flush()
    expect(upsert).toHaveBeenCalledTimes(1)
    expect(upsert.mock.calls[0][0].map((i) => i.id).sort()).toEqual(['a', 'b'])
    expect(del).not.toHaveBeenCalled()

    // b disappears — the "prove the caller exists" case: a record vanishing
    // from the tracked slice must reach `del`.
    pusher({ a: { id: 'a' } })
    await pusher.flush()
    expect(del).toHaveBeenCalledWith(['b'])
  })

  it('flush() is a safe no-op when nothing is pending or in flight', async () => {
    const upsert = vi.fn(async (_items: Item[]) => {})
    const del = vi.fn(async (_ids: string[]) => {})
    const pusher = makeRecordPusher<Item>(upsert, del)

    await expect(pusher.flush()).resolves.toBeUndefined()
    expect(upsert).not.toHaveBeenCalled()
    expect(del).not.toHaveBeenCalled()
  })

  it('resetBaseline() makes the next diff empty-vs-empty, so a store clear pushes no deletions', async () => {
    const upsert = vi.fn(async (_items: Item[]) => {})
    const del = vi.fn(async (_ids: string[]) => {})
    const pusher = makeRecordPusher<Item>(upsert, del)

    pusher({ a: { id: 'a' }, b: { id: 'b' } })
    await pusher.flush() // establishes lastPushed = {a, b}, as if already synced
    upsert.mockClear()
    del.mockClear()

    pusher.resetBaseline() // what wipeAllData() does, via resetPushBaselines()
    pusher({}) // what wipeAllData() then does: clear the store to {}
    await pusher.flush()

    expect(del).not.toHaveBeenCalled()
    expect(upsert).not.toHaveBeenCalled()
  })

  it('CONTRAST: the same store-clear WITHOUT resetBaseline() first deletes every previously-synced id', async () => {
    const upsert = vi.fn(async (_items: Item[]) => {})
    const del = vi.fn(async (_ids: string[]) => {})
    const pusher = makeRecordPusher<Item>(upsert, del)

    pusher({ a: { id: 'a' }, b: { id: 'b' } })
    await pusher.flush()

    pusher({}) // clear WITHOUT resetBaseline — proves the mechanism is real, not vacuous
    await pusher.flush()

    expect(del).toHaveBeenCalledTimes(1)
    expect(del.mock.calls[0][0].slice().sort()).toEqual(['a', 'b'])
  })
})

// ---------------------------------------------------------------------------
// The REAL module-level wiring: `useTaskStore.subscribe(...)` -> `pushTasks`
// -> `deleteTasks` (`services/supabase.ts`). This is what actually answers
// "prove the caller exists" for `store/taskStore.ts#deleteTask` — nothing
// here calls the dead `useSyncStore.getState().pushTaskDeletion`; that
// method genuinely has zero callers (by design, per its own doc comment) and
// isn't what makes deletion propagate.
// ---------------------------------------------------------------------------

describe('task deletion reaches the cloud through the real subscribe wiring', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('deleting a task locally eventually calls deleteTasks(...) for it, with no explicit flush', async () => {
    const taskA = makeTask('a')
    const taskB = makeTask('b')
    useSyncStore.setState({ enabled: true })

    fakeTaskStore.setState({ tasks: { a: taskA, b: taskB } })
    await vi.advanceTimersByTimeAsync(600) // past PUSH_DEBOUNCE_MS
    expect(supabaseMocks.upsertTask).toHaveBeenCalledTimes(2)

    fakeTaskStore.setState({ tasks: { b: taskB } }) // delete 'a' locally (b's reference is untouched, like the real taskStore.deleteTask)
    await vi.advanceTimersByTimeAsync(600)

    expect(supabaseMocks.deleteTasks).toHaveBeenCalledWith(['a'])
  })

  it('a deleted task stays deleted across a sync, even when the sync races the debounce window', async () => {
    const taskA = makeTask('a')
    const taskB = makeTask('b')
    useSyncStore.setState({ enabled: true })

    // Establish an "already synced elsewhere" baseline: both tasks exist
    // locally AND in the fake cloud.
    fakeTaskStore.setState({ tasks: { a: taskA, b: taskB } })
    await vi.advanceTimersByTimeAsync(600)
    expect(fakeCloudTasks.a).toBeDefined()
    expect(fakeCloudTasks.b).toBeDefined()

    // Delete 'a' locally, then IMMEDIATELY sync — well within the 500ms
    // debounce window, before the natural timer would fire on its own.
    // Before `reconcileTasks`'s `pushTasks.flush()` fix, this raced: the
    // cloud still had 'a' at pull time, so the cloud->local adopt pass
    // resurrected it right back into local state.
    fakeTaskStore.setState({ tasks: { b: taskB } })
    await useSyncStore.getState().syncNow() // deliberately no timer advance — the race window

    expect(fakeCloudTasks.a).toBeUndefined() // the delete reached the cloud...
    expect(fakeTaskStore.getState().tasks.a).toBeUndefined() // ...and was NOT resurrected locally
    expect(fakeTaskStore.getState().tasks.b).toBeDefined() // the surviving task is untouched
  })
})

// ---------------------------------------------------------------------------
// Device wipe suppression (`resetPushBaselines`, used by
// `core/dataExport.ts#wipeAllData`) against the REAL module-level task
// wiring, not just the generic `makeRecordPusher` helper in isolation above.
// ---------------------------------------------------------------------------

describe('a device wipe pushes no deletions (real wiring)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('resetPushBaselines() + clearing the task store locally deletes nothing in the cloud', async () => {
    const taskA = makeTask('a')
    const taskB = makeTask('b')
    useSyncStore.setState({ enabled: true })

    fakeTaskStore.setState({ tasks: { a: taskA, b: taskB } })
    await vi.advanceTimersByTimeAsync(600)
    expect(supabaseMocks.deleteTasks).not.toHaveBeenCalled()

    // What core/dataExport.ts#wipeAllData does, in this order: neutralize
    // the push pipeline FIRST, then clear the store.
    resetPushBaselines()
    fakeTaskStore.setState({ tasks: {} })
    await vi.advanceTimersByTimeAsync(600)

    expect(supabaseMocks.deleteTasks).not.toHaveBeenCalled()
  })

  it('CONTRAST: clearing the task store WITHOUT resetPushBaselines() first deletes every previously-synced task', async () => {
    const taskA = makeTask('a')
    const taskB = makeTask('b')
    useSyncStore.setState({ enabled: true })

    fakeTaskStore.setState({ tasks: { a: taskA, b: taskB } })
    await vi.advanceTimersByTimeAsync(600)

    fakeTaskStore.setState({ tasks: {} }) // clear WITHOUT resetPushBaselines
    await vi.advanceTimersByTimeAsync(600)

    expect(supabaseMocks.deleteTasks).toHaveBeenCalledTimes(1)
    expect(supabaseMocks.deleteTasks.mock.calls[0][0].slice().sort()).toEqual(['a', 'b'])
  })
})
