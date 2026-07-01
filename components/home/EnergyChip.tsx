/**
 * EnergyChip — a subtle Home-screen "what can you handle now" cue (FR-53).
 *
 * Reads the user's current energy (low | normal | hyper) from recent behavior
 * and offers a one-tap re-sort of today's plan to match it. Deliberately small
 * and additive: it sits under the greeting as a pill, never competes with the
 * First move focal card, and disappears if there's nothing to re-sort (the
 * caller gates on task count).
 *
 * Tapping recomputes the schedule (the deterministic engine already weighs
 * energy/behavior) and flips to a brief confirmation. Non-destructive — it
 * never silently reorders or drops anything beyond the engine's own pass.
 *
 * Cold-start safe: the engine returns 'normal' with little data, a calm neutral
 * read rather than a confident claim.
 */

import React, { useCallback, useMemo, useState } from "react";
import { View, Text } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { PressableScale } from "@/components/ui/PressableScale";
import { useBehavioralStore } from "@/store/behavioralStore";
import { useScheduleStore } from "@/store/scheduleStore";
import { energyState, type EnergyState } from "@/core/learning";
import { colors, iconSizes } from "@/utils/design-tokens";

interface EnergyMeta {
  label: string;
  cue: string;
  icon: keyof typeof Ionicons.glyphMap;
  tint: { bg: string; fg: string };
}

const ENERGY_META: Record<EnergyState, EnergyMeta> = {
  low: {
    label: "Low energy",
    cue: "Ease in with small wins",
    icon: "battery-half-outline",
    tint: { bg: colors.light.warningLight, fg: "#B45309" },
  },
  normal: {
    label: "Steady",
    cue: "Steady — pick what matters",
    icon: "battery-charging-outline",
    tint: { bg: "#DBEAFE", fg: colors.light.primaryDark },
  },
  hyper: {
    label: "High energy",
    cue: "Ride it — go big now",
    icon: "flash-outline",
    tint: { bg: colors.light.successLight, fg: "#15803D" },
  },
};

export function EnergyChip() {
  // Subscribe to the signal-log length (a scalar) so the read refreshes as new
  // signals arrive, without the subscription returning a fresh array.
  const signalCount = useBehavioralStore((s) => s.signals.length);
  const [resorted, setResorted] = useState(false);

  const state = useMemo<EnergyState>(() => {
    const signals = useBehavioralStore.getState().signals;
    return energyState(signals, Date.now());
  }, [signalCount]);

  const meta = ENERGY_META[state];

  const onPress = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    useScheduleStore.getState().recompute();
    setResorted(true);
  }, []);

  const onOpenInsights = useCallback(() => {
    Haptics.selectionAsync().catch(() => {});
    router.push("/insights");
  }, []);

  return (
    <View className="flex-row items-center justify-between rounded-full border border-neutral-200 bg-white px-3 py-2">
      {/* Energy read — icon + text label (never color-only). Tapping opens the
          full Focus DNA screen. */}
      <PressableScale
        onPress={onOpenInsights}
        haptic={false}
        className="flex-1 flex-row items-center"
        accessibilityRole="button"
        accessibilityLabel={`Energy: ${meta.label}. ${meta.cue}. Opens Focus DNA.`}
        accessibilityHint="Opens your Focus DNA insights"
      >
        <View
          className="mr-2.5 h-7 w-7 items-center justify-center rounded-full"
          style={{ backgroundColor: meta.tint.bg }}
        >
          <Ionicons name={meta.icon} size={iconSizes.xs} color={meta.tint.fg} />
        </View>
        <Text className="flex-1 text-caption font-medium text-neutral-700" numberOfLines={1}>
          {meta.cue}
        </Text>
      </PressableScale>

      {/* Re-sort action. */}
      <PressableScale
        onPress={onPress}
        haptic={false}
        disabled={resorted}
        className="ml-2 flex-row items-center rounded-full bg-primary-50 px-3 py-1.5"
        accessibilityRole="button"
        accessibilityLabel={
          resorted ? "Today re-sorted for your energy" : "Re-sort today for your energy"
        }
        accessibilityHint="Rebuilds today's plan to match how much you can handle right now"
      >
        <Ionicons
          name={resorted ? "checkmark" : "swap-vertical-outline"}
          size={iconSizes.xs}
          color={colors.light.primary}
        />
        <Text className="ml-1 text-caption font-semibold text-primary-600">
          {resorted ? "Sorted" : "Re-sort"}
        </Text>
      </PressableScale>
    </View>
  );
}
