import React, { useState } from "react";
import { View, Text, KeyboardAvoidingView, Platform } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { FadeInDown } from "react-native-reanimated";
import { Button } from "@/components/ui/Button";
import { Heading } from "@/components/ui/Heading";
import { Input } from "@/components/ui/Input";
import { useSettingsStore } from "@/store/settingsStore";
import { DURATIONS } from "@/utils/motion";
import { useReduceMotion } from "@/hooks/useReduceMotion";
import { ProgressDots } from "./ProgressDots";

export default function NameScreen() {
  const insets = useSafeAreaInsets();
  const reduceMotion = useReduceMotion();
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

  const enter = (delay: number) =>
    reduceMotion ? undefined : FadeInDown.delay(delay).duration(DURATIONS.base);

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      className="flex-1 bg-neutral-100"
    >
      <View
        className="flex-1 justify-between px-6"
        style={{ paddingTop: insets.top + 48, paddingBottom: insets.bottom + 24 }}
      >
        <View>
          <Animated.View entering={enter(0)} className="mb-6">
            {/* Dot index 2 of 7 (PRD §8.10): index 1 ("Sign in") already
                happened via the auth gate before this stack ever mounted —
                see the numbering note in welcome.tsx. */}
            <ProgressDots total={7} current={2} />
          </Animated.View>
          <Animated.View entering={enter(0)}>
            <Text className="text-overline text-neutral-500 uppercase tracking-wide mb-3">
              A quick hello
            </Text>
            <Heading size="h1" className="text-neutral-900 max-w-[300px]">
              What should we call you?
            </Heading>
            <Text className="text-body-lg text-neutral-600 mt-3 leading-6 max-w-[320px]">
              Just a first name — we’ll use it to keep things personal.
            </Text>
          </Animated.View>

          <Animated.View entering={enter(90)} className="mt-10">
            <Input
              label="Your name"
              placeholder="Your first name"
              value={name}
              onChangeText={setName}
              autoFocus
              autoCapitalize="words"
              returnKeyType="done"
              onSubmitEditing={handleContinue}
              accessibilityLabel="Enter your first name"
            />
          </Animated.View>
        </View>

        <Animated.View entering={enter(160)} className="gap-2">
          <Button
            title="Continue"
            variant="primaryBlue"
            size="lg"
            onPress={handleContinue}
            accessibilityLabel="Save name and continue"
          />
          <Button
            title="Skip for now"
            variant="ghost"
            onPress={handleSkip}
            accessibilityLabel="Skip name entry and continue"
          />
        </Animated.View>
      </View>
    </KeyboardAvoidingView>
  );
}
