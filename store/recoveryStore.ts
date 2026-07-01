/**
 * Recovery store — the tiny piece of app state behind Recovery Mode's banner
 * (PRD FR-60, §8.6). Ampora Phase 6.
 *
 * The lapse *detection* is pure (`core/recovery.ts`); this store just holds two
 * flags so the UI (Home / Calendar banners) can react:
 *
 *  - `bannerActive` — set true by the one-time app-open recovery check in
 *    `app/_layout.tsx` when a lapse is detected, so a banner surfaces.
 *  - `dismissedForSession` — set true when the user dismisses the banner or
 *    finishes a rebuild, so we don't re-nag them within the same app session
 *    (auto-release on the next cold open, which re-runs the check).
 *
 * Deliberately NOT persisted: Recovery is an in-session, transient prompt. A
 * fresh cold open re-derives it from the (persisted) schedule, so persisting
 * the banner state would risk showing a stale prompt. Zero-shame tone means we
 * never keep pestering — one gentle offer per session.
 */

import { create } from 'zustand'

interface RecoveryState {
  /** True when a lapse was detected on app open and the user hasn't dismissed it. */
  bannerActive: boolean
  /** True once the user dismissed the banner or completed a rebuild this session. */
  dismissedForSession: boolean

  /** Called by the app-open check: mark that a lapse was detected. */
  markLapseDetected: () => void
  /** User dismissed the banner (or finished a rebuild) — stand down for this session. */
  dismissBanner: () => void
  /** Reset (e.g. on sign-out / account switch). */
  reset: () => void
}

export const useRecoveryStore = create<RecoveryState>((set) => ({
  bannerActive: false,
  dismissedForSession: false,

  markLapseDetected: () =>
    set((state) => (state.dismissedForSession ? state : { bannerActive: true })),

  dismissBanner: () => set({ bannerActive: false, dismissedForSession: true }),

  reset: () => set({ bannerActive: false, dismissedForSession: false }),
}))

/** Selector: should the Recovery banner be shown right now? */
export function selectShowRecoveryBanner(state: RecoveryState): boolean {
  return state.bannerActive && !state.dismissedForSession
}
