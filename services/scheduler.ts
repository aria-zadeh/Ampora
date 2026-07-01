/**
 * Smart Scheduling Algorithm — Ampora
 *
 * Auto-places task blocks around busy times, one-off events, and quiet hours.
 * Learns from past SchedulingSignal outcomes to prefer time slots where the
 * user historically completes work.
 */

import type {
  Task,
  BusyBlock,
  CalendarEvent,
  SchedulingSignal,
  DayKey,
  PeriodKey,
} from "@/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ScheduleSlot {
  startTime: Date;
  endTime: Date;
  score: number;
}

export interface ScheduleInput {
  task: Task;
  allTasks: Task[];
  calendarEvents: CalendarEvent[];
  busyBlocks: BusyBlock[];
  quietHoursStart: number; // hour 0–23
  quietHoursEnd: number;   // hour 0–23
  energyPeakStart: number; // hour 0–23
  energyPeakEnd: number;   // hour 0–23
  signals: SchedulingSignal[];
}

const BREAK_BUFFER_MINUTES = 15;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Round a date UP to the next 15-minute boundary. */
export function roundUpTo15Min(date: Date): Date {
  const ms = date.getTime();
  const remainder = ms % (15 * 60 * 1000);
  if (remainder === 0) return new Date(ms);
  return new Date(ms + (15 * 60 * 1000 - remainder));
}

/** Map DayKey to JS day number (0=Sun). */
const DAY_MAP: Record<DayKey, number> = {
  sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6,
};

/** Map PeriodKey to hour ranges. */
const PERIOD_HOURS: Record<PeriodKey, [number, number]> = {
  morning: [6, 12],
  afternoon: [12, 18],
  evening: [18, 23],
};

/** Check if a slot falls within quiet hours. */
function isInQuietHours(
  slot: ScheduleSlot,
  quietStart: number,
  quietEnd: number,
): boolean {
  const sh = slot.startTime.getHours();
  const eh = slot.endTime.getHours();
  // Quiet hours wrap midnight (e.g. 23→8)
  if (quietStart > quietEnd) {
    return sh >= quietStart || sh < quietEnd || eh > quietStart || (eh <= quietEnd && eh > 0);
  }
  return (sh >= quietStart && sh < quietEnd) || (eh > quietStart && eh <= quietEnd);
}

/** Check if two time ranges overlap. */
function rangesOverlap(
  aStart: number,
  aEnd: number,
  bStart: number,
  bEnd: number,
): boolean {
  return aStart < bEnd && bStart < aEnd;
}

/** Check if a slot conflicts with any existing task that has a startTime. */
function conflictsWithTasks(slot: ScheduleSlot, tasks: Task[]): boolean {
  const slotStart = slot.startTime.getTime();
  const slotEnd = slot.endTime.getTime();
  for (const t of tasks) {
    const st = t.startTime ?? t.proposedTime;
    if (!st) continue;
    const tStart = new Date(st).getTime();
    const dur = t.durationMinutes ?? 60;
    const tEnd = tStart + (dur + BREAK_BUFFER_MINUTES) * 60 * 1000;
    if (rangesOverlap(slotStart, slotEnd, tStart, tEnd)) return true;
  }
  return false;
}

/** Check if a slot conflicts with any one-off calendar event. */
function conflictsWithEvents(
  slot: ScheduleSlot,
  events: CalendarEvent[],
): boolean {
  for (const ev of events) {
    const evDate = new Date(ev.date);
    if (
      slot.startTime.getFullYear() !== evDate.getFullYear() ||
      slot.startTime.getMonth() !== evDate.getMonth() ||
      slot.startTime.getDate() !== evDate.getDate()
    ) {
      continue;
    }
    const [sh, sm] = ev.startTime.split(":").map(Number);
    const [eh, em] = ev.endTime.split(":").map(Number);
    const evStart = new Date(evDate);
    evStart.setHours(sh, sm, 0, 0);
    const evEnd = new Date(evDate);
    evEnd.setHours(eh, em, 0, 0);
    if (rangesOverlap(slot.startTime.getTime(), slot.endTime.getTime(), evStart.getTime(), evEnd.getTime())) {
      return true;
    }
  }
  return false;
}

/** Check if a slot conflicts with recurring busy blocks. */
function conflictsWithBusyBlocks(
  slot: ScheduleSlot,
  busyBlocks: BusyBlock[],
): boolean {
  const dayOfWeek = slot.startTime.getDay();
  const hour = slot.startTime.getHours();
  for (const block of busyBlocks) {
    if (DAY_MAP[block.day] !== dayOfWeek) continue;
    const [periodStart, periodEnd] = PERIOD_HOURS[block.period];
    if (hour >= periodStart && hour < periodEnd) return true;
  }
  return false;
}

/**
 * Penalize slots that would create long continuous work blocks.
 * Returns a negative score if scheduling here would result in >90min of
 * back-to-back work (tasks within 30min of each other form a chain).
 */
function continuousWorkPenalty(
  slot: ScheduleSlot,
  tasks: Task[],
  duration: number,
): number {
  const slotStart = slot.startTime.getTime();
  const slotEnd = slot.endTime.getTime();
  const CHAIN_GAP = 30 * 60 * 1000; // 30 min — tasks within this gap form a chain
  const MAX_CONTINUOUS = 90; // minutes

  // Collect all scheduled task time ranges on the same day
  const slotDay = slot.startTime.toDateString();
  const ranges: { start: number; end: number }[] = [];
  for (const t of tasks) {
    const st = t.startTime ?? t.proposedTime;
    if (!st) continue;
    const tStart = new Date(st);
    if (tStart.toDateString() !== slotDay) continue;
    const dur = t.durationMinutes ?? 60;
    ranges.push({ start: tStart.getTime(), end: tStart.getTime() + dur * 60 * 1000 });
  }
  // Add the proposed slot itself
  ranges.push({ start: slotStart, end: slotEnd });
  ranges.sort((a, b) => a.start - b.start);

  // Merge ranges that are within CHAIN_GAP of each other
  const chains: { start: number; end: number; totalWork: number }[] = [];
  for (const r of ranges) {
    const last = chains[chains.length - 1];
    if (last && r.start - last.end <= CHAIN_GAP) {
      last.end = Math.max(last.end, r.end);
      last.totalWork += (r.end - r.start) / (60 * 1000);
    } else {
      chains.push({ start: r.start, end: r.end, totalWork: (r.end - r.start) / (60 * 1000) });
    }
  }

  // Find the chain containing our slot
  for (const chain of chains) {
    if (slotStart >= chain.start - CHAIN_GAP && slotEnd <= chain.end + CHAIN_GAP) {
      if (chain.totalWork > MAX_CONTINUOUS) return -3;
    }
  }
  return 0;
}

// ---------------------------------------------------------------------------
// Core algorithm
// ---------------------------------------------------------------------------

/**
 * Find the best available time slot for a task.
 * Returns null if no suitable slot exists before the deadline.
 */
export function findBestSlot(input: ScheduleInput): ScheduleSlot | null {
  const duration = input.task.durationMinutes ?? 60;
  const now = new Date();
  const deadline = new Date(input.task.dueDate);

  // Don't schedule in the past or after the deadline
  if (deadline.getTime() <= now.getTime()) return null;

  // 1. Enumerate candidate 15-min-aligned slots
  const candidates: ScheduleSlot[] = [];
  let cursor = roundUpTo15Min(now);
  const durationMs = duration * 60 * 1000;

  // Cap candidate generation to avoid memory issues (max ~2 weeks out)
  const maxEnd = Math.min(deadline.getTime(), now.getTime() + 14 * 24 * 60 * 60 * 1000);

  while (cursor.getTime() + durationMs <= maxEnd) {
    candidates.push({
      startTime: new Date(cursor),
      endTime: new Date(cursor.getTime() + durationMs),
      score: 0,
    });
    cursor = new Date(cursor.getTime() + 15 * 60 * 1000);
  }

  if (candidates.length === 0) return null;

  // 2. Filter out conflicts
  const validSlots = candidates.filter((slot) => {
    if (isInQuietHours(slot, input.quietHoursStart, input.quietHoursEnd)) return false;
    if (conflictsWithTasks(slot, input.allTasks)) return false;
    if (conflictsWithEvents(slot, input.calendarEvents)) return false;
    if (conflictsWithBusyBlocks(slot, input.busyBlocks)) return false;
    return true;
  });

  if (validSlots.length === 0) return null;

  // 3. Score remaining slots
  const thirtyDaysAgo = now.getTime() - 30 * 24 * 60 * 60 * 1000;
  const recentSignals = input.signals.filter(
    (s) => new Date(s.recordedAt).getTime() >= thirtyDaysAgo,
  );

  for (const slot of validSlots) {
    const hour = slot.startTime.getHours();
    const dayOfWeek = slot.startTime.getDay() as 0 | 1 | 2 | 3 | 4 | 5 | 6;

    // Energy peak bonus (+2)
    if (hour >= input.energyPeakStart && hour < input.energyPeakEnd) {
      slot.score += 2;
    }

    // Historical signals for this day+hour
    const matchingSignals = recentSignals.filter(
      (s) => s.hourOfDay === hour && s.dayOfWeek === dayOfWeek,
    );
    const successCount = matchingSignals.filter((s) => s.outcome === "completed").length;
    const failureCount = matchingSignals.filter((s) => s.outcome === "skipped").length;

    // Only apply signal modifiers if we have enough data (cold-start protection)
    if (matchingSignals.length >= 3) {
      slot.score += successCount;
      slot.score -= failureCount * 2;
    }

    // Late-night penalty
    if (hour >= 20) slot.score -= 1;
    if (hour >= 21) slot.score -= 1;
    if (hour >= 22) slot.score -= 2;

    // Mild proximity bonus (prefer sooner)
    const hoursFromNow = (slot.startTime.getTime() - now.getTime()) / (1000 * 60 * 60);
    if (hoursFromNow < 4) slot.score += 0.5;

    // Continuous work density penalty
    slot.score += continuousWorkPenalty(slot, input.allTasks, duration);

    // Weight decay for signals based on recency
    for (const signal of matchingSignals) {
      const daysOld = (now.getTime() - new Date(signal.recordedAt).getTime()) / (1000 * 60 * 60 * 24);
      const decay = Math.max(0, 1 - daysOld / 30);
      slot.score += (signal.outcome === "completed" ? 0.1 : -0.1) * decay;
    }
  }

  // 4. Return highest-scoring slot
  validSlots.sort((a, b) => b.score - a.score);
  return validSlots[0];
}
