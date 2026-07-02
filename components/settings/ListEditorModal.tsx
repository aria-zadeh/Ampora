import React, { useEffect, useMemo, useState } from "react";
import { View, Text, TextInput, Pressable, Modal, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Button } from "@/components/ui/Button";
import { Heading } from "@/components/ui/Heading";
import { PressableScale } from "@/components/ui/PressableScale";
import { Stepper } from "@/components/settings/SettingsPrimitives";
import { useListStore, selectListById } from "@/store/listStore";
import { shadows } from "@/utils/design-tokens";
import type { List, SchedulingHours } from "@/types";

// Shared swatch set, matching the task editor's palette.
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

/** Weekdays Mon-Fri as Date#getDay() indices (1 = Mon ... 5 = Fri). */
const WEEKDAYS = [1, 2, 3, 4, 5];

/** Clock label for a 24h hour integer, e.g. 15 -> "3:00 PM". */
function formatHour(hour: number): string {
  const norm = hour === 24 ? 12 : ((hour + 11) % 12) + 1;
  const suffix = hour < 12 || hour === 24 ? "AM" : "PM";
  return `${norm}:00 ${suffix}`;
}

/**
 * Read a compact { start, end } weekday window (in hours) out of a
 * SchedulingHours template, if it has any windows. Used to seed the compact
 * editor from an existing per-list override.
 */
function readWeekdayWindow(
  hours: SchedulingHours | undefined
): { startHour: number; endHour: number } | null {
  if (!hours) return null;
  const withWindows = hours.perDay.find((d) => d.windows.length > 0);
  if (!withWindows) return null;
  const w = withWindows.windows[0];
  return { startHour: Math.floor(w.start / 60), endHour: Math.floor(w.end / 60) };
}

/** Build a Mon-Fri SchedulingHours template from an hours window. */
function buildWeekdayHours(startHour: number, endHour: number): SchedulingHours {
  return {
    perDay: WEEKDAYS.map((day) => ({
      day,
      windows: [{ start: startHour * 60, end: endHour * 60 }],
    })),
  };
}

export interface ListEditorModalProps {
  /** The list to edit, or null when closed. */
  listId: string | null;
  onClose: () => void;
}

/**
 * Compact list editor (FR-6 / FR-13): edit a list's name, color, and an
 * optional per-list scheduling-hours override. The override is a simple
 * weekday window (matching onboarding's model) with an explicit "Use my default
 * hours" toggle — a full seven-day editor lives in Busy times. Persists through
 * `useListStore.updateList`. Token-driven, a11y-labelled, reduce-motion-safe
 * (the RN Modal's built-in slide honours OS reduce-motion).
 */
export function ListEditorModal({ listId, onClose }: ListEditorModalProps) {
  const list = useListStore((s) =>
    listId ? selectListById(listId)(s) : undefined
  );
  const updateList = useListStore((s) => s.updateList);

  const [name, setName] = useState("");
  const [color, setColor] = useState<string>(COLOR_SWATCHES[0]);
  const [hoursEnabled, setHoursEnabled] = useState(false);
  const [startHour, setStartHour] = useState(15); // 3 PM
  const [endHour, setEndHour] = useState(21); // 9 PM

  // Seed local state whenever a different list is opened.
  useEffect(() => {
    if (!list) return;
    setName(list.name);
    setColor(list.color);
    const win = readWeekdayWindow(list.schedulingHours);
    setHoursEnabled(win != null);
    if (win) {
      setStartHour(win.startHour);
      setEndHour(win.endHour);
    } else {
      setStartHour(15);
      setEndHour(21);
    }
  }, [list]);

  const visible = list != null;
  const nameValid = name.trim().length > 0;

  const summary = useMemo(() => {
    if (!hoursEnabled) return "Uses your default scheduling hours";
    return `Weekdays · ${formatHour(startHour)}–${formatHour(endHour)}`;
  }, [hoursEnabled, startHour, endHour]);

  const handleSave = () => {
    if (!list || !nameValid) return;
    const patch: Partial<Omit<List, "id" | "createdAt">> = {
      name: name.trim(),
      color,
      // Set the override when enabled; clear it (undefined) to fall back to the
      // app default when the user turns it off.
      schedulingHours: hoursEnabled
        ? buildWeekdayHours(startHour, endHour)
        : undefined,
    };
    Haptics.selectionAsync().catch(() => {});
    updateList(list.id, patch);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable
        className="flex-1 bg-black/40 justify-end"
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Dismiss"
      >
        <Pressable
          className="bg-white rounded-t-2xl"
          onPress={(e) => e.stopPropagation()}
        >
          <ScrollView
            contentContainerClassName="p-5 pb-8"
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View className="items-center mb-4">
              <View className="w-10 h-1 rounded-full bg-neutral-200" />
            </View>
            <Heading size="h3">Edit list</Heading>

            {/* Name */}
            <Text className="mt-5 mb-1.5 text-label font-medium text-neutral-600">
              Name
            </Text>
            <TextInput
              className="min-h-12 rounded-md border border-neutral-200 bg-white px-4 text-body-lg text-neutral-900"
              placeholder="List name"
              placeholderTextColor="#A1A1AA"
              value={name}
              onChangeText={setName}
              returnKeyType="done"
              accessibilityLabel="List name"
            />

            {/* Color */}
            <Text className="mt-5 mb-2 text-label font-medium text-neutral-600">
              Color
            </Text>
            <View className="flex-row flex-wrap items-center gap-3">
              {COLOR_SWATCHES.map((c) => {
                const selected = color === c;
                return (
                  <Pressable
                    key={c}
                    onPress={() => setColor(c)}
                    className={`h-9 w-9 items-center justify-center rounded-full ${
                      selected ? "border-2 border-neutral-900" : ""
                    }`}
                    style={{ backgroundColor: c }}
                    accessibilityRole="button"
                    accessibilityLabel={`Color ${c}`}
                    accessibilityState={{ selected }}
                  >
                    {selected ? (
                      <Ionicons name="checkmark" size={16} color="#FFFFFF" />
                    ) : null}
                  </Pressable>
                );
              })}
            </View>

            {/* Scheduling hours override */}
            <Text className="mt-6 mb-2 text-label font-medium text-neutral-600">
              Scheduling hours
            </Text>
            <View
              className="rounded-2xl border border-neutral-200 bg-white px-4"
              style={shadows.sm}
            >
              {/* Toggle: custom window vs default */}
              <View className="flex-row items-center py-3.5 border-b border-neutral-100">
                <View className="flex-1 pr-3">
                  <Text className="text-body-lg text-neutral-900">
                    Custom hours for this list
                  </Text>
                  <Text className="mt-0.5 text-caption text-neutral-500">
                    {summary}
                  </Text>
                </View>
                <Pressable
                  onPress={() => {
                    Haptics.selectionAsync().catch(() => {});
                    setHoursEnabled((v) => !v);
                  }}
                  className={`h-7 w-12 rounded-full px-0.5 justify-center ${
                    hoursEnabled ? "bg-primary-600" : "bg-neutral-300"
                  }`}
                  accessibilityRole="switch"
                  accessibilityState={{ checked: hoursEnabled }}
                  accessibilityLabel="Custom hours for this list"
                >
                  <View
                    className={`h-6 w-6 rounded-full bg-white ${
                      hoursEnabled ? "self-end" : "self-start"
                    }`}
                    style={shadows.xs}
                  />
                </Pressable>
              </View>

              {/* Start / End steppers — only when custom hours are on. */}
              {hoursEnabled ? (
                <>
                  <View className="flex-row items-center py-3.5 border-b border-neutral-100">
                    <Text className="flex-1 text-body-lg text-neutral-900">Start</Text>
                    <Stepper
                      value={startHour}
                      min={0}
                      max={Math.max(0, endHour - 1)}
                      step={1}
                      onChange={setStartHour}
                      format={formatHour}
                      a11yLabel="start hour"
                    />
                  </View>
                  <View className="flex-row items-center py-3.5">
                    <Text className="flex-1 text-body-lg text-neutral-900">End</Text>
                    <Stepper
                      value={endHour}
                      min={Math.min(24, startHour + 1)}
                      max={24}
                      step={1}
                      onChange={setEndHour}
                      format={formatHour}
                      a11yLabel="end hour"
                    />
                  </View>
                </>
              ) : null}
            </View>
            <Text className="ml-1 mt-2 text-caption text-neutral-400">
              A task's own hours still win; then this list's; then your default.
            </Text>

            {/* Actions */}
            <View className="mt-7 flex-row gap-3">
              <View className="flex-1">
                <Button title="Cancel" variant="secondary" onPress={onClose} />
              </View>
              <View className="flex-1">
                <Button
                  title="Save"
                  variant="primaryBlue"
                  onPress={handleSave}
                  disabled={!nameValid}
                />
              </View>
            </View>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
