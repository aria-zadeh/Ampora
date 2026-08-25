/**
 * FocusTaskRow, a compact, calm row showing a task's next step.
 *
 * Extracted from `app/(tabs)/focus.tsx` per doc `design/DECISION_SPEC` D1 and
 * restyled. The old green circular play button and green step-arrow are gone
 * (D3, no green on anything that starts or runs, and this row doesn't even
 * start anything any more, see below). Used in two places: the tab's "Up
 * next" list and the hero composer's bottom-sheet task picker.
 *
 * Its meaning changed with the lock-first rebuild. Tapping this row no longer
 * navigates into a session, it SELECTS the task into the hero composer, so a
 * `selected` row gets a quiet primary-tinted treatment instead of an
 * affordance that implies "this starts something."
 */

import React, { useMemo } from "react";
import { View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { Text } from "@/components/ui/Text";
import { PressableScale } from "@/components/ui/PressableScale";
import { useListStore } from "@/store/listStore";
import { nextStep } from "@/core/task-logic";
import { colors, iconSizes, shadows } from "@/utils/design-tokens";
import type { Task } from "@/types";

export interface FocusTaskRowProps {
  task: Task;
  /** True when this is the task currently loaded into the hero composer. */
  selected?: boolean;
  onPress: () => void;
}

export function FocusTaskRow({ task, selected = false, onPress }: FocusTaskRowProps) {
  const lists = useListStore((s) => s.lists);
  const listName = task.listId ? lists[task.listId]?.name : undefined;

  const step = useMemo(() => nextStep(task), [task]);
  const stepLabel =
    step.kind === "first_move"
      ? step.action.text
      : step.kind === "subtask"
        ? step.subtask.title
        : "Ready to wrap up";

  return (
    <PressableScale
      onPress={onPress}
      haptic="light"
      className={`rounded-lg p-4 ${
        selected ? "bg-primary-50 border border-primary-200" : "bg-white border border-neutral-200"
      }`}
      style={shadows.xs}
      accessibilityRole="button"
      accessibilityLabel={`${task.title}${listName ? `, ${listName}` : ""}. Next: ${stepLabel}`}
      accessibilityHint="Loads this task into the focus composer"
      accessibilityState={{ selected }}
    >
      <View className="flex-row items-center">
        <View className="flex-1 pr-3">
          <Text variant="bodyMedium" className="text-neutral-900" numberOfLines={1}>
            {task.title}
          </Text>
          <Text variant="caption" className="text-neutral-500 mt-1" numberOfLines={1}>
            {stepLabel}
          </Text>
        </View>
        <Ionicons
          name={selected ? "checkmark-circle" : "chevron-forward"}
          size={iconSizes.sm}
          color={selected ? colors.light.primary : colors.light.textDisabled}
        />
      </View>
    </PressableScale>
  );
}
