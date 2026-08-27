import React, { useEffect, useMemo, useState } from "react";
import { View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useShallow } from "zustand/react/shallow";
import { useTaskStore } from "@/store/taskStore";
import { useListStore, selectListById, selectAllLists } from "@/store/listStore";
import { useStakesStore } from "@/store/stakesStore";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Heading } from "@/components/ui/Heading";
import { PressableScale } from "@/components/ui/PressableScale";
import { SkeletonLoader } from "@/components/ui/SkeletonLoader";
import { TaskActionSheet } from "@/components/ui/TaskActionSheet";
import { Text } from "@/components/ui/Text";
import { TaskEditorForm } from "@/components/task-editor/TaskEditorForm";
import { VerificationSheet } from "@/components/verification/VerificationSheet";
import { StakeSetupSheet, type ArmedStake } from "@/components/stakes/StakeSetupSheet";
import { PRIORITY_LABELS } from "@/components/task-editor/PrioritySelector";
import {
  LIST_COLOR_SWATCHES,
  listColors,
  tabularNums,
  type ListColorName,
} from "@/utils/design-tokens";
import { useThemeColors } from "@/hooks/useThemeColors";
import type { Task } from "@/types";

// ---------------------------------------------------------------------------
// Local helpers (display-only, no store writes, no handler behavior).
// ---------------------------------------------------------------------------

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/**
 * The app's list/task color picker only ever writes one of
 * `LIST_COLOR_SWATCHES`'s
 * 8 fixed swatch hexes (TaskEditorForm.tsx, re-used verbatim by
 * ListEditorModal.tsx) onto `List.color`, never a `listColors` key directly.
 * This array is index-paired with that canonical swatch array — the Nth hex
 * there names the Nth tone here — so a stored hex can resolve to its
 * `listColors` tint without re-hardcoding any of the 8 hexes a second time
 * (no raw literals in the rendered style).
 */
const SWATCH_LIST_COLOR_NAMES: ListColorName[] = [
  "blue",
  "purple",
  "green",
  "orange",
  "red",
  "teal",
  "pink",
  "slate",
];

function startOfDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/**
 * "Due <day>[, <time>]" chip label. Mirrors TaskCard's own `formatDue`
 * bucketing (Today/Tomorrow/weekday/month-day, clock time omitted for a bare
 * 23:59 end-of-day stamp) so this screen reads the same as the Tasks list.
 */
function formatDueChip(due: number | undefined): string | null {
  if (due == null) return null;
  const today = startOfDay(Date.now());
  const dueDay = startOfDay(due);
  const diffDays = Math.round((dueDay - today) / DAY_MS);
  if (diffDays < 0) return "Overdue";
  const d = new Date(due);
  const isEndOfDayStamp = d.getHours() === 23 && d.getMinutes() === 59;
  const time = isEndOfDayStamp
    ? null
    : d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  const day =
    diffDays === 0
      ? "Today"
      : diffDays === 1
        ? "Tomorrow"
        : diffDays < 7
          ? WEEKDAYS[d.getDay()]
          : d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return time ? `Due ${day}, ${time}` : `Due ${day}`;
}

/** "Tomorrow" due target (23:59 local), mirroring app/(tabs)/tasks.tsx's identical helper, for the reused TaskActionSheet's "Schedule tomorrow" row. */
function tomorrowDue(now: number): number {
  const d = new Date(now);
  d.setDate(d.getDate() + 1);
  d.setHours(23, 59, 0, 0);
  return d.getTime();
}

// ---------------------------------------------------------------------------
// Local presentation components
// ---------------------------------------------------------------------------

/** 44px round sunken-bg back + overflow icon buttons, centered one-line title (D4 item 1). */
function ScreenHeader({ title, onMore }: { title: string; onMore?: () => void }) {
  // Both glyphs below set Ionicons `color`, which takes a literal and cannot
  // take a `dark:` class. `text` inverts between schemes, so pinned light the
  // back arrow would vanish on a dark header.
  const theme = useThemeColors();
  return (
    <View className="flex-row items-center justify-between px-5 pb-2 pt-3">
      <PressableScale
        onPress={() => router.back()}
        haptic="light"
        className="h-11 w-11 items-center justify-center rounded-full bg-neutral-100 dark:bg-neutral-800"
        accessibilityRole="button"
        accessibilityLabel="Back"
      >
        <Ionicons name="chevron-back" size={22} color={theme.text} />
      </PressableScale>

      <Heading size="h4" numberOfLines={1} className="flex-1 px-3 text-center">
        {title}
      </Heading>

      {onMore ? (
        <PressableScale
          onPress={onMore}
          haptic="light"
          className="h-11 w-11 items-center justify-center rounded-full bg-neutral-100 dark:bg-neutral-800"
          accessibilityRole="button"
          accessibilityLabel="More options"
        >
          <Ionicons name="ellipsis-horizontal" size={20} color={theme.text} />
        </PressableScale>
      ) : (
        // Keeps the title centered when there's nothing to show on the right.
        <View className="h-11 w-11" />
      )}
    </View>
  );
}

/** One meta pill (D4 item 2): 13px/500, tabular numerals for chips that carry a number. */
function MetaChip({
  label,
  tone = "neutral",
  tint,
  numeric = false,
}: {
  label: string;
  tone?: "neutral" | "warning" | "danger";
  /** Runtime bg/text pair (e.g. a resolved `listColors` entry), sourced from
   *  the token export, so it goes through style (NativeWind can't statically
   *  resolve an interpolated class name) rather than a hardcoded class. */
  tint?: { bg: string; text: string };
  numeric?: boolean;
}) {
  const TONE_CLASSES: Record<"neutral" | "warning" | "danger", { bg: string; text: string }> = {
    // Only the neutral chip is built from the neutral ramp, so only it
    // flips. The warning and danger chips are small pastel tint badges,
    // self-contained audited pairs (doc 02 section 14.6) that stay put rather
    // than inventing a darker tint. `Text` owns its own ink, and a bare
    // `text-*` override loses to that default's `dark:` variant, which is why
    // the neutral entry has to carry its own dark tone rather than relying on
    // the class alone.
    neutral: { bg: "bg-neutral-100 dark:bg-neutral-800", text: "text-neutral-600 dark:text-neutral-400" },
    warning: { bg: "bg-warning-100", text: "text-warning-700" },
    danger: { bg: "bg-danger-100", text: "text-danger-700" },
  };
  const c = TONE_CLASSES[tone];

  return (
    <View
      className={`rounded-full px-2.5 py-1.5 ${tint ? "" : c.bg}`}
      style={tint ? { backgroundColor: tint.bg } : undefined}
    >
      <Text
        variant="captionMedium"
        className={tint ? "" : c.text}
        style={[numeric ? tabularNums : null, tint ? { color: tint.text } : null]}
      >
        {label}
      </Text>
    </View>
  );
}

/**
 * Task editor (edit mode). Thin wrapper around the shared TaskEditorForm.
 *
 * The task is loaded live from the store. Subtask add/remove/toggle/reorder
 * write DIRECTLY to the store from inside the form (so they persist without
 * Save). Title/notes/due/priority and the other scalar fields stay gated
 * behind "Save task", which patches the store via updateTask.
 */
export default function TaskEditScreen() {
  // Ionicons `color` props only; every surface here is className-driven.
  const theme = useThemeColors();
  const { id } = useLocalSearchParams<{ id: string }>();
  const task = useTaskStore((s) => s.tasks[id]);
  const updateTask = useTaskStore((s) => s.updateTask);
  const deleteTask = useTaskStore((s) => s.deleteTask);
  const completeTaskAction = useTaskStore((s) => s.completeTask);
  const reopenTaskAction = useTaskStore((s) => s.reopenTask);

  // MMKV reads are synchronous but zustand's persist middleware still finishes
  // rehydration a tick after mount, so a deep-linked open of this screen can
  // briefly see `task === undefined` before the real data lands. Track that
  // window so we show a loading skeleton instead of a false "not found".
  const [storeHydrated, setStoreHydrated] = useState(() => useTaskStore.persist.hasHydrated());
  useEffect(() => {
    if (storeHydrated) return;
    return useTaskStore.persist.onFinishHydration(() => setStoreHydrated(true));
  }, [storeHydrated]);

  // Verification (Mark done) sheet, completes the task with a chosen method.
  const [verifyOpen, setVerifyOpen] = useState(false);
  // Stake ("put something on the line") setup sheet.
  const [stakeOpen, setStakeOpen] = useState(false);
  // Header overflow menu (reuses the same TaskActionSheet the Tasks list uses).
  const [menuOpen, setMenuOpen] = useState(false);

  const isDone = task?.status === "done";

  // --- Meta chip row data (D4 item 2), read straight off the loaded task. ---
  const list = useListStore((s) => (task?.listId ? selectListById(task.listId)(s) : undefined));
  const lists = useListStore(useShallow(selectAllLists));
  const listTint = useMemo(() => {
    if (!list) return undefined;
    const swatchIndex = LIST_COLOR_SWATCHES.findIndex(
      (hex) => hex.toUpperCase() === list.color.toUpperCase()
    );
    const name = swatchIndex >= 0 ? SWATCH_LIST_COLOR_NAMES[swatchIndex] : undefined;
    return name ? { bg: listColors[name].bg, text: listColors[name].text } : undefined;
  }, [list]);
  const dueLabel = useMemo(() => formatDueChip(task?.due), [task?.due]);
  const priorityChip = useMemo(() => {
    if (!task || task.priority == null) return null;
    if (task.priority >= 4) return { label: `${PRIORITY_LABELS[3]} priority`, tone: "danger" as const };
    if (task.priority === 3) return { label: `${PRIORITY_LABELS[2]} priority`, tone: "warning" as const };
    return null;
  }, [task]);

  // --- Stake row data (D4 item 7): a scheduled-but-not-yet-armed stake for
  // THIS task, if one exists. (An active session normally means you're in
  // /focus/session, not here, scheduled stakes are what persists at rest.)
  const scheduledStakeForTask = useStakesStore(
    useShallow((s) => Object.values(s.scheduledStakes).find((session) => session.taskId === id))
  );
  const stakeSummary = useMemo(() => {
    if (!scheduledStakeForTask) return null;
    if (scheduledStakeForTask.hold === "until_done") return "Unlocks when it's done";
    const minutes = scheduledStakeForTask.sessionMin;
    return `Unlocks when this session ends${minutes ? ` · ${minutes} min` : ""}`;
  }, [scheduledStakeForTask]);

  const startFocus = () => {
    router.push({ pathname: "/focus/session", params: { taskId: id } });
  };

  /**
   * Arm a stake, then jump straight into the focus session carrying the stake
   * config. The session calls stakesStore.startStake(...) on mount, so every
   * wellbeing cap is enforced at the moment the lock would apply, never here.
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
    // Strip the immutable BaseEntity fields, keep everything editable.
    const { id: _id, createdAt: _createdAt, updatedAt: _updatedAt, syncState: _syncState, ...editable } = task;
    return editable;
    // Seed only when the task id changes (open of a different task).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const handleSubmit = (draft: Partial<Task>) => {
    const title = (draft.title ?? "").trim();
    if (!title) return;
    // Drop fields updateTask won't accept, subtasks already persisted directly
    // but re-sending them is harmless (they match store state).
    const { id: _id, createdAt: _createdAt, ...patch } = draft as Task;
    updateTask(id, { ...patch, title });
    router.back();
  };

  if (!task || !initialDraft) {
    // Still hydrating from MMKV, show a loading skeleton, not "not found".
    if (!storeHydrated) {
      return (
        <SafeAreaView className="flex-1 bg-neutral-100 dark:bg-neutral-950" edges={["top", "bottom"]}>
          <ScreenHeader title="Task" />
          <View className="gap-6 px-5 pb-10 pt-4" accessibilityLabel="Loading task">
            <View className="gap-5 rounded-2xl border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900">
              <SkeletonLoader height={48} radius={8} />
              <SkeletonLoader height={96} radius={8} />
            </View>
            <View className="gap-5 rounded-2xl border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900">
              <SkeletonLoader height={20} width="40%" radius={6} />
              <SkeletonLoader height={44} radius={10} />
              <SkeletonLoader height={44} radius={10} />
            </View>
          </View>
        </SafeAreaView>
      );
    }

    return (
      <SafeAreaView className="flex-1 bg-neutral-100 dark:bg-neutral-950" edges={["top", "bottom"]}>
        <ScreenHeader title="Task" />
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
    <SafeAreaView className="flex-1 bg-neutral-100 dark:bg-neutral-950" edges={["top", "bottom"]}>
      <ScreenHeader title={task.title || "Untitled task"} onMore={() => setMenuOpen(true)} />

      <View className="gap-3 pb-4">
        {/* Action row: Start focus + Mark done, quiet outline (D3: no green
            fill, blue is reserved for what you're about to do/doing, D4 item
            8). Done state keeps the success-tinted "Completed" pill (D3:
            green survives only as a terminal state). The old stake banner
            that used to live here now lives in the stake row card near the
            bottom of the form (D4 item 7). */}
        {isDone ? (
          <View className="mx-5 flex-row items-center justify-center gap-2 rounded-md bg-success-100 py-3">
            <Ionicons name="checkmark-circle" size={18} color={theme.successStrong} />
            <Text variant="label" className="text-success-700">
              Completed
            </Text>
          </View>
        ) : (
          <View className="flex-row gap-3 px-5">
            <View className="flex-1">
              <Button
                title="Start focus"
                variant="secondary"
                size="md"
                onPress={startFocus}
                icon={<Ionicons name="play" size={16} color={theme.text} />}
                accessibilityLabel="Start focus session"
              />
            </View>
            <View className="flex-1">
              <Button
                title="Mark done"
                variant="secondary"
                size="md"
                onPress={() => setVerifyOpen(true)}
                icon={<Ionicons name="checkmark-done" size={16} color={theme.text} />}
                accessibilityLabel="Mark task done"
              />
            </View>
          </View>
        )}

        {/* Meta chip row (D4 item 2) */}
        <View className="flex-row flex-wrap gap-1.5 px-5">
          {list ? <MetaChip label={list.name} tint={listTint} /> : null}
          {task.durationMin > 0 ? <MetaChip label={`${task.durationMin} min`} numeric /> : null}
          {dueLabel ? <MetaChip label={dueLabel} numeric={dueLabel !== "Overdue"} /> : null}
          {priorityChip ? <MetaChip label={priorityChip.label} tone={priorityChip.tone} /> : null}
        </View>
      </View>

      <TaskEditorForm
        mode="edit"
        taskId={id}
        initialDraft={initialDraft}
        onSubmit={handleSubmit}
        onCancel={() => router.back()}
        stakeSummary={stakeSummary}
        stakeOn={scheduledStakeForTask != null}
        onOpenStake={() => setStakeOpen(true)}
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

      {/* Header overflow menu: the same TaskActionSheet the Tasks list uses,
          wired to the same existing store actions it uses there. "Edit" just
          closes the sheet since we're already on the edit screen (pushing
          /task/[id] again would stack a duplicate route). */}
      <TaskActionSheet
        visible={menuOpen}
        task={task}
        lists={lists}
        onClose={() => setMenuOpen(false)}
        onEdit={() => setMenuOpen(false)}
        onToggleComplete={() => {
          if (task.status === "done") {
            reopenTaskAction(task.id);
          } else {
            completeTaskAction(task.id);
          }
        }}
        onScheduleTomorrow={() => updateTask(task.id, { due: tomorrowDue(Date.now()) })}
        onMoveToList={(listId) => updateTask(task.id, { listId })}
        onDelete={() => {
          deleteTask(task.id);
          router.back();
        }}
        onPutOnTheLine={() => setStakeOpen(true)}
      />
    </SafeAreaView>
  );
}
