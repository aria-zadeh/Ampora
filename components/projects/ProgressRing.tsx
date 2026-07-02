/**
 * ProgressRing — a small circular progress indicator with a centered percent
 * label, built with plain Views so it needs no react-native-svg and web-exports
 * cleanly. Two rotating half-disc masks reveal the colored ring underneath as
 * the percentage climbs (the standard SVG-free RN ring technique).
 *
 * Never color-only: the percent is always printed in the center, and the
 * caller supplies an accessible label on the surrounding pressable.
 */

import React from "react";
import { View, Text } from "react-native";

interface ProgressRingProps {
  /** 0..100. */
  pct: number;
  /** Outer diameter in px. @default 54 */
  size?: number;
  /** Ring thickness in px. @default 5 */
  stroke?: number;
  /** Ring color (the project accent). @default "#7C3AED" */
  color?: string;
  /** Track (unfilled) color. @default "#E8E6E0" */
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
  color = "#7C3AED",
  trackColor = "#E8E6E0",
}: ProgressRingProps) {
  const value = clampPct(pct);

  // Right half sweeps 0..180deg for 0..50%; left half sweeps for 50..100%.
  const rightDeg = Math.min(value, 50) / 50 * 180 - 180;
  const leftDeg = value <= 50 ? -180 : (value - 50) / 50 * 180 - 180;

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
          borderColor: trackColor,
        }}
      />

      {/* Colored fill built from two rotating half-masks. */}
      <HalfFill size={size} stroke={stroke} color={color} side="right" rotateDeg={rightDeg} />
      <HalfFill size={size} stroke={stroke} color={color} side="left" rotateDeg={leftDeg} />

      {/* Centered percent label — the ring is never color-only. */}
      <Text
        style={{ fontSize: size * 0.26, fontWeight: "700", color: "#1C1917" }}
        allowFontScaling={false}
      >
        {value}
        <Text style={{ fontSize: size * 0.16, fontWeight: "600", color: "#6F6862" }}>%</Text>
      </Text>
    </View>
  );
}
