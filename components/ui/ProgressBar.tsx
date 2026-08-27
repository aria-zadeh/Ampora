import React, { useEffect } from "react";
import { View, Text } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
} from "react-native-reanimated";
import { EASINGS } from "@/utils/motion";
import { motion } from "@/utils/design-tokens";
import { useReduceMotion } from "@/hooks/useReduceMotion";

interface ProgressBarProps {
  progress: number; // 0 to 1
  color?: string;
  label?: string;
  showPercentage?: boolean;
  height?: number;
}

const clamp = (v: number) => Math.min(Math.max(v, 0), 1);

export function ProgressBar({
  progress,
  color,
  label,
  showPercentage = false,
  height = 6,
}: ProgressBarProps) {
  const reduceMotion = useReduceMotion();
  const animatedWidth = useSharedValue(clamp(progress));

  useEffect(() => {
    const target = clamp(progress);
    animatedWidth.value = reduceMotion
      ? target
      : withTiming(target, {
          duration: motion.duration.base,
          easing: EASINGS.standard,
        });
  }, [progress, reduceMotion, animatedWidth]);

  const animatedStyle = useAnimatedStyle(() => ({
    width: `${animatedWidth.value * 100}%`,
  }));

  /**
   * The default fill is the one accent in this batch that genuinely HAD to
   * step lighter on dark, and the measurement is why. A progress fill is not
   * a button fill: it carries no label of its own, so the pair that matters
   * is fill-against-track, and that pair moves with the theme. primary-600
   * on the light track (neutral-200) is 4.14:1, but primary-600 on the dark
   * track (neutral-800) is 2.93:1 — under the 3:1 WCAG 1.4.11 asks of a
   * graphical object, so the bar would stop being a legible indicator rather
   * than merely looking dim. primary-500 restores it at 4.12:1, which is
   * also where doc 02 §1.8 points ("step lighter on dark surfaces").
   *
   * A caller-supplied `color` replaces this wholesale and is left exactly as
   * passed — the four call sites in the tree hand in their own class string,
   * and second-guessing them from in here would silently override a screen's
   * own choice.
   *
   * The track is pure neutral, so it just flips: neutral-200 is 1.25:1 on a
   * white card and neutral-800 is 1.15:1 on the dark card, both decorative
   * by design, since the FILL is what has to be seen, not the groove.
   */
  const fillColor = color || "bg-primary-600 dark:bg-primary-500";
  const trackColor = "bg-neutral-200 dark:bg-neutral-800";

  return (
    <View
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(clamp(progress) * 100) }}
    >
      {(label || showPercentage) && (
        <View className="flex-row justify-between mb-1.5">
          {/* Both are 13px, the caption tier the bespoke dark textMuted value
              is audited for (3.65:1 on the dark card, doc 02 §14.6), spelled
              as the arbitrary literal the `utils/design-tokens.ts`
              cheatsheet prescribes rather than `dark:text-neutral-500`,
              which measures 3.19:1. The percentage is the ink row, 16.62:1
              on the dark card. */}
          {label && (
            <Text className="text-caption text-neutral-500 dark:text-[#78716C]">
              {label}
            </Text>
          )}
          {showPercentage && (
            <Text className="text-caption font-medium text-neutral-900 dark:text-neutral-50">
              {Math.round(clamp(progress) * 100)}%
            </Text>
          )}
        </View>
      )}
      <View
        className={`w-full rounded-full overflow-hidden ${trackColor}`}
        style={{ height }}
      >
        <Animated.View
          className={`h-full rounded-full ${fillColor}`}
          style={animatedStyle}
        />
      </View>
    </View>
  );
}
