/**
 * useFocusAudio — ambient audio for a focus session (PRD FR-62).
 *
 * Small API by design:
 *   const { current, play, stop, setVolume } = useFocusAudio();
 *   play("rain");   // stop current, load + loop the new one
 *   setVolume(0.5); // live volume, 0..1
 *   stop();         // stop + unload
 *
 * Uses `expo-av` (SDK54; `expo-audio` is not installed in this project). All
 * playback is best-effort: if the platform can't play audio (web without a
 * user gesture, a load failure, a null uri), every method silently no-ops and
 * the session continues without sound. Nothing here can crash the focus screen.
 *
 * `current` is React state so the picker UI can highlight the active choice;
 * the actual Sound object lives in a ref (not state) to avoid re-renders.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Platform } from "react-native";
import { Audio } from "expo-av";
import type { AVPlaybackStatusToSet } from "expo-av";
import { getAudioOption, type FocusAudio } from "@/utils/audioConfig";

export interface FocusAudioApi {
  /** The currently selected kind ("none" when nothing is playing). */
  current: FocusAudio;
  /** Switch ambient audio. "none" stops playback. */
  play: (kind: FocusAudio) => Promise<void>;
  /** Stop and unload the current sound. */
  stop: () => Promise<void>;
  /** Set volume 0..1 for the current and future sounds. */
  setVolume: (v: number) => Promise<void>;
}

export function useFocusAudio(): FocusAudioApi {
  const soundRef = useRef<Audio.Sound | null>(null);
  const volumeRef = useRef<number>(0.7);
  const [current, setCurrent] = useState<FocusAudio>("none");

  // Configure the audio session once (best-effort; never fatal).
  useEffect(() => {
    Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      playsInSilentModeIOS: true,
      staysActiveInBackground: false,
      shouldDuckAndroid: true,
    }).catch(() => {
      // Non-fatal — continue without audio-mode config.
    });

    return () => {
      // Unload on unmount.
      soundRef.current?.unloadAsync().catch(() => {});
      soundRef.current = null;
    };
  }, []);

  const unloadCurrent = useCallback(async () => {
    const s = soundRef.current;
    soundRef.current = null;
    if (s) {
      try {
        await s.stopAsync();
      } catch {
        // ignore
      }
      try {
        await s.unloadAsync();
      } catch {
        // ignore
      }
    }
  }, []);

  const stop = useCallback(async () => {
    await unloadCurrent();
    setCurrent("none");
  }, [unloadCurrent]);

  const play = useCallback(
    async (kind: FocusAudio) => {
      await unloadCurrent();

      if (kind === "none") {
        setCurrent("none");
        return;
      }

      const option = getAudioOption(kind);
      if (!option?.uri) {
        // Unknown kind or intentionally-silent option — treat as selected but silent.
        setCurrent(kind);
        return;
      }

      // Web audio needs a user gesture and often fails to autoplay; keep it
      // fully guarded so a rejected promise never bubbles to the UI.
      const initialStatus: AVPlaybackStatusToSet = {
        shouldPlay: true,
        isLooping: true,
        volume: volumeRef.current,
      };

      try {
        const { sound } = await Audio.Sound.createAsync({ uri: option.uri }, initialStatus);
        soundRef.current = sound;
        setCurrent(kind);
      } catch {
        // Load/playback failure — remain silent, but still reflect the choice
        // on native so the picker doesn't look broken. On web, fall back to
        // "none" so we don't imply audio that will never come.
        soundRef.current = null;
        setCurrent(Platform.OS === "web" ? "none" : kind);
      }
    },
    [unloadCurrent]
  );

  const setVolume = useCallback(async (v: number) => {
    const clamped = Math.max(0, Math.min(1, v));
    volumeRef.current = clamped;
    if (soundRef.current) {
      try {
        await soundRef.current.setVolumeAsync(clamped);
      } catch {
        // ignore
      }
    }
  }, []);

  return { current, play, stop, setVolume };
}
