import { describe, expect, it } from 'vitest'
import {
  buildRecoveryPreview,
  countMissedBlocks,
  countMissedDays,
  detectLapse,
  isMissedBlock,
  RECOVERY_CONSTANTS,
} from '@/core/recovery'
import { makeBlock, makeTask, mondayAt } from './helpers/fixtures'
import { MS_PER_DAY, MS_PER_MIN } from '@/core/scheduler/types'

const now = mondayAt(9)

describe('recovery: isMissedBlock', () => {
  it('a block that ended in the past and is neither done nor in_progress is missed', () => {
    expect(isMissedBlock(makeBlock({ end: now - 1, status: 'planned' }), now)).toBe(true)
  })

  it('a block that has not yet ended is never missed', () => {
    expect(isMissedBlock(makeBlock({ end: now + 1, status: 'planned' }), now)).toBe(false)
  })

  it('a past block that is done or in_progress is not missed', () => {
    expect(isMissedBlock(makeBlock({ end: now - 1, status: 'done' }), now)).toBe(false)
    expect(isMissedBlock(makeBlock({ end: now - 1, status: 'in_progress' }), now)).toBe(false)
  })
})

describe('recovery: lapse detection (FR-60)', () => {
  it('countMissedDays counts distinct local days with at least one missed block', () => {
    const blocks = [
      makeBlock({ id: 'b1', start: now - 3 * MS_PER_DAY, end: now - 3 * MS_PER_DAY + 30 * MS_PER_MIN }),
      makeBlock({ id: 'b2', start: now - 3 * MS_PER_DAY + 2 * 3600_000, end: now - 3 * MS_PER_DAY + 3 * 3600_000 }), // same day as b1
      makeBlock({ id: 'b3', start: now - 1 * MS_PER_DAY, end: now - 1 * MS_PER_DAY + 30 * MS_PER_MIN }),
    ]
    expect(countMissedDays(blocks, now)).toBe(2)
  })

  it('detectLapse is false below the threshold (< 2 distinct missed days)', () => {
    const blocks = [makeBlock({ start: now - MS_PER_DAY, end: now - MS_PER_DAY + 30 * MS_PER_MIN })]
    expect(detectLapse(blocks, now)).toBe(false)
  })

  it('detectLapse is true at/above the threshold (>= 2 distinct missed days)', () => {
    expect(RECOVERY_CONSTANTS.LAPSE_DAY_THRESHOLD).toBe(2)
    const blocks = [
      makeBlock({ id: 'b1', start: now - 2 * MS_PER_DAY, end: now - 2 * MS_PER_DAY + 30 * MS_PER_MIN }),
      makeBlock({ id: 'b2', start: now - 1 * MS_PER_DAY, end: now - 1 * MS_PER_DAY + 30 * MS_PER_MIN }),
    ]
    expect(detectLapse(blocks, now)).toBe(true)
  })

  it('countMissedBlocks counts every currently-missed block (not just days)', () => {
    const blocks = [
      makeBlock({ id: 'b1', start: now - MS_PER_DAY, end: now - MS_PER_DAY + 30 * MS_PER_MIN }),
      makeBlock({ id: 'b2', start: now - MS_PER_DAY, end: now - MS_PER_DAY + 60 * MS_PER_MIN }),
      makeBlock({ id: 'b3', start: now + MS_PER_DAY, end: now + MS_PER_DAY + 30 * MS_PER_MIN }), // future, not missed
    ]
    expect(countMissedBlocks(blocks, now)).toBe(2)
  })
})

describe('recovery: buildRecoveryPreview — drops (moot past-due dropping)', () => {
  it('drops a non-recurring, open, past-due task as "moot_past_due"', () => {
    const task = makeTask({ id: 't1', due: now - MS_PER_DAY, status: 'todo' })
    const preview = buildRecoveryPreview([task], [], now)
    expect(preview.drops).toHaveLength(1)
    expect(preview.drops[0].task.id).toBe('t1')
    expect(preview.drops[0].reason).toBe('moot_past_due')
  })

  it('drops a missed occurrence of a recurring task as "missed_occurrence", not "moot_past_due"', () => {
    const task = makeTask({
      id: 't2',
      due: now - MS_PER_DAY,
      status: 'todo',
      recurrence: { freq: 'weekly', interval: 1 },
    })
    const preview = buildRecoveryPreview([task], [], now)
    expect(preview.drops[0].reason).toBe('missed_occurrence')
  })

  it('does NOT drop a done task, even if past-due', () => {
    const task = makeTask({ id: 't3', due: now - MS_PER_DAY, status: 'done' })
    const preview = buildRecoveryPreview([task], [], now)
    expect(preview.drops).toHaveLength(0)
  })

  it('does NOT drop a task due in the future', () => {
    const task = makeTask({ id: 't4', due: now + MS_PER_DAY, status: 'todo' })
    const preview = buildRecoveryPreview([task], [], now)
    expect(preview.drops).toHaveLength(0)
  })

  it('does NOT drop an undated task', () => {
    const task = makeTask({ id: 't5', due: undefined, status: 'todo' })
    const preview = buildRecoveryPreview([task], [], now)
    expect(preview.drops).toHaveLength(0)
  })
})

describe('recovery: buildRecoveryPreview — bumps (now-urgent tasks)', () => {
  it('bumps an open, auto-scheduled task with slackRatio < 0.2 to the front', () => {
    // slackRatio = availableMin / remainingMin. availableMin=100min,
    // remainingMin=600min (10h) -> ratio ~0.17 < 0.2.
    const task = makeTask({
      id: 't6',
      due: now + 100 * MS_PER_MIN,
      durationMin: 600,
      progressMin: 0,
      autoSchedule: true,
      status: 'todo',
    })
    const preview = buildRecoveryPreview([task], [], now)
    expect(preview.bumps).toHaveLength(1)
    expect(preview.bumps[0].task.id).toBe('t6')
  })

  it('does NOT bump a task with plenty of slack (ratio >= 0.2)', () => {
    const task = makeTask({
      id: 't7',
      due: now + 10 * MS_PER_DAY,
      durationMin: 60,
      progressMin: 0,
      autoSchedule: true,
      status: 'todo',
    })
    const preview = buildRecoveryPreview([task], [], now)
    expect(preview.bumps).toHaveLength(0)
  })

  it('does NOT bump a task that was already dropped', () => {
    // Past-due (dropped) tasks should never also appear as a bump.
    const task = makeTask({ id: 't8', due: now - MS_PER_DAY, durationMin: 600, autoSchedule: true, status: 'todo' })
    const preview = buildRecoveryPreview([task], [], now)
    expect(preview.drops.map((d) => d.task.id)).toContain('t8')
    expect(preview.bumps.map((b) => b.task.id)).not.toContain('t8')
  })

  it('does NOT bump a non-auto-scheduled task', () => {
    const task = makeTask({
      id: 't9',
      due: now + 50 * MS_PER_MIN,
      durationMin: 600,
      autoSchedule: false,
      status: 'todo',
    })
    const preview = buildRecoveryPreview([task], [], now)
    expect(preview.bumps).toHaveLength(0)
  })

  it('sorts bumps tightest-slack first', () => {
    const loose = makeTask({ id: 'loose', due: now + 90 * MS_PER_MIN, durationMin: 600, autoSchedule: true })
    const tight = makeTask({ id: 'tight', due: now + 10 * MS_PER_MIN, durationMin: 600, autoSchedule: true })
    const preview = buildRecoveryPreview([loose, tight], [], now)
    expect(preview.bumps.map((b) => b.task.id)).toEqual(['tight', 'loose'])
  })
})

describe('recovery: buildRecoveryPreview — rebuildCount + summary', () => {
  it('counts remaining open auto-scheduled tasks not dropped or bumped', () => {
    const dropped = makeTask({ id: 'd', due: now - MS_PER_DAY, autoSchedule: true, status: 'todo' })
    const bumped = makeTask({ id: 'b', due: now + 50 * MS_PER_MIN, durationMin: 600, autoSchedule: true })
    const normal = makeTask({ id: 'n', due: now + 10 * MS_PER_DAY, autoSchedule: true, durationMin: 60 })
    const preview = buildRecoveryPreview([dropped, bumped, normal], [], now)
    expect(preview.rebuildCount).toBe(1)
  })

  it('summary mentions zero shame — never the words "missed" or "streak"', () => {
    const task = makeTask({ id: 'd', due: now - MS_PER_DAY, status: 'todo' })
    const preview = buildRecoveryPreview([task], [], now)
    expect(preview.summary.toLowerCase()).not.toMatch(/missed|streak|behind|fail/)
  })

  it('summary is the calm "already on track" message when there is nothing to do', () => {
    const task = makeTask({ id: 'ok', due: now + MS_PER_DAY, autoSchedule: false })
    const preview = buildRecoveryPreview([task], [], now)
    expect(preview.drops).toHaveLength(0)
    expect(preview.bumps).toHaveLength(0)
    expect(preview.summary).toMatch(/already on track/i)
  })

  it('is deterministic and order-independent: shuffled input tasks produce the same preview', () => {
    const tasks = [
      makeTask({ id: 'a', due: now - MS_PER_DAY, status: 'todo' }),
      makeTask({ id: 'b', due: now + 50 * MS_PER_MIN, durationMin: 600, autoSchedule: true }),
      makeTask({ id: 'c', due: now + 10 * MS_PER_DAY, autoSchedule: true, durationMin: 60 }),
    ]
    const shuffled = [tasks[2], tasks[0], tasks[1]]
    const p1 = buildRecoveryPreview(tasks, [], now)
    const p2 = buildRecoveryPreview(shuffled, [], now)
    expect(p1).toEqual(p2)
  })
})
