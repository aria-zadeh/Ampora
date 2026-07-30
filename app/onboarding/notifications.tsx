import React from "react";
import { View, Text } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import Animated, { FadeInDown } from "react-native-reanimated";
import { Button } from "@/components/ui/Button";
import { Heading } from "@/components/ui/Heading";
import { requestNotificationPermissions } from "@/services/notifications";
import { gradients } from "@/utils/design-tokens";
import { DURATIONS, staggerDelay } from "@/utils/motion";
import { useReduceMotion } from "@/hooks/useReduceMotion";
import { ProgressDots } from "./ProgressDots";

const PROMISES = [
  { icon: "volume-low-outline" as const, text: "At most one reminder an hour." },
  { icon: "moon-outline" as const, text: "Silent overnight, from 11pm to 8am." },
  { icon: "heart-outline" as const, text: "Encouraging nudges, never nagging." },
];

export default function NotificationsScreen() {
  const insets = useSafeAreaInsets();
  const reduceMotion = useReduceMotion();

  const handleAllow = async () => {
    await requestNotificationPermissions();
    router.push("/onboarding/availability");
  };

  const handleSkip = () => {
    router.push("/onboarding/availability");
  };

  const enter = (delay: number) =>
    reduceMotion ? undefined : FadeInDown.delay(delay).duration(DURATIONS.base);

  return (
    <View
      className="flex-1 bg-neutral-100"
      style={{ paddingTop: insets.top, paddingBottom: insets.bottom + 24 }}
    >
      <LinearGradient
        colors={gradients.heroWash}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        pointerEvents="none"
        style={{ position: "absolute", top: 0, left: 0, right: 0, height: 360 }}
      />

      <View className="flex-1 justify-between px-6" style={{ paddingTop: 48 }}>
        <View>
          <Animated.View entering={enter(0)} className="mb-6">
            <ProgressDots total={4} current={2} />
          </Animated.View>
          <Animated.View entering={enter(0)}>
            <Text className="text-overline text-neutral-500 uppercase tracking-wide mb-3">
              Gentle by default
            </Text>
            <Heading size="h1" className="text-neutral-900 max-w-[300px]">
              Reminders that respect your focus
            </Heading>
            <Text className="text-body-lg text-neutral-600 mt-3 leading-6 max-w-[330px]">
              We only reach out when it actually helps. No spam, no pressure —
              here’s our promise.
            </Text>
          </Animated.View>

          <View className="mt-10 gap-5">
            {PROMISES.map((item, i) => (
              <Animated.View
                key={item.text}
                entering={enter(120 + staggerDelay(i))}
                className="flex-row items-center gap-3"
              >
                <View className="w-9 h-9 rounded-full bg-primary-50 items-center justify-center">
                  <Ionicons name={item.icon} size={18} color="#2563EB" />
                </View>
                <Text className="text-body text-neutral-700 flex-1 leading-6">
                  {item.text}
                </Text>
              </Animated.View>
            ))}
          </View>
        </View>

        <Animated.View entering={enter(280)} className="gap-2">
          <Button
            title="Allow notifications"
            variant="primaryBlue"
            size="lg"
            onPress={handleAllow}
            accessibilityLabel="Allow notifications and continue"
          />
          <Button
            title="Maybe later"
            variant="ghost"
            onPress={handleSkip}
            accessibilityLabel="Skip notifications and continue"
          />
        </Animated.View>
      </View>
    </View>
  );
}
