import React, { useState } from "react";
import { View, Text, Pressable, TextInput, Modal } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Chip } from "@/components/ui/Chip";
import { Button } from "@/components/ui/Button";
import { Heading } from "@/components/ui/Heading";
import { PressableScale } from "@/components/ui/PressableScale";
import { colors, shadows } from "@/utils/design-tokens";
import { useShallow } from "zustand/react/shallow";
import {
  useListStore,
  selectAllLists,
  selectAllTags,
} from "@/store/listStore";

/** Preset swatches offered when creating a new list or tag. */
const COLOR_PRESETS = [
  "#2563EB", // primary
  "#7C3AED", // accent
  "#16A34A", // success
  "#EA580C", // warning
  "#DC2626", // danger
  "#0891B2", // cyan
  "#DB2777", // pink
  "#57534E", // neutral
];

interface SingleProps {
  mode: "single";
  /** Selected list id, or undefined for "no list". */
  value: string | undefined;
  onChange: (listId: string | undefined) => void;
}

interface MultiProps {
  mode: "multi";
  /** Selected tag NAMES. */
  value: string[];
  onChange: (tagNames: string[]) => void;
}

type ListTagPickerProps = SingleProps | MultiProps;

export function ListTagPicker(props: ListTagPickerProps) {
  const lists = useListStore(useShallow(selectAllLists));
  const tags = useListStore(useShallow(selectAllTags));
  const createList = useListStore((s) => s.createList);
  const createTag = useListStore((s) => s.createTag);

  const [creating, setCreating] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [draftColor, setDraftColor] = useState(COLOR_PRESETS[0]);

  const isSingle = props.mode === "single";

  const openCreate = () => {
    setDraftName("");
    setDraftColor(COLOR_PRESETS[0]);
    setCreating(true);
  };

  const confirmCreate = () => {
    const name = draftName.trim();
    if (!name) return;
    if (isSingle) {
      const list = createList({ name, color: draftColor });
      props.onChange(list.id);
    } else {
      // Create the Tag entity (for color/metadata), then store its NAME on the task.
      createTag({ name, color: draftColor });
      if (!props.value.includes(name)) {
        props.onChange([...props.value, name]);
      }
    }
    setCreating(false);
  };

  return (
    <View>
      <View className="flex-row flex-wrap gap-2">
        {isSingle
          ? lists.map((list) => {
              const selected = props.value === list.id;
              return (
                <Chip
                  key={list.id}
                  label={list.name}
                  color={list.color}
                  selected={selected}
                  onPress={() => props.onChange(selected ? undefined : list.id)}
                />
              );
            })
          : tags.map((tag) => {
              const selected = props.value.includes(tag.name);
              return (
                <Chip
                  key={tag.id}
                  label={tag.name}
                  color={tag.color}
                  selected={selected}
                  onPress={() =>
                    selected
                      ? props.onChange(
                          props.value.filter((n) => n !== tag.name)
                        )
                      : props.onChange([...props.value, tag.name])
                  }
                />
              );
            })}

        {/* Any tag names on the task without a matching Tag entity still render. */}
        {!isSingle &&
          props.value
            .filter((name) => !tags.some((t) => t.name === name))
            .map((name) => (
              <Chip
                key={name}
                label={name}
                selected
                onPress={() =>
                  props.onChange(props.value.filter((n) => n !== name))
                }
              />
            ))}

        <PressableScale
          onPress={openCreate}
          haptic="light"
          className="flex-row items-center rounded-full border border-dashed border-neutral-300 bg-white px-3 py-1.5"
          accessibilityRole="button"
          accessibilityLabel={isSingle ? "New list" : "New tag"}
        >
          <Ionicons name="add" size={14} color={colors.light.primary} />
          <Text className="ml-1 text-caption font-medium text-primary-600">
            {isSingle ? "New list" : "New tag"}
          </Text>
        </PressableScale>
      </View>

      <Modal
        visible={creating}
        transparent
        animationType="fade"
        onRequestClose={() => setCreating(false)}
      >
        <Pressable
          className="flex-1 items-center justify-center bg-black/40 px-6"
          onPress={() => setCreating(false)}
        >
          <Pressable
            className="w-full rounded-2xl bg-white p-6"
            style={shadows.lg}
            onPress={(e) => e.stopPropagation()}
          >
            <Heading size="h3">{isSingle ? "New list" : "New tag"}</Heading>

            <TextInput
              className="mt-5 min-h-12 rounded-md border border-neutral-200 bg-white px-4 text-body-lg text-neutral-900"
              placeholder={isSingle ? "List name" : "Tag name"}
              placeholderTextColor={colors.light.textDisabled}
              value={draftName}
              onChangeText={setDraftName}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={confirmCreate}
              accessibilityLabel={isSingle ? "List name" : "Tag name"}
            />

            <Text className="mt-5 mb-2 text-label font-medium text-neutral-600">
              Color
            </Text>
            <View className="flex-row flex-wrap gap-3">
              {COLOR_PRESETS.map((color) => {
                const selected = draftColor === color;
                return (
                  <Pressable
                    key={color}
                    onPress={() => setDraftColor(color)}
                    accessibilityRole="button"
                    accessibilityLabel={`Color ${color}`}
                    accessibilityState={{ selected }}
                    className={`h-9 w-9 items-center justify-center rounded-full ${
                      selected ? "border-2 border-neutral-900" : ""
                    }`}
                    style={{ backgroundColor: color }}
                  >
                    {selected ? (
                      <Ionicons name="checkmark" size={16} color={colors.light.primaryForeground} />
                    ) : null}
                  </Pressable>
                );
              })}
            </View>

            <View className="mt-6 flex-row gap-3">
              <View className="flex-1">
                <Button
                  title="Cancel"
                  variant="secondary"
                  onPress={() => setCreating(false)}
                />
              </View>
              <View className="flex-1">
                <Button
                  title="Create"
                  variant="primaryBlue"
                  onPress={confirmCreate}
                  disabled={!draftName.trim()}
                />
              </View>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}
