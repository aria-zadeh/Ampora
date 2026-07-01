import React from "react";
import { View, Text, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTaskStore } from "@/store/taskStore";
import { TaskEditorForm } from "@/components/task-editor/TaskEditorForm";
import type { Task } from "@/types";

/**
 * New-task modal. Thin wrapper around the shared TaskEditorForm: seeds an empty
 * draft, and on Save creates the task then dismisses. Nothing is persisted
 * until Save (Save is the single primary action).
 */
export default function NewTaskScreen() {
  const createTask = useTaskStore((s) => s.createTask);

  const initialDraft: Partial<Task> = {
    title: "",
    autoSchedule: true,
    subtasks: [],
    tags: [],
    priority: 2,
  };

  const handleSubmit = (draft: Partial<Task>) => {
    const title = (draft.title ?? "").trim();
    if (!title) return;
    createTask({ ...draft, title });
    router.back();
  };

  return (
    <SafeAreaView className="flex-1 bg-neutral-100" edges={["top", "bottom"]}>
      {/* Header */}
      <View className="flex-row items-center justify-between border-b border-neutral-200 bg-white px-4 py-3">
        <Pressable
          onPress={() => router.back()}
          hitSlop={8}
          className="min-h-11 min-w-11 items-center justify-center"
          accessibilityRole="button"
          accessibilityLabel="Cancel"
        >
          <Ionicons name="close" size={24} color="#18181B" />
        </Pressable>
        <Text className="text-h4 font-semibold text-neutral-900">New task</Text>
        {/* Spacer to balance the X so the title stays centered */}
        <View className="min-h-11 min-w-11" />
      </View>

      <TaskEditorForm
        mode="create"
        initialDraft={initialDraft}
        onSubmit={handleSubmit}
        onCancel={() => router.back()}
      />
    </SafeAreaView>
  );
}
