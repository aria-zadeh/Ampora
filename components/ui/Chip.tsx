import React from "react";
import { View, Text, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { PressableScale } from "./PressableScale";
import { colors } from "@/utils/design-tokens";

interface ChipProps {
  label: string;
  selected?: boolean;
  color?: string;
  onPress?: () => void;
  onRemove?: () => void;
}

export function Chip({
  label,
  selected = false,
  color,
  onPress,
  onRemove,
}: ChipProps) {
  const containerClass = selected
    ? "flex-row items-center rounded-full px-3 py-1.5 bg-primary-100 border border-primary-200"
    : "flex-row items-center rounded-full px-3 py-1.5 bg-neutral-100";
  const textClass = selected
    ? "text-caption font-medium text-primary-700"
    : "text-caption font-medium text-neutral-600";

  const inner = (
    <>
      {color ? (
        <View
          className="w-2 h-2 rounded-full mr-1.5"
          style={{ backgroundColor: color }}
        />
      ) : null}
      <Text className={textClass}>{label}</Text>
      {onRemove ? (
        <Pressable
          onPress={onRemove}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={`Remove ${label}`}
          className="ml-1.5"
        >
          <Ionicons
            name="close"
            size={14}
            color={selected ? colors.light.primaryDark : colors.light.textMuted}
          />
        </Pressable>
      ) : null}
    </>
  );

  // Interactive chip: press-scale + light haptic.
  if (onPress) {
    return (
      <PressableScale
        onPress={onPress}
        haptic="light"
        className={containerClass}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ selected }}
      >
        {inner}
      </PressableScale>
    );
  }

  // Static chip (display / remove-only).
  return (
    <View
      className={containerClass}
      accessibilityRole="text"
      accessibilityLabel={label}
    >
      {inner}
    </View>
  );
}
