import { describe, expect, it } from 'vitest'
import {
  applyRecoveryDrop,
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

describe('recovery: buildRecoveryPreview — recurringAdvance.nextCount (FR-16, §9.5.6)', () => {
  // These mirror core/recurrence.ts#advanceMissedOccurrence's own
  // "drop, multi-step catch-up" / "carry-forward advances by exactly one"
  // suites, but assert through buildRecoveryPreview's PUBLIC RecurringAdvance
  // result — the count is computed correctly inside advanceMissedOccurrence,
  // but was previously dropped on the floor when the preview copied only
  // `due` and `carryForward` off it. Left uncaught, a count-limited recurring
  // task ("repeat 10 times") caught up by Recovery would keep a stale
  // remaining-count and outlive its own rule.

  it('drop branch: nextCount decrements by every occurrence consumed catching up, not just by 1', () => {
    // 3 days missed (Jan 3, 4, 5 all consumed to reach "now") on a count:10 rule.
    const task = makeTask({
      id: 'rc1',
      due: now - 3 * MS_PER_DAY,
      status: 'todo',
      recurrence: { freq: 'daily', interval: 1, count: 10 }, // carryForward unset -> drop (FR-16 default)
    })
    const preview = buildRecoveryPreview([task], [], now)
    const advance = preview.drops[0].recurringAdvance
    expect(advance).toBeDefined()
    expect(advance!.seriesEnded).toBe(false)
    expect(advance!.carryForward).toBe(false)
    expect(advance!.due).toBe(now)
    expect(advance!.nextCount).toBe(7) // 10 - 3 occurrences consumed, not 10 - 1
  })

  it('carry-forward branch: nextCount always decrements by exactly 1, regardless of how many days were missed', () => {
    // 5 days missed, but carry-forward only ever steps ONE occurrence at a time.
    const task = makeTask({
      id: 'rc2',
      due: now - 5 * MS_PER_DAY,
      status: 'todo',
      recurrence: { freq: 'daily', interval: 1, count: 10, carryForward: true },
    })
    const preview = buildRecoveryPreview([task], [], now)
    const advance = preview.drops[0].recurringAdvance
    expect(advance).toBeDefined()
    expect(advance!.carryForward).toBe(true)
    expect(advance!.due).toBe(now - 4 * MS_PER_DAY) // exactly one step on from the missed due, not caught up to "now"
    expect(advance!.nextCount).toBe(9) // decremented by exactly 1, never by the 5 days missed
  })

  it('leaves nextCount undefined for an unbounded rule (no count to track)', () => {
    const task = makeTask({
      id: 'rc3',
      due: now - 2 * MS_PER_DAY,
      status: 'todo',
      recurrence: { freq: 'daily', interval: 1 }, // no count, no until
    })
    const preview = buildRecoveryPreview([task], [], now)
    const advance = preview.drops[0].recurringAdvance
    expect(advance).toBeDefined()
    expect(advance!.seriesEnded).toBe(false)
    expect(advance!.nextCount).toBeUndefined()
  })

  it('leaves nextCount undefined when the series is exhausted (seriesEnded true) — nothing left to persist', () => {
    // count:2 cannot reach all the way to "now" 10 days later — the series ends mid-catch-up.
    const task = makeTask({
      id: 'rc4',
      due: now - 10 * MS_PER_DAY,
      status: 'todo',
      recurrence: { freq: 'daily', interval: 1, count: 2 },
    })
    const preview = buildRecoveryPreview([task], [], now)
    const advance = preview.drops[0].recurringAdvance
    expect(advance).toBeDefined()
    expect(advance!.seriesEnded).toBe(true)
    expect(advance!.nextCount).toBeUndefined()
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

describe('recovery: applyRecoveryDrop (FR-16, FR-60 apply step)', () => {
  // Regression coverage for the data-loss bug: `RecoverySheet.tsx#handleRebuild`
  // used to call `deleteTask` for EVERY drop, including `missed_occurrence`
  // ones, which destroyed the whole recurring series over a single missed
  // instance. `applyRecoveryDrop` is the pure function that now decides
  // delete-vs-advance; `store/taskStore.ts#applyRecoveryDrop` just calls it.

  it('a recurring task with a missed occurrence SURVIVES a rebuild: never null, rolled to the advance due date, fresh occurrence state', () => {
    const task = makeTask({
      id: 'adv1',
      due: now - 2 * MS_PER_DAY,
      status: 'todo',
      durationMin: 60,
      progressMin: 30,
      subtasks: [
        { id: 's1', title: 'Step 1', estimatedMin: 30, completedAt: now - 2 * MS_PER_DAY },
        { id: 's2', title: 'Step 2', estimatedMin: 30 },
      ],
      firstMove: { id: 'fm1', text: 'Open the doc', done: true },
      recurrence: { freq: 'daily', interval: 1 },
    })
    const preview = buildRecoveryPreview([task], [], now)
    expect(preview.drops).toHaveLength(1)
    const drop = preview.drops[0]
    expect(drop.reason).toBe('missed_occurrence')

    const result = applyRecoveryDrop(task, drop, now)

    // Survives — the task is never deleted.
    expect(result).not.toBeNull()
    expect(result!.id).toBe('adv1')
    expect(result!.recurrence).toBeDefined()
    // Rolled forward to the computed advance, not left sitting in the past.
    expect(result!.due).toBe(drop.recurringAdvance!.due)
    expect(result!.due).toBeGreaterThanOrEqual(now)
    // Fresh occurrence (drop default, doc `03` §2.9): checklist reset, not
    // carried over half-done.
    expect(result!.progressMin).toBe(0)
    expect(result!.subtasks.every((s) => s.completedAt === undefined)).toBe(true)
    expect(result!.status).toBe('todo')
    expect(result!.firstMove?.done).toBe(false)
  })

  it('a count-limited recurring rule has its count decremented by the advance, not left stale', () => {
    const task = makeTask({
      id: 'adv2',
      due: now - 3 * MS_PER_DAY,
      status: 'todo',
      recurrence: { freq: 'daily', interval: 1, count: 10 },
    })
    const preview = buildRecoveryPreview([task], [], now)
    const drop = preview.drops[0]
    expect(drop.recurringAdvance!.nextCount).toBe(7) // 3 missed days consumed

    const result = applyRecoveryDrop(task, drop, now)!
    expect(result.recurrence!.count).toBe(7)
  })

  it('leaves an unbounded rule\'s (no count) recurrence otherwise untouched aside from due', () => {
    const task = makeTask({
      id: 'adv3',
      due: now - 2 * MS_PER_DAY,
      status: 'todo',
      recurrence: { freq: 'daily', interval: 1, byWeekday: [1, 2, 3, 4, 5] },
    })
    const preview = buildRecoveryPreview([task], [], now)
    const drop = preview.drops[0]
    expect(drop.recurringAdvance!.nextCount).toBeUndefined()

    const result = applyRecoveryDrop(task, drop, now)!
    expect(result.recurrence!.count).toBeUndefined()
    expect(result.recurrence!.byWeekday).toEqual([1, 2, 3, 4, 5]) // rest of the rule untouched
  })

  it('a non-recurring moot past-due task still resolves to null (delete), same as before the fix', () => {
    const task = makeTask({ id: 'moot1', due: now - MS_PER_DAY, status: 'todo' })
    const preview = buildRecoveryPreview([task], [], now)
    const drop = preview.drops[0]
    expect(drop.reason).toBe('moot_past_due')
    expect(applyRecoveryDrop(task, drop, now)).toBeNull()
  })

  it('a recurring series that has genuinely ended (seriesEnded) also resolves to null — deleting here is correct, not data loss', () => {
    // count:2 cannot catch all the way up to "now" 10 days later — confirmed
    // by the existing buildRecoveryPreview suite above (`rc4`).
    const task = makeTask({
      id: 'ended1',
      due: now - 10 * MS_PER_DAY,
      status: 'todo',
      recurrence: { freq: 'daily', interval: 1, count: 2 },
    })
    const preview = buildRecoveryPreview([task], [], now)
    const drop = preview.drops[0]
    expect(drop.recurringAdvance!.seriesEnded).toBe(true)
    expect(applyRecoveryDrop(task, drop, now)).toBeNull()
  })

  it('carry-forward opt-in PRESERVES progress/subtasks/first-move instead of resetting them, unlike the drop default (FR-16)', () => {
    const task = makeTask({
      id: 'cf1',
      due: now - 5 * MS_PER_DAY,
      status: 'todo',
      progressMin: 30,
      subtasks: [
        { id: 's1', title: 'Step 1', estimatedMin: 30, completedAt: now - 5 * MS_PER_DAY },
        { id: 's2', title: 'Step 2', estimatedMin: 30 },
      ],
      firstMove: { id: 'fm1', text: 'Open the doc', done: true },
      recurrence: { freq: 'daily', interval: 1, count: 10, carryForward: true },
    })
    const preview = buildRecoveryPreview([task], [], now)
    const drop = preview.drops[0]
    expect(drop.recurringAdvance!.carryForward).toBe(true)
    expect(drop.recurringAdvance!.nextCount).toBe(9) // decremented by exactly 1

    const result = applyRecoveryDrop(task, drop, now)!
    // Preserved, NOT reset — the missed work carries into the next occurrence.
    expect(result.progressMin).toBe(30)
    expect(result.subtasks.find((s) => s.id === 's1')?.completedAt).toBe(now - 5 * MS_PER_DAY)
    expect(result.firstMove?.done).toBe(true)
    // But due/rule DID advance — carry-forward still moves the series on.
    expect(result.due).toBe(drop.recurringAdvance!.due)
    expect(result.recurrence!.count).toBe(9)
  })

  it('end-to-end simulation of the store apply loop: every recurring drop survives with its rule intact, every moot one-off is removed, untouched tasks are left alone', () => {
    // Mirrors store/taskStore.ts#applyRecoveryDrop's set() loop and
    // components/recovery/RecoverySheet.tsx#handleRebuild's `for (const drop
    // of preview.drops) applyRecoveryDrop(drop)` — this is the regression
    // test for the original bug ("Catch me up" deleted recurring tasks
    // outright instead of advancing them).
    const recurringSurvivor = makeTask({
      id: 'sim-recurring',
      due: now - MS_PER_DAY,
      status: 'todo',
      recurrence: { freq: 'daily', interval: 1 },
    })
    const mootOneOff = makeTask({ id: 'sim-moot', due: now - MS_PER_DAY, status: 'todo' })
    const stillOpen = makeTask({ id: 'sim-open', due: now + MS_PER_DAY, status: 'todo' })

    const tasks = [recurringSurvivor, mootOneOff, stillOpen]
    const preview = buildRecoveryPreview(tasks, [], now)

    const byId = new Map(tasks.map((t) => [t.id, t]))
    for (const drop of preview.drops) {
      const current = byId.get(drop.task.id)
      if (!current) continue
      const resolved = applyRecoveryDrop(current, drop, now)
      if (resolved == null) byId.delete(drop.task.id)
      else byId.set(drop.task.id, resolved)
    }

    expect(byId.has('sim-recurring')).toBe(true) // survived — NOT deleted
    expect(byId.get('sim-recurring')!.recurrence).toBeDefined() // rule intact
    expect(byId.get('sim-recurring')!.due).toBeGreaterThanOrEqual(now) // actually advanced
    expect(byId.has('sim-moot')).toBe(false) // correctly dropped, as before
    expect(byId.has('sim-open')).toBe(true) // not due yet, untouched
  })
})
