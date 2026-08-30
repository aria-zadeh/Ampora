/**
 * Ampora Design Tokens
 *
 * DARK-FIRST. Every concrete value below is derived from the nine Figma PDF
 * exports of the real Ampora screens (2026-08-26 extraction), not from the
 * prose in docs/02. Values are tagged:
 *
 *   [E] extracted    — read directly out of the PDF vector data
 *   [I] interpolated — a ramp step filled in between two extracted values
 *   [F] inferred     — the PDF did not carry it (motion, states, light theme)
 *
 * The source artboards are 402pt wide (iPhone 16 Pro at 1x), so one PDF unit
 * is one dp and every number here is a literal measurement.
 *
 * Never hardcode values in components — everything resolves through this file.
 */
import type { TextStyle } from "react-native";

/**
 * SURFACE MODEL. The source design carries depth entirely with flat surface
 * steps: canvas -> surface -> raised -> border. There are NO shadows, NO
 * gradients, NO blend modes and NO blurs anywhere in the nine screens
 * (verified: zero stroke ops, zero non-Normal blend modes, and the only
 * raster images are avatar photos). `shadows` below is retained as an inert
 * no-op ladder so existing call sites keep compiling while rendering flat.
 *
 * The only transparency in the system is a small set of measured washes,
 * exposed pre-composited as `surfaceGhost` / `surfaceHairline` / the `*Wash`
 * tokens, so nothing has to stack alpha at runtime.
 */
export const colors = {
  light: {
    /**
     * Light counterpart. Derived from the dark system STEP RELATIONSHIPS,
     * never a mechanical inversion: canvas is the extreme, surfaces step
     * toward the viewer, border sits one step off surface, text steps
     * primary -> secondary -> muted at matching contrast tiers. The dark
     * spine is cool-neutral, so this one is too — deliberately NOT the old
     * warm #F7F6F3. Every hue below was darkened until it cleared 4.5:1 on
     * the CANVAS (#F4F4F5, the worst-case light surface, not the white
     * card); ratios are recorded inline. [F] (no light mock exists)
     */
    primary: "#4C758A", // 4.53:1 on the canvas, 4.98:1 on the card
    primaryLight: "#6A97AD", // the dark-theme accent, reused as a light tint
    primaryDark: "#3B5A6B",
    primaryForeground: "#FFFFFF", // 4.98:1 on the primary fill

    background: "#F4F4F5",
    card: "#FFFFFF",
    elevated: "#FAFAFA",
    /** Pre-composited translucent surfaces (light counterparts). */
    surfaceGhost: "#F7F7F8",
    surfaceHairline: "#FAFAFB",

    text: "#18181B",
    textSecondary: "#52525B",
    textMuted: "#6B6B74",
    /** Placeholder/disabled only. Intentionally low contrast, WCAG-exempt. */
    textDisabled: "#A1A1AA",
    textStrong: "#09090B",

    success: "#50795E", // 4.51:1 on the canvas
    successLight: "#EBF3EE",
    successAccent: "#50795E",
    successStrong: "#3C5B47",
    warning: "#876B42", // 4.54:1 on the canvas
    warningLight: "#F3EFEB",
    warningAccent: "#876B42",
    warningStrong: "#67512F",
    danger: "#A25D53", // 4.52:1 on the canvas
    dangerLight: "#F3ECEB",
    dangerStrong: "#7C463E",

    border: "#E4E4E7",
    borderStrong: "#D4D4D8",
    accent: "#8063A0", // AI / smart only. 4.54:1 on the canvas
    accentLight: "#EFEBF3",
    accentStrong: "#664D80",

    /** Accent washes — tinted surfaces, light counterparts. */
    primaryWash: "#EBF0F3",
    primaryWashStrong: "#DDE7EC",
    successWash: "#EBF3EE",
  },
  dark: {
    /**
     * THE EXTRACTED SYSTEM. This is the source of truth the mocks describe.
     *
     * One correction was applied for WCAG, logged in docs/09_Decisions.md:
     * the mocks put #F2F2F7 labels on the #6A97AD accent fill, which is
     * 2.83:1 and fails body AND large text. The accent hex is preserved
     * exactly; only the label colour moved, to canvas ink at 6.18:1.
     */
    primary: "#6A97AD", // [E] the single general interactive accent
    primaryLight: "#7CAEC4", // [E] accent text/icons on dark, active nav
    primaryDark: "#A3CCDB", // [E] palest accent step
    /** [E]+fix — dark ink on the accent fill. 6.18:1. See note above. */
    primaryForeground: "#0C0C0E",

    background: "#0C0C0E", // [E] canvas
    card: "#18181B", // [E] card surface
    elevated: "#222226", // [E] raised surface
    /** [E] composited — #FFFFFF at 3.1% over canvas. Ghost/outline button fill. */
    surfaceGhost: "#141416",
    /** [E] composited — #FFFFFF at 2.0% over canvas. */
    surfaceHairline: "#111113",

    text: "#F2F2F7", // [E] 17.51:1 on canvas
    textSecondary: "#A1A1AA", // [E] 7.63:1 on canvas
    /**
     * [I] WCAG remediation. The mocks use #71717A here (99 uses, mostly at
     * 11pt), which is 4.04/3.67/3.28 on canvas/surface/raised — it fails
     * body text on all three. #8A8A93 is the smallest step along the same
     * neutral line that clears 4.5 everywhere: 5.71/5.18/4.63.
     */
    textMuted: "#8A8A93",
    /** [E] composited — #F2F2F7 at 30%. Disabled/track only, WCAG-exempt. */
    textDisabled: "#515154",
    textStrong: "#FFFFFF", // [E]

    success: "#88B196", // [E] 8.17:1 on canvas
    successLight: "#191D1C", // [E] composited — success at 10.2%
    successAccent: "#88B196",
    successStrong: "#9DC0A9",
    /**
     * [F] No orange appears in any of the nine screens. Proposed in the
     * extracted hue register, HSL(36, 34%, 60%). 7.84:1 on canvas.
     */
    warning: "#BCA076",
    warningLight: "#211E1C",
    warningAccent: "#BCA076",
    warningStrong: "#CCB68F",
    /**
     * [F] No red appears in any of the nine screens — the mocks paint "Drop"
     * and "Overdue by 1d" in the accent instead. docs/02 §13.1 binds red to
     * destructive/at-risk, so this is proposed rather than inherited.
     * HSL(8, 32%, 62%). 6.45:1 on canvas.
     */
    danger: "#BD877F",
    dangerLight: "#211B1C",
    dangerStrong: "#CDA09A",

    border: "#2D2D30", // [E] 1pt borders throughout
    borderStrong: "#3A3A3C", // [E]
    /** [F] No purple in the mocks. AI/smart/Projects only. HSL(268,24%,66%). */
    accent: "#A793BD",
    accentLight: "#1D1B22",
    accentStrong: "#BBA9CE",

    /** [E] measured accent washes, pre-composited over canvas. */
    primaryWash: "#1A2024", // accent @ 12.2%
    primaryWashStrong: "#222D34", // accent @ 23.9%
    successWash: "#191D1C", // success @ 10.2%
  },
} as const;

/**
 * Spacing. Base unit 4 [E] — every measured gap, padding and dimension in the
 * nine screens is divisible by 4, and the dominant rhythm is 8/12/16/24.
 * `md` (12) is the card-to-card gap, measured 16 times. Larger steps are [I].
 */
export const spacing = {
  xs: 4, // [E]
  sm: 8, // [E]
  md: 12, // [E] the dominant gap
  base: 16, // [E] card padding
  /** Kept for source compatibility; prefer `md` (12), the measured rhythm. */
  group: 16,
  lg: 20, // [I]
  xl: 24, // [E] screen padding
  "2xl": 32, // [I]
  "3xl": 40, // [I]
  "4xl": 48, // [I]
  "5xl": 64, // [I]
} as const;

/**
 * Radius ladder, entirely [E] from corner-arc geometry. Usage counts across
 * the nine screens: 16 x44 (cards, sheets), 8 x28 (chips, inputs), 12 x22
 * (buttons), 10 x18 (icon tiles), 24 (bottom sheets), 6/4/2 (micro elements,
 * bars), 18/20 (the full-bleed banner).
 *
 * Radii that measure exactly half an element height are pills/circles, not
 * ladder entries: the 48x28 toggle track measures 14 and the 24x24 knob
 * measures 12, both of which are `rounded-full` in code. Do not add them.
 *
 * The 36pt value that shows up in the data is the artboard device corner,
 * NOT a UI value, and is deliberately absent.
 *
 * Key names are unchanged so every existing `borderRadius.*` and `rounded-*`
 * call site keeps resolving — only the values moved.
 */
export const borderRadius = {
  xxs: 2, // [E] grab handles, thin progress bars
  xs: 4, // [E]
  sm: 6, // [E]
  md: 8, // [E] chips, small inputs
  tile: 10, // [E] 40x40 icon tiles
  lg: 12, // [E] buttons, input fields
  xl: 16, // [E] cards — the dominant radius (x44)
  "2xl": 18, // [E] feature surfaces
  "3xl": 20, // [E] full-bleed banner
  sheet: 24, // [E] bottom sheets (top corners)
  full: 9999, // [F] pills, avatars, toggle tracks and knobs
} as const;

/**
 * Font families. docs/02 §2.1 is binding: React Native does not reliably
 * combine `fontFamily` with a numeric `fontWeight` across platforms, so the
 * weight is bound into the family name.
 *
 * Instrument Sans. Outfit was the face in the Figma source, but it read as
 * generic in the built app, so it was replaced on Aria's call. These four
 * identifiers are the exact exports of `@expo-google-fonts/instrument-sans`
 * loaded in `app/_layout.tsx` and must stay in lockstep with
 * `tailwind.config.js`. Swapping the face again means changing only these
 * four strings, the four in tailwind.config.js, and the loader.
 */
export const fontFamilies = {
  regular: "InstrumentSans_400Regular",
  medium: "InstrumentSans_500Medium",
  semibold: "InstrumentSans_600SemiBold",
  bold: "InstrumentSans_700Bold",
} as const;

/**
 * Type scale — every size [E], measured off the text matrices.
 *
 * Letter-spacing measured EXACTLY 0 on all 241 text runs across the nine
 * screens, headings included. The negative display tracking that docs/02
 * §2.2 called "the single most important detail" is not present in the
 * source and has been removed.
 *
 * `meta` (12) and `micro` (9) are new keys for two heavily-used measured
 * sizes the old scale had no slot for. 9pt and 11pt deliberately sit below
 * the old docs/02 §9.9 floor (body >=15, captions >=13) — logged as an
 * explicit override in docs/09_Decisions.md. WCAG sets no minimum font size,
 * and the `textMuted` remediation above is what keeps 11pt legible.
 *
 * HOW THIS IS CONSUMED: screens use the Tailwind `text-*` / `font-*` classes;
 * `tailwind.config.js` mirrors this object and
 * `core/__tests__/design-tokens.test.ts` asserts the mirror holds.
 */
export const typography = {
  display: { fontSize: 54, lineHeight: 60, fontWeight: "700" as const, fontFamily: fontFamilies.bold, letterSpacing: 0 },
  h1: { fontSize: 28, lineHeight: 34, fontWeight: "600" as const, fontFamily: fontFamilies.semibold, letterSpacing: 0 },
  h2: { fontSize: 22, lineHeight: 28, fontWeight: "600" as const, fontFamily: fontFamilies.semibold, letterSpacing: 0 },
  h3: { fontSize: 20, lineHeight: 26, fontWeight: "600" as const, fontFamily: fontFamilies.semibold, letterSpacing: 0 },
  h4: { fontSize: 18, lineHeight: 24, fontWeight: "600" as const, fontFamily: fontFamilies.semibold, letterSpacing: 0 },
  bodyLg: { fontSize: 16, lineHeight: 22, fontWeight: "500" as const, fontFamily: fontFamilies.medium, letterSpacing: 0 },
  body: { fontSize: 15, lineHeight: 21, fontWeight: "400" as const, fontFamily: fontFamilies.regular, letterSpacing: 0 },
  bodyMedium: { fontSize: 15, lineHeight: 21, fontWeight: "500" as const, fontFamily: fontFamilies.medium, letterSpacing: 0 },
  label: { fontSize: 14, lineHeight: 20, fontWeight: "400" as const, fontFamily: fontFamilies.regular, letterSpacing: 0 },
  caption: { fontSize: 13, lineHeight: 18, fontWeight: "400" as const, fontFamily: fontFamilies.regular, letterSpacing: 0 },
  captionMedium: { fontSize: 13, lineHeight: 18, fontWeight: "500" as const, fontFamily: fontFamilies.medium, letterSpacing: 0 },
  /** [E] 12pt — badges, meta, secondary chips. 35 uses. */
  meta: { fontSize: 12, lineHeight: 16, fontWeight: "500" as const, fontFamily: fontFamilies.medium, letterSpacing: 0 },
  overline: { fontSize: 11, lineHeight: 15, fontWeight: "500" as const, fontFamily: fontFamilies.medium, letterSpacing: 0 },
  tiny: { fontSize: 11, lineHeight: 15, fontWeight: "400" as const, fontFamily: fontFamilies.regular, letterSpacing: 0 },
  /** [E] 9pt — micro labels. 9 uses. Never for running prose. */
  micro: { fontSize: 9, lineHeight: 12, fontWeight: "500" as const, fontFamily: fontFamilies.medium, letterSpacing: 0 },
} as const;

/**
 * Elevation. [E] THE SOURCE DESIGN HAS NO SHADOWS AT ALL — nine screens,
 * zero shadow geometry, zero blend modes, zero blurs. Depth is carried
 * entirely by the surface ladder (canvas -> card -> elevated -> border).
 *
 * All six keys are retained as inert no-ops so the ~54 existing
 * `style={shadows.*}` call sites keep compiling and simply render flat.
 * To raise something, move it up a surface step or give it a border —
 * do not reintroduce a shadow.
 */
const FLAT = {
  shadowColor: "transparent",
  shadowOffset: { width: 0, height: 0 },
  shadowOpacity: 0,
  shadowRadius: 0,
  elevation: 0,
} as const;

export const shadows = {
  none: FLAT,
  xs: FLAT,
  sm: FLAT,
  md: FLAT,
  lg: FLAT,
  xl: FLAT,
} as const;

/**
 * Motion tokens. [F] — a PDF carries no timing, so these are carried over
 * unchanged from the previous system. They already satisfy docs/02 §8: quiet,
 * fast, eased, and containing no bounce, elastic or overshoot curve anywhere.
 */
export const motion = {
  duration: {
    instant: 100,
    fast: 150,
    base: 200,
    slow: 300,
    slower: 400,
    /** Fast drag-follow — block position tracking a finger, not a settle animation. */
    drag: 120,
  },
  spring: {
    default: { damping: 18, mass: 1, stiffness: 220 },
    gentle: { damping: 22, mass: 1, stiffness: 160 },
    /** Snappier spring for drag pickup/drop and control toggles. */
    tactile: { damping: 26, mass: 0.8, stiffness: 340 },
  },
  press: { scale: 0.97, opacity: 0.9, inMs: 100, outMs: 150 },
} as const;

/**
 * [E] THE SOURCE DESIGN HAS NO GRADIENTS. Every entry below is a flat
 * same-colour pair, i.e. a visual no-op, kept only so existing
 * <LinearGradient colors={...} /> call sites keep compiling. Screen-level
 * commits remove the now-pointless wrappers as they are touched.
 * Do not reintroduce a decorative gradient.
 */
export const gradients = {
  heroWash: ["#18181B", "#18181B"],
  firstMove: ["#18181B", "#18181B"],
  successTint: ["#191D1C", "#191D1C"],
  fade: ["#0C0C0E", "#0C0C0E"],
  heroWashDark: ["#18181B", "#18181B"],
} as const;

/** Layout constants (dp). Screen padding and card rhythm are [E]. */
export const layout = {
  screenPadX: 24, // [E] left edge measured 24 on 56 elements
  screenPadXLarge: 24, // [E] same value — the source uses one inset
  maxContentWidth: 560, // [F] web/tablet clamp, not in the mocks
  cardPad: 16, // [E]
  cardPadFeature: 16, // [E] the source uses one card padding
  cardGap: 12, // [E] measured 16 times
  sectionGap: 32, // [I]
  rowMinHeight: 56, // [F] >= the 44 touch-target floor
  /** [E] measured card height (72) and card-to-card pitch (84 = 72 + 12). */
  cardHeight: 72,
  cardPitch: 84,
  /** [E] icon tile 40x40, 12 to its label. Button height 44. Toggle 48x28. */
  iconTile: 40,
  buttonHeight: 44,
  contentWidth: 354, // [E] 402 - 24 - 24
} as const;

/**
 * Categorical list/tag/project tints. The source screens only contain four
 * categorical dots (#7AAEBB #8295B3 #88B196 #A3CCDB, all 6x6px), so the full
 * ten-hue set is [I] — built in the same measured register (S ~26%, L ~62%
 * dark) so nothing shouts against the muted spine.
 *
 * `bg` = tint surface, `text` = label on that tint (every pair audited >=4.5:1
 * in BOTH themes), `bar` = the TaskCard left tint-bar (decorative, carries no
 * text). Resolve with `getListColors(scheme)`, not by reaching into a theme.
 */
export const listColorsByTheme = {
  dark: {
    red: { bg: "#211B1C", text: "#B78C85", bar: "#B78C85" },
    blue: { bg: "#1B1E22", text: "#85A6B7", bar: "#85A6B7" },
    green: { bg: "#1B211E", text: "#85B796", bar: "#85B796" },
    yellow: { bg: "#21201C", text: "#B7B185", bar: "#B7B185" },
    purple: { bg: "#1D1B22", text: "#9C85B7", bar: "#9C85B7" },
    orange: { bg: "#211E1C", text: "#B7A085", bar: "#B7A085" },
    teal: { bg: "#1B2122", text: "#85B7B1", bar: "#85B7B1" },
    pink: { bg: "#211B1F", text: "#B7859E", bar: "#B7859E" },
    indigo: { bg: "#1B1B22", text: "#858CB7", bar: "#858CB7" },
    slate: { bg: "#1D1D20", text: "#969CA6", bar: "#969CA6" },
  },
  light: {
    red: { bg: "#F3ECEB", text: "#925E56", bar: "#AA766E" },
    blue: { bg: "#EBF0F3", text: "#4D7284", bar: "#6E96AA" },
    green: { bg: "#EBF3EE", text: "#467756", bar: "#6EAA82" },
    yellow: { bg: "#F3F2EB", text: "#756F45", bar: "#AAA26E" },
    purple: { bg: "#EFEBF3", text: "#7C5D9F", bar: "#8A6EAA" },
    orange: { bg: "#F3EFEB", text: "#82694C", bar: "#AA8E6E" },
    teal: { bg: "#EBF3F2", text: "#467770", bar: "#6EAAA2" },
    pink: { bg: "#F3EBEF", text: "#965877", bar: "#AA6E8C" },
    indigo: { bg: "#EBECF3", text: "#5E67A1", bar: "#6E76AA" },
    slate: { bg: "#EEEEF0", text: "#666C78", bar: "#838995" },
  },
} as const;

/**
 * Default-theme view of the categorical tints. Dark is the app default, so
 * this points at the dark set and every existing `listColors.red.bg` call
 * site keeps working and renders correctly in the default theme. Theme-aware
 * call sites should use `getListColors(scheme)`.
 */
export const listColors = listColorsByTheme.dark;

export type ListColorName = keyof typeof listColorsByTheme.dark;

/** Resolve the categorical tints for a colour scheme. */
export function getListColors(scheme: "light" | "dark" | null | undefined) {
  return scheme === "light" ? listColorsByTheme.light : listColorsByTheme.dark;
}

/**
 * Third-party app brand marks — the logo tint shown next to each app in
 * `components/stakes/AppPicker.tsx`'s leisure-app catalog (Instagram pink,
 * TikTok near-black, etc). These are trademarked brand colours, not theme
 * colours: they identify a specific real-world app icon and must render the
 * same regardless of light/dark theme, so they are deliberately kept OUTSIDE
 * the theme system rather than resolved through `colors.light`/`colors.dark`.
 * This is the one sanctioned exception to "never hardcode a colour" — every
 * other colour in the app must still come from a token.
 */
export const appBrandColors = {
  instagram: "#C13584",
  tiktok: "#1C1917",
  youtube: "#DC2626",
  x: "#1C1917",
  snapchat: "#CA8A04",
  reddit: "#EA580C",
  facebook: "#2563EB",
  twitch: "#7C3AED",
  discord: "#6366F1",
  netflix: "#DC2626",
  games: "#16A34A",
  browser_fun: "#0891B2",
} as const;

/** Tabular (monospaced-width) numerals so digit columns do not jitter — timers, counters. */
export const tabularNums: Pick<TextStyle, "fontVariant"> = { fontVariant: ["tabular-nums"] };

/** Icon sizing scale (dp). */
export const iconSizes = {
  xs: 16,
  sm: 18,
  md: 20,
  lg: 24,
  xl: 32,
  hero: 48,
} as const;

/** Minimum touch target size per WCAG / Apple HIG */
export const TOUCH_TARGET_MIN = 44;
/** Preferred touch target for primary actions */
export const TOUCH_TARGET_PRIMARY = 52;
/** Minimum button height — [E] measured 44 in the source. */
export const BUTTON_MIN_HEIGHT = 44;

export const urgency = {
  /** >48 hours — no urgency */
  none: { color: "text-neutral-500", icon: "time-outline" as const },
  /** 12-48 hours — amber warning */
  soon: { color: "text-warning-600", icon: "alert-circle-outline" as const },
  /** <12 hours — red urgent */
  urgent: { color: "text-danger-600", icon: "warning-outline" as const },
} as const;
