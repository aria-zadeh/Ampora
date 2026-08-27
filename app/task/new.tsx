import React from "react";
import { View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTaskStore } from "@/store/taskStore";
import { Heading } from "@/components/ui/Heading";
import { PressableScale } from "@/components/ui/PressableScale";
import { TaskEditorForm } from "@/components/task-editor/TaskEditorForm";
import { useThemeColors } from "@/hooks/useThemeColors";
import type { Task } from "@/types";

/**
 * New-task modal. Thin wrapper around the shared TaskEditorForm: seeds an empty
 * draft, and on Save creates the task then dismisses. Nothing is persisted
 * until Save (Save is the single primary action).
 */
export default function NewTaskScreen() {
  const theme = useThemeColors();
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
    // This route is presented as a slide-up modal (app/_layout.tsx), so its
    // own content IS the bottom sheet — bg-surface, not canvas (contract 3b:
    // "much of this app currently uses canvas for sheets; that's a
    // pre-existing mistake, do not copy it").
    <SafeAreaView className="flex-1 bg-surface" edges={["top", "bottom"]}>
      {/* Grabber: 40x4, bg-line, rounded-xxs, left-aligned (measured off
          task-capture.pdf, x=24 — explicitly NOT centered). */}
      <View className="px-6 pt-3">
        <View className="h-1 w-10 rounded-xxs bg-line" />
      </View>

      {/* Sheet header: heading left, close right (matches task-capture's
          "New Intent" + top-right close circle). No divider beneath it —
          the old bordered nav-bar row is gone. */}
      <View className="flex-row items-center justify-between px-6 pb-3 pt-2">
        <Heading size="h3">New task</Heading>
        {/* Close: 36x36 bg-raised circle (measured), inside a 44x44 tap
            target so it still clears the touch-target floor. */}
        <PressableScale
          onPress={() => router.back()}
          haptic="light"
          className="h-11 w-11 items-center justify-center"
          accessibilityRole="button"
          accessibilityLabel="Cancel"
        >
          <View className="h-9 w-9 items-center justify-center rounded-full bg-raised">
            <Ionicons name="close" size={20} color={theme.text} />
          </View>
        </PressableScale>
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
