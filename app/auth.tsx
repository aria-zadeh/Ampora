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
import { useColorScheme } from "nativewind";
import { Button } from "@/components/ui/Button";
import { Heading } from "@/components/ui/Heading";
import { Input } from "@/components/ui/Input";
import {
  signInWithMagicLink,
  signInWithApple,
  signInWithGoogle,
  isAppleSignInAvailable,
} from "@/services/supabase";
import { brand, colors, shadows, gradients } from "@/utils/design-tokens";
import { DURATIONS } from "@/utils/motion";
import { useReduceMotion } from "@/hooks/useReduceMotion";
import { useThemeColors } from "@/hooks/useThemeColors";
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
  // Ionicons `color`, ActivityIndicator `color` and LinearGradient `colors`
  // all take literal values and cannot take a `dark:` class, so they resolve
  // the active scheme here. className styling uses `dark:` variants directly.
  const theme = useThemeColors();
  const { colorScheme } = useColorScheme();
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
      className="flex-1 bg-neutral-100 dark:bg-neutral-950"
    >
      {/* Hero gradient wash behind the brand block. Dark swaps in the
          token-built dark wash — the light one is a bright primary-50 tint
          that glares on a near-black canvas. */}
      <LinearGradient
        colors={colorScheme === "dark" ? gradients.heroWashDark : gradients.heroWash}
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
              className="w-14 h-14 rounded-2xl bg-white items-center justify-center mb-6 border border-neutral-200 dark:bg-neutral-900 dark:border-neutral-800"
              style={shadows.sm}
            >
              {/* `primary` is one value in both token sets, so the mark reads
                  4.75:1 on the light card and 3.38:1 on the dark one, clear of
                  the 3:1 graphical-object bar either way. */}
              <Ionicons
                name="aperture"
                size={30}
                color={theme.primary}
                accessibilityLabel="Ampora app icon"
              />
            </View>
            <Heading
              size="display"
              className="text-neutral-900 dark:text-neutral-50"
              accessibilityRole="header"
            >
              Ampora
            </Heading>
            <Text className="text-body-lg text-neutral-600 dark:text-neutral-400 mt-3 max-w-[320px] leading-6">
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
                {/* Accent TEXT on the canvas, so it steps lighter on dark per
                    the accent split in the cheatsheet atop
                    utils/design-tokens.ts: danger-600 is 3.62:1 there, short
                    of the 4.5:1 a 13px line owes, danger-500 clears it at
                    5.25:1. Light is untouched. */}
                <Text className="text-caption text-danger-600 dark:text-danger-500 text-center">
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
                {/* Apple's button is black with a white mark and label in BOTH
                    themes, and stays that way on purpose: it is a branded
                    control governed by Apple's Sign in with Apple guidelines,
                    not an Ampora surface, so it never flips with the app
                    theme. `primaryForeground` is white in both token sets, so
                    it names the tone without pinning a literal, and the pair
                    measures 21:1 either way. */}
                {socialLoading === "apple" ? (
                  <ActivityIndicator color={theme.primaryForeground} />
                ) : (
                  <>
                    <Ionicons name="logo-apple" size={19} color={theme.primaryForeground} />
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
              {/* Google's button is the sanctioned LIGHT variant, and it stays
                  light in both themes for the same reason Apple's stays black:
                  Google's branding guidelines define the permitted surface and
                  mark, and an app-themed recolour of either is off-spec. So
                  the fill, label and spinner are pinned to the light token set
                  rather than resolved through `theme` — resolving them would
                  put a near-white spinner and label on the white button in
                  dark mode. `brand.google` is the mark's own blue, held apart
                  from `colors` precisely so it can never gain a `dark:`
                  variant. Ink on the white fill measures 17.49:1. */}
              {socialLoading === "google" ? (
                <ActivityIndicator color={colors.light.text} />
              ) : (
                <>
                  <Ionicons name="logo-google" size={18} color={brand.google} />
                  <Text className="text-label font-medium text-neutral-900 ml-2">
                    Sign in with Google
                  </Text>
                </>
              )}
            </Pressable>

            {/*
              Sign-in escape hatch. Shown on every local dev run and, since
              2026-08-07, on the deployed web preview too, which sets
              EXPO_PUBLIC_DEV_AUTH_BYPASS=1 in vercel.json at Aria's explicit
              request. Both inputs are compile-time constants, so where the flag
              is false this whole branch is dead code Metro drops.

              It fabricates no session (see store/devAuthStore.ts) — it only
              stops the routing gate in app/_layout.tsx from bouncing back here,
              so the app runs pure local-first with no cloud sync and reaches
              nobody's account. Read constants/featureFlags.ts before shipping.
            */}
            {FEATURE_FLAGS.DEV_BYPASS_AUTH && (
              <Pressable
                onPress={() => {
                  useDevAuthStore.getState().enableBypass();
                  router.replace("/");
                }}
                className="min-h-[48px] flex-row items-center justify-center rounded-md border border-dashed border-neutral-300 px-5 dark:border-neutral-700"
                accessibilityRole="button"
                accessibilityLabel="Skip sign-in, development only"
                accessibilityHint="Opens the app with no account and no cloud sync. Not available in released builds."
              >
                {/* Glyph and label now resolve to the SAME muted tone in each
                    theme. They did not before: the glyph was a stray literal
                    one step off its own label, and the value it carried is the
                    dark-mode muted tone, not the light one. */}
                <Ionicons name="construct-outline" size={16} color={theme.textMuted} />
                <Text className="text-label font-medium text-neutral-500 dark:text-[#78716C] ml-2">
                  Skip sign-in (dev)
                </Text>
              </Pressable>
            )}

            <View className="flex-row items-center my-1">
              <View className="flex-1 h-px bg-neutral-200 dark:bg-neutral-800" />
              <Text className="text-caption text-neutral-500 dark:text-[#78716C] mx-3">or</Text>
              <View className="flex-1 h-px bg-neutral-200 dark:bg-neutral-800" />
            </View>
          </Animated.View>

          {/* Success state */}
          {screenState === "success" ? (
            <Animated.View
              entering={reduceMotion ? undefined : FadeIn.duration(DURATIONS.slow)}
              className="bg-white border border-neutral-200 rounded-2xl p-6 gap-3 dark:bg-neutral-900 dark:border-neutral-800"
              style={shadows.sm}
              accessibilityLiveRegion="polite"
            >
              {/* Tint bubble with a matched glyph — a self-contained audited
                  pair (doc 02 §14.6), 4.75:1 in both themes, so it keeps the
                  light tint rather than inventing a darker one. */}
              <View className="w-11 h-11 rounded-full bg-primary-50 items-center justify-center">
                <Ionicons
                  name="mail-outline"
                  size={22}
                  color={theme.primary}
                  accessibilityLabel="Mail icon"
                />
              </View>
              <Heading size="h4">Check your email</Heading>
              <Text className="text-body text-neutral-600 dark:text-neutral-400 leading-6">
                We sent a sign-in link to{" "}
                <Text className="text-neutral-900 dark:text-neutral-50 font-medium">
                  {email.trim()}
                </Text>
                . Tap it and you are in — no password needed.
              </Text>
              <Text className="text-caption text-neutral-500 dark:text-[#78716C]">
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
                {/* A hand-rolled ghost text button, so its enabled label
                    resolves the way components/ui/Button.tsx's `ghost` variant
                    now does: primary-600 is 3.38:1 on the dark card, short of
                    the 4.5:1 a 14px label owes, primary-400 clears it at
                    6.88:1. The cooldown label is the DISABLED state of that
                    same control and stays at the muted tier, which is
                    WCAG-exempt — and the remaining seconds are also spoken
                    through `accessibilityHint` on the Pressable above, so the
                    quiet tone is never the only way to read them. */}
                <Text
                  className={`text-label font-medium ${
                    cooldown > 0
                      ? "text-neutral-500 dark:text-[#78716C]"
                      : "text-primary-600 dark:text-primary-400"
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
