/**
 * Ampora data model — Milestone 1, Step 1 (data model foundation).
 *
 * Ground-up rebuild. This replaces the v1 model entirely (v1 used ISO date
 * strings and a different Task/Subtask shape; none of that is carried over).
 *
 * Conventions (PRD `01_PRD.md` §9.1, §9.4):
 * - Timestamps are epoch milliseconds (`number`), unless a field is explicitly
 *   documented as "minutes-from-midnight" (used for scheduling-hours / time-
 *   of-day windows, which are day-relative, not absolute instants).
 * - Cloud (Supabase) is the source of truth with a local MMKV cache (FR-87).
 *   `syncState` tracks reconciliation between the local write and the cloud.
 *
 * Source of truth for entity shape: `01_PRD.md` §9.4 "Data schema".
 * Source of truth for subtask behavior: `07_AI_Breakdown_Memory_and_Subtasks.md`
 * Part 3 — where the two docs conflict, doc 07 Part 3 wins (per project
 * decision). Notably this means `Subtask` uses `estimatedMin` / `completedAt`
 * (not the `done` / `durationMin` shape literally shown in PRD §9.4), and
 * `Task` carries `progressMin` and `completedAt` even though the PRD §9.4
 * code block omits them (required by PRD §9.15 and doc 07 Part 3.3/3.5).
 *
 * This file is types only. No scheduling engine, no Ignition/locking logic,
 * no UI. Later-milestone entities (Stakes, Learning Engine, Proof, Settings
 * enforcement) are included as types now so the schema is stable end to end,
 * but nothing here implements their behavior.
 */

// ---------------------------------------------------------------------------
// Base / shared primitives
// ---------------------------------------------------------------------------

/** Reconciliation state between the local (MMKV) copy and the cloud (Supabase) copy of an entity. */
export type SyncState = 'synced' | 'pending' | 'conflict'

/**
 * Fields every top-level, independently-synced entity carries.
 * PRD §9.4: "Every entity also has `id`, `createdAt`, `updatedAt`, `syncState`."
 * Embedded value objects (Subtask, StarterAction, TimeWindow, etc.) do NOT
 * get these — they are not synced independently, only as part of their parent.
 */
export interface BaseEntity {
  id: string
  /** Epoch ms, set once at creation. */
  createdAt: number
  /** Epoch ms, updated on every mutation. */
  updatedAt: number
  syncState: SyncState
}

/** Soft energy classification used for task requirements and user energy state (PRD §9.5.8, §9.5.3). */
export type EnergyLevel = 'low' | 'normal' | 'high'

/** Task lifecycle status (PRD §9.4). Distinct from `ScheduledBlock['status']`, which tracks a placed session. */
export type TaskStatus = 'todo' | 'doing' | 'done'

/**
 * A clock-time window expressed as minutes-from-midnight (0-1439), NOT epoch ms.
 * Used for scheduling-hours windows, quiet hours, and energy-peak windows —
 * anything that repeats daily rather than pinning an absolute instant.
 */
export interface TimeWindow {
  /** Minutes from midnight, inclusive. */
  start: number
  /** Minutes from midnight, exclusive. */
  end: number
}

/**
 * A weekly scheduling-hours template: which windows, on which day-of-week, a
 * task (or the app default) may be scheduled into (PRD §9.4, §9.5.1, §9.13).
 * `day` is 0-6, 0 = Sunday, matching `Date#getDay()` convention.
 */
export interface SchedulingHours {
  perDay: { day: number; windows: TimeWindow[] }[]
}

/**
 * Recurrence definition for repeating Tasks/Events (PRD §9.4, FR-15).
 * Note: PRD §9.4's literal type omits 'yearly' though FR-15 prose mentions it;
 * implementing exactly the §9.4 literal here (daily/weekly/monthly) since
 * that is the authoritative schema section. Extend later if FR-15 is built
 * out with a 'yearly' freq.
 */
export interface RecurrenceRule {
  freq: 'daily' | 'weekly' | 'monthly'
  /** Repeat every N units of `freq` (e.g. interval 2 + freq 'weekly' = biweekly). */
  interval: number
  /** For weekly recurrence: which days of week (0-6, 0 = Sunday). */
  byWeekday?: number[]
  /** Epoch ms. Recurrence stops on/after this instant if set. */
  until?: number
  /** Stops after this many occurrences if set. */
  count?: number
}

/**
 * Attached grounding material for source-grounded breakdown (PRD §9.4, §9.7).
 * `extractedText` holds OCR/PDF-extracted or transcribed text once resolved.
 */
export interface SourceRef {
  id: string
  type: 'text' | 'file' | 'photo' | 'voice'
  uri?: string
  extractedText?: string
}

/**
 * The "First move" — a single concrete, 2-to-5-minute starter action for a
 * task, designed to defeat activation energy (doc 07 Part 1B.4).
 * Embedded on `Task.firstMove`; not independently synced.
 */
export interface StarterAction {
  id: string
  text: string
  done: boolean
}

/**
 * An ordered checklist item inside a Task (doc 07 Part 3 — single source of
 * truth for subtask semantics; PRD §9.4 is superseded where it conflicts).
 *
 * Field names per doc 07 Part 3.12 / 2.1: `estimatedMin` (not `durationMin`)
 * and `completedAt?: number` (not a `done: boolean`). `done` is always
 * DERIVED as `completedAt != null` — see `core/task-logic.ts#isSubtaskDone`.
 * Do not add a redundant `done` field here; that would let the two fall out
 * of sync.
 *
 * Embedded value object: ordered by array position within `Task.subtasks`,
 * no `BaseEntity` sync fields of its own (it syncs as part of the parent Task).
 */
export interface Subtask {
  id: string
  title: string
  /** Minutes this step is estimated to take. Sum of these = task's rolled-up duration (doc 07 Part 3.2). */
  estimatedMin: number
  /** Epoch ms this subtask was completed, or undefined if not yet done. */
  completedAt?: number
}

// ---------------------------------------------------------------------------
// Core scheduling entities (PRD §9.4)
// ---------------------------------------------------------------------------

/**
 * A fixed calendar event: never auto-moved by the scheduling engine (PRD
 * §9.4, FR-1). May originate locally or from an external calendar sync.
 */
export interface CalEvent extends BaseEntity {
  title: string
  /** Epoch ms. */
  start: number
  /** Epoch ms. */
  end: number
  allDay?: boolean
  source: 'local' | 'google' | 'apple' | 'outlook'
  /** ID in the external calendar system, present when `source !== 'local'`. */
  externalId?: string
  /** Whether this event occupies time as "busy" for scheduling purposes (PRD §9.5.1). */
  busy: boolean
}

/**
 * A Task: a checkable to-do, optionally auto-scheduled onto the calendar.
 * PRD §9.4 (base shape) reconciled with §9.15 and doc 07 Part 3 (rollup
 * fields) and the confirmed forward-compatible scheduling fields below.
 *
 * The task, not the subtask, is the schedulable unit (doc 07 Part 3.1).
 */
export interface Task extends BaseEntity {
  title: string
  notes?: string

  /**
   * Effective duration in minutes. When `subtasks` is non-empty this is a
   * ROLLUP (sum of `subtasks[].estimatedMin`) kept in sync by
   * `core/task-logic.ts#withSyncedRollups`, not hand-edited (doc 07 Part
   * 3.2). When there are no subtasks, this is the manually-entered duration.
   */
  durationMin: number

  /**
   * Minutes of this task already completed, via completed subtasks' summed
   * `estimatedMin` (doc 07 Part 3.3). Required for partial-completion
   * scheduling (PRD FR-18) even though the PRD §9.4 literal omits it from
   * the Task type — §9.15 and doc 07 Part 3.3/3.5 require it explicitly.
   */
  progressMin: number

  /** Epoch ms hard deadline ("the real deadline", not a reminder — PRD FR-12). */
  due?: number
  autoSchedule: boolean
  listId?: string
  /** Back-reference to a Project (doc `10`); Milestone-1 stores the field only, no Project entity/logic yet. */
  projectId?: string

  /** Tag NAMES (not ids) for lightweight filtering, per confirmed decision. See also the `Tag` entity below for color/metadata. */
  tags: string[]

  subtasks: Subtask[]
  firstMove?: StarterAction

  recurrence?: RecurrenceRule
  priority?: number
  sourceRefs?: SourceRef[]

  /** Whether this task may be split into multiple scheduled sessions (PRD FR-11). */
  splittable?: boolean

  status: TaskStatus
  /**
   * Epoch ms this task was fully completed (doc 07 Part 3.5). Required
   * alongside `progressMin` per the confirmed decision, even though PRD
   * §9.4's literal Task type omits it.
   */
  completedAt?: number

  /**
   * Power-user toggle (off by default): when true, each subtask is
   * time-boxed and scheduled as its own block rather than the default of
   * one block (or split sessions) per task (doc 07 Part 3.1, 3.7).
   */
  scheduleSubtasksSeparately?: boolean

  /**
   * User-assigned position for the Tasks screen's "Manual" sort (Phase 3,
   * `app/(tabs)/tasks.tsx`). Lower sorts first. Set by
   * `taskStore.reorderTasks`; undefined until a row is dragged at least once,
   * in which case manual sort falls back to `createdAt` order.
   */
  manualOrder?: number

  // -- Forward-compatible scheduling fields (types only; no engine logic yet,
  //    engine is Milestone 2). All optional so Milestone-1 code need not set
  //    them. --

  /** Epoch ms. The task may not be scheduled before this instant (PRD §9.5.3). */
  startAfter?: number
  /** IDs of tasks that must be fully placed before this one may be scheduled (PRD FR-19). */
  dependsOn?: string[]
  /** Minimum session size in minutes when splitting (PRD FR-11, §9.5.4). */
  minBlockMin?: number
  /** Maximum session size in minutes when splitting (PRD FR-11, §9.5.4). */
  maxBlockMin?: number
  /** Minutes of empty buffer to keep before a scheduled block for this task (PRD §9.5.4). */
  bufferBeforeMin?: number
  /** Minutes of empty buffer to keep after a scheduled block for this task (PRD §9.5.4). */
  bufferAfterMin?: number
  /** Optional per-task display color token/hex, overriding list/tag color for this task's blocks (doc `02`). */
  color?: string
  /** Soft energy requirement used for energy-aware placement (PRD §9.5.3 energyMismatchPenalty). */
  energyRequired?: EnergyLevel
  /** Per-task override of which scheduling-hours windows this task may occupy (PRD FR-13). Falls back to Settings.schedulingHours when unset. */
  schedulingHours?: SchedulingHours
}

/**
 * One placed session of a Task on the calendar (PRD §9.4). A task with
 * subtasks still renders/schedules as one block per session, not one block
 * per subtask (doc 07 Part 3.7), unless `Task.scheduleSubtasksSeparately`.
 */
export interface ScheduledBlock extends BaseEntity {
  taskId: string
  /** Epoch ms. */
  start: number
  /** Epoch ms. */
  end: number
  /** True once user-dragged/resized; pinned blocks are immovable inputs to recompute (PRD §9.5.10). */
  pinned?: boolean
  status: 'planned' | 'in_progress' | 'done' | 'missed'
}

/** A user-defined list/category for organizing tasks (e.g. one per class). PRD §9.4. */
export interface List extends BaseEntity {
  name: string
  /** Color token/hex from the design system's supporting hues (doc `02`). */
  color: string
}

/**
 * A lightweight tag entity for color/metadata beyond the plain tag-name
 * strings stored on `Task.tags` (confirmed decision: tags are filtered by
 * name on Task, but a `Tag` entity exists for color and lifecycle).
 */
export interface Tag extends BaseEntity {
  name: string
  color: string
}

// ---------------------------------------------------------------------------
// Ignition and behavioral entities (PRD §9.4) — LATER MILESTONE, TYPES ONLY.
// No stores, no locking logic, no scheduling logic implemented against these
// in Milestone 1. Copied field-for-field from PRD §9.4.
// ---------------------------------------------------------------------------

/**
 * A leisure app the user has opted to be able to lock against a task (PRD
 * §9.4, FR-40). iOS stores an opaque `ApplicationToken` string, never
 * identity — `tokenOrPackage` is intentionally untyped beyond `string`.
 */
export interface StakeApp {
  id: string
  platform: 'ios' | 'android' | 'desktop'
  tokenOrPackage: string
  label?: string
  eligible: boolean
}

/**
 * A single Ignition (app-locking) session (PRD §9.4, FR-41, FR-41b).
 * Per-device and independent — a lock on one device never locks another.
 */
export interface StakeSession {
  id: string
  taskId: string
  deviceId: string
  mode: 'lock_until_start' | 'lock_until_done' | 'beat_the_clock'
  completionCondition: 'first_move' | 'subtask' | 'task'
  conditionRefId?: string
  /** Beat-the-clock: minutes the user has to start. */
  timerMinutes?: number
  /** Beat-the-clock: bounded lock duration if the timer lapses; ends early on completion (FR-41). */
  cooldownMinutes?: number
  /** Calibrated stake strength, 0..1 (PRD §9.10, FR-44). */
  strength: number
  /** Epoch ms. */
  startedAt: number
  /** Epoch ms. */
  endedAt?: number
  outcome?: 'completed' | 'panic_valve' | 'timed_out' | 'expired'
}

/** A discrete event in a stake session's lifecycle, for the Proof Log / analytics (PRD §9.4, §9.9). */
export interface LockEvent {
  id: string
  sessionId: string
  type: 'shield_on' | 'shield_off' | 'panic_valve' | 'cooldown_start' | 'cap_reached' | 'quiet_hours_release'
  /** Epoch ms. */
  at: number
}

/**
 * One observed behavioral data point feeding the Learning Engine (PRD §9.4,
 * FR-50). Powers Focus DNA, Revealed Self, Energy/State, and stake
 * calibration.
 */
export interface BehavioralSignal {
  id: string
  taskType?: string
  /** Epoch ms. */
  plannedStart?: number
  /** Epoch ms. */
  actualStart?: number
  /** 0-23. */
  hourOfDay: number
  /** 0-6, 0 = Sunday. */
  dayOfWeek: number
  completed: boolean
  context?: {
    energy?: 'low' | 'normal' | 'hyper'
    afterGym?: boolean
    sleepHours?: number
  }
  stakeOutcome?: StakeSession['outcome']
}

/**
 * "Focus DNA" — the stable, recomputed-weekly personal behavioral summary
 * (PRD §9.4, FR-51).
 */
export interface FocusProfile {
  bestWindows: { start: number; end: number; score: number }[]
  dodgedTaskTypes: string[]
  conditionsThatHelp: string[]
  ignitionPoint: number
  /** Epoch ms. */
  updatedAt: number
}

/**
 * Per-user, per-task-type breakdown personalization store (doc 07 Part 2).
 * Retrieval-augmented prompting memory, NOT model fine-tuning.
 *
 * Note: doc 07 Part 2.1 additionally specifies `avgSubtaskCount`,
 * `avgSubtaskDurationMin`, `preferenceNotes`, `styleExemplars`, and
 * `lowFidelityPatterns` on this entity (richer than the PRD §9.4 literal
 * shown below). PRD §9.4 instructs copying its own literal field-for-field
 * for this group of types, so the minimal §9.4 shape is implemented here;
 * the doc 07 fields can be added when the memory system itself is built
 * (Milestone covering FR-70), to avoid speculatively typing fields no code
 * will populate yet.
 */
export interface BreakdownMemory {
  taskTypeKey: string
  preferredGranularity?: 'fine' | 'coarse' | 'by_function'
  commonEdits: string[]
  completionFidelity: number
}

/**
 * A verification artifact for a stake's start/completion condition (PRD
 * §9.4, doc `09`). `aiVerdict` errs toward accepting (FR-78).
 */
export interface Proof {
  id: string
  sessionId: string
  method: 'focus_time' | 'photo' | 'screenshot' | 'word_count' | 'screen_aware' | 'honor'
  uri?: string
  aiVerdict?: 'pass' | 'uncertain'
  overridden?: boolean
  /** Epoch ms. */
  at: number
}

// ---------------------------------------------------------------------------
// Projects (Phase 7 — doc `10` Projects, PRD FR-82..86). A Project is the
// knowledge + chat + progress layer; it GENERATES the daily Tasks the
// scheduler places and Ignition locks against (`Task.projectId` back-refs the
// project). Additive to the model above — nothing here changes existing types.
//
// These shapes follow doc `10` §12 (kind naming, phases for deliverables,
// topic coverage+mastery for study) with `progress` modeled as a discriminated
// union keyed on `kind`, so a project's progress representation is always
// exactly the one its type implies. `Project` extends `BaseEntity` (it is an
// independently-synced top-level entity); its embedded value objects
// (ProjectFile, ChatMessage, Phase/Topic entries) do not.
// ---------------------------------------------------------------------------

/** What kind of project this is — determines progress shape and next-task logic (doc `10` §3). */
export type ProjectKind = 'deliverable' | 'study' | 'general'

/**
 * One file in a project's persistent knowledge base (doc `10` §4). Uploaded
 * PDFs, slide decks, notes, images/screenshots that stay in the project and are
 * understood collectively. `extractedText` holds the OCR/extraction result once
 * ingested; retrieval/embeddings are a later increment (doc `10` §13).
 * Embedded value object — no `BaseEntity` sync fields (syncs with the Project).
 */
export interface ProjectFile {
  id: string
  name: string
  type: 'text' | 'pdf' | 'image' | 'note'
  /** Stored file location (e.g. Supabase storage / local uri), when the file has bytes. */
  uri?: string
  /** OCR/extraction result used as grounding context and for retrieval. */
  extractedText?: string
  /** Epoch ms this file was added. */
  addedAt: number
}

/** A deliverable project's phase (doc `10` §12): linear-ish, each with a percent-complete 0..100. */
export interface ProjectPhase {
  id: string
  title: string
  /** Percent complete for this phase, 0..100. */
  pct: number
}

/** A study project's topic (doc `10` §12): coverage/mastery map entry. `mastery` is 0..1. */
export interface ProjectTopic {
  id: string
  title: string
  /** Mastery level, 0..1, updated from self-report and quiz performance (doc `10` §6). */
  mastery: number
}

/**
 * Progress representation, discriminated on `kind` so it always matches the
 * project's type (doc `10` §6):
 * - deliverable → ordered phases, each with its own percent.
 * - study → a topic coverage/mastery map.
 * - general → a single overall percent.
 */
export type ProjectProgress =
  | { kind: 'deliverable'; phases: ProjectPhase[] }
  | { kind: 'study'; topics: ProjectTopic[] }
  | { kind: 'general'; pct: number }

/**
 * One turn in a project's scoped chat (doc `10` §5). The chat is the primary
 * controller and universal repair mechanism for the project. Embedded value
 * object, ordered by array position in `Project.chat`.
 */
export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  text: string
  /** Epoch ms the message was sent. */
  at: number
}

/**
 * A Project: an ongoing AI workspace for one academic endeavor (doc `10`).
 * Holds a file knowledge base, a scoped chat, progress, project memory, and the
 * ids of the Tasks it has generated (which are the schedulable/lockable units).
 */
export interface Project extends BaseEntity {
  name: string
  kind: ProjectKind
  description?: string
  /** Optional display color token/hex; projects use the "special/premium" accent by default (doc `02`). */
  color?: string
  /** Persistent knowledge base (doc `10` §4). */
  files: ProjectFile[]
  /** Progress, shaped by `kind` (doc `10` §6). */
  progress: ProjectProgress
  /** Scoped conversational history (doc `10` §5). */
  chat: ChatMessage[]
  /** Project memory: decisions, style, weak spots — local-first, never shared-model training (doc `10` §8). */
  memory: string[]
  /** Ids of Tasks this project generated (each `Task.projectId` back-refs here — doc `10` §7). */
  taskIds: string[]
}

// ---------------------------------------------------------------------------
// Settings (PRD §9.4, §9.10, §8.11)
// ---------------------------------------------------------------------------

/**
 * App-wide settings and safety-layer configuration. PRD §9.4 defines the
 * Ignition/wellbeing fields; this also folds in the Milestone-1
 * app-preference fields the app needs day one (scheduling hours,
 * notification cadence, energy peak, display/theme, onboarding), per the
 * confirmed decision. Caps/quiet-hours/never-lock/stake-strength-bounds are
 * enforced both client- and server-side (not implemented here — types only
 * for the Ignition-related fields; Milestone 1 only reads/writes the
 * app-preference fields).
 */
export interface Settings {
  // -- PRD §9.4 Ignition / wellbeing fields (enforcement is a later milestone) --

  /** Hard ceiling on total lock minutes per day. Default 180. */
  dailyLockCapMin: number
  /** Minutes-from-midnight window; stakes auto-release during quiet hours. */
  quietHours: TimeWindow
  /** Categories that must never be lockable: phone, messages, maps, accessibility, OS settings, Ampora itself. */
  neverLockCategories: string[]
  stakeStrengthBounds: { min: number; max: number }
  subscription: {
    status: 'trial' | 'active' | 'lapsed'
    plan?: 'monthly' | 'annual'
    /** Epoch ms. */
    trialEndsAt?: number
  }

  // -- Milestone-1 app-preference fields (needed now; PRD §9.4's literal
  //    comment "plus notification, scheduling-hours, and energy preferences"
  //    is made concrete here) --

  /** The user's default weekly scheduling-hours template (PRD FR-13). Per-task `Task.schedulingHours` overrides this. */
  schedulingHours: SchedulingHours
  /** Notification rate limit, default cadence PRD FR-63 (max 1/hour baseline; task-level urgency raises this elsewhere). */
  maxNotificationsPerHour: number
  /** The user's self-reported or inferred best-focus window (PRD §3.1, §9.5.8, FR-55). */
  energyPeak: TimeWindow
  displayName?: string
  themePreference: 'light' | 'dark' | 'system'
  /** Whether the user has completed the onboarding flow (PRD §8.10). */
  onboardingComplete: boolean

  // -- Calendar UI preferences (Phase 3, PRD FR-23/FR-24). Optional so pre-
  //    existing persisted Settings load without them; the Calendar screen
  //    falls back to its own defaults (3-Day view, 60 px/hr) when unset. --

  /** Last-selected calendar view: 'day' | '3day' | 'week' | 'month' | 'agenda' (PRD FR-23). */
  calendarView?: string
  /** Last vertical time-grid zoom in px per hour, one of the FR-24 stops (40/60/80/120). */
  calendarZoomPxPerHour?: number

  // -- Scheduling defaults (Phase 7, PRD §8.11 / FR-9, FR-11, FR-14). All
  //    optional so pre-existing persisted Settings load without them; the
  //    engine and the SchedulingSettings screen fall back to these documented
  //    defaults when unset. These are the app-wide DEFAULTS a new auto-scheduled
  //    task inherits; a task can still override each via its own fields
  //    (`Task.bufferBeforeMin`, `Task.minBlockMin`, etc.). --

  /** Default minutes of empty buffer kept before a scheduled block (PRD §9.5.4). Default 0. */
  defaultBufferBeforeMin?: number
  /** Default minutes of empty buffer kept after a scheduled block (PRD §9.5.4). Default 0. */
  defaultBufferAfterMin?: number
  /** Default: may new auto-scheduled tasks be split into multiple sessions (PRD FR-11). Default true. */
  defaultSplittable?: boolean
  /** Default minimum session size in minutes when splitting (PRD FR-11, §9.5.4). Default 30. */
  defaultMinBlockMin?: number
  /** Default maximum session size in minutes when splitting (PRD FR-11, §9.5.4). Default 120. */
  defaultMaxBlockMin?: number
  /**
   * How the engine spreads a task's sessions across the days before its Due
   * (PRD FR-14, §9.5.3): 'balanced' = even daily load; 'frontload' = as soon as
   * possible. Default 'balanced'. A task near/past Due auto-switches to
   * front-load regardless (FR-14).
   */
  workloadDistribution?: 'balanced' | 'frontload'
  /**
   * Auto-schedule horizon in weeks (PRD §8.11 "Auto-schedule cutoff weeks"):
   * tasks whose Due is beyond this many weeks out are not placed on the
   * calendar yet (they still exist, just aren't scheduled until they come into
   * range). Default 4.
   */
  autoScheduleCutoffWeeks?: number
}

// ---------------------------------------------------------------------------
// Agentic project-chat tool actions (Phase 5 AI Round B — doc `10` §5, doc
// `08` portable engine). The project chat is an agentic PLANNER: it can
// organize the study plan AND act on it via a small, closed vocabulary of
// tool calls that the CLIENT validates and applies against the existing store
// APIs (no MCP server this round — tools execute on-device, local-first).
//
// The wire contract is `ai-project-chat` -> { reply, actions: ToolAction[] };
// each action is validated (shape + referenced ids must exist) and dropped
// silently if invalid, then applied via taskStore / projectStore, with an
// inverse captured so the whole turn is one-tap Undoable. Field names below
// match the REAL entity fields (Subtask uses `estimatedMin`; the first move is
// a `StarterAction` whose copy lives in `.text`; a task's earliest-start is
// `Task.startAfter`; a deliverable phase is `ProjectPhase{title,pct}` with its
// id assigned by the store).
// ---------------------------------------------------------------------------

/**
 * A single agent action proposed by the project chat, applied client-side.
 * Discriminated on `type`. All ids reference existing entities; unknown or
 * malformed actions are dropped by the validator (`core/ai-actions.ts`).
 */
export type ToolAction =
  /** Create a new task, optionally linked to a project, with a duration/deadline. */
  | { type: 'create_task'; title: string; projectId?: string; durationMin?: number; due?: number }
  /** Patch an existing task's title/deadline/duration. */
  | { type: 'update_task'; taskId: string; patch: { title?: string; due?: number; durationMin?: number } }
  /** Mark an existing task complete. */
  | { type: 'complete_task'; taskId: string }
  /** Append an execution checklist to a task (each step carries a minutes estimate). */
  | { type: 'create_subtasks'; taskId: string; subtasks: { title: string; estimatedMin: number }[] }
  /** Set the task's "first move" (the 2-to-5-minute starter action). Stored on `Task.firstMove.text`. */
  | { type: 'set_first_move'; taskId: string; text: string }
  /** A soft scheduling nudge: earliest-start (`Task.startAfter`) and/or deadline hint. */
  | { type: 'schedule_hint'; taskId: string; startAfter?: number; due?: number }
  /** Add a phase to a deliverable project's progress (`ProjectPhase`, id assigned by the store). */
  | { type: 'add_project_phase'; projectId: string; phase: { title: string; pct: number } }
  /** Replace the project's memory (decisions / style / weak spots — local-first, never shared-model training). */
  | { type: 'update_project_memory'; projectId: string; entries: string[] }
