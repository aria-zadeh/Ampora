import React, { useCallback } from "react";
import { Pressable, type GestureResponderEvent } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { EASINGS } from "@/utils/motion";
import { motion, shadows, iconSizes } from "@/utils/design-tokens";
import { useReduceMotion } from "@/hooks/useReduceMotion";
import { useThemeColors } from "@/hooks/useThemeColors";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/** Resting size (doc `design/stack-reference.html` `.sf-fab`: 52px, ink fill, white glyph). */
const FAB_SIZE = 52;

interface FABProps {
  onPress: () => void;
  icon?: keyof typeof Ionicons.glyphMap;
}

export function FAB({ onPress, icon = "add" }: FABProps) {
  const reduceMotion = useReduceMotion();
  const insets = useSafeAreaInsets();
  /**
   * The FAB's fill and glyph are RN style/prop literals inside the absolute
   * positioning block below, so neither can take a `dark:` class.
   *
   * This is the NEUTRAL high-emphasis control, not an accent one, so the
   * "filled accents keep one value in both themes" rule does not cover it —
   * it is pure neutral ramp and inverts outright, exactly like
   * `components/ui/Button.tsx`'s `primary` variant
   * (`bg-neutral-900 dark:bg-neutral-50` / `text-white dark:text-neutral-900`).
   * `theme.text` is the ink fill (#1C1917 light, #FAF9F7 dark) and
   * `theme.card` is what that Button's label class resolves to on each side
   * (#FFFFFF light, #1C1917 dark), which is why the glyph reads `card`
   * rather than `primaryForeground`: white-on-ink is 17.49:1 on light and
   * ink-on-near-white is 16.62:1 on dark, whereas keeping the glyph white
   * would have put white on a near-white disc in dark mode.
   */
  const theme = useThemeColors();
  const scale = useSharedValue(1);
  const opacity = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: reduceMotion ? [] : [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  const handlePressIn = useCallback(() => {
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
  }, [reduceMotion, scale, opacity]);

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
    (e: GestureResponderEvent) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      onPress();
    },
    [onPress],
  );

  return (
    <AnimatedPressable
      onPress={handlePress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      className="absolute items-center justify-center"
      accessibilityRole="button"
      accessibilityLabel="Add new task"
      accessibilityHint="Opens the new task form"
      style={[
        {
          position: "absolute",
          bottom: 24 + insets.bottom,
          right: 20,
          width: FAB_SIZE,
          height: FAB_SIZE,
          borderRadius: FAB_SIZE / 2,
          backgroundColor: theme.text,
          alignItems: "center",
          justifyContent: "center",
          zIndex: 50,
        },
        shadows.md,
        animatedStyle,
      ]}
    >
      <Ionicons name={icon} size={iconSizes.lg} color={theme.card} />
    </AnimatedPressable>
  );
}
