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
import { Heading } from "@/components/ui/Heading";
import { PressableScale } from "@/components/ui/PressableScale";
import { StakeSetupSheet, type ArmedStake } from "@/components/stakes/StakeSetupSheet";
import {
  useStakesStore,
  selectEligibleApps,
  selectStakeSelection,
} from "@/store/stakesStore";
import { useListStore } from "@/store/listStore";
import { shadows, tabularNums } from "@/utils/design-tokens";
import { useThemeColors } from "@/hooks/useThemeColors";
import type { Task, StakeApp } from "@/types";

interface TodayFocusCardProps {
  task: Task;
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
  // For the padlock glyph's Ionicons `color` only. `textSecondary` is one of
  // the tokens that genuinely inverts, and this chip is how an armed lock is
  // advertised on Today, so it must not fade out on a dark card.
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
      {/* Visual chip is 32px (h-8). hitSlop brings the tappable area to the
          44px minimum without inflating the pill itself. Plain Pressable,
          not PressableScale, because this needs hitSlop and that primitive
          does not expose one. */}
      <Pressable
        onPress={handlePress}
        hitSlop={6}
        className="mt-2.5 h-8 flex-row items-center self-start gap-1.5 rounded-full bg-neutral-100 px-3 active:opacity-70 dark:bg-neutral-800"
        accessibilityRole="button"
        accessibilityLabel={a11yLabel}
        accessibilityHint="Opens lock settings for this task"
      >
        <Ionicons name="lock-closed-outline" size={14} color={theme.textSecondary} />
        <Text variant="label" className="text-neutral-600 dark:text-neutral-400" numberOfLines={1}>
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

export function TodayFocusCard({ task, onNotNow }: TodayFocusCardProps) {
  // Raw select of the resolved List, same shape as TomorrowPlanCard's
  // project lookup, stable unless the list itself changes, no useShallow.
  const list = useListStore((s) => (task.listId ? s.lists[task.listId] : undefined));

  const metaLine = useMemo(() => {
    const parts = [`${task.durationMin} min`];
    if (list?.name) parts.push(list.name);
    if (task.subtasks.length > 0) {
      parts.push(`${task.subtasks.length} ${task.subtasks.length === 1 ? "step" : "steps"}`);
    }
    return parts.join(" · ");
  }, [task.durationMin, list?.name, task.subtasks.length]);

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
    <View className="rounded-2xl bg-white p-4 dark:bg-neutral-900" style={shadows.md}>
      <Text variant="overline" className="text-neutral-500 dark:text-[#78716C]">
        Today&apos;s focus
      </Text>
      <Heading size="h3" className="mt-1.5" numberOfLines={2}>
        {task.title}
      </Heading>
      <Text variant="caption" className="mt-1 text-neutral-600 dark:text-neutral-400" style={tabularNums}>
        {metaLine}
      </Text>

      <LockChip task={task} />

      {/* First move: display only here. Completing it happens inside the
          session, never on Today (doc `04` §5: it is the on-ramp, never
          the unlock condition). */}
      <View className="mt-3.5 rounded-[14px] bg-neutral-100 p-3 dark:bg-neutral-800">
        {/* Accent TEXT on a neutral panel, so it has to step lighter on dark:
            primary-600 measures 2.93:1 on neutral-800, under even the 3:1
            glyph bar, while primary-400 restores it to 5.97:1 (cheatsheet,
            utils/design-tokens.ts, doc 02 section 1.8). */}
        <Text variant="overline" className="text-primary-600 dark:text-primary-400">
          First move
        </Text>
        <Text variant="bodyMedium" className="mt-1.5 text-neutral-800 dark:text-neutral-200">
          {firstMoveText}
        </Text>
      </View>

      <View className="mt-4 flex-row items-center gap-4">
        <PressableScale
          onPress={handleStart}
          haptic="medium"
          className="h-12 flex-1 flex-row items-center justify-center rounded-[14px] bg-primary-600"
          style={shadows.xs}
          accessibilityRole="button"
          accessibilityLabel={`Start focus session for ${task.title}`}
        >
          <Text variant="label" className="text-white">
            Start
          </Text>
        </PressableScale>
        <PressableScale
          onPress={handleNotNow}
          haptic="light"
          className="min-h-11 items-center justify-center px-1"
          accessibilityRole="button"
          accessibilityLabel="Not now"
          accessibilityHint="Shows a different task to focus on"
        >
          <Text variant="bodyMedium" className="text-neutral-600 dark:text-neutral-400">
            Not now
          </Text>
        </PressableScale>
      </View>
    </View>
  );
}
