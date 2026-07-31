/**
 * Schedule store — holds the output of the on-device scheduling engine
 * (PRD §9.5) and owns the recompute triggers (FR-21).
 *
 * This store is the ONLY bridge between the pure engine (`core/scheduler/`)
 * and app state. The engine stays pure; this store reads task + settings state
 * imperatively at recompute time (never subscribes the engine to React) and
 * writes results here. It NEVER writes back to the task or settings stores, so
 * the trigger subscriptions below cannot loop.
 *
 * Persistence: MMKV, name "ampora-schedule" (blocks survive app restarts so a
 * cold open shows the last plan instantly, then refines on the app-open pass).
 */

import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { AppState, type AppStateStatus } from 'react-native'
import type { CalEvent, ScheduledBlock } from '@/types'
import { recompute as engineRecompute, DEFAULT_CUTOFF_DAYS, type Unschedulable } from '@/core/scheduler'
import { mmkvStateStorage } from '@/store/mmkv'
import { useTaskStore } from '@/store/taskStore'
import { useListStore } from '@/store/listStore'
import { useSettingsStore } from '@/store/settingsStore'
import { startOfDay } from '@/core/scheduler/time'
import { newId } from '@/core/id'
import type { List } from '@/types'
import * as calendarSync from '@/services/calendarSync'

const MS_PER_DAY = 86_400_000
const MS_PER_MIN = 60_000

/**
 * Minimum spacing between two external-calendar re-fetches (FR-22). Every
 * `recompute()` call opportunistically refreshes when the cache is this
 * stale (see `maybeKickExternalEventsRefresh` below), which is what makes
 * "on the manual Rebuild schedule action" and "on a daily background pass"
 * (both of which are plain `recompute()` calls per FR-21) also refresh the
 * calendar without recompute() itself ever doing a blocking fetch — it stays
 * synchronous and reads whatever is already cached. Short enough that a
 * deliberate "Rebuild schedule" tap almost always picks up a real refetch;
 * long enough that a burst of task edits (each debounced-recompute) does not
 * hammer the device calendar database.
 */
const EXTERNAL_EVENTS_STALE_MS = 2 * 60 * 1000

interface ScheduleState {
  blocks: Record<string, ScheduledBlock>
  unschedulable: Unschedulable[]
  lastComputedAt: number | null
  /**
   * Cached external (device-calendar) busy events, keyed into the engine as
   * `calEvents` (FR-22). Cached rather than fetched inline so `recompute()`
   * — debounced 300ms and budgeted <300ms — never itself awaits a native
   * calendar query; the cache is refreshed out-of-band by
   * `refreshExternalEvents()`.
   */
  externalEvents: CalEvent[]
  /** `Date.now()` of the last successful (or intentionally-cleared) external-events fetch, or null before the first one. */
  externalEventsSyncedAt: number | null

  /**
   * User-created fixed Events (PRD FR-1, FR-28), keyed by id — the "local"
   * counterpart to `externalEvents`. Unlike the external cache (wholesale-
   * replaced by a device-calendar refetch), these are the canonical record:
   * created/edited/deleted directly by the user via `AddEventModal`, and
   * persisted here through the same MMKV `persist()` wrapper as `blocks`
   * (no separate storage needed — see the file header). Always
   * `source: 'local'`, always `busy: true` (an Event the user adds exists
   * specifically to keep the engine from booking over it — see
   * `addLocalEvent`).
   */
  localEvents: Record<string, CalEvent>

  /** Run the engine against current task + settings state and store results. */
  recompute: () => void
  /**
   * The nightly pre-built-tomorrow pass's entry point (PRD FR-90). HONEST
   * NAME, NOT A DIFFERENT ALGORITHM: `core/scheduler/**` has no per-day
   * recompute mode — `recompute()` always walks the full cutoff window
   * (PRD §9.5.1 "from now to cutoff") — so this is a thin, semantically-named
   * alias for `recompute()` that documents WHY `services/nightlyPass.ts`
   * calls it: "tomorrow" is inside that window, so a full recompute is what
   * actually places any newly-generated project session (FR-84) onto
   * tomorrow's calendar. If the engine ever grows a real day-scoped mode,
   * this is the seam to swap it in without touching the nightly-pass caller.
   */
  recomputeTomorrow: () => void
  /**
   * Re-fetch busy events from the device calendars selected in Settings
   * (`settingsStore.calendarSyncCalendarIds`) and replace the cache, then
   * recompute. Always a full replace, never a per-item merge: `fetchBusyEvents`
   * already returns the COMPLETE set for the selected calendars over the full
   * planning window, so replacing wholesale is what correctly keeps a refresh
   * from duplicating or leaking a deleted/out-of-range event — a stale entry
   * simply isn't in the fresh set and disappears from the cache too, rather
   * than needing an explicit removal pass. No-ops (but still clears a
   * previously-cached, now-orphaned set) when no calendar is selected or
   * permission is no longer granted. Never throws — `services/calendarSync.ts`
   * degrades to `[]` on any error, web, or a denied/undetermined permission
   * (FR-64).
   */
  refreshExternalEvents: () => Promise<void>
  /**
   * Create a fixed local Event (PRD FR-1, FR-28 "long-press empty space to
   * create") and recompute immediately so it takes effect as busy time on
   * this same tick — not on the next debounced pass, since this is a
   * deliberate one-off user action, not a rapid-fire edit stream. Falls back
   * to "Busy" when left untitled (matches the device-sync fallback in
   * `services/calendarSync.ts#toCalEvent`). `end` is clamped to be at least
   * one minute after `start` so a mis-picked/equal time can never produce an
   * inverted or zero-length busy span.
   */
  addLocalEvent: (input: { title: string; start: number; end: number; allDay?: boolean }) => CalEvent
  /**
   * Edit a local Event in place (title/time only — `source`/`id` are fixed).
   * A no-op if `id` is not a local event (e.g. it was deleted from another
   * device since the sheet opened). Recomputes immediately, same reasoning
   * as `addLocalEvent`.
   */
  updateLocalEvent: (
    id: string,
    patch: Partial<Pick<CalEvent, 'title' | 'start' | 'end' | 'allDay'>>
  ) => void
  /**
   * Delete a local Event outright (BlockActionSheet-style: no confirmation
   * dialog, matching `deleteTask`'s bar). Device-synced events can never
   * reach this — `EventActionSheet` only offers Delete for `source: 'local'`.
   * Recomputes immediately so the freed time is available again right away.
   */
  deleteLocalEvent: (id: string) => void
  /** Toggle a block's pinned flag (pinned = immovable input to future recomputes). */
  setPinned: (blockId: string, pinned: boolean) => void
  /**
   * Move a block to a new start time (FR-28 drag-to-reschedule). Shifts the
   * block by the same delta at both edges (preserves duration) and marks it
   * `pinned` so future recomputes treat it as an immovable input (§9.5.10).
   */
  moveBlock: (blockId: string, newStart: number) => void
  /**
   * "Reschedule" a missed block (Home "Needs attention", FR-16/FR-60): drop the
   * elapsed block and let the engine re-place the task's remaining work in the
   * next available window. Removing the block frees its (already-past) time; the
   * task itself still carries the remaining minutes, so the immediately-following
   * recompute re-slots it forward. Calm, no shame — this is a one-tap "try again".
   */
  rescheduleBlock: (blockId: string) => void
  /**
   * "Let it go" (Home "Needs attention"): silently drop a missed block with no
   * side effects and no recompute. The task is untouched — the user is simply
   * clearing the reminder for this lapsed session (zero-shame tone, FR-60).
   */
  dropBlock: (blockId: string) => void
  /** Clear all computed schedule state. */
  clear: () => void
}

/**
 * Guard against re-entrancy: while `recompute()` is running we must not let a
 * store write (which we do NOT do to task/settings, but belt-and-suspenders)
 * or a synchronous subscription fire a nested recompute.
 */
let isComputing = false

/**
 * The staleness gate described on `EXTERNAL_EVENTS_STALE_MS`. Defined at
 * module scope (not inline in the store creator) purely for readability;
 * `useScheduleStore` is only referenced inside the function body, which never
 * runs before the module has finished evaluating, so the forward reference is
 * safe.
 */
function maybeKickExternalEventsRefresh(): void {
  const { calendarSyncCalendarIds } = useSettingsStore.getState()
  if (!calendarSyncCalendarIds || calendarSyncCalendarIds.length === 0) return
  const { externalEventsSyncedAt, refreshExternalEvents } = useScheduleStore.getState()
  if (externalEventsSyncedAt != null && Date.now() - externalEventsSyncedAt < EXTERNAL_EVENTS_STALE_MS) {
    return
  }
  refreshExternalEvents().catch(() => {
    // refreshExternalEvents already swallows every internal error (its own
    // calendarSync calls never throw); this catch only guards the exceedingly
    // unlikely case of a synchronous throw before the first `await`.
  })
}

export const useScheduleStore = create<ScheduleState>()(
  persist(
    (set, get) => ({
      blocks: {},
      unschedulable: [],
      lastComputedAt: null,
      externalEvents: [],
      externalEventsSyncedAt: null,
      localEvents: {},

      recompute: () => {
        if (isComputing) return
        isComputing = true
        try {
          const tasks = Object.values(useTaskStore.getState().tasks)
          const settings = useSettingsStore.getState().settings
          const prevBlocks = Object.values(get().blocks)

          // List map so per-task scheduling-hours resolution can fall back to a
          // task's list-level override (task -> list -> settings default).
          const listMap: Record<string, List> = useListStore.getState().lists

          const result = engineRecompute({
            tasks,
            prevBlocks,
            // Busy calendar events: user-created LOCAL events (FR-1, FR-28 —
            // the canonical record, persisted in this store) concatenated
            // with the cached EXTERNAL device-sync events (FR-22). Local
            // events need no staleness gate (they're already the source of
            // truth in memory); external events are read from the cache
            // below — never fetched inline, so recompute() stays synchronous
            // and inside its <300ms budget.
            calEvents: [...Object.values(get().localEvents), ...get().externalEvents],
            settings,
            now: Date.now(),
            // Honour the user's workload preference (FR-14). Without this the
            // Balanced/Front-load toggle in Settings would never reach the engine.
            workload: settings.workloadDistribution ?? 'balanced',
            listMap,
          })

          const blocks: Record<string, ScheduledBlock> = {}
          for (const b of result.blocks) blocks[b.id] = b

          set({
            blocks,
            unschedulable: result.unschedulable,
            lastComputedAt: Date.now(),
          })
        } finally {
          isComputing = false
        }
        // Fire-and-forget, staleness-gated (FR-22): every recompute() trigger
        // (task edits, the manual "Rebuild schedule" button, the daily
        // background pass, app open — FR-21) is also an opportunity to notice
        // a stale external-events cache and refresh it. Never awaited — this
        // must not push recompute() itself over its sync budget. When the
        // fetch resolves it updates the cache and calls recompute() again, so
        // the plan picks up calendar changes moments later. Outside the
        // try/finally above so it can never affect `isComputing`.
        maybeKickExternalEventsRefresh()
      },

      recomputeTomorrow: () => {
        get().recompute()
      },

      refreshExternalEvents: async () => {
        const calendarIds = useSettingsStore.getState().calendarSyncCalendarIds
        if (!calendarIds || calendarIds.length === 0) {
          // Nothing selected (including "never selected anything yet") — clear
          // any previously-cached events (e.g. the user disconnected every
          // calendar) rather than keep planning around a stale set.
          if (get().externalEvents.length > 0) {
            set({ externalEvents: [], externalEventsSyncedAt: Date.now() })
            get().recompute()
          } else {
            set({ externalEventsSyncedAt: Date.now() })
          }
          return
        }

        const status = await calendarSync.getPermissionStatus()
        if (status !== 'granted') {
          // Permission revoked/denied since calendars were selected — degrade
          // silently (FR-64): drop the cache rather than keep planning around
          // events we can no longer verify, but never surface an error.
          if (get().externalEvents.length > 0) {
            set({ externalEvents: [], externalEventsSyncedAt: Date.now() })
            get().recompute()
          } else {
            set({ externalEventsSyncedAt: Date.now() })
          }
          return
        }

        const now = Date.now()
        const rangeEnd = now + DEFAULT_CUTOFF_DAYS * MS_PER_DAY
        const fresh = await calendarSync.fetchBusyEvents(calendarIds, now, rangeEnd)
        set({ externalEvents: fresh, externalEventsSyncedAt: Date.now() })
        get().recompute()
      },

      addLocalEvent: (input) => {
        const now = Date.now()
        const start = input.start
        const end = Math.max(input.end, start + MS_PER_MIN)
        const event: CalEvent = {
          id: newId(),
          createdAt: now,
          updatedAt: now,
          syncState: 'pending',
          title: input.title.trim() || 'Busy',
          start,
          end,
          allDay: input.allDay,
          source: 'local',
          busy: true,
        }
        set((state) => ({ localEvents: { ...state.localEvents, [event.id]: event } }))
        get().recompute()
        return event
      },

      updateLocalEvent: (id, patch) => {
        set((state) => {
          const existing = state.localEvents[id]
          if (!existing) return state
          const start = patch.start ?? existing.start
          const end = Math.max(patch.end ?? existing.end, start + MS_PER_MIN)
          const next: CalEvent = {
            ...existing,
            ...patch,
            title: patch.title != null ? patch.title.trim() || 'Busy' : existing.title,
            start,
            end,
            updatedAt: Date.now(),
            syncState: 'pending',
          }
          return { localEvents: { ...state.localEvents, [id]: next } }
        })
        get().recompute()
      },

      deleteLocalEvent: (id) => {
        set((state) => {
          if (!(id in state.localEvents)) return state
          const next = { ...state.localEvents }
          delete next[id]
          return { localEvents: next }
        })
        get().recompute()
      },

      setPinned: (blockId, pinned) => {
        set((state) => {
          const block = state.blocks[blockId]
          if (!block) return state
          return {
            blocks: {
              ...state.blocks,
              [blockId]: { ...block, pinned, updatedAt: Date.now(), syncState: 'pending' },
            },
          }
        })
      },

      moveBlock: (blockId, newStart) => {
        set((state) => {
          const block = state.blocks[blockId]
          if (!block) return state
          const duration = block.end - block.start
          return {
            blocks: {
              ...state.blocks,
              [blockId]: {
                ...block,
                start: newStart,
                end: newStart + duration,
                pinned: true,
                updatedAt: Date.now(),
                syncState: 'pending',
              },
            },
          }
        })
      },

      rescheduleBlock: (blockId) => {
        // Drop the missed block, then recompute so the engine re-places the
        // task's remaining work forward. Guarded by the recompute re-entrancy
        // flag; the removal itself is a plain set on our own store.
        const existing = get().blocks[blockId]
        if (!existing) return
        set((state) => {
          const next = { ...state.blocks }
          delete next[blockId]
          return { blocks: next }
        })
        get().recompute()
      },

      dropBlock: (blockId) => {
        set((state) => {
          if (!(blockId in state.blocks)) return state
          const next = { ...state.blocks }
          delete next[blockId]
          return { blocks: next }
        })
      },

      clear: () => set({ blocks: {}, unschedulable: [], lastComputedAt: null }),
    }),
    {
      name: 'ampora-schedule',
      storage: createJSONStorage(() => mmkvStateStorage),
    }
  )
)

// ---------------------------------------------------------------------------
// Selectors — callers that return NEW arrays MUST wrap with `useShallow`
// (Zustand v5, per project rules) to avoid React #185 infinite loops.
// ---------------------------------------------------------------------------

export function selectAllBlocks(state: ScheduleState): ScheduledBlock[] {
  return Object.values(state.blocks)
}

export function selectBlockForTask(taskId: string) {
  return (state: ScheduleState): ScheduledBlock[] =>
    Object.values(state.blocks)
      .filter((b) => b.taskId === taskId)
      .sort((a, b) => a.start - b.start)
}

export function selectUpcomingBlocks(limit: number) {
  return (state: ScheduleState): ScheduledBlock[] => {
    const now = Date.now()
    return Object.values(state.blocks)
      .filter((b) => b.end >= now)
      .sort((a, b) => a.start - b.start)
      .slice(0, limit)
  }
}

export function selectBlocksByDay(dayStartMs: number) {
  const dayStart = startOfDay(dayStartMs)
  const dayEnd = dayStart + 86_400_000
  return (state: ScheduleState): ScheduledBlock[] =>
    Object.values(state.blocks)
      .filter((b) => b.start < dayEnd && b.end > dayStart)
      .sort((a, b) => a.start - b.start)
}

/** Every CalEvent (local + external), unfiltered. Callers MUST wrap with `useShallow`. */
export function selectAllCalEvents(state: ScheduleState): CalEvent[] {
  return [...Object.values(state.localEvents), ...state.externalEvents]
}

/**
 * CalEvents (local + external) overlapping one calendar day, clipped to that
 * day's [00:00, 24:00) boundary — mirrors `selectBlocksByDay`. An event that
 * crosses midnight is deliberately NOT returned with its raw full-width span:
 * per `docs/09_Decisions.md` ("an event crossing midnight splits at the day
 * boundary"), each day's projection is clamped to its own grid so a
 * DayView/ThreeDayView column never receives a span outside its own 24h
 * geometry. The clamp is purely a per-day RENDER projection — the store still
 * holds each event's canonical, un-clipped start/end; edit/delete always look
 * it up by `id`, never by the clipped copy's times. Callers MUST wrap with
 * `useShallow` (Zustand v5, per project rules).
 */
export function selectEventsByDay(dayStartMs: number) {
  const dayStart = startOfDay(dayStartMs)
  const dayEnd = dayStart + 86_400_000
  return (state: ScheduleState): CalEvent[] =>
    selectAllCalEvents(state)
      .filter((e) => e.start < dayEnd && e.end > dayStart)
      .map((e): CalEvent => {
        const start = Math.max(e.start, dayStart)
        const end = Math.min(e.end, dayEnd)
        return start === e.start && end === e.end ? e : { ...e, start, end }
      })
      .sort((a, b) => a.start - b.start)
}

export function selectUnschedulable(state: ScheduleState): Unschedulable[] {
  return state.unschedulable
}

/**
 * Missed scheduled blocks (status 'missed'), earliest-first — the "Needs
 * attention" surface (FR-16/FR-60). Returns a NEW array, so callers MUST wrap
 * with `useShallow` (Zustand v5) to avoid a React #185 render loop. Reads the
 * persisted `status` set by the engine's missed-marking pass; it does not
 * re-derive "missed" against a live clock, so it stays a pure store read.
 */
export function selectMissedBlocks(state: ScheduleState): ScheduledBlock[] {
  return Object.values(state.blocks)
    .filter((b) => b.status === 'missed')
    .sort((a, b) => a.start - b.start)
}

/**
 * Distinct task ids that currently have at least one missed block — powers the
 * Tasks screen's "Missed" filter (FR-16). Returns a NEW array; callers MUST
 * wrap with `useShallow` (Zustand v5) to avoid a React #185 loop.
 */
export function selectMissedTaskIds(state: ScheduleState): string[] {
  const ids = new Set<string>()
  for (const b of Object.values(state.blocks)) {
    if (b.status === 'missed') ids.add(b.taskId)
  }
  return Array.from(ids)
}

// ---------------------------------------------------------------------------
// Recompute triggers (FR-21): debounced 300ms subscription to task + settings
// stores. Registered once at module load. Guarded against loops because
// `recompute()` never writes to task/settings state.
// ---------------------------------------------------------------------------

const DEBOUNCE_MS = 300
let debounceTimer: ReturnType<typeof setTimeout> | null = null

function scheduleRecompute(): void {
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    debounceTimer = null
    useScheduleStore.getState().recompute()
  }, DEBOUNCE_MS)
}

/**
 * Wire the triggers. Called once (idempotent) at module import. Kept as a
 * function so tests can opt out / control it. Subscribes to the SLICES that
 * matter (tasks map; scheduling-relevant settings) so unrelated settings edits
 * (e.g. themePreference) do not thrash the engine.
 */
let triggersWired = false
export function wireScheduleTriggers(): () => void {
  if (triggersWired) return () => undefined
  triggersWired = true

  const unsubTasks = useTaskStore.subscribe((state, prev) => {
    if (state.tasks !== prev.tasks) scheduleRecompute()
  })

  const unsubSettings = useSettingsStore.subscribe((state, prev) => {
    const a = state.settings
    const b = prev.settings
    if (
      a.schedulingHours !== b.schedulingHours ||
      a.quietHours !== b.quietHours
    ) {
      scheduleRecompute()
    }
  })

  // Calendar selection changed (FR-22, CalendarSyncSettings): a real refetch,
  // not just a recompute against the stale cache, so the newly (de)selected
  // calendar's events actually show up or drop out promptly rather than
  // waiting for the 2-minute staleness gate or the next app foreground.
  const unsubCalendarIds = useSettingsStore.subscribe((state, prev) => {
    if (state.calendarSyncCalendarIds !== prev.calendarSyncCalendarIds) {
      useScheduleStore
        .getState()
        .refreshExternalEvents()
        .catch(() => {})
    }
  })

  // Refresh on app foreground (FR-22 "Refresh on app foreground and on manual
  // Rebuild schedule"). "Rebuild schedule" and the other FR-21 triggers are
  // covered by the staleness gate inside `recompute()` itself
  // (`maybeKickExternalEventsRefresh`); returning from the background is not
  // itself a recompute trigger anywhere else in the app, so it needs its own
  // listener. Registered unconditionally — `AppState` is available under
  // react-native-web too, and every downstream calendarSync call is already
  // platform-guarded, so this is a harmless no-op on web.
  const appStateSub = AppState.addEventListener('change', (next: AppStateStatus) => {
    if (next === 'active') {
      useScheduleStore
        .getState()
        .refreshExternalEvents()
        .catch(() => {})
    }
  })

  return () => {
    unsubTasks()
    unsubSettings()
    unsubCalendarIds()
    appStateSub.remove()
    if (debounceTimer) clearTimeout(debounceTimer)
    debounceTimer = null
    triggersWired = false
  }
}

// Auto-wire on import (app-side). Pure engine tests import from
// `@/core/scheduler` directly and never load this module, so this side effect
// stays out of the portable engine.
wireScheduleTriggers()
