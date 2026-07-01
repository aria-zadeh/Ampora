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
 * bestWindow score = base - loadPenalty - energyMismatchPenalty - latenessPenalty
 *   frontload: base = -startTimeOffset  (earliest start wins)
 *   balanced : loadPenalty = k1 * (minsPlacedThatDay / dayCapacity), k1 = 1.0
 *   energyMismatchPenalty = k2 * mismatch(energyRequired, energyScore), k2 = 0.3
 *   latenessPenalty: large if placing risks missing due (forces front-load)
 *
 * Pure; mutates only its own working copies.
 */

import type { EnergyLevel, ScheduledBlock, SchedulingHours, Task } from '@/types'
import { newId } from '@/core/id'
import {
  MS_PER_DAY,
  MS_PER_MIN,
  type FreeInterval,
  type Span,
  type Unschedulable,
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
const K_ENERGY = 0.3
const LATENESS_PENALTY = 1e6 // dominant: never let energy/balance cause a miss

/** Working free interval with mutable end for in-place consumption. */
interface FreeSlot {
  start: number
  end: number
  energyScore: number
}

/** Numeric energy level for mismatch math. */
function energyNum(level: EnergyLevel | undefined): number {
  switch (level) {
    case 'low':
      return 0.25
    case 'high':
      return 0.9
    case 'normal':
    default:
      return 0.5
  }
}

/** Mismatch in 0..1 between required energy and a window's energy score. */
function energyMismatch(required: EnergyLevel | undefined, windowScore: number): number {
  if (required == null) return 0
  return Math.abs(energyNum(required) - windowScore)
}

export interface PlacementContext {
  now: number
  cutoff: number
  defaultSchedulingHours: SchedulingHours
  workload: WorkloadMode
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
    slots: free.map((f) => ({ start: f.start, end: f.end, energyScore: f.energyScore })),
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
  const hours = task.schedulingHours ?? ctx.defaultSchedulingHours
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
      if (he > hs) out.push({ start: hs, end: he, energyScore: slot.energyScore })
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
  energyScore: number
}

/**
 * bestWindow: choose where to place `needMin` minutes among candidate slots.
 * Returns the chosen [start, start+needMin) or null if nothing fits.
 */
function bestWindow(
  needMin: number,
  candidates: FreeSlot[],
  mode: WorkloadMode,
  energyRequired: EnergyLevel | undefined,
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

    // energyMismatchPenalty (soft).
    score -= K_ENERGY * energyMismatch(energyRequired, slot.energyScore)

    // latenessPenalty: dominant if this placement would end after due.
    if (task.due != null && placeEnd > task.due) {
      score -= LATENESS_PENALTY
    }

    if (score > bestScore) {
      bestScore = score
      best = { start: placeStart, end: placeEnd, energyScore: slot.energyScore }
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
  // Rebuild slots preserving energyScore by matching against originals.
  const rebuilt: FreeSlot[] = []
  for (const r of remaining) {
    const src = state.slots.find((s) => s.start <= r.start && s.end >= r.end)
    rebuilt.push({ start: r.start, end: r.end, energyScore: src ? src.energyScore : 0.5 })
  }
  state.slots = rebuilt.sort((a, b) => a.start - b.start)
}

/** Record placement bookkeeping (block + day load + dep finish). */
function commit(state: PlacementState, task: Task, start: number, end: number, now: number): void {
  const block: ScheduledBlock = {
    id: newId(),
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
  const remaining = remainingMinutes(task)
  if (remaining <= 0) return

  const mode: WorkloadMode = isNearOrOverDue(task, ctx.now) ? 'frontload' : ctx.workload
  const bufBefore = task.bufferBeforeMin ?? 0
  const bufAfter = task.bufferAfterMin ?? 0

  if (!task.splittable) {
    const candidates = candidateSlots(task, ctx, state)
    const need = remaining + bufBefore + bufAfter
    const slot = bestWindow(need, candidates, mode, task.energyRequired, task, state)
    if (!slot) {
      state.unschedulable.push({ taskId: task.id, reason: unschedReason(task, ctx) })
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
    const slot = bestWindow(need, candidates, mode, task.energyRequired, task, state)
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
    state.unschedulable.push({
      taskId: task.id,
      reason: placedAny
        ? `Only part of this task fit before its deadline (${leftover} min could not be placed).`
        : unschedReason(task, ctx),
    })
  }
}

/** Human-readable reason for FR-20's "explain why" UI. */
function unschedReason(task: Task, ctx: PlacementContext): string {
  if (task.due != null && task.due <= ctx.now) {
    return 'This task is past its deadline. Extend the deadline or mark it done.'
  }
  if (task.due != null) {
    return 'No free time before the deadline. Try relaxing scheduling hours, extending the deadline, or making it splittable.'
  }
  return 'No free time available in your scheduling hours within the planning window.'
}
