import React, { useCallback } from "react";
import { View, Text } from "react-native";
import * as Haptics from "expo-haptics";
import { PressableScale } from "@/components/ui/PressableScale";
import { colors } from "@/utils/design-tokens";

/** Priority labels indexed to match PRIORITY_VALUES (1=Low … 4=Urgent). */
export const PRIORITY_LABELS = ["Low", "Medium", "High", "Urgent"] as const;
/** The numeric `Task.priority` values, in the same order as PRIORITY_LABELS. */
export const PRIORITY_VALUES = [1, 2, 3, 4] as const;

/** Selected-state accent per priority level (higher = warmer/more urgent). */
const SELECTED_CLASSES: Record<number, { bg: string; text: string; dot: string }> = {
  1: { bg: "bg-white", text: "text-neutral-800", dot: colors.light.textMuted },
  2: { bg: "bg-white", text: "text-primary-700", dot: colors.light.primary },
  3: { bg: "bg-white", text: "text-warning-700", dot: colors.light.warning },
  4: { bg: "bg-white", text: "text-danger-700", dot: colors.light.dangerStrong },
};

interface PrioritySelectorProps {
  /** Current priority (1..4). Defaults to Medium (2) upstream. */
  value: number;
  onChange: (priority: number) => void;
}

export function PrioritySelector({ value, onChange }: PrioritySelectorProps) {
  const select = useCallback(
    (priority: number) => {
      if (priority === value) return;
      Haptics.selectionAsync().catch(() => {});
      onChange(priority);
    },
    [value, onChange]
  );

  return (
    <View
      className="flex-row rounded-lg border border-neutral-200 bg-neutral-100 p-1"
      accessibilityRole="radiogroup"
    >
      {PRIORITY_VALUES.map((priority, i) => {
        const active = value === priority;
        const accent = SELECTED_CLASSES[priority];
        return (
          <PressableScale
            key={priority}
            onPress={() => select(priority)}
            haptic={false}
            className="flex-1"
            accessibilityRole="radio"
            accessibilityState={{ selected: active }}
            accessibilityLabel={`Priority ${PRIORITY_LABELS[i]}`}
          >
            <View
              className={`flex-row items-center justify-center gap-1.5 rounded-md py-2 ${
                active ? accent.bg : "bg-transparent"
              }`}
              style={active ? SEGMENT_SHADOW : undefined}
            >
              {active ? (
                <View
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ backgroundColor: accent.dot }}
                />
              ) : null}
              <Text
                className={
                  active
                    ? `text-label font-semibold ${accent.text}`
                    : "text-label font-medium text-neutral-500"
                }
              >
                {PRIORITY_LABELS[i]}
              </Text>
            </View>
          </PressableScale>
        );
      })}
    </View>
  );
}

/** Soft lift for the selected segment so it reads as raised above the track. */
const SEGMENT_SHADOW = {
  shadowColor: colors.light.text,
  shadowOffset: { width: 0, height: 1 },
  shadowOpacity: 0.06,
  shadowRadius: 3,
  elevation: 2,
} as const;
