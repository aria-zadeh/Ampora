/**
 * Auth screen — Sign in with Apple, Sign in with Google, and email magic link
 * (FR-87). An account is required; there is no anonymous/guest mode.
 */

import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Pressable,
  ActivityIndicator,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import Animated, { FadeIn, FadeInDown } from "react-native-reanimated";
import { Button } from "@/components/ui/Button";
import { Heading } from "@/components/ui/Heading";
import { Input } from "@/components/ui/Input";
import {
  signInWithMagicLink,
  signInWithApple,
  signInWithGoogle,
  isAppleSignInAvailable,
} from "@/services/supabase";
import { shadows, gradients } from "@/utils/design-tokens";
import { DURATIONS } from "@/utils/motion";
import { useReduceMotion } from "@/hooks/useReduceMotion";
import { useRouter } from "expo-router";
import { FEATURE_FLAGS } from "@/constants/featureFlags";
import { useDevAuthStore } from "@/store/devAuthStore";

type ScreenState = "idle" | "loading" | "success" | "error";
type ErrorKind = "invalidEmail" | "network" | "generic";
type SocialProvider = "apple" | "google";

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
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [screenState, setScreenState] = useState<ScreenState>("idle");
  const [errorKind, setErrorKind] = useState<ErrorKind>("generic");
  const [cooldown, setCooldown] = useState(0);
  const [socialLoading, setSocialLoading] = useState<SocialProvider | null>(null);
  const [socialError, setSocialError] = useState<string | null>(null);
  const [appleAvailable, setAppleAvailable] = useState(false);
  const reduceMotion = useReduceMotion();
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

  // Apple's button must only ever appear where it can actually work (FR-64
  // "never block use behind a permission; degrade gracefully") — iOS, the
  // native module resolved, and the device/account supports it. Android and
  // web never even attempt the check (isAppleSignInAvailable short-circuits).
  useEffect(() => {
    let cancelled = false;
    if (Platform.OS === "ios") {
      isAppleSignInAvailable().then((available) => {
        if (!cancelled) setAppleAvailable(available);
      });
    }
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSocial(provider: SocialProvider) {
    if (socialLoading) return;
    setSocialError(null);
    setSocialLoading(provider);
    const { error } =
      provider === "apple" ? await signInWithApple() : await signInWithGoogle();
    setSocialLoading(null);
    if (error) {
      setSocialError(
        provider === "apple"
          ? "Couldn't sign in with Apple. Please try again."
          : "Couldn't sign in with Google. Please try again."
      );
    }
    // No manual navigation: a successful sign-in updates the Supabase auth
    // session, which app/_layout.tsx's onAuthStateChange listener + routing
    // gate picks up and routes onward, same as the magic-link path below.
  }

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

          {/* Sign in with Apple / Google (FR-87). Positioned above the email
              form — Apple guideline 4.8 requires Apple's own button be at
              least as prominent as any other third-party sign-in offered.
              The Apple button only renders where it can actually work
              (iOS + native module resolved + device/account supports it,
              checked async above); Google renders everywhere (FR-64 "never
              block use behind a permission; degrade gracefully"). */}
          <Animated.View entering={enter(45)} className="gap-3 mb-6">
            {socialError && (
              <View accessibilityLiveRegion="polite">
                <Text className="text-caption text-danger-600 text-center">
                  {socialError}
                </Text>
              </View>
            )}

            {Platform.OS === "ios" && appleAvailable && (
              <Pressable
                onPress={() => handleSocial("apple")}
                disabled={socialLoading !== null}
                className={`min-h-[48px] flex-row items-center justify-center rounded-md bg-black px-5 ${
                  socialLoading !== null ? "opacity-50" : ""
                }`}
                accessibilityRole="button"
                accessibilityLabel="Sign in with Apple"
                accessibilityState={{
                  disabled: socialLoading !== null,
                  busy: socialLoading === "apple",
                }}
              >
                {socialLoading === "apple" ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <>
                    <Ionicons name="logo-apple" size={19} color="#FFFFFF" />
                    <Text className="text-label font-medium text-white ml-2">
                      Sign in with Apple
                    </Text>
                  </>
                )}
              </Pressable>
            )}

            <Pressable
              onPress={() => handleSocial("google")}
              disabled={socialLoading !== null}
              className={`min-h-[48px] flex-row items-center justify-center rounded-md bg-white border border-neutral-200 px-5 ${
                socialLoading !== null ? "opacity-50" : ""
              }`}
              accessibilityRole="button"
              accessibilityLabel="Sign in with Google"
              accessibilityState={{
                disabled: socialLoading !== null,
                busy: socialLoading === "google",
              }}
            >
              {socialLoading === "google" ? (
                <ActivityIndicator color="#1C1917" />
              ) : (
                <>
                  <Ionicons name="logo-google" size={18} color="#4285F4" />
                  <Text className="text-label font-medium text-neutral-900 ml-2">
                    Sign in with Google
                  </Text>
                </>
              )}
            </Pressable>

            {/*
              Dev-only escape hatch. Stripped from production builds:
              FEATURE_FLAGS.DEV_BYPASS_AUTH is `__DEV__`, a compile-time
              constant, so this whole branch is dead code Metro drops. It
              fabricates no session (see store/devAuthStore.ts) — it only stops
              the routing gate in app/_layout.tsx from bouncing back here, so
              the app runs pure local-first with no cloud sync. Exists because
              Google sign-in and the magic link both depend on remote setup
              that is not finished, which otherwise makes the app unopenable.
            */}
            {FEATURE_FLAGS.DEV_BYPASS_AUTH && (
              <Pressable
                onPress={() => {
                  useDevAuthStore.getState().enableBypass();
                  router.replace("/");
                }}
                className="min-h-[48px] flex-row items-center justify-center rounded-md border border-dashed border-neutral-300 px-5"
                accessibilityRole="button"
                accessibilityLabel="Skip sign-in, development only"
                accessibilityHint="Opens the app with no account and no cloud sync. Not available in released builds."
              >
                <Ionicons name="construct-outline" size={16} color="#78716C" />
                <Text className="text-label font-medium text-neutral-500 ml-2">
                  Skip sign-in (dev)
                </Text>
              </Pressable>
            )}

            <View className="flex-row items-center my-1">
              <View className="flex-1 h-px bg-neutral-200" />
              <Text className="text-caption text-neutral-500 mx-3">or</Text>
              <View className="flex-1 h-px bg-neutral-200" />
            </View>
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
                    cooldown > 0 ? "text-neutral-500" : "text-primary-600"
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
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
