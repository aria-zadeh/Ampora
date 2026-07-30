/**
 * useForegroundTimer — the bounded, foreground-only session clock (PRD FR-62,
 * FR-77b; doc `04` §6).
 *
 * ONE bounded run of `totalSec`, not a work/break loop. The clock advances only
 * while Ampora is in the FOREGROUND and the user has not paused it, because
 * foreground focus time is the unlock currency for a `hold: 'session'` stake —
 * if background time counted, leaving the app would serve the lock, which is
 * exactly the leak the session model exists to close.
 *
 * Two deliberate behaviours, both preserved from the screen this was lifted out
 * of:
 *
 *  1. **Backgrounding pauses.** Going to background/inactive stops the clock and
 *     flags the run as `interrupted`, so served time never includes time away.
 *  2. **Returning does NOT auto-resume.** The user resumes on purpose. A silent
 *     restart would re-claim attention without consent, which is the wrong move
 *     for this audience — and it keeps served time obviously honest.
 *
 * `held` is a separate, external hold (a break). A break must never count
 * toward a hold, and it must not clobber the user's own pause/resume intent —
 * so it gates ticking without touching `running`.
 *
 * `onComplete` fires exactly once, when served time first reaches `totalSec`.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, type AppStateStatus } from "react-native";

export interface ForegroundTimerOptions {
  /** Total bounded length in seconds. Served FOREGROUND seconds, not wall clock. */
  totalSec: number;
  /** Foreground seconds already served — e.g. re-entering a stake that is mid-session. @default 0 */
  initialElapsedSec?: number;
  /** Whether the clock starts running. @default true */
  autoStart?: boolean;
  /** External hold (a break, a modal). While true the clock never advances, whatever `running` says. */
  held?: boolean;
  /** Called once per served second, with the delta (always 1). Use for accrual. */
  onSecond?: (deltaSec: number) => void;
  /** Fired exactly once, the moment served time reaches `totalSec`. */
  onComplete?: () => void;
}

export interface ForegroundTimer {
  /** Foreground seconds served so far (never exceeds `totalSec`). */
  elapsedSec: number;
  /** Seconds left to serve. */
  remainingSec: number;
  /** 0..1 share of the session served. */
  progress: number;
  /** The user's intent: are they running the clock? */
  running: boolean;
  /** Whether the clock is actually advancing right now (`running && !held && !completed`). */
  ticking: boolean;
  /** True once the user has left the app at least once during this run. */
  interrupted: boolean;
  /** Sticky honesty flag: they left at some point, even if they cleared `interrupted` by resuming. */
  leftDuringSession: boolean;
  /** Wall-clock seconds spent outside the app during this run (excluded from `elapsedSec`). */
  awaySec: () => number;
  /** True once `totalSec` has been served. */
  completed: boolean;
  pause: () => void;
  resume: () => void;
  toggle: () => void;
  /** Start a fresh run (the "Keep going" path). Clears completion + interruption. */
  reset: (elapsedSec?: number) => void;
}

export function useForegroundTimer({
  totalSec,
  initialElapsedSec = 0,
  autoStart = true,
  held = false,
  onSecond,
  onComplete,
}: ForegroundTimerOptions): ForegroundTimer {
  const total = Math.max(1, Math.round(Number.isFinite(totalSec) ? totalSec : 1));

  const clampInitial = (n: number) => Math.max(0, Math.min(total, Math.round(Number.isFinite(n) ? n : 0)));

  const [elapsedSec, setElapsedSec] = useState(() => clampInitial(initialElapsedSec));
  const [running, setRunning] = useState(autoStart);
  const [interrupted, setInterrupted] = useState(false);
  const [leftDuringSession, setLeftDuringSession] = useState(false);
  const [completed, setCompleted] = useState(false);

  // Served seconds also live in a ref so the 1s interval can advance without
  // re-subscribing and without doing side effects inside a state updater
  // (React may invoke updaters twice — accrual must fire exactly once).
  const elapsedRef = useRef(elapsedSec);
  const completedRef = useRef(false);
  const runningRef = useRef(running);
  const awayMsRef = useRef(0);
  const awayAtRef = useRef<number | null>(null);

  // Latest callbacks, read from the interval without re-arming it every render.
  const onSecondRef = useRef(onSecond);
  const onCompleteRef = useRef(onComplete);
  useEffect(() => {
    onSecondRef.current = onSecond;
    onCompleteRef.current = onComplete;
  }, [onSecond, onComplete]);

  useEffect(() => {
    runningRef.current = running;
  }, [running]);

  const ticking = running && !held && !completed;

  // -- The 1s clock. Side effects (accrual, completion) happen here, in the
  //    interval callback, never inside a setState updater. --
  useEffect(() => {
    if (!ticking) return;
    const id = setInterval(() => {
      if (completedRef.current) return;
      const next = elapsedRef.current + 1;
      elapsedRef.current = Math.min(next, total);
      setElapsedSec(elapsedRef.current);
      onSecondRef.current?.(1);
      if (next >= total) {
        completedRef.current = true;
        setCompleted(true);
        setRunning(false);
        onCompleteRef.current?.();
      }
    }, 1000);
    return () => clearInterval(id);
  }, [ticking, total]);

  // -- Foreground gating (FR-77b). Background/inactive pauses and marks the run
  //    interrupted; returning accrues the time away but deliberately does NOT
  //    resume — the user resumes on purpose. --
  useEffect(() => {
    const onChange = (next: AppStateStatus) => {
      if (next === "background" || next === "inactive") {
        if (awayAtRef.current == null) awayAtRef.current = Date.now();
        if (runningRef.current) setRunning(false);
        setInterrupted(true);
        setLeftDuringSession(true);
      } else if (next === "active") {
        if (awayAtRef.current != null) {
          awayMsRef.current += Date.now() - awayAtRef.current;
          awayAtRef.current = null;
        }
        // No auto-resume, on purpose. See the module docstring.
      }
    };
    const sub = AppState.addEventListener("change", onChange);
    return () => sub.remove();
  }, []);

  const pause = useCallback(() => setRunning(false), []);

  const resume = useCallback(() => {
    if (completedRef.current) return;
    // Resuming clears the transient "you were away" note. `leftDuringSession`
    // stays set, so served-time honesty is never quietly forgotten.
    setInterrupted(false);
    setRunning(true);
  }, []);

  const toggle = useCallback(() => {
    if (runningRef.current) pause();
    else resume();
  }, [pause, resume]);

  const reset = useCallback(
    (nextElapsedSec = 0) => {
      const start = Math.max(0, Math.min(total, Math.round(Number.isFinite(nextElapsedSec) ? nextElapsedSec : 0)));
      elapsedRef.current = start;
      completedRef.current = false;
      awayMsRef.current = 0;
      awayAtRef.current = null;
      setElapsedSec(start);
      setCompleted(false);
      setInterrupted(false);
      setRunning(true);
    },
    [total]
  );

  const awaySec = useCallback(() => {
    const live = awayAtRef.current != null ? Date.now() - awayAtRef.current : 0;
    return Math.round((awayMsRef.current + live) / 1000);
  }, []);

  return {
    elapsedSec,
    remainingSec: Math.max(0, total - elapsedSec),
    progress: Math.min(1, Math.max(0, elapsedSec / total)),
    running,
    ticking,
    interrupted,
    leftDuringSession,
    awaySec,
    completed,
    pause,
    resume,
    toggle,
    reset,
  };
}
