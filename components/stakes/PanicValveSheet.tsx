/**
 * PanicValveSheet — Ampora Phase 5 Ignition (FR-42, PRD §9.10).
 *
 * The always-available "unlock early" escape hatch. It is NOT a wall — it is a
 * calm, 60-second breath. The delay is the ONLY friction (a moment to let the
 * impulse pass), never a punishment or a shame screen. Two paths, both kind:
 *   - "Back to task": dismiss and stay focused (the gently encouraged choice).
 *   - Wait out the 60s: the apps come back, no guilt. On expiry we call
 *     `stakesStore.panicValve(session.id)`, which removes the shield, ends the
 *     session as `panic_valve`, and DE-ESCALATES future stakes (never punishes).
 *
 * The 60s countdown is the friction the store's `panicValve` expects the UI to
 * impose BEFORE calling it (see stakesStore.panicValve docstring). The store
 * owns the state change + de-escalation; this sheet owns only the humane pause.
 *
 * Wellbeing stance (§9.10): never traps, never shames. Reduce-motion aware.
 * RN + NativeWind, web-export safe.
 */

import React, { useEffect, useRef, useState } from "react";
import { View, Text, Modal, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Animated, { FadeIn, FadeInUp } from "react-native-reanimated";

import { Button } from "@/components/ui/Button";
import { Heading } from "@/components/ui/Heading";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { colors, shadows } from "@/utils/design-tokens";
import { DURATIONS } from "@/utils/motion";
import { useReduceMotion } from "@/hooks/useReduceMotion";
import { useStakesStore } from "@/store/stakesStore";
import type { StakeSession } from "@/types";

/** The single source-of-truth friction window (doc 06 §3.9, FR-42). */
const PANIC_COUNTDOWN_SEC = 60;

export interface PanicValveSheetProps {
  visible: boolean;
  /** The active stake session being released. */
  session: StakeSession;
  /** Close without unlocking (the "Back to task" path). */
  onClose: () => void;
  /** Called after the 60s lapses and the store has released the lock. */
  onReleased?: () => void;
}

export function PanicValveSheet({ visible, session, onClose, onReleased }: PanicValveSheetProps) {
  const reduceMotion = useReduceMotion();
  const panicValve = useStakesStore((s) => s.panicValve);

  const [remaining, setRemaining] = useState(PANIC_COUNTDOWN_SEC);
  // Guard so we release exactly once even if timers overlap on unmount.
  const releasedRef = useRef(false);

  // Reset the countdown whenever the sheet opens.
  useEffect(() => {
    if (visible) {
      setRemaining(PANIC_COUNTDOWN_SEC);
      releasedRef.current = false;
    }
  }, [visible]);

  // Tick down while visible; at 0, release via the store (once).
  useEffect(() => {
    if (!visible) return;
    const id = setInterval(() => {
      setRemaining((r) => {
        if (r <= 1) {
          clearInterval(id);
          if (!releasedRef.current) {
            releasedRef.current = true;
            // Store owns the release + de-escalation; UI just imposed the pause.
            panicValve(session.id);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
            onReleased?.();
          }
          return 0;
        }
        return r - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [visible, session.id, panicValve, onReleased]);

  const handleBackToTask = () => {
    Haptics.selectionAsync().catch(() => {});
    onClose();
  };

  const progress = 1 - remaining / PANIC_COUNTDOWN_SEC;
  const done = remaining <= 0;

  return (
    <Modal
      visible={visible}
      transparent
      animationType={reduceMotion ? "fade" : "slide"}
      onRequestClose={handleBackToTask}
      accessibilityViewIsModal
    >
      <Pressable
        className="flex-1 bg-black/40"
        onPress={handleBackToTask}
        accessibilityRole="button"
        accessibilityLabel="Back to task"
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

                <View className="items-center px-6 pt-6">
                  {/* Calm icon — a breath, not an alarm. */}
                  <View className="h-16 w-16 items-center justify-center rounded-full bg-primary-100">
                    <Ionicons name="leaf-outline" size={30} color={colors.light.primary} />
                  </View>

                  <Heading size="h2" className="mt-5 text-center">
                    {done ? "Your apps are back" : "Take a breath"}
                  </Heading>
                  <Text className="mt-2 text-center text-body text-neutral-600 leading-6">
                    {done
                      ? "No guilt — you can pick the task back up whenever you're ready."
                      : "Locked apps come back in 60 seconds. Take a breath, or head back to your task."}
                  </Text>

                  {/* Countdown */}
                  {!done ? (
                    <View className="mt-7 items-center">
                      <Text
                        className="text-neutral-900 font-bold"
                        style={{ fontSize: 56, lineHeight: 60, fontVariant: ["tabular-nums"] }}
                        accessibilityRole="timer"
                        accessibilityLabel={`${remaining} seconds until your apps unlock`}
                      >
                        {remaining}
                      </Text>
                      <Text className="mt-1 text-caption text-neutral-500">seconds</Text>
                      <View className="mt-4 w-full">
                        <ProgressBar progress={progress} color="bg-primary-500" height={6} />
                      </View>
                    </View>
                  ) : (
                    <View className="mt-7 h-14 items-center justify-center">
                      <Ionicons name="checkmark-circle-outline" size={40} color={colors.light.primary} />
                    </View>
                  )}
                </View>

                {/* Actions */}
                <View className="mt-8 gap-3 px-5 pb-2">
                  {done ? (
                    <Button
                      title="Done"
                      variant="primaryBlue"
                      size="lg"
                      onPress={handleBackToTask}
                      accessibilityLabel="Close"
                    />
                  ) : (
                    <>
                      {/* Encouraged path, front and center — no shame if unused. */}
                      <Button
                        title="Back to task"
                        variant="primaryBlue"
                        size="lg"
                        onPress={handleBackToTask}
                        icon={<Ionicons name="arrow-back" size={18} color={colors.light.primaryForeground} />}
                        accessibilityLabel="Cancel the unlock and go back to your task"
                      />
                      <Text className="pb-1 text-center text-caption text-neutral-500">
                        Or just wait — the apps unlock on their own.
                      </Text>
                    </>
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
