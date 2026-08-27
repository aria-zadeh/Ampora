import React from "react";
import { View, type ViewProps, type PressableProps } from "react-native";
import { PressableScale } from "./PressableScale";

type CardVariant = "default" | "elevated" | "flat";

interface CardBaseProps {
  variant?: CardVariant;
  /** Feature/hero card: rounded-2xl + more padding. */
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

/**
 * Base surface classes per variant. The source design has no shadows —
 * depth comes entirely from the surface ladder (canvas -> surface -> raised)
 * or a border, never a `style={shadows.*}` prop.
 *
 * `default` is the measured card: bg-surface + border-line. `elevated` steps
 * up the surface ladder instead of adding a shadow. `flat` uses the subtlest
 * wash and no border, for a card that should barely separate from canvas.
 */
const variantClasses: Record<CardVariant, string> = {
  default: "bg-surface border border-line",
  elevated: "bg-raised border border-line",
  flat: "bg-surface-ghost",
};

function buildClasses(variant: CardVariant, feature: boolean, className: string) {
  const radius = feature ? "rounded-2xl" : "rounded-xl";
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
    <View className={classes} {...(props as ViewProps)}>
      {children}
    </View>
  );
}
