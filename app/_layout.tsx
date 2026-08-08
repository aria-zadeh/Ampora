import "../global.css";
import "@/nativewind-reanimated";
import React, { useEffect, useState } from "react";
import { AppState, Platform, View, type AppStateStatus } from "react-native";
import { Stack, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useColorScheme } from "nativewind";
import * as Notifications from "expo-notifications";
import DotGridBackground from "@/components/ui/DotGridBackground";
import { GlobalLockBanner } from "@/components/focus/GlobalLockBanner";
import { useStakeTick } from "@/hooks/useStakeTick";
import { useStakeScheduler } from "@/hooks/useStakeScheduler";
import { useNightlyPass } from "@/hooks/useNightlyPass";
// Lexend, not Inter (docs/02 §2.1 binding convention: weight lives in the
// family name, mirrored exactly from how Inter was wired here). Inter stays
// installed in package.json — only the load site moved — since removing the
// now-unused package is separate cleanup, not part of this pass.
import {
  useFonts,
  Lexend_400Regular,
  Lexend_500Medium,
  Lexend_600SemiBold,
  Lexend_700Bold,
} from "@expo-google-fonts/lexend";
import { useSettingsStore } from "@/store/settingsStore";
import { useScheduleStore, selectAllBlocks } from "@/store/scheduleStore";
import { useTaskStore, selectAllTasks } from "@/store/taskStore";
import { useRecoveryStore } from "@/store/recoveryStore";
import { useStakesStore } from "@/store/stakesStore";
import { useSyncStore } from "@/store/syncStore";
import { useDevAuthBypassed } from "@/store/devAuthStore";
import { scheduleTaskReminders } from "@/services/notifications";
import { detectLapse } from "@/core/recovery";
import { isActive } from "@/core/subscription";
import { wipeAllData } from "@/core/dataExport";
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
  const devAuthBypassed = useDevAuthBypassed();

  const [fontsLoaded] = useFonts({
    Lexend_400Regular,
    Lexend_500Medium,
    Lexend_600SemiBold,
    Lexend_700Bold,
  });

  // Drive `stakesStore.tick()` app-wide (~1/min while foregrounded, plus a
  // catch-up on every return to foreground). Nothing else calls it on a
  // schedule, and it is where the daily cap, the single-session cap, the
  // quiet-hours release and the served-session release actually fire — so
  // without this a lock armed and then walked away from has no clock running
  // against it at all (NFR-7, doc `04` §7).
  useStakeTick();

  // Drive `stakesStore.autoArmDueStakes()` app-wide (FR-41a, ARCH_PLAN A4):
  // on mount (cold-launch catch-up), every 30s while foregrounded, and on
  // every return to foreground. This is what actually arms a scheduled stake
  // (or times it out) — see `hooks/useStakeScheduler.ts` for the exact
  // foreground/background/killed behaviour this does and does not cover.
  useStakeScheduler();

  // Drive the nightly pre-built-tomorrow pass app-wide (FR-90): on mount, on
  // every return to foreground, and on a coarse poll while foregrounded. See
  // `hooks/useNightlyPass.ts` / `services/nightlyPass.ts` for exactly what
  // fires when and why there is deliberately no background timer here.
  useNightlyPass();

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

    const unsubscribe = onAuthStateChange((event, session) => {
      if (!cancelled) {
        setAuthUser(session?.user ?? null);
        setAuthLoading(false);
      }
      // Shared-device data leak (FR-87, task report): without this, signing
      // out leaves every local store exactly as it was. If a SECOND account
      // signs in on this same device next, its first `syncNow()`
      // (`store/syncStore.ts`) would find the FIRST user's local tasks,
      // lists, proofs, etc. absent from the new account's cloud copy and
      // adopt-then-push them via `upsertTask`/`upsertLists`/etc., stamping
      // them with the new account's `user_id` — permanently copying one
      // person's tasks and Proof Log into someone else's account.
      // `services/supabase.ts#deleteAccount`'s own doc comment already
      // described this exact hazard; it just was not guarded against for an
      // ORDINARY sign-out until now. Reacting to the `SIGNED_OUT` event
      // (rather than only the explicit "Sign out" button) covers every path
      // that ends a session, including `deleteAccount`'s own internal
      // `supabase.auth.signOut()`.
      //
      // This intentionally does not try to save the outgoing user's
      // not-yet-pushed edits itself — discarding them here is the accepted
      // tradeoff (see `store/syncStore.ts#flushBeforeSignOut`'s doc comment
      // and `components/settings/DataSettings.tsx`'s sign-out handler,
      // which already flushed BEFORE calling `signOut()`, well before this
      // event fires). By the time `SIGNED_OUT` reaches us the session is
      // already gone, so `wipeAllData()`'s own push-suppression
      // (`resetPushBaselines()` + `useSyncStore#reset`) is redundant here —
      // every cloud call in `services/supabase.ts` already independently
      // no-ops with no signed-in user — but harmless, and keeps this one
      // function doing the exact same safe thing everywhere it's called.
      if (event === "SIGNED_OUT") {
        wipeAllData();
        useSyncStore.getState().reset();
        useRecoveryStore.getState().reset();
      }
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  // Routing gate (in order): no session → auth; session but not onboarded →
  // onboarding; onboarded but not entitled (no active plan / no live trial) →
  // paywall. Once a trial is started or a plan chosen (or dev-bypassed), the
  // subscription becomes entitled, this effect re-runs and stops redirecting,
  // and the paywall proceeds into the tabs. Soft gate — local data is
  // untouched. FR-87: an account is required, no anonymous local-only mode —
  // in any shipped build `authUser === null` always routes to `/auth`.
  //
  // `devAuthBypassed` is the single exception. It is on for every local dev run
  // and, since 2026-08-07, also wherever `EXPO_PUBLIC_DEV_AUTH_BYPASS=1` is set
  // at build time, which `vercel.json` does for the deployed web preview. So it
  // is NOT automatically off in a production build any more, see
  // `constants/featureFlags.ts` for what to remove before shipping.
  //
  // It fabricates no session either way, so the sync effect below (gated on a
  // real `authUser`) still never runs while bypassed, and every cloud call
  // independently no-ops without a signed-in user.
  useEffect(() => {
    if (authLoading || !ready) return;
    if (authUser === null && !devAuthBypassed) {
      router.replace("/auth");
    } else if (!onboardingComplete) {
      router.replace("/onboarding/welcome");
    } else if (!isActive(subscription)) {
      router.replace("/paywall");
    }
  }, [
    authLoading,
    ready,
    authUser,
    devAuthBypassed,
    onboardingComplete,
    subscription,
    router,
  ]);

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

  // Cloud sync (FR-87 "cloud is the source of truth"). `useSyncStore.syncNow()`
  // is a full two-way reconcile (pull + push) across every synced entity —
  // see `store/syncStore.ts`. It already no-ops cleanly with nothing signed
  // in, so it is safe to call speculatively; this effect just decides WHEN:
  // once right after a real session appears (covers both "just signed in" and
  // "cold launch with an existing session"), and again on every return to the
  // foreground, so a device that was closed for a while catches up on
  // whatever changed elsewhere. Per-mutation pushes (list/tag/project/stake/
  // proof/event edits) are wired separately, as module-level store
  // subscriptions inside `store/syncStore.ts` itself.
  useEffect(() => {
    if (authLoading || !ready || authUser === null) return;

    useSyncStore.getState().syncNow();

    const onAppStateChange = (next: AppStateStatus) => {
      if (next === "active") useSyncStore.getState().syncNow();
    };
    const sub = AppState.addEventListener("change", onAppStateChange);
    return () => sub.remove();
  }, [authLoading, ready, authUser]);

  // Reschedule notification reminders whenever tasks, the notification-
  // relevant settings, or the SCHEDULED BLOCKS change (FR-63, §8.9). Blocks
  // matter because Start Reminder / Motivation Nudge now anchor on a task's
  // next scheduled block, not an energy peak (`services/notifications.ts`) —
  // so a recompute that moves/creates/removes blocks (e.g. a drag-reschedule,
  // or the nightly pass placing a new project session) must reschedule
  // reminders too, or their fire times would go stale silently. Debounced
  // 500ms so a burst of changes (e.g. a recompute plus several task edits)
  // only reschedules once. `scheduleTaskReminders` cancels the prior batch and
  // rebuilds a rate-limited, quiet-hours-respecting set from current state,
  // degrading to a no-op without permission / on unsupported platforms. Runs
  // an initial pass on app open too.
  useEffect(() => {
    if (!ready) return;

    let timer: ReturnType<typeof setTimeout> | null = null;
    const reschedule = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        const tasks = selectAllTasks(useTaskStore.getState());
        const settings = useSettingsStore.getState().settings;
        const blocks = selectAllBlocks(useScheduleStore.getState());
        // Fire-and-forget; the service never throws and never surfaces errors.
        void scheduleTaskReminders(tasks, settings, blocks);
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
        a.maxNotificationsPerHour !== b.maxNotificationsPerHour ||
        a.reminderKinds !== b.reminderKinds
      ) {
        reschedule();
      }
    });
    const unsubBlocks = useScheduleStore.subscribe((state, prev) => {
      if (state.blocks !== prev.blocks) reschedule();
    });

    // Web has no OS-level scheduling, so a scheduled reminder only fires if
    // something drives `checkAndFireWebReminders` on an interval while the app
    // is open (services/notifications.ts). On web, poll ~every 60s off current
    // tasks + settings + blocks (reschedule() delegates to
    // checkAndFireWebReminders). Native is unchanged — expo-notifications
    // handles scheduling itself.
    let webPoll: ReturnType<typeof setInterval> | null = null;
    if (Platform.OS === "web") {
      webPoll = setInterval(() => {
        const tasks = selectAllTasks(useTaskStore.getState());
        const settings = useSettingsStore.getState().settings;
        const blocks = selectAllBlocks(useScheduleStore.getState());
        void scheduleTaskReminders(tasks, settings, blocks);
      }, 60 * 1000);
    }

    return () => {
      if (timer) clearTimeout(timer);
      if (webPoll) clearInterval(webPoll);
      unsubTasks();
      unsubSettings();
      unsubBlocks();
    };
  }, [ready]);

  // Route a tapped notification to the right screen. Before this, NOTHING
  // handled a notification response anywhere in the app (landmine #2), so
  // tapping any notification — a stake cue, a task reminder, the recurring-
  // stake weekly summary — did nothing at all. A stake cue/arm notice routes
  // into the focus session for its task; everything else routes to the task.
  // Two entry points, both required: the live listener covers a tap while the
  // app is already running or backgrounded, and the one-time
  // `getLastNotificationResponseAsync()` check covers the cold-launch case,
  // which a listener registered only after launch would otherwise miss
  // entirely (the tap that started the app happened before the listener
  // existed).
  useEffect(() => {
    if (!ready) return;

    const routeFromResponse = (response: Notifications.NotificationResponse | null) => {
      if (!response) return;
      const data = response.notification.request.content.data as
        | { type?: unknown; taskId?: unknown }
        | undefined;
      const taskId = typeof data?.taskId === "string" ? data.taskId : "";
      if (!taskId) return;
      const type = typeof data?.type === "string" ? data.type : "";
      if (type === "stake_cue" || type === "stake_arm") {
        router.push(`/focus/session?taskId=${taskId}`);
      } else {
        // Task reminders AND the recurring-stake weekly summary ("tap to
        // edit") both land on the task screen — that's where stake setup
        // lives, so "edit" and "reminder" resolve to the same place.
        router.push(`/task/${taskId}`);
      }
    };

    // Fire-and-forget, never throws: a cold launch not caused by a
    // notification simply resolves null here.
    Notifications.getLastNotificationResponseAsync()
      .then(routeFromResponse)
      .catch(() => {});

    const sub = Notifications.addNotificationResponseReceivedListener(routeFromResponse);
    return () => sub.remove();
  }, [ready, router]);

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
