import React from "react";
import { View, Text } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Button } from "@/components/ui/Button";

export default function WelcomeScreen() {
  const insets = useSafeAreaInsets();

  return (
    <View
      className="flex-1 bg-surface dark:bg-surface-dark justify-between px-6"
      style={{ paddingTop: insets.top + 40, paddingBottom: insets.bottom + 24 }}
    >
      {/* Top spacer + icon */}
      <View className="items-center mt-12">
        <View className="w-24 h-24 rounded-full bg-accent-light dark:bg-accent/15 items-center justify-center mb-6">
          <Ionicons name="aperture-outline" size={48} className="text-primary dark:text-primary" />
        </View>
        <Text className="text-title font-bold text-content dark:text-content-dark-primary text-center mb-3">
          Hey, welcome to Ampora
        </Text>
        <Text className="text-body text-content-secondary dark:text-content-dark-secondary text-center leading-6 max-w-[300px]">
          Built for brains that work differently.{"\n\n"}
          We'll help you break big tasks into tiny steps, so you always know exactly what to do next.
        </Text>
      </View>

      {/* Features preview */}
      <View className="gap-4 my-8">
        {[
          { icon: "flash-outline" as const, text: "One tiny step at a time" },
          { icon: "timer-outline" as const, text: "Focus sessions with breaks" },
          { icon: "sparkles-outline" as const, text: "AI breaks down hard tasks" },
        ].map((item, i) => (
          <View key={i} className="flex-row items-center gap-3">
            <View className="w-10 h-10 rounded-full bg-primary/10 dark:bg-primary/20 items-center justify-center">
              <Ionicons name={item.icon} size={20} className="text-primary dark:text-primary" />
            </View>
            <Text className="text-body text-content dark:text-content-dark-primary flex-1">
              {item.text}
            </Text>
          </View>
        ))}
      </View>

      {/* CTA */}
      <Button
        title="Let's get started"
        variant="primary"
        onPress={() => router.push("/onboarding/name")}
        accessibilityLabel="Continue to notification setup"
      />
    </View>
  );
}
