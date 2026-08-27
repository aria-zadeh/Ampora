import React, { useCallback, useMemo, useState } from "react";
import { View, ScrollView, Pressable } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Animated, { FadeInDown, FadeIn } from "react-native-reanimated";
import { useShallow } from "zustand/react/shallow";
import { useTaskStore } from "@/store/taskStore";
import { useSettingsStore } from "@/store/settingsStore";
import { useListStore } from "@/store/listStore";
import {
  useScheduleStore,
  selectUpcomingBlocks,
  selectBlocksByDay,
} from "@/store/scheduleStore";
import { TodayFocusCard } from "@/components/home/TodayFocusCard";
import { UrgentStrip, selectUrgentTask } from "@/components/home/UrgentStrip";
import { TomorrowPlanCard } from "@/components/home/TomorrowPlanCard";
import { ProjectsEntryCard } from "@/components/home/ProjectsEntryCard";
import { NeedsAttention } from "@/components/home/NeedsAttention";
import { EmptyState } from "@/components/ui/EmptyState";
import { FAB } from "@/components/ui/FAB";
import { Heading } from "@/components/ui/Heading";
import { Text } from "@/components/ui/Text";
import { PressableScale } from "@/components/ui/PressableScale";
import { iconSizes, tabularNums } from "@/utils/design-tokens";
import { DURATIONS, staggerDelay } from "@/utils/motion";
import { useReduceMotion } from "@/hooks/useReduceMotion";
import { useThemeColors } from "@/hooks/useThemeColors";
import type { Task, ScheduledBlock, List } from "@/types";

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
 * Sort incomplete tasks for the "Coming up" pool: tasks with a due date come
 * first (earliest due first), then tasks with no due date. Within each
 * bucket, higher priority (4=Urgent) comes first.
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

/** "4:00 PM" style clock label for an epoch-ms instant. */
function formatClock(ms: number): string {
  return new Date(ms).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * Calm, natural-language duration for the greeting sub-line: "45 min",
 * "1 hour", "2 hours 15 min". Kept in "min" below the hour (matching the
 * app's own meta-line convention elsewhere) and prose above it.
 */
function formatRemainingDuration(totalMin: number): string {
  if (totalMin < 60) return `${totalMin} min`;
  const hours = Math.floor(totalMin / 60);
  const minutes = totalMin % 60;
  const hourLabel = `${hours} ${hours === 1 ? "hour" : "hours"}`;
  return minutes === 0 ? hourLabel : `${hourLabel} ${minutes} min`;
}

interface UpNextRowData {
  block: ScheduledBlock;
  task: Task;
  list?: List;
}

/**
 * One "Up next" agenda row (`DESIGN_DECISION_SPEC.md` structure, Screen 1):
 * time, list-colour dot, title, list name. Plain data display, tap opens the
 * task. No slack colour, no step count, unlike the Calendar tab's rows.
 */
function UpNextRow({ row }: { row: UpNextRowData }) {
  const { block, task, list } = row;
  const timeLabel = useMemo(() => formatClock(block.start), [block.start]);

  const a11yLabel = [task.title, `at ${timeLabel}`, list?.name ? `${list.name} list` : null]
    .filter(Boolean)
    .join(", ");

  return (
    <PressableScale
      onPress={() => router.push(`/task/${task.id}`)}
      haptic="light"
      className="min-h-11 flex-row items-center gap-3 rounded-xl border border-line bg-surface p-4"
      accessibilityRole="button"
      accessibilityLabel={a11yLabel}
      accessibilityHint="Opens this task"
    >
      <Text variant="captionMedium" className="w-14 text-ink-secondary" style={tabularNums}>
        {timeLabel}
      </Text>
      {list?.color ? (
        <View
          className="h-2 w-2 rounded-full"
          style={{ backgroundColor: list.color }}
          accessibilityElementsHidden
          importantForAccessibility="no"
        />
      ) : null}
      <Text variant="bodyMedium" className="flex-1" numberOfLines={1}>
        {task.title}
      </Text>
      {list?.name ? (
        <Text variant="caption" className="text-ink-secondary" numberOfLines={1}>
          {list.name}
        </Text>
      ) : null}
    </PressableScale>
  );
}

export default function HomeScreen() {
  const reduceMotion = useReduceMotion();
  const theme = useThemeColors();

  const tasks = useTaskStore((s) => s.tasks);
  const lists = useListStore((s) => s.lists);

  const displayName = useSettingsStore((s) => s.settings.displayName);

  // Are there any upcoming scheduled blocks? Reactive scalar (a count) so this
  // subscription never returns a new array, so no useShallow is needed here.
  // The "Up next" rows below own a separate, heavier subscription.
  const hasUpcoming = useScheduleStore(
    (s) => selectUpcomingBlocks(1)(s).length > 0
  );

  // The three nearest upcoming blocks, resolved to their task + list.
  const upcomingBlocks = useScheduleStore(useShallow(selectUpcomingBlocks(3)));
  const upNextRows = useMemo<UpNextRowData[]>(() => {
    const rows: UpNextRowData[] = [];
    for (const block of upcomingBlocks) {
      const task = tasks[block.taskId];
      if (!task) continue; // task deleted since last recompute, skip stale block
      rows.push({ block, task, list: task.listId ? lists[task.listId] : undefined });
    }
    return rows;
  }, [upcomingBlocks, tasks, lists]);

  // Does tomorrow already have any placed blocks? Reactive scalar (a count) so
  // this subscription never returns a fresh array, the card owns the heavier
  // resolution. Recomputed against a per-render "tomorrow" window.
  const tomorrowStart = useMemo(() => startOfDay(Date.now()) + DAY_MS, []);
  const tomorrowHasPlan = useScheduleStore(
    (s) => selectBlocksByDay(tomorrowStart)(s).length > 0
  );

  // Surface the "Ready for tomorrow" card in the evening, or any time tomorrow
  // already has a plan worth previewing.
  const showTomorrowPlan = isEvening() || tomorrowHasPlan;

  // "Rebuild schedule" ghost action, reruns the engine on demand (FR-21).
  const rebuildSchedule = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    useScheduleStore.getState().recompute();
  }, []);

  // Incomplete tasks, sorted for the "Coming up" pool.
  const incompleteTasks = useMemo(
    () =>
      Object.values(tasks)
        .filter((t) => t.status !== "done")
        .sort(sortForComingUp),
    [tasks]
  );

  // Nearest-due incomplete task within the urgent window, computed against a
  // once-per-mount "now" (matches this file's existing tomorrowStart pattern,
  // no new interval/timer).
  const nowMs = useMemo(() => Date.now(), []);
  const urgentTask = useMemo(() => selectUrgentTask(tasks, nowMs), [tasks, nowMs]);

  // Take the top few for display.
  const comingUp = useMemo(() => incompleteTasks.slice(0, 5), [incompleteTasks]);

  // The first candidate (among the top ones) with an undone First move,
  // same selection rule as before. "Not now" advances past it locally,
  // without touching any store.
  const focusCandidates = useMemo(
    () => comingUp.filter((t) => t.firstMove != null && !t.firstMove.done),
    [comingUp]
  );
  const [skippedTaskIds, setSkippedTaskIds] = useState<Set<string>>(() => new Set());
  const firstMoveTask = useMemo(
    () => focusCandidates.find((t) => !skippedTaskIds.has(t.id)) ?? null,
    [focusCandidates, skippedTaskIds]
  );
  const handleNotNow = useCallback(() => {
    if (!firstMoveTask) return;
    const skippedId = firstMoveTask.id;
    setSkippedTaskIds((prev) => {
      const next = new Set(prev);
      next.add(skippedId);
      return next;
    });
  }, [firstMoveTask]);

  const greeting = getGreeting();
  const greetingLine = displayName ? `${greeting}, ${displayName}.` : `${greeting}.`;

  // Sub-line: "{n} things left. About {duration}." is the only other new
  // computation, local + useMemo, no store changes. Hidden at zero tasks:
  // the existing empty-state block below already carries that message.
  const subLine = useMemo(() => {
    if (incompleteTasks.length === 0) return null;
    const remainingMin = incompleteTasks.reduce(
      (sum, t) => sum + Math.max(0, t.durationMin - t.progressMin),
      0
    );
    const count = incompleteTasks.length;
    const head = `${count} ${count === 1 ? "thing" : "things"} left.`;
    // Tasks with no estimate sum to zero. "About 0 min" is a false claim, so
    // the duration clause only renders when there is real time to report.
    return remainingMin > 0
      ? `${head} About ${formatRemainingDuration(remainingMin)}.`
      : head;
  }, [incompleteTasks]);

  // Calm screen-enter fade for the greeting, skipped under reduce-motion.
  const headerEntering = reduceMotion ? undefined : FadeIn.duration(DURATIONS.slow);
  const cardEntering = reduceMotion ? undefined : FadeInDown.duration(DURATIONS.base);

  return (
    <View className="flex-1 bg-canvas">
      <ScrollView
        className="flex-1"
        contentContainerClassName="pb-32"
        showsVerticalScrollIndicator={false}
      >
        {/* Header (measured layout): screen title + a profile avatar,
            top-right. The avatar is presentational only, no photo storage
            or profile navigation wired here, so it renders as a decorative
            placeholder rather than a control. */}
        <Animated.View
          entering={headerEntering}
          className="flex-row items-center justify-between px-6 pt-6 pb-1"
        >
          <Heading size="h1">Today</Heading>
          <View className="flex-row items-center gap-3">
            {/* Rebuild schedule: a subtle ghost action, only shown once the
                engine has produced a plan, so it never clutters the empty state. */}
            {hasUpcoming && (
              <Pressable
                onPress={rebuildSchedule}
                hitSlop={8}
                className="flex-row items-center gap-1 px-3 py-2 rounded-full active:opacity-60"
                accessibilityRole="button"
                accessibilityLabel="Rebuild schedule"
                accessibilityHint="Recomputes your scheduled times"
              >
                <Ionicons
                  name="sparkles-outline"
                  size={iconSizes.xs}
                  color={theme.primary}
                />
                <Text variant="captionMedium" className="text-primary-600">
                  Rebuild
                </Text>
              </Pressable>
            )}
            <View
              className="h-9 w-9 items-center justify-center rounded-full border border-line-strong bg-raised"
              accessibilityElementsHidden
              importantForAccessibility="no"
            >
              <Ionicons name="person-outline" size={iconSizes.sm} color={theme.textSecondary} />
            </View>
          </View>
        </Animated.View>

        {/* Full-bleed daily summary banner (measured layout): the greeting
            and "N things left" line, edge to edge instead of plain header
            text. Same computed strings as before: greeting always shown,
            the second line only when there is remaining work. */}
        <Animated.View entering={headerEntering} className="mt-6">
          <View className="flex-row items-center rounded-xl border border-line bg-surface px-6 py-4">
            <Ionicons name="list-outline" size={iconSizes.md} color={theme.textSecondary} />
            <View className="ml-2 flex-1">
              <Text variant="bodyMedium" numberOfLines={1}>
                {greetingLine}
              </Text>
              {subLine ? (
                <Text variant="caption" className="mt-0.5 text-ink-secondary" numberOfLines={1}>
                  {subLine}
                </Text>
              ) : null}
            </View>
          </View>
        </Animated.View>

        <View className="px-6 mt-4 gap-3">
          {/* Urgent strip: the one thing closest to due, if any. */}
          {urgentTask && (
            <Animated.View entering={cardEntering}>
              <UrgentStrip task={urgentTask} nowMs={nowMs} />
            </Animated.View>
          )}

          {/* Today's focus: the screen's one elevated hero. Hides when there
              is no First-move candidate left to surface. */}
          {firstMoveTask?.firstMove && (
            <Animated.View entering={cardEntering}>
              <TodayFocusCard task={firstMoveTask} onNotNow={handleNotNow} />
            </Animated.View>
          )}

          {/* Up next: a short, plain agenda preview (max 3). The Calendar tab
              remains the full schedule view. */}
          {upNextRows.length > 0 && (
            <Animated.View entering={cardEntering}>
              <Text variant="overline" className="px-0.5 text-ink-muted">
                Up next
              </Text>
              <View className="mt-2 gap-2">
                {upNextRows.map((row, index) => (
                  <Animated.View
                    key={row.block.id}
                    entering={
                      reduceMotion
                        ? undefined
                        : FadeInDown.delay(staggerDelay(index)).duration(DURATIONS.base)
                    }
                  >
                    <UpNextRow row={row} />
                  </Animated.View>
                ))}
              </View>
            </Animated.View>
          )}

          {/* Needs attention (FR-16 / §8.6): the calm missed-work surface.
              Renders nothing (incl. its own spacing) when nothing is missed. */}
          <NeedsAttention />

          {/* Ready for tomorrow (FR-90), additive, leans in during the evening
              or whenever tomorrow already has a plan to preview. */}
          {showTomorrowPlan && (
            <Animated.View entering={cardEntering}>
              <TomorrowPlanCard />
            </Animated.View>
          )}

          {/* Projects: a prominent, always-present entry into the projects hub
              (doc 10). Purple stays here only. */}
          <Animated.View entering={cardEntering}>
            <ProjectsEntryCard />
          </Animated.View>

          {/* Zero tasks: keep the existing empty-state behaviour. */}
          {comingUp.length === 0 && (
            <Animated.View entering={cardEntering}>
              <EmptyState
                title="You're all caught up"
                subtitle="Nothing on deck right now. Add a task and your first move will show up here."
                icon="sunny-outline"
                actionLabel="Add a task"
                onAction={() => router.push("/task/new")}
              />
            </Animated.View>
          )}

          {/* Ghost escape hatch, always available, never shames. */}
          <PressableScale
            onPress={() => router.push("/blindfold")}
            haptic="light"
            className="h-11 items-center justify-center"
            accessibilityRole="button"
            accessibilityLabel="I'm overwhelmed"
            accessibilityHint="Opens one calm step at a time"
          >
            <Text variant="bodyMedium" className="text-ink-secondary">
              I&apos;m overwhelmed
            </Text>
          </PressableScale>
        </View>
      </ScrollView>

      <FAB onPress={() => router.push("/task/new")} />
    </View>
  );
}
