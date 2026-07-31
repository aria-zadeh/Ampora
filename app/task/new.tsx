import React from "react";
import { View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTaskStore } from "@/store/taskStore";
import { Heading } from "@/components/ui/Heading";
import { PressableScale } from "@/components/ui/PressableScale";
import { TaskEditorForm } from "@/components/task-editor/TaskEditorForm";
import { colors, shadows } from "@/utils/design-tokens";
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
      {/* Modal header */}
      <View
        className="flex-row items-center justify-between border-b border-neutral-200 bg-white px-5 py-3.5"
        style={shadows.xs}
      >
        <View className="min-w-11">
          <PressableScale
            onPress={() => router.back()}
            haptic="light"
            className="h-11 w-11 -ml-2 items-center justify-center rounded-full"
            accessibilityRole="button"
            accessibilityLabel="Cancel"
          >
            <Ionicons name="close" size={24} color={colors.light.text} />
          </PressableScale>
        </View>
        <Heading size="h3">New task</Heading>
        {/* Spacer to balance the X so the title stays centered */}
        <View className="min-w-11" />
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
