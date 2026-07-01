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

const toneClasses: Record<BadgeTone, { bg: string; text: string }> = {
  neutral: { bg: "bg-neutral-100", text: "text-neutral-600" },
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
      accessibilityLabel={label}
    >
      <Text className={`text-caption font-medium ${config.text}`}>{label}</Text>
    </View>
  );
}
