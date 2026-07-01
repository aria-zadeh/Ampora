import React, { useCallback, useMemo, useRef, useState } from "react";
import { View, Text, Pressable, TextInput, Modal } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { FlashList } from "@shopify/flash-list";
import { Swipeable } from "react-native-gesture-handler";
import { useShallow } from "zustand/react/shallow";
import { useTaskStore } from "@/store/taskStore";
import { useListStore, selectAllLists, selectAllTags } from "@/store/listStore";
import { parseQuickAdd } from "@/core/quick-add";
import { TaskCard } from "@/components/ui/TaskCard";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Chip } from "@/components/ui/Chip";
import { EmptyState } from "@/components/ui/EmptyState";
import { FAB } from "@/components/ui/FAB";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import type { Task } from "@/types";

// ---------------------------------------------------------------------------
// Constants and small helpers
// ---------------------------------------------------------------------------

const DAY_MS = 24 * 60 * 60 * 1000;

type SortKey = "due" | "priority" | "manual" | "duration";
type StatusFilter = "all" | "todo" | "done";
type PriorityFilter = 0 | 1 | 2 | 3 | 4; // 0 = any

const SORT_SEGMENTS: { key: SortKey; label: string }[] = [
  { key: "due", label: "Due" },
  { key: "priority", label: "Priority" },
  { key: "manual", label: "Manual" },
  { key: "duration", label: "Duration" },
];

const PRIORITY_LABEL: Record<number, string> = {
  1: "Low",
  2: "Medium",
  3: "High",
  4: "Urgent",
};

const PRIORITY_TONE = {
  1: "neutral",
  2: "primary",
  3: "warning",
  4: "danger",
} as const;

/** Start-of-day epoch ms. */
function startOfDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function formatDuration(min: number): string {
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

function formatDueShort(due: number): string {
  const today = startOfDay(Date.now());
  const diff = Math.round((startOfDay(due) - today) / DAY_MS);
  if (diff < 0) return "Overdue";
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  return new Date(due).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// Section buckets, in display order. Inbox first (no due date), then time buckets.
type SectionKey = "inbox" | "overdue" | "today" | "week" | "later" | "completed";

const SECTION_TITLE: Record<SectionKey, string> = {
  inbox: "Inbox",
  overdue: "Overdue",
  today: "Today",
  week: "This week",
  later: "Later",
  completed: "Completed",
};

// Flattened row model fed to the single FlashList.
type Row =
  | { kind: "header"; key: string; section: SectionKey; count: number; collapsible?: boolean }
  | { kind: "task"; key: string; task: Task };

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function TasksScreen() {
  const insets = useSafeAreaInsets();

  // Atomic selects; derive below in useMemo.
  const tasksRecord = useTaskStore((s) => s.tasks);
  const createTask = useTaskStore((s) => s.createTask);
  const updateTask = useTaskStore((s) => s.updateTask);
  const deleteTask = useTaskStore((s) => s.deleteTask);
  const completeTask = useTaskStore((s) => s.completeTask);
  const reopenTask = useTaskStore((s) => s.reopenTask);

  const lists = useListStore(useShallow(selectAllLists));
  const tags = useListStore(useShallow(selectAllTags));

  const allTasks = useMemo(() => Object.values(tasksRecord), [tasksRecord]);

  // UI state.
  const [quickText, setQuickText] = useState("");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortKey>("due");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [listFilter, setListFilter] = useState<string | null>(null);
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>(0);
  const [completedCollapsed, setCompletedCollapsed] = useState(true);
  const [scheduleFor, setScheduleFor] = useState<Task | null>(null);

  const listColorById = useMemo(() => {
    const map: Record<string, string> = {};
    for (const l of lists) map[l.id] = l.color;
    return map;
  }, [lists]);

  // Live quick-add preview (deterministic given a captured "now" per keystroke).
  const preview = useMemo(() => {
    const trimmed = quickText.trim();
    if (!trimmed) return null;
    return parseQuickAdd(trimmed, Date.now());
  }, [quickText]);

  const canAdd = !!preview && preview.title.length > 0;

  const handleAdd = useCallback(() => {
    if (!preview || preview.title.length === 0) return;
    createTask({
      title: preview.title,
      due: preview.due,
      durationMin: preview.durationMin ?? 0,
      priority: preview.priority,
    });
    setQuickText("");
  }, [preview, createTask]);

  // -------------------------------------------------------------------------
  // Derive filtered + sorted + sectioned rows.
  // -------------------------------------------------------------------------
  const { rows, isEmpty } = useMemo(() => {
    const now = Date.now();
    const todayEnd = startOfDay(now) + DAY_MS - 1;
    const weekEnd = startOfDay(now) + 7 * DAY_MS - 1;
    const q = search.trim().toLowerCase();

    // Filter.
    const filtered = allTasks.filter((t) => {
      if (q) {
        const inTitle = t.title.toLowerCase().includes(q);
        const inNotes = (t.notes ?? "").toLowerCase().includes(q);
        if (!inTitle && !inNotes) return false;
      }
      if (listFilter && t.listId !== listFilter) return false;
      if (tagFilter && !t.tags.includes(tagFilter)) return false;
      if (priorityFilter !== 0 && t.priority !== priorityFilter) return false;
      if (statusFilter === "todo" && t.status === "done") return false;
      if (statusFilter === "done" && t.status !== "done") return false;
      return true;
    });

    const incomplete = filtered.filter((t) => t.status !== "done");
    const completed = filtered.filter((t) => t.status === "done");

    // Bucket incomplete tasks.
    const buckets: Record<Exclude<SectionKey, "completed">, Task[]> = {
      inbox: [],
      overdue: [],
      today: [],
      week: [],
      later: [],
    };
    for (const t of incomplete) {
      if (t.due == null) buckets.inbox.push(t);
      else if (t.due < now) buckets.overdue.push(t);
      else if (t.due <= todayEnd) buckets.today.push(t);
      else if (t.due <= weekEnd) buckets.week.push(t);
      else buckets.later.push(t);
    }

    // Sort comparator (manual = insertion/createdAt order).
    const cmp = (a: Task, b: Task): number => {
      switch (sort) {
        case "due": {
          const ad = a.due ?? Number.POSITIVE_INFINITY;
          const bd = b.due ?? Number.POSITIVE_INFINITY;
          if (ad !== bd) return ad - bd;
          return a.createdAt - b.createdAt;
        }
        case "priority": {
          const ap = a.priority ?? 0;
          const bp = b.priority ?? 0;
          if (ap !== bp) return bp - ap; // higher priority first
          return a.createdAt - b.createdAt;
        }
        case "duration": {
          if (a.durationMin !== b.durationMin) return b.durationMin - a.durationMin;
          return a.createdAt - b.createdAt;
        }
        case "manual":
        default:
          return a.createdAt - b.createdAt;
      }
    };

    for (const key of Object.keys(buckets) as (keyof typeof buckets)[]) {
      buckets[key].sort(cmp);
    }
    completed.sort((a, b) => (b.completedAt ?? b.updatedAt) - (a.completedAt ?? a.updatedAt));

    // Build flattened rows: header + its tasks, sections in fixed order.
    const out: Row[] = [];
    const order: Exclude<SectionKey, "completed">[] = [
      "inbox",
      "overdue",
      "today",
      "week",
      "later",
    ];
    for (const section of order) {
      const items = buckets[section];
      if (items.length === 0) continue;
      out.push({
        kind: "header",
        key: `h-${section}`,
        section,
        count: items.length,
      });
      for (const task of items) out.push({ kind: "task", key: task.id, task });
    }

    // Completed section (collapsible, collapsed by default).
    if (completed.length > 0) {
      out.push({
        kind: "header",
        key: "h-completed",
        section: "completed",
        count: completed.length,
        collapsible: true,
      });
      if (!completedCollapsed) {
        for (const task of completed) out.push({ kind: "task", key: task.id, task });
      }
    }

    return { rows: out, isEmpty: filtered.length === 0 };
  }, [
    allTasks,
    search,
    sort,
    statusFilter,
    listFilter,
    tagFilter,
    priorityFilter,
    completedCollapsed,
  ]);

  // -------------------------------------------------------------------------
  // Row renderers.
  // -------------------------------------------------------------------------
  const renderItem = useCallback(
    ({ item }: { item: Row }) => {
      if (item.kind === "header") {
        const collapsible = item.collapsible === true;
        const collapsed = item.section === "completed" && completedCollapsed;
        return (
          <Pressable
            disabled={!collapsible}
            onPress={collapsible ? () => setCompletedCollapsed((c) => !c) : undefined}
            className="flex-row items-center px-5 pt-5 pb-2 min-h-11"
            accessibilityRole={collapsible ? "button" : "header"}
            accessibilityLabel={`${SECTION_TITLE[item.section]}, ${item.count} ${
              item.count === 1 ? "task" : "tasks"
            }${collapsible ? (collapsed ? ". Collapsed" : ". Expanded") : ""}`}
          >
            {collapsible && (
              <Ionicons
                name={collapsed ? "chevron-forward" : "chevron-down"}
                size={16}
                color="#71717A"
                style={{ marginRight: 4 }}
              />
            )}
            <Text className="text-label font-semibold text-neutral-900">
              {SECTION_TITLE[item.section]}
            </Text>
            <Text className="ml-2 text-caption text-neutral-400">{item.count}</Text>
          </Pressable>
        );
      }

      return (
        <TaskRow
          task={item.task}
          listColor={item.task.listId ? listColorById[item.task.listId] : undefined}
          onOpen={() => router.push(`/task/${item.task.id}`)}
          onToggle={() =>
            item.task.status === "done"
              ? reopenTask(item.task.id)
              : completeTask(item.task.id)
          }
          onDone={() => completeTask(item.task.id)}
          onDelete={() => deleteTask(item.task.id)}
          onSchedule={() => setScheduleFor(item.task)}
        />
      );
    },
    [completedCollapsed, listColorById, completeTask, reopenTask, deleteTask]
  );

  const keyExtractor = useCallback((item: Row) => item.key, []);
  const getItemType = useCallback((item: Row) => item.kind, []);

  const hasAnyTasks = allTasks.length > 0;

  return (
    <View className="flex-1 bg-neutral-100" style={{ paddingTop: insets.top }}>
      {/* Header */}
      <View className="px-5 pt-4 pb-2">
        <Text className="text-h1 font-bold text-neutral-900">Tasks</Text>
      </View>

      {/* Quick-add bar */}
      <View className="px-5">
        <View className="flex-row items-center gap-2">
          <View className="flex-1 flex-row items-center bg-white border border-neutral-200 rounded-md min-h-12 px-3">
            <Ionicons name="add-circle-outline" size={20} color="#A1A1AA" />
            <TextInput
              value={quickText}
              onChangeText={setQuickText}
              placeholder="Add a task…  try “Read ch 11 due fri 2h high”"
              placeholderTextColor="#A1A1AA"
              className="flex-1 ml-2 text-body-lg text-neutral-900"
              returnKeyType="done"
              onSubmitEditing={handleAdd}
              accessibilityLabel="Quick add task"
            />
            {quickText.length > 0 && (
              <Pressable
                onPress={() => setQuickText("")}
                hitSlop={8}
                accessibilityLabel="Clear quick add"
              >
                <Ionicons name="close-circle" size={18} color="#D4D4D8" />
              </Pressable>
            )}
          </View>
          <Button
            title="Add"
            variant="primaryBlue"
            size="md"
            disabled={!canAdd}
            onPress={handleAdd}
          />
        </View>

        {/* Live preview strip */}
        {preview && (
          <View className="flex-row items-center flex-wrap gap-2 mt-2 px-1">
            <Text
              className="text-caption text-neutral-500"
              numberOfLines={1}
              style={{ maxWidth: "55%" }}
            >
              {preview.title || "…"}
            </Text>
            {preview.due != null && (
              <Chip label={formatDueShort(preview.due)} />
            )}
            {preview.durationMin != null && preview.durationMin > 0 && (
              <Chip label={formatDuration(preview.durationMin)} />
            )}
            {preview.priority != null && (
              <Badge label={PRIORITY_LABEL[preview.priority]} tone={PRIORITY_TONE[preview.priority as 1 | 2 | 3 | 4]} />
            )}
          </View>
        )}
      </View>

      {/* Search */}
      <View className="px-5 mt-3">
        <View className="flex-row items-center bg-white border border-neutral-200 rounded-md min-h-11 px-3">
          <Ionicons name="search" size={18} color="#A1A1AA" />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search tasks"
            placeholderTextColor="#A1A1AA"
            className="flex-1 ml-2 text-body text-neutral-900"
            accessibilityLabel="Search tasks"
          />
          {search.length > 0 && (
            <Pressable onPress={() => setSearch("")} hitSlop={8} accessibilityLabel="Clear search">
              <Ionicons name="close-circle" size={18} color="#D4D4D8" />
            </Pressable>
          )}
        </View>
      </View>

      {/* Filter chips */}
      <View className="mt-3">
        <View className="px-5 flex-row flex-wrap gap-2">
          {/* Status */}
          <Chip
            label="To do"
            selected={statusFilter === "todo"}
            onPress={() => setStatusFilter((s) => (s === "todo" ? "all" : "todo"))}
          />
          <Chip
            label="Done"
            selected={statusFilter === "done"}
            onPress={() => setStatusFilter((s) => (s === "done" ? "all" : "done"))}
          />
          {/* Priority */}
          {([4, 3, 2, 1] as const).map((p) => (
            <Chip
              key={`p-${p}`}
              label={PRIORITY_LABEL[p]}
              selected={priorityFilter === p}
              onPress={() => setPriorityFilter((cur) => (cur === p ? 0 : p))}
            />
          ))}
          {/* Lists */}
          {lists.map((l) => (
            <Chip
              key={l.id}
              label={l.name}
              color={l.color}
              selected={listFilter === l.id}
              onPress={() => setListFilter((cur) => (cur === l.id ? null : l.id))}
            />
          ))}
          {/* Tags */}
          {tags.map((t) => (
            <Chip
              key={t.id}
              label={`#${t.name}`}
              color={t.color}
              selected={tagFilter === t.name}
              onPress={() => setTagFilter((cur) => (cur === t.name ? null : t.name))}
            />
          ))}
        </View>
      </View>

      {/* Sort control */}
      <View className="px-5 mt-3 flex-row items-center gap-2">
        <Text className="text-caption text-neutral-500">Sort</Text>
        <View className="flex-1">
          <SegmentedControl
            segments={SORT_SEGMENTS}
            value={sort}
            onChange={(k) => setSort(k as SortKey)}
          />
        </View>
      </View>

      {/* List */}
      <View className="flex-1 mt-2">
        {isEmpty ? (
          <EmptyState
            title={hasAnyTasks ? "No matching tasks" : "No tasks yet"}
            subtitle={
              hasAnyTasks
                ? "Try clearing filters or search."
                : "Add your first task above, or tap the + button."
            }
            icon={hasAnyTasks ? "search-outline" : "checkbox-outline"}
            actionLabel={hasAnyTasks ? undefined : "New task"}
            onAction={hasAnyTasks ? undefined : () => router.push("/task/new")}
          />
        ) : (
          <FlashList
            data={rows}
            renderItem={renderItem}
            keyExtractor={keyExtractor}
            getItemType={getItemType}
            extraData={completedCollapsed}
            contentContainerStyle={{ paddingBottom: 120 }}
            showsVerticalScrollIndicator={false}
          />
        )}
      </View>

      <FAB onPress={() => router.push("/task/new")} />

      {/* Inline schedule modal */}
      <ScheduleModal
        task={scheduleFor}
        onClose={() => setScheduleFor(null)}
        onSave={(durationMin, due) => {
          if (scheduleFor) updateTask(scheduleFor.id, { durationMin, due });
          setScheduleFor(null);
        }}
      />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Task row with swipe actions.
// ---------------------------------------------------------------------------

interface TaskRowProps {
  task: Task;
  listColor?: string;
  onOpen: () => void;
  onToggle: () => void;
  onDone: () => void;
  onDelete: () => void;
  onSchedule: () => void;
}

function TaskRow({ task, listColor, onOpen, onToggle, onDone, onDelete, onSchedule }: TaskRowProps) {
  const swipeRef = useRef<Swipeable>(null);
  const isDone = task.status === "done";

  const close = useCallback(() => swipeRef.current?.close(), []);

  const renderRight = useCallback(
    () => (
      <View className="flex-row items-stretch pr-5 pl-2">
        {!isDone && (
          <Pressable
            onPress={() => {
              close();
              onSchedule();
            }}
            className="w-20 my-0.5 rounded-lg bg-primary-600 items-center justify-center"
            accessibilityRole="button"
            accessibilityLabel="Schedule task"
          >
            <Ionicons name="calendar-outline" size={20} color="#FFFFFF" />
            <Text className="text-tiny text-white mt-1">Schedule</Text>
          </Pressable>
        )}
        {!isDone && (
          <Pressable
            onPress={() => {
              close();
              onDone();
            }}
            className="w-20 ml-2 my-0.5 rounded-lg bg-success-700 items-center justify-center"
            accessibilityRole="button"
            accessibilityLabel="Mark task done"
          >
            <Ionicons name="checkmark" size={22} color="#FFFFFF" />
            <Text className="text-tiny text-white mt-1">Done</Text>
          </Pressable>
        )}
        <Pressable
          onPress={() => {
            close();
            onDelete();
          }}
          className="w-20 ml-2 my-0.5 rounded-lg bg-danger-600 items-center justify-center"
          accessibilityRole="button"
          accessibilityLabel="Delete task"
        >
          <Ionicons name="trash-outline" size={20} color="#FFFFFF" />
          <Text className="text-tiny text-white mt-1">Delete</Text>
        </Pressable>
      </View>
    ),
    [isDone, close, onSchedule, onDone, onDelete]
  );

  return (
    <View className="px-5 py-1">
      <Swipeable
        ref={swipeRef}
        renderRightActions={renderRight}
        overshootRight={false}
        rightThreshold={40}
        friction={2}
      >
        <TaskCard task={task} listColor={listColor} onPress={onOpen} onToggleComplete={onToggle} />
      </Swipeable>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Inline schedule modal: Duration + Due.
// ---------------------------------------------------------------------------

const DURATION_OPTIONS = [15, 30, 45, 60, 90, 120];
const DUE_OPTIONS: { label: string; offsetDays: number | null }[] = [
  { label: "Today", offsetDays: 0 },
  { label: "Tomorrow", offsetDays: 1 },
  { label: "In 3 days", offsetDays: 3 },
  { label: "Next week", offsetDays: 7 },
  { label: "No date", offsetDays: null },
];

function endOfDayOffset(offsetDays: number): number {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  d.setHours(23, 59, 0, 0);
  return d.getTime();
}

interface ScheduleModalProps {
  task: Task | null;
  onClose: () => void;
  onSave: (durationMin: number, due: number | undefined) => void;
}

function ScheduleModal({ task, onClose, onSave }: ScheduleModalProps) {
  const [duration, setDuration] = useState(30);
  const [dueOffset, setDueOffset] = useState<number | null>(0);

  // Re-seed local state whenever a new task is opened.
  React.useEffect(() => {
    if (task) {
      setDuration(task.durationMin > 0 ? task.durationMin : 30);
      setDueOffset(0);
    }
  }, [task]);

  const visible = task != null;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable className="flex-1 bg-black/40 justify-end" onPress={onClose} accessibilityLabel="Dismiss">
        <Pressable
          className="bg-white rounded-t-xl p-5 pb-8"
          onPress={(e) => e.stopPropagation()}
        >
          <View className="items-center mb-4">
            <View className="w-10 h-1 rounded-full bg-neutral-200" />
          </View>
          <Text className="text-h4 font-semibold text-neutral-900 mb-1">Schedule</Text>
          {task && (
            <Text className="text-caption text-neutral-500 mb-4" numberOfLines={1}>
              {task.title}
            </Text>
          )}

          <Text className="text-label font-medium text-neutral-900 mb-2">Duration</Text>
          <View className="flex-row flex-wrap gap-2 mb-5">
            {DURATION_OPTIONS.map((d) => (
              <Chip
                key={d}
                label={formatDuration(d)}
                selected={duration === d}
                onPress={() => setDuration(d)}
              />
            ))}
          </View>

          <Text className="text-label font-medium text-neutral-900 mb-2">Due</Text>
          <View className="flex-row flex-wrap gap-2 mb-6">
            {DUE_OPTIONS.map((opt) => (
              <Chip
                key={opt.label}
                label={opt.label}
                selected={dueOffset === opt.offsetDays}
                onPress={() => setDueOffset(opt.offsetDays)}
              />
            ))}
          </View>

          <View className="flex-row gap-3">
            <View className="flex-1">
              <Button title="Cancel" variant="secondary" onPress={onClose} />
            </View>
            <View className="flex-1">
              <Button
                title="Save"
                variant="primaryBlue"
                onPress={() =>
                  onSave(duration, dueOffset == null ? undefined : endOfDayOffset(dueOffset))
                }
              />
            </View>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
