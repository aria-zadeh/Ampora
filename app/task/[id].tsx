import React, { useEffect, useMemo, useState } from "react";
import { View, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTaskStore } from "@/store/taskStore";
import { EmptyState } from "@/components/ui/EmptyState";
import { Heading } from "@/components/ui/Heading";
import { PressableScale } from "@/components/ui/PressableScale";
import { SkeletonLoader } from "@/components/ui/SkeletonLoader";
import { TaskEditorForm } from "@/components/task-editor/TaskEditorForm";
import { VerificationSheet } from "@/components/verification/VerificationSheet";
import { StakeSetupSheet, type ArmedStake } from "@/components/stakes/StakeSetupSheet";
import { colors, shadows } from "@/utils/design-tokens";
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

  // MMKV reads are synchronous but zustand's persist middleware still finishes
  // rehydration a tick after mount, so a deep-linked open of this screen can
  // briefly see `task === undefined` before the real data lands. Track that
  // window so we show a loading skeleton instead of a false "not found".
  const [storeHydrated, setStoreHydrated] = useState(() => useTaskStore.persist.hasHydrated());
  useEffect(() => {
    if (storeHydrated) return;
    return useTaskStore.persist.onFinishHydration(() => setStoreHydrated(true));
  }, [storeHydrated]);

  // Verification (Mark done) sheet — completes the task with a chosen method.
  const [verifyOpen, setVerifyOpen] = useState(false);
  // Stake ("put something on the line") setup sheet.
  const [stakeOpen, setStakeOpen] = useState(false);

  const isDone = task?.status === "done";

  const startFocus = () => {
    router.push({ pathname: "/focus/session", params: { taskId: id } });
  };

  /**
   * Arm a stake, then jump straight into the focus session carrying the stake
   * config. The session calls stakesStore.startStake(...) on mount, so every
   * wellbeing cap is enforced at the moment the lock would apply — never here.
   */
  const handleArmStake = (armed: ArmedStake) => {
    router.push({
      pathname: "/focus/session",
      params: {
        taskId: id,
        stakeHold: armed.hold,
        stakeTrigger: armed.trigger,
        stakeVerification: armed.verification,
        ...(armed.sessionMin != null ? { stakeSessionMin: String(armed.sessionMin) } : {}),
      },
    });
  };

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
    // Still hydrating from MMKV — show a loading skeleton, not "not found".
    if (!storeHydrated) {
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
              <Ionicons name="chevron-back" size={24} color={colors.light.text} />
            </PressableScale>
            <Heading size="h3" className="ml-1">
              Task
            </Heading>
          </View>
          <View className="gap-6 px-5 pb-10 pt-4" accessibilityLabel="Loading task">
            <View className="gap-5 rounded-2xl border border-neutral-200 bg-white p-5">
              <SkeletonLoader height={48} radius={8} />
              <SkeletonLoader height={96} radius={8} />
            </View>
            <View className="gap-5 rounded-2xl border border-neutral-200 bg-white p-5">
              <SkeletonLoader height={20} width="40%" radius={6} />
              <SkeletonLoader height={44} radius={10} />
              <SkeletonLoader height={44} radius={10} />
            </View>
          </View>
        </SafeAreaView>
      );
    }

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
            <Ionicons name="chevron-back" size={24} color={colors.light.text} />
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
            <Ionicons name="chevron-back" size={24} color={colors.light.text} />
          </PressableScale>
        </View>
        <Heading size="h3">Edit task</Heading>
        <View className="min-w-11" />
      </View>

      {/* Action bar — Start focus + Mark done, then a "Put something on the
          line" stake entry. Small, premium, sits above the editor. When the
          task is already done it shows a calm completed state. */}
      <View
        className="gap-2.5 border-b border-neutral-200 bg-white px-5 py-3"
        style={shadows.xs}
      >
        {isDone ? (
          <View className="flex-row items-center justify-center gap-2 rounded-md bg-success-100 py-3">
            <Ionicons name="checkmark-circle" size={18} color={colors.light.successStrong} />
            <Text className="text-label font-semibold text-success-700">Completed</Text>
          </View>
        ) : (
          <>
            <View className="flex-row items-center gap-3">
              <PressableScale
                onPress={startFocus}
                haptic="medium"
                className="flex-1 flex-row items-center justify-center gap-2 rounded-md bg-success-700 py-3"
                style={shadows.xs}
                accessibilityRole="button"
                accessibilityLabel="Start focus session"
              >
                <Ionicons name="play" size={16} color={colors.light.primaryForeground} />
                <Text className="text-label font-semibold text-white">Start focus</Text>
              </PressableScale>

              <PressableScale
                onPress={() => setVerifyOpen(true)}
                haptic="light"
                className="flex-1 flex-row items-center justify-center gap-2 rounded-md border border-neutral-200 bg-white py-3"
                style={shadows.xs}
                accessibilityRole="button"
                accessibilityLabel="Mark task done"
              >
                <Ionicons name="checkmark-done" size={16} color={colors.light.primary} />
                <Text className="text-label font-semibold text-primary-600">Mark done</Text>
              </PressableScale>
            </View>

            {/* "Put something on the line" — opens the stake setup sheet. */}
            <PressableScale
              onPress={() => setStakeOpen(true)}
              haptic="light"
              className="flex-row items-center gap-2.5 rounded-md border border-primary-200 bg-primary-50 px-3.5 py-3"
              accessibilityRole="button"
              accessibilityLabel="Put something on the line for this task"
              accessibilityHint="Attach a focus lock that lifts when your session is served"
            >
              <View className="h-7 w-7 items-center justify-center rounded-full bg-primary-100">
                <Ionicons name="lock-closed-outline" size={15} color={colors.light.primary} />
              </View>
              <View className="flex-1">
                <Text className="text-label font-semibold text-primary-700">Put something on the line</Text>
                <Text className="text-caption text-primary-600/80">Lock your apps for a focus session</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.light.primary} />
            </PressableScale>
          </>
        )}
      </View>

      <TaskEditorForm
        mode="edit"
        taskId={id}
        initialDraft={initialDraft}
        onSubmit={handleSubmit}
        onCancel={() => router.back()}
      />

      <VerificationSheet
        visible={verifyOpen}
        task={task}
        onClose={() => setVerifyOpen(false)}
        onCompleted={() => {
          setVerifyOpen(false);
          router.back();
        }}
      />

      <StakeSetupSheet
        visible={stakeOpen}
        task={task}
        onClose={() => setStakeOpen(false)}
        onArm={handleArmStake}
      />
    </SafeAreaView>
  );
}
