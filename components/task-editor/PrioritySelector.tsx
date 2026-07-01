import React from "react";
import { View, Text, Pressable } from "react-native";

/** Priority labels indexed to match PRIORITY_VALUES (1=Low … 4=Urgent). */
export const PRIORITY_LABELS = ["Low", "Medium", "High", "Urgent"] as const;
/** The numeric `Task.priority` values, in the same order as PRIORITY_LABELS. */
export const PRIORITY_VALUES = [1, 2, 3, 4] as const;

/** Selected-state accent per priority level (higher = warmer/more urgent). */
const SELECTED_CLASSES: Record<number, { bg: string; border: string; text: string }> = {
  1: { bg: "bg-neutral-100", border: "border-neutral-300", text: "text-neutral-700" },
  2: { bg: "bg-primary-100", border: "border-primary-300", text: "text-primary-700" },
  3: { bg: "bg-warning-100", border: "border-warning-500", text: "text-warning-700" },
  4: { bg: "bg-danger-100", border: "border-danger-500", text: "text-danger-700" },
};

interface PrioritySelectorProps {
  /** Current priority (1..4). Defaults to Medium (2) upstream. */
  value: number;
  onChange: (priority: number) => void;
}

export function PrioritySelector({ value, onChange }: PrioritySelectorProps) {
  return (
    <View className="flex-row gap-2" accessibilityRole="radiogroup">
      {PRIORITY_VALUES.map((priority, i) => {
        const active = value === priority;
        const accent = SELECTED_CLASSES[priority];
        const containerClass = active
          ? `flex-1 items-center rounded-md border py-2.5 ${accent.bg} ${accent.border}`
          : "flex-1 items-center rounded-md border border-neutral-200 bg-white py-2.5";
        const textClass = active
          ? `text-label font-semibold ${accent.text}`
          : "text-label font-medium text-neutral-500";
        return (
          <Pressable
            key={priority}
            onPress={() => onChange(priority)}
            className={containerClass}
            accessibilityRole="radio"
            accessibilityState={{ selected: active }}
            accessibilityLabel={`Priority ${PRIORITY_LABELS[i]}`}
          >
            <Text className={textClass}>{PRIORITY_LABELS[i]}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
