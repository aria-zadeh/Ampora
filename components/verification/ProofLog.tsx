/**
 * ProofLog — Ampora Phase 4 (verification, doc `04` §4/§7).
 *
 * A premium, private list of past verification proofs: each row shows the
 * method (icon), the task it belongs to, when it happened, and a verdict /
 * overridden badge. This is the user's own "record of work done", which is
 * itself motivating (doc `04` §4) — never a report to anyone else.
 *
 * A `Proof` is attributed by `sessionId`. Since `VerificationSheet` attributes
 * every proof recorded against an active Ignition stake to that STAKE
 * session's id (doc `04` §6/§8 — the Proof Log is per stake session, not per
 * focus session), we resolve the task title through `stakesStore.sessions`
 * first. Older/unstaked proofs may still carry a focus-session id or the task
 * id directly (pre-existing fallback paths), so both are tried after, and a
 * neutral label covers anything pruned — proofs must always render.
 * Photo/screenshot proofs show a small thumbnail via `expo-image` (already a
 * dependency); everything degrades cleanly on web with no camera.
 *
 * RN + NativeWind only, web-export safe.
 */

import React, { useMemo } from "react";
import { View, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import Animated, { FadeInDown } from "react-native-reanimated";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { shadows } from "@/utils/design-tokens";
import { DURATIONS, staggerDelay } from "@/utils/motion";
import { useReduceMotion } from "@/hooks/useReduceMotion";
import { useProofStore } from "@/store/proofStore";
import { useSessionStore } from "@/store/sessionStore";
import { useStakesStore } from "@/store/stakesStore";
import { useTaskStore } from "@/store/taskStore";
import type { Proof } from "@/types";

// ---------------------------------------------------------------------------
// Method presentation
// ---------------------------------------------------------------------------

const METHOD_META: Record<
  Proof["method"],
  { icon: keyof typeof Ionicons.glyphMap; label: string; tint: string; bg: string }
> = {
  focus_time: { icon: "timer-outline", label: "Focus time", tint: "#2563EB", bg: "bg-primary-100" },
  photo: { icon: "camera-outline", label: "Photo", tint: "#7C3AED", bg: "bg-accent-100" },
  screenshot: { icon: "phone-portrait-outline", label: "Screenshot", tint: "#7C3AED", bg: "bg-accent-100" },
  honor: { icon: "hand-left-outline", label: "Honor", tint: "#6F6862", bg: "bg-neutral-100" },
};

/** A short "3:40 PM · Jul 1" style stamp; locale-formatted, never crashes. */
function formatWhen(at: number): string {
  try {
    const d = new Date(at);
    const time = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    const date = d.toLocaleDateString([], { month: "short", day: "numeric" });
    return `${time} · ${date}`;
  } catch {
    return "";
  }
}

// ---------------------------------------------------------------------------
// Row
// ---------------------------------------------------------------------------

function ProofRow({
  proof,
  taskTitle,
  index,
}: {
  proof: Proof;
  taskTitle: string;
  index: number;
}) {
  const reduceMotion = useReduceMotion();
  const meta = METHOD_META[proof.method] ?? METHOD_META.honor;
  const hasImage = !!proof.uri && (proof.method === "photo" || proof.method === "screenshot");

  return (
    <Animated.View
      entering={
        reduceMotion ? undefined : FadeInDown.delay(staggerDelay(index)).duration(DURATIONS.base)
      }
      className="flex-row items-center gap-3 rounded-xl border border-neutral-200 bg-white p-3"
      style={shadows.xs}
      accessibilityLabel={`${meta.label} proof for ${taskTitle}, ${formatWhen(proof.at)}`}
    >
      {/* Thumbnail for photo/screenshot, else a tinted method glyph. */}
      {hasImage ? (
        <Image
          source={{ uri: proof.uri }}
          style={{ width: 44, height: 44, borderRadius: 10 }}
          contentFit="cover"
          transition={150}
          accessibilityLabel="Proof image"
        />
      ) : (
        <View className={`h-11 w-11 items-center justify-center rounded-full ${meta.bg}`}>
          <Ionicons name={meta.icon} size={20} color={meta.tint} />
        </View>
      )}

      {/* Task + method + time */}
      <View className="flex-1">
        <Text className="text-body-lg font-medium text-neutral-900" numberOfLines={1}>
          {taskTitle}
        </Text>
        <Text className="mt-0.5 text-caption text-neutral-500" numberOfLines={1}>
          {meta.label} · {formatWhen(proof.at)}
        </Text>
      </View>

      {/* Verdict / overridden */}
      <View className="items-end gap-1">
        {proof.overridden ? (
          <Badge label="Overridden" tone="warning" />
        ) : proof.aiVerdict === "uncertain" ? (
          <Badge label="Uncertain" tone="neutral" />
        ) : (
          <Badge label="Verified" tone="success" />
        )}
      </View>
    </Animated.View>
  );
}

// ---------------------------------------------------------------------------
// ProofLog
// ---------------------------------------------------------------------------

interface ProofLogProps {
  /** Max rows to show, newest-first. Default 50. */
  limit?: number;
  /** Optional empty-state override copy. */
  emptyTitle?: string;
  emptySubtitle?: string;
}

/**
 * The private Proof Log list. Reads proofs from `proofStore` and resolves each
 * proof's task title through the session history + task store. Renders a warm
 * EmptyState when there is nothing yet.
 */
export function ProofLog({
  limit = 50,
  emptyTitle = "No proof yet",
  emptySubtitle = "When you finish a task with verification on, it lands here as your private record of work done.",
}: ProofLogProps) {
  const proofsRecord = useProofStore((s) => s.proofs);
  const stakeSessions = useStakesStore((s) => s.sessions);
  const focusSessions = useSessionStore((s) => s.history);
  const tasks = useTaskStore((s) => s.tasks);

  const proofs = useMemo(
    () =>
      Object.values(proofsRecord)
        .sort((a, b) => b.at - a.at)
        .slice(0, limit),
    [proofsRecord, limit]
  );

  /**
   * Resolve a readable task title for a proof. Tries, in order: the Ignition
   * stake session it was attributed to (the primary path since the sheet
   * started attributing proofs to `StakeSession.id`), then a focus session
   * (older/unstaked proofs), then the taskId directly (honor completions with
   * no session at all). Never throws — an unresolved proof still renders.
   */
  const titleFor = (proof: Proof): string => {
    const stakeSession = stakeSessions[proof.sessionId];
    if (stakeSession) {
      const task = tasks[stakeSession.taskId];
      if (task?.title) return task.title;
    }
    const focusSession = focusSessions[proof.sessionId];
    if (focusSession) {
      const task = tasks[focusSession.taskId];
      if (task?.title) return task.title;
    }
    const direct = tasks[proof.sessionId];
    if (direct?.title) return direct.title;
    return "Completed task";
  };

  if (proofs.length === 0) {
    return <EmptyState title={emptyTitle} subtitle={emptySubtitle} icon="shield-checkmark-outline" />;
  }

  return (
    <View className="gap-2.5">
      {proofs.map((proof, index) => (
        <ProofRow key={proof.id} proof={proof} taskTitle={titleFor(proof)} index={index} />
      ))}
    </View>
  );
}
