/**
 * Pure contract tests for the token-layer design refresh (the six tells:
 * Lexend, the ProgressRing tonal ring, radius hierarchy, shadow ladder,
 * restored 400/500 type weights, and the 18px spacing group step). These
 * are cheap tripwires against silently losing the hierarchy in some future
 * edit to utils/design-tokens.ts — not a substitute for visually checking
 * the app, which this pass could not do.
 */

import { describe, expect, it, vi } from 'vitest'
import { borderRadius, colors, fontFamilies, shadows, spacing, typography } from '@/utils/design-tokens'

// react-native ships raw Flow-annotated source, normally stripped by Metro's
// babel preset before it reaches JS. This vitest harness runs `core/**`
// under plain Node with no such transform (see this file's own import of
// `typography` above, which only reaches react-native through an erased
// `import type`). components/ui/Text.tsx needs a real value import of RN's
// Text to render it, so importing that module here would otherwise crash on
// Flow syntax it was never meant to parse. This test only needs the plain
// TYPOGRAPHY_CLASSES object, never renders anything, so react-native is safe
// to stub for this file alone. vi.mock calls are hoisted above the imports
// below by vitest, so this applies before components/ui/Text.tsx loads.
vi.mock('react-native', () => ({ Text: 'Text' }))

import { TYPOGRAPHY_CLASSES } from '@/components/ui/Text'
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

  /**
   * The consumption path itself. TYPOGRAPHY_CLASSES in components/ui/Text.tsx
   * is the single place a typography key becomes the Tailwind classes a
   * screen actually renders. These tests resolve every entry's text-*,
   * font-* and tracking-* classes back through this same tailwind.config.js
   * and check the result against `typography` directly, not just against the
   * string literals in Text.tsx, so a wrong weight or a missing tracking
   * class fails here even if TYPOGRAPHY_CLASSES and tailwind.config.js
   * happen to agree with each other while both disagree with typography.
   */
  describe('components/ui/Text.tsx: TYPOGRAPHY_CLASSES maps every typography key', () => {
    const classNames = (entry: string) => entry.split(' ')
    const byPrefix = (entry: string, prefix: string) =>
      classNames(entry).find((c) => c.startsWith(prefix))

    it('has exactly one entry per typography key, no extras', () => {
      expect(Object.keys(TYPOGRAPHY_CLASSES).sort()).toEqual(Object.keys(typography).sort())
    })

    it('every text-* class names the tailwind fontSize key matching that typography size and line height', () => {
      for (const key of Object.keys(typography) as (keyof typeof typography)[]) {
        const style = typography[key]
        const sizeClass = byPrefix(TYPOGRAPHY_CLASSES[key], 'text-')
        expect(sizeClass, `TYPOGRAPHY_CLASSES.${key} has no text-* class`).toBeDefined()
        const sizeKey = sizeClass!.slice('text-'.length)
        expect(sizeKey, `TYPOGRAPHY_CLASSES.${key} text-* class`).toBe(SIZE_KEYS[key])
        const entry = tw.fontSize[sizeKey]
        expect(entry, `tailwind fontSize."${sizeKey}" is missing`).toBeDefined()
        expect(entry[0], `TYPOGRAPHY_CLASSES.${key} size`).toBe(`${style.fontSize}px`)
        expect(entry[1].lineHeight, `TYPOGRAPHY_CLASSES.${key} line height`).toBe(`${style.lineHeight}px`)
      }
    })

    it('every font-* class resolves through tailwind fontFamily to the same loaded family as that typography entry, catching weight drift', () => {
      const familyToFontKey: Record<string, string> = {
        [fontFamilies.regular]: 'sans',
        [fontFamilies.medium]: 'medium',
        [fontFamilies.semibold]: 'semibold',
        [fontFamilies.bold]: 'bold',
      }
      for (const key of Object.keys(typography) as (keyof typeof typography)[]) {
        const style = typography[key]
        const fontClass = byPrefix(TYPOGRAPHY_CLASSES[key], 'font-')
        expect(fontClass, `TYPOGRAPHY_CLASSES.${key} has no font-* class`).toBeDefined()
        const fontKey = fontClass!.slice('font-'.length)
        expect(fontKey, `TYPOGRAPHY_CLASSES.${key} font-* class`).toBe(familyToFontKey[style.fontFamily])
        const family = tw.fontFamily[fontKey]
        expect(family, `tailwind fontFamily."${fontKey}" is missing`).toBeDefined()
        expect(family[0], `TYPOGRAPHY_CLASSES.${key} resolved family`).toBe(style.fontFamily)
      }
    })

    it('carries a tracking-* class resolving to the exact letterSpacing px for every non-zero key, and none when letterSpacing is 0', () => {
      for (const key of Object.keys(typography) as (keyof typeof typography)[]) {
        const style = typography[key]
        const trackingClass = byPrefix(TYPOGRAPHY_CLASSES[key], 'tracking-')
        if (style.letterSpacing === 0) {
          expect(trackingClass, `TYPOGRAPHY_CLASSES.${key} should carry no tracking class`).toBeUndefined()
          continue
        }
        expect(trackingClass, `TYPOGRAPHY_CLASSES.${key} is missing a tracking-* class`).toBeDefined()
        const trackingKey = trackingClass!.slice('tracking-'.length)
        const px = tw.letterSpacing[trackingKey]
        expect(px, `tailwind letterSpacing."${trackingKey}" is missing`).toBeDefined()
        expect(px, `TYPOGRAPHY_CLASSES.${key} tracking value`).toBe(`${style.letterSpacing}px`)
      }
    })
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

// ---------------------------------------------------------------------------
// Dark mode: the neutral-ramp `dark:` cheatsheet documented above `spacing`
// in utils/design-tokens.ts. Screens reproduce `colors.dark` with NativeWind
// `dark:` classes against the ONE shared neutral ramp in tailwind.config.js
// (it is not itself theme-aware — there is no separate "dark neutral ramp"),
// so this is what actually guarantees a `dark:bg-neutral-900` in some screen
// really does mean `colors.dark.card`, rather than two things that merely
// happened to agree on the day they were written.
// ---------------------------------------------------------------------------

describe('design tokens: dark mode neutral-ramp cheatsheet stays true', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const neutral = require('../../tailwind.config.js').theme.extend.colors.neutral

  it('every mapped light-mode semantic color sits at the documented neutral step', () => {
    expect(colors.light.card).toBe(neutral[0])
    expect(colors.light.elevated).toBe(neutral[50])
    expect(colors.light.background).toBe(neutral[100])
    expect(colors.light.text).toBe(neutral[900])
    expect(colors.light.textStrong).toBe(neutral[700])
    expect(colors.light.textSecondary).toBe(neutral[600])
    expect(colors.light.textMuted).toBe(neutral[500])
    expect(colors.light.textDisabled).toBe(neutral[400])
    expect(colors.light.border).toBe(neutral[200])
    expect(colors.light.borderStrong).toBe(neutral[300])
  })

  it('every mapped dark-mode semantic color sits at the documented neutral step, EXCEPT textMuted', () => {
    expect(colors.dark.card).toBe(neutral[900])
    expect(colors.dark.elevated).toBe(neutral[800])
    expect(colors.dark.background).toBe(neutral[950])
    expect(colors.dark.text).toBe(neutral[50])
    expect(colors.dark.textStrong).toBe(neutral[300])
    expect(colors.dark.textSecondary).toBe(neutral[400])
    expect(colors.dark.textDisabled).toBe(neutral[600])
    expect(colors.dark.border).toBe(neutral[800])
    expect(colors.dark.borderStrong).toBe(neutral[700])
  })

  it('dark textMuted is the documented bespoke value, deliberately off-ramp (doc 02 §14.6)', () => {
    // Reproduced in JSX as the arbitrary-value class `dark:text-[#78716C]`,
    // never `dark:text-neutral-500` (neutral[500] is measurably lower
    // contrast on a dark card — see the contrast assertions below).
    expect(colors.dark.textMuted).toBe('#78716C')
    expect(colors.dark.textMuted).not.toBe(neutral[500])
  })

  it('primary is UNCHANGED between themes (doc 02 §14.1) — #2563EB clears AA for a filled button label in both; the lighter primary-500 that briefly lived here failed white-on-primary at 3.68:1 (see the WCAG describe block below)', () => {
    expect(colors.dark.primary).toBe(colors.light.primary)
    expect(colors.dark.primary).toBe('#2563EB')
  })

  it('success/warning/danger/accent "strong"/"accent" text tones are UNCHANGED between themes, so they never need a dark: variant', () => {
    expect(colors.dark.successAccent).toBe(colors.light.successAccent)
    expect(colors.dark.successStrong).toBe(colors.light.successStrong)
    expect(colors.dark.warningAccent).toBe(colors.light.warningAccent)
    expect(colors.dark.warningStrong).toBe(colors.light.warningStrong)
    expect(colors.dark.dangerStrong).toBe(colors.light.dangerStrong)
    expect(colors.dark.accentStrong).toBe(colors.light.accentStrong)
  })
})

/**
 * WCAG 2.1 relative-luminance contrast, computed directly rather than
 * imported, so this file has no new runtime dependency. Verifies the SAME
 * pairs doc 02 §14.6 audited for light mode also clear their bar in dark —
 * a tripwire against a future edit to `colors.dark` quietly breaking a ratio
 * nothing else here would catch (this table is the only place per-role
 * dark-mode contrast is checked at all).
 */
describe('design tokens: WCAG AA holds for colors.dark text-on-surface pairs', () => {
  function channel(c: number): number {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  function luminance(hex: string): number {
    const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex)
    if (!m) throw new Error(`not a #rrggbb hex: ${hex}`)
    const [r, g, b] = [m[1], m[2], m[3]].map((h) => channel(parseInt(h, 16)))
    return 0.2126 * r + 0.7152 * g + 0.0722 * b
  }
  function contrast(a: string, b: string): number {
    const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x)
    return (l1 + 0.05) / (l2 + 0.05)
  }

  it('body text (colors.dark.text) on the dark card clears 4.5:1', () => {
    expect(contrast(colors.dark.text, colors.dark.card)).toBeGreaterThanOrEqual(4.5)
  })

  it('secondary text (colors.dark.textSecondary) on the dark card clears 4.5:1', () => {
    expect(contrast(colors.dark.textSecondary, colors.dark.card)).toBeGreaterThanOrEqual(4.5)
  })

  it('strong text (colors.dark.textStrong) on the dark card clears 4.5:1', () => {
    expect(contrast(colors.dark.textStrong, colors.dark.card)).toBeGreaterThanOrEqual(4.5)
  })

  it('muted text (colors.dark.textMuted) on the dark card clears the 3:1 caption-tier bar it is documented and used as (doc 02 §14.6)', () => {
    expect(contrast(colors.dark.textMuted, colors.dark.card)).toBeGreaterThanOrEqual(3)
  })

  it('primary-on-card and white-on-primary both clear their bars in dark mode', () => {
    expect(contrast(colors.dark.primary, colors.dark.card)).toBeGreaterThanOrEqual(3) // large/UI-glyph bar
    expect(contrast('#FFFFFF', colors.dark.primary)).toBeGreaterThanOrEqual(4.5) // filled-button label
  })
})
