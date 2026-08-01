/**
 * Pure contract tests for the token-layer design refresh (the six tells:
 * Lexend, the ProgressRing tonal ring, radius hierarchy, shadow ladder,
 * restored 400/500 type weights, and the 18px spacing group step). These
 * are cheap tripwires against silently losing the hierarchy in some future
 * edit to utils/design-tokens.ts — not a substitute for visually checking
 * the app, which this pass could not do.
 */

import { describe, expect, it } from 'vitest'
import { borderRadius, fontFamilies, shadows, spacing, typography } from '@/utils/design-tokens'
// eslint-disable-next-line @typescript-eslint/no-var-requires
const tailwind = require('../../tailwind.config.js')

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
    expect(typography.bodyMedium).toMatchObject({ fontSize: 15, lineHeight: 22, fontWeight: '500' })
    expect(typography.captionMedium).toMatchObject({ fontSize: 13, lineHeight: 18, fontWeight: '500' })
  })

  it('still has genuine 400-weight styles, not just 600/700', () => {
    expect(typography.body.fontWeight).toBe('400')
    expect(typography.bodyLg.fontWeight).toBe('400')
    expect(typography.caption.fontWeight).toBe('400')
    expect(typography.tiny.fontWeight).toBe('400')
  })
})

/**
 * The wiring that was missing. `typography` is the scale of record but no
 * screen imports it — every screen styles text with Tailwind classes. So
 * neither object was true of the other and the two were free to drift (which
 * is how `bodyMedium`/`captionMedium` sat in doc 02 §2.2 unimplemented for as
 * long as they did). These tests make ONE of them true: tailwind.config.js is
 * a mirror of `typography`, checked key for key. Change a value in either and
 * the failure names its counterpart.
 */
describe('design tokens: tailwind.config.js mirrors `typography`', () => {
  /** typography key -> tailwind fontSize key. The two *Medium styles differ */
  /** from their base by weight only, so they share the base size entry. */
  const SIZE_KEYS: Record<keyof typeof typography, string> = {
    display: 'display',
    h1: 'h1',
    h2: 'h2',
    h3: 'h3',
    h4: 'h4',
    bodyLg: 'body-lg',
    body: 'body',
    bodyMedium: 'body',
    label: 'label',
    caption: 'caption',
    captionMedium: 'caption',
    overline: 'overline',
    tiny: 'tiny',
  }

  const tw = tailwind.theme.extend

  it('every typography style has a tailwind fontSize entry at the same size and line height', () => {
    for (const key of Object.keys(SIZE_KEYS) as (keyof typeof typography)[]) {
      const style = typography[key]
      const entry = tw.fontSize[SIZE_KEYS[key]]
      expect(entry, `tailwind fontSize."${SIZE_KEYS[key]}" is missing (needed by typography.${key})`).toBeDefined()
      expect(entry[0], `typography.${key}.fontSize`).toBe(`${style.fontSize}px`)
      expect(entry[1].lineHeight, `typography.${key}.lineHeight`).toBe(`${style.lineHeight}px`)
    }
  })

  it('has no orphan tailwind fontSize key that no typography style claims', () => {
    const claimed = new Set(Object.values(SIZE_KEYS))
    expect(Object.keys(tw.fontSize).filter((k) => !claimed.has(k))).toEqual([])
  })

  it('every typography fontFamily is one of the four loaded Lexend families', () => {
    const loaded = Object.values(fontFamilies)
    for (const key of Object.keys(typography) as (keyof typeof typography)[]) {
      expect(loaded, `typography.${key}.fontFamily`).toContain(typography[key].fontFamily)
    }
  })

  it('tailwind fontFamily resolves to exactly the same four families', () => {
    expect(tw.fontFamily.sans).toEqual([fontFamilies.regular])
    expect(tw.fontFamily.medium).toEqual([fontFamilies.medium])
    expect(tw.fontFamily.semibold).toEqual([fontFamilies.semibold])
    expect(tw.fontFamily.bold).toEqual([fontFamilies.bold])
  })

  it('binds weight into the family name rather than relying on numeric fontWeight (doc 02 §2.1)', () => {
    const byWeight: Record<string, string> = {
      '400': fontFamilies.regular,
      '500': fontFamilies.medium,
      '600': fontFamilies.semibold,
      '700': fontFamilies.bold,
    }
    for (const key of Object.keys(typography) as (keyof typeof typography)[]) {
      const style = typography[key]
      expect(style.fontFamily, `typography.${key} weight ${style.fontWeight}`).toBe(byWeight[style.fontWeight])
    }
  })

  it('every non-zero typography letterSpacing has a matching tailwind tracking class', () => {
    const TRACKING_KEYS: Partial<Record<keyof typeof typography, string>> = {
      display: 'tight-display',
      h1: 'tight-h1',
      h2: 'tight-h2',
      h3: 'tight-h3',
      h4: 'tight-h4',
      overline: 'wide',
      tiny: 'tiny-wide',
    }
    for (const [key, twKey] of Object.entries(TRACKING_KEYS)) {
      const style = typography[key as keyof typeof typography]
      expect(tw.letterSpacing[twKey!], `tailwind tracking."${twKey}" vs typography.${key}`).toBe(
        `${style.letterSpacing}px`
      )
    }
    // Anything without a tracking class must genuinely be 0, not just unmapped.
    for (const key of Object.keys(typography) as (keyof typeof typography)[]) {
      if (!(key in TRACKING_KEYS)) {
        expect(typography[key].letterSpacing, `typography.${key} has no tracking class so must be 0`).toBe(0)
      }
    }
  })

  it('headings all carry the negative tracking doc 02 §2.2 calls binding', () => {
    for (const key of ['display', 'h1', 'h2', 'h3', 'h4'] as const) {
      expect(typography[key].letterSpacing, `typography.${key}`).toBeLessThan(0)
    }
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
