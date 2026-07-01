/**
 * 9.5.10 Stability + the top-level `recompute` entry point.
 *
 * recompute(input):
 *   1. Build free intervals (§9.5.1), treating pinned prev blocks as busy.
 *   2. Order dated-eligible tasks (§9.5.2, FR-10, FR-19).
 *   3. Placement loop (§9.5.3) for dated tasks, then undated backfill (§9.5.11).
 *   4. STABILITY: reconcile the freshly-computed blocks against `prevBlocks`.
 *      A previous block whose (taskId, start, end) is reproduced by the new
 *      run is PRESERVED verbatim (same id/createdAt — no churn, no animation).
 *      Pinned prev blocks are carried through untouched as immovable inputs.
 *      Only genuinely new/changed blocks get fresh ids.
 *
 * Returns { blocks, unschedulable }. Pure; deterministic given `now`.
 */

import type { ScheduledBlock } from '@/types'
import {
  DEFAULT_CUTOFF_DAYS,
  MS_PER_DAY,
  type ScheduleInput,
  type ScheduleResult,
} from './types'
import { buildFreeIntervals } from './freeTime'
import { orderTasks, orderUndatedBackfill } from './ordering'
import { initState, placeTask, type PlacementContext } from './placement'

/** Stable key for matching a placed block to a prior one (task + exact time). */
function blockKey(taskId: string, start: number, end: number): string {
  return `${taskId}|${start}|${end}`
}

export function recompute(input: ScheduleInput): ScheduleResult {
  const { tasks, prevBlocks, calEvents, settings, now } = input
  const cutoffDays = input.cutoffDays ?? DEFAULT_CUTOFF_DAYS
  const cutoff = now + cutoffDays * MS_PER_DAY
  const workload = input.workload ?? 'balanced'

  // --- 1. Free intervals (pinned prev blocks subtracted as busy). ---
  const free = buildFreeIntervals({
    now,
    cutoff,
    tasks,
    calEvents,
    prevBlocks,
    schedulingHours: settings.schedulingHours,
    quietHours: settings.quietHours,
    energyPeak: settings.energyPeak,
  })

  // Sum minutes held by pinned prev blocks per task. These blocks are immovable
  // inputs (subtracted from free time above and carried through untouched in the
  // stability pass below); crediting their minutes here stops the placement loop
  // from scheduling that same work a second time.
  const pinnedMinutesByTask = new Map<string, number>()
  for (const b of prevBlocks) {
    if (!b.pinned) continue
    const mins = (b.end - b.start) / (60 * 1000)
    pinnedMinutesByTask.set(b.taskId, (pinnedMinutesByTask.get(b.taskId) ?? 0) + mins)
  }

  const ctx: PlacementContext = {
    now,
    cutoff,
    defaultSchedulingHours: settings.schedulingHours,
    workload,
    pinnedMinutesByTask,
  }
  const state = initState(free)

  // --- 2 + 3. Order and place dated tasks. ---
  const ordered = orderTasks(tasks, now, cutoff)
  for (const task of ordered) {
    placeTask(task, ctx, state)
  }

  // --- 3b. Undated auto-scheduled backfill, lowest priority, never displaces
  //         dated work (§9.5.11). They consume only leftover free time. ---
  const backfill = orderUndatedBackfill(tasks)
  for (const task of backfill) {
    placeTask(task, ctx, state)
  }

  // --- 4. Stability reconciliation (§9.5.10). ---
  const freshBlocks = state.blocks

  // Index prev blocks by their stable (task,time) key. Pinned blocks are
  // carried through as immovable inputs regardless of the new placement.
  const prevByKey = new Map<string, ScheduledBlock>()
  const pinned: ScheduledBlock[] = []
  for (const b of prevBlocks) {
    if (b.pinned) {
      pinned.push(b)
      continue
    }
    prevByKey.set(blockKey(b.taskId, b.start, b.end), b)
  }

  const reconciled: ScheduledBlock[] = []
  const usedPrev = new Set<string>()

  // Pinned blocks are immovable — always keep them.
  for (const p of pinned) reconciled.push(p)

  for (const fresh of freshBlocks) {
    const key = blockKey(fresh.taskId, fresh.start, fresh.end)
    const prior = prevByKey.get(key)
    if (prior && !usedPrev.has(prior.id)) {
      // Unchanged: preserve the old block verbatim (no churn / no animation).
      reconciled.push(prior)
      usedPrev.add(prior.id)
    } else {
      // New or moved block: keep the freshly-generated one.
      reconciled.push(fresh)
    }
  }

  reconciled.sort((a, b) => a.start - b.start || (a.taskId < b.taskId ? -1 : 1))

  return { blocks: reconciled, unschedulable: state.unschedulable }
}
