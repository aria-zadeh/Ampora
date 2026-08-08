/**
 * Pure, portable logic for all-day CalEvents (PRD FR-1, FR-28), shared by the
 * Day/3-Day all-day strip (`AllDayStrip.tsx`) and `AddEventModal`'s All-day
 * toggle. No react-native / store imports, same discipline as
 * `components/schedule/blockingEvent.ts`, so this is unit-testable under
 * plain Node (`core/__tests__/allDayEvents.test.ts`; `vitest.config.ts` only
 * ever runs `core/**` test files, but happily imports any pure module
 * reachable from one via the `@/*` alias).
 */

import type { CalEvent } from '@/types'
import { dayStart, dayEnd } from './hours'

const MS_PER_DAY = 86_400_000

// ---------------------------------------------------------------------------
// Strip layout, mirrors WeekView's own AllDayStrip constants/behavior (chip
// height, stack cap, "+N" overflow) so Day/3-Day read as the same feature,
// not a second implementation.
// ---------------------------------------------------------------------------

/** All-day strip: chip height, gap between stacked chips. */
export const ALLDAY_CHIP_H = 22
export const ALLDAY_CHIP_GAP = 3
/** Max stacked chip rows before the rest collapse into a "+N" overflow label. */
export const ALLDAY_MAX_ROWS = 2

/**
 * Buckets all-day CalEvents into one array per day in `dayStarts` (each a
 * local-midnight epoch ms), sorted by start time within each day. An event
 * spanning multiple days appears in EVERY day column it overlaps, mirrors
 * `WeekView`'s own cross-day bucketing, so a multi-day event (e.g. a school
 * break) shows consistently in every calendar view. Non-all-day events are
 * ignored here; they render in the time grid instead.
 */
export function bucketAllDayEvents(
  events: readonly CalEvent[],
  dayStarts: readonly number[]
): CalEvent[][] {
  const buckets: CalEvent[][] = dayStarts.map(() => [])
  for (const event of events) {
    if (!event.allDay) continue
    for (let i = 0; i < dayStarts.length; i++) {
      const ds = dayStarts[i]
      const de = ds + MS_PER_DAY
      if (event.start < de && event.end > ds) buckets[i].push(event)
    }
  }
  return buckets.map((arr) => [...arr].sort((a, b) => a.start - b.start))
}

/**
 * Strip height in px for a bucketed set, 0 when no day has an all-day event,
 * so the strip takes no space in the common case (PRD §8.7 has no time-grid
 * slot for an all-day event, but a day/period with none of those must render
 * byte-for-byte as it did before this feature existed).
 */
export function allDayStripHeight(byDay: readonly CalEvent[][]): number {
  const maxCount = byDay.reduce((m, arr) => Math.max(m, arr.length), 0)
  const visibleRows = Math.min(maxCount, ALLDAY_MAX_ROWS)
  return visibleRows > 0 ? visibleRows * (ALLDAY_CHIP_H + ALLDAY_CHIP_GAP) + 4 : 0
}

// ---------------------------------------------------------------------------
// Create/edit span math (AddEventModal's All-day toggle).
// ---------------------------------------------------------------------------

/**
 * The stored [start, end) span for an all-day event, given the DATES picked
 * in the "Starts"/"Ends" pickers, their time-of-day is ignored, since an
 * all-day event has no meaningful clock time. Matches the exclusive-
 * next-midnight convention `services/calendarSync.ts#toCalEvent` carries
 * through from `expo-calendar` unchanged, so a locally-created all-day event
 * is shaped identically to a device-synced one downstream (the engine, the
 * strip, the "All day" label in `CalendarBlock`, `blockingEvent.ts`'s FR-20
 * remedy).
 *
 * A picked end date before the start date would otherwise invert the span;
 * clamped forward to a single-day event anchored at `startMs` instead,
 * mirrors the timed path's own "never trap the user behind a validation
 * error" clamp in `AddEventModal#handleSave`.
 */
export function allDaySpan(startMs: number, endMs: number): { start: number; end: number } {
  const start = dayStart(startMs)
  const rawEnd = dayEnd(endMs)
  const end = rawEnd > start ? rawEnd : dayEnd(start)
  return { start, end }
}

/**
 * The date to SHOW in the "Ends" picker when prefilling from an existing
 * all-day event's stored (exclusive) end boundary. Without this, a one-day
 * event (stored as [Mon 00:00, Tue 00:00)) would prefill the end picker to
 * Tuesday, the day AFTER the event's only active day, instead of Monday.
 * Shifting back 1ms lands on the actual last active day; `allDaySpan`
 * re-derives the correct exclusive boundary from whatever date ends up
 * showing, so an untouched open-then-save round-trips to the exact original
 * span (see `core/__tests__/allDayEvents.test.ts`'s round-trip cases).
 */
export function allDayDisplayEnd(storedEndMs: number): number {
  return storedEndMs - 1
}
