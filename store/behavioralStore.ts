/**
 * Behavioral-signal store — Ampora Phase 4 (PRD FR-50).
 *
 * Append-only log of `BehavioralSignal`s (types/index.ts). Every completed or
 * abandoned focus session, every stake outcome, every started/dodged task can
 * drop a signal here. This is the raw feed the Learning Engine (Focus DNA,
 * Revealed Self, energy/state, stake calibration — later milestone) will
 * consume; this store only records, it does not yet analyze.
 *
 * Local-first via MMKV (persist key "ampora-behavioral").
 */

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { newId } from "@/core/id";
import { mmkvStateStorage } from "@/store/mmkv";
import type { BehavioralSignal } from "@/types";

/** The caller-provided part of a signal; time-of-day fields are filled in for you. */
export type SignalInput = Partial<Omit<BehavioralSignal, "id" | "hourOfDay" | "dayOfWeek">>;

interface BehavioralState {
  signals: BehavioralSignal[];

  /**
   * Record one behavioral signal. `hourOfDay`, `dayOfWeek`, and `completed`
   * are derived from `now` / the input so callers only pass what they know.
   * Returns the new signal's id.
   */
  logSignal: (partial: SignalInput) => string;

  /** Most recent signals, newest first. */
  recentSignals: (limit?: number) => BehavioralSignal[];

  /** Clear the log (e.g. on sign-out / account reset). */
  clearSignals: () => void;
}

/** Hard cap so an unbounded log never grows without limit on-device. */
const MAX_SIGNALS = 2000;

export const useBehavioralStore = create<BehavioralState>()(
  persist(
    (set, get) => ({
      signals: [],

      logSignal: (partial) => {
        const now = new Date();
        const id = newId();
        const signal: BehavioralSignal = {
          ...partial,
          id,
          hourOfDay: now.getHours(),
          dayOfWeek: now.getDay(),
          completed: partial.completed ?? false,
        };
        set((state) => {
          const next = [...state.signals, signal];
          // Trim oldest if we exceed the cap.
          return { signals: next.length > MAX_SIGNALS ? next.slice(next.length - MAX_SIGNALS) : next };
        });
        return id;
      },

      recentSignals: (limit = 50) => {
        const { signals } = get();
        return signals.slice(-limit).reverse();
      },

      clearSignals: () => set({ signals: [] }),
    }),
    {
      name: "ampora-behavioral",
      storage: createJSONStorage(() => mmkvStateStorage),
    }
  )
);

// ---------------------------------------------------------------------------
// Selectors
// ---------------------------------------------------------------------------

export function selectAllSignals(state: BehavioralState): BehavioralSignal[] {
  return state.signals;
}
