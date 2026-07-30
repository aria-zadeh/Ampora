/**
 * GlobalLockBanner — the app-wide "your apps are on the line" banner
 * (PRD FR-42, FR-45, NFR-7; doc `04` §6, §7).
 *
 * WHY THIS EXISTS. A `hold: 'session'` lock is served by focus time, so leaving
 * the focus screen must NOT hand the apps back — that is the leak the session
 * model closes. But until this banner existed, leaving also made the lock
 * INVISIBLE: no timer, no way back in, no panic valve, and `startStake` refused
 * every new session with `already_active` until the app was force-quit. Locked
 * with no exit and no explanation is precisely the trap doc `04` §7 forbids.
 *
 * So the lock keeps running (honest) and this makes it legible and escapable:
 * what is on the line, how much is left, one tap back into the session, and the
 * always-available panic valve. Mounted ONCE in `app/_layout.tsx`, above the
 * routed content and clear of the tab bar.
 *
 * It hides itself on the focus session and Blindfold, which render their own
 * in-context lock UI — two banners saying the same thing would be noise.
 *
 * `LockBanner` (owned by the stakes package) supplies the "what is locked"
 * copy and the panic-valve entry; this composes the time remaining and the
 * route back around it.
 */

import React, { useEffect, useMemo, useState } from "react";
import { View, Text } from "react-native";
import { router, usePathname } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

import { LockBanner } from "@/components/stakes/LockBanner";
import { PanicValveSheet } from "@/components/stakes/PanicValveSheet";
import { PressableScale } from "@/components/ui/PressableScale";
import { useStakesStore } from "@/store/stakesStore";
import { useSettingsStore } from "@/store/settingsStore";
import { colors, iconSizes, shadows, tabularNums } from "@/utils/design-tokens";
import type { StakeSession } from "@/types";

/** Routes that already show the lock in context. */
const SUPPRESSED_PREFIXES = ["/focus/session", "/blindfold"];

/** How often the "minutes left" line re-derives. Minute-granularity copy — 20s is plenty. */
const REFRESH_MS = 20_000;

export function GlobalLockBanner() {
  const pathname = usePathname();
  const insets = useSafeAreaInsets();

  // Raw field select (Zustand v5 discipline) — no mapping inside the selector.
  const session = useStakesStore((s) => s.activeSession);
  const singleSessionCapMin = useSettingsStore((s) => s.settings.singleSessionCapMin);

  // The panic sheet holds its own copy of the session: releasing the lock nulls
  // `activeSession`, and if the sheet unmounted with it the user would watch
  // their escape hatch vanish mid-countdown instead of reading "your apps are
  // back". Off this screen this is the ONLY panic entry, so it has to survive.
  const [panicSession, setPanicSession] = useState<StakeSession | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const suppressed = SUPPRESSED_PREFIXES.some((p) => pathname.startsWith(p));
  const visible = session != null && !suppressed;

  useEffect(() => {
    if (!visible) return;
    const id = setInterval(() => setNow(Date.now()), REFRESH_MS);
    return () => clearInterval(id);
  }, [visible]);

  const remaining = useMemo(() => {
    if (!session) return null;
    if (session.hold === "until_done") {
      // An `until_done` hold is bounded by the single-session cap, which
      // converts it into a normal release. That wall clock IS the time left.
      const elapsedMin = session.startedAt != null ? (now - session.startedAt) / 60_000 : 0;
      const left = Math.max(0, Math.ceil(singleSessionCapMin - elapsedMin));
      return { min: left, wallClock: true };
    }
    // A session hold is served by FOREGROUND focus time, so the honest number
    // is focus minutes still to serve — and it does not tick down out here.
    const requiredSec = (session.sessionMin ?? 0) * 60;
    const left = Math.max(0, Math.ceil((requiredSec - (session.focusSec ?? 0)) / 60));
    return { min: left, wallClock: false };
  }, [session, now, singleSessionCapMin]);

  const panicSheet = panicSession ? (
    <PanicValveSheet
      visible
      session={panicSession}
      onClose={() => setPanicSession(null)}
      onReleased={() => {
        // Leave the sheet mounted so it can show its "your apps are back"
        // state; `onClose` from its Done button tears it down.
      }}
    />
  ) : null;

  if (!visible || !session || !remaining) return panicSheet;

  const openSession = () => {
    router.push({ pathname: "/focus/session", params: { taskId: session.taskId } });
  };

  const minutesLabel = `${remaining.min} min`;
  const line = remaining.wallClock
    ? `${minutesLabel} left before this lock releases on its own.`
    : `${minutesLabel} of focus still to serve.`;

  return (
    <>
      <View
        pointerEvents="box-none"
        style={{
          position: "absolute",
          top: insets.top + 8,
          left: 12,
          right: 12,
        }}
      >
        <View className="rounded-2xl bg-neutral-100" style={shadows.lg}>
          <LockBanner session={session} onPanic={() => setPanicSession(session)} />

          <View className="flex-row items-center gap-3 px-4 pb-3 pt-2">
            <View className="flex-1 flex-row items-center gap-1.5">
              <Ionicons name="time-outline" size={iconSizes.xs} color={colors.light.textSecondary} />
              <Text className="flex-1 text-caption text-neutral-600" style={tabularNums}>
                {line}
              </Text>
            </View>
            <PressableScale
              onPress={openSession}
              haptic="light"
              className="min-h-11 flex-row items-center gap-1.5 rounded-full bg-primary-600 px-4"
              accessibilityRole="button"
              accessibilityLabel="Back to your focus session"
              accessibilityHint={
                remaining.wallClock
                  ? "Reopens the session you locked your apps for"
                  : "Focus time only counts inside the session, so reopen it to serve the rest"
              }
            >
              <Ionicons
                name="arrow-forward"
                size={iconSizes.xs}
                color={colors.light.primaryForeground}
              />
              <Text className="text-caption font-semibold text-white">Back to session</Text>
            </PressableScale>
          </View>
        </View>
      </View>

      {/* Panic valve — always reachable, from anywhere in the app (FR-42). */}
      {panicSheet}
    </>
  );
}
