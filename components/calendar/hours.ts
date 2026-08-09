/**
 * Hour-label and day-range helpers for the calendar time grid.
 *
 * Pure and side-effect free (no react-native / clock reads except where a
 * `now`/`ref` is passed in), so it is safe to import anywhere and unit-test in
 * plain Node. Absolute instants are epoch ms; hour indices are 0..23 local.
 */

import { MS_PER_HOUR } from '@/core/calendar'

/** Number of hours rendered in a full day column. */
export const HOURS_IN_DAY = 24

/** Default vertical scroll target: 07:00 (hour 7), so a fresh open lands on morning. */
export const DEFAULT_SCROLL_HOUR = 7

/**
 * Format an hour index (0..23) as a compact 12-hour label: `12a, 1a … 11a,
 * 12p, 1p … 11p` (PRD §8.7 gutter style, terse, lower-case meridiem).
 */
export function hourLabel(hour: number): string {
  const h = ((hour % 24) + 24) % 24
  const meridiem = h < 12 ? 'a' : 'p'
  const base = h % 12 === 0 ? 12 : h % 12
  return `${base}${meridiem}`
}

/**
 * Longer accessible hour label for screen readers (e.g. "7 AM", "12 PM"),
 * used as the gutter's `accessibilityLabel` since the compact glyph reads poorly.
 */
export function hourLabelLong(hour: number): string {
  const h = ((hour % 24) + 24) % 24
  const meridiem = h < 12 ? 'AM' : 'PM'
  const base = h % 12 === 0 ? 12 : h % 12
  return `${base} ${meridiem}`
}

/** Local midnight (00:00) of the day containing epoch-ms `t`. */
export function dayStart(t: number): number {
  const d = new Date(t)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

/** Local end-of-day (exclusive): the next local midnight after `t`. */
export function dayEnd(t: number): number {
  const start = dayStart(t)
  const d = new Date(start)
  d.setDate(d.getDate() + 1)
  return d.getTime()
}

/** True when `ms` falls on the same local day as `ref`. */
export function isSameDay(ms: number, ref: number): boolean {
  return dayStart(ms) === dayStart(ref)
}

/**
 * The hour indices to render for a day column. Default full day 0..23; a
 * `[from, to]` clamp lets a compact view render only working hours.
 */
export function hoursToRender(from = 0, to = HOURS_IN_DAY - 1): number[] {
  const lo = Math.max(0, Math.min(from, HOURS_IN_DAY - 1))
  const hi = Math.max(lo, Math.min(to, HOURS_IN_DAY - 1))
  const out: number[] = []
  for (let h = lo; h <= hi; h++) out.push(h)
  return out
}

/** Epoch ms of a given local hour boundary on the day starting at `dayStartMs`. */
export function hourInstant(dayStartMs: number, hour: number): number {
  return dayStartMs + hour * MS_PER_HOUR
}

/**
 * Format a start/end span as a compact block time-range label, e.g.
 * "9:00 - 9:45 AM" (shared meridiem collapsed when both ends share it).
 */
export function formatBlockTimeRange(startMs: number, endMs: number): string {
  const s = new Date(startMs)
  const e = new Date(endMs)
  const sMer = s.getHours() < 12 ? 'AM' : 'PM'
  const eMer = e.getHours() < 12 ? 'AM' : 'PM'
  const startStr = formatClock(s, sMer !== eMer)
  const endStr = formatClock(e, true)
  return `${startStr} - ${endStr}`
}

/** Format a single instant as a compact clock time, e.g. "9:05 AM". */
export function formatClockTime(ms: number): string {
  return formatClock(new Date(ms), true)
}

function formatClock(d: Date, withMeridiem: boolean): string {
  const h24 = d.getHours()
  const meridiem = h24 < 12 ? 'AM' : 'PM'
  const h = h24 % 12 === 0 ? 12 : h24 % 12
  const m = d.getMinutes()
  const mm = m === 0 ? '' : `:${m.toString().padStart(2, '0')}`
  const hm = `${h}${mm}`
  return withMeridiem ? `${hm} ${meridiem}` : hm
}

/** Fixed pixel width of the left time gutter (PRD FR-24: "Fixed time gutter (44 px)"). */
export const GUTTER_WIDTH = 44
