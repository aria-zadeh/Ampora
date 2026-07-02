/**
 * Projects hub (doc `10`). A premium list of the user's projects: each row is a
 * ProjectCard (name, kind badge, progress ring, file/task counts). A FAB + a
 * "New project" affordance open the NewProjectSheet. When there are no projects,
 * a teaching EmptyState explains what a project is and how it differs from a task.
 *
 * Projects are the knowledge + chat + progress layer; tapping a card opens the
 * project detail (`/projects/[id]`), where the chat plans the next lockable Task.
 */

import React, { useCallback, useMemo, useState } from "react";
import { View, Text, Pressable } from "react-native";
import { router, Stack } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { FlashList } from "@shopify/flash-list";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useShallow } from "zustand/react/shallow";
import { useProjectStore, selectAllProjects } from "@/store/projectStore";
import { ProjectCard } from "@/components/projects/ProjectCard";
import { NewProjectSheet } from "@/components/projects/NewProjectSheet";
import { PROJECT_ACCENT } from "@/components/projects/projectUtils";
import { EmptyState } from "@/components/ui/EmptyState";
import { FAB } from "@/components/ui/FAB";
import { Heading } from "@/components/ui/Heading";
import { DURATIONS, staggerDelay } from "@/utils/motion";
import { useReduceMotion } from "@/hooks/useReduceMotion";
import { iconSizes } from "@/utils/design-tokens";
import type { Project, ProjectKind } from "@/types";

export default function ProjectsHubScreen() {
  const reduceMotion = useReduceMotion();

  const projects = useProjectStore(useShallow(selectAllProjects));
  const createProject = useProjectStore((s) => s.createProject);

  const [sheetOpen, setSheetOpen] = useState(false);

  // Most-recently-updated first, so active projects surface to the top.
  const sorted = useMemo(
    () => [...projects].sort((a, b) => b.updatedAt - a.updatedAt),
    [projects]
  );

  const handleCreate = useCallback(
    (input: { name: string; kind: ProjectKind; description?: string }) => {
      const project = createProject(input);
      setSheetOpen(false);
      router.push(`/projects/${project.id}`);
    },
    [createProject]
  );

  const renderItem = useCallback(
    ({ item, index }: { item: Project; index: number }) => {
      const entering = reduceMotion
        ? undefined
        : FadeInDown.delay(staggerDelay(index)).duration(DURATIONS.base);
      return (
        <Animated.View entering={entering} className="px-5 py-1.5">
          <ProjectCard project={item} onPress={() => router.push(`/projects/${item.id}`)} />
        </Animated.View>
      );
    },
    [reduceMotion]
  );

  return (
    <SafeAreaView className="flex-1 bg-neutral-100" edges={["top", "left", "right"]}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Header */}
      <View className="px-5 pt-3 pb-3 flex-row items-center">
        <Pressable
          onPress={() => router.back()}
          hitSlop={10}
          className="w-11 h-11 -ml-2 items-center justify-center"
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <Ionicons name="chevron-back" size={iconSizes.lg} color="#1C1917" />
        </Pressable>
        <View className="flex-1">
          <Heading size="h1">Projects</Heading>
        </View>
        <View
          className="w-9 h-9 rounded-full items-center justify-center"
          style={{ backgroundColor: PROJECT_ACCENT }}
        >
          <Ionicons name="rocket-outline" size={iconSizes.md} color="#FFFFFF" />
        </View>
      </View>

      {sorted.length === 0 ? (
        <View className="flex-1 justify-center">
          <EmptyState
            icon="rocket-outline"
            title="Projects are bigger than tasks"
            subtitle="A project is a paper, an exam unit, an ongoing goal. Ampora tracks it, holds your files, and hands you the next session to actually start."
            actionLabel="New project"
            onAction={() => setSheetOpen(true)}
          />
        </View>
      ) : (
        <FlashList
          data={sorted}
          renderItem={renderItem}
          keyExtractor={(p) => p.id}
          contentContainerStyle={{ paddingTop: 4, paddingBottom: 120 }}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            <Text className="px-5 pb-2 text-body text-neutral-500">
              {sorted.length} {sorted.length === 1 ? "project" : "projects"}. Tap one to plan its
              next session.
            </Text>
          }
        />
      )}

      <FAB onPress={() => setSheetOpen(true)} icon="add" />

      <NewProjectSheet
        visible={sheetOpen}
        onClose={() => setSheetOpen(false)}
        onCreate={handleCreate}
      />
    </SafeAreaView>
  );
}
