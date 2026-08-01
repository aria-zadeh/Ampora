/**
 * FR-20's fifth one-tap remedy: "remove a blocking all-day event."
 *
 * `UnschedulableFixSheet` already wires four remedies (relax scheduling
 * hours, extend deadline, make splittable, mark done) straight from the
 * engine's `Unschedulable.kind` (`core/scheduler/types.ts`). That enum has no
 * dedicated "blocked by an event" kind — a blocking CalEvent is just folded
 * into ordinary free-time subtraction (PRD §9.5.1), so it surfaces as a plain
 * `no_free_time` / `no_free_time_undated` / `partially_placed` reason like any
 * other capacity shortfall. This module is what tells THOSE three kinds apart
 * from "an all-day event is sitting in the task's window": it cross-references
 * the task's rough placement window against the store's CalEvents.
 *
 * Deliberately pure (no react-native, no store import) so it: (a) is
 * unit-testable under `core/__tests__` (vitest's `node` environment, see
 * `vitest.config.ts`, which only ever runs test files under `core/**`), and
 * (b) stays a plain, obviously-correct function the component just calls.
 *
 * NOT a scheduler re-implementation. `taskPlacementWindow` approximates
 * `core/scheduler/placement.ts#candidateSlots`'s [lo, hi) bounds using only
 * what a task carries on its own (`startAfter`, `due`) — it does not resolve
 * dependency-finish times or intersect real scheduling-hours/other busy time,
 * both of which need the full engine run this sheet does not have access to.
 * That is an intentional, honest approximation: exactly like the sheet's other
 * fixes (e.g. "Extend deadline by a week" does not itself guarantee the task
 * becomes schedulable either), this only removes ONE named obstacle and lets
 * the immediate recompute() that follows judge the real result.
 */

import type { CalEvent, Task } from '@/types'
import { DEFAULT_CUTOFF_DAYS } from '@/core/scheduler'

const MS_PER_DAY = 86_400_000

/** The task's own rough placement window — see the file header's honesty note. */
export interface TaskPlacementWindow {
  /** Epoch ms, inclusive lower bound. */
  lo: number
  /** Epoch ms, exclusive upper bound. */
  hi: number
}

export function taskPlacementWindow(task: Task, now: number): TaskPlacementWindow {
  const lo = task.startAfter != null ? Math.max(now, task.startAfter) : now
  const hi = task.due ?? now + DEFAULT_CUTOFF_DAYS * MS_PER_DAY
  return { lo, hi }
}

/**
 * Find the all-day, busy CalEvent most responsible for occupying `task`'s
 * placement window: the one with the largest overlap (ties broken by earliest
 * start, then by id, so the result is deterministic). Returns undefined when
 * no all-day event overlaps at all.
 *
 * Scoped to `allDay` events on purpose — FR-20 names this remedy "remove a
 * blocking ALL-DAY event" specifically. A timed event's partial-day nibble is
 * already addressable via the sheet's existing "relax scheduling hours" /
 * "extend deadline" / "split into sessions" fixes.
 */
export function findBlockingAllDayEvent(
  task: Task,
  events: readonly CalEvent[],
  now: number
): CalEvent | undefined {
  const { lo, hi } = taskPlacementWindow(task, now)
  if (hi <= lo) return undefined

  let best: CalEvent | undefined
  let bestOverlapMs = 0

  for (const event of events) {
    if (!event.allDay || !event.busy) continue
    const overlapMs = Math.min(event.end, hi) - Math.max(event.start, lo)
    if (overlapMs <= 0) continue

    if (
      best == null ||
      overlapMs > bestOverlapMs ||
      (overlapMs === bestOverlapMs &&
        (event.start < best.start || (event.start === best.start && event.id < best.id)))
    ) {
      best = event
      bestOverlapMs = overlapMs
    }
  }

  return best
}

/** The resolved fix for one blocking all-day event. */
export interface BlockingEventFix {
  event: CalEvent
  /** Only `source: 'local'` events are ours to edit (FR-22; `services/calendarSync.ts` never writes back). */
  editable: boolean
  /**
   * When set, applying this patch to the event (via `scheduleStore.updateLocalEvent`)
   * clears its ENTIRE overlap with the task's placement window by trimming a
   * single edge — the "less damaging option" than deleting outright, since the
   * rest of a multi-day event survives. Undefined when no single-edge trim can
   * fully clear the window: either the event covers the window on both sides
   * (trimming one edge would still leave the other side blocked) or the event
   * sits entirely inside the window (trimming it down to clear would mean
   * trimming it to nothing, which is just deleting it under a different name).
   * In both of those cases, only deleting the event makes sense.
   */
  shortenPatch?: { start?: number; end?: number }
}

/**
 * Decide how (or whether) trimming ONE edge of `event` fully frees `task`'s
 * placement window, and whether the event is even ours to edit. Assumes
 * `event` already overlaps the window (i.e. came from
 * {@link findBlockingAllDayEvent}); called out separately so each half is
 * independently testable.
 */
export function resolveBlockingEventFix(task: Task, event: CalEvent, now: number): BlockingEventFix {
  const { lo, hi } = taskPlacementWindow(task, now)
  const editable = event.source === 'local'

  const startsBeforeWindow = event.start < lo
  const endsAfterWindow = event.end > hi

  let shortenPatch: { start?: number; end?: number } | undefined
  if (startsBeforeWindow && !endsAfterWindow) {
    // Event's tail is what overlaps [lo, hi) — trim its end back to lo. The
    // head [event.start, lo) is untouched, so the rest of the event survives.
    shortenPatch = { end: lo }
  } else if (!startsBeforeWindow && endsAfterWindow) {
    // Event's head is what overlaps [lo, hi) — trim its start up to hi. The
    // tail [hi, event.end) survives.
    shortenPatch = { start: hi }
  }
  // else: the event covers the window on both sides, or sits entirely inside
  // it — no single-edge trim clears the whole overlap, so shortenPatch stays
  // undefined and only Delete is offered.

  return { event, editable, shortenPatch }
}

/** Convenience: find the blocking all-day event (if any) and resolve its fix in one call. */
export function getBlockingEventFix(
  task: Task,
  events: readonly CalEvent[],
  now: number
): BlockingEventFix | undefined {
  const event = findBlockingAllDayEvent(task, events, now)
  if (!event) return undefined
  return resolveBlockingEventFix(task, event, now)
}
