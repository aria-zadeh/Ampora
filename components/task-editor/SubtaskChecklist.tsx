import React, { useState } from "react";
import { View, Text, TextInput, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SubtaskRow } from "@/components/ui/SubtaskRow";
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

  return (
    <View>
      {subtasks.length > 0 ? (
        <View className="rounded-lg border border-neutral-200 bg-white px-3">
          {subtasks.map((subtask, index) => (
            <View
              key={subtask.id}
              className="flex-row items-center"
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
                    color={index === 0 ? "#D4D4D8" : "#71717A"}
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
                    color={index === subtasks.length - 1 ? "#D4D4D8" : "#71717A"}
                  />
                </Pressable>
              </View>
            </View>
          ))}

          <View className="flex-row justify-end py-2">
            <Text className="text-caption text-neutral-500">
              {subtasks.length} step{subtasks.length === 1 ? "" : "s"} · {total}m total
            </Text>
          </View>
        </View>
      ) : null}

      {/* Add-row input */}
      <View className="mt-3 flex-row items-center gap-2">
        <TextInput
          className="min-h-12 flex-1 rounded-md border border-neutral-200 bg-white px-3 text-body-lg text-neutral-900"
          placeholder="Add a step"
          placeholderTextColor="#A1A1AA"
          value={newTitle}
          onChangeText={setNewTitle}
          returnKeyType="done"
          onSubmitEditing={commitAdd}
          accessibilityLabel="New step title"
        />
        <TextInput
          className="min-h-12 w-16 rounded-md border border-neutral-200 bg-white px-2 text-center text-body-lg text-neutral-900"
          placeholder="min"
          placeholderTextColor="#A1A1AA"
          value={newMin}
          onChangeText={setNewMin}
          keyboardType="number-pad"
          returnKeyType="done"
          onSubmitEditing={commitAdd}
          accessibilityLabel="New step estimate in minutes"
        />
        <Pressable
          onPress={commitAdd}
          disabled={!newTitle.trim()}
          className={`h-12 w-12 items-center justify-center rounded-md ${
            newTitle.trim() ? "bg-primary-600" : "bg-neutral-200"
          }`}
          accessibilityRole="button"
          accessibilityLabel="Add step"
          accessibilityState={{ disabled: !newTitle.trim() }}
        >
          <Ionicons name="add" size={22} color="#FFFFFF" />
        </Pressable>
      </View>
    </View>
  );
}
