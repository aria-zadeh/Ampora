import React from "react";
import { View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { FeatureShell } from "./FeatureShell";
import { PressableScale } from "./PressableScale";
import { PulseScale } from "./PulseScale";
import { Text } from "./Text";
import { useThemeColors } from "@/hooks/useThemeColors";
import type { StarterAction } from "@/types";

interface StarterActionCardProps {
  action: StarterAction;
  onToggle?: () => void;
}

/**
 * The signature focal card: the task's "First move". One of the app's ~4
 * `FeatureShell` uses (doc 02 §14.4) — the nested double-bezel gives it the
 * quiet weight of the single most important thing on Home. Completing the
 * action gives a warm pulse (via PulseScale) + success haptic (via
 * PressableScale's success haptic).
 *
 * Previously also carried a decorative gradient wash inside the shell,
 * matching `GradientCard`'s old treatment — removed for the same reason: the
 * source design has zero gradients and every `gradients.*` token is a flat
 * no-op pair, so it always rendered as a uniform rectangle.
 */
export function StarterActionCard({ action, onToggle }: StarterActionCardProps) {
  const done = action.done;
  const theme = useThemeColors();

  return (
    // PulseScale pops once when `done` flips false -> true (completion feedback).
    <PulseScale trigger={done}>
      <FeatureShell>
        <View className="p-5">
          {/* Overline */}
          <Text variant="overline" className="text-primary-600">
            First move
          </Text>

          {/* The action */}
          <Text
            variant="bodyMedium"
            className={`mt-1.5 ${done ? "text-neutral-500 line-through" : "text-neutral-900"}`}
            accessibilityLabel={`First move: ${action.text}${done ? ", done" : ""}`}
          >
            {action.text}
          </Text>

          {/* Mark done — success haptic on completion, light on undo. */}
          <PressableScale
            onPress={onToggle}
            haptic={done ? "light" : "success"}
            className={`mt-4 h-12 flex-row items-center justify-center rounded-lg ${
              done ? "bg-success-100" : "bg-primary-600"
            }`}
            accessibilityRole="button"
            accessibilityState={{ checked: done }}
            accessibilityLabel={done ? "Mark first move not done" : "Mark first move done"}
          >
            <View className="flex-row items-center">
              <Ionicons
                name={done ? "checkmark-circle" : "ellipse-outline"}
                size={18}
                color={done ? theme.successStrong : theme.primaryForeground}
              />
              <Text
                variant="label"
                className={`ml-2 ${done ? "text-success-700" : "text-primary-foreground"}`}
              >
                {done ? "Done" : "Start"}
              </Text>
            </View>
          </PressableScale>
        </View>
      </FeatureShell>
    </PulseScale>
  );
}
