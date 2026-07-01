import React from "react";
import { View, Text } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { PressableScale } from "@/components/ui/PressableScale";
import { useProjectStore } from "@/store/projectStore";
import { shadows, iconSizes } from "@/utils/design-tokens";

/**
 * ProjectsEntryCard — the Home entry into the Projects hub (doc 10).
 *
 * Projects are the larger, knowledge + chat + progress layer above single
 * tasks; they used to hide behind a small pill in the Tasks header. This lifts
 * them into a prominent, always-present Home row so they are easy to find. The
 * accent color (#7C3AED) is reserved app-wide for Projects, so it is the one
 * place it belongs.
 *
 * Reads a stable scalar (the project count) so it never returns a fresh
 * array/object from the store (Zustand v5 selector rule) — no useShallow
 * needed. The subtitle adapts: a live count when projects exist, a short
 * teaching line when they do not. Purely additive; it never mutates state.
 */
export function ProjectsEntryCard() {
  // Primitive count -> stable by value, safe as a raw selector (no loop).
  const projectCount = useProjectStore((s) => Object.keys(s.projects).length);

  const subtitle =
    projectCount > 0
      ? `${projectCount} ${projectCount === 1 ? "project" : "projects"} in progress`
      : "Plan and track larger work in one place";

  const a11yLabel =
    projectCount > 0
      ? `Projects, ${projectCount} ${projectCount === 1 ? "project" : "projects"}`
      : "Projects";

  return (
    <PressableScale
      onPress={() => router.push("/projects")}
      haptic="light"
      accessibilityRole="button"
      accessibilityLabel={a11yLabel}
      accessibilityHint="Opens your projects, which plan and track larger work"
    >
      <View
        className="flex-row items-center rounded-2xl border border-neutral-200 bg-white p-4"
        style={shadows.sm}
      >
        {/* Accent tile — the one place accent is used (Projects). */}
        <View className="h-11 w-11 items-center justify-center rounded-xl bg-accent-100">
          <Ionicons name="rocket-outline" size={22} color="#7C3AED" />
        </View>

        <View className="ml-3.5 flex-1">
          <Text className="text-body-lg font-semibold text-neutral-900">
            Projects
          </Text>
          <Text className="mt-0.5 text-caption text-neutral-500" numberOfLines={1}>
            {subtitle}
          </Text>
        </View>

        <Ionicons
          name="chevron-forward"
          size={iconSizes.sm}
          color="#A1A1AA"
        />
      </View>
    </PressableScale>
  );
}
