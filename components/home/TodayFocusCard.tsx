/**
 * TodayFocusCard: the Today screen's one elevated hero (`docs/design/
 * SCREEN_SPEC.md` Screen 1, `DESIGN_DECISION_SPEC.md` D2). Taller and more
 * elevated than every other card in the stack: the single focal element on
 * Today, answering what to work on, what First move gets it started, and
 * what (if anything) is on the line for the session.
 *
 * The lock chip (D2) reads armed/scheduled state straight from
 * `stakesStore` and mirrors `LockBanner`'s app-name fallback logic: named
 * apps when the soft/dev-catalog path has labels, else a plain count,
 * because iOS hands back opaque tokens, never an app identity. Tapping the
 * chip in ANY state opens the same `StakeSetupSheet` the task detail screen
 * uses, wired the same way: a manual arm hands off to the focus session
 * with the stake params in the URL, so every wellbeing cap still applies at
 * session start, never here.
 *
 * `Start` carries no stake params of its own when there is nothing to carry:
 * an already-RUNNING stake for this task is adopted by the session screen on
 * its own. A merely SCHEDULED one is not adopted that way though, so `Start`
 * threads it through explicitly (same shape `app/task/[id].tsx`'s
 * `handleArmStake` uses, plus `fromScheduledId`) or the lock the chip
 * advertised would silently never happen. Arming otherwise happens only
 * through the chip's own sheet.
 */

import React, { useCallback, useMemo, useState } from "react";
import { View, Pressable } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useShallow } from "zustand/react/shallow";
import { Text } from "@/components/ui/Text";
import { PressableScale } from "@/components/ui/PressableScale";
import { StakeSetupSheet, type ArmedStake } from "@/components/stakes/StakeSetupSheet";
import {
  useStakesStore,
  selectEligibleApps,
  selectStakeSelection,
} from "@/store/stakesStore";
import { useListStore } from "@/store/listStore";
import { tabularNums } from "@/utils/design-tokens";
import { useThemeColors } from "@/hooks/useThemeColors";
import type { Task, StakeApp } from "@/types";

interface TodayFocusCardProps {
  task: Task;
  /**
   * Epoch ms this task is scheduled for. When present the card renders the
   * measured agenda header - time on the left, title, duration right-aligned -
   * matching the source screen, where EVERY task on Today is one of these
   * cards rather than a hero plus a list of thin rows.
   */
  scheduledAt?: number;
  /** Hides the "Today's focus" eyebrow for the non-lead cards in the stack. */
  showFocusLabel?: boolean;
  /** "Not now": advances Today to the next First-move candidate, if any. */
  onNotNow: () => void;
}

/** "4:00 PM" style clock label for an epoch-ms instant. */
function formatClock(ms: number): string {
  return new Date(ms).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * Compact duration label for the card's right-aligned slot (measured
 * layout): "45m", "1h 30m", "2h". Formatting only, `task.durationMin`
 * itself is untouched.
 */
function formatCompactDuration(totalMin: number): string {
  if (totalMin < 60) return `${totalMin}m`;
  const hours = Math.floor(totalMin / 60);
  const minutes = totalMin % 60;
  return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`;
}

/**
 * Who the lock names, mirroring `LockBanner`'s fallback chain (doc `05`
 * §7): named apps when the soft/dev-catalog path has labels, else the
 * stored selection count. Opaque tokens never resolve to an identity.
 */
function describeLockSubject(namedApps: StakeApp[], fallbackCount: number): string {
  if (namedApps.length === 1) return namedApps[0].label as string;
  if (namedApps.length > 1) return `${namedApps[0].label} and ${namedApps.length - 1} more`;
  if (fallbackCount === 1) return "1 app";
  if (fallbackCount > 1) return `${fallbackCount} apps`;
  return "Your apps";
}

/**
 * The lock affordance (`DESIGN_DECISION_SPEC.md` D2): one line, three
 * states. Armed (a live session on THIS task) or scheduled read straight
 * from `stakesStore`. Neither renders a neutral ghost chip. Every state
 * opens the same `StakeSetupSheet`, so the chip is always the one place to
 * change it. Glyph plus words always, never colour alone.
 */
function LockChip({ task }: { task: Task }) {
  const theme = useThemeColors();
  const [sheetOpen, setSheetOpen] = useState(false);

  // Raw field selects (Zustand v5 discipline), SCALARS for the active
  // session: `accrueFocus` replaces `activeSession`'s whole object identity
  // every second a session runs (it carries the live focus-time accrual),
  // and this chip only ever needs `taskId`/`sessionMin` from it, neither of
  // which changes mid-session. Hook-selecting the raw object re-rendered
  // this card (and the whole Today screen it sits on) every second any
  // session was active anywhere, not just for this task.
  const activeTaskId = useStakesStore((s) => s.activeSession?.taskId ?? null);
  const activeSessionMin = useStakesStore((s) => s.activeSession?.sessionMin);
  // `scheduledStakes` and `selectStakeSelection` return stable references
  // straight off state, no per-call allocation, so neither needs useShallow.
  // `selectEligibleApps` filters internally and DOES need it (mirrors
  // LockBanner's own selects).
  const scheduledStakes = useStakesStore((s) => s.scheduledStakes);
  const eligibleApps = useStakesStore(useShallow(selectEligibleApps));
  const selection = useStakesStore(selectStakeSelection);

  const scheduledForTask = useMemo(
    () => Object.values(scheduledStakes).find((s) => s.taskId === task.id) ?? null,
    [scheduledStakes, task.id],
  );
  const armedForTask = activeTaskId === task.id;

  const namedApps = useMemo(() => eligibleApps.filter((a) => !!a.label), [eligibleApps]);
  const fallbackCount = selection?.count ?? 0;
  const subject = useMemo(
    () => describeLockSubject(namedApps, fallbackCount),
    [namedApps, fallbackCount],
  );

  const { label, a11yLabel } = useMemo(() => {
    if (armedForTask) {
      const suffix = activeSessionMin != null ? ` · ${activeSessionMin} min` : "";
      const text = `Locks ${subject}${suffix}`;
      return { label: text, a11yLabel: `${text}. Opens lock settings for this task.` };
    }
    if (scheduledForTask?.scheduledAt != null) {
      const text = `Locks at ${formatClock(scheduledForTask.scheduledAt)} · ${subject}`;
      return { label: text, a11yLabel: `${text}. Opens lock settings for this task.` };
    }
    return {
      label: "Lock my apps",
      a11yLabel: "Lock my apps. Opens lock settings for this task.",
    };
  }, [armedForTask, activeSessionMin, scheduledForTask, subject]);

  // Same handoff `app/task/[id].tsx` uses: arm here, then the session calls
  // startStake(...) on mount so every wellbeing gate applies at lock time.
  const handleArmStake = useCallback(
    (armed: ArmedStake) => {
      router.push({
        pathname: "/focus/session",
        params: {
          taskId: task.id,
          stakeHold: armed.hold,
          stakeTrigger: armed.trigger,
          stakeVerification: armed.verification,
          ...(armed.sessionMin != null ? { stakeSessionMin: String(armed.sessionMin) } : {}),
        },
      });
    },
    [task.id],
  );

  const handlePress = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setSheetOpen(true);
  }, []);

  return (
    <>
      {/* Visual chip is 28px (h-7), rounded-sm, matching the measured
          agenda-card "App block active" indicator. hitSlop brings the
          tappable area to the 44px minimum without inflating the pill
          itself. Plain Pressable, not PressableScale, because this needs
          hitSlop and that primitive does not expose one. */}
      <Pressable
        onPress={handlePress}
        hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
        className="h-7 flex-row items-center gap-1.5 rounded-sm bg-surface-ghost px-2.5 active:opacity-70"
        accessibilityRole="button"
        accessibilityLabel={a11yLabel}
        accessibilityHint="Opens lock settings for this task"
      >
        <Ionicons name="lock-closed-outline" size={12} color={theme.textSecondary} />
        <Text variant="tiny" className="text-ink-secondary" numberOfLines={1}>
          {label}
        </Text>
      </Pressable>

      <StakeSetupSheet
        visible={sheetOpen}
        task={task}
        onClose={() => setSheetOpen(false)}
        onArm={handleArmStake}
      />
    </>
  );
}

export function TodayFocusCard({ task, scheduledAt, showFocusLabel = true, onNotNow }: TodayFocusCardProps) {
  // Raw select of the resolved List, same shape as TomorrowPlanCard's
  // project lookup, stable unless the list itself changes, no useShallow.
  const list = useListStore((s) => (task.listId ? s.lists[task.listId] : undefined));

  const durationLabel = useMemo(
    () => formatCompactDuration(task.durationMin),
    [task.durationMin],
  );

  // List name + step count are still surfaced (real content, not
  // decoration) but now sit on a secondary line under the title, since
  // duration moved to its own right-aligned slot in the header row.
  const secondaryMeta = useMemo(() => {
    const parts: string[] = [];
    if (list?.name) parts.push(list.name);
    if (task.subtasks.length > 0) {
      parts.push(`${task.subtasks.length} ${task.subtasks.length === 1 ? "step" : "steps"}`);
    }
    return parts.length > 0 ? parts.join(" · ") : null;
  }, [list?.name, task.subtasks.length]);

  // An ALREADY-RUNNING stake for this task is adopted by the session screen
  // on its own (no params needed), but a merely SCHEDULED one is not, it
  // just sits in `stakesStore.scheduledStakes` until its own arm moment. So
  // if the chip above shows a schedule, Start must carry it explicitly (same
  // param shape app/task/[id].tsx's handleArmStake uses, plus
  // `fromScheduledId` so the store consumes that row atomically, only once
  // this arm actually succeeds) or the lock the chip advertised would never
  // actually happen. The ghost-chip case (nothing scheduled) stays a plain
  // unstaked start, and Start's own label never changes either way.
  const handleStart = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    const scheduled = Object.values(useStakesStore.getState().scheduledStakes).find(
      (s) => s.taskId === task.id,
    );
    router.push({
      pathname: "/focus/session",
      params: scheduled
        ? {
            taskId: task.id,
            stakeHold: scheduled.hold,
            stakeTrigger: "manual",
            stakeVerification: scheduled.verification,
            ...(scheduled.sessionMin != null ? { stakeSessionMin: String(scheduled.sessionMin) } : {}),
            fromScheduledId: scheduled.id,
          }
        : { taskId: task.id },
    });
  }, [task.id]);

  const handleNotNow = useCallback(() => {
    Haptics.selectionAsync().catch(() => {});
    onNotNow();
  }, [onNotNow]);

  // Defensive: the caller only mounts this once `task.firstMove` exists,
  // but guard rather than assert so this never reads a field TS can't prove.
  if (!task.firstMove) return null;
  const firstMoveText = task.firstMove.text;

  return (
    <View className="rounded-xl border border-line bg-surface p-4">
      {showFocusLabel ? (
        <Text variant="overline" className="text-primary-600">
          Today&apos;s focus
        </Text>
      ) : null}

      {/* Header row (measured layout): title on the left, duration
          right-aligned. List name / step count moved to a secondary line
          under the title so neither is dropped. */}
      <View className="mt-1.5 flex-row items-start justify-between gap-3">
        {scheduledAt != null ? (
          <Text variant="caption" className="text-ink-muted" style={tabularNums}>
            {formatClock(scheduledAt)}
          </Text>
        ) : null}
        <View className="flex-1">
          <Text variant="bodyLg" numberOfLines={1}>
            {task.title}
          </Text>
          {secondaryMeta ? (
            <Text variant="caption" className="mt-0.5 text-ink-muted" numberOfLines={1}>
              {secondaryMeta}
            </Text>
          ) : null}
        </View>
        <Text variant="caption" className="text-ink-secondary" style={tabularNums}>
          {durationLabel}
        </Text>
      </View>

      {/* First move: display only here. Completing it happens inside the
          session, never on Today (doc `04` §5: it is the on-ramp, never
          the unlock condition). */}
      <View className="mt-3.5 rounded-md bg-raised p-3">
        <Text variant="meta" className="text-primary-400">
          First move
        </Text>
        <Text variant="caption" className="mt-1.5 text-ink-secondary">
          {firstMoveText}
        </Text>
      </View>

      {/* Action row (measured layout): a small inline Start (92x32 in the
          source, h-8/rounded-md here, not Button's 44-tall md size), the
          lock chip beside it, Not now pushed to the trailing edge. */}
      <View className="mt-4 flex-row items-center gap-2">
        <PressableScale
          onPress={handleStart}
          haptic="medium"
          className="h-8 items-center justify-center rounded-md bg-primary-600 px-4"
          accessibilityRole="button"
          accessibilityLabel={`Start focus session for ${task.title}`}
        >
          <Text variant="captionMedium" className="text-primary-foreground">
            Start
          </Text>
        </PressableScale>

        <View className="flex-shrink">
          <LockChip task={task} />
        </View>

        <View className="flex-1 items-end">
          <PressableScale
            onPress={handleNotNow}
            haptic="light"
            className="min-h-11 items-center justify-center px-1"
            accessibilityRole="button"
            accessibilityLabel="Not now"
            accessibilityHint="Shows a different task to focus on"
          >
            <Text variant="bodyMedium" className="text-ink-secondary">
              Not now
            </Text>
          </PressableScale>
        </View>
      </View>
    </View>
  );
}
