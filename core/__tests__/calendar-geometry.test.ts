import { describe, expect, it } from 'vitest'
import {
  blockGeometry,
  currentTimeTop,
  DEFAULT_PX_PER_HOUR,
  durationMin,
  instantForY,
  MIN_BLOCK_HEIGHT,
  MS_PER_MIN,
  nearestZoomStop,
  pxPerMinFromHour,
  snapToGrid,
  stepZoom,
  yForInstant,
  ZOOM_STOPS_PX_PER_HOUR,
} from '@/core/calendar/geometry'

const gridStart = 0 // treat epoch 0 as "midnight" for these pure math tests

describe('calendar/geometry: px/time conversions', () => {
  it('pxPerMinFromHour divides by 60', () => {
    expect(pxPerMinFromHour(60)).toBe(1)
    expect(pxPerMinFromHour(120)).toBe(2)
  })

  it('yForInstant / instantForY round-trip', () => {
    const pxPerMin = pxPerMinFromHour(60)
    for (const ms of [0, 5 * MS_PER_MIN, 90 * MS_PER_MIN, 723 * MS_PER_MIN]) {
      const y = yForInstant(gridStart + ms, gridStart, pxPerMin)
      const back = instantForY(y, gridStart, pxPerMin)
      expect(back).toBeCloseTo(gridStart + ms, 6)
    }
  })

  it('round-trips across every zoom stop', () => {
    for (const pxPerHour of ZOOM_STOPS_PX_PER_HOUR) {
      const pxPerMin = pxPerMinFromHour(pxPerHour)
      const ms = 137 * MS_PER_MIN
      const y = yForInstant(gridStart + ms, gridStart, pxPerMin)
      const back = instantForY(y, gridStart, pxPerMin)
      expect(back).toBeCloseTo(gridStart + ms, 6)
    }
  })

  it('blockGeometry: top and height reflect the span position/duration', () => {
    const pxPerMin = pxPerMinFromHour(60) // 1 px/min
    const g = blockGeometry(gridStart + 30 * MS_PER_MIN, gridStart + 90 * MS_PER_MIN, gridStart, pxPerMin)
    expect(g.top).toBe(30)
    expect(g.height).toBe(60)
  })

  it('blockGeometry: height is floored at MIN_BLOCK_HEIGHT for very short spans', () => {
    const pxPerMin = pxPerMinFromHour(60)
    const g = blockGeometry(gridStart, gridStart + 2 * MS_PER_MIN, gridStart, pxPerMin) // 2px raw
    expect(g.height).toBe(MIN_BLOCK_HEIGHT)
  })

  it('durationMin is the plain minutes between two instants', () => {
    expect(durationMin(gridStart, gridStart + 45 * MS_PER_MIN)).toBe(45)
  })
})

describe('calendar/geometry: zoom stops', () => {
  it('DEFAULT_PX_PER_HOUR is one of the defined stops', () => {
    expect(ZOOM_STOPS_PX_PER_HOUR).toContain(DEFAULT_PX_PER_HOUR)
  })

  it('nearestZoomStop snaps an arbitrary value to the closest defined stop', () => {
    expect(nearestZoomStop(45)).toBe(40)
    expect(nearestZoomStop(55)).toBe(60)
    expect(nearestZoomStop(100)).toBe(80)
    expect(nearestZoomStop(200)).toBe(120)
  })

  it('nearestZoomStop is exact for values already on a stop', () => {
    for (const stop of ZOOM_STOPS_PX_PER_HOUR) expect(nearestZoomStop(stop)).toBe(stop)
  })

  it('stepZoom moves to the adjacent stop and clamps at the ends (never wraps)', () => {
    expect(stepZoom(40, 1)).toBe(60)
    expect(stepZoom(120, 1)).toBe(120) // already at the top stop
    expect(stepZoom(40, -1)).toBe(40) // already at the bottom stop
    expect(stepZoom(80, -1)).toBe(60)
  })
})

describe('calendar/geometry: current-time indicator', () => {
  it('returns the y offset when now falls within the rendered day', () => {
    const pxPerMin = pxPerMinFromHour(60)
    const top = currentTimeTop(gridStart + 9 * 60 * MS_PER_MIN, gridStart, pxPerMin, 24 * 60)
    expect(top).toBe(9 * 60)
  })

  it('returns null when now falls outside the rendered day (with a totalHeight bound given)', () => {
    const pxPerMin = pxPerMinFromHour(60)
    const top = currentTimeTop(gridStart - 60 * MS_PER_MIN, gridStart, pxPerMin, 24 * 60)
    expect(top).toBeNull()
    const topAfter = currentTimeTop(gridStart + 25 * 60 * MS_PER_MIN, gridStart, pxPerMin, 24 * 60)
    expect(topAfter).toBeNull()
  })

  it('always returns a raw offset when totalHeight is omitted (no range check)', () => {
    const pxPerMin = pxPerMinFromHour(60)
    const top = currentTimeTop(gridStart - 60 * MS_PER_MIN, gridStart, pxPerMin)
    expect(top).toBe(-60)
  })
})

describe('calendar/geometry: snapToGrid (FR-28, 5-min default)', () => {
  it('snaps to the nearest 5-minute line', () => {
    expect(snapToGrid(gridStart + 12 * MS_PER_MIN, gridStart)).toBe(gridStart + 10 * MS_PER_MIN)
    expect(snapToGrid(gridStart + 13 * MS_PER_MIN, gridStart)).toBe(gridStart + 15 * MS_PER_MIN)
  })

  it('is idempotent on an already-snapped instant', () => {
    const snapped = gridStart + 25 * MS_PER_MIN
    expect(snapToGrid(snapped, gridStart)).toBe(snapped)
  })

  it('honors a custom snap interval', () => {
    expect(snapToGrid(gridStart + 7 * MS_PER_MIN, gridStart, 10)).toBe(gridStart + 10 * MS_PER_MIN)
    expect(snapToGrid(gridStart + 4 * MS_PER_MIN, gridStart, 10)).toBe(gridStart)
  })

  it('anchors relative to gridStartMs, not the Unix epoch', () => {
    const anchor = 3 * MS_PER_MIN // an "odd" grid anchor
    expect(snapToGrid(anchor + 12 * MS_PER_MIN, anchor)).toBe(anchor + 10 * MS_PER_MIN)
  })
})
