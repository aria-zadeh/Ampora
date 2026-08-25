/**
 * SessionControls, the session's action row (PRD FR-62).
 *
 * One primary action (Done) and four secondaries (I'm stuck / Take a break /
 * Park a thought / I'm overwhelmed), per the design system's "one primary
 * action per screen" rule. Lifted out of `app/focus/session.tsx` essentially
 * verbatim.
 *
 * "Done" advances the ONE current step. It never releases a lock: a session
 * hold is served by focus time, not by finishing the work early (doc `04` §5,
 * §6), the store enforces that, and this component deliberately has no path
 * to it either.
 *
 * Restyled per doc `design/DECISION_SPEC` D3/D4 item 6: Done is blue, not
 * green (D3, green is reserved for terminal/completed states, never a
 * control that starts or runs). The secondaries are quiet, text-only pills:
 * no icons, no warm tint on "I'm overwhelmed" (that warm tint read as a
 * warning on a control that isn't one).
 *
 * LAYOUT: two rows of two, not one row of three or four stacked rows.
 * DECISION_SPEC D4 item 6 originally called for one row of three equal pills,
 * which could not hold the copy: at 390pt a third-width pill is 99pt with an
 * 87pt content box, and "I'm overwhelmed" measures 113pt, so it wrapped and
 * broke mid-word ("Overwhelme / d"). Trimming padding bought single-digit
 * points and would still have failed at larger Dynamic Type.
 *
 * Giving the valve its own full-width row fixed that, and adding "Park a
 * thought" the same way produced four stacked full-width pills, which looked
 * repetitive and heavy on screen. Two rows of two is what actually reads well:
 * each pill is ~175pt, which fits the 113pt worst-case label with real slack
 * to spare, so it survives text scaling far better than three-across ever did.
 *
 * Note the earlier claim that the valve deserved its own row on hierarchy
 * grounds was reasoning backwards from a layout fix. The valve is reachable
 * and clearly labelled here, which is what FR-61 actually asks for.
 */

import React from "react";
import { View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { Text } from "@/components/ui/Text";
import { PressableScale } from "@/components/ui/PressableScale";
import { colors, iconSizes, shadows } from "@/utils/design-tokens";

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
  return (
    <View>
      {/* Primary: Done, blue, never green (D3: green is a terminal state only). */}
      <PressableScale
        onPress={onDone}
        haptic="success"
        className="min-h-[52px] flex-row items-center justify-center rounded-md bg-primary-600"
        style={shadows.xs}
        accessibilityRole="button"
        accessibilityLabel={noSteps ? "Finish session" : "Mark this step done and continue"}
      >
        <Ionicons name="checkmark-circle" size={22} color={colors.light.primaryForeground} />
        <Text variant="h4" className="ml-2 text-white">{noSteps ? "Finish" : "Done"}</Text>
      </PressableScale>

      {/* Two quiet pills, then the overwhelm valve on its own full-width row.
          This was one row of three equal pills (DECISION_SPEC D4 item 6). It
          could not hold the copy: at 390pt each pill is 99pt wide, and
          "I'm overwhelmed" measures 113pt, "Overwhelmed" 90pt against an
          87pt content box, so the label wrapped and broke mid-word
          ("Overwhelme / d"). Shaving padding bought single-digit points of
          slack and still died at any larger Dynamic Type setting.
          Giving it a row restores the exact FR-61 phrase, survives text
          scaling, and matches the valve's actual standing: it is the wellbeing
          exit, not a third tertiary. Still quiet and text-only, so the "one
          primary action per screen" rule is untouched. Logged in
          `docs/09_Decisions.md`. */}
      <View className="mt-4 flex-row gap-2">
        <QuietPill
          label="I'm stuck"
          busyLabel="Thinking…"
          busy={simplifying}
          onPress={onStuck}
          disabled={simplifying || noSteps}
        />
        <QuietPill label="Take a break" onPress={onBreak} />
      </View>
      <View className="mt-2 flex-row gap-2">
        <QuietPill
          label="Park a thought"
          accessibilityHint="Saves a quick note to your Inbox and keeps the timer running"
          onPress={onParkThought}
        />
        <QuietPill label="I'm overwhelmed" onPress={onOverwhelmed} />
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Quiet pill, one of the four equal secondary controls
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
      className={`flex-1 h-11 items-center justify-center rounded-lg bg-neutral-100 px-2 ${
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
