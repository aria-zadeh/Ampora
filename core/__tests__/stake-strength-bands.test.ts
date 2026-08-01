/**
 * Pure contract tests for two pieces of logic introduced fixing FR-44 and
 * FR-6 conformance gaps in `components/settings/StakesSettings.tsx` and
 * `app/(tabs)/tasks.tsx`. Neither file's internals can be imported into a
 * node/vitest environment (they're React Native components), so these tests
 * mirror the exact small pure algorithms those files inline — a tripwire
 * against silent drift between the two copies, not a substitute for reading
 * the component itself.
 */

import { describe, expect, it } from 'vitest'
import { DEFAULT_STAKE_STRENGTH, STAKE_STRENGTH_BOUNDS, clampTo } from '@/core/blocking/limits'

// Mirrors `strengthBandOf` in components/settings/StakesSettings.tsx and the
// inline `strengthLabel` ternary in components/stakes/StakeSetupSheet.tsx —
// both use these exact two thresholds so the same underlying number always
// reads as the same word everywhere in the app.
const FIRM_THRESHOLD = 0.66
const BALANCED_THRESHOLD = 0.4
type Band = 'gentle' | 'balanced' | 'firm'
function bandOf(strength: number): Band {
  if (strength >= FIRM_THRESHOLD) return 'firm'
  if (strength >= BALANCED_THRESHOLD) return 'balanced'
  return 'gentle'
}

// Mirrors STRENGTH_BAND_VALUE in StakesSettings.tsx.
const BAND_VALUE: Record<Band, number> = { gentle: 0.25, balanced: DEFAULT_STAKE_STRENGTH, firm: 0.85 }

describe('stake strength bands (FR-44)', () => {
  it('the shipped default reads as Balanced', () => {
    expect(bandOf(DEFAULT_STAKE_STRENGTH)).toBe('balanced')
  })

  it('each band anchor value round-trips to its own band', () => {
    for (const band of Object.keys(BAND_VALUE) as Band[]) {
      expect(bandOf(BAND_VALUE[band])).toBe(band)
    }
  })

  it('picking Balanced when already Balanced is a genuine no-op', () => {
    // The anchor equals DEFAULT_STAKE_STRENGTH on purpose (see
    // StakesSettings.tsx), so a fresh user tapping "Balanced" writes back
    // exactly the value already there.
    expect(BAND_VALUE.balanced).toBe(DEFAULT_STAKE_STRENGTH)
  })

  it('every band anchor already sits inside STAKE_STRENGTH_BOUNDS, untouched by clamping', () => {
    for (const value of Object.values(BAND_VALUE)) {
      expect(clampTo(value, STAKE_STRENGTH_BOUNDS, DEFAULT_STAKE_STRENGTH)).toBe(value)
    }
  })

  it('boundary values land on the documented side of each threshold', () => {
    expect(bandOf(0.66)).toBe('firm')
    expect(bandOf(0.659999)).toBe('balanced')
    expect(bandOf(0.4)).toBe('balanced')
    expect(bandOf(0.399999)).toBe('gentle')
  })

  it('de-escalation (0.2 per step, floor 0) passes through every band from Firm, never jumps over one', () => {
    // FR-43: repeated panic use lowers strength by STRENGTH_DEESCALATE_STEP
    // (store/stakesStore.ts) each time the panic count crosses the
    // threshold. This isn't a store test (stakesStore.ts is out of scope
    // here) — it just checks the arithmetic this screen's manual control
    // shares a number line with can't get stuck skipping a band.
    const step = 0.2
    let strength = BAND_VALUE.firm
    const seen: Band[] = [bandOf(strength)]
    for (let i = 0; i < 4; i++) {
      strength = clampTo(strength - step, STAKE_STRENGTH_BOUNDS, 0)
      seen.push(bandOf(strength))
    }
    expect(seen).toContain('firm')
    expect(seen).toContain('balanced')
    expect(seen).toContain('gentle')
  })
})

describe('has-stake task-id derivation (FR-6, "Stakes active" filter)', () => {
  // Mirrors the `stakedTaskIdSet` useMemo in app/(tabs)/tasks.tsx: the active
  // session's task (if any) plus every scheduled-but-not-armed stake's task,
  // explicitly excluding historical-only sessions (a task that once had a
  // stake and doesn't anymore should not read as "active").
  function stakedTaskIds(
    activeTaskId: string | null,
    scheduled: Record<string, { taskId: string }>
  ): Set<string> {
    const s = new Set<string>()
    if (activeTaskId) s.add(activeTaskId)
    for (const stake of Object.values(scheduled)) s.add(stake.taskId)
    return s
  }

  it("includes the active session's task", () => {
    const s = stakedTaskIds('task-1', {})
    expect(s.has('task-1')).toBe(true)
  })

  it("includes every scheduled (not-yet-armed) stake's task", () => {
    const s = stakedTaskIds(null, {
      'sched-1': { taskId: 'task-2' },
      'sched-2': { taskId: 'task-3' },
    })
    expect(s.has('task-2')).toBe(true)
    expect(s.has('task-3')).toBe(true)
    expect(s.size).toBe(2)
  })

  it('combines active + scheduled without duplicates', () => {
    const s = stakedTaskIds('task-1', {
      'sched-1': { taskId: 'task-1' },
      'sched-2': { taskId: 'task-4' },
    })
    expect(s.size).toBe(2)
    expect(s.has('task-1')).toBe(true)
    expect(s.has('task-4')).toBe(true)
  })

  it('is empty when nothing is active or scheduled', () => {
    expect(stakedTaskIds(null, {}).size).toBe(0)
  })
})
