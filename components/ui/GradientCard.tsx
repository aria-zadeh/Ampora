import React from "react";
import { View } from "react-native";
import type { ViewStyle, StyleProp } from "react-native";

interface GradientCardProps {
  children: React.ReactNode;
  className?: string;
  style?: StyleProp<ViewStyle>;
}

/**
 * Premium feature card: card surface, 1px border, rounded-2xl, no shadow.
 * Never nest cards.
 *
 * Previously carried a decorative `<LinearGradient>` top wash. The source
 * design has zero gradients (docs/09_Decisions.md), and every `gradients.*`
 * token is a flat same-colour no-op pair, so the wash always rendered as a
 * uniform rectangle anyway — removed along with the `expo-linear-gradient`
 * import rather than kept as dead decoration.
 */
export function GradientCard({ children, className, style }: GradientCardProps) {
  return (
    <View
      className={`bg-surface border border-line rounded-2xl overflow-hidden ${
        className ?? ""
      }`}
      style={style}
    >
      <View className="p-5">{children}</View>
    </View>
  );
}
