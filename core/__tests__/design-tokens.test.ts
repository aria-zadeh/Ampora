/**
 * Pure contract tests for the token-layer design refresh (the six tells:
 * Lexend, the ProgressRing tonal ring, radius hierarchy, shadow ladder,
 * restored 400/500 type weights, and the 18px spacing group step). These
 * are cheap tripwires against silently losing the hierarchy in some future
 * edit to utils/design-tokens.ts — not a substitute for visually checking
 * the app, which this pass could not do.
 */

import { describe, expect, it } from 'vitest'
import { borderRadius, shadows, spacing, typography } from '@/utils/design-tokens'

describe('design tokens: radius hierarchy (12 rows / 18 feature cards / 26 hero)', () => {
  it('keeps every existing key name', () => {
    expect(Object.keys(borderRadius).sort()).toEqual(
      ['2xl', '3xl', 'full', 'lg', 'md', 'sm', 'xl', 'xs'].sort()
    )
  })

  it('hits the three named tiers exactly', () => {
    expect(borderRadius.lg).toBe(12)
    expect(borderRadius['2xl']).toBe(18)
    expect(borderRadius['3xl']).toBe(26)
  })

  it('is strictly ascending from xs through full', () => {
    const order: (keyof typeof borderRadius)[] = ['xs', 'sm', 'md', 'lg', 'xl', '2xl', '3xl', 'full']
    for (let i = 1; i < order.length; i++) {
      expect(borderRadius[order[i]]).toBeGreaterThan(borderRadius[order[i - 1]])
    }
  })
})

describe('design tokens: shadow ladder (four real tiers, still six keys)', () => {
  const tiers: (keyof typeof shadows)[] = ['none', 'xs', 'sm', 'md', 'lg', 'xl']

  it('keeps all six keys, no new ones added', () => {
    expect(Object.keys(shadows).sort()).toEqual([...tiers].sort())
  })

  it('stays warm-tinted (Stone-800) at every tier', () => {
    for (const t of tiers) {
      expect(shadows[t].shadowColor).toBe('#292524')
    }
  })

  it('opacity, radius, offset and elevation all strictly increase tier over tier', () => {
    for (let i = 1; i < tiers.length; i++) {
      const prev = shadows[tiers[i - 1]]
      const cur = shadows[tiers[i]]
      expect(cur.shadowOpacity).toBeGreaterThan(prev.shadowOpacity)
      expect(cur.shadowRadius).toBeGreaterThan(prev.shadowRadius)
      expect(cur.shadowOffset.height).toBeGreaterThan(prev.shadowOffset.height)
      expect(cur.elevation).toBeGreaterThan(prev.elevation)
    }
  })

  it('has real separation between the four non-hairline tiers (each opacity jump beats the old flat +0.02 pace)', () => {
    const nonHairline: (keyof typeof shadows)[] = ['sm', 'md', 'lg', 'xl']
    for (let i = 1; i < nonHairline.length; i++) {
      const delta = shadows[nonHairline[i]].shadowOpacity - shadows[nonHairline[i - 1]].shadowOpacity
      expect(delta).toBeGreaterThan(0.02)
    }
  })
})

describe('design tokens: typography restores 400/500 body-weight options', () => {
  it('bodyMedium and captionMedium exist at weight 500, matching doc 02 §2.2', () => {
    expect(typography.bodyMedium).toEqual({ fontSize: 15, lineHeight: 22, fontWeight: '500' })
    expect(typography.captionMedium).toEqual({ fontSize: 13, lineHeight: 18, fontWeight: '500' })
  })

  it('still has genuine 400-weight styles, not just 600/700', () => {
    expect(typography.body.fontWeight).toBe('400')
    expect(typography.bodyLg.fontWeight).toBe('400')
    expect(typography.caption.fontWeight).toBe('400')
    expect(typography.tiny.fontWeight).toBe('400')
  })
})

describe('design tokens: spacing gains an 18px grouping step', () => {
  it('group sits strictly between base (16) and lg (20)', () => {
    expect(spacing.group).toBe(18)
    expect(spacing.group).toBeGreaterThan(spacing.base)
    expect(spacing.group).toBeLessThan(spacing.lg)
  })

  it('keeps every existing key at its existing value', () => {
    expect(spacing.xs).toBe(4)
    expect(spacing.sm).toBe(8)
    expect(spacing.md).toBe(12)
    expect(spacing.base).toBe(16)
    expect(spacing.lg).toBe(20)
    expect(spacing.xl).toBe(24)
    expect(spacing['2xl']).toBe(32)
    expect(spacing['3xl']).toBe(40)
    expect(spacing['4xl']).toBe(48)
    expect(spacing['5xl']).toBe(64)
  })
})
