/**
 * BreakOverlay — a break HOLDS the session clock (PRD FR-62, doc `04` §6).
 *
 * This is the single most important thing about it: a break is not a second
 * phase of the timer, it is a pause on the one bounded session. Break time must
 * never count toward a stake's hold, or "take a break" becomes a way to serve a
 * lock without doing anything — the exact leak the session model closes. The
 * parent holds the timer (`useForegroundTimer({ held })`) for as long as this is
 * visible, so nothing accrues while it is up. The copy says so plainly, because
 * a user who does not know that will assume the worst.
 *
 * Calm by construction: a breathing prompt, a countdown that is informational
 * rather than a gate, and "Back to focus" always available with no friction.
 */

import React, { useEffect, useRef, useState } from "react";
import { View, Text, Modal } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

import { Button } from "@/components/ui/Button";
import { Heading } from "@/components/ui/Heading";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { colors, iconSizes, tabularNums } from "@/utils/design-tokens";
import { useReduceMotion } from "@/hooks/useReduceMotion";

/** Calm prompts, one picked per break. Never instructional-nagging. */
const BREAK_PROMPTS: { icon: keyof typeof Ionicons.glyphMap; text: string }[] = [
  { icon: "cloudy-outline", text: "Five slow breaths. In through your nose, out through your mouth." },
  { icon: "body-outline", text: "Stand up and stretch. Roll your shoulders back, shake out your hands." },
  { icon: "eye-outline", text: "Look away from the screen. Find something far away and rest your eyes on it." },
];

export interface BreakOverlayProps {
  visible: boolean;
  /** Break length in minutes. @default 5 */
  minutes?: number;
  /** Return to the session (also fired when the break runs out). */
  onResume: () => void;
  /** True when a stake is holding this session, so the copy can be explicit. */
  lockActive?: boolean;
}

export function BreakOverlay({ visible, minutes = 5, onResume, lockActive = false }: BreakOverlayProps) {
  const reduceMotion = useReduceMotion();
  const totalSec = Math.max(30, Math.round(minutes * 60));

  const [remaining, setRemaining] = useState(totalSec);
  const [prompt, setPrompt] = useState(() => BREAK_PROMPTS[0]);
  const endedRef = useRef(false);
  // Read the latest callback from the countdown without re-arming the interval
  // on every parent render (which would stall the break clock).
  const onResumeRef = useRef(onResume);
  useEffect(() => {
    onResumeRef.current = onResume;
  }, [onResume]);

  // Reset on every open, and pick a fresh prompt.
  useEffect(() => {
    if (!visible) return;
    setRemaining(totalSec);
    setPrompt(BREAK_PROMPTS[Math.floor(Math.random() * BREAK_PROMPTS.length)]);
    endedRef.current = false;
  }, [visible, totalSec]);

  useEffect(() => {
    if (!visible) return;
    const id = setInterval(() => {
      setRemaining((r) => {
        if (r <= 1) {
          clearInterval(id);
          if (!endedRef.current) {
            endedRef.current = true;
            onResumeRef.current();
          }
          return 0;
        }
        return r - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [visible]);

  const mm = String(Math.floor(remaining / 60)).padStart(2, "0");
  const ss = String(remaining % 60).padStart(2, "0");
  const progress = 1 - remaining / totalSec;

  return (
    <Modal
      visible={visible}
      animationType={reduceMotion ? "fade" : "slide"}
      presentationStyle="fullScreen"
      statusBarTranslucent
      onRequestClose={onResume}
    >
      <SafeAreaView className="flex-1 bg-neutral-100" edges={["top", "bottom"]}>
        <View className="flex-1 items-center justify-center px-8">
          <View className="h-20 w-20 items-center justify-center rounded-full bg-primary-100">
            <Ionicons name={prompt.icon} size={iconSizes.xl} color={colors.light.primary} />
          </View>

          <Heading size="h2" className="mt-6 text-center">
            Take a breather
          </Heading>
          <Text className="mt-2 max-w-[300px] text-center text-body text-neutral-600 leading-6">
            {prompt.text}
          </Text>

          <View className="mt-10 items-center">
            <Text
              className="font-bold text-neutral-900"
              style={{ fontSize: 56, lineHeight: 62, ...tabularNums }}
              accessibilityRole="timer"
              accessibilityLabel={`${mm} minutes ${ss} seconds of break left`}
            >
              {mm}:{ss}
            </Text>
            <View className="mt-4 w-56">
              <ProgressBar progress={progress} color="bg-primary-500" height={6} />
            </View>
          </View>

          {/* The honesty line. Without it, a user reasonably assumes break time
              is serving their lock. */}
          <View
            className="mt-8 flex-row items-start gap-2 rounded-2xl bg-white border border-neutral-200 px-4 py-3"
            accessibilityRole="summary"
          >
            <Ionicons name="pause-circle-outline" size={iconSizes.sm} color={colors.light.textSecondary} />
            <Text className="flex-1 text-caption text-neutral-600 leading-5">
              {lockActive
                ? "Your session timer is paused, so break time doesn't count toward your lock. Your apps stay on the line."
                : "Your session timer is paused. Break time doesn't count as focus time."}
            </Text>
          </View>
        </View>

        <View className="px-5 pb-4">
          <Button
            title="Back to focus"
            variant="primaryBlue"
            size="lg"
            onPress={onResume}
            icon={<Ionicons name="arrow-forward" size={iconSizes.sm} color={colors.light.primaryForeground} />}
            accessibilityLabel="End the break and resume your session"
          />
        </View>
      </SafeAreaView>
    </Modal>
  );
}
