/**
 * StakeSetupSheet, Ampora Ignition, rebuilt onto the hold + trigger model
 * (PRD §8.8, doc `04` §2/§6/§7).
 *
 * A calm bottom sheet to "put something on the line" for a task. It walks
 * through exactly the questions PRD §8.8 specifies, in order:
 *   1. Toggle: `Put something on the line`.
 *   2. `Unlock when?`, `When this session ends` (hold='session', default) or
 *      `When it's done` (hold='until_done'), offered only when
 *      `isUntilDoneEligible(taskId)` says the task fits inside one session
 *      under the wellbeing cap. When it doesn't qualify, the option stays
 *      visible but disabled with a short honest reason (never hidden).
 *   3. Optional `Lock automatically at [time]`, and when on, an optional
 *      `If I haven't started within [X] min`.
 *   4. `Session length` (default 45, range 15-50) with a `Just get me
 *      started` preset.
 *   5. A verification choice where it belongs: forced to `focus_time` for the
 *      session hold (that IS the unlock mechanism, doc `04` §2), and a
 *      Photo/Screenshot choice for `until_done` (doc `04` §4).
 *
 * THE BUG THIS FIXES: after the stakes-store rebuild, `startStake` correctly
 * refuses to arm when nothing has been selected, quiet hours are active, the
 * daily cap is spent, stakes are paused, a session is already active, or
 * `until_done` doesn't fit, but until now the sheet routed straight into the
 * focus session regardless, so a refusal there was invisible (the session
 * just ran unlocked with no explanation). This sheet now runs the SAME gates
 * as a pre-flight, via `canStartStake()` plus the two checks it doesn't cover
 * (`no_selection`, `not_eligible`), and shows the reason in plain language
 * BEFORE ever navigating away. No refusal is ever silent.
 *
 * Two arming paths, both handled here:
 *   - `trigger: 'manual'`, hands an `ArmedStake` to `onArm`, which the
 *     caller (app/task/[id].tsx) uses to route into the focus session; that
 *     screen calls `startStake(...)` on mount, now virtually guaranteed to
 *     succeed because the same gates were just checked here.
 *   - `trigger: 'scheduled'`, calls `stakesStore.scheduleStake(...)`
 *     directly and stays on this screen (there is nothing to start now). If
 *     `scheduleStake` refuses (it is a deliberate stub today, pending the
 *     notification plumbing, see `store/stakesStore.ts`), that refusal is
 *     shown here too, honestly, rather than pretending the schedule was set.
 *
 * Wellbeing stance (§9.10): warm, never shaming. Arming is fully reversible
 * up until (and during) the session via the panic valve.
 *
 * RN + NativeWind, web-export safe. No native module imported.
 */

import React, { useEffect, useMemo, useState } from "react";
import { View, Text, Modal, Pressable, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Animated, { FadeIn, FadeInUp } from "react-native-reanimated";

import { Button } from "@/components/ui/Button";
import { Heading } from "@/components/ui/Heading";
import { PressableScale } from "@/components/ui/PressableScale";
import { Badge } from "@/components/ui/Badge";
import { DateTimePickerCrossPlatform } from "@/components/ui/DateTimePickerCrossPlatform";
import { Stepper, Toggle, InlineSegmented } from "@/components/settings/SettingsPrimitives";
import { AppPicker } from "@/components/stakes/AppPicker";
import { colors, shadows } from "@/utils/design-tokens";
import { DURATIONS } from "@/utils/motion";
import { useReduceMotion } from "@/hooks/useReduceMotion";
import {
  useStakesStore,
  selectStakeSelection,
  isQuietHours,
  type StartStakeRefusal,
} from "@/store/stakesStore";
import { useSettingsStore } from "@/store/settingsStore";
import { SESSION_MIN_BOUNDS, DEFAULT_SESSION_MIN, clampTo } from "@/core/blocking/limits";
import type { StakeSession, StakeSelection, Task } from "@/types";

// ---------------------------------------------------------------------------
// Armed-stake payload, what Confirm produces for the MANUAL path. The focus
// session consumes this and calls stakesStore.startStake(...) on mount (so
// caps apply at lock time, not sheet-close time).
// ---------------------------------------------------------------------------

/** A stake configured but NOT yet started; handed to the focus session to arm. */
export interface ArmedStake {
  taskId: string;
  hold: StakeSession["hold"];
  trigger: StakeSession["trigger"];
  verification: StakeSession["verification"];
  /** Session length in minutes; the store clamps it to every cap. */
  sessionMin?: number;
}

/** Default "if I haven't started within X min" window for a scheduled stake. */
const START_WINDOW_DEFAULT_MIN = 15;
const START_WINDOW_BOUNDS = { min: 5, max: 120 };
const SESSION_STEP_MIN = 5;

// ---------------------------------------------------------------------------
// Copy, plain language for every refusal reason. No refusal is ever silent.
// ---------------------------------------------------------------------------

const REFUSAL_COPY: Record<StartStakeRefusal, string> = {
  no_selection: "Choose which apps go on the line first.",
  quiet_hours: "It's quiet hours right now, so stakes stay off. Try again once quiet hours end.",
  cap_reached: "You've used today's lock time. It resets tomorrow.",
  paused: "Stakes are paused for today. Resume them any time in Settings.",
  already_active: "You already have a stake running. Finish or release that one first.",
  not_eligible: "This task doesn't fit inside one session, so \"When it's done\" isn't offered here.",
  error: "Something didn't go through. Give it another try.",
};

/**
 * `scheduleStake` is fully implemented (it persists the row and posts the cue
 * notifications for real), so the old "not ready yet" stub fallback is gone,
 * a scheduled arm now either succeeds or fails for one of the real
 * `StartStakeRefusal` reasons below.
 *
 * `quiet_hours` gets its own scheduled-specific wording: `scheduleStake`
 * checks quiet hours at the ARM MOMENT (`scheduledAt + startWindowMin`), not
 * at "now", so "it's quiet hours right now" would be misleading for a stake
 * armed hours or days out. `scheduledConflictMoment` is only passed when that
 * arm-moment check is actually what produced the refusal (see
 * `scheduledQuietHoursConflict` below); the rarer case where the generic
 * "now" pre-flight gate is what refused still falls through to the plain
 * `REFUSAL_COPY.quiet_hours` text, which is honest for that case too.
 */
function refusalMessage(reason: StartStakeRefusal, scheduled: boolean, scheduledConflictMoment?: Date): string {
  if (reason === "quiet_hours" && scheduled && scheduledConflictMoment) {
    return `${formatTime(scheduledConflictMoment)} falls in quiet hours, so it won't lock then. Choose a different time.`;
  }
  return REFUSAL_COPY[reason];
}

/** Whether a selection actually puts anything on the line (mirrors the store's own gate). */
function hasStakeSelection(selection: StakeSelection | null): boolean {
  if (!selection) return false;
  const tokens =
    selection.applicationTokens.length + selection.categoryTokens.length + selection.webDomainTokens.length;
  return tokens > 0 || selection.count > 0;
}

/** "3:30 PM" style label for a time-only Date, with a plain fallback if Intl is unavailable. */
function formatTime(date: Date): string {
  try {
    return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  } catch {
    const h = date.getHours();
    const m = date.getMinutes();
    const hh = ((h + 11) % 12) + 1;
    const ap = h < 12 ? "AM" : "PM";
    return `${hh}:${String(m).padStart(2, "0")} ${ap}`;
  }
}

/** Resolve a time-only Date to the next real occurrence of that clock time from `fromMs`. */
function nextOccurrenceMs(time: Date, fromMs: number): number {
  const next = new Date(fromMs);
  next.setHours(time.getHours(), time.getMinutes(), 0, 0);
  if (next.getTime() <= fromMs) next.setDate(next.getDate() + 1);
  return next.getTime();
}

/** The instant a scheduled stake would actually arm, mirrors `scheduleStake`'s own `armAt` derivation exactly, so the refusal copy can name the true conflicting moment. */
function computeArmMoment(scheduledAt: Date, startWindowOn: boolean, startWindowMin: number): Date {
  const base = nextOccurrenceMs(scheduledAt, Date.now());
  return new Date(startWindowOn ? base + startWindowMin * 60_000 : base);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export interface StakeSetupSheetProps {
  visible: boolean;
  /** The task a stake is being attached to. */
  task: Task;
  onClose: () => void;
  /**
   * Called with the armed stake on Confirm, MANUAL trigger only. The caller
   * should route into the focus session and pass this through so the session
   * arms the lock on mount. Scheduled stakes are persisted directly by this
   * sheet via `scheduleStake` and never reach this callback.
   */
  onArm: (armed: ArmedStake) => void;
}

export function StakeSetupSheet({ visible, task, onClose, onArm }: StakeSetupSheetProps) {
  const reduceMotion = useReduceMotion();

  const defaultSessionMin = useSettingsStore((s) => s.settings.defaultSessionMin);
  const stakeStrength = useSettingsStore((s) => s.settings.stakeStrength);
  // Raw-select the whole settings object (a single stable field, not a
  // derived one) so `isQuietHours` can be evaluated against the actual arm
  // moment for the scheduled quiet-hours refusal copy below.
  const settings = useSettingsStore((s) => s.settings);

  const selection = useStakesStore(selectStakeSelection);
  const canStartStake = useStakesStore((s) => s.canStartStake);
  const isUntilDoneEligible = useStakesStore((s) => s.isUntilDoneEligible);
  const scheduleStake = useStakesStore((s) => s.scheduleStake);

  // The leisure-app picker ("choose what's on the line", required step).
  const [appPickerOpen, setAppPickerOpen] = useState(false);

  // -- Local draft state, one field per PRD §8.8 question --
  const [stakeOn, setStakeOn] = useState(true);
  const [hold, setHold] = useState<StakeSession["hold"]>("session");
  const [scheduledOn, setScheduledOn] = useState(false);
  const [scheduledAt, setScheduledAt] = useState<Date>(() => new Date(Date.now() + 30 * 60 * 1000));
  const [startWindowOn, setStartWindowOn] = useState(false);
  const [startWindowMin, setStartWindowMin] = useState(START_WINDOW_DEFAULT_MIN);
  const [sessionMin, setSessionMin] = useState(DEFAULT_SESSION_MIN);
  const [verification, setVerification] = useState<"photo" | "screenshot">("photo");
  // The visible, non-silent refusal reason from a failed pre-flight/confirm.
  const [refusal, setRefusal] = useState<StartStakeRefusal | null>(null);

  const untilDoneEligible = isUntilDoneEligible(task.id);
  const hasSelection = useMemo(() => hasStakeSelection(selection), [selection]);
  const selectionCount = selection?.count ?? 0;

  // The instant a scheduled stake would actually arm, and whether THAT
  // instant (not "now") is what's in quiet hours, only cheap to compute and
  // only read while a refusal is visible, so no memoization needed.
  const scheduledArmMoment = scheduledOn ? computeArmMoment(scheduledAt, startWindowOn, startWindowMin) : null;
  const scheduledQuietHoursConflict =
    scheduledArmMoment && isQuietHours(settings, scheduledArmMoment.getTime()) ? scheduledArmMoment : null;

  // Re-seed local state when the sheet (re)opens for a task.
  useEffect(() => {
    if (!visible) return;
    setStakeOn(true);
    setHold("session");
    setScheduledOn(false);
    setScheduledAt(new Date(Date.now() + 30 * 60 * 1000));
    setStartWindowOn(false);
    setStartWindowMin(START_WINDOW_DEFAULT_MIN);
    setSessionMin(clampTo(defaultSessionMin, SESSION_MIN_BOUNDS, DEFAULT_SESSION_MIN));
    setVerification("photo");
    setAppPickerOpen(false);
    setRefusal(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, task.id]);

  // If the task no longer qualifies for `until_done` (e.g. its estimate grew)
  // while it's selected, fall back to the always-available session hold
  // rather than leaving an invalid choice active.
  useEffect(() => {
    if (hold === "until_done" && !untilDoneEligible) setHold("session");
  }, [hold, untilDoneEligible]);

  // Clear a shown refusal as soon as the user changes something that could
  // resolve it (never leave a stale reason on screen).
  useEffect(() => {
    setRefusal(null);
  }, [hold, scheduledOn, selection, stakeOn]);

  const handleConfirm = () => {
    if (!stakeOn) {
      onClose();
      return;
    }

    // --- Pre-flight, in the exact order startStake itself gates on, so the
    //     reason is shown BEFORE committing, not after (the bug this fixes).

    if (!hasSelection) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
      setRefusal("no_selection");
      return;
    }

    if (hold === "until_done" && !untilDoneEligible) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
      setRefusal("not_eligible");
      return;
    }

    const preflight = canStartStake();
    if (!preflight.ok) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
      setRefusal(preflight.reason);
      return;
    }

    // `until_done` unlocks on image proof (doc `04` §4); a session hold
    // unlocks on focus time served, which IS `focus_time`, not a user choice.
    const verificationValue: StakeSession["verification"] = hold === "until_done" ? verification : "focus_time";

    if (scheduledOn) {
      // Scheduled: nothing starts now, so persist directly rather than
      // routing into the focus session. Stays on this screen either way.
      const result = scheduleStake({
        taskId: task.id,
        hold,
        trigger: "scheduled",
        sessionMin,
        scheduledAt: nextOccurrenceMs(scheduledAt, Date.now()),
        startWindowMin: startWindowOn ? startWindowMin : undefined,
        verification: verificationValue,
      });
      if (!result.ok) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
        setRefusal(result.reason);
        return;
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      onClose();
      return;
    }

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    onArm({
      taskId: task.id,
      hold,
      trigger: "manual",
      verification: verificationValue,
      sessionMin,
    });
    onClose();
  };

  // Copy for the strength framing (never a number the user has to reason about).
  const strengthLabel = stakeStrength >= 0.66 ? "Firm" : stakeStrength >= 0.4 ? "Balanced" : "Gentle";

  return (
    <>
      <Modal
        visible={visible}
        transparent
        animationType={reduceMotion ? "fade" : "slide"}
        onRequestClose={onClose}
        accessibilityViewIsModal
      >
        <Pressable
          className="flex-1 bg-black/40"
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Dismiss"
        >
          <View className="flex-1 justify-end">
            <Pressable onPress={() => {}}>
              <Animated.View
                entering={reduceMotion ? FadeIn.duration(DURATIONS.base) : FadeInUp.duration(DURATIONS.base)}
                className="rounded-t-3xl bg-neutral-100"
                style={shadows.xl}
              >
                <SafeAreaView edges={["bottom"]}>
                  {/* Grabber */}
                  <View className="items-center pt-3">
                    <View className="h-1.5 w-10 rounded-full bg-neutral-300" />
                  </View>

                  {/* Header */}
                  <View className="flex-row items-start justify-between px-5 pt-3">
                    <View className="flex-1 pr-3">
                      <Text className="text-overline font-semibold uppercase tracking-wide text-primary-600">
                        Stake setup
                      </Text>
                      <Heading size="h3" className="mt-1" numberOfLines={2}>
                        {task.title}
                      </Heading>
                      <Text className="mt-1 text-caption text-neutral-500">
                        A lock that lifts when you've earned it. You're always in control.
                      </Text>
                    </View>
                    <Pressable
                      onPress={onClose}
                      hitSlop={8}
                      className="h-9 w-9 items-center justify-center rounded-full bg-white"
                      style={shadows.xs}
                      accessibilityRole="button"
                      accessibilityLabel="Close"
                    >
                      <Ionicons name="close" size={20} color={colors.light.textSecondary} />
                    </Pressable>
                  </View>

                  <ScrollView
                    className="mt-4 max-h-[60vh]"
                    contentContainerClassName="px-5 pb-4 gap-5"
                    keyboardShouldPersistTaps="handled"
                    showsVerticalScrollIndicator={false}
                  >
                    {/* --- 1. Put something on the line --- */}
                    <View
                      className="flex-row items-center justify-between rounded-xl border border-neutral-200 bg-white px-4 py-3.5"
                      style={shadows.xs}
                    >
                      <View className="flex-1 pr-3">
                        <Text className="text-body-lg font-medium text-neutral-900">
                          Put something on the line
                        </Text>
                        <Text className="mt-0.5 text-caption text-neutral-500">
                          A gentle nudge from you, to you. You can lift it any time.
                        </Text>
                      </View>
                      <Toggle
                        value={stakeOn}
                        onChange={setStakeOn}
                        a11yLabel="Put something on the line for this task"
                      />
                    </View>

                    {!stakeOn ? (
                      <Text className="px-1 text-caption text-neutral-500">
                        No lock this time. Turn this on whenever you're ready.
                      </Text>
                    ) : (
                      <>
                        {/* --- 2. Unlock when? --- */}
                        <View className="gap-2">
                          <Text className="text-label font-semibold text-neutral-700">Unlock when?</Text>
                          <View className="gap-2">
                            <HoldOptionTile
                              icon="hourglass-outline"
                              label="When this session ends"
                              blurb="Apps come back once you've focused for the session length below."
                              active={hold === "session"}
                              onPress={() => {
                                setHold("session");
                                Haptics.selectionAsync().catch(() => {});
                              }}
                            />
                            <HoldOptionTile
                              icon="checkmark-done-outline"
                              label="When it's done"
                              blurb={
                                untilDoneEligible
                                  ? "Apps come back once you show what you did."
                                  : "Only offered when this task fits inside one session."
                              }
                              active={hold === "until_done"}
                              disabled={!untilDoneEligible}
                              onPress={() => {
                                setHold("until_done");
                                Haptics.selectionAsync().catch(() => {});
                              }}
                            />
                          </View>
                        </View>

                        {/* --- 3. Optional scheduled trigger --- */}
                        <View className="gap-2">
                          <View
                            className="flex-row items-center justify-between rounded-xl border border-neutral-200 bg-white px-4 py-3.5"
                            style={shadows.xs}
                          >
                            <View className="flex-1 pr-3">
                              <Text className="text-body-lg font-medium text-neutral-900">
                                {scheduledOn
                                  ? `Lock automatically at ${formatTime(scheduledAt)}`
                                  : "Lock automatically at a time"}
                              </Text>
                              <Text className="mt-0.5 text-caption text-neutral-500">
                                Arms itself later, no need to remember.
                              </Text>
                            </View>
                            <Toggle
                              value={scheduledOn}
                              onChange={setScheduledOn}
                              a11yLabel="Lock automatically at a set time"
                            />
                          </View>

                          {scheduledOn ? (
                            <Animated.View
                              entering={reduceMotion ? undefined : FadeIn.duration(DURATIONS.fast)}
                              className="gap-3 rounded-xl border border-neutral-200 bg-white p-3.5"
                              style={shadows.xs}
                            >
                              <View>
                                <Text className="mb-1.5 text-label font-medium text-neutral-600">Starts at</Text>
                                <DateTimePickerCrossPlatform
                                  value={scheduledAt}
                                  onChange={setScheduledAt}
                                  mode="time"
                                  accessibilityLabel="Lock start time"
                                />
                              </View>
                              <View className="flex-row items-center justify-between border-t border-neutral-100 pt-3">
                                <Text className="flex-1 pr-3 text-label font-medium text-neutral-700">
                                  {startWindowOn
                                    ? `If I haven't started within ${startWindowMin} min`
                                    : "If I haven't started within X min"}
                                </Text>
                                <Toggle
                                  value={startWindowOn}
                                  onChange={setStartWindowOn}
                                  a11yLabel="Lock if I haven't started within a window"
                                />
                              </View>
                              {startWindowOn ? (
                                <View className="flex-row items-center justify-end">
                                  <Stepper
                                    value={startWindowMin}
                                    min={START_WINDOW_BOUNDS.min}
                                    max={START_WINDOW_BOUNDS.max}
                                    step={5}
                                    format={(v) => `${v} min`}
                                    onChange={setStartWindowMin}
                                    a11yLabel="start window minutes"
                                  />
                                </View>
                              ) : null}
                            </Animated.View>
                          ) : null}
                        </View>

                        {/* --- 4. Session length --- */}
                        <View className="gap-2">
                          <View className="flex-row items-center justify-between">
                            <Text className="text-label font-semibold text-neutral-700">Session length</Text>
                            <Pressable
                              onPress={() => {
                                setSessionMin(SESSION_MIN_BOUNDS.min);
                                Haptics.selectionAsync().catch(() => {});
                              }}
                              hitSlop={8}
                              accessibilityRole="button"
                              accessibilityLabel="Just get me started. Sets a short session."
                            >
                              <Text className="text-label font-medium text-primary-600">
                                Just get me started
                              </Text>
                            </Pressable>
                          </View>
                          <View
                            className="flex-row items-center justify-between rounded-xl border border-neutral-200 bg-white px-4 py-3"
                            style={shadows.xs}
                          >
                            <Text className="flex-1 pr-2 text-caption text-neutral-500">
                              {hold === "until_done"
                                ? "Longest this can run before it turns into a timed session."
                                : "Apps come back once you've focused for this long."}
                            </Text>
                            <Stepper
                              value={sessionMin}
                              min={SESSION_MIN_BOUNDS.min}
                              max={SESSION_MIN_BOUNDS.max}
                              step={SESSION_STEP_MIN}
                              format={(v) => `${v} min`}
                              onChange={setSessionMin}
                              a11yLabel="session length"
                            />
                          </View>
                        </View>

                        {/* --- 5. Verification, only where it's a real choice --- */}
                        {hold === "until_done" ? (
                          <View className="gap-2">
                            <Text className="text-label font-semibold text-neutral-700">
                              How you&apos;ll show it&apos;s done
                            </Text>
                            <InlineSegmented
                              value={verification}
                              options={[
                                { key: "photo", label: "Photo" },
                                { key: "screenshot", label: "Screenshot" },
                              ]}
                              onChange={setVerification}
                              a11yLabel="verification method"
                            />
                            <Text className="text-caption text-neutral-500">
                              A quick, lenient check on what you submit. It&apos;s a nudge, never a grade.
                            </Text>
                          </View>
                        ) : null}

                        {/* --- Choose apps (required step) --- */}
                        <View className="gap-2">
                          <Text className="text-label font-semibold text-neutral-700">What&apos;s on the line</Text>
                          <Pressable
                            onPress={() => {
                              setAppPickerOpen(true);
                              Haptics.selectionAsync().catch(() => {});
                            }}
                            className={`flex-row items-center gap-3 rounded-xl border bg-white px-3.5 py-3 active:opacity-70 ${
                              refusal === "no_selection" ? "border-warning-300" : "border-neutral-200"
                            }`}
                            style={shadows.xs}
                            accessibilityRole="button"
                            accessibilityLabel="Choose which apps are on the line"
                            accessibilityHint={
                              selectionCount > 0
                                ? `${selectionCount} apps chosen. Tap to change.`
                                : "Required. Tap to choose apps."
                            }
                          >
                            <View className="h-9 w-9 items-center justify-center rounded-full bg-neutral-100">
                              <Ionicons name="apps-outline" size={18} color={colors.light.textSecondary} />
                            </View>
                            <View className="flex-1">
                              <Text className="text-label font-medium text-neutral-900">Choose apps</Text>
                              <Text className="mt-0.5 text-caption text-neutral-500">
                                {selectionCount > 0
                                  ? `${selectionCount} app${selectionCount === 1 ? "" : "s"} on the line`
                                  : "Name what pulls you away"}
                              </Text>
                            </View>
                            <Ionicons name="chevron-forward" size={18} color={colors.light.textDisabled} />
                          </Pressable>
                        </View>

                        {/* Strength framing, words, not a slider the user must reason about. */}
                        <View className="flex-row items-center gap-2 px-1">
                          <Badge label={strengthLabel} tone="primary" />
                          <Text className="flex-1 text-caption text-neutral-500">
                            Ampora eases off automatically if a stretch gets rough.
                          </Text>
                        </View>
                      </>
                    )}
                  </ScrollView>

                  {/* Non-silent refusal, always visible above the footer, never
                      only shown after navigating away (that was the bug). */}
                  {refusal ? (
                    <View
                      className="mx-5 mb-2 flex-row items-start gap-2 rounded-lg bg-warning-100 px-3 py-2.5"
                      accessibilityRole="alert"
                    >
                      <Ionicons name="information-circle-outline" size={16} color={colors.light.warningStrong} />
                      <Text className="flex-1 text-caption font-medium text-warning-700">
                        {refusalMessage(refusal, scheduledOn, scheduledQuietHoursConflict ?? undefined)}
                      </Text>
                    </View>
                  ) : null}

                  {/* Footer, Confirm + cancel. */}
                  <View className="border-t border-neutral-200 bg-white px-5 pb-2 pt-3" style={shadows.md}>
                    <Button
                      title={stakeOn ? (scheduledOn ? "Schedule this stake" : "Arm this stake") : "Continue without a lock"}
                      variant="primaryBlue"
                      size="lg"
                      onPress={handleConfirm}
                      icon={<Ionicons name="lock-closed-outline" size={18} color={colors.light.primaryForeground} />}
                      accessibilityLabel={
                        stakeOn ? "Confirm and put something on the line" : "Continue without a lock"
                      }
                    />
                    <Pressable
                      onPress={onClose}
                      className="mt-2 items-center py-2.5"
                      accessibilityRole="button"
                      accessibilityLabel="Not now"
                    >
                      <Text className="text-label font-medium text-neutral-500">Not now</Text>
                    </Pressable>
                  </View>
                </SafeAreaView>
              </Animated.View>
            </Pressable>
          </View>
        </Pressable>
      </Modal>

      {/* Leisure-app picker, "choose what's on the line". Rendered as a sibling
          modal so it layers above this sheet when opened. */}
      <AppPicker visible={appPickerOpen} onClose={() => setAppPickerOpen(false)} />
    </>
  );
}

// ---------------------------------------------------------------------------
// Hold-option tile, replaces the deleted completion-condition tiles. Exactly
// two, mutually exclusive: `session` (always available) and `until_done`
// (disabled, with a short honest reason, when the task doesn't qualify).
// ---------------------------------------------------------------------------

function HoldOptionTile({
  icon,
  label,
  blurb,
  active,
  disabled,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  blurb: string;
  active: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <PressableScale
      onPress={disabled ? undefined : onPress}
      haptic={disabled ? false : "selection"}
      disabled={disabled}
      className={`flex-row items-center gap-3 rounded-xl border p-3.5 ${
        active ? "border-primary-500 bg-primary-50" : "border-neutral-200 bg-white"
      } ${disabled ? "opacity-40" : ""}`}
      style={active ? undefined : shadows.xs}
      accessibilityRole="radio"
      accessibilityState={{ selected: active, disabled: !!disabled }}
      accessibilityLabel={`${label}. ${blurb}`}
    >
      <View
        className={`h-10 w-10 items-center justify-center rounded-full ${
          active ? "bg-primary-100" : "bg-neutral-100"
        }`}
      >
        <Ionicons name={icon} size={20} color={active ? colors.light.primary : colors.light.textMuted} />
      </View>
      <View className="flex-1">
        <Text className={`text-body-lg font-medium ${active ? "text-primary-700" : "text-neutral-900"}`}>
          {label}
        </Text>
        {/* 3 lines, not 2. The longest blurb ("Apps come back once you've */}
        {/* focused for the session length below.") lands at roughly 35 */}
        {/* characters per line in Lexend against the ~250px this column */}
        {/* gets, so it fills both lines with nothing spare. One notch of */}
        {/* Dynamic Type used to cut the sentence mid-word, and this is the */}
        {/* copy that explains what the lock will actually do. */}
        <Text className="mt-0.5 text-caption text-neutral-500" numberOfLines={3}>
          {blurb}
        </Text>
      </View>
      <Ionicons
        name={active ? "radio-button-on" : "radio-button-off"}
        size={20}
        color={active ? colors.light.primary : colors.light.borderStrong}
      />
    </PressableScale>
  );
}
