import React, { useEffect, useMemo } from "react";
import { View, Text } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useShallow } from "zustand/react/shallow";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { GradientCard } from "@/components/ui/GradientCard";
import { PressableScale } from "@/components/ui/PressableScale";
import { Badge } from "@/components/ui/Badge";
import { useScheduleStore, selectBlocksByDay } from "@/store/scheduleStore";
import { useTaskStore } from "@/store/taskStore";
import { useProjectStore } from "@/store/projectStore";
import { nextStep } from "@/core/task-logic";
import { gradients, iconSizes } from "@/utils/design-tokens";
import { EASINGS } from "@/utils/motion";
import { useReduceMotion } from "@/hooks/useReduceMotion";
import type { ScheduledBlock, Task } from "@/types";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Local start-of-day epoch ms for `ms`. */
function startOfDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** "3:00 PM" style clock label. */
function formatClock(ms: number): string {
  return new Date(ms).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * The single starter line a task exposes for tomorrow: its First move if it
 * has one that isn't done, else its first unfinished subtask, else null.
 */
function starterLine(task: Task): string | null {
  const step = nextStep(task);
  if (step.kind === "first_move") return step.action.text;
  if (step.kind === "subtask") return step.subtask.title;
  return null;
}

/**
 * A quiet "moon-phase" visual moment for the evening card: the moon glyph
 * breathes very slowly (fade + a whisper of scale) and a faint halo behind it
 * pulses in the same rhythm, like a phase gently waxing and waning. Deliberately
 * slow (2.6s halves) and low-amplitude — a single ambient cue, not a spinner.
 * Reduce-motion renders a static moon + halo at rest, no animation.
 */
function MoonPhase({ reduceMotion }: { reduceMotion: boolean }) {
  const breathe = useSharedValue(0);

  useEffect(() => {
    if (reduceMotion) return;
    // Idle a beat on mount, then loop a slow 0 -> 1 -> 0 breathing cycle forever.
    breathe.value = withDelay(
      300,
      withRepeat(
        withSequence(
          withTiming(1, { duration: 2600, easing: EASINGS.inOut }),
          withTiming(0, { duration: 2600, easing: EASINGS.inOut }),
        ),
        -1,
        false,
      ),
    );
  }, [reduceMotion, breathe]);

  const moonStyle = useAnimatedStyle(() => ({
    opacity: reduceMotion ? 1 : 0.8 + breathe.value * 0.2,
    transform: [{ scale: reduceMotion ? 1 : 1 + breathe.value * 0.06 }],
  }));

  const haloStyle = useAnimatedStyle(() => ({
    opacity: reduceMotion ? 0.16 : 0.1 + breathe.value * 0.16,
    transform: [{ scale: reduceMotion ? 1 : 1 + breathe.value * 0.22 }],
  }));

  return (
    <View
      className="items-center justify-center"
      style={{ width: iconSizes.lg + 20, height: iconSizes.lg + 20 }}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {/* Faint halo — decorative depth behind the glyph, never carries meaning. */}
      <Animated.View
        style={[
          haloStyle,
          {
            position: "absolute",
            width: iconSizes.lg + 20,
            height: iconSizes.lg + 20,
            borderRadius: (iconSizes.lg + 20) / 2,
            backgroundColor: "#2563EB",
          },
        ]}
      />
      <Animated.View style={moonStyle}>
        <Ionicons name="moon-outline" size={iconSizes.lg} color="#2563EB" />
      </Animated.View>
    </View>
  );
}

/**
 * TomorrowPlanCard (FR-90) — a calm "Ready for tomorrow" card surfaced on the
 * Home screen in the evening / whenever tomorrow already has a plan.
 *
 * If the engine has placed blocks for tomorrow, it shows a compact preview:
 * how many sessions, the first task, when it starts, and that task's First
 * move (or first step) so the user wakes up already knowing their opening
 * move. If nothing is scheduled for tomorrow, it renders a gentle,
 * non-shaming nudge instead.
 *
 * Tapping opens the first task (so the First move is one tap away); with no
 * first task it drops the user on the Calendar. Purely additive — it never
 * mutates state.
 */
export function TomorrowPlanCard() {
  const reduceMotion = useReduceMotion();

  // Tomorrow's local-day window. Recomputed from `Date.now()` each render; the
  // Home screen re-mounts often enough that this stays fresh without a timer.
  const tomorrowStart = useMemo(() => startOfDay(Date.now()) + DAY_MS, []);

  // New array from the store -> useShallow (Zustand v5 project rule).
  const blocks = useScheduleStore(
    useShallow(selectBlocksByDay(tomorrowStart))
  );
  const tasks = useTaskStore((s) => s.tasks);

  // Resolve tomorrow's plan: the placed blocks whose task still exists, in
  // start order, plus the first task + its opening step.
  const plan = useMemo(() => {
    const rows = blocks
      .map((block: ScheduledBlock) => ({ block, task: tasks[block.taskId] }))
      .filter((r): r is { block: ScheduledBlock; task: Task } => r.task != null)
      .sort((a, b) => a.block.start - b.block.start);

    const first = rows[0];
    return {
      sessionCount: rows.length,
      firstTask: first?.task ?? null,
      firstStart: first?.block.start ?? null,
      firstStep: first ? starterLine(first.task) : null,
    };
  }, [blocks, tasks]);

  const hasPlan = plan.sessionCount > 0 && plan.firstTask != null;

  // FR-84/FR-90 tie-in: when the opening task came from a Project's nightly
  // session generation, say so with the Projects-only accent (docs/02 — the
  // purple accent is reserved for Projects). Raw field select (no derived
  // object), so no useShallow needed (Zustand v5 discipline).
  const firstTaskProjectId = plan.firstTask?.projectId;
  const project = useProjectStore((s) =>
    firstTaskProjectId ? s.projects[firstTaskProjectId] : undefined
  );

  const onPress = () => {
    if (plan.firstTask) {
      router.push(`/task/${plan.firstTask.id}`);
    } else {
      router.push("/(tabs)/calendar");
    }
  };

  // --- Gentle nudge: nothing scheduled for tomorrow yet. -------------------
  if (!hasPlan) {
    return (
      <PressableScale
        onPress={() => router.push("/(tabs)/calendar")}
        haptic="light"
        accessibilityRole="button"
        accessibilityLabel="Tomorrow has no plan yet. Opens your calendar."
        accessibilityHint="Opens the calendar"
      >
        <GradientCard colors={gradients.firstMove}>
          <View className="flex-row items-center justify-between">
            <View className="flex-1 pr-3">
              <Text className="text-overline font-semibold uppercase tracking-wide text-primary-600">
                Ready for tomorrow
              </Text>
              <Text className="mt-1.5 text-body-lg font-medium text-neutral-900">
                Tomorrow is open
              </Text>
              <Text className="mt-1 text-body text-neutral-500">
                Nothing scheduled yet. Add a task tonight and you will wake up
                with a first move ready.
              </Text>
            </View>
            <MoonPhase reduceMotion={reduceMotion} />
          </View>
        </GradientCard>
      </PressableScale>
    );
  }

  // --- Full preview: tomorrow has a plan. ----------------------------------
  const { sessionCount, firstTask, firstStart, firstStep } = plan;
  const sessionLabel = `${sessionCount} ${
    sessionCount === 1 ? "session" : "sessions"
  }`;
  const timeLabel = firstStart != null ? formatClock(firstStart) : "";

  const a11yLabel = [
    "Ready for tomorrow",
    `${sessionLabel}`,
    firstTask ? `first up ${firstTask.title}${timeLabel ? ` at ${timeLabel}` : ""}` : null,
    project ? `part of the ${project.title} project` : null,
    firstStep ? `First move: ${firstStep}` : null,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <PressableScale
      onPress={onPress}
      haptic="light"
      accessibilityRole="button"
      accessibilityLabel={a11yLabel}
      accessibilityHint="Opens the first task for tomorrow"
    >
      <GradientCard colors={gradients.firstMove}>
        {/* Header: overline + session count. */}
        <View className="flex-row items-center justify-between">
          <Text className="text-overline font-semibold uppercase tracking-wide text-primary-600">
            Ready for tomorrow
          </Text>
          <View className="flex-row items-center">
            <Ionicons
              name="calendar-outline"
              size={iconSizes.xs}
              color="#6F6862"
            />
            <Text className="ml-1 text-caption font-medium text-neutral-500">
              {sessionLabel}
            </Text>
          </View>
        </View>

        {/* Project origin (FR-84/FR-90): the Projects-only accent, never used elsewhere. */}
        {project ? (
          <View className="mt-2 flex-row items-center gap-1.5">
            <Badge label="Project" tone="accent" />
            <Text className="flex-1 text-caption text-neutral-500" numberOfLines={1}>
              {project.title}
            </Text>
          </View>
        ) : null}

        {/* First up: task + start time. */}
        <View className="mt-2 flex-row items-baseline justify-between">
          <Text
            className="flex-1 pr-3 text-h4 font-semibold text-neutral-900"
            numberOfLines={1}
          >
            {firstTask?.title}
          </Text>
          {timeLabel ? (
            <Text className="text-caption font-semibold text-primary-600">
              {timeLabel}
            </Text>
          ) : null}
        </View>

        {/* First move for that opening task — the thing that defeats the cold
            start. Only shown when the task actually surfaces one. */}
        {firstStep ? (
          <View className="mt-3 flex-row items-center rounded-lg bg-primary-50 px-3 py-2.5">
            <Ionicons name="flag-outline" size={iconSizes.xs} color="#2563EB" />
            <View className="ml-2 flex-1">
              <Text className="text-tiny font-semibold uppercase tracking-wide text-primary-600">
                First move
              </Text>
              <Text
                className="mt-0.5 text-body font-medium text-neutral-900"
                numberOfLines={2}
              >
                {firstStep}
              </Text>
            </View>
          </View>
        ) : null}

        {/* Affordance footer. */}
        <View className="mt-3 flex-row items-center">
          <Text className="text-caption font-medium text-primary-600">
            {firstStep ? "Open first task" : "See tomorrow"}
          </Text>
          <Ionicons
            name="chevron-forward"
            size={iconSizes.xs}
            color="#2563EB"
          />
        </View>
      </GradientCard>
    </PressableScale>
  );
}
