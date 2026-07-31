/**
 * FR-20's fifth remedy ("remove a blocking all-day event") — pure-logic
 * coverage for `components/schedule/blockingEvent.ts`. That module has zero
 * react-native/store imports specifically so it can live under this suite
 * (`vitest.config.ts` only ever runs `core/**' test files, but happily
 * imports any pure module reachable from one via the `@/*` alias).
 */
import { describe, expect, it } from 'vitest'
import {
  taskPlacementWindow,
  findBlockingAllDayEvent,
  resolveBlockingEventFix,
  getBlockingEventFix,
} from '@/components/schedule/blockingEvent'
import { DEFAULT_CUTOFF_DAYS } from '@/core/scheduler'
import { makeCalEvent, makeTask, MS_PER_DAY, MS_PER_HOUR } from './helpers/fixtures'

// An arbitrary non-zero anchor so "before now" instants are still >= 0 and
// easy to eyeball; the functions under test are pure arithmetic and don't
// care about real calendar alignment.
const NOW = 10 * MS_PER_DAY

describe('taskPlacementWindow', () => {
  it('defaults lo to now and hi to the cutoff horizon for an undated, unstarted task', () => {
    const task = makeTask({})
    const { lo, hi } = taskPlacementWindow(task, NOW)
    expect(lo).toBe(NOW)
    expect(hi).toBe(NOW + DEFAULT_CUTOFF_DAYS * MS_PER_DAY)
  })

  it('uses the task due as hi when present', () => {
    const due = NOW + 3 * MS_PER_DAY
    const task = makeTask({ due })
    expect(taskPlacementWindow(task, NOW).hi).toBe(due)
  })

  it('uses a future startAfter as lo', () => {
    const startAfter = NOW + 2 * MS_PER_DAY
    const task = makeTask({ startAfter, due: NOW + 5 * MS_PER_DAY })
    expect(taskPlacementWindow(task, NOW).lo).toBe(startAfter)
  })

  it('clamps a past startAfter up to now', () => {
    const task = makeTask({ startAfter: NOW - MS_PER_DAY, due: NOW + 5 * MS_PER_DAY })
    expect(taskPlacementWindow(task, NOW).lo).toBe(NOW)
  })
})

describe('findBlockingAllDayEvent', () => {
  const due = NOW + 3 * MS_PER_DAY
  const task = makeTask({ due })

  it('returns undefined with no events', () => {
    expect(findBlockingAllDayEvent(task, [], NOW)).toBeUndefined()
  })

  it('returns undefined when the window is empty (hi <= lo)', () => {
    const inverted = makeTask({ due: NOW }) // hi === lo === NOW
    const event = makeCalEvent({ start: NOW, end: NOW + MS_PER_DAY, allDay: true })
    expect(findBlockingAllDayEvent(inverted, [event], NOW)).toBeUndefined()
  })

  it('ignores a non-all-day event even if it fully covers the window', () => {
    const timed = makeCalEvent({ start: NOW, end: due, allDay: false })
    expect(findBlockingAllDayEvent(task, [timed], NOW)).toBeUndefined()
  })

  it('ignores an all-day event marked not busy', () => {
    const notBusy = makeCalEvent({ start: NOW, end: NOW + MS_PER_DAY, allDay: true, busy: false })
    expect(findBlockingAllDayEvent(task, [notBusy], NOW)).toBeUndefined()
  })

  it('ignores all-day events that only touch the window boundary, not overlap it (half-open)', () => {
    const before = makeCalEvent({ start: NOW - 2 * MS_PER_DAY, end: NOW - MS_PER_DAY, allDay: true })
    const touchesEnd = makeCalEvent({ start: due, end: due + MS_PER_DAY, allDay: true })
    expect(findBlockingAllDayEvent(task, [before, touchesEnd], NOW)).toBeUndefined()
  })

  it('finds a single overlapping all-day event', () => {
    const blocker = makeCalEvent({
      id: 'blocker',
      start: NOW + MS_PER_DAY,
      end: NOW + 2 * MS_PER_DAY,
      allDay: true,
    })
    expect(findBlockingAllDayEvent(task, [blocker], NOW)?.id).toBe('blocker')
  })

  it('picks the event with the larger overlap when several qualify', () => {
    const small = makeCalEvent({ id: 'small', start: NOW, end: NOW + MS_PER_HOUR, allDay: true })
    const big = makeCalEvent({ id: 'big', start: NOW, end: NOW + 2 * MS_PER_DAY, allDay: true })
    expect(findBlockingAllDayEvent(task, [small, big], NOW)?.id).toBe('big')
    // Order-independent.
    expect(findBlockingAllDayEvent(task, [big, small], NOW)?.id).toBe('big')
  })

  it('breaks an overlap tie by earliest start', () => {
    const later = makeCalEvent({
      id: 'later',
      start: NOW + MS_PER_HOUR,
      end: NOW + MS_PER_HOUR + MS_PER_DAY,
      allDay: true,
    })
    const earlier = makeCalEvent({ id: 'earlier', start: NOW, end: NOW + MS_PER_DAY, allDay: true })
    expect(findBlockingAllDayEvent(task, [later, earlier], NOW)?.id).toBe('earlier')
    expect(findBlockingAllDayEvent(task, [earlier, later], NOW)?.id).toBe('earlier')
  })

  it('breaks a full tie (same start, same overlap) by id', () => {
    const b = makeCalEvent({ id: 'b-event', start: NOW, end: NOW + MS_PER_DAY, allDay: true })
    const a = makeCalEvent({ id: 'a-event', start: NOW, end: NOW + MS_PER_DAY, allDay: true })
    expect(findBlockingAllDayEvent(task, [b, a], NOW)?.id).toBe('a-event')
  })
})

describe('resolveBlockingEventFix', () => {
  const due = NOW + 3 * MS_PER_DAY
  const task = makeTask({ due })

  it('is editable for a local event and not for a synced one', () => {
    const local = makeCalEvent({ source: 'local', start: NOW, end: NOW + MS_PER_DAY, allDay: true })
    const synced = makeCalEvent({ source: 'google', start: NOW, end: NOW + MS_PER_DAY, allDay: true })
    expect(resolveBlockingEventFix(task, local, NOW).editable).toBe(true)
    expect(resolveBlockingEventFix(task, synced, NOW).editable).toBe(false)
  })

  it('offers to trim the END when the event starts before the window and ends inside it', () => {
    const event = makeCalEvent({
      source: 'local',
      start: NOW - MS_PER_DAY,
      end: NOW + MS_PER_DAY,
      allDay: true,
    })
    expect(resolveBlockingEventFix(task, event, NOW).shortenPatch).toEqual({ end: NOW })
  })

  it('offers to trim the START when the event starts inside the window and ends after it', () => {
    const event = makeCalEvent({
      source: 'local',
      start: NOW + MS_PER_DAY,
      end: due + MS_PER_DAY,
      allDay: true,
    })
    expect(resolveBlockingEventFix(task, event, NOW).shortenPatch).toEqual({ start: due })
  })

  it('offers no shorten when the event covers the window on both sides (only delete helps)', () => {
    const event = makeCalEvent({
      source: 'local',
      start: NOW - MS_PER_DAY,
      end: due + MS_PER_DAY,
      allDay: true,
    })
    expect(resolveBlockingEventFix(task, event, NOW).shortenPatch).toBeUndefined()
  })

  it('offers no shorten when the event sits entirely inside the window (trimming would just delete it)', () => {
    const event = makeCalEvent({
      source: 'local',
      start: NOW + MS_PER_HOUR,
      end: NOW + 2 * MS_PER_HOUR,
      allDay: true,
    })
    expect(resolveBlockingEventFix(task, event, NOW).shortenPatch).toBeUndefined()
  })
})

describe('getBlockingEventFix', () => {
  const due = NOW + 3 * MS_PER_DAY
  const task = makeTask({ due })

  it('returns undefined when nothing blocks', () => {
    expect(getBlockingEventFix(task, [], NOW)).toBeUndefined()
  })

  it('finds and resolves a local blocking event in one call', () => {
    const event = makeCalEvent({
      id: 'blocker',
      source: 'local',
      start: NOW - MS_PER_DAY,
      end: NOW + MS_PER_DAY,
      allDay: true,
    })
    const fix = getBlockingEventFix(task, [event], NOW)
    expect(fix?.event.id).toBe('blocker')
    expect(fix?.editable).toBe(true)
    expect(fix?.shortenPatch).toEqual({ end: NOW })
  })

  it('finds a synced blocking event and reports it as not editable, with no shorten patch offered', () => {
    const event = makeCalEvent({
      id: 'synced-blocker',
      source: 'apple',
      start: NOW - MS_PER_DAY,
      end: due + MS_PER_DAY, // covers the window on both sides
      allDay: true,
    })
    const fix = getBlockingEventFix(task, [event], NOW)
    expect(fix?.editable).toBe(false)
  })
})
