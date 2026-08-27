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
 * double-bezel — an outer hairline-ringed wrapper with a faint black wash,
 * around an inner white surface with its own smaller radius and a 1px
 * top inner-highlight. Presentational only (a View, not pressable) — wrap
 * a `<Card>`/`<PressableScale>` or plain content inside it for interaction.
 *
 * RESTRAINT IS THE POINT: reserve this for the 3-4 true focal cards in the
 * app (Home starter/first-move card, paywall plan cards, project
 * next-session card) — never as a general card treatment. Everywhere else,
 * use the plain `<Card>` primitive.
 *
 * DELIBERATELY NOT THEME-AWARE, and this is not an oversight. The whole
 * effect is a faint black wash and a white inner surface reading as depth
 * against a light page. There is no dark equivalent that keeps the double
 * bezel legible, so a focal card built on this stays a light island on a dark
 * screen, which is a defensible spotlight rather than a bug. Everything
 * rendered INSIDE one must therefore pin its own ink to `colors.light.*`
 * rather than resolving through `useThemeColors()`, or it goes near-white on
 * white. `app/paywall.tsx` does exactly that and says so at its call sites.
 * If this ever does gain a dark treatment, every one of those call sites has
 * to be revisited in the same change.
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
