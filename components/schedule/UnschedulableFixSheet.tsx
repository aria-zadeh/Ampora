import React, { useCallback, useMemo } from "react";
import { View, Text, Pressable, Modal } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTaskStore } from "@/store/taskStore";
import { useScheduleStore } from "@/store/scheduleStore";
import { Button } from "@/components/ui/Button";
import { Heading } from "@/components/ui/Heading";
import type { SchedulingHours, Task } from "@/types";
import type { Unschedulable } from "@/core/scheduler";

/**
 * Push a due date out by one week from whichever is later: the task's
 * current due, or now (so a `past_deadline` task moves into the future
 * instead of merely less-far-in-the-past). Normalized to 23:59 local,
 * matching the app's own due-date convention for date-only edits
 * (`app/(tabs)/tasks.tsx#tomorrowDue`, `core/quick-add.ts`).
 */
function pushDeadlineOneWeek(currentDue: number | undefined, now: number): number {
  const base = new Date(Math.max(currentDue ?? now, now));
  base.setDate(base.getDate() + 7);
  base.setHours(23, 59, 0, 0);
  return base.getTime();
}

/**
 * A fully open, every-day, all-day scheduling-hours window — the "relax
 * scheduling hours" one-tap fix (PRD FR-20). Set as a per-task override so it
 * wins over any list/settings default regardless of what the current
 * effective window is (`Task.schedulingHours ?? List.schedulingHours ??
 * Settings.schedulingHours`, FR-13) — this always strictly widens
 * availability, so no fix is left silently doing nothing.
 */
function anyTimeSchedulingHours(): SchedulingHours {
  return {
    perDay: [0, 1, 2, 3, 4, 5, 6].map((day) => ({ day, windows: [{ start: 0, end: 24 * 60 }] })),
  };
}

interface FixAction {
  key: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  hint: string;
  onPress: () => void;
}

export interface UnschedulableFixSheetProps {
  /** The at-risk task this sheet explains, or null when closed. */
  task: Task | null;
  /** The engine's reason for `task`, resolved by the caller (may be stale by one recompute — see `app/(tabs)/tasks.tsx`). */
  info: Unschedulable | undefined;
  onClose: () => void;
}

/**
 * FR-20's "explain why + one-tap fix" surface. A calm bottom sheet — same
 * chrome as `ScheduleModal`/`DueRangeModal` in `app/(tabs)/tasks.tsx` — that
 * shows the engine's own human-readable reason a task could not be placed,
 * plus zero or more one-tap fixes appropriate to that reason's `kind`. Never
 * blames the user: a task the app could not schedule is the app's problem to
 * explain (CLAUDE.md "no shame copy" rule), so this only ever states the
 * constraint and offers a way past it.
 *
 * Each fix applies its patch via the existing `taskStore.updateTask` and then
 * calls `scheduleStore.recompute()` directly so the result is visible the
 * moment the sheet closes, rather than waiting on the debounced background
 * recompute trigger already wired in `store/scheduleStore.ts` (that trigger
 * still fires a moment later too; recomputing twice on unchanged input is
 * cheap and harmless — `core/scheduler/recompute.ts`'s stability pass makes
 * the second run a no-op).
 */
export function UnschedulableFixSheet({ task, info, onClose }: UnschedulableFixSheetProps) {
  const updateTask = useTaskStore((s) => s.updateTask);
  const completeTask = useTaskStore((s) => s.completeTask);
  const recompute = useScheduleStore((s) => s.recompute);

  const applyFix = useCallback(
    (patch: Partial<Task>) => {
      if (!task) return;
      updateTask(task.id, patch);
      recompute();
      onClose();
    },
    [task, updateTask, recompute, onClose],
  );

  const handleMarkDone = useCallback(() => {
    if (!task) return;
    completeTask(task.id);
    recompute();
    onClose();
  }, [task, completeTask, recompute, onClose]);

  // One-tap fixes, chosen from the engine's own `kind` (never by re-parsing
  // the prose reason) — see `core/scheduler/types.ts#UnschedulableReasonKind`.
  // Each maps directly to one of the remedies FR-20 names in prose: relax
  // scheduling hours, extend the deadline, make it splittable. ("Remove a
  // blocking all-day event" is the fourth remedy FR-20 names; it is not
  // offered here because there is no CalEvent create/edit/delete surface
  // anywhere in the app yet to act on — see the PR notes.)
  const fixes = useMemo<FixAction[]>(() => {
    if (!task || !info) return [];
    const now = Date.now();
    const out: FixAction[] = [];

    const canExtendDeadline =
      info.kind === "past_deadline" || info.kind === "no_free_time" || info.kind === "partially_placed";
    if (canExtendDeadline) {
      out.push({
        key: "extend",
        label: "Extend deadline by a week",
        icon: "calendar-outline",
        hint: `Moves the deadline for ${task.title} out by a week so there is more room to place it`,
        onPress: () => applyFix({ due: pushDeadlineOneWeek(task.due, now) }),
      });
    }

    if (info.kind === "past_deadline") {
      out.push({
        key: "done",
        label: "Mark done instead",
        icon: "checkmark-circle-outline",
        hint: `Marks ${task.title} complete instead of rescheduling it`,
        onPress: handleMarkDone,
      });
    }

    const canRelaxHours =
      info.kind === "no_free_time" || info.kind === "no_free_time_undated" || info.kind === "partially_placed";
    if (canRelaxHours) {
      out.push({
        key: "anytime",
        label: "Allow scheduling at any time",
        icon: "time-outline",
        hint: `Removes ${task.title}'s scheduling-hours restriction so it can be placed anytime`,
        onPress: () => applyFix({ schedulingHours: anyTimeSchedulingHours() }),
      });
    }

    const canSplit =
      !task.splittable && (info.kind === "no_free_time" || info.kind === "no_free_time_undated");
    if (canSplit) {
      out.push({
        key: "split",
        label: "Split into sessions",
        icon: "cut-outline",
        hint: `Allows ${task.title} to be broken into multiple shorter sessions instead of one sitting`,
        onPress: () => applyFix({ splittable: true }),
      });
    }

    if (info.kind === "zero_duration") {
      out.push({
        key: "duration",
        label: "Set duration to 30 min",
        icon: "hourglass-outline",
        hint: `Gives ${task.title} a 30-minute estimate so the engine has something to place`,
        onPress: () => applyFix({ durationMin: 30 }),
      });
    }

    return out;
  }, [task, info, applyFix, handleMarkDone]);

  const visible = task != null && info != null;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable
        className="flex-1 bg-black/40 justify-end"
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Dismiss"
      >
        <Pressable className="bg-white rounded-t-2xl p-5 pb-8" onPress={(e) => e.stopPropagation()}>
          <View className="items-center mb-4">
            <View className="w-10 h-1 rounded-full bg-neutral-200" />
          </View>

          <View className="flex-row items-center gap-2">
            <Ionicons name="alert-circle-outline" size={18} color="#C2410C" />
            <Heading size="h3">Couldn&apos;t schedule</Heading>
          </View>
          {task && (
            <Text className="text-body text-neutral-500 mt-1 mb-4" numberOfLines={2}>
              {task.title}
            </Text>
          )}

          {info && (
            <Text className="text-body text-neutral-700 mb-6">{info.reason}</Text>
          )}

          {fixes.length > 0 ? (
            <View className="gap-2 mb-2">
              {fixes.map((fix) => (
                <Button
                  key={fix.key}
                  title={fix.label}
                  variant="secondary"
                  icon={<Ionicons name={fix.icon} size={16} color="#2563EB" />}
                  onPress={fix.onPress}
                  accessibilityLabel={fix.label}
                  accessibilityHint={fix.hint}
                />
              ))}
            </View>
          ) : (
            <Text className="text-caption text-neutral-500 mb-2">
              This clears up on its own once the other task is scheduled or finished — nothing to
              fix here.
            </Text>
          )}

          <View className="mt-4">
            <Button title="Close" variant="ghost" onPress={onClose} accessibilityLabel="Close" />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
