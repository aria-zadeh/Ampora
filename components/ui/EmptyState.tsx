import React from "react";
import { View, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Animated, { FadeIn } from "react-native-reanimated";
import { iconSizes } from "@/utils/design-tokens";
import { DURATIONS } from "@/utils/motion";
import { useReduceMotion } from "@/hooks/useReduceMotion";
import { useThemeColors } from "@/hooks/useThemeColors";
import { Button } from "./Button";
import { Heading } from "./Heading";

interface EmptyStateProps {
  title: string;
  subtitle: string;
  icon?: keyof typeof Ionicons.glyphMap;
  actionLabel?: string;
  onAction?: () => void;
}

export function EmptyState({
  title,
  subtitle,
  icon = "sparkles-outline",
  actionLabel,
  onAction,
}: EmptyStateProps) {
  const reduceMotion = useReduceMotion();
  // Ionicons' `color` takes a literal value, never a `dark:` class, so the
  // glyph below resolves its tone through the active scheme's token set.
  const theme = useThemeColors();
  const entering = reduceMotion
    ? undefined
    : FadeIn.duration(DURATIONS.slow);

  return (
    <Animated.View
      entering={entering}
      className="items-center justify-center py-12 px-8"
      accessibilityLabel={`${title}. ${subtitle}`}
    >
      {/* The bubble sits one surface step above whatever it lands on, so it
          stays legible on a dark card as well as the dark canvas, using the
          same `bg-neutral-100 dark:bg-neutral-800` pairing the converted
          settings rows use rather than the cheatsheet's canvas row, which would
          vanish into a card. The glyph itself stays `textDisabled` in both
          themes: doc 02 §6.9 specifies an empty-state icon at exactly that
          decorative tier, it repeats nothing the title and subtitle below do
          not already say, and the whole block is announced as one
          accessibilityLabel. It measures 2.34:1 on light and 1.99:1 on dark,
          both under 3:1 and both covered by the decorative exemption
          `colors.*.textDisabled` already documents. */}
      <View className="w-16 h-16 rounded-full bg-neutral-100 dark:bg-neutral-800 items-center justify-center mb-5">
        <Ionicons name={icon} size={iconSizes.hero} color={theme.textDisabled} />
      </View>
      <Heading size="h4" className="text-center">
        {title}
      </Heading>
      {/* Steps UP one tier in dark rather than mirroring `textMuted`, and the
          direction is the whole point. The cheatsheet's muted pairing is
          `text-neutral-500 dark:text-[#78716C]`, never `dark:text-neutral-500`,
          which is the lower-contrast substitution it exists to prevent
          (3.19:1 on the dark card against the bespoke value's audited
          3.65:1). Neither reaches 4.5:1, and this line is 15px body copy, not
          the 13px caption the 3.65:1 tone is signed off for (doc 02 §14.6
          calls it caption-tier explicitly, and §1.8 says outright not to use
          the tertiary tone for reading text in dark mode). So dark takes
          `textSecondary` / neutral-400 at 6.91:1 on the card and 7.81:1 on
          the canvas, while light is untouched at neutral-500, 5.07:1 on
          canvas. Drop to the caption size and the muted pairing becomes the
          right call again. */}
      <Text className="text-body text-neutral-500 dark:text-neutral-400 text-center mt-2 max-w-[280px]">
        {subtitle}
      </Text>
      {actionLabel && onAction && (
        <View className="mt-6">
          <Button title={actionLabel} onPress={onAction} variant="primaryBlue" />
        </View>
      )}
    </Animated.View>
  );
}
