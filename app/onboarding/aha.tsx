import React, { useEffect, useState } from "react";
import { View, Text } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useColorScheme } from "nativewind";
import { Button } from "@/components/ui/Button";
import { Heading } from "@/components/ui/Heading";
import { EmptyState } from "@/components/ui/EmptyState";
import { useTaskStore } from "@/store/taskStore";
import { useSettingsStore } from "@/store/settingsStore";
import { StakeSetupSheet, type ArmedStake } from "@/components/stakes/StakeSetupSheet";
import { gradients, shadows } from "@/utils/design-tokens";
import { DURATIONS, staggerDelay } from "@/utils/motion";
import { useReduceMotion } from "@/hooks/useReduceMotion";
import { useThemeColors } from "@/hooks/useThemeColors";
import { ProgressDots } from "./ProgressDots";

/**
 * Onboarding step 7, THE LAUNCH GATE (PRD §8.10, `01_PRD.md:43`): "pick stake
 * apps and run one short locked session on the first task". `01_PRD.md`
 * names this exact moment as the gate — "the first session reliably reaches
 * 'I locked an app and started.'"
 *
 * Reuses the SAME components the rest of the app uses for this (`StakeSetup
 * Sheet`, `AppPicker` underneath it) rather than rebuilding stake setup —
 * mirrors `app/task/[id].tsx`'s own "Start focus" / "Put something on the
 * line" -> `StakeSetupSheet` -> `/focus/session` wiring exactly, so this
 * screen and the rest of the app never diverge in how a stake arms.
 *
 * Screen Time permission is primed honestly and skippable (§8.10): today that
 * simply means `StakeSetupSheet`/`AppPicker` themselves — there is no native
 * permission prompt at all while `FEATURE_FLAGS.IGNITION_NATIVE` is off (the
 * picker already says so honestly in its own footer note). Every exit path
 * below (lock in, start without locking, skip entirely) completes onboarding
 * — FR-64 forbids blocking use behind any of this.
 */
export default function AhaScreen() {
  const insets = useSafeAreaInsets();
  const reduceMotion = useReduceMotion();
  const { taskId } = useLocalSearchParams<{ taskId?: string }>();
  // Ionicons `color` and LinearGradient `colors` take literal values, never a
  // `dark:` class. className styling below uses `dark:` variants directly.
  const theme = useThemeColors();
  const { colorScheme } = useColorScheme();

  const task = useTaskStore((s) => (taskId ? s.tasks[taskId] : undefined));

  const [stakeOpen, setStakeOpen] = useState(false);

  const enter = (delay: number) =>
    reduceMotion ? undefined : FadeInDown.delay(delay).duration(DURATIONS.base);

  // If this screen is somehow revisited after onboarding already completed
  // (e.g. backing out of the focus session mid-stack), don't strand the user
  // inside the onboarding flow — send them on to the real app.
  //
  // MUST read the store IMPERATIVELY, once, on mount only — NOT react to
  // `onboardingComplete` via a live selector. Every exit path below
  // (`handleArmStake`, `handleStartWithoutLock`, `handleSkip`) flips
  // `onboardingComplete` to true THEN navigates away in the same handler; a
  // reactive effect watching that value would also fire at that exact
  // moment, race the real navigation, and could win — silently swapping
  // "go to the focus session" for "go to tabs" before the session ever
  // mounts to arm its stake (verified live: this raced and stripped the arm
  // every time before this guard was made mount-only).
  useEffect(() => {
    if (useSettingsStore.getState().settings.onboardingComplete) {
      router.replace("/(tabs)");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const finishOnboarding = () => {
    useSettingsStore.getState().updateSettings({ onboardingComplete: true });
  };

  const handleArmStake = (armed: ArmedStake) => {
    finishOnboarding();
    router.replace({
      pathname: "/focus/session",
      params: {
        taskId: armed.taskId,
        stakeHold: armed.hold,
        stakeTrigger: armed.trigger,
        stakeVerification: armed.verification,
        ...(armed.sessionMin != null ? { stakeSessionMin: String(armed.sessionMin) } : {}),
      },
    });
  };

  const handleStartWithoutLock = () => {
    if (!task) return;
    finishOnboarding();
    router.replace({ pathname: "/focus/session", params: { taskId: task.id } });
  };

  const handleSkip = () => {
    finishOnboarding();
    router.replace("/(tabs)");
  };

  // No task to lock against (e.g. onboarding step 6 was skipped, or the task
  // vanished some other way) — never a blank screen (design system rule):
  // icon + title + one line + one primary action back to where a task gets made.
  if (!task) {
    return (
      <View
        className="flex-1 bg-neutral-100 dark:bg-neutral-950"
        style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}
      >
        <View className="px-6 pt-6">
          <ProgressDots total={8} current={7} />
        </View>
        <View className="flex-1 justify-center">
          <EmptyState
            icon="flag-outline"
            title="No task to lock in yet"
            subtitle="Add a real task first so you have something to start a session on."
            actionLabel="Add a task"
            onAction={() => router.replace("/onboarding/first-task")}
          />
        </View>
        <View className="px-6 pb-2">
          <Button
            title="Skip for now"
            variant="ghost"
            onPress={handleSkip}
            accessibilityLabel="Skip and continue to the app"
          />
        </View>
      </View>
    );
  }

  return (
    <View
      className="flex-1 bg-neutral-100 dark:bg-neutral-950"
      style={{ paddingTop: insets.top, paddingBottom: insets.bottom + 16 }}
    >
      {/* `gradients.firstMove` ends on a SOLID white stop, which on a
          near-black canvas paints a bright panel over the top third of the
          screen rather than a wash. Dark therefore takes `heroWashDark`, the
          only dark wash the token set defines (elevated fading to a
          transparent dark canvas, built entirely from colors.dark values). */}
      <LinearGradient
        colors={colorScheme === "dark" ? gradients.heroWashDark : gradients.firstMove}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        pointerEvents="none"
        style={{ position: "absolute", top: 0, left: 0, right: 0, height: 380 }}
      />

      <View className="flex-1 justify-between px-6">
        <View className="mt-6">
          <Animated.View entering={enter(0)} className="mb-6">
            <ProgressDots total={8} current={7} />
          </Animated.View>

          <Animated.View entering={enter(0)}>
            {/* Accent TEXT on the canvas, not an accent fill, so doc 02 §1.8's
                carve-out applies: the ramp keeps its hex values but steps to
                the 400 tone on a dark surface. At 11px this owes 4.5:1 and
                primary-600 measures 3.82:1 on the dark canvas; primary-400
                clears it at 7.77:1. Mirrors components/ui/Button.tsx's `ghost`
                label, which resolves the same way for the same reason. */}
            <Text className="text-overline text-primary-600 dark:text-primary-400 uppercase tracking-wide mb-3">
              This is it
            </Text>
            <Heading size="h1" className="text-neutral-900 dark:text-neutral-50 max-w-[320px]">
              Lock in your first session
            </Heading>
            <Text className="text-body-lg text-neutral-600 dark:text-neutral-400 mt-3 leading-6 max-w-[330px]">
              Pick the apps that usually pull you away. They&apos;ll go dark
              while you work on this — and come back the moment you&apos;ve
              earned it.
            </Text>
          </Animated.View>

          <Animated.View
            entering={enter(100 + staggerDelay(0))}
            className="mt-6 rounded-2xl border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900"
            style={shadows.sm}
          >
            <Text className="text-overline font-semibold uppercase tracking-wide text-neutral-500 dark:text-[#78716C]">
              Your task
            </Text>
            <Heading size="h4" className="mt-1.5 text-neutral-900 dark:text-neutral-50" numberOfLines={2}>
              {task.title}
            </Heading>
            {task.firstMove?.text ? (
              /* The First move panel keeps its primary-50 tint in both themes,
                 so every tone inside it stays the light pair it was audited as:
                 glyph and eyebrow at 4.75:1, the move itself at 16.07:1. None
                 of the three carries a `dark:` class for that reason — adding
                 one would put near-white text on a near-white tint. Identical
                 treatment to the same panel in first-task.tsx. */
              <View className="mt-3.5 flex-row items-start gap-2.5 rounded-lg bg-primary-50 px-3.5 py-3">
                <Ionicons name="flag-outline" size={16} color={theme.primary} style={{ marginTop: 1 }} />
                <View className="flex-1">
                  <Text className="text-tiny font-semibold uppercase tracking-wide text-primary-600">
                    First move
                  </Text>
                  <Text className="mt-0.5 text-body font-medium text-neutral-900">
                    {task.firstMove.text}
                  </Text>
                </View>
              </View>
            ) : null}
          </Animated.View>
        </View>

        <Animated.View entering={enter(220)} className="gap-2">
          <Button
            title="Choose apps to lock"
            variant="primaryBlue"
            size="lg"
            icon={
              /* Rides inside the filled `primaryBlue` button, whose fill is
                 opaque and identical in both themes, so the glyph matches that
                 button's own white label rather than the screen's ink. */
              <Ionicons name="lock-closed-outline" size={18} color={theme.primaryForeground} />
            }
            onPress={() => setStakeOpen(true)}
            accessibilityLabel="Choose apps to lock and start a focus session"
            accessibilityHint="Opens the stake setup sheet for this task"
          />
          <Button
            title="Just start, no lock"
            variant="secondary"
            onPress={handleStartWithoutLock}
            accessibilityLabel="Start a focus session without locking any apps"
          />
          <Button
            title="Skip for now"
            variant="ghost"
            onPress={handleSkip}
            accessibilityLabel="Skip and continue to the app"
          />
        </Animated.View>
      </View>

      <StakeSetupSheet
        visible={stakeOpen}
        task={task}
        onClose={() => setStakeOpen(false)}
        onArm={handleArmStake}
      />
    </View>
  );
}
