/**
 * SessionTimer, the focus session's clock (PRD FR-62, FR-77b).
 *
 * ONE bounded countdown for the whole session, with an ambient ring tracing how
 * much of it has been served. There is no work/break phase here: a break is a
 * hold on this clock (`held`), never a second phase of it, because break time
 * must never count toward a stake's hold (doc `04` §6).
 *
 * Purely presentational: the clock itself lives in `hooks/useForegroundTimer`.
 * `ProgressRing` already hides its whole subtree (ring + children) from the
 * accessibility tree, decorative-only, so the digits are never independently
 * reachable — the outer `PressableScale` below is the one accessible node for
 * this whole control, carrying both the live "time remaining" readout and the
 * pause/resume action in a single label.
 *
 * Sized per the 2026-08-26 Figma re-measure (`blindfold-mode.pdf`): ring
 * 240/stroke 8, track `surface-ghost` (white @3.1%), digits INSIDE at the
 * `display` scale step (54/60, an exact match now the scale carries one — it
 * used to need a bespoke off-scale size), with a "remaining" caption directly
 * underneath, also inside the ring. That caption's slot is exactly where the
 * old Pause/Resume pill used to sit, so the control moved below the ring as a
 * control and the whole ring is the tap target instead — restyled into the
 * same language rather than dropped, per the layout contract.
 */

import React from "react";
import { Pressable, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Animated, { FadeIn } from "react-native-reanimated";

import { Text } from "@/components/ui/Text";
import { PressableScale } from "@/components/ui/PressableScale";
import { ProgressRing } from "@/components/focus/ProgressRing";
import { tabularNums, iconSizes } from "@/utils/design-tokens";
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
  const theme = useThemeColors();

  return (
    <View className="items-center">
      <PressableScale
        onPress={onToggle}
        haptic={false}
        accessibilityRole="button"
        accessibilityLabel={`${mmss(remainingSec)} remaining, ${ticking ? "running" : "paused"}`}
        accessibilityHint={running ? "Pauses the timer" : "Resumes the timer"}
        accessibilityState={{ selected: running }}
      >
        <ProgressRing
          progress={progress}
          size={240}
          strokeWidth={8}
          color={ticking ? theme.primary : theme.border}
          trackColor={theme.surfaceGhost}
        >
          <Text
            variant="display"
            className={ticking ? "text-neutral-900" : "text-neutral-500"}
            style={tabularNums}
          >
            {mmss(remainingSec)}
          </Text>
          <Text variant="caption" className="mt-1 text-neutral-600">
            remaining
          </Text>
        </ProgressRing>
      </PressableScale>

      {/*
        VISIBLE pause/resume control. The ring itself is also tappable as a
        shortcut, but docs/02 section 9 item 16 is binding: never make a control
        reachable only by a gesture with no visible affordance. Nothing about a
        countdown tells a sighted user it can be tapped, and pausing a session
        is not a discoverable-by-accident action. Quiet on purpose so it never
        competes with the screen's one primary action.
      */}
      <Pressable
        onPress={onToggle}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={running ? "Pause the timer" : "Resume the timer"}
        className="mt-4 min-h-11 flex-row items-center justify-center gap-1.5 px-4 active:opacity-70"
      >
        <Ionicons
          name={running ? "pause" : "play"}
          size={iconSizes.xs}
          color={theme.textSecondary}
        />
        <Text variant="captionMedium" className="text-neutral-600">
          {running ? "Pause" : "Resume"}
        </Text>
      </Pressable>

      {/* Paused-because-you-left note. The clock holds until you resume, so time
          away can never be served toward a hold (FR-77b). */}
      {interrupted && !running ? (
        <Animated.View
          entering={reduceMotion ? undefined : FadeIn.duration(DURATIONS.fast)}
          className="mt-4 flex-row items-center gap-2 rounded-full bg-warning-100 px-3.5 py-2"
          accessibilityRole="alert"
        >
          <Ionicons name="pause-circle-outline" size={iconSizes.xs} color={theme.warning} />
          <Text variant="captionMedium" className="text-warning-700">
            Paused while you were away.
          </Text>
        </Animated.View>
      ) : null}
    </View>
  );
}
