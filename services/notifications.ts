/**
 * Ampora notification service — PRD §4.3
 *
 * Scheduling philosophy:
 *  - Warm, encouraging copy (not nagging)
 *  - Rate-limited per task and globally
 *  - Respects quiet hours and busy blocks
 *  - Graceful degradation when permissions denied
 */

import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import type { Task, UserSettings, DayKey, PeriodKey, BusyBlock } from "@/types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const HOURS = 60 * 60 * 1000; // ms per hour
const SEVEN_DAYS_MS = 7 * 24 * HOURS;

/** Period time ranges (hour, 24h) */
const PERIOD_RANGES: Record<PeriodKey, [number, number]> = {
  morning: [8, 12],
  afternoon: [12, 17],
  evening: [17, 21],
};

/** Map JS Date.getDay() (0=Sun) to DayKey */
const JS_DAY_TO_KEY: DayKey[] = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

// ---------------------------------------------------------------------------
// Web Notifications (iOS Safari 16.4+, Chrome, etc.)
// ---------------------------------------------------------------------------

/** Track which notification IDs have been shown this session to avoid duplicates */
const shownWebNotifications = new Set<string>();

/**
 * Request web notification permission. Must be called from a user gesture.
 * Returns true if granted.
 */
export async function requestWebNotificationPermission(): Promise<boolean> {
  try {
    if (typeof window === "undefined" || !("Notification" in window)) return false;
    if (Notification.permission === "granted") return true;
    const result = await Notification.requestPermission();
    return result === "granted";
  } catch {
    return false;
  }
}

/** Show a web notification immediately. */
function showWebNotification(title: string, body: string, tag: string): void {
  try {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    if (Notification.permission !== "granted") return;
    if (shownWebNotifications.has(tag)) return;
    shownWebNotifications.add(tag);
    new Notification(title, { body, icon: "/favicon.ico", tag });
  } catch {
    // Silent — web notifications may be blocked
  }
}

// ---------------------------------------------------------------------------
// Permissions
// ---------------------------------------------------------------------------

/**
 * Request push notification permissions once.
 * Returns true if granted. Never crashes on denial.
 */
export async function requestNotificationPermissions(): Promise<boolean> {
  if (Platform.OS === "web") {
    return requestWebNotificationPermission();
  }
  try {
    const { status: existing } = await Notifications.getPermissionsAsync();
    if (existing === "granted") return true;

    const { status } = await Notifications.requestPermissionsAsync();
    if (status !== "granted") {
      console.log("[Notifications] Permission not granted — notifications disabled.");
      return false;
    }
    return true;
  } catch (err) {
    console.warn("[Notifications] Permission request failed silently:", err);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Busy-block helpers
// ---------------------------------------------------------------------------

function dateToDayKey(date: Date): DayKey {
  return JS_DAY_TO_KEY[date.getDay()];
}

function dateToPeriodKey(date: Date): PeriodKey | null {
  const h = date.getHours();
  for (const [period, [start, end]] of Object.entries(PERIOD_RANGES) as [
    PeriodKey,
    [number, number]
  ][]) {
    if (h >= start && h < end) return period;
  }
  return null; // outside defined periods (e.g. late night)
}

function isBusyTime(date: Date, busyBlocks: BusyBlock[]): boolean {
  const day = dateToDayKey(date);
  const period = dateToPeriodKey(date);
  if (!period) return false; // outside defined periods — not busy
  return busyBlocks.some((b) => b.day === day && b.period === period);
}

// ---------------------------------------------------------------------------
// Quiet hours helpers
// ---------------------------------------------------------------------------

/**
 * Returns true if the given date falls within quiet hours.
 * Quiet hours wrap midnight (e.g. 23:00 → 08:00).
 */
function isQuietTime(
  date: Date,
  quietHoursStart: number,
  quietHoursEnd: number
): boolean {
  const h = date.getHours();
  if (quietHoursStart < quietHoursEnd) {
    // Normal range (e.g. 22:00 → 06:00 won't happen here, but handle it)
    return h >= quietHoursStart || h < quietHoursEnd;
  }
  // Wraps midnight: start > end (e.g. 23 → 8)
  return h >= quietHoursStart || h < quietHoursEnd;
}

// ---------------------------------------------------------------------------
// Time candidate helpers
// ---------------------------------------------------------------------------

/**
 * Given a preferred hour (24h), find the next Date at that hour that is:
 * - In the future
 * - Not in quiet hours
 * - Not in a busy block
 *
 * If the preferred slot is unavailable, nudge forward by 1 hour up to 12 times.
 * Returns null if no suitable slot found.
 */
function findAvailableSlot(
  preferredDate: Date,
  settings: UserSettings,
  maxAttempts = 12
): Date | null {
  let candidate = new Date(preferredDate);
  const now = Date.now();

  for (let i = 0; i < maxAttempts; i++) {
    if (
      candidate.getTime() > now &&
      !isQuietTime(candidate, settings.quietHoursStart, settings.quietHoursEnd) &&
      !isBusyTime(candidate, settings.busyBlocks)
    ) {
      return candidate;
    }
    // Nudge forward by 1 hour
    candidate = new Date(candidate.getTime() + HOURS);
  }
  return null;
}

// ---------------------------------------------------------------------------
// Notification builders
// ---------------------------------------------------------------------------

interface NotificationSpec {
  identifier: string;
  content: Notifications.NotificationContentInput;
  trigger: Notifications.NotificationTriggerInput;
}

/**
 * Build a "Start Reminder" notification for a task.
 * Scheduled at 3pm (or energyPeakStart) on the day before the due date,
 * provided the due date is >12 hours away.
 */
function buildStartReminder(task: Task, settings: UserSettings): NotificationSpec | null {
  const dueMs = new Date(task.dueDate).getTime();
  const hoursUntilDue = (dueMs - Date.now()) / HOURS;

  if (hoursUntilDue <= 12) return null; // too close — deadline notification handles this

  // Target: energyPeakStart hour (default 15 / 3pm) on today or tomorrow
  const preferredHour = settings.energyPeakStart ?? 15;
  const now = new Date();
  const preferred = new Date(now);
  preferred.setHours(preferredHour, 0, 0, 0);

  // If that slot is in the past today, move to tomorrow
  if (preferred.getTime() <= now.getTime()) {
    preferred.setDate(preferred.getDate() + 1);
  }

  // Don't schedule a start reminder that fires after the deadline
  if (preferred.getTime() >= dueMs) return null;

  const slot = findAvailableSlot(preferred, settings);
  if (!slot) return null;

  const relativeDue = hoursUntilDue < 24 ? "today" : "tomorrow";

  return {
    identifier: `start-reminder-${task.id}`,
    content: {
      title: "Hey — time to get started",
      body: `${task.title} is due ${relativeDue}. Want to do the first step? It only takes 5 min.`,
      data: { taskId: task.id, type: "start_reminder" },
      sound: true,
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: slot,
    },
  };
}

/**
 * Build a "Deadline Approaching" notification.
 * Fires 12 hours before the due date, using the first subtask title when available.
 */
function buildDeadlineReminder(task: Task, settings: UserSettings): NotificationSpec | null {
  const dueMs = new Date(task.dueDate).getTime();
  const triggerMs = dueMs - 12 * HOURS;

  if (triggerMs <= Date.now()) return null; // already past the 12h window

  const triggerDate = new Date(triggerMs);
  const slot = findAvailableSlot(triggerDate, settings);
  if (!slot) return null;

  const firstIncompleteSubtask = task.subtasks.find((s) => !s.isComplete);
  const stepHint = firstIncompleteSubtask?.title ?? "the first step";

  return {
    identifier: `deadline-reminder-${task.id}`,
    content: {
      title: "Heads up — due soon",
      body: `${task.title} is due tomorrow. You've got this — start with ${stepHint}.`,
      data: { taskId: task.id, type: "deadline_reminder" },
      sound: true,
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: slot,
    },
  };
}

/**
 * Build a "Best Time to Start" notification for a task with a proposed schedule.
 * Fires 15 minutes before the proposed time, if the proposed time is in the future.
 */
function buildBestTimeReminder(task: Task, settings: UserSettings): NotificationSpec | null {
  // Only for tasks with a proposed (not yet confirmed) schedule
  if (task.scheduleStatus !== "proposed" || !task.proposedTime) return null;

  const proposedMs = new Date(task.proposedTime).getTime();
  const triggerMs = proposedMs - 15 * 60 * 1000; // 15 minutes before

  if (triggerMs <= Date.now()) return null; // already past

  const triggerDate = new Date(triggerMs);

  // Respect quiet hours — skip if notification would fire during quiet time
  if (isQuietTime(triggerDate, settings.quietHoursStart, settings.quietHoursEnd)) {
    return null;
  }

  // Respect busy blocks
  if (isBusyTime(triggerDate, settings.busyBlocks)) {
    return null;
  }

  return {
    identifier: `best-time-${task.id}`,
    content: {
      title: "Good time to start!",
      body: `You usually follow through at this time \u2014 start ${task.title} now?`,
      data: { taskId: task.id, type: "best_time_reminder" },
      sound: true,
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: triggerDate,
    },
  };
}

/**
 * Build a "Motivation Nudge" for tasks with no interaction in 24+ hours.
 * PRD section 4.3.2: "Haven't touched [task] in a day. Here's a small step to get going."
 */
function buildMotivationNudge(task: Task, settings: UserSettings): NotificationSpec | null {
  if (task.status === "complete") return null;

  const lastInteraction = new Date(task.updatedAt).getTime();
  const hoursSinceInteraction = (Date.now() - lastInteraction) / HOURS;

  if (hoursSinceInteraction < 24) return null; // Interacted recently

  // Don't nudge for tasks due in the past
  if (new Date(task.dueDate).getTime() < Date.now()) return null;

  // Find a good time to deliver
  const now = new Date();
  const preferredHour = settings.energyPeakStart ?? 15;
  const preferred = new Date(now);
  preferred.setHours(preferredHour, 0, 0, 0);
  if (preferred.getTime() <= now.getTime()) {
    preferred.setDate(preferred.getDate() + 1);
  }

  const slot = findAvailableSlot(preferred, settings);
  if (!slot) return null;

  const step = task.starterAction || "the first step";

  return {
    identifier: `motivation-nudge-${task.id}`,
    content: {
      title: "Hey, you've got this",
      body: `Haven't touched "${task.title}" in a day. Start with: ${step}`,
      data: { taskId: task.id, type: "motivation_nudge" },
      sound: true,
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: slot,
    },
  };
}

// ---------------------------------------------------------------------------
// Web notification polling
// ---------------------------------------------------------------------------

/**
 * Check and fire web notifications for reminders that should trigger NOW.
 * Called on an interval (60s) when the app is open on web.
 * Uses a 2-minute window: fires if the trigger time is within [-1min, +1min] of now.
 */
export function checkAndFireWebReminders(tasks: Task[], settings: UserSettings): void {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (Notification.permission !== "granted") return;

  const now = Date.now();
  const WINDOW_MS = 2 * 60 * 1000; // 2 minute window

  for (const task of tasks) {
    if (task.status === "complete") continue;

    const dueMs = new Date(task.dueDate).getTime();
    if (dueMs < now) continue;

    // Start reminder — check if energyPeakStart hour is within window
    const hoursUntilDue = (dueMs - now) / HOURS;
    if (hoursUntilDue > 12 && hoursUntilDue <= 48) {
      const preferredHour = settings.energyPeakStart ?? 15;
      const todaySlot = new Date();
      todaySlot.setHours(preferredHour, 0, 0, 0);
      if (Math.abs(todaySlot.getTime() - now) < WINDOW_MS) {
        if (!isQuietTime(todaySlot, settings.quietHoursStart, settings.quietHoursEnd) &&
            !isBusyTime(todaySlot, settings.busyBlocks)) {
          const relativeDue = hoursUntilDue < 24 ? "today" : "tomorrow";
          showWebNotification(
            "Hey — time to get started",
            `${task.title} is due ${relativeDue}. Want to do the first step?`,
            `start-${task.id}`
          );
        }
      }
    }

    // Deadline reminder — 12h before due
    const deadlineTriggerMs = dueMs - 12 * HOURS;
    if (Math.abs(deadlineTriggerMs - now) < WINDOW_MS) {
      const triggerDate = new Date(deadlineTriggerMs);
      if (!isQuietTime(triggerDate, settings.quietHoursStart, settings.quietHoursEnd) &&
          !isBusyTime(triggerDate, settings.busyBlocks)) {
        const firstStep = task.subtasks.find((s) => !s.isComplete)?.title ?? "the first step";
        showWebNotification(
          "Heads up — due soon",
          `${task.title} is due tomorrow. Start with ${firstStep}.`,
          `deadline-${task.id}`
        );
      }
    }

    // Best time reminder — 15min before proposedTime
    if (task.scheduleStatus === "proposed" && task.proposedTime) {
      const proposedMs = new Date(task.proposedTime).getTime();
      const bestTimeTriggerMs = proposedMs - 15 * 60 * 1000;
      if (Math.abs(bestTimeTriggerMs - now) < WINDOW_MS) {
        const triggerDate = new Date(bestTimeTriggerMs);
        if (!isQuietTime(triggerDate, settings.quietHoursStart, settings.quietHoursEnd) &&
            !isBusyTime(triggerDate, settings.busyBlocks)) {
          showWebNotification(
            "Good time to start!",
            `You usually follow through at this time — start ${task.title} now?`,
            `best-time-${task.id}`
          );
        }
      }
    }

    // Motivation nudge — 24h since last interaction
    const lastInteraction = new Date(task.updatedAt).getTime();
    if (Date.now() - lastInteraction > 24 * HOURS && dueMs > now) {
      // Only show once per day — use date-based tag
      const today = new Date().toISOString().slice(0, 10);
      const step = task.starterAction || "the first step";
      const nudgeNow = new Date();
      if (!isQuietTime(nudgeNow, settings.quietHoursStart, settings.quietHoursEnd) &&
          !isBusyTime(nudgeNow, settings.busyBlocks)) {
        showWebNotification(
          "Hey, you've got this",
          `Haven't touched "${task.title}" in a day. Start with: ${step}`,
          `nudge-${task.id}-${today}`
        );
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Main scheduling function
// ---------------------------------------------------------------------------

/**
 * Cancel all existing scheduled notifications, then schedule fresh ones based
 * on current tasks and settings.
 *
 * Rate limiting enforced:
 *  - Max 1 start reminder + 1 deadline reminder per task (per scheduling run)
 *  - Only tasks due within the next 7 days are considered
 *  - Incomplete tasks only
 *  - Quiet hours and busy blocks respected
 */
export async function scheduleTaskReminders(
  tasks: Task[],
  settings: UserSettings
): Promise<void> {
  // On web, expo-notifications is a no-op. Use web notifications instead.
  if (Platform.OS === "web") {
    checkAndFireWebReminders(tasks, settings);
    return;
  }

  try {
    // Always clear previous schedule so we start fresh
    await Notifications.cancelAllScheduledNotificationsAsync();

    const now = Date.now();
    const windowEnd = now + SEVEN_DAYS_MS;

    const specs: NotificationSpec[] = [];

    for (const task of tasks) {
      if (task.status === "complete") continue;

      const dueMs = new Date(task.dueDate).getTime();
      if (dueMs < now || dueMs > windowEnd) continue; // outside window

      const hoursUntilDue = (dueMs - now) / HOURS;

      if (hoursUntilDue > 12) {
        // Far enough out — schedule a start reminder
        const startSpec = buildStartReminder(task, settings);
        if (startSpec) specs.push(startSpec);
      }

      // Always attempt a deadline reminder (fires 12h before, if in future)
      const deadlineSpec = buildDeadlineReminder(task, settings);
      if (deadlineSpec) specs.push(deadlineSpec);

      // Best-time reminder for tasks with proposed schedule
      const bestTimeSpec = buildBestTimeReminder(task, settings);
      if (bestTimeSpec) specs.push(bestTimeSpec);

      // Motivation nudge for neglected tasks
      const nudgeSpec = buildMotivationNudge(task, settings);
      if (nudgeSpec) specs.push(nudgeSpec);
    }

    // Schedule all notifications
    const scheduled = await Promise.allSettled(
      specs.map((spec) =>
        Notifications.scheduleNotificationAsync({
          identifier: spec.identifier,
          content: spec.content,
          trigger: spec.trigger,
        })
      )
    );

    const succeeded = scheduled.filter((r) => r.status === "fulfilled").length;
    const failed = scheduled.filter((r) => r.status === "rejected").length;
    console.log(
      `[Notifications] Scheduled ${succeeded} notification(s)` +
        (failed ? `, ${failed} failed.` : ".")
    );
  } catch (err) {
    // Never surface notification errors to the user
    console.warn("[Notifications] scheduleTaskReminders failed silently:", err);
  }
}

// ---------------------------------------------------------------------------
// Cancel all
// ---------------------------------------------------------------------------

/** Cancel all scheduled Ampora notifications. */
export async function cancelAllReminders(): Promise<void> {
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
  } catch (err) {
    console.warn("[Notifications] cancelAllReminders failed silently:", err);
  }
}
