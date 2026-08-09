import React from "react";
import { View, Platform } from "react-native";
import { useColorScheme } from "nativewind";
import { colors, borderRadius, TOUCH_TARGET_MIN } from "@/utils/design-tokens";

// Only import DateTimePicker on native, avoids web bundle issues
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let NativeDateTimePicker: any = null;
if (Platform.OS !== "web") {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  NativeDateTimePicker =
    require("@react-native-community/datetimepicker").default;
}

export interface DateTimePickerCrossPlatformProps {
  value: Date;
  onChange: (date: Date) => void;
  mode: "date" | "time";
  minimumDate?: Date;
  display?: "default" | "inline" | "spinner";
  accessibilityLabel?: string;
}

/**
 * Formats a Date to YYYY-MM-DD for the HTML date input.
 */
function toDateInputValue(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Formats a Date to HH:MM for the HTML time input.
 */
function toTimeInputValue(date: Date): string {
  const h = String(date.getHours()).padStart(2, "0");
  const m = String(date.getMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}

/**
 * Formats a minimum Date to YYYY-MM-DD for the HTML date input min attribute.
 */
function toMinDateAttr(date: Date | undefined): string | undefined {
  if (!date) return undefined;
  return toDateInputValue(date);
}

/**
 * Cross-platform DateTimePicker.
 *
 * - Web: renders HTML <input type="date"> or <input type="time"> which trigger
 *   native iOS Safari picker wheels, the primary demo UX.
 * - Native (iOS/Android): renders @react-native-community/datetimepicker.
 */
export function DateTimePickerCrossPlatform({
  value,
  onChange,
  mode,
  minimumDate,
  display = "default",
  accessibilityLabel,
}: DateTimePickerCrossPlatformProps) {
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === "dark";
  const theme = isDark ? colors.dark : colors.light;

  // ── Web implementation ───────────────────────────────────────────────
  if (Platform.OS === "web") {
    const inputValue =
      mode === "date" ? toDateInputValue(value) : toTimeInputValue(value);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = e.target.value;
      if (!raw) return;

      if (mode === "date") {
        // Parse YYYY-MM-DD, keep existing time
        const [y, m, d] = raw.split("-").map(Number);
        const next = new Date(value);
        next.setFullYear(y, m - 1, d);
        if (!isNaN(next.getTime())) onChange(next);
      } else {
        // Parse HH:MM, keep existing date
        const [h, min] = raw.split(":").map(Number);
        const next = new Date(value);
        next.setHours(h, min, 0, 0);
        if (!isNaN(next.getTime())) onChange(next);
      }
    };

    const inputStyle: React.CSSProperties = {
      width: "100%",
      minHeight: TOUCH_TARGET_MIN,
      padding: "10px 16px",
      fontSize: 16,
      lineHeight: "24px",
      fontFamily: "inherit",
      color: theme.text,
      backgroundColor: isDark ? theme.card : theme.card,
      border: `1px solid ${theme.accent}`,
      borderRadius: borderRadius.md,
      outline: "none",
      WebkitAppearance: "none",
      appearance: "none",
      boxSizing: "border-box" as const,
      colorScheme: isDark ? "dark" : "light",
    };

    return (
      <View
        style={{ width: "100%" }}
        accessibilityLabel={accessibilityLabel}
      >
        <input
          type={mode}
          value={inputValue}
          onChange={handleChange}
          min={mode === "date" ? toMinDateAttr(minimumDate) : undefined}
          style={inputStyle}
          aria-label={accessibilityLabel}
        />
      </View>
    );
  }

  // ── Native implementation ────────────────────────────────────────────
  if (!NativeDateTimePicker) return null;

  return (
    <NativeDateTimePicker
      value={value}
      mode={mode}
      display={display}
      minimumDate={minimumDate}
      onChange={(_event: unknown, selected?: Date) => {
        if (selected) onChange(selected);
      }}
      accessibilityLabel={accessibilityLabel}
    />
  );
}
