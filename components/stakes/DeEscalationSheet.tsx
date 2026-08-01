/**
 * DeEscalationSheet — Ampora Phase 5 Ignition (FR-43, PRD §9.10).
 *
 * Surfaced when `stakesStore.shouldOfferPause()` is true — i.e. the user has
 * hit the panic valve / missed enough that repeated stakes are clearly not
 * helping right now. This sheet NEVER increases pressure. It does the opposite:
 * it names the struggle with warmth and offers to lift stakes for the rest of
 * the day, no strings attached.
 *
 * Two paths, both kind:
 *   - "Pause stakes for today": `stakesStore.pauseStakesForToday()` — ends any
 *     active lock and stops new ones until tomorrow. The recommended, calm out.
 *   - "Keep going": dismiss and carry on. The store has ALREADY lowered the
 *     default strength (de-escalation happens in `panicValve`), so continuing
 *     is already gentler — no extra pressure is added here either way.
 *
 * Wellbeing stance (§9.10, doc 09 §5): the app responds to struggle with less,
 * never more. No shame copy. Reduce-motion aware. RN + NativeWind, web-safe.
 */

import React from "react";
import { View, Text, Modal, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Animated, { FadeIn, FadeInUp } from "react-native-reanimated";

import { Button } from "@/components/ui/Button";
import { Heading } from "@/components/ui/Heading";
import { colors, shadows } from "@/utils/design-tokens";
import { DURATIONS } from "@/utils/motion";
import { useReduceMotion } from "@/hooks/useReduceMotion";
import { useStakesStore } from "@/store/stakesStore";

export interface DeEscalationSheetProps {
  visible: boolean;
  /** Dismiss without pausing (the "keep going" path). */
  onClose: () => void;
  /** Called after the user pauses stakes for the day. */
  onPaused?: () => void;
}

export function DeEscalationSheet({ visible, onClose, onPaused }: DeEscalationSheetProps) {
  const reduceMotion = useReduceMotion();
  const pauseStakesForToday = useStakesStore((s) => s.pauseStakesForToday);

  const handlePause = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    pauseStakesForToday();
    onPaused?.();
    onClose();
  };

  const handleKeepGoing = () => {
    Haptics.selectionAsync().catch(() => {});
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType={reduceMotion ? "fade" : "slide"}
      onRequestClose={handleKeepGoing}
      accessibilityViewIsModal
    >
      <Pressable
        className="flex-1 bg-black/40"
        onPress={handleKeepGoing}
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

                <View className="items-center px-6 pt-6">
                  {/* Warm icon — a hand on the shoulder, not a warning. */}
                  <View className="h-16 w-16 items-center justify-center rounded-full bg-warning-100">
                    <Ionicons name="heart-outline" size={30} color={colors.light.warningStrong} />
                  </View>

                  <Heading size="h2" className="mt-5 text-center">
                    Looks like this is a rough one
                  </Heading>
                  <Text className="mt-2 text-center text-body text-neutral-600 leading-6">
                    That happens to everyone. Stakes are meant to help, not to pile on. Want to lift them for the
                    rest of today?
                  </Text>
                </View>

                {/* Actions — pause is the gently recommended choice. */}
                <View className="mt-8 gap-3 px-5 pb-2">
                  <Button
                    title="Pause stakes for today"
                    variant="primaryBlue"
                    size="lg"
                    onPress={handlePause}
                    icon={<Ionicons name="pause-circle-outline" size={18} color={colors.light.primaryForeground} />}
                    accessibilityLabel="Pause all stakes for the rest of today"
                  />
                  <Pressable
                    onPress={handleKeepGoing}
                    className="items-center py-3"
                    accessibilityRole="button"
                    accessibilityLabel="Keep going with stakes"
                  >
                    <Text className="text-label font-medium text-neutral-500">Keep going</Text>
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
