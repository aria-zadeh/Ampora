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
  /** Push a single task upsert to the cloud (fire-and-forget). */
  pushTask: (task: Task) => void
  /** Push a single task delete to the cloud (fire-and-forget). */
  pushTaskDeletion: (taskId: string) => void
  /** Push current settings to the cloud (fire-and-forget). */
  pushSettings: () => void
  /** Reset sync metadata (e.g. on sign-out). */
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
 *   - Pull cloud tasks. For each cloud task, if it is newer than the local copy
 *     (or local is absent), adopt it locally as 'synced'.
 *   - For each local task that is newer than its cloud copy (or absent in the
 *     cloud), push it up. Ties go to LOCAL (we push, marking it synced).
 *
 * We do NOT delete local tasks just because they're missing from the cloud
 * (they may be brand-new offline creations); deletions are propagated
 * explicitly via `pushTaskDeletion`.
 */
async function reconcileTasks(): Promise<void> {
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
// rather than called from inside them. Partly a hard requirement, partly a
// consistency choice: `taskStore`, `scheduleStore`, `settingsStore`,
// `stakesStore`, and `projectStore` belong to other workers this round (see
// the task's file-scope note) so cannot be edited here at all; `listStore`,
// `proofStore`, and `eventLogStore` COULD be edited directly, but are wired
// the same external way anyway so every entity's push logic lives in exactly
// one place rather than being split across "edited in place" vs "subscribed
// from outside" depending on which store happens to be touchable this round.
// This mirrors the exact external-subscription pattern `app/_layout.tsx`
// already uses to watch taskStore/settingsStore/scheduleStore for the
// notification-rescheduling effect. Registered once, at module load — this
// module is imported by `app/_layout.tsx` (for `syncNow()`), so it is always
// loaded early.
// ---------------------------------------------------------------------------

const PUSH_DEBOUNCE_MS = 500

function debounce<F extends (...args: never[]) => void>(fn: F, ms: number): F {
  let timer: ReturnType<typeof setTimeout> | null = null
  return ((...args: Parameters<F>) => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = null
      fn(...args)
    }, ms)
  }) as F
}

/** Diff a Record-keyed slice against its last-pushed snapshot: which ids are new/changed, which disappeared. Reference-equality-based, so it works whether the diff spans one store update or several coalesced by the debounce. */
function diffRecord<T>(next: Record<string, T>, prev: Record<string, T>): { changed: T[]; removedIds: string[] } {
  const changed: T[] = []
  for (const id in next) if (next[id] !== prev[id]) changed.push(next[id])
  const removedIds: string[] = []
  for (const id in prev) if (!(id in next)) removedIds.push(id)
  return { changed, removedIds }
}

/** Builds a debounced "diff since last push, then upsert changed + delete removed" pusher for a Record-keyed store slice. Diffs against the LAST-PUSHED snapshot (not just the immediately-prior state), so a burst of several rapid mutations inside one debounce window is never partially lost. */
function makeRecordPusher<T extends { id: string }>(upsert: (items: T[]) => Promise<void>, del: (ids: string[]) => Promise<void>) {
  let lastPushed: Record<string, T> = {}
  return debounce((current: Record<string, T>) => {
    if (!useSyncStore.getState().enabled) return
    const { changed, removedIds } = diffRecord(current, lastPushed)
    lastPushed = current
    if (changed.length > 0) upsert(changed).catch(() => {})
    if (removedIds.length > 0) del(removedIds).catch(() => {})
  }, PUSH_DEBOUNCE_MS)
}

/** Same idea as `makeRecordPusher` but for an append-only array log (LockEvent, AppEvent) — additions only, id-set diffed against the last-pushed snapshot. */
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
