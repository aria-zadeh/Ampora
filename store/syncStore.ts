/**
 * Sync store — Ampora Phase 6 cloud sync orchestrator (PRD FR-87, §9.12).
 *
 * Owns the LAST-WRITE-WINS background reconciliation between the local
 * (MMKV-backed) stores and the cloud (Supabase), across every synced entity
 * (FR-87 "full sync coverage" — tasks, settings, lists, tags, projects,
 * stake session history, lock events, proofs, the on-device event log). The
 * heavy lifting — row mappers, the no-signed-in-user no-op guards, upsert/
 * pull — lives in services/supabase.ts; this store decides WHEN to sync and
 * HOW to merge.
 *
 * Contract:
 *   - Local-first: the app already wrote Zustand -> MMKV before we run. We only
 *     push/pull in the background; we never block a user action on the network.
 *   - Fire-and-forget: every path is wrapped so errors are logged, never
 *     surfaced (matches the CLAUDE.md data/sync rule).
 *   - No-signed-in-user-safe: with no signed-in user (not yet authenticated,
 *     or signed out — there is no anonymous mode, see FR-87), `pull*`/`upsert*`
 *     no-op, so a sync run is a cheap no-op and `enabled` stays false.
 *   - Merge rule (§9.12): compare `updatedAt` (epoch ms). The NEWER copy wins;
 *     on an exact tie the LOCAL copy wins (we prefer not to clobber unsynced
 *     local edits). Tasks present only locally are pushed; tasks present only
 *     in the cloud are adopted locally.
 *
 * This store holds only sync metadata (status, last sync time). It reads/writes
 * the task + settings stores imperatively via getState/setState — it does not
 * subscribe them (no loops) and never runs during the pure engine's recompute.
 */

import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { mmkvStateStorage } from '@/store/mmkv'
import { useTaskStore } from '@/store/taskStore'
import { useSettingsStore } from '@/store/settingsStore'
import { useListStore } from '@/store/listStore'
import { useProjectStore } from '@/store/projectStore'
import { useStakesStore } from '@/store/stakesStore'
import { useProofStore } from '@/store/proofStore'
import { useEventLogStore } from '@/store/eventLogStore'
import {
  getCurrentUser,
  pullTasks,
  upsertTask,
  deleteTask,
  deleteTasks,
  pullSettings,
  upsertSettings,
  pullLists,
  upsertLists,
  deleteLists,
  pullTags,
  upsertTags,
  deleteTags,
  pullProjects,
  upsertProjects,
  deleteProjects,
  pullStakeSessions,
  upsertStakeSessions,
  deleteStakeSessions,
  pullLockEvents,
  upsertLockEvents,
  pullProofs,
  upsertProofs,
  deleteProofs,
  pullAppEvents,
  upsertAppEvents,
} from '@/services/supabase'
import type { Task, List, Tag, Project, StakeSession, LockEvent, Proof, AppEvent } from '@/types'

type SyncStatus = 'idle' | 'syncing' | 'error' | 'offline'

interface SyncState {
  status: SyncStatus
  /** Epoch ms of the last successful full sync, or null. */
  lastSyncedAt: number | null
  /** Whether a signed-in user was seen at the last run (false = no session, sync no-ops). */
  enabled: boolean

  /** Run a full two-way sync now. Safe to call anytime; no signed-in user -> no-op. Never throws. */
  syncNow: () => Promise<void>
  /**
   * Force an immediate (non-debounced) task upsert, bypassing the 500ms
   * per-mutation window below. NOT what makes ordinary task edits reach the
   * cloud — that already happens automatically, for every mutation
   * including deletion, via the `useTaskStore.subscribe(...)` wiring near
   * the bottom of this file (same shape as every other entity). This is an
   * optional extra for a caller that specifically wants to skip the debounce.
   */
  pushTask: (task: Task) => void
  /** Force an immediate (non-debounced) task delete. See `pushTask`'s doc comment — automatic propagation does not depend on this being called. */
  pushTaskDeletion: (taskId: string) => void
  /** Push current settings to the cloud (fire-and-forget). */
  pushSettings: () => void
  /**
   * Reset sync metadata: `status` back to idle, `lastSyncedAt` cleared, and
   * (load-bearing) `enabled` set false so every per-mutation pusher below
   * no-ops until the next real `syncNow()` re-authenticates it. Called from
   * two places: `app/_layout.tsx`'s `onAuthStateChange` listener on a
   * `SIGNED_OUT` event, and `core/dataExport.ts#wipeAllData` (belt-and-
   * suspenders alongside `resetPushBaselines()` — see that function's doc
   * comment for why a device-only wipe needs this at all).
   */
  reset: () => void
}

/** Re-entrancy guard so overlapping triggers don't double-sync. */
let isSyncing = false

export const useSyncStore = create<SyncState>()(
  persist(
    (set, get) => ({
      status: 'idle',
      lastSyncedAt: null,
      enabled: false,

      syncNow: async () => {
        if (isSyncing) return
        isSyncing = true
        set({ status: 'syncing' })
        try {
          const user = await getCurrentUser().catch(() => null)
          if (!user) {
            // No signed-in user right now (not-yet-signed-in or signed-out —
            // see currentUserId's doc comment in services/supabase.ts; there
            // is no anonymous mode to fall back into). Mark disabled and bail
            // cleanly; the caller retries later (app foreground / next
            // sign-in), so nothing here needs to succeed on the first try.
            set({ status: 'idle', enabled: false })
            return
          }
          set({ enabled: true })

          // Each step is independently wrapped (`safely`) so one entity's
          // failure (a missing table, a transient network error) cannot skip
          // the rest — every reconcile function below already never throws on
          // its own, this is belt-and-suspenders for anything unexpected.
          await safely('tasks', reconcileTasks)
          await safely('settings', reconcileSettings)
          await safely('lists', reconcileLists)
          await safely('tags', reconcileTags)
          await safely('projects', reconcileProjects)
          await safely('stakeSessions', reconcileStakeSessions)
          await safely('lockEvents', reconcileLockEvents)
          await safely('proofs', reconcileProofs)
          await safely('appEvents', reconcileAppEvents)

          set({ status: 'idle', lastSyncedAt: Date.now() })
        } catch (err) {
          // Never surface — just record the state and move on.
          console.warn('[Ampora] syncNow failed silently:', err)
          set({ status: 'error' })
        } finally {
          isSyncing = false
        }
      },

      pushTask: (task) => {
        if (!get().enabled) return
        upsertTask(task).catch(() => {})
      },

      pushTaskDeletion: (taskId) => {
        if (!get().enabled) return
        deleteTask(taskId).catch(() => {})
      },

      pushSettings: () => {
        if (!get().enabled) return
        const settings = useSettingsStore.getState().settings
        upsertSettings(settings).catch(() => {})
      },

      reset: () => set({ status: 'idle', lastSyncedAt: null, enabled: false }),
    }),
    {
      name: 'ampora-sync',
      storage: createJSONStorage(() => mmkvStateStorage),
      // Only sync metadata persists; never persist `status` mid-flight.
      partialize: (s) => ({ lastSyncedAt: s.lastSyncedAt, enabled: s.enabled }),
    },
  ),
)

/** Run one reconcile step, logging (never throwing/surfacing) any failure so it cannot skip the steps after it. */
async function safely(label: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn()
  } catch (err) {
    console.warn(`[Ampora] sync step "${label}" failed silently:`, err)
  }
}

// ---------------------------------------------------------------------------
// Reconciliation (last-write-wins on updatedAt; local wins ties)
// ---------------------------------------------------------------------------

/**
 * Two-way task merge:
 *   - Flush any pending (debounced) local push FIRST — `pushTasks.flush()`
 *     (defined near the bottom of this file, alongside the
 *     `useTaskStore.subscribe(...)` wiring that owns `pushTasks`). Without
 *     this, a task deleted (or edited) within the last `PUSH_DEBOUNCE_MS` of
 *     this call could race the pull two lines down: the cloud row would
 *     still exist (its delete hasn't gone out yet), so the cloud->local
 *     adopt pass below — which cannot tell "cloud created this, I haven't
 *     pulled it yet" apart from "I deleted this, the cloud doesn't know
 *     yet" — would silently resurrect a task the user just deleted. Awaited,
 *     so the pull below is guaranteed to run against post-delete cloud state
 *     whenever a push WAS pending; resolves immediately (no-op) otherwise.
 *   - Pull cloud tasks. For each cloud task, if it is newer than the local copy
 *     (or local is absent), adopt it locally as 'synced'.
 *   - For each local task that is newer than its cloud copy (or absent in the
 *     cloud), push it up. Ties go to LOCAL (we push, marking it synced).
 *
 * We do NOT delete local tasks just because they're missing from the cloud
 * (they may be brand-new offline creations); deletions are propagated
 * explicitly by the `useTaskStore.subscribe(...)` pusher near the bottom of
 * this file, which diffs the task map on every mutation and pushes removed
 * ids via `deleteTasks` — never inferred here.
 */
async function reconcileTasks(): Promise<void> {
  await pushTasks.flush()
  const cloudTasks = await pullTasks()
  const cloudById = new Map(cloudTasks.map((t) => [t.id, t]))

  const localTasks = { ...useTaskStore.getState().tasks }
  const nextLocal: Record<string, Task> = { ...localTasks }

  // Cloud -> local: adopt cloud copies that are strictly newer or new.
  for (const cloud of cloudTasks) {
    const local = localTasks[cloud.id]
    if (!local || cloud.updatedAt > local.updatedAt) {
      nextLocal[cloud.id] = { ...cloud, syncState: 'synced' }
    }
  }

  // Commit any adopted cloud state before pushing local wins.
  useTaskStore.setState({ tasks: nextLocal })

  // Local -> cloud: push local copies that are strictly newer, tie, or cloud-absent.
  const toPush: Task[] = []
  for (const local of Object.values(nextLocal)) {
    const cloud = cloudById.get(local.id)
    if (!cloud || local.updatedAt >= cloud.updatedAt) {
      // Skip ones we just adopted from cloud (already synced, equal timestamps
      // where cloud won handled above by strict `>`); only push genuine local wins.
      if (cloud && local.updatedAt === cloud.updatedAt && local.syncState === 'synced') continue
      toPush.push(local)
    }
  }

  await Promise.allSettled(toPush.map((t) => upsertTask(t)))

  // Mark pushed tasks synced locally.
  if (toPush.length > 0) {
    const after = { ...useTaskStore.getState().tasks }
    for (const t of toPush) {
      const cur = after[t.id]
      if (cur && cur.updatedAt === t.updatedAt) after[t.id] = { ...cur, syncState: 'synced' }
    }
    useTaskStore.setState({ tasks: after })
  }
}

/**
 * Settings merge: the app model has no explicit updatedAt on Settings, so the
 * cloud row carries its own `updated_at`. We adopt the cloud settings only if
 * the row is newer than our last successful sync (otherwise our local settings
 * are at least as fresh); then we always push local up so ties resolve to local.
 * Simpler and safe because settings is a single small row.
 */
async function reconcileSettings(): Promise<void> {
  const remote = await pullSettings()
  const lastSyncedAt = useSyncStore.getState().lastSyncedAt ?? 0

  if (remote && remote.updatedAt > lastSyncedAt) {
    // Cloud changed since we last synced (likely another device) — adopt it,
    // but preserve device-local-only fields that the sync mapper (settingsToRow/
    // settingsFromRow) deliberately doesn't carry, so a newer cloud row can't
    // silently reset them (e.g. wipe a dismissed one-time nudge back to
    // undefined and make it reappear). Keep this list in sync with the fields
    // excluded from SettingsRow.
    const local = useSettingsStore.getState().settings
    useSettingsStore.setState({
      settings: {
        ...remote.settings,
        reminderKinds: local.reminderKinds,
        notificationNudgeDismissed: local.notificationNudgeDismissed,
      },
    })
  }
  // Always push local up (local wins ties / establishes the row if absent).
  await upsertSettings(useSettingsStore.getState().settings).catch(() => {})
}

// ---------------------------------------------------------------------------
// Full sync coverage (FR-87) — List, Tag, Project reconcile the same way as
// Task (last-write-wins on updatedAt, local wins ties). StakeSession,
// LockEvent, Proof, and AppEvent have no updatedAt and instead use a union
// merge (`reconcileLogRecord`): local always wins outright (this device is
// the sole writer of its own rows, FR-41b), cloud-only rows are adopted. See
// services/supabase.ts's "FULL SYNC COVERAGE" header for what is deliberately
// NOT synced (ScheduledBlock, StakeApp/StakeSelection, scheduled-not-yet-
// armed stakes) and why.
// ---------------------------------------------------------------------------

/** Shared last-write-wins merge for a BaseEntity-shaped dictionary (List, Tag, Project all use this exact rule — mirrors `reconcileTasks`). */
async function reconcileLastWriteWins<T extends { id: string; updatedAt: number; syncState: string }>(opts: {
  pull: () => Promise<T[]>
  push: (items: T[]) => Promise<void>
  getLocal: () => Record<string, T>
  setLocal: (next: Record<string, T>) => void
}): Promise<void> {
  const cloudItems = await opts.pull()
  const cloudById = new Map(cloudItems.map((c) => [c.id, c]))

  const localItems = { ...opts.getLocal() }
  const nextLocal: Record<string, T> = { ...localItems }

  for (const cloud of cloudItems) {
    const local = localItems[cloud.id]
    if (!local || cloud.updatedAt > local.updatedAt) {
      nextLocal[cloud.id] = { ...cloud, syncState: 'synced' as T['syncState'] }
    }
  }
  opts.setLocal(nextLocal)

  const toPush: T[] = []
  for (const local of Object.values(nextLocal)) {
    const cloud = cloudById.get(local.id)
    if (!cloud || local.updatedAt >= cloud.updatedAt) {
      if (cloud && local.updatedAt === cloud.updatedAt && local.syncState === 'synced') continue
      toPush.push(local)
    }
  }
  if (toPush.length > 0) await opts.push(toPush)
}

async function reconcileLists(): Promise<void> {
  await reconcileLastWriteWins<List>({
    pull: pullLists,
    push: upsertLists,
    getLocal: () => useListStore.getState().lists,
    setLocal: (next) => useListStore.setState({ lists: next }),
  })
}

async function reconcileTags(): Promise<void> {
  await reconcileLastWriteWins<Tag>({
    pull: pullTags,
    push: upsertTags,
    getLocal: () => useListStore.getState().tags,
    setLocal: (next) => useListStore.setState({ tags: next }),
  })
}

async function reconcileProjects(): Promise<void> {
  await reconcileLastWriteWins<Project>({
    pull: pullProjects,
    push: upsertProjects,
    getLocal: () => useProjectStore.getState().projects,
    setLocal: (next) => useProjectStore.setState({ projects: next }),
  })
}

/** Shared union merge for a single-writer-device log dictionary (StakeSession, Proof — no updatedAt to compare). */
async function reconcileLogRecord<T extends { id: string }>(opts: {
  pull: () => Promise<T[]>
  push: (items: T[]) => Promise<void>
  getLocal: () => Record<string, T>
  setLocal: (next: Record<string, T>) => void
}): Promise<void> {
  const cloudItems = await opts.pull()
  const localItems = opts.getLocal()

  const additions: Record<string, T> = {}
  for (const cloud of cloudItems) {
    if (!(cloud.id in localItems)) additions[cloud.id] = cloud
  }
  if (Object.keys(additions).length > 0) {
    opts.setLocal({ ...localItems, ...additions })
  }

  const toPush = Object.values(localItems)
  if (toPush.length > 0) await opts.push(toPush)
}

/** History only (`sessions`, which already includes the active session) — `scheduledStakes` deliberately excluded, see the header note above. */
async function reconcileStakeSessions(): Promise<void> {
  await reconcileLogRecord<StakeSession>({
    pull: pullStakeSessions,
    push: upsertStakeSessions,
    getLocal: () => useStakesStore.getState().sessions,
    setLocal: (next) => useStakesStore.setState({ sessions: next }),
  })
}

async function reconcileProofs(): Promise<void> {
  await reconcileLogRecord<Proof>({
    pull: pullProofs,
    push: upsertProofs,
    getLocal: () => useProofStore.getState().proofs,
    setLocal: (next) => useProofStore.setState({ proofs: next }),
  })
}

/** `stakesStore.events` is an array (not a Record), so this mirrors `reconcileLogRecord` by hand: dedupe by id, adopt cloud-only, always push local. No delete path exists for LockEvent (append-only). */
async function reconcileLockEvents(): Promise<void> {
  const cloudEvents = await pullLockEvents()
  const localEvents = useStakesStore.getState().events
  const localIds = new Set(localEvents.map((e) => e.id))
  const additions = cloudEvents.filter((e) => !localIds.has(e.id))
  if (additions.length > 0) {
    const merged = [...localEvents, ...additions].sort((a, b) => a.at - b.at)
    useStakesStore.setState({ events: merged })
  }
  if (localEvents.length > 0) await upsertLockEvents(localEvents)
}

/**
 * `eventLogStore.events` is an array capped at 500 (oldest trimmed on write).
 * Adopt cloud-only ids, re-apply the SAME cap so a cross-device adopt cannot
 * quietly grow the on-device log past its own documented bound, then push.
 * No delete propagation when the local cap trims an old entry — proportionate
 * for an internal analytics log nothing reads to change app behavior (see
 * `store/eventLogStore.ts`'s own doc comment).
 */
async function reconcileAppEvents(): Promise<void> {
  const MAX_EVENTS = 500
  const cloudEvents = await pullAppEvents()
  const localEvents = useEventLogStore.getState().events
  const localIds = new Set(localEvents.map((e) => e.id))
  const additions = cloudEvents.filter((e) => !localIds.has(e.id))
  if (additions.length > 0) {
    const merged = [...localEvents, ...additions].sort((a, b) => a.at - b.at)
    const capped = merged.length > MAX_EVENTS ? merged.slice(merged.length - MAX_EVENTS) : merged
    useEventLogStore.setState({ events: capped })
  }
  if (localEvents.length > 0) await upsertAppEvents(localEvents)
}

// ---------------------------------------------------------------------------
// Push-on-mutation (fire-and-forget, debounced) — mirrors `pushTask`/
// `pushSettings` above, but wired via `.subscribe()` on the OWNING stores
// rather than called from inside them. This is now the uniform shape for
// EVERY Record-keyed entity, including Task: `deleteTask` in
// `store/taskStore.ts` used to have no cloud counterpart at all (declared
// `pushTask`/`pushTaskDeletion` above had zero callers), so a swipe-delete,
// menu delete, calendar delete, or Recovery drop never reached the cloud —
// and `reconcileTasks` above ADOPTS any cloud task missing locally, so the
// next sync on any other device silently resurrected it. Wiring Task through
// the same `.subscribe()` shape as every other entity below (rather than
// having `taskStore.deleteTask` call into this store directly) also matches
// existing precedent: `store/stakesStore.ts`'s task-deletion-cleanup section
// and `store/scheduleStore.ts#wireScheduleTriggers` both react to
// `useTaskStore` changing from the outside for the same reason — taskStore
// depends on nothing back, and stays that way. Registered once, at module
// load — this module is imported by `app/_layout.tsx` (for `syncNow()`), so
// it is always loaded early.
// ---------------------------------------------------------------------------

const PUSH_DEBOUNCE_MS = 500

/**
 * Debounce `fn`: each call resets a `ms` timer; `fn` finally runs once, with
 * the arguments from the LAST call, after `ms` of silence. `fn` may return
 * `void` or a `Promise<void>` — either way the timer path itself never
 * awaits it (fire-and-forget, same as before this had a `.flush()`).
 *
 * The returned function also carries a `.flush()` escape hatch:
 *   - a call still waiting out the debounce timer runs immediately instead;
 *   - a call whose timer already fired, but whose `fn(...)` hasn't settled
 *     yet, is awaited rather than left in flight;
 *   - nothing pending and nothing in flight resolves immediately, a no-op.
 * `reconcileTasks` uses this (via `RecordPusher.flush`) to guarantee a
 * just-deleted/edited task's push has actually reached the cloud before a
 * pull-based reconcile runs — see that function's doc comment.
 */
function debounce<A extends unknown[]>(
  fn: (...args: A) => void | Promise<void>,
  ms: number
): ((...args: A) => void) & { flush: () => Promise<void> } {
  let timer: ReturnType<typeof setTimeout> | null = null
  let pending: A | null = null
  let inFlight: Promise<void> | null = null

  const run = (args: A): Promise<void> => {
    const p = Promise.resolve(fn(...args)).finally(() => {
      if (inFlight === p) inFlight = null
    })
    inFlight = p
    return p
  }

  const wrapped = ((...args: A) => {
    pending = args
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = null
      const args2 = pending
      pending = null
      if (args2) void run(args2)
    }, ms)
  }) as ((...args: A) => void) & { flush: () => Promise<void> }

  wrapped.flush = async () => {
    if (timer) {
      clearTimeout(timer)
      timer = null
      const args2 = pending
      pending = null
      if (args2) await run(args2)
      return
    }
    if (inFlight) await inFlight
  }

  return wrapped
}

/** Diff a Record-keyed slice against its last-pushed snapshot: which ids are new/changed, which disappeared. Reference-equality-based, so it works whether the diff spans one store update or several coalesced by the debounce. */
export function diffRecord<T>(next: Record<string, T>, prev: Record<string, T>): { changed: T[]; removedIds: string[] } {
  const changed: T[] = []
  for (const id in next) if (next[id] !== prev[id]) changed.push(next[id])
  const removedIds: string[] = []
  for (const id in prev) if (!(id in next)) removedIds.push(id)
  return { changed, removedIds }
}

/** A debounced record pusher, as built by `makeRecordPusher`: call it with the current state to schedule a push, call `.resetBaseline()` to make the NEXT diff start from a fresh (or given) snapshot instead of the last real one it saw, or `.flush()` to force a pending push out immediately instead of waiting out the debounce. */
export interface RecordPusher<T> {
  (current: Record<string, T>): void
  /**
   * Forget everything pushed so far. Call this BEFORE clearing the owning
   * store (`core/dataExport.ts#wipeAllData`) so the debounced push that the
   * clear's own `setState`/subscription triggers diffs the new (empty)
   * state against an ALSO-empty baseline instead of the last real snapshot —
   * an empty-vs-empty diff has no `removedIds`, so it can never reach `del`
   * (`deleteRowsById` in `services/supabase.ts`). Without this, a device-only
   * "erase my data" would read every previously-synced id as newly deleted
   * and hard-delete it from the cloud — see `resetPushBaselines` below.
   */
  resetBaseline: (next?: Record<string, T>) => void
  /**
   * If a push is pending (debounce still running) or already in flight
   * (timer fired, network call not yet settled), wait for it to actually
   * happen/finish instead of letting a caller race ahead of it. No-op
   * (resolves immediately) when nothing is pending or in flight. Never
   * rejects — `upsert`/`del` errors are already swallowed inside the pusher.
   * See `debounce`'s doc comment for the exact semantics, and
   * `reconcileTasks` for why this matters for Task specifically.
   */
  flush: () => Promise<void>
}

/** Builds a debounced "diff since last push, then upsert changed + delete removed" pusher for a Record-keyed store slice. Diffs against the LAST-PUSHED snapshot (not just the immediately-prior state), so a burst of several rapid mutations inside one debounce window is never partially lost. */
export function makeRecordPusher<T extends { id: string }>(upsert: (items: T[]) => Promise<void>, del: (ids: string[]) => Promise<void>): RecordPusher<T> {
  let lastPushed: Record<string, T> = {}
  const debounced = debounce(async (current: Record<string, T>) => {
    if (!useSyncStore.getState().enabled) return
    const { changed, removedIds } = diffRecord(current, lastPushed)
    lastPushed = current
    const ops: Promise<unknown>[] = []
    if (changed.length > 0) ops.push(upsert(changed).catch(() => {}))
    if (removedIds.length > 0) ops.push(del(removedIds).catch(() => {}))
    if (ops.length > 0) await Promise.allSettled(ops)
  }, PUSH_DEBOUNCE_MS)
  const pusher = ((current: Record<string, T>) => debounced(current)) as RecordPusher<T>
  pusher.resetBaseline = (next: Record<string, T> = {}) => {
    lastPushed = next
  }
  pusher.flush = () => debounced.flush()
  return pusher
}

/** Same idea as `makeRecordPusher` but for an append-only array log (LockEvent, AppEvent) — additions only, id-set diffed against the last-pushed snapshot. No delete path exists, so (unlike `makeRecordPusher`) there is nothing here for a local wipe to accidentally propagate — a shrunk array just yields zero "additions". */
function makeArrayPusher<T extends { id: string }>(upsert: (items: T[]) => Promise<void>) {
  let lastPushedIds = new Set<string>()
  return debounce((current: T[]) => {
    if (!useSyncStore.getState().enabled) return
    const additions = current.filter((item) => !lastPushedIds.has(item.id))
    lastPushedIds = new Set(current.map((item) => item.id))
    if (additions.length > 0) upsert(additions).catch(() => {})
  }, PUSH_DEBOUNCE_MS)
}

const pushLists = makeRecordPusher<List>(upsertLists, deleteLists)
const pushTags = makeRecordPusher<Tag>(upsertTags, deleteTags)
const pushProjects = makeRecordPusher<Project>(upsertProjects, deleteProjects)
const pushStakeSessions = makeRecordPusher<StakeSession>(upsertStakeSessions, deleteStakeSessions)
const pushProofs = makeRecordPusher<Proof>(upsertProofs, deleteProofs)
const pushLockEvents = makeArrayPusher<LockEvent>(upsertLockEvents)
const pushAppEvents = makeArrayPusher<AppEvent>(upsertAppEvents)
/**
 * Task upsert/delete, batched the same way `upsertLists`/`deleteLists` etc.
 * are: `upsertTask` itself stays single-item (it also replaces the task's
 * subtask rows, which doesn't fit the generic `upsertRows` batch helper the
 * other entities use), so this adapts it with `Promise.allSettled` — mirrors
 * `reconcileTasks`'s own `toPush.map((t) => upsertTask(t))` above.
 */
const pushTasks = makeRecordPusher<Task>(
  (tasks) => Promise.allSettled(tasks.map((t) => upsertTask(t))).then(() => {}),
  deleteTasks
)

useListStore.subscribe((state, prev) => {
  if (state.lists !== prev.lists) pushLists(state.lists)
  if (state.tags !== prev.tags) pushTags(state.tags)
})

useProjectStore.subscribe((state, prev) => {
  if (state.projects !== prev.projects) pushProjects(state.projects)
})

useProofStore.subscribe((state, prev) => {
  if (state.proofs !== prev.proofs) pushProofs(state.proofs)
})

useEventLogStore.subscribe((state, prev) => {
  if (state.events !== prev.events) pushAppEvents(state.events)
})

// StakeSession history only — `scheduledStakes` deliberately excluded (see
// the reconcileStakeSessions doc comment above).
useStakesStore.subscribe((state, prev) => {
  if (state.sessions !== prev.sessions) pushStakeSessions(state.sessions)
  if (state.events !== prev.events) pushLockEvents(state.events)
})

// Every mutation, including `store/taskStore.ts#deleteTask` — see the
// section header above for why this lives here rather than in taskStore.
useTaskStore.subscribe((state, prev) => {
  if (state.tasks !== prev.tasks) pushTasks(state.tasks)
})

// ---------------------------------------------------------------------------
// Wipe safety — used by `core/dataExport.ts#wipeAllData` (a DEVICE-ONLY,
// reversible "erase my data") and, indirectly, by anything that clears these
// stores. See `RecordPusher.resetBaseline`'s doc comment for the mechanics.
// ---------------------------------------------------------------------------

/**
 * Reset every record-pusher's "last pushed" baseline to empty, so the very
 * next diff on each one is empty-vs-empty (no `changed`, no `removedIds`) no
 * matter what the owning store's current state is. Call this BEFORE clearing
 * any of Lists/Tags/Projects/Proofs/StakeSessions/Tasks — in practice, right
 * now, that means `core/dataExport.ts#wipeAllData`, which clears Lists,
 * Tags, Projects, Proofs, and Tasks (StakeSessions is included too, for when
 * a future change clears `stakesStore.sessions` — resetting an untouched
 * baseline is a harmless no-op).
 *
 * This does NOT block a later, real sync from pulling the user's data back
 * down — `reconcileTasks`/`reconcileLastWriteWins`/`reconcileLogRecord` above
 * all treat "missing locally" as "adopt from cloud", which is exactly the
 * "sign back in to get it all back" promise the device-wipe copy makes
 * (`components/settings/DataSettings.tsx`). It only suppresses the OUTBOUND
 * delete a wipe would otherwise cause by misreading its own clear as "the
 * user deleted everything".
 */
export function resetPushBaselines(): void {
  pushLists.resetBaseline()
  pushTags.resetBaseline()
  pushProjects.resetBaseline()
  pushProofs.resetBaseline()
  pushStakeSessions.resetBaseline()
  pushTasks.resetBaseline()
}

// ---------------------------------------------------------------------------
// Sign-out flush — used by `components/settings/DataSettings.tsx`'s "Sign
// out" action. See that file and `app/_layout.tsx`'s `onAuthStateChange`
// listener for the full flush-then-clear design and the reasoning behind it.
// ---------------------------------------------------------------------------

/**
 * Best-effort, time-bounded full sync for the CURRENTLY signed-in user,
 * meant to run immediately before signing out. `syncNow()` already pushes
 * every local-newer-or-cloud-absent item (tasks, lists, tags, projects,
 * settings, stake sessions, lock events, proofs, app events) as part of its
 * normal reconcile pass, including anything still sitting inside a pusher's
 * 500ms debounce window — so calling it here is what keeps a just-made edit
 * from being silently discarded once sign-out clears local state right
 * after. Bounded to `timeoutMs` (default 5s) so a slow or offline network
 * can never hang the sign-out button — `syncNow()` itself already never
 * throws, so the timeout is the only thing this adds. Never rejects.
 */
export async function flushBeforeSignOut(timeoutMs = 5000): Promise<void> {
  await Promise.race([
    useSyncStore.getState().syncNow(),
    new Promise<void>((resolve) => setTimeout(resolve, timeoutMs)),
  ])
}
