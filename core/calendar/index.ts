/**
 * Ampora calendar core — pure layout + geometry math (PRD FR-24, FR-25, §9.8).
 *
 * PURE + PORTABLE: nothing under `core/calendar/` imports react-native, expo,
 * or MMKV. All functions are deterministic given their inputs (with `now`
 * passed explicitly where a clock would be read), mirroring `core/scheduler/`.
 * The presentational components in `components/calendar/` consume this API;
 * the view-level screens consume those components.
 */

// --- Geometry (vertical time axis, zoom, current-time line) ---
export {
  MS_PER_MIN,
  MS_PER_HOUR,
  MS_PER_DAY,
  MIN_BLOCK_HEIGHT,
  ZOOM_STOPS_PX_PER_HOUR,
  DEFAULT_PX_PER_HOUR,
  pxPerMinFromHour,
  nearestZoomStop,
  stepZoom,
  blockGeometry,
  yForInstant,
  instantForY,
  currentTimeTop,
  durationMin,
  snapToGrid,
} from './geometry'
export type { BlockGeometry, ZoomPxPerHour } from './geometry'

// --- Overlap layout (interval-graph columns, PRD §9.8) ---
export { layoutDay, groupByCluster, spansOverlap } from './layout'
export type {
  TimeSpanItem,
  LaidOutItem,
  LayoutOptions,
} from './layout'
