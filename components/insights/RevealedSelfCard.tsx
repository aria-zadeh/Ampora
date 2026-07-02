/**
 * RevealedSelfCard — "you plan X but actually do Y" (FR-52, §9.5.7).
 *
 * The single most emotionally sensitive surface in the app. It is shown ONLY
 * when the engine is confident (large + consistent gap over a healthy sample),
 * and it is framed as neutral information the user can act on — never judgment,
 * never a streak-breaking scold. The user can Accept (re-plan to when they
 * really start) or dismiss with "Not now"; dismissing is always fine and the
 * card simply steps back.
 *
 * If `insight` is missing or not confident, this renders nothing (the parent
 * decides whether to show a soft "still learning" line instead).
 */

import React from "react";
import { View, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { PressableScale } from "@/components/ui/PressableScale";
import { colors, iconSizes } from "@/utils/design-tokens";
import type { RevealedSelf } from "@/core/learning";

interface RevealedSelfCardProps {
  insight: RevealedSelf | null;
  /** Accept the revealed time — re-plan this task type to when they really start. */
  onAccept?: (insight: RevealedSelf) => void;
  /** Step back for now (no penalty, no shame). */
  onDismiss?: () => void;
}

/** Convert an hour (0-23) into a warm 12h label: 21 -> "9pm", 9 -> "9am". */
function hourLabel(hour: number): string {
  const h = ((hour % 24) + 24) % 24;
  const period = h < 12 ? "am" : "pm";
  const twelve = h % 12 === 0 ? 12 : h % 12;
  return `${twelve}${period}`;
}

/** A friendly, human name for a task-type key (listId/title). Falls back gracefully. */
function typeLabel(taskType: string): string {
  const t = taskType.trim();
  if (!t) return "these";
  return t.length > 28 ? t.slice(0, 27) + "…" : t;
}

export function RevealedSelfCard({ insight, onAccept, onDismiss }: RevealedSelfCardProps) {
  const c = colors.light;
  if (!insight || !insight.confident) return null;

  const planned = hourLabel(insight.plannedHour);
  const actual = hourLabel(insight.revealedHour);
  const type = typeLabel(insight.taskType);

  return (
    <Card feature>
      <View className="mb-3 flex-row items-center">
        <View
          className="mr-3 h-9 w-9 items-center justify-center rounded-full"
          style={{ backgroundColor: c.accentLight }}
        >
          <Ionicons name="eye-outline" size={iconSizes.sm} color={c.accent} />
        </View>
        <Text className="text-overline font-semibold uppercase tracking-wide text-accent-700">
          Something we've noticed
        </Text>
      </View>

      {/* The observation — plain, non-judgmental. */}
      <Text className="text-body-lg text-neutral-900">
        You plan{" "}
        <Text className="font-semibold">{type}</Text> for around{" "}
        <Text className="font-semibold">{planned}</Text>, but you usually get going closer to{" "}
        <Text className="font-semibold">{actual}</Text>.
      </Text>
      <Text className="mt-2 text-body text-neutral-500">
        That's just how you work — no problem. Want to plan it for when you actually start?
      </Text>

      <Text className="mt-3 text-tiny text-neutral-500">
        Based on {insight.sampleCount} recent {insight.sampleCount === 1 ? "session" : "sessions"}
      </Text>

      {/* Actions — Accept is the one primary; Not now is a calm ghost. */}
      <View className="mt-5 flex-row items-center gap-3">
        <View className="flex-1">
          <Button
            title={`Plan it for ${actual}`}
            variant="primaryBlue"
            size="md"
            onPress={() => onAccept?.(insight)}
            accessibilityLabel={`Re-plan ${type} for ${actual}`}
          />
        </View>
        <PressableScale
          onPress={() => onDismiss?.()}
          haptic="light"
          className="min-h-11 items-center justify-center rounded-md px-4"
          accessibilityRole="button"
          accessibilityLabel="Not now"
          accessibilityHint="Dismisses this suggestion without any change"
        >
          <Text className="text-label font-medium text-neutral-500">Not now</Text>
        </PressableScale>
      </View>
    </Card>
  );
}
