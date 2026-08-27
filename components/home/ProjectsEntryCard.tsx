import React from "react";
import { View, Text } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { PressableScale } from "@/components/ui/PressableScale";
import { useProjectStore } from "@/store/projectStore";
import { shadows, iconSizes } from "@/utils/design-tokens";
import { useThemeColors } from "@/hooks/useThemeColors";

/**
 * ProjectsEntryCard — the Home entry into the Projects hub (doc 10).
 *
 * Projects are the larger, knowledge + chat + progress layer above single
 * tasks; they used to hide behind a small pill in the Tasks header. This lifts
 * them into a prominent, always-present Home row so they are easy to find. The
 * accent color (`accentStrong`, #7C3AED) is reserved app-wide for Projects, so
 * this is the one place it belongs. It is identical in both themes (doc 02
 * §14.1, semantic accents do not change), so it needs no `dark:` variant.
 *
 * Reads a stable scalar (the project count) so it never returns a fresh
 * array/object from the store (Zustand v5 selector rule) — no useShallow
 * needed. The subtitle adapts: a live count when projects exist, a short
 * teaching line when they do not. Purely additive; it never mutates state.
 */
export function ProjectsEntryCard() {
  // Primitive count -> stable by value, safe as a raw selector (no loop).
  const projectCount = useProjectStore((s) => Object.keys(s.projects).length);
  // Only for the two Ionicons `color` props below, which take a literal rather
  // than a class. Everything else here is className-driven and uses `dark:`.
  const theme = useThemeColors();

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
        className="flex-row items-center rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900"
        style={shadows.sm}
      >
        {/* Accent tile — the one place accent is used (Projects). */}
        <View className="h-11 w-11 items-center justify-center rounded-xl bg-accent-100">
          <Ionicons name="rocket-outline" size={22} color={theme.accentStrong} />
        </View>

        <View className="ml-3.5 flex-1">
          <Text className="text-body-lg font-semibold text-neutral-900 dark:text-neutral-50">
            Projects
          </Text>
          <Text
            className="mt-0.5 text-caption text-neutral-500 dark:text-[#78716C]"
            numberOfLines={1}
          >
            {subtitle}
          </Text>
        </View>

        <Ionicons
          name="chevron-forward"
          size={iconSizes.sm}
          color={theme.textDisabled}
        />
      </View>
    </PressableScale>
  );
}
