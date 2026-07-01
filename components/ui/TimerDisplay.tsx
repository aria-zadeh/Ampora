import React from "react";
import { View, Text } from "react-native";
import { tabularNums } from "@/utils/design-tokens";

interface TimerDisplayProps {
  seconds: number;
  running: boolean;
  label?: string;
}

function formatTime(totalSeconds: number): string {
  const minutes = Math.floor(Math.abs(totalSeconds) / 60);
  const secs = Math.abs(totalSeconds) % 60;
  return `${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

export function TimerDisplay({ seconds, running, label }: TimerDisplayProps) {
  return (
    <View
      className="items-center"
      accessibilityRole="timer"
      accessibilityLabel={`${formatTime(seconds)} ${running ? "running" : "paused"}`}
    >
      {label && (
        <Text className="text-caption text-content-secondary dark:text-content-dark-secondary mb-1">
          {label}
        </Text>
      )}
      <Text
        className={`text-display font-bold tracking-wider ${
          running
            ? "text-content dark:text-content-dark-primary"
            : "text-content-muted dark:text-content-dark-muted"
        }`}
        style={{ fontSize: 56, lineHeight: 64, ...tabularNums }}
      >
        {formatTime(seconds)}
      </Text>
    </View>
  );
}
