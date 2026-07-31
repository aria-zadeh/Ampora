/**
 * Data export / wipe helpers — Phase 7 (PRD §8.11 "data export", "delete all").
 *
 * Pure-ish helpers that read/reset the local Zustand+MMKV stores. Kept out of
 * the UI so the serialization shape is stable, testable, and reused by any
 * future "download my data" surface. No network — this is purely the local
 * copy (which, being local-first, is the user's whole dataset today).
 *
 * `buildExport` snapshots every user-content store into one JSON-serializable
 * object. `wipeAllData` clears the persisted MMKV blob and resets every store's
 * in-memory collections so the running app reflects the wipe immediately
 * (without requiring a reload).
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
 * Delete all local data. Clears the persisted MMKV blob (all stores share the
 * one `ampora` instance) then resets every in-memory store's collections so the
 * live app reflects the wipe without a reload.
 *
 * Settings are intentionally NOT reset to defaults here — the account-level
 * "delete all" is about user *content* (tasks/projects/history), and resetting
 * theme/onboarding would eject the user from the app. `clearAll()` already
 * removed the persisted settings key; the in-memory Settings stay as-is for
 * this session, and re-persist on next change. (A future "reset app" can wipe
 * settings too.)
 */
export function wipeAllData(): void {
  // 1. Nuke the persisted store.
  mmkv.clearAll()

  // 2. Reset in-memory collections so the running UI updates now.
  useTaskStore.setState({ tasks: {} })
  useListStore.setState({ lists: {}, tags: {} })
  useProjectStore.setState({ projects: {} })
  useScheduleStore.getState().clear()
  useEventLogStore.getState().clearEvents()
  useProofStore.getState().clear()
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
