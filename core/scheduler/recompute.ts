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
 *   5. MISSED: mark any elapsed block whose owning task is still open as
 *      `status: 'missed'`, feeding the shared Recovery detection.
 *
 * Returns { blocks, unschedulable }. Pure; deterministic given `now`.
 */

import type { ScheduledBlock, Task } from '@/types'
import {
  DEFAULT_CUTOFF_DAYS,
  MS_PER_DAY,
  type ScheduleInput,
  type ScheduleResult,
} from './types'
import { buildFreeIntervals } from './freeTime'
import { orderTasks, orderUndatedBackfill } from './ordering'
import { initState, placeTask, type PlacementContext } from './placement'
import { isMissedBlock } from '@/core/recovery'

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
    listMap: input.listMap,
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

  // Task lookup, built once: used both by the elapsed-block carry-forward in the
  // stability pass and by the missed auto-marking pass below.
  const taskById = new Map<string, Task>()
  for (const t of tasks) taskById.set(t.id, t)

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

  // Carry forward ELAPSED non-pinned prev blocks the fresh run did not reproduce,
  // so the missed-mark pass below can flag them (PRD FR-16 / §8.6). The fresh
  // placement clamps every candidate slot to `now` (`buildFreeIntervals` /
  // `candidateSlots`), so a past session can NEVER be re-emitted by this run —
  // without this carry-forward it would simply be dropped and never marked
  // 'missed'. We only rescue blocks that (a) already ended (`end <= now`) and
  // (b) belong to a still-open task (not done / not actively doing) — those are
  // the missed candidates. Un-reproduced FUTURE non-pinned prev blocks are left
  // out on purpose: the fresh placement legitimately replaced them, so carrying
  // them would double-schedule the same task's remaining work. The final sort
  // below gives a total, deterministic order regardless of insertion order.
  for (const prev of prevByKey.values()) {
    if (usedPrev.has(prev.id)) continue // already re-emitted as an unchanged match
    if (prev.end > now) continue // future: the fresh run owns this slot — do not duplicate
    const task = taskById.get(prev.taskId)
    if (!task || task.status === 'done' || task.status === 'doing') continue // task closed/active
    reconciled.push(prev)
  }

  reconciled.sort((a, b) => a.start - b.start || (a.taskId < b.taskId ? -1 : 1))

  // --- 5. Missed auto-marking (PRD FR-16 / §8.6 "Needs attention"). ---
  // After stability, a reconciled block that has fully elapsed and whose owning
  // task is still open (not done, not actively being worked) is a missed
  // session. Marking `status: 'missed'` here is what FEEDS the pure Recovery
  // detection (`isMissedBlock`/`countMissedBlocks`/`detectLapse` in
  // `core/recovery.ts`) — a `missed` block satisfies that same predicate, so
  // the lapse banner and the Home "Needs attention" surface both read from one
  // source of truth. We reuse `isMissedBlock` for the block half of the test
  // and additionally require the parent task itself to be open, so a past
  // `planned` block whose task the user has since completed is NOT flagged.
  const marked = reconciled.map((block) => {
    if (block.status === 'missed') return block // already marked; leave it be
    if (!isMissedBlock(block, now)) return block // not elapsed / already done/in-progress
    const task = taskById.get(block.taskId)
    // Parent task open (neither done nor actively doing) => this session lapsed.
    if (task && task.status !== 'done' && task.status !== 'doing') {
      return { ...block, status: 'missed' as const }
    }
    return block
  })

  return { blocks: marked, unschedulable: state.unschedulable }
}
