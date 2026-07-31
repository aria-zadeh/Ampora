import React, { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, Pressable, Modal } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useShallow } from "zustand/react/shallow";
import { useTaskStore } from "@/store/taskStore";
import { useScheduleStore, selectAllCalEvents } from "@/store/scheduleStore";
import { Button } from "@/components/ui/Button";
import { Heading } from "@/components/ui/Heading";
import { colors, shadows } from "@/utils/design-tokens";
import { getBlockingEventFix } from "./blockingEvent";
import { SOURCE_LABEL } from "@/components/calendar/EventActionSheet";
import type { CalEvent, SchedulingHours, Task } from "@/types";
import type { Unschedulable } from "@/core/scheduler";

/**
 * Push a due date out by one week from whichever is later: the task's
 * current due, or now (so a `past_deadline` task moves into the future
 * instead of merely less-far-in-the-past). Normalized to 23:59 local,
 * matching the app's own due-date convention for date-only edits
 * (`app/(tabs)/tasks.tsx#tomorrowDue`, `core/quick-add.ts`).
 */
function pushDeadlineOneWeek(currentDue: number | undefined, now: number): number {
  const base = new Date(Math.max(currentDue ?? now, now));
  base.setDate(base.getDate() + 7);
  base.setHours(23, 59, 0, 0);
  return base.getTime();
}

/**
 * A fully open, every-day, all-day scheduling-hours window — the "relax
 * scheduling hours" one-tap fix (PRD FR-20). Set as a per-task override so it
 * wins over any list/settings default regardless of what the current
 * effective window is (`Task.schedulingHours ?? List.schedulingHours ??
 * Settings.schedulingHours`, FR-13) — this always strictly widens
 * availability, so no fix is left silently doing nothing.
 */
function anyTimeSchedulingHours(): SchedulingHours {
  return {
    perDay: [0, 1, 2, 3, 4, 5, 6].map((day) => ({ day, windows: [{ start: 0, end: 24 * 60 }] })),
  };
}

interface FixAction {
  key: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  hint: string;
  onPress: () => void;
}

export interface UnschedulableFixSheetProps {
  /** The at-risk task this sheet explains, or null when closed. */
  task: Task | null;
  /** The engine's reason for `task`, resolved by the caller (may be stale by one recompute — see `app/(tabs)/tasks.tsx`). */
  info: Unschedulable | undefined;
  onClose: () => void;
}

/**
 * FR-20's "explain why + one-tap fix" surface. A calm bottom sheet — same
 * chrome as `ScheduleModal`/`DueRangeModal` in `app/(tabs)/tasks.tsx` — that
 * shows the engine's own human-readable reason a task could not be placed,
 * plus zero or more one-tap fixes appropriate to that reason's `kind`. Never
 * blames the user: a task the app could not schedule is the app's problem to
 * explain (CLAUDE.md "no shame copy" rule), so this only ever states the
 * constraint and offers a way past it.
 *
 * Each fix applies its patch via the existing `taskStore.updateTask` and then
 * calls `scheduleStore.recompute()` directly so the result is visible the
 * moment the sheet closes, rather than waiting on the debounced background
 * recompute trigger already wired in `store/scheduleStore.ts` (that trigger
 * still fires a moment later too; recomputing twice on unchanged input is
 * cheap and harmless — `core/scheduler/recompute.ts`'s stability pass makes
 * the second run a no-op).
 */
export function UnschedulableFixSheet({ task, info, onClose }: UnschedulableFixSheetProps) {
  const updateTask = useTaskStore((s) => s.updateTask);
  const completeTask = useTaskStore((s) => s.completeTask);
  const recompute = useScheduleStore((s) => s.recompute);
  const updateLocalEvent = useScheduleStore((s) => s.updateLocalEvent);
  const deleteLocalEvent = useScheduleStore((s) => s.deleteLocalEvent);
  // NEW array from the store -> MUST use useShallow (Zustand v5, project rule).
  const calEvents = useScheduleStore(useShallow(selectAllCalEvents));

  // Armed only while the user is confirming "Remove the blocking event"
  // (destructive — doc 02 "confirm destructive actions"). Reset whenever the
  // sheet is retargeted (a new at-risk task, or closed back to null) so a
  // stale confirm panel never survives into the next task it's opened for.
  const [confirmDeleteEvent, setConfirmDeleteEvent] = useState<CalEvent | null>(null);
  useEffect(() => {
    setConfirmDeleteEvent(null);
  }, [task?.id]);

  const applyFix = useCallback(
    (patch: Partial<Task>) => {
      if (!task) return;
      updateTask(task.id, patch);
      recompute();
      onClose();
    },
    [task, updateTask, recompute, onClose],
  );

  const handleMarkDone = useCallback(() => {
    if (!task) return;
    completeTask(task.id);
    recompute();
    onClose();
  }, [task, completeTask, recompute, onClose]);

  // FR-20's fifth remedy: "remove a blocking all-day event" (now that event
  // CRUD exists — `store/scheduleStore.ts#addLocalEvent/updateLocalEvent/
  // deleteLocalEvent`). Only relevant to the "not enough free time" family of
  // reasons; an all-day CalEvent sitting in the task's window is exactly that
  // kind of obstacle (see `components/schedule/blockingEvent.ts`).
  const blockingFix = useMemo(() => {
    if (!task || !info) return undefined;
    if (
      info.kind !== "no_free_time" &&
      info.kind !== "no_free_time_undated" &&
      info.kind !== "partially_placed"
    ) {
      return undefined;
    }
    return getBlockingEventFix(task, calEvents, Date.now());
  }, [task, info, calEvents]);

  // Shortening trims ONE edge of the event via `updateLocalEvent` (which
  // recomputes internally — see that action's own doc comment) — the "less
  // damaging" option than deleting, since the rest of the event survives.
  const handleShorten = useCallback(() => {
    if (!blockingFix?.shortenPatch) return;
    updateLocalEvent(blockingFix.event.id, blockingFix.shortenPatch);
    onClose();
  }, [blockingFix, updateLocalEvent, onClose]);

  // Deleting is destructive, so this only ever runs after the user confirms
  // via the panel below — never directly from a fix button.
  const handleConfirmDeleteEvent = useCallback(() => {
    if (!confirmDeleteEvent) return;
    deleteLocalEvent(confirmDeleteEvent.id); // also recomputes internally
    setConfirmDeleteEvent(null);
    onClose();
  }, [confirmDeleteEvent, deleteLocalEvent, onClose]);

  // One-tap fixes, chosen from the engine's own `kind` (never by re-parsing
  // the prose reason) — see `core/scheduler/types.ts#UnschedulableReasonKind`.
  // Each maps directly to one of the remedies FR-20 names in prose: relax
  // scheduling hours, extend the deadline, make it splittable. The fifth
  // remedy, "remove a blocking all-day event", is handled by `blockingFix`
  // above: its SHORTEN half fits this same one-tap shape and is folded in
  // below (led with, since it names the actual obstacle); its DELETE half
  // needs a destructive confirm step first, so it's rendered separately, not
  // as a plain FixAction.
  const fixes = useMemo<FixAction[]>(() => {
    if (!task || !info) return [];
    const now = Date.now();
    const out: FixAction[] = [];

    if (blockingFix?.editable && blockingFix.shortenPatch) {
      out.push({
        key: "shorten-event",
        label: "Shorten the blocking event",
        icon: "calendar-clear-outline",
        hint: `Trims "${blockingFix.event.title}" so it no longer covers ${task.title}'s window`,
        onPress: handleShorten,
      });
    }

    const canExtendDeadline =
      info.kind === "past_deadline" || info.kind === "no_free_time" || info.kind === "partially_placed";
    if (canExtendDeadline) {
      out.push({
        key: "extend",
        label: "Extend deadline by a week",
        icon: "calendar-outline",
        hint: `Moves the deadline for ${task.title} out by a week so there is more room to place it`,
        onPress: () => applyFix({ due: pushDeadlineOneWeek(task.due, now) }),
      });
    }

    if (info.kind === "past_deadline") {
      out.push({
        key: "done",
        label: "Mark done instead",
        icon: "checkmark-circle-outline",
        hint: `Marks ${task.title} complete instead of rescheduling it`,
        onPress: handleMarkDone,
      });
    }

    const canRelaxHours =
      info.kind === "no_free_time" || info.kind === "no_free_time_undated" || info.kind === "partially_placed";
    if (canRelaxHours) {
      out.push({
        key: "anytime",
        label: "Allow scheduling at any time",
        icon: "time-outline",
        hint: `Removes ${task.title}'s scheduling-hours restriction so it can be placed anytime`,
        onPress: () => applyFix({ schedulingHours: anyTimeSchedulingHours() }),
      });
    }

    const canSplit =
      !task.splittable && (info.kind === "no_free_time" || info.kind === "no_free_time_undated");
    if (canSplit) {
      out.push({
        key: "split",
        label: "Split into sessions",
        icon: "cut-outline",
        hint: `Allows ${task.title} to be broken into multiple shorter sessions instead of one sitting`,
        onPress: () => applyFix({ splittable: true }),
      });
    }

    if (info.kind === "zero_duration") {
      out.push({
        key: "duration",
        label: "Set duration to 30 min",
        icon: "hourglass-outline",
        hint: `Gives ${task.title} a 30-minute estimate so the engine has something to place`,
        onPress: () => applyFix({ durationMin: 30 }),
      });
    }

    return out;
  }, [task, info, applyFix, handleMarkDone, blockingFix, handleShorten]);

  const visible = task != null && info != null;

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

          <View className="flex-row items-center gap-2">
            <Ionicons name="alert-circle-outline" size={18} color="#C2410C" />
            <Heading size="h3">Couldn&apos;t schedule</Heading>
          </View>
          {task && (
            <Text className="text-body text-neutral-500 mt-1 mb-4" numberOfLines={2}>
              {task.title}
            </Text>
          )}

          {info && (
            <Text className="text-body text-neutral-700 mb-6">{info.reason}</Text>
          )}

          {confirmDeleteEvent ? (
            <DeleteEventConfirm
              event={confirmDeleteEvent}
              onCancel={() => setConfirmDeleteEvent(null)}
              onConfirm={handleConfirmDeleteEvent}
            />
          ) : (
            <>
              {fixes.length > 0 ? (
                <View className="gap-2 mb-2">
                  {fixes.map((fix) => (
                    <Button
                      key={fix.key}
                      title={fix.label}
                      variant="secondary"
                      icon={<Ionicons name={fix.icon} size={16} color="#2563EB" />}
                      onPress={fix.onPress}
                      accessibilityLabel={fix.label}
                      accessibilityHint={fix.hint}
                    />
                  ))}
                </View>
              ) : null}

              {/* FR-20's fifth remedy, delete half. Only `source: 'local'` events
                  are ours to edit (FR-22) — a device-synced blocker says so
                  honestly instead of offering an action that cannot work. */}
              {blockingFix ? (
                blockingFix.editable ? (
                  <View className="mb-2">
                    <Button
                      title="Remove the blocking event"
                      variant="secondary"
                      icon={<Ionicons name="trash-outline" size={16} color={colors.light.dangerStrong} />}
                      onPress={() => setConfirmDeleteEvent(blockingFix.event)}
                      accessibilityLabel="Remove the blocking event"
                      accessibilityHint={`Asks you to confirm, then deletes "${blockingFix.event.title}" from your calendar`}
                    />
                  </View>
                ) : (
                  <View
                    className="flex-row items-start gap-3 rounded-xl border border-neutral-200 bg-white px-4 py-3 mb-2"
                    style={shadows.xs}
                    accessibilityLabel={`"${blockingFix.event.title}" is on your ${SOURCE_LABEL[blockingFix.event.source]} calendar and is in the way. Edit or remove it there to free this time.`}
                  >
                    <Ionicons name="link-outline" size={20} color={colors.light.textMuted} style={{ marginTop: 1 }} />
                    <Text className="flex-1 text-body text-neutral-600">
                      &quot;{blockingFix.event.title}&quot; on your {SOURCE_LABEL[blockingFix.event.source]}{" "}
                      calendar is in the way. Ampora only reads it — edit or remove it there to free this
                      time.
                    </Text>
                  </View>
                )
              ) : null}

              {fixes.length === 0 && !blockingFix ? (
                <Text className="text-caption text-neutral-500 mb-2">
                  This clears up on its own once the other task is scheduled or finished — nothing to
                  fix here.
                </Text>
              ) : null}

              <View className="mt-4">
                <Button title="Close" variant="ghost" onPress={onClose} accessibilityLabel="Close" />
              </View>
            </>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/**
 * The destructive-confirm step for "Remove the blocking event" (doc 02
 * "confirm destructive actions... never trap the user" — Cancel always backs
 * out to the fixes list, never closes the whole sheet outright).
 */
function DeleteEventConfirm({
  event,
  onCancel,
  onConfirm,
}: {
  event: CalEvent;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <View>
      <View
        className="flex-row items-start gap-3 rounded-xl border border-danger-100 bg-danger-100/50 px-4 py-3 mb-4"
        style={shadows.xs}
      >
        <Ionicons name="warning-outline" size={20} color={colors.light.dangerStrong} style={{ marginTop: 1 }} />
        <View className="flex-1">
          <Text className="text-body font-semibold text-neutral-900">
            Delete &quot;{event.title}&quot;?
          </Text>
          <Text className="mt-1 text-caption text-neutral-600">
            This removes it from your calendar for good.
          </Text>
        </View>
      </View>
      <View className="flex-row gap-2">
        <View className="flex-1">
          <Button title="Cancel" variant="secondary" onPress={onCancel} accessibilityLabel="Cancel" />
        </View>
        <View className="flex-1">
          <Button
            title="Delete event"
            variant="destructive"
            onPress={onConfirm}
            accessibilityLabel="Delete event"
            accessibilityHint={`Permanently deletes "${event.title}" from your calendar`}
          />
        </View>
      </View>
    </View>
  );
}
