/**
 * Project store — Phase 7 (doc `10` Projects, PRD FR-82..86).
 *
 * Owns the `Project` entity: a persistent knowledge base (files), a scoped
 * chat, progress (shaped by project kind), project memory, and back-references
 * to the Tasks the project has generated. Projects are the knowledge + chat +
 * progress layer; the Tasks they generate are what the scheduler places and
 * Ignition locks against (kept in `taskStore`, linked via `Task.projectId` and
 * `Project.taskIds`).
 *
 * Local-first via MMKV (persist key "ampora-projects"), identical pattern to
 * `store/taskStore.ts` / `store/listStore.ts`. Cloud sync is a later increment
 * (doc `10` §13); nothing here calls Supabase directly. State is keyed by id
 * (`Record<string, Project>`) for O(1) single-project reads/writes. Components
 * should use the exported selectors and wrap the array selectors in `useShallow`
 * at the call site (Zustand v5 selector discipline — Object.values returns a new
 * array each call and will infinite-loop otherwise).
 */

import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { newId } from '@/core/id'
import { mmkvStateStorage } from '@/store/mmkv'
import type { ChatMessage, Project, ProjectFile, ProjectKind, ProjectProgress } from '@/types'

/** The initial, empty progress representation for a freshly-created project of `kind`. */
function initialProgress(kind: ProjectKind): ProjectProgress {
  switch (kind) {
    case 'deliverable':
      return { kind: 'deliverable', phases: [] }
    case 'study':
      return { kind: 'study', topics: [] }
    case 'general':
    default:
      return { kind: 'general', pct: 0 }
  }
}

interface ProjectState {
  projects: Record<string, Project>

  /**
   * Create a project. Only `name` + `kind` are required; everything else gets a
   * sensible empty default (empty file library, chat, memory, taskIds, and a
   * `progress` shape matching `kind`). Returns the created project.
   */
  createProject: (
    partial: Partial<Omit<Project, 'id' | 'createdAt' | 'updatedAt' | 'syncState'>> &
      Pick<Project, 'name' | 'kind'>
  ) => Project

  updateProject: (id: string, patch: Partial<Omit<Project, 'id' | 'createdAt'>>) => void
  deleteProject: (id: string) => void

  /** Append a file to the project's knowledge base (doc `10` §4). */
  addFile: (id: string, file: ProjectFile) => void
  /** Append a chat turn to the project's scoped conversation (doc `10` §5). */
  addChatMessage: (id: string, msg: ChatMessage) => void
  /** Replace the project's progress (e.g. after the chat recomputes phases/mastery — doc `10` §6). */
  setProgress: (id: string, progress: ProjectProgress) => void
  /** Link a generated Task to this project (doc `10` §7). Idempotent — no duplicate ids. */
  linkTask: (id: string, taskId: string) => void
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
        const project: Project = {
          // Defaults for everything not supplied by the caller.
          description: undefined,
          color: undefined,
          files: [],
          chat: [],
          memory: [],
          taskIds: [],
          progress: initialProgress(partial.kind),
          ...partial,
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

      addFile: (id, file) => {
        set((state) => ({
          projects: patchProject(state.projects, id, (p) => ({ ...p, files: [...p.files, file] })),
        }))
      },

      addChatMessage: (id, msg) => {
        set((state) => ({
          projects: patchProject(state.projects, id, (p) => ({ ...p, chat: [...p.chat, msg] })),
        }))
      },

      setProgress: (id, progress) => {
        set((state) => ({
          projects: patchProject(state.projects, id, (p) => ({ ...p, progress })),
        }))
      },

      linkTask: (id, taskId) => {
        set((state) => ({
          projects: patchProject(state.projects, id, (p) =>
            p.taskIds.includes(taskId) ? p : { ...p, taskIds: [...p.taskIds, taskId] }
          ),
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
