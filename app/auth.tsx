/**
 * Auth screen — magic link sign-in
 */

import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Pressable,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import Animated, { FadeIn, FadeInDown } from "react-native-reanimated";
import { Button } from "@/components/ui/Button";
import { Heading } from "@/components/ui/Heading";
import { signInWithMagicLink } from "@/services/supabase";
import { useSettingsStore } from "@/store/settingsStore";
import { shadows, gradients } from "@/utils/design-tokens";
import { DURATIONS } from "@/utils/motion";
import { useReduceMotion } from "@/hooks/useReduceMotion";

type ScreenState = "idle" | "loading" | "success" | "error";

export default function AuthScreen() {
  const [email, setEmail] = useState("");
  const [focused, setFocused] = useState(false);
  const [screenState, setScreenState] = useState<ScreenState>("idle");
  const router = useRouter();
  const reduceMotion = useReduceMotion();
  const onboardingComplete = useSettingsStore((s) => s.settings.onboardingComplete);

  const isValidEmail = email.includes("@") && email.includes(".");

  async function handleSend() {
    if (!isValidEmail || screenState === "loading") return;

    setScreenState("loading");
    const { error } = await signInWithMagicLink(email.trim().toLowerCase());

    if (error) {
      setScreenState("error");
    } else {
      setScreenState("success");
    }
  }

  const enter = (delay: number) =>
    reduceMotion ? undefined : FadeInDown.delay(delay).duration(DURATIONS.base);

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      className="flex-1 bg-neutral-100"
    >
      {/* Hero gradient wash behind the brand block */}
      <LinearGradient
        colors={gradients.heroWash}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        pointerEvents="none"
        style={{ position: "absolute", top: 0, left: 0, right: 0, height: 360 }}
      />

      <ScrollView
        contentContainerClassName="flex-grow justify-center"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View className="px-6 py-16">
          {/* Brand block */}
          <Animated.View entering={enter(0)} className="mb-14">
            <View
              className="w-14 h-14 rounded-2xl bg-white items-center justify-center mb-6 border border-neutral-200"
              style={shadows.sm}
            >
              <Ionicons
                name="aperture"
                size={30}
                color="#2563EB"
                accessibilityLabel="Ampora app icon"
              />
            </View>
            <Heading
              size="display"
              className="text-neutral-900"
              accessibilityRole="header"
            >
              Ampora
            </Heading>
            <Text className="text-body-lg text-neutral-600 mt-3 max-w-[320px] leading-6">
              Built for brains that work differently. Sign in and pick up right
              where you left off.
            </Text>
          </Animated.View>

          {/* Success state */}
          {screenState === "success" ? (
            <Animated.View
              entering={reduceMotion ? undefined : FadeIn.duration(DURATIONS.slow)}
              className="bg-white border border-neutral-200 rounded-2xl p-6 gap-3"
              style={shadows.sm}
              accessibilityLiveRegion="polite"
            >
              <View className="w-11 h-11 rounded-full bg-primary-50 items-center justify-center">
                <Ionicons
                  name="mail-outline"
                  size={22}
                  color="#2563EB"
                  accessibilityLabel="Mail icon"
                />
              </View>
              <Heading size="h4">Check your email</Heading>
              <Text className="text-body text-neutral-600 leading-6">
                We sent a sign-in link to{" "}
                <Text className="text-neutral-900 font-medium">{email.trim()}</Text>
                . Tap it and you are in — no password needed.
              </Text>
            </Animated.View>
          ) : (
            /* Form state */
            <Animated.View entering={enter(90)} className="gap-3">
              {/* Email input */}
              <View>
                <Text
                  className="text-overline text-neutral-500 uppercase tracking-wide mb-2"
                  accessibilityLabel="Email address label"
                >
                  Email address
                </Text>
                <TextInput
                  className={`h-12 bg-white rounded-md px-4 text-body-lg text-neutral-900 border ${
                    focused ? "border-primary-500" : "border-neutral-200"
                  }`}
                  style={shadows.xs}
                  value={email}
                  onChangeText={(t) => {
                    setEmail(t);
                    if (screenState === "error") setScreenState("idle");
                  }}
                  onFocus={() => setFocused(true)}
                  onBlur={() => setFocused(false)}
                  placeholder="you@example.com"
                  placeholderTextColor="#A1A1AA"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="email"
                  returnKeyType="send"
                  onSubmitEditing={handleSend}
                  accessibilityLabel="Email address input"
                  accessibilityHint="Enter your email address to receive a sign-in link"
                  editable={screenState !== "loading"}
                />
              </View>

              {/* Error message */}
              {screenState === "error" && (
                <Text
                  className="text-caption text-danger-600"
                  accessibilityLiveRegion="polite"
                  accessibilityRole="alert"
                >
                  Hmm, something went wrong. Try again?
                </Text>
              )}

              {/* Submit button — the single primary action */}
              <View className="mt-2">
                <Button
                  title="Send me a sign-in link"
                  variant="primaryBlue"
                  size="lg"
                  loading={screenState === "loading"}
                  disabled={!isValidEmail || screenState === "loading"}
                  onPress={handleSend}
                  accessibilityLabel="Send magic link to email"
                  accessibilityHint="Sends a sign-in link to the email address you entered"
                />
              </View>
            </Animated.View>
          )}

          {/* Guest mode */}
          <Animated.View entering={enter(160)} className="mt-12 items-center">
            <Pressable
              onPress={() => {
                // Set a global flag so _layout.tsx treats us as "authenticated"
                // without a real Supabase session.
                (globalThis as Record<string, unknown>).__AMPORA_GUEST_MODE__ = true;
                if (onboardingComplete) {
                  router.replace("/(tabs)");
                } else {
                  router.replace("/onboarding/welcome");
                }
              }}
              className="min-h-[44px] px-4 items-center justify-center"
              accessibilityLabel="Continue as guest"
              accessibilityRole="button"
            >
              <Text className="text-label text-neutral-500">
                Just looking?{" "}
                <Text className="text-primary-600 font-medium">Continue as guest</Text>
              </Text>
            </Pressable>
          </Animated.View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
