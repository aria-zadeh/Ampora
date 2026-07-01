import React, { useEffect } from "react";
import { View, Text } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from "react-native-reanimated";

interface ProgressBarProps {
  progress: number; // 0 to 1
  color?: string;
  label?: string;
  showPercentage?: boolean;
  height?: number;
}

export function ProgressBar({
  progress,
  color,
  label,
  showPercentage = false,
  height = 8,
}: ProgressBarProps) {
  const animatedWidth = useSharedValue(0);

  useEffect(() => {
    animatedWidth.value = withSpring(Math.min(Math.max(progress, 0), 1), {
      damping: 15,
      stiffness: 120,
    });
  }, [progress]);

  const animatedStyle = useAnimatedStyle(() => ({
    width: `${animatedWidth.value * 100}%`,
  }));

  const bgColor = color || "bg-primary-600";
  const trackColor = "bg-neutral-200";

  return (
    <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round(progress * 100) }}>
      {(label || showPercentage) && (
        <View className="flex-row justify-between mb-1">
          {label && (
            <Text className="text-caption text-neutral-500">
              {label}
            </Text>
          )}
          {showPercentage && (
            <Text className="text-caption font-medium text-neutral-900">
              {Math.round(progress * 100)}%
            </Text>
          )}
        </View>
      )}
      <View
        className={`w-full rounded-full overflow-hidden ${trackColor}`}
        style={{ height }}
      >
        <Animated.View
          className={`h-full rounded-full ${bgColor}`}
          style={animatedStyle}
        />
      </View>
    </View>
  );
}
