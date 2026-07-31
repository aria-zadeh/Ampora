/**
 * AddEventModal — create/edit a fixed local Event (PRD FR-1, FR-28; §8.6).
 *
 * Reached from two places on the Calendar tab:
 *   - Long-press empty space on the time grid (`DayView`/`ThreeDayView` via
 *     `DayBlocksLayer`), prefilled with the pressed time snapped to the 5-min
 *     grid (FR-28).
 *   - The "Add event" toolbar button (`app/(tabs)/calendar.tsx`) — the
 *     required non-gesture alternative, reachable regardless of which
 *     calendar view is active.
 *
 * Also reused as the EDIT form (`EventActionSheet`'s "Edit event" row) by
 * passing `event`, which prefills every field from the real record.
 *
 * Presentational + store-agnostic, matching `BlockActionSheet`'s convention:
 * `onSave` is the only mutation callback — the caller decides whether it's a
 * create (`addLocalEvent`) or an edit (`updateLocalEvent`) based on whether
 * it passed `event` in the first place.
 */
import React, { useEffect, useState } from "react";
import { View, Text, Pressable, TextInput, Modal } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import Animated, { FadeIn, FadeInUp } from "react-native-reanimated";

import { Heading } from "@/components/ui/Heading";
import { Button } from "@/components/ui/Button";
import { DateTimePickerCrossPlatform } from "@/components/ui/DateTimePickerCrossPlatform";
import { Toggle } from "@/components/settings/SettingsPrimitives";
import { allDaySpan, allDayDisplayEnd } from "@/components/calendar/allDayEvents";
import { shadows } from "@/utils/design-tokens";
import { DURATIONS } from "@/utils/motion";
import { useReduceMotion } from "@/hooks/useReduceMotion";
import { MS_PER_MIN } from "@/core/calendar";
import type { CalEvent } from "@/types";

/** Default length for a freshly created event (toolbar button, or a long-press with no other signal). */
const DEFAULT_DURATION_MIN = 60;

export interface AddEventModalProps {
  visible: boolean;
  onClose: () => void;
  /** Present when editing an existing LOCAL event; omitted (or null) when creating a new one. */
  event?: CalEvent | null;
  /**
   * Prefilled start instant for a fresh create (e.g. the long-pressed grid
   * time, already snapped to 5 min per FR-28). Ignored when `event` is set.
   * Defaults to now.
   */
  initialStart?: number;
  /** Fires once, with the committed fields; the caller decides create vs. edit. */
  onSave: (input: { title: string; start: number; end: number; allDay: boolean }) => void;
}

export function AddEventModal({
  visible,
  onClose,
  event,
  initialStart,
  onSave,
}: AddEventModalProps) {
  const reduceMotion = useReduceMotion();
  const isEditing = event != null;

  const [title, setTitle] = useState("");
  const [start, setStart] = useState<Date>(() => new Date());
  const [end, setEnd] = useState<Date>(() => new Date());
  const [allDay, setAllDay] = useState(false);

  // Re-seed every time the sheet opens for a (possibly different) target —
  // mirrors BlockActionSheet's own re-seed-on-open effect.
  useEffect(() => {
    if (!visible) return;
    if (event) {
      setTitle(event.title);
      setStart(new Date(event.start));
      // Stored end is EXCLUSIVE (the next local midnight after the event's
      // last active day, matching `services/calendarSync.ts`'s device-synced
      // convention) — shift the DISPLAYED end back onto that last active day
      // so the "Ends" picker shows it, not the day after (`allDayDisplayEnd`).
      setEnd(new Date(event.allDay ? allDayDisplayEnd(event.end) : event.end));
      setAllDay(!!event.allDay);
    } else {
      const s = initialStart ?? Date.now();
      setTitle("");
      setStart(new Date(s));
      setEnd(new Date(s + DEFAULT_DURATION_MIN * MS_PER_MIN));
      setAllDay(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, event?.id, initialStart]);

  const handleSave = () => {
    if (allDay) {
      // Whole local days, exclusive-next-midnight end — matches
      // `services/calendarSync.ts#toCalEvent`'s device-synced convention (see
      // `allDaySpan`) so a local and a synced all-day event are shaped
      // identically downstream. Only the DATE portion of the pickers matters;
      // any time-of-day dialed in before toggling All-day on is discarded.
      const { start: s, end: e } = allDaySpan(start.getTime(), end.getTime());
      onSave({ title: title.trim(), start: s, end: e, allDay: true });
      onClose();
      return;
    }
    const s = start.getTime();
    // Never trap the user behind a validation error — an end at/before start
    // silently bumps forward instead (mirrors BlockActionSheet's own
    // `Math.max(now, draft)` defensive clamp on its custom-time path).
    const e = end.getTime() > s ? end.getTime() : s + 5 * MS_PER_MIN;
    onSave({ title: title.trim(), start: s, end: e, allDay: false });
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType={reduceMotion ? "fade" : "slide"}
      onRequestClose={onClose}
      accessibilityViewIsModal
    >
      <Pressable
        className="flex-1 bg-black/40"
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Dismiss"
      >
        <View className="flex-1 justify-end">
          <Pressable onPress={() => {}}>
            <Animated.View
              entering={reduceMotion ? FadeIn.duration(DURATIONS.base) : FadeInUp.duration(DURATIONS.base)}
              className="rounded-t-3xl bg-neutral-100"
              style={shadows.xl}
            >
              <SafeAreaView edges={["bottom"]}>
                {/* Grabber */}
                <View className="items-center pt-3">
                  <View className="h-1.5 w-10 rounded-full bg-neutral-300" />
                </View>

                {/* Header */}
                <View className="flex-row items-center justify-between px-5 pb-1 pt-3">
                  <Heading size="h3">{isEditing ? "Edit event" : "Add event"}</Heading>
                  <Pressable
                    onPress={onClose}
                    hitSlop={8}
                    className="h-9 w-9 items-center justify-center rounded-full bg-white"
                    style={shadows.xs}
                    accessibilityRole="button"
                    accessibilityLabel="Close"
                  >
                    <Ionicons name="close" size={20} color="#57534E" />
                  </Pressable>
                </View>

                <View className="px-5 pb-4 pt-3">
                  {/* Title */}
                  <Text className="mb-1.5 px-1 text-caption font-medium text-neutral-500">
                    Title (optional)
                  </Text>
                  <TextInput
                    value={title}
                    onChangeText={setTitle}
                    placeholder="e.g. Soccer practice"
                    placeholderTextColor="#A8A29A"
                    className="mb-4 min-h-[44px] rounded-xl border border-neutral-200 bg-white px-4 py-3 text-body text-neutral-900"
                    accessibilityLabel="Event title"
                  />

                  {/* All day — collapses the time pickers below (an all-day
                      event has no meaningful clock time) and shapes the saved
                      span to whole local days on Save (see `allDaySpan`). */}
                  <View className="mb-4 flex-row items-center justify-between rounded-xl border border-neutral-200 bg-white px-4 py-3">
                    <Text className="text-body text-neutral-900">All day</Text>
                    <Toggle value={allDay} onChange={setAllDay} a11yLabel="All-day event" />
                  </View>

                  {/* Starts */}
                  <Text className="mb-1.5 px-1 text-caption font-medium text-neutral-500">Starts</Text>
                  <View className="mb-4 flex-row gap-2">
                    <View className="flex-1">
                      <DateTimePickerCrossPlatform
                        mode="date"
                        value={start}
                        onChange={setStart}
                        accessibilityLabel="Event start date"
                      />
                    </View>
                    {!allDay ? (
                      <View className="flex-1">
                        <DateTimePickerCrossPlatform
                          mode="time"
                          value={start}
                          onChange={setStart}
                          accessibilityLabel="Event start time"
                        />
                      </View>
                    ) : null}
                  </View>

                  {/* Ends */}
                  <Text className="mb-1.5 px-1 text-caption font-medium text-neutral-500">Ends</Text>
                  <View className="mb-6 flex-row gap-2">
                    <View className="flex-1">
                      <DateTimePickerCrossPlatform
                        mode="date"
                        value={end}
                        minimumDate={start}
                        onChange={setEnd}
                        accessibilityLabel="Event end date"
                      />
                    </View>
                    {!allDay ? (
                      <View className="flex-1">
                        <DateTimePickerCrossPlatform
                          mode="time"
                          value={end}
                          onChange={setEnd}
                          accessibilityLabel="Event end time"
                        />
                      </View>
                    ) : null}
                  </View>

                  <Button
                    title={isEditing ? "Save changes" : "Add event"}
                    variant="primaryBlue"
                    onPress={handleSave}
                    accessibilityLabel={isEditing ? "Save event changes" : "Save new event"}
                  />
                </View>
              </SafeAreaView>
            </Animated.View>
          </Pressable>
        </View>
      </Pressable>
    </Modal>
  );
}
