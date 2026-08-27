import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  type TextInputProps,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
} from "react-native-reanimated";
import { EASINGS } from "@/utils/motion";
import { DURATIONS } from "@/utils/motion";
import { useReduceMotion } from "@/hooks/useReduceMotion";
import { useThemeColors } from "@/hooks/useThemeColors";
import { useColorScheme } from "nativewind";

export interface InputProps extends Omit<TextInputProps, "style" | "className"> {
  /** Label rendered above the field. Omit for a label-less field (e.g. inline search). */
  label?: string;
  /** Optional leading icon (Ionicons glyph name). */
  icon?: keyof typeof Ionicons.glyphMap;
  /** Shows a clear ("x") button whenever there is text; wires to onChangeText("").  */
  clearable?: boolean;
  /** Small helper/error line below the field. */
  helperText?: string;
  /** Tints helperText and the border danger when true. */
  error?: boolean;
  containerClassName?: string;
}

/**
 * Unified text-input primitive (Phase 3 DS-inputs audit finding).
 *
 * 48px min height, 16px input text, neutral-200 border that eases to a
 * primary-600 focus ring, optional label-above / leading icon / clear button.
 *
 * Four of this file's colours are consumed by RN props that cannot take a
 * className — the Reanimated `useAnimatedStyle` border, two Ionicons
 * `color`s and `placeholderTextColor` — so they resolve the active scheme
 * through `useThemeColors()` instead. Everything className-driven below uses
 * `dark:` variants directly.
 *
 * The placeholder is the one value that does NOT simply mirror its light
 * token, and the reason is this file's own contract: on a label-less field
 * the placeholder is the only descriptor, so it has to clear the 4.5:1 body
 * bar. `textMuted` does that on light (5.48:1 on white) but only reaches
 * 3.65:1 on the dark card, so dark steps up one tier to `textSecondary`
 * (6.91:1). Same light-neutral-500 / dark-neutral-400 step, for the same
 * reason, as `components/ui/EmptyState.tsx`'s subtitle.
 */
export function Input({
  label,
  icon,
  clearable = false,
  helperText,
  error = false,
  containerClassName = "",
  value,
  onChangeText,
  onFocus,
  onBlur,
  accessibilityLabel,
  ...props
}: InputProps) {
  const reduceMotion = useReduceMotion();
  const theme = useThemeColors();
  // Only the placeholder needs the scheme NAME rather than the token set,
  // because it deliberately picks a different tier per theme (see the doc
  // comment above); everything else reads its own token straight off `theme`.
  const { colorScheme } = useColorScheme();
  const [focused, setFocused] = useState(false);
  const ring = useSharedValue(0);

  const handleFocus = useCallback<NonNullable<TextInputProps["onFocus"]>>(
    (e) => {
      setFocused(true);
      ring.value = reduceMotion
        ? 1
        : withTiming(1, { duration: DURATIONS.fast, easing: EASINGS.standard });
      onFocus?.(e);
    },
    [onFocus, reduceMotion, ring],
  );

  const handleBlur = useCallback<NonNullable<TextInputProps["onBlur"]>>(
    (e) => {
      setFocused(false);
      ring.value = reduceMotion
        ? 0
        : withTiming(0, { duration: DURATIONS.fast, easing: EASINGS.standard });
      onBlur?.(e);
    },
    [onBlur, reduceMotion, ring],
  );

  // The focus ring and the error border are UI component boundaries, so they
  // owe 3:1 rather than 4.5:1, and both accents clear it on the dark card
  // without stepping lighter: primary-600 measures 3.38:1 and danger-600
  // 3.62:1 there. `core/__tests__/design-tokens.test.ts` already signs
  // primary-600-on-dark-card off at exactly that bar. They keep one value in
  // both themes for the same reason doc 02 §14.1 leaves the accent ramps
  // alone; it is accent TEXT, not an accent boundary, that has to step up.
  // The resting border is pure neutral and flips with `theme`.
  const animatedBorderStyle = useAnimatedStyle(() => ({
    borderColor: error
      ? theme.dangerStrong
      : ring.value > 0.5
        ? theme.primary
        : theme.border,
  }));

  const hasValue = typeof value === "string" && value.length > 0;

  return (
    <View className={containerClassName}>
      {label ? (
        <Text className="mb-1.5 ml-0.5 text-label font-medium text-neutral-700 dark:text-neutral-300">
          {label}
        </Text>
      ) : null}

      <Animated.View
        style={animatedBorderStyle}
        className="min-h-12 flex-row items-center rounded-md border bg-white dark:bg-neutral-900 px-3"
      >
        {/* The resting glyph mirrors its light token exactly rather than
            stepping up, because it is decorative: the label above or the
            placeholder beside it names the field, and this repeats neither.
            It measures 2.53:1 on light and 2.29:1 on dark, both under 3:1
            and both inside the exemption `colors.*.textDisabled` documents
            for itself. `components/ui/EmptyState.tsx`'s hero glyph is
            accepted on the same terms. Focused, it becomes the accent at
            3.38:1 on the dark card, over the 3:1 an 18px glyph owes. */}
        {icon ? (
          <Ionicons
            name={icon}
            size={18}
            color={focused ? theme.primary : theme.textDisabled}
            style={{ marginRight: 8 }}
          />
        ) : null}
        <TextInput
          {...props}
          value={value}
          onChangeText={onChangeText}
          onFocus={handleFocus}
          onBlur={handleBlur}
          placeholderTextColor={
            colorScheme === "dark" ? theme.textSecondary : theme.textMuted
          }
          className="flex-1 py-2.5 text-body-lg text-neutral-900 dark:text-neutral-50"
          accessibilityLabel={accessibilityLabel ?? label}
        />
        {clearable && hasValue ? (
          <Pressable
            onPress={() => onChangeText?.("")}
            hitSlop={12}
            className="ml-1 h-11 w-11 items-center justify-center"
            accessibilityRole="button"
            accessibilityLabel={`Clear ${label ?? "field"}`}
          >
            {/* Mirrors its light token step for step (borderStrong), which
                keeps light pixel-identical. Worth knowing rather than
                assuming: this glyph already misses the 3:1 UI bar on LIGHT
                at 1.49:1 on white, and dark lands at 1.70:1 on the card, so
                dark is the marginally better of the two. Raising it is a
                light-mode design change, not a dark-mode fix, so it is not
                made here. The button itself is reachable and labelled. */}
            <Ionicons name="close-circle" size={18} color={theme.borderStrong} />
          </Pressable>
        ) : null}
      </Animated.View>

      {/* Error copy is accent TEXT on a neutral surface, the case doc 02 §1.8
          carves out: danger-600 measures 3.62:1 on the dark card, clear of
          the 3:1 glyph bar but short of the 4.5:1 this 13px line owes, so
          dark steps one lighter to danger-500 (4.65:1 on the card, 5.25:1 on
          the canvas). The neutral variant is caption-tier, which is exactly
          what the bespoke dark textMuted value is audited for (3.65:1, doc
          02 §14.6) — spelled as the arbitrary literal the cheatsheet
          prescribes, never `dark:text-neutral-500`, which would be 3.19:1. */}
      {helperText ? (
        <Text
          className={`mt-1.5 ml-0.5 text-caption ${
            error
              ? "text-danger-600 dark:text-danger-500"
              : "text-neutral-500 dark:text-[#78716C]"
          }`}
        >
          {helperText}
        </Text>
      ) : null}
    </View>
  );
}
