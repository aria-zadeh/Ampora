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
 * double-bezel, an outer hairline-ringed wrapper with a faint black wash,
 * around an inner white surface with its own smaller radius and a 1px
 * top inner-highlight. Presentational only (a View, not pressable), wrap
 * a `<Card>`/`<PressableScale>` or plain content inside it for interaction.
 *
 * RESTRAINT IS THE POINT: reserve this for the 3-4 true focal cards in the
 * app (Home starter/first-move card, paywall plan cards, project
 * next-session card), never as a general card treatment. Everywhere else,
 * use the plain `<Card>` primitive.
 */
export function FeatureShell({ children, className = "", style }: FeatureShellProps) {
  return (
    <View
      className={`bg-black/[0.02] border border-black/[0.06] rounded-2xl p-1 ${className}`.trim()}
      style={style}
    >
      <View className="bg-white rounded-xl border-t border-white overflow-hidden">
        {children}
      </View>
    </View>
  );
}
