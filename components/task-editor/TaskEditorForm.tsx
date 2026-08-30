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
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Animated, { FadeIn, FadeInDown } from "react-native-reanimated";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Heading } from "@/components/ui/Heading";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { StarterActionCard } from "@/components/ui/StarterActionCard";
import { SkeletonLoader } from "@/components/ui/SkeletonLoader";
import { Text as UIText } from "@/components/ui/Text";
import { PressableScale } from "@/components/ui/PressableScale";
import { DateTimePickerCrossPlatform } from "@/components/ui/DateTimePickerCrossPlatform";
import { listColors, tabularNums, type ListColorName } from "@/utils/design-tokens";
import { useThemeColors } from "@/hooks/useThemeColors";
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
import type { RecurrenceRule, Subtask, Task } from "@/types";

import {
  Stepper,
  Toggle,
  InlineSegmented,
  formatMinutes,
} from "@/components/settings/SettingsPrimitives";
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
  /**
   * Stake row (D4 item 7), route-wrapper-owned. All three are optional and
   * presentational only: the form never reads `stakesStore` itself, it just
   * renders what the wrapper (which already owns `StakeSetupSheet`) hands it.
   * Omitted entirely (create mode has no taskId to stake yet) means no stake
   * card renders.
   */
  stakeSummary?: string | null;
  /** Whether a stake config currently exists for this task (toggle's on/off visual). */
  stakeOn?: boolean;
  /** Opens the existing StakeSetupSheet flow already wired in the route wrapper. */
  onOpenStake?: () => void;
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

/**
 * Named order for the 8 task/list color swatches, index-paired with
 * `COLOR_SWATCHES` below so `app/task/[id].tsx`'s meta-chip tint can resolve
 * a stored swatch hex back to its `listColors` name without re-hardcoding a
 * second copy of the hexes.
 */
export const SWATCH_LIST_COLOR_NAMES: ListColorName[] = [
  "blue",
  "purple",
  "green",
  "orange",
  "red",
  "teal",
  "pink",
  "slate",
];

/**
 * Exported so other screens that render a stored swatch hex (e.g.
 * `app/task/[id].tsx`'s meta-chip tint) can resolve it back to a `listColors`
 * name by index instead of re-hardcoding these 8 hexes a second time.
 *
 * Sourced from the STABLE (theme-independent) `listColors` export rather than
 * the `useListColors()` hook: this hex is persisted as `Task.color` /
 * `List.color`, so it must keep matching itself across a theme switch, not
 * drift to the other theme's tone the next time this module evaluates.
 */
export const COLOR_SWATCHES = SWATCH_LIST_COLOR_NAMES.map((name) => listColors[name].bar);

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
        <Text className="mb-2 text-caption font-sans text-neutral-500">{helper}</Text>
      ) : null}
      {children}
    </View>
  );
}

/**
 * A grouped section with header. `boxed` (default true) wraps the fields in
 * the measured card (contract rule 6: `bg-surface` + `border-line` +
 * `rounded-xl` + `p-4`, no shadow), for the form's ordinary editable groups.
 * Pass `boxed={false}` for a section whose CHILDREN are already individually
 * carded (e.g. Steps, doc design decision D4 item 4 / D5: "steps are quiet
 * cards, not a boxed checklist group") so it isn't a card of cards.
 */
function Section({
  title,
  index = 0,
  boxed = true,
  children,
}: {
  title?: string;
  index?: number;
  boxed?: boolean;
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
        <Text className="mb-2 ml-1 text-overline font-semibold uppercase text-neutral-500">
          {title}
        </Text>
      ) : null}
      <View
        className={boxed ? "gap-5 rounded-xl border border-line bg-surface p-4" : "gap-3"}
      >
        {children}
      </View>
    </Animated.View>
  );
}

/** Hairline divider used to separate fields inside a Section. */
function Divider() {
  return <View className="h-px bg-line" />;
}

// ---------------------------------------------------------------------------
// Repeat (FR-15/FR-16, PRD §8.3 "Repeat", doc 03 §2.9)
//
// Leads with the presets most people actually want ("every weekday", "every
// Monday") and keeps the full rule — interval, by-weekday, all three end
// conditions, from-completion anchoring, a per-occurrence time window, and
// the FR-16 carry-forward toggle — behind a single "Edit details" disclosure
// so the common case stays a one-tap pill row. `exceptions` (skip a single
// occurrence without breaking the series) is implemented end-to-end in
// `core/recurrence.ts` and the scheduler, but is deliberately NOT exposed
// here: skipping one occurrence is a calendar-block-level action ("skip this
// one"), not a task-editor rule setting, and the calendar surface is owned by
// another workstream.
// ---------------------------------------------------------------------------

type RepeatPresetKey = "never" | "daily" | "weekdays" | "weekly" | "monthly" | "custom";

const REPEAT_PRESETS: { key: RepeatPresetKey; label: string }[] = [
  { key: "never", label: "Never" },
  { key: "daily", label: "Daily" },
  { key: "weekdays", label: "Weekdays" },
  { key: "weekly", label: "Weekly" },
  { key: "monthly", label: "Monthly" },
  { key: "custom", label: "Custom" },
];

const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const WEEKDAY_LETTER = ["S", "M", "T", "W", "T", "F", "S"];

function sameWeekdaySet(a: number[] | undefined, b: number[]): boolean {
  if (!a || a.length !== b.length) return false;
  const sa = [...a].sort((x, y) => x - y);
  const sb = [...b].sort((x, y) => x - y);
  return sa.every((v, i) => v === sb[i]);
}

/** Which preset pill (if any) the current rule matches, so the row reflects state correctly in edit mode. */
function detectRepeatPreset(rule: RecurrenceRule | undefined, dueWeekday: number): RepeatPresetKey {
  if (!rule) return "never";
  const isPlain =
    rule.until == null &&
    rule.count == null &&
    (rule.anchor == null || rule.anchor === "schedule") &&
    (rule.exceptions == null || rule.exceptions.length === 0) &&
    rule.startWindow == null &&
    !rule.carryForward;
  if (!isPlain) return "custom";
  if (rule.freq === "daily" && rule.interval === 1 && !rule.byWeekday) return "daily";
  if (rule.freq === "daily" && rule.interval === 1 && sameWeekdaySet(rule.byWeekday, [1, 2, 3, 4, 5])) {
    return "weekdays";
  }
  if (rule.freq === "weekly" && rule.interval === 1 && sameWeekdaySet(rule.byWeekday, [dueWeekday])) {
    return "weekly";
  }
  if (rule.freq === "monthly" && rule.interval === 1 && !rule.byWeekday) return "monthly";
  return "custom";
}

function presetRule(
  key: Exclude<RepeatPresetKey, "custom">,
  dueWeekday: number
): RecurrenceRule | undefined {
  switch (key) {
    case "never":
      return undefined;
    case "daily":
      return { freq: "daily", interval: 1 };
    case "weekdays":
      return { freq: "daily", interval: 1, byWeekday: [1, 2, 3, 4, 5] };
    case "weekly":
      return { freq: "weekly", interval: 1, byWeekday: [dueWeekday] };
    case "monthly":
      return { freq: "monthly", interval: 1 };
  }
}

function defaultCustomRule(dueWeekday: number): RecurrenceRule {
  return { freq: "weekly", interval: 1, byWeekday: [dueWeekday] };
}

/** Plain-English one-liner shown under the preset row once repeat is on. */
function describeRepeatRule(rule: RecurrenceRule): string {
  const unit = rule.freq === "daily" ? "day" : rule.freq === "weekly" ? "week" : "month";
  let text = rule.interval > 1 ? `Every ${rule.interval} ${unit}s` : `Every ${unit}`;
  if (rule.freq !== "monthly" && rule.byWeekday && rule.byWeekday.length > 0) {
    text += ` on ${[...rule.byWeekday]
      .sort((a, b) => a - b)
      .map((d) => WEEKDAY_SHORT[d])
      .join(", ")}`;
  }
  if (rule.count != null) {
    text += `, ${rule.count} time${rule.count === 1 ? "" : "s"} left`;
  } else if (rule.until != null) {
    text += `, until ${new Date(rule.until).toLocaleDateString()}`;
  }
  if (rule.anchor === "completion") text += " · counts from when you finish it";
  if (rule.carryForward) text += " · missed ones carry forward";
  return text;
}

/** Converts a minutes-from-midnight value to a today-dated Date, for the time-mode DateTimePicker. */
function minutesToDate(minutes: number): Date {
  const d = new Date();
  d.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
  return d;
}

function RepeatControl({
  value,
  dueDate,
  onChange,
}: {
  value: RecurrenceRule | undefined;
  dueDate: number | undefined;
  onChange: (next: RecurrenceRule | undefined) => void;
}) {
  const theme = useThemeColors();
  const dueWeekday = dueDate ? new Date(dueDate).getDay() : new Date().getDay();
  const preset = detectRepeatPreset(value, dueWeekday);
  const [customOpen, setCustomOpen] = useState(preset === "custom");

  const selectPreset = (key: RepeatPresetKey) => {
    Haptics.selectionAsync().catch(() => {});
    if (key === "custom") {
      onChange(value ?? defaultCustomRule(dueWeekday));
      setCustomOpen(true);
      return;
    }
    setCustomOpen(false);
    onChange(presetRule(key, dueWeekday));
  };

  const patchRule = (p: Partial<RecurrenceRule>) => {
    const base = value ?? defaultCustomRule(dueWeekday);
    onChange({ ...base, ...p });
  };

  const toggleWeekday = (day: number) => {
    const base = value ?? defaultCustomRule(dueWeekday);
    const current = base.byWeekday ?? [];
    const next = current.includes(day)
      ? current.filter((d) => d !== day)
      : [...current, day].sort((a, b) => a - b);
    patchRule({ byWeekday: next.length > 0 ? next : undefined });
  };

  const endMode: "never" | "count" | "until" =
    value?.count != null ? "count" : value?.until != null ? "until" : "never";

  return (
    <View className="gap-3">
      {/* Presets */}
      <View
        className="flex-row flex-wrap gap-2"
        accessibilityRole="radiogroup"
        accessibilityLabel="Repeat"
      >
        {REPEAT_PRESETS.map((opt) => {
          const active = preset === opt.key;
          return (
            <Pressable
              key={opt.key}
              onPress={() => selectPreset(opt.key)}
              // Solid fill when selected (contract 3b: "chips inside a sheet
              // ... selected chip is bg-primary"), not the lighter tint this
              // used before.
              className={
                active
                  ? "rounded-full bg-primary-600 px-3.5 py-2"
                  : "rounded-full border border-line bg-raised px-3.5 py-2"
              }
              accessibilityRole="radio"
              accessibilityState={{ selected: active }}
              accessibilityLabel={`Repeat ${opt.label}${active ? ", selected" : ""}`}
            >
              <Text
                className={
                  active
                    ? "text-label font-semibold text-primary-foreground"
                    : "text-label font-medium text-neutral-600"
                }
              >
                {opt.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {value ? (
        <>
          <Text
            className="text-caption font-sans text-neutral-500"
            accessibilityLabel={`Repeat summary: ${describeRepeatRule(value)}`}
          >
            {describeRepeatRule(value)}
          </Text>

          <PressableScale
            onPress={() => setCustomOpen((v) => !v)}
            haptic="selection"
            className="flex-row items-center gap-1.5 self-start"
            accessibilityRole="button"
            accessibilityState={{ expanded: customOpen }}
            accessibilityLabel={customOpen ? "Hide repeat details" : "Edit repeat details"}
          >
            <Text className="text-label font-medium text-primary-600">
              {customOpen ? "Hide details" : "Edit details"}
            </Text>
            <Ionicons name={customOpen ? "chevron-up" : "chevron-down"} size={14} color={theme.primary} />
          </PressableScale>

          {customOpen ? (
            <View className="gap-4 rounded-xl border border-line bg-raised p-4">
              {/* Frequency */}
              <View className="flex-row items-center justify-between">
                <Text className="text-label font-medium text-neutral-800">Frequency</Text>
                <InlineSegmented
                  value={value.freq}
                  options={[
                    { key: "daily", label: "Day" },
                    { key: "weekly", label: "Week" },
                    { key: "monthly", label: "Month" },
                  ]}
                  onChange={(freq) =>
                    patchRule({ freq, byWeekday: freq === "monthly" ? undefined : value.byWeekday })
                  }
                  a11yLabel="Repeat frequency"
                />
              </View>

              {/* Interval */}
              <View className="flex-row items-center justify-between">
                <Text className="text-label font-medium text-neutral-800">Every</Text>
                <Stepper
                  value={value.interval}
                  min={1}
                  max={30}
                  step={1}
                  onChange={(interval) => patchRule({ interval })}
                  format={(v) =>
                    `${v} ${value.freq === "daily" ? "day" : value.freq === "weekly" ? "week" : "month"}${
                      v === 1 ? "" : "s"
                    }`
                  }
                  a11yLabel="repeat interval"
                />
              </View>

              {/* By weekday (daily/weekly only) */}
              {value.freq !== "monthly" ? (
                <View className="gap-2">
                  <Text className="text-label font-medium text-neutral-800">
                    {value.freq === "daily" ? "Only on these days (optional)" : "On these days"}
                  </Text>
                  <View className="flex-row gap-1.5">
                    {WEEKDAY_LETTER.map((letter, day) => {
                      const active = (value.byWeekday ?? []).includes(day);
                      return (
                        <Pressable
                          key={day}
                          onPress={() => toggleWeekday(day)}
                          className={`h-9 w-9 items-center justify-center rounded-full border ${
                            active ? "border-primary-500 bg-primary-600" : "border-line bg-surface"
                          }`}
                          accessibilityRole="checkbox"
                          accessibilityState={{ checked: active }}
                          accessibilityLabel={WEEKDAY_SHORT[day]}
                        >
                          <Text
                            className={
                              active
                                ? "text-label font-semibold text-primary-foreground"
                                : "text-label font-medium text-neutral-600"
                            }
                          >
                            {letter}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              ) : null}

              {/* Ends */}
              <View className="gap-2">
                <Text className="text-label font-medium text-neutral-800">Ends</Text>
                <InlineSegmented
                  value={endMode}
                  options={[
                    { key: "never", label: "Never" },
                    { key: "count", label: "After N" },
                    { key: "until", label: "On date" },
                  ]}
                  onChange={(mode) => {
                    if (mode === "never") patchRule({ count: undefined, until: undefined });
                    else if (mode === "count") patchRule({ count: value.count ?? 10, until: undefined });
                    else patchRule({ until: value.until ?? Date.now(), count: undefined });
                  }}
                  a11yLabel="Repeat end condition"
                />
                {endMode === "count" ? (
                  <Stepper
                    value={value.count ?? 10}
                    min={1}
                    max={365}
                    step={1}
                    onChange={(count) => patchRule({ count })}
                    format={(v) => `${v} time${v === 1 ? "" : "s"}`}
                    a11yLabel="number of occurrences"
                  />
                ) : null}
                {endMode === "until" ? (
                  <DateTimePickerCrossPlatform
                    mode="date"
                    value={value.until ? new Date(value.until) : new Date()}
                    onChange={(d) => patchRule({ until: d.getTime() })}
                    accessibilityLabel="Repeat end date"
                  />
                ) : null}
              </View>

              {/* From-completion anchor */}
              <View className="flex-row items-center justify-between">
                <View className="flex-1 pr-3">
                  <Text className="text-label font-medium text-neutral-800">
                    Count from when I finish
                  </Text>
                  <Text className="mt-0.5 text-caption font-sans text-neutral-500">
                    Off: always the same day. On: the clock starts once you complete it.
                  </Text>
                </View>
                <Toggle
                  value={value.anchor === "completion"}
                  onChange={(on) => patchRule({ anchor: on ? "completion" : "schedule" })}
                  a11yLabel="Count the repeat from when I finish it"
                />
              </View>

              {/* Per-occurrence time window */}
              <View className="gap-2">
                <View className="flex-row items-center justify-between">
                  <View className="flex-1 pr-3">
                    <Text className="text-label font-medium text-neutral-800">
                      Only within a time window
                    </Text>
                    <Text className="mt-0.5 text-caption font-sans text-neutral-500">
                      Keep every occurrence inside a set time of day.
                    </Text>
                  </View>
                  <Toggle
                    value={!!value.startWindow}
                    onChange={(on) =>
                      patchRule({
                        startWindow: on
                          ? { start: value.startWindow?.start ?? 9 * 60, end: value.startWindow?.end ?? 17 * 60 }
                          : undefined,
                      })
                    }
                    a11yLabel="Limit each occurrence to a time window"
                  />
                </View>
                {value.startWindow ? (
                  <View className="flex-row gap-3">
                    <View className="flex-1">
                      <Text className="mb-1 text-caption font-sans text-neutral-500">From</Text>
                      <DateTimePickerCrossPlatform
                        mode="time"
                        value={minutesToDate(value.startWindow.start)}
                        onChange={(d) =>
                          patchRule({
                            startWindow: { ...value.startWindow!, start: d.getHours() * 60 + d.getMinutes() },
                          })
                        }
                        accessibilityLabel="Window start time"
                      />
                    </View>
                    <View className="flex-1">
                      <Text className="mb-1 text-caption font-sans text-neutral-500">Until</Text>
                      <DateTimePickerCrossPlatform
                        mode="time"
                        value={minutesToDate(value.startWindow.end)}
                        onChange={(d) =>
                          patchRule({
                            startWindow: { ...value.startWindow!, end: d.getHours() * 60 + d.getMinutes() },
                          })
                        }
                        accessibilityLabel="Window end time"
                      />
                    </View>
                  </View>
                ) : null}
              </View>

              {/* Carry forward (FR-16) */}
              <View className="flex-row items-center justify-between">
                <View className="flex-1 pr-3">
                  <Text className="text-label font-medium text-neutral-800">
                    Carry forward if missed
                  </Text>
                  <Text className="mt-0.5 text-caption font-sans text-neutral-500">
                    Off (default): a missed one is dropped, not stacked onto the next.
                  </Text>
                </View>
                <Toggle
                  value={!!value.carryForward}
                  onChange={(on) => patchRule({ carryForward: on })}
                  a11yLabel="Carry forward a missed occurrence"
                />
              </View>
            </View>
          ) : null}
        </>
      ) : null}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function TaskEditorForm({
  mode,
  initialDraft,
  taskId,
  onSubmit,
  stakeSummary,
  stakeOn,
  onOpenStake,
}: TaskEditorFormProps) {
  const theme = useThemeColors();
  const isEdit = mode === "edit";
  const reduceMotion = useReduceMotion();

  const [draft, setDraft] = useState<Partial<Task>>(initialDraft);

  // Track focus so inputs can lift their border to primary-500 while active.
  const [focusedField, setFocusedField] = useState<string | null>(null);

  // Whether the user actually touched the auto-schedule control THIS edit
  // (vs. `draft.autoSchedule` merely echoing the value the task already had).
  // The form always resubmits a full draft, so `store/taskStore.ts#updateTask`
  // cannot otherwise tell a deliberate choice apart from a stale echo when it
  // decides whether to force-promote an Inbox item's auto-schedule to true
  // (FR-5). See `handleSave` below for how this rides along on the submitted
  // draft.
  const [autoScheduleTouched, setAutoScheduleTouched] = useState(false);

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

  /**
   * Border class for a "flat" field — contract 3b: fields inside a sheet sit
   * on `bg-raised` with no border by default (measured off task-capture.pdf:
   * every field box there is a single flat fill, no separate border layer).
   * Transparent unless focused, when it lifts to primary-500 as the sole
   * focus affordance; the literal `border` width stays constant either way
   * so focusing never shifts layout.
   */
  const inputBorder = (name: string) =>
    focusedField === name ? "border-primary-500" : "border-transparent";

  // --- Duration rollup ----------------------------------------------------
  const hasSubtasks = subtasks.length > 0;
  const rollupDuration = useMemo(
    () => taskLogic.sumEstimatedMin(subtasks),
    [subtasks]
  );
  // Progress line (D4 item 5), same rollup semantics as taskLogic's
  // computeDurationMin/computeProgressMin (subtasks override a manual
  // duration when present), just read from the live state already tracked
  // above rather than recomputed against the store.
  const stepsTotalMin = hasSubtasks ? rollupDuration : draft.durationMin ?? 0;
  const stepsProgress = hasSubtasks ? liveProgressMin / Math.max(stepsTotalMin, 1) : 0;
  // "Make easier" secondary-row target: the first not-yet-done step, mirroring
  // the per-step chips' own eligibility filter below.
  const nextSimplifiableSubtask = subtasks.find((s) => !taskLogic.isSubtaskDone(s));

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
    setAiNote(result.isFallback ? result.note ?? "General steps. Tap Refine to shape them." : null);
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
      });
      applyBreakdown(result);
    } catch {
      // breakdownTask never throws, but stay defensive.
      setAiNote("Couldn't build steps. Add them below.");
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
      setAiNote("Couldn't refine. Your steps are unchanged.");
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
    // Ensure title is trimmed on the way out. `autoScheduleTouched` rides
    // along on the submitted draft as a non-Task marker (stripped by
    // `taskStore.updateTask` before it ever reaches persisted state) so the
    // store can tell a deliberate auto-schedule choice apart from a stale
    // echo of whatever the task already had — an explicit off must always
    // win over the FR-5 inbox-promotion default.
    const finalDraft: Partial<Task> & { autoScheduleTouched?: boolean } = {
      ...draft,
      title: (draft.title ?? "").trim(),
    };
    if (autoScheduleTouched) finalDraft.autoScheduleTouched = true;
    onSubmit(finalDraft);
  };

  // --- Effective color chip preview --------------------------------------
  const effectiveColor = draft.color ?? selectedList?.color;

  return (
    <View className="flex-1">
      <ScrollView
        className="flex-1"
        contentContainerClassName="px-6 pb-10 pt-4 gap-6"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* --- The essentials ------------------------------------------- */}
        <Section index={0}>
          {/* Title — a compound "field box" (measured off task-capture.pdf):
              an 11pt uppercase label sits INSIDE the box, above the value —
              unlike every other field in this form, where the label sits
              outside. bg-raised, rounded-lg, no border unless focused. */}
          <View
            className={`min-h-18 justify-center gap-0.5 rounded-lg border ${inputBorder(
              "title"
            )} bg-raised px-4 py-2.5`}
          >
            <Text className="text-tiny font-medium uppercase text-neutral-500">
              Task name
            </Text>
            <TextInput
              className="p-0 text-body-lg font-medium text-neutral-900"
              placeholder="What needs doing?"
              placeholderTextColor={theme.textDisabled}
              value={draft.title ?? ""}
              onChangeText={(title) => patch({ title })}
              onFocus={() => setFocusedField("title")}
              onBlur={() => setFocusedField(null)}
              autoFocus={!isEdit}
              returnKeyType="next"
              accessibilityLabel="Task title"
            />
          </View>

          <Divider />

          {/* Notes */}
          <Field label="Notes">
            <TextInput
              className={`min-h-24 rounded-lg border ${inputBorder(
                "notes"
              )} bg-raised px-4 py-3 text-body-lg text-neutral-900`}
              placeholder="Add details (optional)"
              placeholderTextColor={theme.textDisabled}
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
              flow below. Accent-tinted (docs/02 §13.1: accent is AI/smart/
              Projects only — this is the AI action, "Save task" stays the
              screen's one blue primary). */}
          <View className="gap-3">
            <PressableScale
              onPress={handleBreakDown}
              haptic={canBreakDown ? "light" : false}
              disabled={!canBreakDown || breakingDown}
              className={`min-h-12 flex-row items-center justify-center gap-2 rounded-lg border border-accent-100 bg-accent-100 ${
                !canBreakDown || breakingDown ? "opacity-50" : ""
              }`}
              accessibilityRole="button"
              accessibilityLabel="Break it down with AI"
              accessibilityState={{ disabled: !canBreakDown || breakingDown, busy: breakingDown }}
            >
              <Ionicons name="sparkles" size={16} color={theme.accentStrong} />
              <Text className="text-label font-semibold text-accent-700">
                {breakingDown
                  ? "Breaking it down…"
                  : hasBreakdownContent
                    ? "Re-generate steps"
                    : "Break it down"}
              </Text>
            </PressableScale>

            {!canBreakDown ? (
              <Text className="text-caption font-sans text-neutral-500">
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
                <Ionicons name="cloud-offline-outline" size={16} color={theme.warningStrong} />
                <Text className="flex-1 text-caption font-sans text-warning-700">{aiNote}</Text>
              </Animated.View>
            ) : null}
          </View>

          <Divider />

          <Field helper="One tiny 2-5 minute starter to beat activation energy" label="What is the smallest first step?">
            <TextInput
              className={`min-h-12 rounded-lg border ${inputBorder(
                "firstMove"
              )} bg-raised px-4 text-body-lg text-neutral-900`}
              placeholder="e.g. Open the doc and write one line"
              placeholderTextColor={theme.textDisabled}
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

        {/* --- Steps ------------------------------------------------------
            Unboxed (D5: "steps are quiet cards, not a boxed checklist
            group"). Each step is its own card (inside SubtaskChecklist),
            not nested in a second bordered container. --------------------- */}
        <Section title="Steps" index={3} boxed={false}>
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
              local fallback and never throws. Accent while a chip is actively
              simplifying (the AI call in flight); quiet otherwise. */}
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
                            ? "border-accent-100 bg-accent-100"
                            : "border-line bg-raised"
                        }`}
                        accessibilityRole="button"
                        accessibilityLabel={`Make easier: ${s.title}`}
                        accessibilityState={{ busy: loading, disabled: simplifyingId != null }}
                      >
                        <Ionicons
                          name={loading ? "hourglass-outline" : "cut-outline"}
                          size={13}
                          color={loading ? theme.accentStrong : theme.accent}
                        />
                        <Text
                          className="max-w-180 text-caption font-medium text-neutral-700"
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

          {/* Progress line (D4 item 5): thin blue bar + "N / M min", the
              same completed-minutes-over-total rollup shown above. */}
          {hasSubtasks ? (
            <View className="flex-row items-center gap-2 px-0.5">
              <View className="flex-1">
                <ProgressBar progress={stepsProgress} color="bg-primary-600" height={6} />
              </View>
              <UIText variant="captionMedium" className="text-neutral-600" style={tabularNums}>
                {liveProgressMin} / {stepsTotalMin} min
              </UIText>
            </View>
          ) : null}

          {/* AI: Refine / Make easier, secondary row (D4 item 6), two equal
              quiet accent buttons (docs/02 §13.1: accent is the AI-affordance
              hue). Both wire to EXISTING handlers only. Refine opens the same
              instruction panel as before (`showRefine`/`handleRefine`,
              unchanged below). Make easier simplifies the next not-done step
              via the same `handleSimplifySubtask` each per-step chip above
              already calls, no new AI call. */}
          {hasBreakdownContent ? (
            <View className="gap-2">
              <View className="flex-row gap-2.5">
                <PressableScale
                  onPress={() => setShowRefine(true)}
                  haptic="light"
                  className="h-11 flex-1 items-center justify-center rounded-lg bg-accent-100"
                  accessibilityRole="button"
                  accessibilityLabel="Refine the steps with an instruction"
                >
                  <UIText variant="captionMedium" className="text-accent-700">
                    Refine
                  </UIText>
                </PressableScale>
                <PressableScale
                  onPress={() =>
                    nextSimplifiableSubtask && handleSimplifySubtask(nextSimplifiableSubtask.id)
                  }
                  haptic={nextSimplifiableSubtask ? "selection" : false}
                  disabled={!nextSimplifiableSubtask || simplifyingId != null}
                  className="h-11 flex-1 items-center justify-center rounded-lg bg-accent-100"
                  style={!nextSimplifiableSubtask || simplifyingId != null ? { opacity: 0.5 } : undefined}
                  accessibilityRole="button"
                  accessibilityLabel="Make the next step easier"
                  accessibilityState={{
                    disabled: !nextSimplifiableSubtask || simplifyingId != null,
                    busy: !!nextSimplifiableSubtask && simplifyingId === nextSimplifiableSubtask.id,
                  }}
                >
                  <UIText variant="captionMedium" className="text-accent-700">
                    {nextSimplifiableSubtask && simplifyingId === nextSimplifiableSubtask.id
                      ? "Simplifying…"
                      : "Make easier"}
                  </UIText>
                </PressableScale>
              </View>

              {showRefine ? (
                <Animated.View
                  entering={reduceMotion ? undefined : FadeIn.duration(DURATIONS.fast)}
                  className="gap-2"
                >
                  <TextInput
                    className="min-h-12 rounded-lg border border-primary-500 bg-raised px-4 text-body-lg font-medium text-neutral-900"
                    placeholder='e.g. "break it down by function" or "step 2 is too big"'
                    placeholderTextColor={theme.textDisabled}
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
                        variant="accent"
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
              ) : null}
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
              <Text className="mt-0.5 text-caption font-sans text-neutral-500">
                Let Ampora find time for this task.
              </Text>
            </View>
            <Toggle
              value={draft.autoSchedule ?? true}
              onChange={(autoSchedule) => {
                setAutoScheduleTouched(true);
                patch({ autoSchedule });
              }}
              a11yLabel="Auto-schedule"
            />
          </View>

          <Divider />

          {/* Duration */}
          <Field
            label="Duration"
            helper={hasSubtasks ? undefined : "Estimated time in minutes"}
          >
            {hasSubtasks ? (
              <View className="min-h-12 flex-row items-center justify-between rounded-lg border border-line bg-raised px-4">
                <Text className="text-body-lg font-medium text-neutral-900">
                  {rollupDuration}m
                </Text>
                <Text className="text-caption font-sans text-neutral-500">from steps</Text>
              </View>
            ) : (
              <TextInput
                className={`min-h-12 rounded-lg border ${inputBorder(
                  "duration"
                )} bg-raised px-4 text-body-lg text-neutral-900`}
                placeholder="e.g. 30"
                placeholderTextColor={theme.textDisabled}
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
                className="min-h-12 flex-row items-center rounded-lg border border-line bg-raised px-4"
                accessibilityRole="button"
                accessibilityLabel="Set a due date"
              >
                <Ionicons name="calendar-outline" size={18} color={theme.textMuted} />
                <Text className="ml-2 text-body-lg font-medium text-neutral-500">
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
                className="min-h-12 flex-row items-center rounded-lg border border-line bg-raised px-4"
                accessibilityRole="button"
                accessibilityLabel="Set a start-after date"
              >
                <Ionicons name="time-outline" size={18} color={theme.textMuted} />
                <Text className="ml-2 text-body-lg font-medium text-neutral-500">
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
              <Text className="mt-0.5 text-caption font-sans text-neutral-500">
                Allow this task to be broken across multiple blocks.
              </Text>
            </View>
            <Switch
              value={draft.splittable ?? false}
              onValueChange={(splittable) => patch({ splittable })}
              trackColor={{ true: theme.primary, false: theme.borderStrong }}
              accessibilityLabel="Split into sessions"
            />
          </View>

          {/* Min / Max block — only when splittable */}
          {draft.splittable ? (
            <View className="flex-row gap-3">
              <View className="flex-1">
                <Field label="Min block (min)">
                  <TextInput
                    className="min-h-12 rounded-lg border border-line bg-raised px-4 text-body-lg font-medium text-neutral-900"
                    placeholder="e.g. 30"
                    placeholderTextColor={theme.textDisabled}
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
                    className="min-h-12 rounded-lg border border-line bg-raised px-4 text-body-lg font-medium text-neutral-900"
                    placeholder="e.g. 90"
                    placeholderTextColor={theme.textDisabled}
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
                <Text className="mt-0.5 text-caption font-sans text-neutral-500">
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
                <Text className="mt-0.5 text-caption font-sans text-neutral-500">
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

          {/* Repeat (FR-15/FR-16) */}
          <Field label="Repeat" helper="Have this task come back on its own">
            <RepeatControl
              value={draft.recurrence}
              dueDate={draft.due}
              onChange={(recurrence) => patch({ recurrence })}
            />
          </Field>

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
                    : "border-line bg-raised"
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
                  <Ionicons name="sparkles-outline" size={13} color={theme.primary} />
                )}
                <Text
                  className={`text-caption font-sans ${
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
                      <Ionicons name="checkmark" size={16} color={theme.primaryForeground} />
                    ) : null}
                  </Pressable>
                );
              })}
            </View>
          </Field>
        </MoreOptionsSection>

        {/* Stake row (D4 item 7): replaces the old "Put something on the
            line" banner that used to live in the route wrapper's action bar.
            Presentational only: the wrapper reads stakesStore and computes
            stakeSummary/stakeOn, and owns the actual StakeSetupSheet +
            onOpenStake handler. This just renders what it's given. Hidden
            once the task is done, matching the old banner's own gate. */}
        {onOpenStake && draft.status !== "done" ? (
          <Card
            onPress={onOpenStake}
            accessibilityLabel="Put something on the line"
            accessibilityHint={
              stakeSummary
                ? `${stakeSummary}. Opens the lock setup.`
                : "Lock your apps for a focus session on this task"
            }
          >
            <View className="flex-row items-center justify-between gap-3">
              <UIText variant="bodyMedium" className="text-neutral-900">
                Put something on the line
              </UIText>
              {/* Visual indicator only. pointerEvents="none" lets the tap
                  fall through to the Card's own onPress above, so the row
                  and the toggle both do the exact same thing (D4 item 7). */}
              <View pointerEvents="none">
                <Toggle value={!!stakeOn} onChange={() => {}} a11yLabel="Stake toggle" />
              </View>
            </View>
            <UIText variant="caption" className="mt-1.5 text-neutral-600">
              {stakeSummary ?? "Lock your apps for a focus session"}
            </UIText>
          </Card>
        ) : null}
      </ScrollView>

      {/* Sticky Save bar — single primary action, disabled when title empty */}
      <View className="border-t border-line bg-surface px-6 pb-2 pt-3">
        <Button
          title="Save task"
          variant="primaryBlue"
          size="lg"
          onPress={handleSave}
          disabled={!titleValid}
        />
      </View>

      {/* Re-breakdown confirm (AIB-29): protects progress already made on the
          current steps before an AI regenerate would replace them. Full
          bottom-sheet surface per contract rule 3b (surface color, top-only
          rounded-t-sheet, bg-line grabber), matching the sheet pattern used
          elsewhere (e.g. TaskActionSheet). */}
      <Modal
        visible={confirmRebreakdown}
        transparent
        animationType={reduceMotion ? "fade" : "slide"}
        onRequestClose={() => setConfirmRebreakdown(false)}
        accessibilityViewIsModal
      >
        <Pressable
          className="flex-1 justify-end bg-black/40"
          onPress={() => setConfirmRebreakdown(false)}
          accessibilityRole="button"
          accessibilityLabel="Dismiss"
        >
          <Pressable
            className="rounded-t-sheet bg-surface"
            onPress={(e) => e.stopPropagation()}
          >
            <SafeAreaView edges={["bottom"]}>
              <View className="items-center pt-3">
                <View className="h-1 w-10 rounded-xxs bg-line" />
              </View>
              <View className="px-6 pb-6 pt-4">
                <Heading size="h3">Replace your steps?</Heading>
                <Text className="mt-2 text-body font-sans text-neutral-600">
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
              </View>
            </SafeAreaView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}
