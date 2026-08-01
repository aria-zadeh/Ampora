/**
 * The two required non-functional tests (PRD §7.2 NFR-2): a full recompute
 * over a realistic ~300-task, 8-week fixture completes under 300ms, and the
 * engine is deterministic (same input -> same output; input order never
 * changes the placement decision).
 */
import { describe, expect, it } from 'vitest'
import { recompute } from '@/core/scheduler/recompute'
import type { ScheduleInput, ScheduledBlock } from '@/core/scheduler/types'
import { buildPerfFixture } from './helpers/perfFixture'

function toInput(fixture: ReturnType<typeof buildPerfFixture>): ScheduleInput {
  return {
    tasks: fixture.tasks,
    prevBlocks: [],
    calEvents: fixture.calEvents,
    settings: fixture.settings,
    now: fixture.now,
    cutoffDays: fixture.cutoffDays,
    listMap: fixture.listMap,
  }
}

describe('NFR-2: performance — full recompute over ~300 tasks / 8 weeks', () => {
  it('completes in under 300ms', () => {
    const fixture = buildPerfFixture()
    const input = toInput(fixture)

    // Warm up once so we are not timing module load / JIT warmup, only the
    // algorithm itself.
    recompute(input)

    const startedAt = performance.now()
    const result = recompute(input)
    const elapsedMs = performance.now() - startedAt

    // Sanity: the fixture actually exercised real work (not a degenerate
    // empty run) before we trust the timing.
    expect(fixture.tasks.length).toBe(300)
    expect(result.blocks.length + result.unschedulable.length).toBeGreaterThan(0)

    // eslint-disable-next-line no-console
    console.log(`[NFR-2] recompute(${fixture.tasks.length} tasks, ${fixture.cutoffDays}d horizon) took ${elapsedMs.toFixed(2)}ms`)

    // Do NOT weaken this assertion if it fails — report the measured number.
    expect(elapsedMs).toBeLessThan(300)
  })

  it('stays fast on a warm recompute against its own prior output (the realistic steady-state case)', () => {
    const fixture = buildPerfFixture()
    const input = toInput(fixture)
    const first = recompute(input)

    const withPrev: ScheduleInput = { ...input, prevBlocks: first.blocks }
    recompute(withPrev) // warm up this specific shape once

    const startedAt = performance.now()
    recompute(withPrev)
    const elapsedMs = performance.now() - startedAt

    console.log(`[NFR-2] steady-state recompute took ${elapsedMs.toFixed(2)}ms`)
    expect(elapsedMs).toBeLessThan(300)
  })
})

describe('NFR-2: determinism — same input always produces the same schedule', () => {
  it('running recompute twice on identical input produces byte-identical ScheduleResult', () => {
    const fixture = buildPerfFixture()
    const input = toInput(fixture)

    const result1 = recompute(input)
    const result2 = recompute(input)

    expect(result2).toEqual(result1)
  })

  it('shuffling the input task array does not change the placed blocks (order-independent placement)', () => {
    const fixture = buildPerfFixture()
    const input = toInput(fixture)

    const shuffled = shuffle(fixture.tasks, 1337)
    const shuffledInput: ScheduleInput = { ...input, tasks: shuffled }

    const original = recompute(input)
    const fromShuffled = recompute(shuffledInput)

    // Compare on the semantic placement decision (which task, when, what
    // status) rather than the auto-generated block `id` — a fresh call to
    // recompute always mints new random ids for newly-placed blocks
    // (core/id.ts#newId uses Math.random()), so two independently-generated
    // block sets are never expected to share literal ids even when the
    // placement itself is identical. `id`/`createdAt`/`updatedAt`/`syncState`
    // are implementation bookkeeping, not part of the "placement".
    expect(normalize(fromShuffled.blocks)).toEqual(normalize(original.blocks))
    expect(fromShuffled.unschedulable).toEqual(original.unschedulable)
  })
})

function normalize(blocks: ScheduledBlock[]) {
  return [...blocks]
    .map((b) => ({ taskId: b.taskId, start: b.start, end: b.end, status: b.status, pinned: b.pinned ?? false }))
    .sort((a, b) => a.start - b.start || (a.taskId < b.taskId ? -1 : a.taskId > b.taskId ? 1 : 0))
}

function shuffle<T>(arr: T[], seed: number): T[] {
  let a = seed
  const rand = () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const out = [...arr]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}
