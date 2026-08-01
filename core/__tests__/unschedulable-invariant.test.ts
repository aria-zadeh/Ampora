/**
 * FR-20 regression guard: "Unschedulable tasks are never silently dropped.
 * They stay on the to-do list, are flagged at-risk, and the app explains why
 * with a one-tap fix."
 *
 * This is the executable form of that guarantee: for every task the engine
 * could have attempted to place this run (auto-scheduled, not done, dated
 * within the cutoff — `ordering.ts#isDatedEligible`) that ends up with zero
 * placed blocks, `result.unschedulable` must contain an entry for that task
 * with a non-empty, human-readable `reason`. If a future change to
 * ordering.ts/placement.ts/recompute.ts ever reintroduces a silent drop
 * (a task that just vanishes with no block and no explanation), this test
 * fails.
 *
 * This is deliberately a property test, not just a handful of example
 * assertions: `assertNeverSilentlyDropped` is run against both a hand-built
 * scenario (so we know exactly which kind of failure we're triggering) and
 * the existing ~300-task NFR-2 perf fixture (so the invariant is also
 * exercised against a large, realistic, semi-randomized input without this
 * file having to hand-roll one).
 */
import { describe, expect, it } from 'vitest'
import { recompute } from '@/core/scheduler/recompute'
import { isDatedEligible } from '@/core/scheduler/ordering'
import type { ScheduleInput, ScheduleResult } from '@/core/scheduler/types'
import { MS_PER_DAY } from '@/core/scheduler/types'
import { allDaySchedulingHours, makeSettings, makeTask, mondayAt } from './helpers/fixtures'
import { buildPerfFixture } from './helpers/perfFixture'

const now = mondayAt(9)

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

/**
 * The FR-20 invariant itself: every task the engine could have attempted to
 * place this run, and that ended up with zero blocks, must be explained.
 * Also checks the reverse — every reported entry carries a real reason
 * string, not an empty placeholder — so the UI never has "why" to show.
 */
function assertNeverSilentlyDropped(input: ScheduleInput, result: ScheduleResult): void {
  const cutoff = input.now + (input.cutoffDays ?? 14) * MS_PER_DAY
  const placedTaskIds = new Set(result.blocks.map((b) => b.taskId))
  const unschedulableTaskIds = new Set(result.unschedulable.map((u) => u.taskId))

  for (const task of input.tasks) {
    if (!isDatedEligible(task, input.now, cutoff)) continue // not the engine's job to place/explain this run
    if (placedTaskIds.has(task.id)) continue // got at least one block this run
    expect(
      unschedulableTaskIds.has(task.id),
      `Task "${task.title}" (${task.id}) has zero scheduled blocks but no unschedulable entry — FR-20 silent drop.`
    ).toBe(true)
  }

  for (const u of result.unschedulable) {
    expect(u.reason, `Unschedulable entry for task ${u.taskId} has an empty reason`).toBeTruthy()
  }
}

describe('FR-20: unschedulable tasks are never silently dropped', () => {
  it('an overcommitted day: every task that could not be placed is reported with a reason', () => {
    // Scheduling hours only 09:00-11:00 (120 min/day) and everything below
    // competes for the SAME single day before `due` — deliberately not
    // enough room for all of it, so several distinct unschedulable kinds
    // fire in one recompute.
    const settings = makeSettings({ schedulingHours: allDaySchedulingHours({ start: 9 * 60, end: 11 * 60 }) })
    const due = now + MS_PER_DAY

    const fitsFine = makeTask({ id: 'fits', durationMin: 60, due, splittable: false })
    const tooBig = makeTask({ id: 'too-big', durationMin: 500, due, splittable: false })
    const pastDue = makeTask({ id: 'past-due', durationMin: 30, due: now - MS_PER_DAY, splittable: false })
    const noDuration = makeTask({ id: 'no-duration', durationMin: 0, due, splittable: false })
    // Splittable, but still more work than the single available day holds —
    // exercises the "partially placed" kind (some sessions land, some don't).
    const partial = makeTask({
      id: 'partial',
      durationMin: 300,
      due,
      splittable: true,
      minBlockMin: 30,
      maxBlockMin: 60,
    })
    // `fixed-blocker` is NOT auto-scheduled, so it's outside this run's
    // eligible set; `blocked` depends on it and so can never be
    // topologically placeable this run — exercises "dependency blocked".
    const fixedBlocker = makeTask({ id: 'fixed-blocker', autoSchedule: false, due, durationMin: 30 })
    const blocked = makeTask({
      id: 'blocked',
      durationMin: 30,
      due: due + MS_PER_DAY,
      dependsOn: ['fixed-blocker'],
    })

    const tasks = [fitsFine, tooBig, pastDue, noDuration, partial, fixedBlocker, blocked]
    const input = baseInput({ tasks, settings })
    const result = recompute(input)

    assertNeverSilentlyDropped(input, result)

    // Spot-check the specific reasons/kinds too, so this test also documents
    // the contract the UI (app/(tabs)/tasks.tsx) switches on, not just the
    // aggregate "something was said" invariant above.
    const byId = new Map(result.unschedulable.map((u) => [u.taskId, u]))
    expect(result.blocks.some((b) => b.taskId === 'fits')).toBe(true)
    expect(byId.get('too-big')?.kind).toBe('no_free_time')
    expect(byId.get('past-due')?.kind).toBe('past_deadline')
    expect(byId.get('no-duration')?.kind).toBe('zero_duration')
    expect(byId.get('partial')?.kind).toBe('partially_placed')
    expect(byId.get('blocked')?.kind).toBe('dependency_blocked')
  })

  it('a task with no possible window ever (scheduling hours empty every day) is still reported, not dropped', () => {
    const settings = makeSettings({ schedulingHours: { perDay: [] } })
    const task = makeTask({ id: 'no-hours', durationMin: 30, due: now + 3 * MS_PER_DAY })
    const input = baseInput({ tasks: [task], settings })
    const result = recompute(input)

    assertNeverSilentlyDropped(input, result)
    expect(result.blocks).toHaveLength(0)
    expect(result.unschedulable.some((u) => u.taskId === 'no-hours')).toBe(true)
  })

  it('holds across a large, semi-randomized fixture (the NFR-2 ~300-task / 8-week fixture)', () => {
    const fixture = buildPerfFixture()
    const input: ScheduleInput = {
      tasks: fixture.tasks,
      prevBlocks: [],
      calEvents: fixture.calEvents,
      settings: fixture.settings,
      now: fixture.now,
      cutoffDays: fixture.cutoffDays,
      listMap: fixture.listMap,
    }
    const result = recompute(input)
    assertNeverSilentlyDropped(input, result)
  })

  it('holds on a warm recompute (prevBlocks fed back in), matching real steady-state usage', () => {
    const fixture = buildPerfFixture()
    const input: ScheduleInput = {
      tasks: fixture.tasks,
      prevBlocks: [],
      calEvents: fixture.calEvents,
      settings: fixture.settings,
      now: fixture.now,
      cutoffDays: fixture.cutoffDays,
      listMap: fixture.listMap,
    }
    const first = recompute(input)
    const warmInput: ScheduleInput = { ...input, prevBlocks: first.blocks }
    const second = recompute(warmInput)
    assertNeverSilentlyDropped(warmInput, second)
  })
})
