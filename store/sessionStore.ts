import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { FocusSession, BreakEvent } from "@/types";
import { generateId } from "@/types";

interface SessionState {
  activeSession: FocusSession | null;
  sessions: FocusSession[];
  breaks: BreakEvent[];
  startSession: (taskId: string, subtaskId: string | null) => string;
  endSession: () => void;
  markSubtaskCompleted: (subtaskId: string) => void;
  logBreak: (trigger: "manual" | "timer") => string;
  endBreak: (breakId: string, durationSeconds: number) => void;
  getRecentSessions: (limit?: number) => FocusSession[];
}

export const useSessionStore = create<SessionState>()(
  persist(
    (set, get) => ({
      activeSession: null,
      sessions: [],
      breaks: [],

      startSession: (taskId, subtaskId) => {
        const id = generateId();
        const session: FocusSession = {
          id,
          taskId,
          subtaskId,
          startTime: new Date().toISOString(),
          endTime: null,
          durationMinutes: null,
          breaksTaken: 0,
          completedSubtasks: [],
        };
        set({ activeSession: session });
        return id;
      },

      endSession: () => {
        const { activeSession } = get();
        if (!activeSession) return;
        const endTime = new Date().toISOString();
        const durationMinutes = Math.round(
          (new Date(endTime).getTime() - new Date(activeSession.startTime).getTime()) / 60000
        );
        const completed: FocusSession = {
          ...activeSession,
          endTime,
          durationMinutes,
        };
        set((state) => ({
          activeSession: null,
          sessions: [...state.sessions, completed],
        }));
      },

      markSubtaskCompleted: (subtaskId) => {
        set((state) => {
          if (!state.activeSession) return state;
          return {
            activeSession: {
              ...state.activeSession,
              completedSubtasks: [...state.activeSession.completedSubtasks, subtaskId],
            },
          };
        });
      },

      logBreak: (trigger) => {
        const { activeSession } = get();
        if (!activeSession) return "";
        const id = generateId();
        const breakEvent: BreakEvent = {
          id,
          sessionId: activeSession.id,
          triggeredAt: new Date().toISOString(),
          trigger,
          breakTaken: true,
          breakDurationSeconds: null,
        };
        set((state) => ({
          breaks: [...state.breaks, breakEvent],
          activeSession: state.activeSession
            ? { ...state.activeSession, breaksTaken: state.activeSession.breaksTaken + 1 }
            : null,
        }));
        return id;
      },

      endBreak: (breakId, durationSeconds) => {
        set((state) => ({
          breaks: state.breaks.map((b) =>
            b.id === breakId ? { ...b, breakDurationSeconds: durationSeconds } : b
          ),
        }));
      },

      getRecentSessions: (limit = 10) => {
        return get()
          .sessions.slice(-limit)
          .reverse();
      },
    }),
    {
      name: "ampora-sessions",
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
