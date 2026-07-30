/**
 * The nightly pre-built-tomorrow pass (PRD FR-90, FR-84; doc `06` §4) — the
 * retention hook. This is the impure orchestrator: it reads real store state,
 * calls the AI/fallback client, and writes real tasks, then delegates every
 * actual decision to the pure helpers in `core/nightlyPass.ts` (which is what
 * `core/__tests__/nightlyPass.test.ts` exercises — this file has no test
 * coverage of its own because it pulls in `store/*` -> `react-native-mmkv`,
 * which the plain-Node vitest harness cannot load).
 *
 * ---------------------------------------------------------------------------
 * THE HONEST STORY OF WHAT FIRES WHEN (read this before changing timing):
 *
 * There is no reliable background wakeup on this stack. `expo-background-
 * task` / `expo-background-fetch` give iOS only OPPORTUNISTIC, coalesced
 * wakeups that are throttled by usage and dead in Low Power Mode — they
 * cannot be trusted to land in a specific evening window, so this file does
 * NOT use them (do not add them here).
 *
 * Instead: `hooks/useNightlyPass.ts` calls `runNightlyPassIfDue` (a) once on
 * mount, (b) on every foreground transition, and (c) on a coarse 5-minute
 * poll while the app stays open. `runNightlyPassIfDue` is a no-op unless
 * `core/nightlyPass.ts#decideNightlyPass` says it's due, which happens:
 *
 *   - Once the app is foregrounded at/after 6pm local time -> prepares
 *     TOMORROW, and fires "Ready for tomorrow" (`services/notifications.ts
 *     #notifyReadyForTomorrow`) immediately if tomorrow ends up with a first
 *     task. The notification fires immediately (not "later that evening")
 *     because the pass itself only runs once the app is already open — there
 *     is nothing else waiting for a scheduled trigger.
 *   - If the evening window was missed ENTIRELY (the app was never
 *     foregrounded after 6pm), the very next time the app opens — even the
 *     next morning — this catches up by preparing TODAY instead, so a
 *     project still gets queued a session for the day in progress rather
 *     than silently losing it.
 *
 * WHAT DOES **NOT** HAPPEN if the user never opens the app: nothing. No task
 * is generated, no recompute runs, no notification fires, until the next time
 * they open Ampora — at which point the catch-up path above runs. This is a
 * deliberate, honestly-scoped limitation, not an oversight: nothing on this
 * stack can reach further than that without a real background-execution
 * entitlement this app does not have.
 *
 * ---------------------------------------------------------------------------
 * IDEMPOTENCY: `runNightlyPassIfDue` is safe to call twice in one evening, or
 * concurrently from two triggers that both fire close together (mount +
 * AppState, say). Three layers:
 *   1. An in-memory re-entrancy guard (`isRunning`) so two overlapping calls
 *      never both do the generation work.
 *   2. `decideNightlyPass`'s persisted `lastTargetDayStart` marker (MMKV) —
 *      once a target day is covered, every subsequent call this same evening
 *      is a no-op before it does anything else.
 *   3. Belt-and-suspenders even if (2) somehow raced: `taskAlreadyGeneratedFor
 *      Day` checks the ACTUAL task list per project before creating anything,
 *      so a duplicate project task can never be created either way.
 */

import { mmkv } from '@/store/mmkv'
import { useTaskStore, selectAllTasks } from '@/store/taskStore'
import { useProjectStore, selectAllProjects } from '@/store/projectStore'
import { useSettingsStore } from '@/store/settingsStore'
import { useScheduleStore, selectBlocksByDay } from '@/store/scheduleStore'
import { generateNextTask } from '@/services/aiProjects'
import { notifyReadyForTomorrow } from '@/services/notifications'
import {
  NIGHTLY_PASS_LAST_RUN_KEY,
  buildGeneratedTaskDraft,
  decideNightlyPass,
  inferLastOutcome,
  readyForTomorrowNotificationId,
  selectActiveProjects,
  taskAlreadyGeneratedForDay,
} from '@/core/nightlyPass'

/** Re-entrancy guard: two near-simultaneous triggers (mount + AppState) must not both run the pass. */
let isRunning = false

function readLastTargetDayStart(): number | null {
  try {
    const raw = mmkv.getString(NIGHTLY_PASS_LAST_RUN_KEY)
    if (raw == null) return null
    const n = Number(raw)
    return Number.isFinite(n) ? n : null
  } catch {
    // A corrupt/missing marker just means "never run" — the safe direction
    // (worst case: it runs again, and the per-project idempotency guard
    // still prevents duplicate tasks).
    return null
  }
}

function writeLastTargetDayStart(targetDayStart: number): void {
  try {
    mmkv.set(NIGHTLY_PASS_LAST_RUN_KEY, String(targetDayStart))
  } catch (err) {
    console.warn('[nightlyPass] could not persist the last-run marker (may re-run next time):', err)
  }
}

/**
 * Run the nightly pass if `core/nightlyPass.ts#decideNightlyPass` says it's
 * due. Safe to call from a timer, an AppState listener, or on mount —
 * repeatedly, concurrently, indefinitely. Never throws; every internal step
 * is individually guarded so one project's AI/fallback call failing never
 * blocks the others, the recompute, or the notification.
 */
export async function runNightlyPassIfDue(now: number = Date.now()): Promise<void> {
  if (isRunning) return
  isRunning = true
  try {
    const lastTarget = readLastTargetDayStart()
    const { shouldRun, targetDayStart } = decideNightlyPass(now, lastTarget)
    if (!shouldRun) return

    const settings = useSettingsStore.getState().settings
    const sessionMin = settings.defaultSessionMin

    // FR-84: every active project emits one normal schedulable Task for the
    // target day. One project's failure (network, a malformed AI response
    // `generateNextTask` couldn't coerce) never blocks the others — it has
    // its own local fallback and never throws by contract, but this is
    // wrapped anyway as defense in depth (never surface an AI failure to the UI).
    const projects = selectActiveProjects(selectAllProjects(useProjectStore.getState()))
    for (const project of projects) {
      try {
        const tasks = selectAllTasks(useTaskStore.getState())
        if (taskAlreadyGeneratedForDay(tasks, project.id, targetDayStart)) continue

        const lastOutcome = inferLastOutcome(tasks, project.id, targetDayStart)
        const generated = await generateNextTask(project, { sessionMin, lastOutcome })
        const draft = buildGeneratedTaskDraft(generated, project.id, targetDayStart)
        useTaskStore.getState().createTask(draft)
      } catch (err) {
        console.warn(`[nightlyPass] session generation failed for project ${project.id}, skipping it:`, err)
      }
    }

    // "Recompute tomorrow specifically" (FR-90): there is no per-day recompute
    // mode in the engine, so this is the ordinary whole-window recompute,
    // which necessarily includes the target day — see
    // `scheduleStore#recomputeTomorrow`'s doc comment for the honest reasoning.
    try {
      useScheduleStore.getState().recomputeTomorrow()
    } catch (err) {
      console.warn('[nightlyPass] recomputeTomorrow failed:', err)
    }

    // Mark this target day covered BEFORE the notification step, so a
    // notification failure can never turn into a retry loop that regenerates
    // tasks (the per-project guard above would still prevent duplicates
    // either way, but there is no reason to redo the work).
    writeLastTargetDayStart(targetDayStart)

    try {
      const blocksForDay = selectBlocksByDay(targetDayStart)(useScheduleStore.getState())
      const firstBlock = [...blocksForDay].sort((a, b) => a.start - b.start)[0]
      const tasksById = useTaskStore.getState().tasks
      const firstTask = firstBlock ? tasksById[firstBlock.taskId] : undefined
      // Only surfaced when there is genuinely something to announce — an
      // empty "Ready for tomorrow" with no task would overpromise (matching
      // TomorrowPlanCard's own "nothing scheduled yet" quiet fallback).
      if (firstTask) {
        await notifyReadyForTomorrow(firstTask.title, readyForTomorrowNotificationId(targetDayStart))
      }
    } catch (err) {
      console.warn('[nightlyPass] "Ready for tomorrow" notification failed silently:', err)
    }
  } catch (err) {
    console.warn('[nightlyPass] runNightlyPassIfDue failed silently:', err)
  } finally {
    isRunning = false
  }
}
