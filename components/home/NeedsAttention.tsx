import React, { useCallback, useMemo } from "react";
import { View, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useShallow } from "zustand/react/shallow";
import { PressableScale } from "@/components/ui/PressableScale";
import { Heading } from "@/components/ui/Heading";
import { useTaskStore } from "@/store/taskStore";
import { useScheduleStore, selectMissedBlocks } from "@/store/scheduleStore";
import { shadows } from "@/utils/design-tokens";
import { DURATIONS, staggerDelay } from "@/utils/motion";
import { useReduceMotion } from "@/hooks/useReduceMotion";
import type { ScheduledBlock, Task } from "@/types";

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEKDAYS_LONG = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

/** Start-of-day epoch ms (local). */
function startOfDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** "3:00 PM" clock label for an epoch-ms instant. */
function formatClock(ms: number): string {
  return new Date(ms).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * Calm "when it was due" phrase: "Today at 3:00 PM", "Yesterday at 9:00 AM", a
 * weekday for the last week ("Monday at …"), else a short date. No shame words.
 */
function formatWhenDue(start: number, now: number): string {
  const daysAgo = Math.round((startOfDay(now) - startOfDay(start)) / DAY_MS);
  const time = formatClock(start);
  if (daysAgo <= 0) return `Today at ${time}`;
  if (daysAgo === 1) return `Yesterday at ${time}`;
  if (daysAgo < 7) return `${WEEKDAYS_LONG[new Date(start).getDay()]} at ${time}`;
  const date = new Date(start).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
  return `${date} at ${time}`;
}

interface MissedRow {
  block: ScheduledBlock;
  task: Task;
}

/**
 * "Needs attention", the calm missed-work surface on Home (FR-16, §8.6). Shows
 * only when there are missed blocks (elapsed sessions whose task is still open,
 * marked `status: 'missed'` by the scheduler). Two inline, zero-shame actions
 * per item: Reschedule (re-place the remaining work) and Let it go (drop the
 * reminder). Tone is deliberately gentle, no counts thrown at the user, no
 * "you missed X" copy.
 *
 * Renders nothing when the list is empty, so the caller can mount it
 * unconditionally.
 */
export function NeedsAttention() {
  const reduceMotion = useReduceMotion();

  // Fresh array from the store -> MUST use useShallow (Zustand v5, project rule)
  // or this selector re-loops (React #185).
  const missedBlocks = useScheduleStore(useShallow(selectMissedBlocks));
  const tasks = useTaskStore((s) => s.tasks);

  const rescheduleBlock = useScheduleStore((s) => s.rescheduleBlock);
  const dropBlock = useScheduleStore((s) => s.dropBlock);

  // Resolve each block to its (still-existing) task; skip stale blocks.
  const rows = useMemo<MissedRow[]>(() => {
    const out: MissedRow[] = [];
    for (const block of missedBlocks) {
      const task = tasks[block.taskId];
      if (!task) continue;
      out.push({ block, task });
    }
    return out;
  }, [missedBlocks, tasks]);

  const onReschedule = useCallback(
    (blockId: string) => rescheduleBlock(blockId),
    [rescheduleBlock]
  );
  const onLetGo = useCallback(
    (blockId: string) => dropBlock(blockId),
    [dropBlock]
  );

  if (rows.length === 0) return null;

  const now = Date.now();

  return (
    <Animated.View
      className="mt-7"
      entering={reduceMotion ? undefined : FadeInDown.duration(DURATIONS.base)}
    >
      <View className="flex-row items-baseline justify-between mb-4">
        <Heading size="h3">Needs attention</Heading>
        <Text className="text-caption text-neutral-500">
          {rows.length} {rows.length === 1 ? "item" : "items"}
        </Text>
      </View>
      <View className="gap-3">
        {rows.map((row, index) => (
          <Animated.View
            key={row.block.id}
            entering={
              reduceMotion
                ? undefined
                : FadeInDown.delay(staggerDelay(index)).duration(DURATIONS.base)
            }
          >
            <MissedCard
              row={row}
              now={now}
              onReschedule={() => onReschedule(row.block.id)}
              onLetGo={() => onLetGo(row.block.id)}
            />
          </Animated.View>
        ))}
      </View>
    </Animated.View>
  );
}

function MissedCard({
  row,
  now,
  onReschedule,
  onLetGo,
}: {
  row: MissedRow;
  now: number;
  onReschedule: () => void;
  onLetGo: () => void;
}) {
  const { block, task } = row;
  const when = useMemo(() => formatWhenDue(block.start, now), [block.start, now]);

  return (
    <View
      className="bg-white border border-neutral-200 rounded-lg p-4"
      style={shadows.sm}
    >
      <View className="flex-row items-start gap-3">
        {/* Calm amber marker, a cue, not an alarm. Decorative, hidden from a11y. */}
        <View
          className="mt-0.5 h-8 w-8 items-center justify-center rounded-full bg-warning-100"
          accessibilityElementsHidden
          importantForAccessibility="no"
        >
          <Ionicons name="time-outline" size={16} color="#C2410C" />
        </View>
        <View className="flex-1">
          <Text
            className="text-body font-medium text-neutral-900"
            numberOfLines={2}
          >
            {task.title}
          </Text>
          <Text className="mt-0.5 text-caption text-neutral-500">
            Was planned {when}
          </Text>
        </View>
      </View>

      {/* Inline actions, Reschedule (primary) + Let it go (ghost). */}
      <View className="mt-3 flex-row gap-2">
        <PressableScale
          onPress={onReschedule}
          haptic="light"
          className="flex-1 min-h-11 flex-row items-center justify-center gap-1.5 rounded-md bg-primary-600"
          style={shadows.xs}
          accessibilityRole="button"
          accessibilityLabel={`Reschedule ${task.title}`}
          accessibilityHint="Finds a new time for the remaining work"
        >
          <Ionicons name="refresh-outline" size={16} color="#FFFFFF" />
          <Text className="text-label font-semibold text-white">Reschedule</Text>
        </PressableScale>
        <PressableScale
          onPress={onLetGo}
          haptic="selection"
          className="min-h-11 flex-row items-center justify-center rounded-md border border-neutral-200 bg-white px-4"
          accessibilityRole="button"
          accessibilityLabel={`Let it go: ${task.title}`}
          accessibilityHint="Clears this reminder without changing the task"
        >
          <Text className="text-label font-medium text-neutral-600">Let it go</Text>
        </PressableScale>
      </View>
    </View>
  );
}
