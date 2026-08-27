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
import { motion } from "@/utils/design-tokens";
import { useReduceMotion } from "@/hooks/useReduceMotion";
import { useThemeColors } from "@/hooks/useThemeColors";

type ButtonVariant =
  | "primary"
  | "primaryBlue"
  | "secondary"
  | "ghost"
  | "destructive"
  | "success"
  | "accent";
type ButtonSize = "sm" | "md" | "lg";

interface ButtonProps extends Omit<PressableProps, "children" | "style"> {
  title: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: React.ReactNode;
}

/**
 * Filled variants all share the same foreground: `text-primary-foreground`
 * resolves to dark ink in dark theme / white in light theme, whichever
 * clears 4.5:1 on that theme's fill (docs/09_Decisions.md). A literal
 * `text-white` label reads fine in light theme but fails contrast on every
 * filled dark-theme surface (2.8-3:1 on the accent, ~2:1 on success-700),
 * so it is never correct here even though it looks fine at a glance.
 */
const variantClasses: Record<ButtonVariant, { base: string; text: string }> = {
  primary: {
    base: "bg-primary-600",
    text: "text-primary-foreground",
  },
  primaryBlue: {
    base: "bg-primary-600",
    text: "text-primary-foreground",
  },
  secondary: {
    base: "bg-surface border border-line",
    text: "text-neutral-900",
  },
  ghost: {
    base: "bg-transparent",
    text: "text-primary-600",
  },
  destructive: {
    base: "bg-danger-600",
    text: "text-primary-foreground",
  },
  success: {
    base: "bg-success-700",
    text: "text-primary-foreground",
  },
  /**
   * AI / smart affordances ONLY (breakdown, Refine, Make easier, Projects) per
   * docs/02 13.1. Never a second general-purpose accent — anything that simply
   * starts, saves or advances is `primary`.
   */
  accent: {
    base: "bg-accent-600",
    text: "text-primary-foreground",
  },
};

// Button heights 36 / 44 / 52. 52px is `min-h-13`, a project-specific step
// in tailwind.config.js, since the default Tailwind scale jumps 48 -> 56.
// The 36px `sm` size sits under the 44px touch floor and carries a
// compensating hitSlop below.
const sizeClasses: Record<ButtonSize, string> = {
  sm: "min-h-9 px-4",
  md: "min-h-11 px-5",
  lg: "min-h-13 px-6",
};

/** Filled variants get a subtle lift; secondary/ghost stay flat. Also which variants need the theme-correct foreground on their icon/spinner. */
const FILLED_VARIANTS: ButtonVariant[] = [
  "primary",
  "primaryBlue",
  "destructive",
  "success",
  "accent",
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
  hitSlop,
  ...props
}: ButtonProps) {
  const theme = useThemeColors();
  const styles = variantClasses[variant];
  const isDisabled = disabled || loading;
  const isFilled = FILLED_VARIANTS.includes(variant);
  // "sm" renders at 36px, 8px short of the 44px touch-target floor — widen
  // the hit area rather than the visible pill. Callers that pass their own
  // hitSlop keep it.
  const resolvedHitSlop = hitSlop ?? (size === "sm" ? { top: 4, bottom: 4 } : undefined);

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
      hitSlop={resolvedHitSlop}
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      accessibilityLabel={props.accessibilityLabel || title}
    >
      {/* Visual + layout live on the Reanimated Animated.View so NativeWind's
          className interop applies (it does not apply to createAnimatedComponent
          wrappers). The Pressable above is the touch target. */}
      <Animated.View
        className={`flex-row items-center justify-center rounded-lg ${sizeClasses[size]} ${styles.base} ${isDisabled ? "opacity-50" : ""}`}
        style={animatedStyle}
      >
        {loading ? (
          <ActivityIndicator
            color={isFilled ? theme.primaryForeground : theme.text}
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
