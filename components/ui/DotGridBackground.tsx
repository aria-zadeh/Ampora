import React from "react";
import { StyleSheet, type StyleProp, type ViewStyle } from "react-native";
import Svg, { Defs, Pattern, Circle, Rect } from "react-native-svg";
import { useThemeColors } from "@/hooks/useThemeColors";

interface DotGridBackgroundProps {
  /** Positioning classes (NativeWind). Absolute full-bleed by default. */
  className?: string;
  /** Extra positioning style, merged after the absolute-fill default. */
  style?: StyleProp<ViewStyle>;
  /**
   * Dot color. Defaults to the active theme's primary ink at 5% opacity so the
   * texture reads as a whisper of depth on the canvas, never as noise, in
   * either theme.
   */
  tint?: string;
}

/**
 * A subtle, static "dots on canvas" texture — the design-v2 depth layer. Renders
 * an absolutely-positioned, non-interactive full-bleed SVG dot grid meant to sit
 * behind the app's surfaces. Static by design (no animation → no reduce-motion
 * handling needed) and cheap: a single tiled SVG pattern.
 */
export default function DotGridBackground({
  className,
  style,
  tint,
}: DotGridBackgroundProps) {
  const theme = useThemeColors();
  const dotColor = tint ?? theme.text;

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
          <Circle cx={1.2} cy={1.2} r={1.2} fill={dotColor} fillOpacity={0.05} />
        </Pattern>
      </Defs>
      <Rect width="100%" height="100%" fill="url(#dots)" />
    </Svg>
  );
}
