/**
 * Recovery Mode — pure lapse-detection + rebuild-preview logic (PRD FR-60,
 * §9.5.9, and the FR-16 drop-missed rules). Ampora Phase 6.
 *
 * Recovery is the calm "catch me up" moment after the user falls behind. When
 * they open the app after a lapse (2+ days of missed scheduled blocks, FR-60)
 * we offer to reprioritize by what matters NOW: drop the past-due items that no
 * longer matter, surface the ones that just became urgent, and rebuild the
 * upcoming week around reality. Everything here is a PREVIEW — nothing mutates
 * until the user taps "Rebuild my week."
 *
 * Portability contract (mirrors `core/task-logic.ts`, `core/scheduler/`): this
 * module is pure and deterministic. No react-native / expo / MMKV imports, no
 * store access, and NO direct `Date.now()` — every function that needs "now"
 * takes it as a parameter so the same inputs always produce the same output
 * (testable, and identical on device or server-side).
 *
 * Tone stance (§8.6, FR-60): ZERO shame. We never count misses at the user, we
 * never mention broken streaks. We just clear the decks and move forward.
 */

import type { ScheduledBlock, Task } from '@/types'
import { advanceMissedOccurrence } from '@/core/recurrence'

const MS_PER_MIN = 60 * 1000
const MS_PER_HOUR = 60 * MS_PER_MIN
const MS_PER_DAY = 24 * MS_PER_HOUR

/**
 * A lapse is 2+ distinct days on which a scheduled block was missed (FR-60).
 * Nothing marks blocks 'missed' automatically, so "missed" is derived: a block
 * whose end is in the past and whose status is neither 'done' nor
 * 'in_progress'. Threshold is the number of distinct local days that carry at
 * least one missed block.
 */
const LAPSE_DAY_THRESHOLD = 2

/** slackRatio below this front-loads a task as "now-urgent" on rebuild (§9.5.9). */
const URGENT_SLACK_RATIO = 0.2

// ---------------------------------------------------------------------------
// Small local time + task helpers (kept in-module so this file has no deps
// beyond types, preserving the portability contract).
// ---------------------------------------------------------------------------

/** Local midnight (00:00) of the day containing epoch-ms `t`. */
function startOfDay(t: number): number {
  const d = new Date(t)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

/** A block is "missed" if it ended in the past and was not done/in-progress. */
export function isMissedBlock(block: ScheduledBlock, now: number): boolean {
  if (block.end > now) return false
  return block.status !== 'done' && block.status !== 'in_progress'
}

/** A task is a repeating occurrence if it carries a recurrence rule (FR-15/FR-16). */
function isRepeating(task: Task): boolean {
  return task.recurrence != null
}

/** Remaining work minutes for a task (rolled-up duration minus completed progress). */
function remainingMinutes(task: Task): number {
  return Math.max(0, task.durationMin - task.progressMin)
}

/**
 * Slack ratio for a due-dated task at `now`: available time until the deadline
 * divided by the work still required. < 1 means tighter than the work needs;
 * < URGENT_SLACK_RATIO means effectively no room — front-load it (§9.5.9). A
 * task with no due date, or no remaining work, has effectively infinite slack.
 */
function slackRatio(task: Task, now: number): number {
  if (task.due == null) return Number.POSITIVE_INFINITY
  const remainMin = remainingMinutes(task)
  if (remainMin <= 0) return Number.POSITIVE_INFINITY
  const availableMin = (task.due - now) / MS_PER_MIN
  if (availableMin <= 0) return 0
  return availableMin / remainMin
}

// ---------------------------------------------------------------------------
// Lapse detection (FR-60)
// ---------------------------------------------------------------------------

/**
 * Count the distinct local days that carry at least one missed scheduled block
 * as of `now`. Deterministic given (blocks, now).
 */
export function countMissedDays(blocks: ScheduledBlock[], now: number): number {
  const days = new Set<number>()
  for (const block of blocks) {
    if (isMissedBlock(block, now)) days.add(startOfDay(block.start))
  }
  return days.size
}

/**
 * `detectLapse` — true when the user is behind enough to offer Recovery: 2+
 * distinct days of missed scheduled blocks (FR-60). Pure; deterministic given
 * (blocks, now).
 */
export function detectLapse(blocks: ScheduledBlock[], now: number): boolean {
  return countMissedDays(blocks, now) >= LAPSE_DAY_THRESHOLD
}

/** Total count of currently-missed blocks — powers the "{N} unfinished blocks" banner copy (§8.6). */
export function countMissedBlocks(blocks: ScheduledBlock[], now: number): number {
  let n = 0
  for (const block of blocks) if (isMissedBlock(block, now)) n++
  return n
}

// ---------------------------------------------------------------------------
// Rebuild preview (FR-60, §9.5.9)
// ---------------------------------------------------------------------------

/** Why a past-due item is being proposed for drop (drives preview copy). */
export type DropReason = 'moot_past_due' | 'missed_occurrence'

/**
 * FR-16: how to actually APPLY a `missed_occurrence` drop to a recurring
 * task. A "dropped" recurring occurrence must never delete the whole series —
 * only advance past the missed instance — so this carries what the caller
 * (whoever owns the Recovery apply step) should do instead of the
 * non-recurring `moot_past_due` path's straightforward delete.
 */
export interface RecurringAdvance {
  /** `Task.due` should become this epoch-ms instant. */
  due: number
  /** Preserve (true) vs reset-to-fresh-template (false) progress/subtasks when applying — the carry-forward vs drop-missed split (FR-16). */
  carryForward: boolean
  /** True when the rule has no occurrence left to advance to (until/count exhausted) — apply this drop exactly like `moot_past_due` (delete the task) instead. */
  seriesEnded: boolean
  /**
   * What `RecurrenceRule.count` should become after this advance is applied —
   * threaded straight through from `core/recurrence.ts#MissedAdvance.nextCount`
   * (a drop catch-up may consume several occurrences in one call, so this can
   * decrease by more than 1; a carry-forward advance always decrements by
   * exactly 1). The caller should persist `{ ...task.recurrence, count:
   * nextCount }` alongside `due` — skipping this is what lets a count-limited
   * series ("repeat 10 times") outlive its rule after a Recovery catch-up.
   * Undefined when the rule has no `count` (unbounded, or ended by `until`
   * instead) or when `seriesEnded` is true, since there is nothing to persist
   * either way.
   */
  nextCount?: number
}

/** A task proposed to drop, with a human-readable reason. */
export interface RecoveryDrop {
  task: Task
  reason: DropReason
  /** Present only for `reason === 'missed_occurrence'` — see `RecurringAdvance`. */
  recurringAdvance?: RecurringAdvance
}

/** A task proposed to bump to the front because it just became urgent. */
export interface RecoveryBump {
  task: Task
  slackRatio: number
}

/**
 * The full preview surfaced before any change is applied (FR-60 "shows a
 * preview, accepts in one tap"). `summary` is a single calm sentence.
 */
export interface RecoveryPreview {
  /** Past-due items that no longer matter and will be cleared. */
  drops: RecoveryDrop[]
  /** Tasks that just became urgent and will be pulled to the front. */
  bumps: RecoveryBump[]
  /** How many other upcoming, still-relevant tasks will simply be replanned. */
  rebuildCount: number
  /** One-line, zero-shame summary of the plan. */
  summary: string
}

/**
 * `buildRecoveryPreview` — the deterministic core of Recovery Mode (FR-60,
 * §9.5.9). Given the current tasks, their scheduled blocks, and `now`, decide:
 *
 *  1. DROP — moot past-due items (§9.5.9 "mark moot any past-due, non-recurring
 *     task"). A task is moot when: it is not done, it has a due date strictly in
 *     the past, and it is NOT a repeating occurrence. Missed REPEATING
 *     occurrences are also dropped, but tagged `missed_occurrence` (FR-16
 *     default: drop the missed occurrence, do not stack it onto the next day) —
 *     unless the task opts into carry-forward (`RecurrenceRule.carryForward`).
 *     Either way we only ever advance the recurring series past the missed
 *     instance (`core/recurrence.ts#advanceMissedOccurrence`, surfaced on the
 *     drop as `recurringAdvance`, including the decremented `nextCount` for a
 *     count-limited rule), we never delete the rule itself — deleting the
 *     whole task is reserved for `moot_past_due` (non-recurring) drops.
 *
 *  2. BUMP — tasks that are now-urgent: not done, not being dropped, with a
 *     slackRatio < 0.2 (§9.5.9 "bump now-urgent tasks to front-load").
 *
 *  3. REBUILD — everything else that is still open and auto-scheduled will be
 *     replanned by the engine after the drops/bumps are applied.
 *
 * Pure: never mutates its inputs, never reads a clock. The caller applies the
 * drops (delete/complete) + bumps (raise priority / startAfter) and then runs
 * the scheduler recompute.
 */
export function buildRecoveryPreview(
  tasks: Task[],
  _blocks: ScheduledBlock[],
  now: number
): RecoveryPreview {
  const drops: RecoveryDrop[] = []
  const bumps: RecoveryBump[] = []
  const droppedIds = new Set<string>()

  // Pass 1 — drops. Deterministic order: earliest due first, then by id so the
  // preview is stable across calls with the same inputs.
  const byDueThenId = [...tasks].sort((a, b) => {
    const ad = a.due ?? Number.POSITIVE_INFINITY
    const bd = b.due ?? Number.POSITIVE_INFINITY
    if (ad !== bd) return ad - bd
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
  })

  for (const task of byDueThenId) {
    if (task.status === 'done') continue
    if (task.due == null || task.due >= now) continue // not past-due
    // Past-due and open. Non-recurring -> moot; recurring -> missed occurrence
    // (advance the series past it, per FR-16 drop-vs-carry-forward).
    if (isRepeating(task)) {
      const advance = advanceMissedOccurrence(task.recurrence!, task.due, now)
      drops.push({
        task,
        reason: 'missed_occurrence',
        recurringAdvance: advance
          ? {
              due: advance.due,
              carryForward: advance.carryForward,
              seriesEnded: false,
              nextCount: advance.nextCount,
            }
          : { due: task.due, carryForward: false, seriesEnded: true },
      })
    } else {
      drops.push({ task, reason: 'moot_past_due' })
    }
    droppedIds.add(task.id)
  }

  // Pass 2 — bumps. Open, auto-scheduled, not dropped, now-urgent.
  for (const task of byDueThenId) {
    if (task.status === 'done') continue
    if (droppedIds.has(task.id)) continue
    if (!task.autoSchedule) continue
    const ratio = slackRatio(task, now)
    if (ratio < URGENT_SLACK_RATIO) {
      bumps.push({ task, slackRatio: ratio })
    }
  }
  // Front-load tightest-slack first.
  bumps.sort((a, b) => a.slackRatio - b.slackRatio)

  // Pass 3 — rebuild count: remaining open, auto-scheduled, not dropped, not
  // already counted as a bump.
  const bumpIds = new Set(bumps.map((b) => b.task.id))
  let rebuildCount = 0
  for (const task of tasks) {
    if (task.status === 'done') continue
    if (droppedIds.has(task.id)) continue
    if (bumpIds.has(task.id)) continue
    if (!task.autoSchedule) continue
    rebuildCount++
  }

  return {
    drops,
    bumps,
    rebuildCount,
    summary: buildSummary(drops.length, bumps.length, rebuildCount),
  }
}

/**
 * Compose the one-line, zero-shame preview summary. Never mentions misses,
 * streaks, or blame — only what happens next.
 */
function buildSummary(dropCount: number, bumpCount: number, rebuildCount: number): string {
  const parts: string[] = []
  if (dropCount > 0) {
    parts.push(`clear ${dropCount} thing${dropCount === 1 ? '' : 's'} that no longer matter`)
  }
  if (bumpCount > 0) {
    parts.push(`move ${bumpCount} up front`)
  }
  if (rebuildCount > 0) {
    parts.push(`replan the rest of your week`)
  }

  if (parts.length === 0) {
    return "You're already on track — nothing to clear."
  }

  // Join naturally: "A", "A and B", "A, B, and C".
  let joined: string
  if (parts.length === 1) {
    joined = parts[0]
  } else if (parts.length === 2) {
    joined = `${parts[0]} and ${parts[1]}`
  } else {
    joined = `${parts.slice(0, -1).join(', ')}, and ${parts[parts.length - 1]}`
  }

  // Capitalize the first letter.
  return `I'll ${joined}.`
}

// ---------------------------------------------------------------------------
// Applying a drop (FR-60 "accepts in one tap" + the FR-16 apply step)
// ---------------------------------------------------------------------------

/**
 * Resolve ONE `RecoveryDrop` against its current, freshly-loaded task,
 * producing the Task to persist — or `null` to mean "delete this task".
 * `buildRecoveryPreview` only PREVIEWS; this is the piece that decides what
 * applying a preview actually does, so the caller
 * (`store/taskStore.ts#applyRecoveryDrop`) has exactly one place to call
 * rather than a second hand-rolled path that can drift out of sync.
 *
 * - `moot_past_due` (always non-recurring): always `null`. The task is
 *   genuinely done-with; nothing else depends on keeping it around.
 * - `missed_occurrence` whose `recurringAdvance.seriesEnded` is true: also
 *   `null` — the rule has no occurrence left to advance to (`until`/`count`
 *   exhausted), so — per `core/recurrence.ts#advanceMissedOccurrence`'s own
 *   contract — it is treated exactly like a finished one-off.
 * - `missed_occurrence` otherwise: NEVER `null`. This is the data-loss fix:
 *   the series continues. Returns `task` rolled to `recurringAdvance.due`,
 *   with `recurrence.count` updated to `nextCount` when the rule tracks one
 *   (an undefined `nextCount` means "nothing to persist" — the rule is
 *   either unbounded or the series ended; see `RecurringAdvance`'s own
 *   tsdoc). `carryForward` true PRESERVES progress and the subtask checklist
 *   exactly as they stand (the missed work is due next, not discarded);
 *   `carryForward` false (the FR-16 default) resets to a fresh occurrence —
 *   every subtask's `completedAt` cleared, `progressMin` back to 0, the
 *   First move reset to not-done, `status` back to `'todo'` — the same
 *   "fresh copy of the template" contract a genuine completion rollover uses
 *   (`core/recurrence.ts#rollToNextOccurrence`, doc `03` §2.9), because an
 *   abandoned occurrence deserves the same fresh start as a finished one,
 *   never a stale half-checked list bleeding into a new due date.
 *
 * Pure: never mutates `task`, never reads a clock — `now` only stamps
 * `updatedAt`. Only `drop.reason` / `drop.recurringAdvance` are consulted;
 * `drop.task` (a preview-time snapshot) is deliberately never read here —
 * the caller passes the CURRENT task explicitly so a drop applied slightly
 * after the preview was built still lands on live data, not a stale echo.
 */
export function applyRecoveryDrop(task: Task, drop: RecoveryDrop, now: number): Task | null {
  if (drop.reason === 'moot_past_due') return null

  const advance = drop.recurringAdvance
  if (!advance || advance.seriesEnded) return null

  const rule = task.recurrence
  const nextRule = rule && advance.nextCount !== undefined ? { ...rule, count: advance.nextCount } : rule

  if (advance.carryForward) {
    return { ...task, due: advance.due, recurrence: nextRule, updatedAt: now }
  }

  // Drop (default): fresh occurrence, exactly like a genuine-completion rollover.
  return {
    ...task,
    due: advance.due,
    recurrence: nextRule,
    status: 'todo',
    completedAt: undefined,
    progressMin: 0,
    subtasks: task.subtasks.map((s) => ({ ...s, completedAt: undefined })),
    firstMove: task.firstMove ? { ...task.firstMove, done: false } : task.firstMove,
    updatedAt: now,
  }
}

/** Exposed for tests / callers that need the same thresholds. */
export const RECOVERY_CONSTANTS = {
  LAPSE_DAY_THRESHOLD,
  URGENT_SLACK_RATIO,
  MS_PER_DAY,
  MS_PER_HOUR,
} as const
