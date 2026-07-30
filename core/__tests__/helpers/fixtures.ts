/**
 * Shared test fixtures/factories for the core/ test suite. Not itself a test
 * file (no *.test.ts suffix), just factory helpers so each suite doesn't
 * hand-roll the full Task/Settings/List/ScheduledBlock shape.
 *
 * Every factory takes a partial override object and fills in sane defaults so
 * tests only specify the fields they care about.
 */

import type {
  CalEvent,
  List,
  ScheduledBlock,
  SchedulingHours,
  Settings,
  Task,
  TimeWindow,
} from '@/types'

let counter = 0
/** Deterministic, monotonically increasing id for test fixtures (not `newId()` — keeps ordering stable/reproducible across a single test run). */
export function nextTestId(prefix = 'id'): string {
  counter += 1
  return `${prefix}-${counter}`
}

export function resetTestIdCounter(): void {
  counter = 0
}

/** 9am-9pm every day of the week — a generous default so most placement tests "just fit". */
export function allDaySchedulingHours(window: TimeWindow = { start: 9 * 60, end: 21 * 60 }): SchedulingHours {
  return {
    perDay: [0, 1, 2, 3, 4, 5, 6].map((day) => ({ day, windows: [{ ...window }] })),
  }
}

export function makeSettings(overrides: Partial<Settings> = {}): Settings {
  return {
    dailyLockCapMin: 180,
    singleSessionCapMin: 50,
    defaultSessionMin: 45,
    quietHours: { start: 23 * 60, end: 8 * 60 },
    neverLockCategories: [],
    stakeStrength: 0.6,
    subscription: { status: 'trial', trialEndsAt: undefined },
    schedulingHours: allDaySchedulingHours(),
    maxNotificationsPerHour: 1,
    themePreference: 'system',
    onboardingComplete: true,
    ...overrides,
  }
}

export function makeTask(overrides: Partial<Task> = {}): Task {
  const id = overrides.id ?? nextTestId('task')
  const now = overrides.createdAt ?? 0
  return {
    id,
    createdAt: now,
    updatedAt: now,
    syncState: 'synced',
    title: `Task ${id}`,
    durationMin: 60,
    progressMin: 0,
    autoSchedule: true,
    tags: [],
    subtasks: [],
    status: 'todo',
    splittable: false,
    ...overrides,
  }
}

export function makeCalEvent(overrides: Partial<CalEvent> = {}): CalEvent {
  const id = overrides.id ?? nextTestId('event')
  const now = overrides.createdAt ?? 0
  return {
    id,
    createdAt: now,
    updatedAt: now,
    syncState: 'synced',
    title: `Event ${id}`,
    start: 0,
    end: 0,
    source: 'local',
    busy: true,
    ...overrides,
  }
}

export function makeBlock(overrides: Partial<ScheduledBlock> = {}): ScheduledBlock {
  const id = overrides.id ?? nextTestId('block')
  const now = overrides.createdAt ?? 0
  return {
    id,
    createdAt: now,
    updatedAt: now,
    syncState: 'synced',
    taskId: overrides.taskId ?? 'task-1',
    start: 0,
    end: 0,
    status: 'planned',
    ...overrides,
  }
}

export function makeList(overrides: Partial<List> = {}): List {
  const id = overrides.id ?? nextTestId('list')
  const now = overrides.createdAt ?? 0
  return {
    id,
    createdAt: now,
    updatedAt: now,
    syncState: 'synced',
    name: `List ${id}`,
    color: '#000000',
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Fixed local reference instant used across suites so tests are not sensitive
// to the machine's real clock or timezone-of-the-day-run. Monday, matching
// Date#getDay() === 1, at 08:00 local time.
// ---------------------------------------------------------------------------
export function mondayAt(hour: number, minute = 0, base = new Date(2026, 0, 5)): number {
  // 2026-01-05 is a Monday (verified against Date#getDay()).
  const d = new Date(base)
  d.setHours(hour, minute, 0, 0)
  return d.getTime()
}

export const MS_PER_MIN = 60_000
export const MS_PER_HOUR = 3_600_000
export const MS_PER_DAY = 86_400_000
