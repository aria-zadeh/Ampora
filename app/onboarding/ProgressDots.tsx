import React, { useEffect } from "react";
import { View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { EASINGS, DURATIONS } from "@/utils/motion";
import { useReduceMotion } from "@/hooks/useReduceMotion";
import { useThemeColors } from "@/hooks/useThemeColors";

interface ProgressDotsProps {
  /** Total number of onboarding steps. */
  total: number;
  /** Zero-based index of the current step. */
  current: number;
}

/**
 * Small step indicator for the onboarding flow (e.g. "step 2 of 5").
 * Local to onboarding — not a components/ui primitive since it is only
 * meaningful in this linear flow. The active dot widens into a pill and
 * animates in/out of that state; respects reduce-motion (instant swap,
 * no width tween).
 */
export function ProgressDots({ total, current }: ProgressDotsProps) {
  return (
    <View
      className="flex-row items-center gap-1.5"
      accessibilityRole="progressbar"
      accessibilityLabel={`Step ${current + 1} of ${total}`}
      accessibilityValue={{ min: 1, max: total, now: current + 1 }}
    >
      {Array.from({ length: total }).map((_, i) => (
        <Dot key={i} active={i === current} />
      ))}
    </View>
  );
}

function Dot({ active }: { active: boolean }) {
  const reduceMotion = useReduceMotion();
  const progress = useSharedValue(active ? 1 : 0);
  // Reanimated's `useAnimatedStyle` takes a literal color, never a `dark:`
  // class, so the dot resolves its own tone through the active scheme.
  // Destructured to plain strings before the worklet so only primitives are
  // captured into the UI-thread closure, not the whole token object.
  const theme = useThemeColors();
  const activeColor = theme.primary;
  const inactiveColor = theme.textDisabled;

  useEffect(() => {
    progress.value = reduceMotion
      ? active
        ? 1
        : 0
      : withTiming(active ? 1 : 0, {
          duration: DURATIONS.base,
          easing: EASINGS.standard,
        });
  }, [active, reduceMotion, progress]);

  /**
   * The fade that used to live in the inactive dot's alpha channel now lives
   * on `opacity` instead. Same composite either way — the dot has no children,
   * so a translucent fill over the canvas and an opaque fill at the same
   * opacity resolve to identical pixels — but it means the color itself is a
   * flat token rather than a hand-mixed `rgba()`, which is what the
   * never-hardcode-a-colour rule is actually about.
   *
   * `textDisabled` is the tier that matches: the dots are decorative, the step
   * count is carried for assistive tech by the wrapper's `accessibilityValue`
   * above, and the active dot is what actually reads as the signal. At the
   * same 0.5 alpha the light dot lands on #D0CCC7 over the canvas, 1.48:1 —
   * pixel-for-pixel the ratio the previous hand-mixed `rgba(161,161,170,.5)`
   * produced (#CCCCCF, also 1.48:1), just moved off the last stray cool Zinc
   * value onto the warm spine. Dark mirrors it exactly at 1.49:1 (#322F2C over
   * the dark canvas), so neither theme is the quiet one. Both sit under 3:1 by
   * design, the same decorative exemption `colors.*.textDisabled` documents.
   */
  const style = useAnimatedStyle(() => ({
    width: 6 + progress.value * 14,
    backgroundColor: active ? activeColor : inactiveColor,
    opacity: active ? 1 : 0.5 - progress.value * 0.1,
  }));

  return (
    <Animated.View
      style={[{ height: 6, borderRadius: 3 }, style]}
    />
  );
}
