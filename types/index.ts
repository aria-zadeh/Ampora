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
 * Recurrence definition for repeating Tasks/Events (PRD §9.4, FR-15, FR-16).
 * Note: PRD §9.4's literal type omits 'yearly' though FR-15 prose mentions it;
 * implementing exactly the §9.4 literal here (daily/weekly/monthly) since
 * that is the authoritative schema section. Extend later if FR-15 is built
 * out with a 'yearly' freq.
 *
 * Occurrence expansion (daily/weekly/monthly, every-N, by-weekday, all three
 * end conditions) lives in `core/recurrence.ts` — pure, portable, no I/O.
 *
 * IMPORTANT semantics of `count`: it is always "occurrences remaining
 * starting at (and including) the task's CURRENT `due`", not a fixed lifetime
 * total pinned to when the rule was first created. At creation the two are
 * identical (nothing has happened yet); `core/recurrence.ts#rollToNextOccurrence`
 * decrements it by exactly 1 on every genuine completion so it stays accurate
 * across many rollovers without needing a separate stored "original anchor" or
 * "occurrences so far" field on `Task`. `core/scheduler/recompute.ts` and
 * `core/recovery.ts` both rely on this same interpretation.
 */
export interface RecurrenceRule {
  freq: 'daily' | 'weekly' | 'monthly'
  /** Repeat every N units of `freq` (e.g. interval 2 + freq 'weekly' = biweekly). */
  interval: number
  /**
   * For weekly recurrence: which days of week (0-6, 0 = Sunday) this repeats
   * on (defaults to the anchor's own weekday when unset). For daily
   * recurrence: an OPTIONAL restriction to only these weekdays — this is how
   * "every weekday" is represented (`freq:'daily', interval:1,
   * byWeekday:[1,2,3,4,5]`). Not meaningful for monthly recurrence (ignored).
   */
  byWeekday?: number[]
  /** Epoch ms. Recurrence stops on/after this instant if set. */
  until?: number
  /** Stops after this many occurrences if set (see the `count` semantics note above). */
  count?: number
  /**
   * What the recurrence is anchored to (FR-15 "from-completion option"):
   * - `'schedule'` (default when unset): the next occurrence's date comes
   *   purely from the calendar rule (anchor date + N * interval),
   *   independent of when the prior occurrence actually got done — "every
   *   Monday" keeps landing on Monday even if you finish late.
   * - `'completion'`: the next occurrence's date is computed from when the
   *   CURRENT occurrence was actually completed (the chore case: "every 3
   *   days after I finish it"). `byWeekday` is not meaningful in this mode
   *   (there is no fixed weekday to align to when the cadence floats with
   *   actual completion time) and is ignored.
   */
  anchor?: 'schedule' | 'completion'
  /**
   * Occurrence dates to skip without breaking the series (FR-15
   * "exceptions"). Each entry is the epoch-ms LOCAL MIDNIGHT of the skipped
   * occurrence's calendar date — matching `Occurrence.date` as produced by
   * `core/recurrence.ts#expandOccurrences`, not the occurrence's final
   * windowed start time.
   */
  exceptions?: number[]
  /**
   * A per-occurrence clock-time window (minutes-from-midnight, the same
   * `TimeWindow` convention as scheduling hours / quiet hours) each
   * occurrence should be scheduled within on its date — e.g. "every day
   * between 17:00 and 18:00". Falls back to the task's own scheduling hours /
   * due-date placement when unset.
   */
  startWindow?: TimeWindow
  /**
   * FR-16: missed repeating occurrences default to DROP (do not stack two on
   * the next occurrence). Set true to opt into carrying a missed occurrence's
   * checklist/progress forward into the next one instead of resetting it to a
   * fresh template. Default false/undefined = drop-missed.
   */
  carryForward?: boolean
}

/**
 * Attached grounding material for source-grounded breakdown (PRD §9.4, §9.7).
 * `extractedText` holds OCR/PDF-extracted text once resolved. Launch supports
 * simple source grounding only — paste text, or attach a single document
 * (`V2_Changes.md` §5 "Multi-modal source attachment"); photo/voice sources
 * are deferred.
 */
export interface SourceRef {
  id: string
  type: 'text' | 'file'
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
  /**
   * True for a detail-less quick/voice capture that is missing a duration
   * and/or a due date (PRD FR-5 "Inbox for detail-less quick capture; Inbox
   * items are not scheduled until given a duration and due date"). The
   * scheduler (`core/scheduler/ordering.ts`) only ever looks at
   * `autoSchedule`/`due`, so this flag is how the TASK MODEL — not the
   * engine — keeps a bare capture out of the undated-backfill pass: while
   * `isInbox` is true, `autoSchedule` is forced false at creation
   * (`store/taskStore.ts#createTask`). The moment the task gains BOTH a
   * duration and a due date — via the editor, the Tasks tab's "Schedule"
   * swipe action, or quick-add/voice parsing that supplied both up front —
   * `store/taskStore.ts#updateTask` promotes it: `autoSchedule` flips to
   * true and `isInbox` clears, for good.
   *
   * This is deliberately distinct from a task the user explicitly marked
   * fixed (`autoSchedule: false` chosen on purpose, e.g. in the full task
   * editor) or explicitly opted into undated backfill (PRD §9.5.8:
   * `autoSchedule: true` with no due, also chosen on purpose) — both of
   * those set `autoSchedule` explicitly at creation, so `isInbox` is false
   * for them from the start and this flag never touches them again.
   */
  isInbox?: boolean
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
  /**
   * Optional per-list override of which scheduling-hours windows tasks in this
   * list may occupy (PRD FR-13). Resolution order is
   * `Task.schedulingHours ?? List.schedulingHours ?? Settings.schedulingHours`,
   * so a task's own override still wins, then its list's, then the app default.
   */
  schedulingHours?: SchedulingHours
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
 * What `applyShield` actually shields (doc `05` §7). Deliberately opaque: on
 * iOS these are ApplicationToken / ActivityCategoryToken / WebDomainToken
 * strings that Ampora can shield but can never resolve back to an app
 * identity, so the UI shows a COUNT, never names (FR-40, NFR-4).
 */
export interface StakeSelection {
  platform: 'ios' | 'android' | 'web'
  applicationTokens: string[]
  categoryTokens: string[]
  webDomainTokens: string[]
  /**
   * Shown as "3 apps on the line". STORED, not derived: a keyed native picker
   * may report a count we cannot recompute from the opaque tokens.
   */
  count: number
  /** Handle for the native keyed picker, so the selection can be re-read from the App Group. */
  selectionId?: string
  /** Epoch ms the selection was picked, for token-mismatch diagnostics (doc `05` §3.6). */
  pickedAt: number
}

/**
 * One Ignition session (PRD §9.4, §9.9, FR-41; doc `04` §8). Per-device and
 * independent (FR-41b), and only ONE may be active at a time (FR-41c).
 *
 * The unit of the lock is a FOCUS SESSION, which is what fixes the two failure
 * modes of the old model: lock-until-start leaked (doing the 2-minute first
 * move handed the apps back), and lock-until-done trapped (a real task runs
 * longer than the wellbeing caps allow anyone to be locked).
 */
export interface StakeSession {
  id: string
  taskId: string
  deviceId: string

  /**
   * `session` (default): locked for the focus-session length, unlocked by focus
   * time SERVED IN THE FOREGROUND (FR-77b). `until_done` (opt-in, short tasks
   * only): locked until a photo/screenshot passes a lenient plausibility check;
   * if the single-session cap is hit first the lock converts to a normal
   * session release (`session_served`). Wellbeing always wins (doc `04` §2/§7).
   */
  hold: 'session' | 'until_done'

  /** `manual` = the user taps Start. `scheduled` = auto-arms at `scheduledAt` (FR-41a). */
  trigger: 'manual' | 'scheduled'

  /** hold='session' only. Default 45, clamped 15..50 (FR-41, §9.10 single-session cap). */
  sessionMin?: number
  /** Scheduled only: arm anyway if not started within X minutes of the cue (FR-41a). */
  startWindowMin?: number
  /** Scheduled trigger time, epoch ms. */
  scheduledAt?: number

  /** How the unlock is confirmed (FR-77). The session hold uses `focus_time`. */
  verification: 'honor' | 'focus_time' | 'photo' | 'screenshot'

  /** 0..1. A fixed sensible default plus one user control — NEVER auto-calibrated (FR-44). */
  strength: number

  /**
   * Epoch ms the lock actually armed. OPTIONAL because a `scheduled` stake
   * exists — persisted and cued — before it ever starts.
   */
  startedAt?: number
  /** Epoch ms. */
  endedAt?: number

  /** Foreground focus seconds served. The unlock currency for hold='session' (FR-77b). */
  focusSec?: number

  outcome?:
    /** until_done proof passed, or the task was completed during the session. */
    | 'completed'
    | 'panic_valve'
    /** A scheduled cue lapsed and its arm window closed without arming. */
    | 'timed_out'
    /** Daily cap / quiet hours / fail-safe release. */
    | 'expired'
    /** The session timer completed, or an until_done hold hit the single-session cap. */
    | 'session_served'
}

/** A discrete event in a stake session's lifecycle, for the Proof Log / analytics (PRD §9.4, §9.9). */
export interface LockEvent {
  id: string
  sessionId: string
  type:
    | 'shield_on'
    | 'shield_off'
    | 'panic_valve'
    /** The required focus time was served (hold='session' unlock, §9.9). */
    | 'session_complete'
    /** A scheduled trigger armed the lock (FR-41a). */
    | 'auto_arm'
    | 'cap_reached'
    | 'quiet_hours_release'
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
 * A verification artifact for a stake's unlock (PRD §9.4, FR-77, doc `04` §4).
 *
 * THREE tiers, four method values: honor, focus-time (the default and the
 * backbone of the session hold), and image proof as photo or screenshot.
 * Word-count and screen-activity verification are deferred (`V2_Changes.md`
 * §3); a persisted `word_count` / `screen_aware` row is REMAPPED, never
 * dropped, by `store/migrations/proofs.ts` — the Proof Log is the user's own
 * record of work done. `aiVerdict` errs toward accepting (FR-78).
 */
export interface Proof {
  id: string
  sessionId: string
  method: 'honor' | 'focus_time' | 'photo' | 'screenshot'
  uri?: string
  /** Lenient: only 'uncertain' is ever surfaced, and an error reads as 'pass' (FR-78). */
  aiVerdict?: 'pass' | 'uncertain'
  overridden?: boolean
  /** Epoch ms. */
  at: number
}

/**
 * A single on-device analytics event (PRD §10 "On-device event log"). Powers
 * the two headline launch metrics only: session completion rate and
 * time-to-start (median reminder/First-move-tap to first action). `type` is a
 * free-form string tag (e.g. `'first_action'`, `'session_completed'`) rather
 * than a closed union, since this is a lightweight local log, not a typed
 * domain model — deliberately NOT a revival of the Learning Engine's
 * `BehavioralSignal` (no derived profiles, no learning).
 */
export interface AppEvent {
  id: string
  type: string
  /** Epoch ms. */
  at: number
}

// ---------------------------------------------------------------------------
// Projects (doc `06` Projects, PRD FR-82..85, FR-90). Deliberately thin: a
// Project is an ordered phase list, one optional context line, and a percent
// bar. Its only job is to generate one normal, schedulable Task per active
// day (FR-84, `Task.projectId` back-refs here) — no file library, no project
// chat, no ToolAction pipeline, no per-topic mastery tracking (all deferred,
// `V2_Changes.md` §6). `Project` extends `BaseEntity` (an independently-
// synced top-level entity); `Phase` is an embedded value object with no sync
// fields of its own — it syncs with the Project.
// ---------------------------------------------------------------------------

/** What kind of project this is — shapes what the phase list means (doc `06` §3). */
export type ProjectKind = 'deliverable' | 'study'

/**
 * One ordered step in a project's phase list (doc `06` §9). For a deliverable
 * this is a stage (Research, Outline, Draft, Revise, Final); for a study
 * project it is a topic on the coverage list. Study projects are done-or-not
 * per topic at launch — per-topic mastery tracking is deferred.
 */
export interface Phase {
  id: string
  title: string
  done: boolean
  /** Position in the ordered list, ascending. */
  order: number
}

/**
 * A Project (doc `06`): the thin structure-and-progress layer over an ordered
 * phase list. It generates one normal, schedulable Task per active day
 * (FR-84); the generated Tasks are what the scheduler places and Ignition
 * locks against — never the project itself (doc `06` §6).
 */
export interface Project extends BaseEntity {
  title: string
  kind: ProjectKind
  /**
   * Due date or target date, epoch ms. Present in doc `06` §9 but missing
   * from the PRD §9.4 code snippet (`type Project = { id, title, kind,
   * contextLine?, phases, percent }` — no `deadline`) — kept here per doc
   * `06`, which is more detailed and more recent; the PRD snippet should be
   * reconciled to include it.
   */
  deadline?: number
  /**
   * A single optional paragraph of grounding context (doc `06` §2), e.g. "MLA
   * format, topic is Cold War containment, 5 pages" — carries roughly 90% of
   * what the deferred project knowledge base was for. Not a file system, not
   * a chat.
   */
  contextLine?: string
  /** Ordered phase (or, for a study project, topic) list, drafted by AI at creation and editable at any time like a task breakdown. */
  phases: Phase[]
  /** Completed phases plus the fraction of the current phase, 0..100 (doc `06` §5). */
  percent: number
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

  /** Hard ceiling on total lock minutes per day. Default 180, user-lowerable (FR-46). */
  dailyLockCapMin: number
  /**
   * Hard ceiling on ONE session's lock minutes. Default 50 (§9.10), so the
   * daily cap is hard to hit by accident and an `until_done` hold can never
   * become a marathon — it converts to a normal session release at this cap.
   */
  singleSessionCapMin: number
  /** Default focus-session length in minutes for a new stake. Default 45, clamped 15..`singleSessionCapMin` (FR-41). */
  defaultSessionMin: number
  /** Minutes-from-midnight window; stakes auto-release during quiet hours. */
  quietHours: TimeWindow
  /** Categories that must never be lockable: phone, messages, maps, accessibility, OS settings, Ampora itself. */
  neverLockCategories: string[]
  /**
   * The user's single stake-strength control, 0..1 (FR-44). Default 0.6.
   * De-escalation lowers it; nothing ever auto-raises it. Replaces the old
   * `stakeStrengthBounds` — the bounds are a code constant
   * (`core/blocking/limits.ts#STAKE_STRENGTH_BOUNDS`), not user data.
   */
  stakeStrength: number
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
  /**
   * Per-kind reminder toggles (PRD FR-65 "expose every configurable value").
   * Optional so pre-existing persisted Settings load without it; every kind
   * reads as ON when unset (`services/notifications.ts` treats a missing key
   * as enabled), so this is additive and never silently mutes an existing
   * user. Gates which of the three proactive kinds `services/notifications.ts`
   * will ever build a spec for — "Completion celebrate" is a direct response
   * to the user finishing a task, not a proactive nudge, so it is not gated
   * here.
   */
  reminderKinds?: {
    /** "Ready for a first move?" — energy-peak start nudge. Default true. */
    start?: boolean
    /** "Heads up — due soon" — 12h-before-deadline nudge. Default true. */
    deadline?: boolean
    /** "Still here when you are" — 24h-untouched nudge. Default true. */
    motivation?: boolean
  }
  /**
   * Whether the one-time "notifications are off" nudge in Settings has been
   * dismissed. Set once the user taps Dismiss/Skip on that card so it never
   * nags again, even if permission stays denied (PRD §8.9 anti-nag rule).
   */
  notificationNudgeDismissed?: boolean
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
// `08` portable engine). CUT FOR LAUNCH (`V2_Changes.md` §6 "Project chat / AI
// assistant with ToolActions") — the validator/executor (`core/ai-actions.ts`)
// and the chat UI (`components/projects/ProjectChat.tsx`) are removed. The type
// is kept, unused, as the shape to revive against if/when the project chat
// returns; nothing in the app constructs or consumes a `ToolAction` today.
// ---------------------------------------------------------------------------

/**
 * A single agent action the (currently cut) project chat could propose,
 * applied client-side. Discriminated on `type`. Field names match the REAL
 * entity fields (Subtask uses `estimatedMin`; the first move is a
 * `StarterAction` whose copy lives in `.text`; a task's earliest-start is
 * `Task.startAfter`; a deliverable phase is `ProjectPhase{title,pct}` with its
 * id assigned by the store).
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
