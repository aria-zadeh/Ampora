import React, { useMemo, useState } from "react";
import { View, Text, TextInput, Pressable, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Chip } from "@/components/ui/Chip";
import { useTaskStore } from "@/store/taskStore";
import { colors } from "@/utils/design-tokens";
import type { Task } from "@/types";

interface DependsOnPickerProps {
  /** Task ids this task depends on. */
  value: string[];
  onChange: (taskIds: string[]) => void;
  /** The task being edited, excluded from the candidate list (undefined in create mode). */
  selfId?: string;
}

export function DependsOnPicker({ value, onChange, selfId }: DependsOnPickerProps) {
  const tasks = useTaskStore((s) => s.tasks);
  const [query, setQuery] = useState("");

  const candidates = useMemo<Task[]>(() => {
    const all = Object.values(tasks).filter((t) => t.id !== selfId);
    const q = query.trim().toLowerCase();
    const filtered = q
      ? all.filter((t) => t.title.toLowerCase().includes(q))
      : all;
    return filtered.sort((a, b) => a.title.localeCompare(b.title)).slice(0, 30);
  }, [tasks, selfId, query]);

  const selectedTasks = useMemo(
    () => value.map((id) => tasks[id]).filter((t): t is Task => t != null),
    [value, tasks]
  );

  const toggle = (id: string) => {
    if (value.includes(id)) {
      onChange(value.filter((v) => v !== id));
    } else {
      onChange([...value, id]);
    }
  };

  return (
    <View>
      {selectedTasks.length > 0 ? (
        <View className="mb-2 flex-row flex-wrap gap-2">
          {selectedTasks.map((t) => (
            <Chip
              key={t.id}
              label={t.title}
              selected
              onRemove={() => toggle(t.id)}
            />
          ))}
        </View>
      ) : null}

      <View className="mb-2 min-h-12 flex-row items-center rounded-md border border-neutral-200 bg-white px-3">
        <Ionicons name="search" size={16} color={colors.light.textDisabled} />
        <TextInput
          className="ml-2 flex-1 text-body-lg text-neutral-900"
          placeholder="Search tasks"
          placeholderTextColor={colors.light.textDisabled}
          value={query}
          onChangeText={setQuery}
          accessibilityLabel="Search tasks to depend on"
        />
      </View>

      {candidates.length === 0 ? (
        <Text className="px-1 py-2 text-caption text-neutral-500">
          {query.trim() ? "No matching tasks" : "No other tasks yet"}
        </Text>
      ) : (
        <ScrollView
          className="max-h-56 rounded-lg border border-neutral-200 bg-white"
          nestedScrollEnabled
          keyboardShouldPersistTaps="handled"
        >
          {candidates.map((t) => {
            const selected = value.includes(t.id);
            return (
              <Pressable
                key={t.id}
                onPress={() => toggle(t.id)}
                className="flex-row items-center border-b border-neutral-100 px-3 py-3"
                accessibilityRole="checkbox"
                accessibilityState={{ checked: selected }}
                accessibilityLabel={t.title}
              >
                <View
                  className={`mr-3 h-5 w-5 items-center justify-center rounded ${
                    selected ? "bg-primary-600" : "border-2 border-neutral-300"
                  }`}
                >
                  {selected ? (
                    <Ionicons name="checkmark" size={13} color={colors.light.primaryForeground} />
                  ) : null}
                </View>
                <Text
                  className="flex-1 text-body text-neutral-900"
                  numberOfLines={1}
                >
                  {t.title}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}
