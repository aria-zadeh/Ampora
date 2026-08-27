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
        <Ionicons name={icon} size={iconSizes.hero} color={theme.textDisabled} />
      </View>
      <Heading size="h4" className="text-center">
        {title}
      </Heading>
      {/*
        280px has no exact match on the Tailwind spacing/maxWidth scale
        (…64=256px, 72=288px — tailwind.config.js is outside this pass's
        scope). max-w-72 (288px) is the nearest real scale step, 8px wider.
      */}
      <Text className="text-body text-neutral-500 text-center mt-2 max-w-72">
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
