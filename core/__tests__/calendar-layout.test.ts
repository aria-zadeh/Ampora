import { describe, expect, it } from 'vitest'
import { groupByCluster, layoutDay, spansOverlap, type TimeSpanItem } from '@/core/calendar/layout'

function item(id: string, start: number, end: number, kind?: 'task' | 'event'): TimeSpanItem {
  return { id, start, end, kind }
}

describe('calendar/layout: spansOverlap', () => {
  it('overlapping spans return true', () => {
    expect(spansOverlap(item('a', 0, 100), item('b', 50, 150))).toBe(true)
  })

  it('touching spans (a.end === b.start) do NOT overlap', () => {
    expect(spansOverlap(item('a', 0, 100), item('b', 100, 200))).toBe(false)
  })

  it('disjoint spans do not overlap', () => {
    expect(spansOverlap(item('a', 0, 100), item('b', 200, 300))).toBe(false)
  })
})

describe('calendar/layout: layoutDay — single/non-overlapping items', () => {
  it('a lone item gets column 0 of 1, full width', () => {
    const [laid] = layoutDay([item('a', 0, 60)])
    expect(laid.colIndex).toBe(0)
    expect(laid.cols).toBe(1)
    expect(laid.xFraction).toBe(0)
    expect(laid.widthFraction).toBe(1)
  })

  it('sequential non-overlapping items each get their own full-width cluster', () => {
    const laid = layoutDay([item('a', 0, 60), item('b', 60, 120), item('c', 120, 180)])
    for (const l of laid) {
      expect(l.cols).toBe(1)
      expect(l.widthFraction).toBe(1)
    }
    expect(laid.map((l) => l.clusterIndex)).toEqual([0, 1, 2])
  })
})

describe('calendar/layout: layoutDay — overlap columns', () => {
  it('two overlapping items split into 2 columns', () => {
    const laid = layoutDay([item('a', 0, 60), item('b', 30, 90)])
    expect(laid[0].cols).toBe(2)
    expect(laid[1].cols).toBe(2)
    expect(new Set(laid.map((l) => l.colIndex))).toEqual(new Set([0, 1]))
    for (const l of laid) expect(l.widthFraction).toBeCloseTo(0.5)
  })

  it('three mutually-overlapping items split into 3 columns', () => {
    const laid = layoutDay([item('a', 0, 90), item('b', 10, 100), item('c', 20, 110)])
    expect(laid.every((l) => l.cols === 3)).toBe(true)
    expect(new Set(laid.map((l) => l.colIndex))).toEqual(new Set([0, 1, 2]))
  })

  it('a column is reclaimed once its occupant ends (max concurrency, not total count)', () => {
    // a: 0-30, b: 10-40 (overlaps a), c: 35-60 (overlaps b only, not a).
    // Max concurrency at any instant is 2, so this should use 2 columns, not 3.
    const laid = layoutDay([item('a', 0, 30), item('b', 10, 40), item('c', 35, 60)])
    const cols = new Set(laid.map((l) => l.cols))
    expect(cols).toEqual(new Set([2]))
    const aCol = laid.find((l) => l.item.id === 'a')!.colIndex
    const cCol = laid.find((l) => l.item.id === 'c')!.colIndex
    // c can reuse a's column since a already ended (30) before c starts (35).
    expect(cCol).toBe(aCol)
  })

  it('a lone block downstream of a busy cluster still renders full width (per-cluster column count)', () => {
    const laid = layoutDay([item('a', 0, 60), item('b', 20, 80), item('c', 200, 260)])
    const busyCluster = laid.filter((l) => l.item.id === 'a' || l.item.id === 'b')
    expect(busyCluster.every((l) => l.cols === 2)).toBe(true)
    const lone = laid.find((l) => l.item.id === 'c')!
    expect(lone.cols).toBe(1)
    expect(lone.widthFraction).toBe(1)
  })

  it('xFraction and widthFraction are consistent fractions of the cluster width', () => {
    const laid = layoutDay([item('a', 0, 60), item('b', 0, 60), item('c', 0, 60)])
    for (const l of laid) {
      expect(l.xFraction).toBeCloseTo(l.colIndex / l.cols)
      expect(l.widthFraction).toBeCloseTo(1 / l.cols)
    }
  })
})

describe('calendar/layout: layoutDay — eventsFirst bias', () => {
  it('an event is biased to column 0 ahead of a task starting at the same instant, when eventsFirst is on (default)', () => {
    const laid = layoutDay([item('task', 0, 60, 'task'), item('event', 0, 60, 'event')])
    const eventLaid = laid.find((l) => l.item.id === 'event')!
    expect(eventLaid.colIndex).toBe(0)
  })

  it('eventsFirst: false ignores the kind bias and falls back to id ordering', () => {
    const laid = layoutDay([item('task', 0, 60, 'task'), item('event', 0, 60, 'event')], { eventsFirst: false })
    const eventLaid = laid.find((l) => l.item.id === 'event')!
    const taskLaid = laid.find((l) => l.item.id === 'task')!
    // Tiebreak falls through to id: 'event' < 'task' lexicographically.
    expect(eventLaid.colIndex).toBe(0)
    expect(taskLaid.colIndex).toBe(1)
  })
})

describe('calendar/layout: determinism + zero-length items', () => {
  it('is deterministic: the input order does not change the result (stable sort by start/end/kind/id)', () => {
    const items = [item('a', 0, 60), item('b', 30, 90), item('c', 10, 40)]
    const out1 = layoutDay(items).map((l) => ({ id: l.item.id, colIndex: l.colIndex, cols: l.cols }))
    const out2 = layoutDay([items[2], items[0], items[1]]).map((l) => ({ id: l.item.id, colIndex: l.colIndex, cols: l.cols }))
    // Sort both by id before comparing since layoutDay's OUTPUT order follows
    // the internal sort (start,end,id) regardless of input order — so the
    // per-item column assignment should be identical regardless of input order.
    const norm = (arr: typeof out1) => [...arr].sort((a, b) => (a.id < b.id ? -1 : 1))
    expect(norm(out1)).toEqual(norm(out2))
  })

  it('a zero-length item still occupies a sliver and gets its own column when overlapping', () => {
    const laid = layoutDay([item('a', 0, 60), item('zero', 30, 30)])
    expect(laid.find((l) => l.item.id === 'zero')!.cols).toBe(2)
  })
})

describe('calendar/layout: groupByCluster', () => {
  it('groups laid-out items by their cluster index', () => {
    const laid = layoutDay([item('a', 0, 60), item('b', 30, 90), item('c', 200, 260)])
    const groups = groupByCluster(laid)
    expect(groups).toHaveLength(2)
    expect(groups[0].map((l) => l.item.id).sort()).toEqual(['a', 'b'])
    expect(groups[1].map((l) => l.item.id)).toEqual(['c'])
  })
})
