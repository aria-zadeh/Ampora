/**
 * Focus tab, the LOCK surface (doc `design/DECISION_SPEC` D1).
 *
 * The tab IS the lock, not a launcher into it: `FocusHeroCard` is a
 * three-state session composer (idle / armed / active) that always answers,
 * in order, what am I working on, what is on the line, for how long. This
 * screen owns the surrounding sections (scheduled locks, "Up next", and the
 * footer trust line) plus the ONE `StakeSetupSheet` shared by every "More
 * options"/"Edit" entry point on the tab, so there is never more than one
 * sheet instance competing to arm the same stake.
 *
 * `mode` (idle/armed/active) is computed ONCE here from the same
 * `stakesStore`/`sessionStore` reads the surrounding sections also need
 * (whether to show "Scheduled locks", whether to hide "Up next"), so the tab
 * and its hero card can never read the state differently from each other.
 */

import React, { useCallback, useMemo, useState } from "react";
import { View, ScrollView } from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import Animated, { FadeIn, FadeInDown } from "react-native-reanimated";

import { useTaskStore } from "@/store/taskStore";
import { useSessionStore } from "@/store/sessionStore";
import { useSettingsStore } from "@/store/settingsStore";
import { useStakesStore } from "@/store/stakesStore";
import { Text } from "@/components/ui/Text";
import { Heading } from "@/components/ui/Heading";
import { EmptyState } from "@/components/ui/EmptyState";
import { PressableScale } from "@/components/ui/PressableScale";
import { FocusHeroCard } from "@/components/focus/FocusHeroCard";
import { ScheduledStakeRow } from "@/components/focus/ScheduledStakeRow";
import { FocusTaskRow } from "@/components/focus/FocusTaskRow";
import { StakeSetupSheet, type ArmedStake } from "@/components/stakes/StakeSetupSheet";
import { ShieldStatusCard } from "@/components/stakes/ShieldStatusCard";
import { DURATIONS, staggerDelay } from "@/utils/motion";
import { useReduceMotion } from "@/hooks/useReduceMotion";
import type { Task } from "@/types";

/**
 * Focus priority: tasks with a due date first (soonest first), then by
 * priority (4=Urgent highest), then newest. Matches the home screen's
 * "coming up" intent so "next task" is predictable. Unchanged from before
 * the rebuild.
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

/** "1h 30m" / "45m" style label for a minutes value (mirrors `components/settings/SettingsPrimitives.tsx#formatMinutes`, duplicated locally rather than importing a settings-package helper into a tab screen). */
function formatCapMinutes(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}

/**
 * How far out a scheduled stake may be before it takes over the hero as
 * "armed" (state b). Further out than this, the composer stays idle and the
 * schedule lives only in the "Scheduled locks" list, so a lock hours or days
 * away never hijacks the tab for the rest of the day.
 */
const ARMED_HERO_WINDOW_MS = 60 * 60_000;

/** "11:00 PM" 12-hour label for a minutes-from-midnight value. */
function formatQuietHourClock(minutesFromMidnight: number): string {
  const d = new Date();
  d.setHours(Math.floor(minutesFromMidnight / 60) % 24, minutesFromMidnight % 60, 0, 0);
  try {
    return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  } catch {
    const h = d.getHours();
    const m = d.getMinutes();
    const hh = ((h + 11) % 12) + 1;
    const ap = h < 12 ? "AM" : "PM";
    return `${hh}:${String(m).padStart(2, "0")} ${ap}`;
  }
}

export default function FocusScreen() {
  const reduceMotion = useReduceMotion();

  const tasks = useTaskStore((s) => s.tasks);
  // Scalar selects, not the raw session objects: `accrueFocus`/`sessionTick`
  // replace `activeSession`/`active`'s whole identity every second a session
  // runs, and this screen (with its full task list beneath the hero) is far
  // too big a tree to re-render on that cadence for a value that is really
  // just "which task, if any". `FocusHeroCard` peeks the live object itself,
  // at a much slower cadence, only while it actually needs one.
  const activeStakeTaskId = useStakesStore((s) => s.activeSession?.taskId ?? null);
  const sessionActiveTaskId = useSessionStore((s) => s.active?.taskId ?? null);
  const scheduledStakesMap = useStakesStore((s) => s.scheduledStakes);
  const dailyLockCapMin = useSettingsStore((s) => s.settings.dailyLockCapMin);
  const quietHours = useSettingsStore((s) => s.settings.quietHours);

  const focusable = useMemo(
    () =>
      Object.values(tasks)
        .filter((t) => t.status !== "done")
        .sort(sortForFocus),
    [tasks]
  );

  // The composer's chosen task (state a). Falls back to the next-task pick
  // whenever nothing is explicitly selected yet, or the prior pick no longer
  // exists (completed/deleted), same "next task" logic the old launcher used.
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const effectiveSelectedTaskId =
    selectedTaskId && tasks[selectedTaskId] ? selectedTaskId : (focusable[0]?.id ?? null);

  // Session running (state c): a live stake wins over a merely-resumable
  // unstaked session (the stake is the more urgent case, apps are locked
  // right now), matching `GlobalLockBanner`'s own priority.
  const runningTaskId = activeStakeTaskId ?? sessionActiveTaskId ?? null;

  // Nearest FUTURE scheduled stake. A stale (past-due) row is never chosen
  // here, the auto-arm driver owns those, and picking one would render a
  // countdown stuck at "in 0 min" while it catches up.
  const earliestScheduled = useMemo(() => {
    const now = Date.now();
    const list = Object.values(scheduledStakesMap).filter((s) => s.scheduledAt != null && s.scheduledAt > now);
    if (list.length === 0) return null;
    return list.reduce((min, s) => ((s.scheduledAt as number) < (min.scheduledAt as number) ? s : min));
  }, [scheduledStakesMap]);

  // The scheduled stake actually shown in the armed hero: only when it is
  // due soon enough (D1 state b), never merely because one exists. Further
  // out, the composer stays idle and the schedule only lives in the
  // "Scheduled locks" list below.
  const heroScheduled = useMemo(() => {
    if (!earliestScheduled) return null;
    return (earliestScheduled.scheduledAt as number) - Date.now() <= ARMED_HERO_WINDOW_MS ? earliestScheduled : null;
  }, [earliestScheduled]);

  const mode: "idle" | "armed" | "active" = runningTaskId ? "active" : heroScheduled ? "armed" : "idle";

  // "Scheduled locks" section: every OTHER scheduled stake beyond the one
  // actually shown in the armed hero. Excluded ONLY when the hero is
  // actually showing it, a stake further out than the hero window must
  // still be visible somewhere or it silently disappears from the tab.
  const otherScheduled = useMemo(
    () => Object.values(scheduledStakesMap).filter((s) => s.id !== heroScheduled?.id),
    [scheduledStakesMap, heroScheduled]
  );

  // The one `StakeSetupSheet` instance for the whole tab. "More options"
  // (idle hero) and "Edit" (armed hero plus every "Scheduled locks" row) all
  // open it for a task id; "Edit" also supplies the scheduled stake's own id
  // so the sheet seeds from it and replaces it in place (`existing`) rather
  // than the row being cancelled up front.
  const [setupTaskId, setSetupTaskId] = useState<string | null>(null);
  const [setupExistingId, setSetupExistingId] = useState<string | null>(null);
  const setupTask = setupTaskId ? tasks[setupTaskId] : undefined;
  const setupExisting = setupExistingId ? scheduledStakesMap[setupExistingId] : undefined;

  const handleOpenSetup = useCallback((taskId: string, existingScheduledId?: string) => {
    setSetupExistingId(existingScheduledId ?? null);
    setSetupTaskId(taskId);
  }, []);

  const handleCloseSetup = useCallback(() => {
    setSetupTaskId(null);
    setSetupExistingId(null);
  }, []);

  const handleArm = useCallback((armed: ArmedStake) => {
    router.push({
      pathname: "/focus/session",
      params: {
        taskId: armed.taskId,
        stakeHold: armed.hold,
        stakeTrigger: armed.trigger,
        stakeVerification: armed.verification,
        ...(armed.sessionMin != null ? { stakeSessionMin: String(armed.sessionMin) } : {}),
        ...(armed.fromScheduledId ? { fromScheduledId: armed.fromScheduledId } : {}),
      },
    });
  }, []);

  const enter = reduceMotion ? undefined : FadeIn.duration(DURATIONS.slow);
  // "Scheduled locks" hides once a session is active (D1 state c: only the
  // footer survives beneath the hero); "Up next" does not, see the render below.
  const showScheduledSection = mode !== "active";
  const showEmpty = mode === "idle" && focusable.length === 0;

  return (
    <SafeAreaView className="flex-1 bg-neutral-100" edges={[]}>
      <ScrollView
        className="flex-1"
        contentContainerClassName="px-6 pb-28"
        showsVerticalScrollIndicator={false}
      >
        {/* Header. 28pt/h1 (2026-08-26 Figma re-measure, `ignition-lock.pdf`'s
            own screen title sits at this size at the same x=24 inset) —
            matches every other top-level screen title's weight, up from the
            previous h3. Copy stays "Focus", not the mock's "Ignition Mode". */}
        <Animated.View entering={enter} className="pt-6 pb-1">
          <Heading size="h1">Focus</Heading>
        </Animated.View>

        <Animated.View
          entering={reduceMotion ? undefined : FadeInDown.duration(DURATIONS.base)}
          className="mt-5"
        >
          {showEmpty ? (
            <>
              <ShieldStatusCard />
              <View className="mt-group">
                <EmptyState
                  title="Nothing to focus on yet"
                  subtitle="Add a task to begin a session."
                  icon="timer-outline"
                  actionLabel="Add a task"
                  onAction={() => router.push("/task/new")}
                />
              </View>
            </>
          ) : (
            <FocusHeroCard
              mode={mode}
              tasks={focusable}
              selectedTaskId={effectiveSelectedTaskId}
              onSelectTask={setSelectedTaskId}
              runningTaskId={mode === "active" ? runningTaskId : null}
              scheduledStake={heroScheduled}
              onOpenSetup={handleOpenSetup}
            />
          )}
        </Animated.View>

        {/* "What's locked": always-visible shield preview (Aria: "the app
            blocking feature is not shown that much"). Hidden once a session
            is actually running — FocusHeroCard's own active-mode banner
            already states the lock subject prominently there. */}
        {showScheduledSection && (
          <Animated.View
            entering={reduceMotion ? undefined : FadeInDown.duration(DURATIONS.base)}
            className="mt-group"
          >
            <Heading size="h4" className="mb-3">
              What&apos;s locked
            </Heading>
            <ShieldStatusCard />
          </Animated.View>
        )}

        {/* Scheduled locks: every OTHER scheduled stake beyond the one the hero shows. */}
        {showScheduledSection && otherScheduled.length > 0 && (
          <Animated.View
            entering={reduceMotion ? undefined : FadeInDown.duration(DURATIONS.base)}
            className="mt-group"
          >
            <Heading size="h4" className="mb-3">
              Scheduled locks
            </Heading>
            <View className="gap-2.5">
              {otherScheduled.map((s) => (
                <ScheduledStakeRow key={s.id} session={s} task={tasks[s.taskId]} onEdit={handleOpenSetup} />
              ))}
            </View>
          </Animated.View>
        )}

        {/* Up next, max 4. Stays visible even during an active session
            (selection still works after it ends); only the scheduled-locks
            section hides in active mode. Tap selects into the hero, never
            navigates. */}
        {focusable.length > 0 && (
          <Animated.View
            entering={reduceMotion ? undefined : FadeInDown.duration(DURATIONS.base)}
            className="mt-group"
          >
            <Heading size="h4" className="mb-3">
              Up next
            </Heading>
            <View className="gap-2.5">
              {focusable.slice(0, 4).map((task, index) => (
                <Animated.View
                  key={task.id}
                  entering={
                    reduceMotion
                      ? undefined
                      : FadeInDown.delay(staggerDelay(index)).duration(DURATIONS.base)
                  }
                >
                  <FocusTaskRow
                    task={task}
                    selected={task.id === effectiveSelectedTaskId}
                    onPress={() => setSelectedTaskId(task.id)}
                  />
                </Animated.View>
              ))}
            </View>
          </Animated.View>
        )}

        {/* Footer trust line, always present, even in the active state (D1). */}
        <PressableScale
          onPress={() => router.navigate("/profile")}
          haptic="light"
          className="mt-group min-h-11 items-center justify-center px-2 py-2"
          accessibilityRole="button"
          accessibilityLabel="You set the limits. Open stakes settings"
        >
          <Text variant="caption" className="text-neutral-500 text-center">
            {`You set the limits · ${formatCapMinutes(dailyLockCapMin)} daily cap · Quiet hours ${formatQuietHourClock(
              quietHours.start
            )} to ${formatQuietHourClock(quietHours.end)}`}
          </Text>
        </PressableScale>
      </ScrollView>

      {setupTask && (
        <StakeSetupSheet
          visible
          task={setupTask}
          existing={setupExisting}
          onClose={handleCloseSetup}
          onArm={handleArm}
        />
      )}
    </SafeAreaView>
  );
}
