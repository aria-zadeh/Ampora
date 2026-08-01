/**
 * Project store (doc `06` Projects, PRD FR-82..85).
 *
 * Owns the `Project` entity: an ordered phase list, one optional context
 * line, and a percent bar. Projects are deliberately thin — the structure +
 * progress layer only. The Tasks a project generates are what the scheduler
 * places and Ignition locks against (owned by `taskStore`, linked one-way via
 * `Task.projectId` — a Project does not keep a list of its own task ids).
 *
 * The project's old conversational assistant, its ToolActions, and a
 * persistent knowledge base are all cut for launch (`V2_Changes.md` §6) —
 * this store keeps the Project/Phase model, progress, and CRUD only.
 *
 * Local-first via MMKV (persist key "ampora-projects"), identical pattern to
 * `store/taskStore.ts` / `store/listStore.ts`. Cloud sync is a later
 * increment; nothing here calls Supabase directly. State is keyed by id
 * (`Record<string, Project>`) for O(1) single-project reads/writes. Components
 * should use the exported selectors and wrap the array selectors in
 * `useShallow` at the call site (Zustand v5 selector discipline — Object.values
 * returns a new array each call and will infinite-loop otherwise).
 */

import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { newId } from '@/core/id'
import { mmkvStateStorage } from '@/store/mmkv'
import { applyCheckIn as applyCheckInToPhases, computePercent, type CheckInAnswer } from '@/core/projects/progress'
import type { Phase, Project } from '@/types'

interface ProjectState {
  projects: Record<string, Project>

  /**
   * Create a project. Only `title` + `kind` are required; everything else
   * gets a sensible empty default (no phases, no deadline, no context line,
   * 0 percent). Returns the created project.
   */
  createProject: (
    partial: Partial<Omit<Project, 'id' | 'createdAt' | 'updatedAt' | 'syncState'>> &
      Pick<Project, 'title' | 'kind'>
  ) => Project

  updateProject: (id: string, patch: Partial<Omit<Project, 'id' | 'createdAt'>>) => void
  deleteProject: (id: string) => void

  /**
   * Replace a project's phase list (add/remove/edit/toggle from the
   * ProgressTracker UI, doc `06` §7 "editable at any time"), keeping
   * `percent` in sync via `core/projects/progress.ts#computePercent`.
   */
  setPhases: (id: string, phases: Phase[]) => void

  /**
   * Fold an end-of-session check-in into the project's progress (FR-85, doc
   * `06` §5). `done` marks the current phase (first not-done, lowest
   * `order`) complete and may advance to the next one; `keep_going` leaves it
   * open (a fresh session follows after a break); `stop_here` leaves it open
   * too (the remainder reflows into the schedule — that reflow is the
   * caller's job, e.g. `scheduleStore.recompute()`, not this store's).
   *
   * `currentPhaseFraction` (0..1) is how much of the still-open current
   * phase THIS session actually completed — partial credit for the percent
   * bar when the answer isn't `done` (or was inferred from a skipped
   * check-in). Ignored once every phase is already done.
   */
  applyCheckIn: (
    projectId: string,
    answer: CheckInAnswer,
    currentPhaseFraction?: number
  ) => void
}

/** Apply a patch to one project (updating sync bookkeeping), or no-op if it is gone. */
function patchProject(
  projects: Record<string, Project>,
  id: string,
  patch: (project: Project) => Project
): Record<string, Project> {
  const existing = projects[id]
  if (!existing) return projects
  return {
    ...projects,
    [id]: { ...patch(existing), updatedAt: Date.now(), syncState: 'pending' },
  }
}

export const useProjectStore = create<ProjectState>()(
  persist(
    (set) => ({
      projects: {},

      createProject: (partial) => {
        const now = Date.now()
        const phases = partial.phases ?? []
        const project: Project = {
          deadline: undefined,
          contextLine: undefined,
          ...partial,
          phases,
          percent: partial.percent ?? computePercent(phases),
          id: newId(),
          createdAt: now,
          updatedAt: now,
          syncState: 'pending',
        }
        set((state) => ({ projects: { ...state.projects, [project.id]: project } }))
        return project
      },

      updateProject: (id, patch) => {
        set((state) => ({
          projects: patchProject(state.projects, id, (p) => ({ ...p, ...patch })),
        }))
      },

      deleteProject: (id) => {
        set((state) => {
          if (!(id in state.projects)) return state
          const next = { ...state.projects }
          delete next[id]
          return { projects: next }
        })
      },

      setPhases: (id, phases) => {
        set((state) => ({
          projects: patchProject(state.projects, id, (p) => ({
            ...p,
            phases,
            percent: computePercent(phases),
          })),
        }))
      },

      applyCheckIn: (projectId, answer, currentPhaseFraction) => {
        set((state) => ({
          projects: patchProject(state.projects, projectId, (p) => {
            const { phases, percent } = applyCheckInToPhases(p.phases, answer, currentPhaseFraction)
            return { ...p, phases, percent }
          }),
        }))
      },
    }),
    {
      name: 'ampora-projects',
      storage: createJSONStorage(() => mmkvStateStorage),
    }
  )
)

// ---------------------------------------------------------------------------
// Selector helpers — keep derivation out of components (Zustand selector
// discipline, PRD §9.1). Wrap `selectAllProjects` in `useShallow` at the call
// site: it returns a fresh array each call and will loop without it.
// ---------------------------------------------------------------------------

export function selectAllProjects(state: ProjectState): Project[] {
  return Object.values(state.projects)
}

export function selectProjectById(id: string) {
  return (state: ProjectState): Project | undefined => state.projects[id]
}
