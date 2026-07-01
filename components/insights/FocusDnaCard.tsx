/**
 * FocusDnaCard — the headline "Focus DNA" card on the Insights screen (FR-51).
 *
 * Shows the user's best focus windows as a small chart (BestWindowsChart), a
 * plain-language read of the pattern, their ignition point (typical delay
 * between planning and starting), and ONE gentle, optional action ("Plan my
 * hardest task here"). Everything degrades gracefully: with no confident
 * windows the parent renders the cold-start state instead of this card.
 *
 * Tone: informational and encouraging, never a scoreboard. This describes a
 * strength ("here's when you're sharpest"), not a failing.
 */

import React from "react";
import { View, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { GradientCard } from "@/components/ui/GradientCard";
import { Button } from "@/components/ui/Button";
import { BestWindowsChart } from "./BestWindowsChart";
import { colors, gradients, iconSizes } from "@/utils/design-tokens";
import type { FocusProfile } from "@/types";

interface FocusDnaCardProps {
  profile: FocusProfile;
  /** True while the profile is still low-confidence (fewer, fainter claims). */
  learning?: boolean;
  /** One-tap action: e.g. schedule the hardest task into the top window. */
  onPlanHere?: () => void;
}

const MIN_PER_HOUR = 60;

/** "9pm", "9:40pm" from minutes-from-midnight. */
function clockLabel(minutes: number): string {
  const h = Math.floor(minutes / MIN_PER_HOUR);
  const m = minutes % MIN_PER_HOUR;
  const period = h < 12 ? "am" : "pm";
  const twelve = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${twelve}${period}` : `${twelve}:${String(m).padStart(2, "0")}${period}`;
}

/** Plain-language insight from the top window + ignition point. */
function insightText(profile: FocusProfile): string {
  const top = profile.bestWindows[0];
  if (!top) {
    return "We're still mapping when you focus best. Keep going and this fills in.";
  }
  const when = clockLabel(top.start);
  const ignition = profile.ignitionPoint;
  if (ignition > 0) {
    return `You focus best around ${when}, and it usually takes about ${ignition} min to get going. Plan the hard stuff for your peak and give yourself that runway.`;
  }
  return `You focus best around ${when}. Lining up demanding work with that window makes starting a lot easier.`;
}

export function FocusDnaCard({ profile, learning = false, onPlanHere }: FocusDnaCardProps) {
  const c = colors.light;
  const hasWindows = profile.bestWindows.length > 0;

  return (
    <GradientCard colors={gradients.firstMove}>
      {/* Header */}
      <View className="mb-4 flex-row items-center justify-between">
        <View className="flex-row items-center">
          <View
            className="mr-3 h-9 w-9 items-center justify-center rounded-full"
            style={{ backgroundColor: c.primaryDark + "14" }}
          >
            <Ionicons name="pulse" size={iconSizes.sm} color={c.primary} />
          </View>
          <View>
            <Text className="text-overline font-semibold uppercase tracking-wide text-primary-600">
              Focus DNA
            </Text>
            <Text className="text-h4 font-semibold tracking-tight-h4 text-neutral-900">
              When you're sharpest
            </Text>
          </View>
        </View>
        {learning ? (
          <View className="rounded-full bg-neutral-100 px-2.5 py-1">
            <Text className="text-tiny font-medium text-neutral-500">Still learning</Text>
          </View>
        ) : null}
      </View>

      {/* Chart */}
      <BestWindowsChart windows={profile.bestWindows} />

      {/* Plain-language insight */}
      <Text className="mt-5 text-body text-neutral-600">{insightText(profile)}</Text>

      {/* One-tap action — only when we actually have a window to plan into. */}
      {hasWindows && onPlanHere ? (
        <View className="mt-5">
          <Button
            title="Plan my hardest task here"
            variant="primaryBlue"
            size="md"
            onPress={onPlanHere}
            icon={<Ionicons name="calendar-outline" size={iconSizes.xs} color="#FFFFFF" />}
            accessibilityLabel="Plan my hardest task in my best focus window"
            accessibilityHint="Schedules your most demanding task into your peak focus time"
          />
        </View>
      ) : null}
    </GradientCard>
  );
}
