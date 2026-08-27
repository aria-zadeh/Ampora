import React from "react";
import { View } from "react-native";
import type { ViewStyle, StyleProp } from "react-native";

interface FeatureShellProps {
  children: React.ReactNode;
  className?: string;
  style?: StyleProp<ViewStyle>;
}

/**
 * The nested "feature card" treatment (doc 02 v3 "Calm Premium"): a subtle
 * double-bezel built entirely from the flat surface ladder — an outer
 * hairline-ringed frame one wash above canvas, around an inner card surface
 * that pops forward. No shadow and no highlight trick (the source design has
 * neither); the two flat surface steps plus the border carry the depth.
 * Presentational only (a View, not pressable) — wrap a `<Card>`/
 * `<PressableScale>` or plain content inside it for interaction.
 *
 * RESTRAINT IS THE POINT: reserve this for the 3-4 true focal cards in the
 * app (Home starter/first-move card, paywall plan cards, project
 * next-session card) — never as a general card treatment. Everywhere else,
 * use the plain `<Card>` primitive.
 */
export function FeatureShell({ children, className = "", style }: FeatureShellProps) {
  return (
    <View
      className={`bg-surface-ghost border border-line rounded-2xl p-1 ${className}`.trim()}
      style={style}
    >
      <View className="bg-surface rounded-xl overflow-hidden">
        {children}
      </View>
    </View>
  );
}
