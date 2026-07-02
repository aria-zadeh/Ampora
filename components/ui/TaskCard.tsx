import React, { useCallback, useMemo } from "react";
import { View, Text, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { PressableScale } from "./PressableScale";
import { PulseScale } from "./PulseScale";
import { ProgressBar } from "./ProgressBar";
import { Badge } from "./Badge";
import { shadows, listColors, tabularNums, type ListColorName } from "@/utils/design-tokens";
import { EASINGS, DURATIONS } from "@/utils/motion";
import { useReduceMotion } from "@/hooks/useReduceMotion";
import type { Task } from "@/types";

export interface TaskCardProps {
  task: Task;
  /** Optional hex color of the task's list. Drives both the meta dot AND the left tint-bar. */
  listColor?: string;
  onPress?: () => void;
  onToggleComplete?: () => void;
  /** Long-press (220ms default via Pressable's `delayLongPress`) — opens the context menu. */
  onLongPress?: () => void;
  /**
   * Rendered before the checkbox when present (Phase 3 manual-reorder drag
   * handle). Kept as a slot so TaskCard stays agnostic of the gesture wiring
   * that lives in the Tasks screen.
   */
  leading?: React.ReactNode;
  /** Lifts the card (scale + tinted shadow) while a long-press/drag holds it. */
  lifted?: boolean;
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
 * Relative due label from an epoch-ms due date, e.g. "Overdue", "Today,
 * 3:00 PM", "Fri", "Mar 3". Returns null when there is no due date. Includes
 * a clock time only when the due instant isn't a bare end-of-day stamp
 * (23:59), so quick-add's date-only tasks don't show a misleading "11:59 PM".
 */
function formatDue(due: number | undefined): string | null {
  if (due == null) return null;
  const today = startOfDay(Date.now());
  const dueDay = startOfDay(due);
  const diffDays = Math.round((dueDay - today) / DAY_MS);
  const d = new Date(due);
  const isEndOfDayStamp = d.getHours() === 23 && d.getMinutes() === 59;
  const time = isEndOfDayStamp
    ? null
    : d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

  let day: string;
  if (diffDays < 0) return "Overdue";
  else if (diffDays === 0) day = "Today";
  else if (diffDays === 1) day = "Tomorrow";
  else if (diffDays < 7) day = WEEKDAYS[d.getDay()];
  else day = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });

  return time ? `${day}, ${time}` : day;
}

/** Resolve a list color hex to its nearest `listColors` pastel bar tone, falling back to the hex itself. */
function resolveBarColor(hex?: string): string | undefined {
  if (!hex) return undefined;
  const upper = hex.toUpperCase();
  const match = (Object.keys(listColors) as ListColorName[]).find(
    (name) =>
      listColors[name].bar.toUpperCase() === upper ||
      listColors[name].text.toUpperCase() === upper,
  );
  return match ? listColors[match].bar : hex;
}

export function TaskCard({
  task,
  listColor,
  onPress,
  onToggleComplete,
  onLongPress,
  leading,
  lifted = false,
}: TaskCardProps) {
  const reduceMotion = useReduceMotion();
  const isDone = task.status === "done";
  const subtaskCount = task.subtasks.length;
  const hasSubtasks = subtaskCount > 0;
  const doneSubtaskCount = useMemo(
    () => task.subtasks.filter((s) => s.completedAt != null).length,
    [task.subtasks],
  );

  const dueLabel = useMemo(() => formatDue(task.due), [task.due]);
  const isOverdue = dueLabel === "Overdue";
  const progress = useMemo(
    () => (hasSubtasks ? task.progressMin / Math.max(task.durationMin, 1) : 0),
    [hasSubtasks, task.progressMin, task.durationMin],
  );

  const barColor = useMemo(() => resolveBarColor(listColor), [listColor]);
  const hasFirstMove = task.firstMove != null && !task.firstMove.done;
  const hasProject = task.projectId != null;

  // Success haptic when completing, light tick when reopening. The checkmark
  // itself crossfades in (see below); PulseScale gives the ONE celebratory
  // beat on completion. Both are skipped visually (not the haptic) under
  // reduce-motion.
  const handleToggle = useCallback(() => {
    if (isDone) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
    onToggleComplete?.();
  }, [isDone, onToggleComplete]);

  // Checkmark crossfade-in — a plain opacity/scale tween keyed on `isDone`,
  // separate from the PulseScale beat (which pops the whole checkbox once).
  const checkOpacity = useSharedValue(isDone ? 1 : 0);
  React.useEffect(() => {
    checkOpacity.value = reduceMotion
      ? isDone
        ? 1
        : 0
      : withTiming(isDone ? 1 : 0, { duration: DURATIONS.fast, easing: EASINGS.standard });
  }, [isDone, reduceMotion, checkOpacity]);
  const checkAnimatedStyle = useAnimatedStyle(() => ({
    opacity: checkOpacity.value,
    transform: reduceMotion ? [] : [{ scale: 0.6 + checkOpacity.value * 0.4 }],
  }));

  return (
    <View className="flex-row items-center gap-3">
      {leading}

      {/* Completion checkbox — PulseScale gives the single celebratory beat. */}
      <PulseScale trigger={isDone}>
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
            <Animated.View style={checkAnimatedStyle}>
              <Ionicons name="checkmark" size={16} color="#FFFFFF" />
            </Animated.View>
          </View>
        </Pressable>
      </PulseScale>

      {/* Card body */}
      <PressableScale
        onPress={onPress}
        onLongPress={onLongPress}
        delayLongPress={220}
        haptic="light"
        style={[
          shadows.sm,
          // `rounded-lg` in this project's Tailwind config is 12px (not the
          // Tailwind default 8px) — match that exactly so the tint bar's
          // outer corners are flush with the card's, per the design system.
          barColor ? { borderTopLeftRadius: 12, borderBottomLeftRadius: 12 } : null,
          lifted ? { transform: [{ scale: 1.02 }], shadowOpacity: 0.16, shadowRadius: 16 } : null,
        ]}
        className="flex-1 flex-row bg-white border border-neutral-200 rounded-lg min-h-14 overflow-hidden"
        accessibilityRole="button"
        accessibilityLabel={`Task: ${task.title}.${dueLabel ? ` ${dueLabel}.` : ""}${
          hasSubtasks ? ` ${doneSubtaskCount} of ${subtaskCount} steps.` : ""
        }${isDone ? " Completed." : ""}`}
        accessibilityHint="Opens task details. Long press for more actions"
      >
        {/* List-color tint bar — 3px rounded to match the card's left corners. */}
        {barColor && (
          <View
            style={{ width: 3, backgroundColor: barColor }}
            accessibilityElementsHidden
            importantForAccessibility="no"
          />
        )}

        <View className="flex-1 p-4">
          {/* Title + optional overdue badge */}
          <View className="flex-row items-start justify-between">
            <Text
              className={`flex-1 text-body font-medium ${
                isDone ? "line-through text-neutral-500" : "text-neutral-900"
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

          {/* Meta row — due chip, list dot, subtask count, first-move dot, project glyph.
              One line, gap-based, truncates cleanly. */}
          <View
            className="flex-row items-center flex-wrap gap-x-3 gap-y-1 mt-1.5"
            accessibilityElementsHidden
            importantForAccessibility="no"
          >
            {dueLabel && !isOverdue && (
              <Text style={tabularNums} className="text-caption text-neutral-500" numberOfLines={1}>
                {dueLabel}
              </Text>
            )}
            {listColor && (
              <View
                className="w-2.5 h-2.5 rounded-full"
                style={{ backgroundColor: listColor }}
              />
            )}
            {hasSubtasks && (
              <Text style={tabularNums} className="text-caption text-neutral-500">
                {doneSubtaskCount}/{subtaskCount}
              </Text>
            )}
            {hasFirstMove && (
              <View className="flex-row items-center gap-1">
                <View className="w-1.5 h-1.5 rounded-full bg-primary-500" />
                <Text className="text-caption text-primary-600">First move</Text>
              </View>
            )}
            {hasProject && (
              <View className="w-4 h-4 rounded-full bg-accent-100 items-center justify-center">
                <Ionicons name="rocket-outline" size={10} color="#7C3AED" />
              </View>
            )}
          </View>

          {/* Progress bar (only when subtasks exist) */}
          {hasSubtasks && (
            <View className="mt-3">
              <ProgressBar progress={progress} height={4} />
            </View>
          )}
        </View>
      </PressableScale>
    </View>
  );
}
