import { describe, expect, it } from 'vitest'
import {
  addSubtask,
  completeTask,
  computeDurationMin,
  computeProgressMin,
  isSubtaskDone,
  isTaskComplete,
  nextStep,
  reopenTask,
  removeSubtask,
  reorderSubtasks,
  setSubtaskCompleted,
  sumEstimatedMin,
  withSyncedRollups,
} from '@/core/task-logic'
import { makeTask } from './helpers/fixtures'
import type { Subtask } from '@/types'

const now = 1_700_000_000_000

function sub(overrides: Partial<Subtask> = {}): Subtask {
  return { id: overrides.id ?? `s-${Math.random()}`, title: 'step', estimatedMin: 10, ...overrides }
}

describe('task-logic: subtask helpers', () => {
  it('isSubtaskDone reflects completedAt presence, not a separate flag', () => {
    expect(isSubtaskDone(sub({ completedAt: undefined }))).toBe(false)
    expect(isSubtaskDone(sub({ completedAt: now }))).toBe(true)
  })

  it('sumEstimatedMin sums estimatedMin across subtasks', () => {
    expect(sumEstimatedMin([sub({ estimatedMin: 5 }), sub({ estimatedMin: 15 })])).toBe(20)
    expect(sumEstimatedMin([])).toBe(0)
  })
})

describe('task-logic: duration rollup (doc 07 Part 3.2)', () => {
  it('with subtasks, durationMin is the sum of subtask estimates, overriding any manual value', () => {
    const task = makeTask({
      durationMin: 999, // manual value should be ignored once subtasks exist
      subtasks: [sub({ estimatedMin: 20 }), sub({ estimatedMin: 30 })],
    })
    expect(computeDurationMin(task)).toBe(50)
  })

  it('with zero subtasks, the manually-entered durationMin is authoritative', () => {
    const task = makeTask({ durationMin: 45, subtasks: [] })
    expect(computeDurationMin(task)).toBe(45)
  })

  it('withSyncedRollups recomputes durationMin AND progressMin from current subtasks', () => {
    const task = makeTask({
      durationMin: 0,
      progressMin: 0,
      subtasks: [sub({ estimatedMin: 20, completedAt: now }), sub({ estimatedMin: 30 })],
    })
    const synced = withSyncedRollups(task)
    expect(synced.durationMin).toBe(50)
    expect(synced.progressMin).toBe(20)
  })
})

describe('task-logic: progress mapping (doc 07 Part 3.3)', () => {
  it('progressMin is the sum of estimatedMin across COMPLETED subtasks only', () => {
    const task = makeTask({
      subtasks: [
        sub({ estimatedMin: 10, completedAt: now }),
        sub({ estimatedMin: 20, completedAt: undefined }),
        sub({ estimatedMin: 5, completedAt: now }),
      ],
    })
    expect(computeProgressMin(task)).toBe(15)
  })

  it('is 0 when there are no subtasks (progress at that granularity is out of scope, Part 3.11)', () => {
    expect(computeProgressMin(makeTask({ subtasks: [] }))).toBe(0)
  })
})

describe('task-logic: next-step surfacing (doc 07 Part 3.4)', () => {
  it('surfaces the First move when present and not done', () => {
    const task = makeTask({
      firstMove: { id: 'fm', text: 'Open the doc', done: false },
      subtasks: [sub({ id: 's1' })],
    })
    const step = nextStep(task)
    expect(step.kind).toBe('first_move')
    if (step.kind === 'first_move') expect(step.action.text).toBe('Open the doc')
  })

  it('falls through to the first uncompleted subtask once the First move is done', () => {
    const task = makeTask({
      firstMove: { id: 'fm', text: 'Open the doc', done: true },
      subtasks: [sub({ id: 's1', completedAt: now }), sub({ id: 's2' })],
    })
    const step = nextStep(task)
    expect(step.kind).toBe('subtask')
    if (step.kind === 'subtask') expect(step.subtask.id).toBe('s2')
  })

  it('falls through to the first uncompleted subtask when there is no First move at all', () => {
    const task = makeTask({ firstMove: undefined, subtasks: [sub({ id: 's1', completedAt: now }), sub({ id: 's2' })] })
    const step = nextStep(task)
    expect(step.kind).toBe('subtask')
    if (step.kind === 'subtask') expect(step.subtask.id).toBe('s2')
  })

  it('returns "none" when the First move is done and all subtasks are done (or there are none)', () => {
    const task = makeTask({ firstMove: { id: 'fm', text: 'x', done: true }, subtasks: [] })
    expect(nextStep(task).kind).toBe('none')
  })
})

describe('task-logic: completion (doc 07 Part 3.5)', () => {
  it('isTaskComplete: with subtasks, complete iff every subtask is done', () => {
    const incomplete = makeTask({ subtasks: [sub({ completedAt: now }), sub({ completedAt: undefined })] })
    const complete = makeTask({ subtasks: [sub({ completedAt: now }), sub({ completedAt: now })] })
    expect(isTaskComplete(incomplete)).toBe(false)
    expect(isTaskComplete(complete)).toBe(true)
  })

  it('isTaskComplete: with zero subtasks, falls back to status === "done"', () => {
    expect(isTaskComplete(makeTask({ subtasks: [], status: 'todo' }))).toBe(false)
    expect(isTaskComplete(makeTask({ subtasks: [], status: 'done' }))).toBe(true)
  })

  it('completeTask marks the task done AND marks every remaining subtask complete', () => {
    const task = makeTask({ subtasks: [sub({ id: 's1', completedAt: now - 10 }), sub({ id: 's2', completedAt: undefined })] })
    const completed = completeTask(task, now)
    expect(completed.status).toBe('done')
    expect(completed.completedAt).toBe(now)
    expect(completed.subtasks.every(isSubtaskDone)).toBe(true)
    // Already-completed subtask keeps its original completedAt (not overwritten).
    expect(completed.subtasks.find((s) => s.id === 's1')!.completedAt).toBe(now - 10)
    expect(completed.subtasks.find((s) => s.id === 's2')!.completedAt).toBe(now)
  })

  it('completeTask keeps durationMin/progressMin rollups in sync', () => {
    const task = makeTask({ subtasks: [sub({ id: 's1', estimatedMin: 15 }), sub({ id: 's2', estimatedMin: 25 })] })
    const completed = completeTask(task, now)
    expect(completed.durationMin).toBe(40)
    expect(completed.progressMin).toBe(40)
  })

  it('reopenTask clears completedAt and resets status to todo, leaving subtasks untouched', () => {
    const task = makeTask({
      status: 'done',
      completedAt: now,
      subtasks: [sub({ id: 's1', completedAt: now }), sub({ id: 's2', completedAt: now })],
    })
    const reopened = reopenTask(task, now + 1)
    expect(reopened.status).toBe('todo')
    expect(reopened.completedAt).toBeUndefined()
    expect(reopened.subtasks.every(isSubtaskDone)).toBe(true) // NOT un-completed
  })
})

describe('task-logic: subtask mutations (doc 07 Part 3.8)', () => {
  it('addSubtask appends and re-syncs rollups', () => {
    const task = makeTask({ subtasks: [sub({ id: 's1', estimatedMin: 10 })] })
    const updated = addSubtask(task, sub({ id: 's2', estimatedMin: 20 }), now)
    expect(updated.subtasks.map((s) => s.id)).toEqual(['s1', 's2'])
    expect(updated.durationMin).toBe(30)
    expect(updated.updatedAt).toBe(now)
  })

  it('removeSubtask removes by id and re-syncs rollups', () => {
    const task = makeTask({ subtasks: [sub({ id: 's1', estimatedMin: 10 }), sub({ id: 's2', estimatedMin: 20 })] })
    const updated = removeSubtask(task, 's1', now)
    expect(updated.subtasks.map((s) => s.id)).toEqual(['s2'])
    expect(updated.durationMin).toBe(20)
  })

  it('reorderSubtasks moves by array position (execution order)', () => {
    const task = makeTask({ subtasks: [sub({ id: 'a' }), sub({ id: 'b' }), sub({ id: 'c' })] })
    const updated = reorderSubtasks(task, 0, 2, now)
    expect(updated.subtasks.map((s) => s.id)).toEqual(['b', 'c', 'a'])
  })

  it('reorderSubtasks with an out-of-range index is a no-op aside from updatedAt', () => {
    const task = makeTask({ subtasks: [sub({ id: 'a' }), sub({ id: 'b' })] })
    const updated = reorderSubtasks(task, 0, 5, now)
    expect(updated.subtasks.map((s) => s.id)).toEqual(['a', 'b'])
    expect(updated.updatedAt).toBe(now)
  })

  it('setSubtaskCompleted(true) on the LAST remaining subtask completes the parent task too', () => {
    const task = makeTask({
      status: 'todo',
      subtasks: [sub({ id: 'a', completedAt: now - 1 }), sub({ id: 'b', completedAt: undefined })],
    })
    const updated = setSubtaskCompleted(task, 'b', true, now)
    expect(updated.subtasks.every(isSubtaskDone)).toBe(true)
    expect(updated.status).toBe('done')
    expect(updated.completedAt).toBe(now)
  })

  it('setSubtaskCompleted(true) with other subtasks still open does NOT complete the parent', () => {
    const task = makeTask({
      status: 'todo',
      subtasks: [sub({ id: 'a', completedAt: undefined }), sub({ id: 'b', completedAt: undefined })],
    })
    const updated = setSubtaskCompleted(task, 'a', true, now)
    expect(updated.status).toBe('todo')
    expect(updated.subtasks.find((s) => s.id === 'a')!.completedAt).toBe(now)
  })

  it('setSubtaskCompleted(false) un-completes a subtask without ever un-completing the parent implicitly', () => {
    const task = makeTask({
      status: 'done',
      completedAt: now - 1,
      subtasks: [sub({ id: 'a', completedAt: now - 1 }), sub({ id: 'b', completedAt: now - 1 })],
    })
    const updated = setSubtaskCompleted(task, 'a', false, now)
    expect(updated.subtasks.find((s) => s.id === 'a')!.completedAt).toBeUndefined()
    // Only reopenTask un-completes the parent; setSubtaskCompleted never does.
    expect(updated.status).toBe('done')
  })
})
