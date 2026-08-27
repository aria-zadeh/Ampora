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
import { iconSizes, shadows } from "@/utils/design-tokens";
import { useThemeColors } from "@/hooks/useThemeColors";
import type { Task } from "@/types";

/**
 * Selection is carried by SURFACE on light and by BORDER on dark, and that
 * split is deliberate rather than a shortcut.
 *
 * Light tints the row primary-50 with a primary-200 hairline. Dark cannot
 * copy that: the blue ramp has no step between primary-900 (#1E3A8A, a
 * saturated navy far too loud for a row meant to read as quiet) and the pale
 * 50, which would go bright-on-dark and, worse, would leave the title
 * unreadable (the `Text` primitive's own `dark:text-neutral-50` beats a
 * caller's bare override, so near-white ink would land on a near-white tint).
 *
 * Lifting the selected row to the elevated step (neutral-800) instead was
 * considered and rejected: the trailing checkmark glyph is #2563EB, which
 * measures 2.93:1 on #292524 and misses the 3:1 graphical-object bar, while
 * on the card (#1C1917) it clears at 3.38:1. So dark keeps the card surface
 * for both states and swaps border-neutral-800 for border-primary-600
 * (3.38:1, plainly visible) — the same pattern StakesSettings'
 * StrengthPicker uses for its selected pill.
 *
 * State is never colour alone either way: the trailing glyph changes SHAPE
 * (chevron -> checkmark-circle) and `accessibilityState` announces it.
 */
const SELECTED_SURFACE =
  "bg-primary-50 border border-primary-200 dark:bg-neutral-900 dark:border-primary-600";
const RESTING_SURFACE =
  "bg-white border border-neutral-200 dark:bg-neutral-900 dark:border-neutral-800";

export interface FocusTaskRowProps {
  task: Task;
  /** True when this is the task currently loaded into the hero composer. */
  selected?: boolean;
  onPress: () => void;
}

export function FocusTaskRow({ task, selected = false, onPress }: FocusTaskRowProps) {
  const theme = useThemeColors();
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
      className={`rounded-lg p-4 ${selected ? SELECTED_SURFACE : RESTING_SURFACE}`}
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
          <Text variant="caption" className="text-neutral-500 dark:text-[#78716C] mt-1" numberOfLines={1}>
            {stepLabel}
          </Text>
        </View>
        {/* Ionicons `color` takes a literal, so it resolves the scheme here
            rather than riding a `dark:` class. Selected is #2563EB in both
            token sets (3.38:1 on the dark card, clear of the 3:1 glyph bar).
            The resting chevron is `textDisabled` in both, which is low by
            design and identical in weight to what light already ships
            (#A8A29A on white, 2.50:1 / #57534E on the dark card, 2.29:1) —
            a decorative affordance beside a fully-labelled row whose whole
            surface is the touch target, not a control of its own. */}
        <Ionicons
          name={selected ? "checkmark-circle" : "chevron-forward"}
          size={iconSizes.sm}
          color={selected ? theme.primary : theme.textDisabled}
        />
      </View>
    </PressableScale>
  );
}
