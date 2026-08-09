/**
 * SessionControls, the session's action row (PRD FR-62).
 *
 * One primary action (Done) and three secondaries (Take a break / I'm stuck /
 * I'm overwhelmed), per the design system's "one primary action per screen"
 * rule. Lifted out of `app/focus/session.tsx` essentially verbatim.
 *
 * "Done" advances the ONE current step. It never releases a lock: a session
 * hold is served by focus time, not by finishing the work early (doc `04` §5,
 * §6), the store enforces that, and this component deliberately has no path to
 * it either.
 */

import React from "react";
import { View, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { PressableScale } from "@/components/ui/PressableScale";
import { colors, iconSizes, shadows } from "@/utils/design-tokens";

export interface SessionControlsProps {
  /** Primary: mark the current step done (or finish, when nothing is left). */
  onDone: () => void;
  /** Nothing left to check off, the primary reads "Finish". */
  noSteps: boolean;
  onBreak: () => void;
  onStuck: () => void;
  /** True while the AI simplify call is in flight. */
  simplifying: boolean;
  onOverwhelmed: () => void;
}

export function SessionControls({
  onDone,
  noSteps,
  onBreak,
  onStuck,
  simplifying,
  onOverwhelmed,
}: SessionControlsProps) {
  return (
    <View>
      {/* Primary: Done */}
      <PressableScale
        onPress={onDone}
        haptic="success"
        className="h-14 flex-row items-center justify-center rounded-xl bg-success-700"
        style={shadows.md}
        accessibilityRole="button"
        accessibilityLabel={noSteps ? "Finish session" : "Mark this step done and continue"}
      >
        <Ionicons name="checkmark-circle" size={22} color={colors.light.primaryForeground} />
        <Text className="ml-2 text-h4 font-semibold text-white">{noSteps ? "Finish" : "Done"}</Text>
      </PressableScale>

      {/* Secondary controls */}
      <View className="mt-4 gap-3">
        <View className="flex-row gap-3">
          <SecondaryButton icon="cafe-outline" label="Take a break" onPress={onBreak} />
          <SecondaryButton
            icon="bulb-outline"
            label={simplifying ? "Thinking…" : "I'm stuck"}
            onPress={onStuck}
            disabled={simplifying || noSteps}
          />
        </View>
        <SecondaryButton
          icon="heart-outline"
          label="I'm overwhelmed"
          onPress={onOverwhelmed}
          tone="warm"
        />
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Secondary control button
// ---------------------------------------------------------------------------

export function SecondaryButton({
  icon,
  label,
  onPress,
  disabled,
  tone = "neutral",
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  tone?: "neutral" | "warm";
}) {
  const warm = tone === "warm";
  return (
    <PressableScale
      onPress={onPress}
      haptic="light"
      disabled={disabled}
      className={`flex-1 h-12 flex-row items-center justify-center rounded-xl border ${
        warm ? "bg-warning-100 border-warning-100" : "bg-white border-neutral-200"
      } ${disabled ? "opacity-50" : ""}`}
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
    >
      <Ionicons
        name={icon}
        size={iconSizes.sm}
        color={warm ? colors.light.warning : colors.light.textSecondary}
      />
      <Text className={`ml-2 text-label font-medium ${warm ? "text-warning-700" : "text-neutral-700"}`}>
        {label}
      </Text>
    </PressableScale>
  );
}
