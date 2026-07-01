import React, { useCallback } from "react";
import {
  Pressable,
  Text,
  ActivityIndicator,
  type PressableProps,
  type GestureResponderEvent,
} from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { EASINGS } from "@/utils/motion";
import { motion, shadows } from "@/utils/design-tokens";
import { useReduceMotion } from "@/hooks/useReduceMotion";

type ButtonVariant =
  | "primary"
  | "primaryBlue"
  | "secondary"
  | "ghost"
  | "destructive"
  | "success";
type ButtonSize = "sm" | "md" | "lg";

interface ButtonProps extends Omit<PressableProps, "children" | "style"> {
  title: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: React.ReactNode;
}

const variantClasses: Record<ButtonVariant, { base: string; text: string }> = {
  primary: {
    base: "bg-neutral-900",
    text: "text-white",
  },
  primaryBlue: {
    base: "bg-primary-600",
    text: "text-white",
  },
  secondary: {
    base: "bg-white border border-neutral-200",
    text: "text-neutral-900",
  },
  ghost: {
    base: "bg-transparent",
    text: "text-primary-600",
  },
  destructive: {
    base: "bg-danger-600",
    text: "text-white",
  },
  success: {
    base: "bg-success-700",
    text: "text-white",
  },
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "min-h-[36px] px-4",
  md: "min-h-[44px] px-5",
  lg: "min-h-[52px] px-6",
};

const LIGHT_TEXT_VARIANTS: ButtonVariant[] = [
  "primary",
  "primaryBlue",
  "destructive",
  "success",
];

/** Filled variants get a subtle lift; secondary/ghost stay flat. */
const FILLED_VARIANTS: ButtonVariant[] = [
  "primary",
  "primaryBlue",
  "destructive",
  "success",
];

export function Button({
  title,
  variant = "primary",
  size = "md",
  loading = false,
  disabled,
  icon,
  onPress,
  onPressIn,
  onPressOut,
  ...props
}: ButtonProps) {
  const styles = variantClasses[variant];
  const isDisabled = disabled || loading;
  const usesLightText = LIGHT_TEXT_VARIANTS.includes(variant);
  const isFilled = FILLED_VARIANTS.includes(variant);

  const reduceMotion = useReduceMotion();
  const scale = useSharedValue(1);
  const opacity = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: reduceMotion ? [] : [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  const handlePressIn = useCallback(
    (e: GestureResponderEvent) => {
      if (!isDisabled) {
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
      }
      onPressIn?.(e);
    },
    [isDisabled, reduceMotion, scale, opacity, onPressIn],
  );

  const handlePressOut = useCallback(
    (e: GestureResponderEvent) => {
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
      onPressOut?.(e);
    },
    [reduceMotion, scale, opacity, onPressOut],
  );

  const handlePress = useCallback(
    (e: GestureResponderEvent) => {
      if (isDisabled) return;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      onPress?.(e);
    },
    [isDisabled, onPress],
  );

  return (
    <Pressable
      {...props}
      disabled={isDisabled}
      onPress={handlePress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      accessibilityLabel={props.accessibilityLabel || title}
    >
      {/* Visual + layout live on the Reanimated Animated.View so NativeWind's
          className interop applies (it does not apply to createAnimatedComponent
          wrappers). The Pressable above is the touch target. */}
      <Animated.View
        className={`flex-row items-center justify-center rounded-md ${sizeClasses[size]} ${styles.base} ${isDisabled ? "opacity-50" : ""}`}
        style={[isFilled ? shadows.xs : null, animatedStyle]}
      >
        {loading ? (
          <ActivityIndicator
            color={usesLightText ? "#FFFFFF" : "#18181B"}
            className="mr-2"
          />
        ) : icon ? (
          <>{icon}</>
        ) : null}
        <Text
          className={`text-label font-medium ${styles.text} ${icon || loading ? "ml-2" : ""}`}
        >
          {title}
        </Text>
      </Animated.View>
    </Pressable>
  );
}
