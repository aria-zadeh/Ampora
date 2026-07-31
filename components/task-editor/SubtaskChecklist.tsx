import React, { useState } from "react";
import { View, Text, TextInput, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Animated, {
  FadeInDown,
  FadeOut,
  LinearTransition,
} from "react-native-reanimated";
import { SubtaskRow } from "@/components/ui/SubtaskRow";
import { PressableScale } from "@/components/ui/PressableScale";
import { colors, shadows } from "@/utils/design-tokens";
import { staggerDelay, DURATIONS } from "@/utils/motion";
import { useReduceMotion } from "@/hooks/useReduceMotion";
import * as taskLogic from "@/core/task-logic";
import type { Subtask } from "@/types";

interface SubtaskChecklistProps {
  subtasks: Subtask[];
  /** Add a new step. `estimatedMin` is already parsed to a number. */
  onAdd: (title: string, estimatedMin: number) => void;
  onToggle: (subtaskId: string) => void;
  onDelete: (subtaskId: string) => void;
  onEditTitle: (subtaskId: string, title: string) => void;
  /** Move a step from one array position to another (execution order). */
  onReorder: (fromIndex: number, toIndex: number) => void;
}

const DEFAULT_ESTIMATE = 15;

export function SubtaskChecklist({
  subtasks,
  onAdd,
  onToggle,
  onDelete,
  onEditTitle,
  onReorder,
}: SubtaskChecklistProps) {
  const [newTitle, setNewTitle] = useState("");
  const [newMin, setNewMin] = useState("");
  const reduceMotion = useReduceMotion();

  const commitAdd = () => {
    const title = newTitle.trim();
    if (!title) return;
    const parsed = parseInt(newMin, 10);
    const estimatedMin =
      Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_ESTIMATE;
    onAdd(title, estimatedMin);
    setNewTitle("");
    setNewMin("");
  };

  const total = taskLogic.sumEstimatedMin(subtasks);
  const canAdd = newTitle.trim().length > 0;

  return (
    <View>
      {subtasks.length > 0 ? (
        <Animated.View
          layout={reduceMotion ? undefined : LinearTransition.duration(DURATIONS.base)}
          className="overflow-hidden rounded-lg border border-neutral-200 bg-white"
          style={shadows.xs}
        >
          {subtasks.map((subtask, index) => (
            <Animated.View
              key={subtask.id}
              entering={
                reduceMotion
                  ? undefined
                  : FadeInDown.delay(staggerDelay(index)).duration(DURATIONS.base)
              }
              exiting={reduceMotion ? undefined : FadeOut.duration(DURATIONS.fast)}
              layout={reduceMotion ? undefined : LinearTransition.duration(DURATIONS.base)}
              className="flex-row items-center px-3"
            >
              <View className="flex-1">
                <SubtaskRow
                  subtask={subtask}
                  editable
                  onToggle={() => onToggle(subtask.id)}
                  onEdit={(title) => onEditTitle(subtask.id, title)}
                  onDelete={() => onDelete(subtask.id)}
                />
              </View>
              {/* Reorder controls (arrows, no drag) */}
              <View className="ml-1 flex-col">
                <Pressable
                  onPress={() => onReorder(index, index - 1)}
                  disabled={index === 0}
                  hitSlop={6}
                  className="h-6 w-8 items-center justify-center"
                  accessibilityRole="button"
                  accessibilityLabel={`Move ${subtask.title} up`}
                  accessibilityState={{ disabled: index === 0 }}
                >
                  <Ionicons
                    name="chevron-up"
                    size={16}
                    color={index === 0 ? colors.light.borderStrong : colors.light.textMuted}
                  />
                </Pressable>
                <Pressable
                  onPress={() => onReorder(index, index + 1)}
                  disabled={index === subtasks.length - 1}
                  hitSlop={6}
                  className="h-6 w-8 items-center justify-center"
                  accessibilityRole="button"
                  accessibilityLabel={`Move ${subtask.title} down`}
                  accessibilityState={{ disabled: index === subtasks.length - 1 }}
                >
                  <Ionicons
                    name="chevron-down"
                    size={16}
                    color={index === subtasks.length - 1 ? colors.light.borderStrong : colors.light.textMuted}
                  />
                </Pressable>
              </View>
            </Animated.View>
          ))}

          <View className="flex-row items-center justify-end border-t border-neutral-100 px-3 py-2.5">
            <Text className="text-caption font-medium text-neutral-500">
              {subtasks.length} step{subtasks.length === 1 ? "" : "s"} · {total}m total
            </Text>
          </View>
        </Animated.View>
      ) : null}

      {/* Add-row input */}
      <View className="mt-3 flex-row items-center gap-2">
        <TextInput
          className="min-h-12 flex-1 rounded-md border border-neutral-200 bg-white px-3 text-body-lg text-neutral-900"
          placeholder="Add a step"
          placeholderTextColor={colors.light.textDisabled}
          value={newTitle}
          onChangeText={setNewTitle}
          returnKeyType="done"
          onSubmitEditing={commitAdd}
          accessibilityLabel="New step title"
        />
        <TextInput
          className="min-h-12 w-16 rounded-md border border-neutral-200 bg-white px-2 text-center text-body-lg text-neutral-900"
          placeholder="min"
          placeholderTextColor={colors.light.textDisabled}
          value={newMin}
          onChangeText={setNewMin}
          keyboardType="number-pad"
          returnKeyType="done"
          onSubmitEditing={commitAdd}
          accessibilityLabel="New step estimate in minutes"
        />
        <PressableScale
          onPress={commitAdd}
          haptic={canAdd ? "light" : false}
          disabled={!canAdd}
          className={`h-12 w-12 items-center justify-center rounded-md ${
            canAdd ? "bg-primary-600" : "bg-neutral-200"
          }`}
          style={canAdd ? shadows.xs : undefined}
          accessibilityRole="button"
          accessibilityLabel="Add step"
          accessibilityState={{ disabled: !canAdd }}
        >
          <Ionicons name="add" size={22} color={colors.light.primaryForeground} />
        </PressableScale>
      </View>
    </View>
  );
}
