import React, { useState } from "react";
import { View, Text, Pressable, ScrollView } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Button } from "@/components/ui/Button";
import { useSettingsStore } from "@/store/settingsStore";

const timeSlots = [
  { label: "Morning", subtitle: "8am - 12pm", start: 8, end: 12, icon: "sunny-outline" as const },
  { label: "Afternoon", subtitle: "12pm - 4pm", start: 12, end: 16, icon: "partly-sunny-outline" as const },
  { label: "Late afternoon", subtitle: "4pm - 7pm", start: 16, end: 19, icon: "cloudy-outline" as const },
  { label: "Evening", subtitle: "7pm - 11pm", start: 19, end: 23, icon: "moon-outline" as const },
];

export default function EnergyScreen() {
  const insets = useSafeAreaInsets();
  const [selected, setSelected] = useState(1); // Default: afternoon

  const handleFinish = () => {
    const slot = timeSlots[selected];
    useSettingsStore.getState().updateSettings({
      energyPeak: { start: slot.start * 60, end: slot.end * 60 },
      onboardingComplete: true,
    });
    router.replace("/(tabs)");
  };

  return (
    <View
      className="flex-1 bg-neutral-100"
      style={{ paddingTop: insets.top + 40, paddingBottom: insets.bottom + 24 }}
    >
      <ScrollView className="flex-1 px-6" contentContainerClassName="pb-8">
        <View className="items-center mb-8">
          <View className="w-24 h-24 rounded-full bg-primary-100 items-center justify-center mb-6">
            <Ionicons name="flash-outline" size={48} color="#2563EB" />
          </View>
          <Text className="text-h2 font-bold text-neutral-900 text-center mb-3">
            When do you focus best?
          </Text>
          <Text className="text-body text-neutral-500 text-center leading-6 max-w-[300px]">
            We'll favor your peak energy time when planning. You can change this
            anytime.
          </Text>
        </View>

        <View className="gap-3">
          {timeSlots.map((slot, i) => {
            const isSelected = selected === i;
            return (
              <Pressable
                key={i}
                onPress={() => setSelected(i)}
                className={
                  isSelected
                    ? "flex-row items-center gap-4 rounded-lg p-4 border-2 border-primary-500 bg-primary-50"
                    : "flex-row items-center gap-4 rounded-lg p-4 border border-neutral-200 bg-white"
                }
                accessibilityRole="radio"
                accessibilityState={{ selected: isSelected }}
                accessibilityLabel={`${slot.label}: ${slot.subtitle}`}
              >
                <View
                  className={
                    isSelected
                      ? "w-12 h-12 rounded-full items-center justify-center bg-primary-100"
                      : "w-12 h-12 rounded-full items-center justify-center bg-neutral-100"
                  }
                >
                  <Ionicons
                    name={slot.icon}
                    size={24}
                    color={isSelected ? "#2563EB" : "#71717A"}
                  />
                </View>
                <View className="flex-1">
                  <Text
                    className={
                      isSelected
                        ? "text-body-lg font-semibold text-neutral-900"
                        : "text-body-lg font-semibold text-neutral-600"
                    }
                  >
                    {slot.label}
                  </Text>
                  <Text className="text-caption text-neutral-500">
                    {slot.subtitle}
                  </Text>
                </View>
                {isSelected && (
                  <Ionicons name="checkmark-circle" size={24} color="#2563EB" />
                )}
              </Pressable>
            );
          })}
        </View>
      </ScrollView>

      <View className="px-6">
        <Button
          title="All set — let's go"
          variant="primary"
          onPress={handleFinish}
          accessibilityLabel="Complete setup and go to home screen"
        />
      </View>
    </View>
  );
}
