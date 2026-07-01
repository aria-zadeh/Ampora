import React, { useMemo, useCallback } from "react";
import { View, Text, ScrollView } from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTaskStore } from "@/store/taskStore";
import { useSettingsStore } from "@/store/settingsStore";
import { StarterActionCard } from "@/components/ui/StarterActionCard";
import { TaskCard } from "@/components/ui/TaskCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { FAB } from "@/components/ui/FAB";
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

  return (
    <SafeAreaView className="flex-1 bg-neutral-100" edges={["top"]}>
      <ScrollView
        className="flex-1"
        contentContainerClassName="px-4 pb-28"
        showsVerticalScrollIndicator={false}
      >
        {/* Greeting header */}
        <View className="pt-4 pb-2">
          <Text className="text-h1 font-bold text-neutral-900">
            {greeting}
            {displayName ? `, ${displayName}` : ""}
          </Text>
        </View>

        {/* First move */}
        {firstMoveTask?.firstMove && (
          <View className="mt-3">
            <StarterActionCard
              action={firstMoveTask.firstMove}
              onToggle={toggleFirstMove}
            />
          </View>
        )}

        {/* Coming up */}
        {comingUp.length > 0 ? (
          <View className="mt-6">
            <Text className="text-overline font-semibold text-neutral-500 uppercase mb-3">
              Coming up
            </Text>
            <View className="gap-3">
              {comingUp.map((task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  onPress={() => router.push(`/task/${task.id}`)}
                />
              ))}
            </View>
          </View>
        ) : (
          <View className="mt-10">
            <EmptyState
              title="You're all caught up"
              subtitle="Add a task to get started."
              icon="checkmark-done-circle-outline"
            />
          </View>
        )}
      </ScrollView>

      <FAB onPress={() => router.push("/task/new")} />
    </SafeAreaView>
  );
}
