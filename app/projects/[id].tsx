/**
 * Project detail (doc `10`). The workspace for one project:
 *  - Header: name, kind, overall progress ring, description.
 *  - "Plan my next session" primary — the load-bearing action. Calls
 *    `aiProjects.generateNextTask` (graceful fallback), creates a REAL Ampora
 *    Task (createTask + subtasks + firstMove) back-referenced to the project
 *    (projectId + linkTask), then offers to open it or start a focus session.
 *    This is how a Project feeds the scheduler and Ignition (doc `10` §7, §9):
 *    you lock against the generated session task, never the whole project.
 *  - Tabs: Progress (ProgressTracker), Files (FileList), Chat (ProjectChat).
 *
 * All AI degrades gracefully; the screen never blocks on the network and never
 * surfaces a raw error.
 */

import React, { useCallback, useMemo, useState } from "react";
import { View, Text, Pressable, ScrollView, ActivityIndicator, Modal } from "react-native";
import { router, useLocalSearchParams, Stack } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useProjectStore, selectProjectById } from "@/store/projectStore";
import { useTaskStore } from "@/store/taskStore";
import { ProgressRing } from "@/components/projects/ProgressRing";
import { ProgressTracker } from "@/components/projects/ProgressTracker";
import { FileList } from "@/components/projects/FileList";
import { ProjectChat } from "@/components/projects/ProjectChat";
import { kindMeta, overallPct, PROJECT_ACCENT } from "@/components/projects/projectUtils";
import { Heading } from "@/components/ui/Heading";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { GradientCard } from "@/components/ui/GradientCard";
import { PressableScale } from "@/components/ui/PressableScale";
import { generateNextTask, type NextTaskResult } from "@/services/aiProjects";
import { newId } from "@/core/id";
import { iconSizes } from "@/utils/design-tokens";
import type { ChatMessage, ProjectProgress } from "@/types";

type Tab = "progress" | "files" | "chat";

const TABS: { key: Tab; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: "progress", label: "Progress", icon: "stats-chart-outline" },
  { key: "files", label: "Files", icon: "folder-outline" },
  { key: "chat", label: "Chat", icon: "chatbubble-ellipses-outline" },
];

const SESSION_MIN = 45;

export default function ProjectDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const project = useProjectStore(useMemo(() => selectProjectById(id ?? ""), [id]));

  const setProgress = useProjectStore((s) => s.setProgress);
  const addFile = useProjectStore((s) => s.addFile);
  const addChatMessage = useProjectStore((s) => s.addChatMessage);
  const linkTask = useProjectStore((s) => s.linkTask);
  const deleteProject = useProjectStore((s) => s.deleteProject);
  const updateProject = useProjectStore((s) => s.updateProject);

  const createTask = useTaskStore((s) => s.createTask);
  const addSubtask = useTaskStore((s) => s.addSubtask);
  const deleteTask = useTaskStore((s) => s.deleteTask);
  const updateTask = useTaskStore((s) => s.updateTask);

  const [tab, setTab] = useState<Tab>("progress");
  const [planning, setPlanning] = useState(false);
  const [planned, setPlanned] = useState<{ taskId: string; result: NextTaskResult } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const accent = project?.color ?? PROJECT_ACCENT;
  const pct = project ? overallPct(project.progress) : 0;

  const handleProgressChange = useCallback(
    (next: ProjectProgress) => {
      if (project) setProgress(project.id, next);
    },
    [project, setProgress]
  );

  const handleRemoveFile = useCallback(
    (fileId: string) => {
      if (!project) return;
      updateProject(project.id, { files: project.files.filter((f) => f.id !== fileId) });
    },
    [project, updateProject]
  );

  const handleAppendMessage = useCallback(
    (msg: ChatMessage) => {
      if (project) addChatMessage(project.id, msg);
    },
    [project, addChatMessage]
  );

  // The load-bearing action: turn "where you are" into a real, schedulable,
  // lockable Task (doc `10` §7). Never throws — generateNextTask always resolves.
  const planNextSession = useCallback(async () => {
    if (!project || planning) return;
    setPlanning(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});

    const result = await generateNextTask(project, SESSION_MIN);

    const task = createTask({
      title: result.title,
      projectId: project.id,
      durationMin: 0, // rolls up from subtasks below
      autoSchedule: true,
      firstMove: { id: newId(), text: result.firstMove, done: false },
    });
    for (const sub of result.subtasks) {
      addSubtask(task.id, { title: sub.title, estimatedMin: sub.estimatedMin });
    }
    linkTask(project.id, task.id);

    setPlanned({ taskId: task.id, result });
    setPlanning(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  }, [project, planning, createTask, addSubtask, linkTask]);

  // Project was deleted (or bad id) — bail cleanly.
  if (!project) {
    return (
      <SafeAreaView className="flex-1 bg-neutral-100 items-center justify-center px-8">
        <Stack.Screen options={{ headerShown: false }} />
        <Ionicons name="folder-open-outline" size={iconSizes.hero} color="#A1A1AA" />
        <Text className="text-body text-neutral-500 text-center mt-3">
          This project isn't available.
        </Text>
        <View className="mt-5">
          <Button title="Back to projects" variant="secondary" onPress={() => router.back()} />
        </View>
      </SafeAreaView>
    );
  }

  const meta = kindMeta(project.kind);

  return (
    <SafeAreaView className="flex-1 bg-neutral-100" edges={["top", "left", "right"]}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Top bar */}
      <View className="px-5 pt-2 pb-1 flex-row items-center">
        <Pressable
          onPress={() => router.back()}
          hitSlop={10}
          className="w-11 h-11 -ml-2 items-center justify-center"
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <Ionicons name="chevron-back" size={iconSizes.lg} color="#18181B" />
        </Pressable>
        <View className="flex-1" />
        <Pressable
          onPress={() => setConfirmDelete(true)}
          hitSlop={10}
          className="w-11 h-11 items-center justify-center"
          accessibilityRole="button"
          accessibilityLabel="Delete project"
        >
          <Ionicons name="trash-outline" size={iconSizes.md} color="#A1A1AA" />
        </Pressable>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header card */}
        <View className="px-5">
          <View className="flex-row items-center">
            <ProgressRing pct={pct} size={64} stroke={6} color={accent} />
            <View className="flex-1 ml-4">
              <Heading size="h2" numberOfLines={2}>
                {project.name}
              </Heading>
              <View className="flex-row items-center gap-2 mt-2">
                <Badge label={meta.label} tone="accent" />
                <Text className="text-caption text-neutral-500">
                  {project.files.length} {project.files.length === 1 ? "file" : "files"} ·{" "}
                  {project.taskIds.length} {project.taskIds.length === 1 ? "task" : "tasks"}
                </Text>
              </View>
            </View>
          </View>
          {project.description ? (
            <Text className="text-body text-neutral-600 mt-3">{project.description}</Text>
          ) : null}
        </View>

        {/* Plan next session — the primary action. */}
        <View className="px-5 mt-5">
          <GradientCard>
            <View className="flex-row items-center mb-1">
              <Ionicons name="flash" size={iconSizes.md} color={accent} />
              <Text className="text-overline font-semibold uppercase tracking-wide ml-1.5" style={{ color: accent }}>
                Next session
              </Text>
            </View>
            <Text className="text-body-lg font-semibold text-neutral-900">
              Hand me the next move
            </Text>
            <Text className="text-body text-neutral-500 mt-1 mb-4">
              Ampora turns where you are into one concrete {SESSION_MIN}-minute session you can
              schedule and lock against.
            </Text>
            <Button
              title={planning ? "Planning…" : "Plan my next session"}
              variant="primaryBlue"
              loading={planning}
              onPress={planNextSession}
              icon={
                planning ? undefined : (
                  <Ionicons name="sparkles" size={iconSizes.sm} color="#FFFFFF" />
                )
              }
            />
          </GradientCard>
        </View>

        {/* Tabs */}
        <View className="px-5 mt-6">
          <View className="flex-row bg-neutral-100 rounded-full p-1 border border-neutral-200">
            {TABS.map((t) => {
              const active = tab === t.key;
              return (
                <Pressable
                  key={t.key}
                  onPress={() => {
                    if (t.key !== tab) Haptics.selectionAsync().catch(() => {});
                    setTab(t.key);
                  }}
                  className="flex-1 flex-row items-center justify-center rounded-full py-2"
                  style={active ? { backgroundColor: "#FFFFFF" } : undefined}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={t.label}
                >
                  <Ionicons
                    name={t.icon}
                    size={iconSizes.sm}
                    color={active ? "#18181B" : "#71717A"}
                  />
                  <Text
                    className={
                      active
                        ? "text-label font-semibold text-neutral-900 ml-1.5"
                        : "text-label text-neutral-500 ml-1.5"
                    }
                  >
                    {t.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* Tab content */}
        <View className="px-5 mt-5">
          {tab === "progress" && (
            <ProgressTracker project={project} onChange={handleProgressChange} />
          )}
          {tab === "files" && (
            <FileList
              files={project.files}
              onAddFile={(f) => addFile(project.id, f)}
              onRemoveFile={handleRemoveFile}
            />
          )}
          {tab === "chat" && (
            // Fixed-height chat area inside the scroll view keeps the composer usable.
            <View style={{ height: 460 }}>
              <ProjectChat
                key={project.id}
                project={project}
                onAppendMessage={handleAppendMessage}
              />
            </View>
          )}
        </View>
      </ScrollView>

      {/* Planned-session result sheet */}
      <PlannedSheet
        planned={planned}
        accent={accent}
        onOpenTask={() => {
          const taskId = planned?.taskId;
          setPlanned(null);
          if (taskId) router.push(`/task/${taskId}`);
        }}
        onStartFocus={() => {
          const taskId = planned?.taskId;
          setPlanned(null);
          if (taskId) router.push({ pathname: "/focus/session", params: { taskId } });
        }}
        onClose={() => setPlanned(null)}
      />

      {/* Delete confirm — offers "also delete its N generated tasks"; default is
          keep + unlink so a project delete never silently destroys task work. */}
      <ConfirmDeleteSheet
        visible={confirmDelete}
        name={project.name}
        taskCount={project.taskIds.length}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={(alsoDeleteTasks) => {
          setConfirmDelete(false);
          for (const taskId of project.taskIds) {
            if (alsoDeleteTasks) {
              deleteTask(taskId);
            } else {
              // Keep + unlink (default): the task survives, just no longer
              // back-references a project that is about to be gone.
              updateTask(taskId, { projectId: undefined });
            }
          }
          deleteProject(project.id);
          router.back();
        }}
      />
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Planned-session result sheet
// ---------------------------------------------------------------------------

function PlannedSheet({
  planned,
  accent,
  onOpenTask,
  onStartFocus,
  onClose,
}: {
  planned: { taskId: string; result: NextTaskResult } | null;
  accent: string;
  onOpenTask: () => void;
  onStartFocus: () => void;
  onClose: () => void;
}) {
  const visible = planned != null;
  const result = planned?.result;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable
        className="flex-1 bg-black/40 justify-end"
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Dismiss"
      >
        <Pressable className="bg-white rounded-t-2xl p-5 pb-8" onPress={(e) => e.stopPropagation()}>
          <View className="items-center mb-4">
            <View className="w-10 h-1 rounded-full bg-neutral-200" />
          </View>

          <View className="flex-row items-center mb-1">
            <View
              className="w-8 h-8 rounded-full items-center justify-center"
              style={{ backgroundColor: accent }}
            >
              <Ionicons name="checkmark" size={iconSizes.md} color="#FFFFFF" />
            </View>
            <Text className="text-overline font-semibold uppercase tracking-wide ml-2 text-neutral-500">
              Session ready
            </Text>
          </View>

          {result && (
            <>
              <Heading size="h3" className="mt-1">
                {result.title}
              </Heading>

              {/* First move */}
              <View className="flex-row items-start mt-3 bg-primary-50 rounded-xl p-3">
                <Ionicons name="footsteps-outline" size={iconSizes.md} color="#2563EB" />
                <View className="flex-1 ml-2.5">
                  <Text className="text-caption font-semibold text-primary-700">First move</Text>
                  <Text className="text-body text-neutral-900 mt-0.5">{result.firstMove}</Text>
                </View>
              </View>

              {/* Steps */}
              <Text className="text-overline font-semibold text-neutral-500 uppercase tracking-wide mt-4 mb-2">
                {result.subtasks.length} {result.subtasks.length === 1 ? "step" : "steps"}
              </Text>
              <View className="gap-2 mb-1">
                {result.subtasks.map((s, i) => (
                  <View key={`${s.title}-${i}`} className="flex-row items-center">
                    <View className="w-6 h-6 rounded-full bg-neutral-100 items-center justify-center">
                      <Text className="text-caption font-semibold text-neutral-600">{i + 1}</Text>
                    </View>
                    <Text className="flex-1 text-body text-neutral-800 ml-2.5" numberOfLines={2}>
                      {s.title}
                    </Text>
                    <Text className="text-caption text-neutral-400 ml-2">{s.estimatedMin}m</Text>
                  </View>
                ))}
              </View>

              {result.isFallback && result.note && (
                <View className="flex-row items-center mt-3">
                  <Ionicons name="cloud-offline-outline" size={iconSizes.xs} color="#A1A1AA" />
                  <Text className="text-tiny text-neutral-400 ml-1">{result.note}</Text>
                </View>
              )}

              <View className="flex-row gap-3 mt-5">
                <View className="flex-1">
                  <Button title="Open task" variant="secondary" onPress={onOpenTask} />
                </View>
                <View className="flex-1">
                  <Button
                    title="Start focus"
                    variant="primaryBlue"
                    onPress={onStartFocus}
                    icon={<Ionicons name="play" size={iconSizes.sm} color="#FFFFFF" />}
                  />
                </View>
              </View>
            </>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Delete confirm sheet
// ---------------------------------------------------------------------------

function ConfirmDeleteSheet({
  visible,
  name,
  taskCount,
  onCancel,
  onConfirm,
}: {
  visible: boolean;
  name: string;
  /** Number of tasks this project generated (`project.taskIds.length`). */
  taskCount: number;
  onCancel: () => void;
  /** `alsoDeleteTasks` reflects the checkbox — false (keep + unlink) by default. */
  onConfirm: (alsoDeleteTasks: boolean) => void;
}) {
  // Default is keep + unlink so a project delete never silently destroys task
  // work (Projects audit gap). Reset every time the sheet opens.
  const [alsoDeleteTasks, setAlsoDeleteTasks] = useState(false);
  React.useEffect(() => {
    if (visible) setAlsoDeleteTasks(false);
  }, [visible]);

  const taskLabel = taskCount === 1 ? "task" : "tasks";

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
      <Pressable
        className="flex-1 bg-black/40 justify-end"
        onPress={onCancel}
        accessibilityRole="button"
        accessibilityLabel="Dismiss"
      >
        <Pressable className="bg-white rounded-t-2xl p-5 pb-8" onPress={(e) => e.stopPropagation()}>
          <View className="items-center mb-4">
            <View className="w-10 h-1 rounded-full bg-neutral-200" />
          </View>
          <Heading size="h3">Delete project?</Heading>
          <Text className="text-body text-neutral-500 mt-1.5 mb-5">
            "{name}" and its files, chat, and progress will be removed.
            {taskCount > 0
              ? ` It generated ${taskCount} ${taskLabel} — choose what happens to ${taskCount === 1 ? "it" : "them"} below.`
              : " It hasn't generated any tasks yet."}
          </Text>

          {taskCount > 0 && (
            <Pressable
              onPress={() => setAlsoDeleteTasks((v) => !v)}
              className="flex-row items-start gap-3 rounded-xl border border-neutral-200 bg-neutral-50 p-3.5 mb-5"
              accessibilityRole="checkbox"
              accessibilityState={{ checked: alsoDeleteTasks }}
              accessibilityLabel={`Also delete the ${taskCount} generated ${taskLabel}`}
              accessibilityHint="When off, its tasks stay in your task list, unlinked from this project"
            >
              <View
                className={`mt-0.5 h-5 w-5 items-center justify-center rounded ${
                  alsoDeleteTasks ? "bg-danger-600" : "border-2 border-neutral-300"
                }`}
              >
                {alsoDeleteTasks ? <Ionicons name="checkmark" size={13} color="#FFFFFF" /> : null}
              </View>
              <View className="flex-1">
                <Text className="text-label font-medium text-neutral-800">
                  Also delete its {taskCount} generated {taskLabel}
                </Text>
                <Text className="text-caption text-neutral-500 mt-0.5">
                  {alsoDeleteTasks
                    ? "These tasks will be permanently removed too."
                    : `Off by default — ${taskCount === 1 ? "it" : "they"} will stay in your task list, unlinked from this project.`}
                </Text>
              </View>
            </Pressable>
          )}

          <View className="flex-row gap-3">
            <View className="flex-1">
              <Button title="Cancel" variant="secondary" onPress={onCancel} />
            </View>
            <View className="flex-1">
              <Button title="Delete" variant="destructive" onPress={() => onConfirm(alsoDeleteTasks)} />
            </View>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
