import React from "react";
import { View, Text, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";

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
    ? "flex-row items-center rounded-full px-3 py-1 bg-primary-100 border border-primary-200"
    : "flex-row items-center rounded-full px-3 py-1 bg-neutral-100";
  const textClass = selected
    ? "text-caption text-primary-700"
    : "text-caption text-neutral-600";

  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? "button" : undefined}
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      className={containerClass}
    >
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
            color={selected ? "#1D4ED8" : "#71717A"}
          />
        </Pressable>
      ) : null}
    </Pressable>
  );
}
