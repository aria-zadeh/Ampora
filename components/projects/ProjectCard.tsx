/**
 * ProjectCard — a single project row in the projects hub (doc `06`).
 *
 * Premium tappable card: title, kind badge, a compact progress ring, and a
 * task count line. Projects are the "special/premium" surface, so the ring +
 * accents use the accent family (#7C3AED, doc `02`), while the card stays
 * neutral-dominant. Progress is never color-only — the ring carries a
 * percent label and the status line spells out the count.
 */

import React from "react";
import { View, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { ProgressRing } from "./ProgressRing";
import { kindMeta, PROJECT_ACCENT } from "./projectUtils";
import { iconSizes } from "@/utils/design-tokens";
import type { Project } from "@/types";

interface ProjectCardProps {
  project: Project;
  /** Count of Tasks with `task.projectId === project.id` — Project no longer stores task ids (doc `06` §9), so the caller computes this once from `taskStore`. */
  taskCount: number;
  onPress: () => void;
}

export function ProjectCard({ project, taskCount, onPress }: ProjectCardProps) {
  const meta = kindMeta(project.kind);

  return (
    <Card
      onPress={onPress}
      accessibilityLabel={`${project.title}, ${meta.label} project, ${project.percent}% complete`}
      accessibilityHint="Opens the project"
      className="flex-row items-center"
    >
      {/* Progress ring — accent-tinted, carries a percent label (never color-only). */}
      <ProgressRing pct={project.percent} size={54} stroke={5} color={PROJECT_ACCENT} />

      <View className="flex-1 ml-4">
        <View className="flex-row items-center gap-2">
          <Text
            className="flex-1 text-body-lg font-semibold text-neutral-900"
            numberOfLines={1}
          >
            {project.title}
          </Text>
        </View>

        <View className="flex-row items-center gap-2 mt-1.5">
          <Badge label={meta.label} tone="accent" />
          {taskCount > 0 && (
            <View className="flex-row items-center">
              <Ionicons name="checkbox-outline" size={iconSizes.xs} color="#6F6862" />
              <Text className="text-caption text-neutral-500 ml-1">
                {taskCount} {taskCount === 1 ? "task" : "tasks"}
              </Text>
            </View>
          )}
        </View>
      </View>

      <Ionicons name="chevron-forward" size={iconSizes.md} color="#D7D3CC" />
    </Card>
  );
}
