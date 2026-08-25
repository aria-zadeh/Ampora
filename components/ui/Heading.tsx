import React from "react";
import { Text, type TextProps } from "react-native";

type HeadingSize = "display" | "h1" | "h2" | "h3" | "h4";

interface HeadingProps extends TextProps {
  /** Semantic size — maps to the Ampora type scale. @default "h3" */
  size?: HeadingSize;
  /** Extra classes; appended last so they override the size defaults. */
  className?: string;
}

/**
 * Size -> text class + weight + matching tight-tracking class.
 * display/h1 are bold; h2-h4 are semibold (doc 02 §type).
 */
const sizeClasses: Record<HeadingSize, string> = {
  display: "text-display font-bold tracking-tight-display",
  h1: "text-h1 font-bold tracking-tight-h1",
  h2: "text-h2 font-semibold tracking-tight-h2",
  h3: "text-h3 font-semibold tracking-tight-h3",
  h4: "text-h4 font-semibold tracking-tight-h4",
};

/**
 * Heading primitive — the ONLY way to render screen/section titles so
 * tracking + weight stay consistent. Defaults to the ink pair
 * `text-neutral-900 dark:text-neutral-50` (`colors.light.text` /
 * `colors.dark.text`, 17.49:1 on a white card and 16.62:1 on the dark one,
 * doc 02 §14.6). Pass a `text-*` class via `className` to override the color.
 *
 * One gotcha when you do override: give it its own `dark:` class as well. A
 * bare `text-*` override is a single-class selector and loses to this
 * default's `dark:` variant, which carries the extra `.dark` class, so in
 * dark mode an un-paired override is silently ignored.
 *
 * @example <Heading size="h1">Good morning, Aria</Heading>
 */
export function Heading({
  size = "h3",
  className,
  ...props
}: HeadingProps) {
  return (
    <Text
      {...props}
      className={`text-neutral-900 dark:text-neutral-50 ${sizeClasses[size]} ${className ?? ""}`}
    />
  );
}
