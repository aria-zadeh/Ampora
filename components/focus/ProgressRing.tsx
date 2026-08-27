import React, { useEffect } from "react";
import { View } from "react-native";
import Svg, { Circle, Defs, LinearGradient, Stop } from "react-native-svg";
import Animated, {
  useAnimatedProps,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { EASINGS } from "@/utils/motion";
import { useReduceMotion } from "@/hooks/useReduceMotion";
import { useThemeColors } from "@/hooks/useThemeColors";

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

interface ProgressRingProps {
  /** 0..1 session progress (elapsed / total for the current phase). */
  progress: number;
  /** Outer diameter in px. */
  size: number;
  /** Ring stroke width in px. @default 6 */
  strokeWidth?: number;
  /**
   * Filled-arc color. @default the ACTIVE theme's `primary` — which is the
   * same "#2563EB" in both token sets (doc 02 §14.1), so this default does
   * not move with the scheme. When the resolved color is exactly that
   * primary (the default, or an explicit pass), the ring renders as a
   * same-hue tonal gradient sweep (`colorDeep` at the start to `color`
   * further round) instead of a flat stroke. Any other color (e.g. the
   * paused-state `border` gray) renders flat, unchanged — a non-primary
   * color has no "deep" pairing to assume.
   */
  color?: string;
  /**
   * Deeper same-family stop for the tonal gradient. @default the active
   * theme's `primaryDark`: "#1D4ED8" on light, and deliberately "#2563EB" on
   * dark (doc 02 §14.1 keeps primary put and pairs it with itself there).
   * That collapse is the reason the dark ring renders as a FLAT primary arc
   * rather than a sweep — `showGradient` below already handles a deep stop
   * equal to the main stop, so nothing special-cases it. A deep #1D4ED8 stop
   * on a near-black surface would only be a dim, muddy start to the arc, so
   * flat is the better read, not a lost feature. Only takes effect when
   * `color` resolves to primary blue (see `color` above); pass both
   * explicitly to force a custom tonal pair for any color.
   */
  colorDeep?: string;
  /** Unfilled track color. @default the active theme's `border` hairline. */
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
 * On LIGHT the filled arc is a single-hue tonal gradient (deep `#1D4ED8` to
 * primary `#2563EB`) rather than a flat stroke — replacing what would
 * otherwise be the generic move here (a multi-hue decorative gradient
 * unrelated to the rest of the palette). One hue family, functional (it
 * traces elapsed time), never a second accent. On DARK the two stops
 * collapse to the same `#2563EB` (doc 02 §14.1 pairs dark primary with
 * itself) and the arc renders flat, which is the better read on a near-black
 * surface anyway. See `color`/`colorDeep` above for exactly when the
 * gradient applies vs. a flat stroke (e.g. the paused gray state).
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
  color,
  colorDeep,
  trackColor,
  children,
}: ProgressRingProps) {
  const reduceMotion = useReduceMotion();
  const gradientId = React.useId();
  // SVG `stroke` takes a literal and cannot take a `dark:` class, so every
  // default here resolves the active scheme rather than reaching for
  // `colors.light.*`. Light values are byte-identical to what shipped before
  // this pass (#2563EB / #1D4ED8 / #E8E6E0), so light mode does not move.
  const theme = useThemeColors();

  // Resolve the tonal pair. `colorDeep` only defaults to the deep blue when
  // `color` itself resolves to primary blue (the default, or an explicit
  // pass) — any other explicit `color` (the paused gray, or a future custom
  // color) stays a flat stroke instead of pairing an unrelated hue with
  // primaryDark. An explicit `colorDeep` always wins, for a deliberate
  // custom tonal pair. On dark, `primaryDark` IS `primary`, so `showGradient`
  // resolves false and the arc is a flat #2563EB (see the `colorDeep` prop
  // doc above for why that is the intended dark treatment).
  const resolvedColor = color ?? theme.primary;
  const isPrimaryTone = resolvedColor === theme.primary;
  const resolvedDeep = colorDeep ?? (isPrimaryTone ? theme.primaryDark : resolvedColor);
  const showGradient = resolvedDeep !== resolvedColor;
  const strokeColor = showGradient ? `url(#${gradientId})` : resolvedColor;

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
        {showGradient && (
          <Defs>
            {/* Same-hue tonal sweep: deep at the ring's start, primary further
                round — not a second accent, not a multi-hue decorative
                gradient, just elapsed time on the one accent color. */}
            <LinearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor={resolvedDeep} />
              <Stop offset="1" stopColor={resolvedColor} />
            </LinearGradient>
          </Defs>
        )}
        {/* Track — the full unfilled ring. A deliberate hairline in both
            themes: #E8E6E0 on white is 1.25:1 and #292524 on the dark card is
            1.15:1, near parity, and neither is near 3:1. That is fine and
            intended — the track is decorative, this whole view is hidden from
            the accessibility tree, and the digits inside remain the source of
            truth for how much is left. */}
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={trackColor ?? theme.border}
          strokeWidth={strokeWidth}
          fill="none"
        />
        {/* Fill — rotated -90deg so it starts at 12 o'clock and sweeps clockwise. */}
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={strokeColor}
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
