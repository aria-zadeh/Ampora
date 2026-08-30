/**
 * LockBanner — Ampora Ignition (PRD §8.8), rebuilt onto the hold + trigger
 * model.
 *
 * The in-session banner shown while a stake is active: `"{Instagram and 2
 * more} are locked. {N} min left."` on a NEUTRAL surface with no alarm
 * colouring, because the lock is consensual (doc `04` §7, `05` §7).
 *
 * NAMES ARE THE EXCEPTION, NOT THE RULE. iOS hands back opaque
 * ApplicationToken/ActivityCategoryToken/WebDomainToken strings and never an
 * app identity (doc `05` §7) — that is the normal case this app will run in,
 * not an edge case to shrug off. So the subject line is built from whatever
 * data actually exists: named apps (`StakeApp.label`, the soft/dev-catalog
 * path) when present, and the stored `StakeSelection.count` otherwise. There
 * is deliberately no branch on which BlockingStrategy is active — the
 * fallback is driven by what the data can support, not by a strategy guess.
 *
 * "N min left" is LIVE:
 *   - `hold: 'session'` unlocks on focus time served, so remaining time only
 *     moves when `session.focusSec` moves (i.e. while a focus session is
 *     actually accruing it) — reading it straight off the session prop is
 *     already live, no local clock needed.
 *   - `hold: 'until_done'` converts to a release on a WALL-CLOCK ceiling
 *     (`settings.singleSessionCapMin` from `startedAt`, doc `04` §7), which
 *     keeps moving even when nothing else re-renders this banner. Since this
 *     component is mounted APP-WIDE by another surface (not only inside the
 *     focus screen) and must render correctly with no focus session on
 *     screen, it keeps its own once-a-minute clock rather than assuming a
 *     parent will re-render it.
 *
 * Purely presentational: reads the active session + eligible apps + the
 * user's single-session cap, and calls back to open the PanicValveSheet. All
 * state changes (release, caps, de-escalation) stay in stakesStore.
 * Reduce-motion aware. RN + NativeWind, web-export safe.
 */

import React, { useEffect, useMemo, useState } from "react";
import { View, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useShallow } from "zustand/react/shallow";

import { PressableScale } from "@/components/ui/PressableScale";
import { DURATIONS } from "@/utils/motion";
import { useReduceMotion } from "@/hooks/useReduceMotion";
import { useThemeColors } from "@/hooks/useThemeColors";
import { useStakesStore, selectEligibleApps, selectStakeSelection } from "@/store/stakesStore";
import { useSettingsStore } from "@/store/settingsStore";
import type { StakeSession } from "@/types";

export interface LockBannerProps {
  /** The active stake session driving the lock. */
  session: StakeSession;
  /** Open the panic valve (30s unlock-early flow). */
  onPanic: () => void;
  /**
   * `default` (unchanged): the app-wide card, its own "On the line" overline
   * plus a built-in "Unlock early" pill. This is what `GlobalLockBanner` renders
   * and it stays pixel-identical regardless of this prop's existence.
   * `slim`: a single sunken-canvas row, glyph plus one sentence, no overline,
   * no internal unlock pill. For a host screen (the focus session hero, doc
   * `design/DECISION_SPEC` D4 item 5) that supplies its own pinned panic-valve
   * entry instead of this banner's built-in one.
   * @default "default"
   */
  variant?: "default" | "slim";
}

/** How often the banner re-derives "N min left" on its own (doc `04` §7 wall-clock cap). */
const TICK_MS = 60_000;

export function LockBanner({ session, onPanic, variant = "default" }: LockBannerProps) {
  const reduceMotion = useReduceMotion();
  const theme = useThemeColors();
  const eligibleApps = useStakesStore(useShallow(selectEligibleApps));
  const selection = useStakesStore(selectStakeSelection);
  const singleSessionCapMin = useSettingsStore((s) => s.settings.singleSessionCapMin);

  // Self-ticking clock. This banner is mounted app-wide and must stay correct
  // with no focus session mounted anywhere, so it cannot rely on a parent
  // re-rendering it every minute — it owns its own "now".
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(id);
  }, []);

  const minutesLeft = useMemo(() => {
    if (session.hold === "until_done") {
      // Wall-clock ceiling: the single-session cap converts ANY until_done
      // hold to a release, so this is what "N min left" means for it.
      const elapsedSec = session.startedAt != null ? Math.max(0, (now - session.startedAt) / 1000) : 0;
      const remainingSec = Math.max(0, singleSessionCapMin * 60 - elapsedSec);
      return Math.max(0, Math.ceil(remainingSec / 60));
    }
    // Session hold: served-time ceiling. Live whenever focusSec moves.
    const requiredSec = (session.sessionMin ?? 0) * 60;
    const servedSec = session.focusSec ?? 0;
    return Math.max(0, Math.ceil(Math.max(0, requiredSec - servedSec) / 60));
  }, [session.hold, session.startedAt, session.sessionMin, session.focusSec, singleSessionCapMin, now]);

  // Named apps exist only on the soft/dev-catalog path. Empty here is the
  // EXPECTED steady state on iOS, not a loading state or an error.
  const namedApps = useMemo(() => eligibleApps.filter((a) => !!a.label), [eligibleApps]);
  const fallbackCount = selection?.count ?? 0;

  const { headline, a11y } = useMemo(() => {
    const minLabel = minutesLeft === 1 ? "1 min left" : `${minutesLeft} min left`;

    let subject: string;
    let plural: boolean;
    if (namedApps.length === 1) {
      subject = namedApps[0].label as string;
      plural = false;
    } else if (namedApps.length > 1) {
      // PRD §8.8 exact phrasing: "Instagram and 2 more".
      subject = `${namedApps[0].label} and ${namedApps.length - 1} more`;
      plural = true;
    } else if (fallbackCount === 1) {
      subject = "1 app";
      plural = false;
    } else if (fallbackCount > 1) {
      subject = `${fallbackCount} apps`;
      plural = true;
    } else {
      // No names AND no usable count (shouldn't happen while genuinely
      // locked, but this banner must never assume — fail into calm copy).
      subject = "Your apps";
      plural = true;
    }

    const text = `${subject} ${plural ? "are" : "is"} locked. ${minLabel}.`;
    return { headline: text, a11y: `App lock active. ${text}` };
  }, [namedApps, fallbackCount, minutesLeft]);

  // Slim: one sunken-canvas row, glyph + sentence, no overline, no built-in
  // panic pill. The host screen supplies its own (doc `design/DECISION_SPEC`
  // D4 item 5). The `default` branch below is untouched by this addition.
  if (variant === "slim") {
    return (
      <Animated.View
        entering={reduceMotion ? undefined : FadeInDown.duration(DURATIONS.base)}
        // The host screen supplies its own card surface (bg-white/bg-surface),
        // so this inset row steps UP to bg-raised rather than bg-neutral-100
        // (which is the canvas colour and would read as a hole in that card).
        className="flex-row items-center gap-3 rounded-xl bg-raised px-3.5 py-3"
        accessibilityRole="summary"
        accessibilityLabel={a11y}
      >
        <Ionicons name="lock-closed" size={20} color={theme.textSecondary} />
        <Text className="flex-1 text-body font-sans text-neutral-800">{headline}</Text>
      </Animated.View>
    );
  }

  return (
    <Animated.View
      entering={reduceMotion ? undefined : FadeInDown.duration(DURATIONS.base)}
      // Neutral surface, deliberately NOT primary/accent/warning-tinted: the
      // lock is consensual, so nothing here should read as an alert (doc `04`
      // §7, PRD §8.8). bg-raised (not bg-neutral-100/canvas): this banner is
      // itself nested inside GlobalLockBanner's own canvas-toned wrapper, so
      // it needs to step UP to read as a card rather than disappear into it.
      className="rounded-2xl border border-neutral-200 bg-raised p-4"
      accessibilityRole="summary"
      accessibilityLabel={a11y}
    >
      <View className="flex-row items-start gap-3">
        <View className="h-9 w-9 items-center justify-center rounded-full bg-white">
          <Ionicons name="lock-closed" size={18} color={theme.textSecondary} />
        </View>
        <View className="flex-1">
          <Text className="text-overline font-semibold uppercase text-neutral-500">
            On the line
          </Text>
          {/* No `leading-5` here: that pinned a 15px line to a 20px box, */}
          {/* tighter than the scale's 21px. Outfit sits taller in its line */}
          {/* box than Inter did, so the override risked clipping descenders */}
          {/* on the wrap this headline takes at longer app names. It also */}
          {/* has no numberOfLines on purpose: the banner grows rather than */}
          {/* truncating, so "Instagram and 2 more are locked" always reads. */}
          <Text className="mt-0.5 text-body font-medium text-neutral-900">{headline}</Text>
        </View>
      </View>

      {/* Panic valve entry — always available, understated so it never invites
          use, but never hidden (FR-42, §9.10). */}
      <PressableScale
        onPress={onPanic}
        haptic="light"
        className="mt-3 flex-row items-center justify-center gap-1.5 self-start rounded-full bg-white px-3.5 py-2"
        accessibilityRole="button"
        accessibilityLabel="Unlock early"
        accessibilityHint="Opens a 30 second breather before your apps come back"
      >
        <Ionicons name="leaf-outline" size={15} color={theme.textSecondary} />
        <Text className="text-caption font-medium text-neutral-700">Unlock early</Text>
      </PressableScale>
    </Animated.View>
  );
}
