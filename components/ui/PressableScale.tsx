import React, { useCallback } from "react";
import {
  Pressable,
  type StyleProp,
  type ViewStyle,
  type GestureResponderEvent,
  type AccessibilityRole,
  type AccessibilityState,
} from "react-native";
import * as Haptics from "expo-haptics";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
} from "react-native-reanimated";
import { EASINGS } from "@/utils/motion";
import { motion } from "@/utils/design-tokens";
import { useReduceMotion } from "@/hooks/useReduceMotion";

/** Haptic feedback fired on press. Pass `false` to disable. */
type HapticStyle = "light" | "medium" | "success" | "selection" | false;

interface PressableScaleProps {
  children: React.ReactNode;
  onPress?: (event: GestureResponderEvent) => void;
  /** Haptic to fire on press. @default "light" */
  haptic?: HapticStyle;
  /** Style applied to the animated wrapper. */
  style?: StyleProp<ViewStyle>;
  className?: string;
  disabled?: boolean;
  // Accessibility passthrough
  accessibilityRole?: AccessibilityRole;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  accessibilityState?: AccessibilityState;
  testID?: string;
}

function fireHaptic(haptic: HapticStyle) {
  switch (haptic) {
    case "light":
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      break;
    case "medium":
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      break;
    case "success":
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      break;
    case "selection":
      Haptics.selectionAsync();
      break;
    default:
      break;
  }
}

/**
 * Animated pressable wrapper — the standard press primitive.
 * On press-in: scale 0.97 (100ms ease-out) + opacity 0.9; on press-out: back
 * to 1 (150ms). Fires the given haptic on a completed press. When reduce-motion
 * is on, scale is skipped but opacity + haptic stay.
 */
export function PressableScale({
  children,
  onPress,
  haptic = "light",
  style,
  className,
  disabled = false,
  accessibilityRole = "button",
  accessibilityLabel,
  accessibilityHint,
  accessibilityState,
  testID,
}: PressableScaleProps) {
  const reduceMotion = useReduceMotion();
  const scale = useSharedValue(1);
  const opacity = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: reduceMotion ? [] : [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  const handlePressIn = useCallback(() => {
    if (disabled) return;
    if (!reduceMotion) {
      scale.value = withTiming(motion.press.scale, {
        duration: motion.press.inMs,
        easing: EASINGS.standard,
      });
    }
    opacity.value = withTiming(motion.press.opacity, {
      duration: motion.press.inMs,
      easing: EASINGS.standard,
    });
  }, [disabled, reduceMotion, scale, opacity]);

  const handlePressOut = useCallback(() => {
    if (!reduceMotion) {
      scale.value = withTiming(1, {
        duration: motion.press.outMs,
        easing: EASINGS.standard,
      });
    }
    opacity.value = withTiming(1, {
      duration: motion.press.outMs,
      easing: EASINGS.standard,
    });
  }, [reduceMotion, scale, opacity]);

  const handlePress = useCallback(
    (event: GestureResponderEvent) => {
      if (disabled) return;
      if (haptic) fireHaptic(haptic);
      onPress?.(event);
    },
    [disabled, haptic, onPress],
  );

  return (
    <Animated.View style={[animatedStyle, style]} className={className}>
      <Pressable
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        onPress={handlePress}
        disabled={disabled}
        accessibilityRole={accessibilityRole}
        accessibilityLabel={accessibilityLabel}
        accessibilityHint={accessibilityHint}
        accessibilityState={{ disabled, ...accessibilityState }}
        testID={testID}
      >
        {children}
      </Pressable>
    </Animated.View>
  );
}
