import React from "react";
import { View } from "react-native";
import type { ViewStyle, StyleProp } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { shadows, gradients, borderRadius } from "@/utils/design-tokens";

interface GradientCardProps {
  children: React.ReactNode;
  /**
   * Gradient color stops for the top wash. Defaults to gradients.firstMove.
   * Keep it subtle, a faint tint fading to white/transparent.
   */
  colors?: readonly [string, string, ...string[]];
  className?: string;
  style?: StyleProp<ViewStyle>;
}

/**
 * Premium feature card: white surface, 1px neutral border, soft shadow, and a
 * restrained top gradient wash behind the content. Rounded-2xl. Never nest cards.
 */
export function GradientCard({
  children,
  colors = gradients.firstMove,
  className,
  style,
}: GradientCardProps) {
  return (
    <View
      className={`bg-white border border-neutral-200 rounded-2xl overflow-hidden ${
        className ?? ""
      }`}
      style={[shadows.sm, style]}
    >
      {/* Subtle top wash, decorative only, sits behind the content. */}
      <LinearGradient
        colors={colors}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        pointerEvents="none"
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: "60%",
          borderTopLeftRadius: borderRadius.xl,
          borderTopRightRadius: borderRadius.xl,
        }}
      />

      {/* Padded content layer. */}
      <View className="p-5">{children}</View>
    </View>
  );
}
