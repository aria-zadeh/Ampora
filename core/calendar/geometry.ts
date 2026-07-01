/**
 * Pure calendar geometry math (PRD FR-24 / FR-25).
 *
 * PORTABILITY: no react-native / expo / MMKV imports. Everything here is
 * deterministic given its inputs plus an explicit `now` where a clock would
 * otherwise be read, matching the discipline in `core/scheduler/`. Every
 * function is unit-testable in plain Node.
 *
 * Units:
 * - Absolute instants are epoch milliseconds (`start`, `end`, `now`, `dayStartMs`).
 * - Vertical position and size are in device-independent pixels (px).
 * - `pxPerMin` is pixels per minute; `pxPerHour` is pixels per hour.
 *
 * Block geometry (FR-25):
 *   top    = (block.start - gridStartMs) / 60000 * pxPerMin
 *   height = max(durationMin * pxPerMin, MIN_BLOCK_HEIGHT)
 */

/** Milliseconds in one minute — named to keep the arithmetic readable. */
export const MS_PER_MIN = 60_000
/** Milliseconds in one hour. */
export const MS_PER_HOUR = 3_600_000
/** Milliseconds in one day. */
export const MS_PER_DAY = 86_400_000

/**
 * Minimum rendered block height in px (PRD FR-25: `max(durationMin * pxPerMin, 22)`).
 * Guarantees a very short session is still tappable / visible.
 */
export const MIN_BLOCK_HEIGHT = 22

/**
 * The four discrete pinch-to-zoom hour-height stops, in px per hour
 * (PRD FR-24). Persisted by the caller. Index 1 (60 px/hr) is the sensible
 * default. Kept as a readonly tuple so callers can index / cycle deterministically.
 */
export const ZOOM_STOPS_PX_PER_HOUR = [40, 60, 80, 120] as const

/** A value drawn from {@link ZOOM_STOPS_PX_PER_HOUR}. */
export type ZoomPxPerHour = (typeof ZOOM_STOPS_PX_PER_HOUR)[number]

/** Default zoom (60 px/hr) — the middle-low stop, comfortable on a phone. */
export const DEFAULT_PX_PER_HOUR: ZoomPxPerHour = 60

/** Convert a px-per-hour zoom value into px-per-minute for the geometry math. */
export function pxPerMinFromHour(pxPerHour: number): number {
  return pxPerHour / 60
}

/**
 * Clamp an arbitrary px-per-hour value to the nearest defined zoom stop.
 * Used when restoring a persisted value or resolving a pinch gesture to a stop.
 */
export function nearestZoomStop(pxPerHour: number): ZoomPxPerHour {
  let best: ZoomPxPerHour = ZOOM_STOPS_PX_PER_HOUR[0]
  let bestDist = Math.abs(pxPerHour - best)
  for (const stop of ZOOM_STOPS_PX_PER_HOUR) {
    const dist = Math.abs(pxPerHour - stop)
    if (dist < bestDist) {
      best = stop
      bestDist = dist
    }
  }
  return best
}

/**
 * Step to the adjacent zoom stop. `dir > 0` zooms in (bigger hours),
 * `dir < 0` zooms out. Clamps at the ends (never wraps).
 */
export function stepZoom(pxPerHour: number, dir: 1 | -1): ZoomPxPerHour {
  const current = nearestZoomStop(pxPerHour)
  const idx = ZOOM_STOPS_PX_PER_HOUR.indexOf(current)
  const next = Math.min(
    ZOOM_STOPS_PX_PER_HOUR.length - 1,
    Math.max(0, idx + dir)
  )
  return ZOOM_STOPS_PX_PER_HOUR[next]
}

/** Geometry of a placed block on the vertical time axis. */
export interface BlockGeometry {
  /** px from the top of the grid to the block's top edge. */
  top: number
  /** px height of the block (>= {@link MIN_BLOCK_HEIGHT}). */
  height: number
}

/**
 * Vertical geometry for a time span (PRD FR-25).
 *
 * @param startMs   block start, epoch ms
 * @param endMs     block end, epoch ms (must be >= startMs)
 * @param gridStartMs the epoch ms mapped to y=0 (usually local midnight of the day)
 * @param pxPerMin  vertical scale, px per minute
 * @param minHeight floor for the rendered height, default {@link MIN_BLOCK_HEIGHT}
 */
export function blockGeometry(
  startMs: number,
  endMs: number,
  gridStartMs: number,
  pxPerMin: number,
  minHeight: number = MIN_BLOCK_HEIGHT
): BlockGeometry {
  const top = ((startMs - gridStartMs) / MS_PER_MIN) * pxPerMin
  const rawHeight = ((endMs - startMs) / MS_PER_MIN) * pxPerMin
  return { top, height: Math.max(rawHeight, minHeight) }
}

/** px from grid top for an arbitrary instant (no min-height floor). */
export function yForInstant(
  ms: number,
  gridStartMs: number,
  pxPerMin: number
): number {
  return ((ms - gridStartMs) / MS_PER_MIN) * pxPerMin
}

/**
 * Inverse of {@link yForInstant}: the epoch-ms instant at a given y offset.
 * Used to translate a drag / long-press y into a time (caller then snaps).
 */
export function instantForY(
  y: number,
  gridStartMs: number,
  pxPerMin: number
): number {
  return gridStartMs + (y / pxPerMin) * MS_PER_MIN
}

/**
 * px offset of the current-time indicator line (PRD FR-24), or `null` when
 * `now` falls outside the rendered day so the caller can hide the line.
 *
 * @param totalHeight the full pixel height of the grid (24h * pxPerHour).
 *                    When omitted, no range check is done and a raw offset is
 *                    always returned.
 */
export function currentTimeTop(
  now: number,
  dayStartMs: number,
  pxPerMin: number,
  totalHeight?: number
): number | null {
  const y = yForInstant(now, dayStartMs, pxPerMin)
  if (totalHeight != null && (y < 0 || y > totalHeight)) return null
  return y
}

/**
 * Duration in minutes of a span — convenience for callers computing the
 * "N min" label or a resize delta.
 */
export function durationMin(startMs: number, endMs: number): number {
  return (endMs - startMs) / MS_PER_MIN
}

/**
 * Snap an epoch-ms instant to the nearest N-minute grid line (PRD FR-28:
 * drag snaps to a 5-min grid). `gridStartMs` anchors the grid so snapping is
 * relative to the day, not the Unix epoch.
 */
export function snapToGrid(
  ms: number,
  gridStartMs: number,
  snapMin = 5
): number {
  const snapMs = snapMin * MS_PER_MIN
  const rel = ms - gridStartMs
  return gridStartMs + Math.round(rel / snapMs) * snapMs
}
