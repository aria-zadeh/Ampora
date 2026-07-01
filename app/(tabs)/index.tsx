import React, { useMemo, useCallback } from "react";
import { View, Text, ScrollView } from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Animated, { FadeInDown, FadeIn } from "react-native-reanimated";
import { useTaskStore } from "@/store/taskStore";
import { useSettingsStore } from "@/store/settingsStore";
import { StarterActionCard } from "@/components/ui/StarterActionCard";
import { TaskCard } from "@/components/ui/TaskCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { FAB } from "@/components/ui/FAB";
import { Heading } from "@/components/ui/Heading";
import { gradients } from "@/utils/design-tokens";
import { DURATIONS, staggerDelay } from "@/utils/motion";
import { useReduceMotion } from "@/hooks/useReduceMotion";
import type { Task } from "@/types";

/** Time-of-day greeting. */
function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

/**
 * Sort incomplete tasks for the "Coming up" list:
 * tasks with a due date come first (earliest due first), then tasks with no
 * due date; within each bucket, higher priority (4=Urgent) comes first.
 */
function sortForComingUp(a: Task, b: Task): number {
  const aHasDue = a.due != null;
  const bHasDue = b.due != null;
  if (aHasDue !== bHasDue) return aHasDue ? -1 : 1;
  if (aHasDue && bHasDue && a.due !== b.due) {
    return (a.due as number) - (b.due as number);
  }
  return (b.priority ?? 0) - (a.priority ?? 0);
}

export default function HomeScreen() {
  const reduceMotion = useReduceMotion();

  const tasks = useTaskStore((s) => s.tasks);
  const updateTask = useTaskStore((s) => s.updateTask);

  const displayName = useSettingsStore((s) => s.settings.displayName);

  // Incomplete tasks, sorted for the "Coming up" section.
  const incompleteTasks = useMemo(
    () =>
      Object.values(tasks)
        .filter((t) => t.status !== "done")
        .sort(sortForComingUp),
    [tasks]
  );

  // Take the top few for display.
  const comingUp = useMemo(() => incompleteTasks.slice(0, 5), [incompleteTasks]);

  // The first incomplete task (among the top ones) that has a First move whose
  // action isn't done yet — that's the one we surface as a StarterActionCard.
  const firstMoveTask = useMemo(
    () => comingUp.find((t) => t.firstMove != null && !t.firstMove.done),
    [comingUp]
  );

  const toggleFirstMove = useCallback(() => {
    if (!firstMoveTask || !firstMoveTask.firstMove) return;
    updateTask(firstMoveTask.id, {
      firstMove: {
        ...firstMoveTask.firstMove,
        done: !firstMoveTask.firstMove.done,
      },
    });
  }, [firstMoveTask, updateTask]);

  const greeting = getGreeting();

  // Calm screen-enter fade for the greeting; skipped under reduce-motion.
  const headerEntering = reduceMotion ? undefined : FadeIn.duration(DURATIONS.slow);

  return (
    <SafeAreaView className="flex-1 bg-neutral-100" edges={["top"]}>
      {/* Faint hero wash bleeding down behind the greeting + focal card. */}
      <LinearGradient
        colors={gradients.heroWash}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        pointerEvents="none"
        style={{ position: "absolute", top: 0, left: 0, right: 0, height: 320 }}
      />

      <ScrollView
        className="flex-1"
        contentContainerClassName="px-5 pb-32"
        showsVerticalScrollIndicator={false}
      >
        {/* Greeting header — big, tight, confident. */}
        <Animated.View entering={headerEntering} className="pt-6 pb-1">
          <Text className="text-overline font-semibold text-primary-600 uppercase tracking-wide mb-2">
            Today
          </Text>
          <Heading size="h1">
            {greeting}
            {displayName ? `,\n${displayName}` : ""}
          </Heading>
        </Animated.View>

        {/* First move — the ONE focal element; give it room. */}
        {firstMoveTask?.firstMove && (
          <Animated.View
            entering={reduceMotion ? undefined : FadeInDown.duration(DURATIONS.base)}
            className="mt-6"
          >
            <StarterActionCard
              action={firstMoveTask.firstMove}
              onToggle={toggleFirstMove}
            />
          </Animated.View>
        )}

        {/* Coming up */}
        {comingUp.length > 0 ? (
          <View className="mt-10">
            <View className="flex-row items-baseline justify-between mb-4">
              <Heading size="h3">Coming up</Heading>
              <Text className="text-caption text-neutral-400">
                {comingUp.length} {comingUp.length === 1 ? "task" : "tasks"}
              </Text>
            </View>
            <View className="gap-3">
              {comingUp.map((task, index) => (
                <Animated.View
                  key={task.id}
                  entering={
                    reduceMotion
                      ? undefined
                      : FadeInDown.delay(staggerDelay(index)).duration(DURATIONS.base)
                  }
                >
                  <TaskCard
                    task={task}
                    onPress={() => router.push(`/task/${task.id}`)}
                  />
                </Animated.View>
              ))}
            </View>
          </View>
        ) : (
          <View className="mt-16">
            <EmptyState
              title="You're all caught up"
              subtitle="Nothing on deck right now. Add a task and your first move will show up here."
              icon="sunny-outline"
              actionLabel="Add a task"
              onAction={() => router.push("/task/new")}
            />
          </View>
        )}
      </ScrollView>

      <FAB onPress={() => router.push("/task/new")} />
    </SafeAreaView>
  );
}
