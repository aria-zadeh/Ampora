import React from "react";
import { View, Text } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import Animated, { FadeInDown } from "react-native-reanimated";
import { Button } from "@/components/ui/Button";
import { Heading } from "@/components/ui/Heading";
import { gradients } from "@/utils/design-tokens";
import { DURATIONS, staggerDelay } from "@/utils/motion";
import { useReduceMotion } from "@/hooks/useReduceMotion";
import { ProgressDots } from "./ProgressDots";

/**
 * Onboarding step order (PRD §8.10, 7 steps total):
 *   1. Welcome (this screen, dot index 0)
 *   2. Sign in — NOT a screen inside app/onboarding/**. `app/_layout.tsx`'s
 *      root gate already requires a session (Apple/Google/email magic link)
 *      before it will ever route here, so by the time Welcome renders, sign-in
 *      is already done. That screen (`app/auth.tsx`) is owned by another
 *      worker — this flow leaves a clean numbering slot for it (dot index 1
 *      is deliberately never shown by any screen in this folder) rather than
 *      re-wiring the auth gate.
 *   3. Name (dot index 2)
 *   4. Scheduling hours / availability (dot index 3)
 *   5. Notifications permission (dot index 4)
 *   6. First task, guided (dot index 5)
 *   7. The aha: stake apps + one locked session (dot index 6)
 * Every ProgressDots below uses total=7 with the index matching this list.
 */

const VALUE_LINES = [
  {
    icon: "flash-outline" as const,
    text: "One tiny step at a time, never the whole mountain.",
  },
  {
    icon: "sparkles-outline" as const,
    text: "AI breaks hard tasks into steps you can actually start.",
  },
  {
    icon: "timer-outline" as const,
    text: "Focus sessions with breaks, so momentum stays gentle.",
  },
];

export default function WelcomeScreen() {
  const insets = useSafeAreaInsets();
  const reduceMotion = useReduceMotion();

  const enter = (delay: number) =>
    reduceMotion ? undefined : FadeInDown.delay(delay).duration(DURATIONS.base);

  return (
    <View
      className="flex-1 bg-neutral-100"
      style={{ paddingTop: insets.top, paddingBottom: insets.bottom + 24 }}
    >
      {/* Hero gradient wash behind the intro */}
      <LinearGradient
        colors={gradients.heroWash}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        pointerEvents="none"
        style={{ position: "absolute", top: 0, left: 0, right: 0, height: 380 }}
      />

      <View className="flex-1 justify-between px-6">
        {/* Hero */}
        <View className="mt-16">
          <Animated.View entering={enter(0)} className="mb-6">
            <ProgressDots total={7} current={0} />
          </Animated.View>
          <Animated.View entering={enter(0)}>
            <Text className="text-overline text-primary-600 uppercase tracking-wide mb-3">
              Welcome to Ampora
            </Text>
            <Heading size="display" className="text-neutral-900 max-w-[320px]">
              Big tasks, broken into first steps.
            </Heading>
            <Text className="text-body-lg text-neutral-600 mt-4 leading-7 max-w-[330px]">
              Ampora is built for brains that work differently. We help you find
              the very next thing to do — so starting never feels like the hard
              part.
            </Text>
          </Animated.View>

          {/* Value lines — left-aligned, varied, no identical icon chips */}
          <View className="mt-10 gap-5">
            {VALUE_LINES.map((item, i) => (
              <Animated.View
                key={item.text}
                entering={enter(120 + staggerDelay(i))}
                className="flex-row items-start gap-3"
              >
                <Ionicons
                  name={item.icon}
                  size={20}
                  color="#2563EB"
                  style={{ marginTop: 2 }}
                />
                <Text className="text-body text-neutral-700 flex-1 leading-6">
                  {item.text}
                </Text>
              </Animated.View>
            ))}
          </View>
        </View>

        {/* CTA — single primary action */}
        <Animated.View entering={enter(280)}>
          <Button
            title="Get started"
            variant="primaryBlue"
            size="lg"
            onPress={() => router.push("/onboarding/name")}
            accessibilityLabel="Continue to set up your profile"
          />
        </Animated.View>
      </View>
    </View>
  );
}
