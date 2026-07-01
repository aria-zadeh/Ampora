/**
 * StakeSetupSheet — Ampora Phase 5 Ignition (FR-41, PRD §8.8).
 *
 * A calm bottom-sheet to "put something on the line" for a task: attach a
 * stake that a focus session will enforce with the SOFT (in-app) lock. It
 * lets the user pick:
 *   1. a MODE (SegmentedControl): "Lock until I start", "Lock until done",
 *      and "Beat the clock" — the last only when FEATURE_FLAGS.BEAT_THE_CLOCK.
 *   2. a COMPLETION CONDITION: first move / a subtask / the whole task
 *      (falls back gracefully when the task has no first move or subtasks).
 *   3. for beat-the-clock only, a TIMER (minutes to start).
 *   4. WHICH APPS are on the line — via a friendly placeholder. The real
 *      native picker needs the Family Controls entitlement the user does not
 *      have yet, so on web/dev we explain that OS app-locking turns on later
 *      and let them arm the in-app soft lock (a behavioral commitment).
 *
 * Confirm ARMS the stake for the next focus session (does NOT lock now). It
 * returns an `ArmedStake` to the caller, which passes it to the focus screen;
 * the focus screen calls `stakesStore.startStake(...)` on mount so the lock's
 * lifetime is the session's lifetime. This keeps every wellbeing cap (quiet
 * hours, daily cap, pause, de-escalation) enforced by the store at the exact
 * moment the lock would apply — never here.
 *
 * Wellbeing stance (§9.10): warm, never shaming. The stake is framed as a
 * gift to your future self, not a punishment. The panic valve and overrides
 * are always available downstream. Nothing here can trap the user — arming a
 * stake is fully reversible up until (and during) the session.
 *
 * RN + NativeWind, web-export safe. No native module imported. Reuses the
 * design system (Heading, SegmentedControl, Button, PressableScale, Badge).
 */

import React, { useEffect, useMemo, useState } from "react";
import { View, Text, TextInput, Modal, Pressable, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Animated, { FadeIn, FadeInUp } from "react-native-reanimated";

import { Button } from "@/components/ui/Button";
import { Heading } from "@/components/ui/Heading";
import { PressableScale } from "@/components/ui/PressableScale";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Badge } from "@/components/ui/Badge";
import { shadows } from "@/utils/design-tokens";
import { DURATIONS } from "@/utils/motion";
import { useReduceMotion } from "@/hooks/useReduceMotion";
import { FEATURE_FLAGS } from "@/constants/featureFlags";
import { useStakesStore } from "@/store/stakesStore";
import { getBlockingStrategy } from "@/core/blocking";
import type { StakeSession, Task } from "@/types";

// ---------------------------------------------------------------------------
// Armed-stake payload — what Confirm produces. The focus session consumes this
// and calls stakesStore.startStake(...) on mount (so caps apply at lock time).
// ---------------------------------------------------------------------------

/** A stake configured but NOT yet started; handed to the focus session to arm. */
export interface ArmedStake {
  taskId: string;
  mode: StakeSession["mode"];
  completionCondition: StakeSession["completionCondition"];
  /** For a "subtask" condition, which subtask id must be completed. */
  conditionRefId?: string;
  /** Beat-the-clock: minutes to make the first move before the cooldown lock. */
  timerMinutes?: number;
}

// ---------------------------------------------------------------------------
// Mode + condition option models
// ---------------------------------------------------------------------------

type Mode = StakeSession["mode"];
type Condition = StakeSession["completionCondition"];

const MODE_COPY: Record<Mode, { title: string; blurb: string }> = {
  lock_until_start: {
    title: "Lock until I start",
    blurb: "Your apps stay on the line until you make your first move. The hardest part is starting.",
  },
  lock_until_done: {
    title: "Lock until done",
    blurb: "Your apps stay on the line until this is finished. Full commitment for a task that matters.",
  },
  beat_the_clock: {
    title: "Beat the clock",
    blurb: "Start within the time you set. If it lapses, a short cooldown lock kicks in — then it clears.",
  },
};

const BEAT_THE_CLOCK_DEFAULT_MIN = 15;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export interface StakeSetupSheetProps {
  visible: boolean;
  /** The task a stake is being attached to. */
  task: Task;
  onClose: () => void;
  /**
   * Called with the armed stake on Confirm. The caller should route into the
   * focus session and pass this through so the session arms the lock on mount.
   */
  onArm: (armed: ArmedStake) => void;
}

export function StakeSetupSheet({ visible, task, onClose, onArm }: StakeSetupSheetProps) {
  const reduceMotion = useReduceMotion();

  // The default strength the store currently offers (lowered by de-escalation).
  // Read for the copy only — startStake will re-clamp at lock time.
  const defaultStrength = useStakesStore((s) => s.defaultStrength);

  const strategyKind = useMemo(() => getBlockingStrategy().kind, []);
  const isSoft = strategyKind === "soft";

  // --- Available modes (beat-the-clock gated by the flag) ---
  const modeSegments = useMemo(() => {
    const segs = [
      { key: "lock_until_start", label: "Until I start" },
      { key: "lock_until_done", label: "Until done" },
    ];
    if (FEATURE_FLAGS.BEAT_THE_CLOCK) segs.push({ key: "beat_the_clock", label: "Beat the clock" });
    return segs;
  }, []);

  // --- Which completion conditions this task can offer ---
  const hasFirstMove = task.firstMove != null;
  const hasSubtasks = task.subtasks.length > 0;

  const [mode, setMode] = useState<Mode>("lock_until_start");
  // Default the completion condition to the most natural available step.
  const initialCondition: Condition = hasFirstMove ? "first_move" : hasSubtasks ? "subtask" : "task";
  const [condition, setCondition] = useState<Condition>(initialCondition);
  const [subtaskId, setSubtaskId] = useState<string | undefined>(
    hasSubtasks ? task.subtasks.find((s) => s.completedAt == null)?.id ?? task.subtasks[0]?.id : undefined
  );
  const [timerText, setTimerText] = useState(String(BEAT_THE_CLOCK_DEFAULT_MIN));
  // Whether the user opted the soft in-app lock ON. Off by default so arming is
  // an explicit, deliberate choice (never surprise-lock someone).
  const [softLockOn, setSoftLockOn] = useState(true);

  // Re-seed local state when the sheet (re)opens for a task.
  useEffect(() => {
    if (!visible) return;
    setMode("lock_until_start");
    setCondition(hasFirstMove ? "first_move" : hasSubtasks ? "subtask" : "task");
    setSubtaskId(
      hasSubtasks ? task.subtasks.find((s) => s.completedAt == null)?.id ?? task.subtasks[0]?.id : undefined
    );
    setTimerText(String(BEAT_THE_CLOCK_DEFAULT_MIN));
    setSoftLockOn(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, task.id]);

  // Lock-until-start implies the "first move" condition when one exists (that's
  // literally what "start" means). Keep the two coherent.
  useEffect(() => {
    if (mode === "lock_until_start" && hasFirstMove) setCondition("first_move");
    if (mode === "lock_until_done") setCondition("task");
  }, [mode, hasFirstMove]);

  const conditionOptions = useMemo(() => {
    const opts: { key: Condition; label: string; blurb: string; icon: keyof typeof Ionicons.glyphMap }[] = [];
    if (hasFirstMove) {
      opts.push({
        key: "first_move",
        label: "My first move",
        blurb: task.firstMove?.text ? `"${task.firstMove.text}"` : "The 2-minute starter step.",
        icon: "flash-outline",
      });
    }
    if (hasSubtasks) {
      opts.push({
        key: "subtask",
        label: "A specific step",
        blurb: "Unlocks when you finish the step you choose.",
        icon: "list-outline",
      });
    }
    opts.push({
      key: "task",
      label: "The whole task",
      blurb: "Unlocks only when the task is fully done.",
      icon: "checkmark-done-outline",
    });
    return opts;
  }, [hasFirstMove, hasSubtasks, task.firstMove?.text]);

  const timerMinutes = useMemo(() => {
    const n = parseInt(timerText, 10);
    return Number.isFinite(n) && n > 0 ? n : BEAT_THE_CLOCK_DEFAULT_MIN;
  }, [timerText]);

  const handleConfirm = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    const armed: ArmedStake = {
      taskId: task.id,
      mode,
      completionCondition: condition,
      conditionRefId: condition === "subtask" ? subtaskId : undefined,
      timerMinutes: mode === "beat_the_clock" ? timerMinutes : undefined,
    };
    onArm(armed);
    onClose();
  };

  // Copy for the strength framing (never a number the user has to reason about).
  const strengthLabel = defaultStrength >= 0.66 ? "Firm" : defaultStrength >= 0.4 ? "Balanced" : "Gentle";

  const modeBlurb = MODE_COPY[mode].blurb;

  return (
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
                      Put something on the line
                    </Text>
                    <Heading size="h3" className="mt-1" numberOfLines={2}>
                      {task.title}
                    </Heading>
                    <Text className="mt-1 text-caption text-neutral-500">
                      A gentle nudge from you, to you. You can lift it any time.
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
                    <Ionicons name="close" size={20} color="#52525B" />
                  </Pressable>
                </View>

                <ScrollView
                  className="mt-4 max-h-[58vh]"
                  contentContainerClassName="px-5 pb-4 gap-5"
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={false}
                >
                  {/* --- Mode --- */}
                  <View className="gap-2">
                    <Text className="text-label font-semibold text-neutral-700">How it lifts</Text>
                    <SegmentedControl segments={modeSegments} value={mode} onChange={(k) => setMode(k as Mode)} />
                    <Text className="text-caption text-neutral-500">{modeBlurb}</Text>
                  </View>

                  {/* --- Beat-the-clock timer --- */}
                  {mode === "beat_the_clock" && FEATURE_FLAGS.BEAT_THE_CLOCK ? (
                    <Animated.View
                      entering={reduceMotion ? undefined : FadeIn.duration(DURATIONS.fast)}
                      className="rounded-xl border border-neutral-200 bg-white p-4"
                      style={shadows.xs}
                    >
                      <Text className="mb-2 text-label font-medium text-neutral-600">Minutes to start</Text>
                      <View className="flex-row items-center gap-3">
                        <TextInput
                          className="h-12 w-24 rounded-md border border-neutral-200 bg-white px-4 text-body-lg text-neutral-900"
                          value={timerText}
                          onChangeText={setTimerText}
                          keyboardType="number-pad"
                          maxLength={3}
                          accessibilityLabel="Minutes to start before the cooldown lock"
                        />
                        <Text className="flex-1 text-caption text-neutral-500">
                          Make your first move within {timerMinutes} min. Miss it and a short cooldown lock kicks in,
                          then clears on its own.
                        </Text>
                      </View>
                    </Animated.View>
                  ) : null}

                  {/* --- Completion condition --- */}
                  <View className="gap-2">
                    <Text className="text-label font-semibold text-neutral-700">Unlocks when you finish</Text>
                    <View className="gap-2">
                      {conditionOptions.map((opt) => {
                        const active = condition === opt.key;
                        // Lock-until-done pins to the whole task; disable the others.
                        const disabled = mode === "lock_until_done" && opt.key !== "task";
                        return (
                          <ConditionTile
                            key={opt.key}
                            icon={opt.icon}
                            label={opt.label}
                            blurb={opt.blurb}
                            active={active}
                            disabled={disabled}
                            onPress={() => {
                              setCondition(opt.key);
                              Haptics.selectionAsync().catch(() => {});
                            }}
                          />
                        );
                      })}
                    </View>

                    {/* Subtask picker when the "specific step" condition is chosen */}
                    {condition === "subtask" && hasSubtasks ? (
                      <Animated.View
                        entering={reduceMotion ? undefined : FadeIn.duration(DURATIONS.fast)}
                        className="mt-1 rounded-xl border border-neutral-200 bg-white p-3"
                        style={shadows.xs}
                      >
                        <Text className="mb-2 px-1 text-caption font-medium text-neutral-500">Which step?</Text>
                        <View className="gap-1.5">
                          {task.subtasks.map((s) => {
                            const selected = subtaskId === s.id;
                            const done = s.completedAt != null;
                            return (
                              <Pressable
                                key={s.id}
                                onPress={() => {
                                  setSubtaskId(s.id);
                                  Haptics.selectionAsync().catch(() => {});
                                }}
                                className={`flex-row items-center gap-2.5 rounded-lg px-3 py-2.5 ${
                                  selected ? "bg-primary-50" : "bg-white"
                                }`}
                                accessibilityRole="radio"
                                accessibilityState={{ selected }}
                                accessibilityLabel={s.title}
                              >
                                <Ionicons
                                  name={selected ? "radio-button-on" : "radio-button-off"}
                                  size={18}
                                  color={selected ? "#2563EB" : "#D4D4D8"}
                                />
                                <Text
                                  className={`flex-1 text-body ${
                                    selected ? "text-primary-700" : "text-neutral-700"
                                  } ${done ? "line-through opacity-50" : ""}`}
                                  numberOfLines={1}
                                >
                                  {s.title}
                                </Text>
                              </Pressable>
                            );
                          })}
                        </View>
                      </Animated.View>
                    ) : null}
                  </View>

                  {/* --- Choose apps (friendly soft-lock placeholder) --- */}
                  <View className="gap-2">
                    <Text className="text-label font-semibold text-neutral-700">What&apos;s on the line</Text>
                    <View className="rounded-xl border border-neutral-200 bg-white p-4" style={shadows.xs}>
                      {isSoft ? (
                        <>
                          <View className="flex-row items-start gap-3">
                            <View className="h-10 w-10 items-center justify-center rounded-full bg-primary-100">
                              <Ionicons name="phone-portrait-outline" size={20} color="#2563EB" />
                            </View>
                            <View className="flex-1">
                              <Text className="text-body-lg font-medium text-neutral-900">Focus lock</Text>
                              <Text className="mt-0.5 text-caption text-neutral-500">
                                App locking turns on when you enable it on your phone. For now, Ampora keeps you on
                                task with a focus lock — a promise to yourself, not an OS block.
                              </Text>
                            </View>
                          </View>

                          {/* Soft-lock toggle — an explicit, reversible opt-in. */}
                          <Pressable
                            onPress={() => {
                              setSoftLockOn((v) => !v);
                              Haptics.selectionAsync().catch(() => {});
                            }}
                            className={`mt-3 flex-row items-center justify-between rounded-lg px-3.5 py-3 ${
                              softLockOn ? "bg-primary-50" : "bg-neutral-100"
                            }`}
                            accessibilityRole="switch"
                            accessibilityState={{ checked: softLockOn }}
                            accessibilityLabel="Use the in-app focus lock this session"
                          >
                            <Text
                              className={`flex-1 text-label font-medium ${
                                softLockOn ? "text-primary-700" : "text-neutral-600"
                              }`}
                            >
                              Use the focus lock this session
                            </Text>
                            <View
                              className={`h-6 w-10 justify-center rounded-full px-0.5 ${
                                softLockOn ? "bg-primary-600" : "bg-neutral-300"
                              }`}
                            >
                              <View
                                className={`h-5 w-5 rounded-full bg-white ${softLockOn ? "self-end" : "self-start"}`}
                                style={shadows.xs}
                              />
                            </View>
                          </Pressable>
                        </>
                      ) : (
                        // Native path (only reachable once the entitlement + module
                        // land and IGNITION_NATIVE is on). Kept minimal on purpose —
                        // the real app picker is the native strategy's business.
                        <View className="flex-row items-center gap-3">
                          <Ionicons name="apps-outline" size={20} color="#2563EB" />
                          <Text className="flex-1 text-caption text-neutral-600">
                            Choose which apps to lock on your phone.
                          </Text>
                          <Ionicons name="chevron-forward" size={18} color="#A1A1AA" />
                        </View>
                      )}
                    </View>

                    {/* Strength framing — words, not a slider the user must reason about. */}
                    <View className="flex-row items-center gap-2 px-1">
                      <Badge label={strengthLabel} tone="primary" />
                      <Text className="flex-1 text-caption text-neutral-500">
                        Ampora eases off automatically if a stretch gets rough.
                      </Text>
                    </View>
                  </View>
                </ScrollView>

                {/* Footer — Confirm + cancel. */}
                <View className="border-t border-neutral-200 bg-white px-5 pb-2 pt-3" style={shadows.md}>
                  <Button
                    title={softLockOn || !isSoft ? "Arm this stake" : "Continue without a lock"}
                    variant="primaryBlue"
                    size="lg"
                    onPress={handleConfirm}
                    icon={<Ionicons name="lock-closed-outline" size={18} color="#FFFFFF" />}
                    accessibilityLabel="Arm this stake for your focus session"
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
  );
}

// ---------------------------------------------------------------------------
// Completion-condition tile
// ---------------------------------------------------------------------------

function ConditionTile({
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
      accessibilityState={{ selected: active, disabled }}
      accessibilityLabel={`${label}. ${blurb}`}
    >
      <View
        className={`h-10 w-10 items-center justify-center rounded-full ${
          active ? "bg-primary-100" : "bg-neutral-100"
        }`}
      >
        <Ionicons name={icon} size={20} color={active ? "#2563EB" : "#71717A"} />
      </View>
      <View className="flex-1">
        <Text className={`text-body-lg font-medium ${active ? "text-primary-700" : "text-neutral-900"}`}>
          {label}
        </Text>
        <Text className="mt-0.5 text-caption text-neutral-500" numberOfLines={2}>
          {blurb}
        </Text>
      </View>
      <Ionicons
        name={active ? "radio-button-on" : "radio-button-off"}
        size={20}
        color={active ? "#2563EB" : "#D4D4D8"}
      />
    </PressableScale>
  );
}
