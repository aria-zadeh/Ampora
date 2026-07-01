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
import type { ScheduledBlock } from '@/types'
import { recompute as engineRecompute, type Unschedulable } from '@/core/scheduler'
import { mmkvStateStorage } from '@/store/mmkv'
import { useTaskStore } from '@/store/taskStore'
import { useSettingsStore } from '@/store/settingsStore'
import { startOfDay } from '@/core/scheduler/time'

interface ScheduleState {
  blocks: Record<string, ScheduledBlock>
  unschedulable: Unschedulable[]
  lastComputedAt: number | null

  /** Run the engine against current task + settings state and store results. */
  recompute: () => void
  /** Toggle a block's pinned flag (pinned = immovable input to future recomputes). */
  setPinned: (blockId: string, pinned: boolean) => void
  /**
   * Move a block to a new start time (FR-28 drag-to-reschedule). Shifts the
   * block by the same delta at both edges (preserves duration) and marks it
   * `pinned` so future recomputes treat it as an immovable input (§9.5.10).
   */
  moveBlock: (blockId: string, newStart: number) => void
  /** Clear all computed schedule state. */
  clear: () => void
}

/**
 * Guard against re-entrancy: while `recompute()` is running we must not let a
 * store write (which we do NOT do to task/settings, but belt-and-suspenders)
 * or a synchronous subscription fire a nested recompute.
 */
let isComputing = false

export const useScheduleStore = create<ScheduleState>()(
  persist(
    (set, get) => ({
      blocks: {},
      unschedulable: [],
      lastComputedAt: null,

      recompute: () => {
        if (isComputing) return
        isComputing = true
        try {
          const tasks = Object.values(useTaskStore.getState().tasks)
          const settings = useSettingsStore.getState().settings
          const prevBlocks = Object.values(get().blocks)

          const result = engineRecompute({
            tasks,
            prevBlocks,
            // No CalEvent store exists yet (calendar is Phase 3); pass empty
            // until an events source is wired in. Engine handles [] cleanly.
            calEvents: [],
            settings,
            now: Date.now(),
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

export function selectUnschedulable(state: ScheduleState): Unschedulable[] {
  return state.unschedulable
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
      a.quietHours !== b.quietHours ||
      a.energyPeak !== b.energyPeak
    ) {
      scheduleRecompute()
    }
  })

  return () => {
    unsubTasks()
    unsubSettings()
    if (debounceTimer) clearTimeout(debounceTimer)
    debounceTimer = null
    triggersWired = false
  }
}

// Auto-wire on import (app-side). Pure engine tests import from
// `@/core/scheduler` directly and never load this module, so this side effect
// stays out of the portable engine.
wireScheduleTriggers()
