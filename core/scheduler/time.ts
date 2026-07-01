/**
 * Pure time/interval math for the scheduler. Span algebra (union / subtract /
 * clamp) plus day-of-week / minutes-from-midnight helpers.
 *
 * All operations are O(n log n) or O(n) over already-sorted input, never
 * O(n^2), so the placement loop stays fast for hundreds of tasks (NFR-2).
 * Nothing here reads a clock or mutates its arguments.
 */

import type { TimeWindow } from '@/types'
import { MS_PER_DAY, MS_PER_MIN, type Span } from './types'

/** Local midnight (00:00) of the day containing epoch-ms `t`. */
export function startOfDay(t: number): number {
  const d = new Date(t)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

/** Minutes-from-local-midnight for epoch-ms `t` (0..1439.999...). */
export function minutesOfDay(t: number): number {
  return (t - startOfDay(t)) / MS_PER_MIN
}

/** Convert a day's minutes-from-midnight windows into absolute epoch-ms spans. */
export function dayWindowsToSpans(dayStart: number, windows: TimeWindow[]): Span[] {
  const spans: Span[] = []
  for (const w of windows) {
    if (w.end <= w.start) continue
    spans.push({
      start: dayStart + w.start * MS_PER_MIN,
      end: dayStart + w.end * MS_PER_MIN,
    })
  }
  return spans
}

/** Merge overlapping/adjacent spans into a sorted, non-overlapping list. */
export function unionSpans(spans: Span[]): Span[] {
  if (spans.length <= 1) {
    return spans.length === 1 && spans[0].end > spans[0].start ? [{ ...spans[0] }] : []
  }
  const sorted = spans
    .filter((s) => s.end > s.start)
    .sort((a, b) => a.start - b.start || a.end - b.end)
  const out: Span[] = []
  for (const s of sorted) {
    const last = out[out.length - 1]
    if (last && s.start <= last.end) {
      if (s.end > last.end) last.end = s.end
    } else {
      out.push({ start: s.start, end: s.end })
    }
  }
  return out
}

/**
 * Set difference base \ cut. Both may be unsorted/overlapping; the result is
 * sorted and non-overlapping. Single pass after unioning each side.
 */
export function subtractSpans(base: Span[], cut: Span[]): Span[] {
  const baseU = unionSpans(base)
  const cutU = unionSpans(cut)
  if (cutU.length === 0) return baseU
  const out: Span[] = []
  let ci = 0
  for (const b of baseU) {
    let cursor = b.start
    // Advance past cuts entirely left of this base span.
    while (ci < cutU.length && cutU[ci].end <= b.start) ci++
    let j = ci
    while (j < cutU.length && cutU[j].start < b.end) {
      const c = cutU[j]
      if (c.start > cursor) {
        out.push({ start: cursor, end: Math.min(c.start, b.end) })
      }
      cursor = Math.max(cursor, c.end)
      if (cursor >= b.end) break
      j++
    }
    if (cursor < b.end) out.push({ start: cursor, end: b.end })
  }
  return out
}

/** Intersect a span list with a single [lo, hi) window; drop empties. */
export function clampSpans(spans: Span[], lo: number, hi: number): Span[] {
  const out: Span[] = []
  for (const s of spans) {
    const start = Math.max(s.start, lo)
    const end = Math.min(s.end, hi)
    if (end > start) out.push({ start, end })
  }
  return out
}

/** Intersection of two sorted, non-overlapping span lists. */
export function intersectSpans(a: Span[], b: Span[]): Span[] {
  const out: Span[] = []
  let i = 0
  let j = 0
  while (i < a.length && j < b.length) {
    const start = Math.max(a[i].start, b[j].start)
    const end = Math.min(a[i].end, b[j].end)
    if (end > start) out.push({ start, end })
    if (a[i].end < b[j].end) i++
    else j++
  }
  return out
}

/** Total covered minutes across a span list. */
export function totalMinutes(spans: Span[]): number {
  let sum = 0
  for (const s of spans) sum += (s.end - s.start) / MS_PER_MIN
  return sum
}

/** How many distinct local days in [now, cutoff) a span list touches with any capacity. */
export function daysWithCapacity(spans: Span[]): number {
  const days = new Set<number>()
  for (const s of spans) {
    for (let d = startOfDay(s.start); d < s.end; d += MS_PER_DAY) {
      days.add(d)
    }
  }
  return days.size
}
