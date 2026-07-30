import { describe, expect, it } from 'vitest'
import { initState, placeTask, type PlacementContext } from '@/core/scheduler/placement'
import { buildFreeIntervals } from '@/core/scheduler/freeTime'
import { startOfDay } from '@/core/scheduler/time'
import { MS_PER_DAY, MS_PER_MIN } from '@/core/scheduler/types'
import { allDaySchedulingHours, makeList, makeTask, mondayAt } from './helpers/fixtures'

const now = mondayAt(8) // Monday 08:00
const cutoff = now + 7 * MS_PER_DAY

function baseCtx(overrides: Partial<PlacementContext> = {}): PlacementContext {
  return {
    now,
    cutoff,
    defaultSchedulingHours: allDaySchedulingHours({ start: 9 * 60, end: 21 * 60 }),
    workload: 'balanced',
    ...overrides,
  }
}

function freshState(ctx: PlacementContext) {
  const free = buildFreeIntervals({
    now: ctx.now,
    cutoff: ctx.cutoff,
    tasks: [],
    calEvents: [],
    prevBlocks: [],
    schedulingHours: ctx.defaultSchedulingHours,
    quietHours: { start: 0, end: 0 },
    energyPeak: { start: 0, end: 0 },
  })
  return initState(free)
}

describe('scheduler/placement: placeTask', () => {
  it('a task that fits is placed before its due date', () => {
    const ctx = baseCtx()
    const state = freshState(ctx)
    const due = now + 2 * MS_PER_DAY
    const task = makeTask({ id: 't1', durationMin: 60, due, splittable: false })
    placeTask(task, ctx, state)
    expect(state.blocks).toHaveLength(1)
    expect(state.unschedulable).toHaveLength(0)
    const b = state.blocks[0]
    expect(b.taskId).toBe('t1')
    expect(b.end).toBeLessThanOrEqual(due)
    expect(b.end - b.start).toBe(60 * MS_PER_MIN)
  })

  it('a task that cannot fit is reported as unschedulable, never silently dropped (FR-20)', () => {
    // Scheduling hours only 09:00-10:00 (60 min/day); task needs 500 min and
    // is due tomorrow, so it can never fit before due even across both days.
    const ctx = baseCtx({ defaultSchedulingHours: allDaySchedulingHours({ start: 9 * 60, end: 10 * 60 }) })
    const state = freshState(ctx)
    const due = now + 1 * MS_PER_DAY
    const task = makeTask({ id: 't2', durationMin: 500, due, splittable: false })
    placeTask(task, ctx, state)
    expect(state.blocks).toHaveLength(0)
    expect(state.unschedulable).toHaveLength(1)
    expect(state.unschedulable[0].taskId).toBe('t2')
    expect(state.unschedulable[0].reason).toBeTruthy()
  })

  it('an overdue task (due already passed) is unschedulable with a deadline-specific reason', () => {
    const ctx = baseCtx()
    const state = freshState(ctx)
    const task = makeTask({ id: 't3', durationMin: 30, due: now - MS_PER_DAY, splittable: false })
    placeTask(task, ctx, state)
    expect(state.blocks).toHaveLength(0)
    expect(state.unschedulable[0].reason).toMatch(/past its deadline/i)
  })

  it('a splittable task is broken into multiple sessions per sessionSizing', () => {
    const ctx = baseCtx()
    const state = freshState(ctx)
    const due = now + 5 * MS_PER_DAY
    const task = makeTask({
      id: 't4',
      durationMin: 300,
      due,
      splittable: true,
      minBlockMin: 30,
      maxBlockMin: 120,
    })
    placeTask(task, ctx, state)
    expect(state.blocks.length).toBeGreaterThan(1)
    const totalMin = state.blocks.reduce((sum, b) => sum + (b.end - b.start) / MS_PER_MIN, 0)
    expect(totalMin).toBe(300)
    for (const b of state.blocks) expect(b.end).toBeLessThanOrEqual(due)
  })

  it('a non-splittable task is placed as exactly one block', () => {
    const ctx = baseCtx()
    const state = freshState(ctx)
    const task = makeTask({ id: 't5', durationMin: 180, due: now + 3 * MS_PER_DAY, splittable: false })
    placeTask(task, ctx, state)
    expect(state.blocks).toHaveLength(1)
    expect(state.blocks[0].end - state.blocks[0].start).toBe(180 * MS_PER_MIN)
  })

  it('honors startAfter (never placed before the earliest-start instant)', () => {
    const ctx = baseCtx()
    const state = freshState(ctx)
    const startAfter = now + 1 * MS_PER_DAY
    const task = makeTask({ id: 't6', durationMin: 60, due: now + 5 * MS_PER_DAY, startAfter, splittable: false })
    placeTask(task, ctx, state)
    expect(state.blocks[0].start).toBeGreaterThanOrEqual(startAfter)
  })

  it('credits already-progressed minutes: remaining = duration - progress', () => {
    const ctx = baseCtx()
    const state = freshState(ctx)
    const task = makeTask({ id: 't7', durationMin: 120, progressMin: 90, due: now + 2 * MS_PER_DAY, splittable: false })
    placeTask(task, ctx, state)
    expect(state.blocks[0].end - state.blocks[0].start).toBe(30 * MS_PER_MIN)
  })

  it('credits pinned prev-block minutes so the same work is never double-scheduled', () => {
    const ctx = baseCtx({ pinnedMinutesByTask: new Map([['t8', 100]]) })
    const state = freshState(ctx)
    const task = makeTask({ id: 't8', durationMin: 120, due: now + 2 * MS_PER_DAY, splittable: false })
    placeTask(task, ctx, state)
    expect(state.blocks[0].end - state.blocks[0].start).toBe(20 * MS_PER_MIN)
  })

  it('fully-pinned-covered task (pinned minutes >= remaining) places nothing new', () => {
    const ctx = baseCtx({ pinnedMinutesByTask: new Map([['t9', 999]]) })
    const state = freshState(ctx)
    const task = makeTask({ id: 't9', durationMin: 60, due: now + 2 * MS_PER_DAY, splittable: false })
    placeTask(task, ctx, state)
    expect(state.blocks).toHaveLength(0)
    expect(state.unschedulable).toHaveLength(0)
  })

  it('reserves buffer-before/after time around the placed work without double counting it as work', () => {
    const ctx = baseCtx()
    const state = freshState(ctx)
    const task = makeTask({
      id: 't10',
      durationMin: 60,
      due: now + 2 * MS_PER_DAY,
      splittable: false,
      bufferBeforeMin: 15,
      bufferAfterMin: 10,
    })
    placeTask(task, ctx, state)
    const b = state.blocks[0]
    expect(b.end - b.start).toBe(60 * MS_PER_MIN) // work duration only, buffers are separate
  })

  it('resolves per-task scheduling-hours override before falling back to list, then app default (FR-13)', () => {
    const list = makeList({ id: 'biology', schedulingHours: allDaySchedulingHours({ start: 14 * 60, end: 15 * 60 }) })
    const ctx = baseCtx({
      defaultSchedulingHours: allDaySchedulingHours({ start: 9 * 60, end: 21 * 60 }),
      listMap: { biology: list },
    })
    const state = freshState(ctx)
    const task = makeTask({
      id: 't11',
      listId: 'biology',
      durationMin: 30,
      due: now + 1 * MS_PER_DAY,
      splittable: false,
    })
    placeTask(task, ctx, state)
    expect(state.blocks).toHaveLength(1)
    const startMin = (state.blocks[0].start - startOfDay(state.blocks[0].start)) / MS_PER_MIN
    expect(startMin).toBeGreaterThanOrEqual(14 * 60)
    expect(startMin).toBeLessThan(15 * 60)
  })

  it('a task near/over its deadline is forced to front-load regardless of the workload setting', () => {
    // Slack ratio < 0.2 forces frontload mode inside placeTask via
    // isNearOrOverDue. Use `now` sitting exactly at the scheduling-hours
    // start so minutesUntilDue isn't inflated by dead time before the window
    // opens (that would understate slack without any of it being placeable
    // time anyway, making the scenario unconstructible).
    const now2 = mondayAt(9)
    const ctx = baseCtx({ now: now2, cutoff: now2 + 7 * MS_PER_DAY, workload: 'balanced' })
    const state = freshState(ctx)
    const firstFreeStart = state.slots[0].start
    expect(firstFreeStart).toBe(now2)
    // remaining=60, want slackRatio = (minutesUntilDue-60)/minutesUntilDue < 0.2
    // => minutesUntilDue < 75. Pick due = now2+70min (task still fits: 70 >= 60).
    const due = now2 + 70 * MS_PER_MIN
    const task = makeTask({ id: 't12', durationMin: 60, due, splittable: false })
    placeTask(task, ctx, state)
    expect(state.blocks).toHaveLength(1)
    // Front-loaded: placed as early as possible (right at the start of the free window).
    expect(state.blocks[0].start).toBe(firstFreeStart)
    expect(state.blocks[0].end).toBeLessThanOrEqual(due)
  })
})
