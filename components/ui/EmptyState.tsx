import React from "react";
import { View, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Animated, { FadeIn } from "react-native-reanimated";
import { iconSizes } from "@/utils/design-tokens";
import { DURATIONS } from "@/utils/motion";
import { useReduceMotion } from "@/hooks/useReduceMotion";
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
  const entering = reduceMotion
    ? undefined
    : FadeIn.duration(DURATIONS.slow);

  return (
    <Animated.View
      entering={entering}
      className="items-center justify-center py-12 px-8"
      accessibilityLabel={`${title}. ${subtitle}`}
    >
      <View className="w-16 h-16 rounded-full bg-neutral-100 items-center justify-center mb-5">
        <Ionicons name={icon} size={iconSizes.hero} color="#A1A1AA" />
      </View>
      <Heading size="h4" className="text-center">
        {title}
      </Heading>
      <Text className="text-body text-neutral-500 text-center mt-2 max-w-[280px]">
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
