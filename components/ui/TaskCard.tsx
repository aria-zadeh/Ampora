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
import { useThemeColors } from "@/hooks/useThemeColors";
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

function TaskCardImpl({
  task,
  listColor,
  onPress,
  onToggleComplete,
  onLongPress,
  leading,
  lifted = false,
}: TaskCardProps) {
  const reduceMotion = useReduceMotion();
  // Two Ionicons `color`s below take literal values and cannot take a
  // `dark:` class, so they resolve the active scheme here. Everything else
  // in this card is className-driven and uses `dark:` variants directly.
  const theme = useThemeColors();
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
          {/* Checked is a FILLED accent under a white checkmark, so it keeps
              one value in both themes (doc 02 §14.1) — the fill is opaque
              and white-on-primary stays 5.17:1 whatever is behind the card.
              Unchecked is the neutral borderStrong row, and worth being
              honest about: at 1.38:1 on the light canvas it already misses
              the 3:1 a control boundary owes, and dark lands at 1.92:1, so
              dark is the better of the two. Raising it is a light-mode
              design change rather than a dark-mode fix, so it is not made
              here; the control is 44x44, labelled, and announces
              `accessibilityState.checked` either way. */}
          <View
            className={`w-7 h-7 rounded-full items-center justify-center ${
              isDone ? "bg-primary-600" : "border-2 border-neutral-300 dark:border-neutral-700"
            }`}
          >
            <Animated.View style={checkAnimatedStyle}>
              <Ionicons name="checkmark" size={16} color={theme.primaryForeground} />
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
        // Cheatsheet card + border rows. The hairline is decorative in both
        // themes (1.25:1 light, 1.15:1 dark), the same exemption
        // `components/ui/Card.tsx` and Button's `secondary` variant document.
        className="flex-1 flex-row bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg min-h-14 overflow-hidden"
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
            {/* The done tone steps to textSecondary rather than mirroring
                textMuted, because this is 15px body copy and not the 13px
                caption tier the bespoke dark textMuted value is signed off
                for: neutral-400 is 6.91:1 on the dark card where textMuted
                would be 3.65:1, under the 4.5:1 body bar. The strike-through
                (not the tone) is what actually marks completion, so nothing
                here is carried by colour alone. */}
            <Text
              className={`flex-1 text-body font-medium ${
                isDone
                  ? "line-through text-neutral-500 dark:text-neutral-400"
                  : "text-neutral-900 dark:text-neutral-50"
              }`}
              numberOfLines={2}
              ellipsizeMode="tail"
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
            {/* Both meta labels are 13px, the caption tier the bespoke dark
                textMuted value is audited for (3.65:1 on the dark card, doc
                02 §14.6). Spelled as the arbitrary literal the
                `utils/design-tokens.ts` cheatsheet prescribes, never
                `dark:text-neutral-500` (3.19:1). `tabularNums` is untouched
                so the counts stay column-aligned. */}
            {dueLabel && !isOverdue && (
              <Text
                style={tabularNums}
                className="text-caption text-neutral-500 dark:text-[#78716C]"
                numberOfLines={1}
              >
                {dueLabel}
              </Text>
            )}
            {/* Caller-supplied List identity colour, deliberately not
                theme-resolved for the same reason as `Chip`'s dot: the hex
                is persisted and matched by equality, so it cannot move with
                the scheme. Decorative — the meta row carries no state that
                this dot alone announces. */}
            {listColor && (
              <View
                className="w-2.5 h-2.5 rounded-full"
                style={{ backgroundColor: listColor }}
              />
            )}
            {hasSubtasks && (
              <Text
                style={tabularNums}
                className="text-caption text-neutral-500 dark:text-[#78716C]"
              >
                {doneSubtaskCount}/{subtaskCount}
              </Text>
            )}
            {/* The 6px dot is a decorative bullet beside its own label and
                stays put; the LABEL is accent text on a neutral surface, so
                it takes the §1.8 step: primary-600 is 3.38:1 on the dark
                card, short of the 4.5:1 a 13px line owes, and primary-400
                clears it at 6.88:1. */}
            {hasFirstMove && (
              <View className="flex-row items-center gap-1">
                <View className="w-1.5 h-1.5 rounded-full bg-primary-500" />
                <Text className="text-caption text-primary-600 dark:text-primary-400">
                  First move
                </Text>
              </View>
            )}
            {/* Purple is Projects-only, and this is the shape that keeps it
                inside its known limit: an OPAQUE accent-100 tint with an
                accentStrong glyph on it (4.80:1), self-contained, so neither
                half moves with the theme and no `dark:` variant applies. The
                ramp has no step reaching 4.5:1 on a dark surface (#7C3AED is
                3.07:1, #8B5CF6 4.13:1, there is no 400), so purple must
                never become reading text on dark — see the KNOWN LIMIT note
                in `utils/design-tokens.ts`. It is not one here. */}
            {hasProject && (
              <View className="w-4 h-4 rounded-full bg-accent-100 items-center justify-center">
                <Ionicons name="rocket-outline" size={10} color={theme.accentStrong} />
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

/**
 * Memoized (Phase 7 perf fix): FlashList recycles/re-renders every visible
 * row on any store mutation (create/complete/edit/filter), even rows whose
 * own `task` is unchanged. Default shallow prop comparison is enough here —
 * `task` only gets a new identity when the store actually mutates that
 * task (see `taskStore`'s immutable updates), and callers now pass stable
 * callback identities (see `app/(tabs)/tasks.tsx`).
 */
export const TaskCard = React.memo(TaskCardImpl);
