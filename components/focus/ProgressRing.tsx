import React, { useEffect } from "react";
import { View } from "react-native";
import Svg, { Circle } from "react-native-svg";
import Animated, {
  useAnimatedProps,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { EASINGS } from "@/utils/motion";
import { useReduceMotion } from "@/hooks/useReduceMotion";

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

interface ProgressRingProps {
  /** 0..1 session progress (elapsed / total for the current phase). */
  progress: number;
  /** Outer diameter in px. */
  size: number;
  /** Ring stroke width in px. @default 6 */
  strokeWidth?: number;
  /** Filled-arc color. @default primary "#2563EB" */
  color?: string;
  /** Unfilled track color. @default a faint neutral hairline */
  trackColor?: string;
  children?: React.ReactNode;
}

/**
 * Ambient circular progress ring — the Focus session's signature motion beat.
 * A quiet ring traces around the timer digits and fills clockwise as the
 * current phase (work/break) elapses; a plain SVG circle underneath is the
 * track. Driven by a single Reanimated shared value on `strokeDashoffset`, so
 * it stays smooth without re-rendering React on every tick.
 *
 * `children` renders centered inside the ring (the timer digits) via absolute
 * positioning, so this component owns layout for both the ring and its
 * content — callers just pass size + progress.
 *
 * Reduce-motion: skips the animated tween and jumps straight to the target
 * value (still shows real progress, just without the smoothing animation).
 * Decorative only — never the sole carrier of state (the digits underneath
 * remain the source of truth), so it is hidden from the accessibility tree.
 */
export function ProgressRing({
  progress,
  size,
  strokeWidth = 6,
  color = "#2563EB",
  trackColor = "#E4E1DA",
  children,
}: ProgressRingProps) {
  const reduceMotion = useReduceMotion();

  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  const clamped = Number.isFinite(progress) ? Math.min(1, Math.max(0, progress)) : 0;
  const animatedProgress = useSharedValue(clamped);

  useEffect(() => {
    animatedProgress.value = reduceMotion
      ? clamped
      : withTiming(clamped, { duration: 400, easing: EASINGS.standard });
  }, [clamped, reduceMotion, animatedProgress]);

  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: circumference * (1 - animatedProgress.value),
  }));

  return (
    <View
      style={{ width: size, height: size }}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Svg width={size} height={size}>
        {/* Track — the full unfilled ring. */}
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={trackColor}
          strokeWidth={strokeWidth}
          fill="none"
        />
        {/* Fill — rotated -90deg so it starts at 12 o'clock and sweeps clockwise. */}
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={color}
          strokeWidth={strokeWidth}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          animatedProps={animatedProps}
          origin={`${size / 2}, ${size / 2}`}
          rotation={-90}
        />
      </Svg>

      {/* Centered content (timer digits) — absolute so it doesn't affect the
          SVG's own layout box. */}
      {children != null && (
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {children}
        </View>
      )}
    </View>
  );
}
