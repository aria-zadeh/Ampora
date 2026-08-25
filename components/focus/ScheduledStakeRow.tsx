/**
 * ScheduledStakeRow, one row in the Focus tab's "Scheduled locks" section
 * (doc `design/DECISION_SPEC` D1 section 3).
 *
 * `Locks at 4:00 PM . Write essay intro . Instagram and 2 more`, quiet card,
 * tap to edit, quiet instant Cancel (no confirm dialog, matching the armed
 * hero's own "Cancel lock": §9.10's wellbeing stance is reversible, never
 * guilt-gated).
 *
 * "Edit" hands this row's own id back to the parent along with its task id,
 * which reopens `StakeSetupSheet` with `existing={session}`. The sheet seeds
 * every field from it and replaces it ATOMICALLY on a successful Confirm, it
 * is never cancelled up front, so dismissing the sheet (or a refused
 * Confirm) leaves this scheduled stake untouched.
 */

import React, { useMemo } from "react";
import { View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useShallow } from "zustand/react/shallow";

import { Text } from "@/components/ui/Text";
import { PressableScale } from "@/components/ui/PressableScale";
import { useStakesStore, selectEligibleApps, selectStakeSelection } from "@/store/stakesStore";
import { colors, iconSizes, shadows, tabularNums } from "@/utils/design-tokens";
import type { StakeApp, StakeSession, Task } from "@/types";

/**
 * The "what's on the line" naming: named apps when available, else the
 * stored count, else null (nothing chosen). Mirrors `LockBanner`'s own
 * fallback (doc `05` §7: iOS hands back opaque tokens, never identity) minus
 * its "shouldn't happen while locked" ultra-fallback, since here `null` is a
 * real, everyday state ("nothing chosen yet") rather than an edge case.
 */
export function lockSubjectSummary(namedApps: StakeApp[], fallbackCount: number): string | null {
  if (namedApps.length === 1) return namedApps[0].label as string;
  if (namedApps.length > 1) return `${namedApps[0].label} and ${namedApps.length - 1} more`;
  if (fallbackCount === 1) return "1 app";
  if (fallbackCount > 1) return `${fallbackCount} apps`;
  return null;
}

/** "3:30 PM" style label, with a plain fallback if Intl is unavailable. */
function formatClockTime(atMs: number): string {
  try {
    return new Date(atMs).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  } catch {
    const d = new Date(atMs);
    const h = d.getHours();
    const m = d.getMinutes();
    const hh = ((h + 11) % 12) + 1;
    const ap = h < 12 ? "AM" : "PM";
    return `${hh}:${String(m).padStart(2, "0")} ${ap}`;
  }
}

export interface ScheduledStakeRowProps {
  session: StakeSession;
  /** The task this stake targets, when it can still be resolved. */
  task: Task | undefined;
  /** Open the composer sheet for this task id, seeded from this row's own id (`existing`). */
  onEdit: (taskId: string, existingScheduledId: string) => void;
}

export function ScheduledStakeRow({ session, task, onEdit }: ScheduledStakeRowProps) {
  const cancelScheduledStake = useStakesStore((s) => s.cancelScheduledStake);
  const namedApps = useStakesStore(useShallow(selectEligibleApps));
  const selection = useStakesStore(selectStakeSelection);

  const subject = useMemo(
    () => lockSubjectSummary(namedApps.filter((a) => !!a.label), selection?.count ?? 0),
    [namedApps, selection]
  );

  const timeLabel = session.scheduledAt != null ? formatClockTime(session.scheduledAt) : null;
  const parts = [
    timeLabel ? `Locks at ${timeLabel}` : "Scheduled lock",
    task?.title ?? "Untitled task",
    subject ?? "Choose what to lock",
  ];
  const summary = parts.join(" · ");

  const handleEdit = () => {
    onEdit(session.taskId, session.id);
  };

  return (
    <View
      className="flex-row items-center rounded-lg bg-white border border-neutral-200 px-4 py-3"
      style={shadows.xs}
    >
      <PressableScale
        onPress={handleEdit}
        haptic="light"
        className="flex-1 min-h-11 flex-row items-center pr-3"
        accessibilityRole="button"
        accessibilityLabel={summary}
        accessibilityHint="Edit this scheduled lock"
      >
        <Ionicons name="time-outline" size={iconSizes.sm} color={colors.light.textSecondary} />
        <Text
          variant="caption"
          className="flex-1 ml-2.5 text-neutral-700"
          numberOfLines={2}
          style={tabularNums}
        >
          {summary}
        </Text>
      </PressableScale>
      <PressableScale
        onPress={() => cancelScheduledStake(session.id)}
        haptic="light"
        className="min-h-11 px-2 items-center justify-center"
        accessibilityRole="button"
        accessibilityLabel="Cancel this scheduled lock"
        accessibilityHint="Cancels instantly, no confirmation"
      >
        <Text variant="captionMedium" className="text-neutral-500">
          Cancel
        </Text>
      </PressableScale>
    </View>
  );
}
