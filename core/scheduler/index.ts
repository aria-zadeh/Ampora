/**
 * Ampora on-device scheduling engine — public API (PRD §9.5).
 *
 * PURE + PORTABLE: nothing under `core/scheduler/` imports react-native, expo,
 * or MMKV. The engine is deterministic given its inputs plus an explicit
 * `now: number`, so it runs identically on-device and (later) in a Supabase
 * Edge Function (PRD §9.16), and every piece is unit-testable in plain Node.
 *
 * Primary entry point: {@link recompute}. Slack helpers: {@link slackColor},
 * {@link slackRatio}. Free-time construction is exposed for calendar/preview
 * use: {@link buildFreeIntervals}.
 */

// --- Primary API ---
export { recompute } from './recompute'
export { buildFreeIntervals } from './freeTime'
export { orderTasks, orderUndatedBackfill } from './ordering'
export { sessionSizes } from './sessionSizing'

// --- Slack / deadline utilities (§9.5.5) ---
export { slackColor, slackRatio, remainingMinutes, isNearOrOverDue } from './slack'

// --- Types ---
export type {
  ScheduleInput,
  ScheduleResult,
  FreeInterval,
  Unschedulable,
  SlackColor,
  WorkloadMode,
} from './types'
export { DEFAULT_CUTOFF_DAYS } from './types'
