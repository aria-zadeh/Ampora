/**
 * Focus session — Ampora Phase 4 (PRD FR-62).
 *
 * A premium full-screen focus session pushed with `?taskId=`. Surfaces the ONE
 * current step (core/task-logic `nextStep` — the First move or the next
 * uncompleted subtask), a large Pomodoro timer (default 25/5, overridable via
 * settings if present), and a linear progress bar over the task's steps.
 *
 * Controls (doc: PRD FR-62):
 *  - Done          → mark the current step done, advance to the next; when the
 *                    last step completes → completeTask + endSession(true) +
 *                    logSignal(completed).
 *  - Take a break  → flip the timer into its break phase (audio keeps playing).
 *  - I'm stuck     → services/ai.ts#simplifySubtask on the current step; shows
 *                    the simpler wording inline (graceful local fallback).
 *  - I'm overwhelmed → router.push('/blindfold') (one-thing mode).
 *  - Ambient audio toggle (useFocusAudio).
 *  - Close (X)     → endSession(false) and leave.
 *
 * On mount: startSession + logSignal(actualStart). A 1-second interval ticks
 * the session store while running (not on break). Calm motion; success-green is
 * the primary "run" color. Nothing here can crash — AI + audio degrade
 * gracefully to local behavior.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View, Text, Pressable, ScrollView } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Animated, { FadeIn, FadeInDown } from "react-native-reanimated";

import { useTaskStore } from "@/store/taskStore";
import { useSettingsStore } from "@/store/settingsStore";
import { useSessionStore } from "@/store/sessionStore";
import { useBehavioralStore } from "@/store/behavioralStore";
import { nextStep, computeDurationMin } from "@/core/task-logic";
import { simplifySubtask } from "@/services/ai";
import { useFocusAudio } from "@/hooks/useFocusAudio";
import { AUDIO_PICKER_OPTIONS, type FocusAudio } from "@/utils/audioConfig";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { Heading } from "@/components/ui/Heading";
import { PressableScale } from "@/components/ui/PressableScale";
import { iconSizes } from "@/utils/design-tokens";
import { DURATIONS } from "@/utils/motion";
import { useReduceMotion } from "@/hooks/useReduceMotion";
import type { NextStep } from "@/core/task-logic";

// ---------------------------------------------------------------------------
// Pomodoro config
// ---------------------------------------------------------------------------

const DEFAULT_WORK_MIN = 25;
const DEFAULT_BREAK_MIN = 5;

type Phase = "work" | "break";

function mmss(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

/** The user-facing text for the current step. */
function stepText(step: NextStep): string {
  if (step.kind === "first_move") return step.action.text;
  if (step.kind === "subtask") return step.subtask.title;
  return "";
}

/** A stable label for the current step's kind. */
function stepKindLabel(step: NextStep): string {
  if (step.kind === "first_move") return "First move";
  if (step.kind === "subtask") return "Current step";
  return "";
}

export default function FocusSessionScreen() {
  const reduceMotion = useReduceMotion();
  const params = useLocalSearchParams<{ taskId?: string }>();
  const taskId = params.taskId ?? "";

  // -- Task (reactive) --
  const task = useTaskStore((s) => (taskId ? s.tasks[taskId] : undefined));
  const setSubtaskCompleted = useTaskStore((s) => s.setSubtaskCompleted);
  const updateTask = useTaskStore((s) => s.updateTask);
  const completeTask = useTaskStore((s) => s.completeTask);

  // -- Session --
  const startSession = useSessionStore((s) => s.startSession);
  const tick = useSessionStore((s) => s.tick);
  const endSession = useSessionStore((s) => s.endSession);
  const markSubtaskDone = useSessionStore((s) => s.markSubtaskDone);

  // -- Behavioral log --
  const logSignal = useBehavioralStore((s) => s.logSignal);

  // -- Ambient audio --
  const audio = useFocusAudio();

  // -- Pomodoro lengths (settings override if the field ever exists) --
  const workMin = useSettingsStore(
    (s) => (s.settings as { focusWorkMin?: number }).focusWorkMin ?? DEFAULT_WORK_MIN
  );
  const breakMin = useSettingsStore(
    (s) => (s.settings as { focusBreakMin?: number }).focusBreakMin ?? DEFAULT_BREAK_MIN
  );

  // -- Local UI state --
  const [phase, setPhase] = useState<Phase>("work");
  const [remainingSec, setRemainingSec] = useState(workMin * 60);
  const [running, setRunning] = useState(true);
  const [audioOpen, setAudioOpen] = useState(false);
  // Per-step "simpler version" from the AI stuck helper, keyed by step id.
  const [simplerText, setSimplerText] = useState<string | null>(null);
  const [simplifying, setSimplifying] = useState(false);

  const endedRef = useRef(false);
  const startedRef = useRef(false);

  const step = useMemo<NextStep>(
    () => (task ? nextStep(task) : { kind: "none" }),
    [task]
  );
  // Reset the "simpler version" whenever the current step changes.
  const stepId =
    step.kind === "first_move" ? step.action.id : step.kind === "subtask" ? step.subtask.id : "none";
  const prevStepIdRef = useRef(stepId);
  useEffect(() => {
    if (prevStepIdRef.current !== stepId) {
      prevStepIdRef.current = stepId;
      setSimplerText(null);
    }
  }, [stepId]);

  // -- Progress across the task's steps (first move + subtasks) --
  const { progress, doneCount, totalCount } = useMemo(() => {
    if (!task) return { progress: 0, doneCount: 0, totalCount: 0 };
    const subDone = task.subtasks.filter((s) => s.completedAt != null).length;
    const subTotal = task.subtasks.length;
    const hasFirstMove = task.firstMove != null;
    const firstDone = task.firstMove?.done ? 1 : 0;
    const total = subTotal + (hasFirstMove ? 1 : 0);
    const done = subDone + firstDone;
    return {
      progress: total > 0 ? done / total : task.status === "done" ? 1 : 0,
      doneCount: done,
      totalCount: total,
    };
  }, [task]);

  // -- Session lifecycle: start on mount, log actualStart, end on unmount --
  useEffect(() => {
    if (!taskId || !task || startedRef.current) return;
    startedRef.current = true;
    const planned = computeDurationMin(task) || workMin;
    startSession(taskId, planned);
    logSignal({
      taskType: task.listId,
      actualStart: Date.now(),
      completed: false,
    });
    // Cleanup: if the screen unmounts without an explicit completion, close the
    // session as not-completed (idempotent via endedRef).
    return () => {
      if (!endedRef.current) {
        endedRef.current = true;
        endSession(false);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId]);

  // -- Ticking timer (1s). Advances the countdown and ticks the session store
  //    with focused seconds during the WORK phase only. --
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      if (phase === "work") tick(1);
      setRemainingSec((r) => {
        if (r <= 1) {
          // Phase boundary — flip work<->break and reset the countdown.
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
          const nextPhase: Phase = phase === "work" ? "break" : "work";
          setPhase(nextPhase);
          return (nextPhase === "work" ? workMin : breakMin) * 60;
        }
        return r - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [running, phase, tick, workMin, breakMin]);

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  const finishAndLeave = useCallback(
    (completed: boolean) => {
      if (!endedRef.current) {
        endedRef.current = true;
        endSession(completed);
      }
      audio.stop().catch(() => {});
      router.back();
    },
    [audio, endSession]
  );

  const handleDone = useCallback(() => {
    if (!task) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});

    if (step.kind === "first_move") {
      // Mark the first move done; task continues to its subtasks (if any).
      updateTask(task.id, { firstMove: { ...step.action, done: true } });
      const stillHasSteps = task.subtasks.some((s) => s.completedAt == null);
      if (!stillHasSteps && task.subtasks.length === 0) {
        // First move was the only step → complete the whole task.
        completeTask(task.id);
        logSignal({ taskType: task.listId, completed: true });
        finishAndLeave(true);
      }
      return;
    }

    if (step.kind === "subtask") {
      const isLast =
        task.subtasks.filter((s) => s.completedAt == null).length === 1;
      markSubtaskDone(step.subtask.id);
      setSubtaskCompleted(task.id, step.subtask.id, true);
      if (isLast) {
        // Completing the last subtask completes the task (task-logic does this,
        // but we still log + end the session here).
        logSignal({ taskType: task.listId, completed: true });
        finishAndLeave(true);
      }
      return;
    }

    // No step left — treat Done as "finish the session".
    finishAndLeave(true);
  }, [
    task,
    step,
    updateTask,
    completeTask,
    setSubtaskCompleted,
    markSubtaskDone,
    logSignal,
    finishAndLeave,
  ]);

  const handleBreak = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setPhase("break");
    setRemainingSec(breakMin * 60);
    setRunning(true);
  }, [breakMin]);

  const handleStuck = useCallback(async () => {
    const current = stepText(step);
    if (!current || simplifying) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setSimplifying(true);
    try {
      const res = await simplifySubtask(current);
      setSimplerText(res.simplified);
    } catch {
      // simplifySubtask never throws, but stay defensive.
      setSimplerText(`Just start: ${current}`);
    } finally {
      setSimplifying(false);
    }
  }, [step, simplifying]);

  const handleOverwhelmed = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    // Carry the current task through so Blindfold shows THIS task's next step,
    // not just the top-priority one.
    router.push(taskId ? `/blindfold?taskId=${taskId}` : "/blindfold");
  }, [taskId]);

  const toggleRunning = useCallback(() => {
    Haptics.selectionAsync().catch(() => {});
    setRunning((r) => !r);
  }, []);

  const pickAudio = useCallback(
    (kind: FocusAudio) => {
      Haptics.selectionAsync().catch(() => {});
      audio.play(kind).catch(() => {});
      setAudioOpen(false);
    },
    [audio]
  );

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const missing = !taskId || !task;
  const noSteps = step.kind === "none";
  const displayStep = simplerText ?? stepText(step);
  const isBreak = phase === "break";

  const enter = reduceMotion ? undefined : FadeIn.duration(DURATIONS.slow);
  const enterStep = reduceMotion ? undefined : FadeInDown.duration(DURATIONS.base);

  return (
    <SafeAreaView className="flex-1 bg-neutral-100" edges={["top", "bottom"]}>
      {/* Header: task title + close */}
      <View className="flex-row items-center justify-between px-5 pt-2 pb-1">
        <View className="flex-1 pr-3">
          <Text className="text-overline font-semibold uppercase tracking-wide text-success-700">
            {isBreak ? "On a break" : "Focusing"}
          </Text>
          <Text
            className="text-label font-medium text-neutral-600 mt-0.5"
            numberOfLines={1}
          >
            {task?.title ?? "Focus session"}
          </Text>
        </View>
        <Pressable
          onPress={() => finishAndLeave(progress >= 1)}
          className="min-w-11 min-h-11 items-center justify-center"
          accessibilityRole="button"
          accessibilityLabel="End focus session"
          hitSlop={8}
        >
          <Ionicons name="close" size={26} color="#18181B" />
        </Pressable>
      </View>

      {missing ? (
        <View className="flex-1 items-center justify-center px-8">
          <Ionicons name="timer-outline" size={iconSizes.hero} color="#A1A1AA" />
          <Heading size="h4" className="mt-4 text-center">
            Nothing to focus on
          </Heading>
          <Text className="text-body text-neutral-500 text-center mt-2">
            {"This task couldn't be found. Head back and pick one to focus on."}
          </Text>
          <View className="mt-6">
            <PressableScale
              onPress={() => router.back()}
              haptic="light"
              className="h-12 px-6 flex-row items-center justify-center rounded-md bg-neutral-900"
              accessibilityLabel="Go back"
            >
              <Text className="text-label font-semibold text-white">Go back</Text>
            </PressableScale>
          </View>
        </View>
      ) : (
        <ScrollView
          className="flex-1"
          contentContainerClassName="px-5 pb-6"
          showsVerticalScrollIndicator={false}
        >
          {/* Progress across the task's steps */}
          <Animated.View entering={enter} className="mt-3">
            <ProgressBar
              progress={progress}
              color={progress >= 1 ? "bg-success-500" : "bg-success-600"}
              label={
                totalCount > 0
                  ? `${doneCount} of ${totalCount} steps`
                  : "One focused push"
              }
              showPercentage={totalCount > 0}
              height={8}
            />
          </Animated.View>

          {/* The ONE current step, large */}
          <Animated.View entering={enterStep} className="mt-8">
            <View className="rounded-2xl bg-white border border-neutral-200 p-6">
              <Text className="text-overline font-semibold uppercase tracking-wide text-primary-600">
                {noSteps ? "You're done" : stepKindLabel(step)}
              </Text>
              <Heading size="h1" className="mt-2">
                {noSteps
                  ? "Every step is complete. Nicely done."
                  : displayStep}
              </Heading>
              {simplerText && !noSteps && (
                <Text className="text-caption text-primary-600 mt-3">
                  Simplified — smaller and easier to just start.
                </Text>
              )}
            </View>
          </Animated.View>

          {/* Timer */}
          <Animated.View entering={enter} className="items-center mt-10">
            <Text className="text-caption text-neutral-500 mb-1">
              {isBreak ? "Break" : "Focus"} · {isBreak ? breakMin : workMin} min
            </Text>
            <Text
              className={`font-bold tracking-wider ${
                running ? "text-neutral-900" : "text-neutral-400"
              }`}
              style={{ fontSize: 72, lineHeight: 80, fontVariant: ["tabular-nums"] }}
              accessibilityRole="timer"
              accessibilityLabel={`${mmss(remainingSec)} ${running ? "running" : "paused"}`}
            >
              {mmss(remainingSec)}
            </Text>

            <Pressable
              onPress={toggleRunning}
              className="mt-3 flex-row items-center gap-1.5 px-4 py-2 rounded-full active:opacity-60"
              accessibilityRole="button"
              accessibilityLabel={running ? "Pause timer" : "Resume timer"}
              hitSlop={6}
            >
              <Ionicons
                name={running ? "pause" : "play"}
                size={iconSizes.sm}
                color="#52525B"
              />
              <Text className="text-label font-medium text-neutral-600">
                {running ? "Pause" : "Resume"}
              </Text>
            </Pressable>
          </Animated.View>

          {/* Primary: Done */}
          <View className="mt-10">
            <PressableScale
              onPress={handleDone}
              haptic="success"
              className="h-14 flex-row items-center justify-center rounded-xl bg-success-700"
              style={{ shadowColor: "#166534", shadowOpacity: 0.18, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 3 }}
              accessibilityRole="button"
              accessibilityLabel={
                noSteps ? "Finish session" : "Mark this step done and continue"
              }
            >
              <Ionicons name="checkmark-circle" size={22} color="#FFFFFF" />
              <Text className="ml-2 text-h4 font-semibold text-white">
                {noSteps ? "Finish" : "Done"}
              </Text>
            </PressableScale>
          </View>

          {/* Secondary controls */}
          <View className="mt-4 gap-3">
            <View className="flex-row gap-3">
              <SecondaryButton
                icon="cafe-outline"
                label="Take a break"
                onPress={handleBreak}
              />
              <SecondaryButton
                icon="bulb-outline"
                label={simplifying ? "Thinking…" : "I'm stuck"}
                onPress={handleStuck}
                disabled={simplifying || noSteps}
              />
            </View>
            <SecondaryButton
              icon="heart-outline"
              label="I'm overwhelmed"
              onPress={handleOverwhelmed}
              tone="warm"
            />
          </View>

          {/* Ambient audio */}
          <View className="mt-6">
            <Pressable
              onPress={() => setAudioOpen((o) => !o)}
              className="flex-row items-center justify-between px-4 h-12 rounded-xl bg-white border border-neutral-200 active:opacity-70"
              accessibilityRole="button"
              accessibilityLabel="Ambient sound"
            >
              <View className="flex-row items-center gap-2">
                <Ionicons name="musical-notes-outline" size={iconSizes.sm} color="#52525B" />
                <Text className="text-label font-medium text-neutral-700">
                  Ambient sound
                </Text>
              </View>
              <View className="flex-row items-center gap-1">
                <Text className="text-caption text-neutral-500 capitalize">
                  {audio.current === "none" ? "Off" : audio.current}
                </Text>
                <Ionicons
                  name={audioOpen ? "chevron-up" : "chevron-down"}
                  size={iconSizes.sm}
                  color="#A1A1AA"
                />
              </View>
            </Pressable>

            {audioOpen && (
              <Animated.View
                entering={reduceMotion ? undefined : FadeIn.duration(DURATIONS.fast)}
                className="flex-row flex-wrap gap-2 mt-3"
              >
                {AUDIO_PICKER_OPTIONS.map((opt) => {
                  const active = audio.current === opt.kind;
                  return (
                    <Pressable
                      key={opt.kind}
                      onPress={() => pickAudio(opt.kind)}
                      className={`flex-row items-center gap-1.5 px-3.5 h-10 rounded-full border ${
                        active
                          ? "bg-primary-600 border-primary-600"
                          : "bg-white border-neutral-200"
                      }`}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                      accessibilityLabel={`Ambient ${opt.label}`}
                    >
                      <Ionicons
                        name={opt.icon as keyof typeof Ionicons.glyphMap}
                        size={iconSizes.sm}
                        color={active ? "#FFFFFF" : "#52525B"}
                      />
                      <Text
                        className={`text-label font-medium ${
                          active ? "text-white" : "text-neutral-700"
                        }`}
                      >
                        {opt.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </Animated.View>
            )}
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Secondary control button
// ---------------------------------------------------------------------------

function SecondaryButton({
  icon,
  label,
  onPress,
  disabled,
  tone = "neutral",
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  tone?: "neutral" | "warm";
}) {
  const warm = tone === "warm";
  return (
    <PressableScale
      onPress={onPress}
      haptic="light"
      disabled={disabled}
      className={`flex-1 h-12 flex-row items-center justify-center rounded-xl border ${
        warm ? "bg-warning-100 border-warning-100" : "bg-white border-neutral-200"
      } ${disabled ? "opacity-50" : ""}`}
      accessibilityLabel={label}
    >
      <Ionicons
        name={icon}
        size={iconSizes.sm}
        color={warm ? "#C2410C" : "#52525B"}
      />
      <Text
        className={`ml-2 text-label font-medium ${
          warm ? "text-warning-700" : "text-neutral-700"
        }`}
      >
        {label}
      </Text>
    </PressableScale>
  );
}
