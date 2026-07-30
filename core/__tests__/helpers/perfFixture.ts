/**
 * Synthetic fixture generator for the NFR-2 performance + determinism tests
 * (PRD §7.2 NFR-2: "A full recompute for a typical user (hundreds of tasks
 * over 2 to 8 weeks) completes under 300ms and is deterministic and
 * churn-minimizing"). Not itself a test file.
 *
 * Uses a seeded PRNG (mulberry32) rather than Math.random() so the generated
 * fixture is reproducible run-to-run — useful for debugging a perf
 * regression or a determinism failure without the fixture itself being a
 * variable.
 */

import type { CalEvent, List, Settings, Task } from '@/types'
import { allDaySchedulingHours, makeCalEvent, makeList, makeSettings, makeTask, mondayAt } from './fixtures'
import { MS_PER_DAY, MS_PER_MIN } from '@/core/scheduler/types'

function mulberry32(seed: number) {
  let a = seed
  return function random() {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export interface PerfFixture {
  now: number
  cutoffDays: number
  tasks: Task[]
  calEvents: CalEvent[]
  settings: Settings
  listMap: Record<string, List>
}

const TASK_COUNT = 300
const CUTOFF_DAYS = 56 // 8 weeks

/** Builds a ~300-task, 8-week-horizon fixture with realistic busy events and scheduling hours. */
export function buildPerfFixture(seed = 42): PerfFixture {
  const rand = mulberry32(seed)
  const now = mondayAt(9)

  const settings = makeSettings({
    schedulingHours: {
      perDay: [
        { day: 0, windows: [{ start: 10 * 60, end: 18 * 60 }] }, // Sun
        { day: 1, windows: [{ start: 8 * 60, end: 22 * 60 }] }, // Mon
        { day: 2, windows: [{ start: 8 * 60, end: 22 * 60 }] },
        { day: 3, windows: [{ start: 8 * 60, end: 22 * 60 }] },
        { day: 4, windows: [{ start: 8 * 60, end: 22 * 60 }] },
        { day: 5, windows: [{ start: 8 * 60, end: 22 * 60 }] },
        { day: 6, windows: [{ start: 10 * 60, end: 18 * 60 }] }, // Sat
      ],
    },
    quietHours: { start: 23 * 60, end: 8 * 60 },
    energyPeak: { start: 9 * 60, end: 12 * 60 },
  })

  // Recurring-ish busy calendar events (classes/meetings), a handful per
  // weekday across the 8-week horizon.
  const calEvents: CalEvent[] = []
  for (let day = 0; day < CUTOFF_DAYS; day++) {
    const dayStart = mondayAt(0) + day * MS_PER_DAY
    const weekday = new Date(dayStart).getDay()
    if (weekday === 0 || weekday === 6) continue // no fixed events on weekends
    const eventsToday = 1 + Math.floor(rand() * 2) // 1-2 events/weekday
    for (let e = 0; e < eventsToday; e++) {
      const startHour = 9 + Math.floor(rand() * 8) // 9am-5pm start
      const start = dayStart + startHour * 60 * MS_PER_MIN
      const durMin = 50 + Math.floor(rand() * 40) // 50-90 min
      calEvents.push(
        makeCalEvent({
          id: `perf-event-${day}-${e}`,
          start,
          end: start + durMin * MS_PER_MIN,
          busy: true,
        })
      )
    }
  }

  const lists: List[] = [
    makeList({ id: 'list-a', schedulingHours: undefined }),
    makeList({ id: 'list-b', schedulingHours: allDaySchedulingHours({ start: 16 * 60, end: 21 * 60 }) }),
  ]
  const listMap: Record<string, List> = Object.fromEntries(lists.map((l) => [l.id, l]))

  const tasks: Task[] = []
  for (let i = 0; i < TASK_COUNT; i++) {
    const id = `perf-task-${i}`
    const dueOffsetDays = 1 + Math.floor(rand() * (CUTOFF_DAYS - 1))
    const due = now + dueOffsetDays * MS_PER_DAY
    const durationMin = 15 + Math.floor(rand() * 15) * 15 // 15..225 in 15-min steps
    const splittable = rand() < 0.4
    const priority = 1 + Math.floor(rand() * 4)
    const autoSchedule = rand() < 0.93
    const hasBuffer = rand() < 0.15
    const usesListB = rand() < 0.1
    const dependsOnPrev = i > 5 && rand() < 0.08

    tasks.push(
      makeTask({
        id,
        createdAt: now - Math.floor(rand() * 30) * MS_PER_DAY,
        title: `Perf task ${i}`,
        durationMin,
        progressMin: 0,
        due,
        autoSchedule,
        splittable,
        priority,
        listId: usesListB ? 'list-b' : undefined,
        bufferBeforeMin: hasBuffer ? 5 : undefined,
        bufferAfterMin: hasBuffer ? 5 : undefined,
        minBlockMin: splittable ? 30 : undefined,
        maxBlockMin: splittable ? 90 : undefined,
        // Reference an earlier task so dependency chains never cycle.
        dependsOn: dependsOnPrev ? [`perf-task-${i - 1 - Math.floor(rand() * 5)}`] : undefined,
      })
    )
  }

  return { now, cutoffDays: CUTOFF_DAYS, tasks, calEvents, settings, listMap }
}
