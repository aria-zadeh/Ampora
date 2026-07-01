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
import { useScheduleStore, selectAllBlocks } from "@/store/scheduleStore";
import { useTaskStore, selectAllTasks } from "@/store/taskStore";
import { useRecoveryStore } from "@/store/recoveryStore";
import { scheduleTaskReminders } from "@/services/notifications";
import { detectLapse } from "@/core/recovery";
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

  // Kick an initial schedule recompute once, on app open, after stores have
  // hydrated (FR-21 "recompute on app open"). Subsequent recomputes are driven
  // by the debounced task/settings subscriptions in scheduleStore.
  useEffect(() => {
    if (!ready) return;
    useScheduleStore.getState().recompute();
  }, [ready]);

  // Reschedule notification reminders whenever tasks or the notification-
  // relevant settings change (FR-63, §8.9). Debounced 500ms so a burst of
  // edits (e.g. adding subtasks) only reschedules once. `scheduleTaskReminders`
  // cancels the prior batch and rebuilds a rate-limited, quiet-hours-respecting
  // set from current state, degrading to a no-op without permission / on
  // unsupported platforms. Runs an initial pass on app open too.
  useEffect(() => {
    if (!ready) return;

    let timer: ReturnType<typeof setTimeout> | null = null;
    const reschedule = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        const tasks = selectAllTasks(useTaskStore.getState());
        const settings = useSettingsStore.getState().settings;
        // Fire-and-forget; the service never throws and never surfaces errors.
        void scheduleTaskReminders(tasks, settings);
      }, 500);
    };

    // Initial pass on open.
    reschedule();

    const unsubTasks = useTaskStore.subscribe((state, prev) => {
      if (state.tasks !== prev.tasks) reschedule();
    });
    const unsubSettings = useSettingsStore.subscribe((state, prev) => {
      const a = state.settings;
      const b = prev.settings;
      if (
        a.quietHours !== b.quietHours ||
        a.energyPeak !== b.energyPeak ||
        a.maxNotificationsPerHour !== b.maxNotificationsPerHour
      ) {
        reschedule();
      }
    });

    return () => {
      if (timer) clearTimeout(timer);
      unsubTasks();
      unsubSettings();
    };
  }, [ready]);

  // One-time Recovery check on app open (FR-60): after the initial recompute
  // settles, look for a lapse (2+ days of missed scheduled blocks). If found,
  // flip the recovery flag so the RecoveryBanner surfaces on Home / Calendar.
  // Non-persisted + session-scoped, so a dismissal here holds until the next
  // cold open, which re-derives it. Runs once per app open.
  useEffect(() => {
    if (!ready) return;
    const id = setTimeout(() => {
      const blocks = selectAllBlocks(useScheduleStore.getState());
      if (detectLapse(blocks, Date.now())) {
        useRecoveryStore.getState().markLapseDetected();
      }
    }, 600); // after the debounced recompute has a chance to land
    return () => clearTimeout(id);
  }, [ready]);

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
        <Stack.Screen name="projects/index" options={{ animation: "slide_from_right" }} />
        <Stack.Screen name="projects/[id]" options={{ animation: "slide_from_right" }} />
        <Stack.Screen name="insights" options={{ animation: "slide_from_right" }} />
        <Stack.Screen
          name="focus/session"
          options={{ presentation: "fullScreenModal", animation: "slide_from_bottom" }}
        />
        <Stack.Screen
          name="blindfold"
          options={{ presentation: "fullScreenModal", animation: "slide_from_bottom" }}
        />
        <Stack.Screen
          name="settings/busy-times"
          options={{ animation: "slide_from_right" }}
        />
        <Stack.Screen
          name="settings/all"
          options={{ animation: "slide_from_right" }}
        />
        <Stack.Screen
          name="paywall"
          options={{ presentation: "modal", animation: "slide_from_bottom" }}
        />
      </Stack>
      <StatusBar style={colorScheme === "dark" ? "light" : "dark"} />
    </>
  );
}
