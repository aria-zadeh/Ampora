/**
 * LockBanner — Ampora Phase 5 Ignition (PRD §8.8).
 *
 * The in-session banner shown while a stake is active. It reminds the user
 * WHAT is on the line and until WHEN (composed from the session mode +
 * completion condition), and carries the always-available panic-valve entry.
 *
 * With the SOFT (in-app) lock there are no real locked apps to name, so the
 * copy is behavioral: "Stay focused — your apps are on the line until <goal>."
 * When the native strategy is active and named apps exist, it uses the
 * "Instagram and 2 more are locked until …" phrasing instead.
 *
 * This is purely presentational: it reads the active session + eligible apps
 * and calls back to the parent to open the PanicValveSheet. All state changes
 * (release, caps, de-escalation) stay in stakesStore. Calm, non-shaming,
 * reduce-motion aware. RN + NativeWind, web-export safe.
 */

import React, { useMemo } from "react";
import { View, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Animated, { FadeInDown } from "react-native-reanimated";

import { PressableScale } from "@/components/ui/PressableScale";
import { shadows } from "@/utils/design-tokens";
import { DURATIONS } from "@/utils/motion";
import { useReduceMotion } from "@/hooks/useReduceMotion";
import { useStakesStore, selectEligibleApps } from "@/store/stakesStore";
import { getBlockingStrategy } from "@/core/blocking";
import type { StakeSession } from "@/types";

export interface LockBannerProps {
  /** The active stake session driving the lock. */
  session: StakeSession;
  /** Open the panic valve (60s unlock-early flow). */
  onPanic: () => void;
}

/**
 * Compose the "until …" clause from the session's mode + completion condition.
 * Kept as a pure helper so the copy is testable and reused in a11y labels.
 */
export function lockUntilClause(session: StakeSession): string {
  if (session.mode === "beat_the_clock") {
    return "you make your first move";
  }
  switch (session.completionCondition) {
    case "first_move":
      return "you make your first move";
    case "subtask":
      return "you finish this step";
    case "task":
    default:
      return "this task is done";
  }
}

export function LockBanner({ session, onPanic }: LockBannerProps) {
  const reduceMotion = useReduceMotion();
  const eligibleApps = useStakesStore(selectEligibleApps);

  const isSoft = useMemo(() => getBlockingStrategy().kind === "soft", []);
  const until = lockUntilClause(session);

  // Compose the headline. Soft lock = behavioral framing (no OS block, so we
  // never claim named apps are "locked"). Native + named apps = the concrete
  // "Instagram and 2 more are locked …" phrasing from §8.8.
  const { headline, a11y } = useMemo(() => {
    if (!isSoft && eligibleApps.length > 0) {
      const first = eligibleApps[0].label ?? "Your apps";
      const extra = eligibleApps.length - 1;
      const subject = extra > 0 ? `${first} and ${extra} more are` : `${first} is`;
      const text = `${subject} locked until ${until}.`;
      return { headline: text, a11y: text };
    }
    const text = `Stay focused — your apps are on the line until ${until}.`;
    return { headline: text, a11y: `App lock active. ${text}` };
  }, [isSoft, eligibleApps, until]);

  return (
    <Animated.View
      entering={reduceMotion ? undefined : FadeInDown.duration(DURATIONS.base)}
      className="rounded-2xl border border-primary-200 bg-primary-50 p-4"
      style={shadows.sm}
      accessibilityRole="summary"
      accessibilityLabel={a11y}
    >
      <View className="flex-row items-start gap-3">
        <View className="h-9 w-9 items-center justify-center rounded-full bg-primary-100">
          <Ionicons name="lock-closed" size={18} color="#2563EB" />
        </View>
        <View className="flex-1">
          <Text className="text-overline font-semibold uppercase tracking-wide text-primary-600">
            On the line
          </Text>
          <Text className="mt-0.5 text-body font-medium text-primary-900 leading-5">{headline}</Text>
        </View>
      </View>

      {/* Panic valve entry — always available, understated so it never invites
          use, but never hidden (FR-42, §9.10). */}
      <PressableScale
        onPress={onPanic}
        haptic="light"
        className="mt-3 flex-row items-center justify-center gap-1.5 self-start rounded-full bg-white/80 px-3.5 py-2"
        accessibilityRole="button"
        accessibilityLabel="Unlock early"
        accessibilityHint="Opens a 60 second breather before your apps come back"
      >
        <Ionicons name="leaf-outline" size={15} color="#2563EB" />
        <Text className="text-caption font-medium text-primary-700">Unlock early</Text>
      </PressableScale>
    </Animated.View>
  );
}
