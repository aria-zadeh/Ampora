import { describe, expect, it } from 'vitest'
import {
  compareTasks,
  dependenciesSatisfiable,
  isDatedEligible,
  orderTasks,
  orderUndatedBackfill,
  priorityValue,
} from '@/core/scheduler/ordering'
import { makeTask, mondayAt, resetTestIdCounter } from './helpers/fixtures'
import { MS_PER_DAY } from '@/core/scheduler/types'

const now = mondayAt(8)
const cutoff = now + 14 * MS_PER_DAY

describe('scheduler/ordering: priorityValue', () => {
  it('maps priority words/numbers with Low(1) as the floor for missing priority', () => {
    expect(priorityValue(makeTask({ priority: undefined }))).toBe(1)
    expect(priorityValue(makeTask({ priority: 1 }))).toBe(1)
    expect(priorityValue(makeTask({ priority: 2 }))).toBe(2)
    expect(priorityValue(makeTask({ priority: 3 }))).toBe(3)
    expect(priorityValue(makeTask({ priority: 4 }))).toBe(4)
  })

  it('clamps out-of-range priority defensively into 1..4', () => {
    expect(priorityValue(makeTask({ priority: 0 }))).toBe(1)
    expect(priorityValue(makeTask({ priority: 99 }))).toBe(4)
  })
})

describe('scheduler/ordering: compareTasks (FR-10 comparator)', () => {
  it('orders Urgent > High > Medium > Low', () => {
    const urgent = makeTask({ id: 'a', priority: 4, createdAt: 1 })
    const high = makeTask({ id: 'b', priority: 3, createdAt: 1 })
    const med = makeTask({ id: 'c', priority: 2, createdAt: 1 })
    const low = makeTask({ id: 'd', priority: 1, createdAt: 1 })
    const sorted = [low, med, urgent, high].sort(compareTasks)
    expect(sorted.map((t) => t.id)).toEqual(['a', 'b', 'c', 'd'])
  })

  it('within equal priority, orders by earliest due first', () => {
    const later = makeTask({ id: 'a', priority: 2, due: now + 5 * MS_PER_DAY, createdAt: 1 })
    const sooner = makeTask({ id: 'b', priority: 2, due: now + 1 * MS_PER_DAY, createdAt: 1 })
    const sorted = [later, sooner].sort(compareTasks)
    expect(sorted.map((t) => t.id)).toEqual(['b', 'a'])
  })

  it('FR-10: within equal priority AND due, ties are broken by manual order, THEN creation time', () => {
    // PRD FR-10: "Ties broken by manual order then creation time." Two tasks
    // share priority and due; task B has an earlier manualOrder than task A
    // despite being created LATER, so FR-10 requires B to sort first.
    const due = now + 3 * MS_PER_DAY
    const a = makeTask({ id: 'a', priority: 2, due, createdAt: 100, manualOrder: 5 })
    const b = makeTask({ id: 'b', priority: 2, due, createdAt: 200, manualOrder: 1 })
    const sorted = [a, b].sort(compareTasks)
    expect(sorted.map((t) => t.id)).toEqual(['b', 'a'])
  })

  it('falls back to creation time when priority, due, and manual order all tie (or manual order is unset)', () => {
    const due = now + 3 * MS_PER_DAY
    const older = makeTask({ id: 'a', priority: 2, due, createdAt: 100 })
    const newer = makeTask({ id: 'b', priority: 2, due, createdAt: 200 })
    const sorted = [newer, older].sort(compareTasks)
    expect(sorted.map((t) => t.id)).toEqual(['a', 'b'])
  })

  it('is a total, deterministic order even for fully-identical tasks (tiebreak on id)', () => {
    const a = makeTask({ id: 'a', priority: 2, due: now, createdAt: 1 })
    const b = makeTask({ id: 'b', priority: 2, due: now, createdAt: 1 })
    expect(compareTasks(a, b)).toBeLessThan(0)
    expect(compareTasks(b, a)).toBeGreaterThan(0)
    expect(compareTasks(a, a)).toBe(0)
  })
})

describe('scheduler/ordering: dependenciesSatisfiable', () => {
  it('a task with no dependsOn is always satisfiable', () => {
    const t = makeTask({ id: 'a' })
    expect(dependenciesSatisfiable(t, new Map(), new Set())).toBe(true)
  })

  it('a prereq marked done satisfies the dependency', () => {
    const dep = makeTask({ id: 'dep', status: 'done' })
    const t = makeTask({ id: 'a', dependsOn: ['dep'] })
    const byId = new Map([['dep', dep], ['a', t]])
    expect(dependenciesSatisfiable(t, byId, new Set())).toBe(true)
  })

  it('a prereq that is itself eligible-and-being-placed satisfies the dependency', () => {
    const dep = makeTask({ id: 'dep', status: 'todo' })
    const t = makeTask({ id: 'a', dependsOn: ['dep'] })
    const byId = new Map([['dep', dep], ['a', t]])
    expect(dependenciesSatisfiable(t, byId, new Set(['dep']))).toBe(true)
  })

  it('a prereq that is neither done nor in the eligible set blocks the task', () => {
    const dep = makeTask({ id: 'dep', status: 'todo' })
    const t = makeTask({ id: 'a', dependsOn: ['dep'] })
    const byId = new Map([['dep', dep], ['a', t]])
    expect(dependenciesSatisfiable(t, byId, new Set())).toBe(false)
  })

  it('a missing (deleted) prereq is ignored rather than blocking forever', () => {
    const t = makeTask({ id: 'a', dependsOn: ['ghost'] })
    const byId = new Map([['a', t]])
    expect(dependenciesSatisfiable(t, byId, new Set())).toBe(true)
  })
})

describe('scheduler/ordering: isDatedEligible', () => {
  it('requires autoSchedule, not done, and a due within [now, cutoff]', () => {
    expect(isDatedEligible(makeTask({ autoSchedule: true, due: now + MS_PER_DAY }), now, cutoff)).toBe(true)
    expect(isDatedEligible(makeTask({ autoSchedule: false, due: now + MS_PER_DAY }), now, cutoff)).toBe(false)
    expect(isDatedEligible(makeTask({ autoSchedule: true, due: now + MS_PER_DAY, status: 'done' }), now, cutoff)).toBe(false)
    expect(isDatedEligible(makeTask({ autoSchedule: true, due: undefined }), now, cutoff)).toBe(false)
    expect(isDatedEligible(makeTask({ autoSchedule: true, due: cutoff + MS_PER_DAY }), now, cutoff)).toBe(false)
  })

  it('an overdue task (due < now) is still eligible — it needs placing, not exclusion', () => {
    expect(isDatedEligible(makeTask({ autoSchedule: true, due: now - MS_PER_DAY }), now, cutoff)).toBe(true)
  })
})

describe('scheduler/ordering: orderTasks (full pipeline)', () => {
  it('excludes done tasks, non-auto-schedule tasks, and undated tasks', () => {
    resetTestIdCounter()
    const done = makeTask({ id: 'done', autoSchedule: true, due: now + MS_PER_DAY, status: 'done' })
    const fixed = makeTask({ id: 'fixed', autoSchedule: false, due: now + MS_PER_DAY })
    const undated = makeTask({ id: 'undated', autoSchedule: true })
    const eligible = makeTask({ id: 'eligible', autoSchedule: true, due: now + MS_PER_DAY })
    const ordered = orderTasks([done, fixed, undated, eligible], now, cutoff)
    expect(ordered.map((t) => t.id)).toEqual(['eligible'])
  })

  describe('FR-19: topological dependency ordering', () => {
    it('a task is never placed before its prerequisite', () => {
      const dep = makeTask({ id: 'dep', priority: 1, due: now + 5 * MS_PER_DAY, createdAt: 1 })
      // `task` has HIGHER priority than its dep, so FR-10 alone would put it
      // first — FR-19 must override that and place `dep` first anyway.
      const task = makeTask({ id: 'task', priority: 4, due: now + 5 * MS_PER_DAY, createdAt: 2, dependsOn: ['dep'] })
      const ordered = orderTasks([task, dep], now, cutoff)
      const depIdx = ordered.findIndex((t) => t.id === 'dep')
      const taskIdx = ordered.findIndex((t) => t.id === 'task')
      expect(depIdx).toBeGreaterThanOrEqual(0)
      expect(taskIdx).toBeGreaterThan(depIdx)
    })

    it('respects a chain of dependencies (C depends on B depends on A)', () => {
      const a = makeTask({ id: 'a', priority: 1, due: now + 5 * MS_PER_DAY, createdAt: 1 })
      const b = makeTask({ id: 'b', priority: 4, due: now + 5 * MS_PER_DAY, createdAt: 2, dependsOn: ['a'] })
      const c = makeTask({ id: 'c', priority: 4, due: now + 5 * MS_PER_DAY, createdAt: 3, dependsOn: ['b'] })
      const ordered = orderTasks([c, b, a], now, cutoff)
      const idx = (id: string) => ordered.findIndex((t) => t.id === id)
      expect(idx('a')).toBeLessThan(idx('b'))
      expect(idx('b')).toBeLessThan(idx('c'))
    })

    it('a dependency already marked done does not block or reorder its dependent', () => {
      const dep = makeTask({ id: 'dep', status: 'done', due: now + MS_PER_DAY })
      const task = makeTask({ id: 'task', due: now + MS_PER_DAY, dependsOn: ['dep'] })
      // `dep` is done, so it is excluded from the dated-eligible set entirely;
      // `task` should still come through eligible and unblocked.
      const ordered = orderTasks([task, dep], now, cutoff)
      expect(ordered.map((t) => t.id)).toEqual(['task'])
    })

    it('never drops a task, even in a cycle (FR-20 spirit: append leftovers rather than lose them)', () => {
      // A same-cutoff cycle can't normally arise via dependenciesSatisfiable
      // (each side requires the other to already be in the eligible set,
      // which is fine — both get admitted since both ARE in the set), but the
      // topo pass must still terminate and account for every input task.
      const a = makeTask({ id: 'a', due: now + MS_PER_DAY, dependsOn: ['b'] })
      const b = makeTask({ id: 'b', due: now + MS_PER_DAY, dependsOn: ['a'] })
      const ordered = orderTasks([a, b], now, cutoff)
      expect(ordered.map((t) => t.id).sort()).toEqual(['a', 'b'])
    })
  })

  it('is deterministic: same input (including shuffled order) produces the same output order', () => {
    const tasks = [
      makeTask({ id: 'a', priority: 3, due: now + 2 * MS_PER_DAY, createdAt: 1 }),
      makeTask({ id: 'b', priority: 4, due: now + 1 * MS_PER_DAY, createdAt: 2 }),
      makeTask({ id: 'c', priority: 2, due: now + 3 * MS_PER_DAY, createdAt: 3 }),
    ]
    const shuffled = [tasks[2], tasks[0], tasks[1]]
    const out1 = orderTasks(tasks, now, cutoff).map((t) => t.id)
    const out2 = orderTasks(shuffled, now, cutoff).map((t) => t.id)
    expect(out1).toEqual(out2)
  })
})

describe('scheduler/ordering: orderUndatedBackfill', () => {
  it('only includes auto-scheduled, open, undated tasks', () => {
    const undated = makeTask({ id: 'a', autoSchedule: true, due: undefined })
    const dated = makeTask({ id: 'b', autoSchedule: true, due: now + MS_PER_DAY })
    const notAuto = makeTask({ id: 'c', autoSchedule: false, due: undefined })
    const done = makeTask({ id: 'd', autoSchedule: true, due: undefined, status: 'done' })
    const out = orderUndatedBackfill([undated, dated, notAuto, done])
    expect(out.map((t) => t.id)).toEqual(['a'])
  })

  it('sorts the undated set by FR-10 (priority, then createdAt) among themselves', () => {
    const low = makeTask({ id: 'a', autoSchedule: true, priority: 1, createdAt: 1 })
    const high = makeTask({ id: 'b', autoSchedule: true, priority: 3, createdAt: 2 })
    const out = orderUndatedBackfill([low, high])
    expect(out.map((t) => t.id)).toEqual(['b', 'a'])
  })
})
