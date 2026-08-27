import React from "react";
import { View, Text } from "react-native";

type BadgeTone =
  | "neutral"
  | "success"
  | "warning"
  | "accent"
  | "danger"
  | "primary";

interface BadgeProps {
  label: string;
  tone?: BadgeTone;
}

/**
 * Tone -> tint + label classes.
 *
 * Only `neutral` moves between themes, and that split is the whole point of
 * the accent rule in the `utils/design-tokens.ts` cheatsheet. The five
 * semantic tones are small pastel tint badges: an OPAQUE `*-100` fill with
 * its own audited `*-700` label riding on it, so neither half of the pair
 * moves when the page behind it does. Measured, all five clear the 4.5:1
 * body bar on their own tint regardless of theme: primary 5.49:1, success
 * 4.57:1, warning 4.52:1, accent 5.98:1, danger 5.30:1 (doc 02 §14.6). They
 * take no `dark:` variant, and inventing a darker tint for them would
 * replace an audited pair with an unaudited one.
 *
 * `neutral` is not a tint, it is the neutral ramp, so it flips wholesale:
 * the fill takes the elevated step rather than the cheatsheet's canvas row
 * because a badge lands on a card as often as on the canvas, and
 * neutral-800 stays visible on both (`bg-neutral-900` card and
 * `bg-neutral-950` canvas) where neutral-950 would vanish into one of them.
 * Same reasoning, same pairing, as `components/ui/EmptyState.tsx`'s bubble.
 * neutral-400 on neutral-800 measures 6.00:1.
 */
const toneClasses: Record<BadgeTone, { bg: string; text: string }> = {
  neutral: {
    bg: "bg-neutral-100 dark:bg-neutral-800",
    text: "text-neutral-600 dark:text-neutral-400",
  },
  success: { bg: "bg-success-100", text: "text-success-700" },
  warning: { bg: "bg-warning-100", text: "text-warning-700" },
  accent: { bg: "bg-accent-100", text: "text-accent-700" },
  danger: { bg: "bg-danger-100", text: "text-danger-700" },
  primary: { bg: "bg-primary-100", text: "text-primary-700" },
};

export function Badge({ label, tone = "neutral" }: BadgeProps) {
  const config = toneClasses[tone];

  return (
    <View
      className={`self-start rounded-full px-2.5 py-1 ${config.bg}`}
      accessibilityRole="text"
      accessibilityLabel={label}
    >
      <Text className={`text-caption font-medium ${config.text}`}>{label}</Text>
    </View>
  );
}
