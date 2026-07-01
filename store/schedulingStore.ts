/**
 * Scheduling signal store — tracks whether the user completed tasks at their
 * scheduled times. These signals feed the scheduling algorithm to learn which
 * time slots work best for this user.
 */

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { SchedulingSignal } from "@/types";
import { generateId } from "@/types";
import { getCurrentUser, supabase } from "@/services/supabase";

// ---------------------------------------------------------------------------
// Supabase sync — fire-and-forget
// ---------------------------------------------------------------------------

async function syncSignalToSupabase(signal: SchedulingSignal): Promise<void> {
  const user = await getCurrentUser().catch(() => null);
  if (!user) return;
  try {
    const { error } = await supabase.from("scheduling_signals").upsert({
      id: signal.id,
      user_id: user.id,
      task_id: signal.taskId,
      day_of_week: signal.dayOfWeek,
      hour_of_day: signal.hourOfDay,
      outcome: signal.outcome,
      actual_duration_minutes: signal.actualDurationMinutes,
      recorded_at: signal.recordedAt,
    });
    if (error) console.warn("[Ampora] syncSignalToSupabase error:", error.message);
  } catch (err) {
    console.warn("[Ampora] syncSignalToSupabase exception:", err);
  }
}

export async function fetchRecentSignals(userId: string, days = 30): Promise<SchedulingSignal[]> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from("scheduling_signals")
    .select("*")
    .eq("user_id", userId)
    .gte("recorded_at", since)
    .order("recorded_at", { ascending: false });

  if (error) {
    console.warn("[Ampora] fetchRecentSignals error:", error.message);
    return [];
  }

  return (data ?? []).map((row: Record<string, unknown>) => ({
    id: row.id as string,
    taskId: row.task_id as string,
    dayOfWeek: row.day_of_week as 0 | 1 | 2 | 3 | 4 | 5 | 6,
    hourOfDay: row.hour_of_day as number,
    outcome: row.outcome as "completed" | "skipped" | "partial",
    actualDurationMinutes: (row.actual_duration_minutes as number) ?? null,
    recordedAt: row.recorded_at as string,
  }));
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

interface SchedulingState {
  signals: SchedulingSignal[];
  addSignal: (signal: Omit<SchedulingSignal, "id" | "recordedAt">) => void;
  getRecentSignals: (days?: number) => SchedulingSignal[];
  mergeRemoteSignals: (remote: SchedulingSignal[]) => void;
}

export const useSchedulingStore = create<SchedulingState>()(
  persist(
    (set, get) => ({
      signals: [],

      addSignal: (data) => {
        const signal: SchedulingSignal = {
          ...data,
          id: generateId(),
          recordedAt: new Date().toISOString(),
        };
        set((state) => ({
          signals: [...state.signals, signal],
        }));
        syncSignalToSupabase(signal).catch(() => {});
      },

      getRecentSignals: (days = 30) => {
        const since = Date.now() - days * 24 * 60 * 60 * 1000;
        return get().signals.filter(
          (s) => new Date(s.recordedAt).getTime() >= since,
        );
      },

      mergeRemoteSignals: (remote) => {
        set((state) => {
          const existingIds = new Set(state.signals.map((s) => s.id));
          const newSignals = remote.filter((s) => !existingIds.has(s.id));
          if (newSignals.length === 0) return state;
          return { signals: [...state.signals, ...newSignals] };
        });
      },
    }),
    {
      name: "ampora-scheduling",
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
