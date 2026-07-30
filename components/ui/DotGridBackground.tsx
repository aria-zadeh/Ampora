import React from "react";
import { StyleSheet, type StyleProp, type ViewStyle } from "react-native";
import Svg, { Defs, Pattern, Circle, Rect } from "react-native-svg";
import { colors } from "@/utils/design-tokens";

interface DotGridBackgroundProps {
  /** Positioning classes (NativeWind). Absolute full-bleed by default. */
  className?: string;
  /** Extra positioning style, merged after the absolute-fill default. */
  style?: StyleProp<ViewStyle>;
  /**
   * Dot color. Defaults to the near-black ink (`#1C1917`) at 5% opacity so the
   * texture reads as a whisper of depth on the neutral canvas, never as noise.
   */
  tint?: string;
}

/**
 * A subtle, static "dots on white" texture — the design-v2 depth layer. Renders
 * an absolutely-positioned, non-interactive full-bleed SVG dot grid meant to sit
 * behind the app's surfaces. Static by design (no animation → no reduce-motion
 * handling needed) and cheap: a single tiled SVG pattern.
 */
export default function DotGridBackground({
  className,
  style,
  tint = colors.light.text,
}: DotGridBackgroundProps) {
  return (
    <Svg
      className={className}
      style={[StyleSheet.absoluteFill, style]}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Defs>
        <Pattern id="dots" width={22} height={22} patternUnits="userSpaceOnUse">
          <Circle cx={1.2} cy={1.2} r={1.2} fill={tint} fillOpacity={0.05} />
        </Pattern>
      </Defs>
      <Rect width="100%" height="100%" fill="url(#dots)" />
    </Svg>
  );
}
