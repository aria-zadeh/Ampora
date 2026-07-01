import React, { useCallback, useMemo } from "react";
import { View, Text, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { PressableScale } from "./PressableScale";
import { ProgressBar } from "./ProgressBar";
import { Badge } from "./Badge";
import { shadows } from "@/utils/design-tokens";
import type { Task } from "@/types";

export interface TaskCardProps {
  task: Task;
  /** Optional hex color of the task's list, shown as a small dot in the meta row. */
  listColor?: string;
  onPress?: () => void;
  onToggleComplete?: () => void;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Start-of-day epoch ms for a given epoch ms. */
function startOfDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/**
 * Relative due label from an epoch-ms due date, e.g. "Overdue", "Due today",
 * "Due Fri", "Due Mar 3". Returns null when there is no due date.
 */
function formatDue(due: number | undefined): string | null {
  if (due == null) return null;
  const today = startOfDay(Date.now());
  const dueDay = startOfDay(due);
  const diffDays = Math.round((dueDay - today) / DAY_MS);

  if (diffDays < 0) return "Overdue";
  if (diffDays === 0) return "Due today";
  if (diffDays === 1) return "Due tomorrow";
  if (diffDays < 7) return `Due ${WEEKDAYS[new Date(due).getDay()]}`;
  return `Due ${new Date(due).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
}

export function TaskCard({
  task,
  listColor,
  onPress,
  onToggleComplete,
}: TaskCardProps) {
  const isDone = task.status === "done";
  const subtaskCount = task.subtasks.length;
  const hasSubtasks = subtaskCount > 0;

  const dueLabel = useMemo(() => formatDue(task.due), [task.due]);
  const isOverdue = dueLabel === "Overdue";
  const progress = useMemo(
    () => (hasSubtasks ? task.progressMin / Math.max(task.durationMin, 1) : 0),
    [hasSubtasks, task.progressMin, task.durationMin]
  );

  // Success haptic when completing, light tick when reopening.
  const handleToggle = useCallback(() => {
    if (isDone) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
    onToggleComplete?.();
  }, [isDone, onToggleComplete]);

  return (
    <View className="flex-row items-center gap-3">
      {/* Completion checkbox */}
      <Pressable
        onPress={handleToggle}
        className="min-w-11 min-h-11 items-center justify-center"
        accessibilityRole="checkbox"
        accessibilityState={{ checked: isDone }}
        accessibilityLabel={isDone ? "Mark task incomplete" : "Mark task complete"}
        hitSlop={8}
      >
        <View
          className={`w-7 h-7 rounded-full items-center justify-center ${
            isDone ? "bg-primary-600" : "border-2 border-neutral-300"
          }`}
        >
          {isDone && <Ionicons name="checkmark" size={16} color="#FFFFFF" />}
        </View>
      </Pressable>

      {/* Card body */}
      <PressableScale
        onPress={onPress}
        haptic="light"
        style={shadows.sm}
        className="flex-1 bg-white border border-neutral-200 rounded-lg p-4 min-h-14"
        accessibilityRole="button"
        accessibilityLabel={`Task: ${task.title}.${dueLabel ? ` ${dueLabel}.` : ""}${
          hasSubtasks ? ` ${subtaskCount} steps.` : ""
        }${isDone ? " Completed." : ""}`}
        accessibilityHint="Opens task details"
      >
        {/* Title + optional overdue badge */}
        <View className="flex-row items-start justify-between">
          <Text
            className={`flex-1 text-body font-medium ${
              isDone ? "line-through text-neutral-400" : "text-neutral-900"
            }`}
            numberOfLines={2}
          >
            {task.title}
          </Text>
          {isOverdue && !isDone && (
            <View className="ml-2">
              <Badge label="Overdue" tone="danger" />
            </View>
          )}
        </View>

        {/* Meta row */}
        {(dueLabel || listColor || hasSubtasks) && (
          <View className="flex-row items-center flex-wrap gap-x-3 gap-y-1 mt-1.5">
            {dueLabel && !isOverdue && (
              <Text className="text-caption text-neutral-500">{dueLabel}</Text>
            )}
            {listColor && (
              <View
                className="w-2.5 h-2.5 rounded-full"
                style={{ backgroundColor: listColor }}
              />
            )}
            {hasSubtasks && (
              <Text className="text-caption text-neutral-500">
                {subtaskCount} {subtaskCount === 1 ? "step" : "steps"}
              </Text>
            )}
          </View>
        )}

        {/* Progress bar (only when subtasks exist) */}
        {hasSubtasks && (
          <View className="mt-3">
            <ProgressBar progress={progress} height={4} />
          </View>
        )}
      </PressableScale>
    </View>
  );
}
