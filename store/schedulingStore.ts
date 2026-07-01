/**
 * Scheduling-signals store — Ampora Phase 6 (rebuilt on the NEW model).
 *
 * The v1 store tracked bespoke `SchedulingSignal`s (whether a task was done at
 * its scheduled time) and synced them to a `scheduling_signals` table. In the
 * new model that role is owned by `useBehavioralStore` (the append-only
 * `BehavioralSignal` log the Learning Engine consumes) and cloud sync is owned
 * by `store/syncStore.ts`.
 *
 * This module is retained as a thin, typecheck-clean compatibility surface that
 * references NO removed `@/types` names (`SchedulingSignal`, `generateId`, …).
 * It re-exports the behavioral log's recording API under the old-ish names and
 * exposes a small recent-signals reader, so any lingering call site keeps
 * working while the real logic lives in behavioralStore + the Learning Engine.
 */

import { useBehavioralStore } from '@/store/behavioralStore'
import type { BehavioralSignal } from '@/types'

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Record a scheduling outcome as a `BehavioralSignal`. `outcome` maps onto the
 * signal's `completed` flag (completed vs. skipped/partial). Time-of-day fields
 * are filled in by the behavioral store. Returns the new signal id.
 */
export function recordSchedulingOutcome(input: {
  taskId?: string
  taskType?: string
  plannedStart?: number
  actualStart?: number
  outcome: 'completed' | 'skipped' | 'partial'
}): string {
  return useBehavioralStore.getState().logSignal({
    taskType: input.taskType,
    plannedStart: input.plannedStart,
    actualStart: input.actualStart,
    completed: input.outcome === 'completed',
  })
}

/** Signals recorded in the last `days` days (newest first). */
export function recentSchedulingSignals(days = 30): BehavioralSignal[] {
  const cutoff = Date.now() - days * DAY_MS
  const signals = useBehavioralStore.getState().signals
  return signals
    .filter((s) => {
      const at = s.actualStart ?? s.plannedStart
      return at != null && at >= cutoff
    })
    .slice()
    .reverse()
}

/**
 * Back-compat hook alias: the old code imported `useSchedulingStore`. The
 * behavioral store is the real store now, so alias to it. Existing selectors on
 * the behavioral store (e.g. `selectAllSignals`) work unchanged.
 */
export { useBehavioralStore as useSchedulingStore } from '@/store/behavioralStore'
