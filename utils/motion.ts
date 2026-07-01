/**
 * Motion helpers for Reanimated 3.
 * Pure and side-effect free — safe to import anywhere (including on web export).
 */
import { Easing } from "react-native-reanimated";
import { motion } from "./design-tokens";

/**
 * Easing curves. `standard` is the ease-out default for enter/press feedback.
 * NEVER use bounce/elastic — calm, purposeful motion only (ADHD-friendly).
 */
export const EASINGS = {
  standard: Easing.out(Easing.cubic),
  accelerate: Easing.in(Easing.cubic),
  inOut: Easing.inOut(Easing.cubic),
} as const;

/**
 * Spring configs re-exported from motion tokens (for withSpring).
 * Includes `SPRINGS.default`, `SPRINGS.gentle`, and `SPRINGS.tactile` (snappier —
 * drag pickup/drop, control toggles) since this re-exports `motion.spring` wholesale.
 */
export const SPRINGS = motion.spring;

/**
 * Duration presets (ms) re-exported from motion tokens (for withTiming).
 * Includes `DURATIONS.drag` (120ms fast drag-follow) alongside the standard scale
 * since this re-exports `motion.duration` wholesale.
 */
export const DURATIONS = motion.duration;

/**
 * Haptic vocabulary (doc 02 v3 "Calm Premium"). Use `expo-haptics` via these three
 * cases consistently — do not invent new haptic meanings per screen:
 * - `selection` (Haptics.selectionAsync) — a snap/tick on discrete state change:
 *   calendar drag snapping to a new slot, segmented control switch, stepper tick.
 * - `light` (Haptics.impactAsync(Light)) — pickup/drop: grabbing a draggable block,
 *   releasing it, opening a sheet. Matches `PressableScale`'s default `haptic="light"`.
 * - `success` (Haptics.notificationAsync(Success)) — completion/commit: task done,
 *   drag committed to its final slot, a save that can't be undone casually.
 * Sparingly, never on every tap — see doc 02 §9.15.
 */

/**
 * Stagger delay for list entrance animations.
 * @example FadeInDown.delay(staggerDelay(index)).duration(200)
 */
export const staggerDelay = (index: number, step = 35): number => index * step;
