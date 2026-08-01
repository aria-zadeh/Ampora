/**
 * 9.5.3 Placement loop + bestWindow scoring.
 *
 * For each ordered task:
 *   remaining = durationMin - progressMin
 *   windows   = free intervals filtered to the task's scheduling hours,
 *               within [startAfter, due], and AFTER all deps finish
 *   mode      = near/over due ? frontload : settings workload
 *   place one block (non-splittable) or session-sized blocks (splittable),
 *   consuming free time as we go. Unplaceable work is collected, never dropped.
 *
 * bestWindow score = base - loadPenalty - latenessPenalty
 *   frontload: base = -startTimeOffset  (earliest start wins)
 *   balanced : loadPenalty = k1 * (minsPlacedThatDay / dayCapacity), k1 = 1.0
 *   latenessPenalty: large if placing risks missing due (forces front-load)
 *
 * Pure; mutates only its own working copies.
 */

import type { List, ScheduledBlock, SchedulingHours, Task } from '@/types'
import { stableId } from '@/core/id'
import {
  DEPENDENCY_BLOCKED_REASON,
  MS_PER_DAY,
  MS_PER_MIN,
  type FreeInterval,
  type MaybeDependencyBlocked,
  type Span,
  type Unschedulable,
  type UnschedulableReasonKind,
  type WorkloadMode,
} from './types'
import {
  clampSpans,
  dayWindowsToSpans,
  daysWithCapacity,
  startOfDay,
  subtractSpans,
  unionSpans,
} from './time'
import { sessionSizes } from './sessionSizing'
import { isNearOrOverDue, remainingMinutes } from './slack'

const K_LOAD = 1.0
const LATENESS_PENALTY = 1e6 // dominant: never let balance cause a miss

/** Working free interval with mutable end for in-place consumption. */
interface FreeSlot {
  start: number
  end: number
}

export interface PlacementContext {
  now: number
  cutoff: number
  defaultSchedulingHours: SchedulingHours
  workload: WorkloadMode
  /**
   * Minutes already covered by pinned prev blocks, keyed by taskId. A pinned
   * block (from drag-move, postpone, or an explicit lock) is an immovable input
   * that is carried through recompute verbatim; its minutes must be credited
   * against the owning task's remaining work so the task is not scheduled a
   * second time (which would render it twice on the calendar). Optional so pure
   * engine tests can omit it (treated as 0).
   */
  pinnedMinutesByTask?: Map<string, number>
  /**
   * Lists keyed by id, so a task with no `schedulingHours` of its own can
   * inherit its list's override before falling back to the app default
   * (`task.schedulingHours ?? list.schedulingHours ?? defaultSchedulingHours`,
   * PRD FR-13). Optional — when absent, list resolution is skipped.
   */
  listMap?: Record<string, List>
}

export interface PlacementState {
  /** Live free slots, kept sorted by start, consumed as blocks are placed. */
  slots: FreeSlot[]
  /** taskId -> finish instant (max block end) for dependency chaining (FR-19). */
  taskFinish: Map<string, number>
  /** Blocks produced this run. */
  blocks: ScheduledBlock[]
  /** dayStart(ms) -> minutes already placed that day (for balanced load penalty). */
  placedPerDay: Map<number, number>
  /** Unschedulable reasons collected (FR-20). */
  unschedulable: Unschedulable[]
}

export function initState(free: FreeInterval[]): PlacementState {
  return {
    slots: free.map((f) => ({ start: f.start, end: f.end })),
    taskFinish: new Map(),
    blocks: [],
    placedPerDay: new Map(),
    unschedulable: [],
  }
}

/** Per-task effective scheduling-hours spans across [lo, hi). */
function taskHoursSpans(
  task: Task,
  ctx: PlacementContext,
  lo: number,
  hi: number
): Span[] {
  // Resolution order (PRD FR-13): a task's own override wins, else its list's
  // override, else the app-wide default. The list is resolved via `task.listId`.
  const listHours =
    task.listId != null ? ctx.listMap?.[task.listId]?.schedulingHours : undefined
  const hours = task.schedulingHours ?? listHours ?? ctx.defaultSchedulingHours
  const spans: Span[] = []
  for (let dayStart = startOfDay(lo); dayStart < hi; dayStart += MS_PER_DAY) {
    const weekday = new Date(dayStart).getDay()
    const perDay = hours.perDay.find((d) => d.day === weekday)
    if (!perDay) continue
    for (const s of dayWindowsToSpans(dayStart, perDay.windows)) spans.push(s)
  }
  return clampSpans(unionSpans(spans), lo, hi)
}

/**
 * Candidate windows for a task: current free slots ∩ task scheduling hours,
 * clamped to [startAfter, due] and to after all deps finish.
 */
function candidateSlots(
  task: Task,
  ctx: PlacementContext,
  state: PlacementState
): FreeSlot[] {
  // Lower bound: max(now, startAfter, latest dep finish).
  let lo = ctx.now
  if (task.startAfter != null) lo = Math.max(lo, task.startAfter)
  for (const depId of task.dependsOn ?? []) {
    const fin = state.taskFinish.get(depId)
    if (fin != null) lo = Math.max(lo, fin)
  }
  // Upper bound: due if present, else cutoff (undated backfill).
  const hi = task.due != null ? Math.min(task.due, ctx.cutoff) : ctx.cutoff
  if (hi <= lo) return []

  const hoursSpans = taskHoursSpans(task, ctx, lo, hi)
  if (hoursSpans.length === 0) return []

  // Intersect live slots with [lo,hi] then with the task's hours spans.
  const out: FreeSlot[] = []
  for (const slot of state.slots) {
    const s = Math.max(slot.start, lo)
    const e = Math.min(slot.end, hi)
    if (e <= s) continue
    // Intersect [s,e] with hoursSpans.
    for (const h of hoursSpans) {
      const hs = Math.max(s, h.start)
      const he = Math.min(e, h.end)
      if (he > hs) out.push({ start: hs, end: he })
    }
  }
  out.sort((a, b) => a.start - b.start)
  return out
}

/** Capacity (minutes) available on a given local day across all live slots. */
function dayCapacityMinutes(state: PlacementState, dayStart: number): number {
  let cap = 0
  const dayEnd = dayStart + MS_PER_DAY
  for (const slot of state.slots) {
    const s = Math.max(slot.start, dayStart)
    const e = Math.min(slot.end, dayEnd)
    if (e > s) cap += (e - s) / MS_PER_MIN
  }
  return Math.max(cap, 1)
}

interface Pick {
  start: number
  end: number
}

/**
 * bestWindow: choose where to place `needMin` minutes among candidate slots.
 * Returns the chosen [start, start+needMin) or null if nothing fits.
 */
function bestWindow(
  needMin: number,
  candidates: FreeSlot[],
  mode: WorkloadMode,
  task: Task,
  state: PlacementState
): Pick | null {
  const needMs = needMin * MS_PER_MIN
  let best: Pick | null = null
  let bestScore = -Infinity

  for (const slot of candidates) {
    if (slot.end - slot.start < needMs) continue
    const placeStart = slot.start
    const placeEnd = placeStart + needMs

    // base
    let score: number
    const startOffsetMin = (placeStart - state_now(state, candidates)) / MS_PER_MIN
    if (mode === 'frontload') {
      score = -startOffsetMin // earliest start wins
    } else {
      score = -startOffsetMin * 0.001 // slight earliest bias to break ties
    }

    // loadPenalty (balanced): push toward less-loaded days.
    if (mode === 'balanced') {
      const dayStart = startOfDay(placeStart)
      const placed = state.placedPerDay.get(dayStart) ?? 0
      const cap = dayCapacityMinutes(state, dayStart)
      score -= K_LOAD * (placed / cap)
    }

    // latenessPenalty: dominant if this placement would end after due.
    if (task.due != null && placeEnd > task.due) {
      score -= LATENESS_PENALTY
    }

    if (score > bestScore) {
      bestScore = score
      best = { start: placeStart, end: placeEnd }
    }
  }
  return best
}

/** `now` reference for offset math — derived from context via a closure-free helper. */
function state_now(_state: PlacementState, candidates: FreeSlot[]): number {
  // Offsets are relative; using the earliest candidate start as origin keeps
  // scores well-scaled and is order-invariant for a given candidate set.
  return candidates.length ? candidates[0].start : 0
}

/** Consume [start, end) from the live slots (set difference), keeping them sorted. */
function consume(state: PlacementState, start: number, end: number): void {
  const cut: Span[] = [{ start, end }]
  const remaining = subtractSpans(
    state.slots.map((s) => ({ start: s.start, end: s.end })),
    cut
  )
  state.slots = remaining.sort((a, b) => a.start - b.start)
}

/** Record placement bookkeeping (block + day load + dep finish). */
function commit(state: PlacementState, task: Task, start: number, end: number, now: number): void {
  const block: ScheduledBlock = {
    // Deterministic, not random: a block is uniquely identified by its task
    // + time slot, and recompute() must be byte-identical across runs on
    // identical input (NFR-2). See core/id.ts#stableId.
    id: stableId(task.id, start, end),
    taskId: task.id,
    start,
    end,
    pinned: false,
    status: 'planned',
    createdAt: now,
    updatedAt: now,
    syncState: 'pending',
  }
  state.blocks.push(block)
  const dayStart = startOfDay(start)
  const mins = (end - start) / MS_PER_MIN
  state.placedPerDay.set(dayStart, (state.placedPerDay.get(dayStart) ?? 0) + mins)
  const prevFinish = state.taskFinish.get(task.id) ?? 0
  state.taskFinish.set(task.id, Math.max(prevFinish, end))
  consume(state, start, end)
}

/**
 * Place one task. Appends produced blocks + any unschedulable reason to state.
 * `allowBackfillOnly` marks undated tasks that must never displace dated work
 * (they simply take whatever is left — §9.5.11).
 */
export function placeTask(task: Task, ctx: PlacementContext, state: PlacementState): void {
  // FR-20 silent-drop fix #2: `ordering.ts#orderTasks` cannot place a task
  // whose dependency isn't itself resolvable this run, but it must not just
  // vanish either — it tags the (cloned) task with the reason it already
  // worked out (it has the full task list; this function only ever sees one
  // task) and still returns it so it reaches this loop. Record the reason and
  // stop — attempting a real placement here would ignore the very dependency
  // that made this task unplaceable in the first place. Dedup guard: the
  // recurring-occurrence expansion in `recompute.ts` can re-visit the same
  // taskId more than once per run (via a fresh synthetic occurrence object
  // that still carries this tag through object spread), and one reason per
  // task reads better than a repeat.
  const blockedReason = (task as MaybeDependencyBlocked)[DEPENDENCY_BLOCKED_REASON]
  if (blockedReason) {
    if (!state.unschedulable.some((u) => u.taskId === task.id)) {
      state.unschedulable.push({ taskId: task.id, kind: 'dependency_blocked', reason: blockedReason })
    }
    return
  }

  // Credit minutes already held by pinned prev blocks for this task so a
  // moved/postponed/locked block is not duplicated by a fresh placement.
  const pinnedMin = ctx.pinnedMinutesByTask?.get(task.id) ?? 0
  const remaining = remainingMinutes(task) - pinnedMin
  if (remaining <= 0) {
    // FR-20 silent-drop fix #1: nothing left to place. That's routine and
    // silent when it means "already handled" — completed progress
    // (durationMin - progressMin <= 0) or a pinned block already covering the
    // remaining work (pinnedMin >= remainingMinutes(task)) both legitimately
    // need no new block. It is NOT routine when the task itself never had a
    // duration (durationMin <= 0): that task can never produce a block no
    // matter how free the calendar is, and today it simply vanished with no
    // record. Only that specific case gets a reason.
    if (task.durationMin <= 0) {
      state.unschedulable.push({
        taskId: task.id,
        kind: 'zero_duration',
        reason: "This task has no estimated duration, so it can't be scheduled. Add a duration to place it.",
      })
    }
    return
  }

  const mode: WorkloadMode = isNearOrOverDue(task, ctx.now) ? 'frontload' : ctx.workload
  const bufBefore = task.bufferBeforeMin ?? 0
  const bufAfter = task.bufferAfterMin ?? 0

  if (!task.splittable) {
    const candidates = candidateSlots(task, ctx, state)
    const need = remaining + bufBefore + bufAfter
    const slot = bestWindow(need, candidates, mode, task, state)
    if (!slot) {
      state.unschedulable.push({ taskId: task.id, ...unschedReason(task, ctx) })
      return
    }
    // Place the work inside the buffered window (buffer time is reserved, not worked).
    const workStart = slot.start + bufBefore * MS_PER_MIN
    const workEnd = workStart + remaining * MS_PER_MIN
    commit(state, task, workStart, workEnd, ctx.now)
    // Also consume the buffer regions so nothing else fills them.
    if (bufBefore > 0) consume(state, slot.start, workStart)
    if (bufAfter > 0) consume(state, workEnd, workEnd + bufAfter * MS_PER_MIN)
    return
  }

  // Splittable: size sessions, then place each in turn, refreshing candidates.
  const initialCandidates = candidateSlots(task, ctx, state)
  const daysAvail = daysWithCapacity(
    initialCandidates.map((c) => ({ start: c.start, end: c.end }))
  )
  const sizes = sessionSizes(remaining, task, mode, daysAvail)

  let placedAny = false
  let leftover = 0
  for (const size of sizes) {
    const candidates = candidateSlots(task, ctx, state) // refresh after each placement
    const need = size + bufBefore + bufAfter
    const slot = bestWindow(need, candidates, mode, task, state)
    if (!slot) {
      leftover += size
      continue // try to place remaining sessions in other windows before giving up
    }
    const workStart = slot.start + bufBefore * MS_PER_MIN
    const workEnd = workStart + size * MS_PER_MIN
    commit(state, task, workStart, workEnd, ctx.now)
    if (bufBefore > 0) consume(state, slot.start, workStart)
    if (bufAfter > 0) consume(state, workEnd, workEnd + bufAfter * MS_PER_MIN)
    placedAny = true
  }

  if (leftover > 0) {
    if (placedAny) {
      state.unschedulable.push({
        taskId: task.id,
        kind: 'partially_placed',
        reason: `Only part of this task fit before its deadline (${leftover} min could not be placed).`,
      })
    } else {
      state.unschedulable.push({ taskId: task.id, ...unschedReason(task, ctx) })
    }
  }
}

/** Human-readable reason (+ machine-readable kind) for FR-20's "explain why" UI. */
function unschedReason(
  task: Task,
  ctx: PlacementContext
): { reason: string; kind: UnschedulableReasonKind } {
  if (task.due != null && task.due <= ctx.now) {
    return {
      kind: 'past_deadline',
      reason: 'This task is past its deadline. Extend the deadline or mark it done.',
    }
  }
  if (task.due != null) {
    return {
      kind: 'no_free_time',
      reason:
        'No free time before the deadline. Try relaxing scheduling hours, extending the deadline, or making it splittable.',
    }
  }
  return {
    kind: 'no_free_time_undated',
    reason: 'No free time available in your scheduling hours within the planning window.',
  }
}
