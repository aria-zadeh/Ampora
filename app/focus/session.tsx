/**
 * Focus session — ONE bounded session (PRD FR-62, FR-77b, FR-85; doc `04` §5, §6).
 *
 * This screen is an orchestrator. The pieces live next to it:
 *   - `hooks/useForegroundTimer`      the bounded, foreground-only clock
 *   - `components/focus/SessionTimer` ring + digits + pause/resume
 *   - `components/focus/StepCard`     the ONE current step
 *   - `components/focus/SessionControls`, `AmbientAudioPicker`
 *   - `components/focus/BreakOverlay` a break HOLDS the clock
 *   - `components/focus/EndCheckInSheet` FR-85 Done / Keep going / Stop here
 *
 * THE THREE RULES THIS SCREEN EXISTS TO ENFORCE
 *
 * 1. **One bounded session, not a repeating work/break loop.** A session has a
 *    length, it is served once, and then it ends with a check-in. A break HOLDS
 *    the clock rather than becoming a second mode of it, so break time can
 *    never be served toward a hold.
 *
 * 2. **The First move never unlocks anything** (doc `04` §5). Completing it
 *    reveals the next subtask and logs the time-to-start signal. That is all.
 *    The old completion-condition watcher — which handed the apps back the
 *    moment the 2-minute first move was ticked — is deleted and must not come
 *    back in any form. A `hold: 'session'` lock is served by FOREGROUND FOCUS
 *    TIME (`stakesStore.accrueFocus` → `serveSession`) and by nothing else;
 *    the store refuses `completeStake` for it, so no screen can bypass this.
 *
 * 3. **Leaving does not strand a lock.** Unmounting ends the FOCUS session but
 *    deliberately does NOT release a session hold — doc `04` §6 is explicit
 *    that "if the user leaves early: apps stay locked". What makes that honest
 *    rather than a trap is that the lock is now visible and escapable from
 *    anywhere: `GlobalLockBanner` (mounted in `app/_layout.tsx`) shows what is
 *    on the line and the time left, routes back into this screen, and carries
 *    the panic valve, while `useStakeTick` runs the caps against it. Coming
 *    back here ADOPTS the running stake instead of arming a second one.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View, Text, ScrollView } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Animated, { FadeIn } from "react-native-reanimated";

import { useTaskStore } from "@/store/taskStore";
import { useSettingsStore } from "@/store/settingsStore";
import { useSessionStore } from "@/store/sessionStore";
import { useEventLogStore } from "@/store/eventLogStore";
import { useStakesStore } from "@/store/stakesStore";
import { useProjectStore } from "@/store/projectStore";
import { useScheduleStore } from "@/store/scheduleStore";
import { nextStep, computeDurationMin, isSubtaskDone, isTaskComplete } from "@/core/task-logic";
import { simplifySubtask } from "@/services/ai";
import { useFocusAudio } from "@/hooks/useFocusAudio";
import { useForegroundTimer } from "@/hooks/useForegroundTimer";
import type { FocusAudio } from "@/utils/audioConfig";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { EmptyState } from "@/components/ui/EmptyState";
import { PressableScale } from "@/components/ui/PressableScale";
import { SessionNotice } from "@/components/focus/SessionNotice";
import { SessionTimer } from "@/components/focus/SessionTimer";
import { StepCard, stepText, stepId } from "@/components/focus/StepCard";
import { SessionControls } from "@/components/focus/SessionControls";
import { AmbientAudioPicker } from "@/components/focus/AmbientAudioPicker";
import { BreakOverlay } from "@/components/focus/BreakOverlay";
import { EndCheckInSheet, type CheckInAnswer } from "@/components/focus/EndCheckInSheet";
import { LockBanner } from "@/components/stakes/LockBanner";
import { PanicValveSheet } from "@/components/stakes/PanicValveSheet";
import { DeEscalationSheet } from "@/components/stakes/DeEscalationSheet";
import { colors } from "@/utils/design-tokens";
import { DURATIONS } from "@/utils/motion";
import { useReduceMotion } from "@/hooks/useReduceMotion";
import type { NextStep } from "@/core/task-logic";
import type { StakeSession, Task } from "@/types";

/** Shortest bounded session we will ever run, in minutes. */
const MIN_SESSION_MIN = 5;
/** Break length offered by "Take a break", in minutes. */
const BREAK_MIN = 5;

/**
 * How much of this session's task actually got done, 0..1 — the one input the
 * focus screen owes `projectStore.applyCheckIn` (FR-85).
 *
 * Weighted by subtask ESTIMATES, so ticking the 40-minute step counts for more
 * than ticking the 5-minute one. Falls back to a plain count when estimates are
 * missing, and to the First move when there are no subtasks at all, so a
 * zero-subtask task still reports something honest instead of a flat 0.
 */
function taskCompletionFraction(task: Task): number {
  if (isTaskComplete(task)) return 1;
  if (task.subtasks.length > 0) {
    const total = task.subtasks.reduce((sum, s) => sum + (Number.isFinite(s.estimatedMin) ? s.estimatedMin : 0), 0);
    if (total <= 0) {
      return task.subtasks.filter(isSubtaskDone).length / task.subtasks.length;
    }
    const done = task.subtasks
      .filter(isSubtaskDone)
      .reduce((sum, s) => sum + (Number.isFinite(s.estimatedMin) ? s.estimatedMin : 0), 0);
    return Math.min(1, Math.max(0, done / total));
  }
  if (task.firstMove) return task.firstMove.done ? 1 : 0;
  return 0;
}

export default function FocusSessionScreen() {
  const reduceMotion = useReduceMotion();
  const params = useLocalSearchParams<{
    taskId?: string;
    // Stake config, armed by StakeSetupSheet and passed through so the lock
    // arms exactly when the session starts.
    stakeHold?: string;
    stakeTrigger?: string;
    stakeVerification?: string;
    stakeSessionMin?: string;
  }>();
  const taskId = params.taskId ?? "";

  // -- Task (reactive) --
  const task = useTaskStore((s) => (taskId ? s.tasks[taskId] : undefined));
  const setSubtaskCompleted = useTaskStore((s) => s.setSubtaskCompleted);
  const updateTask = useTaskStore((s) => s.updateTask);
  const completeTask = useTaskStore((s) => s.completeTask);

  // -- Focus session store --
  const startSession = useSessionStore((s) => s.startSession);
  const sessionTick = useSessionStore((s) => s.tick);
  const endSession = useSessionStore((s) => s.endSession);
  const markSubtaskDone = useSessionStore((s) => s.markSubtaskDone);
  const takeBreak = useSessionStore((s) => s.takeBreak);
  const endBreak = useSessionStore((s) => s.endBreak);

  // -- On-device event log (PRD §10: session completion + time-to-start) --
  const logEvent = useEventLogStore((s) => s.logEvent);

  // -- Stakes --
  const startStake = useStakesStore((s) => s.startStake);
  const completeStake = useStakesStore((s) => s.completeStake);
  const serveSession = useStakesStore((s) => s.serveSession);
  const accrueFocus = useStakesStore((s) => s.accrueFocus);
  const activeStake = useStakesStore((s) => s.activeSession);
  const shouldOfferPause = useStakesStore((s) => s.shouldOfferPause);
  const recentPanics = useStakesStore((s) => s.recentPanics);

  const defaultSessionMin = useSettingsStore((s) => s.settings.defaultSessionMin);
  const singleSessionCapMin = useSettingsStore((s) => s.settings.singleSessionCapMin);

  const audio = useFocusAudio();

  // -- ADOPTION. Read synchronously at mount: if a stake for THIS task is
  //    already running (the user left and came back via the global banner), we
  //    take it over rather than arming a second one, which `startStake` would
  //    refuse with `already_active` anyway. --
  const [ownStakeId, setOwnStakeId] = useState<string | null>(() => {
    const live = useStakesStore.getState().activeSession;
    return live && live.taskId === taskId ? live.id : null;
  });
  const [adoptedFocusSec] = useState(() => {
    const live = useStakesStore.getState().activeSession;
    return live && live.taskId === taskId ? (live.focusSec ?? 0) : 0;
  });

  const ownStake: StakeSession | null =
    ownStakeId && activeStake?.id === ownStakeId ? activeStake : null;

  // -- Local UI state --
  const [breakOpen, setBreakOpen] = useState(false);
  const [checkInOpen, setCheckInOpen] = useState(false);
  const [panicOpen, setPanicOpen] = useState(false);
  const [deEscalationOpen, setDeEscalationOpen] = useState(false);
  const [simplerText, setSimplerText] = useState<string | null>(null);
  const [simplifying, setSimplifying] = useState(false);
  const [celebrate, setCelebrate] = useState(false);
  const [servedStake, setServedStake] = useState(false);

  const endedRef = useRef(false);
  const startedRef = useRef(false);
  const stakeArmedRef = useRef(ownStakeId != null);
  /** Set when "Keep going" wants a fresh session once the break closes. */
  const pendingRestartRef = useRef(false);
  const ownStakeIdRef = useRef<string | null>(ownStakeId);
  useEffect(() => {
    ownStakeIdRef.current = ownStakeId;
  }, [ownStakeId]);

  // The shape of the stake we were running, remembered across its release so
  // "Keep going" can offer the same terms again. By the time the check-in is
  // answered the stake has already been SERVED, so `ownStake` is null — reading
  // it there would silently drop the lock from every follow-on session.
  const lastStakeTermsRef = useRef<Pick<StakeSession, "verification" | "sessionMin"> | null>(null);
  useEffect(() => {
    if (ownStake) {
      lastStakeTermsRef.current = {
        verification: ownStake.verification,
        sessionMin: ownStake.sessionMin,
      };
    }
  }, [ownStake]);

  const step = useMemo<NextStep>(() => (task ? nextStep(task) : { kind: "none" }), [task]);
  const currentStepId = stepId(step);

  // Reset the "simpler version" whenever the current step changes.
  const prevStepIdRef = useRef(currentStepId);
  useEffect(() => {
    if (prevStepIdRef.current !== currentStepId) {
      prevStepIdRef.current = currentStepId;
      setSimplerText(null);
    }
  }, [currentStepId]);

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

  // -- The ONE bounded session length. A stake's `sessionMin` wins (it is the
  //    unlock currency); otherwise the task's own estimate, clamped so a
  //    session is never absurdly short or past the single-session cap. --
  const totalMin = useMemo(() => {
    if (ownStake?.hold === "session" && ownStake.sessionMin) return ownStake.sessionMin;
    const estimate = task ? computeDurationMin(task) : 0;
    const wanted = estimate > 0 ? estimate : defaultSessionMin;
    return Math.max(MIN_SESSION_MIN, Math.min(singleSessionCapMin, Math.round(wanted)));
  }, [ownStake, task, defaultSessionMin, singleSessionCapMin]);

  // -- Accrual: one served foreground second at a time. The stake's unlock
  //    lives entirely in `accrueFocus` (FR-77b) — nothing on this screen
  //    releases a lock. --
  const handleSecond = useCallback(() => {
    sessionTick(1);
    const id = ownStakeIdRef.current;
    if (id) accrueFocus(id, 1);
  }, [sessionTick, accrueFocus]);

  const handleTimerComplete = useCallback(() => {
    const id = ownStakeIdRef.current;
    if (id) {
      // Idempotent: `accrueFocus` normally serves it on the same tick.
      serveSession(id);
      setServedStake(true);
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    logEvent("session_completed");
    setCheckInOpen(true);
  }, [serveSession, logEvent]);

  const timer = useForegroundTimer({
    totalSec: totalMin * 60,
    initialElapsedSec: adoptedFocusSec,
    // A break and the check-in both HOLD the clock. Break time never counts.
    held: breakOpen || checkInOpen,
    onSecond: handleSecond,
    onComplete: handleTimerComplete,
  });
  // Stable across renders (`useCallback` inside the hook), so callbacks that
  // restart the session don't churn their own identity every tick.
  const resetTimer = timer.reset;

  // -- Focus-session lifecycle: start on mount, close on unmount. --
  useEffect(() => {
    if (!taskId || !task || startedRef.current) return;
    startedRef.current = true;
    startSession(taskId, totalMin, ownStakeIdRef.current ?? undefined);
    return () => {
      if (!endedRef.current) {
        endedRef.current = true;
        endSession(false);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId, task]);

  // -- Stake lifecycle: arm on mount when this screen was launched WITH a stake
  //    config and nothing was adopted. `startStake` runs every wellbeing gate
  //    itself; a refusal simply means the session runs unlocked, never an error.
  //
  //    THERE IS NO UNMOUNT RELEASE. A session hold survives leaving this screen
  //    (doc `04` §6) — `GlobalLockBanner` + `useStakeTick` are what keep that
  //    visible, bounded and escapable. --
  useEffect(() => {
    if (!taskId || !task || stakeArmedRef.current) return;
    if (!params.stakeHold) return;
    stakeArmedRef.current = true;

    const requested = params.stakeSessionMin ? parseInt(params.stakeSessionMin, 10) : undefined;
    const result = startStake({
      taskId,
      hold: params.stakeHold === "until_done" ? "until_done" : "session",
      trigger: params.stakeTrigger === "scheduled" ? "scheduled" : "manual",
      verification:
        params.stakeVerification === "honor" ||
        params.stakeVerification === "photo" ||
        params.stakeVerification === "screenshot"
          ? params.stakeVerification
          : "focus_time",
      sessionMin: Number.isFinite(requested as number) ? (requested as number) : undefined,
    });
    if (result.ok) setOwnStakeId(result.session.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId, task]);

  // -- De-escalation: offer to pause stakes after repeated panic-valve use. --
  useEffect(() => {
    if (recentPanics > 0 && shouldOfferPause()) setDeEscalationOpen(true);
  }, [recentPanics, shouldOfferPause]);

  // ---------------------------------------------------------------------------
  // Project progress (FR-85)
  // ---------------------------------------------------------------------------

  /**
   * Fold the check-in into the task's project (FR-85).
   *
   * `answer === undefined` is the SKIPPED case, and FR-85 is explicit that a
   * skipped check-in must still move the project — so the answer is INFERRED
   * from the subtask checkboxes rather than dropped, and generation never
   * stalls.
   *
   * All project math lives in `projectStore.applyCheckIn`; this screen never
   * touches phases or percent. `currentPhaseFraction` is the only thing it can
   * legitimately supply: how much of THIS session's task actually got ticked,
   * weighted by subtask estimates so a 40-minute step counts for more than a
   * 5-minute one.
   */
  const applyProjectCheckIn = useCallback(
    (answer?: CheckInAnswer) => {
      const projectId = task?.projectId;
      if (!task || !projectId) return;
      const resolved: CheckInAnswer = answer ?? (isTaskComplete(task) ? "done" : "stop_here");
      try {
        useProjectStore.getState().applyCheckIn(projectId, resolved, taskCompletionFraction(task));
      } catch {
        // Progress bookkeeping must never break the end of a session.
      }
    },
    [task]
  );

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  const leave = useCallback(() => {
    audio.stop().catch(() => {});
    router.back();
  }, [audio]);

  const finishFocusSession = useCallback(
    (completed: boolean, checkIn?: CheckInAnswer) => {
      if (endedRef.current) return;
      endedRef.current = true;
      endSession(completed, checkIn);
    },
    [endSession]
  );

  /** Every step is checked off. Never releases a `hold: 'session'` lock. */
  const handleAllStepsDone = useCallback(() => {
    if (!task) return;
    completeTask(task.id);
    setCelebrate(true);
    logEvent("session_completed");

    const id = ownStakeIdRef.current;
    const hold = ownStake?.hold;
    if (id && hold === "until_done") {
      // The opt-in hold releases on completion (FR-41a). The session hold does
      // NOT — that asymmetry is the anti-leak rule, and the store enforces it.
      completeStake(id, "task_done");
    }
    if (!id || hold !== "session") {
      // Nothing is holding the session open, so wrap up with the check-in.
      setCheckInOpen(true);
    }
    // With a live session hold we stay put: the timer keeps running, the banner
    // shows the time left, and the "done early" note explains why.
  }, [task, completeTask, completeStake, logEvent, ownStake]);

  const handleDone = useCallback(() => {
    if (!task) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});

    if (step.kind === "first_move") {
      // THE ON-RAMP, NOT THE GATE (doc `04` §5). Mark it done, log the
      // time-to-start signal, reveal the next step. Nothing else — and above
      // all, no unlock.
      updateTask(task.id, { firstMove: { ...step.action, done: true } });
      logEvent("first_action");
      if (task.subtasks.length === 0) handleAllStepsDone();
      return;
    }

    if (step.kind === "subtask") {
      const isLast = task.subtasks.filter((s) => s.completedAt == null).length === 1;
      markSubtaskDone(step.subtask.id);
      setSubtaskCompleted(task.id, step.subtask.id, true);
      if (isLast) handleAllStepsDone();
      return;
    }

    // Nothing left to check off — "Finish" opens the check-in.
    setCheckInOpen(true);
  }, [
    task,
    step,
    updateTask,
    setSubtaskCompleted,
    markSubtaskDone,
    logEvent,
    handleAllStepsDone,
  ]);

  const handleBreak = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    takeBreak();
    setBreakOpen(true);
  }, [takeBreak]);

  const breakStartedAtRef = useRef<number | null>(null);
  useEffect(() => {
    if (breakOpen) breakStartedAtRef.current = Date.now();
  }, [breakOpen]);

  const handleBreakEnd = useCallback(() => {
    const startedAt = breakStartedAtRef.current;
    breakStartedAtRef.current = null;
    endBreak(startedAt != null ? Math.round((Date.now() - startedAt) / 1000) : 0);
    setBreakOpen(false);
  }, [endBreak]);

  const handleStuck = useCallback(async () => {
    const current = stepText(step);
    if (!current || simplifying) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setSimplifying(true);
    try {
      const res = await simplifySubtask(current);
      setSimplerText(res.simplified);
    } catch {
      setSimplerText(`Just start: ${current}`);
    } finally {
      setSimplifying(false);
    }
  }, [step, simplifying]);

  const handleOverwhelmed = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    router.push(taskId ? `/blindfold?taskId=${taskId}` : "/blindfold");
  }, [taskId]);

  const pickAudio = useCallback(
    (kind: FocusAudio) => {
      Haptics.selectionAsync().catch(() => {});
      audio.play(kind).catch(() => {});
    },
    [audio]
  );

  // ---------------------------------------------------------------------------
  // End check-in (FR-85)
  // ---------------------------------------------------------------------------

  /** Start a fresh bounded session after a break ("Keep going"). */
  const startAnotherSession = useCallback(() => {
    if (!taskId) return;
    endedRef.current = false;
    setServedStake(false);
    setCelebrate(false);

    // Re-arm the stake on the same terms, only if the wellbeing gates STILL
    // pass. They often will not — the daily cap may now be spent, or quiet
    // hours may have started — and a refusal simply means the next session
    // runs unlocked, never an error.
    let nextStakeId: string | null = null;
    const previous = lastStakeTermsRef.current;
    if (previous && useStakesStore.getState().canStartStake().ok) {
      const result = startStake({
        taskId,
        hold: "session",
        trigger: "manual",
        verification: previous.verification,
        sessionMin: previous.sessionMin,
      });
      if (result.ok) nextStakeId = result.session.id;
    }
    setOwnStakeId(nextStakeId);
    ownStakeIdRef.current = nextStakeId;
    stakeArmedRef.current = true;

    startSession(taskId, totalMin, nextStakeId ?? undefined);
    resetTimer(0);
  }, [taskId, startStake, startSession, totalMin, resetTimer]);

  const handleCheckIn = useCallback(
    (answer: CheckInAnswer) => {
      setCheckInOpen(false);
      applyProjectCheckIn(answer);

      if (answer === "keep_going") {
        finishFocusSession(true, "keep_going");
        // A break first, then a fresh session (FR-85).
        takeBreak();
        setBreakOpen(true);
        // `startAnotherSession` runs when the break closes.
        pendingRestartRef.current = true;
        return;
      }

      if (answer === "done") {
        finishFocusSession(true, "done");
        leave();
        return;
      }

      // "Stop here": the remainder reflows into the schedule.
      finishFocusSession(false, "stop_here");
      try {
        useScheduleStore.getState().recompute();
      } catch {
        // A failed reflow must never block leaving a session.
      }
      leave();
    },
    [applyProjectCheckIn, finishFocusSession, leave, takeBreak]
  );

  /** Dismissed check-in (FR-85): progress is INFERRED, never dropped. */
  const handleCheckInDismiss = useCallback(() => {
    setCheckInOpen(false);
    applyProjectCheckIn(undefined);
    finishFocusSession(false, undefined);
    leave();
  }, [applyProjectCheckIn, finishFocusSession, leave]);

  const handleBreakClose = useCallback(() => {
    handleBreakEnd();
    if (pendingRestartRef.current) {
      pendingRestartRef.current = false;
      startAnotherSession();
    }
  }, [handleBreakEnd, startAnotherSession]);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const missing = !taskId || !task;
  const noSteps = step.kind === "none";
  const doneEarly = task != null && isTaskComplete(task) && ownStake?.hold === "session";
  const enter = reduceMotion ? undefined : FadeIn.duration(DURATIONS.slow);

  return (
    <SafeAreaView className="flex-1 bg-neutral-100" edges={["top", "bottom"]}>
      {/* Header: state + task title + close */}
      <View className="flex-row items-center justify-between px-5 pt-2 pb-1">
        <View className="flex-1 pr-3">
          <Text
            className={`text-overline font-semibold uppercase tracking-wide ${
              timer.ticking ? "text-success-700" : "text-warning-700"
            }`}
          >
            {timer.ticking ? "Focusing" : "Paused"}
          </Text>
          <Text className="text-label font-medium text-neutral-600 mt-0.5" numberOfLines={1}>
            {task?.title ?? "Focus session"}
          </Text>
        </View>
        <PressableScale
          onPress={leave}
          haptic="selection"
          className="min-w-11 min-h-11 items-center justify-center"
          accessibilityRole="button"
          accessibilityLabel="Leave focus session"
          accessibilityHint={
            ownStake
              ? "Your apps stay locked; a banner will show the time left"
              : "Closes this session"
          }
        >
          <Ionicons name="close" size={26} color={colors.light.text} />
        </PressableScale>
      </View>

      {missing ? (
        <View className="flex-1 justify-center">
          <EmptyState
            icon="timer-outline"
            title="Nothing to focus on"
            subtitle="This task couldn't be found. Head back and pick one to focus on."
            actionLabel="Go back"
            onAction={() => router.back()}
          />
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
              label={totalCount > 0 ? `${doneCount} of ${totalCount} steps` : "One focused push"}
              showPercentage={totalCount > 0}
              height={8}
            />
          </Animated.View>

          {/* Lock banner — in-context while our stake is live. Carries the
              always-available panic valve. */}
          {ownStake && (
            <View className="mt-5">
              <LockBanner session={ownStake} onPanic={() => setPanicOpen(true)} />
              <Text className="mt-2 px-1 text-caption text-neutral-500">
                Leaving this screen keeps your apps locked — a banner will show the time left and
                the way out.
              </Text>
            </View>
          )}

          {/* Finished the work before the session was served. Celebrated, not
              cashed in: the hold is time, so the apps stay on the line. */}
          {doneEarly && (
            <SessionNotice
              icon="sparkles-outline"
              className="mt-4"
              text="Every step is done — nice. This session is held by time, so ride out the rest or unlock early whenever you want."
            />
          )}

          {/* Just-served confirmation. */}
          {servedStake && !ownStake && (
            <SessionNotice
              icon="lock-open-outline"
              role="alert"
              className="mt-5"
              text="Session served. Your apps are yours again."
            />
          )}

          {/* The ONE current step. */}
          <StepCard
            step={step}
            simplerText={simplerText}
            celebrate={celebrate}
            style={{ marginTop: 32 }}
          />

          {/* The bounded session clock. */}
          <Animated.View entering={enter} className="mt-10">
            <SessionTimer
              remainingSec={timer.remainingSec}
              progress={timer.progress}
              ticking={timer.ticking}
              running={timer.running}
              interrupted={timer.interrupted}
              totalMin={totalMin}
              onToggle={timer.toggle}
            />
          </Animated.View>

          <View className="mt-10">
            <SessionControls
              onDone={handleDone}
              noSteps={noSteps}
              onBreak={handleBreak}
              onStuck={handleStuck}
              simplifying={simplifying}
              onOverwhelmed={handleOverwhelmed}
            />
          </View>

          <View className="mt-6">
            <AmbientAudioPicker current={audio.current} onPick={pickAudio} />
          </View>
        </ScrollView>
      )}

      {/* A break HOLDS the clock — break time is never served toward a hold. */}
      <BreakOverlay
        visible={breakOpen}
        minutes={BREAK_MIN}
        onResume={handleBreakClose}
        lockActive={ownStake != null}
      />

      {/* End check-in (FR-85). Dismissing infers progress rather than dropping it. */}
      <EndCheckInSheet
        visible={checkInOpen}
        taskTitle={task?.title}
        served={timer.completed}
        unlocked={servedStake}
        onAnswer={handleCheckIn}
        onDismiss={handleCheckInDismiss}
      />

      {/* Panic valve — 60s breather, then the store releases the lock. */}
      {ownStake && (
        <PanicValveSheet
          visible={panicOpen}
          session={ownStake}
          onClose={() => setPanicOpen(false)}
          onReleased={() => setPanicOpen(false)}
        />
      )}

      {/* De-escalation — offered after repeated panic-valve use. Never pressures. */}
      <DeEscalationSheet
        visible={deEscalationOpen}
        onClose={() => setDeEscalationOpen(false)}
        onPaused={() => setDeEscalationOpen(false)}
      />
    </SafeAreaView>
  );
}
