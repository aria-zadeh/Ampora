import React, { useMemo } from "react";
import { View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTaskStore } from "@/store/taskStore";
import { EmptyState } from "@/components/ui/EmptyState";
import { Heading } from "@/components/ui/Heading";
import { PressableScale } from "@/components/ui/PressableScale";
import { TaskEditorForm } from "@/components/task-editor/TaskEditorForm";
import { shadows } from "@/utils/design-tokens";
import type { Task } from "@/types";

/**
 * Task editor (edit mode). Thin wrapper around the shared TaskEditorForm.
 *
 * The task is loaded live from the store. Subtask add/remove/toggle/reorder
 * write DIRECTLY to the store from inside the form (so they persist without
 * Save); title/notes/due/priority and the other scalar fields stay gated
 * behind "Save task", which patches the store via updateTask.
 */
export default function TaskEditScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const task = useTaskStore((s) => s.tasks[id]);
  const updateTask = useTaskStore((s) => s.updateTask);

  // Seed the draft once from the stored task. We intentionally do NOT re-seed
  // on every store change: scalar edits are held locally until Save. (Subtasks
  // are read live inside the form for immediate persistence.)
  const initialDraft = useMemo<Partial<Task> | null>(() => {
    if (!task) return null;
    // Strip the immutable BaseEntity fields; keep everything editable.
    const { id: _id, createdAt: _createdAt, updatedAt: _updatedAt, syncState: _syncState, ...editable } = task;
    return editable;
    // Seed only when the task id changes (open of a different task).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const handleSubmit = (draft: Partial<Task>) => {
    const title = (draft.title ?? "").trim();
    if (!title) return;
    // Drop fields updateTask won't accept; subtasks already persisted directly
    // but re-sending them is harmless (they match store state).
    const { id: _id, createdAt: _createdAt, ...patch } = draft as Task;
    updateTask(id, { ...patch, title });
    router.back();
  };

  if (!task || !initialDraft) {
    return (
      <SafeAreaView className="flex-1 bg-neutral-100" edges={["top", "bottom"]}>
        <View
          className="flex-row items-center border-b border-neutral-200 bg-white px-5 py-3.5"
          style={shadows.xs}
        >
          <PressableScale
            onPress={() => router.back()}
            haptic="light"
            className="h-11 w-11 -ml-2 items-center justify-center rounded-full"
            accessibilityRole="button"
            accessibilityLabel="Back"
          >
            <Ionicons name="chevron-back" size={24} color="#18181B" />
          </PressableScale>
          <Heading size="h3" className="ml-1">
            Task
          </Heading>
        </View>
        <View className="flex-1 items-center justify-center">
          <EmptyState
            title="Task not found"
            subtitle="This task may have been deleted."
            icon="alert-circle-outline"
            actionLabel="Go back"
            onAction={() => router.back()}
          />
        </View>
      </SafeAreaView>
    );
  }

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
            accessibilityLabel="Back"
          >
            <Ionicons name="chevron-back" size={24} color="#18181B" />
          </PressableScale>
        </View>
        <Heading size="h3">Edit task</Heading>
        <View className="min-w-11" />
      </View>

      <TaskEditorForm
        mode="edit"
        taskId={id}
        initialDraft={initialDraft}
        onSubmit={handleSubmit}
        onCancel={() => router.back()}
      />
    </SafeAreaView>
  );
}
