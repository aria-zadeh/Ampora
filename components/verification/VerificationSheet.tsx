/**
 * VerificationSheet — Ampora Phase 4 (FR-77/77b/78, doc `04`).
 *
 * A bottom-sheet modal to COMPLETE a task with a chosen verification method.
 * It is the "unlock flow" of doc `04` §6. It records a `Proof` and completes
 * the task — and, when this task is the subject of the active Ignition stake
 * session, it is also THE `until_done` unlock path: submitting proof (or the
 * always-available override) calls `stakesStore.completeStake` so the shield
 * actually lifts (doc `04` §6). A `hold: 'session'` stake is never unlocked
 * from here — that hold is served by focus time only, and `completeStake` is
 * a documented no-op for it, so this sheet does not try to work around that.
 *
 * Verification spectrum offered (doc `04` §2/§4 — launch keeps three tiers
 * only, `V2_Changes.md` §3):
 * - honor       — "I did it", always available, zero friction (Tier 0).
 * - focus_time  — auto-passes once enough focused minutes are recorded (Tier
 *                 1, the recommended backbone). Scoped to the active stake
 *                 session's own focus time when one is active, else to every
 *                 focus session recorded against the task.
 * - photo /     — pick an image via expo-image-picker IF installed; a lenient,
 *   screenshot     optional AI plausibility check runs and DEFAULTS TO PASS.
 *                 If the picker is missing (web / not installed) the option
 *                 degrades to "attach later" and still completes on honor.
 *
 * Lenient by design (FR-78, doc `04` §7): nothing ever traps the user. There
 * is always an explicit override ("Complete anyway"), the AI errs toward
 * pass, and a failed/uncertain check never blocks completion — it just
 * records the verdict on the Proof. No shame copy anywhere.
 *
 * Graceful degradation:
 * - No ANTHROPIC key  -> the plausibility check returns pass (services/ai is
 *   fully fallback-safe); we never crash on it and treat any throw as pass.
 * - No expo-image-picker -> photo/screenshot become "attach later" (honor).
 * - Web / no camera   -> same as above.
 *
 * RN + NativeWind only, web-export safe. Uses expo-haptics, the design system,
 * useTaskStore, useSessionStore, useProofStore.
 */

import React, { useMemo, useState } from "react";
import { View, Text, TextInput, Modal, Pressable, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import * as Haptics from "expo-haptics";
import Animated, { FadeIn, FadeInUp } from "react-native-reanimated";
import { Button } from "@/components/ui/Button";
import { Heading } from "@/components/ui/Heading";
import { PressableScale } from "@/components/ui/PressableScale";
import { Badge } from "@/components/ui/Badge";
import { colors, shadows } from "@/utils/design-tokens";
import { DURATIONS } from "@/utils/motion";
import { useReduceMotion } from "@/hooks/useReduceMotion";
import { useTaskStore } from "@/store/taskStore";
import { useSessionStore } from "@/store/sessionStore";
import { useProofStore } from "@/store/proofStore";
import { useStakesStore, type CompleteVia } from "@/store/stakesStore";
import { SESSION_MIN_BOUNDS } from "@/core/blocking/limits";
import type { Proof, Task } from "@/types";

// ---------------------------------------------------------------------------
// Optional, graceful integrations (never hard-required)
// ---------------------------------------------------------------------------

type PickerModule = {
  launchImageLibraryAsync?: (opts?: unknown) => Promise<{
    canceled?: boolean;
    assets?: { uri?: string }[];
  }>;
  requestMediaLibraryPermissionsAsync?: () => Promise<{ granted?: boolean; status?: string }>;
  MediaTypeOptions?: { Images?: unknown };
};

/**
 * Try to load expo-image-picker at call time. It is NOT a dependency yet, so we
 * must never import it statically (that would break the bundle). Returns null
 * when unavailable — the caller then degrades photo capture to "attach later".
 */
function loadImagePicker(): PickerModule | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require("expo-image-picker") as PickerModule;
    return mod && typeof mod.launchImageLibraryAsync === "function" ? mod : null;
  } catch {
    return null;
  }
}

/**
 * Optional AI plausibility check. `services/ai.ts` may or may not export a
 * `checkProofPlausibility` (it is a graceful add). We look it up defensively so
 * this file compiles and runs regardless, and ALWAYS default to "pass" on any
 * absence or error (doc `04` §7: a false reject is the worst outcome).
 */
async function plausibilityVerdict(uri: string, taskTitle: string): Promise<Proof["aiVerdict"]> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const ai = require("@/services/ai") as {
      checkProofPlausibility?: (uri: string, task: string) => Promise<{ verdict?: string }>;
    };
    if (typeof ai.checkProofPlausibility === "function") {
      const res = await ai.checkProofPlausibility(uri, taskTitle);
      // Only "uncertain" is ever surfaced; anything else (incl. errors) = pass.
      return res?.verdict === "uncertain" ? "uncertain" : "pass";
    }
  } catch {
    // fall through to pass
  }
  return "pass";
}

// ---------------------------------------------------------------------------
// Method model
// ---------------------------------------------------------------------------

type Method = "honor" | "focus_time" | "photo" | "screenshot";

const METHOD_OPTIONS: {
  method: Method;
  title: string;
  blurb: string;
  icon: keyof typeof Ionicons.glyphMap;
}[] = [
  {
    method: "honor",
    title: "I did it",
    blurb: "No proof. Just you keeping your word.",
    icon: "hand-left-outline",
  },
  {
    method: "focus_time",
    title: "Focus time",
    blurb: "Auto-verified from time you focused in Ampora.",
    icon: "timer-outline",
  },
  {
    method: "photo",
    title: "Photo",
    blurb: "A picture of the finished work.",
    icon: "camera-outline",
  },
  {
    method: "screenshot",
    title: "Screenshot",
    blurb: "A submitted assignment, a doc, a sent email.",
    icon: "phone-portrait-outline",
  },
];

// ---------------------------------------------------------------------------
// Focus-time helpers
// ---------------------------------------------------------------------------

/**
 * Total completed focused minutes recorded for a task across every session.
 * Fallback used ONLY when there is no active Ignition stake session for this
 * task — with a stake active, focused minutes are scoped tightly to that one
 * `StakeSession` instead (doc `04` §6: proof/time belongs to the session it
 * was served for, not the task's whole history).
 */
function focusedMinutesForTask(
  history: Record<string, { taskId: string; elapsedSec: number; completed: boolean }>,
  taskId: string
): number {
  let sec = 0;
  for (const s of Object.values(history)) {
    if (s.taskId === taskId) sec += s.elapsedSec;
  }
  return Math.floor(sec / 60);
}

/**
 * Focused minutes recorded specifically against one Ignition `StakeSession`
 * (via `FocusSession.stakeSessionId`), including the in-progress active focus
 * session if it belongs to the same stake session. This is the correct scope
 * for a stake's own focus-time requirement — summing every focus session ever
 * run against the task would credit unrelated, unstaked work.
 */
function focusedMinutesForStakeSession(
  history: Record<string, { stakeSessionId?: string; elapsedSec: number }>,
  active: { stakeSessionId?: string; elapsedSec: number } | null,
  stakeSessionId: string
): number {
  let sec = 0;
  for (const s of Object.values(history)) {
    if (s.stakeSessionId === stakeSessionId) sec += s.elapsedSec;
  }
  if (active?.stakeSessionId === stakeSessionId) sec += active.elapsedSec;
  return Math.floor(sec / 60);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export interface VerificationSheetProps {
  visible: boolean;
  /** The task being completed. */
  task: Task;
  /** Close without completing. */
  onClose: () => void;
  /** Called after the task is completed + a proof is recorded. */
  onCompleted?: (proof: Proof) => void;
}

/** A selectable method tile. */
function MethodTile({
  option,
  active,
  onPress,
  right,
}: {
  option: (typeof METHOD_OPTIONS)[number];
  active: boolean;
  onPress: () => void;
  right?: React.ReactNode;
}) {
  return (
    <PressableScale
      onPress={onPress}
      haptic="selection"
      className={`flex-row items-center gap-3 rounded-xl border p-3.5 ${
        active ? "border-primary-500 bg-primary-50" : "border-neutral-200 bg-white"
      }`}
      style={active ? undefined : shadows.xs}
      accessibilityRole="radio"
      accessibilityState={{ selected: active }}
      accessibilityLabel={`${option.title}. ${option.blurb}`}
    >
      <View
        className={`h-10 w-10 items-center justify-center rounded-full ${
          active ? "bg-primary-100" : "bg-neutral-100"
        }`}
      >
        <Ionicons name={option.icon} size={20} color={active ? "#2563EB" : "#6F6862"} />
      </View>
      <View className="flex-1">
        <Text className={`text-body-lg font-medium ${active ? "text-primary-700" : "text-neutral-900"}`}>
          {option.title}
        </Text>
        <Text className="mt-0.5 text-caption text-neutral-500">{option.blurb}</Text>
      </View>
      {right ?? (
        <Ionicons
          name={active ? "radio-button-on" : "radio-button-off"}
          size={20}
          color={active ? "#2563EB" : "#D7D3CC"}
        />
      )}
    </PressableScale>
  );
}

export function VerificationSheet({ visible, task, onClose, onCompleted }: VerificationSheetProps) {
  const reduceMotion = useReduceMotion();

  const completeTask = useTaskStore((s) => s.completeTask);
  const sessionHistory = useSessionStore((s) => s.history);
  const activeSession = useSessionStore((s) => s.active);
  const addProof = useProofStore((s) => s.addProof);

  // The Ignition stake layer (doc `04`). `stakeForTask` is the live
  // `StakeSession` this sheet's completion should unlock, when one is
  // actually armed against this task — null otherwise, which keeps every
  // stake-specific branch below a plain no-op for the common unstaked case.
  const activeStakeSession = useStakesStore((s) => s.activeSession);
  const completeStake = useStakesStore((s) => s.completeStake);
  const stakeForTask = useMemo(
    () => (activeStakeSession && activeStakeSession.taskId === task.id ? activeStakeSession : null),
    [activeStakeSession, task.id]
  );
  // Only an `until_done` hold is ever released by proof/override from this
  // sheet. A `session` hold unlocks by served focus time alone — `completeStake`
  // is a documented no-op for it in the store, and this sheet must not imply
  // otherwise (doc `04` §2/§7): no proof-based unlock is offered here for it.
  const untilDoneStake = stakeForTask?.hold === "until_done" ? stakeForTask : null;
  const sessionHoldStake = stakeForTask?.hold === "session" ? stakeForTask : null;

  const [method, setMethod] = useState<Method>("honor");
  const [imageUri, setImageUri] = useState<string | undefined>(undefined);
  const [attachLater, setAttachLater] = useState(false);
  const [busy, setBusy] = useState(false);

  // Picker availability is fixed for the life of the sheet; compute once.
  const picker = useMemo(() => loadImagePicker(), []);

  // Focus-time signal (auto-pass basis for the "Focus time" tier). Scoped to
  // the active stake session's own focus time when one is active — never the
  // task's whole history, which would credit unrelated, unstaked work and
  // could pass a check the current stake never actually earned.
  const focusedMin = useMemo(() => {
    if (stakeForTask) {
      return focusedMinutesForStakeSession(sessionHistory, activeSession, stakeForTask.id);
    }
    return focusedMinutesForTask(sessionHistory, task.id);
  }, [stakeForTask, sessionHistory, activeSession, task.id]);
  // The requirement is the active stake session's own `sessionMin` (doc `04`
  // §8, the session's real unlock currency) when one is active. With no stake,
  // fall back to the task's own duration, clamped to the documented session
  // bounds (15..50) rather than an arbitrary fixed ceiling.
  const requiredFocusMin =
    stakeForTask?.sessionMin ??
    Math.max(1, Math.min(task.durationMin || SESSION_MIN_BOUNDS.min, SESSION_MIN_BOUNDS.max));
  const focusPassed = focusedMin >= requiredFocusMin;

  /**
   * The id a recorded `Proof` is attributed to. The Proof Log is per STAKE
   * session (doc `04` §6/§8), so an active stake session's id always wins.
   * Without one, fall back to the best focus session for this task, else the
   * task id itself (honor completions with no session at all).
   */
  const sessionIdForProof = useMemo(() => {
    if (stakeForTask) return stakeForTask.id;
    if (activeSession?.taskId === task.id) return activeSession.id;
    const forTask = Object.values(sessionHistory)
      .filter((s) => s.taskId === task.id)
      .sort((a, b) => (b.endedAt ?? b.startedAt) - (a.endedAt ?? a.startedAt));
    return forTask[0]?.id ?? task.id;
  }, [stakeForTask, activeSession, sessionHistory, task.id]);

  const reset = () => {
    setMethod("honor");
    setImageUri(undefined);
    setAttachLater(false);
    setBusy(false);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  /** Launch the image library (graceful: no-op → attach-later if unavailable). */
  const pickImage = async () => {
    if (!picker || typeof picker.launchImageLibraryAsync !== "function") {
      setAttachLater(true);
      return;
    }
    try {
      await picker.requestMediaLibraryPermissionsAsync?.();
      const result = await picker.launchImageLibraryAsync({
        mediaTypes: picker.MediaTypeOptions?.Images,
        quality: 0.7,
      });
      const uri = result?.canceled ? undefined : result?.assets?.[0]?.uri;
      if (uri) {
        setImageUri(uri);
        setAttachLater(false);
        Haptics.selectionAsync().catch(() => {});
      }
    } catch {
      // Any failure (permission denied, etc.) degrades to attach-later.
      setAttachLater(true);
    }
  };

  /**
   * Complete the task + record a proof. `override` marks it as a deliberate
   * "complete anyway" (logged, never blocked — doc `04` §7). Never throws to UI.
   *
   * When this task carries the active `until_done` stake, this is also the
   * unlock (doc `04` §6): plausible or not, submitting proof — or using the
   * override — always ends the lock, because verification never traps. A
   * `session`-hold stake is never touched here; it unlocks by served focus
   * time only, and `completeStake` is a no-op for it in the store.
   */
  const finish = async (override: boolean) => {
    setBusy(true);
    let aiVerdict: Proof["aiVerdict"] | undefined;
    const submittedImage = (method === "photo" || method === "screenshot") && !!imageUri;

    // For image methods, run the lenient (optional) plausibility check. It
    // ALWAYS resolves — pass on any absence/error — and never blocks.
    if (submittedImage) {
      aiVerdict = await plausibilityVerdict(imageUri as string, task.title);
    }

    const proof = addProof({
      sessionId: sessionIdForProof,
      method,
      uri: imageUri,
      aiVerdict,
      overridden: override || undefined,
    });

    completeTask(task.id);

    // THE until_done UNLOCK. `via` is 'override' for the explicit escape
    // hatch, 'proof' when actual image proof was submitted (pass or
    // uncertain — leniency means a submission always counts), and
    // 'task_done' when the task was finished through another method while
    // the stake was armed (still a legitimate release — doc `04` §8).
    if (untilDoneStake) {
      const via: CompleteVia = override ? "override" : submittedImage ? "proof" : "task_done";
      completeStake(untilDoneStake.id, via);
    }

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});

    setBusy(false);
    reset();
    onCompleted?.(proof);
    onClose();
  };

  // --- Per-method gating (all lenient — override is always offered) ---------
  // `blocked` disables the primary confirm and reveals the override affordance.
  // Nothing here can permanently stop completion.
  const imageMethod = method === "photo" || method === "screenshot";
  const needsImage = imageMethod && !imageUri && !attachLater;
  const focusBlocked = method === "focus_time" && !focusPassed;

  let primaryLabel = "Mark done";
  if (method === "honor") primaryLabel = "I did it";
  else if (method === "focus_time") primaryLabel = focusPassed ? "Verified — mark done" : "Not enough focus yet";
  else if (imageMethod) primaryLabel = attachLater ? "Complete, attach later" : imageUri ? "Verify & complete" : "Add proof to complete";

  const primaryDisabled = busy || needsImage || focusBlocked;
  const showOverride = focusBlocked || (needsImage && !attachLater);

  return (
    <Modal
      visible={visible}
      transparent
      animationType={reduceMotion ? "fade" : "slide"}
      onRequestClose={handleClose}
      accessibilityViewIsModal
    >
      {/* Scrim */}
      <Pressable
        className="flex-1 bg-black/40"
        onPress={handleClose}
        accessibilityRole="button"
        accessibilityLabel="Dismiss"
      >
        {/* Sheet — stop press propagation so taps inside don't dismiss. */}
        <View className="flex-1 justify-end">
          <Pressable onPress={() => {}} accessibilityElementsHidden={false}>
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
                      Mark done
                    </Text>
                    <Heading size="h3" className="mt-1" numberOfLines={2}>
                      {task.title}
                    </Heading>
                    <Text className="mt-1 text-caption text-neutral-500">
                      Choose how you want to keep yourself honest. You can always change it.
                    </Text>
                  </View>
                  <Pressable
                    onPress={handleClose}
                    hitSlop={8}
                    className="h-9 w-9 items-center justify-center rounded-full bg-white"
                    style={shadows.xs}
                    accessibilityRole="button"
                    accessibilityLabel="Close"
                  >
                    <Ionicons name="close" size={20} color="#57534E" />
                  </Pressable>
                </View>

                {/* Stake context — honest, non-shaming expectation-setting so
                    the sheet never implies an unlock it can't deliver (doc `04`
                    §2/§7). Shown once, above the method list. */}
                {untilDoneStake ? (
                  <View className="mx-5 mt-3 flex-row items-center gap-2.5 rounded-xl border border-primary-100 bg-primary-50 px-3.5 py-3">
                    <Ionicons name="lock-open-outline" size={16} color={colors.light.primary} />
                    <Text className="flex-1 text-caption font-medium text-primary-700">
                      This task has apps on the line. Completing it here unlocks them.
                    </Text>
                  </View>
                ) : sessionHoldStake ? (
                  <View className="mx-5 mt-3 flex-row items-center gap-2.5 rounded-xl border border-neutral-200 bg-white px-3.5 py-3">
                    <Ionicons name="lock-closed-outline" size={16} color={colors.light.textMuted} />
                    <Text className="flex-1 text-caption font-medium text-neutral-600">
                      Your apps stay locked for this session. Completing the task here won&apos;t unlock them — the session timer does.
                    </Text>
                  </View>
                ) : null}

                <ScrollView
                  className="mt-4 max-h-[52vh]"
                  contentContainerClassName="px-5 pb-4 gap-2.5"
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={false}
                >
                  {METHOD_OPTIONS.map((option) => {
                    const active = method === option.method;
                    // Right-side status affordance per method.
                    let right: React.ReactNode | undefined;
                    if (option.method === "focus_time") {
                      right = (
                        <Badge
                          label={focusPassed ? "Ready" : `${focusedMin}/${requiredFocusMin}m`}
                          tone={focusPassed ? "success" : "neutral"}
                        />
                      );
                    }
                    return (
                      <MethodTile
                        key={option.method}
                        option={option}
                        active={active}
                        onPress={() => {
                          setMethod(option.method);
                          Haptics.selectionAsync().catch(() => {});
                        }}
                        right={right}
                      />
                    );
                  })}

                  {/* --- Method-specific detail panel --- */}
                  {method === "focus_time" ? (
                    <Animated.View
                      entering={reduceMotion ? undefined : FadeIn.duration(DURATIONS.fast)}
                      className="rounded-xl border border-neutral-200 bg-white p-4"
                      style={shadows.xs}
                    >
                      {focusPassed ? (
                        <View className="flex-row items-center gap-2">
                          <Ionicons name="checkmark-circle" size={18} color="#16A34A" />
                          <Text className="flex-1 text-caption text-neutral-600">
                            You focused {focusedMin}m — that clears the {requiredFocusMin}m needed. Nice.
                          </Text>
                        </View>
                      ) : (
                        <View className="flex-row items-center gap-2">
                          <Ionicons name="time-outline" size={18} color="#6F6862" />
                          <Text className="flex-1 text-caption text-neutral-600">
                            {focusedMin}m focused so far. Start a focus session to reach {requiredFocusMin}m — or complete anyway below.
                          </Text>
                        </View>
                      )}
                    </Animated.View>
                  ) : null}

                  {imageMethod ? (
                    <Animated.View
                      entering={reduceMotion ? undefined : FadeIn.duration(DURATIONS.fast)}
                      className="rounded-xl border border-neutral-200 bg-white p-4"
                      style={shadows.xs}
                    >
                      {imageUri ? (
                        <View className="gap-3">
                          <Image
                            source={{ uri: imageUri }}
                            style={{ width: "100%", height: 160, borderRadius: 12 }}
                            contentFit="cover"
                            transition={150}
                            accessibilityLabel="Selected proof image"
                          />
                          <Pressable
                            onPress={pickImage}
                            className="self-start"
                            accessibilityRole="button"
                            accessibilityLabel="Choose a different image"
                          >
                            <Text className="text-label font-medium text-primary-600">
                              Choose a different image
                            </Text>
                          </Pressable>
                          <Text className="text-caption text-neutral-500">
                            The check is a light nudge, not a grader — it accepts unless the image is clearly unrelated.
                          </Text>
                        </View>
                      ) : picker ? (
                        <Pressable
                          onPress={pickImage}
                          className="min-h-24 items-center justify-center rounded-lg border border-dashed border-neutral-300 bg-neutral-50 p-4"
                          accessibilityRole="button"
                          accessibilityLabel="Add a proof image"
                        >
                          <Ionicons name="image-outline" size={26} color="#6F6862" />
                          <Text className="mt-2 text-label font-medium text-neutral-600">
                            Add an image
                          </Text>
                        </Pressable>
                      ) : (
                        <View className="gap-2">
                          <View className="flex-row items-center gap-2">
                            <Ionicons name="information-circle-outline" size={18} color="#6F6862" />
                            <Text className="flex-1 text-caption text-neutral-600">
                              Image capture isn&apos;t available on this device. You can complete now and attach proof later.
                            </Text>
                          </View>
                          <Pressable
                            onPress={() => setAttachLater(true)}
                            className={`self-start rounded-full px-3 py-1.5 ${
                              attachLater ? "bg-primary-100" : "bg-neutral-100"
                            }`}
                            accessibilityRole="button"
                            accessibilityState={{ selected: attachLater }}
                            accessibilityLabel="Complete and attach proof later"
                          >
                            <Text
                              className={`text-caption font-medium ${
                                attachLater ? "text-primary-700" : "text-neutral-600"
                              }`}
                            >
                              Attach later
                            </Text>
                          </Pressable>
                        </View>
                      )}
                    </Animated.View>
                  ) : null}
                </ScrollView>

                {/* Footer — primary action + always-available override */}
                <View className="border-t border-neutral-200 bg-white px-5 pb-2 pt-3" style={shadows.md}>
                  <Button
                    title={primaryLabel}
                    variant="success"
                    size="lg"
                    onPress={() => finish(false)}
                    disabled={primaryDisabled}
                    loading={busy}
                    icon={
                      busy ? undefined : (
                        <Ionicons name="checkmark-circle" size={18} color="#FFFFFF" />
                      )
                    }
                  />

                  {/* Lenient escape hatch — never trap the user (doc `04` §7). */}
                  {showOverride ? (
                    <Pressable
                      onPress={() => finish(true)}
                      disabled={busy}
                      className="mt-2 items-center py-2.5"
                      accessibilityRole="button"
                      accessibilityLabel="Complete anyway without verification"
                    >
                      <Text className="text-label font-medium text-neutral-500">
                        Complete anyway
                      </Text>
                    </Pressable>
                  ) : (
                    <View className="h-1" />
                  )}
                </View>
              </SafeAreaView>
            </Animated.View>
          </Pressable>
        </View>
      </Pressable>
    </Modal>
  );
}
