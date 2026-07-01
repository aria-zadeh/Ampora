/**
 * Sync store — Ampora Phase 6 cloud sync orchestrator (PRD FR-87, §9.12).
 *
 * Owns the LAST-WRITE-WINS background reconciliation between the local
 * (MMKV-backed) task/settings stores and the cloud (Supabase). The heavy
 * lifting — row mappers, guest no-op guards, upsert/pull — lives in
 * services/supabase.ts; this store decides WHEN to sync and HOW to merge.
 *
 * Contract:
 *   - Local-first: the app already wrote Zustand -> MMKV before we run. We only
 *     push/pull in the background; we never block a user action on the network.
 *   - Fire-and-forget: every path is wrapped so errors are logged, never
 *     surfaced (matches the CLAUDE.md data/sync rule).
 *   - Guest-safe: with no signed-in user, `pull*`/`upsert*` no-op, so a sync run
 *     is a cheap no-op and `enabled` stays false.
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
import {
  getCurrentUser,
  pullTasks,
  upsertTask,
  deleteTask,
  pullSettings,
  upsertSettings,
} from '@/services/supabase'
import type { Task } from '@/types'

type SyncStatus = 'idle' | 'syncing' | 'error' | 'offline'

interface SyncState {
  status: SyncStatus
  /** Epoch ms of the last successful full sync, or null. */
  lastSyncedAt: number | null
  /** Whether a signed-in user was seen at the last run (false = guest, sync no-ops). */
  enabled: boolean

  /** Run a full two-way sync now. Safe to call anytime; guest -> no-op. Never throws. */
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
            // Guest: nothing to sync. Mark disabled and bail cleanly.
            set({ status: 'idle', enabled: false })
            return
          }
          set({ enabled: true })

          await reconcileTasks()
          await reconcileSettings()

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
    // Cloud changed since we last synced (likely another device) — adopt it.
    useSettingsStore.setState({ settings: remote.settings })
  }
  // Always push local up (local wins ties / establishes the row if absent).
  await upsertSettings(useSettingsStore.getState().settings).catch(() => {})
}
