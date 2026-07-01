/**
 * Focus-session store — Ampora Phase 4 (PRD FR-62).
 *
 * Tracks a single ACTIVE focus session and a history of completed ones. A
 * focus session is the app-verified backbone of Ignition (doc 09 §1 Tier 1):
 * the app controls its own timer, so elapsed time is a genuine proof signal.
 *
 * REPLACES the old sessionStore (which referenced now-removed
 * `@/types#FocusSession`/`BreakEvent`). The session type is defined locally
 * here since the current `types/index.ts` does not export one.
 *
 * Local-first via MMKV (persist key "ampora-sessions"), same pattern as the
 * other Phase-1..3 stores.
 */

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { newId } from "@/core/id";
import { mmkvStateStorage } from "@/store/mmkv";

/** A break taken during a focus session. */
export interface FocusBreak {
  id: string;
  /** Epoch ms the break started. */
  at: number;
  /** Seconds the break lasted, filled in when the break ends (undefined while ongoing). */
  durationSec?: number;
}

/**
 * One focus session against a task. `elapsedSec` is the accumulated focused
 * time (breaks excluded — the UI stops calling `tick` while on a break).
 */
export interface FocusSession {
  id: string;
  taskId: string;
  /** Epoch ms. */
  startedAt: number;
  /** Epoch ms, set on end. */
  endedAt?: number;
  /** Planned session length in minutes (the scheduled block length or a chosen value). */
  plannedMin: number;
  /** Accumulated focused seconds (excludes break time). */
  elapsedSec: number;
  breaks: FocusBreak[];
  /** Whether the session ended by the user completing the work vs. bailing early. */
  completed: boolean;
  /** Subtask ids checked off during this session (for progress + proof). */
  subtaskIdsDone: string[];
}

interface SessionState {
  active: FocusSession | null;
  /** Completed (and abandoned) sessions keyed by id. */
  history: Record<string, FocusSession>;

  /** Start a new session, replacing any active one. Returns the new session id. */
  startSession: (taskId: string, plannedMin: number) => string;
  /** Add `sec` focused seconds to the active session (call ~once/second from a timer). */
  tick: (sec: number) => void;
  /** Record a break on the active session. Returns the break id (or "" if none active). */
  takeBreak: () => string;
  /** End the active break (most recent open one), recording its duration. */
  endBreak: (durationSec: number) => void;
  /** Mark a subtask done within the active session (idempotent). */
  markSubtaskDone: (subtaskId: string) => void;
  /** End the active session, moving it to history. */
  endSession: (completed: boolean) => void;

  /** Most recent sessions, newest first. */
  recentSessions: (limit?: number) => FocusSession[];
}

export const useSessionStore = create<SessionState>()(
  persist(
    (set, get) => ({
      active: null,
      history: {},

      startSession: (taskId, plannedMin) => {
        const id = newId();
        const session: FocusSession = {
          id,
          taskId,
          startedAt: Date.now(),
          plannedMin,
          elapsedSec: 0,
          breaks: [],
          completed: false,
          subtaskIdsDone: [],
        };
        set({ active: session });
        return id;
      },

      tick: (sec) => {
        set((state) => {
          if (!state.active) return state;
          const add = Number.isFinite(sec) && sec > 0 ? sec : 0;
          return { active: { ...state.active, elapsedSec: state.active.elapsedSec + add } };
        });
      },

      takeBreak: () => {
        const { active } = get();
        if (!active) return "";
        const id = newId();
        const brk: FocusBreak = { id, at: Date.now() };
        set((state) =>
          state.active ? { active: { ...state.active, breaks: [...state.active.breaks, brk] } } : state
        );
        return id;
      },

      endBreak: (durationSec) => {
        set((state) => {
          if (!state.active) return state;
          const breaks = [...state.active.breaks];
          // Close the most recent still-open break.
          for (let i = breaks.length - 1; i >= 0; i--) {
            if (breaks[i].durationSec == null) {
              breaks[i] = { ...breaks[i], durationSec: Math.max(0, Math.round(durationSec)) };
              break;
            }
          }
          return { active: { ...state.active, breaks } };
        });
      },

      markSubtaskDone: (subtaskId) => {
        set((state) => {
          if (!state.active) return state;
          if (state.active.subtaskIdsDone.includes(subtaskId)) return state;
          return {
            active: {
              ...state.active,
              subtaskIdsDone: [...state.active.subtaskIdsDone, subtaskId],
            },
          };
        });
      },

      endSession: (completed) => {
        const { active } = get();
        if (!active) return;
        const ended: FocusSession = { ...active, endedAt: Date.now(), completed };
        set((state) => ({
          active: null,
          history: { ...state.history, [ended.id]: ended },
        }));
      },

      recentSessions: (limit = 10) => {
        return Object.values(get().history)
          .sort((a, b) => (b.endedAt ?? b.startedAt) - (a.endedAt ?? a.startedAt))
          .slice(0, limit);
      },
    }),
    {
      name: "ampora-sessions",
      storage: createJSONStorage(() => mmkvStateStorage),
    }
  )
);

// ---------------------------------------------------------------------------
// Selectors
// ---------------------------------------------------------------------------

export function selectActiveSession(state: SessionState): FocusSession | null {
  return state.active;
}
