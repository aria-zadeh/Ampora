import React from "react";
import { View, type ViewProps, type PressableProps } from "react-native";
import { shadows } from "@/utils/design-tokens";
import { PressableScale } from "./PressableScale";

type CardVariant = "default" | "elevated" | "flat";

interface CardBaseProps {
  variant?: CardVariant;
  /** Feature/hero card: rounded-2xl + more padding + softer lift. */
  feature?: boolean;
  children: React.ReactNode;
  className?: string;
}

interface TappableCardProps
  extends CardBaseProps,
    Omit<PressableProps, "children" | "className" | "style"> {
  onPress: PressableProps["onPress"];
}

interface StaticCardProps
  extends CardBaseProps,
    Omit<ViewProps, "children" | "className"> {
  onPress?: never;
}

type CardProps = TappableCardProps | StaticCardProps;

/** Base surface classes per variant (shadow comes from style={shadows.*}). */
const variantClasses: Record<CardVariant, string> = {
  default: "bg-white border border-neutral-200",
  elevated: "bg-white border border-neutral-200",
  flat: "bg-neutral-50",
};

/** Elevation per variant; flat gets none. */
const variantShadow: Record<CardVariant, (typeof shadows)[keyof typeof shadows]> = {
  default: shadows.sm,
  elevated: shadows.md,
  flat: shadows.none,
};

function buildClasses(variant: CardVariant, feature: boolean, className: string) {
  const radius = feature ? "rounded-2xl" : "rounded-lg";
  const pad = feature ? "p-5" : "p-4";
  return `${variantClasses[variant]} ${radius} ${pad} ${className}`.trim();
}

export function Card({
  variant = "default",
  feature = false,
  children,
  onPress,
  className = "",
  ...props
}: CardProps) {
  const classes = buildClasses(variant, feature, className);
  const shadow = variantShadow[variant];

  if (onPress) {
    const {
      accessibilityLabel,
      accessibilityHint,
      accessibilityState,
      disabled,
      testID,
    } = props as PressableProps;
    return (
      <PressableScale
        onPress={onPress}
        haptic="light"
        className={classes}
        style={shadow}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityHint={accessibilityHint}
        accessibilityState={accessibilityState}
        disabled={disabled ?? undefined}
        testID={testID}
      >
        {children}
      </PressableScale>
    );
  }

  return (
    <View className={classes} style={shadow} {...(props as ViewProps)}>
      {children}
    </View>
  );
}
