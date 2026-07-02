import React, { useMemo, useCallback } from "react";
import { View, Text, ScrollView, Pressable } from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Animated, { FadeInDown, FadeIn } from "react-native-reanimated";
import { useTaskStore } from "@/store/taskStore";
import { useSettingsStore } from "@/store/settingsStore";
import {
  useScheduleStore,
  selectUpcomingBlocks,
  selectBlocksByDay,
} from "@/store/scheduleStore";
import { StarterActionCard } from "@/components/ui/StarterActionCard";
import { TomorrowPlanCard } from "@/components/home/TomorrowPlanCard";
import { ProjectsEntryCard } from "@/components/home/ProjectsEntryCard";
import { NeedsAttention } from "@/components/home/NeedsAttention";
import { TaskCard } from "@/components/ui/TaskCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { FAB } from "@/components/ui/FAB";
import { Heading } from "@/components/ui/Heading";
import { UpcomingList } from "@/components/schedule/UpcomingList";
import { EnergyChip } from "@/components/home/EnergyChip";
import { gradients, iconSizes } from "@/utils/design-tokens";
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

const DAY_MS = 24 * 60 * 60 * 1000;

/** Local start-of-day epoch ms for `ms`. */
function startOfDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Is it evening (5pm+)? The "Ready for tomorrow" card leans in after this. */
function isEvening(): boolean {
  return new Date().getHours() >= 17;
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

  // Are there any upcoming scheduled blocks? Reactive scalar (a count) so this
  // subscription never returns a new array — no useShallow needed here, and the
  // heavier grouping work lives inside <UpcomingList> which owns its selector.
  const hasUpcoming = useScheduleStore(
    (s) => selectUpcomingBlocks(1)(s).length > 0
  );

  // Does tomorrow already have any placed blocks? Reactive scalar (a count) so
  // this subscription never returns a fresh array — the card owns the heavier
  // resolution. Recomputed against a per-render "tomorrow" window.
  const tomorrowStart = useMemo(() => startOfDay(Date.now()) + DAY_MS, []);
  const tomorrowHasPlan = useScheduleStore(
    (s) => selectBlocksByDay(tomorrowStart)(s).length > 0
  );

  // Surface the "Ready for tomorrow" card in the evening, or any time tomorrow
  // already has a plan worth previewing.
  const showTomorrowPlan = isEvening() || tomorrowHasPlan;

  // "Rebuild schedule" ghost action — reruns the engine on demand (FR-21).
  const rebuildSchedule = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    useScheduleStore.getState().recompute();
  }, []);

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
          <View className="flex-row items-start justify-between">
            <View className="flex-1">
              <Text className="text-overline font-semibold text-primary-600 uppercase tracking-wide mb-2">
                Today
              </Text>
              <Heading size="display">
                {greeting}
                {displayName ? `,\n${displayName}` : ""}
              </Heading>
            </View>

            {/* Rebuild schedule — subtle ghost action; only shown once the
                engine has produced a plan, so it never clutters the empty state. */}
            {hasUpcoming && (
              <Pressable
                onPress={rebuildSchedule}
                hitSlop={8}
                className="flex-row items-center gap-1 mt-1 px-3 py-2 rounded-full active:opacity-60"
                accessibilityRole="button"
                accessibilityLabel="Rebuild schedule"
                accessibilityHint="Recomputes your scheduled times"
              >
                <Ionicons
                  name="sparkles-outline"
                  size={iconSizes.xs}
                  color="#2563EB"
                />
                <Text className="text-caption font-medium text-primary-600">
                  Rebuild
                </Text>
              </Pressable>
            )}
          </View>
        </Animated.View>

        {/* Projects — a prominent, always-present entry into the projects hub
            (doc 10). Lifted out of the cramped Tasks-header pill into a premium
            Home row so larger work is easy to find. Accent (#7C3AED) is reserved
            for Projects, so it belongs here. */}
        <Animated.View
          entering={reduceMotion ? undefined : FadeInDown.duration(DURATIONS.base)}
          className="mt-7"
        >
          <ProjectsEntryCard />
        </Animated.View>

        {/* Energy chip — a subtle, additive "what can you handle now" cue that
            re-sorts today's plan (FR-53). Only shown once there's something to
            re-sort; hidden otherwise so it never clutters the empty state. */}
        {incompleteTasks.length > 1 && (
          <Animated.View
            entering={reduceMotion ? undefined : FadeIn.duration(DURATIONS.base)}
            className="mt-4"
          >
            <EnergyChip />
          </Animated.View>
        )}

        {/* First move — the ONE focal element; give it room. */}
        {firstMoveTask?.firstMove && (
          <Animated.View
            entering={reduceMotion ? undefined : FadeInDown.duration(DURATIONS.base)}
            className="mt-7"
          >
            <StarterActionCard
              action={firstMoveTask.firstMove}
              onToggle={toggleFirstMove}
            />
          </Animated.View>
        )}

        {/* Needs attention (FR-16 / §8.6) — the calm missed-work surface.
            Sits BEFORE Scheduled so lapsed sessions are the first thing to
            reconcile. Renders nothing (incl. its own spacing) when nothing is
            missed, so the empty state stays clean. */}
        <NeedsAttention />

        {/* Scheduled — the engine's output: when each task actually happens.
            Additive; only rendered once there's a plan. */}
        {hasUpcoming && (
          <Animated.View
            entering={reduceMotion ? undefined : FadeInDown.duration(DURATIONS.base)}
            className="mt-7"
          >
            <View className="flex-row items-baseline justify-between mb-4">
              <Heading size="h3">Scheduled</Heading>
              <Text className="text-caption text-neutral-500">Your plan</Text>
            </View>
            <UpcomingList limit={6} />
          </Animated.View>
        )}

        {/* Ready for tomorrow (FR-90) — additive; leans in during the evening
            or whenever tomorrow already has a plan to preview. */}
        {showTomorrowPlan && (
          <Animated.View
            entering={reduceMotion ? undefined : FadeInDown.duration(DURATIONS.base)}
            className="mt-7"
          >
            <TomorrowPlanCard />
          </Animated.View>
        )}

        {/* Coming up */}
        {comingUp.length > 0 ? (
          <View className="mt-7">
            <View className="flex-row items-baseline justify-between mb-4">
              <Heading size="h3">Coming up</Heading>
              <Text className="text-caption text-neutral-500">
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
          <View className="mt-7">
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
