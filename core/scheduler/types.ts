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
 * (SchedulingHours / quiet hours) are minutes-from-midnight,
 * matching `types/index.ts` conventions.
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
 */
export interface FreeInterval {
  /** Epoch ms, inclusive. */
  start: number
  /** Epoch ms, exclusive. */
  end: number
}

/** A half-open span on the absolute timeline, in epoch ms. Internal helper shape. */
export interface Span {
  start: number
  end: number
}

/** Slack classification for a task's deadline pressure (PRD §9.5.5). */
export type SlackColor = 'green' | 'amber' | 'red'

/**
 * Machine-readable classification of why a task was reported unschedulable
 * (PRD FR-20). `reason` is always the human-facing prose; `kind` is what the
 * UI switches on to decide which one-tap fix(es) to offer, so it never has to
 * parse prose to know whether "extend the deadline" or "make it splittable"
 * applies. Optional on `Unschedulable` for forward/back compatibility.
 */
export type UnschedulableReasonKind =
  | 'past_deadline'
  | 'no_free_time'
  | 'no_free_time_undated'
  | 'partially_placed'
  | 'zero_duration'
  | 'dependency_blocked'

/** Why a task (or part of one) could not be placed (PRD FR-20 — never silently dropped). */
export interface Unschedulable {
  taskId: string
  reason: string
  kind?: UnschedulableReasonKind
}

/**
 * Internal channel carrying a precomputed "why" from `ordering.ts`'s
 * dependency-satisfiability check through to `placement.ts`'s `placeTask`
 * (FR-20 silent-drop fix #2). `orderTasks` can no longer simply drop a
 * dependency-blocked task from its returned list (that silent exclusion was
 * the bug) — but it also can't hand the computed reason to `placeTask` via
 * `PlacementContext`, because the only place that constructs a
 * `PlacementContext` is `core/scheduler/recompute.ts`, a shared integration
 * file this workstream does not own (it also wires in Recovery + recurrence,
 * both owned by other workstreams). Tagging the returned `Task` with this
 * well-known symbol key lets the reason ride along on the SAME object
 * reference `recompute.ts`'s unmodified `for (const task of ordered)
 * placeTask(...)` loop already passes through — zero changes needed there.
 * Always a shallow clone (`{ ...task, [DEPENDENCY_BLOCKED_REASON]: reason }`),
 * never a mutation of the original — the real `Task` type in
 * `types/index.ts` is untouched, and the tag never leaves this one recompute
 * pass (a symbol-keyed property is not something any store's JSON serializer
 * would round-trip, even if a caller mistakenly tried to persist it).
 */
export const DEPENDENCY_BLOCKED_REASON = Symbol('ampora.scheduler.dependencyBlockedReason')

/** A `Task` possibly tagged with {@link DEPENDENCY_BLOCKED_REASON}. */
export type MaybeDependencyBlocked = Task & { [DEPENDENCY_BLOCKED_REASON]?: string }

/** The engine's public input bundle. Everything the algorithm needs, nothing it reads implicitly. */
export interface ScheduleInput {
  /** Tasks to consider. Keyed access is done internally; order here is irrelevant. */
  tasks: Task[]
  /** Existing placed blocks from the previous run (for stability + pinned inputs). */
  prevBlocks: ScheduledBlock[]
  /** Fixed calendar events to subtract as busy time. May be empty. */
  calEvents: CalEvent[]
  /** App settings (scheduling hours, quiet hours, workload). */
  settings: Settings
  /** The instant "now" — the engine never reads a real clock itself. */
  now: number
  /** Planning horizon in days from `now`. Defaults to {@link DEFAULT_CUTOFF_DAYS}. */
  cutoffDays?: number
  /** Workload distribution mode. Defaults to 'balanced' (PRD FR-14). */
  workload?: WorkloadMode
  /**
   * Lists keyed by id, used to resolve a task's effective scheduling hours when
   * the task itself has none: `task.schedulingHours ?? list.schedulingHours ??
   * settings.schedulingHours` (PRD FR-13, per-list override). Optional so pure
   * engine tests can omit it (list resolution simply falls through to settings).
   */
  listMap?: Record<string, List>
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
  List,
  ScheduledBlock,
  SchedulingHours,
  Settings,
  Task,
  TimeWindow,
}
