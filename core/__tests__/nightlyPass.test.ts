import { describe, expect, it } from 'vitest'
import {
  DEFAULT_EVENING_START_MIN,
  buildGeneratedTaskDraft,
  decideNightlyPass,
  inferLastOutcome,
  isActiveProject,
  readyForTomorrowNotificationId,
  selectActiveProjects,
  taskAlreadyGeneratedForDay,
  type GeneratedSessionInput,
} from '@/core/nightlyPass'
import { makeTask, mondayAt, MS_PER_DAY } from './helpers/fixtures'
import type { Project } from '@/types'

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: 'proj-1',
    createdAt: 0,
    updatedAt: 0,
    syncState: 'synced',
    title: 'Research paper',
    kind: 'deliverable',
    phases: [],
    percent: 0,
    ...overrides,
  }
}

describe('nightlyPass: decideNightlyPass', () => {
  it('before the evening window with no prior run targets TODAY (catch-up shape)', () => {
    const now = mondayAt(8) // 8am
    const { shouldRun, targetDayStart } = decideNightlyPass(now, null)
    expect(shouldRun).toBe(true)
    expect(targetDayStart).toBe(mondayAt(0))
  })

  it('at/after the evening window with no prior run targets TOMORROW', () => {
    const now = mondayAt(19) // 7pm, past the 6pm default
    const { shouldRun, targetDayStart } = decideNightlyPass(now, null)
    expect(shouldRun).toBe(true)
    expect(targetDayStart).toBe(mondayAt(0) + MS_PER_DAY)
  })

  it('exactly at the evening threshold counts as "in the evening"', () => {
    const now = mondayAt(18, 0) // 6:00pm exactly
    expect(decideNightlyPass(now, null).targetDayStart).toBe(mondayAt(0) + MS_PER_DAY)
    expect(DEFAULT_EVENING_START_MIN).toBe(18 * 60)
  })

  it('running twice in the same evening is idempotent (second call is a no-op)', () => {
    const first = decideNightlyPass(mondayAt(19), null)
    expect(first.shouldRun).toBe(true)

    const second = decideNightlyPass(mondayAt(21), first.targetDayStart) // 9pm, same evening
    expect(second.shouldRun).toBe(false)
    expect(second.targetDayStart).toBe(first.targetDayStart)
  })

  it('a morning catch-up run does not block the same evening\'s run for tomorrow', () => {
    const morning = decideNightlyPass(mondayAt(8), null)
    expect(morning.targetDayStart).toBe(mondayAt(0))

    const evening = decideNightlyPass(mondayAt(19), morning.targetDayStart)
    expect(evening.shouldRun).toBe(true)
    expect(evening.targetDayStart).toBe(mondayAt(0) + MS_PER_DAY)
  })

  it('several missed days still catch up to TODAY on next open, not stuck on a stale future target', () => {
    const staleLastTarget = mondayAt(0) - 5 * MS_PER_DAY // ran five days ago
    const { shouldRun, targetDayStart } = decideNightlyPass(mondayAt(9), staleLastTarget)
    expect(shouldRun).toBe(true)
    expect(targetDayStart).toBe(mondayAt(0))
  })

  it('respects a custom evening-start-minute override', () => {
    const now = mondayAt(17) // 5pm
    expect(decideNightlyPass(now, null, 16 * 60).targetDayStart).toBe(mondayAt(0) + MS_PER_DAY)
    expect(decideNightlyPass(now, null, 20 * 60).targetDayStart).toBe(mondayAt(0))
  })
})

describe('nightlyPass: active-project selection', () => {
  it('a project below 100 percent is active, including a brand-new 0 percent project', () => {
    expect(isActiveProject(makeProject({ percent: 0 }))).toBe(true)
    expect(isActiveProject(makeProject({ percent: 63 }))).toBe(true)
  })

  it('a fully complete project is not active', () => {
    expect(isActiveProject(makeProject({ percent: 100 }))).toBe(false)
  })

  it('selectActiveProjects filters out only the completed ones', () => {
    const projects = [
      makeProject({ id: 'a', percent: 0 }),
      makeProject({ id: 'b', percent: 100 }),
      makeProject({ id: 'c', percent: 40 }),
    ]
    expect(selectActiveProjects(projects).map((p) => p.id)).toEqual(['a', 'c'])
  })
})

describe('nightlyPass: taskAlreadyGeneratedForDay (idempotency guard)', () => {
  const dayStart = mondayAt(0) + MS_PER_DAY // "tomorrow"

  it('false when nothing exists for that project', () => {
    expect(taskAlreadyGeneratedForDay([], 'proj-1', dayStart)).toBe(false)
  })

  it('true when a task for this project is due within that day (any origin, done or not)', () => {
    const tasks = [makeTask({ projectId: 'proj-1', due: dayStart + 3600_000, status: 'done' })]
    expect(taskAlreadyGeneratedForDay(tasks, 'proj-1', dayStart)).toBe(true)
  })

  it('false when the matching task belongs to a different project', () => {
    const tasks = [makeTask({ projectId: 'proj-2', due: dayStart + 3600_000 })]
    expect(taskAlreadyGeneratedForDay(tasks, 'proj-1', dayStart)).toBe(false)
  })

  it('false when the task is due on a different day entirely', () => {
    const tasks = [makeTask({ projectId: 'proj-1', due: dayStart - 3600_000 })] // yesterday
    expect(taskAlreadyGeneratedForDay(tasks, 'proj-1', dayStart)).toBe(false)
  })

  it('false when the task has no due date at all', () => {
    const tasks = [makeTask({ projectId: 'proj-1', due: undefined })]
    expect(taskAlreadyGeneratedForDay(tasks, 'proj-1', dayStart)).toBe(false)
  })
})

describe('nightlyPass: inferLastOutcome', () => {
  const beforeMs = mondayAt(0) + MS_PER_DAY

  it('undefined for a project\'s first-ever session (nothing prior)', () => {
    expect(inferLastOutcome([], 'proj-1', beforeMs)).toBeUndefined()
  })

  it('"done" when the most recent prior task is fully complete', () => {
    const tasks = [
      makeTask({
        projectId: 'proj-1',
        due: beforeMs - MS_PER_DAY,
        subtasks: [{ id: 's1', title: 'x', estimatedMin: 10, completedAt: 1 }],
      }),
    ]
    expect(inferLastOutcome(tasks, 'proj-1', beforeMs)).toBe('done')
  })

  it('"stop_here" when the most recent prior task is not fully complete', () => {
    const tasks = [
      makeTask({
        projectId: 'proj-1',
        due: beforeMs - MS_PER_DAY,
        subtasks: [{ id: 's1', title: 'x', estimatedMin: 10 }],
      }),
    ]
    expect(inferLastOutcome(tasks, 'proj-1', beforeMs)).toBe('stop_here')
  })

  it('picks the LATEST prior task strictly before beforeMs, ignoring later/other-project ones', () => {
    const tasks = [
      makeTask({ id: 'old', projectId: 'proj-1', due: beforeMs - 3 * MS_PER_DAY, status: 'done' }),
      makeTask({ id: 'newest', projectId: 'proj-1', due: beforeMs - MS_PER_DAY, status: 'todo' }),
      makeTask({ id: 'future', projectId: 'proj-1', due: beforeMs + MS_PER_DAY, status: 'done' }), // not "before"
      makeTask({ id: 'other-proj', projectId: 'proj-2', due: beforeMs - 3600_000, status: 'done' }),
    ]
    // "newest" is the latest strictly-before task and is NOT complete (zero subtasks, status todo).
    expect(inferLastOutcome(tasks, 'proj-1', beforeMs)).toBe('stop_here')
  })
})

describe('nightlyPass: buildGeneratedTaskDraft', () => {
  const targetDayStart = mondayAt(0) + MS_PER_DAY
  const session: GeneratedSessionInput = {
    title: 'Draft section 2 (45 min)',
    firstMove: 'Open your draft and reread your last paragraph',
    subtasks: [
      { title: 'Re-read the outline', estimatedMin: 5 },
      { title: 'Write the body', estimatedMin: 30 },
      { title: 'Tidy it up', estimatedMin: 10 },
    ],
  }

  it('rolls durationMin up from the subtask estimates', () => {
    const draft = buildGeneratedTaskDraft(session, 'proj-1', targetDayStart)
    expect(draft.durationMin).toBe(45)
    expect(draft.subtasks).toHaveLength(3)
  })

  it('constrains the task to the target day only (startAfter..due)', () => {
    const draft = buildGeneratedTaskDraft(session, 'proj-1', targetDayStart)
    expect(draft.startAfter).toBe(targetDayStart)
    expect(draft.due).toBeGreaterThan(targetDayStart)
    expect(draft.due as number).toBeLessThan(targetDayStart + MS_PER_DAY)
  })

  it('is schedulable, unsplit, and back-references the project', () => {
    const draft = buildGeneratedTaskDraft(session, 'proj-1', targetDayStart)
    expect(draft.autoSchedule).toBe(true)
    expect(draft.splittable).toBe(false)
    expect(draft.projectId).toBe('proj-1')
    expect(draft.title).toBe(session.title)
  })

  it('wraps the first move as an undone StarterAction', () => {
    const draft = buildGeneratedTaskDraft(session, 'proj-1', targetDayStart)
    expect(draft.firstMove?.text).toBe(session.firstMove)
    expect(draft.firstMove?.done).toBe(false)
  })

  it('caps subtasks at 8 even if the input carries more', () => {
    const many: GeneratedSessionInput = {
      ...session,
      subtasks: Array.from({ length: 12 }, (_, i) => ({ title: `Step ${i}`, estimatedMin: 5 })),
    }
    const draft = buildGeneratedTaskDraft(many, 'proj-1', targetDayStart)
    expect(draft.subtasks).toHaveLength(8)
  })

  it('every generated subtask gets a non-empty id', () => {
    const draft = buildGeneratedTaskDraft(session, 'proj-1', targetDayStart)
    for (const s of draft.subtasks ?? []) {
      expect(s.id.length).toBeGreaterThan(0)
    }
  })
})

describe('nightlyPass: readyForTomorrowNotificationId', () => {
  it('is stable for the same target day and distinct across days', () => {
    const a = readyForTomorrowNotificationId(mondayAt(0));
    const b = readyForTomorrowNotificationId(mondayAt(0));
    const c = readyForTomorrowNotificationId(mondayAt(0) + MS_PER_DAY);
    expect(a).toBe(b)
    expect(a).not.toBe(c)
  })
})
