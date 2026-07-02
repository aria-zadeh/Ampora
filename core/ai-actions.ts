/**
 * Agentic tool-action validator + executor (Phase 5 AI Round B — doc `10` §5,
 * doc `08` portable engine).
 *
 * The project chat is an agentic PLANNER: `ai-project-chat` returns
 * `{ reply, actions: ToolAction[] }`, and the CLIENT is what actually applies
 * those actions (no MCP server this round — tools execute on-device,
 * local-first). This module is the trust boundary between untrusted model
 * output and the app's stores:
 *
 *  1. VALIDATE — every action is checked for a well-formed shape AND that any
 *     entity ids it references actually exist. Anything unknown, malformed, or
 *     dangling is dropped SILENTLY (never surfaced as an AI error — the reply
 *     text still shows). A single bad action never aborts the good ones.
 *  2. EXECUTE — valid actions are applied through the EXISTING store APIs
 *     supplied in `deps` (taskStore.createTask/updateTask/completeTask/addSubtask,
 *     projectStore.updateProject/setProgress/addPhase/updateMemory, ...).
 *  3. INVERT — before each mutation we snapshot exactly what we need to undo it,
 *     and accumulate inverse thunks. The returned `undo()` runs them in reverse
 *     so the whole turn reverts in one tap (created tasks deleted, patched
 *     fields restored, completed tasks reopened, added subtasks removed, memory
 *     and phases rolled back).
 *
 * Pure/testable: it takes its dependencies as `deps` rather than importing the
 * Zustand singletons, so a test can pass fakes and assert on the recorded calls
 * and the inverse. `services/aiProjects.ts` builds the real `deps` from
 * `useTaskStore.getState()` / `useProjectStore.getState()`.
 *
 * Portability contract (PRD §9.16): no react-native / expo / MMKV imports; it
 * imports only shared types and `core/id`.
 */

import { newId } from '@/core/id'
import type { Project, StarterAction, Subtask, Task, ToolAction } from '@/types'

// ---------------------------------------------------------------------------
// Dependency surface — the minimal slice of the two stores this module needs.
// Kept structural (plain function fields) so callers can pass either the real
// Zustand state or a test fake. Signatures match the real store methods.
// ---------------------------------------------------------------------------

/** The store methods `validateAndExecuteActions` drives, injected by the caller. */
export interface ActionDeps {
  /** Look up a task by id (returns undefined if it doesn't exist). Used for id validation + snapshots. */
  getTask: (id: string) => Task | undefined
  /** Look up a project by id (returns undefined if it doesn't exist). */
  getProject: (id: string) => Project | undefined

  createTask: (
    partial: Partial<Omit<Task, 'id' | 'createdAt' | 'updatedAt' | 'syncState'>> & Pick<Task, 'title'>
  ) => Task
  updateTask: (id: string, patch: Partial<Omit<Task, 'id' | 'createdAt'>>) => void
  deleteTask: (id: string) => void
  completeTask: (id: string) => void
  reopenTask: (id: string) => void
  addSubtask: (id: string, subtask: Omit<Subtask, 'id'> & { id?: string }) => void
  removeSubtask: (id: string, subtaskId: string) => void

  updateProject: (id: string, patch: Partial<Omit<Project, 'id' | 'createdAt'>>) => void
  addPhase: (id: string, phase: { title: string; pct: number }) => void
  updateMemory: (id: string, entries: string[]) => void
}

/** Result of applying a batch of tool actions. */
export interface ExecuteResult {
  /** The actions that passed validation and were applied, in order. */
  executed: ToolAction[]
  /** Reverts every applied action (in reverse order). Null when nothing was applied. Idempotent. */
  undo: (() => void) | null
  /** A short, human confirmation of what changed, e.g. "Added 3 tasks and set a first move". */
  summary: string
}

// ---------------------------------------------------------------------------
// Small validation primitives (manual, Zod-style — no new deps)
// ---------------------------------------------------------------------------

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0
}

/** A finite, positive minutes value, or undefined. */
function asPosMinutes(v: unknown): number | undefined {
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) && n > 0 ? Math.round(n) : undefined
}

/** A finite epoch-ms timestamp, or undefined. */
function asEpochMs(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined
}

// ---------------------------------------------------------------------------
// Per-action application. Each returns an inverse thunk on success, or null to
// signal "invalid / dropped". Mutations happen via `deps`; snapshots for undo
// are taken BEFORE mutating.
// ---------------------------------------------------------------------------

type Inverse = () => void

function applyOne(action: unknown, deps: ActionDeps): { normalized: ToolAction; inverse: Inverse } | null {
  if (!isObject(action) || typeof action.type !== 'string') return null

  switch (action.type) {
    // -- create_task ----------------------------------------------------------
    case 'create_task': {
      if (!isNonEmptyString(action.title)) return null
      const projectId = isNonEmptyString(action.projectId) ? action.projectId : undefined
      // If a projectId is named it must exist (dangling refs are dropped).
      if (projectId && !deps.getProject(projectId)) return null

      const durationMin = asPosMinutes(action.durationMin)
      const due = asEpochMs(action.due)
      const created = deps.createTask({
        title: action.title.trim(),
        projectId,
        ...(durationMin != null ? { durationMin } : {}),
        ...(due != null ? { due } : {}),
        autoSchedule: true,
      })
      const normalized: ToolAction = {
        type: 'create_task',
        title: action.title.trim(),
        ...(projectId ? { projectId } : {}),
        ...(durationMin != null ? { durationMin } : {}),
        ...(due != null ? { due } : {}),
      }
      return { normalized, inverse: () => deps.deleteTask(created.id) }
    }

    // -- update_task ----------------------------------------------------------
    case 'update_task': {
      if (!isNonEmptyString(action.taskId)) return null
      const task = deps.getTask(action.taskId)
      if (!task) return null
      if (!isObject(action.patch)) return null

      const patch: { title?: string; due?: number; durationMin?: number } = {}
      if (isNonEmptyString(action.patch.title)) patch.title = action.patch.title.trim()
      const due = asEpochMs(action.patch.due)
      if (due != null) patch.due = due
      const durationMin = asPosMinutes(action.patch.durationMin)
      if (durationMin != null) patch.durationMin = durationMin
      // Nothing usable in the patch -> drop.
      if (Object.keys(patch).length === 0) return null

      // Snapshot the exact prior values of the fields we touch, so undo restores
      // them precisely (including clearing a field we set that was undefined).
      const prior: Partial<Task> = {}
      if ('title' in patch) prior.title = task.title
      if ('due' in patch) prior.due = task.due
      if ('durationMin' in patch) prior.durationMin = task.durationMin

      deps.updateTask(task.id, patch)
      return {
        normalized: { type: 'update_task', taskId: task.id, patch },
        inverse: () => deps.updateTask(task.id, prior),
      }
    }

    // -- complete_task --------------------------------------------------------
    case 'complete_task': {
      if (!isNonEmptyString(action.taskId)) return null
      const task = deps.getTask(action.taskId)
      if (!task) return null
      // Already done -> no-op (and nothing to undo).
      if (task.status === 'done') return null

      // completeTask also marks every incomplete subtask done and re-rolls
      // progress (task-logic.ts); reopenTask does NOT revert that. Snapshot the
      // full prior completion state so undo restores it exactly, not just status.
      const prior: Partial<Task> = {
        status: task.status,
        completedAt: task.completedAt,
        subtasks: task.subtasks,
        progressMin: task.progressMin,
      }
      deps.completeTask(task.id)
      return {
        normalized: { type: 'complete_task', taskId: task.id },
        inverse: () => deps.updateTask(task.id, prior),
      }
    }

    // -- create_subtasks ------------------------------------------------------
    case 'create_subtasks': {
      if (!isNonEmptyString(action.taskId)) return null
      const task = deps.getTask(action.taskId)
      if (!task) return null
      const rawSubs = Array.isArray(action.subtasks) ? action.subtasks : []
      const subtasks = rawSubs
        .map((s): { title: string; estimatedMin: number } | null => {
          if (!isObject(s) || !isNonEmptyString(s.title)) return null
          const est = asPosMinutes(s.estimatedMin) ?? 15
          return { title: s.title.trim(), estimatedMin: est }
        })
        .filter((s): s is { title: string; estimatedMin: number } => s != null)
        .slice(0, 8) // doc 07: max 8 subtasks
      if (subtasks.length === 0) return null

      // Pre-generate ids so the inverse can remove exactly what we add.
      const withIds: Subtask[] = subtasks.map((s) => ({ id: newId(), ...s }))
      for (const s of withIds) deps.addSubtask(task.id, s)
      return {
        normalized: { type: 'create_subtasks', taskId: task.id, subtasks },
        inverse: () => {
          for (const s of withIds) deps.removeSubtask(task.id, s.id)
        },
      }
    }

    // -- set_first_move -------------------------------------------------------
    case 'set_first_move': {
      if (!isNonEmptyString(action.taskId)) return null
      const task = deps.getTask(action.taskId)
      if (!task) return null
      if (!isNonEmptyString(action.text)) return null

      const priorFirstMove = task.firstMove
      const firstMove: StarterAction = { id: newId(), text: action.text.trim(), done: false }
      deps.updateTask(task.id, { firstMove })
      return {
        normalized: { type: 'set_first_move', taskId: task.id, text: firstMove.text },
        inverse: () => deps.updateTask(task.id, { firstMove: priorFirstMove }),
      }
    }

    // -- schedule_hint --------------------------------------------------------
    case 'schedule_hint': {
      if (!isNonEmptyString(action.taskId)) return null
      const task = deps.getTask(action.taskId)
      if (!task) return null
      const startAfter = asEpochMs(action.startAfter)
      const due = asEpochMs(action.due)
      if (startAfter == null && due == null) return null

      const patch: Partial<Task> = {}
      const prior: Partial<Task> = {}
      if (startAfter != null) {
        patch.startAfter = startAfter
        prior.startAfter = task.startAfter
      }
      if (due != null) {
        patch.due = due
        prior.due = task.due
      }
      deps.updateTask(task.id, patch)
      return {
        normalized: {
          type: 'schedule_hint',
          taskId: task.id,
          ...(startAfter != null ? { startAfter } : {}),
          ...(due != null ? { due } : {}),
        },
        inverse: () => deps.updateTask(task.id, prior),
      }
    }

    // -- add_project_phase ----------------------------------------------------
    case 'add_project_phase': {
      if (!isNonEmptyString(action.projectId)) return null
      const project = deps.getProject(action.projectId)
      if (!project) return null
      // Phases only exist on deliverable progress (store enforces this too).
      if (project.progress.kind !== 'deliverable') return null
      if (!isObject(action.phase) || !isNonEmptyString(action.phase.title)) return null
      const pct = clampPct(action.phase.pct)

      const priorProgress = project.progress
      deps.addPhase(project.id, { title: action.phase.title.trim(), pct })
      return {
        normalized: {
          type: 'add_project_phase',
          projectId: project.id,
          phase: { title: action.phase.title.trim(), pct },
        },
        // Restore the exact prior progress (drops the phase we appended).
        inverse: () => deps.updateProject(project.id, { progress: priorProgress }),
      }
    }

    // -- update_project_memory ------------------------------------------------
    case 'update_project_memory': {
      if (!isNonEmptyString(action.projectId)) return null
      const project = deps.getProject(action.projectId)
      if (!project) return null
      const rawEntries = Array.isArray(action.entries) ? action.entries : null
      if (!rawEntries) return null
      const entries = rawEntries
        .filter((e): e is string => isNonEmptyString(e))
        .map((e) => e.trim())
        .slice(0, 50) // keep memory bounded
      if (entries.length === 0) return null

      const priorMemory = project.memory
      deps.updateMemory(project.id, entries)
      return {
        normalized: { type: 'update_project_memory', projectId: project.id, entries },
        inverse: () => deps.updateMemory(project.id, priorMemory),
      }
    }

    default:
      // Unknown action type -> dropped silently.
      return null
  }
}

function clampPct(n: unknown): number {
  const v = typeof n === 'number' ? n : Number(n)
  if (!Number.isFinite(v)) return 0
  return Math.min(100, Math.max(0, Math.round(v)))
}

// ---------------------------------------------------------------------------
// Human summary
// ---------------------------------------------------------------------------

/** Join clauses as "a", "a and b", or "a, b, and c". */
function joinClauses(parts: string[]): string {
  if (parts.length === 0) return ''
  if (parts.length === 1) return parts[0]
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`
  return `${parts.slice(0, -1).join(', ')}, and ${parts[parts.length - 1]}`
}

/**
 * A short, complete natural-language summary of an applied batch, rendered
 * verbatim on the confirmation chip (e.g. "Added 2 tasks and a first move",
 * "Set a first move", "Updated 1 task"). Each verb-phrase is standalone so
 * mixed batches read cleanly; "Added" leads when creations/additions are
 * present, since that is the dominant vocabulary.
 */
function summarize(executed: ToolAction[]): string {
  if (executed.length === 0) return ''

  const created = executed.filter((a) => a.type === 'create_task').length
  const updated = executed.filter((a) => a.type === 'update_task' || a.type === 'schedule_hint').length
  const completed = executed.filter((a) => a.type === 'complete_task').length
  const firstMoves = executed.filter((a) => a.type === 'set_first_move').length
  const phases = executed.filter((a) => a.type === 'add_project_phase').length
  const memory = executed.filter((a) => a.type === 'update_project_memory').length
  const subtaskCount = executed.reduce(
    (n, a) => n + (a.type === 'create_subtasks' ? a.subtasks.length : 0),
    0
  )

  // "Added ..." clauses (creations + additive changes) grouped under one verb.
  const addedParts: string[] = []
  if (created) addedParts.push(`${created} ${created === 1 ? 'task' : 'tasks'}`)
  if (subtaskCount) addedParts.push(`${subtaskCount} ${subtaskCount === 1 ? 'step' : 'steps'}`)
  if (firstMoves) addedParts.push(firstMoves === 1 ? 'a first move' : `${firstMoves} first moves`)
  if (phases) addedParts.push(`${phases} ${phases === 1 ? 'phase' : 'phases'}`)
  if (memory) addedParts.push('project memory')

  const sentences: string[] = []
  if (addedParts.length) sentences.push(`Added ${joinClauses(addedParts)}`)
  if (updated) sentences.push(`Updated ${updated} ${updated === 1 ? 'task' : 'tasks'}`)
  if (completed) sentences.push(`Completed ${completed} ${completed === 1 ? 'task' : 'tasks'}`)

  if (sentences.length === 0) return 'Updated your plan'
  return sentences.join(' · ')
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/**
 * Validate and apply a batch of agent tool actions against the injected stores.
 * `actions` is untrusted (straight off the wire): non-arrays and invalid
 * entries are dropped silently. Returns the applied actions, a single `undo()`
 * that reverts them all (in reverse order), and a human summary.
 *
 * Never throws: a bad individual action can't take down the batch, and if
 * nothing applies you get `{ executed: [], undo: null, summary: '' }`.
 */
export function validateAndExecuteActions(actions: unknown, deps: ActionDeps): ExecuteResult {
  const list: unknown[] = Array.isArray(actions) ? actions : []
  const executed: ToolAction[] = []
  const inverses: Inverse[] = []

  for (const raw of list) {
    let applied: { normalized: ToolAction; inverse: Inverse } | null = null
    try {
      applied = applyOne(raw, deps)
    } catch {
      // A store method that throws on one action must not abort the batch.
      applied = null
    }
    if (applied) {
      executed.push(applied.normalized)
      inverses.push(applied.inverse)
    }
  }

  let undone = false
  const undo =
    inverses.length > 0
      ? () => {
          if (undone) return
          undone = true
          // Reverse order so dependent mutations unwind cleanly.
          for (let i = inverses.length - 1; i >= 0; i--) {
            try {
              inverses[i]()
            } catch {
              // Best-effort revert; a single failure shouldn't stop the rest.
            }
          }
        }
      : null

  return { executed, undo, summary: summarize(executed) }
}
