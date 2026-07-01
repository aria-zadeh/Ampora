import React from "react";
import { View, Text, ScrollView } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Button } from "@/components/ui/Button";

export default function AvailabilityScreen() {
  const insets = useSafeAreaInsets();

  const handleContinue = () => {
    router.push("/onboarding/energy");
  };

  return (
    <View
      className="flex-1 bg-neutral-100"
      style={{ paddingTop: insets.top + 40, paddingBottom: insets.bottom + 24 }}
    >
      <ScrollView className="flex-1 px-6" contentContainerClassName="pb-8">
        <View className="items-center mb-8 mt-8">
          <View className="w-24 h-24 rounded-full bg-primary-100 items-center justify-center mb-6">
            <Ionicons name="calendar-outline" size={48} color="#2563EB" />
          </View>
          <Text className="text-h2 font-bold text-neutral-900 text-center mb-3">
            We'll work around your schedule
          </Text>
          <Text className="text-body text-neutral-500 text-center leading-6 max-w-[300px]">
            Ampora plans your tasks inside the time you have free. You can set
            your busy times and study hours later from your profile.
          </Text>
        </View>

        <View className="gap-3">
          {[
            {
              icon: "time-outline" as const,
              title: "Your hours, respected",
              text: "Nothing gets scheduled outside the times you make available.",
            },
            {
              icon: "calendar-clear-outline" as const,
              title: "Busy times stay busy",
              text: "Block out recurring commitments so plans never collide.",
            },
          ].map((item) => (
            <View
              key={item.title}
              className="flex-row items-start gap-3 bg-white border border-neutral-200 rounded-lg p-4 shadow-sm"
            >
              <View className="w-10 h-10 rounded-full bg-primary-100 items-center justify-center">
                <Ionicons name={item.icon} size={20} color="#2563EB" />
              </View>
              <View className="flex-1">
                <Text className="text-body-lg font-semibold text-neutral-900">
                  {item.title}
                </Text>
                <Text className="text-caption text-neutral-500 mt-1 leading-5">
                  {item.text}
                </Text>
              </View>
            </View>
          ))}
        </View>
      </ScrollView>

      <View className="px-6">
        <Button
          title="Looks good"
          variant="primary"
          onPress={handleContinue}
          accessibilityLabel="Continue to energy peak setup"
        />
      </View>
    </View>
  );
}
