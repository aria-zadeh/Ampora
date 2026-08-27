import React from "react";
import { View } from "react-native";
import { Text } from "./Text";
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
        <Text variant="caption" className="text-neutral-500 mb-1">
          {label}
        </Text>
      )}
      <Text
        variant="display"
        className={running ? undefined : "text-neutral-500"}
        style={tabularNums}
      >
        {formatTime(seconds)}
      </Text>
    </View>
  );
}
