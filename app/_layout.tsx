import "../global.css";
import "@/nativewind-reanimated";
import React, { useEffect, useState } from "react";
import { Stack, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useColorScheme } from "nativewind";
import {
  useFonts,
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from "@expo-google-fonts/inter";
import { useSettingsStore } from "@/store/settingsStore";
import { getCurrentUser, onAuthStateChange } from "@/services/supabase";
import type { User } from "@supabase/supabase-js";

export default function RootLayout() {
  const { colorScheme, setColorScheme } = useColorScheme();
  const themePreference = useSettingsStore((s) => s.settings.themePreference);
  const onboardingComplete = useSettingsStore((s) => s.settings.onboardingComplete);

  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [guestMode, setGuestMode] = useState(false);

  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  // Short delay to let Zustand/MMKV hydrate before we gate routing.
  useEffect(() => {
    const timer = setTimeout(() => setReady(true), 100);
    return () => clearTimeout(timer);
  }, []);

  // Auth: check current session on mount, then subscribe to changes.
  useEffect(() => {
    let cancelled = false;

    getCurrentUser()
      .then((user) => {
        if (!cancelled) {
          setAuthUser(user);
          setAuthLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setAuthUser(null);
          setAuthLoading(false);
        }
      });

    const unsubscribe = onAuthStateChange((_event, session) => {
      if (!cancelled) {
        setAuthUser(session?.user ?? null);
        setAuthLoading(false);
      }
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  // Poll for the guest-mode flag set by the auth screen.
  useEffect(() => {
    if (guestMode) return;
    const check = setInterval(() => {
      if ((globalThis as Record<string, unknown>).__AMPORA_GUEST_MODE__) {
        setGuestMode(true);
      }
    }, 200);
    return () => clearInterval(check);
  }, [guestMode]);

  // Routing gate: no session → auth; session but not onboarded → onboarding.
  useEffect(() => {
    if (authLoading || !ready) return;
    if (guestMode) return; // guest mode handles its own routing
    if (authUser === null) {
      router.replace("/auth");
    } else if (!onboardingComplete) {
      router.replace("/onboarding/welcome");
    }
  }, [authLoading, ready, authUser, onboardingComplete, guestMode, router]);

  // Sync app color scheme with the user's theme preference.
  useEffect(() => {
    setColorScheme(themePreference === "system" ? "system" : themePreference);
  }, [themePreference, setColorScheme]);

  if (authLoading || !ready || !fontsLoaded) return null;

  return (
    <>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="auth" />
        <Stack.Screen name="onboarding" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen
          name="task/new"
          options={{ presentation: "modal", animation: "slide_from_bottom" }}
        />
        <Stack.Screen name="task/[id]" options={{ animation: "slide_from_right" }} />
        <Stack.Screen
          name="focus/session"
          options={{ presentation: "fullScreenModal", animation: "slide_from_bottom" }}
        />
        <Stack.Screen
          name="settings/busy-times"
          options={{ animation: "slide_from_right" }}
        />
      </Stack>
      <StatusBar style={colorScheme === "dark" ? "light" : "dark"} />
    </>
  );
}
