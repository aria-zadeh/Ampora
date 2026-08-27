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

/**
 * Base surface classes per variant (shadow comes from style={shadows.*}).
 *
 * Pure neutral ramp, so every entry flips wholesale — these are the
 * cheatsheet's card / border / elevated rows in `utils/design-tokens.ts`,
 * nothing invented. `default` and `elevated` differ only by elevation
 * (`variantShadow` below), never by surface, which is why they carry the
 * same classes in both themes.
 *
 * The hairline border is decorative in BOTH themes and always was:
 * neutral-200 on white is 1.25:1 and neutral-800 on the dark card is 1.15:1,
 * neither anywhere near the 3:1 a load-bearing boundary would owe. That is
 * the same deliberate exemption `components/ui/Button.tsx`'s `secondary`
 * variant documents, and the card's content carries the contrast.
 *
 * Shadows are left alone on purpose: they are RN style props (warm Stone
 * `#292524` at low opacity, doc 02 §14.2) that composite to nothing on a
 * near-black canvas. Elevation in dark is carried by the surface step, not
 * by the shadow, which is exactly why `flat` sits one step off the others.
 */
const variantClasses: Record<CardVariant, string> = {
  default: "bg-white border border-neutral-200 dark:bg-neutral-900 dark:border-neutral-800",
  elevated: "bg-white border border-neutral-200 dark:bg-neutral-900 dark:border-neutral-800",
  flat: "bg-neutral-50 dark:bg-neutral-800",
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
