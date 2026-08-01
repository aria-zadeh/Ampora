/**
 * ProgressTracker — the editable phase checklist + percent bar for a project
 * (doc `06` §5/§7): an ordered list of phases (for a study project, this is
 * the topic list), each toggled done/not-done by tapping the row, plus a
 * simple percent bar above it — completed phases plus the fraction of the
 * current phase (doc `06` §5). No per-phase score or rating: a phase is
 * simply done or it isn't (finer-grained tracking is cut, `V2_Changes.md` §6).
 *
 * Edited exactly like a task breakdown (doc `06` §1) — add, remove, toggle.
 * Edits go straight to the store via `onChange`, so this is the one place
 * phases get mutated outside of the end-of-session check-in.
 */

import React, { useCallback, useMemo, useState } from "react";
import { View, Text, Pressable, TextInput } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { PressableScale } from "@/components/ui/PressableScale";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { PROJECT_ACCENT } from "./projectUtils";
import { newId } from "@/core/id";
import { colors, iconSizes, TOUCH_TARGET_MIN } from "@/utils/design-tokens";
import type { Phase, Project } from "@/types";

interface ProgressTrackerProps {
  project: Project;
  onChange: (phases: Phase[]) => void;
}

export function ProgressTracker({ project, onChange }: ProgressTrackerProps) {
  const { phases, percent, kind } = project;
  const noun = kind === "study" ? "topic" : "phase";
  const [newTitle, setNewTitle] = useState("");

  const sorted = useMemo(() => [...phases].sort((a, b) => a.order - b.order), [phases]);
  const doneCount = useMemo(() => sorted.filter((p) => p.done).length, [sorted]);

  const toggleDone = useCallback(
    (id: string) => {
      onChange(phases.map((p) => (p.id === id ? { ...p, done: !p.done } : p)));
    },
    [phases, onChange]
  );

  const remove = useCallback(
    (id: string) => {
      onChange(phases.filter((p) => p.id !== id));
    },
    [phases, onChange]
  );

  const add = useCallback(() => {
    const title = newTitle.trim();
    if (!title) return;
    const nextOrder = phases.length === 0 ? 0 : Math.max(...phases.map((p) => p.order)) + 1;
    onChange([...phases, { id: newId(), title, done: false, order: nextOrder }]);
    setNewTitle("");
  }, [newTitle, phases, onChange]);

  return (
    <View>
      <ProgressBar
        progress={percent / 100}
        color="bg-accent-600"
        label={`${doneCount} of ${sorted.length} ${sorted.length === 1 ? noun : `${noun}s`} done`}
        showPercentage
        height={10}
      />

      <View className="gap-2 mt-4 mb-3">
        {sorted.length === 0 ? (
          <Text className="text-body text-neutral-500">
            No {noun}s yet.{" "}
            {kind === "study"
              ? "Add what you need to cover and tap each one off as you learn it."
              : "Add the steps to your deliverable (research, outline, draft, revise) and tap each off as you go."}
          </Text>
        ) : (
          sorted.map((phase) => (
            <PressableScale
              key={phase.id}
              haptic="selection"
              onPress={() => toggleDone(phase.id)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: phase.done }}
              accessibilityLabel={`${phase.title}, ${phase.done ? "done" : "not done"}. Tap to toggle.`}
              style={{ minHeight: TOUCH_TARGET_MIN }}
              className="flex-row items-center rounded-xl border border-neutral-200 bg-white px-3 py-3"
            >
              <View
                className={`h-6 w-6 items-center justify-center rounded-full border-2 ${
                  phase.done ? "border-accent-600 bg-accent-600" : "border-neutral-300"
                }`}
              >
                {phase.done ? <Ionicons name="checkmark" size={14} color={colors.light.primaryForeground} /> : null}
              </View>
              <Text
                className={`flex-1 ml-3 text-body font-medium ${
                  phase.done ? "text-neutral-400 line-through" : "text-neutral-900"
                }`}
                numberOfLines={2}
              >
                {phase.title}
              </Text>
              <Pressable
                onPress={() => remove(phase.id)}
                hitSlop={10}
                className="ml-2"
                accessibilityRole="button"
                accessibilityLabel={`Remove ${noun} ${phase.title}`}
              >
                <Ionicons name="close-circle" size={iconSizes.sm} color={colors.light.borderStrong} />
              </Pressable>
            </PressableScale>
          ))
        )}
      </View>

      <AddRow
        value={newTitle}
        onChangeText={setNewTitle}
        onAdd={add}
        placeholder={kind === "study" ? "Add a topic…" : "Add a phase…"}
      />
    </View>
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
}: {
  value: string;
  onChangeText: (t: string) => void;
  onAdd: () => void;
  placeholder: string;
}) {
  const canAdd = value.trim().length > 0;
  return (
    <View className="flex-row items-center gap-2">
      <View className="flex-1 flex-row items-center bg-white border border-neutral-200 rounded-md min-h-11 px-3">
        <Ionicons name="add" size={iconSizes.md} color={colors.light.textDisabled} />
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.light.textDisabled}
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
        style={{ backgroundColor: canAdd ? PROJECT_ACCENT : colors.light.border }}
      >
        <Ionicons name="checkmark" size={iconSizes.md} color={colors.light.primaryForeground} />
      </PressableScale>
    </View>
  );
}
