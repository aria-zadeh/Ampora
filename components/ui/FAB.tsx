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
import { motion, iconSizes } from "@/utils/design-tokens";
import { useReduceMotion } from "@/hooks/useReduceMotion";
import { useThemeColors } from "@/hooks/useThemeColors";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/** [E] Resting size measured off the source screens (56x56 primary circle), accent fill, theme-correct glyph. */
const FAB_SIZE = 56;

interface FABProps {
  onPress: () => void;
  icon?: keyof typeof Ionicons.glyphMap;
  /** Screen-reader name. Defaults to the add-task action. */
  accessibilityLabel?: string;
  /**
   * Stack index from the bottom. 0 is the resting position; 1 sits directly
   * above it, so a screen can offer a second action (voice capture) without
   * hiding the primary one.
   */
  stackIndex?: number;
  /** Secondary actions use the raised surface so only ONE accent FAB reads as primary. */
  tone?: "primary" | "secondary";
}

export function FAB({
  onPress,
  icon = "add",
  accessibilityLabel = "Add a task",
  stackIndex = 0,
  tone = "primary",
}: FABProps) {
  const reduceMotion = useReduceMotion();
  const theme = useThemeColors();
  const insets = useSafeAreaInsets();
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
      accessibilityLabel={accessibilityLabel}
      accessibilityHint="Opens the new task form"
      style={[
        {
          position: "absolute",
          bottom: 24 + insets.bottom + stackIndex * (FAB_SIZE + 12),
          right: 20,
          width: FAB_SIZE,
          height: FAB_SIZE,
          borderRadius: FAB_SIZE / 2,
          // Was `colors.light.text` ("ink fill" per the old doc reference) —
          // in dark theme "text" IS near-white (the primary-text role), which
          // painted this white-on-white with the white glyph below. The FAB
          // is the one primary action on its screen, so it takes the accent
          // fill like every other primary control, not a literal ink fill.
          // Only the primary FAB carries the accent, so a screen never shows
          // two equally-loud floating actions (docs/02 13.4).
          backgroundColor: tone === "primary" ? theme.primary : theme.elevated,
          alignItems: "center",
          justifyContent: "center",
          zIndex: 50,
        },
        animatedStyle,
      ]}
    >
      <Ionicons name={icon} size={iconSizes.lg} color={tone === "primary" ? theme.primaryForeground : theme.text} />
    </AnimatedPressable>
  );
}
