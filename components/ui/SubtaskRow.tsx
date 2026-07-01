import React from "react";
import { View, Text, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as taskLogic from "@/core/task-logic";
import type { Subtask } from "@/types";

interface SubtaskRowProps {
  subtask: Subtask;
  onToggle?: () => void;
  onEdit?: (title: string) => void;
  onDelete?: () => void;
  /** When true, shows a trailing trash affordance for removal. */
  editable?: boolean;
}

export function SubtaskRow({
  subtask,
  onToggle,
  onEdit,
  onDelete,
  editable = false,
}: SubtaskRowProps) {
  const done = taskLogic.isSubtaskDone(subtask);

  return (
    <View
      className="flex-row items-center py-2 border-b border-neutral-200"
      accessibilityLabel={`${subtask.title}, ${subtask.estimatedMin} minutes${
        done ? ", completed" : ""
      }`}
    >
      {/* Checkbox */}
      <Pressable
        onPress={onToggle}
        className="min-w-11 min-h-11 items-center justify-center"
        accessibilityRole="checkbox"
        accessibilityState={{ checked: done }}
        accessibilityLabel={done ? "Mark step incomplete" : "Mark step complete"}
        hitSlop={8}
      >
        <View
          className={`w-6 h-6 rounded-full items-center justify-center ${
            done ? "bg-primary-600" : "border-2 border-neutral-300"
          }`}
        >
          {done && <Ionicons name="checkmark" size={15} color="#FFFFFF" />}
        </View>
      </Pressable>

      {/* Title */}
      <Pressable
        onPress={onEdit ? () => onEdit(subtask.title) : undefined}
        disabled={!onEdit}
        className="flex-1 ml-1"
      >
        <Text
          className={`text-body ${
            done ? "line-through text-neutral-400" : "text-neutral-900"
          }`}
          numberOfLines={2}
        >
          {subtask.title}
        </Text>
      </Pressable>

      {/* Duration chip */}
      <View className="ml-2 rounded-full bg-neutral-100 px-2 py-0.5">
        <Text className="text-caption font-medium text-neutral-600">
          {subtask.estimatedMin}m
        </Text>
      </View>

      {/* Delete (edit mode only) */}
      {editable && (
        <Pressable
          onPress={onDelete}
          className="min-w-11 min-h-11 items-center justify-center ml-1"
          accessibilityRole="button"
          accessibilityLabel="Delete step"
          hitSlop={8}
        >
          <Ionicons name="trash-outline" size={18} color="#71717A" />
        </Pressable>
      )}
    </View>
  );
}
