/**
 * Ampora Design Tokens
 * Neutral + blue system, light-first (doc 02).
 * All colors defined here — never hardcode values in components.
 */

export const colors = {
  light: {
    primary: "#2563EB",
    primaryLight: "#60A5FA",
    primaryDark: "#1D4ED8",
    primaryForeground: "#FFFFFF",

    background: "#F4F4F5",
    card: "#FFFFFF",
    elevated: "#FAFAFA",

    text: "#18181B",
    textSecondary: "#52525B",
    textMuted: "#71717A",

    success: "#22C55E",
    successLight: "#DCFCE7",
    warning: "#F97316",
    warningLight: "#FFEDD5",
    danger: "#EF4444",
    dangerLight: "#FEE2E2",

    border: "#E4E4E7",
    accent: "#8B5CF6",
    accentLight: "#EDE9FE",
  },
  dark: {
    primary: "#3B82F6",
    primaryLight: "#60A5FA",
    primaryDark: "#2563EB",
    primaryForeground: "#FFFFFF",

    background: "#09090B",
    card: "#18181B",
    elevated: "#27272A",

    text: "#FAFAFA",
    textSecondary: "#A1A1AA",
    textMuted: "#71717A",

    success: "#22C55E",
    successLight: "#14361F",
    warning: "#F97316",
    warningLight: "#3A230F",
    danger: "#EF4444",
    dangerLight: "#3A1616",

    border: "#27272A",
    accent: "#8B5CF6",
    accentLight: "#241C3A",
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
    shadowColor: "#18181B",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
  xs: {
    shadowColor: "#18181B",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
  },
  sm: {
    shadowColor: "#18181B",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  md: {
    shadowColor: "#18181B",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 4,
  },
  lg: {
    shadowColor: "#18181B",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.1,
    shadowRadius: 24,
    elevation: 8,
  },
  xl: {
    shadowColor: "#18181B",
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
  },
  spring: {
    default: { damping: 18, mass: 1, stiffness: 220 },
    gentle: { damping: 22, mass: 1, stiffness: 160 },
  },
  press: { scale: 0.97, opacity: 0.9, inMs: 100, outMs: 150 },
} as const;

/**
 * Gradient color-array presets for expo-linear-gradient <LinearGradient colors={...} />.
 * Keep these SUBTLE — faint washes only, never for text.
 */
export const gradients = {
  heroWash: ["#EFF6FF", "rgba(244,244,245,0)"],
  firstMove: ["#EFF6FF", "#FFFFFF"],
  successTint: ["#F0FDF4", "#FFFFFF"],
  fade: ["rgba(244,244,245,0)", "#F4F4F5"],
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
