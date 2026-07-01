/**
 * Settings store — Milestone 1 data-model foundation.
 *
 * Ground-up rebuild replacing the v1 store (different shape, AsyncStorage).
 * Holds the single `Settings` object (PRD §9.4, §9.10, §8.11) with sensible
 * defaults. Local-first via MMKV; the Ignition/wellbeing fields are typed
 * and defaulted here per the confirmed schema, but their enforcement
 * (caps, quiet-hours release, never-lock list) is later-milestone logic —
 * not implemented in this store.
 */

import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { mmkvStateStorage } from '@/store/mmkv'
import type { Settings } from '@/types'

const defaultSettings: Settings = {
  // Ignition / wellbeing (PRD §9.10) — defaults only, enforcement is later.
  dailyLockCapMin: 180,
  quietHours: { start: 23 * 60, end: 8 * 60 }, // 23:00 - 08:00
  neverLockCategories: ['phone', 'messages', 'maps', 'accessibility', 'os_settings', 'ampora'],
  stakeStrengthBounds: { min: 0, max: 1 },
  subscription: { status: 'trial' },

  // Milestone-1 app preferences
  schedulingHours: {
    // Sensible default: Mon-Fri 3:00 PM - 9:00 PM (matches the PRD §7.3
    // "Study hours" example), none on weekends until the user sets their own.
    perDay: [1, 2, 3, 4, 5].map((day) => ({
      day,
      windows: [{ start: 15 * 60, end: 21 * 60 }],
    })),
  },
  maxNotificationsPerHour: 1,
  energyPeak: { start: 15 * 60, end: 17 * 60 }, // 3pm - 5pm default (PRD §3.1 Garrett profile: most energetic midday)
  displayName: undefined,
  themePreference: 'system',
  onboardingComplete: false,
}

interface SettingsState {
  settings: Settings
  updateSettings: (patch: Partial<Settings>) => void
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      settings: defaultSettings,

      updateSettings: (patch) => {
        set((state) => ({ settings: { ...state.settings, ...patch } }))
      },
    }),
    {
      name: 'ampora-settings',
      storage: createJSONStorage(() => mmkvStateStorage),
    }
  )
)
