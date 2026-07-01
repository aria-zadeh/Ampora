import React, { useEffect } from "react";
import type { ViewStyle, StyleProp } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { useReduceMotion } from "@/hooks/useReduceMotion";
import { EASINGS } from "@/utils/motion";

interface PulseScaleProps {
  /** When this flips from false to true, the pulse plays once. */
  trigger: boolean;
  children: React.ReactNode;
  /** Peak scale of the pulse. Default 1.05. */
  peak?: number;
  style?: StyleProp<ViewStyle>;
}

/**
 * Plays a single calm "pop" (1 -> peak -> 1) whenever `trigger` flips to true.
 * Used for task / first-move completion feedback. Respects reduce-motion (no-op).
 */
export function PulseScale({
  trigger,
  children,
  peak = 1.05,
  style,
}: PulseScaleProps) {
  const reduceMotion = useReduceMotion();
  const scale = useSharedValue(1);
  const prevTrigger = useSharedValue(trigger);

  useEffect(() => {
    const wasTriggered = prevTrigger.value;
    prevTrigger.value = trigger;

    // Only fire on a false -> true transition, and never under reduce-motion.
    if (reduceMotion || !trigger || wasTriggered) return;

    scale.value = withSequence(
      withTiming(peak, { duration: 100, easing: EASINGS.standard }),
      withTiming(1, { duration: 100, easing: EASINGS.standard }),
    );
  }, [trigger, reduceMotion, peak]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View style={[animatedStyle, style]}>{children}</Animated.View>
  );
}
