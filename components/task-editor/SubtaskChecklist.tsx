import React, { useState } from "react";
import { View, TextInput, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Animated, {
  FadeInDown,
  FadeOut,
  LinearTransition,
} from "react-native-reanimated";
import { PressableScale } from "@/components/ui/PressableScale";
import { Text } from "@/components/ui/Text";
import { colors, shadows, tabularNums } from "@/utils/design-tokens";
import { staggerDelay, DURATIONS } from "@/utils/motion";
import { useReduceMotion } from "@/hooks/useReduceMotion";
import * as taskLogic from "@/core/task-logic";
import type { Subtask } from "@/types";
import { useThemeColors } from "@/hooks/useThemeColors";

interface SubtaskChecklistProps {
  subtasks: Subtask[];
  /** Add a new step. `estimatedMin` is already parsed to a number. */
  onAdd: (title: string, estimatedMin: number) => void;
  onToggle: (subtaskId: string) => void;
  onDelete: (subtaskId: string) => void;
  onEditTitle: (subtaskId: string, title: string) => void;
  /** Move a step from one array position to another (execution order). */
  onReorder: (fromIndex: number, toIndex: number) => void;
}

const DEFAULT_ESTIMATE = 15;

/**
 * One step row: the "quiet card" treatment (doc design decision D4 item 4).
 * Its own white card (radius 12, xs shadow), a 23px check circle (blue fill +
 * white check when done, sunken empty circle otherwise), a 15px/500 title
 * (done: strike-through + textDisabled, weight drops to 400), and a
 * right-aligned tabular time label. Reorder + delete stay available inside
 * the same card so no existing affordance is lost.
 */
function StepRow({
  subtask,
  index,
  isLast,
  onToggle,
  onEditTitle,
  onDelete,
  onReorder,
}: {
  subtask: Subtask;
  index: number;
  isLast: boolean;
  onToggle: (subtaskId: string) => void;
  onEditTitle: (subtaskId: string, title: string) => void;
  onDelete: (subtaskId: string) => void;
  onReorder: (fromIndex: number, toIndex: number) => void;
}) {
  // Only for the literal-colour props below (Ionicons `color`,
  // `placeholderTextColor`), which cannot take a `dark:` class.
  const theme = useThemeColors();
  const done = taskLogic.isSubtaskDone(subtask);

  const handleToggle = () => {
    Haptics.selectionAsync();
    onToggle(subtask.id);
  };

  return (
    <View
      className="flex-row items-center gap-2 rounded-lg bg-white dark:bg-neutral-900 px-3 py-1"
      style={shadows.xs}
      accessibilityLabel={`${subtask.title}, ${subtask.estimatedMin} minutes${done ? ", completed" : ""}`}
    >
      {/* Check circle: 44px hit area around a 23px visual circle. */}
      <Pressable
        onPress={handleToggle}
        hitSlop={4}
        className="h-11 w-11 items-center justify-center"
        accessibilityRole="checkbox"
        accessibilityState={{ checked: done }}
        accessibilityLabel={done ? "Mark step incomplete" : "Mark step complete"}
      >
        <View
          className={`h-[23px] w-[23px] items-center justify-center rounded-full ${
            done ? "bg-primary-600" : "bg-neutral-100 dark:bg-neutral-950"
          }`}
        >
          {done ? <Ionicons name="checkmark" size={13} color={colors.light.primaryForeground} /> : null}
        </View>
      </Pressable>

      {/* Title: press-scale + light haptic, matching the prior row's rename entry point. */}
      <PressableScale
        onPress={() => onEditTitle(subtask.id, subtask.title)}
        haptic="light"
        className="flex-1 py-2"
        accessibilityRole="button"
        accessibilityLabel={`Edit step: ${subtask.title}`}
      >
        <Text
          variant={done ? "body" : "bodyMedium"}
          className={done ? "text-neutral-400 dark:text-neutral-600 line-through" : "text-neutral-900 dark:text-neutral-50"}
          numberOfLines={2}
        >
          {subtask.title}
        </Text>
      </PressableScale>

      {/* Time */}
      <Text variant="captionMedium" className="text-neutral-600 dark:text-neutral-400" style={tabularNums}>
        {subtask.estimatedMin} min
      </Text>

      {/* Reorder (arrows, no drag). Each button's real box stays a compact
          24x28 so the row doesn't grow, but hitSlop brings its effective
          target to a full 44x44 (doc 02's touch-target floor). The two
          buttons' hitSlop is asymmetric — generous on the outer edge, and
          only enough on the shared inner edge to reach the `gap-1` between
          them — so they meet at that gap instead of overlapping into each
          other's hit area. */}
      <View className="flex-col gap-1">
        <Pressable
          onPress={() => onReorder(index, index - 1)}
          disabled={index === 0}
          hitSlop={{ top: 16, bottom: 4, left: 8, right: 8 }}
          className="h-6 w-7 items-center justify-center"
          accessibilityRole="button"
          accessibilityLabel={`Move ${subtask.title} up`}
          accessibilityState={{ disabled: index === 0 }}
        >
          <Ionicons
            name="chevron-up"
            size={14}
            color={index === 0 ? theme.borderStrong : theme.textMuted}
          />
        </Pressable>
        <Pressable
          onPress={() => onReorder(index, index + 1)}
          disabled={isLast}
          hitSlop={{ top: 4, bottom: 16, left: 8, right: 8 }}
          className="h-6 w-7 items-center justify-center"
          accessibilityRole="button"
          accessibilityLabel={`Move ${subtask.title} down`}
          accessibilityState={{ disabled: isLast }}
        >
          <Ionicons
            name="chevron-down"
            size={14}
            color={isLast ? theme.borderStrong : theme.textMuted}
          />
        </Pressable>
      </View>

      {/* Delete */}
      <Pressable
        onPress={() => onDelete(subtask.id)}
        hitSlop={8}
        className="h-11 w-8 items-center justify-center"
        accessibilityRole="button"
        accessibilityLabel={`Delete step: ${subtask.title}`}
      >
        <Ionicons name="trash-outline" size={16} color={theme.textMuted} />
      </Pressable>
    </View>
  );
}

export function SubtaskChecklist({
  subtasks,
  onAdd,
  onToggle,
  onDelete,
  onEditTitle,
  onReorder,
}: SubtaskChecklistProps) {
  // Only for the literal-colour props below (Ionicons `color`,
  // `placeholderTextColor`), which cannot take a `dark:` class.
  const theme = useThemeColors();
  const [newTitle, setNewTitle] = useState("");
  const [newMin, setNewMin] = useState("");
  const reduceMotion = useReduceMotion();

  const commitAdd = () => {
    const title = newTitle.trim();
    if (!title) return;
    const parsed = parseInt(newMin, 10);
    const estimatedMin =
      Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_ESTIMATE;
    onAdd(title, estimatedMin);
    setNewTitle("");
    setNewMin("");
  };

  const total = taskLogic.sumEstimatedMin(subtasks);
  const canAdd = newTitle.trim().length > 0;

  return (
    <View>
      {subtasks.length > 0 ? (
        <View className="gap-2">
          {subtasks.map((subtask, index) => (
            <Animated.View
              key={subtask.id}
              entering={
                reduceMotion
                  ? undefined
                  : FadeInDown.delay(staggerDelay(index)).duration(DURATIONS.base)
              }
              exiting={reduceMotion ? undefined : FadeOut.duration(DURATIONS.fast)}
              layout={reduceMotion ? undefined : LinearTransition.duration(DURATIONS.base)}
            >
              <StepRow
                subtask={subtask}
                index={index}
                isLast={index === subtasks.length - 1}
                onToggle={onToggle}
                onEditTitle={onEditTitle}
                onDelete={onDelete}
                onReorder={onReorder}
              />
            </Animated.View>
          ))}

          <Text variant="caption" className="px-1 text-neutral-500 dark:text-[#78716C]">
            {subtasks.length} step{subtasks.length === 1 ? "" : "s"} · {total}m total
          </Text>
        </View>
      ) : null}

      {/* Add-row input, unchanged. */}
      <View className="mt-3 flex-row items-center gap-2">
        <TextInput
          className="min-h-12 flex-1 rounded-md border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-3 text-body-lg text-neutral-900 dark:text-neutral-50"
          placeholder="Add a step"
          placeholderTextColor={theme.textDisabled}
          value={newTitle}
          onChangeText={setNewTitle}
          returnKeyType="done"
          onSubmitEditing={commitAdd}
          accessibilityLabel="New step title"
        />
        <TextInput
          className="min-h-12 w-16 rounded-md border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-2 text-center text-body-lg text-neutral-900 dark:text-neutral-50"
          placeholder="min"
          placeholderTextColor={theme.textDisabled}
          value={newMin}
          onChangeText={setNewMin}
          keyboardType="number-pad"
          returnKeyType="done"
          onSubmitEditing={commitAdd}
          accessibilityLabel="New step estimate in minutes"
        />
        <PressableScale
          onPress={commitAdd}
          haptic={canAdd ? "light" : false}
          disabled={!canAdd}
          className={`h-12 w-12 items-center justify-center rounded-md ${
            canAdd ? "bg-primary-600" : "bg-neutral-200"
          }`}
          style={canAdd ? shadows.xs : undefined}
          accessibilityRole="button"
          accessibilityLabel="Add step"
          accessibilityState={{ disabled: !canAdd }}
        >
          <Ionicons name="add" size={22} color={colors.light.primaryForeground} />
        </PressableScale>
      </View>
    </View>
  );
}
