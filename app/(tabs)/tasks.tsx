import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Animated as RNAnimated, View, Text, Pressable, Modal } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { FlashList } from "@shopify/flash-list";
import { Swipeable, Gesture, GestureDetector } from "react-native-gesture-handler";
import * as Haptics from "expo-haptics";
import Animated, {
  FadeInDown,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useShallow } from "zustand/react/shallow";
import { useTaskStore } from "@/store/taskStore";
import { useListStore, selectAllLists, selectAllTags } from "@/store/listStore";
import { useScheduleStore, selectAllBlocks, selectMissedTaskIds } from "@/store/scheduleStore";
import { parseQuickAdd } from "@/core/quick-add";
import { TaskCard } from "@/components/ui/TaskCard";
import { TaskActionSheet } from "@/components/ui/TaskActionSheet";
import { BrainDumpSheet } from "@/components/capture/BrainDumpSheet";
import { ListEditorModal } from "@/components/settings/ListEditorModal";
import { Input } from "@/components/ui/Input";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Chip } from "@/components/ui/Chip";
import { EmptyState } from "@/components/ui/EmptyState";
import { FAB } from "@/components/ui/FAB";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Heading } from "@/components/ui/Heading";
import { DURATIONS, SPRINGS, staggerDelay } from "@/utils/motion";
import { listColors } from "@/utils/design-tokens";
import { useReduceMotion } from "@/hooks/useReduceMotion";
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

/** "3:00 PM" style clock time, for surfacing a quick-add-parsed time-of-day. */
function formatClockTime(due: number): string {
  return new Date(due).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

/**
 * Due chip label for the quick-add preview. `matchDue` (core/quick-add.ts)
 * defaults every date-only token to 23:59 local, so a due that ISN'T exactly
 * 23:59 means the user typed an explicit clock time — surface it alongside
 * the date instead of silently dropping it from the chip.
 */
function formatDueChipLabel(due: number): string {
  const base = formatDueShort(due);
  const d = new Date(due);
  const hasExplicitTime = !(d.getHours() === 23 && d.getMinutes() === 59);
  return hasExplicitTime ? `${base}, ${formatClockTime(due)}` : base;
}

/** "Tomorrow" due target (23:59 local), used by both swipe-left and the action sheet. */
function tomorrowDue(now: number): number {
  const d = new Date(now);
  d.setDate(d.getDate() + 1);
  d.setHours(23, 59, 0, 0);
  return d.getTime();
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
  | { kind: "task"; key: string; task: Task; index: number };

// NL-parse hint chips shown when the quick-add field is focused (item 5).
const QUICK_ADD_HINTS = ["tomorrow 3pm", "#list", "!high"];

// FR-6 "due range" filter — user-selectable presets (relative to today),
// distinct from the fixed Overdue/Today/This week/Later section buckets.
const DUE_RANGE_PRESETS: { label: string; days: number }[] = [
  { label: "Next 3 days", days: 3 },
  { label: "Next 7 days", days: 7 },
  { label: "Next 14 days", days: 14 },
  { label: "Next 30 days", days: 30 },
];

type DueRange = { label: string; start: number; end: number };

/** [today 00:00, today+(days-1) 23:59] — an inclusive "next N days" window. */
function dueRangeFromDays(days: number): { start: number; end: number } {
  return { start: startOfDay(Date.now()), end: endOfDayOffset(days - 1) };
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function TasksScreen() {
  const insets = useSafeAreaInsets();
  const reduceMotion = useReduceMotion();

  // Only stagger-animate rows on the first paint; scrolling a recycled
  // FlashList cell should not re-fire the entrance (ADHD: no jarring motion).
  const didMount = useRef(false);
  useEffect(() => {
    didMount.current = true;
  }, []);

  // Atomic selects; derive below in useMemo.
  const tasksRecord = useTaskStore((s) => s.tasks);
  const createTask = useTaskStore((s) => s.createTask);
  const updateTask = useTaskStore((s) => s.updateTask);
  const deleteTask = useTaskStore((s) => s.deleteTask);
  const completeTask = useTaskStore((s) => s.completeTask);
  const reopenTask = useTaskStore((s) => s.reopenTask);
  const reorderTasks = useTaskStore((s) => s.reorderTasks);

  const lists = useListStore(useShallow(selectAllLists));
  const tags = useListStore(useShallow(selectAllTags));
  const createList = useListStore((s) => s.createList);

  const allTasks = useMemo(() => Object.values(tasksRecord), [tasksRecord]);

  // UI state.
  const [quickText, setQuickText] = useState("");
  const [quickFocused, setQuickFocused] = useState(false);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortKey>("due");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [listFilter, setListFilter] = useState<string | null>(null);
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>(0);
  const [missedFilter, setMissedFilter] = useState(false);
  // FR-6 filters (new): tasks with no ScheduledBlock at all — distinct from
  // the Inbox bucket (due == null). A dated task can still be unscheduled,
  // which is exactly the at-risk case worth surfacing.
  const [unscheduledFilter, setUnscheduledFilter] = useState(false);
  // FR-6 "due range" filter — a user-selectable window, separate from the
  // fixed Overdue/Today/This week/Later section buckets below.
  const [dueRangeFilter, setDueRangeFilter] = useState<DueRange | null>(null);
  const [dueRangeModalOpen, setDueRangeModalOpen] = useState(false);
  const [completedCollapsed, setCompletedCollapsed] = useState(true);
  const [scheduleFor, setScheduleFor] = useState<Task | null>(null);
  const [menuFor, setMenuFor] = useState<Task | null>(null);
  const [editListId, setEditListId] = useState<string | null>(null);
  // Brain dump (FR-4, §8.2) — the mic entry point next to the quick-add field.
  const [brainDumpOpen, setBrainDumpOpen] = useState(false);

  // Task ids that currently have a missed block (FR-16 "Missed" filter). Fresh
  // array from the store -> useShallow (Zustand v5) to avoid a React #185 loop.
  const missedTaskIds = useScheduleStore(useShallow(selectMissedTaskIds));
  const missedTaskIdSet = useMemo(() => new Set(missedTaskIds), [missedTaskIds]);
  // If the Missed filter is on and nothing is missed anymore (e.g. the user
  // rescheduled or let the last one go), turn it off so the chip can't strand
  // them on an empty list.
  useEffect(() => {
    if (missedFilter && missedTaskIds.length === 0) setMissedFilter(false);
  }, [missedFilter, missedTaskIds.length]);

  // All scheduled blocks, purely to know WHICH tasks have at least one (FR-6
  // "Unscheduled" filter) — a task can be dated and still never placed by the
  // engine (see `core/scheduler`), which is different from having no due date.
  const allBlocks = useScheduleStore(useShallow(selectAllBlocks));
  const scheduledTaskIdSet = useMemo(() => {
    const s = new Set<string>();
    for (const b of allBlocks) s.add(b.taskId);
    return s;
  }, [allBlocks]);

  const listColorById = useMemo(() => {
    const map: Record<string, string> = {};
    for (const l of lists) map[l.id] = l.color;
    return map;
  }, [lists]);

  // Name lookup for search (item 3: list name is now a full-text search hit)
  // and quick-add's #list resolution.
  const listNameById = useMemo(() => {
    const map: Record<string, string> = {};
    for (const l of lists) map[l.id] = l.name;
    return map;
  }, [lists]);

  // Live quick-add preview (deterministic given a captured "now" per keystroke).
  const preview = useMemo(() => {
    const trimmed = quickText.trim();
    if (!trimmed) return null;
    return parseQuickAdd(trimmed, Date.now());
  }, [quickText]);

  const canAdd = !!preview && preview.title.length > 0;

  // Resolve the quick-add "#list" token against existing lists, case-
  // insensitively. `null` means the preview has a #list token that matches no
  // existing list — the "will create" case, surfaced explicitly below rather
  // than silently dropped or silently auto-created.
  const matchedList = useMemo(() => {
    if (!preview?.list) return null;
    const lower = preview.list.toLowerCase();
    return lists.find((l) => l.name.toLowerCase() === lower) ?? null;
  }, [preview?.list, lists]);

  const handleAdd = useCallback(() => {
    if (!preview || preview.title.length === 0) return;
    // #list resolution (item 1): match an existing list case-insensitively;
    // otherwise create it now, honoring the "will create list X" preview the
    // user just saw rather than silently dropping the token.
    let listId: string | undefined;
    if (preview.list) {
      const lower = preview.list.toLowerCase();
      const existing = lists.find((l) => l.name.toLowerCase() === lower);
      listId = existing ? existing.id : createList({ name: preview.list, color: listColors.slate.bar }).id;
    }
    createTask({
      title: preview.title,
      due: preview.due,
      durationMin: preview.durationMin ?? 0,
      priority: preview.priority,
      listId,
    });
    setQuickText("");
  }, [preview, createTask, createList, lists]);

  const applyHint = useCallback((hint: string) => {
    setQuickText((cur) => (cur.trim().length > 0 ? `${cur.trim()} ${hint}` : hint));
  }, []);

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
        // Full-text search (item 3): title, notes, subtask titles, tag names,
        // and the task's list name — so searching a class name or a step
        // finds the task, not just its own title/notes.
        const inTitle = t.title.toLowerCase().includes(q);
        const inNotes = (t.notes ?? "").toLowerCase().includes(q);
        const inSubtasks = t.subtasks.some((st) => st.title.toLowerCase().includes(q));
        const inTags = t.tags.some((tag) => tag.toLowerCase().includes(q));
        const listName = t.listId ? listNameById[t.listId] : undefined;
        const inList = listName != null && listName.toLowerCase().includes(q);
        if (!inTitle && !inNotes && !inSubtasks && !inTags && !inList) return false;
      }
      if (listFilter && t.listId !== listFilter) return false;
      if (tagFilter && !t.tags.includes(tagFilter)) return false;
      if (priorityFilter !== 0 && t.priority !== priorityFilter) return false;
      if (missedFilter && !missedTaskIdSet.has(t.id)) return false;
      // Unscheduled (FR-6): the task has zero ScheduledBlock entries. Distinct
      // from the Inbox bucket (due == null) — a dated task can still be
      // unschedulable/unplaced by the engine.
      if (unscheduledFilter && scheduledTaskIdSet.has(t.id)) return false;
      // Due range (FR-6): a user-picked window, independent of the fixed
      // Overdue/Today/This week/Later section buckets.
      if (
        dueRangeFilter &&
        (t.due == null || t.due < dueRangeFilter.start || t.due > dueRangeFilter.end)
      ) {
        return false;
      }
      // TODO(stakes): FR-6 also calls for "has-stake" / "Stakes active"
      // filters here. Deliberately not implemented in this pass — stakesStore
      // is being rewritten by another workstream right now.
      if (statusFilter === "todo" && t.status === "done") return false;
      if (statusFilter === "done" && t.status !== "done") return false;
      return true;
    });

    const incomplete = filtered.filter((t) => t.status !== "done");
    const completed = filtered.filter((t) => t.status === "done");

    // Bucket incomplete tasks. Manual sort collapses everything into one
    // "Inbox" bucket (a single ordered list is the point of manual reorder —
    // splitting it by due date would fight the user's own ordering).
    const buckets: Record<Exclude<SectionKey, "completed">, Task[]> = {
      inbox: [],
      overdue: [],
      today: [],
      week: [],
      later: [],
    };
    if (sort === "manual") {
      buckets.inbox = incomplete;
    } else {
      for (const t of incomplete) {
        if (t.due == null) buckets.inbox.push(t);
        else if (t.due < now) buckets.overdue.push(t);
        else if (t.due <= todayEnd) buckets.today.push(t);
        else if (t.due <= weekEnd) buckets.week.push(t);
        else buckets.later.push(t);
      }
    }

    // Sort comparator (manual = user-assigned manualOrder, falling back to
    // createdAt for tasks never dragged).
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
        default: {
          const ao = a.manualOrder ?? Number.POSITIVE_INFINITY;
          const bo = b.manualOrder ?? Number.POSITIVE_INFINITY;
          if (ao !== bo) return ao - bo;
          return a.createdAt - b.createdAt;
        }
      }
    };

    for (const key of Object.keys(buckets) as (keyof typeof buckets)[]) {
      buckets[key].sort(cmp);
    }
    completed.sort((a, b) => (b.completedAt ?? b.updatedAt) - (a.completedAt ?? a.updatedAt));

    // Build flattened rows: header + its tasks, sections in fixed order.
    // `index` on each task row drives the one-time stagger entrance.
    const out: Row[] = [];
    let rowIndex = 0;
    const order: Exclude<SectionKey, "completed">[] =
      sort === "manual"
        ? ["inbox"]
        : ["inbox", "overdue", "today", "week", "later"];
    for (const section of order) {
      const items = buckets[section];
      if (items.length === 0) continue;
      out.push({
        kind: "header",
        key: `h-${section}`,
        section,
        count: items.length,
      });
      for (const task of items) out.push({ kind: "task", key: task.id, task, index: rowIndex++ });
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
        for (const task of completed) out.push({ kind: "task", key: task.id, task, index: rowIndex++ });
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
    missedFilter,
    missedTaskIdSet,
    unscheduledFilter,
    scheduledTaskIdSet,
    dueRangeFilter,
    listNameById,
    completedCollapsed,
  ]);

  // Indices of every header row — fed to FlashList's `stickyHeaderIndices`
  // (item 2). Recomputed alongside `rows` since header positions shift with
  // any filter/sort/collapse change.
  const stickyHeaderIndices = useMemo(
    () => rows.reduce<number[]>((acc, row, i) => (row.kind === "header" ? [...acc, i] : acc), []),
    [rows],
  );

  // Ordered task ids for the CURRENT flattened list — the drag-reorder
  // handle mutates a local copy of this and commits via `reorderTasks` on
  // drop (item 6). Only meaningful in manual-sort mode.
  const manualIds = useMemo(
    () => rows.filter((r): r is Extract<Row, { kind: "task" }> => r.kind === "task").map((r) => r.task.id),
    [rows],
  );

  // Stable ref mirror of `manualIds` (Phase 7 perf fix). `manualIds` gets a
  // fresh array identity on every rows recompute (any create/complete/edit/
  // filter change) — reading it via a ref instead of a prop means the
  // draggable row and `renderItem` don't need to depend on that
  // ever-changing identity to always see the current order.
  const manualIdsRef = useRef<string[]>(manualIds);
  useEffect(() => {
    manualIdsRef.current = manualIds;
  }, [manualIds]);

  // -------------------------------------------------------------------------
  // Long-press context menu (item 3) — wired to the existing store methods.
  // -------------------------------------------------------------------------
  const closeMenu = useCallback(() => setMenuFor(null), []);

  const handleMenuMoveToList = useCallback(
    (listId: string | undefined) => {
      if (!menuFor) return;
      updateTask(menuFor.id, { listId });
    },
    [menuFor, updateTask],
  );

  const handleMenuScheduleTomorrow = useCallback(() => {
    if (!menuFor) return;
    updateTask(menuFor.id, { due: tomorrowDue(Date.now()) });
  }, [menuFor, updateTask]);

  // -------------------------------------------------------------------------
  // Stable, task/id-keyed row callbacks (Phase 7 perf fix). Defined once with
  // stable deps (setState functions and store actions are already stable
  // identities) so every row's `TaskRow`/`DraggableTaskCard`/`TaskCard`
  // receives the SAME function reference on every render — required for
  // `React.memo` on those components to actually skip re-rendering rows
  // whose own task hasn't changed. Each takes the task/id as an argument
  // instead of `renderItem` building a fresh closure per row per render.
  // -------------------------------------------------------------------------
  const handleOpenTask = useCallback((id: string) => {
    router.push(`/task/${id}`);
  }, []);

  const handleLongPressTask = useCallback((task: Task) => {
    setMenuFor(task);
  }, []);

  const handleToggleTask = useCallback(
    (task: Task) => {
      if (task.status === "done") reopenTask(task.id);
      else completeTask(task.id);
    },
    [reopenTask, completeTask],
  );

  const handleDoneTask = useCallback(
    (id: string) => {
      completeTask(id);
    },
    [completeTask],
  );

  const handleDeleteTask = useCallback(
    (id: string) => {
      deleteTask(id);
    },
    [deleteTask],
  );

  const handleScheduleTask = useCallback((task: Task) => {
    setScheduleFor(task);
  }, []);

  const handleScheduleTomorrowTask = useCallback(
    (id: string) => {
      updateTask(id, { due: tomorrowDue(Date.now()) });
    },
    [updateTask],
  );

  // -------------------------------------------------------------------------
  // Row renderers.
  // -------------------------------------------------------------------------
  const renderItem = useCallback(
    ({ item }: { item: Row }) => {
      if (item.kind === "header") {
        const collapsible = item.collapsible === true;
        const collapsed = item.section === "completed" && completedCollapsed;
        return (
          <View className="bg-neutral-100">
            <Pressable
              disabled={!collapsible}
              onPress={collapsible ? () => setCompletedCollapsed((c) => !c) : undefined}
              className="flex-row items-center px-5 pt-7 pb-3 min-h-11"
              accessibilityRole={collapsible ? "button" : "header"}
              accessibilityLabel={`${SECTION_TITLE[item.section]}, ${item.count} ${
                item.count === 1 ? "task" : "tasks"
              }${collapsible ? (collapsed ? ". Collapsed" : ". Expanded") : ""}`}
            >
              {collapsible && (
                <ChevronSpring collapsed={collapsed} />
              )}
              <Heading size="h4">{SECTION_TITLE[item.section]}</Heading>
              <View className="ml-2.5 min-w-6 h-6 px-1.5 rounded-full bg-neutral-200 items-center justify-center">
                <Text className="text-caption font-semibold text-neutral-600">{item.count}</Text>
              </View>
            </Pressable>
          </View>
        );
      }

      // First-paint stagger only; recycled cells while scrolling don't re-animate.
      const entering =
        reduceMotion || didMount.current
          ? undefined
          : FadeInDown.delay(staggerDelay(item.index)).duration(DURATIONS.base);

      return (
        <Animated.View entering={entering}>
          <TaskRow
            task={item.task}
            listColor={item.task.listId ? listColorById[item.task.listId] : undefined}
            manualSort={sort === "manual"}
            manualIdsRef={manualIdsRef}
            onReorder={reorderTasks}
            onOpen={handleOpenTask}
            onLongPress={handleLongPressTask}
            onToggle={handleToggleTask}
            onDone={handleDoneTask}
            onDelete={handleDeleteTask}
            onSchedule={handleScheduleTask}
            onScheduleTomorrow={handleScheduleTomorrowTask}
          />
        </Animated.View>
      );
    },
    [
      completedCollapsed,
      listColorById,
      sort,
      reorderTasks,
      handleOpenTask,
      handleLongPressTask,
      handleToggleTask,
      handleDoneTask,
      handleDeleteTask,
      handleScheduleTask,
      handleScheduleTomorrowTask,
      reduceMotion,
    ],
  );

  const keyExtractor = useCallback((item: Row) => item.key, []);
  const getItemType = useCallback((item: Row) => item.kind, []);

  const hasAnyTasks = allTasks.length > 0;

  return (
    <View className="flex-1 bg-neutral-100" style={{ paddingTop: insets.top }}>
      {/* Header — big, tight. Projects live one tap away (doc 10). */}
      <View className="px-5 pt-5 pb-3 flex-row items-center justify-between">
        <Heading size="h1">Tasks</Heading>
        <Pressable
          onPress={() => router.push("/projects")}
          hitSlop={8}
          className="flex-row items-center rounded-full bg-accent-100 border border-accent-600 px-3 py-2"
          accessibilityRole="button"
          accessibilityLabel="Projects"
          accessibilityHint="Opens your projects, which plan and track larger work"
        >
          <Ionicons name="rocket-outline" size={16} color="#7C3AED" />
          <Text className="text-caption font-semibold text-accent-700 ml-1.5">Projects</Text>
        </Pressable>
      </View>

      {/* Sticky quick-add (item 5) — pins to the top of the list; expands with
          NL-parse hint chips on focus. Rendered OUTSIDE the FlashList so it
          never scrolls away, matching "sticky" rather than "sticky header". */}
      <View className="px-5 bg-neutral-100 z-10">
        <View className="flex-row items-center gap-2">
          <View className="flex-1">
            <Input
              value={quickText}
              onChangeText={setQuickText}
              onFocus={() => setQuickFocused(true)}
              onBlur={() => setQuickFocused(false)}
              placeholder="Add a task…  try “Read ch 11 due fri 2h high”"
              icon="add-circle-outline"
              clearable
              returnKeyType="done"
              onSubmitEditing={handleAdd}
              accessibilityLabel="Quick add task"
            />
          </View>
          <Button
            title="Add"
            variant="primaryBlue"
            size="md"
            disabled={!canAdd}
            onPress={handleAdd}
          />
          {/* Brain dump (FR-4, §8.2) — voice capture: record, transcribe,
              parse, preview, confirm. Always present; BrainDumpSheet itself
              handles the case where voice capture isn't available and keeps
              the typed field above as the fallback. */}
          <Pressable
            onPress={() => setBrainDumpOpen(true)}
            hitSlop={8}
            className="h-11 w-11 items-center justify-center rounded-full bg-primary-50 border border-primary-100"
            accessibilityRole="button"
            accessibilityLabel="Brain dump"
            accessibilityHint="Speak your tasks out loud instead of typing them"
          >
            <Ionicons name="mic-outline" size={20} color="#2563EB" />
          </Pressable>
        </View>

        {/* NL-parse hint chips — only while the field is focused and empty of
            a recognized token, so they read as a suggestion, not clutter. */}
        {quickFocused && !preview && (
          <View className="flex-row items-center flex-wrap gap-2 mt-2.5 px-1">
            {QUICK_ADD_HINTS.map((hint) => (
              <Chip key={hint} label={hint} onPress={() => applyHint(hint)} />
            ))}
          </View>
        )}

        {/* Live preview strip */}
        {preview && (
          <View className="flex-row items-center flex-wrap gap-2 mt-2.5 px-1">
            <Text
              className="text-caption text-neutral-500"
              numberOfLines={1}
              style={{ maxWidth: "55%" }}
            >
              {preview.title || "…"}
            </Text>
            {preview.due != null && (
              <Chip label={formatDueChipLabel(preview.due)} />
            )}
            {preview.durationMin != null && preview.durationMin > 0 && (
              <Chip label={formatDuration(preview.durationMin)} />
            )}
            {/* #list token preview (item 1): a matched list shows its own
                name/color; an unmatched name is surfaced honestly as
                "will create" rather than silently dropped or silently
                auto-created — it's created for real on Add. */}
            {preview.list != null && matchedList && (
              <Chip label={matchedList.name} color={matchedList.color} />
            )}
            {preview.list != null && !matchedList && (
              <Chip label={`Will create list "${preview.list}"`} />
            )}
            {preview.priority != null && (
              <Badge label={PRIORITY_LABEL[preview.priority]} tone={PRIORITY_TONE[preview.priority as 1 | 2 | 3 | 4]} />
            )}
          </View>
        )}
      </View>

      {/* Search */}
      <View className="px-5 mt-3">
        <Input
          value={search}
          onChangeText={setSearch}
          placeholder="Search tasks"
          icon="search"
          clearable
          accessibilityLabel="Search tasks"
        />
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
          {/* Missed (FR-16) — only surfaced when something is actually missed,
              so it never clutters the row otherwise. */}
          {missedTaskIds.length > 0 && (
            <Chip
              label="Missed"
              color="#EA580C"
              selected={missedFilter}
              onPress={() => setMissedFilter((m) => !m)}
            />
          )}
          {/* Unscheduled (FR-6) — a dated task with zero ScheduledBlocks; the
              at-risk case that "Inbox" (undated) doesn't cover. */}
          <Chip
            label="Unscheduled"
            selected={unscheduledFilter}
            onPress={() => setUnscheduledFilter((v) => !v)}
          />
          {/* Due range (FR-6) — a user-selectable window (opens a small
              preset picker), distinct from the fixed section buckets below. */}
          <Chip
            label={dueRangeFilter ? `Due: ${dueRangeFilter.label}` : "Due range"}
            selected={dueRangeFilter != null}
            onPress={() => setDueRangeModalOpen(true)}
          />
          {/* TODO(stakes): FR-6's "has-stake" / "Stakes active" filter chip
              belongs here. Not implemented in this pass — stakesStore's API
              is being rewritten by another workstream right now. */}
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

        {/* Edit-list affordance — appears only when a list filter is active, so
            the active list's name/color/scheduling-hours are one tap away
            (FR-6 / FR-13). */}
        {listFilter && (
          <View className="px-5 mt-2">
            <Pressable
              onPress={() => setEditListId(listFilter)}
              hitSlop={8}
              className="flex-row items-center gap-1.5 self-start rounded-full px-2 py-2 active:opacity-60"
              accessibilityRole="button"
              accessibilityLabel={`Edit list ${
                lists.find((l) => l.id === listFilter)?.name ?? ""
              }`}
              accessibilityHint="Edit this list's name, color, and scheduling hours"
            >
              <Ionicons name="create-outline" size={15} color="#2563EB" />
              <Text className="text-caption font-medium text-primary-600">
                Edit list
              </Text>
            </Pressable>
          </View>
        )}
      </View>

      {/* Sort control */}
      <View className="px-5 mt-4 flex-row items-center gap-3">
        <Text className="text-overline font-semibold text-neutral-500 uppercase tracking-wide">
          Sort
        </Text>
        <View className="flex-1">
          <SegmentedControl
            segments={SORT_SEGMENTS}
            value={sort}
            onChange={(k) => setSort(k as SortKey)}
          />
        </View>
      </View>

      {/* List. MMKV persist hydrates synchronously (same as every other tab
          in this app), so there is no genuine async-loading window here to
          gate with a skeleton — only the two real empty states below. */}
      <View className="flex-1 mt-1">
        {isEmpty ? (
          <EmptyState
            title={hasAnyTasks ? "No matching tasks" : "No tasks yet"}
            subtitle={
              hasAnyTasks
                ? "Nothing fits those filters. Try clearing a chip or your search."
                : "Add your first task above, or tap the + button to get started."
            }
            icon={hasAnyTasks ? "search-outline" : "sparkles-outline"}
            actionLabel={hasAnyTasks ? undefined : "New task"}
            onAction={hasAnyTasks ? undefined : () => router.push("/task/new")}
          />
        ) : (
          <FlashList
            data={rows}
            renderItem={renderItem}
            keyExtractor={keyExtractor}
            getItemType={getItemType}
            stickyHeaderIndices={stickyHeaderIndices}
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

      {/* Due range filter picker (FR-6) */}
      <DueRangeModal
        visible={dueRangeModalOpen}
        activeLabel={dueRangeFilter?.label ?? null}
        onClose={() => setDueRangeModalOpen(false)}
        onSelect={(range) => {
          setDueRangeFilter(range);
          setDueRangeModalOpen(false);
        }}
        onClear={() => {
          setDueRangeFilter(null);
          setDueRangeModalOpen(false);
        }}
      />

      {/* Long-press context menu (item 3) */}
      <TaskActionSheet
        visible={menuFor != null}
        task={menuFor}
        lists={lists}
        onClose={closeMenu}
        onEdit={() => menuFor && router.push(`/task/${menuFor.id}`)}
        onToggleComplete={() => {
          if (!menuFor) return;
          menuFor.status === "done" ? reopenTask(menuFor.id) : completeTask(menuFor.id);
        }}
        onScheduleTomorrow={handleMenuScheduleTomorrow}
        onMoveToList={handleMenuMoveToList}
        onDelete={() => menuFor && deleteTask(menuFor.id)}
        onPutOnTheLine={() => menuFor && router.push(`/task/${menuFor.id}`)}
      />

      {/* List editor (name / color / scheduling-hours override) */}
      <ListEditorModal listId={editListId} onClose={() => setEditListId(null)} />

      {/* Brain dump (FR-4) — record, transcribe, parse, preview, confirm. */}
      <BrainDumpSheet visible={brainDumpOpen} onClose={() => setBrainDumpOpen(false)} />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Chevron with a spring rotation (item 2: "ensure it springs").
// ---------------------------------------------------------------------------

function ChevronSpring({ collapsed }: { collapsed: boolean }) {
  const reduceMotion = useReduceMotion();
  const rotation = useSharedValue(collapsed ? 0 : 90);

  useEffect(() => {
    const target = collapsed ? 0 : 90;
    rotation.value = reduceMotion ? target : withSpring(target, SPRINGS.tactile);
  }, [collapsed, reduceMotion, rotation]);

  const style = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));

  return (
    <Animated.View style={[{ marginRight: 6 }, style]}>
      <Ionicons name="chevron-forward" size={18} color="#6F6862" />
    </Animated.View>
  );
}

// ---------------------------------------------------------------------------
// Task row: swipe (both directions) + long-press + optional drag handle.
// ---------------------------------------------------------------------------

/** Fraction of an action's reveal past which it's considered "armed" (haptic fires once). */
const ARM_FRACTION = 0.6;

interface TaskRowProps {
  task: Task;
  listColor?: string;
  manualSort: boolean;
  /**
   * Current ordered task ids across the whole (flattened) list — read by the
   * drag handle via `.current` (Phase 7 perf fix). A ref instead of a plain
   * array prop so its identity is stable across renders (the array itself
   * still changes contents on every rows recompute; only the ref wrapper is
   * stable), which keeps `React.memo` on this row effective.
   */
  manualIdsRef: React.RefObject<string[]>;
  onReorder: (orderedIds: string[]) => void;
  onOpen: (id: string) => void;
  onLongPress: (task: Task) => void;
  onToggle: (task: Task) => void;
  onDone: (id: string) => void;
  onDelete: (id: string) => void;
  onSchedule: (task: Task) => void;
  onScheduleTomorrow: (id: string) => void;
}

function TaskRowImpl({
  task,
  listColor,
  manualSort,
  manualIdsRef,
  onReorder,
  onOpen,
  onLongPress,
  onToggle,
  onDone,
  onDelete,
  onSchedule,
  onScheduleTomorrow,
}: TaskRowProps) {
  const swipeRef = useRef<Swipeable>(null);
  const isDone = task.status === "done";

  // Armed-state tracker for the left-swipe reveal, so the threshold haptic
  // fires exactly once per crossing, not on every frame of drag (classic
  // Swipeable exposes plain `Animated.Value`s, not Reanimated shared values).
  // The right-swipe (Complete) is a single full-commitment action with no
  // progressive "arming" of its own, so it needs no tracker.
  const leftArmed = useRef(false);

  // An Inbox row (no due date, FR-5) has nothing to push "to tomorrow" — it
  // needs its first duration/due assignment. Its left-swipe primary action is
  // "Schedule" (opens `ScheduleModal` via `onSchedule`), per §8.5 ("an Inbox
  // section with swipe action Schedule"); every other row keeps the existing
  // "Tomorrow" quick-reschedule.
  const isInbox = task.due == null;

  const close = useCallback(() => swipeRef.current?.close(), []);

  const handleCompleteSwipe = useCallback(() => {
    close();
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    onDone(task.id);
  }, [close, onDone, task.id]);

  // Right-swipe = Complete (item 1). A single green action that fills the
  // whole revealed width, so completing reads as one clear commitment.
  const renderRight = useCallback(
    (progress: RNAnimated.AnimatedInterpolation<number>) => {
      if (isDone) return null;
      const scale = progress.interpolate({
        inputRange: [0, 1],
        outputRange: [0.6, 1],
        extrapolate: "clamp",
      });
      const opacity = progress.interpolate({
        inputRange: [0, 0.3, 1],
        outputRange: [0, 0.6, 1],
        extrapolate: "clamp",
      });
      return (
        <RNAnimated.View
          style={{ opacity, transform: [{ scale }] }}
          className="w-24 my-0.5 mr-5 ml-2 rounded-lg bg-success-700 items-center justify-center"
        >
          <Pressable
            onPress={handleCompleteSwipe}
            className="w-full h-full items-center justify-center"
            accessibilityRole="button"
            accessibilityLabel="Mark task done"
          >
            <Ionicons name="checkmark" size={24} color="#FFFFFF" />
            <Text className="text-tiny text-white mt-1">Done</Text>
          </Pressable>
        </RNAnimated.View>
      );
    },
    [isDone, handleCompleteSwipe],
  );

  // Left-swipe = Schedule (Inbox rows) or Schedule-tomorrow (dated rows), plus
  // Delete (item 1). Icons peek progressively with drag distance via the
  // `progress` interpolation; each button arms (haptic fires) once its own
  // reveal threshold is crossed.
  const renderLeft = useCallback(
    (progress: RNAnimated.AnimatedInterpolation<number>) => {
      const tomorrowOpacity = progress.interpolate({
        inputRange: [0, 0.2, 1],
        outputRange: [0, 0.5, 1],
        extrapolate: "clamp",
      });
      const tomorrowScale = progress.interpolate({
        inputRange: [0, 1],
        outputRange: [0.6, 1],
        extrapolate: "clamp",
      });
      const deleteOpacity = progress.interpolate({
        inputRange: [0, 0.45, 1],
        outputRange: [0, 0.4, 1],
        extrapolate: "clamp",
      });
      const deleteScale = progress.interpolate({
        inputRange: [0, 1],
        outputRange: [0.6, 1],
        extrapolate: "clamp",
      });

      // Fire a threshold haptic exactly once per crossing (armed <-> disarmed).
      // `removeAllListeners` first guards against accumulating a listener per
      // Swipeable-internal re-render of this same `progress` value.
      progress.removeAllListeners();
      progress.addListener(({ value }) => {
        const armed = value >= ARM_FRACTION;
        if (armed && !leftArmed.current) {
          leftArmed.current = true;
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        } else if (!armed && leftArmed.current) {
          leftArmed.current = false;
        }
      });

      return (
        <View className="flex-row items-stretch pl-5 pr-2">
          <RNAnimated.View
            style={{ opacity: tomorrowOpacity, transform: [{ scale: tomorrowScale }] }}
            className="w-20 my-0.5 rounded-lg bg-primary-600 items-center justify-center"
          >
            <Pressable
              onPress={() => {
                close();
                Haptics.selectionAsync().catch(() => {});
                if (isInbox) onSchedule(task);
                else onScheduleTomorrow(task.id);
              }}
              className="w-full h-full items-center justify-center"
              accessibilityRole="button"
              accessibilityLabel={isInbox ? "Schedule task" : "Schedule tomorrow"}
            >
              <Ionicons name={isInbox ? "calendar-outline" : "sunny-outline"} size={20} color="#FFFFFF" />
              <Text className="text-tiny text-white mt-1">{isInbox ? "Schedule" : "Tomorrow"}</Text>
            </Pressable>
          </RNAnimated.View>
          <RNAnimated.View
            style={{ opacity: deleteOpacity, transform: [{ scale: deleteScale }] }}
            className="w-20 ml-2 my-0.5 rounded-lg bg-danger-600 items-center justify-center"
          >
            <Pressable
              onPress={() => {
                close();
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
                onDelete(task.id);
              }}
              className="w-full h-full items-center justify-center"
              accessibilityRole="button"
              accessibilityLabel="Delete task"
            >
              <Ionicons name="trash-outline" size={20} color="#FFFFFF" />
              <Text className="text-tiny text-white mt-1">Delete</Text>
            </Pressable>
          </RNAnimated.View>
        </View>
      );
    },
    [close, onDelete, onSchedule, onScheduleTomorrow, task, isInbox],
  );

  // Reset the armed tracker whenever the row closes, so the NEXT open swipe
  // starts from a clean disarmed state.
  const handleClose = useCallback(() => {
    leftArmed.current = false;
  }, []);

  // `TaskCard`/`DraggableTaskCard` want zero-arg handlers (`onPress`,
  // `onToggleComplete`); these adapt the stable task/id-keyed callbacks from
  // the parent to that shape, staying stable themselves (keyed only on
  // `task.id`/`task` + the already-stable parent callbacks) so the memoized
  // card below still skips re-rendering on unrelated list changes.
  const handleOpen = useCallback(() => onOpen(task.id), [onOpen, task.id]);
  const handleLongPress = useCallback(() => onLongPress(task), [onLongPress, task]);
  const handleToggle = useCallback(() => onToggle(task), [onToggle, task]);

  return (
    <View className="px-5 py-1">
      <Swipeable
        ref={swipeRef}
        renderRightActions={isDone ? undefined : renderRight}
        renderLeftActions={renderLeft}
        overshootRight={false}
        overshootLeft={false}
        rightThreshold={56}
        leftThreshold={56}
        friction={2}
        onSwipeableClose={handleClose}
      >
        {manualSort ? (
          <DraggableTaskCard
            task={task}
            listColor={listColor}
            manualIdsRef={manualIdsRef}
            onReorder={onReorder}
            onOpen={handleOpen}
            onLongPress={handleLongPress}
            onToggle={handleToggle}
          />
        ) : (
          <TaskCard
            task={task}
            listColor={listColor}
            onPress={handleOpen}
            onLongPress={handleLongPress}
            onToggleComplete={handleToggle}
          />
        )}
      </Swipeable>
    </View>
  );
}

const TaskRow = React.memo(TaskRowImpl);

// ---------------------------------------------------------------------------
// Manual-reorder drag handle (item 6). A dedicated `≡` handle (not the whole
// row) starts the drag, so tap-to-open and swipe both keep working normally
// everywhere else on the card.
// ---------------------------------------------------------------------------

const ROW_HEIGHT_ESTIMATE = 72; // TaskCard min-h-14 (56) + row py-1*2 + meta row ≈ 72px.

interface DraggableTaskCardProps {
  task: Task;
  listColor?: string;
  /** Stable ref mirror of the current manual-sort order; see `TaskRowProps`. */
  manualIdsRef: React.RefObject<string[]>;
  onReorder: (orderedIds: string[]) => void;
  onOpen: () => void;
  onLongPress: () => void;
  onToggle: () => void;
}

function DraggableTaskCardImpl({
  task,
  listColor,
  manualIdsRef,
  onReorder,
  onOpen,
  onLongPress,
  onToggle,
}: DraggableTaskCardProps) {
  const reduceMotion = useReduceMotion();
  const translateY = useSharedValue(0);
  const dragging = useSharedValue(0);

  // Snapshots the order at gesture start and the last "slot" the drag settled
  // in, so `onChange` only mutates+haptics on an actual slot CROSSING.
  const orderRef = useRef<string[]>(manualIdsRef.current);
  const lastSlotRef = useRef(0);

  const [lifted, setLifted] = useState(false);

  const fireSelectionHaptic = useCallback(() => {
    Haptics.selectionAsync().catch(() => {});
  }, []);

  const fireLiftHaptic = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  }, []);

  const armLift = useCallback(() => {
    orderRef.current = manualIdsRef.current;
    lastSlotRef.current = 0;
    setLifted(true);
  }, [manualIdsRef]);

  const disarmLift = useCallback(() => {
    setLifted(false);
  }, []);

  // Swap the dragged task with the neighbor `deltaSlots` away (±1 per
  // crossing) in the local snapshot, and haptic-tick. Does NOT persist —
  // persistence happens once, on drop.
  const swapSlot = useCallback(
    (deltaSlots: 1 | -1) => {
      const ids = orderRef.current;
      const from = ids.indexOf(task.id);
      const to = from + deltaSlots;
      if (from < 0 || to < 0 || to >= ids.length) return;
      const next = ids.slice();
      const tmp = next[from];
      next[from] = next[to];
      next[to] = tmp;
      orderRef.current = next;
      fireSelectionHaptic();
    },
    [task.id, fireSelectionHaptic],
  );

  const commitDrop = useCallback(() => {
    if (orderRef.current !== manualIdsRef.current) onReorder(orderRef.current);
  }, [manualIdsRef, onReorder]);

  // Screen-reader reorder (P2 a11y fix). Reordering is otherwise drag-only,
  // which a VoiceOver/TalkBack user physically cannot perform — this wires
  // the handle's `accessibilityRole="adjustable"` to real "increment"/
  // "decrement" actions that move the task exactly one slot and commit
  // through the SAME `onReorder` (-> `reorderTasks`) persist path the
  // physical drag uses on drop, just as a single self-contained step instead
  // of the drag's continuous snapshot-then-commit-on-drop flow.
  const moveOneSlot = useCallback(
    (deltaSlots: 1 | -1) => {
      const ids = manualIdsRef.current;
      const from = ids.indexOf(task.id);
      const to = from + deltaSlots;
      if (from < 0 || to < 0 || to >= ids.length) return;
      const next = ids.slice();
      const tmp = next[from];
      next[from] = next[to];
      next[to] = tmp;
      fireSelectionHaptic();
      onReorder(next);
    },
    [manualIdsRef, task.id, fireSelectionHaptic, onReorder],
  );

  const handleAccessibilityAction = useCallback(
    (event: { nativeEvent: { actionName: string } }) => {
      if (event.nativeEvent.actionName === "increment") moveOneSlot(1);
      else if (event.nativeEvent.actionName === "decrement") moveOneSlot(-1);
    },
    [moveOneSlot],
  );

  // Position within the manual list, for `accessibilityValue` — 1-based so
  // "now" reads naturally ("2 of 5") rather than a raw zero-based index.
  const position = manualIdsRef.current.indexOf(task.id);
  const listLength = manualIdsRef.current.length;
  const accessibilityValue =
    position >= 0 ? { min: 1, max: listLength, now: position + 1 } : undefined;

  const pan = useMemo(
    () =>
      Gesture.Pan()
        // The drag handle sits inside the row's `Swipeable`, which owns its
        // own (horizontal) pan gesture. Constraining this handle's gesture to
        // near-vertical movement — and failing fast on horizontal movement —
        // keeps the two from contending: a horizontal touch on the handle
        // falls through to the Swipeable instead of starting a reorder drag.
        .activeOffsetY([-8, 8])
        .failOffsetX([-8, 8])
        .onStart(() => {
          "worklet";
          dragging.value = 1;
          runOnJS(armLift)();
          runOnJS(fireLiftHaptic)();
        })
        .onChange((e) => {
          "worklet";
          translateY.value = e.translationY;
          const slot = Math.round(e.translationY / ROW_HEIGHT_ESTIMATE);
          if (slot !== lastSlotRef.current) {
            const delta = slot > lastSlotRef.current ? 1 : -1;
            lastSlotRef.current = slot;
            runOnJS(swapSlot)(delta as 1 | -1);
          }
        })
        .onEnd(() => {
          "worklet";
          translateY.value = reduceMotion ? 0 : withSpring(0, SPRINGS.tactile);
          dragging.value = 0;
          runOnJS(commitDrop)();
          runOnJS(disarmLift)();
        })
        .onFinalize(() => {
          "worklet";
          if (dragging.value !== 0) {
            translateY.value = reduceMotion ? 0 : withSpring(0, SPRINGS.tactile);
            dragging.value = 0;
            runOnJS(disarmLift)();
          }
        }),
    [armLift, fireLiftHaptic, swapSlot, commitDrop, disarmLift, reduceMotion, translateY, dragging],
  );

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: reduceMotion ? 0 : translateY.value }],
    zIndex: dragging.value !== 0 ? 10 : 0,
  }));

  return (
    <Animated.View style={animatedStyle}>
      <TaskCard
        task={task}
        listColor={listColor}
        onPress={onOpen}
        onLongPress={onLongPress}
        onToggleComplete={onToggle}
        lifted={lifted}
        leading={
          <GestureDetector gesture={pan}>
            <Animated.View
              className="min-w-11 min-h-11 items-center justify-center"
              accessibilityRole="adjustable"
              accessibilityLabel="Reorder task"
              accessibilityHint="Long press and drag to move this task up or down the list. Screen-reader users can also swipe up or down to move it one step."
              accessibilityActions={[
                { name: "increment", label: "Move down" },
                { name: "decrement", label: "Move up" },
              ]}
              onAccessibilityAction={handleAccessibilityAction}
              accessibilityValue={accessibilityValue}
            >
              <Ionicons name="reorder-three-outline" size={22} color="#A8A29A" />
            </Animated.View>
          </GestureDetector>
        }
      />
    </Animated.View>
  );
}

const DraggableTaskCard = React.memo(DraggableTaskCardImpl);

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

// ---------------------------------------------------------------------------
// Due range filter picker (FR-6). A small preset-window picker, distinct from
// the fixed Overdue/Today/This week/Later section buckets — mirrors
// `ScheduleModal`'s bottom-sheet shape for visual consistency.
// ---------------------------------------------------------------------------

interface DueRangeModalProps {
  visible: boolean;
  /** Label of the currently-active preset, or null if no due-range filter is set. */
  activeLabel: string | null;
  onClose: () => void;
  onSelect: (range: DueRange) => void;
  onClear: () => void;
}

function DueRangeModal({ visible, activeLabel, onClose, onSelect, onClear }: DueRangeModalProps) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable
        className="flex-1 bg-black/40 justify-end"
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Dismiss"
      >
        <Pressable className="bg-white rounded-t-2xl p-5 pb-8" onPress={(e) => e.stopPropagation()}>
          <View className="items-center mb-4">
            <View className="w-10 h-1 rounded-full bg-neutral-200" />
          </View>
          <Heading size="h3">Due range</Heading>
          <Text className="text-body text-neutral-500 mt-1 mb-5">
            Show only tasks due in this window.
          </Text>

          <View className="flex-row flex-wrap gap-2 mb-6">
            {DUE_RANGE_PRESETS.map((p) => (
              <Chip
                key={p.label}
                label={p.label}
                selected={activeLabel === p.label}
                onPress={() => {
                  const { start, end } = dueRangeFromDays(p.days);
                  onSelect({ label: p.label, start, end });
                }}
              />
            ))}
          </View>

          {activeLabel && (
            <Button title="Clear due range" variant="secondary" onPress={onClear} />
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
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
      <Pressable
        className="flex-1 bg-black/40 justify-end"
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Dismiss"
      >
        <Pressable
          className="bg-white rounded-t-2xl p-5 pb-8"
          onPress={(e) => e.stopPropagation()}
        >
          <View className="items-center mb-4">
            <View className="w-10 h-1 rounded-full bg-neutral-200" />
          </View>
          <Heading size="h3">Schedule</Heading>
          {task && (
            <Text className="text-body text-neutral-500 mt-1 mb-5" numberOfLines={1}>
              {task.title}
            </Text>
          )}

          <Text className="text-overline font-semibold text-neutral-500 uppercase tracking-wide mb-2.5">
            Duration
          </Text>
          <View className="flex-row flex-wrap gap-2 mb-6">
            {DURATION_OPTIONS.map((d) => (
              <Chip
                key={d}
                label={formatDuration(d)}
                selected={duration === d}
                onPress={() => setDuration(d)}
              />
            ))}
          </View>

          <Text className="text-overline font-semibold text-neutral-500 uppercase tracking-wide mb-2.5">
            Due
          </Text>
          <View className="flex-row flex-wrap gap-2 mb-7">
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
