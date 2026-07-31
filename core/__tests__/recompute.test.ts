import { describe, expect, it } from 'vitest'
import { recompute } from '@/core/scheduler/recompute'
import type { ScheduleInput } from '@/core/scheduler/types'
import { MS_PER_DAY, MS_PER_MIN } from '@/core/scheduler/types'
import { allDaySchedulingHours, makeBlock, makeCalEvent, makeSettings, makeTask, mondayAt } from './helpers/fixtures'

const now = mondayAt(9) // Monday 09:00, inside the default scheduling window

function baseInput(overrides: Partial<ScheduleInput> = {}): ScheduleInput {
  return {
    tasks: [],
    prevBlocks: [],
    calEvents: [],
    settings: makeSettings({ schedulingHours: allDaySchedulingHours({ start: 9 * 60, end: 21 * 60 }) }),
    now,
    ...overrides,
  }
}

describe('scheduler/recompute: basic placement', () => {
  it('places an eligible task and returns no unschedulable entries when it fits', () => {
    const task = makeTask({ id: 't1', durationMin: 60, due: now + 2 * MS_PER_DAY })
    const result = recompute(baseInput({ tasks: [task] }))
    expect(result.blocks).toHaveLength(1)
    expect(result.blocks[0].taskId).toBe('t1')
    expect(result.unschedulable).toHaveLength(0)
  })

  it('reports (never silently drops) a task that cannot fit before its deadline', () => {
    const tight = makeSettings({ schedulingHours: allDaySchedulingHours({ start: 9 * 60, end: 9 * 60 + 30 }) }) // 30 min/day
    const task = makeTask({ id: 't2', durationMin: 500, due: now + MS_PER_DAY, splittable: false })
    const result = recompute(baseInput({ tasks: [task], settings: tight }))
    expect(result.blocks.filter((b) => b.taskId === 't2')).toHaveLength(0)
    expect(result.unschedulable.some((u) => u.taskId === 't2')).toBe(true)
  })
})

describe('scheduler/recompute: stability (PRD 9.5.10)', () => {
  it('preserves a previous block verbatim (same id/createdAt) when the fresh run reproduces the same (task, time)', () => {
    const due = now + 3 * MS_PER_DAY
    const task = makeTask({ id: 't3', durationMin: 60, due })
    const first = recompute(baseInput({ tasks: [task] }))
    expect(first.blocks).toHaveLength(1)
    const firstBlock = first.blocks[0]

    // Re-run with the same inputs plus the previous result as prevBlocks.
    const second = recompute(baseInput({ tasks: [task], prevBlocks: first.blocks }))
    expect(second.blocks).toHaveLength(1)
    expect(second.blocks[0].id).toBe(firstBlock.id)
    expect(second.blocks[0].createdAt).toBe(firstBlock.createdAt)
    expect(second.blocks[0].start).toBe(firstBlock.start)
    expect(second.blocks[0].end).toBe(firstBlock.end)
  })

  it('a genuinely new/changed placement gets a fresh id (only unchanged blocks are preserved)', () => {
    const due = now + 3 * MS_PER_DAY
    const task = makeTask({ id: 't4', durationMin: 60, due })
    const first = recompute(baseInput({ tasks: [task] }))
    const firstBlock = first.blocks[0]

    // Change the task's duration so the placement necessarily differs.
    const changedTask = { ...task, durationMin: 90 }
    const second = recompute(baseInput({ tasks: [changedTask], prevBlocks: first.blocks }))
    expect(second.blocks).toHaveLength(1)
    expect(second.blocks[0].id).not.toBe(firstBlock.id)
    expect(second.blocks[0].end - second.blocks[0].start).toBe(90 * MS_PER_MIN)
  })

  it('pinned blocks never move across a recompute, even when their task changes', () => {
    const due = now + 3 * MS_PER_DAY
    const task = makeTask({ id: 't5', durationMin: 60, due })
    const first = recompute(baseInput({ tasks: [task] }))
    const pinned = { ...first.blocks[0], pinned: true }

    // Change duration + due drastically; the pinned block must stay exactly put.
    const changedTask = { ...task, durationMin: 300, due: now + 10 * MS_PER_DAY }
    const second = recompute(baseInput({ tasks: [changedTask], prevBlocks: [pinned] }))
    const stillPinned = second.blocks.find((b) => b.id === pinned.id)
    expect(stillPinned).toBeDefined()
    expect(stillPinned!.start).toBe(pinned.start)
    expect(stillPinned!.end).toBe(pinned.end)
    expect(stillPinned!.pinned).toBe(true)
  })

  it('pinned minutes are credited against the task so the remaining work is not duplicated', () => {
    const due = now + 3 * MS_PER_DAY
    const task = makeTask({ id: 't6', durationMin: 120, due })
    const first = recompute(baseInput({ tasks: [task] }))
    const pinned = { ...first.blocks[0], pinned: true } // covers 120 min (the whole task)

    const second = recompute(baseInput({ tasks: [task], prevBlocks: [pinned] }))
    // Only the pinned block should remain for this task — no second block for
    // the (already fully covered) remaining work.
    const blocksForTask = second.blocks.filter((b) => b.taskId === 't6')
    expect(blocksForTask).toHaveLength(1)
    expect(blocksForTask[0].id).toBe(pinned.id)
  })
})

describe('scheduler/recompute: missed auto-marking (PRD 9.5.7 / FR-16)', () => {
  it('flips an elapsed block of a still-open task to status "missed"', () => {
    // `now` is Monday 09:00; simulate a block that already ended in the past
    // (Sunday) for a task that is still open (todo).
    const task = makeTask({ id: 't7', durationMin: 60, status: 'todo', due: now + 5 * MS_PER_DAY })
    const pastBlock = makeBlock({
      taskId: 't7',
      start: now - 2 * MS_PER_DAY,
      end: now - 2 * MS_PER_DAY + 60 * MS_PER_MIN,
      status: 'planned',
    })
    const result = recompute(baseInput({ tasks: [task], prevBlocks: [pastBlock] }))
    const carried = result.blocks.find((b) => b.id === pastBlock.id)
    expect(carried).toBeDefined()
    expect(carried!.status).toBe('missed')
  })

  it('does NOT mark an elapsed block missed when its task is already done', () => {
    const task = makeTask({ id: 't8', durationMin: 60, status: 'done' })
    const pastBlock = makeBlock({
      taskId: 't8',
      start: now - 2 * MS_PER_DAY,
      end: now - 2 * MS_PER_DAY + 60 * MS_PER_MIN,
      status: 'planned',
    })
    const result = recompute(baseInput({ tasks: [task], prevBlocks: [pastBlock] }))
    const carried = result.blocks.find((b) => b.id === pastBlock.id)
    expect(carried?.status).not.toBe('missed')
  })

  it('does NOT mark an elapsed block missed when the task is actively being worked (status doing)', () => {
    const task = makeTask({ id: 't9', durationMin: 60, status: 'doing', due: now + 5 * MS_PER_DAY })
    const pastBlock = makeBlock({
      taskId: 't9',
      start: now - 2 * MS_PER_DAY,
      end: now - 2 * MS_PER_DAY + 60 * MS_PER_MIN,
      status: 'planned',
    })
    const result = recompute(baseInput({ tasks: [task], prevBlocks: [pastBlock] }))
    const carried = result.blocks.find((b) => b.id === pastBlock.id)
    expect(carried?.status).not.toBe('missed')
  })

  it('a block already marked done is left alone (never overwritten to missed)', () => {
    const task = makeTask({ id: 't10', durationMin: 60, status: 'todo', due: now + 5 * MS_PER_DAY })
    const pastBlock = makeBlock({
      taskId: 't10',
      start: now - 2 * MS_PER_DAY,
      end: now - 2 * MS_PER_DAY + 60 * MS_PER_MIN,
      status: 'done',
    })
    const result = recompute(baseInput({ tasks: [task], prevBlocks: [pastBlock] }))
    const carried = result.blocks.find((b) => b.id === pastBlock.id)
    expect(carried?.status).toBe('done')
  })
})

describe('scheduler/recompute: a fixed Event blocks placement end to end (FR-1, FR-28)', () => {
  // This exercises the exact path `store/scheduleStore.ts#recompute` drives:
  // a user-created local Event (`AddEventModal` -> `addLocalEvent`) is
  // concatenated into `calEvents` alongside any external synced events, and
  // handed to this same `recompute()` — not just `buildFreeIntervals` in
  // isolation (see `core/__tests__/freeTime.test.ts`), but the FULL engine
  // that actually places tasks, proving a local Event really does keep the
  // scheduler from booking a task over it.
  it('never places a task over a local busy CalEvent, even though there is otherwise room for it', () => {
    // A single 09:00-11:00 scheduling-hours window today (120 min of capacity).
    const settings = makeSettings({ schedulingHours: allDaySchedulingHours({ start: 9 * 60, end: 11 * 60 }) })
    // The Event occupies the middle of the window: 09:30-10:00.
    const event = makeCalEvent({
      id: 'evt-local-1',
      source: 'local',
      busy: true,
      start: now + 30 * MS_PER_MIN,
      end: now + 60 * MS_PER_MIN,
    })
    const task = makeTask({ id: 'blocked-by-event', durationMin: 30, due: now + MS_PER_DAY })
    const result = recompute(baseInput({ tasks: [task], calEvents: [event], settings }))

    const block = result.blocks.find((b) => b.taskId === 'blocked-by-event')
    expect(block).toBeDefined()
    // The task must land SOMEWHERE, but never overlapping the event's span —
    // proving the busy time was actually subtracted before placement, not
    // just reported alongside a task that got booked over it anyway.
    const overlapsEvent = block!.start < event.end && block!.end > event.start
    expect(overlapsEvent).toBe(false)
  })

  it('reports the task unschedulable (never silently drops it) when a local Event consumes the ENTIRE window', () => {
    const settings = makeSettings({ schedulingHours: allDaySchedulingHours({ start: 9 * 60, end: 9 * 60 + 30 }) }) // 30 min/day only
    const event = makeCalEvent({
      id: 'evt-local-2',
      source: 'local',
      busy: true,
      start: now,
      end: now + 30 * MS_PER_MIN,
    })
    const task = makeTask({ id: 'fully-blocked', durationMin: 30, due: now + MS_PER_DAY, splittable: false })
    const result = recompute(baseInput({ tasks: [task], calEvents: [event], settings }))
    expect(result.blocks.filter((b) => b.taskId === 'fully-blocked')).toHaveLength(0)
    expect(result.unschedulable.some((u) => u.taskId === 'fully-blocked')).toBe(true)
  })
})

describe('scheduler/recompute: undated backfill never displaces dated work (9.5.8)', () => {
  it('an undated auto-scheduled task only takes leftover free time, after dated tasks are placed', () => {
    // Scheduling hours 09:00-11:00 (120 min/day). A dated task needs all of
    // it today; the undated task should NOT be able to bump it out.
    const settings = makeSettings({ schedulingHours: allDaySchedulingHours({ start: 9 * 60, end: 11 * 60 }) })
    const dated = makeTask({ id: 'dated', durationMin: 120, due: now + MS_PER_DAY, priority: 1 })
    const undated = makeTask({ id: 'undated', durationMin: 60, due: undefined, priority: 4 })
    const result = recompute(baseInput({ tasks: [dated, undated], settings }))
    const datedBlock = result.blocks.find((b) => b.taskId === 'dated')
    expect(datedBlock).toBeDefined()
    expect(datedBlock!.end - datedBlock!.start).toBe(120 * MS_PER_MIN)
    // Undated task gets nothing today (no room left) — must be reported
    // unschedulable rather than silently dropped, or placed later once room
    // opens up, but never by displacing `dated`.
    const undatedBlocksOverlapDated = result.blocks
      .filter((b) => b.taskId === 'undated')
      .some((u) => u.start < datedBlock!.end && u.end > datedBlock!.start)
    expect(undatedBlocksOverlapDated).toBe(false)
  })
})
