/**
 * Insights — "Focus DNA" screen (PRD FR-51..53, §9.5.5-9.5.9).
 *
 * A premium, read-mostly surface that reflects what the Learning Engine has
 * noticed about how the user actually works:
 *   - FocusDnaCard    — best focus windows + a plain-language read (FR-51)
 *   - RevealedSelfCard — "you plan X, you do Y", only when confident (FR-52)
 *   - EnergyCard      — current energy + a one-tap "re-sort today" (FR-53)
 *
 * Cold start (FR-55): with little data we show a warm "still learning" state
 * and safe defaults, never confident (and wrong) claims. Every derived read is
 * memoized off a live snapshot per Zustand v5 selector discipline; the pure
 * engine is read imperatively and never subscribed to React.
 *
 * All actions here are gentle and non-destructive: navigation nudges + a
 * schedule recompute. Nothing here shames or penalizes the user.
 */

import React, { useCallback, useMemo, useState } from "react";
import { View, Text, ScrollView } from "react-native";
import { router, Stack } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Animated, { FadeInDown, FadeIn } from "react-native-reanimated";

import { Heading } from "@/components/ui/Heading";
import { PressableScale } from "@/components/ui/PressableScale";
import { EmptyState } from "@/components/ui/EmptyState";
import { FocusDnaCard } from "@/components/insights/FocusDnaCard";
import { RevealedSelfCard } from "@/components/insights/RevealedSelfCard";
import { EnergyCard } from "@/components/insights/EnergyCard";

import {
  useLearningStore,
  selectFocusProfile,
  selectIsLearning,
} from "@/store/learningStore";
import { useBehavioralStore } from "@/store/behavioralStore";
import { useTaskStore } from "@/store/taskStore";
import { useScheduleStore } from "@/store/scheduleStore";
import { allRevealedSelves, energyState, type RevealedSelf } from "@/core/learning";

import { iconSizes } from "@/utils/design-tokens";
import { DURATIONS, staggerDelay } from "@/utils/motion";
import { useReduceMotion } from "@/hooks/useReduceMotion";
import type { Task } from "@/types";

/**
 * How much confident data we want before the screen drops the cold-start
 * framing. Mirrors the engine's own confidence floors: a couple of dozen
 * signals ~= a week or two of use (FR-55 "first 7-14 days").
 */
const CONFIDENT_SIGNAL_FLOOR = 12;

/** Pick the user's hardest incomplete task (highest energy demand, then priority). */
function hardestTask(tasks: Task[]): Task | null {
  const open = tasks.filter((t) => t.status !== "done");
  if (open.length === 0) return null;
  const demand = (t: Task): number =>
    t.energyRequired === "high" ? 2 : t.energyRequired === "low" ? 0 : 1;
  return [...open].sort((a, b) => {
    const d = demand(b) - demand(a);
    if (d !== 0) return d;
    return (b.priority ?? 0) - (a.priority ?? 0);
  })[0];
}

export default function InsightsScreen() {
  const reduceMotion = useReduceMotion();

  // Live snapshots. `signals` is an array from the store — subscribe to its
  // length (a scalar) so we recompute derived reads when it grows, without the
  // subscription itself returning a fresh array each render.
  const signalCount = useBehavioralStore((s) => s.signals.length);
  const tasksMap = useTaskStore((s) => s.tasks);

  const profile = useLearningStore(selectFocusProfile);
  const engineLearning = useLearningStore(selectIsLearning);

  // Cold start until we have enough signals AND a confident profile.
  const isColdStart = signalCount < CONFIDENT_SIGNAL_FLOOR || engineLearning;

  // Derived reads — memoized off the live snapshot (read the raw signal log
  // imperatively so we don't subscribe the whole array).
  const now = Date.now();
  const revealed = useMemo(() => {
    const signals = useBehavioralStore.getState().signals;
    return allRevealedSelves(signals);
  }, [signalCount]);

  const energy = useMemo(() => {
    const signals = useBehavioralStore.getState().signals;
    return energyState(signals, now);
    // `now` intentionally excluded — recomputed on each mount, stable within it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signalCount]);

  const topRevealed: RevealedSelf | null = revealed[0] ?? null;

  // --- Local UI state for optional, dismissable actions -------------------
  const [revealedDismissed, setRevealedDismissed] = useState(false);
  const [resorted, setResorted] = useState(false);

  // --- Actions (all gentle + non-destructive) -----------------------------

  // Plan the hardest task into the best window: drop the user on that task so
  // they can schedule it. We do not silently mutate their plan.
  const onPlanHere = useCallback(() => {
    const task = hardestTask(Object.values(tasksMap));
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    if (task) {
      router.push(`/task/${task.id}`);
    } else {
      router.push("/task/new");
    }
  }, [tasksMap]);

  // Accept the revealed time — record the acknowledgement as a behavioral
  // signal (so the engine keeps calibrating) and nudge a recompute so the plan
  // can shift toward when they really start. Then step the card back.
  const onAcceptRevealed = useCallback((insight: RevealedSelf) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    useBehavioralStore.getState().logSignal({
      taskType: insight.taskType,
      context: { energy: "normal" },
      completed: false,
    });
    useScheduleStore.getState().recompute();
    setRevealedDismissed(true);
  }, []);

  const onDismissRevealed = useCallback(() => {
    Haptics.selectionAsync().catch(() => {});
    setRevealedDismissed(true);
  }, []);

  // Re-sort today: recompute the schedule (the engine already weighs energy /
  // behavior) and confirm. Additive — never drops or reorders tasks silently
  // beyond the deterministic engine pass.
  const onResort = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    useScheduleStore.getState().recompute();
    setResorted(true);
  }, []);

  const headerEntering = reduceMotion ? undefined : FadeIn.duration(DURATIONS.slow);

  const showRevealed =
    !isColdStart && topRevealed != null && topRevealed.confident && !revealedDismissed;

  return (
    <SafeAreaView className="flex-1 bg-neutral-100" edges={["top", "left", "right"]}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Custom header row with a back affordance. */}
      <View className="flex-row items-center px-5 pb-2 pt-2">
        <PressableScale
          onPress={() => router.back()}
          haptic="light"
          className="-ml-2 h-11 w-11 items-center justify-center rounded-full"
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <Ionicons name="chevron-back" size={iconSizes.lg} color="#18181B" />
        </PressableScale>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerClassName="px-5 pb-16"
        showsVerticalScrollIndicator={false}
      >
        {/* Title */}
        <Animated.View entering={headerEntering} className="pb-1 pt-2">
          <Text className="mb-2 text-overline font-semibold uppercase tracking-wide text-primary-600">
            Learning about you
          </Text>
          <Heading size="h1">Focus DNA</Heading>
          <Text className="mt-1.5 text-body text-neutral-500">
            How you actually work — so your plan can meet you there.
          </Text>
        </Animated.View>

        {isColdStart ? (
          // --- Cold start (FR-55): warm, honest, no fake claims. ------------
          <Animated.View
            entering={reduceMotion ? undefined : FadeInDown.duration(DURATIONS.base)}
            className="mt-8"
          >
            <View className="rounded-2xl border border-neutral-200 bg-white px-5 py-8">
              <EmptyState
                icon="analytics-outline"
                title="Still learning your patterns"
                subtitle="Keep using Ampora for a few more days and your focus windows, energy, and habits will show up here."
              />
            </View>

            {/* Even in cold start, show the neutral energy read — it's honest
                (defaults to steady) and useful from day one. */}
            <View className="mt-4">
              <EnergyCard state={energy} />
            </View>
          </Animated.View>
        ) : (
          // --- Confident state ---------------------------------------------
          <>
            <Animated.View
              entering={
                reduceMotion
                  ? undefined
                  : FadeInDown.delay(staggerDelay(0)).duration(DURATIONS.base)
              }
              className="mt-6"
            >
              <FocusDnaCard
                profile={profile}
                learning={engineLearning}
                onPlanHere={onPlanHere}
              />
            </Animated.View>

            {showRevealed ? (
              <Animated.View
                entering={
                  reduceMotion
                    ? undefined
                    : FadeInDown.delay(staggerDelay(1)).duration(DURATIONS.base)
                }
                className="mt-4"
              >
                <RevealedSelfCard
                  insight={topRevealed}
                  onAccept={onAcceptRevealed}
                  onDismiss={onDismissRevealed}
                />
              </Animated.View>
            ) : null}

            <Animated.View
              entering={
                reduceMotion
                  ? undefined
                  : FadeInDown.delay(staggerDelay(2)).duration(DURATIONS.base)
              }
              className="mt-4"
            >
              <EnergyCard state={energy} onResort={onResort} resorted={resorted} />
            </Animated.View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
