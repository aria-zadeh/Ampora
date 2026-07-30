/**
 * voiceCapture — on-device speech-to-text for "Brain dump" (PRD FR-4, §8.2).
 *
 * STT approach (see PRD §15 Q6: "Device STT first for cost/privacy"): this
 * wraps `expo-speech-recognition`, which drives the OS's own on-device speech
 * recognizer (iOS `SFSpeechRecognizer` with `requiresOnDeviceRecognition`,
 * Android `SpeechRecognizer`) rather than sending audio to a cloud model.
 * That matches the PRD's stated preference exactly: no per-utterance API
 * cost, no audio ever leaves the device, and it works fully offline once the
 * OS has the locale's speech model installed. It is genuinely live
 * recognition (not "record a clip, then transcribe it" as two separate
 * network round-trips) — `start()` opens the mic and streams interim +
 * final results as the user talks, so the "record" and "transcribe" steps
 * of the FR-4 pipeline collapse into one continuous session.
 *
 * Graceful degradation (hard requirement — must never hard-fail because a
 * mic is missing):
 *  - `isVoiceCaptureAvailable()` is a synchronous, try/catch-guarded check.
 *    It returns false on any platform/runtime where recognition genuinely
 *    isn't usable — most notably a browser without the Web Speech API. The
 *    package itself ships a web implementation (`ExpoSpeechRecognitionModule
 *    .web`) that polyfills onto `webkitSpeechRecognition` /
 *    `SpeechRecognition` where the browser supports it (desktop Chrome,
 *    Safari 16+), so voice capture can genuinely work on web too — it just
 *    reports unavailable, rather than throwing, everywhere it can't.
 *  - Every native call in `useVoiceCapture` is wrapped so a missing/failing
 *    module, a denied permission, a mid-session recognizer error, or a
 *    platform quirk (e.g. `end` never firing) all resolve to a controlled
 *    `"error"` state with a calm, actionable message — never an unhandled
 *    rejection or a crash.
 *  - Callers (`components/capture/BrainDumpSheet.tsx`) always keep the full
 *    typed quick-add field available regardless of what this reports, so a
 *    user who can't or won't grant mic access loses nothing.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Platform } from "react-native";
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
  type ExpoSpeechRecognitionErrorCode,
} from "expo-speech-recognition";

export type VoiceCaptureStatus = "idle" | "starting" | "recording" | "stopping" | "error";

export interface VoiceCaptureState {
  status: VoiceCaptureStatus;
  /** Committed final transcript so far (across every `isFinal` result this session). */
  transcript: string;
  /** The not-yet-final trailing words, shown as a "still listening" caption. */
  interim: string;
  elapsedSec: number;
  /** Normalized 0..1 mic level for a visual meter — never left static while recording. */
  level: number;
  /** Present only in the `"error"` status; always safe to show the user as-is. */
  errorMessage?: string;
}

export interface VoiceCaptureApi {
  state: VoiceCaptureState;
  /** Begin listening. Resolves once started OR once a controlled error state is set — never throws. */
  start: () => Promise<void>;
  /** Stop and resolve with the final transcript (best-effort; resolves even if the platform never confirms). */
  stop: () => Promise<string>;
  /** Abandon the session immediately, discarding any transcript. */
  cancel: () => void;
}

const IDLE_STATE: VoiceCaptureState = {
  status: "idle",
  transcript: "",
  interim: "",
  elapsedSec: 0,
  level: 0,
};

/** Safety net so `stop()` always resolves even if the platform never fires `end`. */
const STOP_TIMEOUT_MS = 4000;

/**
 * Best-effort availability check — never throws. False on any platform/
 * runtime where speech recognition (on-device or the browser's Web Speech
 * API) isn't usable right now, so callers can point the user at the typed
 * quick-add field instead of opening a dead-end recording UI.
 */
export function isVoiceCaptureAvailable(): boolean {
  try {
    return ExpoSpeechRecognitionModule.isRecognitionAvailable();
  } catch {
    return false;
  }
}

function humanizeError(code: ExpoSpeechRecognitionErrorCode | string): string {
  switch (code) {
    case "not-allowed":
      return "Microphone access was declined. You can still type your task below.";
    case "no-speech":
    case "speech-timeout":
      return "Didn't catch anything — try again, or type it instead.";
    case "network":
      return "No connection for speech recognition right now. You can still type your task.";
    case "language-not-supported":
    case "service-not-allowed":
      return "Voice capture isn't available on this device. You can still type your task.";
    case "aborted":
      return "Recording stopped.";
    default:
      return "Voice capture had a problem. You can still type your task.";
  }
}

/**
 * Drives one record -> transcribe session. A fresh session starts on every
 * `start()` call (the transcript resets); nothing here persists across
 * unmounts. `components/capture/BrainDumpSheet.tsx` owns the lifecycle.
 */
export function useVoiceCapture(): VoiceCaptureApi {
  const [state, setState] = useState<VoiceCaptureState>(IDLE_STATE);

  const startedAtRef = useRef<number | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const finalRef = useRef("");
  const resolveStopRef = useRef<((transcript: string) => void) | null>(null);
  const stopTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimers = useCallback(() => {
    if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
    if (stopTimeoutRef.current) {
      clearTimeout(stopTimeoutRef.current);
      stopTimeoutRef.current = null;
    }
  }, []);

  useEffect(() => clearTimers, [clearTimers]);

  // --- Native/web event wiring. Safe to register unconditionally; the hook
  // no-ops if the underlying module can't emit events. ---

  useSpeechRecognitionEvent("result", (event) => {
    const alt = event.results?.[0];
    const text = alt?.transcript?.trim() ?? "";
    if (!text) return;
    if (event.isFinal) {
      finalRef.current = finalRef.current ? `${finalRef.current} ${text}` : text;
      setState((s) => ({ ...s, transcript: finalRef.current, interim: "" }));
    } else {
      setState((s) => ({ ...s, interim: text }));
    }
  });

  useSpeechRecognitionEvent("volumechange", (event) => {
    // Range is roughly -2..10 (anything below 0 is inaudible) — normalize to 0..1.
    const normalized = Math.max(0, Math.min(1, (event.value + 2) / 12));
    setState((s) => (s.status === "recording" ? { ...s, level: normalized } : s));
  });

  useSpeechRecognitionEvent("error", (event) => {
    clearTimers();
    setState((s) => ({ ...s, status: "error", errorMessage: humanizeError(event.error), level: 0 }));
  });

  useSpeechRecognitionEvent("end", () => {
    clearTimers();
    const finalText = finalRef.current.trim();
    setState((s) => (s.status === "error" ? s : { ...s, status: "idle", interim: "", level: 0 }));
    if (resolveStopRef.current) {
      resolveStopRef.current(finalText);
      resolveStopRef.current = null;
    }
  });

  const start = useCallback(async () => {
    finalRef.current = "";
    resolveStopRef.current = null;
    setState({ ...IDLE_STATE, status: "starting" });

    try {
      if (!isVoiceCaptureAvailable()) {
        setState((s) => ({
          ...s,
          status: "error",
          errorMessage: "Voice capture isn't available on this device. You can still type your task.",
        }));
        return;
      }

      const permission = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!permission.granted) {
        setState((s) => ({
          ...s,
          status: "error",
          errorMessage: "Microphone access was declined. You can still type your task below.",
        }));
        return;
      }

      startedAtRef.current = Date.now();
      clearTimers();
      tickRef.current = setInterval(() => {
        setState((s) => ({
          ...s,
          elapsedSec: startedAtRef.current ? Math.floor((Date.now() - startedAtRef.current) / 1000) : 0,
        }));
      }, 250);

      ExpoSpeechRecognitionModule.start({
        lang: "en-US",
        interimResults: true,
        continuous: true,
        // PRD §15 Q6: prefer on-device recognition. Not supported on every
        // Android device/locale — when it isn't, the recognizer reports a
        // controlled `error` event (handled above), it never crashes.
        requiresOnDeviceRecognition: Platform.OS !== "web",
        addsPunctuation: true,
        volumeChangeEventOptions: { enabled: true, intervalMillis: 100 },
      });

      setState((s) => ({ ...s, status: "recording" }));
    } catch {
      clearTimers();
      setState((s) => ({
        ...s,
        status: "error",
        errorMessage: "Couldn't start voice capture. You can still type your task.",
      }));
    }
  }, [clearTimers]);

  const stop = useCallback((): Promise<string> => {
    return new Promise((resolve) => {
      setState((s) => (s.status === "recording" ? { ...s, status: "stopping" } : s));
      resolveStopRef.current = resolve;

      try {
        ExpoSpeechRecognitionModule.stop();
      } catch {
        clearTimers();
        resolveStopRef.current = null;
        resolve(finalRef.current.trim());
        return;
      }

      // Safety net: some platforms/edge cases never fire `end` after `stop()`.
      stopTimeoutRef.current = setTimeout(() => {
        if (resolveStopRef.current) {
          resolveStopRef.current(finalRef.current.trim());
          resolveStopRef.current = null;
          setState((s) => (s.status === "stopping" ? { ...s, status: "idle" } : s));
        }
      }, STOP_TIMEOUT_MS);
    });
  }, [clearTimers]);

  const cancel = useCallback(() => {
    clearTimers();
    resolveStopRef.current = null;
    try {
      ExpoSpeechRecognitionModule.abort();
    } catch {
      // Best-effort — the session is being discarded either way.
    }
    setState(IDLE_STATE);
  }, [clearTimers]);

  return { state, start, stop, cancel };
}
