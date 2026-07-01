import React, { useState } from "react";
import { View, Text, TextInput } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Button } from "@/components/ui/Button";
import { useSettingsStore } from "@/store/settingsStore";

export default function NameScreen() {
  const insets = useSafeAreaInsets();
  const [name, setName] = useState("");

  const handleContinue = () => {
    if (name.trim()) {
      useSettingsStore.getState().updateSettings({ displayName: name.trim() });
    }
    router.push("/onboarding/availability");
  };

  const handleSkip = () => {
    router.push("/onboarding/availability");
  };

  return (
    <View
      className="flex-1 bg-neutral-100 justify-between px-6"
      style={{ paddingTop: insets.top + 40, paddingBottom: insets.bottom + 24 }}
    >
      <View className="items-center mt-12">
        <View className="w-24 h-24 rounded-full bg-primary-100 items-center justify-center mb-6">
          <Ionicons name="person-outline" size={48} color="#2563EB" />
        </View>
        <Text className="text-h2 font-bold text-neutral-900 text-center mb-3">
          What should we call you?
        </Text>
        <Text className="text-body text-neutral-500 text-center leading-6 max-w-[300px]">
          We'll use this to personalize your experience.
        </Text>
      </View>

      <View className="my-8">
        <TextInput
          className="bg-white border border-neutral-200 rounded-md min-h-12 px-4 text-body-lg text-neutral-900"
          placeholder="Your first name"
          placeholderTextColor="#A1A1AA"
          value={name}
          onChangeText={setName}
          autoFocus
          autoCapitalize="words"
          returnKeyType="done"
          onSubmitEditing={handleContinue}
          accessibilityLabel="Enter your first name"
        />
      </View>

      <View className="gap-3">
        <Button
          title="Continue"
          variant="primary"
          onPress={handleContinue}
          accessibilityLabel="Save name and continue"
        />
        <Button
          title="Skip"
          variant="ghost"
          onPress={handleSkip}
          accessibilityLabel="Skip name entry and continue"
        />
      </View>
    </View>
  );
}
