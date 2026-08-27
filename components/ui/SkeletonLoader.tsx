import React, { useEffect, useState } from "react";
import { View } from "react-native";
import type { DimensionValue, ViewStyle, StyleProp } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
} from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { useReduceMotion } from "@/hooks/useReduceMotion";
import { useThemeColors } from "@/hooks/useThemeColors";
import { borderRadius } from "@/utils/design-tokens";
import { DURATIONS } from "@/utils/motion";

interface SkeletonLoaderProps {
  width?: DimensionValue;
  height?: DimensionValue;
  /** Corner radius in px. Defaults to borderRadius.sm (8). */
  radius?: number;
  style?: StyleProp<ViewStyle>;
}

// No ambient/looping duration exists in DURATIONS (it only covers discrete
// interaction feedback up to 400ms) — derived from the shared scale instead
// of a bare literal. slower(400) * 3 reproduces the previously-tuned 1200ms.
const SHIMMER_DURATION = DURATIONS.slower * 3;
const HIGHLIGHT_WIDTH = 120;

/**
 * Shimmer placeholder box. A neutral-200 surface with a highlight sweeping
 * left-to-right on a linear loop. Respects reduce-motion (static box).
 */
export function SkeletonLoader({
  width = "100%",
  height = 16,
  radius = borderRadius.sm,
  style,
}: SkeletonLoaderProps) {
  const reduceMotion = useReduceMotion();
  const theme = useThemeColors();
  const [boxWidth, setBoxWidth] = useState(0);
  const progress = useSharedValue(0);
  // Transparent -> highlight -> transparent, in the theme's strongest ink
  // token so the sweep reads clearly against the neutral-200 base in BOTH
  // themes (previously a literal white, invisible-ish on a dark base).
  // LinearGradient needs literal color strings, not a className, so this
  // builds them from useThemeColors() with an appended alpha channel (8C =
  // ~55%) rather than a hardcoded color literal.
  const highlightColors = [
    `${theme.textStrong}00`,
    `${theme.textStrong}8C`,
    `${theme.textStrong}00`,
  ] as const;

  useEffect(() => {
    if (reduceMotion || boxWidth === 0) return;

    progress.value = 0;
    progress.value = withRepeat(
      withTiming(1, { duration: SHIMMER_DURATION, easing: Easing.linear }),
      -1,
      false,
    );
  }, [reduceMotion, boxWidth]);

  const shimmerStyle = useAnimatedStyle(() => {
    // Sweep the highlight from fully off-screen left to fully off-screen right.
    const start = -HIGHLIGHT_WIDTH;
    const end = boxWidth;
    return {
      transform: [{ translateX: start + progress.value * (end - start) }],
    };
  });

  return (
    <View
      onLayout={(e) => setBoxWidth(e.nativeEvent.layout.width)}
      className="bg-neutral-200 overflow-hidden"
      style={[{ width, height, borderRadius: radius }, style]}
      accessibilityLabel="Loading"
    >
      {!reduceMotion && boxWidth > 0 && (
        <Animated.View
          pointerEvents="none"
          style={[
            {
              position: "absolute",
              top: 0,
              bottom: 0,
              width: HIGHLIGHT_WIDTH,
            },
            shimmerStyle,
          ]}
        >
          <LinearGradient
            colors={highlightColors}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={{ flex: 1 }}
          />
        </Animated.View>
      )}
    </View>
  );
}

interface SkeletonListProps {
  /** Number of skeleton rows to render. Default 3. */
  count?: number;
  /** Height of each row. Default 56. */
  height?: number;
  /** Vertical gap between rows in px. Default 12. */
  gap?: number;
  radius?: number;
}

/**
 * Convenience: a vertical stack of full-width SkeletonLoader rows.
 */
export function SkeletonList({
  count = 3,
  height = 56,
  gap = 12,
  radius = borderRadius.lg,
}: SkeletonListProps) {
  return (
    <View>
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonLoader
          key={i}
          height={height}
          radius={radius}
          style={i > 0 ? { marginTop: gap } : undefined}
        />
      ))}
    </View>
  );
}
