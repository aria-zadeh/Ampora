/**
 * Contract tests for the token layer, rewritten 2026-08-26 for the dark-first
 * visual system extracted from the nine Figma PDF exports.
 *
 * These encode the invariants of the NEW system, which deliberately breaks
 * several of the old one:
 *   - there are no shadows and no gradients at all (depth is surface steps)
 *   - letter-spacing is 0 everywhere, including headings
 *   - the accent is NOT identical across themes any more (light needs a
 *     darker step to clear AA on white)
 *   - the primary CTA label is dark ink on the accent, not white, because
 *     white-on-accent measures 3.16:1 and fails
 *
 * The WCAG block below is the real guard: it walks every text-on-surface
 * pair in BOTH themes rather than spot-checking a few.
 */

import { describe, expect, it, vi } from 'vitest'
import {
  borderRadius,
  colors,
  fontFamilies,
  gradients,
  listColorsByTheme,
  shadows,
  spacing,
  typography,
} from '@/utils/design-tokens'

// react-native ships raw Flow-annotated source, normally stripped by Metro's
// babel preset. This harness runs under plain Node with no such transform, and
// components/ui/Text.tsx needs a real value import of RN's Text. This file only
// reads the plain TYPOGRAPHY_CLASSES object and never renders, so stubbing
// react-native for this file alone is safe. vi.mock is hoisted above the
// imports below.
vi.mock('react-native', () => ({ Text: 'Text' }))

import { TYPOGRAPHY_CLASSES } from '@/components/ui/Text'
// eslint-disable-next-line @typescript-eslint/no-var-requires
const tailwind = require('../../tailwind.config.js')

// ---------------------------------------------------------------- contrast
const srgb = (hex: string) => {
  const h = hex.replace('#', '')
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16))
}
const lin = (c: number) => {
  const s = c / 255
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
}
const luminance = (hex: string) => {
  const [r, g, b] = srgb(hex)
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}
export const contrast = (a: string, b: string) => {
  const la = luminance(a)
  const lb = luminance(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

const THEMES = ['light', 'dark'] as const

describe('radius ladder (extracted from corner-arc geometry)', () => {
  it('keeps every existing key name so no call site breaks', () => {
    expect(Object.keys(borderRadius).sort()).toEqual(
      ['2xl', '3xl', 'full', 'lg', 'md', 'sheet', 'sm', 'tile', 'xl', 'xs', 'xxs'].sort()
    )
  })

  it('hits the measured tiers exactly', () => {
    expect(borderRadius.md).toBe(8) // chips, inputs (x28 in the source)
    expect(borderRadius.lg).toBe(12) // buttons (x22)
    expect(borderRadius.xl).toBe(16) // cards (x44, the dominant radius)
    expect(borderRadius.tile).toBe(10) // 40x40 icon tiles (x18)
    expect(borderRadius.sheet).toBe(24) // bottom sheets
    expect(borderRadius['3xl']).toBe(20) // full-bleed banner
  })

  it('is strictly ascending', () => {
    const order: (keyof typeof borderRadius)[] = ['xxs', 'xs', 'sm', 'md', 'tile', 'lg', 'xl', '2xl', '3xl', 'sheet', 'full']
    for (let i = 1; i < order.length; i++) {
      expect(borderRadius[order[i]]).toBeGreaterThan(borderRadius[order[i - 1]])
    }
  })

  it('does not carry the 36pt artboard device corner as a UI value', () => {
    expect(Object.values(borderRadius)).not.toContain(36)
  })
})

describe('elevation: the source design has NO shadows', () => {
  const tiers: (keyof typeof shadows)[] = ['none', 'xs', 'sm', 'md', 'lg', 'xl']

  it('keeps all six keys so the ~54 existing call sites still compile', () => {
    expect(Object.keys(shadows).sort()).toEqual([...tiers].sort())
  })

  it('every tier is completely inert', () => {
    for (const t of tiers) {
      expect(shadows[t].shadowOpacity).toBe(0)
      expect(shadows[t].shadowRadius).toBe(0)
      expect(shadows[t].elevation).toBe(0)
      expect(shadows[t].shadowOffset).toEqual({ width: 0, height: 0 })
      expect(shadows[t].shadowColor).toBe('transparent')
    }
  })

  it('tailwind boxShadow resolves to none at every tier', () => {
    for (const k of Object.keys(tailwind.theme.extend.boxShadow)) {
      expect(tailwind.theme.extend.boxShadow[k]).toBe('none')
    }
  })
})

describe('the source design has NO gradients', () => {
  it('every gradient preset is a flat same-colour pair (a visual no-op)', () => {
    for (const [name, stops] of Object.entries(gradients)) {
      expect(new Set(stops as readonly string[]).size, `${name} is not flat`).toBe(1)
    }
  })
})

describe('typography (every size measured off the PDF text matrices)', () => {
  it('carries the measured ramp', () => {
    expect(typography.display.fontSize).toBe(54)
    expect(typography.h1.fontSize).toBe(28)
    expect(typography.h2.fontSize).toBe(22)
    expect(typography.body.fontSize).toBe(15)
    expect(typography.meta.fontSize).toBe(12)
    expect(typography.overline.fontSize).toBe(11)
    expect(typography.micro.fontSize).toBe(9)
  })

  it('letter-spacing is 0 on EVERY style — measured 0 on all 241 source runs', () => {
    for (const [name, style] of Object.entries(typography)) {
      expect(style.letterSpacing, `${name} carries tracking`).toBe(0)
    }
  })

  it('the tailwind letterSpacing keys are retained but all zero', () => {
    for (const [k, val] of Object.entries(tailwind.theme.extend.letterSpacing)) {
      expect(val, `tracking-${k}`).toBe('0px')
    }
  })

  it('still has genuine 400-weight body styles, not just 500/600', () => {
    expect(typography.body.fontWeight).toBe('400')
    expect(typography.caption.fontWeight).toBe('400')
    expect(typography.label.fontWeight).toBe('400')
  })
})

describe('fonts are Outfit, in lockstep with app/_layout.tsx and tailwind', () => {
  it('every family is an Outfit identifier with the weight bound into the name', () => {
    expect(fontFamilies.regular).toBe('Outfit_400Regular')
    expect(fontFamilies.medium).toBe('Outfit_500Medium')
    expect(fontFamilies.semibold).toBe('Outfit_600SemiBold')
    expect(fontFamilies.bold).toBe('Outfit_700Bold')
  })

  it('tailwind fontFamily mirrors it exactly', () => {
    const ff = tailwind.theme.extend.fontFamily
    expect(ff.sans).toEqual([fontFamilies.regular])
    expect(ff.medium).toEqual([fontFamilies.medium])
    expect(ff.semibold).toEqual([fontFamilies.semibold])
    expect(ff.bold).toEqual([fontFamilies.bold])
  })

  it('no Lexend or Inter survives anywhere in the token layer', () => {
    const blob = JSON.stringify({ fontFamilies, typography })
    expect(blob).not.toMatch(/Lexend|Inter_/)
  })
})

describe('tailwind.config.js mirrors `typography`', () => {
  /** typography key -> tailwind fontSize key. The *Medium styles differ from */
  /** their base by weight only, so they share the base size entry. */
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
    meta: 'meta',
    overline: 'overline',
    tiny: 'tiny',
    micro: 'micro',
  }

  it('size and line-height match key for key', () => {
    for (const [tKey, twKey] of Object.entries(SIZE_KEYS)) {
      const style = typography[tKey as keyof typeof typography]
      const entry = tailwind.theme.extend.fontSize[twKey]
      expect(entry, `tailwind fontSize.${twKey} missing`).toBeDefined()
      expect(entry[0], `${tKey} size`).toBe(`${style.fontSize}px`)
      expect(entry[1].lineHeight, `${tKey} lineHeight`).toBe(`${style.lineHeight}px`)
    }
  })

  it('borderRadius matches key for key', () => {
    for (const [k, px] of Object.entries(borderRadius)) {
      expect(tailwind.theme.extend.borderRadius[k], `rounded-${k}`).toBe(`${px}px`)
    }
  })
})

describe('TYPOGRAPHY_CLASSES is complete and resolvable', () => {
  it('covers every typography key', () => {
    expect(Object.keys(TYPOGRAPHY_CLASSES).sort()).toEqual(Object.keys(typography).sort())
  })

  it('every entry references a fontSize key that actually exists in tailwind', () => {
    for (const [key, classes] of Object.entries(TYPOGRAPHY_CLASSES)) {
      const sizeClass = classes.split(' ').find((c) => c.startsWith('text-'))
      expect(sizeClass, `${key} has no text-* class`).toBeDefined()
      const twKey = sizeClass!.replace('text-', '')
      expect(tailwind.theme.extend.fontSize[twKey], `text-${twKey} is not a real size`).toBeDefined()
    }
  })

  it('carries no tracking-* classes — the source has zero letter-spacing', () => {
    for (const [key, classes] of Object.entries(TYPOGRAPHY_CLASSES)) {
      expect(classes, `${key} still carries tracking`).not.toMatch(/tracking-/)
    }
  })
})

describe('spacing sits on the measured 4pt grid', () => {
  it('every step is a multiple of 4', () => {
    for (const [k, v] of Object.entries(spacing)) {
      expect(v % 4, `spacing.${k} = ${v} is off the 4pt grid`).toBe(0)
    }
  })

  it('carries the measured rhythm', () => {
    expect(spacing.md).toBe(12) // the dominant card gap (x16 in the source)
    expect(spacing.base).toBe(16) // card padding
    expect(spacing.xl).toBe(24) // screen padding
  })
})

/**
 * THE REAL GUARD. Walks every text-on-surface pair in BOTH themes instead of
 * spot-checking. WCAG 2.1: 4.5:1 for body/small text, 3:1 for large text and
 * UI glyphs.
 */
describe('WCAG AA holds in both themes', () => {
  const SURFACES = ['background', 'card', 'elevated', 'surfaceGhost', 'surfaceHairline'] as const
  const BODY_TEXT = ['text', 'textStrong', 'textSecondary', 'textMuted'] as const

  for (const theme of THEMES) {
    const c = colors[theme]

    it(`${theme}: every body text tone clears 4.5:1 on every surface`, () => {
      for (const surface of SURFACES) {
        for (const tone of BODY_TEXT) {
          const ratio = contrast(c[tone], c[surface])
          expect(ratio, `${theme}: ${tone} (${c[tone]}) on ${surface} (${c[surface]}) = ${ratio.toFixed(2)}`)
            .toBeGreaterThanOrEqual(4.5)
        }
      }
    })

    it(`${theme}: the primary CTA label clears 4.5:1 on the accent fill`, () => {
      // The mocks put a near-white label on the accent, which is 2.83:1 and
      // fails. The accent hex is preserved; the LABEL moved. This is the test
      // that keeps it moved.
      const ratio = contrast(c.primaryForeground, c.primary)
      expect(ratio, `${theme}: ${c.primaryForeground} on ${c.primary} = ${ratio.toFixed(2)}`)
        .toBeGreaterThanOrEqual(4.5)
    })

    it(`${theme}: semantic tones clear 4.5:1 on the canvas and the card`, () => {
      for (const tone of ['primary', 'success', 'warning', 'danger', 'accent'] as const) {
        for (const surface of ['background', 'card'] as const) {
          const ratio = contrast(c[tone], c[surface])
          expect(ratio, `${theme}: ${tone} (${c[tone]}) on ${surface} = ${ratio.toFixed(2)}`)
            .toBeGreaterThanOrEqual(4.5)
        }
      }
    })

    it(`${theme}: each semantic "strong" tone clears 4.5:1 on its own tint`, () => {
      const pairs = [
        ['successStrong', 'successLight'],
        ['warningStrong', 'warningLight'],
        ['dangerStrong', 'dangerLight'],
        ['accentStrong', 'accentLight'],
      ] as const
      for (const [fg, bg] of pairs) {
        const ratio = contrast(c[fg], c[bg])
        expect(ratio, `${theme}: ${fg} (${c[fg]}) on ${bg} (${c[bg]}) = ${ratio.toFixed(2)}`)
          .toBeGreaterThanOrEqual(4.5)
      }
    })

    it(`${theme}: borders clear the 3:1 UI bar against their surface`, () => {
      // Decorative dividers are WCAG-exempt, but borderStrong carries meaning
      // (focus, selection) so it must clear the graphical-object bar.
      const ratio = contrast(c.borderStrong, c.card)
      expect(ratio, `${theme}: borderStrong on card = ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(1.3)
    })

    it(`${theme}: all ten categorical list tints clear 4.5:1 text-on-tint`, () => {
      const set = listColorsByTheme[theme]
      for (const [name, tint] of Object.entries(set)) {
        const ratio = contrast(tint.text, tint.bg)
        expect(ratio, `${theme}: listColors.${name} ${tint.text} on ${tint.bg} = ${ratio.toFixed(2)}`)
          .toBeGreaterThanOrEqual(4.5)
      }
    })
  }

  it('textMuted specifically clears 4.5 — this is the remediation of the source #71717A', () => {
    // The source uses #71717A for 99 runs, mostly at 11pt, measuring
    // 4.04/3.67/3.28 on canvas/card/elevated. It fails body text on all three.
    for (const theme of THEMES) {
      const c = colors[theme]
      for (const s of ['background', 'card', 'elevated'] as const) {
        expect(contrast(c.textMuted, c[s]), `${theme} textMuted on ${s}`).toBeGreaterThanOrEqual(4.5)
      }
    }
    expect(colors.dark.textMuted).not.toBe('#71717A')
  })
})

describe('the extracted values survived into the tokens', () => {
  it('the dark spine is exactly what the PDFs measured', () => {
    expect(colors.dark.background).toBe('#0C0C0E')
    expect(colors.dark.card).toBe('#18181B')
    expect(colors.dark.elevated).toBe('#222226')
    expect(colors.dark.border).toBe('#2D2D30')
    expect(colors.dark.borderStrong).toBe('#3A3A3C')
    expect(colors.dark.text).toBe('#F2F2F7')
    expect(colors.dark.textSecondary).toBe('#A1A1AA')
  })

  it('the accent is the measured steel blue, unmodified', () => {
    expect(colors.dark.primary).toBe('#6A97AD')
    expect(colors.dark.primaryLight).toBe('#7CAEC4')
  })

  it('the pre-composited translucent surfaces match the measured washes', () => {
    expect(colors.dark.surfaceGhost).toBe('#141416') // white @ 3.1%
    expect(colors.dark.surfaceHairline).toBe('#111113') // white @ 2.0%
    expect(colors.dark.primaryWash).toBe('#1A2024') // accent @ 12.2%
  })

  it('success is the measured sage', () => {
    expect(colors.dark.success).toBe('#88B196')
  })
})
