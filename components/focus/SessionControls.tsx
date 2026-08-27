/**
 * SessionControls, the session's action row (PRD FR-62).
 *
 * "Done" advances the ONE current step. It never releases a lock: a session
 * hold is served by focus time, not by finishing the work early (doc `04` §5,
 * §6), the store enforces that, and this component deliberately has no path
 * to it either.
 *
 * LAYOUT (2026-08-26 Figma re-measure, `blindfold-mode.pdf`): the source
 * puts exactly two buttons front and centre, side by side — a quiet "I'm
 * Stuck" outline pill and the primary Done/Finish fill, both blue-family per
 * D3 (green stays terminal-only, never a control that starts or runs, even
 * one that reads "Finish"). Done is blue for the same reason.
 *
 * The other three secondaries this screen has always had (Take a break /
 * Park a thought / I'm overwhelmed) have no counterpart in that pairing, so
 * they stay, restyled quieter, underneath. They keep the two-rows shape the
 * previous round settled on for the same reason it did originally: a flat
 * three-across split at this width re-breaks "I'm overwhelmed" mid-word (it
 * measures ~113pt; three-across leaves each pill an ~97pt content box once
 * padding and gaps are subtracted), so it gets its own full-width row while
 * the shorter two share one.
 */

import React from "react";
import { View } from "react-native";

import { Text } from "@/components/ui/Text";
import { PressableScale } from "@/components/ui/PressableScale";

export interface SessionControlsProps {
  /** Primary: mark the current step done (or finish, when nothing is left). */
  onDone: () => void;
  /** Nothing left to check off, the primary reads "Finish". */
  noSteps: boolean;
  onBreak: () => void;
  onStuck: () => void;
  /** True while the AI simplify call is in flight. */
  simplifying: boolean;
  onOverwhelmed: () => void;
  /** Opens the "Park a thought" capture sheet. Never touches the timer or the lock. */
  onParkThought: () => void;
}

export function SessionControls({
  onDone,
  noSteps,
  onBreak,
  onStuck,
  simplifying,
  onOverwhelmed,
  onParkThought,
}: SessionControlsProps) {
  const stuckDisabled = simplifying || noSteps;

  return (
    <View>
      {/* The two front-and-centre actions: quiet outline + primary fill,
          48 tall, matching the measured pair exactly. */}
      <View className="flex-row gap-3">
        <PressableScale
          onPress={onStuck}
          haptic="light"
          disabled={stuckDisabled}
          className={`h-12 flex-1 items-center justify-center rounded-lg border border-line bg-surface ${
            stuckDisabled ? "opacity-50" : ""
          }`}
          accessibilityRole="button"
          accessibilityLabel={simplifying ? "Thinking…" : "I'm stuck"}
          accessibilityState={{ disabled: stuckDisabled, busy: simplifying }}
        >
          <Text variant="bodyMedium" className="text-neutral-600">
            {simplifying ? "Thinking…" : "I'm stuck"}
          </Text>
        </PressableScale>

        <PressableScale
          onPress={onDone}
          haptic="success"
          className="h-12 flex-1 items-center justify-center rounded-lg bg-primary-600"
          accessibilityRole="button"
          accessibilityLabel={noSteps ? "Finish session" : "Mark this step done and continue"}
        >
          <Text variant="bodyMedium" className="text-primary-foreground">
            {noSteps ? "Finish" : "Done"}
          </Text>
        </PressableScale>
      </View>

      {/* Everything else, quieter, underneath. */}
      <View className="mt-3 flex-row gap-2">
        <QuietPill label="Take a break" onPress={onBreak} />
        <QuietPill
          label="Park a thought"
          accessibilityHint="Saves a quick note to your Inbox and keeps the timer running"
          onPress={onParkThought}
        />
      </View>
      <View className="mt-2 flex-row">
        <QuietPill label="I'm overwhelmed" onPress={onOverwhelmed} />
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Quiet pill, one of the three equal secondary controls
// ---------------------------------------------------------------------------

function QuietPill({
  label,
  a11yLabel,
  accessibilityHint,
  busyLabel,
  busy = false,
  onPress,
  disabled = false,
}: {
  label: string;
  /** Announced instead of `label` when the visible text is an abbreviation. */
  a11yLabel?: string;
  /** Extra VoiceOver/TalkBack context for a non-obvious action. */
  accessibilityHint?: string;
  busyLabel?: string;
  busy?: boolean;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <PressableScale
      onPress={onPress}
      haptic="light"
      disabled={disabled}
      className={`flex-1 h-11 items-center justify-center rounded-lg bg-raised px-2 ${
        disabled ? "opacity-50" : ""
      }`}
      accessibilityRole="button"
      accessibilityLabel={busy && busyLabel ? busyLabel : (a11yLabel ?? label)}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled, busy }}
    >
      <Text
        variant="captionMedium"
        className="text-neutral-600 text-center"
        numberOfLines={2}
      >
        {busy && busyLabel ? busyLabel : label}
      </Text>
    </PressableScale>
  );
}
