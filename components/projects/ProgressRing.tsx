/**
 * ProgressRing — a small circular progress indicator with a centered percent
 * label, built with plain Views so it needs no react-native-svg and web-exports
 * cleanly. Two rotating half-disc masks reveal the colored ring underneath as
 * the percentage climbs (the standard SVG-free RN ring technique).
 *
 * Never color-only: the percent is always printed in the center, and the
 * caller supplies an accessible label on the surrounding pressable.
 *
 * Tonal ring, matching `components/focus/ProgressRing`: when no `color` is
 * passed, the two halves render as a same-hue tonal pair (the theme's deep
 * primary on the first-filled half, primary on the second) instead of one
 * flat color — see `color`/`colorDeep` below. Both real call sites today
 * (`ProjectCard`, `app/projects/[id].tsx`) pass an explicit `color={theme.accent}`
 * and no `colorDeep`, so they render exactly as before: both halves the same
 * flat accent color, unchanged.
 */

import React from "react";
import { View, Text } from "react-native";
import { useThemeColors } from "@/hooks/useThemeColors";

interface ProgressRingProps {
  /** 0..100. */
  pct: number;
  /** Outer diameter in px. @default 54 */
  size?: number;
  /** Ring thickness in px. @default 5 */
  stroke?: number;
  /**
   * Ring color. @default the theme's primary — when left at its default (no
   * explicit `color`), the ring renders as a tonal sweep with `colorDeep`
   * (see below). An explicit `color` (e.g. the Projects screens' own
   * `theme.accent`) renders as a flat single color unless `colorDeep` is
   * also passed, since a non-default color has no "deep" pairing to assume.
   */
  color?: string;
  /**
   * Deeper same-family tone for the first-filled half, making the ring read
   * as a tonal sweep rather than flat. @default the theme's `primaryDark`,
   * applied only when `color` is left at its default. Pass both explicitly
   * for a custom tonal pair with any color.
   */
  colorDeep?: string;
  /** Track (unfilled) color. @default the theme's `border` */
  trackColor?: string;
}

function clampPct(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(100, Math.max(0, Math.round(n)));
}

/**
 * A half of the ring: a full-diameter box clipped to one side, containing a
 * ring-colored circle outline that we rotate to sweep the fill.
 */
function HalfFill({
  size,
  stroke,
  color,
  side,
  rotateDeg,
}: {
  size: number;
  stroke: number;
  color: string;
  side: "left" | "right";
  rotateDeg: number;
}) {
  return (
    <View
      style={{
        position: "absolute",
        width: size / 2,
        height: size,
        [side]: 0,
        overflow: "hidden",
      }}
    >
      <View
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: stroke,
          borderColor: color,
          // Only the half we own is anchored at 0 for this side.
          position: "absolute",
          [side]: 0,
          transform: [{ rotate: `${rotateDeg}deg` }],
          // Show only the top+one-side border segment by hiding the opposite borders.
          borderLeftColor: side === "right" ? "transparent" : color,
          borderBottomColor: "transparent",
          borderRightColor: side === "left" ? "transparent" : color,
        }}
      />
    </View>
  );
}

export function ProgressRing({
  pct,
  size = 54,
  stroke = 5,
  color,
  colorDeep,
  trackColor,
}: ProgressRingProps) {
  const theme = useThemeColors();
  const value = clampPct(pct);

  // Right half sweeps 0..180deg for 0..50%; left half sweeps for 50..100%.
  const rightDeg = Math.min(value, 50) / 50 * 180 - 180;
  const leftDeg = value <= 50 ? -180 : (value - 50) / 50 * 180 - 180;

  const resolvedTrackColor = trackColor ?? theme.border;

  // Resolve the tonal pair — mirrors components/focus/ProgressRing exactly.
  // `colorDeep` only defaults to deep blue when `color` itself resolves to
  // primary blue; any other explicit `color` (theme.accent, or a future
  // custom color) stays flat on both halves instead of pairing an unrelated
  // hue with primaryDark.
  const resolvedColor = color ?? theme.primary;
  const isPrimaryTone = resolvedColor === theme.primary;
  const resolvedDeep = colorDeep ?? (isPrimaryTone ? theme.primaryDark : resolvedColor);

  return (
    <View
      style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {/* Full track ring underneath. */}
      <View
        style={{
          position: "absolute",
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: stroke,
          borderColor: resolvedTrackColor,
        }}
      />

      {/* Colored fill built from two rotating half-masks — right (0..50%,
          first-filled) gets the deeper tone, left (50..100%) the primary
          tone, so the sweep reads deep-to-light like the focus ring's
          gradient. Flat/identical on both halves whenever no tonal pair
          applies (see resolvedDeep above), which is every real call site
          today. */}
      <HalfFill size={size} stroke={stroke} color={resolvedDeep} side="right" rotateDeg={rightDeg} />
      <HalfFill size={size} stroke={stroke} color={resolvedColor} side="left" rotateDeg={leftDeg} />

      {/* Centered percent label — the ring is never color-only. */}
      <Text
        style={{ fontSize: size * 0.26, fontWeight: "700", color: theme.text }}
        allowFontScaling={false}
      >
        {value}
        <Text style={{ fontSize: size * 0.16, fontWeight: "600", color: theme.textMuted }}>%</Text>
      </Text>
    </View>
  );
}
