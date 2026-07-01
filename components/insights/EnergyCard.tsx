/**
 * EnergyCard — "what can you handle right now" (FR-53, §9.5.8).
 *
 * A soft read of the user's CURRENT energy (low | normal | hyper) from recent
 * behavior, with a one-line "what fits" suggestion and a single action to
 * re-sort today's list to match (demanding work when hyper, easy wins when
 * low). Purely suggestive — never prescriptive, and dismissable by ignoring.
 *
 * Cold-start safe: the engine returns 'normal' with little data, which reads as
 * a calm, neutral state rather than a confident claim.
 */

import React from "react";
import { View, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { colors, iconSizes } from "@/utils/design-tokens";
import type { EnergyState } from "@/core/learning";

interface EnergyCardProps {
  state: EnergyState;
  /** Re-sort today's tasks to fit the current energy. No-op-safe if omitted. */
  onResort?: () => void;
  /** Shows a brief confirmation after a re-sort. */
  resorted?: boolean;
}

interface EnergyMeta {
  label: string;
  headline: string;
  detail: string;
  icon: keyof typeof Ionicons.glyphMap;
  /** Which of the three dots are lit (capacity). */
  level: number;
  tintKey: "success" | "primary" | "warning";
}

const ENERGY_META: Record<EnergyState, EnergyMeta> = {
  low: {
    label: "Low energy",
    headline: "Take it easy",
    detail: "Good moment for small, low-stakes wins. Start tiny and let momentum build.",
    icon: "battery-half-outline",
    level: 1,
    tintKey: "warning",
  },
  normal: {
    label: "Steady",
    headline: "Steady and ready",
    detail: "A balanced moment — pick the next thing that matters and go.",
    icon: "battery-charging-outline",
    level: 2,
    tintKey: "primary",
  },
  hyper: {
    label: "High energy",
    headline: "Ride the wave",
    detail: "You've got momentum — this is the time for your most demanding task.",
    icon: "flash-outline",
    level: 3,
    tintKey: "success",
  },
};

const TINT: Record<EnergyMeta["tintKey"], { bg: string; fg: string; dot: string }> = {
  success: { bg: colors.light.successLight, fg: "#15803D", dot: colors.light.success },
  primary: { bg: "#DBEAFE", fg: colors.light.primaryDark, dot: colors.light.primary },
  warning: { bg: colors.light.warningLight, fg: "#B45309", dot: colors.light.warning },
};

export function EnergyCard({ state, onResort, resorted = false }: EnergyCardProps) {
  const meta = ENERGY_META[state];
  const tint = TINT[meta.tintKey];

  return (
    <Card feature>
      <View className="flex-row items-center justify-between">
        <View className="flex-1 flex-row items-center">
          <View
            className="mr-3 h-11 w-11 items-center justify-center rounded-full"
            style={{ backgroundColor: tint.bg }}
          >
            <Ionicons name={meta.icon} size={iconSizes.md} color={tint.fg} />
          </View>
          <View className="flex-1">
            <Text className="text-overline font-semibold uppercase tracking-wide text-neutral-500">
              Energy right now
            </Text>
            <Text className="text-h4 font-semibold tracking-tight-h4 text-neutral-900">
              {meta.headline}
            </Text>
          </View>
        </View>

        {/* Capacity dots — labeled via the state text, not color alone. */}
        <View className="flex-row items-center gap-1.5" accessibilityLabel={meta.label}>
          {[1, 2, 3].map((i) => (
            <View
              key={i}
              className="h-2.5 w-2.5 rounded-full"
              style={{
                backgroundColor: i <= meta.level ? tint.dot : colors.light.border,
              }}
            />
          ))}
        </View>
      </View>

      <Text className="mt-4 text-body text-neutral-600">{meta.detail}</Text>

      {onResort ? (
        <View className="mt-5">
          <Button
            title={resorted ? "Today re-sorted" : "Re-sort today for this"}
            variant={resorted ? "secondary" : "primaryBlue"}
            size="md"
            onPress={onResort}
            disabled={resorted}
            icon={
              <Ionicons
                name={resorted ? "checkmark" : "swap-vertical-outline"}
                size={iconSizes.xs}
                color={resorted ? colors.light.textSecondary : "#FFFFFF"}
              />
            }
            accessibilityLabel="Re-sort today's tasks to match my energy"
            accessibilityHint="Puts demanding work in high-energy moments and easy wins in low-energy ones"
          />
        </View>
      ) : null}
    </Card>
  );
}
