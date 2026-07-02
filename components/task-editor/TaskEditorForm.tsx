import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  Switch,
  ScrollView,
  Modal,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Animated, { FadeIn, FadeInDown } from "react-native-reanimated";
import { Button } from "@/components/ui/Button";
import { Heading } from "@/components/ui/Heading";
import { StarterActionCard } from "@/components/ui/StarterActionCard";
import { SkeletonLoader } from "@/components/ui/SkeletonLoader";
import { PressableScale } from "@/components/ui/PressableScale";
import { DateTimePickerCrossPlatform } from "@/components/ui/DateTimePickerCrossPlatform";
import { shadows } from "@/utils/design-tokens";
import { DURATIONS } from "@/utils/motion";
import { useReduceMotion } from "@/hooks/useReduceMotion";
import { newId } from "@/core/id";
import * as taskLogic from "@/core/task-logic";
import {
  breakdownTask,
  refineBreakdown,
  simplifySubtask,
  type BreakdownResult,
} from "@/services/ai";
import { useTaskStore } from "@/store/taskStore";
import { useListStore, selectListById } from "@/store/listStore";
import type { EnergyLevel, Subtask, Task } from "@/types";

import { Stepper, formatMinutes } from "@/components/settings/SettingsPrimitives";
import { PrioritySelector } from "./PrioritySelector";
import { ListTagPicker } from "./ListTagPicker";
import { SubtaskChecklist } from "./SubtaskChecklist";
import { MoreOptionsSection } from "./MoreOptionsSection";
import { DependsOnPicker } from "./DependsOnPicker";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TaskEditorMode = "create" | "edit";

export interface TaskEditorFormProps {
  mode: TaskEditorMode;
  /** Seed values for the draft. In edit mode, seeded from the stored task. */
  initialDraft: Partial<Task>;
  /** The stored task's id — required in edit mode for direct subtask writes. */
  taskId?: string;
  /**
   * Called when the user taps "Save task". Receives the current draft
   * (Partial<Task>). The route wrapper turns this into createTask / updateTask.
   * Subtasks in edit mode are already persisted directly (this draft still
   * carries them for consistency).
   */
  onSubmit: (draft: Partial<Task>) => void;
  /** Called when the user cancels (X in the header handles this too). */
  onCancel?: () => void;
}

// ---------------------------------------------------------------------------
// Draft → Task view (so pure taskLogic fns run in create mode)
// ---------------------------------------------------------------------------

/**
 * Fills the required Task fields with harmless defaults so pure `taskLogic`
 * functions (which take a full Task) can operate on an in-progress draft.
 */
export function asTaskView(draft: Partial<Task>): Task {
  return {
    id: "draft",
    createdAt: 0,
    updatedAt: 0,
    syncState: "pending",
    title: draft.title ?? "",
    durationMin: draft.durationMin ?? 0,
    progressMin: draft.progressMin ?? 0,
    autoSchedule: draft.autoSchedule ?? true,
    tags: draft.tags ?? [],
    subtasks: draft.subtasks ?? [],
    status: draft.status ?? "todo",
    ...draft,
  };
}

const ENERGY_OPTIONS: { value: EnergyLevel; label: string }[] = [
  { value: "low", label: "Low" },
  { value: "normal", label: "Normal" },
  { value: "high", label: "High" },
];

const COLOR_SWATCHES = [
  "#2563EB",
  "#7C3AED",
  "#16A34A",
  "#EA580C",
  "#DC2626",
  "#0891B2",
  "#DB2777",
  "#52525B",
];

// ---------------------------------------------------------------------------
// Presentation primitives (form-local)
// ---------------------------------------------------------------------------

/** A labelled form field. Label is text-label neutral-600 with tight rhythm. */
function Field({
  label,
  helper,
  children,
}: {
  label: string;
  helper?: string;
  children: React.ReactNode;
}) {
  return (
    <View>
      <Text className="mb-1.5 text-label font-medium text-neutral-600">
        {label}
      </Text>
      {helper ? (
        <Text className="mb-2 text-caption text-neutral-500">{helper}</Text>
      ) : null}
      {children}
    </View>
  );
}

/**
 * A grouped white section with header, soft shadow + border. Groups related
 * fields so the form reads as calm blocks rather than one long stream.
 */
function Section({
  title,
  index = 0,
  children,
}: {
  title?: string;
  index?: number;
  children: React.ReactNode;
}) {
  const reduceMotion = useReduceMotion();
  return (
    <Animated.View
      entering={
        reduceMotion
          ? undefined
          : FadeInDown.delay(index * 45).duration(DURATIONS.base)
      }
    >
      {title ? (
        <Text className="mb-2 ml-1 text-overline font-semibold uppercase tracking-wide text-neutral-500">
          {title}
        </Text>
      ) : null}
      <View
        className="gap-5 rounded-2xl border border-neutral-200 bg-white p-5"
        style={shadows.sm}
      >
        {children}
      </View>
    </Animated.View>
  );
}

/** Hairline divider used to separate fields inside a Section. */
function Divider() {
  return <View className="h-px bg-neutral-100" />;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function TaskEditorForm({
  mode,
  initialDraft,
  taskId,
  onSubmit,
}: TaskEditorFormProps) {
  const isEdit = mode === "edit";
  const reduceMotion = useReduceMotion();

  const [draft, setDraft] = useState<Partial<Task>>(initialDraft);

  // Track focus so inputs can lift their border to primary-500 while active.
  const [focusedField, setFocusedField] = useState<string | null>(null);

  // In edit mode subtasks live in the store (they persist without Save). Read
  // them live so toggles/adds reflect immediately. In create mode they live on
  // the draft.
  const storeSubtasks = useTaskStore((s) =>
    taskId ? s.tasks[taskId]?.subtasks : undefined
  );
  const storeProgressMin = useTaskStore((s) =>
    taskId ? s.tasks[taskId]?.progressMin : undefined
  );
  const subtasks: Subtask[] = isEdit
    ? storeSubtasks ?? []
    : draft.subtasks ?? [];
  // Live task-level progress. In edit mode read it from the store so it never
  // goes stale after a subtask toggle (which writes straight to the store, not
  // the draft); create mode has no recorded progress yet.
  const liveProgressMin = isEdit ? storeProgressMin ?? 0 : draft.progressMin ?? 0;

  // Direct store actions (edit-mode subtask writes persist immediately).
  const storeAddSubtask = useTaskStore((s) => s.addSubtask);
  const storeRemoveSubtask = useTaskStore((s) => s.removeSubtask);
  const storeReorderSubtasks = useTaskStore((s) => s.reorderSubtasks);
  const storeSetSubtaskCompleted = useTaskStore((s) => s.setSubtaskCompleted);
  const storeUpdateTask = useTaskStore((s) => s.updateTask);

  // Selected list color (for the "Smart" color fallback).
  const selectedList = useListStore((s) =>
    draft.listId ? selectListById(draft.listId)(s) : undefined
  );

  const patch = (p: Partial<Task>) => setDraft((d) => ({ ...d, ...p }));

  /** Border class for an input, primary-500 while focused. */
  const inputBorder = (name: string) =>
    focusedField === name ? "border-primary-500" : "border-neutral-200";

  // --- Duration rollup ----------------------------------------------------
  const hasSubtasks = subtasks.length > 0;
  const rollupDuration = useMemo(
    () => taskLogic.sumEstimatedMin(subtasks),
    [subtasks]
  );

  // --- First move ---------------------------------------------------------
  const [firstMoveText, setFirstMoveText] = useState(
    initialDraft.firstMove?.text ?? ""
  );
  const commitFirstMove = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) {
      patch({ firstMove: undefined });
      return;
    }
    patch({
      firstMove: {
        id: draft.firstMove?.id ?? newId(),
        text: trimmed,
        done: draft.firstMove?.done ?? false,
      },
    });
  };

  // --- Subtask handlers (mode-branched) -----------------------------------
  const addSubtask = (title: string, estimatedMin: number) => {
    if (isEdit && taskId) {
      storeAddSubtask(taskId, { title, estimatedMin });
      return;
    }
    const next = taskLogic.addSubtask(
      asTaskView(draft),
      { id: newId(), title, estimatedMin },
      Date.now()
    );
    patch({
      subtasks: next.subtasks,
      durationMin: next.durationMin,
      progressMin: next.progressMin,
    });
  };

  const toggleSubtask = (subtaskId: string) => {
    const current = subtasks.find((s) => s.id === subtaskId);
    const nextCompleted = !(current && taskLogic.isSubtaskDone(current));
    if (isEdit && taskId) {
      storeSetSubtaskCompleted(taskId, subtaskId, nextCompleted);
      return;
    }
    const next = taskLogic.setSubtaskCompleted(
      asTaskView(draft),
      subtaskId,
      nextCompleted,
      Date.now()
    );
    patch({
      subtasks: next.subtasks,
      durationMin: next.durationMin,
      progressMin: next.progressMin,
      status: next.status,
      completedAt: next.completedAt,
    });
  };

  const deleteSubtask = (subtaskId: string) => {
    if (isEdit && taskId) {
      storeRemoveSubtask(taskId, subtaskId);
      return;
    }
    const next = taskLogic.removeSubtask(asTaskView(draft), subtaskId, Date.now());
    patch({
      subtasks: next.subtasks,
      durationMin: next.durationMin,
      progressMin: next.progressMin,
    });
  };

  const editSubtaskTitle = (subtaskId: string, title: string) => {
    const nextSubtasks = subtasks.map((s) =>
      s.id === subtaskId ? { ...s, title } : s
    );
    if (isEdit && taskId) {
      storeUpdateTask(taskId, { subtasks: nextSubtasks });
      return;
    }
    patch({ subtasks: nextSubtasks });
  };

  const reorderSubtask = (fromIndex: number, toIndex: number) => {
    if (toIndex < 0 || toIndex >= subtasks.length) return;
    if (isEdit && taskId) {
      storeReorderSubtasks(taskId, fromIndex, toIndex);
      return;
    }
    const next = taskLogic.reorderSubtasks(
      asTaskView(draft),
      fromIndex,
      toIndex,
      Date.now()
    );
    patch({ subtasks: next.subtasks });
  };

  // --- AI breakdown / simplify / refine -----------------------------------
  // These build on the SAME subtask helpers above so the manual flow is never
  // bypassed. Everything degrades gracefully with no API key: services/ai
  // always resolves (local fallback), and we surface a warm "offline
  // suggestion" note when `isFallback` is set. Nothing here can crash the form.
  const [breakingDown, setBreakingDown] = useState(false);
  const [refining, setRefining] = useState(false);
  const [showRefine, setShowRefine] = useState(false);
  const [refineText, setRefineText] = useState("");
  const [simplifyingId, setSimplifyingId] = useState<string | null>(null);
  const [aiNote, setAiNote] = useState<string | null>(null);
  // The last AI breakdown, kept so "Refine" can iterate on it (doc 07 §1.7).
  const [lastBreakdown, setLastBreakdown] = useState<BreakdownResult | null>(null);

  /** Replace the current first-move + subtasks with an AI breakdown result. */
  const applyBreakdown = (result: BreakdownResult) => {
    const now = Date.now();
    const firstMove = {
      id: draft.firstMove?.id ?? newId(),
      text: result.firstMove,
      done: false,
    };
    const nextSubtasks: Subtask[] = result.subtasks.map((s) => ({
      id: newId(),
      title: s.title,
      estimatedMin: s.estimatedMin,
    }));

    if (isEdit && taskId) {
      // Persist directly (edit-mode subtasks live in the store), and mirror the
      // first move onto the local draft so the StarterActionCard preview and
      // the eventual Save both reflect it.
      storeUpdateTask(taskId, {
        firstMove,
        subtasks: nextSubtasks,
        durationMin: taskLogic.sumEstimatedMin(nextSubtasks),
        progressMin: 0,
      });
      patch({ firstMove });
    } else {
      const view = taskLogic.withSyncedRollups({
        ...asTaskView(draft),
        subtasks: nextSubtasks,
        updatedAt: now,
      });
      patch({
        firstMove,
        subtasks: view.subtasks,
        durationMin: view.durationMin,
        progressMin: view.progressMin,
      });
    }
    setFirstMoveText(result.firstMove);
    setLastBreakdown(result);
    setAiNote(result.isFallback ? result.note ?? "Showing general steps — tap Refine to shape them." : null);
  };

  /** Does the current step list have any real progress worth protecting? */
  const hasSubtaskProgress =
    subtasks.some((s) => taskLogic.isSubtaskDone(s)) || liveProgressMin > 0;
  // Confirm dialog for regenerating steps when progress would be lost
  // (AIB-29 audit gap). Shown only when there is something to protect.
  const [confirmRebreakdown, setConfirmRebreakdown] = useState(false);

  const runBreakDown = async () => {
    const title = (draft.title ?? "").trim();
    if (!title || breakingDown) return;
    setBreakingDown(true);
    setAiNote(null);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    try {
      const result = await breakdownTask({
        title,
        notes: draft.notes,
        durationMin: draft.durationMin,
        due: draft.due,
        energyRequired: draft.energyRequired,
      });
      applyBreakdown(result);
    } catch {
      // breakdownTask never throws, but stay defensive.
      setAiNote("Couldn't build steps right now — add them manually below.");
    } finally {
      setBreakingDown(false);
    }
  };

  /** Entry point for the "Break it down" / "Re-generate steps" button. Confirms
   * before replacing steps that already carry progress (AIB-29 audit gap). */
  const handleBreakDown = () => {
    if (breakingDown) return;
    if (subtasks.length > 0 && hasSubtaskProgress) {
      setConfirmRebreakdown(true);
      return;
    }
    runBreakDown();
  };

  const handleConfirmReplace = () => {
    setConfirmRebreakdown(false);
    runBreakDown();
  };

  const handleRefine = async () => {
    const instruction = refineText.trim();
    if (!instruction || refining) return;
    // Refine needs a prior breakdown; synthesize one from the current draft if
    // the user hand-built steps and never ran "Break it down".
    const prev: BreakdownResult =
      lastBreakdown ?? {
        firstMove: draft.firstMove?.text ?? firstMoveText.trim(),
        subtasks: subtasks.map((s) => ({ title: s.title, estimatedMin: s.estimatedMin })),
        isFallback: false,
      };
    setRefining(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    try {
      const result = await refineBreakdown(prev, instruction);
      applyBreakdown(result);
      setRefineText("");
      setShowRefine(false);
    } catch {
      setAiNote("Couldn't refine right now — your steps are unchanged.");
    } finally {
      setRefining(false);
    }
  };

  const handleSimplifySubtask = async (subtaskId: string) => {
    if (simplifyingId) return;
    const current = subtasks.find((s) => s.id === subtaskId);
    if (!current) return;
    setSimplifyingId(subtaskId);
    Haptics.selectionAsync().catch(() => {});
    try {
      const { simplified } = await simplifySubtask(current.title);
      if (simplified && simplified !== current.title) {
        editSubtaskTitle(subtaskId, simplified);
      }
    } catch {
      // simplifySubtask never throws; leave the title as-is on any failure.
    } finally {
      setSimplifyingId(null);
    }
  };

  const canBreakDown = (draft.title ?? "").trim().length > 0;
  const hasBreakdownContent = subtasks.length > 0 || !!draft.firstMove;

  // --- Due date -----------------------------------------------------------
  const dueDate = draft.due ? new Date(draft.due) : undefined;
  const [showDuePicker, setShowDuePicker] = useState(false);

  // --- Save ---------------------------------------------------------------
  const titleValid = (draft.title ?? "").trim().length > 0;
  const handleSave = () => {
    if (!titleValid) return;
    // Ensure title is trimmed on the way out.
    onSubmit({ ...draft, title: (draft.title ?? "").trim() });
  };

  // --- Effective color chip preview --------------------------------------
  const effectiveColor = draft.color ?? selectedList?.color;

  return (
    <View className="flex-1">
      <ScrollView
        className="flex-1"
        contentContainerClassName="px-5 pb-10 pt-4 gap-6"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* --- The essentials ------------------------------------------- */}
        <Section index={0}>
          {/* Title */}
          <Field label="Title">
            <TextInput
              className={`min-h-12 rounded-md border ${inputBorder(
                "title"
              )} bg-white px-4 text-body-lg text-neutral-900`}
              placeholder="What needs doing?"
              placeholderTextColor="#A1A1AA"
              value={draft.title ?? ""}
              onChangeText={(title) => patch({ title })}
              onFocus={() => setFocusedField("title")}
              onBlur={() => setFocusedField(null)}
              autoFocus={!isEdit}
              returnKeyType="next"
              accessibilityLabel="Task title"
            />
          </Field>

          <Divider />

          {/* Notes */}
          <Field label="Notes">
            <TextInput
              className={`min-h-24 rounded-md border ${inputBorder(
                "notes"
              )} bg-white px-4 py-3 text-body-lg text-neutral-900`}
              placeholder="Add details (optional)"
              placeholderTextColor="#A1A1AA"
              value={draft.notes ?? ""}
              onChangeText={(notes) => patch({ notes })}
              onFocus={() => setFocusedField("notes")}
              onBlur={() => setFocusedField(null)}
              multiline
              textAlignVertical="top"
              accessibilityLabel="Notes"
            />
          </Field>
        </Section>

        {/* --- Organize ------------------------------------------------- */}
        <Section title="Organize" index={1}>
          {/* List */}
          <Field label="List">
            <ListTagPicker
              mode="single"
              value={draft.listId}
              onChange={(listId) => patch({ listId })}
            />
          </Field>

          <Divider />

          {/* Tags */}
          <Field label="Tags">
            <ListTagPicker
              mode="multi"
              value={draft.tags ?? []}
              onChange={(tags) => patch({ tags })}
            />
          </Field>

          <Divider />

          {/* Priority */}
          <Field label="Priority">
            <PrioritySelector
              value={draft.priority ?? 2}
              onChange={(priority) => patch({ priority })}
            />
          </Field>
        </Section>

        {/* --- First move (focal) --------------------------------------- */}
        <Section title="First move" index={2}>
          {/* AI: Break it down — fills First move + Steps in one tap. Degrades
              gracefully with no key (local fallback), never blocks the manual
              flow below. */}
          <View className="gap-3">
            <PressableScale
              onPress={handleBreakDown}
              haptic={canBreakDown ? "light" : false}
              disabled={!canBreakDown || breakingDown}
              className={`min-h-12 flex-row items-center justify-center gap-2 rounded-md ${
                canBreakDown && !breakingDown
                  ? "bg-primary-600"
                  : "bg-primary-600/50"
              }`}
              style={shadows.xs}
              accessibilityRole="button"
              accessibilityLabel="Break it down with AI"
              accessibilityState={{ disabled: !canBreakDown || breakingDown, busy: breakingDown }}
            >
              <Ionicons name="sparkles" size={16} color="#FFFFFF" />
              <Text className="text-label font-semibold text-white">
                {breakingDown
                  ? "Breaking it down…"
                  : hasBreakdownContent
                    ? "Re-generate steps"
                    : "Break it down"}
              </Text>
            </PressableScale>

            {!canBreakDown ? (
              <Text className="text-caption text-neutral-500">
                Add a title first, then let AI suggest a first move and steps.
              </Text>
            ) : null}

            {breakingDown ? (
              <View className="gap-2" accessibilityLabel="Generating steps">
                <SkeletonLoader height={44} radius={12} />
                <SkeletonLoader height={44} radius={12} />
                <SkeletonLoader height={44} radius={12} width="80%" />
              </View>
            ) : null}

            {aiNote ? (
              <Animated.View
                entering={reduceMotion ? undefined : FadeIn.duration(DURATIONS.fast)}
                className="flex-row items-start gap-2 rounded-lg border border-warning-100 bg-warning-100/50 p-3"
              >
                <Ionicons name="cloud-offline-outline" size={16} color="#C2410C" />
                <Text className="flex-1 text-caption text-warning-700">{aiNote}</Text>
              </Animated.View>
            ) : null}
          </View>

          <Divider />

          <Field helper="One tiny 2-5 minute starter to beat activation energy" label="What is the smallest first step?">
            <TextInput
              className={`min-h-12 rounded-md border ${inputBorder(
                "firstMove"
              )} bg-white px-4 text-body-lg text-neutral-900`}
              placeholder="e.g. Open the doc and write one line"
              placeholderTextColor="#A1A1AA"
              value={firstMoveText}
              onChangeText={setFirstMoveText}
              onFocus={() => setFocusedField("firstMove")}
              onBlur={() => {
                setFocusedField(null);
                commitFirstMove(firstMoveText);
              }}
              returnKeyType="done"
              onSubmitEditing={() => commitFirstMove(firstMoveText)}
              accessibilityLabel="First move"
            />
          </Field>
          {draft.firstMove ? (
            <StarterActionCard action={draft.firstMove} />
          ) : null}
        </Section>

        {/* --- Steps ---------------------------------------------------- */}
        <Section title="Steps" index={3}>
          <SubtaskChecklist
            subtasks={subtasks}
            onAdd={addSubtask}
            onToggle={toggleSubtask}
            onDelete={deleteSubtask}
            onEditTitle={editSubtaskTitle}
            onReorder={reorderSubtask}
          />

          {/* AI: Make easier — per-subtask simplify. Rendered here (not inside
              SubtaskChecklist, which this workstream doesn't own) as a compact
              list of "Make easier" affordances. Graceful: simplifySubtask has a
              local fallback and never throws. */}
          {subtasks.length > 0 ? (
            <View className="gap-2">
              <Text className="text-caption font-medium text-neutral-500">
                Too big? Make a step easier
              </Text>
              <View className="flex-row flex-wrap gap-2">
                {subtasks
                  .filter((s) => !taskLogic.isSubtaskDone(s))
                  .map((s) => {
                    const loading = simplifyingId === s.id;
                    return (
                      <PressableScale
                        key={s.id}
                        onPress={() => handleSimplifySubtask(s.id)}
                        haptic={loading ? false : "selection"}
                        disabled={loading || simplifyingId != null}
                        className={`max-w-full flex-row items-center gap-1.5 rounded-full border px-3 py-2 ${
                          loading
                            ? "border-primary-200 bg-primary-50"
                            : "border-neutral-200 bg-white"
                        }`}
                        style={shadows.xs}
                        accessibilityRole="button"
                        accessibilityLabel={`Make easier: ${s.title}`}
                        accessibilityState={{ busy: loading, disabled: simplifyingId != null }}
                      >
                        <Ionicons
                          name={loading ? "hourglass-outline" : "cut-outline"}
                          size={13}
                          color="#2563EB"
                        />
                        <Text
                          className="max-w-[180px] text-caption font-medium text-neutral-700"
                          numberOfLines={1}
                        >
                          {loading ? "Simplifying…" : s.title}
                        </Text>
                      </PressableScale>
                    );
                  })}
              </View>
            </View>
          ) : null}

          {/* AI: Refine — reshape the breakdown from a natural instruction. */}
          {hasBreakdownContent ? (
            <View className="gap-2">
              {showRefine ? (
                <Animated.View
                  entering={reduceMotion ? undefined : FadeIn.duration(DURATIONS.fast)}
                  className="gap-2"
                >
                  <TextInput
                    className="min-h-12 rounded-md border border-primary-500 bg-white px-4 text-body-lg text-neutral-900"
                    placeholder='e.g. "break it down by function" or "step 2 is too big"'
                    placeholderTextColor="#A1A1AA"
                    value={refineText}
                    onChangeText={setRefineText}
                    returnKeyType="done"
                    onSubmitEditing={handleRefine}
                    autoFocus
                    accessibilityLabel="Refine instruction"
                  />
                  <View className="flex-row gap-2">
                    <View className="flex-1">
                      <Button
                        title={refining ? "Refining…" : "Refine steps"}
                        variant="primaryBlue"
                        size="md"
                        onPress={handleRefine}
                        loading={refining}
                        disabled={refineText.trim().length === 0 || refining}
                      />
                    </View>
                    <Button
                      title="Cancel"
                      variant="secondary"
                      size="md"
                      onPress={() => {
                        setShowRefine(false);
                        setRefineText("");
                      }}
                      disabled={refining}
                    />
                  </View>
                </Animated.View>
              ) : (
                <PressableScale
                  onPress={() => setShowRefine(true)}
                  haptic="light"
                  className="flex-row items-center justify-center gap-2 rounded-md border border-neutral-200 bg-white py-3"
                  style={shadows.xs}
                  accessibilityRole="button"
                  accessibilityLabel="Refine the steps with an instruction"
                >
                  <Ionicons name="color-wand-outline" size={16} color="#2563EB" />
                  <Text className="text-label font-medium text-primary-600">
                    Refine with an instruction
                  </Text>
                </PressableScale>
              )}
            </View>
          ) : null}
        </Section>

        {/* --- Scheduling ----------------------------------------------- */}
        <Section title="Scheduling" index={4}>
          {/* Auto-schedule */}
          <View className="flex-row items-center justify-between">
            <View className="flex-1 pr-4">
              <Text className="text-label font-medium text-neutral-800">
                Auto-schedule
              </Text>
              <Text className="mt-0.5 text-caption text-neutral-500">
                Let Ampora find time for this task.
              </Text>
            </View>
            <Switch
              value={draft.autoSchedule ?? true}
              onValueChange={(autoSchedule) => patch({ autoSchedule })}
              trackColor={{ true: "#2563EB", false: "#D4D4D8" }}
              accessibilityLabel="Auto-schedule"
            />
          </View>

          <Divider />

          {/* Duration */}
          <Field
            label="Duration"
            helper={hasSubtasks ? undefined : "Estimated time in minutes"}
          >
            {hasSubtasks ? (
              <View className="min-h-12 flex-row items-center justify-between rounded-md border border-neutral-200 bg-neutral-50 px-4">
                <Text className="text-body-lg text-neutral-900">
                  {rollupDuration}m
                </Text>
                <Text className="text-caption text-neutral-500">from steps</Text>
              </View>
            ) : (
              <TextInput
                className={`min-h-12 rounded-md border ${inputBorder(
                  "duration"
                )} bg-white px-4 text-body-lg text-neutral-900`}
                placeholder="e.g. 30"
                placeholderTextColor="#A1A1AA"
                value={
                  draft.durationMin != null && draft.durationMin > 0
                    ? String(draft.durationMin)
                    : ""
                }
                onChangeText={(text) => {
                  const parsed = parseInt(text, 10);
                  patch({ durationMin: Number.isFinite(parsed) ? parsed : 0 });
                }}
                onFocus={() => setFocusedField("duration")}
                onBlur={() => setFocusedField(null)}
                keyboardType="number-pad"
                accessibilityLabel="Duration in minutes"
              />
            )}
          </Field>

          <Divider />

          {/* Due */}
          <Field
            label="Due (the real deadline)"
            helper="When it must be done by, not when you will do it"
          >
            {showDuePicker || dueDate ? (
              <View className="gap-2">
                <DateTimePickerCrossPlatform
                  mode="date"
                  value={dueDate ?? new Date()}
                  onChange={(d) => patch({ due: d.getTime() })}
                  accessibilityLabel="Due date"
                />
                <Pressable
                  onPress={() => {
                    patch({ due: undefined });
                    setShowDuePicker(false);
                  }}
                  className="self-start"
                  accessibilityRole="button"
                  accessibilityLabel="Clear due date"
                >
                  <Text className="text-label font-medium text-primary-600">
                    Clear deadline
                  </Text>
                </Pressable>
              </View>
            ) : (
              <Pressable
                onPress={() => setShowDuePicker(true)}
                className="min-h-12 flex-row items-center rounded-md border border-neutral-200 bg-white px-4"
                accessibilityRole="button"
                accessibilityLabel="Set a due date"
              >
                <Ionicons name="calendar-outline" size={18} color="#71717A" />
                <Text className="ml-2 text-body-lg text-neutral-400">
                  Set a deadline
                </Text>
              </Pressable>
            )}
          </Field>
        </Section>

        {/* --- More options (disclosure) -------------------------------- */}
        <MoreOptionsSection>
          {/* Start after */}
          <Field
            label="Start after"
            helper="Don't schedule this before a certain date"
          >
            {draft.startAfter ? (
              <View className="gap-2">
                <DateTimePickerCrossPlatform
                  mode="date"
                  value={new Date(draft.startAfter)}
                  onChange={(d) => patch({ startAfter: d.getTime() })}
                  accessibilityLabel="Start after date"
                />
                <Pressable
                  onPress={() => patch({ startAfter: undefined })}
                  className="self-start"
                  accessibilityRole="button"
                  accessibilityLabel="Clear start-after date"
                >
                  <Text className="text-label font-medium text-primary-600">
                    Clear
                  </Text>
                </Pressable>
              </View>
            ) : (
              <Pressable
                onPress={() => patch({ startAfter: Date.now() })}
                className="min-h-12 flex-row items-center rounded-md border border-neutral-200 bg-white px-4"
                accessibilityRole="button"
                accessibilityLabel="Set a start-after date"
              >
                <Ionicons name="time-outline" size={18} color="#71717A" />
                <Text className="ml-2 text-body-lg text-neutral-400">
                  Set a start date
                </Text>
              </Pressable>
            )}
          </Field>

          {/* Split */}
          <View className="flex-row items-center justify-between">
            <View className="flex-1 pr-4">
              <Text className="text-label font-medium text-neutral-800">
                Split into sessions
              </Text>
              <Text className="mt-0.5 text-caption text-neutral-500">
                Allow this task to be broken across multiple blocks.
              </Text>
            </View>
            <Switch
              value={draft.splittable ?? false}
              onValueChange={(splittable) => patch({ splittable })}
              trackColor={{ true: "#2563EB", false: "#D4D4D8" }}
              accessibilityLabel="Split into sessions"
            />
          </View>

          {/* Min / Max block — only when splittable */}
          {draft.splittable ? (
            <View className="flex-row gap-3">
              <View className="flex-1">
                <Field label="Min block (min)">
                  <TextInput
                    className="min-h-12 rounded-md border border-neutral-200 bg-white px-4 text-body-lg text-neutral-900"
                    placeholder="e.g. 30"
                    placeholderTextColor="#A1A1AA"
                    value={draft.minBlockMin != null ? String(draft.minBlockMin) : ""}
                    onChangeText={(text) => {
                      const parsed = parseInt(text, 10);
                      patch({ minBlockMin: Number.isFinite(parsed) ? parsed : undefined });
                    }}
                    keyboardType="number-pad"
                    accessibilityLabel="Minimum block minutes"
                  />
                </Field>
              </View>
              <View className="flex-1">
                <Field label="Max block (min)">
                  <TextInput
                    className="min-h-12 rounded-md border border-neutral-200 bg-white px-4 text-body-lg text-neutral-900"
                    placeholder="e.g. 90"
                    placeholderTextColor="#A1A1AA"
                    value={draft.maxBlockMin != null ? String(draft.maxBlockMin) : ""}
                    onChangeText={(text) => {
                      const parsed = parseInt(text, 10);
                      patch({ maxBlockMin: Number.isFinite(parsed) ? parsed : undefined });
                    }}
                    keyboardType="number-pad"
                    accessibilityLabel="Maximum block minutes"
                  />
                </Field>
              </View>
            </View>
          ) : null}

          {/* Buffers — quiet time held around each block (PRD §9.5.4). Stepper
              rows (0-60 in 5-min steps) so the value is always valid and easy
              to nudge, matching the Scheduling settings pattern. */}
          <View className="gap-3">
            <View className="flex-row items-center justify-between">
              <View className="flex-1 pr-3">
                <Text className="text-label font-medium text-neutral-800">
                  Buffer before
                </Text>
                <Text className="mt-0.5 text-caption text-neutral-500">
                  Quiet time held before each block
                </Text>
              </View>
              <Stepper
                value={draft.bufferBeforeMin ?? 0}
                min={0}
                max={60}
                step={5}
                onChange={(v) => patch({ bufferBeforeMin: v === 0 ? undefined : v })}
                format={formatMinutes}
                a11yLabel="buffer before"
              />
            </View>
            <Divider />
            <View className="flex-row items-center justify-between">
              <View className="flex-1 pr-3">
                <Text className="text-label font-medium text-neutral-800">
                  Buffer after
                </Text>
                <Text className="mt-0.5 text-caption text-neutral-500">
                  Quiet time held after each block
                </Text>
              </View>
              <Stepper
                value={draft.bufferAfterMin ?? 0}
                min={0}
                max={60}
                step={5}
                onChange={(v) => patch({ bufferAfterMin: v === 0 ? undefined : v })}
                format={formatMinutes}
                a11yLabel="buffer after"
              />
            </View>
          </View>

          {/* Depends on */}
          <Field
            label="Depends on"
            helper="Tasks that must be scheduled before this one"
          >
            <DependsOnPicker
              value={draft.dependsOn ?? []}
              onChange={(dependsOn) => patch({ dependsOn })}
              selfId={taskId}
            />
          </Field>

          {/* Energy needed */}
          <Field label="Energy needed">
            <View className="flex-row gap-2">
              {ENERGY_OPTIONS.map((opt) => {
                const active = draft.energyRequired === opt.value;
                return (
                  <Pressable
                    key={opt.value}
                    onPress={() =>
                      patch({
                        energyRequired: active ? undefined : opt.value,
                      })
                    }
                    className={
                      active
                        ? "flex-1 items-center rounded-md border border-accent-500 bg-accent-100 py-2.5"
                        : "flex-1 items-center rounded-md border border-neutral-200 bg-white py-2.5"
                    }
                    accessibilityRole="radio"
                    accessibilityState={{ selected: active }}
                    accessibilityLabel={`Energy ${opt.label}`}
                  >
                    <Text
                      className={
                        active
                          ? "text-label font-semibold text-accent-700"
                          : "text-label font-medium text-neutral-500"
                      }
                    >
                      {opt.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </Field>

          {/* Color */}
          <Field
            label="Color"
            helper="Defaults to your list color (Smart)"
          >
            <View className="flex-row flex-wrap items-center gap-3">
              {/* Smart (unset) chip */}
              <Pressable
                onPress={() => patch({ color: undefined })}
                className={`flex-row items-center rounded-full border px-3 py-1.5 ${
                  draft.color == null
                    ? "border-primary-300 bg-primary-100"
                    : "border-neutral-200 bg-white"
                }`}
                accessibilityRole="button"
                accessibilityLabel="Smart color, follows list"
                accessibilityState={{ selected: draft.color == null }}
              >
                {effectiveColor ? (
                  <View
                    className="mr-1.5 h-3 w-3 rounded-full"
                    style={{ backgroundColor: effectiveColor }}
                  />
                ) : (
                  <Ionicons name="sparkles-outline" size={13} color="#2563EB" />
                )}
                <Text
                  className={`text-caption ${
                    draft.color == null ? "text-primary-700" : "text-neutral-600"
                  }`}
                >
                  Smart
                </Text>
              </Pressable>

              {COLOR_SWATCHES.map((color) => {
                const selected = draft.color === color;
                return (
                  <Pressable
                    key={color}
                    onPress={() => patch({ color })}
                    className={`h-9 w-9 items-center justify-center rounded-full ${
                      selected ? "border-2 border-neutral-900" : ""
                    }`}
                    style={{ backgroundColor: color }}
                    accessibilityRole="button"
                    accessibilityLabel={`Color ${color}`}
                    accessibilityState={{ selected }}
                  >
                    {selected ? (
                      <Ionicons name="checkmark" size={16} color="#FFFFFF" />
                    ) : null}
                  </Pressable>
                );
              })}
            </View>
          </Field>
        </MoreOptionsSection>
      </ScrollView>

      {/* Sticky Save bar — single primary action, disabled when title empty */}
      <View
        className="border-t border-neutral-200 bg-white px-5 pb-2 pt-3"
        style={shadows.md}
      >
        <Button
          title="Save task"
          variant="primaryBlue"
          size="lg"
          onPress={handleSave}
          disabled={!titleValid}
        />
      </View>

      {/* Re-breakdown confirm (AIB-29): protects progress already made on the
          current steps before an AI regenerate would replace them. */}
      <Modal
        visible={confirmRebreakdown}
        transparent
        animationType="fade"
        onRequestClose={() => setConfirmRebreakdown(false)}
      >
        <Pressable
          className="flex-1 items-center justify-center bg-black/40 px-6"
          onPress={() => setConfirmRebreakdown(false)}
          accessibilityRole="button"
          accessibilityLabel="Dismiss"
        >
          <Pressable
            className="w-full rounded-2xl bg-white p-6"
            style={shadows.lg}
            onPress={(e) => e.stopPropagation()}
          >
            <Heading size="h3">Replace your steps?</Heading>
            <Text className="mt-2 text-body text-neutral-600">
              You have progress on these steps. Regenerating will replace the list — completed steps
              won&apos;t carry over unless you keep them.
            </Text>
            <View className="mt-6 flex-row gap-3">
              <View className="flex-1">
                <Button
                  title="Keep my steps"
                  variant="secondary"
                  onPress={() => setConfirmRebreakdown(false)}
                />
              </View>
              <View className="flex-1">
                <Button
                  title="Replace"
                  variant="destructive"
                  onPress={handleConfirmReplace}
                />
              </View>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}
