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
    primary: "#3B82F6",
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

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  base: 16,
  lg: 20,
  xl: 24,
  "2xl": 32,
  "3xl": 40,
  "4xl": 48,
  "5xl": 64,
} as const;

export const borderRadius = {
  xs: 6,
  sm: 8,
  md: 10,
  lg: 12,
  xl: 16,
  "2xl": 20,
  "3xl": 28,
  full: 9999,
} as const;

export const typography = {
  display: { fontSize: 34, lineHeight: 40, fontWeight: "700" as const },
  h1: { fontSize: 28, lineHeight: 34, fontWeight: "700" as const },
  h2: { fontSize: 24, lineHeight: 30, fontWeight: "600" as const },
  h3: { fontSize: 20, lineHeight: 26, fontWeight: "600" as const },
  h4: { fontSize: 18, lineHeight: 24, fontWeight: "600" as const },
  bodyLg: { fontSize: 16, lineHeight: 24, fontWeight: "400" as const },
  body: { fontSize: 15, lineHeight: 22, fontWeight: "400" as const },
  label: { fontSize: 14, lineHeight: 20, fontWeight: "500" as const },
  caption: { fontSize: 13, lineHeight: 18, fontWeight: "400" as const },
  overline: { fontSize: 11, lineHeight: 14, fontWeight: "600" as const },
  tiny: { fontSize: 11, lineHeight: 14, fontWeight: "400" as const },
} as const;

/**
 * 5-level elevation system (doc 02 §5). RN shadow props — apply via
 * style={shadows.sm}, NOT className. `sm` is the default card elevation.
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
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  md: {
    shadowColor: "#292524",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 4,
  },
  lg: {
    shadowColor: "#292524",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.1,
    shadowRadius: 24,
    elevation: 8,
  },
  xl: {
    shadowColor: "#292524",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.12,
    shadowRadius: 32,
    elevation: 12,
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
