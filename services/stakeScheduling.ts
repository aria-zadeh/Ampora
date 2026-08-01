/**
 * Scheduled-stake notification plumbing (PRD FR-41a, FR-41d, §8.9; ARCH_PLAN
 * A4). Two local notifications per scheduled stake, with stable namespaced
 * identifiers so they cancel individually and never collide with the task
 * reminders in `services/notifications.ts` (`start-`/`deadline-`/
 * `motivation-`/`complete-`):
 *
 *   - `stake-cue-<id>`  at `scheduledAt`                      ("starts now")
 *   - `stake-arm-<id>`  at `scheduledAt + startWindowMin`      ("locks now")
 *
 * plus, for a RECURRING task, a standing `stake-weekly-<taskId>` summary
 * refreshed roughly every 7 days (FR-41d).
 *
 * These notifications are the BEHAVIOURAL CUE, not the enforcement — the
 * in-app wall clock (`store/stakesStore.ts#autoArmDueStakes`, driven by
 * `hooks/useStakeScheduler.ts`) is the source of truth for whether a stake
 * actually arms (ARCH_PLAN A4). On the soft-lock path a backgrounded or
 * killed app cannot arm a shield at all, so on that path these notifications
 * carry the entire behavioural weight — which is why they still get posted
 * even though arming itself waits for the user to return.
 *
 * FR-41a: a stake cue that would land in the user's quiet hours is DROPPED,
 * never shifted — unlike the task reminders in `services/notifications.ts`,
 * which shift to just after quiet hours end. A lock nudge at 2am is exactly
 * what §9.10 forbids. The weekly summary is informational only (nothing
 * arms because of it, and missing it changes nothing about the lock itself),
 * so it shifts like an ordinary reminder rather than being dropped.
 *
 * Graceful degradation throughout: no permission / unsupported platform / any
 * Notifications API failure never throws and never surfaces to the UI,
 * matching `services/notifications.ts`'s existing contract. Stakes are
 * soft-path-only on web (doc `05` §1: "a browser cannot enforce
 * app-blocking"), so every export here no-ops on web.
 */

import * as Notifications from 'expo-notifications'
import { Platform } from 'react-native'
import { isQuietTime, shiftOutOfQuietHours } from '@/services/notifications'
import type { Settings, StakeSession, Task } from '@/types'

const MS_PER_MIN = 60 * 1000
const MS_PER_DAY = 24 * 60 * MS_PER_MIN

/** How often the FR-41d weekly summary re-posts once its predecessor has fired. */
const WEEKLY_SUMMARY_INTERVAL_MS = 7 * MS_PER_DAY

// ---------------------------------------------------------------------------
// Stable, namespaced identifiers
// ---------------------------------------------------------------------------

export function stakeCueId(stakeId: string): string {
  return `stake-cue-${stakeId}`
}
export function stakeArmId(stakeId: string): string {
  return `stake-arm-${stakeId}`
}
export function stakeWeeklySummaryId(taskId: string): string {
  return `stake-weekly-${taskId}`
}

// ---------------------------------------------------------------------------
// Copy (PRD §8.9). The first cue and the weekly summary are verbatim PRD
// lines. There is no PRD line for the SECOND ("grace window closed, locking
// now") notification, so it is authored here in the same warm, non-shaming
// voice — flagged in the delivery report for `01_PRD.md` §8.9 to adopt.
// ---------------------------------------------------------------------------

function cueCopy(title: string, startWindowMin: number): { title: string; body: string } {
  const minutes = Math.max(1, Math.round(startWindowMin))
  return {
    title: 'Starts now',
    body: `"${title}" starts now. Tap to begin, or your apps lock in ${minutes} min.`,
  }
}

function armCopy(title: string): { title: string; body: string } {
  return {
    title: 'Locking in',
    body: `"${title}" locks now. Open Ampora to start your session.`,
  }
}

function weeklySummaryCopy(title: string, scheduledAt: number): { title: string; body: string } {
  let time = ''
  try {
    time = new Date(scheduledAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  } catch {
    time = 'its usual time'
  }
  return {
    title: 'Still on',
    body: `Your daily lock on "${title}" at ${time} is still on. Tap to edit.`,
  }
}

// ---------------------------------------------------------------------------
// Posting
// ---------------------------------------------------------------------------

/**
 * Schedule (or refresh) the notifications for one scheduled stake: the cue at
 * `scheduledAt` plus the "locking in" notice at `scheduledAt + startWindowMin`
 * — or, when there is no start window, a single "locks now" notice at
 * `scheduledAt` (posting both at the identical instant would just be a
 * duplicate). For a recurring task, also ensures the standing weekly summary
 * (FR-41d). Drops (never shifts) anything that would land in quiet hours, and
 * anything already in the past. Never throws.
 */
export async function scheduleStakeCueNotifications(
  session: StakeSession,
  task: Task | undefined,
  settings: Settings
): Promise<void> {
  if (Platform.OS === 'web') return
  if (session.scheduledAt == null) return

  try {
    const title = task?.title ?? 'your task'
    const now = Date.now()
    const startWindowMin = Math.max(0, session.startWindowMin ?? 0)
    const cueAt = session.scheduledAt
    const armAt = session.scheduledAt + startWindowMin * MS_PER_MIN

    type Spec = { identifier: string; fireAt: number; content: Notifications.NotificationContentInput }
    const specs: Spec[] = []

    if (startWindowMin > 0) {
      specs.push({
        identifier: stakeCueId(session.id),
        fireAt: cueAt,
        content: {
          ...cueCopy(title, startWindowMin),
          data: { type: 'stake_cue', taskId: session.taskId, stakeId: session.id },
          sound: true,
        },
      })
      specs.push({
        identifier: stakeArmId(session.id),
        fireAt: armAt,
        content: {
          ...armCopy(title),
          data: { type: 'stake_arm', taskId: session.taskId, stakeId: session.id },
          sound: true,
        },
      })
    } else {
      // No grace window: the cue IS the arm moment. One notification only.
      specs.push({
        identifier: stakeArmId(session.id),
        fireAt: armAt,
        content: {
          ...armCopy(title),
          data: { type: 'stake_arm', taskId: session.taskId, stakeId: session.id },
          sound: true,
        },
      })
    }

    // FR-41a: DROPPED, not shifted. Also drop anything already in the past.
    const toSchedule = specs.filter((s) => s.fireAt > now && !isQuietTime(s.fireAt, settings.quietHours))

    await Promise.allSettled(
      toSchedule.map((s) =>
        Notifications.scheduleNotificationAsync({
          identifier: s.identifier,
          content: s.content,
          trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(s.fireAt) },
        })
      )
    )

    if (task?.recurrence) {
      await ensureWeeklyStakeSummary(session, task, settings)
    }
  } catch (err) {
    console.warn('[stakeScheduling] scheduleStakeCueNotifications failed silently:', err)
  }
}

/**
 * FR-41d weekly summary. Only (re)scheduled when none is currently pending for
 * this task, so a daily-recurring chain (which calls this once per occurrence)
 * does not perpetually push its fire time 7 days further out and never let it
 * fire. Once it actually fires, the NEXT occurrence's call finds none pending
 * and schedules a fresh one — a self-sustaining ~7-day cadence with no extra
 * persisted state. Shifts out of quiet hours (informational only — nothing
 * arms because of it) rather than being dropped, unlike the cue/arm notices.
 */
async function ensureWeeklyStakeSummary(session: StakeSession, task: Task, settings: Settings): Promise<void> {
  const id = stakeWeeklySummaryId(task.id)
  const existing = await Notifications.getAllScheduledNotificationsAsync()
  if (existing.some((n) => n.identifier === id)) return

  const now = Date.now()
  const fireAt = shiftOutOfQuietHours(now + WEEKLY_SUMMARY_INTERVAL_MS, settings.quietHours)
  const copy = weeklySummaryCopy(task.title, session.scheduledAt ?? now)
  await Notifications.scheduleNotificationAsync({
    identifier: id,
    content: { ...copy, data: { type: 'stake_weekly_summary', taskId: task.id }, sound: true },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(fireAt) },
  })
}

// ---------------------------------------------------------------------------
// Cancellation
// ---------------------------------------------------------------------------

/**
 * Cancel one scheduled stake's cue + arm notifications. Safe to call even if
 * only one (or neither) was ever actually scheduled. Never throws.
 */
export async function cancelStakeCueNotifications(stakeId: string): Promise<void> {
  if (Platform.OS === 'web') return
  try {
    await Promise.allSettled([
      Notifications.cancelScheduledNotificationAsync(stakeCueId(stakeId)),
      Notifications.cancelScheduledNotificationAsync(stakeArmId(stakeId)),
    ])
  } catch (err) {
    console.warn('[stakeScheduling] cancelStakeCueNotifications failed silently:', err)
  }
}

/**
 * Cancel a recurring task's standing weekly summary. Exposed for whichever
 * surface lets the user turn a recurring stake off entirely (not called
 * automatically by `cancelStakeCueNotifications`, since cancelling ONE
 * occurrence already stops the auto-reschedule chain that would otherwise
 * keep refreshing it — see `store/stakesStore.ts#maybeRescheduleRecurringStake`).
 * Never throws.
 */
export async function cancelWeeklyStakeSummary(taskId: string): Promise<void> {
  if (Platform.OS === 'web') return
  try {
    await Notifications.cancelScheduledNotificationAsync(stakeWeeklySummaryId(taskId))
  } catch (err) {
    console.warn('[stakeScheduling] cancelWeeklyStakeSummary failed silently:', err)
  }
}
