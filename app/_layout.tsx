import "../global.css";
import "@/nativewind-reanimated";
import React, { useEffect, useState } from "react";
import { Platform, View } from "react-native";
import { Stack, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useColorScheme } from "nativewind";
import DotGridBackground from "@/components/ui/DotGridBackground";
import { GlobalLockBanner } from "@/components/focus/GlobalLockBanner";
import { useStakeTick } from "@/hooks/useStakeTick";
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
import { useStakesStore } from "@/store/stakesStore";
import { scheduleTaskReminders } from "@/services/notifications";
import { detectLapse } from "@/core/recovery";
import { isActive } from "@/core/subscription";
import { getCurrentUser, onAuthStateChange } from "@/services/supabase";
import type { User } from "@supabase/supabase-js";

export default function RootLayout() {
  const { colorScheme, setColorScheme } = useColorScheme();
  const themePreference = useSettingsStore((s) => s.settings.themePreference);
  const onboardingComplete = useSettingsStore((s) => s.settings.onboardingComplete);
  const subscription = useSettingsStore((s) => s.settings.subscription);

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

  // Drive `stakesStore.tick()` app-wide (~1/min while foregrounded, plus a
  // catch-up on every return to foreground). Nothing else calls it on a
  // schedule, and it is where the daily cap, the single-session cap, the
  // quiet-hours release and the served-session release actually fire — so
  // without this a lock armed and then walked away from has no clock running
  // against it at all (NFR-7, doc `04` §7).
  useStakeTick();

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

  // Routing gate (in order): no session → auth; session but not onboarded →
  // onboarding; onboarded but not entitled (no active plan / no live trial) →
  // paywall. Once a trial is started or a plan chosen (or dev-bypassed), the
  // subscription becomes entitled, this effect re-runs and stops redirecting,
  // and the paywall proceeds into the tabs. Soft gate — local data is untouched.
  // Guest mode is intentionally exempt (it manages its own routing and stays
  // usable without the paywall).
  useEffect(() => {
    if (authLoading || !ready) return;
    if (guestMode) return; // guest mode handles its own routing
    if (authUser === null) {
      router.replace("/auth");
    } else if (!onboardingComplete) {
      router.replace("/onboarding/welcome");
    } else if (!isActive(subscription)) {
      router.replace("/paywall");
    }
  }, [authLoading, ready, authUser, onboardingComplete, subscription, guestMode, router]);

  // Sync app color scheme with the user's theme preference.
  useEffect(() => {
    setColorScheme(themePreference === "system" ? "system" : themePreference);
  }, [themePreference, setColorScheme]);

  // Kick an initial schedule recompute once, on app open, after stores have
  // hydrated (FR-21 "recompute on app open"). Subsequent recomputes are driven
  // by the debounced task/settings subscriptions in scheduleStore. Also stamp
  // the free-trial window on first run so a brand-new user starts inside the
  // 14-day trial instead of landing on the paywall (idempotent — no-op once a
  // trial/plan exists).
  useEffect(() => {
    if (!ready) return;
    useSettingsStore.getState().ensureTrialStarted();
    useScheduleStore.getState().recompute();
  }, [ready]);

  // Reconcile any persisted Ignition session on launch (doc 06 §3.6). The soft
  // in-app lock state is not persisted, so a stale `activeSession` left over
  // from a prior run would otherwise never be released. `reconcileActiveSession`
  // releases it (never trapping the user) when it can no longer legitimately
  // hold — no live lock, too old, quiet hours, or cap exhausted — and re-applies
  // the shield only for a genuine still-active session within bounds. Runs once.
  useEffect(() => {
    if (!ready) return;
    useStakesStore.getState().reconcileActiveSession();
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
        a.maxNotificationsPerHour !== b.maxNotificationsPerHour ||
        a.reminderKinds !== b.reminderKinds
      ) {
        reschedule();
      }
    });

    // Web has no OS-level scheduling, so a scheduled reminder only fires if
    // something drives `checkAndFireWebReminders` on an interval while the app
    // is open (services/notifications.ts). On web, poll ~every 60s off current
    // tasks + settings (reschedule() delegates to checkAndFireWebReminders).
    // Native is unchanged — expo-notifications handles scheduling itself.
    let webPoll: ReturnType<typeof setInterval> | null = null;
    if (Platform.OS === "web") {
      webPoll = setInterval(() => {
        const tasks = selectAllTasks(useTaskStore.getState());
        const settings = useSettingsStore.getState().settings;
        void scheduleTaskReminders(tasks, settings);
      }, 60 * 1000);
    }

    return () => {
      if (timer) clearTimeout(timer);
      if (webPoll) clearInterval(webPoll);
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
      <View className="flex-1 bg-neutral-100">
        <DotGridBackground />
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
        {/* App-wide lock banner. A `hold: 'session'` lock deliberately survives
            leaving the focus screen (doc `04` §6), so it must be visible and
            escapable from ANYWHERE — what is on the line, the time left, a way
            back into the session, and the panic valve. Floated over the routed
            content near the top, clear of the tab bar; it hides itself on the
            focus session and Blindfold, which show the lock in context. */}
        <GlobalLockBanner />
      </View>
      <StatusBar style={colorScheme === "dark" ? "light" : "dark"} />
    </>
  );
}
