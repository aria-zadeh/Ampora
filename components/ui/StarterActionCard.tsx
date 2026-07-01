import React from "react";
import { View, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { GradientCard } from "./GradientCard";
import { PressableScale } from "./PressableScale";
import { PulseScale } from "./PulseScale";
import { Heading } from "./Heading";
import { gradients } from "@/utils/design-tokens";
import type { StarterAction } from "@/types";

interface StarterActionCardProps {
  action: StarterAction;
  onToggle?: () => void;
}

/**
 * The signature focal card: the task's "First move". A subtle gradient wash
 * sits behind a white feature card; completing the action gives a warm pulse
 * (via PulseScale) + success haptic (via PressableScale's success haptic).
 */
export function StarterActionCard({ action, onToggle }: StarterActionCardProps) {
  const done = action.done;

  return (
    // PulseScale pops once when `done` flips false -> true (completion feedback).
    <PulseScale trigger={done}>
      <GradientCard colors={gradients.firstMove}>
        {/* Overline */}
        <Text className="text-overline font-semibold text-primary-600 uppercase tracking-wide">
          First move
        </Text>

        {/* The action */}
        <Heading
          size="h4"
          className={`mt-1.5 ${done ? "line-through text-neutral-400" : ""}`}
          accessibilityLabel={`First move: ${action.text}${done ? ", done" : ""}`}
        >
          {action.text}
        </Heading>

        {/* Mark done — success haptic on completion, light on undo. */}
        <PressableScale
          onPress={onToggle}
          haptic={done ? "light" : "success"}
          className={`mt-4 h-12 flex-row items-center justify-center rounded-md ${
            done ? "bg-success-100" : "bg-success-700"
          }`}
          accessibilityRole="button"
          accessibilityState={{ checked: done }}
          accessibilityLabel={done ? "Mark first move not done" : "Mark first move done"}
        >
          <View className="flex-row items-center">
            <Ionicons
              name={done ? "checkmark-circle" : "ellipse-outline"}
              size={18}
              color={done ? "#15803D" : "#FFFFFF"}
            />
            <Text
              className={`ml-2 text-label font-semibold ${
                done ? "text-success-700" : "text-white"
              }`}
            >
              {done ? "Done" : "Start"}
            </Text>
          </View>
        </PressableScale>
      </GradientCard>
    </PulseScale>
  );
}
