/**
 * useStakeScheduler — the app-wide driver for `stakesStore.autoArmDueStakes()`
 * (PRD FR-41a; ARCH_PLAN A4).
 *
 * Mirrors `useStakeTick`'s shape (mounted once in `app/_layout.tsx`, alongside
 * it), but with different timing rules because arming is fundamentally
 * different from accrual:
 *  - `useStakeTick` deliberately skips a tick on mount (a whole minute would
 *    be billed for lock time never actually held).
 *  - `useStakeScheduler` DOES run immediately on mount (and again whenever
 *    `scheduledStakes` transitions between empty and non-empty, which also
 *    covers MMKV rehydration landing after the first render): a scheduled
 *    stake's arm moment may already have passed while the app was closed, and
 *    the achievability matrix (ARCH_PLAN A4) requires arming it — or timing
 *    it out — on the very next cold launch. `autoArmDueStakes` is idempotent
 *    by design (its own doc comment: "safe to call on every foreground and
 *    30s tick"), so calling it eagerly is always safe.
 *
 * Foreground is the source of truth for the soft-lock path (ARCH_PLAN A4):
 * only while Ampora is in the foreground can a stake actually arm. The 30s
 * interval covers "the app is open and a stake comes due while you watch
 * it"; the `AppState` listener covers "you were away and just came back,"
 * exactly like `useStakeTick`'s catch-up. There is deliberately no background
 * timer: `expo-background-task` was rejected in ARCH_PLAN A4 (iOS's
 * opportunistic wakeups cannot hit `scheduledAt + startWindowMin`, are dead in
 * Low Power Mode, and would buy nothing the cue notification does not already
 * buy). A backgrounded or killed app relies entirely on the notification
 * (`services/stakeScheduling.ts`) as the behavioural cue, and arms for real
 * only once the user actually returns — which is the correct behaviour, not a
 * compromise: a soft lock that "arms" with the app closed would shield
 * nothing anyway.
 */

import { useEffect } from "react";
import { AppState, type AppStateStatus } from "react-native";
import { useStakesStore } from "@/store/stakesStore";

const POLL_MS = 30_000;

export function useStakeScheduler(): void {
  // Raw field select (Zustand v5 discipline), derived via a plain count so
  // the effect only re-runs on a genuine empty <-> non-empty transition, not
  // on every unrelated field change in `scheduledStakes` (e.g. one being
  // added while another is also present still yields the same truthy count
  // unless it crosses 0, which is fine — the interval is already running).
  const scheduledCount = useStakesStore((s) => Object.keys(s.scheduledStakes).length);
  const hasScheduled = scheduledCount > 0;

  useEffect(() => {
    // Run once immediately on every mount/transition, even with nothing
    // scheduled yet — cheap (an empty loop) when there is nothing due, and
    // exactly what a cold launch with an overdue cue needs (ARCH_PLAN A4:
    // "arming happens on next cold launch").
    useStakesStore.getState().autoArmDueStakes();

    if (!hasScheduled) return;

    const run = () => useStakesStore.getState().autoArmDueStakes();

    const id = setInterval(run, POLL_MS);
    const onAppState = (next: AppStateStatus) => {
      if (next === "active") run();
    };
    const sub = AppState.addEventListener("change", onAppState);

    return () => {
      clearInterval(id);
      sub.remove();
    };
  }, [hasScheduled]);
}
