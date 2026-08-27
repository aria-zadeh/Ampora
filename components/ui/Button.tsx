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
import { useThemeColors } from "@/hooks/useThemeColors";

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

/**
 * Fill + label classes per variant, both themes.
 *
 * Only the neutral variants actually move between themes, which is the whole
 * point of the warm spine: `primary` and `secondary` are built from the
 * neutral ramp, and the neutral ramp is what inverts. Every FILLED semantic
 * accent stays put. primaryBlue, destructive and success are UNCHANGED by
 * doc 02 §14.1, and a white label clears AA on all three on either canvas
 * because the fill is opaque (5.17:1, 4.83:1, 5.02:1, doc 02 §14.6). None
 * of them gets a `dark:` variant, and none should: that would invent a
 * second brand color rather than fix a contrast problem. See the cheatsheet
 * atop `utils/design-tokens.ts` for the neutral step pairs used below.
 */
const variantClasses: Record<ButtonVariant, { base: string; text: string }> = {
  // The high-emphasis NEUTRAL button (`action.primary`), not the blue one, so
  // the accent-stays-put rule above does not cover it: it is pure neutral
  // ramp, and it is the one variant that flips outright. Doc 02 §1.8 spells
  // this exact case out ("black-on-light becomes white-on-dark"), so the
  // near-black fill becomes the near-white text tone and the label becomes
  // ink. Ink on neutral-50 is 16.62:1, §14.6's dark primary-text row read the
  // other way round.
  primary: {
    base: "bg-neutral-900 dark:bg-neutral-50",
    text: "text-white dark:text-neutral-900",
  },
  primaryBlue: {
    base: "bg-primary-600",
    text: "text-white",
  },
  // Card surface plus a hairline border, so it tracks the cheatsheet's card
  // and border rows exactly. The border is decorative in BOTH themes and
  // always was: neutral-200 on white is 1.25:1 and neutral-800 on the dark
  // card is 1.15:1, neither near the 3:1 a load-bearing boundary would owe.
  // That is the deliberate exemption doc 02 §1.8 states for borders, and the
  // label carries the affordance at 16.62:1 either way. Left at parity on
  // purpose rather than quietly promoting dark to borderStrong (neutral-700,
  // 1.70:1), which would still miss 3:1 while hiding a light-mode gap behind
  // a dark-mode-only tweak.
  secondary: {
    base: "bg-white border border-neutral-200 dark:bg-neutral-900 dark:border-neutral-800",
    text: "text-neutral-900 dark:text-neutral-50",
  },
  // The one accent in this file carrying a `dark:` step, and the distinction
  // is fill vs text, not a softening of the §14.1 lock. Every other primary
  // blue here is a FILL under a white label: the fill is opaque, so the pair
  // measures the same on either canvas, which is exactly why §14.1 leaves it
  // alone and why primaryBlue above has no `dark:` class. A ghost label is
  // the inverse case, 14px text sitting straight on the dark surface, where
  // the surface does the contributing. There #2563EB measures 3.38:1 on the
  // dark card and 3.82:1 on the dark canvas: clear of the 3:1 UI-glyph bar
  // `core/__tests__/design-tokens.test.ts` deliberately holds primary-on-card
  // to, and short of the 4.5:1 a label this size owes. Doc 02 §1.8 covers
  // precisely this case: the accent ramps keep their hex values but step
  // lighter for legibility on dark surfaces, using the 400 step where light
  // used 600. That lands on primary-400 `#60A5FA`, already a token as
  // `colors.dark.primaryLight`, at 6.88:1 on the card and 7.77:1 on the
  // canvas. Same ramp, same blue-is-about-to-do meaning (§14.7), one step up.
  ghost: {
    base: "bg-transparent",
    text: "text-primary-600 dark:text-primary-400",
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

/**
 * Variants whose fill is a saturated accent identical in both themes, so the
 * label rides white on either canvas. `primary` is deliberately no longer
 * here: it is the one filled variant that inverts (see `variantClasses`), so
 * its label flips with it, and so does the spinner that has to match it.
 */
const LIGHT_TEXT_VARIANTS: ButtonVariant[] = [
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

  const theme = useThemeColors();
  /**
   * ActivityIndicator's `color` takes a literal value and cannot take a
   * `dark:` class, so the spinner has to resolve the active scheme itself
   * rather than ride the label classes above. Each branch mirrors exactly one
   * `variantClasses` label entry: white for the always-accent fills, `card`
   * for `primary` (`#FFFFFF` light / `#1C1917` dark, which is precisely what
   * `text-white dark:text-neutral-900` resolves to), and `text` for the two
   * unfilled variants, matching what `secondary` renders and what `ghost`
   * already used. Every light-mode value is unchanged from before this pass.
   */
  const spinnerColor = usesLightText
    ? theme.primaryForeground
    : variant === "primary"
      ? theme.card
      : theme.text;

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
          wrappers). The Pressable above is the touch target.

          Disabled and pressed both stay theme-agnostic on purpose, and that
          was checked rather than assumed. They are opacity, not color:
          `opacity-50` and the press animation composite the whole button
          against whatever canvas is behind it, so the dimmed result reads as
          inactive on either. Blending each variant's label against its own
          fill at 50% over the matching canvas, dark comes out ahead of light
          in every case: secondary and primary 3.42:1 light against 4.86:1
          dark, primaryBlue 2.16:1 against 3.05:1, ghost 2.08:1 against
          2.69:1. So no variant needs a `dark:` disabled treatment. Disabled
          controls are WCAG-exempt regardless, the same exemption
          `colors.*.textDisabled` documents for its own low ratio. */}
      <Animated.View
        className={`flex-row items-center justify-center rounded-[14px] ${sizeClasses[size]} ${styles.base} ${isDisabled ? "opacity-50" : ""}`}
        style={[isFilled ? shadows.xs : null, animatedStyle]}
      >
        {loading ? (
          <ActivityIndicator color={spinnerColor} className="mr-2" />
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
