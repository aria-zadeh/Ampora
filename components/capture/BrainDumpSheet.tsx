/**
 * BrainDumpSheet — "Brain dump" voice capture (PRD FR-4, §8.2; doc `03` §1.8
 * "Speak my own").
 *
 * The full pipeline, in order, matching FR-4 exactly:
 *   record -> transcribe -> parse -> preview -> confirm
 *
 * 1. Record + transcribe are one continuous step: `services/voiceCapture.ts`
 *    drives on-device speech recognition (`expo-speech-recognition`), so
 *    audio is transcribed live as the user talks rather than uploaded
 *    afterward.
 * 2. Parse: the finished transcript goes through `extractTasks` (splits a
 *    rambling paragraph into discrete tasks) and then EVERY extracted task's
 *    title goes through `parseQuickAdd` (dates, durations, priority, list —
 *    same parser the typed quick-add field uses), so "read chapter 11
 *    tomorrow at 3, then outline the essay by friday high priority" comes
 *    back as two properly-dated, prioritized drafts.
 * 3. Preview is mandatory — nothing is written to the task store until the
 *    user reviews this screen. Each row is a plain editable text field (the
 *    SAME text the parser reads), so editing a row live-updates its chips
 *    exactly like the main quick-add preview; a row can be dropped outright.
 * 4. Confirm creates one task per remaining row via `taskStore.createTask` —
 *    which is also where FR-5's Inbox-vs-schedulable default lives, so a
 *    voice-parsed task with both a duration and a due date schedules
 *    immediately, and one missing either lands safely in the Inbox.
 *
 * Never a dead end: if voice capture isn't available (web without the
 * browser's Web Speech API, a device/OS without a usable recognizer, denied
 * permission, or any runtime error), this always leaves the user with a
 * "Type instead" path back to the typed quick-add field it was opened from —
 * it never hard-fails the app.
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Modal,
  View,
  Text,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Platform,
  AccessibilityInfo,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Animated, {
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { useShallow } from "zustand/react/shallow";
import { useTaskStore } from "@/store/taskStore";
import { useListStore, selectAllLists } from "@/store/listStore";
import { extractTasks } from "@/services/ai";
import { parseQuickAdd } from "@/core/quick-add";
import { isVoiceCaptureAvailable, useVoiceCapture, type VoiceCaptureStatus } from "@/services/voiceCapture";
import { newId } from "@/core/id";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Chip } from "@/components/ui/Chip";
import { Badge } from "@/components/ui/Badge";
import { Heading } from "@/components/ui/Heading";
import { PressableScale } from "@/components/ui/PressableScale";
import { colors, shadows, listColors, tabularNums } from "@/utils/design-tokens";
import { DURATIONS } from "@/utils/motion";
import { useReduceMotion } from "@/hooks/useReduceMotion";
import type { List } from "@/types";

// ---------------------------------------------------------------------------
// Local formatting helpers (mirrors app/(tabs)/tasks.tsx's quick-add preview,
// which isn't exported from that screen — kept small and self-contained here).
// ---------------------------------------------------------------------------

const DAY_MS = 24 * 60 * 60 * 1000;

function startOfDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function formatDuration(min: number): string {
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

function formatDueChip(due: number): string {
  const today = startOfDay(Date.now());
  const diff = Math.round((startOfDay(due) - today) / DAY_MS);
  const base =
    diff < 0
      ? "Overdue"
      : diff === 0
        ? "Today"
        : diff === 1
          ? "Tomorrow"
          : new Date(due).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const d = new Date(due);
  const hasExplicitTime = !(d.getHours() === 23 && d.getMinutes() === 59);
  return hasExplicitTime
    ? `${base}, ${d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`
    : base;
}

function formatElapsed(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

const PRIORITY_LABEL: Record<number, string> = { 1: "Low", 2: "Medium", 3: "High", 4: "Urgent" };
const PRIORITY_TONE: Record<number, "neutral" | "primary" | "warning" | "danger"> = {
  1: "neutral",
  2: "primary",
  3: "warning",
  4: "danger",
};

// ---------------------------------------------------------------------------
// Draft rows
// ---------------------------------------------------------------------------

interface DraftRow {
  key: string;
  /** The editable raw text — same string `parseQuickAdd` reads, so editing live-updates the chips. */
  text: string;
  /** `extractTasks`' own structured guess, used as a fallback under whatever `parseQuickAdd` finds in `text`. */
  seedDue?: number;
  seedDurationMin?: number;
  seedPriority?: number;
  seedList?: string;
}

/** Single source of truth for a row's final fields — used for BOTH the preview chips and task creation. */
function resolveDraft(row: DraftRow, now: number) {
  const parsed = parseQuickAdd(row.text, now);
  return {
    title: (parsed.title || row.text).trim(),
    due: parsed.due ?? row.seedDue,
    durationMin: parsed.durationMin ?? row.seedDurationMin,
    priority: parsed.priority ?? row.seedPriority,
    list: parsed.list ?? row.seedList,
  };
}

// ---------------------------------------------------------------------------
// Sheet
// ---------------------------------------------------------------------------

export interface BrainDumpSheetProps {
  visible: boolean;
  onClose: () => void;
}

type Mode = "record" | "processing" | "preview";

export function BrainDumpSheet({ visible, onClose }: BrainDumpSheetProps) {
  const reduceMotion = useReduceMotion();
  const voice = useVoiceCapture();
  const createTask = useTaskStore((s) => s.createTask);
  const lists = useListStore(useShallow(selectAllLists));
  const createList = useListStore((s) => s.createList);

  const [mode, setMode] = useState<Mode>("record");
  const [drafts, setDrafts] = useState<DraftRow[]>([]);
  const [available, setAvailable] = useState(true);
  const [emptyNotice, setEmptyNotice] = useState(false);

  // Re-check availability and reset to a clean recording state every time the
  // sheet opens; cancel any in-flight recognition when it closes so the mic
  // is never left listening in the background.
  useEffect(() => {
    if (visible) {
      setAvailable(isVoiceCaptureAvailable());
      setMode("record");
      setDrafts([]);
      setEmptyNotice(false);
    } else {
      voice.cancel();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  // #list resolution — identical policy to the Tasks tab's own quick-add:
  // match an existing list case-insensitively, otherwise create it.
  const resolveListId = useCallback(
    (name?: string): string | undefined => {
      if (!name) return undefined;
      const lower = name.toLowerCase();
      const existing = lists.find((l) => l.name.toLowerCase() === lower);
      return existing ? existing.id : createList({ name, color: listColors.slate.bar }).id;
    },
    [lists, createList],
  );

  const handleStart = useCallback(() => {
    setEmptyNotice(false);
    void voice.start();
  }, [voice]);

  const handleStop = useCallback(async () => {
    const transcript = await voice.stop();
    if (!transcript.trim()) {
      setEmptyNotice(true);
      return;
    }
    setMode("processing");
    // extractTasks (services/ai.ts) hits the ai-extract-tasks edge function
    // when a key is configured, and otherwise falls back to a local per-line
    // quick-add parse — either way it never throws.
    const extracted = await extractTasks(transcript);
    const rows: DraftRow[] = extracted
      .filter((t) => t.title.trim().length > 0)
      .map((t) => ({
        key: newId(),
        text: t.title.trim(),
        seedDue: t.due,
        seedDurationMin: t.durationMin,
        seedPriority: t.priority,
      }));
    setDrafts(rows);
    if (rows.length === 0) {
      setEmptyNotice(true);
      setMode("record");
    } else {
      setMode("preview");
    }
  }, [voice]);

  const handleRemoveRow = useCallback((key: string) => {
    setDrafts((rows) => rows.filter((r) => r.key !== key));
  }, []);

  const handleChangeRow = useCallback((key: string, text: string) => {
    setDrafts((rows) => rows.map((r) => (r.key === key ? { ...r, text } : r)));
  }, []);

  const handleRecordAgain = useCallback(() => {
    setDrafts([]);
    setEmptyNotice(false);
    setMode("record");
  }, []);

  const handleClose = useCallback(() => {
    voice.cancel();
    onClose();
  }, [voice, onClose]);

  const handleConfirm = useCallback(() => {
    const now = Date.now();
    let created = 0;
    for (const row of drafts) {
      const resolved = resolveDraft(row, now);
      if (!resolved.title) continue;
      // No explicit `autoSchedule` here on purpose — `taskStore.createTask`
      // (FR-5) decides it from whether both a duration AND a due date came
      // through: dated+timed voice tasks schedule immediately, bare ones
      // land in the Inbox, exactly like the typed quick-add path.
      createTask({
        title: resolved.title,
        due: resolved.due,
        durationMin: resolved.durationMin ?? 0,
        priority: resolved.priority,
        listId: resolveListId(resolved.list),
      });
      created++;
    }
    if (created > 0) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    }
    voice.cancel();
    onClose();
  }, [drafts, createTask, resolveListId, voice, onClose]);

  const validCount = useMemo(() => {
    const now = Date.now();
    return drafts.filter((r) => resolveDraft(r, now).title.length > 0).length;
  }, [drafts]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={handleClose}
      presentationStyle={Platform.OS === "ios" ? "pageSheet" : undefined}
    >
      <SafeAreaView className="flex-1 bg-neutral-100" edges={["top", "bottom"]}>
        <View
          className="flex-row items-center justify-between border-b border-neutral-200 bg-white px-5 py-3.5"
          style={shadows.xs}
        >
          <View className="min-w-11">
            <PressableScale
              onPress={handleClose}
              haptic="light"
              className="h-11 w-11 -ml-2 items-center justify-center rounded-full"
              accessibilityRole="button"
              accessibilityLabel="Close Brain dump"
            >
              <Ionicons name="close" size={24} color={colors.light.text} />
            </PressableScale>
          </View>
          <Heading size="h3">Brain dump</Heading>
          <View className="min-w-11" />
        </View>

        {!available ? (
          <UnavailablePanel onClose={handleClose} />
        ) : mode === "preview" ? (
          <PreviewPanel
            drafts={drafts}
            lists={lists}
            onChangeRow={handleChangeRow}
            onRemoveRow={handleRemoveRow}
            onRecordAgain={handleRecordAgain}
            onConfirm={handleConfirm}
            onCancel={handleClose}
            validCount={validCount}
          />
        ) : (
          <RecordPanel
            status={voice.state.status}
            errorMessage={voice.state.errorMessage}
            elapsedSec={voice.state.elapsedSec}
            level={voice.state.level}
            interim={voice.state.interim}
            transcript={voice.state.transcript}
            processing={mode === "processing"}
            emptyNotice={emptyNotice}
            onStart={handleStart}
            onStop={handleStop}
            onTypeInstead={handleClose}
            reduceMotion={reduceMotion}
          />
        )}
      </SafeAreaView>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Unavailable panel — the graceful-degradation dead end that isn't one.
// ---------------------------------------------------------------------------

function UnavailablePanel({ onClose }: { onClose: () => void }) {
  return (
    <View className="flex-1 items-center justify-center px-8">
      <View className="w-16 h-16 rounded-full bg-neutral-100 items-center justify-center mb-5">
        <Ionicons name="mic-off-outline" size={32} color={colors.light.textDisabled} />
      </View>
      <Heading size="h4" className="text-center">
        Voice capture isn't available here
      </Heading>
      <Text className="text-body text-neutral-500 text-center mt-2 max-w-[280px]">
        This device or browser doesn't support on-device speech recognition. You can still type your tasks below.
      </Text>
      <View className="mt-6">
        <Button title="Type instead" variant="primaryBlue" onPress={onClose} />
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Record panel
// ---------------------------------------------------------------------------

interface RecordPanelProps {
  status: VoiceCaptureStatus;
  errorMessage?: string;
  elapsedSec: number;
  level: number;
  interim: string;
  transcript: string;
  processing: boolean;
  emptyNotice: boolean;
  onStart: () => void;
  onStop: () => void;
  onTypeInstead: () => void;
  reduceMotion: boolean;
}

function RecordPanel({
  status,
  errorMessage,
  elapsedSec,
  level,
  interim,
  transcript,
  processing,
  emptyNotice,
  onStart,
  onStop,
  onTypeInstead,
  reduceMotion,
}: RecordPanelProps) {
  const isRecording = status === "recording" || status === "stopping";
  const isBusy = status === "starting" || status === "stopping";
  const isError = status === "error";

  const statusLabel = processing
    ? "Splitting that into tasks…"
    : isError
      ? (errorMessage ?? "Voice capture had a problem.")
      : status === "starting"
        ? "Starting…"
        : status === "recording"
          ? "Recording — tap to stop"
          : status === "stopping"
            ? "Finishing up…"
            : emptyNotice
              ? "Didn't catch any tasks in that."
              : "Tap the mic and say your tasks out loud.";

  // Cross-platform announcement of the recording state for screen-reader
  // users (accessibilityLiveRegion is Android-only in RN) — state is ALSO
  // conveyed visually via the icon (mic <-> stop) and this same text, never
  // by color alone.
  useEffect(() => {
    if (processing) return;
    AccessibilityInfo.announceForAccessibility(statusLabel);
    // Only re-announce on genuine phase changes, not on every elapsed tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, emptyNotice, processing]);

  if (processing) {
    return (
      <View className="flex-1 items-center justify-center px-8">
        <ActivityIndicator size="large" color={colors.light.primary} />
        <Text className="text-body text-neutral-500 text-center mt-4">{statusLabel}</Text>
      </View>
    );
  }

  return (
    <View className="flex-1 items-center justify-center px-8">
      <Text
        className="text-body font-medium text-neutral-700 text-center"
        accessibilityLiveRegion="polite"
      >
        {statusLabel}
      </Text>

      {isRecording && (
        <Text style={tabularNums} className="text-h2 font-semibold text-neutral-900 mt-2 mb-1">
          {formatElapsed(elapsedSec)}
        </Text>
      )}

      <View className="my-6">
        <MicButton
          recording={isRecording}
          busy={isBusy}
          onPress={isRecording ? onStop : onStart}
          reduceMotion={reduceMotion}
        />
      </View>

      {isRecording && <LevelMeter level={level} reduceMotion={reduceMotion} />}

      {isRecording && (transcript || interim) ? (
        <Text className="text-body text-neutral-500 text-center mt-5 max-w-[300px]" numberOfLines={3}>
          {transcript}
          {interim ? ` ${interim}` : ""}
        </Text>
      ) : null}

      {isError && (
        <View className="mt-6 gap-3 items-center w-full max-w-[260px]">
          <Button title="Try again" variant="primaryBlue" onPress={onStart} />
          <Button title="Type instead" variant="ghost" onPress={onTypeInstead} />
        </View>
      )}

      {emptyNotice && !isError && !isRecording && (
        <View className="mt-6">
          <Button title="Type instead" variant="secondary" onPress={onTypeInstead} />
        </View>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Mic button — 88px target (well over the 44px minimum), icon+text convey
// state, color is supplementary only.
// ---------------------------------------------------------------------------

function MicButton({
  recording,
  busy,
  onPress,
  reduceMotion,
}: {
  recording: boolean;
  busy: boolean;
  onPress: () => void;
  reduceMotion: boolean;
}) {
  const pulse = useSharedValue(1);

  useEffect(() => {
    if (recording && !reduceMotion) {
      pulse.value = withRepeat(
        withSequence(withTiming(1.08, { duration: 700 }), withTiming(1, { duration: 700 })),
        -1,
        true,
      );
    } else {
      pulse.value = withTiming(1, { duration: 150 });
    }
  }, [recording, reduceMotion, pulse]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulse.value }],
  }));

  return (
    <PressableScale
      onPress={onPress}
      disabled={busy}
      haptic={recording ? "medium" : "light"}
      accessibilityRole="button"
      accessibilityLabel={recording ? "Stop recording" : "Start recording"}
      accessibilityHint={
        recording
          ? "Stops recording and splits what you said into tasks"
          : "Starts recording your voice for Brain dump"
      }
      accessibilityState={{ busy, selected: recording }}
    >
      <Animated.View
        style={[
          {
            width: 88,
            height: 88,
            borderRadius: 44,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: recording ? colors.light.text : colors.light.primary,
          },
          shadows.md,
          animatedStyle,
        ]}
      >
        {busy ? (
          <ActivityIndicator color={colors.light.primaryForeground} />
        ) : (
          <Ionicons name={recording ? "stop" : "mic"} size={32} color={colors.light.primaryForeground} />
        )}
      </Animated.View>
    </PressableScale>
  );
}

// ---------------------------------------------------------------------------
// Level meter — purely decorative "it's alive" feedback so recording never
// looks frozen; the real state is the text label above, not this.
// ---------------------------------------------------------------------------

function LevelMeter({ level, reduceMotion }: { level: number; reduceMotion: boolean }) {
  const weights = [0.5, 0.8, 1, 0.8, 0.5];
  return (
    <View
      className="flex-row items-end gap-1.5 h-8"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {weights.map((weight, i) => (
        <LevelBar key={i} level={level} weight={weight} reduceMotion={reduceMotion} />
      ))}
    </View>
  );
}

function LevelBar({
  level,
  weight,
  reduceMotion,
}: {
  level: number;
  weight: number;
  reduceMotion: boolean;
}) {
  const height = useSharedValue(4);

  useEffect(() => {
    const target = 4 + Math.min(1, level * weight) * 24;
    height.value = reduceMotion ? target : withTiming(target, { duration: 120 });
  }, [level, weight, reduceMotion, height]);

  const style = useAnimatedStyle(() => ({ height: height.value }));

  return <Animated.View style={[{ width: 5, borderRadius: 3, backgroundColor: colors.light.primary }, style]} />;
}

// ---------------------------------------------------------------------------
// Preview panel — the mandatory review step. Nothing is created before this.
// ---------------------------------------------------------------------------

interface PreviewPanelProps {
  drafts: DraftRow[];
  lists: List[];
  onChangeRow: (key: string, text: string) => void;
  onRemoveRow: (key: string) => void;
  onRecordAgain: () => void;
  onConfirm: () => void;
  onCancel: () => void;
  validCount: number;
}

function PreviewPanel({
  drafts,
  lists,
  onChangeRow,
  onRemoveRow,
  onRecordAgain,
  onConfirm,
  onCancel,
  validCount,
}: PreviewPanelProps) {
  return (
    <View className="flex-1">
      <View className="px-5 pt-4 pb-2">
        <Text className="text-body text-neutral-500">
          {drafts.length === 1
            ? "Here's what I heard. Edit or drop it, then add it."
            : `Here's what I heard — split into ${drafts.length} tasks. Edit or drop any, then add them.`}
        </Text>
      </View>
      <ScrollView
        className="flex-1 px-5"
        contentContainerStyle={{ paddingBottom: 24, gap: 10 }}
        keyboardShouldPersistTaps="handled"
      >
        {drafts.map((row, index) => (
          <DraftRowCard
            key={row.key}
            row={row}
            index={index}
            lists={lists}
            onChangeText={onChangeRow}
            onRemove={onRemoveRow}
          />
        ))}
      </ScrollView>
      <View className="px-5 pt-3 pb-2 gap-2.5 border-t border-neutral-200 bg-white" style={shadows.xs}>
        <Button
          title={validCount > 0 ? `Add ${validCount} ${validCount === 1 ? "task" : "tasks"}` : "Add tasks"}
          variant="primaryBlue"
          disabled={validCount === 0}
          onPress={onConfirm}
        />
        <View className="flex-row gap-2.5">
          <View className="flex-1">
            <Button title="Record again" variant="secondary" onPress={onRecordAgain} />
          </View>
          <View className="flex-1">
            <Button title="Cancel" variant="ghost" onPress={onCancel} />
          </View>
        </View>
      </View>
    </View>
  );
}

function DraftRowCard({
  row,
  index,
  lists,
  onChangeText,
  onRemove,
}: {
  row: DraftRow;
  index: number;
  lists: List[];
  onChangeText: (key: string, text: string) => void;
  onRemove: (key: string) => void;
}) {
  const resolved = useMemo(() => resolveDraft(row, Date.now()), [row]);
  const matchedList = useMemo(() => {
    if (!resolved.list) return null;
    const lower = resolved.list.toLowerCase();
    return lists.find((l) => l.name.toLowerCase() === lower) ?? null;
  }, [resolved.list, lists]);

  const hasChips = resolved.due != null || (resolved.durationMin ?? 0) > 0 || resolved.priority != null || resolved.list != null;

  return (
    <Animated.View
      entering={FadeInDown.delay(index * 40).duration(DURATIONS.base)}
      className="bg-white rounded-lg border border-neutral-200 p-3"
      style={shadows.xs}
    >
      <View className="flex-row items-center gap-2">
        <View className="flex-1">
          <Input
            value={row.text}
            onChangeText={(text) => onChangeText(row.key, text)}
            accessibilityLabel={`Task ${index + 1}: ${resolved.title || "empty"}`}
            placeholder="Task title"
          />
        </View>
        <Pressable
          onPress={() => onRemove(row.key)}
          hitSlop={8}
          className="h-11 w-11 items-center justify-center"
          accessibilityRole="button"
          accessibilityLabel={`Drop task: ${resolved.title || row.text || "untitled"}`}
        >
          <Ionicons name="trash-outline" size={18} color={colors.light.textDisabled} />
        </Pressable>
      </View>
      {hasChips && (
        <View className="flex-row flex-wrap gap-2 mt-2.5 pl-0.5">
          {resolved.due != null && <Chip label={formatDueChip(resolved.due)} />}
          {resolved.durationMin != null && resolved.durationMin > 0 && (
            <Chip label={formatDuration(resolved.durationMin)} />
          )}
          {resolved.priority != null && (
            <Badge label={PRIORITY_LABEL[resolved.priority]} tone={PRIORITY_TONE[resolved.priority]} />
          )}
          {resolved.list != null && matchedList && <Chip label={matchedList.name} color={matchedList.color} />}
          {resolved.list != null && !matchedList && <Chip label={`Will create list "${resolved.list}"`} />}
        </View>
      )}
    </Animated.View>
  );
}
