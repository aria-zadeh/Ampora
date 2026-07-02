/**
 * Focus hub — Ampora Phase 4 (PRD FR-62).
 *
 * Lists the tasks you can drop into a focus session, surfaces a resume card
 * when a session is already active, and offers a one-tap "Focus on my next
 * task" primary that starts a session for the highest-priority task.
 *
 * Tapping any task → router.push('/focus/session?taskId=<id>'). The session
 * screen owns the timer, steps, audio, and Blindfold hand-off; this hub is a
 * calm launcher only.
 */

import React, { useCallback, useMemo } from "react";
import { View, Text, ScrollView } from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import Animated, { FadeIn, FadeInDown } from "react-native-reanimated";

import { useTaskStore } from "@/store/taskStore";
import { useSessionStore } from "@/store/sessionStore";
import { nextStep } from "@/core/task-logic";
import { Heading } from "@/components/ui/Heading";
import { PressableScale } from "@/components/ui/PressableScale";
import { EmptyState } from "@/components/ui/EmptyState";
import { gradients, iconSizes } from "@/utils/design-tokens";
import { DURATIONS, staggerDelay } from "@/utils/motion";
import { useReduceMotion } from "@/hooks/useReduceMotion";
import type { Task } from "@/types";

/**
 * Focus priority: tasks with a due date first (soonest first), then by
 * priority (4=Urgent highest), then newest. Matches the home screen's
 * "coming up" intent so "next task" is predictable.
 */
function sortForFocus(a: Task, b: Task): number {
  const aHasDue = a.due != null;
  const bHasDue = b.due != null;
  if (aHasDue !== bHasDue) return aHasDue ? -1 : 1;
  if (aHasDue && bHasDue && a.due !== b.due) {
    return (a.due as number) - (b.due as number);
  }
  const p = (b.priority ?? 0) - (a.priority ?? 0);
  if (p !== 0) return p;
  return b.createdAt - a.createdAt;
}

export default function FocusScreen() {
  const reduceMotion = useReduceMotion();

  const tasks = useTaskStore((s) => s.tasks);
  // Active session as a reactive scalar (id) so this subscription never returns
  // a fresh object reference — no useShallow needed.
  const activeTaskId = useSessionStore((s) => s.active?.taskId ?? null);

  const focusable = useMemo(
    () =>
      Object.values(tasks)
        .filter((t) => t.status !== "done")
        .sort(sortForFocus),
    [tasks]
  );

  const nextTask = focusable[0];
  const activeTask = activeTaskId ? tasks[activeTaskId] : undefined;

  const startFocus = useCallback((id: string) => {
    router.push(`/focus/session?taskId=${id}`);
  }, []);

  const enter = reduceMotion ? undefined : FadeIn.duration(DURATIONS.slow);

  return (
    <SafeAreaView className="flex-1 bg-neutral-100" edges={["top"]}>
      <LinearGradient
        colors={gradients.successTint}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        pointerEvents="none"
        style={{ position: "absolute", top: 0, left: 0, right: 0, height: 300 }}
      />

      <ScrollView
        className="flex-1"
        contentContainerClassName="px-5 pb-28"
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <Animated.View entering={enter} className="pt-6 pb-1">
          <Text className="text-overline font-semibold uppercase tracking-wide text-success-700 mb-2">
            Focus
          </Text>
          <Heading size="h1">One thing at a time</Heading>
          <Text className="text-body text-neutral-500 mt-2">
            Pick a task and drop into a distraction-free session.
          </Text>
        </Animated.View>

        {/* Resume active session */}
        {activeTask && (
          <Animated.View
            entering={reduceMotion ? undefined : FadeInDown.duration(DURATIONS.base)}
            className="mt-6"
          >
            <PressableScale
              onPress={() => startFocus(activeTask.id)}
              haptic="medium"
              className="rounded-2xl bg-success-700 p-5"
              style={{ shadowColor: "#166534", shadowOpacity: 0.2, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 4 }}
              accessibilityLabel={`Resume focusing on ${activeTask.title}`}
            >
              <View className="flex-row items-center justify-between">
                <View className="flex-1 pr-3">
                  <Text className="text-overline font-semibold uppercase tracking-wide text-success-100">
                    Session in progress
                  </Text>
                  <Text
                    className="text-h4 font-semibold text-white mt-1"
                    numberOfLines={1}
                  >
                    {activeTask.title}
                  </Text>
                </View>
                <View className="w-11 h-11 rounded-full bg-white/20 items-center justify-center">
                  <Ionicons name="play" size={iconSizes.md} color="#FFFFFF" />
                </View>
              </View>
            </PressableScale>
          </Animated.View>
        )}

        {/* Focus on next task — primary launcher */}
        {nextTask && !activeTask && (
          <Animated.View
            entering={reduceMotion ? undefined : FadeInDown.duration(DURATIONS.base)}
            className="mt-6"
          >
            <PressableScale
              onPress={() => startFocus(nextTask.id)}
              haptic="success"
              className="rounded-2xl bg-success-700 p-5"
              style={{ shadowColor: "#166534", shadowOpacity: 0.2, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 4 }}
              accessibilityLabel={`Focus on my next task, ${nextTask.title}`}
            >
              <Text className="text-overline font-semibold uppercase tracking-wide text-success-100">
                Recommended
              </Text>
              <Text className="text-h3 font-semibold text-white mt-1" numberOfLines={2}>
                {nextTask.title}
              </Text>
              <View className="flex-row items-center gap-1.5 mt-4">
                <Ionicons name="play-circle" size={iconSizes.md} color="#FFFFFF" />
                <Text className="text-label font-semibold text-white">
                  Focus on my next task
                </Text>
              </View>
            </PressableScale>
          </Animated.View>
        )}

        {/* Task list */}
        {focusable.length > 0 ? (
          <View className="mt-10">
            <View className="flex-row items-baseline justify-between mb-4">
              <Heading size="h3">Ready to focus</Heading>
              <Text className="text-caption text-neutral-500">
                {focusable.length} {focusable.length === 1 ? "task" : "tasks"}
              </Text>
            </View>
            <View className="gap-3">
              {focusable.map((task, index) => (
                <Animated.View
                  key={task.id}
                  entering={
                    reduceMotion
                      ? undefined
                      : FadeInDown.delay(staggerDelay(index)).duration(DURATIONS.base)
                  }
                >
                  <FocusTaskRow task={task} onPress={() => startFocus(task.id)} />
                </Animated.View>
              ))}
            </View>
          </View>
        ) : (
          <View className="mt-16">
            <EmptyState
              title="Nothing to focus on yet"
              subtitle="Add a task and it'll show up here, ready for a calm focus session."
              icon="timer-outline"
              actionLabel="Add a task"
              onAction={() => router.push("/task/new")}
            />
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Task row — a compact focus launcher showing the current step
// ---------------------------------------------------------------------------

function FocusTaskRow({ task, onPress }: { task: Task; onPress: () => void }) {
  const step = nextStep(task);
  const stepLabel =
    step.kind === "first_move"
      ? step.action.text
      : step.kind === "subtask"
        ? step.subtask.title
        : "Ready to wrap up";

  return (
    <PressableScale
      onPress={onPress}
      haptic="light"
      className="rounded-xl bg-white border border-neutral-200 p-4"
      style={{ shadowColor: "#1C1917", shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 }}
      accessibilityLabel={`Focus on ${task.title}. Next: ${stepLabel}`}
    >
      <View className="flex-row items-center">
        <View className="flex-1 pr-3">
          <Text className="text-body font-semibold text-neutral-900" numberOfLines={1}>
            {task.title}
          </Text>
          <View className="flex-row items-center gap-1.5 mt-1">
            <Ionicons name="arrow-forward" size={iconSizes.xs} color="#22C55E" />
            <Text className="text-caption text-neutral-500 flex-1" numberOfLines={1}>
              {stepLabel}
            </Text>
          </View>
        </View>
        <View className="w-10 h-10 rounded-full bg-success-100 items-center justify-center">
          <Ionicons name="play" size={iconSizes.sm} color="#15803D" />
        </View>
      </View>
    </PressableScale>
  );
}
