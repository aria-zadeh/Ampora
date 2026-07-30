/**
 * useNightlyPass — the app-wide driver for the pre-built-tomorrow pass
 * (PRD FR-90; `services/nightlyPass.ts`).
 *
 * Mirrors `useStakeScheduler`'s shape (mounted once, alongside it, in
 * `app/_layout.tsx`): run on mount (covers cold-launch catch-up exactly like
 * the scheduled-stake driver), on every return to foreground, and on a poll
 * while foregrounded. The poll here is much coarser (5 minutes, vs. 30s for
 * stakes) because this only needs to notice crossing the evening threshold
 * while the app happens to stay open continuously — `runNightlyPassIfDue`
 * itself is a cheap no-op the rest of the time (see its own doc comment for
 * the full "what fires when" story, including why there is deliberately no
 * background timer here).
 */

import { useEffect } from "react";
import { AppState, type AppStateStatus } from "react-native";
import { runNightlyPassIfDue } from "@/services/nightlyPass";

const POLL_MS = 5 * 60 * 1000;

export function useNightlyPass(): void {
  useEffect(() => {
    // Immediately on mount: covers both the ordinary "opened during the
    // evening" case and the missed-last-night catch-up case.
    void runNightlyPassIfDue();

    const id = setInterval(() => {
      void runNightlyPassIfDue();
    }, POLL_MS);

    const onAppState = (next: AppStateStatus) => {
      if (next === "active") void runNightlyPassIfDue();
    };
    const sub = AppState.addEventListener("change", onAppState);

    return () => {
      clearInterval(id);
      sub.remove();
    };
  }, []);
}
