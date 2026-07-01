/**
 * Pure, portable subtask/task rollup logic.
 *
 * Single source of truth for behavior: `07_AI_Breakdown_Memory_and_Subtasks.md`
 * Part 3. This module implements ONLY the rollup/derivation semantics
 * (duration rollup, progress mapping, current-step surfacing, completion
 * rollup). It does NOT implement the scheduling engine or Ignition/locking
 * logic (Milestone 2+).
 *
 * Portability contract (PRD §9.16, FR-75): no react-native / expo / MMKV
 * imports. No direct `Date.now()` calls — every function that needs "now"
 * takes it as a parameter so this module produces identical results on
 * device and in a server-side Edge Function. All functions are pure and
 * immutable: inputs are never mutated, new objects are returned.
 */

import type { StarterAction, Subtask, Task } from '@/types'

// ---------------------------------------------------------------------------
// Subtask-level helpers
// ---------------------------------------------------------------------------

/** A subtask is done iff it has a completion timestamp (doc 07 Part 3: `done` is always derived, never stored). */
export function isSubtaskDone(s: Subtask): boolean {
  return s.completedAt != null
}

/** Sum of `estimatedMin` across all subtasks (doc 07 Part 3.2/3.12). */
export function sumEstimatedMin(subtasks: Subtask[]): number {
  return subtasks.reduce((total, s) => total + s.estimatedMin, 0)
}

// ---------------------------------------------------------------------------
// Task-level rollups (doc 07 Part 3.2, 3.3)
// ---------------------------------------------------------------------------

/**
 * The task's effective duration. Subtasks override a manual duration when
 * present (doc 07 Part 3.2: "A manually set duration is overridden when
 * subtasks exist"). With no subtasks, the manually-entered `durationMin` is
 * authoritative.
 */
export function computeDurationMin(task: Task): number {
  if (task.subtasks.length > 0) return sumEstimatedMin(task.subtasks)
  return task.durationMin
}

/**
 * Progress in minutes: sum of completed subtasks' `estimatedMin` (doc 07
 * Part 3.3). Zero when there are no subtasks — progress at that granularity
 * is out of scope per Part 3.11 ("Zero subtasks: the task schedules by its
 * own duration with the First move as the only starter").
 */
export function computeProgressMin(task: Task): number {
  return task.subtasks.filter(isSubtaskDone).reduce((total, s) => total + s.estimatedMin, 0)
}

/**
 * Returns a new Task with `durationMin` and `progressMin` recomputed from
 * the current `subtasks`. Call this after any subtask mutation so the
 * rollups never drift (doc 07 Part 3.2/3.3/3.8).
 */
export function withSyncedRollups(task: Task): Task {
  return {
    ...task,
    durationMin: computeDurationMin(task),
    progressMin: computeProgressMin(task),
  }
}

// ---------------------------------------------------------------------------
// Current-step surfacing (doc 07 Part 3.4)
// ---------------------------------------------------------------------------

export type NextStep =
  | { kind: 'first_move'; action: StarterAction }
  | { kind: 'subtask'; subtask: Subtask }
  | { kind: 'none' }

/**
 * The single "current step" a task exposes at any moment (doc 07 Part 3.4):
 * the First move if it exists and isn't done yet, else the first
 * uncompleted subtask (in array order), else none.
 */
export function nextStep(task: Task): NextStep {
  if (task.firstMove && !task.firstMove.done) {
    return { kind: 'first_move', action: task.firstMove }
  }
  const nextSubtask = task.subtasks.find((s) => !isSubtaskDone(s))
  if (nextSubtask) return { kind: 'subtask', subtask: nextSubtask }
  return { kind: 'none' }
}

// ---------------------------------------------------------------------------
// Completion (doc 07 Part 3.5)
// ---------------------------------------------------------------------------

/**
 * True when the task is complete: all subtasks done (when subtasks exist),
 * or `status === 'done'` (covers the zero-subtask case, doc 07 Part 3.11).
 */
export function isTaskComplete(task: Task): boolean {
  if (task.subtasks.length > 0) return task.subtasks.every(isSubtaskDone)
  return task.status === 'done'
}

/**
 * Completes a task: sets `completedAt`/`status`, and marks every subtask
 * completed (if not already) so subtask and task completion state never
 * diverge (doc 07 Part 3.5: "Marking the task complete directly marks all
 * remaining subtasks complete").
 */
export function completeTask(task: Task, now: number): Task {
  const subtasks = task.subtasks.map((s) => (isSubtaskDone(s) ? s : { ...s, completedAt: now }))
  const completed: Task = {
    ...task,
    subtasks,
    status: 'done',
    completedAt: now,
    updatedAt: now,
  }
  return withSyncedRollups(completed)
}

/**
 * Reopens a completed task: clears `completedAt` and resets status to
 * 'todo'. Subtasks are left as-is (reopening the parent does not
 * un-complete individual steps).
 */
export function reopenTask(task: Task, now: number): Task {
  const { completedAt: _completedAt, ...rest } = task
  return {
    ...rest,
    status: 'todo',
    updatedAt: now,
  }
}

// ---------------------------------------------------------------------------
// Subtask mutations (doc 07 Part 3.8) — each returns a new Task with rollups
// synced and `updatedAt` bumped.
// ---------------------------------------------------------------------------

/** Appends a subtask and re-syncs rollups. */
export function addSubtask(task: Task, subtask: Subtask, now: number): Task {
  const updated: Task = {
    ...task,
    subtasks: [...task.subtasks, subtask],
    updatedAt: now,
  }
  return withSyncedRollups(updated)
}

/** Removes a subtask by id and re-syncs rollups. */
export function removeSubtask(task: Task, subtaskId: string, now: number): Task {
  const updated: Task = {
    ...task,
    subtasks: task.subtasks.filter((s) => s.id !== subtaskId),
    updatedAt: now,
  }
  return withSyncedRollups(updated)
}

/**
 * Moves the subtask at `fromIndex` to `toIndex` (array-position order is the
 * execution order, doc 07 Part 3.1/3.12). Out-of-range indices are a no-op
 * (aside from bumping `updatedAt`) to keep this safe to call defensively.
 */
export function reorderSubtasks(task: Task, fromIndex: number, toIndex: number, now: number): Task {
  const { subtasks } = task
  if (
    fromIndex < 0 ||
    fromIndex >= subtasks.length ||
    toIndex < 0 ||
    toIndex >= subtasks.length ||
    fromIndex === toIndex
  ) {
    return { ...task, updatedAt: now }
  }
  const next = [...subtasks]
  const [moved] = next.splice(fromIndex, 1)
  next.splice(toIndex, 0, moved)
  return withSyncedRollups({ ...task, subtasks: next, updatedAt: now })
}

/**
 * Sets a subtask's completed state. Completing the LAST remaining subtask
 * also completes the parent task (doc 07 Part 3.5). Un-completing a subtask
 * never un-completes the parent implicitly (only `reopenTask` does that) —
 * un-completing here just clears that subtask's `completedAt`.
 */
export function setSubtaskCompleted(task: Task, subtaskId: string, completed: boolean, now: number): Task {
  const subtasks = task.subtasks.map((s) => {
    if (s.id !== subtaskId) return s
    return { ...s, completedAt: completed ? (s.completedAt ?? now) : undefined }
  })
  const withUpdatedSubtasks: Task = { ...task, subtasks, updatedAt: now }

  if (completed && subtasks.length > 0 && subtasks.every(isSubtaskDone)) {
    return completeTask(withUpdatedSubtasks, now)
  }

  return withSyncedRollups(withUpdatedSubtasks)
}
