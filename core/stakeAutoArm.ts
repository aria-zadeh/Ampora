/**
 * Pure auto-arm decision rules for the scheduled stake trigger (PRD FR-41a;
 * ARCH_PLAN A4).
 *
 * Extracted out of `store/stakesStore.ts#autoArmDueStakes` specifically so
 * the rules are unit-testable: `store/stakesStore.ts` transitively imports
 * `react-native-mmkv` (via `store/mmkv.ts`), and this repo's vitest harness
 * (`vitest.config.ts`) runs `core/**` under plain Node with no React Native /
 * Expo mocks configured — importing the store (or `services/stakeScheduling.ts`,
 * which imports `expo-notifications`) from a test crashes at import time. This
 * module has ZERO imports (not even `@/types`, which would be erased at
 * compile time anyway but is avoided here for maximum portability), matching
 * the `core/` contract already documented on `core/recurrence.ts` and
 * `core/scheduler/*`: pure, I/O-free, deterministic, safe from plain Node.
 *
 * `decideAutoArm` answers ONE question for ONE scheduled stake at ONE instant:
 * what should happen to it right now? The caller
 * (`store/stakesStore.ts#autoArmDueStakes`) is responsible for actually doing
 * it (ending the row, calling `startStake`, logging the event) — this
 * function only classifies, so every branch is a pure input -> output mapping
 * with no side effects to mock.
 */

/** What `decideAutoArm` says should happen to one scheduled stake right now. */
export type AutoArmDecision =
  /** Not due yet. Leave it in `scheduledStakes`, check again next tick. */
  | { action: 'wait' }
  /** Due, but drop it without ever applying a shield — it never armed. */
  | { action: 'drop'; outcome: 'timed_out' | 'completed' | 'expired' }
  /** Due, but another session is active (FR-41c). Retry next tick. */
  | { action: 'retry' }
  /** Due, nothing blocking it — arm it now. */
  | { action: 'arm' }

export interface AutoArmInput {
  /** The scheduled stake's cue instant, epoch ms. */
  scheduledAt: number
  /** Minutes of grace after the cue before arming anyway (0 = arm right at the cue). */
  startWindowMin: number
  /** The instant being evaluated, epoch ms. */
  now: number
  /**
   * How long past the arm moment (`scheduledAt + startWindowMin`) we still
   * allow arming before giving up (`LATE_ARM_GRACE_MS`). THE single most
   * important guard here: without it, opening the app hours late would arm a
   * lock that was cued long ago.
   */
  lateArmGraceMs: number
  /** Whether `now` falls inside the user's quiet hours. */
  isQuietHours: boolean
  /** Whether the target task still exists. */
  taskExists: boolean
  /** Whether the target task is already marked done. */
  taskDone: boolean
  /** Whether another stake session is currently active (FR-41c: only one at a time). */
  hasActiveSession: boolean
}

/**
 * Classify what should happen to one scheduled stake at `input.now`, per the
 * exact rules in ARCH_PLAN A4:
 *
 * ```
 * armAt = scheduledAt + startWindowMin
 * if now < armAt: wait
 * if now > armAt + LATE_ARM_GRACE_MS: drop 'timed_out'      // window closed
 * if isQuietHours: drop 'timed_out'                          // FR-41a, dropped not shifted
 * if task missing: drop 'expired'
 * if task already done: drop 'completed'                     // releases early
 * if another session active: retry                           // FR-41c
 * else: arm
 * ```
 *
 * Order is deliberate and matches ARCH_PLAN exactly: the grace-window check
 * comes first (so a stake that is both quiet-hours-blocked AND merely late
 * still reads as `timed_out`, the more informative reason), quiet hours next
 * (a lock nudge at 2am is exactly what §9.10 forbids, so it wins over
 * "the task happens to be done"), then task existence/completion, then the
 * single-session gate last (the only branch that RETRIES rather than drops).
 */
export function decideAutoArm(input: AutoArmInput): AutoArmDecision {
  const startWindowMin = Math.max(0, input.startWindowMin)
  const armAt = input.scheduledAt + startWindowMin * 60_000

  if (input.now < armAt) return { action: 'wait' }

  if (input.now > armAt + input.lateArmGraceMs) return { action: 'drop', outcome: 'timed_out' }

  if (input.isQuietHours) return { action: 'drop', outcome: 'timed_out' }

  if (!input.taskExists) return { action: 'drop', outcome: 'expired' }
  if (input.taskDone) return { action: 'drop', outcome: 'completed' }

  if (input.hasActiveSession) return { action: 'retry' }

  return { action: 'arm' }
}
