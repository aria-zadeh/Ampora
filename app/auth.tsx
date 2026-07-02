/**
 * Auth screen — magic link sign-in
 */

import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
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
import { Input } from "@/components/ui/Input";
import { signInWithMagicLink } from "@/services/supabase";
import { useSettingsStore } from "@/store/settingsStore";
import { shadows, gradients } from "@/utils/design-tokens";
import { DURATIONS } from "@/utils/motion";
import { useReduceMotion } from "@/hooks/useReduceMotion";

type ScreenState = "idle" | "loading" | "success" | "error";
type ErrorKind = "invalidEmail" | "network" | "generic";

/** Seconds the user must wait before "Resend link" becomes tappable again. */
const RESEND_COOLDOWN_SECONDS = 45;

/** Calm, jargon-free copy per error kind — no "Oops!", no raw error strings. */
const ERROR_COPY: Record<ErrorKind, string> = {
  invalidEmail: "That email doesn't look right. Double-check it and try again.",
  network:
    "Couldn't send the link. Check your connection and try again.",
  generic: "Couldn't send the link right now. Please try again in a moment.",
};

/** Best-effort classification from a Supabase AuthError — never throws. */
function classifyError(error: Error): ErrorKind {
  const message = error.message?.toLowerCase() ?? "";
  const status = (error as { status?: number }).status;
  if (
    message.includes("network") ||
    message.includes("fetch") ||
    message.includes("offline") ||
    status === undefined
  ) {
    return "network";
  }
  if (message.includes("email") || message.includes("invalid")) {
    return "invalidEmail";
  }
  return "generic";
}

export default function AuthScreen() {
  const [email, setEmail] = useState("");
  const [screenState, setScreenState] = useState<ScreenState>("idle");
  const [errorKind, setErrorKind] = useState<ErrorKind>("generic");
  const [cooldown, setCooldown] = useState(0);
  const router = useRouter();
  const reduceMotion = useReduceMotion();
  const onboardingComplete = useSettingsStore((s) => s.settings.onboardingComplete);
  const cooldownTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const isValidEmail = email.includes("@") && email.includes(".");

  // Countdown ticks every second while > 0; cleans up on unmount.
  useEffect(() => {
    if (cooldown <= 0) return;
    cooldownTimer.current = setInterval(() => {
      setCooldown((s) => (s <= 1 ? 0 : s - 1));
    }, 1000);
    return () => {
      if (cooldownTimer.current) clearInterval(cooldownTimer.current);
    };
  }, [cooldown]);

  async function handleSend() {
    if (!isValidEmail || screenState === "loading") return;

    setScreenState("loading");
    const { error } = await signInWithMagicLink(email.trim().toLowerCase());

    if (error) {
      setErrorKind(classifyError(error));
      setScreenState("error");
    } else {
      setScreenState("success");
      setCooldown(RESEND_COOLDOWN_SECONDS);
    }
  }

  /** Resend uses the same send path but never re-shows loading chrome over the success card. */
  async function handleResend() {
    if (cooldown > 0) return;
    const { error } = await signInWithMagicLink(email.trim().toLowerCase());
    if (error) {
      setErrorKind(classifyError(error));
      setScreenState("error");
    } else {
      setCooldown(RESEND_COOLDOWN_SECONDS);
    }
  }

  const enter = (delay: number) =>
    reduceMotion ? undefined : FadeInDown.delay(delay).duration(DURATIONS.base);

  const cooldownLabel =
    cooldown > 0
      ? `Resend in ${Math.floor(cooldown / 60)}:${String(cooldown % 60).padStart(2, "0")}`
      : "Resend link";

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
              <Text className="text-caption text-neutral-500">
                The link expires in 1 hour. Didn't get it? Check spam, or resend
                below.
              </Text>

              <Pressable
                onPress={handleResend}
                disabled={cooldown > 0}
                hitSlop={8}
                className="mt-1 min-h-[44px] items-center justify-center rounded-md"
                accessibilityRole="button"
                accessibilityLabel="Resend sign-in link"
                accessibilityState={{ disabled: cooldown > 0 }}
                accessibilityHint={
                  cooldown > 0
                    ? `Available again in ${cooldown} seconds`
                    : "Sends another sign-in link to the same email address"
                }
              >
                <Text
                  className={`text-label font-medium ${
                    cooldown > 0 ? "text-neutral-400" : "text-primary-600"
                  }`}
                >
                  {cooldownLabel}
                </Text>
              </Pressable>
            </Animated.View>
          ) : (
            /* Form state */
            <Animated.View entering={enter(90)} className="gap-3">
              {/* Email input — helperText carries the error copy. The wrapping
                  View is a live region so screen readers announce the error
                  as soon as it appears, without duplicating visible text. */}
              <View accessibilityLiveRegion="polite">
                <Input
                  label="Email address"
                  placeholder="you@example.com"
                  value={email}
                  onChangeText={(t) => {
                    setEmail(t);
                    if (screenState === "error") setScreenState("idle");
                  }}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="email"
                  returnKeyType="send"
                  onSubmitEditing={handleSend}
                  editable={screenState !== "loading"}
                  error={screenState === "error"}
                  helperText={
                    screenState === "error" ? ERROR_COPY[errorKind] : undefined
                  }
                  accessibilityLabel="Email address input"
                  accessibilityHint="Enter your email address to receive a sign-in link"
                />
              </View>

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
