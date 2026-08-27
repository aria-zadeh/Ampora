/**
 * StepCard, the ONE current step, large (PRD FR-62, doc `03` Part 3.4).
 *
 * The session shows a single step at a time: the First move if it is still
 * open, otherwise the next unchecked subtask. The First move is the ON-RAMP,
 * never a gate. Completing it reveals the next step and logs "started", and
 * it unlocks nothing (doc `04` §5). This card carries no unlock affordance at
 * all, by design.
 *
 * `celebrate` plays the single celebratory beat of the screen (the completion
 * pulse), which reduce-motion turns into a no-op inside `PulseScale`.
 *
 * `bare` (doc `design/DECISION_SPEC` D4 item 4): the session hero screen
 * already supplies its own white card surface, so this drops its own chrome
 * there and renders as plain centered text instead of a second nested card
 * (D5's "no second elevated surface inside the hero card"). `stepNumber`/
 * `stepTotal` feed the "Step N of M" position line that replaces the old
 * top-of-screen progress bar on that screen. The First move keeps its own
 * "First move" label instead of a position count, since that framing (the
 * on-ramp, not a numbered step) is unchanged from before.
 */

import React from "react";
import { View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";

import { Text } from "@/components/ui/Text";
import { Heading } from "@/components/ui/Heading";
import { PulseScale } from "@/components/ui/PulseScale";
import { tabularNums } from "@/utils/design-tokens";
import { DURATIONS } from "@/utils/motion";
import { useReduceMotion } from "@/hooks/useReduceMotion";
import type { NextStep } from "@/core/task-logic";

/** The user-facing text for a step. */
export function stepText(step: NextStep): string {
  if (step.kind === "first_move") return step.action.text;
  if (step.kind === "subtask") return step.subtask.title;
  return "";
}

/** A stable label for a step's kind. */
export function stepKindLabel(step: NextStep): string {
  if (step.kind === "first_move") return "First move";
  if (step.kind === "subtask") return "Current step";
  return "";
}

/** A stable identity for a step, so callers can reset per-step UI state. */
export function stepId(step: NextStep): string {
  if (step.kind === "first_move") return step.action.id;
  if (step.kind === "subtask") return step.subtask.id;
  return "none";
}

export interface StepCardProps {
  step: NextStep;
  /** The AI "simpler version" of the current step, when the user tapped "I'm stuck". */
  simplerText?: string | null;
  /** Plays the one completion pulse when this flips to true. */
  celebrate?: boolean;
  style?: { marginTop?: number };
  /** 1-indexed position among the task's total steps, for the "Step N of M" line. Omitted (or non-positive) hides the line. */
  stepNumber?: number;
  stepTotal?: number;
  /** Drops the card chrome (white surface/border/padding) for a host screen that already provides one. @default false */
  bare?: boolean;
}

export function StepCard({
  step,
  simplerText,
  celebrate = false,
  style,
  stepNumber,
  stepTotal,
  bare = false,
}: StepCardProps) {
  const reduceMotion = useReduceMotion();
  /** Steps existed and are all finished. The only state that congratulates. */
  const allDone = step.kind === "none";
  /** The task never had a step. Nothing was achieved, so nothing is praised. */
  const noStepsYet = step.kind === "empty";
  /** Either way there is no step to render, so the step chrome is suppressed. */
  const noSteps = allDone || noStepsYet;
  const isFirstMove = step.kind === "first_move";
  const display = simplerText ?? stepText(step);
  const showPosition = !noSteps && !isFirstMove && stepNumber != null && stepTotal != null && stepTotal > 0;

  return (
    <PulseScale trigger={celebrate} style={style}>
      <Animated.View entering={reduceMotion ? undefined : FadeInDown.duration(DURATIONS.base)}>
        <View
          className={
            bare
              ? "w-full items-center"
              : "rounded-2xl bg-white border border-neutral-200 p-6 dark:bg-neutral-900 dark:border-neutral-800"
          }
        >
          {/* Every accent/neutral override below carries its OWN `dark:`
              class. `components/ui/Text` defaults to
              `text-neutral-900 dark:text-neutral-50`, and a caller's bare
              `text-*` is a single-class selector that beats the light default
              but loses to the `dark:` one — so an unpaired override silently
              reverts to near-white ink on dark. These are all TEXT on a
              neutral surface, not fills, so they step lighter per doc 02
              §1.8: primary-600 (3.38:1 on the dark card, under the 4.5:1 body
              bar) becomes primary-400 (6.88:1). */}
          {isFirstMove && !noSteps && (
            <Text
              variant="overline"
              className={`text-primary-600 dark:text-primary-400 ${bare ? "text-center" : ""}`}
            >
              First move
            </Text>
          )}
          {showPosition && (
            <Text
              variant="captionMedium"
              className={`text-neutral-600 dark:text-neutral-400 ${bare ? "text-center" : ""}`}
              style={tabularNums}
            >
              {`Step ${stepNumber} of ${stepTotal}`}
            </Text>
          )}
          {noSteps && (
            <Text
              variant="overline"
              className={`${allDone ? "text-primary-600 dark:text-primary-400" : "text-neutral-500 dark:text-[#78716C]"} ${bare ? "text-center" : ""}`}
            >
              {allDone ? "You're done" : "This session"}
            </Text>
          )}
          <Heading
            size={bare ? "h3" : "h1"}
            className={`mt-2 ${bare ? "text-center" : ""}`}
            numberOfLines={bare ? 3 : undefined}
          >
            {allDone
              ? "Every step is complete. Nicely done."
              : noStepsYet
                ? "No steps on this one. Just start."
                : display}
          </Heading>
          {simplerText && !noSteps && (
            <Text
              variant="caption"
              className={`text-primary-600 dark:text-primary-400 mt-3 ${bare ? "text-center" : ""}`}
            >
              Simplified, smaller and easier to just start.
            </Text>
          )}
        </View>
      </Animated.View>
    </PulseScale>
  );
}
