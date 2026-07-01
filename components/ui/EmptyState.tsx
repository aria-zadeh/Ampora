import React from "react";
import { View, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Button } from "./Button";

interface EmptyStateProps {
  title: string;
  subtitle: string;
  icon?: keyof typeof Ionicons.glyphMap;
  actionLabel?: string;
  onAction?: () => void;
}

export function EmptyState({
  title,
  subtitle,
  icon = "sparkles-outline",
  actionLabel,
  onAction,
}: EmptyStateProps) {
  return (
    <View
      className="items-center justify-center py-12 px-8"
      accessibilityLabel={`${title}. ${subtitle}`}
    >
      <Ionicons name={icon} size={48} color="#D4D4D8" style={{ marginBottom: 16 }} />
      <Text className="text-h4 font-semibold text-neutral-900 text-center mb-2">
        {title}
      </Text>
      <Text className="text-caption text-neutral-500 text-center mb-6">
        {subtitle}
      </Text>
      {actionLabel && onAction && (
        <Button title={actionLabel} onPress={onAction} variant="primaryBlue" />
      )}
    </View>
  );
}
