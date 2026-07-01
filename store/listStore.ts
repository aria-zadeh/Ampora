/**
 * List and Tag store — Milestone 1 data-model foundation.
 *
 * Manages the `List` (PRD §9.4, one per class/area, color-coded, FR-6) and
 * `Tag` (confirmed decision: a lightweight entity for color/metadata,
 * separate from the plain tag-name strings on `Task.tags`) entities.
 *
 * Local-first via MMKV, same pattern as `store/taskStore.ts`. No cloud sync
 * wired up yet (later milestone).
 */

import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { newId } from '@/core/id'
import { mmkvStateStorage } from '@/store/mmkv'
import type { List, Tag } from '@/types'

interface ListState {
  lists: Record<string, List>
  tags: Record<string, Tag>

  createList: (partial: Partial<Omit<List, 'id' | 'createdAt' | 'updatedAt' | 'syncState'>> & Pick<List, 'name' | 'color'>) => List
  updateList: (id: string, patch: Partial<Omit<List, 'id' | 'createdAt'>>) => void
  deleteList: (id: string) => void

  createTag: (partial: Partial<Omit<Tag, 'id' | 'createdAt' | 'updatedAt' | 'syncState'>> & Pick<Tag, 'name' | 'color'>) => Tag
  updateTag: (id: string, patch: Partial<Omit<Tag, 'id' | 'createdAt'>>) => void
  deleteTag: (id: string) => void
}

export const useListStore = create<ListState>()(
  persist(
    (set) => ({
      lists: {},
      tags: {},

      createList: (partial) => {
        const now = Date.now()
        const list: List = {
          ...partial,
          id: newId(),
          createdAt: now,
          updatedAt: now,
          syncState: 'pending',
        }
        set((state) => ({ lists: { ...state.lists, [list.id]: list } }))
        return list
      },

      updateList: (id, patch) => {
        set((state) => {
          const existing = state.lists[id]
          if (!existing) return state
          return {
            lists: {
              ...state.lists,
              [id]: { ...existing, ...patch, updatedAt: Date.now(), syncState: 'pending' },
            },
          }
        })
      },

      deleteList: (id) => {
        set((state) => {
          if (!(id in state.lists)) return state
          const next = { ...state.lists }
          delete next[id]
          return { lists: next }
        })
      },

      createTag: (partial) => {
        const now = Date.now()
        const tag: Tag = {
          ...partial,
          id: newId(),
          createdAt: now,
          updatedAt: now,
          syncState: 'pending',
        }
        set((state) => ({ tags: { ...state.tags, [tag.id]: tag } }))
        return tag
      },

      updateTag: (id, patch) => {
        set((state) => {
          const existing = state.tags[id]
          if (!existing) return state
          return {
            tags: {
              ...state.tags,
              [id]: { ...existing, ...patch, updatedAt: Date.now(), syncState: 'pending' },
            },
          }
        })
      },

      deleteTag: (id) => {
        set((state) => {
          if (!(id in state.tags)) return state
          const next = { ...state.tags }
          delete next[id]
          return { tags: next }
        })
      },
    }),
    {
      name: 'ampora-lists',
      storage: createJSONStorage(() => mmkvStateStorage),
    }
  )
)

// ---------------------------------------------------------------------------
// Selector helpers
// ---------------------------------------------------------------------------

export function selectAllLists(state: ListState): List[] {
  return Object.values(state.lists)
}

export function selectAllTags(state: ListState): Tag[] {
  return Object.values(state.tags)
}

export function selectListById(id: string) {
  return (state: ListState): List | undefined => state.lists[id]
}

export function selectTagById(id: string) {
  return (state: ListState): Tag | undefined => state.tags[id]
}
