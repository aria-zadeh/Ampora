import { describe, expect, it } from 'vitest'
import { isNearOrOverDue, remainingMinutes, slackColor, slackRatio } from '@/core/scheduler/slack'
import { makeTask, mondayAt } from './helpers/fixtures'
import { MS_PER_DAY, MS_PER_MIN } from '@/core/scheduler/types'

const now = mondayAt(8)

describe('scheduler/slack: remainingMinutes', () => {
  it('duration minus progress, floored at 0', () => {
    expect(remainingMinutes(makeTask({ durationMin: 100, progressMin: 40 }))).toBe(60)
    expect(remainingMinutes(makeTask({ durationMin: 100, progressMin: 150 }))).toBe(0)
    expect(remainingMinutes(makeTask({ durationMin: 100, progressMin: undefined }))).toBe(100)
  })
})

describe('scheduler/slack: slackRatio (PRD 9.5.5)', () => {
  it('an undated task has +Infinity slack (no deadline pressure)', () => {
    expect(slackRatio(makeTask({ due: undefined }), now)).toBe(Number.POSITIVE_INFINITY)
  })

  it('an overdue task (due <= now) has -Infinity slack', () => {
    expect(slackRatio(makeTask({ due: now - 1 }), now)).toBe(Number.NEGATIVE_INFINITY)
    expect(slackRatio(makeTask({ due: now }), now)).toBe(Number.NEGATIVE_INFINITY)
  })

  it('computes (minutesUntilDue - remaining) / max(minutesUntilDue, 1)', () => {
    // 120 min until due, 30 min remaining -> (120-30)/120 = 0.75.
    const task = makeTask({ due: now + 120 * MS_PER_MIN, durationMin: 30, progressMin: 0 })
    expect(slackRatio(task, now)).toBeCloseTo(0.75, 10)
  })

  it('can go negative when remaining exceeds the time available (tight but not yet overdue)', () => {
    // 60 min until due, 90 min remaining -> (60-90)/60 = -0.5.
    const task = makeTask({ due: now + 60 * MS_PER_MIN, durationMin: 90, progressMin: 0 })
    expect(slackRatio(task, now)).toBeCloseTo(-0.5, 10)
  })
})

describe('scheduler/slack: slackColor (PRD 9.5.5 thresholds)', () => {
  it('green when slackRatio > 0.5', () => {
    // 200 min until due, 30 min remaining -> ratio=(200-30)/200=0.85.
    const task = makeTask({ due: now + 200 * MS_PER_MIN, durationMin: 30 })
    expect(slackRatio(task, now)).toBeGreaterThan(0.5)
    expect(slackColor(task, now)).toBe('green')
  })

  it('amber when 0.2 <= slackRatio <= 0.5', () => {
    // Want ratio exactly 0.35: (m - r)/m = 0.35 -> pick m=200, r=130 -> (200-130)/200=0.35.
    const task = makeTask({ due: now + 200 * MS_PER_MIN, durationMin: 130 })
    const ratio = slackRatio(task, now)
    expect(ratio).toBeGreaterThanOrEqual(0.2)
    expect(ratio).toBeLessThanOrEqual(0.5)
    expect(slackColor(task, now)).toBe('amber')
  })

  it('amber boundary: exactly 0.5 is amber (green requires strictly > 0.5)', () => {
    // m=200, r=100 -> ratio=(200-100)/200=0.5 exactly.
    const task = makeTask({ due: now + 200 * MS_PER_MIN, durationMin: 100 })
    expect(slackRatio(task, now)).toBeCloseTo(0.5, 10)
    expect(slackColor(task, now)).toBe('amber')
  })

  it('amber boundary: exactly 0.2 is amber (red requires strictly < 0.2)', () => {
    // m=200, r=160 -> ratio=(200-160)/200=0.2 exactly.
    const task = makeTask({ due: now + 200 * MS_PER_MIN, durationMin: 160 })
    expect(slackRatio(task, now)).toBeCloseTo(0.2, 10)
    expect(slackColor(task, now)).toBe('amber')
  })

  it('red when slackRatio < 0.2', () => {
    // m=200, r=180 -> ratio=(200-180)/200=0.1.
    const task = makeTask({ due: now + 200 * MS_PER_MIN, durationMin: 180 })
    expect(slackRatio(task, now)).toBeLessThan(0.2)
    expect(slackColor(task, now)).toBe('red')
  })

  it('red when overdue, regardless of remaining work', () => {
    const task = makeTask({ due: now - MS_PER_DAY, durationMin: 5 })
    expect(slackColor(task, now)).toBe('red')
  })

  it('an undated task is always green (infinite slack)', () => {
    expect(slackColor(makeTask({ due: undefined }), now)).toBe('green')
  })
})

describe('scheduler/slack: isNearOrOverDue', () => {
  it('true when slackRatio < 0.2 (matches the red threshold)', () => {
    const task = makeTask({ due: now + 200 * MS_PER_MIN, durationMin: 180 })
    expect(isNearOrOverDue(task, now)).toBe(true)
  })

  it('true when overdue', () => {
    expect(isNearOrOverDue(makeTask({ due: now - 1 }), now)).toBe(true)
  })

  it('false when slackRatio >= 0.2', () => {
    const task = makeTask({ due: now + 200 * MS_PER_MIN, durationMin: 160 }) // ratio exactly 0.2
    expect(isNearOrOverDue(task, now)).toBe(false)
  })

  it('false for an undated task (never force front-load with no deadline)', () => {
    expect(isNearOrOverDue(makeTask({ due: undefined }), now)).toBe(false)
  })
})
