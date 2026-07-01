import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { ProductivityWindow, CompletionRecord } from "@/types";

interface InsightsState {
  completionHistory: CompletionRecord[];
  productivityWindows: ProductivityWindow[];
  logCompletion: (taskId: string, subtaskId: string | null) => void;
  getCompletionsByHour: () => Record<number, number>;
  getCurrentStreak: () => number;
  getWeeklyCompletionCount: () => number;
  getBestTimeToday: () => string;
}

export const useInsightsStore = create<InsightsState>()(
  persist(
    (set, get) => ({
      completionHistory: [],
      productivityWindows: [
        // Default windows based on Garrett's reported midday energy
        { dayOfWeek: 1, startHour: 15, endHour: 17, confidenceScore: 0.3 },
        { dayOfWeek: 2, startHour: 15, endHour: 17, confidenceScore: 0.3 },
        { dayOfWeek: 3, startHour: 15, endHour: 17, confidenceScore: 0.3 },
        { dayOfWeek: 4, startHour: 15, endHour: 17, confidenceScore: 0.3 },
        { dayOfWeek: 5, startHour: 15, endHour: 17, confidenceScore: 0.3 },
        { dayOfWeek: 0, startHour: 11, endHour: 13, confidenceScore: 0.3 },
        { dayOfWeek: 6, startHour: 11, endHour: 13, confidenceScore: 0.3 },
      ],

      logCompletion: (taskId, subtaskId) => {
        const now = new Date();
        const record: CompletionRecord = {
          taskId,
          subtaskId,
          completedAt: now.toISOString(),
          hourOfDay: now.getHours(),
        };
        set((state) => ({
          completionHistory: [...state.completionHistory, record],
        }));
      },

      getCompletionsByHour: () => {
        const last7Days = Date.now() - 7 * 24 * 60 * 60 * 1000;
        const recent = get().completionHistory.filter(
          (r) => new Date(r.completedAt).getTime() > last7Days
        );
        const byHour: Record<number, number> = {};
        for (let h = 0; h < 24; h++) byHour[h] = 0;
        for (const r of recent) byHour[r.hourOfDay]++;
        return byHour;
      },

      getCurrentStreak: () => {
        const history = get().completionHistory;
        if (history.length === 0) return 0;

        const days = new Set(
          history.map((r) => new Date(r.completedAt).toDateString())
        );
        let streak = 0;
        const date = new Date();
        while (days.has(date.toDateString())) {
          streak++;
          date.setDate(date.getDate() - 1);
        }
        return streak;
      },

      getWeeklyCompletionCount: () => {
        const last7Days = Date.now() - 7 * 24 * 60 * 60 * 1000;
        return get().completionHistory.filter(
          (r) => new Date(r.completedAt).getTime() > last7Days
        ).length;
      },

      getBestTimeToday: () => {
        const today = new Date().getDay() as 0 | 1 | 2 | 3 | 4 | 5 | 6;
        const window = get().productivityWindows.find(
          (w) => w.dayOfWeek === today
        );
        if (!window) return "3pm - 5pm";
        const fmt = (h: number) => {
          const period = h >= 12 ? "pm" : "am";
          const hour = h > 12 ? h - 12 : h === 0 ? 12 : h;
          return `${hour}${period}`;
        };
        return `${fmt(window.startHour)} - ${fmt(window.endHour)}`;
      },
    }),
    {
      name: "ampora-insights",
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
