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
      {/* neutral-100 is the canvas role, which would make this badge blend
          into the page it sits on. bg-raised is a real step up the surface
          ladder, matching its name — a soft raised badge behind the icon. */}
      <View className="w-16 h-16 rounded-full bg-raised items-center justify-center mb-5">
        {/*
          `textMuted`, not `textDisabled`. Measured on the running app, the
          disabled tone puts this 48px glyph at 2.0:1 on the dark canvas -
          under the 3:1 bar for a UI glyph and, more to the point, too dim to
          actually see. An empty state whose icon is invisible is just a
          smaller empty state. textMuted clears 5.71:1.
        */}
        <Ionicons name={icon} size={iconSizes.hero} color={theme.textMuted} />
      </View>
      <Heading size="h4" className="text-center">
        {title}
      </Heading>
      <Text className="text-body font-sans text-neutral-500 text-center mt-2 max-w-280">
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
