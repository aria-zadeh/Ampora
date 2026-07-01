/**
 * Ambient focus-audio configuration — Ampora Phase 4 (PRD FR-62).
 *
 * Defines the `FocusAudio` kinds locally (the old `@/types#FocusAudio` used
 * `white_noise`/`brown_noise`; the new model is `white | brown | rain | cafe |
 * none`). Sources are royalty-free MP3s; set a `uri` to null to make that
 * option a silent no-op without removing it from the picker.
 */

/** Ambient sound kinds for a focus session. */
export type FocusAudio = "white" | "brown" | "rain" | "cafe" | "none";

export interface AudioOption {
  kind: FocusAudio;
  label: string;
  /** Ionicons name (design system uses Ionicons). */
  icon: string;
  /** Remote looping source, or null to silently skip playback. */
  uri: string | null;
}

/** Playable options (excludes "none"). */
export const AUDIO_OPTIONS: AudioOption[] = [
  {
    kind: "white",
    label: "White",
    icon: "volume-high-outline",
    uri: "https://upload.wikimedia.org/wikipedia/commons/transcoded/9/98/White-noise-sound-20sec-mono-44100Hz.ogg/White-noise-sound-20sec-mono-44100Hz.ogg.mp3",
  },
  {
    kind: "brown",
    label: "Brown",
    icon: "volume-medium-outline",
    uri: "https://upload.wikimedia.org/wikipedia/commons/transcoded/c/c9/Brownnoise.ogg/Brownnoise.ogg.mp3",
  },
  {
    kind: "rain",
    label: "Rain",
    icon: "rainy-outline",
    uri: "https://upload.wikimedia.org/wikipedia/commons/transcoded/8/8a/Sound_of_rain.ogg/Sound_of_rain.ogg.mp3",
  },
  {
    kind: "cafe",
    label: "Cafe",
    icon: "cafe-outline",
    uri: "https://upload.wikimedia.org/wikipedia/commons/transcoded/b/b5/Restaurant_ambience.ogg/Restaurant_ambience.ogg.mp3",
  },
];

/** Full picker row including the "Off" option. */
export const AUDIO_PICKER_OPTIONS: { kind: FocusAudio; label: string; icon: string }[] = [
  ...AUDIO_OPTIONS.map(({ kind, label, icon }) => ({ kind, label, icon })),
  { kind: "none", label: "Off", icon: "volume-mute-outline" },
];

export function getAudioOption(kind: FocusAudio): AudioOption | null {
  return AUDIO_OPTIONS.find((o) => o.kind === kind) ?? null;
}
