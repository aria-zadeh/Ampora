/**
 * Nightly pre-built-tomorrow pass — pure decision logic (PRD FR-90, doc `06`
 * §4). This module answers two questions with no I/O at all, so both are
 * unit-testable under plain Node (`core/__tests__/nightlyPass.test.ts`):
 *
 *  1. `decideNightlyPass` — SHOULD the pass run right now, and which calendar
 *     day is it preparing?
 *  2. `selectActiveProjects` / `taskAlreadyGeneratedForDay` / `inferLastOutcome`
 *     / `buildGeneratedTaskDraft` — WHAT should it generate?
 *
 * The impure orchestrator (`services/nightlyPass.ts`) reads real store state,
 * calls the AI/fallback client (`services/aiProjects.ts#generateNextTask`),
 * and calls back into these pure helpers to decide and to shape the result
 * into a `Task` draft. Nothing here imports react-native, expo, MMKV, or a
 * store — matching every other module under `core/`.
 *
 * ---------------------------------------------------------------------------
 * On "evening" and idempotency (see `services/nightlyPass.ts` for the fuller
 * story of what fires when):
 *
 * There is no reliable background wakeup on this stack (see the doc comment
 * in `services/nightlyPass.ts`), so "each evening" is approximated as: once
 * the app is foregrounded at/after `DEFAULT_EVENING_START_MIN` local time,
 * target TOMORROW. If the evening window was missed entirely (the app was
 * never opened after that hour), the very next time the app opens — even at
 * 9am — this targets TODAY instead, so a project still gets a session queued
 * for the day in progress rather than silently skipping it.
 *
 * Idempotency is keyed on the TARGET day, not on "did we run today": running
 * the pass twice (or ten times) for the same target day is a no-op the
 * second time onward, because `lastTargetDayStart` already covers it. This is
 * what makes it safe to call on every foreground and on a coarse poll timer.
 */

import { startOfDay, minutesOfDay } from '@/core/scheduler/time'
import { isTaskComplete } from '@/core/task-logic'
import { newId } from '@/core/id'
import type { CheckInAnswer } from '@/core/projects/progress'
import type { Project, StarterAction, Subtask, Task } from '@/types'

const MS_PER_MIN = 60_000
const MS_PER_DAY = 24 * 60 * MS_PER_MIN

/** 6:00 PM local — once we're at/after this time of day, the pass targets TOMORROW. */
export const DEFAULT_EVENING_START_MIN = 18 * 60

/** MMKV key the impure service persists `targetDayStart` under between runs. */
export const NIGHTLY_PASS_LAST_RUN_KEY = 'ampora-nightly-pass-last-target-day'

// ---------------------------------------------------------------------------
// 1. Should it run, and for which day?
// ---------------------------------------------------------------------------

export interface NightlyPassDecision {
  shouldRun: boolean
  /** Local midnight (epoch ms) of the day this run prepares. */
  targetDayStart: number
}

/**
 * Pure decision: given the current instant and the target day the pass last
 * successfully completed for (or `null` if it has never run), should it run
 * now, and for which day?
 *
 * - At/after the evening window: target TOMORROW.
 * - Before the evening window: target TODAY — this is the missed-last-night
 *   catch-up path, so opening the app at 9am after a skipped evening still
 *   queues a session for the day already in progress.
 * - `shouldRun` is false whenever the computed target is not strictly after
 *   `lastTargetDayStart` (i.e. we already covered it, however many times this
 *   has been called since).
 */
export function decideNightlyPass(
  now: number,
  lastTargetDayStart: number | null,
  eveningStartMin: number = DEFAULT_EVENING_START_MIN
): NightlyPassDecision {
  const todayStart = startOfDay(now)
  const tomorrowStart = todayStart + MS_PER_DAY
  const targetDayStart = minutesOfDay(now) >= eveningStartMin ? tomorrowStart : todayStart
  const alreadyDone = lastTargetDayStart != null && targetDayStart <= lastTargetDayStart
  return { shouldRun: !alreadyDone, targetDayStart }
}

// ---------------------------------------------------------------------------
// 2. What does it generate?
// ---------------------------------------------------------------------------

/**
 * An "active" project still needs nightly sessions generated for it (doc `06`
 * §4 "every active project"). A project is active while its percent bar
 * hasn't reached 100 — including a brand-new project with no phases yet
 * (percent 0), which `generateNextTask`'s own fallback already handles with
 * dedicated "nothing planned yet" copy.
 */
export function isActiveProject(project: Pick<Project, 'percent'>): boolean {
  return project.percent < 100
}

export function selectActiveProjects(projects: Project[]): Project[] {
  return projects.filter(isActiveProject)
}

/**
 * Idempotency guard (doc `06` §4, PRD FR-84): does a task already exist for
 * this project due on `dayStart`? Counts ANY task (auto-generated or
 * user-added, done or not) — the point is "does this project already have a
 * session for that day", not "did the auto-generator specifically make it".
 * Running the whole pass twice in one evening must not create a second one.
 */
export function taskAlreadyGeneratedForDay(tasks: Task[], projectId: string, dayStart: number): boolean {
  const dayEnd = dayStart + MS_PER_DAY
  return tasks.some((t) => t.projectId === projectId && t.due != null && t.due >= dayStart && t.due < dayEnd)
}

/** The most recently-due task for this project strictly before `beforeMs`, or null. */
function findLastProjectTaskBefore(tasks: Task[], projectId: string, beforeMs: number): Task | null {
  let best: Task | null = null
  for (const t of tasks) {
    if (t.projectId !== projectId || t.due == null || t.due >= beforeMs) continue
    if (best == null || t.due > (best.due as number)) best = t
  }
  return best
}

/**
 * Infer the last session's outcome for `generateNextTask`'s copy-flavoring
 * (doc `06` §4: "the last session's outcome (from the check-in, or inferred
 * from subtask checkboxes if the check-in was skipped)"). There is no
 * standalone stored "last check-in answer" — by the time the pass runs, a
 * real check-in has already folded into `project.phases`/`percent`
 * (`store/projectStore.ts#applyCheckIn`, called from `app/focus/session.tsx`)
 * — so this reuses the SAME inference rule the focus session itself falls
 * back to for a skipped check-in (`isTaskComplete(task) ? 'done' : 'stop_here'`,
 * see `applyProjectCheckIn` there), applied to the most recent prior
 * project-generated task. Returns `undefined` for a project's first-ever
 * session (nothing prior to infer from).
 */
export function inferLastOutcome(
  tasks: Task[],
  projectId: string,
  beforeMs: number
): CheckInAnswer | undefined {
  const prior = findLastProjectTaskBefore(tasks, projectId, beforeMs)
  if (!prior) return undefined
  return isTaskComplete(prior) ? 'done' : 'stop_here'
}

/** The shape `services/aiProjects.ts#generateNextTask` resolves to — kept local so this module has zero store/service imports. */
export interface GeneratedSessionInput {
  title: string
  firstMove: string
  subtasks: { title: string; estimatedMin: number }[]
}

/**
 * Turn a generated session into a schedulable `Task` draft for
 * `taskStore.createTask` (doc `06` §4, PRD FR-84):
 *  - `due` = end of the target day, `startAfter` = its start, so the engine
 *    places it ON that day (never before, never after) rather than wherever
 *    is next convenient.
 *  - `durationMin` is the rollup of the generated subtasks' estimates (doc 07
 *    Part 3.2 convention), and `splittable: false` — this is meant to render
 *    as ONE session block, not fragment further.
 *  - `autoSchedule: true` so it actually reaches the calendar without a
 *    second user action.
 */
export function buildGeneratedTaskDraft(
  session: GeneratedSessionInput,
  projectId: string,
  targetDayStart: number
): Partial<Omit<Task, 'id' | 'createdAt' | 'updatedAt' | 'syncState'>> & Pick<Task, 'title'> {
  const subtasks: Subtask[] = session.subtasks.slice(0, 8).map((s) => ({
    id: newId(),
    title: s.title,
    estimatedMin: Math.max(1, Math.round(s.estimatedMin)),
  }))
  const durationMin = subtasks.reduce((sum, s) => sum + s.estimatedMin, 0)
  const firstMove: StarterAction = { id: newId(), text: session.firstMove, done: false }

  return {
    title: session.title,
    projectId,
    subtasks,
    firstMove,
    durationMin,
    autoSchedule: true,
    splittable: false,
    startAfter: targetDayStart,
    due: targetDayStart + MS_PER_DAY - 1,
  }
}

/** Stable per-day identifier for the "Ready for tomorrow" notification (FR-90, §8.9) — scheduling twice with the same id overwrites rather than duplicates. */
export function readyForTomorrowNotificationId(targetDayStart: number): string {
  return `ready-for-tomorrow-${targetDayStart}`
}
