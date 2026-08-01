/**
 * StepCard — the ONE current step, large (PRD FR-62, doc `03` Part 3.4).
 *
 * The session shows a single step at a time: the First move if it is still
 * open, otherwise the next unchecked subtask. The First move is the ON-RAMP,
 * never a gate — completing it reveals the next step and logs "started", and it
 * unlocks nothing (doc `04` §5). This card carries no unlock affordance at all,
 * by design.
 *
 * `celebrate` plays the single celebratory beat of the screen (the completion
 * pulse), which reduce-motion turns into a no-op inside `PulseScale`.
 */

import React from "react";
import { View, Text } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";

import { Heading } from "@/components/ui/Heading";
import { PulseScale } from "@/components/ui/PulseScale";
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
}

export function StepCard({ step, simplerText, celebrate = false, style }: StepCardProps) {
  const reduceMotion = useReduceMotion();
  const noSteps = step.kind === "none";
  const display = simplerText ?? stepText(step);

  return (
    <PulseScale trigger={celebrate} style={style}>
      <Animated.View entering={reduceMotion ? undefined : FadeInDown.duration(DURATIONS.base)}>
        <View className="rounded-2xl bg-white border border-neutral-200 p-6">
          <Text className="text-overline font-semibold uppercase tracking-wide text-primary-600">
            {noSteps ? "You're done" : stepKindLabel(step)}
          </Text>
          <Heading size="h1" className="mt-2">
            {noSteps ? "Every step is complete. Nicely done." : display}
          </Heading>
          {simplerText && !noSteps && (
            <Text className="text-caption text-primary-600 mt-3">
              Simplified — smaller and easier to just start.
            </Text>
          )}
        </View>
      </Animated.View>
    </PulseScale>
  );
}
