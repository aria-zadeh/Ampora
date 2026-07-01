import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  Switch,
  ScrollView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Animated, { FadeInDown } from "react-native-reanimated";
import { Button } from "@/components/ui/Button";
import { Heading } from "@/components/ui/Heading";
import { StarterActionCard } from "@/components/ui/StarterActionCard";
import { DateTimePickerCrossPlatform } from "@/components/ui/DateTimePickerCrossPlatform";
import { shadows } from "@/utils/design-tokens";
import { DURATIONS } from "@/utils/motion";
import { useReduceMotion } from "@/hooks/useReduceMotion";
import { newId } from "@/core/id";
import * as taskLogic from "@/core/task-logic";
import { useTaskStore } from "@/store/taskStore";
import { useListStore, selectListById } from "@/store/listStore";
import type { EnergyLevel, Subtask, Task } from "@/types";

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
  const subtasks: Subtask[] = isEdit
    ? storeSubtasks ?? []
    : draft.subtasks ?? [];

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

          {/* Buffers */}
          <View className="flex-row gap-3">
            <View className="flex-1">
              <Field label="Buffer before (min)">
                <TextInput
                  className="min-h-12 rounded-md border border-neutral-200 bg-white px-4 text-body-lg text-neutral-900"
                  placeholder="0"
                  placeholderTextColor="#A1A1AA"
                  value={draft.bufferBeforeMin != null ? String(draft.bufferBeforeMin) : ""}
                  onChangeText={(text) => {
                    const parsed = parseInt(text, 10);
                    patch({ bufferBeforeMin: Number.isFinite(parsed) ? parsed : undefined });
                  }}
                  keyboardType="number-pad"
                  accessibilityLabel="Buffer before in minutes"
                />
              </Field>
            </View>
            <View className="flex-1">
              <Field label="Buffer after (min)">
                <TextInput
                  className="min-h-12 rounded-md border border-neutral-200 bg-white px-4 text-body-lg text-neutral-900"
                  placeholder="0"
                  placeholderTextColor="#A1A1AA"
                  value={draft.bufferAfterMin != null ? String(draft.bufferAfterMin) : ""}
                  onChangeText={(text) => {
                    const parsed = parseInt(text, 10);
                    patch({ bufferAfterMin: Number.isFinite(parsed) ? parsed : undefined });
                  }}
                  keyboardType="number-pad"
                  accessibilityLabel="Buffer after in minutes"
                />
              </Field>
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
    </View>
  );
}
