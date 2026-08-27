/**
 * EndCheckInSheet — the end-of-session check-in (PRD FR-85).
 *
 * "Did you finish today's goal?" with three answers:
 *   - **Done** — the session goal is complete; the project advances.
 *   - **Keep going** — take a short break, then run another session.
 *   - **Stop here** — the remainder reflows into the schedule.
 *
 * Dismissing is a first-class outcome, not an error state: FR-85 requires that
 * a skipped check-in still moves the project, with progress INFERRED from the
 * subtask checkboxes, so generation never stalls. `onDismiss` carries that
 * case, and the sheet is dismissible by backdrop tap and by the OS back
 * gesture — there is no way to get stuck in it.
 *
 * No judgement in the copy. "Stop here" is presented as an equal, reasonable
 * choice, because for this audience a check-in that reads as a report card is
 * a check-in that gets avoided.
 */

import React from "react";
import { View, Text, Modal, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import Animated, { FadeIn, FadeInUp } from "react-native-reanimated";

import { PressableScale } from "@/components/ui/PressableScale";
import { Heading } from "@/components/ui/Heading";
import { iconSizes, shadows } from "@/utils/design-tokens";
import { DURATIONS } from "@/utils/motion";
import { useReduceMotion } from "@/hooks/useReduceMotion";
import { useThemeColors } from "@/hooks/useThemeColors";

/**
 * The three end-check-in answers (FR-85). `undefined` at a call site means the
 * sheet was skipped or dismissed, in which case the caller infers the answer
 * from the subtask checkboxes rather than dropping the session.
 */
export type CheckInAnswer = "done" | "keep_going" | "stop_here";

export interface EndCheckInSheetProps {
  visible: boolean;
  /** The task this session ran against, for the headline. */
  taskTitle?: string;
  /** Whether the session's required focus time was fully served. */
  served: boolean;
  /** Shown when a stake was released by serving this session. */
  unlocked?: boolean;
  onAnswer: (answer: CheckInAnswer) => void;
  /** Backdrop tap / back gesture — the FR-85 "skipped" path. */
  onDismiss: () => void;
}

const OPTIONS: {
  answer: CheckInAnswer;
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  blurb: string;
  primary?: boolean;
}[] = [
  {
    answer: "done",
    icon: "checkmark-circle",
    title: "Done",
    blurb: "Today's goal is finished.",
    primary: true,
  },
  {
    answer: "keep_going",
    icon: "play-forward-outline",
    title: "Keep going",
    blurb: "Short break, then another session.",
  },
  {
    answer: "stop_here",
    icon: "moon-outline",
    title: "Stop here",
    blurb: "The rest gets replanned for you.",
  },
];

export function EndCheckInSheet({
  visible,
  taskTitle,
  served,
  unlocked = false,
  onAnswer,
  onDismiss,
}: EndCheckInSheetProps) {
  const reduceMotion = useReduceMotion();
  // Ionicons `color` takes a literal and cannot take a `dark:` class.
  const theme = useThemeColors();

  return (
    <Modal
      visible={visible}
      transparent
      animationType={reduceMotion ? "fade" : "slide"}
      onRequestClose={onDismiss}
      accessibilityViewIsModal
    >
      <Pressable
        className="flex-1 bg-black/40"
        onPress={onDismiss}
        accessibilityRole="button"
        accessibilityLabel="Skip the check-in"
        accessibilityHint="Closes this and works your progress out from the steps you ticked"
      >
        <View className="flex-1 justify-end">
          <Pressable onPress={() => {}}>
            <Animated.View
              entering={reduceMotion ? FadeIn.duration(DURATIONS.base) : FadeInUp.duration(DURATIONS.base)}
              className="rounded-t-3xl bg-neutral-100 dark:bg-neutral-950"
              style={shadows.xl}
            >
              <SafeAreaView edges={["bottom"]}>
                {/* Grabber */}
                <View className="items-center pt-3">
                  <View className="h-1.5 w-10 rounded-full bg-neutral-300 dark:bg-neutral-700" />
                </View>

                <View className="px-6 pt-5">
                  {unlocked ? (
                    <View
                      className="mb-4 flex-row items-center gap-2.5 rounded-2xl bg-white border border-neutral-200 px-4 py-3 dark:bg-neutral-900 dark:border-neutral-800"
                      accessibilityRole="summary"
                    >
                      <Ionicons
                        name="lock-open-outline"
                        size={iconSizes.sm}
                        color={theme.primary}
                      />
                      <Text className="flex-1 text-body font-medium text-neutral-800 dark:text-neutral-100">
                        You served the session. Your apps are yours again.
                      </Text>
                    </View>
                  ) : null}

                  {/* Accent TEXT on a neutral surface, so it steps lighter on
                      dark per doc 02 §1.8 — primary-600 is 3.82:1 on the dark
                      canvas, under the 4.5:1 an 11px overline owes, and
                      primary-400 clears it at 7.77:1. */}
                  <Text className="text-overline font-semibold uppercase tracking-wide text-primary-600 dark:text-primary-400">
                    {served ? "Session complete" : "Session ended"}
                  </Text>
                  <Heading size="h2" className="mt-1.5">
                    Did you finish today&apos;s goal?
                  </Heading>
                  {taskTitle ? (
                    <Text className="mt-1.5 text-body text-neutral-600 dark:text-neutral-400" numberOfLines={2}>
                      {taskTitle}
                    </Text>
                  ) : null}
                </View>

                <View className="mt-5 gap-3 px-5 pb-3">
                  {OPTIONS.map((opt) => (
                    <PressableScale
                      key={opt.answer}
                      onPress={() => onAnswer(opt.answer)}
                      haptic={opt.primary ? "success" : "light"}
                      /* "Done" is the one TERMINAL answer on this sheet, which
                         is why it is the one filled in success-700 (doc 02
                         §14.7: green is completed, never a control that starts
                         or runs). That fill is opaque, so it and its white
                         label measure the audited 5.02:1 on either canvas and
                         correctly take no `dark:` variant. The other two are
                         ordinary cards and flip per the cheatsheet. */
                      className={`min-h-[64px] flex-row items-center gap-3 rounded-xl border px-4 py-3 ${
                        opt.primary
                          ? "bg-success-700 border-success-700"
                          : "bg-white border-neutral-200 dark:bg-neutral-900 dark:border-neutral-800"
                      }`}
                      accessibilityRole="button"
                      accessibilityLabel={opt.title}
                      accessibilityHint={opt.blurb}
                    >
                      <Ionicons
                        name={opt.icon}
                        size={iconSizes.lg}
                        color={opt.primary ? theme.primaryForeground : theme.textSecondary}
                      />
                      <View className="flex-1">
                        <Text
                          className={`text-h4 font-semibold ${
                            opt.primary ? "text-white" : "text-neutral-900 dark:text-neutral-50"
                          }`}
                        >
                          {opt.title}
                        </Text>
                        <Text
                          className={`text-caption ${opt.primary ? "text-white" : "text-neutral-500 dark:text-[#78716C]"}`}
                        >
                          {opt.blurb}
                        </Text>
                      </View>
                    </PressableScale>
                  ))}

                  <PressableScale
                    onPress={onDismiss}
                    haptic="selection"
                    className="min-h-11 items-center justify-center"
                    accessibilityRole="button"
                    accessibilityLabel="Skip the check-in"
                    accessibilityHint="Your progress is worked out from the steps you ticked"
                  >
                    <Text className="text-label font-medium text-neutral-500 dark:text-[#78716C]">Skip for now</Text>
                  </PressableScale>
                </View>
              </SafeAreaView>
            </Animated.View>
          </Pressable>
        </View>
      </Pressable>
    </Modal>
  );
}
