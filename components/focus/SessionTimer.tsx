/**
 * SessionTimer, the focus session's clock (PRD FR-62, FR-77b).
 *
 * ONE bounded countdown for the whole session, with an ambient ring tracing how
 * much of it has been served. There is no work/break phase here: a break is a
 * hold on this clock (`held`), never a second phase of it, because break time
 * must never count toward a stake's hold (doc `04` §6).
 *
 * Purely presentational: the clock itself lives in `hooks/useForegroundTimer`.
 * The digits are the accessible source of truth (`accessibilityRole="timer"`,
 * tabular numerals so the column never jitters). The ring is decorative and
 * hidden from the accessibility tree by `ProgressRing`.
 *
 * Sized per doc `design/DECISION_SPEC` D4 item 3: ring 212/stroke 7, digits
 * INSIDE at 40px/48 line height (down from 76px). The old "Focus · N min"
 * caption above the ring is dropped, the session screen now renders its own
 * "Session N of M" overline in that slot (D4 item 2), and a second caption
 * there would duplicate it.
 */

import React from "react";
import { View, Text as RNText } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Animated, { FadeIn } from "react-native-reanimated";

import { Text } from "@/components/ui/Text";
import { PressableScale } from "@/components/ui/PressableScale";
import { ProgressRing } from "@/components/focus/ProgressRing";
import { iconSizes, tabularNums } from "@/utils/design-tokens";
import { DURATIONS } from "@/utils/motion";
import { useReduceMotion } from "@/hooks/useReduceMotion";
import { useThemeColors } from "@/hooks/useThemeColors";

export interface SessionTimerProps {
  /** Seconds left to serve. */
  remainingSec: number;
  /** 0..1 share of the session served (drives the ring). */
  progress: number;
  /** Is the clock advancing right now? */
  ticking: boolean;
  /** The user's pause/resume intent (drives the button label). */
  running: boolean;
  /** True once the user has left the app during this run, surfaces the calm "paused while away" note. */
  interrupted: boolean;
  onToggle: () => void;
}

/** mm:ss for a second count. Never negative. */
export function mmss(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

export function SessionTimer({
  remainingSec,
  progress,
  ticking,
  running,
  interrupted,
  onToggle,
}: SessionTimerProps) {
  const reduceMotion = useReduceMotion();
  // The ring stroke and the Ionicons glyph both take literal colours, never a
  // `dark:` class, so they resolve the active scheme here. Every light value
  // below is byte-identical to what shipped before this pass.
  const theme = useThemeColors();

  return (
    <View className="items-center">
      {/* Ticking = primary (#2563EB in both token sets). Paused = the `border`
          hairline, which steps to #292524 on dark and is genuinely faint
          there (1.15:1 on the dark card, versus 1.25:1 for #E8E6E0 on white —
          near parity, so this is the token behaving as designed rather than a
          dark-mode regression). The ring never carries the paused state on
          its own: the digits below change tone AND the button under them
          reads "Resume", and the timer's accessibilityLabel says "paused"
          outright. */}
      <ProgressRing
        progress={progress}
        size={212}
        strokeWidth={7}
        color={ticking ? theme.primary : theme.border}
      >
        {/* Raw RN Text, not the design-system primitive: 40px/48 has no scale
            entry (an off-scale bespoke size, same reasoning + convention as
            `components/ui/TimerDisplay.tsx`), and layering the primitive's
            forced `variant` base classes under a custom size risks a
            className/style precedence conflict the primitive isn't meant to
            resolve. */}
        {/* 40px bold counts as large text, so it owes 3:1 rather than 4.5:1.
            Running: neutral-900/neutral-50, 17.49:1 light and 16.62:1 dark.
            Paused: the sanctioned textMuted pair, 5.48:1 light and 3.65:1
            dark, both clear of the large-text bar. */}
        <RNText
          className={`font-bold ${ticking ? "text-neutral-900 dark:text-neutral-50" : "text-neutral-500 dark:text-[#78716C]"}`}
          style={{ fontSize: 40, lineHeight: 48, ...tabularNums }}
          accessibilityRole="timer"
          accessibilityLabel={`${mmss(remainingSec)} remaining, ${ticking ? "running" : "paused"}`}
        >
          {mmss(remainingSec)}
        </RNText>
      </ProgressRing>

      <PressableScale
        onPress={onToggle}
        haptic={false}
        className="mt-3 min-h-11 flex-row items-center gap-1.5 px-4 rounded-full"
        accessibilityRole="button"
        accessibilityLabel={running ? "Pause timer" : "Resume timer"}
        accessibilityState={{ selected: running }}
      >
        <Ionicons
          name={running ? "pause" : "play"}
          size={iconSizes.sm}
          color={theme.textSecondary}
        />
        <Text variant="label" className="text-neutral-600 dark:text-neutral-400">{running ? "Pause" : "Resume"}</Text>
      </PressableScale>

      {/* Paused-because-you-left note. The clock holds until you resume, so time
          away can never be served toward a hold (FR-77b). */}
      {interrupted && !running ? (
        <Animated.View
          entering={reduceMotion ? undefined : FadeIn.duration(DURATIONS.fast)}
          className="mt-3 flex-row items-center gap-2 rounded-full bg-warning-100 px-3.5 py-2"
          accessibilityRole="alert"
        >
          {/* Left as one value in both themes on purpose: this glyph and its
              label sit on their own opaque warning-100 tint, a self-contained
              audited pair (doc 02 §14.6) whose contrast does not move with
              the canvas behind it. */}
          <Ionicons name="pause-circle-outline" size={iconSizes.xs} color={theme.warning} />
          <Text variant="captionMedium" className="text-warning-700">
            Paused while you were away. Resume when you&apos;re ready.
          </Text>
        </Animated.View>
      ) : null}
    </View>
  );
}
