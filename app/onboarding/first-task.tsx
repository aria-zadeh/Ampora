import React, { useState } from "react";
import { View, Text, KeyboardAvoidingView, Platform, ScrollView } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import Animated, { FadeIn, FadeInDown } from "react-native-reanimated";
import { Button } from "@/components/ui/Button";
import { Heading } from "@/components/ui/Heading";
import { Input } from "@/components/ui/Input";
import { useTaskStore } from "@/store/taskStore";
import { useSettingsStore } from "@/store/settingsStore";
import { breakdownTask, type BreakdownResult } from "@/services/ai";
import { parseQuickAdd } from "@/core/quick-add";
import { newId } from "@/core/id";
import { gradients, shadows } from "@/utils/design-tokens";
import { DURATIONS } from "@/utils/motion";
import { useReduceMotion } from "@/hooks/useReduceMotion";
import type { StarterAction, Subtask } from "@/types";
import { ProgressDots } from "./ProgressDots";

/**
 * Onboarding step 6 (PRD §8.10): "First task (guided: add one real
 * assignment, watch it break down)". A minimal, single-field capture — not a
 * rebuild of the full task editor (`components/task-editor/**` is another
 * worker's surface) — that runs the SAME breakdown pipeline every other task
 * uses (`services/ai.ts#breakdownTask`, which has its own local fallback and
 * never throws), then hands the created task's id to the aha step (`aha.tsx`)
 * so it can be locked against.
 *
 * AI budget: this calls `breakdownTask`, the same ordinary path the task
 * editor already exercises at runtime — not a NEW routine test call against
 * the edge function (that budget rule is about manual curl/dev testing, see
 * CLAUDE.md). It degrades to the local template fallback exactly like every
 * other breakdown call in the app, and that fallback is never presented as a
 * failure — only as a quiet, honest note.
 */

type Phase = "input" | "loading" | "preview";

export default function FirstTaskScreen() {
  const insets = useSafeAreaInsets();
  const reduceMotion = useReduceMotion();

  const [raw, setRaw] = useState("");
  const [phase, setPhase] = useState<Phase>("input");
  const [resolvedTitle, setResolvedTitle] = useState("");
  const [due, setDue] = useState<number | undefined>(undefined);
  const [durationMin, setDurationMin] = useState<number | undefined>(undefined);
  const [breakdown, setBreakdown] = useState<BreakdownResult | null>(null);

  const enter = (delay: number) =>
    reduceMotion ? undefined : FadeInDown.delay(delay).duration(DURATIONS.base);

  // Live natural-language preview as they type (mirrors the Tasks tab
  // quick-add field, PRD FR-3 "previews parsed fields before saving").
  const trimmed = raw.trim();
  const preview = trimmed ? parseQuickAdd(trimmed, Date.now()) : null;

  const handleSkip = () => {
    // FR-64: never block use behind a step. There is no task to run the aha
    // step against, so this exits onboarding directly rather than routing
    // into a step that would have nothing to show.
    useSettingsStore.getState().updateSettings({ onboardingComplete: true });
    router.replace("/(tabs)");
  };

  const handleBreakItDown = async () => {
    if (!trimmed || phase === "loading") return;
    const parsed = parseQuickAdd(trimmed, Date.now());
    // parseQuickAdd strips recognized tokens (due/duration/priority) out of
    // the middle of the string, which can leave a dangling separator behind
    // (e.g. "Read ch 11, due Friday, 2h" -> "Read ch 11, ,"). Cosmetic
    // cleanup local to this screen only — core/quick-add.ts itself is out of
    // scope here and this same cleanup would want its own test coverage.
    const title = (parsed.title || trimmed).replace(/[\s,;:]+$/, "").trim() || trimmed;
    setPhase("loading");
    try {
      const result = await breakdownTask({ title, due: parsed.due, durationMin: parsed.durationMin });
      setResolvedTitle(title);
      setDue(parsed.due);
      setDurationMin(parsed.durationMin);
      setBreakdown(result);
      setPhase("preview");
    } catch {
      // breakdownTask already never throws, but never surface a failure to
      // the UI regardless — fall back to the gentlest possible next step.
      setResolvedTitle(title);
      setDue(parsed.due);
      setDurationMin(parsed.durationMin);
      setBreakdown({
        firstMove: `Open "${title}" and type the first word`,
        subtasks: [{ title: "Get started", estimatedMin: 10 }],
        isFallback: true,
      });
      setPhase("preview");
    }
  };

  const handleTryAgain = () => {
    setPhase("input");
    setBreakdown(null);
  };

  const handleContinue = () => {
    if (!breakdown) return;
    const subtasks: Subtask[] = breakdown.subtasks.map((s) => ({
      id: newId(),
      title: s.title,
      estimatedMin: Math.max(1, Math.round(s.estimatedMin)),
    }));
    const firstMove: StarterAction = { id: newId(), text: breakdown.firstMove, done: false };
    const created = useTaskStore.getState().createTask({
      title: resolvedTitle,
      subtasks,
      firstMove,
      durationMin: subtasks.reduce((sum, s) => sum + s.estimatedMin, 0) || durationMin || 30,
      due,
    });
    router.push({ pathname: "/onboarding/aha", params: { taskId: created.id } });
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      className="flex-1 bg-neutral-100"
    >
      <LinearGradient
        colors={gradients.heroWash}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        pointerEvents="none"
        style={{ position: "absolute", top: 0, left: 0, right: 0, height: 360 }}
      />

      <ScrollView
        className="flex-1"
        contentContainerClassName="px-6 pb-6"
        style={{ paddingTop: insets.top + 24 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Animated.View entering={enter(0)} className="mb-6">
          <ProgressDots total={7} current={5} />
        </Animated.View>

        <Animated.View entering={enter(0)}>
          <Text className="text-overline text-neutral-500 uppercase tracking-wide mb-3">
            Let&apos;s try one for real
          </Text>
          <Heading size="h1" className="text-neutral-900 max-w-[320px]">
            Add one real assignment
          </Heading>
          <Text className="text-body-lg text-neutral-600 mt-3 leading-6 max-w-[330px]">
            Type something you actually have to do. Watch Ampora break it into
            a first move you can start in minutes.
          </Text>
        </Animated.View>

        {phase !== "preview" ? (
          <Animated.View entering={enter(100)} className="mt-8">
            <Input
              label="Your assignment"
              placeholder="e.g. Read Chapter 11 for Bio, due Friday"
              value={raw}
              onChangeText={setRaw}
              autoFocus
              multiline
              editable={phase !== "loading"}
              returnKeyType="done"
              accessibilityLabel="Type one real assignment"
              accessibilityHint="Ampora will break it into a first move and steps"
            />

            {preview && (preview.due != null || preview.durationMin != null) ? (
              <View className="mt-3 flex-row flex-wrap gap-2">
                {preview.due != null ? (
                  <View className="flex-row items-center gap-1.5 rounded-full bg-primary-50 px-3 py-1.5">
                    <Ionicons name="calendar-outline" size={14} color="#2563EB" />
                    <Text className="text-caption font-medium text-primary-700">
                      Due {new Date(preview.due).toLocaleDateString([], { month: "short", day: "numeric" })}
                    </Text>
                  </View>
                ) : null}
                {preview.durationMin != null ? (
                  <View className="flex-row items-center gap-1.5 rounded-full bg-primary-50 px-3 py-1.5">
                    <Ionicons name="time-outline" size={14} color="#2563EB" />
                    <Text className="text-caption font-medium text-primary-700">
                      {preview.durationMin} min
                    </Text>
                  </View>
                ) : null}
              </View>
            ) : null}
          </Animated.View>
        ) : (
          <Animated.View
            entering={reduceMotion ? FadeIn.duration(DURATIONS.base) : FadeInDown.duration(DURATIONS.base)}
            className="mt-8 gap-4"
          >
            <View className="rounded-2xl border border-neutral-200 bg-white p-5" style={shadows.sm}>
              <Text className="text-overline font-semibold uppercase tracking-wide text-neutral-500">
                Your task
              </Text>
              <Heading size="h4" className="mt-1.5 text-neutral-900">
                {resolvedTitle}
              </Heading>

              {breakdown ? (
                <View className="mt-4 flex-row items-start gap-2.5 rounded-lg bg-primary-50 px-3.5 py-3">
                  <Ionicons name="flag-outline" size={16} color="#2563EB" style={{ marginTop: 1 }} />
                  <View className="flex-1">
                    <Text className="text-tiny font-semibold uppercase tracking-wide text-primary-600">
                      First move
                    </Text>
                    <Text className="mt-0.5 text-body font-medium text-neutral-900">
                      {breakdown.firstMove}
                    </Text>
                  </View>
                </View>
              ) : null}

              {breakdown && breakdown.subtasks.length > 0 ? (
                <View className="mt-4 gap-2.5">
                  {breakdown.subtasks.map((s, i) => (
                    <View key={`${s.title}-${i}`} className="flex-row items-center gap-2.5">
                      <View className="h-5 w-5 items-center justify-center rounded-full border border-neutral-300">
                        <Text className="text-tiny font-semibold text-neutral-500">{i + 1}</Text>
                      </View>
                      <Text className="flex-1 text-body text-neutral-700" numberOfLines={2}>
                        {s.title}
                      </Text>
                      <Text className="text-caption text-neutral-400">{s.estimatedMin} min</Text>
                    </View>
                  ))}
                </View>
              ) : null}

              {breakdown?.isFallback ? (
                <Text className="mt-4 text-caption text-neutral-400">
                  {breakdown.note ?? "Showing general steps for now."}
                </Text>
              ) : null}
            </View>
          </Animated.View>
        )}
      </ScrollView>

      <View className="gap-2 px-6" style={{ paddingBottom: insets.bottom + 16 }}>
        {phase === "preview" ? (
          <>
            <Button
              title="Looks good, continue"
              variant="primaryBlue"
              size="lg"
              onPress={handleContinue}
              accessibilityLabel="Save this task and continue"
            />
            <Button
              title="Try a different one"
              variant="ghost"
              onPress={handleTryAgain}
              accessibilityLabel="Go back and edit the assignment"
            />
          </>
        ) : (
          <>
            <Button
              title="Break it down"
              variant="primaryBlue"
              size="lg"
              loading={phase === "loading"}
              disabled={!trimmed || phase === "loading"}
              onPress={handleBreakItDown}
              accessibilityLabel="Break this assignment down into a first move and steps"
            />
            <Button
              title="Skip for now"
              variant="ghost"
              onPress={handleSkip}
              accessibilityLabel="Skip adding a task and continue"
            />
          </>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}
