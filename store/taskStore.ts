/**
 * Task store — Milestone 1 data-model foundation.
 *
 * Ground-up rebuild replacing the v1 store (which used ISO date strings,
 * AsyncStorage, and synced directly to Supabase from the store). This store
 * is local-first (MMKV) only; cloud sync is a later milestone and is
 * intentionally NOT wired up here.
 *
 * State holds tasks keyed by id (`Record<string, Task>`) rather than an
 * array, so single-task reads/writes are O(1) and updates don't require
 * scanning. Components should use the exported selector helpers rather than
 * deriving inside render (Zustand selector discipline, PRD §9.1).
 *
 * No scheduling engine and no Ignition/locking logic lives here — only CRUD
 * plus the doc 07 Part 3 subtask/completion semantics, delegated to
 * `core/task-logic.ts`.
 */

import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { newId } from '@/core/id'
import * as taskLogic from '@/core/task-logic'
import { mmkvStateStorage } from '@/store/mmkv'
import type { Subtask, Task } from '@/types'

interface TaskState {
  tasks: Record<string, Task>

  createTask: (
    partial: Partial<Omit<Task, 'id' | 'createdAt' | 'updatedAt' | 'syncState'>> &
      Pick<Task, 'title'>
  ) => Task
  updateTask: (id: string, patch: Partial<Omit<Task, 'id' | 'createdAt'>>) => void
  deleteTask: (id: string) => void

  addSubtask: (id: string, subtask: Omit<Subtask, 'id'> & { id?: string }) => void
  removeSubtask: (id: string, subtaskId: string) => void
  reorderSubtasks: (id: string, fromIndex: number, toIndex: number) => void
  setSubtaskCompleted: (id: string, subtaskId: string, completed: boolean) => void
  completeTask: (id: string) => void
  reopenTask: (id: string) => void
}

/** Applies a `core/task-logic` transform (which needs the current Task + now) to the stored task, if it exists. */
function applyToTask(
  tasks: Record<string, Task>,
  id: string,
  transform: (task: Task, now: number) => Task
): Record<string, Task> {
  const task = tasks[id]
  if (!task) return tasks
  const now = Date.now()
  return { ...tasks, [id]: transform(task, now) }
}

export const useTaskStore = create<TaskState>()(
  persist(
    (set) => ({
      tasks: {},

      createTask: (partial) => {
        const now = Date.now()
        const task: Task = {
          // Defaults for everything not required by the caller.
          notes: undefined,
          durationMin: 0,
          progressMin: 0,
          due: undefined,
          autoSchedule: true,
          listId: undefined,
          projectId: undefined,
          tags: [],
          subtasks: [],
          firstMove: undefined,
          recurrence: undefined,
          priority: undefined,
          sourceRefs: undefined,
          splittable: false,
          status: 'todo',
          completedAt: undefined,
          scheduleSubtasksSeparately: false,
          ...partial,
          id: newId(),
          createdAt: now,
          updatedAt: now,
          syncState: 'pending',
        }
        set((state) => ({ tasks: { ...state.tasks, [task.id]: task } }))
        return task
      },

      updateTask: (id, patch) => {
        set((state) => {
          const existing = state.tasks[id]
          if (!existing) return state
          return {
            tasks: {
              ...state.tasks,
              [id]: { ...existing, ...patch, updatedAt: Date.now(), syncState: 'pending' },
            },
          }
        })
      },

      deleteTask: (id) => {
        set((state) => {
          if (!(id in state.tasks)) return state
          const next = { ...state.tasks }
          delete next[id]
          return { tasks: next }
        })
      },

      addSubtask: (id, subtaskInput) => {
        const subtask: Subtask = { ...subtaskInput, id: subtaskInput.id ?? newId() }
        set((state) => ({
          tasks: applyToTask(state.tasks, id, (task, now) => taskLogic.addSubtask(task, subtask, now)),
        }))
      },

      removeSubtask: (id, subtaskId) => {
        set((state) => ({
          tasks: applyToTask(state.tasks, id, (task, now) => taskLogic.removeSubtask(task, subtaskId, now)),
        }))
      },

      reorderSubtasks: (id, fromIndex, toIndex) => {
        set((state) => ({
          tasks: applyToTask(state.tasks, id, (task, now) =>
            taskLogic.reorderSubtasks(task, fromIndex, toIndex, now)
          ),
        }))
      },

      setSubtaskCompleted: (id, subtaskId, completed) => {
        set((state) => ({
          tasks: applyToTask(state.tasks, id, (task, now) =>
            taskLogic.setSubtaskCompleted(task, subtaskId, completed, now)
          ),
        }))
      },

      completeTask: (id) => {
        set((state) => ({
          tasks: applyToTask(state.tasks, id, (task, now) => taskLogic.completeTask(task, now)),
        }))
      },

      reopenTask: (id) => {
        set((state) => ({
          tasks: applyToTask(state.tasks, id, (task, now) => taskLogic.reopenTask(task, now)),
        }))
      },
    }),
    {
      name: 'ampora-tasks',
      storage: createJSONStorage(() => mmkvStateStorage),
    }
  )
)

// ---------------------------------------------------------------------------
// Selector helpers — keep derivation out of components (Zustand selector
// discipline, PRD §9.1: "raw select then derive via useMemo").
// ---------------------------------------------------------------------------

export function selectAllTasks(state: TaskState): Task[] {
  return Object.values(state.tasks)
}

export function selectTaskById(id: string) {
  return (state: TaskState): Task | undefined => state.tasks[id]
}

export function selectTasksByList(listId: string) {
  return (state: TaskState): Task[] => Object.values(state.tasks).filter((t) => t.listId === listId)
}

export function selectTasksByTag(tag: string) {
  return (state: TaskState): Task[] => Object.values(state.tasks).filter((t) => t.tags.includes(tag))
}

export function selectIncompleteTasks(state: TaskState): Task[] {
  return Object.values(state.tasks).filter((t) => t.status !== 'done')
}
