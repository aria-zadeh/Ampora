import React from "react";
import { Text, type TextProps } from "react-native";
import { TYPOGRAPHY_CLASSES } from "./Text";

type HeadingSize = "display" | "h1" | "h2" | "h3" | "h4";

interface HeadingProps extends TextProps {
  /** Semantic size — maps to the Ampora type scale. @default "h3" */
  size?: HeadingSize;
  /** Extra classes; appended last so they override the size defaults. */
  className?: string;
}

/**
 * Heading primitive — the ONLY way to render screen/section titles so weight
 * stays consistent with the rest of the type scale. Defaults to neutral-900;
 * pass a `text-*` class via `className` to override the color.
 *
 * Delegates to `TYPOGRAPHY_CLASSES` in `./Text` — the single source of truth
 * for the type scale — instead of carrying its own copy. There is no
 * `tracking-*` class anywhere any more: letter-spacing measured exactly 0 on
 * all 241 text runs across the source screens, headings included.
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
      className={`text-neutral-900 ${TYPOGRAPHY_CLASSES[size]} ${className ?? ""}`}
    />
  );
}
