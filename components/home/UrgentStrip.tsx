import React, { useMemo } from "react";
import { View, Text } from "react-native";
import { router } from "expo-router";
import { PressableScale } from "@/components/ui/PressableScale";
import { shadows, colors } from "@/utils/design-tokens";
import type { Task } from "@/types";

/**
 * The single quiet urgency row at the top of Today's stack.
 *
 * One row, one task, no list. If more than one thing is close to due this
 * still shows only the nearest, because the whole point of the strip is to
 * be the one thing you cannot miss on a screen built for people who are
 * already overwhelmed. Everything else stays in Up next.
 *
 * Status is never colour alone (doc 02): the dot is decorative and the row
 * says "due in 9 hours" in words. A screen reader gets the same sentence.
 */

/** Only surface a task this close to due. Beyond this it is just "Up next". */
const URGENT_WINDOW_MS = 24 * 60 * 60 * 1000;

/** "due in 9 hours" / "due in 40 minutes" / "overdue". */
function formatUrgency(due: number, nowMs: number): string {
  const deltaMs = due - nowMs;
  if (deltaMs <= 0) return "overdue";

  const minutes = Math.round(deltaMs / 60000);
  if (minutes < 60) {
    return `due in ${minutes} ${minutes === 1 ? "minute" : "minutes"}`;
  }
  const hours = Math.round(deltaMs / 3600000);
  return `due in ${hours} ${hours === 1 ? "hour" : "hours"}`;
}

/**
 * Nearest-due incomplete task inside the urgent window, or null. Exported so
 * the Today screen can decide whether to render the strip at all without
 * duplicating the rule.
 */
export function selectUrgentTask(
  tasks: Record<string, Task>,
  nowMs: number
): Task | null {
  let best: Task | null = null;
  for (const task of Object.values(tasks)) {
    if (task.status === "done") continue;
    if (task.due == null) continue;
    if (task.due - nowMs > URGENT_WINDOW_MS) continue;
    if (best == null || task.due < (best.due as number)) best = task;
  }
  return best;
}

interface UrgentStripProps {
  task: Task;
  /** Injected so the row re-reads the clock on the screen's cadence, not its own. */
  nowMs: number;
}

export function UrgentStrip({ task, nowMs }: UrgentStripProps) {
  const urgencyLabel = useMemo(
    () => formatUrgency(task.due as number, nowMs),
    [task.due, nowMs]
  );

  const line = `${task.title} · ${urgencyLabel}`;

  return (
    <PressableScale
      onPress={() => router.push(`/task/${task.id}`)}
      haptic="light"
      className="min-h-11 flex-row items-center gap-2.5 rounded-lg bg-white px-4 py-3"
      style={shadows.sm}
      accessibilityRole="button"
      accessibilityLabel={`${task.title}, ${urgencyLabel}`}
      accessibilityHint="Opens this task"
    >
      {/* Dot in a tinted ring. The ring is a solid warning-100 circle rather */}
      {/* than an alpha shadow so nothing here needs a raw rgba literal. */}
      <View className="h-3.5 w-3.5 items-center justify-center rounded-full bg-warning-100">
        <View
          className="h-2 w-2 rounded-full"
          style={{ backgroundColor: colors.light.warningAccent }}
        />
      </View>
      <Text className="flex-1 text-body font-semibold text-neutral-900" numberOfLines={2}>
        {line}
      </Text>
    </PressableScale>
  );
}
