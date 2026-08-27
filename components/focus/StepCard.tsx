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
 * `bare` (doc `design/DECISION_SPEC` D4 item 4): drops its own chrome and
 * renders as plain centered text for a host that already supplies a card
 * surface (D5's "no second elevated surface inside the hero card").
 *
 * `tile` (2026-08-26 Figma re-measure, `blindfold-mode.pdf`): the session
 * screen's "current intent" card nests this in its own sunken `bg-raised`
 * panel rather than bare centered text — small left-aligned eyebrow +
 * secondary-toned step line instead of a big centered heading. Both modes
 * share the exact same state derivation (`allDone`/`noStepsYet`/`isFirstMove`/
 * `display`/`showPosition`) below; only the JSX differs.
 *
 * `stepNumber`/`stepTotal` feed the "Step N of M" position line. The First
 * move keeps its own "First move" label instead of a position count, since
 * that framing (the on-ramp, not a numbered step) is unchanged from before.
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
  /** Renders as a sunken `bg-raised` tile (the session screen's nested step panel) instead of `bare`/default chrome. Takes precedence over `bare`. @default false */
  tile?: boolean;
}

export function StepCard({
  step,
  simplerText,
  celebrate = false,
  style,
  stepNumber,
  stepTotal,
  bare = false,
  tile = false,
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

  if (tile) {
    return (
      <PulseScale trigger={celebrate} style={style}>
        <Animated.View entering={reduceMotion ? undefined : FadeInDown.duration(DURATIONS.base)}>
          <View className="rounded-tile bg-raised p-3.5">
            {isFirstMove && !noSteps && (
              <Text variant="overline" className="text-primary-400">
                First move
              </Text>
            )}
            {showPosition && (
              <Text variant="overline" className="text-primary-400" style={tabularNums}>
                {`Step ${stepNumber} of ${stepTotal}`}
              </Text>
            )}
            {noSteps && (
              <Text variant="overline" className="text-primary-400">
                {allDone ? "You're done" : "This session"}
              </Text>
            )}
            <Text variant="label" className="mt-1 text-neutral-600">
              {allDone
                ? "Every step is complete. Nicely done."
                : noStepsYet
                  ? "No steps on this one. Just start."
                  : display}
            </Text>
            {simplerText && !noSteps && (
              <Text variant="caption" className="mt-2 text-primary-400">
                Simplified, smaller and easier to just start.
              </Text>
            )}
          </View>
        </Animated.View>
      </PulseScale>
    );
  }

  return (
    <PulseScale trigger={celebrate} style={style}>
      <Animated.View entering={reduceMotion ? undefined : FadeInDown.duration(DURATIONS.base)}>
        <View
          className={
            bare
              ? "w-full items-center"
              : "rounded-2xl bg-white border border-neutral-200 p-6"
          }
        >
          {isFirstMove && !noSteps && (
            <Text
              variant="overline"
              className={`text-primary-600 ${bare ? "text-center" : ""}`}
            >
              First move
            </Text>
          )}
          {showPosition && (
            <Text
              variant="captionMedium"
              className={`text-neutral-600 ${bare ? "text-center" : ""}`}
              style={tabularNums}
            >
              {`Step ${stepNumber} of ${stepTotal}`}
            </Text>
          )}
          {noSteps && (
            <Text
              variant="overline"
              className={`${allDone ? "text-primary-600" : "text-neutral-500"} ${bare ? "text-center" : ""}`}
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
              className={`text-primary-600 mt-3 ${bare ? "text-center" : ""}`}
            >
              Simplified, smaller and easier to just start.
            </Text>
          )}
        </View>
      </Animated.View>
    </PulseScale>
  );
}
