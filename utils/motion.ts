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

/** Spring configs re-exported from motion tokens (for withSpring). */
export const SPRINGS = motion.spring;

/** Duration presets (ms) re-exported from motion tokens (for withTiming). */
export const DURATIONS = motion.duration;

/**
 * Stagger delay for list entrance animations.
 * @example FadeInDown.delay(staggerDelay(index)).duration(200)
 */
export const staggerDelay = (index: number, step = 35): number => index * step;
