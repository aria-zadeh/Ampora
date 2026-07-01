/**
 * 9.5.5 Color-coding (deadline slack) + the underlying slack utility.
 *
 * slackRatio = (minutesUntilDue - remainingMinutes) / max(minutesUntilDue, 1)
 *   green  if slackRatio > 0.5
 *   amber  if 0.2 <= slackRatio <= 0.5
 *   red    if slackRatio < 0.2, or overdue
 *
 * Pure; `now` is passed explicitly.
 */

import type { Task } from '@/types'
import { MS_PER_MIN, type SlackColor } from './types'

/** Remaining work minutes for a task (duration minus progress, floored at 0). */
export function remainingMinutes(task: Task): number {
  return Math.max(0, task.durationMin - (task.progressMin ?? 0))
}

/**
 * Deadline slack ratio (PRD §9.5.5). Returns a number that is:
 *  - negative/small when work is tight or overdue,
 *  - large (up to ~1) when there's plenty of runway.
 * For an undated task there is no deadline pressure → returns +Infinity so
 * callers treat it as maximally slack (green).
 */
export function slackRatio(task: Task, now: number): number {
  if (task.due == null) return Number.POSITIVE_INFINITY
  const minutesUntilDue = (task.due - now) / MS_PER_MIN
  if (minutesUntilDue <= 0) return Number.NEGATIVE_INFINITY // overdue
  const remaining = remainingMinutes(task)
  return (minutesUntilDue - remaining) / Math.max(minutesUntilDue, 1)
}

/** Slack color per PRD §9.5.5 (also surfaced as icon/label for a11y). */
export function slackColor(task: Task, now: number): SlackColor {
  const ratio = slackRatio(task, now)
  if (ratio === Number.POSITIVE_INFINITY) return 'green'
  if (task.due != null && task.due <= now) return 'red' // overdue
  if (ratio > 0.5) return 'green'
  if (ratio >= 0.2) return 'amber'
  return 'red'
}

/** True when a task is "near/over due" and should be forced to front-load (PRD §9.5.3). */
export function isNearOrOverDue(task: Task, now: number): boolean {
  const ratio = slackRatio(task, now)
  if (ratio === Number.POSITIVE_INFINITY) return false
  return ratio < 0.2 // includes overdue (-Infinity)
}
