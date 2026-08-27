/**
 * SessionNotice — a calm, one-line explanation card inside a focus session.
 *
 * Used for the two moments the session has to be honest about the lock rather
 * than leave the user guessing: "you finished early but the hold is time" and
 * "the session is served, your apps are back". Neutral surface, never a colour
 * shout — the text carries the meaning, so status is never colour alone.
 */

import React from "react";
import { Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Animated, { FadeIn } from "react-native-reanimated";

import { iconSizes } from "@/utils/design-tokens";
import { DURATIONS } from "@/utils/motion";
import { useReduceMotion } from "@/hooks/useReduceMotion";
import { useThemeColors } from "@/hooks/useThemeColors";

export interface SessionNoticeProps {
  icon: keyof typeof Ionicons.glyphMap;
  text: string;
  /** `alert` announces the change (a lock just released); `summary` is passive. */
  role?: "alert" | "summary";
  className?: string;
}

export function SessionNotice({ icon, text, role = "summary", className }: SessionNoticeProps) {
  const reduceMotion = useReduceMotion();
  // Ionicons `color` takes a literal, never a `dark:` class, so the glyph has
  // to resolve the active scheme itself. `primary` is the same #2563EB in
  // both token sets (doc 02 §14.1), so this reads identically either way —
  // it is here so the file holds no `colors.light.*` reference at all.
  const theme = useThemeColors();
  return (
    <Animated.View
      entering={reduceMotion ? undefined : FadeIn.duration(DURATIONS.base)}
      className={`flex-row items-start gap-2.5 rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900 ${className ?? ""}`}
      accessibilityRole={role}
    >
      {/* 18px glyph, so it owes 3:1 not 4.5:1. #2563EB measures 3.38:1 on the
          dark card, clear of that bar, which is why it keeps one value in
          both themes rather than stepping to primary-400. */}
      <Ionicons name={icon} size={iconSizes.sm} color={theme.primary} />
      {/* `leading-5` removed: 15px body belongs in the scale's 22px box, and */}
      {/* Lexend needs the room Inter did not. */}
      <Text className="flex-1 text-body font-medium text-neutral-800 dark:text-neutral-100">{text}</Text>
    </Animated.View>
  );
}
