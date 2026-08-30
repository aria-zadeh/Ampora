/**
 * FocusHeroCard, the Focus tab's three-state lock composer (doc
 * `design/DECISION_SPEC` D1). The tab's hero surface: white, radius 26. The
 * source design has no shadows anywhere (docs/02); this surface keeps its
 * lift with a `border-line` hairline instead of the old `shadows.lg`.
 *
 * Three states, driven by `mode` (computed by the caller from the same
 * `stakesStore`/`sessionStore` reads `app/(tabs)/focus.tsx` also needs for its
 * "Scheduled locks"/"Up next" sections, so there is exactly one source of
 * truth for which state is showing):
 *
 *   (a) idle. The composer: pick a task, choose what's on the line, choose a
 *       length, then either lock in or start unstaked.
 *   (b) armed. A stake is scheduled but not yet running: countdown to the
 *       arm moment, start now, edit, or cancel.
 *   (c) active. A session (staked or not) is already running: return to it,
 *       or unlock early when staked.
 *
 * Start wiring reuses the exact routing shape `app/task/[id].tsx#handleArmStake`
 * already uses (`/focus/session` plus `stakeHold`/`stakeTrigger`/
 * `stakeVerification`/`stakeSessionMin` params). The session screen arms the
 * stake itself on mount via `stakesStore.startStake`, so every wellbeing gate
 * still applies at lock time, never here. Nothing here calls `startStake`
 * directly.
 *
 * "Lock state sticky, on after first armed stake" (D1): `lockOn` is a plain
 * derived value (`useMemo`), not a persisted field. It is true once the user
 * has BOTH chosen something to lock AND armed a real stake at least once
 * before. Before that first real arm, the quick primary stays conservative
 * ("Start focus") even if apps happen to be selected, so a first-time visitor
 * is never surprised into locking from a quick tap. "More options" always
 * offers the full, explicit path to that first arm.
 *
 * RENDER DISCIPLINE: `stakesStore.accrueFocus`/`sessionStore.tick` replace
 * `activeSession`/`active`'s whole object identity every second a session
 * runs. This card (and its `focus.tsx` parent) never hook-subscribes to
 * either object directly, only to scalars derived from them, so neither
 * re-renders on that 1Hz cadence. The "active" state's live fields are
 * PEEKED via `getState()` instead, refreshed on the same slow local tick
 * used for the armed/active countdowns below (or immediately when `mode`
 * itself changes), never on the store's own per-second cadence.
 */

import React, { useEffect, useMemo, useState } from "react";
import { View, Modal, Pressable, ScrollView } from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Animated, { FadeIn, FadeInUp } from "react-native-reanimated";
import { useShallow } from "zustand/react/shallow";

import { Text } from "@/components/ui/Text";
import { Heading } from "@/components/ui/Heading";
import { PressableScale } from "@/components/ui/PressableScale";
import { AppPicker } from "@/components/stakes/AppPicker";
import { PanicValveSheet } from "@/components/stakes/PanicValveSheet";
import { REFUSAL_COPY } from "@/components/stakes/StakeSetupSheet";
import { FocusTaskRow } from "@/components/focus/FocusTaskRow";
import { lockSubjectSummary } from "@/components/focus/ScheduledStakeRow";
import { useTaskStore } from "@/store/taskStore";
import { useListStore } from "@/store/listStore";
import { useSessionStore } from "@/store/sessionStore";
import { useSettingsStore } from "@/store/settingsStore";
import {
  useStakesStore,
  selectEligibleApps,
  selectStakeSelection,
  type StartStakeRefusal,
} from "@/store/stakesStore";
import { computeDurationMin } from "@/core/task-logic";
import { iconSizes, tabularNums } from "@/utils/design-tokens";
import { DURATIONS } from "@/utils/motion";
import { useReduceMotion } from "@/hooks/useReduceMotion";
import { useThemeColors } from "@/hooks/useThemeColors";
import type { StakeSession, Task } from "@/types";

/** Quick-lock length presets (D1: "15 . 25 . 45", 45 default). Within `SESSION_MIN_BOUNDS` (15..50). */
const LENGTH_PRESETS = [15, 25, 45] as const;
/** How often the armed/active countdowns re-derive on their own, mirroring `LockBanner`'s self-ticking pattern. */
const TICK_MS = 30_000;

/** "3:30 PM" style label, with a plain fallback if Intl is unavailable. */
function formatClockTime(atMs: number): string {
  try {
    return new Date(atMs).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  } catch {
    const d = new Date(atMs);
    const h = d.getHours();
    const m = d.getMinutes();
    const hh = ((h + 11) % 12) + 1;
    const ap = h < 12 ? "AM" : "PM";
    return `${hh}:${String(m).padStart(2, "0")} ${ap}`;
  }
}

/** "45 min . History . 4 steps", omitting any part that doesn't apply. */
function taskMetaLine(task: Task, listName: string | undefined): string {
  const parts: string[] = [];
  const min = computeDurationMin(task);
  if (min > 0) parts.push(`${min} min`);
  if (listName) parts.push(listName);
  if (task.subtasks.length > 0) parts.push(`${task.subtasks.length} steps`);
  return parts.join(" · ");
}

export interface FocusHeroCardProps {
  mode: "idle" | "armed" | "active";
  /** Focusable tasks, sorted, the same order "Up next" renders, for the bottom-sheet picker. */
  tasks: Task[];
  /** The composer's selected task id (state a only). */
  selectedTaskId: string | null;
  onSelectTask: (taskId: string) => void;
  /** The task id currently running (state c): a stake's task, or an unstaked resumable session's task. */
  runningTaskId: string | null;
  /** The scheduled stake driving state (b). */
  scheduledStake: StakeSession | null;
  /**
   * Open `StakeSetupSheet` for a task. "More options" (idle) calls this with
   * just a task id, for the usual fresh sheet. "Edit" (armed) also passes the
   * scheduled stake's own id, so the sheet seeds from it and replaces it in
   * place instead of the caller destroying it up front.
   */
  onOpenSetup: (taskId: string, existingScheduledId?: string) => void;
}

export function FocusHeroCard({
  mode,
  tasks,
  selectedTaskId,
  onSelectTask,
  runningTaskId,
  scheduledStake,
  onOpenSetup,
}: FocusHeroCardProps) {
  const reduceMotion = useReduceMotion();
  const theme = useThemeColors();

  const allTasks = useTaskStore((s) => s.tasks);
  const lists = useListStore((s) => s.lists);
  const singleSessionCapMin = useSettingsStore((s) => s.settings.singleSessionCapMin);

  const cancelScheduledStake = useStakesStore((s) => s.cancelScheduledStake);
  const canStartStake = useStakesStore((s) => s.canStartStake);
  const selection = useStakesStore(selectStakeSelection);
  const eligibleApps = useStakesStore(useShallow(selectEligibleApps));
  // Scalar: whether ANY stake has ever been armed, not the sessions record
  // itself. `accrueFocus` replaces that whole record's identity every second
  // a session runs, and hook-selecting it directly re-rendered this whole
  // card on that cadence for a value that only ever flips once, ever.
  const everArmedBefore = useStakesStore((s) => Object.keys(s.sessions).length > 0);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [appPickerOpen, setAppPickerOpen] = useState(false);
  const [panicOpen, setPanicOpen] = useState(false);
  const [lengthMin, setLengthMin] = useState<number>(45);
  const [now, setNow] = useState(() => Date.now());
  const [primaryRefusal, setPrimaryRefusal] = useState<StartStakeRefusal | null>(null);

  // Self-ticking, mirroring LockBanner's own pattern. Only while there is
  // something live to tick (no timer running in idle mode).
  useEffect(() => {
    if (mode === "idle") return;
    const id = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(id);
  }, [mode]);

  // The running stake, PEEKED rather than subscribed (see the file doc
  // comment's "RENDER DISCIPLINE" note): only needed in "active" mode,
  // refreshed on the slow local tick above or immediately when `mode`/
  // `runningTaskId` change, never on the store's own 1Hz cadence.
  const activeStakeSnapshot = useMemo<StakeSession | null>(() => {
    if (mode !== "active") return null;
    const stake = useStakesStore.getState().activeSession;
    return stake && stake.taskId === runningTaskId ? stake : null;
  }, [mode, runningTaskId, now]);

  const selectedTask = selectedTaskId ? allTasks[selectedTaskId] : undefined;
  const scheduledTask = scheduledStake ? allTasks[scheduledStake.taskId] : undefined;
  const activeTask = runningTaskId ? allTasks[runningTaskId] : undefined;

  // What's on the line right now: one global selection (not per-stake, the
  // same simplification LockBanner/GlobalLockBanner already make), so the
  // same derived subject is correct to reuse across all three states.
  const subject = useMemo(() => {
    const namedApps = eligibleApps.filter((a) => !!a.label);
    return lockSubjectSummary(namedApps, selection?.count ?? 0);
  }, [eligibleApps, selection]);

  const hasSelectionTokens = useMemo(() => {
    if (!selection) return false;
    const tokenCount =
      selection.applicationTokens.length + selection.categoryTokens.length + selection.webDomainTokens.length;
    return tokenCount > 0 || selection.count > 0;
  }, [selection]);

  const lockOn = hasSelectionTokens && everArmedBefore;

  // Clear a shown refusal once something plausibly resolves it, mirroring
  // StakeSetupSheet's own refusal-clearing effect (never leave a stale
  // reason on screen).
  useEffect(() => {
    setPrimaryRefusal(null);
  }, [selectedTaskId, mode]);

  // ---------------------------------------------------------------------------
  // Routing. Reuses the exact shape app/task/[id].tsx#handleArmStake uses.
  // ---------------------------------------------------------------------------

  const startUnstaked = (taskId: string) => {
    router.push({ pathname: "/focus/session", params: { taskId } });
  };

  const startStaked = (
    taskId: string,
    hold: StakeSession["hold"],
    verification: StakeSession["verification"],
    sessionMin?: number,
    fromScheduledId?: string
  ) => {
    router.push({
      pathname: "/focus/session",
      params: {
        taskId,
        stakeHold: hold,
        stakeTrigger: "manual",
        stakeVerification: verification,
        ...(sessionMin != null ? { stakeSessionMin: String(sessionMin) } : {}),
        ...(fromScheduledId ? { fromScheduledId } : {}),
      },
    });
  };

  const handlePrimary = () => {
    if (!selectedTask) return;
    if (!lockOn) {
      startUnstaked(selectedTask.id);
      return;
    }
    // Never navigate on a silent refusal (doc `04` §9.10): run the same
    // pre-flight StakeSetupSheet runs, and show the reason right here
    // instead of only discovering it once the session screen mounts.
    const preflight = canStartStake();
    if (!preflight.ok) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
      setPrimaryRefusal(preflight.reason);
      return;
    }
    setPrimaryRefusal(null);
    startStaked(selectedTask.id, "session", "focus_time", lengthMin);
  };

  const handleStartWithoutLocking = () => {
    if (selectedTask) startUnstaked(selectedTask.id);
  };

  const handleStartNow = () => {
    if (!scheduledStake) return;
    // Do NOT cancel first: `startStake`'s `fromScheduledId` consumes this
    // row atomically, only once the arm actually succeeds, so a refusal
    // (already_active/quiet_hours/cap_reached/paused) leaves the schedule
    // intact instead of silently destroying it.
    startStaked(
      scheduledStake.taskId,
      scheduledStake.hold,
      scheduledStake.verification,
      scheduledStake.sessionMin,
      scheduledStake.id
    );
  };

  const handleEditScheduled = () => {
    if (!scheduledStake) return;
    // Do NOT cancel here either: StakeSetupSheet seeds from `existing` and
    // replaces it atomically on a successful Confirm, so dismissing the
    // sheet (or a refused Confirm) leaves this scheduled stake untouched.
    onOpenSetup(scheduledStake.taskId, scheduledStake.id);
  };

  const handleCancelScheduled = () => {
    if (scheduledStake) cancelScheduledStake(scheduledStake.id);
  };

  const handleReturnToSession = () => {
    if (runningTaskId) router.push({ pathname: "/focus/session", params: { taskId: runningTaskId } });
  };

  // ---------------------------------------------------------------------------
  // Live minutes-left. Mirrors LockBanner's own formula for a staked session,
  // and falls back to the plain (unstaked) live session's own planned length
  // when there's no stake to read.
  // ---------------------------------------------------------------------------

  const minutesLeftLabel = useMemo(() => {
    let min: number | null = null;
    if (activeStakeSnapshot) {
      if (activeStakeSnapshot.hold === "until_done") {
        const elapsedSec =
          activeStakeSnapshot.startedAt != null ? Math.max(0, (now - activeStakeSnapshot.startedAt) / 1000) : 0;
        min = Math.max(0, Math.ceil(Math.max(0, singleSessionCapMin * 60 - elapsedSec) / 60));
      } else {
        const requiredSec = (activeStakeSnapshot.sessionMin ?? 0) * 60;
        const servedSec = activeStakeSnapshot.focusSec ?? 0;
        min = Math.max(0, Math.ceil(Math.max(0, requiredSec - servedSec) / 60));
      }
    } else if (mode === "active") {
      // Unstaked resumable session: same peek-not-subscribe reasoning as
      // `activeStakeSnapshot` above (`sessionStore.tick` replaces `active`'s
      // identity every second it runs).
      const live = useSessionStore.getState().active;
      if (live && live.taskId === runningTaskId) {
        min = Math.max(0, Math.ceil(Math.max(0, live.plannedMin * 60 - live.elapsedSec) / 60));
      }
    }
    if (min == null) return "";
    return min === 1 ? "1 min left" : `${min} min left`;
  }, [activeStakeSnapshot, mode, runningTaskId, now, singleSessionCapMin]);

  const scheduledTimeLabel = scheduledStake?.scheduledAt != null ? formatClockTime(scheduledStake.scheduledAt) : "";
  const countdownMin =
    scheduledStake?.scheduledAt != null ? Math.max(0, Math.round((scheduledStake.scheduledAt - now) / 60_000)) : 0;

  const selectedListName = selectedTask?.listId ? lists[selectedTask.listId]?.name : undefined;

  return (
    <View className="rounded-3xl border border-line bg-white p-5">
      {mode === "active" && (
        <View accessibilityRole="summary" accessibilityLabel="Session running">
          {/* The "active lock" banner (2026-08-26 Figma re-measure,
              `ignition-lock.pdf`): full-tint surface + border, icon leading a
              title/detail column, in place of the plain text block this used
              to be. Same information, no information dropped — just carrying
              the app's own copy (never the mock's "Active Shielding") in the
              banner's visual language. */}
          <View className="flex-row items-start gap-3 rounded-3xl border border-primary-500 bg-primary-100 p-4">
            <Ionicons name="lock-closed-outline" size={iconSizes.md} color={theme.primaryLight} />
            <View className="flex-1">
              <Text variant="overline" className="text-neutral-600">
                Session running
              </Text>
              <Text variant="h3" className="mt-1 text-neutral-900" numberOfLines={2}>
                {activeTask?.title ?? "Focus session"}
              </Text>
              {minutesLeftLabel !== "" && (
                <Text variant="captionMedium" className="mt-1 text-neutral-600" style={tabularNums}>
                  {minutesLeftLabel}
                </Text>
              )}
              {activeStakeSnapshot && subject && (
                <View className="flex-row items-center mt-1.5">
                  <Ionicons name="lock-closed-outline" size={iconSizes.xs} color={theme.textSecondary} />
                  <Text variant="caption" className="ml-1.5 text-neutral-600" numberOfLines={1}>
                    {`${subject} locked`}
                  </Text>
                </View>
              )}
            </View>
          </View>

          {/* min-h-13 (56px): the "primary CTA" tier (52px measured) has no
              scale step (jumps 48 -> 56), so this rounds up rather than
              reintroducing an arbitrary bracket. Recommend adding
              spacing["13"] = "52px" centrally, then switching to min-h-13. */}
          <PressableScale
            onPress={handleReturnToSession}
            haptic="medium"
            className="mt-5 min-h-13 items-center justify-center rounded-md bg-primary-600"
            accessibilityRole="button"
            accessibilityLabel="Return to session"
          >
            <Text variant="h4" className="text-primary-foreground">
              Return to session
            </Text>
          </PressableScale>

          {activeStakeSnapshot && (
            <>
              {/* The valve, restyled as its own quiet full-width button
                  (`ignition-lock.pdf`'s "Activate Panic Valve") rather than a
                  bare text link — same action, same copy ("Unlock early" is
                  the app's own, kept rather than the mock's wording). */}
              <PressableScale
                onPress={() => setPanicOpen(true)}
                haptic="light"
                className="mt-3 min-h-11 items-center justify-center rounded-lg border border-line bg-surface-ghost"
                accessibilityRole="button"
                accessibilityLabel="Unlock early"
                accessibilityHint="Opens a 30 second breather before your apps come back"
              >
                <Text variant="bodyMedium" className="text-neutral-900">
                  Unlock early
                </Text>
              </PressableScale>
              <Text variant="caption" className="mt-2 text-center text-neutral-500">
                Opens a 30 second breather before your apps come back.
              </Text>
            </>
          )}
        </View>
      )}

      {mode === "armed" && scheduledStake && (
        <View accessibilityRole="summary" accessibilityLabel="Scheduled lock">
          <Text variant="overline" className="text-neutral-500">
            Scheduled lock
          </Text>
          <Text variant="h3" className="mt-2 text-neutral-900">
            {`Locks at ${scheduledTimeLabel}`}
          </Text>
          <Text variant="captionMedium" className="mt-1 text-neutral-500" style={tabularNums}>
            {`in ${countdownMin} min`}
          </Text>

          <View className="mt-4">
            <Text variant="bodyMedium" className="text-neutral-800" numberOfLines={1}>
              {scheduledTask?.title ?? "Untitled task"}
            </Text>
            <View className="flex-row items-center mt-1.5">
              <Ionicons name="lock-closed-outline" size={iconSizes.xs} color={theme.textSecondary} />
              <Text variant="caption" className="ml-1.5 text-neutral-500" numberOfLines={1}>
                {subject ?? "Choose what to lock"}
              </Text>
            </View>
          </View>

          <PressableScale
            onPress={handleStartNow}
            haptic="medium"
            className="mt-5 min-h-13 items-center justify-center rounded-md bg-primary-600"
            accessibilityRole="button"
            accessibilityLabel="Start now"
          >
            <Text variant="h4" className="text-primary-foreground">
              Start now
            </Text>
          </PressableScale>

          <View className="mt-3 flex-row justify-center gap-8">
            <PressableScale
              onPress={handleEditScheduled}
              haptic="light"
              className="min-h-11 px-2 items-center justify-center"
              accessibilityRole="button"
              accessibilityLabel="Edit this scheduled lock"
            >
              <Text variant="bodyMedium" className="text-neutral-500">
                Edit
              </Text>
            </PressableScale>
            <PressableScale
              onPress={handleCancelScheduled}
              haptic="light"
              className="min-h-11 px-2 items-center justify-center"
              accessibilityRole="button"
              accessibilityLabel="Cancel lock"
              accessibilityHint="Cancels instantly, no confirmation"
            >
              <Text variant="bodyMedium" className="text-neutral-500">
                Cancel lock
              </Text>
            </PressableScale>
          </View>
        </View>
      )}

      {mode === "idle" && (
        <View>
          <Text variant="overline" className="text-neutral-500">
            Focus session
          </Text>

          {/* Task row: what am I working on. */}
          <PressableScale
            onPress={() => setPickerOpen(true)}
            haptic="light"
            className="mt-3 flex-row items-center rounded-xl bg-raised px-4 py-3"
            accessibilityRole="button"
            accessibilityLabel={
              selectedTask ? `Task: ${selectedTask.title}. ${taskMetaLine(selectedTask, selectedListName)}` : "Choose a task"
            }
            accessibilityHint="Opens a list to choose a different task"
          >
            <View className="flex-1 pr-3">
              <Text variant="bodyMedium" className="text-neutral-900" numberOfLines={1}>
                {selectedTask?.title ?? "Choose a task"}
              </Text>
              {selectedTask && (
                <Text
                  variant="caption"
                  className="text-neutral-500 mt-0.5"
                  numberOfLines={1}
                  style={tabularNums}
                >
                  {taskMetaLine(selectedTask, selectedListName)}
                </Text>
              )}
            </View>
            <Ionicons name="chevron-forward" size={iconSizes.sm} color={theme.textMuted} />
          </PressableScale>

          {/* On the line: what is at stake. */}
          <PressableScale
            onPress={() => setAppPickerOpen(true)}
            haptic="light"
            className="mt-2.5 flex-row items-center rounded-xl bg-raised px-4 py-3"
            accessibilityRole="button"
            accessibilityLabel={subject ? `On the line: ${subject}` : "Choose what to lock"}
            accessibilityHint="Opens the app picker"
          >
            <Ionicons name="lock-closed-outline" size={iconSizes.sm} color={theme.textSecondary} />
            <Text variant="bodyMedium" className="flex-1 ml-2.5 text-neutral-900" numberOfLines={1}>
              {subject ?? "Choose what to lock"}
            </Text>
            <Ionicons name="chevron-forward" size={iconSizes.sm} color={theme.textMuted} />
          </PressableScale>

          {/* Length: for how long. */}
          <View className="mt-4 flex-row items-center justify-between">
            <View className="flex-row gap-2">
              {LENGTH_PRESETS.map((min) => {
                const isSelected = lengthMin === min;
                return (
                  <PressableScale
                    key={min}
                    onPress={() => setLengthMin(min)}
                    haptic="selection"
                    className={`min-h-11 px-4 rounded-full items-center justify-center ${
                      isSelected ? "bg-primary-600" : "bg-raised"
                    }`}
                    accessibilityRole="button"
                    accessibilityLabel={`${min} minutes`}
                    accessibilityState={{ selected: isSelected }}
                  >
                    <Text
                      variant="captionMedium"
                      className={isSelected ? "text-primary-foreground" : "text-neutral-600"}
                      style={tabularNums}
                    >
                      {min}
                    </Text>
                  </PressableScale>
                );
              })}
            </View>
            <PressableScale
              onPress={() => selectedTask && onOpenSetup(selectedTask.id)}
              haptic="light"
              disabled={!selectedTask}
              className="min-h-11 px-2 items-center justify-center"
              accessibilityRole="button"
              accessibilityLabel="More options"
              accessibilityHint="Opens hold, schedule, and verification settings"
            >
              <Text variant="captionMedium" className="text-neutral-500">
                More options
              </Text>
            </PressableScale>
          </View>

          {/* Refusal, calm and specific, never silent (doc `04` §9.10). Icon
              plus words, never colour alone. Mirrors StakeSetupSheet's own
              refusal block so the wording matches wherever a stake refuses. */}
          {primaryRefusal && (
            <View
              className="mt-3 flex-row items-start gap-2 rounded-lg bg-warning-100 px-3 py-2.5"
              accessibilityRole="alert"
            >
              <Ionicons name="information-circle-outline" size={iconSizes.xs} color={theme.warningStrong} />
              <Text variant="caption" className="flex-1 text-warning-700">
                {REFUSAL_COPY[primaryRefusal]}
              </Text>
            </View>
          )}

          {/* Primary: always blue, never green (D3, colour of what's about to happen). */}
          <PressableScale
            onPress={handlePrimary}
            haptic="medium"
            disabled={!selectedTask}
            className={`mt-5 min-h-13 items-center justify-center rounded-md bg-primary-600 ${
              !selectedTask ? "opacity-50" : ""
            }`}
            accessibilityRole="button"
            accessibilityLabel={lockOn ? `Lock in, ${lengthMin} minutes` : "Start focus"}
          >
            <Text variant="h4" className="text-primary-foreground">
              {lockOn ? `Lock in · ${lengthMin} min` : "Start focus"}
            </Text>
          </PressableScale>

          {/* Redundant with the primary once it already reads "Start focus"
              (lockOn false): the two buttons would do the exact same thing,
              so only show this when the primary is the STAKED "Lock in". */}
          {lockOn && (
            <PressableScale
              onPress={handleStartWithoutLocking}
              haptic="light"
              disabled={!selectedTask}
              className={`mt-2 min-h-11 items-center justify-center ${!selectedTask ? "opacity-50" : ""}`}
              accessibilityRole="button"
              accessibilityLabel="Start without locking"
            >
              <Text variant="bodyMedium" className={!selectedTask ? "text-neutral-400" : "text-neutral-500"}>
                Start without locking
              </Text>
            </PressableScale>
          )}
        </View>
      )}

      {/* Bottom-sheet task picker, built from FocusTaskRow. Selecting swaps
          the composer's row, never navigates (D1). */}
      <Modal
        visible={pickerOpen}
        transparent
        animationType={reduceMotion ? "fade" : "slide"}
        onRequestClose={() => setPickerOpen(false)}
        accessibilityViewIsModal
      >
        <Pressable
          className="flex-1 bg-black/40"
          onPress={() => setPickerOpen(false)}
          accessibilityRole="button"
          accessibilityLabel="Dismiss"
        >
          <View className="flex-1 justify-end">
            <Pressable onPress={() => {}}>
              <Animated.View
                entering={reduceMotion ? FadeIn.duration(DURATIONS.base) : FadeInUp.duration(DURATIONS.base)}
                // Bottom-sheet spec: rounded-t-sheet (24), bg-surface (not
                // canvas). `70vh` (not `70%`) since NativeWind resolves
                // viewport units directly, matching AppPicker/StakeSetupSheet.
                className="max-h-[70vh] rounded-t-sheet bg-surface"
              >
                <SafeAreaView edges={["bottom"]}>
                  {/* Grabber: 40x4, bg-line, rounded-xxs (bottom-sheet spec). */}
                  <View className="items-center pt-3">
                    <View className="h-1 w-10 rounded-xxs bg-line" />
                  </View>
                  <View className="px-5 pt-3 pb-2">
                    <Heading size="h4">Choose a task</Heading>
                  </View>
                  <ScrollView contentContainerClassName="px-5 pb-6 gap-2.5">
                    {tasks.map((t) => (
                      <FocusTaskRow
                        key={t.id}
                        task={t}
                        selected={t.id === selectedTaskId}
                        onPress={() => {
                          onSelectTask(t.id);
                          setPickerOpen(false);
                        }}
                      />
                    ))}
                  </ScrollView>
                </SafeAreaView>
              </Animated.View>
            </Pressable>
          </View>
        </Pressable>
      </Modal>

      <AppPicker visible={appPickerOpen} onClose={() => setAppPickerOpen(false)} />

      {activeStakeSnapshot && (
        <PanicValveSheet
          visible={panicOpen}
          session={activeStakeSnapshot}
          onClose={() => setPanicOpen(false)}
          onReleased={() => setPanicOpen(false)}
        />
      )}
    </View>
  );
}
