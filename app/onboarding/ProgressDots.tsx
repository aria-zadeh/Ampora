import React, { useEffect } from "react";
import { View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { EASINGS, DURATIONS } from "@/utils/motion";
import { useReduceMotion } from "@/hooks/useReduceMotion";

interface ProgressDotsProps {
  /** Total number of onboarding steps. */
  total: number;
  /** Zero-based index of the current step. */
  current: number;
}

/**
 * Small step indicator for the onboarding flow (e.g. "step 2 of 5").
 * Local to onboarding — not a components/ui primitive since it is only
 * meaningful in this linear flow. The active dot widens into a pill and
 * animates in/out of that state; respects reduce-motion (instant swap,
 * no width tween).
 */
export function ProgressDots({ total, current }: ProgressDotsProps) {
  return (
    <View
      className="flex-row items-center gap-1.5"
      accessibilityRole="progressbar"
      accessibilityLabel={`Step ${current + 1} of ${total}`}
      accessibilityValue={{ min: 1, max: total, now: current + 1 }}
    >
      {Array.from({ length: total }).map((_, i) => (
        <Dot key={i} active={i === current} />
      ))}
    </View>
  );
}

function Dot({ active }: { active: boolean }) {
  const reduceMotion = useReduceMotion();
  const progress = useSharedValue(active ? 1 : 0);

  useEffect(() => {
    progress.value = reduceMotion
      ? active
        ? 1
        : 0
      : withTiming(active ? 1 : 0, {
          duration: DURATIONS.base,
          easing: EASINGS.standard,
        });
  }, [active, reduceMotion, progress]);

  const style = useAnimatedStyle(() => ({
    width: 6 + progress.value * 14,
    backgroundColor: active
      ? "#2563EB"
      : `rgba(161, 161, 170, ${0.5 - progress.value * 0.1})`,
  }));

  return (
    <Animated.View
      style={[{ height: 6, borderRadius: 3 }, style]}
    />
  );
}
