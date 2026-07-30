/**
 * Event log store — on-device analytics only (PRD §10 "On-device event log").
 *
 * A minimal, append-only log of `AppEvent`s that powers the two headline
 * launch metrics named in the PRD: session completion rate and time-to-start
 * (median reminder/First-move-tap to first action). This is NOT a revival of
 * the removed Learning Engine and its per-signal behavioral log
 * (`V2_Changes.md` §1) — no
 * signals, no derived profiles, no learning. It only records; nothing here
 * reads the log to change app behavior.
 *
 * Local-first via MMKV (persist key "ampora-events"), same pattern as the
 * other stores.
 */

import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { newId } from '@/core/id'
import { mmkvStateStorage } from '@/store/mmkv'
import type { AppEvent } from '@/types'

/** Hard cap so the on-device log never grows without bound. */
const MAX_EVENTS = 500

interface EventLogState {
  events: AppEvent[]

  /** Append one event, timestamped now. Returns the new event's id. */
  logEvent: (type: string) => string

  /** Clear the log (e.g. on sign-out / account reset). */
  clearEvents: () => void
}

export const useEventLogStore = create<EventLogState>()(
  persist(
    (set) => ({
      events: [],

      logEvent: (type) => {
        const id = newId()
        const event: AppEvent = { id, type, at: Date.now() }
        set((state) => {
          const next = [...state.events, event]
          return { events: next.length > MAX_EVENTS ? next.slice(next.length - MAX_EVENTS) : next }
        })
        return id
      },

      clearEvents: () => set({ events: [] }),
    }),
    {
      name: 'ampora-events',
      storage: createJSONStorage(() => mmkvStateStorage),
    },
  ),
)

// ---------------------------------------------------------------------------
// Selectors
// ---------------------------------------------------------------------------

/** All logged events, oldest first. */
export function selectAllEvents(state: EventLogState): AppEvent[] {
  return state.events
}
