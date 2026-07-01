import React, { useMemo } from "react";
import { View, Text } from "react-native";
import { router } from "expo-router";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useShallow } from "zustand/react/shallow";
import { PressableScale } from "@/components/ui/PressableScale";
import { useTaskStore } from "@/store/taskStore";
import { useScheduleStore, selectUpcomingBlocks } from "@/store/scheduleStore";
import { slackColor } from "@/core/scheduler";
import { shadows } from "@/utils/design-tokens";
import { DURATIONS, staggerDelay } from "@/utils/motion";
import { useReduceMotion } from "@/hooks/useReduceMotion";
import type { ScheduledBlock, Task } from "@/types";
import type { SlackColor } from "@/core/scheduler";

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

/** Start-of-day epoch ms for a given epoch ms (local time). */
function startOfDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/**
 * Day header label relative to today: "Today", "Tomorrow", else the weekday
 * name (e.g. "Friday"); for anything a week or more out, add the month/day.
 */
function formatDayHeader(dayStart: number, todayStart: number): string {
  const diffDays = Math.round((dayStart - todayStart) / DAY_MS);
  if (diffDays <= 0) return "Today";
  if (diffDays === 1) return "Tomorrow";
  const d = new Date(dayStart);
  if (diffDays < 7) return WEEKDAYS_LONG[d.getDay()];
  return d.toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
}

/** Meridiem ("AM"/"PM") for an epoch-ms instant. */
function meridiem(ms: number): string {
  return new Date(ms).getHours() < 12 ? "AM" : "PM";
}

/** "3:00 PM" style clock label for an epoch-ms instant. */
function formatClock(ms: number): string {
  return new Date(ms).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * Time range like "3:00 - 4:00 PM". When both ends fall in the same meridiem
 * we drop it from the start label for a tighter read; otherwise keep both.
 */
function formatTimeRange(start: number, end: number): string {
  const startLabel = formatClock(start);
  const endLabel = formatClock(end);
  if (meridiem(start) === meridiem(end)) {
    const startNoMeridiem = startLabel.replace(/\s*(AM|PM)\s*$/i, "");
    return `${startNoMeridiem} - ${endLabel}`;
  }
  return `${startLabel} - ${endLabel}`;
}

/** Slack color token -> dot background + human label (for a11y). */
const SLACK_STYLES: Record<SlackColor, { dot: string; label: string }> = {
  green: { dot: "bg-success-500", label: "On track" },
  amber: { dot: "bg-warning-500", label: "Getting tight" },
  red: { dot: "bg-danger-500", label: "At risk" },
};

interface UpcomingRow {
  block: ScheduledBlock;
  task: Task;
  slack: SlackColor;
}

interface DayGroup {
  key: number;
  header: string;
  rows: UpcomingRow[];
}

export interface UpcomingListProps {
  /** Max number of upcoming blocks to show. @default 8 */
  limit?: number;
  /**
   * When true, don't stagger-animate rows (used when the list is nested in an
   * already-animating section so entrances don't double up).
   */
  disableStagger?: boolean;
}

/**
 * Premium agenda list of upcoming scheduled blocks, grouped by day
 * (Today / Tomorrow / weekday). Each row shows the block's time range, the
 * task title, a deadline-slack dot, and an "N steps" hint when the task has
 * subtasks. Tapping a row opens the task.
 *
 * The scheduling TIME is the value the engine adds over a plain task list, so
 * it is the visual anchor of each row.
 */
export function UpcomingList({
  limit = 8,
  disableStagger = false,
}: UpcomingListProps) {
  const reduceMotion = useReduceMotion();

  // NEW array from the store -> MUST use useShallow (Zustand v5, project rule).
  const blocks = useScheduleStore(useShallow(selectUpcomingBlocks(limit)));
  const tasks = useTaskStore((s) => s.tasks);

  // Group blocks by local day, resolving each block's task + slack color.
  const groups = useMemo<DayGroup[]>(() => {
    const now = Date.now();
    const todayStart = startOfDay(now);
    const byDay = new Map<number, DayGroup>();

    for (const block of blocks) {
      const task = tasks[block.taskId];
      if (!task) continue; // task deleted since last recompute; skip stale block

      const dayStart = startOfDay(block.start);
      let group = byDay.get(dayStart);
      if (!group) {
        group = {
          key: dayStart,
          header: formatDayHeader(dayStart, todayStart),
          rows: [],
        };
        byDay.set(dayStart, group);
      }
      group.rows.push({ block, task, slack: slackColor(task, now) });
    }

    return Array.from(byDay.values()).sort((a, b) => a.key - b.key);
  }, [blocks, tasks]);

  if (groups.length === 0) return null;

  // Global row index across all groups so the stagger reads as one sequence.
  let rowIndex = -1;

  return (
    <View className="gap-5">
      {groups.map((group) => (
        <View key={group.key} className="gap-3">
          <Text className="text-overline font-semibold uppercase tracking-wide text-neutral-400">
            {group.header}
          </Text>
          <View className="gap-3">
            {group.rows.map((row) => {
              rowIndex += 1;
              const entering =
                reduceMotion || disableStagger
                  ? undefined
                  : FadeInDown.delay(staggerDelay(rowIndex)).duration(
                      DURATIONS.base
                    );
              return (
                <Animated.View key={row.block.id} entering={entering}>
                  <UpcomingRowCard row={row} />
                </Animated.View>
              );
            })}
          </View>
        </View>
      ))}
    </View>
  );
}

function UpcomingRowCard({ row }: { row: UpcomingRow }) {
  const { block, task, slack } = row;
  const subtaskCount = task.subtasks.length;
  const hasSubtasks = subtaskCount > 0;
  const slackStyle = SLACK_STYLES[slack];

  const timeRange = useMemo(
    () => formatTimeRange(block.start, block.end),
    [block.start, block.end]
  );

  const a11yLabel = [
    task.title,
    `scheduled ${timeRange}`,
    slackStyle.label,
    hasSubtasks
      ? `${subtaskCount} ${subtaskCount === 1 ? "step" : "steps"}`
      : null,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <PressableScale
      onPress={() => router.push(`/task/${task.id}`)}
      haptic="light"
      style={shadows.sm}
      className="flex-row items-center gap-3 bg-white border border-neutral-200 rounded-lg p-4 min-h-14"
      accessibilityRole="button"
      accessibilityLabel={a11yLabel}
      accessibilityHint="Opens task details"
    >
      {/* Slack dot - the deadline-pressure signal. */}
      <View
        className={`w-2.5 h-2.5 rounded-full ${slackStyle.dot}`}
        accessibilityElementsHidden
        importantForAccessibility="no"
      />

      {/* Time + title - time is the anchor the scheduler earns. */}
      <View className="flex-1">
        <Text className="text-caption font-semibold text-primary-600">
          {timeRange}
        </Text>
        <Text
          className="text-body font-medium text-neutral-900 mt-0.5"
          numberOfLines={1}
        >
          {task.title}
        </Text>
      </View>

      {/* Steps hint. */}
      {hasSubtasks && (
        <Text className="text-caption text-neutral-400">
          {subtaskCount} {subtaskCount === 1 ? "step" : "steps"}
        </Text>
      )}
    </PressableScale>
  );
}
