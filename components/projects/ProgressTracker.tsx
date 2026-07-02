/**
 * ProgressTracker — editable progress visualization for the three project kinds
 * (doc `10` §6):
 *  - deliverable → ordered phase bars, tap a phase to bump its percent.
 *  - study → topics with a 5-dot mastery meter, tap to bump mastery.
 *  - general → a single overall percent with +/- steppers.
 *
 * Never color-only: every phase/topic carries a text label and a numeric value,
 * and the general ring prints its percent. Edits go straight to the store via
 * `onChange`, so the chat and the tracker stay in sync on one source of truth.
 */

import React, { useCallback, useState } from "react";
import { View, Text, Pressable, TextInput } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { PressableScale } from "@/components/ui/PressableScale";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { ProgressRing } from "./ProgressRing";
import { PROJECT_ACCENT } from "./projectUtils";
import { newId } from "@/core/id";
import { iconSizes } from "@/utils/design-tokens";
import type {
  Project,
  ProjectPhase,
  ProjectProgress,
  ProjectTopic,
} from "@/types";

interface ProgressTrackerProps {
  project: Project;
  onChange: (progress: ProjectProgress) => void;
}

const PHASE_STEP = 25; // tap cycles a phase 0 → 25 → 50 → 75 → 100 → 0
const MASTERY_LEVELS = 5; // 5 dots, each = 0.2 mastery
const GENERAL_STEP = 10;

function clampPct(n: number): number {
  return Math.min(100, Math.max(0, Math.round(n)));
}

export function ProgressTracker({ project, onChange }: ProgressTrackerProps) {
  const { progress } = project;
  const accent = project.color ?? PROJECT_ACCENT;

  if (progress.kind === "deliverable") {
    return <DeliverableTracker phases={progress.phases} accent={accent} onChange={onChange} />;
  }
  if (progress.kind === "study") {
    return <StudyTracker topics={progress.topics} accent={accent} onChange={onChange} />;
  }
  return <GeneralTracker pct={progress.pct} accent={accent} onChange={onChange} />;
}

// ---------------------------------------------------------------------------
// Deliverable — phase bars
// ---------------------------------------------------------------------------

function DeliverableTracker({
  phases,
  accent,
  onChange,
}: {
  phases: ProjectPhase[];
  accent: string;
  onChange: (p: ProjectProgress) => void;
}) {
  const [newTitle, setNewTitle] = useState("");

  const bump = useCallback(
    (id: string) => {
      onChange({
        kind: "deliverable",
        phases: phases.map((p) =>
          p.id === id ? { ...p, pct: p.pct >= 100 ? 0 : clampPct(p.pct + PHASE_STEP) } : p
        ),
      });
    },
    [phases, onChange]
  );

  const remove = useCallback(
    (id: string) => {
      onChange({ kind: "deliverable", phases: phases.filter((p) => p.id !== id) });
    },
    [phases, onChange]
  );

  const add = useCallback(() => {
    const title = newTitle.trim();
    if (!title) return;
    onChange({
      kind: "deliverable",
      phases: [...phases, { id: newId(), title, pct: 0 }],
    });
    setNewTitle("");
  }, [newTitle, phases, onChange]);

  return (
    <View>
      {phases.length === 0 ? (
        <Text className="text-body text-neutral-500 mb-3">
          No phases yet. Add the steps to your deliverable (sources, outline, draft, revise) and tap
          each to log progress.
        </Text>
      ) : (
        <View className="gap-3 mb-3">
          {phases.map((phase) => (
            <PressableScale
              key={phase.id}
              haptic="selection"
              onPress={() => bump(phase.id)}
              accessibilityLabel={`${phase.title}, ${phase.pct}% complete. Tap to advance.`}
              className="py-1"
            >
              <View className="flex-row items-center justify-between mb-1.5">
                <Text className="flex-1 text-body font-medium text-neutral-900" numberOfLines={1}>
                  {phase.title}
                </Text>
                <Text className="text-caption font-semibold text-neutral-600 ml-2">
                  {phase.pct}%
                </Text>
                <Pressable
                  onPress={() => remove(phase.id)}
                  hitSlop={10}
                  className="ml-2"
                  accessibilityRole="button"
                  accessibilityLabel={`Remove phase ${phase.title}`}
                >
                  <Ionicons name="close-circle" size={iconSizes.sm} color="#D7D3CC" />
                </Pressable>
              </View>
              <ProgressBar
                progress={phase.pct / 100}
                color="bg-accent-600"
                height={8}
              />
            </PressableScale>
          ))}
        </View>
      )}

      <AddRow
        value={newTitle}
        onChangeText={setNewTitle}
        onAdd={add}
        placeholder="Add a phase…"
        accent={accent}
      />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Study — topic mastery dots
// ---------------------------------------------------------------------------

function StudyTracker({
  topics,
  accent,
  onChange,
}: {
  topics: ProjectTopic[];
  accent: string;
  onChange: (p: ProjectProgress) => void;
}) {
  const [newTitle, setNewTitle] = useState("");

  const setMastery = useCallback(
    (id: string, level: number) => {
      // level is 1..MASTERY_LEVELS; tapping the current level clears back one.
      onChange({
        kind: "study",
        topics: topics.map((t) => (t.id === id ? { ...t, mastery: level / MASTERY_LEVELS } : t)),
      });
    },
    [topics, onChange]
  );

  const remove = useCallback(
    (id: string) => {
      onChange({ kind: "study", topics: topics.filter((t) => t.id !== id) });
    },
    [topics, onChange]
  );

  const add = useCallback(() => {
    const title = newTitle.trim();
    if (!title) return;
    onChange({ kind: "study", topics: [...topics, { id: newId(), title, mastery: 0 }] });
    setNewTitle("");
  }, [newTitle, topics, onChange]);

  return (
    <View>
      {topics.length === 0 ? (
        <Text className="text-body text-neutral-500 mb-3">
          No topics yet. Add what you need to cover and tap the dots to log how well you know each —
          Ampora steers you to the weakest one next.
        </Text>
      ) : (
        <View className="gap-3.5 mb-3">
          {topics.map((topic) => {
            const filled = Math.round(topic.mastery * MASTERY_LEVELS);
            const label = masteryLabel(topic.mastery);
            return (
              <View key={topic.id}>
                <View className="flex-row items-center justify-between mb-1.5">
                  <Text
                    className="flex-1 text-body font-medium text-neutral-900"
                    numberOfLines={1}
                  >
                    {topic.title}
                  </Text>
                  <Text className="text-caption font-medium text-neutral-500 ml-2">{label}</Text>
                  <Pressable
                    onPress={() => remove(topic.id)}
                    hitSlop={10}
                    className="ml-2"
                    accessibilityRole="button"
                    accessibilityLabel={`Remove topic ${topic.title}`}
                  >
                    <Ionicons name="close-circle" size={iconSizes.sm} color="#D7D3CC" />
                  </Pressable>
                </View>
                <View
                  className="flex-row gap-2"
                  accessibilityLabel={`${topic.title} mastery: ${filled} of ${MASTERY_LEVELS}`}
                >
                  {Array.from({ length: MASTERY_LEVELS }).map((_, i) => {
                    const level = i + 1;
                    const on = level <= filled;
                    return (
                      <Pressable
                        key={level}
                        onPress={() => setMastery(topic.id, level)}
                        hitSlop={6}
                        accessibilityLabel={`Set ${topic.title} mastery to ${level} of ${MASTERY_LEVELS}`}
                        accessibilityRole="button"
                      >
                        <View
                          className="w-6 h-6 rounded-full border"
                          style={{
                            backgroundColor: on ? accent : "#FFFFFF",
                            borderColor: on ? accent : "#E8E6E0",
                          }}
                        />
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            );
          })}
        </View>
      )}

      <AddRow
        value={newTitle}
        onChangeText={setNewTitle}
        onAdd={add}
        placeholder="Add a topic…"
        accent={accent}
      />
    </View>
  );
}

function masteryLabel(mastery: number): string {
  if (mastery <= 0) return "New";
  if (mastery < 0.4) return "Shaky";
  if (mastery < 0.7) return "Okay";
  if (mastery < 1) return "Strong";
  return "Solid";
}

// ---------------------------------------------------------------------------
// General — single percent with steppers
// ---------------------------------------------------------------------------

function GeneralTracker({
  pct,
  accent,
  onChange,
}: {
  pct: number;
  accent: string;
  onChange: (p: ProjectProgress) => void;
}) {
  const set = useCallback(
    (next: number) => onChange({ kind: "general", pct: clampPct(next) }),
    [onChange]
  );

  return (
    <View className="items-center py-2">
      <ProgressRing pct={pct} size={96} stroke={8} color={accent} />
      <View className="flex-row items-center gap-4 mt-5">
        <Stepper
          icon="remove"
          label="Decrease progress"
          disabled={pct <= 0}
          onPress={() => set(pct - GENERAL_STEP)}
        />
        <Text className="text-body font-medium text-neutral-500 w-24 text-center">
          {pct}% done
        </Text>
        <Stepper
          icon="add"
          label="Increase progress"
          disabled={pct >= 100}
          onPress={() => set(pct + GENERAL_STEP)}
        />
      </View>
    </View>
  );
}

function Stepper({
  icon,
  label,
  disabled,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <PressableScale
      haptic="light"
      disabled={disabled}
      onPress={onPress}
      accessibilityLabel={label}
      className={`w-12 h-12 rounded-full items-center justify-center border ${
        disabled ? "bg-neutral-50 border-neutral-200" : "bg-white border-neutral-300"
      }`}
    >
      <Ionicons name={icon} size={iconSizes.lg} color={disabled ? "#D7D3CC" : "#1C1917"} />
    </PressableScale>
  );
}

// ---------------------------------------------------------------------------
// Shared add-row
// ---------------------------------------------------------------------------

function AddRow({
  value,
  onChangeText,
  onAdd,
  placeholder,
  accent,
}: {
  value: string;
  onChangeText: (t: string) => void;
  onAdd: () => void;
  placeholder: string;
  accent: string;
}) {
  const canAdd = value.trim().length > 0;
  return (
    <View className="flex-row items-center gap-2">
      <View className="flex-1 flex-row items-center bg-white border border-neutral-200 rounded-md min-h-11 px-3">
        <Ionicons name="add" size={iconSizes.md} color="#A8A29A" />
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor="#A8A29A"
          className="flex-1 ml-2 text-body text-neutral-900"
          returnKeyType="done"
          onSubmitEditing={onAdd}
          accessibilityLabel={placeholder}
        />
      </View>
      <PressableScale
        haptic="light"
        disabled={!canAdd}
        onPress={onAdd}
        accessibilityLabel="Add"
        className="w-11 h-11 rounded-md items-center justify-center"
        style={{ backgroundColor: canAdd ? accent : "#E8E6E0" }}
      >
        <Ionicons name="checkmark" size={iconSizes.md} color="#FFFFFF" />
      </PressableScale>
    </View>
  );
}
