/**
 * Insights store — Ampora Phase 6 (rebuilt on the NEW model).
 *
 * The v1 insights store computed completion streaks / by-hour histograms from a
 * bespoke `CompletionRecord` / `ProductivityWindow` shape that no longer exists
 * in the data model. Those concerns are now served by the Learning Engine
 * (Focus DNA) over the append-only `BehavioralSignal` log.
 *
 * This module is kept as a thin, typecheck-clean compatibility surface: it
 * derives the small "insights" numbers screens want (streak, weekly completion
 * count, best focus window label, by-hour completion histogram) directly from
 * `useBehavioralStore` + the cached `FocusProfile` in `useLearningStore`. It
 * holds NO state of its own and references no removed `@/types` names.
 */

import { useBehavioralStore } from '@/store/behavioralStore'
import { useLearningStore, selectFocusProfile } from '@/store/learningStore'
import type { BehavioralSignal } from '@/types'

const DAY_MS = 24 * 60 * 60 * 1000

/** Completions per hour-of-day (0-23) over the last `days` days. */
export function completionsByHour(days = 7): Record<number, number> {
  const cutoff = Date.now() - days * DAY_MS
  const signals = useBehavioralStore.getState().signals
  const byHour: Record<number, number> = {}
  for (let h = 0; h < 24; h++) byHour[h] = 0
  for (const s of signals) {
    if (!s.completed) continue
    if (!withinCutoff(s, cutoff)) continue
    byHour[clampHour(s.hourOfDay)] += 1
  }
  return byHour
}

/** Consecutive-day completion streak ending today (0 if none today). */
export function currentStreak(): number {
  const signals = useBehavioralStore.getState().signals
  const days = new Set<string>()
  for (const s of signals) {
    if (!s.completed) continue
    const at = s.actualStart ?? s.plannedStart
    if (at == null) continue
    days.add(new Date(at).toDateString())
  }
  if (days.size === 0) return 0

  let streak = 0
  const cursor = new Date()
  while (days.has(cursor.toDateString())) {
    streak += 1
    cursor.setDate(cursor.getDate() - 1)
  }
  return streak
}

/** Number of completed signals in the last `days` days. */
export function weeklyCompletionCount(days = 7): number {
  const cutoff = Date.now() - days * DAY_MS
  const signals = useBehavioralStore.getState().signals
  return signals.filter((s) => s.completed && withinCutoff(s, cutoff)).length
}

/**
 * A human "best time to focus today" label (e.g. "3pm – 5pm") derived from the
 * cached Focus DNA's top window. Falls back to a neutral default under cold
 * start so the UI never shows an empty/awkward string.
 */
export function bestFocusWindowLabel(): string {
  const profile = selectFocusProfile(useLearningStore.getState())
  const top = profile.bestWindows[0]
  if (!top) return '3pm – 5pm'
  return `${formatMinutes(top.start)} – ${formatMinutes(top.end)}`
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function withinCutoff(s: BehavioralSignal, cutoff: number): boolean {
  const at = s.actualStart ?? s.plannedStart
  return at != null && at >= cutoff
}

function clampHour(h: number): number {
  if (!Number.isFinite(h) || h < 0) return 0
  if (h > 23) return 23
  return Math.floor(h)
}

/** minutes-from-midnight -> "3pm" / "9am". */
function formatMinutes(min: number): string {
  const h24 = Math.floor(min / 60) % 24
  const period = h24 >= 12 ? 'pm' : 'am'
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12
  return `${h12}${period}`
}
