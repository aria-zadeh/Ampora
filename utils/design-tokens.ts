/**
 * Ampora Design Tokens
 * Neutral + blue system, light-first (doc 02).
 * All colors defined here — never hardcode values in components.
 */
import type { TextStyle } from "react-native";

export const colors = {
  light: {
    primary: "#2563EB",
    primaryLight: "#60A5FA",
    primaryDark: "#1D4ED8",
    primaryForeground: "#FFFFFF",

    background: "#F7F6F3",
    card: "#FFFFFF",
    elevated: "#FAF9F7",

    text: "#1C1917",
    textSecondary: "#57534E",
    textMuted: "#6F6862",
    // neutral.400 — placeholder/disabled only (doc 02 section 1.7 text.disabled).
    // Intentionally low contrast (~2.5:1 on white), WCAG-exempt for disabled controls.
    textDisabled: "#A8A29A",
    // neutral.700 — strong body text / emphasized icon tint, one step above
    // textSecondary (doc 02 section 1.1). 10.3:1 on white, clears body text AA.
    textStrong: "#44403C",

    success: "#22C55E",
    successLight: "#DCFCE7",
    // success.600 — icon-chip glyphs on a success.100 tint, clears the 3:1
    // graphical-object bar (doc 02 section 6.3/12). Icons only, not body text.
    successAccent: "#16A34A",
    // success.700 — action.success: filled button/strong text, white label
    // 5.02:1 (doc 02 section 1.7/14.6). NOT the same as the success.500 brand accent.
    successStrong: "#15803D",
    warning: "#F97316",
    warningLight: "#FFEDD5",
    // warning.600 — icon-chip glyphs on a warning.100 tint, clears the 3:1
    // graphical-object bar. Icons only, not body text (3.6:1 on white).
    warningAccent: "#EA580C",
    // warning.700 — deep warning text / badge text on warning.100, 4.52:1
    // (doc 02 section 12/14.6).
    warningStrong: "#C2410C",
    danger: "#EF4444",
    dangerLight: "#FEE2E2",
    // red.600 — action.destructive: filled button/strong text, white label
    // 4.83:1 (doc 02 section 1.7/14.6). NOT the same as the danger.500 accent.
    dangerStrong: "#DC2626",

    border: "#E8E6E0",
    // neutral.300 — emphasized border (doc 02 section 1.7 border.strong).
    // Decorative separator, exempt from the 3:1 UI bar like the default border.
    borderStrong: "#D7D3CC",
    accent: "#8B5CF6",
    accentLight: "#EDE9FE",
    // accent.600 — accent text / pressed state, 5.70:1 on white (doc 02 section 1.3).
    accentStrong: "#7C3AED",
  },
  dark: {
    // Same #2563EB as light, per doc 02 §14.1 ("Primary UNCHANGED"). This was
    // briefly the lighter Tailwind primary-500 (#3B82F6) — a plausible-looking
    // choice for a dark canvas — but dark mode had zero live effect anywhere
    // in the app until this pass, so the value had never actually been
    // rendered, and it fails AA for a filled button's white label at 3.68:1
    // (core/__tests__/design-tokens.test.ts caught it; #2563EB clears 5.17:1,
    // matching the light-mode audit in doc 02 §14.6).
    primary: "#2563EB",
    primaryLight: "#60A5FA",
    primaryDark: "#2563EB",
    primaryForeground: "#FFFFFF",

    background: "#0C0A09",
    card: "#1C1917",
    elevated: "#292524",

    text: "#FAF9F7",
    textSecondary: "#A8A29A",
    textMuted: "#78716C",
    // neutral.600 — dark disabled/placeholder, ~2.3-2.6:1 on dark surfaces.
    // Mirrors the light-mode disabled ratio class (same reuse pattern as
    // textSecondary above, which borrows light's neutral.400 hex). WCAG-exempt.
    textDisabled: "#57534E",
    // neutral.300 — dark strong text/icon tint, 11.7:1 on the dark card. One
    // step brighter than textSecondary, mirroring the light textStrong gap.
    textStrong: "#D7D3CC",

    success: "#22C55E",
    successLight: "#14361F",
    successAccent: "#16A34A",
    successStrong: "#15803D",
    warning: "#F97316",
    warningLight: "#3A230F",
    warningAccent: "#EA580C",
    warningStrong: "#C2410C",
    danger: "#EF4444",
    dangerLight: "#3A1616",
    dangerStrong: "#DC2626",

    border: "#292524",
    // neutral.700 — dark emphasized border, one step stronger than the dark
    // default border, mirroring the light border/borderStrong gap. Decorative.
    borderStrong: "#44403C",
    accent: "#8B5CF6",
    accentLight: "#241C3A",
    accentStrong: "#7C3AED",
  },
} as const;

/**
 * Third-party BRAND marks. Deliberately separate from `colors` above, and
 * deliberately not theme-aware.
 *
 * These are not design decisions this project gets to make: a "Sign in with
 * Google" button has to carry Google's own blue to satisfy Google's branding
 * guidelines, and no step of the Stone/blue ramp is a legal substitute for it.
 * Putting them here rather than inline in `app/auth.tsx` means the
 * never-hardcode-a-colour rule stays absolute at every call site, with the one
 * legitimate exception named, explained and greppable in exactly one place.
 *
 * They must NOT gain a `dark:` variant or be swapped for a token. A brand mark
 * that changes colour with the app theme is the bug, not the fix. Contrast
 * against the surface behind them is handled by the surface, not by altering
 * the mark.
 */
export const brand = {
  /** Google's logo blue, for the Sign in with Google mark only. */
  google: "#4285F4",
} as const;

/**
 * Bespoke surfaces that are deliberately NOT on the neutral spine.
 *
 * `blindfold` is the calm-down takeover (`app/blindfold.tsx`): a warm cream
 * wash chosen for low stimulation rather than to match the app canvas, which
 * is why that file previously carried a comment exempting itself from the
 * colour rule outright. Naming the values here keeps the rule absolute and
 * makes the exception greppable, without changing a single rendered pixel.
 *
 * OPEN DESIGN QUESTION, deliberately not answered here: there is no dark
 * counterpart. A full-screen cream takeover while the rest of the app is dark
 * would be jarring, but picking the dark treatment for a wellbeing surface is
 * a product decision, not a mechanical token swap, so it is left for the owner
 * rather than invented. Until then Blindfold stays cream in both themes.
 */
export const surfaces = {
  blindfold: {
    /** Base wash behind the gradient. */
    base: "#FFFBF5",
    /** Top of the soft vertical gradient, settling into `base`. */
    gradientTop: "#FFF3E6",
  },
} as const;

/**
 * NativeWind `dark:` class mapping cheatsheet. NativeWind's `useColorScheme`
 * (from "nativewind", never "react-native") drives Tailwind's `dark:`
 * variant app-wide (`tailwind.config.js` `darkMode: "class"`); this table is
 * what a screen should actually WRITE to reproduce `colors.light` /
 * `colors.dark` above exactly, since the neutral ramp in `tailwind.config.js`
 * is one flat set of steps shared by both themes (it is not itself
 * theme-aware) — "dark mode" for a neutral surface is really just picking a
 * different step of the same ramp:
 *
 *   bg-white           dark:bg-neutral-900     (card)
 *   bg-neutral-50      dark:bg-neutral-800     (elevated)
 *   bg-neutral-100     dark:bg-neutral-950     (background/canvas)
 *   text-neutral-900   dark:text-neutral-50    (text)
 *   text-neutral-700   dark:text-neutral-300   (textStrong)
 *   text-neutral-600   dark:text-neutral-400   (textSecondary)
 *   text-neutral-400   dark:text-neutral-600   (textDisabled)
 *   border-neutral-200 dark:border-neutral-800 (border)
 *   border-neutral-300 dark:border-neutral-700 (borderStrong)
 *
 * `textMuted` is the one exception: `colors.dark.textMuted` (`#78716C`) is a
 * deliberately bespoke value (doc 02 §14.6 "Stone-500-on-dark") that does not
 * sit on any exact step of the shared neutral ramp — `neutral.500`
 * (`#6F6862`) is close but measurably lower contrast (3.19:1 vs the audited
 * 3.65:1 on a dark card). Reproduce it with the literal step: `text-neutral-500
 * dark:text-[#78716C]`. Semantic accent colors (primary/success/warning/
 * danger/accent) are UNCHANGED between themes (doc 02 §14.1) and never need a
 * `dark:` variant. Small pastel tint badges (e.g. `bg-success-100` paired
 * with `text-success-700`) are self-contained, already-audited pairs (doc 02
 * §14.6) that stay correct without a `dark:` variant too — leave them as-is
 * rather than inventing a darker tint for them.
 *
 * ACCENTS: the "no `dark:` variant" rule above is about accent SURFACES, and
 * it is easy to over-apply. Split it by what the accent is doing:
 *
 *   - A FILLED accent (button fill, badge fill, toggle track) keeps one value
 *     in both themes. The fill is opaque, so its white label's contrast does
 *     not move when the page behind it does. No `dark:` variant. Correct.
 *   - Accent TEXT or a small accent glyph sitting DIRECTLY on a neutral
 *     surface does move, and on dark it lands short. Measured against the
 *     dark card (`#1C1917`) and dark canvas (`#0C0A09`):
 *
 *       primary-600 #2563EB   3.38 / 3.82   clears 3:1, FAILS the 4.5:1 body bar
 *       primary-400 #60A5FA   6.88 / 7.77   passes
 *       danger-600  #DC2626   3.62          clears 3:1, FAILS 4.5:1
 *       danger-500  #EF4444   4.65 / 5.25   passes
 *
 *     So accent text on dark steps lighter, exactly as doc 02 §1.8 puts it
 *     ("use the 400 step where you used 600 on light"):
 *
 *       text-primary-600  dark:text-primary-400
 *       text-danger-600   dark:text-danger-500
 *
 *     An accent used purely as a large glyph or icon only owes 3:1, so the
 *     600 step is already fine there and needs no variant.
 *
 * KNOWN LIMIT, do not paper over it: the accent purple has no step that
 * reaches 4.5:1 on a dark surface. accentStrong `#7C3AED` measures 3.07:1 and
 * accent `#8B5CF6` 4.13:1, and the ramp has no 400. Purple is Projects-only
 * and is used as a glyph or a tint rather than as reading text, which is
 * within the 3:1 glyph bar, so this is a constraint rather than a live
 * failure. If purple is ever needed as body text on dark, the ramp needs a
 * lighter step first, it cannot be solved at the call site.
 *
 * `core/__tests__/design-tokens.test.ts` asserts this table against
 * `tailwind.config.js`'s neutral ramp and `colors.dark`, so a future edit to
 * either side gets a named failure instead of silent drift.
 */

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  base: 16,
  /**
   * The grouping step. Everything else in this scale is a flat 4px multiple
   * used for BOTH "gap within a group" and "gap between groups" — so a list
   * had no way to feel tight internally while still giving the next section
   * a real break. `group` (18) is that second gap: keep `sm`/`md` for the
   * tight rhythm between related rows in the same group, use `group` for the
   * break before a new one (mirrors the source design's `.sf-break`, 18px
   * between the urgent strip / feature card / section header, vs. 8-9px
   * between ordinary rows in the same stack).
   */
  group: 18,
  lg: 20,
  xl: 24,
  "2xl": 32,
  "3xl": 40,
  "4xl": 48,
  "5xl": 64,
} as const;

/**
 * Radius hierarchy (doc 02 §14.7 mapping). `lg` (12) is the quiet list-row /
 * card radius — unchanged, it already matched. `2xl` (18) is the feature-card
 * radius: this is the real "feature card" tier in the app (`Card`'s `feature`
 * prop, `GradientCard`, `FeatureShell`'s outer bezel, and the ~30 ad-hoc
 * bordered `rounded-2xl` surfaces across settings/onboarding/task-editor),
 * moved from 20 to 18. `3xl` (26) is reserved for hero surfaces — nothing in
 * the shipped tree used `rounded-3xl` before this change (grep-confirmed
 * zero call sites), so moving it from 28 to 26 is a free, zero-regression
 * top-of-ladder slot for a future full-bleed hero (e.g. the focus session
 * card). `xl` (16) is deliberately left alone as the mid step between quiet
 * rows and feature cards (modals/sheets/secondary rows). Every key name is
 * unchanged so all existing `rounded-*` / `borderRadius.*` call sites keep
 * resolving — only the `2xl` and `3xl` values moved.
 */
export const borderRadius = {
  xs: 6,
  sm: 8,
  md: 10,
  lg: 12,
  xl: 16,
  "2xl": 18,
  "3xl": 26,
  full: 9999,
} as const;

/**
 * Font families. Doc 02 §2.1 is binding: React Native does not reliably
 * combine `fontFamily` with a numeric `fontWeight` across platforms, so the
 * weight is bound into the family name. These four identifiers are the exact
 * exports of `@expo-google-fonts/lexend` loaded in `app/_layout.tsx`, and
 * they must stay in lockstep with `tailwind.config.js`'s `fontFamily` block
 * (`font-sans` / `font-medium` / `font-semibold` / `font-bold`).
 */
export const fontFamilies = {
  regular: "Lexend_400Regular",
  medium: "Lexend_500Medium",
  semibold: "Lexend_600SemiBold",
  bold: "Lexend_700Bold",
} as const;

/**
 * Type scale (doc 02 §2.2).
 *
 * HOW THIS IS CONSUMED. Screens style text with the Tailwind `text-*` /
 * `font-*` classes, not by importing these objects — converting ~36 screens
 * off NativeWind onto StyleSheet objects would be a large, risky, zero-visual
 * -benefit refactor. So the contract is the other direction: **`tailwind.
 * config.js` mirrors this object**, and `core/__tests__/design-tokens.test.ts`
 * asserts the mirror holds (size, line height, family and tracking, key for
 * key). Previously neither was true of the other, which is exactly how the
 * two were free to drift. Change a value here and the parity test tells you
 * which Tailwind entry to move with it.
 *
 * Each entry is a complete, directly-usable RN `TextStyle`: `fontFamily`
 * carries the weight (see `fontFamilies` above), `fontWeight` is retained
 * alongside it as the semantic record of the scale and for web, and headings
 * carry the negative tracking doc 02 §2.2 calls "the single most important
 * detail" of the headline look.
 */
export const typography = {
  display: { fontSize: 34, lineHeight: 40, fontWeight: "700" as const, fontFamily: fontFamilies.bold, letterSpacing: -0.8 },
  h1: { fontSize: 28, lineHeight: 34, fontWeight: "700" as const, fontFamily: fontFamilies.bold, letterSpacing: -0.6 },
  h2: { fontSize: 24, lineHeight: 30, fontWeight: "600" as const, fontFamily: fontFamilies.semibold, letterSpacing: -0.4 },
  h3: { fontSize: 20, lineHeight: 26, fontWeight: "600" as const, fontFamily: fontFamilies.semibold, letterSpacing: -0.2 },
  h4: { fontSize: 18, lineHeight: 24, fontWeight: "600" as const, fontFamily: fontFamilies.semibold, letterSpacing: -0.1 },
  bodyLg: { fontSize: 16, lineHeight: 24, fontWeight: "400" as const, fontFamily: fontFamilies.regular, letterSpacing: 0 },
  body: { fontSize: 15, lineHeight: 22, fontWeight: "400" as const, fontFamily: fontFamilies.regular, letterSpacing: 0 },
  bodyMedium: { fontSize: 15, lineHeight: 22, fontWeight: "500" as const, fontFamily: fontFamilies.medium, letterSpacing: 0 },
  label: { fontSize: 14, lineHeight: 20, fontWeight: "500" as const, fontFamily: fontFamilies.medium, letterSpacing: 0 },
  caption: { fontSize: 13, lineHeight: 18, fontWeight: "400" as const, fontFamily: fontFamilies.regular, letterSpacing: 0 },
  captionMedium: { fontSize: 13, lineHeight: 18, fontWeight: "500" as const, fontFamily: fontFamilies.medium, letterSpacing: 0 },
  overline: { fontSize: 11, lineHeight: 14, fontWeight: "600" as const, fontFamily: fontFamilies.semibold, letterSpacing: 0.6 },
  tiny: { fontSize: 11, lineHeight: 14, fontWeight: "400" as const, fontFamily: fontFamilies.regular, letterSpacing: 0.2 },
} as const;

/**
 * 5-level elevation system (doc 02 §5/§14.2). RN shadow props — apply via
 * style={shadows.sm}, NOT className. `sm` is the default card elevation.
 *
 * Retuned to read as a real four-tier ladder rather than six evenly-spaced
 * steps (the previous progression added a flat +0.02 opacity / +8 radius at
 * every single step, so a resting list row and a feature card barely read as
 * different weights). `none`/`xs` stay a near-invisible hairline pair; `sm`
 * (resting card, doc's default), `md` (feature card, pairs with the new
 * `borderRadius["2xl"]` 18), and `lg` (hero / modal, pairs with the new
 * `borderRadius["3xl"]` 26) now step up with real, growing separation; `xl`
 * (bottom sheets, command palette — meant to be used rarely, per doc 02 §5's
 * own "reserve for things that are genuinely floating") is the deliberate
 * top of the ladder. `shadowColor` stays the warm Stone `#292524` (doc
 * §14.2) at every tier — unchanged, still the "warm ambient depth" this
 * doc section already established, not a hard black drop-shadow. Six keys,
 * same as before — no new keys added, only the five non-zero values retuned.
 */
export const shadows = {
  none: {
    shadowColor: "#292524",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
  xs: {
    shadowColor: "#292524",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
  },
  sm: {
    shadowColor: "#292524",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.07,
    shadowRadius: 10,
    elevation: 3,
  },
  md: {
    shadowColor: "#292524",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.11,
    shadowRadius: 18,
    elevation: 6,
  },
  lg: {
    shadowColor: "#292524",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.15,
    shadowRadius: 26,
    elevation: 9,
  },
  xl: {
    shadowColor: "#292524",
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.2,
    shadowRadius: 34,
    elevation: 13,
  },
} as const;

/**
 * Motion tokens. Durations in ms, springs for Reanimated withSpring,
 * press feedback for the PressableScale primitive.
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
    /** Snappier spring for drag pickup/drop and control toggles (calendar block drag). */
    tactile: { damping: 26, mass: 0.8, stiffness: 340 },
  },
  press: { scale: 0.97, opacity: 0.9, inMs: 100, outMs: 150 },
} as const;

/**
 * Gradient color-array presets for expo-linear-gradient <LinearGradient colors={...} />.
 * Keep these SUBTLE — faint washes only, never for text.
 */
export const gradients = {
  heroWash: ["#EFF6FF", "rgba(247,246,243,0)"],
  firstMove: ["#EFF6FF", "#FFFFFF"],
  successTint: ["#F0FDF4", "#FFFFFF"],
  fade: ["rgba(247,246,243,0)", "#F7F6F3"],
  /**
   * Dark-mode counterpart to `heroWash`. The light wash is a bright blue
   * tint (`primary-50`), which reads as jarring directly on a dark canvas —
   * so this is built entirely from existing `colors.dark` values (elevated
   * fading to a transparent background), never a newly invented hex, per a
   * warm near-black surface fading to nothing rather than a bright color.
   * Pick between the two with `useThemeColors`'s resolved scheme, e.g.
   * `colors={scheme === "dark" ? gradients.heroWashDark : gradients.heroWash}`.
   */
  heroWashDark: ["#292524", "rgba(12,10,9,0)"],
} as const;

/** Layout constants (px) for screen padding, content width, card rhythm. */
export const layout = {
  screenPadX: 20,
  screenPadXLarge: 24,
  maxContentWidth: 560,
  cardPad: 16,
  cardPadFeature: 20,
  cardGap: 12,
  sectionGap: 28,
  rowMinHeight: 56,
} as const;

/**
 * Muted-pastel semantic tints for lists, tags, and category chips (doc 02 v3 "Calm Premium").
 * `bg` = pale tint for chips/badges, `text` = readable label color on that bg (>=4.5:1,
 * audited), `bar` = a slightly stronger tone for the TaskCard left tint-bar (decorative,
 * not required to hit AA on its own — it never carries text).
 */
export const listColors = {
  red: { bg: "#FDEBEC", text: "#9F2F2D", bar: "#E4726F" },
  blue: { bg: "#E1F3FE", text: "#1F6C9F", bar: "#6BB6E4" },
  green: { bg: "#EDF3EC", text: "#346538", bar: "#74A878" },
  yellow: { bg: "#FBF3DB", text: "#956400", bar: "#D9B65B" },
  purple: { bg: "#EDE9FE", text: "#6D28D9", bar: "#A992F0" },
  orange: { bg: "#FFEDD5", text: "#C2410C", bar: "#F0A46B" },
  teal: { bg: "#D9F2EE", text: "#0F6E60", bar: "#5FC4B4" },
  pink: { bg: "#FCE7F1", text: "#A32B68", bar: "#EC8BB8" },
  indigo: { bg: "#E6E9FD", text: "#3730A3", bar: "#8B93E8" },
  slate: { bg: "#ECEAE6", text: "#52525B", bar: "#A8A29A" },
} as const;

export type ListColorName = keyof typeof listColors;

/** Tabular (monospaced-width) numerals so digit columns don't jitter — timers, counters. */
export const tabularNums: Pick<TextStyle, "fontVariant"> = { fontVariant: ["tabular-nums"] };

/** Icon sizing scale (px). */
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
/** Minimum button height */
export const BUTTON_MIN_HEIGHT = 44;

export const urgency = {
  /** >48 hours — no urgency */
  none: { color: "text-neutral-500", icon: "time-outline" as const },
  /** 12-48 hours — amber warning */
  soon: { color: "text-warning-600", icon: "alert-circle-outline" as const },
  /** <12 hours — red urgent */
  urgent: { color: "text-danger-600", icon: "warning-outline" as const },
} as const;
