import React, { useEffect } from "react";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { EASINGS, DURATIONS } from "@/utils/motion";
import { useReduceMotion } from "@/hooks/useReduceMotion";

interface LoadingSkeletonProps {
  width: number | string;
  height: number;
  borderRadius?: number;
}

// No ambient/looping duration exists in DURATIONS (it only covers discrete
// interaction feedback: 100-400ms). Deriving from the shared scale rather
// than a bare literal — base(200) * 5 reproduces the previously-tuned 1000ms
// pulse cycle.
const PULSE_DURATION = DURATIONS.base * 5;

export function LoadingSkeleton({
  width,
  height,
  borderRadius = 8,
}: LoadingSkeletonProps) {
  const reduceMotion = useReduceMotion();
  const opacity = useSharedValue(0.3);

  useEffect(() => {
    if (reduceMotion) {
      opacity.value = 0.5;
      return;
    }
    opacity.value = withRepeat(
      withTiming(0.7, { duration: PULSE_DURATION, easing: EASINGS.inOut }),
      -1,
      true
    );
  }, [reduceMotion]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  return (
    <Animated.View
      className="bg-raised"
      style={[{ width: width as any, height, borderRadius }, animatedStyle]}
      accessibilityLabel="Loading content"
    />
  );
}
