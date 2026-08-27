import React, { useCallback } from "react";
import { View, Text } from "react-native";
import * as Haptics from "expo-haptics";
import { PressableScale } from "@/components/ui/PressableScale";
import { useThemeColors } from "@/hooks/useThemeColors";

/** Priority labels indexed to match PRIORITY_VALUES (1=Low … 4=Urgent). */
export const PRIORITY_LABELS = ["Low", "Medium", "High", "Urgent"] as const;
/** The numeric `Task.priority` values, in the same order as PRIORITY_LABELS. */
export const PRIORITY_VALUES = [1, 2, 3, 4] as const;

interface PrioritySelectorProps {
  /** Current priority (1..4). Defaults to Medium (2) upstream. */
  value: number;
  onChange: (priority: number) => void;
}

export function PrioritySelector({ value, onChange }: PrioritySelectorProps) {
  const theme = useThemeColors();

  /** Selected-state accent per priority level (higher = warmer/more urgent).
   *  `bg-raised` lifts the selected segment above both the sunken track and
   *  the card behind it, replacing the old hand-rolled drop shadow (rule 4:
   *  no shadows — raise a surface step instead). */
  const selectedClasses: Record<number, { bg: string; text: string; dot: string }> = {
    1: { bg: "bg-raised", text: "text-neutral-800", dot: theme.textMuted },
    2: { bg: "bg-raised", text: "text-primary-700", dot: theme.primary },
    3: { bg: "bg-raised", text: "text-warning-700", dot: theme.warning },
    4: { bg: "bg-raised", text: "text-danger-700", dot: theme.dangerStrong },
  };

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
      className="flex-row rounded-lg border border-neutral-200 bg-canvas p-1"
      accessibilityRole="radiogroup"
    >
      {PRIORITY_VALUES.map((priority, i) => {
        const active = value === priority;
        const accent = selectedClasses[priority];
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
