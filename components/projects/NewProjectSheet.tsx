/**
 * NewProjectSheet — the create-project bottom sheet (doc `10` §3: kind is chosen
 * at creation and shapes progress + next-task logic). Name (required), a kind
 * chooser (deliverable / study / general, each with a one-line blurb), and an
 * optional description. Uses the design system's Modal-sheet pattern (matching
 * the Tasks tab schedule sheet): dimmed backdrop, rounded-2xl surface, grabber.
 */

import React, { useCallback, useEffect, useState } from "react";
import { View, Text, Pressable, TextInput, Modal } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Heading } from "@/components/ui/Heading";
import { Button } from "@/components/ui/Button";
import { PressableScale } from "@/components/ui/PressableScale";
import { kindMeta, PROJECT_ACCENT } from "./projectUtils";
import { iconSizes } from "@/utils/design-tokens";
import type { ProjectKind } from "@/types";

const KINDS: ProjectKind[] = ["deliverable", "study", "general"];

interface NewProjectSheetProps {
  visible: boolean;
  onClose: () => void;
  onCreate: (input: { name: string; kind: ProjectKind; description?: string }) => void;
}

export function NewProjectSheet({ visible, onClose, onCreate }: NewProjectSheetProps) {
  const [name, setName] = useState("");
  const [kind, setKind] = useState<ProjectKind>("deliverable");
  const [description, setDescription] = useState("");

  // Reset to a clean slate each time the sheet opens.
  useEffect(() => {
    if (visible) {
      setName("");
      setKind("deliverable");
      setDescription("");
    }
  }, [visible]);

  const trimmed = name.trim();
  const canCreate = trimmed.length > 0;

  const handleCreate = useCallback(() => {
    if (!canCreate) return;
    onCreate({
      name: trimmed,
      kind,
      description: description.trim() || undefined,
    });
  }, [canCreate, trimmed, kind, description, onCreate]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable
        className="flex-1 bg-black/40 justify-end"
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Dismiss new project"
      >
        <Pressable className="bg-white rounded-t-2xl p-5 pb-8" onPress={(e) => e.stopPropagation()}>
          <View className="items-center mb-4">
            <View className="w-10 h-1 rounded-full bg-neutral-200" />
          </View>

          <Heading size="h3">New project</Heading>
          <Text className="text-body text-neutral-500 mt-1 mb-5">
            Bigger than a task — Ampora tracks it and hands you each next session.
          </Text>

          {/* Name */}
          <Text className="text-overline font-semibold text-neutral-500 uppercase tracking-wide mb-2">
            Name
          </Text>
          <View className="flex-row items-center bg-white border border-neutral-200 rounded-md min-h-12 px-3 mb-5">
            <Ionicons name="bookmark-outline" size={iconSizes.md} color="#A1A1AA" />
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="e.g. Study for SciOly Remote Sensing"
              placeholderTextColor="#A1A1AA"
              className="flex-1 ml-2 text-body-lg text-neutral-900"
              returnKeyType="next"
              autoFocus
              accessibilityLabel="Project name"
            />
          </View>

          {/* Kind chooser */}
          <Text className="text-overline font-semibold text-neutral-500 uppercase tracking-wide mb-2">
            Type
          </Text>
          <View className="gap-2 mb-5">
            {KINDS.map((k) => {
              const meta = kindMeta(k);
              const active = kind === k;
              return (
                <PressableScale
                  key={k}
                  haptic="selection"
                  onPress={() => setKind(k)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={`${meta.label}. ${meta.blurb}`}
                  className={`flex-row items-center rounded-xl border px-3 py-3 ${
                    active ? "bg-accent-100 border-accent-600" : "bg-white border-neutral-200"
                  }`}
                >
                  <View
                    className="w-9 h-9 rounded-full items-center justify-center"
                    style={{ backgroundColor: active ? PROJECT_ACCENT : "#F4F4F5" }}
                  >
                    <Ionicons
                      name={meta.icon}
                      size={iconSizes.md}
                      color={active ? "#FFFFFF" : "#71717A"}
                    />
                  </View>
                  <View className="flex-1 ml-3">
                    <Text
                      className={`text-body font-semibold ${
                        active ? "text-accent-700" : "text-neutral-900"
                      }`}
                    >
                      {meta.label}
                    </Text>
                    <Text className="text-caption text-neutral-500 mt-0.5">{meta.blurb}</Text>
                  </View>
                  {active && (
                    <Ionicons name="checkmark-circle" size={iconSizes.lg} color={PROJECT_ACCENT} />
                  )}
                </PressableScale>
              );
            })}
          </View>

          {/* Optional description */}
          <Text className="text-overline font-semibold text-neutral-500 uppercase tracking-wide mb-2">
            Description (optional)
          </Text>
          <View className="bg-white border border-neutral-200 rounded-md px-3 py-2.5 mb-6">
            <TextInput
              value={description}
              onChangeText={setDescription}
              placeholder="What's the goal? Any context?"
              placeholderTextColor="#A1A1AA"
              className="text-body text-neutral-900 min-h-[44px]"
              multiline
              textAlignVertical="top"
              accessibilityLabel="Project description"
            />
          </View>

          <View className="flex-row gap-3">
            <View className="flex-1">
              <Button title="Cancel" variant="secondary" onPress={onClose} />
            </View>
            <View className="flex-1">
              <Button
                title="Create project"
                variant="primaryBlue"
                disabled={!canCreate}
                onPress={handleCreate}
              />
            </View>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
