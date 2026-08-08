/**
 * SessionNotice, a calm, one-line explanation card inside a focus session.
 *
 * Used for the two moments the session has to be honest about the lock rather
 * than leave the user guessing: "you finished early but the hold is time" and
 * "the session is served, your apps are back". Neutral surface, never a colour
 * shout, the text carries the meaning, so status is never colour alone.
 */

import React from "react";
import { Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Animated, { FadeIn } from "react-native-reanimated";

import { colors, iconSizes } from "@/utils/design-tokens";
import { DURATIONS } from "@/utils/motion";
import { useReduceMotion } from "@/hooks/useReduceMotion";

export interface SessionNoticeProps {
  icon: keyof typeof Ionicons.glyphMap;
  text: string;
  /** `alert` announces the change (a lock just released); `summary` is passive. */
  role?: "alert" | "summary";
  className?: string;
}

export function SessionNotice({ icon, text, role = "summary", className }: SessionNoticeProps) {
  const reduceMotion = useReduceMotion();
  return (
    <Animated.View
      entering={reduceMotion ? undefined : FadeIn.duration(DURATIONS.base)}
      className={`flex-row items-start gap-2.5 rounded-2xl border border-neutral-200 bg-white p-4 ${className ?? ""}`}
      accessibilityRole={role}
    >
      <Ionicons name={icon} size={iconSizes.sm} color={colors.light.primary} />
      {/* `leading-5` removed: 15px body belongs in the scale's 22px box, and */}
      {/* Lexend needs the room Inter did not. */}
      <Text className="flex-1 text-body font-medium text-neutral-800">{text}</Text>
    </Animated.View>
  );
}
