/**
 * MMKV-backed persistence for Zustand stores (PRD §9.1: "Local persistence
 * via MMKV (faster than AsyncStorage)"). This replaces AsyncStorage as the
 * v1 stores used it.
 *
 * Exposes:
 * - `mmkv`: the raw MMKV instance, for any direct key/value access.
 * - `mmkvStateStorage`: a Zustand `StateStorage`-shaped adapter
 *   (getItem/setItem/removeItem) for use with
 *   `persist(..., { storage: createJSONStorage(() => mmkvStateStorage) })`.
 */

import { createMMKV } from 'react-native-mmkv'
import type { StateStorage } from 'zustand/middleware'

export const mmkv = createMMKV({ id: 'ampora' })

export const mmkvStateStorage: StateStorage = {
  getItem: (name) => mmkv.getString(name) ?? null,
  setItem: (name, value) => {
    mmkv.set(name, value)
  },
  removeItem: (name) => {
    mmkv.remove(name)
  },
}
