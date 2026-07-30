/**
 * useStakeTick — the app-wide driver for `stakesStore.tick()` (PRD FR-45,
 * §9.10; doc `04` §7).
 *
 * `tick()` is where every time-based wellbeing release actually happens: it
 * accrues `todayLockMin`, rolls the day over, and auto-releases on the daily
 * cap, the quiet-hours boundary, the single-session cap and the served session
 * length. NOTHING in the app called it on a schedule, which meant a lock armed
 * from the focus screen and then abandoned had no clock running against it at
 * all — released only by the panic valve or the next cold launch. That is the
 * "trap the user" failure NFR-7 and doc `04` §7 forbid, so this hook exists to
 * make the caps real.
 *
 * Mounted ONCE, in `app/_layout.tsx`, so the caps apply everywhere and not just
 * inside the focus screen.
 *
 * Two drivers:
 *  - a 60s interval while the app is foregrounded and a session is active;
 *  - a catch-up pass on every return to foreground, because JS timers do not
 *    run reliably in the background. `tick()` accrues exactly one minute per
 *    call, so catching up means calling it once per whole minute missed. Each
 *    call re-checks every cap and early-returns once the session has ended, so
 *    the loop is self-limiting — and over-accruing would only release SOONER,
 *    which is the safe direction.
 */

import { useEffect, useRef } from "react";
import { AppState, type AppStateStatus } from "react-native";
import { useStakesStore } from "@/store/stakesStore";

const TICK_MS = 60_000;

/**
 * Ceiling on catch-up iterations. The daily cap is 180 minutes by default and
 * the single-session cap releases long before that, so 240 is far past any
 * legitimate need — it exists purely so a corrupt clock can never spin.
 */
const MAX_CATCH_UP_TICKS = 240;

export function useStakeTick(): void {
  // Whether a session is live. Raw field select (Zustand v5 discipline) —
  // mapping to a boolean here would be a new value every render.
  const activeSession = useStakesStore((s) => s.activeSession);
  const hasActive = activeSession != null;

  const lastTickAtRef = useRef<number>(Date.now());

  useEffect(() => {
    if (!hasActive) {
      // Nothing to accrue against; keep the mark fresh so the next armed
      // session does not immediately "catch up" on time it never held.
      lastTickAtRef.current = Date.now();
      return;
    }

    const tick = useStakesStore.getState().tick;

    /** Run `n` ticks, stopping the moment the store releases the session. */
    const runTicks = (n: number) => {
      const bounded = Math.max(0, Math.min(MAX_CATCH_UP_TICKS, n));
      for (let i = 0; i < bounded; i++) {
        if (useStakesStore.getState().activeSession == null) break;
        tick();
      }
      lastTickAtRef.current = Date.now();
    };

    const id = setInterval(() => runTicks(1), TICK_MS);

    const onAppState = (next: AppStateStatus) => {
      if (next !== "active") return;
      // Back in the foreground: credit the whole minutes that elapsed while the
      // JS timer was suspended, so the caps land on time rather than on return.
      const missed = Math.floor((Date.now() - lastTickAtRef.current) / TICK_MS);
      if (missed > 0) runTicks(missed);
    };
    const sub = AppState.addEventListener("change", onAppState);

    // Deliberately NO tick on mount: `tick()` accrues a whole minute per call,
    // so firing one the instant a stake arms would bill the user a minute they
    // never served. A session that survived a cold start is re-checked by
    // `reconcileActiveSession` in `app/_layout.tsx` instead, which reads the
    // real wall clock.
    lastTickAtRef.current = Date.now();

    return () => {
      clearInterval(id);
      sub.remove();
    };
  }, [hasActive]);
}
