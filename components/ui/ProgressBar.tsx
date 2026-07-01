import React, { useEffect } from "react";
import { View, Text } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
} from "react-native-reanimated";
import { EASINGS } from "@/utils/motion";
import { motion } from "@/utils/design-tokens";
import { useReduceMotion } from "@/hooks/useReduceMotion";

interface ProgressBarProps {
  progress: number; // 0 to 1
  color?: string;
  label?: string;
  showPercentage?: boolean;
  height?: number;
}

const clamp = (v: number) => Math.min(Math.max(v, 0), 1);

export function ProgressBar({
  progress,
  color,
  label,
  showPercentage = false,
  height = 6,
}: ProgressBarProps) {
  const reduceMotion = useReduceMotion();
  const animatedWidth = useSharedValue(clamp(progress));

  useEffect(() => {
    const target = clamp(progress);
    animatedWidth.value = reduceMotion
      ? target
      : withTiming(target, {
          duration: motion.duration.base,
          easing: EASINGS.standard,
        });
  }, [progress, reduceMotion, animatedWidth]);

  const animatedStyle = useAnimatedStyle(() => ({
    width: `${animatedWidth.value * 100}%`,
  }));

  const fillColor = color || "bg-primary-600";
  const trackColor = "bg-neutral-200";

  return (
    <View
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(clamp(progress) * 100) }}
    >
      {(label || showPercentage) && (
        <View className="flex-row justify-between mb-1.5">
          {label && (
            <Text className="text-caption text-neutral-500">{label}</Text>
          )}
          {showPercentage && (
            <Text className="text-caption font-medium text-neutral-900">
              {Math.round(clamp(progress) * 100)}%
            </Text>
          )}
        </View>
      )}
      <View
        className={`w-full rounded-full overflow-hidden ${trackColor}`}
        style={{ height }}
      >
        <Animated.View
          className={`h-full rounded-full ${fillColor}`}
          style={animatedStyle}
        />
      </View>
    </View>
  );
}
