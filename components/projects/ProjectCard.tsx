/**
 * ProjectCard — a single project row in the projects hub (doc `10`).
 *
 * Premium tappable card: name, kind badge, a compact progress ring, an inline
 * progress bar, and a file/task count line. Projects are the "special/premium"
 * surface, so the ring + accents use the accent family (#7C3AED, doc `02`),
 * while the card stays neutral-dominant. Progress is never color-only — the
 * ring carries a percent label and the status line spells out the counts.
 */

import React, { useMemo } from "react";
import { View, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { ProgressRing } from "./ProgressRing";
import { overallPct, kindMeta } from "./projectUtils";
import { iconSizes } from "@/utils/design-tokens";
import type { Project } from "@/types";

interface ProjectCardProps {
  project: Project;
  onPress: () => void;
}

export function ProjectCard({ project, onPress }: ProjectCardProps) {
  const pct = useMemo(() => overallPct(project.progress), [project.progress]);
  const meta = kindMeta(project.kind);
  const fileCount = project.files.length;
  const taskCount = project.taskIds.length;

  const accent = project.color ?? "#7C3AED";

  return (
    <Card
      onPress={onPress}
      accessibilityLabel={`${project.name}, ${meta.label} project, ${pct}% complete`}
      accessibilityHint="Opens the project"
      className="flex-row items-center"
    >
      {/* Progress ring — accent-tinted, carries a percent label (never color-only). */}
      <ProgressRing pct={pct} size={54} stroke={5} color={accent} />

      <View className="flex-1 ml-4">
        <View className="flex-row items-center gap-2">
          <Text
            className="flex-1 text-body-lg font-semibold text-neutral-900"
            numberOfLines={1}
          >
            {project.name}
          </Text>
        </View>

        <View className="flex-row items-center gap-2 mt-1.5">
          <Badge label={meta.label} tone="accent" />
          <View className="flex-row items-center">
            <Ionicons name="document-text-outline" size={iconSizes.xs} color="#6F6862" />
            <Text className="text-caption text-neutral-500 ml-1">
              {fileCount} {fileCount === 1 ? "file" : "files"}
            </Text>
          </View>
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
