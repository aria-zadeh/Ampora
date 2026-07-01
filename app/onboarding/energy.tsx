import React, { useState } from "react";
import { View, Text, ScrollView } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Animated, { FadeInDown } from "react-native-reanimated";
import { Button } from "@/components/ui/Button";
import { Heading } from "@/components/ui/Heading";
import { PressableScale } from "@/components/ui/PressableScale";
import { useSettingsStore } from "@/store/settingsStore";
import { shadows, gradients } from "@/utils/design-tokens";
import { DURATIONS, staggerDelay } from "@/utils/motion";
import { useReduceMotion } from "@/hooks/useReduceMotion";

const timeSlots = [
  { label: "Morning", subtitle: "8am - 12pm", start: 8, end: 12, icon: "sunny-outline" as const },
  { label: "Afternoon", subtitle: "12pm - 4pm", start: 12, end: 16, icon: "partly-sunny-outline" as const },
  { label: "Late afternoon", subtitle: "4pm - 7pm", start: 16, end: 19, icon: "cloudy-outline" as const },
  { label: "Evening", subtitle: "7pm - 11pm", start: 19, end: 23, icon: "moon-outline" as const },
];

export default function EnergyScreen() {
  const insets = useSafeAreaInsets();
  const reduceMotion = useReduceMotion();
  const [selected, setSelected] = useState(1); // Default: afternoon

  const handleFinish = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
      () => {},
    );
    const slot = timeSlots[selected];
    useSettingsStore.getState().updateSettings({
      energyPeak: { start: slot.start * 60, end: slot.end * 60 },
      onboardingComplete: true,
    });
    router.replace("/(tabs)");
  };

  const enter = (delay: number) =>
    reduceMotion ? undefined : FadeInDown.delay(delay).duration(DURATIONS.base);

  return (
    <View
      className="flex-1 bg-neutral-100"
      style={{ paddingTop: insets.top, paddingBottom: insets.bottom + 16 }}
    >
      <LinearGradient
        colors={gradients.heroWash}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        pointerEvents="none"
        style={{ position: "absolute", top: 0, left: 0, right: 0, height: 340 }}
      />

      <ScrollView
        className="flex-1"
        contentContainerClassName="px-6 pb-6"
        showsVerticalScrollIndicator={false}
      >
        <Animated.View entering={enter(0)} className="mt-12">
          <Text className="text-overline text-neutral-500 uppercase tracking-wide mb-3">
            One last thing
          </Text>
          <Heading size="h1" className="text-neutral-900 max-w-[300px]">
            When do you focus best?
          </Heading>
          <Text className="text-body-lg text-neutral-600 mt-3 leading-6 max-w-[330px]">
            We’ll favor your peak-energy hours when planning your day. You can
            change this anytime.
          </Text>
        </Animated.View>

        <View className="mt-8 gap-3">
          {timeSlots.map((slot, i) => {
            const isSelected = selected === i;
            return (
              <Animated.View key={i} entering={enter(100 + staggerDelay(i))}>
                <PressableScale
                  haptic="selection"
                  onPress={() => setSelected(i)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: isSelected }}
                  accessibilityLabel={`${slot.label}: ${slot.subtitle}`}
                >
                  <View
                    className={`flex-row items-center gap-4 rounded-2xl p-4 border ${
                      isSelected
                        ? "border-primary-500 bg-primary-50"
                        : "border-neutral-200 bg-white"
                    }`}
                    style={isSelected ? undefined : shadows.sm}
                  >
                    <View
                      className={`w-12 h-12 rounded-full items-center justify-center ${
                        isSelected ? "bg-primary-100" : "bg-neutral-100"
                      }`}
                    >
                      <Ionicons
                        name={slot.icon}
                        size={24}
                        color={isSelected ? "#2563EB" : "#71717A"}
                      />
                    </View>
                    <View className="flex-1">
                      <Text
                        className={`text-body-lg font-semibold ${
                          isSelected ? "text-neutral-900" : "text-neutral-700"
                        }`}
                      >
                        {slot.label}
                      </Text>
                      <Text className="text-caption text-neutral-500 mt-0.5">
                        {slot.subtitle}
                      </Text>
                    </View>
                    {isSelected && (
                      <Ionicons name="checkmark-circle" size={24} color="#2563EB" />
                    )}
                  </View>
                </PressableScale>
              </Animated.View>
            );
          })}
        </View>
      </ScrollView>

      <View className="px-6 pt-2">
        <Button
          title="All set — let's go"
          variant="primaryBlue"
          size="lg"
          onPress={handleFinish}
          accessibilityLabel="Complete setup and go to home screen"
        />
      </View>
    </View>
  );
}
