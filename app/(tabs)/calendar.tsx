import React, { useCallback, useMemo, useRef, useState } from "react";
import { View, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import {
  GestureHandlerRootView,
  Gesture,
  GestureDetector,
} from "react-native-gesture-handler";
import { runOnJS } from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import { useScheduleStore, selectAllBlocks } from "@/store/scheduleStore";
import { useSettingsStore } from "@/store/settingsStore";
import {
  CalendarHeader,
  type CalendarView,
} from "@/components/calendar/CalendarHeader";
import { DayView } from "@/components/calendar/DayView";
import { ThreeDayView } from "@/components/calendar/ThreeDayView";
import { WeekView } from "@/components/calendar/WeekView";
import { MonthView } from "@/components/calendar/MonthView";
import { AgendaView } from "@/components/calendar/AgendaView";
import { EmptyState } from "@/components/ui/EmptyState";
import { PressableScale } from "@/components/ui/PressableScale";
import { AddEventModal } from "@/components/ui/AddEventModal";
import {
  DEFAULT_PX_PER_HOUR,
  nearestZoomStop,
  stepZoom,
  ZOOM_STOPS_PX_PER_HOUR,
  type ZoomPxPerHour,
} from "@/core/calendar";
import { dayStart } from "@/components/calendar/hours";
import type { ScheduledBlock } from "@/types";
import { iconSizes } from "@/utils/design-tokens";

/** Views that render the vertical time grid — pinch-to-zoom applies to these. */
const TIME_GRID_VIEWS: readonly CalendarView[] = ["day", "3day", "week"];

/** Coerce an arbitrary persisted string into a valid CalendarView (falls back to the phone default). */
function coerceView(value: string | undefined): CalendarView {
  switch (value) {
    case "day":
    case "3day":
    case "week":
    case "month":
    case "agenda":
      return value;
    default:
      return "3day"; // PRD FR-23 phone default
  }
}

/**
 * Calendar tab host (PRD FR-23..FR-28). Owns the two pieces of calendar UI
 * state — the active view and the visible anchor date — plus the vertical zoom,
 * and threads them into the presentational views. The view + zoom are persisted
 * to Settings (calendarView / calendarZoomPxPerHour) so a return trip restores
 * the user's last layout.
 *
 * Navigation, block/day taps, pinch-to-zoom, and "Rebuild schedule" all live
 * here; the individual views stay presentational and reusable.
 */
export default function CalendarScreen() {
  // Persisted preferences (optional on Settings; default here when a restored
  // blob predates the fields).
  const persistedView = useSettingsStore((s) => s.settings.calendarView);
  const persistedZoom = useSettingsStore((s) => s.settings.calendarZoomPxPerHour);
  const updateSettings = useSettingsStore((s) => s.updateSettings);

  const [view, setView] = useState<CalendarView>(() => coerceView(persistedView));
  const [date, setDate] = useState<number>(() => dayStart(Date.now()));
  const [pxPerHour, setPxPerHour] = useState<ZoomPxPerHour>(() =>
    nearestZoomStop(persistedZoom ?? DEFAULT_PX_PER_HOUR)
  );

  // Whether the engine has produced ANY blocks. A reactive scalar (a length
  // check) so this subscription never returns a fresh array — no useShallow
  // needed, and the per-day/per-week slicing stays inside each view.
  const hasBlocks = useScheduleStore((s) => selectAllBlocks(s).length > 0);

  // --- Persisted view + zoom setters -------------------------------------

  const handleViewChange = useCallback(
    (next: CalendarView) => {
      setView(next);
      updateSettings({ calendarView: next });
    },
    [updateSettings]
  );

  const commitZoom = useCallback(
    (next: ZoomPxPerHour) => {
      setPxPerHour((prev) => {
        if (prev !== next) {
          Haptics.selectionAsync().catch(() => {});
          updateSettings({ calendarZoomPxPerHour: next });
        }
        return next;
      });
    },
    [updateSettings]
  );

  const zoomBy = useCallback(
    (dir: 1 | -1) => commitZoom(stepZoom(pxPerHour, dir)),
    [commitZoom, pxPerHour]
  );

  // --- Navigation targets ------------------------------------------------

  const openTask = useCallback((taskId: string) => {
    if (!taskId) return;
    router.push(`/task/${taskId}`);
  }, []);

  const openBlock = useCallback(
    (block: ScheduledBlock) => openTask(block.taskId),
    [openTask]
  );

  // Month/Week day tap -> drop into Day view anchored on that day.
  const openDay = useCallback(
    (dayMs: number) => {
      Haptics.selectionAsync().catch(() => {});
      setDate(dayStart(dayMs));
      handleViewChange("day");
    },
    [handleViewChange]
  );

  const rebuildSchedule = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    useScheduleStore.getState().recompute();
  }, []);

  // --- Add event (non-gesture path to AddEventModal) ---------------------
  // The required non-gesture alternative to the time grid's long-press-to-
  // create (FR-28): a plain button, always visible regardless of which
  // calendar view is active, so Events stay reachable even from Month/Week/
  // Agenda, which don't render a long-press-able time grid at all.
  const [addEventVisible, setAddEventVisible] = useState(false);
  const openAddEvent = useCallback(() => setAddEventVisible(true), []);

  // --- Pinch-to-zoom (time-grid views only) ------------------------------
  // A live scale accumulates during the gesture; on end it resolves to the
  // nearest defined zoom stop (FR-24 is discrete 40/60/80/120, not continuous).
  // `livePxRef` always mirrors the current zoom so the JS callbacks (run off the
  // UI thread) never read a stale closure; `pinchStartRef` snapshots the zoom at
  // gesture start.
  const isTimeGrid = TIME_GRID_VIEWS.includes(view);
  const livePxRef = useRef(pxPerHour);
  livePxRef.current = pxPerHour;
  const pinchStartRef = useRef(pxPerHour);

  const rememberPinchStart = useCallback(() => {
    pinchStartRef.current = livePxRef.current;
  }, []);
  const resolvePinch = useCallback(
    (scale: number) => {
      commitZoom(nearestZoomStop(pinchStartRef.current * scale));
    },
    [commitZoom]
  );

  const pinch = useMemo(
    () =>
      Gesture.Pinch()
        .enabled(isTimeGrid)
        .onStart(() => {
          "worklet";
          runOnJS(rememberPinchStart)();
        })
        .onEnd((e) => {
          "worklet";
          runOnJS(resolvePinch)(e.scale);
        }),
    [isTimeGrid, rememberPinchStart, resolvePinch]
  );

  // --- Active view ------------------------------------------------------

  const anchorDate = useMemo(() => new Date(date), [date]);

  const body = useMemo(() => {
    switch (view) {
      case "day":
        return (
          <DayView
            date={anchorDate}
            pxPerHour={pxPerHour}
            onBlockPress={openTask}
          />
        );
      case "3day":
        return (
          <ThreeDayView
            date={anchorDate}
            pxPerHour={pxPerHour}
            onBlockPress={openTask}
          />
        );
      case "week":
        return (
          <WeekView date={date} pxPerHour={pxPerHour} onBlockPress={openBlock} />
        );
      case "month":
        return (
          <MonthView
            date={date}
            onDayPress={openDay}
            onBlockPress={openBlock}
          />
        );
      case "agenda":
        return <AgendaView date={date} onBlockPress={openBlock} />;
      default:
        return null;
    }
  }, [view, anchorDate, date, pxPerHour, openTask, openBlock, openDay]);

  const showEmpty = !hasBlocks && view !== "agenda"; // AgendaView renders its own empty state.

  return (
    <SafeAreaView className="flex-1 bg-neutral-100" edges={["top"]}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <CalendarHeader
          view={view}
          onViewChange={handleViewChange}
          date={date}
          onDateChange={setDate}
        />

        {/* Action bar: Rebuild schedule + Add event (always) + zoom stepper (time-grid views). */}
        <View className="flex-row items-center justify-between px-5 pb-2">
          <View className="flex-row items-center gap-2">
            <ActionButton
              icon="sparkles-outline"
              label="Rebuild"
              accessibilityLabel="Rebuild schedule"
              accessibilityHint="Recomputes your scheduled times"
              onPress={rebuildSchedule}
            />
            <ActionButton
              icon="add-circle-outline"
              label="Add event"
              accessibilityLabel="Add event"
              accessibilityHint="Create a fixed event on your calendar"
              onPress={openAddEvent}
            />
          </View>

          {isTimeGrid ? (
            <ZoomStepper pxPerHour={pxPerHour} onZoom={zoomBy} />
          ) : (
            <View />
          )}
        </View>

        {/* The active view, or the global empty state when nothing is scheduled. */}
        <View className="flex-1">
          {showEmpty ? (
            <View className="flex-1 items-center justify-center">
              <EmptyState
                icon="calendar-outline"
                title="Nothing scheduled yet"
                subtitle="Add a task with a due date and it lands here."
                actionLabel="Add a task"
                onAction={() => router.push("/task/new")}
              />
            </View>
          ) : isTimeGrid ? (
            // Wrap time-grid views in the pinch detector. The views own their
            // own vertical ScrollView + drag gestures; Pinch composes cleanly
            // (two-finger) without stealing single-finger scroll / long-press.
            <GestureDetector gesture={pinch}>
              <View className="flex-1">{body}</View>
            </GestureDetector>
          ) : (
            body
          )}
        </View>
      </GestureHandlerRootView>

      {/* Non-gesture path to create an Event (see `openAddEvent` above). A
          fresh instance from a long-press on the grid itself also exists,
          scoped per day-column inside DayView/ThreeDayView — this one is the
          screen-level fallback reachable from every view. */}
      <AddEventModal
        visible={addEventVisible}
        onClose={() => setAddEventVisible(false)}
        onSave={({ title, start, end }) =>
          useScheduleStore.getState().addLocalEvent({ title, start, end })
        }
      />
    </SafeAreaView>
  );
}

/** A subtle ghost text-icon action (Rebuild). */
function ActionButton({
  icon,
  label,
  accessibilityLabel,
  accessibilityHint,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  accessibilityLabel: string;
  accessibilityHint?: string;
  onPress: () => void;
}) {
  return (
    <PressableScale
      onPress={onPress}
      haptic={false}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      className="flex-row items-center gap-1.5 px-3 h-9 rounded-full bg-white border border-neutral-200"
    >
      <Ionicons name={icon} size={iconSizes.xs} color="#2563EB" />
      <Text className="text-caption font-medium text-primary-600">{label}</Text>
    </PressableScale>
  );
}

/**
 * Discrete zoom stepper — the accessible / non-pinch path across the FR-24
 * stops (40/60/80/120 px/hr). Minus/plus disable at the ends. Pairs with the
 * pinch gesture on the time grid.
 */
function ZoomStepper({
  pxPerHour,
  onZoom,
}: {
  pxPerHour: number;
  onZoom: (dir: 1 | -1) => void;
}) {
  const stop = nearestZoomStop(pxPerHour);
  const idx = ZOOM_STOPS_PX_PER_HOUR.indexOf(stop);
  const atMin = idx <= 0;
  const atMax = idx >= ZOOM_STOPS_PX_PER_HOUR.length - 1;

  return (
    <View
      className="flex-row items-center rounded-full bg-white border border-neutral-200"
      accessibilityRole="adjustable"
      accessibilityLabel="Time grid zoom"
      accessibilityValue={{ text: `Level ${idx + 1} of ${ZOOM_STOPS_PX_PER_HOUR.length}` }}
    >
      <ZoomButton
        icon="remove"
        label="Zoom out"
        disabled={atMin}
        onPress={() => onZoom(-1)}
      />
      <View className="w-[1px] h-5 bg-neutral-200" />
      <ZoomButton
        icon="add"
        label="Zoom in"
        disabled={atMax}
        onPress={() => onZoom(1)}
      />
    </View>
  );
}

function ZoomButton({
  icon,
  label,
  disabled,
  onPress,
}: {
  icon: "add" | "remove";
  label: string;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <PressableScale
      onPress={onPress}
      haptic={false}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      className="w-9 h-9 items-center justify-center"
    >
      <Ionicons
        name={icon}
        size={18}
        color={disabled ? "#D7D3CC" : "#44403C"}
      />
    </PressableScale>
  );
}
