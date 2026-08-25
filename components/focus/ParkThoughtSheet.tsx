/**
 * ParkThoughtSheet: one-tap capture for an intrusive, session-unrelated
 * thought (PRD FR-5 Inbox, FR-62 Focus session).
 *
 * The single most common way an ADHD focus session dies: a thought
 * ("email the professor") pulls the user OUT of the session to go act on it
 * right now. This sheet is the safety valve. Type it, save it to the
 * Inbox, land straight back on the timer. It is deliberately dumb: one text
 * field, one primary action, and exactly ONE outward effect (`onSubmit` with
 * the trimmed text). It never imports or touches `sessionStore` or
 * `stakesStore`. The caller (the focus session screen) is the only place
 * that creates the task, via the same `taskStore.createTask` call
 * `components/capture/BrainDumpSheet.tsx` and quick-add already use, so the
 * thought lands as a plain Inbox task: no duration, no due date, no
 * schedule, no breakdown (`types/index.ts#Task.isInbox`).
 *
 * Presentational and store-agnostic, matching `components/ui/AddEventModal.tsx`'s
 * own convention (`onSave`, here `onSubmit`, is the only mutation callback).
 */

import React, { useCallback, useEffect, useState } from "react";
import { Modal, View, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Animated, { FadeIn, FadeInUp } from "react-native-reanimated";

import { Text } from "@/components/ui/Text";
import { Heading } from "@/components/ui/Heading";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { colors, shadows } from "@/utils/design-tokens";
import { DURATIONS } from "@/utils/motion";
import { useReduceMotion } from "@/hooks/useReduceMotion";

export interface ParkThoughtSheetProps {
  visible: boolean;
  /** Backdrop tap, close button, or the OS back gesture. Always a plain close, never a save. */
  onClose: () => void;
  /** Fires once with the trimmed, non-empty text. The caller owns `taskStore.createTask`. */
  onSubmit: (text: string) => void;
}

export function ParkThoughtSheet({ visible, onClose, onSubmit }: ParkThoughtSheetProps) {
  const reduceMotion = useReduceMotion();
  const [text, setText] = useState("");

  // Fresh field every time the sheet opens (mirrors `BrainDumpSheet` /
  // `AddEventModal`'s own "re-seed on open" effect), so a leftover draft from
  // a previous parked thought never resurfaces on the next one.
  useEffect(() => {
    if (visible) setText("");
  }, [visible]);

  const trimmed = text.trim();

  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

  const handleSubmit = useCallback(() => {
    // Rule: submitting (or dismissing) without text is a no-op. This can
    // never create a blank Inbox task.
    if (!trimmed) return;
    onSubmit(trimmed);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    onClose();
  }, [trimmed, onSubmit, onClose]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType={reduceMotion ? "fade" : "slide"}
      onRequestClose={handleClose}
      accessibilityViewIsModal
    >
      <Pressable
        className="flex-1 bg-black/40"
        onPress={handleClose}
        accessibilityRole="button"
        accessibilityLabel="Close"
        accessibilityHint="Closes without saving"
      >
        <View className="flex-1 justify-end">
          <Pressable onPress={() => {}}>
            <Animated.View
              entering={reduceMotion ? FadeIn.duration(DURATIONS.base) : FadeInUp.duration(DURATIONS.base)}
              // `rounded-t-3xl`, matching every other bottom sheet in the app
              // (EndCheckInSheet, FocusHeroCard, AddEventModal, AppPicker,
              // DeEscalationSheet, PanicValveSheet, StakeSetupSheet). Doc 02
              // says "Modals / bottom sheets: radius.xl (16) on top corners",
              // and this sheet shipped at 16 first for that reason, but nine
              // sheets already read as one family at 3xl. One sheet at a
              // different radius reads as a bug, not as a quieter tier. The
              // doc is what is stale here, not the convention.
              className="rounded-t-3xl bg-neutral-100"
              style={shadows.xl}
            >
              <SafeAreaView edges={["bottom"]}>
                {/* Grabber */}
                <View className="items-center pt-3">
                  <View className="h-1.5 w-10 rounded-full bg-neutral-300" />
                </View>

                <View className="flex-row items-center justify-between px-5 pb-1 pt-3">
                  <Heading size="h4">Park a thought</Heading>
                  <Pressable
                    onPress={handleClose}
                    hitSlop={8}
                    className="h-9 w-9 items-center justify-center rounded-full bg-white"
                    style={shadows.xs}
                    accessibilityRole="button"
                    accessibilityLabel="Close park a thought"
                    accessibilityHint="Closes without saving"
                  >
                    <Ionicons name="close" size={20} color={colors.light.textSecondary} />
                  </Pressable>
                </View>

                <View className="px-5 pb-5 pt-2">
                  <Text variant="caption" className="mb-3 text-neutral-500">
                    It goes straight to your Inbox for later. The timer keeps running.
                  </Text>
                  <Input
                    value={text}
                    onChangeText={setText}
                    placeholder="What's on your mind?"
                    autoFocus
                    returnKeyType="done"
                    onSubmitEditing={handleSubmit}
                    accessibilityLabel="Thought to park"
                  />
                  <View className="mt-4">
                    <Button
                      title="Park it"
                      variant="primaryBlue"
                      onPress={handleSubmit}
                      disabled={!trimmed}
                    />
                  </View>
                </View>
              </SafeAreaView>
            </Animated.View>
          </Pressable>
        </View>
      </Pressable>
    </Modal>
  );
}
