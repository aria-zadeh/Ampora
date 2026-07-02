/**
 * Ampora notification service — Phase 6 (PRD FR-63, §8.9), rebuilt on the NEW
 * data model (`Task` with epoch-ms `due` + `subtasks[].completedAt` + status
 * 'todo'|'doing'|'done'; `Settings` with `quietHours` as a minutes-from-
 * midnight `TimeWindow`, `maxNotificationsPerHour`, `energyPeak`).
 *
 * Design principles (binding):
 *  - Warm, encouraging, NEVER-shaming copy (§8.9). We nudge, we don't nag.
 *  - Rate limited. Baseline max 1 reminder/hour (settings.maxNotificationsPerHour).
 *    Urgency raises the ceiling: due < 12h -> up to 1/30min; due < 2h -> up to
 *    1/20min. At most 3 START reminders per day per task.
 *  - Quiet hours respected (settings.quietHours, wraps midnight, auto-release).
 *  - Four kinds: Start Reminder, Deadline Approaching, Motivation Nudge,
 *    Completion Celebrate.
 *  - Graceful degradation: no permission / unsupported platform -> no-op, never
 *    throws, never surfaces errors to the user.
 *  - Web: uses the Notifications API where available (immediate, for reminders
 *    that are due right now); no-ops when unavailable.
 */

import * as Notifications from 'expo-notifications'
import { Platform } from 'react-native'
import type { Settings, Task, TimeWindow } from '@/types'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MS_PER_MIN = 60 * 1000
const MS_PER_HOUR = 60 * MS_PER_MIN
const MS_PER_DAY = 24 * MS_PER_HOUR

/** Only tasks due within this horizon get scheduled reminders. */
const HORIZON_MS = 7 * MS_PER_DAY

/** Absolute cap on start reminders per task per day (§8.9 anti-nag rule). */
const MAX_START_REMINDERS_PER_TASK_PER_DAY = 3

/** Minimum spacing between any two scheduled notifications, by urgency (minutes). */
const SPACING_BASELINE_MIN = 60
const SPACING_DUE_SOON_MIN = 30 // due < 12h
const SPACING_DUE_IMMINENT_MIN = 20 // due < 2h

// ---------------------------------------------------------------------------
// Copy (§8.9) — warm, specific, never shaming.
// ---------------------------------------------------------------------------

interface Copy {
  title: string
  body: string
}

function startReminderCopy(task: Task, firstStep: string): Copy {
  return {
    title: 'Ready for a first move?',
    body: `"${task.title}" — try just this: ${firstStep}. Two minutes, that's it.`,
  }
}

function deadlineCopy(task: Task, whenLabel: string): Copy {
  return {
    title: 'Heads up — due ' + whenLabel,
    body: `"${task.title}" is coming up. A small start now makes the rest easy. You've got this.`,
  }
}

function motivationCopy(task: Task, firstStep: string): Copy {
  return {
    title: 'Still here when you are',
    body: `No rush — "${task.title}" is waiting. Want to try: ${firstStep}?`,
  }
}

function completionCopy(task: Task): Copy {
  return {
    title: 'Nice — that one is done',
    body: `You finished "${task.title}". That's a real win. Take the credit.`,
  }
}

// ---------------------------------------------------------------------------
// Permissions
// ---------------------------------------------------------------------------

/**
 * Request notification permission once. Returns true if granted. Never throws.
 * On web, requests the browser Notifications API permission (must be called
 * from a user gesture). KEPT — onboarding imports this.
 */
export async function requestNotificationPermissions(): Promise<boolean> {
  if (Platform.OS === 'web') {
    return requestWebPermission()
  }
  try {
    const { status: existing } = await Notifications.getPermissionsAsync()
    if (existing === 'granted') return true
    const { status } = await Notifications.requestPermissionsAsync()
    return status === 'granted'
  } catch (err) {
    console.warn('[Notifications] permission request failed:', err)
    return false
  }
}

async function requestWebPermission(): Promise<boolean> {
  try {
    if (typeof window === 'undefined' || !('Notification' in window)) return false
    if (Notification.permission === 'granted') return true
    if (Notification.permission === 'denied') return false
    const result = await Notification.requestPermission()
    return result === 'granted'
  } catch {
    return false
  }
}

/**
 * Read-only permission check — never prompts. Used by the Settings screen to
 * decide whether to show the one-time "notifications are off" nudge, so
 * opening Settings never itself triggers an OS/browser permission dialog.
 * Returns 'unsupported' on platforms/environments where the check can't run
 * (treated the same as 'granted' by callers — never nudge for something the
 * user can't act on).
 */
export async function getNotificationPermissionStatus(): Promise<
  'granted' | 'denied' | 'undetermined' | 'unsupported'
> {
  if (Platform.OS === 'web') {
    try {
      if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported'
      if (Notification.permission === 'granted') return 'granted'
      if (Notification.permission === 'denied') return 'denied'
      return 'undetermined'
    } catch {
      return 'unsupported'
    }
  }
  try {
    const { status } = await Notifications.getPermissionsAsync()
    if (status === 'granted') return 'granted'
    if (status === 'denied') return 'denied'
    return 'undetermined'
  } catch {
    return 'unsupported'
  }
}

// ---------------------------------------------------------------------------
// Quiet-hours helpers (TimeWindow = minutes-from-midnight, may wrap midnight)
// ---------------------------------------------------------------------------

/** True if epoch-ms `t` falls inside the quiet-hours window (auto-release outside it). */
export function isQuietTime(t: number, quiet: TimeWindow): boolean {
  const d = new Date(t)
  const min = d.getHours() * 60 + d.getMinutes()
  if (quiet.start === quiet.end) return false // empty window
  if (quiet.start < quiet.end) {
    // Same-day window, e.g. 13:00-14:00.
    return min >= quiet.start && min < quiet.end
  }
  // Wraps midnight, e.g. 23:00-08:00.
  return min >= quiet.start || min < quiet.end
}

/**
 * Push a candidate time out of quiet hours to the next moment quiet hours end.
 * Returns the adjusted epoch ms. If not in quiet hours, returns `t` unchanged.
 */
function shiftOutOfQuietHours(t: number, quiet: TimeWindow): number {
  if (!isQuietTime(t, quiet)) return t
  const d = new Date(t)
  const endHour = Math.floor(quiet.end / 60)
  const endMin = quiet.end % 60
  // If we're past today's quiet-end already (because the window wraps), the end
  // is tomorrow only when start<end and we're before end; simplest correct move
  // is: set to quiet.end today, and if that's still <= t, add a day.
  d.setHours(endHour, endMin, 0, 0)
  let adjusted = d.getTime()
  if (adjusted <= t) adjusted += MS_PER_DAY
  return adjusted
}

// ---------------------------------------------------------------------------
// Rate limiting
// ---------------------------------------------------------------------------

/** Required spacing (ms) at a given fire time based on how soon the task is due. */
function requiredSpacingMs(fireAt: number, dueMs: number | undefined, settings: Settings): number {
  const baseMin = Math.max(1, Math.round(60 / Math.max(1, settings.maxNotificationsPerHour)))
  if (dueMs == null) return Math.max(baseMin, SPACING_BASELINE_MIN) * MS_PER_MIN
  const hoursToDue = (dueMs - fireAt) / MS_PER_HOUR
  if (hoursToDue < 2) return SPACING_DUE_IMMINENT_MIN * MS_PER_MIN
  if (hoursToDue < 12) return SPACING_DUE_SOON_MIN * MS_PER_MIN
  return Math.max(baseMin, SPACING_BASELINE_MIN) * MS_PER_MIN
}

/**
 * Greedy rate limiter over a batch of candidate specs (sorted by fire time):
 * accepts a spec only if it is far enough after the last ACCEPTED one for its
 * urgency, and if it does not exceed the per-task-per-day start-reminder cap.
 */
function applyRateLimits(specs: NotificationSpec[], settings: Settings): NotificationSpec[] {
  const sorted = [...specs].sort((a, b) => a.fireAt - b.fireAt)
  const accepted: NotificationSpec[] = []
  let lastAcceptedAt = -Infinity
  const startCountByTaskDay = new Map<string, number>()

  for (const spec of sorted) {
    const spacing = requiredSpacingMs(spec.fireAt, spec.dueMs, settings)
    if (spec.fireAt - lastAcceptedAt < spacing) continue

    if (spec.kind === 'start') {
      const dayKey = `${spec.taskId}:${startOfDay(spec.fireAt)}`
      const count = startCountByTaskDay.get(dayKey) ?? 0
      if (count >= MAX_START_REMINDERS_PER_TASK_PER_DAY) continue
      startCountByTaskDay.set(dayKey, count + 1)
    }

    accepted.push(spec)
    lastAcceptedAt = spec.fireAt
  }
  return accepted
}

// ---------------------------------------------------------------------------
// Task helpers (new model)
// ---------------------------------------------------------------------------

function isDone(task: Task): boolean {
  return task.status === 'done'
}

/** First incomplete subtask title, else the firstMove text, else a gentle default. */
function firstStepHint(task: Task): string {
  const nextSub = task.subtasks.find((s) => s.completedAt == null)
  if (nextSub) return nextSub.title
  if (task.firstMove?.text) return task.firstMove.text
  return 'open it and read the first line'
}

/** "today" / "tomorrow" / "soon" label for a due instant relative to now. */
function dueLabel(dueMs: number, now: number): string {
  const days = Math.floor((startOfDay(dueMs) - startOfDay(now)) / MS_PER_DAY)
  if (days <= 0) return 'today'
  if (days === 1) return 'tomorrow'
  return 'soon'
}

function startOfDay(t: number): number {
  const d = new Date(t)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

// ---------------------------------------------------------------------------
// Spec building
// ---------------------------------------------------------------------------

type NotificationKind = 'start' | 'deadline' | 'motivation'

interface NotificationSpec {
  identifier: string
  taskId: string
  kind: NotificationKind
  /** Epoch ms the notification should fire. */
  fireAt: number
  /** The task's due instant (epoch ms), for urgency-based rate limiting. */
  dueMs?: number
  content: Notifications.NotificationContentInput
}

/** Build candidate specs for a single task (pre-rate-limit, pre-quiet-shift). */
function buildSpecsForTask(task: Task, settings: Settings, now: number): NotificationSpec[] {
  if (isDone(task) || task.due == null) return []
  const dueMs = task.due
  if (dueMs < now || dueMs > now + HORIZON_MS) return []

  const specs: NotificationSpec[] = []
  const hoursToDue = (dueMs - now) / MS_PER_HOUR
  const firstStep = firstStepHint(task)

  // Per-kind toggles (PRD FR-65) — missing key reads as enabled so existing
  // persisted Settings keep today's behavior until the user opts out.
  const kinds = settings.reminderKinds
  const startEnabled = kinds?.start !== false
  const deadlineEnabled = kinds?.deadline !== false
  const motivationEnabled = kinds?.motivation !== false

  // Start reminder: at the user's energy-peak start, on the next day that peak
  // occurs, when the deadline is comfortably far out (> 12h).
  if (startEnabled && hoursToDue > 12) {
    const startAt = nextEnergyPeak(settings.energyPeak, now)
    if (startAt < dueMs) {
      const copy = startReminderCopy(task, firstStep)
      specs.push({
        identifier: `start-${task.id}`,
        taskId: task.id,
        kind: 'start',
        fireAt: startAt,
        dueMs,
        content: notifContent(task, 'start_reminder', copy),
      })
    }
  }

  // Deadline approaching: 12h before the deadline (if that's still in the future).
  const deadlineFireAt = dueMs - 12 * MS_PER_HOUR
  if (deadlineEnabled && deadlineFireAt > now) {
    const copy = deadlineCopy(task, dueLabel(dueMs, deadlineFireAt))
    specs.push({
      identifier: `deadline-${task.id}`,
      taskId: task.id,
      kind: 'deadline',
      fireAt: deadlineFireAt,
      dueMs,
      content: notifContent(task, 'deadline_approaching', copy),
    })
  }

  // Motivation nudge: if the task hasn't been touched in 24h, gently nudge at
  // the next energy peak (only for not-yet-started work).
  if (motivationEnabled && task.status === 'todo' && now - task.updatedAt > 24 * MS_PER_HOUR) {
    const nudgeAt = nextEnergyPeak(settings.energyPeak, now)
    if (nudgeAt < dueMs) {
      const copy = motivationCopy(task, firstStep)
      specs.push({
        identifier: `motivation-${task.id}`,
        taskId: task.id,
        kind: 'motivation',
        fireAt: nudgeAt,
        dueMs,
        content: notifContent(task, 'motivation_nudge', copy),
      })
    }
  }

  return specs
}

function notifContent(
  task: Task,
  type: string,
  copy: Copy,
): Notifications.NotificationContentInput {
  return {
    title: copy.title,
    body: copy.body,
    data: { taskId: task.id, type },
    sound: true,
  }
}

/** Next occurrence of the energy-peak start (epoch ms), today if still ahead, else tomorrow. */
function nextEnergyPeak(peak: TimeWindow, now: number): number {
  const d = new Date(now)
  d.setHours(Math.floor(peak.start / 60), peak.start % 60, 0, 0)
  let t = d.getTime()
  if (t <= now) t += MS_PER_DAY
  return t
}

// ---------------------------------------------------------------------------
// Web fallback
// ---------------------------------------------------------------------------

const shownWebTags = new Set<string>()

function showWebNotification(title: string, body: string, tag: string): void {
  try {
    if (typeof window === 'undefined' || !('Notification' in window)) return
    if (Notification.permission !== 'granted') return
    if (shownWebTags.has(tag)) return
    shownWebTags.add(tag)
    new Notification(title, { body, tag })
  } catch {
    // Web notifications may be blocked — silent.
  }
}

/**
 * Web has no OS-level scheduling; fire any reminder whose time is within a
 * short window of NOW. Call on an interval (e.g. every 60s) while the app is
 * open on web. Respects quiet hours. No-op if unsupported / not permitted.
 */
export function checkAndFireWebReminders(tasks: Task[], settings: Settings): void {
  if (typeof window === 'undefined' || !('Notification' in window)) return
  if (Notification.permission !== 'granted') return

  const now = Date.now()
  const WINDOW_MS = 90 * 1000
  for (const task of tasks) {
    const specs = buildSpecsForTask(task, settings, now)
    for (const spec of specs) {
      if (Math.abs(spec.fireAt - now) > WINDOW_MS) continue
      if (isQuietTime(spec.fireAt, settings.quietHours)) continue
      const title = String(spec.content.title ?? 'Ampora')
      const body = String(spec.content.body ?? '')
      showWebNotification(title, body, `${spec.identifier}-${startOfDay(now)}`)
    }
  }
}

// ---------------------------------------------------------------------------
// Main scheduling entry point
// ---------------------------------------------------------------------------

/**
 * Cancel existing scheduled reminders and schedule a fresh, rate-limited,
 * quiet-hours-respecting batch from the current tasks + settings. Warm copy,
 * never shaming. Never throws; logs and returns on any error.
 *
 * On web, delegates to the immediate `checkAndFireWebReminders` (OS scheduling
 * is unavailable in the browser).
 */
export async function scheduleTaskReminders(tasks: Task[], settings: Settings): Promise<void> {
  if (Platform.OS === 'web') {
    checkAndFireWebReminders(tasks, settings)
    return
  }

  try {
    await Notifications.cancelAllScheduledNotificationsAsync()

    const now = Date.now()
    let candidates: NotificationSpec[] = []
    for (const task of tasks) {
      candidates = candidates.concat(buildSpecsForTask(task, settings, now))
    }

    // Shift any candidate out of quiet hours, drop ones that would land past the
    // task's deadline after shifting, then rate-limit the survivors.
    const shifted = candidates
      .map((spec) => ({ ...spec, fireAt: shiftOutOfQuietHours(spec.fireAt, settings.quietHours) }))
      .filter((spec) => spec.fireAt > now && (spec.dueMs == null || spec.fireAt < spec.dueMs))

    const finalSpecs = applyRateLimits(shifted, settings)

    await Promise.allSettled(
      finalSpecs.map((spec) =>
        Notifications.scheduleNotificationAsync({
          identifier: spec.identifier,
          content: spec.content,
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DATE,
            date: new Date(spec.fireAt),
          },
        }),
      ),
    )
  } catch (err) {
    console.warn('[Notifications] scheduleTaskReminders failed silently:', err)
  }
}

/**
 * Fire a "Completion Celebrate" notification immediately for a just-finished
 * task (§8.9). The single celebratory beat — warm, brief. Native only fires an
 * immediate local notification; web uses the Notifications API. Never throws.
 */
export async function celebrateCompletion(task: Task): Promise<void> {
  const copy = completionCopy(task)
  if (Platform.OS === 'web') {
    showWebNotification(copy.title, copy.body, `complete-${task.id}`)
    return
  }
  try {
    await Notifications.scheduleNotificationAsync({
      identifier: `complete-${task.id}`,
      content: { title: copy.title, body: copy.body, data: { taskId: task.id, type: 'completion_celebrate' }, sound: true },
      trigger: null, // fire now
    })
  } catch (err) {
    console.warn('[Notifications] celebrateCompletion failed silently:', err)
  }
}

// ---------------------------------------------------------------------------
// Cancellation
// ---------------------------------------------------------------------------

/** Cancel all scheduled Ampora notifications. Never throws. */
export async function cancelAll(): Promise<void> {
  if (Platform.OS === 'web') return
  try {
    await Notifications.cancelAllScheduledNotificationsAsync()
  } catch (err) {
    console.warn('[Notifications] cancelAll failed silently:', err)
  }
}

/** Back-compat alias for the previous export name. */
export const cancelAllReminders = cancelAll
