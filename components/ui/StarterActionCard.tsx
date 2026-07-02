import React from "react";
import { View, Text } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { FeatureShell } from "./FeatureShell";
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
 * The signature focal card: the task's "First move". One of the app's ~4
 * `FeatureShell` uses (doc 02 §14.4) — the nested double-bezel gives it the
 * quiet weight of the single most important thing on Home. A subtle gradient
 * wash sits inside the shell's white inner surface (same wash technique as
 * `GradientCard`, hand-composed here so it clips to the shell's own radius
 * instead of stacking a second border/shadow on top of it); completing the
 * action gives a warm pulse (via PulseScale) + success haptic (via
 * PressableScale's success haptic).
 */
export function StarterActionCard({ action, onToggle }: StarterActionCardProps) {
  const done = action.done;

  return (
    // PulseScale pops once when `done` flips false -> true (completion feedback).
    <PulseScale trigger={done}>
      <FeatureShell>
        <View>
          {/* Subtle top wash — decorative only, matches GradientCard's wash
              but clipped by the shell's own rounded-xl + overflow-hidden. */}
          <LinearGradient
            colors={gradients.firstMove}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
            pointerEvents="none"
            style={{ position: "absolute", top: 0, left: 0, right: 0, height: "60%" }}
          />

          <View className="p-5">
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
          </View>
        </View>
      </FeatureShell>
    </PulseScale>
  );
}
