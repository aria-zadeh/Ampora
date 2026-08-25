import React from "react";
import { Text as RNText, type TextProps as RNTextProps } from "react-native";
import { typography } from "@/utils/design-tokens";

/** The raw React Native Text props, re-exported so callers do not need a second import from "react-native". */
export type { RNTextProps };

/**
 * Type-scale key -> Tailwind classes (size, weight family, tracking).
 *
 * This is the SINGLE place `typography` (doc 02 section 2.2, the scale of
 * record, see utils/design-tokens.ts) turns into the `text-*`/`font-*`/
 * `tracking-*` classes a screen actually renders. Every screen otherwise
 * hand-writes these combinations, which is how a size can silently pick up
 * the wrong weight (e.g. defaulting to semibold when the scale calls for
 * medium). Reach for the `Text` component below instead of writing the
 * classes by hand.
 *
 * The type is derived from `typeof typography`, so adding a scale key
 * without adding a class entry here is a compile error, not a silent gap.
 * `core/__tests__/design-tokens.test.ts` is the parity test that enforces
 * every entry actually resolves, through tailwind.config.js, to the same
 * size/weight/tracking as its `typography` counterpart.
 */
export const TYPOGRAPHY_CLASSES: Record<keyof typeof typography, string> = {
  display: "text-display font-bold tracking-tight-display",
  h1: "text-h1 font-bold tracking-tight-h1",
  h2: "text-h2 font-semibold tracking-tight-h2",
  h3: "text-h3 font-semibold tracking-tight-h3",
  h4: "text-h4 font-semibold tracking-tight-h4",
  bodyLg: "text-body-lg font-sans",
  body: "text-body font-sans",
  bodyMedium: "text-body font-medium",
  label: "text-label font-medium",
  caption: "text-caption font-sans",
  captionMedium: "text-caption font-medium",
  overline: "text-overline font-semibold tracking-wide uppercase",
  tiny: "text-tiny font-sans tracking-tiny-wide",
};

type Props = RNTextProps & {
  /** Type-scale key, mapped through TYPOGRAPHY_CLASSES. @default "body" */
  variant?: keyof typeof typography;
  /** Extra classes, appended last so a caller can override color. Never use this to change size or weight. */
  className?: string;
};

/**
 * Text primitive — the ONLY place a screen should reach for a `text-*` /
 * `font-*` / `tracking-*` combination instead of hand-writing one. Pass
 * `variant` for the type-scale entry and use `className` only to change
 * color, matching the pattern in `components/ui/Heading.tsx`.
 *
 * @example <Text variant="label" className="text-neutral-500">Due today</Text>
 */
export function Text({ variant = "body", className, ...props }: Props) {
  return (
    <RNText
      {...props}
      className={[TYPOGRAPHY_CLASSES[variant], "text-neutral-900", className]
        .filter(Boolean)
        .join(" ")}
    />
  );
}
