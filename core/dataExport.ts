/**
 * Data export / wipe helpers — Phase 7 (PRD §8.11 "data export", "delete all").
 *
 * Pure-ish helpers that read/reset the local Zustand+MMKV stores. Kept out of
 * the UI so the serialization shape is stable, testable, and reused by any
 * future "download my data" surface. No network — this file makes no network
 * calls itself; it just has to know about `store/syncStore.ts`'s background
 * push pipeline well enough to stop the wipe below from triggering one (see
 * `wipeAllData`'s own comment for exactly why that matters).
 *
 * `buildExport` snapshots every user-content store into one JSON-serializable
 * object. `wipeAllData` clears the persisted MMKV blob and resets MOST
 * stores' in-memory collections so the running app reflects the wipe
 * immediately (without requiring a reload) — not literally every store; see
 * the "Known gaps" note at the end of `wipeAllData` for exactly what it
 * cannot reach today and why.
 */

import { mmkv } from '@/store/mmkv'
import { useTaskStore } from '@/store/taskStore'
import { useListStore } from '@/store/listStore'
import { useProjectStore } from '@/store/projectStore'
import { useScheduleStore } from '@/store/scheduleStore'
import { useSettingsStore } from '@/store/settingsStore'
import { useSessionStore } from '@/store/sessionStore'
import { useEventLogStore } from '@/store/eventLogStore'
import { useProofStore } from '@/store/proofStore'
import { useSyncStore, resetPushBaselines } from '@/store/syncStore'

/** Bumped if the export shape ever changes, so importers can branch on it. */
export const EXPORT_SCHEMA_VERSION = 1

/** The serialized shape of a full local export. */
export interface AmporaExport {
  schemaVersion: number
  exportedAt: number
  app: 'ampora'
  data: {
    tasks: unknown
    lists: unknown
    tags: unknown
    projects: unknown
    schedule: unknown
    settings: unknown
    sessions: { active: unknown; history: unknown }
    events: unknown
    proofs: unknown
  }
}

/**
 * Snapshot every user-content store into one plain object. Reads current state
 * imperatively (getState) — safe to call from an event handler.
 */
export function buildExport(now: number = Date.now()): AmporaExport {
  return {
    schemaVersion: EXPORT_SCHEMA_VERSION,
    exportedAt: now,
    app: 'ampora',
    data: {
      tasks: useTaskStore.getState().tasks,
      lists: useListStore.getState().lists,
      tags: useListStore.getState().tags,
      projects: useProjectStore.getState().projects,
      schedule: useScheduleStore.getState().blocks,
      settings: useSettingsStore.getState().settings,
      sessions: {
        active: useSessionStore.getState().active,
        history: useSessionStore.getState().history,
      },
      events: useEventLogStore.getState().events,
      proofs: useProofStore.getState().proofs,
    },
  }
}

/** Pretty-printed JSON string for the export (2-space indent, human-readable). */
export function serializeExport(now: number = Date.now()): string {
  return JSON.stringify(buildExport(now), null, 2)
}

/** A stable, dated filename for the export. */
export function exportFileName(now: number = Date.now()): string {
  const d = new Date(now)
  const stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate()
  ).padStart(2, '0')}`
  return `ampora-export-${stamp}.json`
}

/**
 * Raw MMKV key `store/stakesStore.ts#getDeviceId` reads/writes. Duplicated
 * here as a literal rather than imported because it is a module-private
 * `const` there (only the `getDeviceId()` function is exported), and
 * `store/stakesStore.ts` is out of scope for this change to edit directly.
 * If that key is ever renamed there, this must be updated too — see the
 * device-id preservation step in `wipeAllData` below.
 */
const DEVICE_ID_MMKV_KEY = 'ampora-device-id'

/**
 * Delete all local data. Clears the persisted MMKV blob (all stores share the
 * one `ampora` instance) then resets most in-memory stores' collections so
 * the live app reflects the wipe without a reload.
 *
 * Settings are intentionally NOT reset to defaults here — the account-level
 * "delete all" is about user *content* (tasks/projects/history), and resetting
 * theme/onboarding would eject the user from the app. `clearAll()` already
 * removed the persisted settings key; the in-memory Settings stay as-is for
 * this session, and re-persist on next change. (A future "reset app" can wipe
 * settings too.)
 *
 * DEVICE-ONLY AND REVERSIBLE, not a cloud delete — this is the entire point
 * of this action (`components/settings/DataSettings.tsx` promises exactly
 * that: "Your Ampora account and cloud copy are not affected — sign back in
 * ... to get it all back"). That promise depends on the two calls at the top
 * below: every store this function clears is watched by a debounced
 * push-on-mutation pusher in `store/syncStore.ts` that diffs against the
 * last snapshot IT pushed and hard-deletes whatever disappeared
 * (`deleteRowsById` in `services/supabase.ts`) — so without neutralizing
 * that pipeline FIRST, clearing these stores would look, to that diff,
 * exactly like the user deleting everything, and the very next debounce
 * tick would permanently delete the signed-in user's cloud rows. See
 * `resetPushBaselines`'s and `useSyncStore#reset`'s own doc comments
 * (`store/syncStore.ts`) for the mechanics; `core/__tests__/dataExport.test.ts`
 * and `core/__tests__/syncStore.test.ts` cover this directly.
 */
export function wipeAllData(): void {
  // 0. Neutralize the cloud-sync push pipeline BEFORE touching any store —
  // see the "DEVICE-ONLY AND REVERSIBLE" paragraph above for why this has to
  // come first. `resetPushBaselines()` makes each pusher's next diff
  // empty-vs-empty (nothing to delete); `reset()` additionally disables
  // `enabled` as an independent second line of defense that blocks every
  // pusher outright until the next real `syncNow()` re-authenticates it.
  // Neither call blocks a LATER sync from pulling this user's cloud data
  // back down onto this now-empty device — that is the intended, promised
  // way this wipe is reversible (see `resetPushBaselines`'s own comment).
  resetPushBaselines()
  useSyncStore.getState().reset()

  // 1. Nuke the persisted store — but first save off the per-install device
  // id (`store/stakesStore.ts#getDeviceId`), which is deliberately stored
  // outside the persisted Zustand blob specifically so it survives a store
  // reset (see that file's own comment on `DEVICE_ID_KEY`). `clearAll()` is
  // a blanket wipe of the whole MMKV instance and has no way to know that,
  // so without this it would delete that key too despite the documented
  // intent, and a later caller would silently mint and persist a brand-new
  // random id in its place.
  const preservedDeviceId = mmkv.getString(DEVICE_ID_MMKV_KEY)
  mmkv.clearAll()
  if (preservedDeviceId) mmkv.set(DEVICE_ID_MMKV_KEY, preservedDeviceId)

  // 2. Reset in-memory collections so the running UI updates now.
  useTaskStore.setState({ tasks: {} })
  useListStore.setState({ lists: {}, tags: {} })
  useProjectStore.setState({ projects: {} })
  useScheduleStore.getState().clear()
  useEventLogStore.getState().clearEvents()
  useProofStore.getState().clear()
  useSessionStore.setState({ active: null, history: {} })

  // Known gaps — present in memory (and will re-persist on their own next
  // mutation) despite this call, because neither store exposes a reset/clear
  // action that reaches them and both are out of scope for this change to
  // edit directly:
  //   - `store/stakesStore.ts`: `sessions`, `events`, `scheduledStakes`,
  //     `selection`, `apps` (also `todayLockMin`/`todayLockDay`/
  //     `stakesPausedUntil`/`recentPanics`). That store exposes no
  //     reset/clear action at all today.
  //   - `store/scheduleStore.ts`: `localEvents`/`externalEvents`/
  //     `externalEventsSyncedAt`. Its `clear()` action (called above) only
  //     resets `blocks`/`unschedulable`/`lastComputedAt`; no other exposed
  //     action reaches the other three fields.
}

// ---------------------------------------------------------------------------
// Account deletion confirmation (FR-87, PRD §8.11).
//
// `wipeAllData` above is DEVICE-ONLY and reversible (the cloud copy survives;
// signing back in restores everything). Deleting the account itself
// (`services/supabase.ts#deleteAccount`) is a different, strictly stronger
// action — permanent, and removes the account from every device — so the
// Settings UI must not let a single "are you sure" gate it the way the local
// wipe above can be. It requires a deliberate, typed gesture instead: the
// user must type this exact word before the delete button in
// `components/settings/DataSettings.tsx` enables.
// ---------------------------------------------------------------------------

/** The word the user must type to confirm permanent account deletion. */
export const DELETE_ACCOUNT_CONFIRM_PHRASE = 'DELETE'

/**
 * Whether `typed` counts as a confirmed request to delete the account.
 * Trims surrounding whitespace and ignores case (autoCapitalize can't be
 * relied on for pasted text, and a 13+ audience gains nothing from a
 * case-sensitivity trap) but otherwise requires an exact match — not a
 * prefix, not a superstring — so a stray keystroke never reads as consent.
 */
export function isDeleteAccountConfirmed(typed: string): boolean {
  return typed.trim().toUpperCase() === DELETE_ACCOUNT_CONFIRM_PHRASE
}
