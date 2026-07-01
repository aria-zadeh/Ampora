/**
 * Scheduling engine — internal + public types (PRD §9.5).
 *
 * PORTABILITY: this whole folder is pure TypeScript. No react-native, expo,
 * MMKV, or Node-only imports anywhere under `core/scheduler/`. The engine is
 * deterministic given its inputs plus an explicit `now: number` — never reads
 * a clock, never mutates its inputs. This lets it run identically on-device
 * and (later) in a Supabase Edge Function (PRD §9.16), and makes every unit
 * testable in plain Node.
 *
 * All absolute instants are epoch milliseconds. All clock-time windows
 * (SchedulingHours / quiet hours / energy peak) are minutes-from-midnight,
 * matching `types/index.ts` conventions.
 */

import type {
  CalEvent,
  EnergyLevel,
  ScheduledBlock,
  SchedulingHours,
  Settings,
  Task,
  TimeWindow,
} from '@/types'

/** Default horizon the engine plans over, in days (PRD §9.5.1 "now to cutoff"). */
export const DEFAULT_CUTOFF_DAYS = 14

/** Milliseconds in one minute / hour / day, named to keep the arithmetic readable. */
export const MS_PER_MIN = 60_000
export const MS_PER_HOUR = 3_600_000
export const MS_PER_DAY = 86_400_000

/** Workload distribution mode (PRD FR-14 / §9.5.3). */
export type WorkloadMode = 'balanced' | 'frontload'

/**
 * A contiguous span of usable time on the planning timeline (PRD §9.5.1).
 * `energyScore` in 0..1 comes from `Settings.energyPeak` overlap (0.5 when a
 * span has no overlap and no better signal — the PRD's "default 0.5").
 */
export interface FreeInterval {
  /** Epoch ms, inclusive. */
  start: number
  /** Epoch ms, exclusive. */
  end: number
  /** 0..1 energy suitability for this span's time-of-day. */
  energyScore: number
}

/** A half-open span on the absolute timeline, in epoch ms. Internal helper shape. */
export interface Span {
  start: number
  end: number
}

/** Slack classification for a task's deadline pressure (PRD §9.5.5). */
export type SlackColor = 'green' | 'amber' | 'red'

/** Why a task (or part of one) could not be placed (PRD FR-20 — never silently dropped). */
export interface Unschedulable {
  taskId: string
  reason: string
}

/** The engine's public input bundle. Everything the algorithm needs, nothing it reads implicitly. */
export interface ScheduleInput {
  /** Tasks to consider. Keyed access is done internally; order here is irrelevant. */
  tasks: Task[]
  /** Existing placed blocks from the previous run (for stability + pinned inputs). */
  prevBlocks: ScheduledBlock[]
  /** Fixed calendar events to subtract as busy time. May be empty. */
  calEvents: CalEvent[]
  /** App settings (scheduling hours, quiet hours, energy peak, workload). */
  settings: Settings
  /** The instant "now" — the engine never reads a real clock itself. */
  now: number
  /** Planning horizon in days from `now`. Defaults to {@link DEFAULT_CUTOFF_DAYS}. */
  cutoffDays?: number
  /** Workload distribution mode. Defaults to 'balanced' (PRD FR-14). */
  workload?: WorkloadMode
}

/** The engine's public output (PRD §9.5.10 stability + FR-20 unschedulable list). */
export interface ScheduleResult {
  blocks: ScheduledBlock[]
  unschedulable: Unschedulable[]
}

// Re-export the model types the engine's public surface references, so callers
// can import them from one place.
export type {
  CalEvent,
  EnergyLevel,
  ScheduledBlock,
  SchedulingHours,
  Settings,
  Task,
  TimeWindow,
}
