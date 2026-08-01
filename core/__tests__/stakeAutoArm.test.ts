/**
 * `core/stakeAutoArm.ts#decideAutoArm` — the scheduled-stake auto-arm rules
 * (PRD FR-41a; ARCH_PLAN A4). Pure input -> decision mapping, so every branch
 * is asserted directly with no mocking.
 */

import { describe, expect, it } from 'vitest'
import { decideAutoArm } from '@/core/stakeAutoArm'

const MIN = 60_000
const SCHEDULED_AT = Date.UTC(2026, 6, 30, 15, 0, 0) // 2026-07-30 15:00 UTC
const LATE_ARM_GRACE_MS = 10 * MIN

/** Sensible defaults for every field, overridable per test. */
function input(overrides: Partial<Parameters<typeof decideAutoArm>[0]> = {}) {
  return {
    scheduledAt: SCHEDULED_AT,
    startWindowMin: 0,
    now: SCHEDULED_AT,
    lateArmGraceMs: LATE_ARM_GRACE_MS,
    isQuietHours: false,
    taskExists: true,
    taskDone: false,
    hasActiveSession: false,
    ...overrides,
  }
}

describe('decideAutoArm', () => {
  describe('not due yet', () => {
    it('waits before scheduledAt with no start window', () => {
      const out = decideAutoArm(input({ startWindowMin: 0, now: SCHEDULED_AT - MIN }))
      expect(out).toEqual({ action: 'wait' })
    })

    it('waits before the window closes when a start window is set', () => {
      const out = decideAutoArm(
        input({ startWindowMin: 15, now: SCHEDULED_AT + 5 * MIN })
      )
      expect(out).toEqual({ action: 'wait' })
    })
  })

  describe('the arm moment', () => {
    it('arms exactly AT scheduledAt when there is no start window', () => {
      const out = decideAutoArm(input({ startWindowMin: 0, now: SCHEDULED_AT }))
      expect(out).toEqual({ action: 'arm' })
    })

    it('arms exactly at scheduledAt + startWindowMin', () => {
      const out = decideAutoArm(
        input({ startWindowMin: 15, now: SCHEDULED_AT + 15 * MIN })
      )
      expect(out).toEqual({ action: 'arm' })
    })

    it('arms anywhere inside the grace window after the arm moment', () => {
      const out = decideAutoArm(
        input({ startWindowMin: 15, now: SCHEDULED_AT + 15 * MIN + 5 * MIN })
      )
      expect(out).toEqual({ action: 'arm' })
    })

    it('still arms exactly AT the grace boundary (strictly-greater-than in the spec)', () => {
      const out = decideAutoArm(
        input({ startWindowMin: 15, now: SCHEDULED_AT + 15 * MIN + LATE_ARM_GRACE_MS })
      )
      expect(out).toEqual({ action: 'arm' })
    })
  })

  describe('LATE_ARM_GRACE_MS — the single most important guard', () => {
    it('times out one ms past the grace boundary', () => {
      const out = decideAutoArm(
        input({ startWindowMin: 15, now: SCHEDULED_AT + 15 * MIN + LATE_ARM_GRACE_MS + 1 })
      )
      expect(out).toEqual({ action: 'drop', outcome: 'timed_out' })
    })

    it('never arms a stake cued hours ago just because the app opened late (opening at 9pm never arms a 3pm cue)', () => {
      const cuedAt3pm = Date.UTC(2026, 6, 30, 15, 0, 0)
      const openedAt9pm = Date.UTC(2026, 6, 30, 21, 0, 0)
      const out = decideAutoArm(
        input({ scheduledAt: cuedAt3pm, startWindowMin: 15, now: openedAt9pm })
      )
      expect(out).toEqual({ action: 'drop', outcome: 'timed_out' })
    })

    it('treats a negative startWindowMin as zero rather than extending the grace window backwards', () => {
      const out = decideAutoArm(
        input({ startWindowMin: -30, now: SCHEDULED_AT })
      )
      expect(out).toEqual({ action: 'arm' })
    })
  })

  describe('quiet hours — dropped, never shifted (FR-41a)', () => {
    it('drops as timed_out when the arm moment falls in quiet hours, even well within the grace window', () => {
      const out = decideAutoArm(input({ isQuietHours: true }))
      expect(out).toEqual({ action: 'drop', outcome: 'timed_out' })
    })

    it('quiet hours wins over an already-completed task (checked first in the order)', () => {
      const out = decideAutoArm(input({ isQuietHours: true, taskDone: true }))
      expect(out).toEqual({ action: 'drop', outcome: 'timed_out' })
    })

    it('quiet hours wins even when the grace window has also separately elapsed', () => {
      const out = decideAutoArm(
        input({ isQuietHours: true, startWindowMin: 15, now: SCHEDULED_AT + 15 * MIN + LATE_ARM_GRACE_MS + 1 })
      )
      // Both conditions independently justify a drop; the outcome is the same
      // either way, so this just confirms neither branch throws or diverges.
      expect(out).toEqual({ action: 'drop', outcome: 'timed_out' })
    })

    it('does not drop for quiet hours while merely waiting (not due yet)', () => {
      const out = decideAutoArm(input({ isQuietHours: true, now: SCHEDULED_AT - MIN }))
      expect(out).toEqual({ action: 'wait' })
    })
  })

  describe('target task state', () => {
    it('drops as expired when the task no longer exists', () => {
      const out = decideAutoArm(input({ taskExists: false }))
      expect(out).toEqual({ action: 'drop', outcome: 'expired' })
    })

    it('drops as completed when the task is already done (releases early)', () => {
      const out = decideAutoArm(input({ taskDone: true }))
      expect(out).toEqual({ action: 'drop', outcome: 'completed' })
    })

    it('a missing task wins over "done" (existence is checked first)', () => {
      const out = decideAutoArm(input({ taskExists: false, taskDone: true }))
      expect(out).toEqual({ action: 'drop', outcome: 'expired' })
    })
  })

  describe('FR-41c — only one session at a time', () => {
    it('retries (does not drop) when another session is active', () => {
      const out = decideAutoArm(input({ hasActiveSession: true }))
      expect(out).toEqual({ action: 'retry' })
    })

    it('an active session does not override quiet hours or task completion (those are checked first)', () => {
      expect(decideAutoArm(input({ hasActiveSession: true, isQuietHours: true }))).toEqual({
        action: 'drop',
        outcome: 'timed_out',
      })
      expect(decideAutoArm(input({ hasActiveSession: true, taskDone: true }))).toEqual({
        action: 'drop',
        outcome: 'completed',
      })
    })
  })

  describe('the happy path', () => {
    it('arms when due, not in quiet hours, the task exists and is not done, and nothing else is active', () => {
      expect(decideAutoArm(input())).toEqual({ action: 'arm' })
    })
  })
})
