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
import { colors } from "@/utils/design-tokens";

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
 * primary-500 focus ring, optional label-above / leading icon / clear button.
 * The border/icon/clear-glyph hexes below are the warm-neutral (Stone) ramp
 * steps (design-tokens `colors.light.border` / `textMuted`), inlined because
 * they're consumed by RN style props (Reanimated `useAnimatedStyle`, Ionicons
 * `color`) that can't take a className. The placeholder text specifically
 * uses neutral-500 (`textSecondary`), one step darker than the icon/border
 * tint, so it clears WCAG AA as the only field descriptor on a label-less
 * input.
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

  const animatedBorderStyle = useAnimatedStyle(() => ({
    borderColor: error
      ? colors.light.dangerStrong
      : ring.value > 0.5
        ? colors.light.primary
        : colors.light.border,
  }));

  const hasValue = typeof value === "string" && value.length > 0;

  return (
    <View className={containerClassName}>
      {label ? (
        <Text className="mb-1.5 ml-0.5 text-label font-medium text-neutral-700">
          {label}
        </Text>
      ) : null}

      <Animated.View
        style={animatedBorderStyle}
        className="min-h-12 flex-row items-center rounded-md border bg-white px-3"
      >
        {icon ? (
          <Ionicons
            name={icon}
            size={18}
            color={focused ? colors.light.primary : colors.light.textDisabled}
            style={{ marginRight: 8 }}
          />
        ) : null}
        <TextInput
          {...props}
          value={value}
          onChangeText={onChangeText}
          onFocus={handleFocus}
          onBlur={handleBlur}
          placeholderTextColor={colors.light.textMuted}
          className="flex-1 py-2.5 text-body-lg text-neutral-900"
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
            <Ionicons name="close-circle" size={18} color={colors.light.borderStrong} />
          </Pressable>
        ) : null}
      </Animated.View>

      {helperText ? (
        <Text
          className={`mt-1.5 ml-0.5 text-caption ${
            error ? "text-danger-600" : "text-neutral-500"
          }`}
        >
          {helperText}
        </Text>
      ) : null}
    </View>
  );
}
