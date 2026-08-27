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
      {/* 13px caption, so the bespoke dark textMuted value is exactly the
          tier it is audited for (3.65:1 on the dark card, doc 02 §14.6).
          Written as the arbitrary literal the `utils/design-tokens.ts`
          cheatsheet prescribes, never `dark:text-neutral-500` (3.19:1). */}
      {label && (
        <Text className="text-caption text-neutral-500 dark:text-[#78716C] mb-1">
          {label}
        </Text>
      )}
      {/* The paused tone takes the same muted pairing even though it is
          reading text, and here it is entitled to: at 56px bold this is
          large text under WCAG, so it owes 3:1, not 4.5:1, and textMuted
          clears that comfortably in both themes (3.65:1 on the dark card,
          4.12:1 on the dark canvas). Running is the ink row, 16.62:1 on the
          dark card. `tabularNums` and the explicit 56/64 sizing below are
          untouched — this is a colour pass, and the digits must not jitter. */}
      <Text
        className={`text-display font-bold ${
          running
            ? "text-neutral-900 dark:text-neutral-50"
            : "text-neutral-500 dark:text-[#78716C]"
        }`}
        style={{ fontSize: 56, lineHeight: 64, ...tabularNums }}
      >
        {formatTime(seconds)}
      </Text>
    </View>
  );
}
