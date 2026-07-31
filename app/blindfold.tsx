/**
 * Blindfold Mode — Ampora Phase 4 (PRD FR-61).
 *
 * "I'm overwhelmed" → hide everything, show exactly ONE micro-step (the First
 * move or the smallest next subtask via core/task-logic `nextStep`). Marking it
 * done reveals the NEXT step — never more than one at a time. A quiet exit.
 *
 * This is the calm-down surface, so it is deliberately warm and low-stimulation:
 * a soft warm wash, generous whitespace, one big line of text, one action, no
 * timer, no progress numbers, no chrome. Motion is a single gentle fade.
 *
 * Palette: the design system exposes a `warning` (warm orange) scale but no
 * `amber`, so all warm tints here are drawn from `warning-*` tokens (or inline
 * hex on the gradient, where any color is allowed).
 *
 * Task selection: an optional `?taskId=` param (when launched from a focus
 * session), otherwise the highest-priority incomplete task. When everything is
 * done it shows a brief, warm "you're clear" state and offers to leave.
 *
 * LOCK AFFORDANCE (FR-42). Blindfold is reachable with a stake lock live (it
 * is one tap from the focus session's "I'm overwhelmed", and reachable
 * independently too), and `GlobalLockBanner` (`app/_layout.tsx`) cannot cover
 * this screen — Blindfold is presented as a native `fullScreenModal`, which
 * sits on top of that banner regardless of pathname suppression, the same
 * reason the focus session renders its own copy instead of relying on it. So
 * when a stake is active this screen shows the same neutral `LockBanner` +
 * `PanicValveSheet` used everywhere else, kept quiet at the top rather than
 * competing with the one step below — the panic valve must always be
 * reachable, but Blindfold's whole purpose is to strip everything else away.
 */

import React, { useCallback, useMemo, useState } from "react";
import { View, Text } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Animated, { FadeIn } from "react-native-reanimated";

import { useTaskStore } from "@/store/taskStore";
import { useStakesStore } from "@/store/stakesStore";
import { nextStep } from "@/core/task-logic";
import { PressableScale } from "@/components/ui/PressableScale";
import { LockBanner } from "@/components/stakes/LockBanner";
import { PanicValveSheet } from "@/components/stakes/PanicValveSheet";
import { DURATIONS, EASINGS } from "@/utils/motion";
import { useReduceMotion } from "@/hooks/useReduceMotion";
import { colors } from "@/utils/design-tokens";
import type { StakeSession, Task } from "@/types";
import type { NextStep } from "@/core/task-logic";

/** Same "top task" intent as the Focus hub: soonest due, then priority, then newest. */
function pickTopTask(tasks: Record<string, Task>, preferredId?: string): Task | undefined {
  if (preferredId && tasks[preferredId] && tasks[preferredId].status !== "done") {
    return tasks[preferredId];
  }
  return Object.values(tasks)
    .filter((t) => t.status !== "done")
    .sort((a, b) => {
      const aHasDue = a.due != null;
      const bHasDue = b.due != null;
      if (aHasDue !== bHasDue) return aHasDue ? -1 : 1;
      if (aHasDue && bHasDue && a.due !== b.due) {
        return (a.due as number) - (b.due as number);
      }
      const p = (b.priority ?? 0) - (a.priority ?? 0);
      if (p !== 0) return p;
      return b.createdAt - a.createdAt;
    })[0];
}

function stepText(step: NextStep): string {
  if (step.kind === "first_move") return step.action.text;
  if (step.kind === "subtask") return step.subtask.title;
  return "";
}

export default function BlindfoldScreen() {
  const reduceMotion = useReduceMotion();
  const params = useLocalSearchParams<{ taskId?: string }>();

  const tasks = useTaskStore((s) => s.tasks);
  const updateTask = useTaskStore((s) => s.updateTask);
  const setSubtaskCompleted = useTaskStore((s) => s.setSubtaskCompleted);

  // -- Lock affordance (FR-42) -- Raw field select (Zustand v5 discipline).
  // Only one stake is ever active app-wide, so this is "the" lock, exactly
  // like `GlobalLockBanner` reads it — Blindfold is a passive viewer here,
  // never an arming surface.
  const activeStake = useStakesStore((s) => s.activeSession);
  // A separate copy, not derived from `activeStake`: releasing the lock nulls
  // `activeSession`, and if the sheet's session prop went with it the user
  // would watch their own escape hatch vanish mid-countdown instead of
  // reading "your apps are back" (same defensive pattern as
  // `GlobalLockBanner`).
  const [panicSession, setPanicSession] = useState<StakeSession | null>(null);

  const task = useMemo(
    () => pickTopTask(tasks, params.taskId),
    [tasks, params.taskId]
  );

  const step = useMemo<NextStep>(
    () => (task ? nextStep(task) : { kind: "none" }),
    [task]
  );

  // Force a fresh fade each time the revealed step changes.
  const stepId =
    step.kind === "first_move"
      ? step.action.id
      : step.kind === "subtask"
        ? step.subtask.id
        : "none";
  const [revealKey, setRevealKey] = useState(0);

  const exit = useCallback(() => {
    Haptics.selectionAsync().catch(() => {});
    router.back();
  }, []);

  const markDone = useCallback(() => {
    if (!task) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    if (step.kind === "first_move") {
      updateTask(task.id, { firstMove: { ...step.action, done: true } });
    } else if (step.kind === "subtask") {
      setSubtaskCompleted(task.id, step.subtask.id, true);
    }
    // Bump the reveal key so the NEXT step animates in fresh.
    setRevealKey((k) => k + 1);
  }, [task, step, updateTask, setSubtaskCompleted]);

  const done = !task || step.kind === "none";
  // A single gentle fade — the calm-down surface's one motion beat. Eased
  // (ease-out) rather than linear so it settles instead of moving at a
  // constant rate; still just an opacity fade, never a slide/spring, to keep
  // stimulation low. Skipped entirely under reduce-motion.
  const enter = reduceMotion
    ? undefined
    : FadeIn.duration(DURATIONS.slower).easing(EASINGS.standard);

  return (
    <View className="flex-1" style={{ backgroundColor: "#FFFBF5" }}>
      {/* Warm, soft wash — low stimulation. Inline hex (any color allowed). */}
      <LinearGradient
        colors={["#FFF3E6", "#FFFBF5"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        pointerEvents="none"
        style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
      />

      <SafeAreaView className="flex-1" edges={["top", "bottom"]}>
        {/* Quiet exit — top-left, unobtrusive. */}
        <View className="flex-row items-center px-5 pt-2">
          <PressableScale
            onPress={exit}
            haptic={false}
            className="min-w-11 min-h-11 items-center justify-center -ml-2"
            accessibilityRole="button"
            accessibilityLabel="Leave Blindfold mode"
          >
            <Ionicons name="chevron-down" size={24} color={colors.light.warningStrong} />
          </PressableScale>
        </View>

        {/* Lock banner — only while a stake is actually live (FR-42). Kept
            quiet at the top, out of the way of the one centered step below.
            `GlobalLockBanner` cannot reach this screen (see module doc), so
            this is the only place the panic valve is reachable from here. */}
        {activeStake && (
          <View className="px-5 pt-3">
            <LockBanner session={activeStake} onPanic={() => setPanicSession(activeStake)} />
          </View>
        )}

        {/* One thing, centered. */}
        <View className="flex-1 items-center justify-center px-8">
          {done ? (
            <Animated.View key="done" entering={enter} className="items-center">
              <View className="w-16 h-16 rounded-full bg-warning-100 items-center justify-center mb-6">
                <Ionicons name="checkmark" size={34} color={colors.light.warningStrong} />
              </View>
              <Text className="text-h2 font-semibold text-warning-700 text-center">
                {"You're clear."}
              </Text>
              <Text className="text-body text-neutral-500 text-center mt-3 max-w-[300px]">
                Nothing left to do right now. Take a breath.
              </Text>
            </Animated.View>
          ) : (
            <Animated.View
              key={`step-${stepId}-${revealKey}`}
              entering={enter}
              className="items-center w-full"
            >
              <Text className="text-overline font-semibold uppercase tracking-widest text-warning-600 mb-5">
                Just this one thing
              </Text>
              <Text
                className="text-center font-bold text-neutral-900"
                style={{ fontSize: 30, lineHeight: 40 }}
                accessibilityRole="header"
              >
                {stepText(step)}
              </Text>
            </Animated.View>
          )}
        </View>

        {/* Single action pinned low. */}
        <View className="px-8 pb-6">
          {done ? (
            <PressableScale
              onPress={exit}
              haptic="light"
              className="h-14 flex-row items-center justify-center rounded-2xl bg-warning-100"
              accessibilityLabel="Done, leave Blindfold"
            >
              <Text className="text-h4 font-semibold text-warning-700">Done</Text>
            </PressableScale>
          ) : (
            <>
              <PressableScale
                onPress={markDone}
                haptic="success"
                className="h-16 flex-row items-center justify-center rounded-2xl bg-warning-500"
                style={{ shadowColor: colors.light.warningStrong, shadowOpacity: 0.22, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 4 }}
                accessibilityRole="button"
                accessibilityLabel="Mark this step done and reveal the next"
              >
                <Ionicons name="checkmark-circle" size={24} color={colors.light.primaryForeground} />
                <Text className="ml-2 text-h4 font-semibold text-white">
                  I did this
                </Text>
              </PressableScale>
              <Text className="text-caption text-neutral-500 text-center mt-4">
                The next step stays hidden until this one is done.
              </Text>
            </>
          )}
        </View>
      </SafeAreaView>

      {/* Panic valve — always reachable, from anywhere in the app (FR-42).
          Kept mounted on `panicSession` rather than `activeStake` so a
          release mid-countdown does not tear the sheet down before it can
          show "your apps are back" (see the comment on `panicSession`). */}
      {panicSession && (
        <PanicValveSheet
          visible
          session={panicSession}
          onClose={() => setPanicSession(null)}
          onReleased={() => {
            // Leave the sheet mounted so it can show its "your apps are back"
            // state; `onClose` from its Done button tears it down.
          }}
        />
      )}
    </View>
  );
}
