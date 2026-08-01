/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,jsx,ts,tsx}", "./components/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // Ampora design system — warm neutral (Stone) + blue, light-first (doc 02, v3 "Calm Premium").
        neutral: {
          0: "#FFFFFF",
          50: "#FAF9F7",
          100: "#F7F6F3",
          200: "#E8E6E0",
          300: "#D7D3CC",
          400: "#A8A29A",
          500: "#6F6862",
          600: "#57534E",
          700: "#44403C",
          800: "#292524",
          900: "#1C1917",
          950: "#0C0A09",
        },
        primary: {
          50: "#EFF6FF",
          100: "#DBEAFE",
          200: "#BFDBFE",
          300: "#93C5FD",
          400: "#60A5FA",
          500: "#3B82F6",
          600: "#2563EB",
          700: "#1D4ED8",
          800: "#1E40AF",
          900: "#1E3A8A",
        },
        success: {
          100: "#DCFCE7",
          500: "#22C55E",
          600: "#16A34A",
          700: "#15803D",
        },
        warning: {
          100: "#FFEDD5",
          500: "#F97316",
          600: "#EA580C",
          700: "#C2410C",
        },
        accent: {
          100: "#EDE9FE",
          500: "#8B5CF6",
          600: "#7C3AED",
          700: "#6D28D9",
        },
        danger: {
          100: "#FEE2E2",
          500: "#EF4444",
          600: "#DC2626",
          700: "#B91C1C",
        },
      },
      // MIRROR OF utils/design-tokens.ts `typography`. That object is the
      // scale of record (doc 02 §2.2); this block is how screens actually
      // consume it, via `text-*` + `font-*` classes. The two are asserted
      // equal, key for key, by core/__tests__/design-tokens.test.ts — change
      // one and that test names the other. `bodyMedium`/`captionMedium` have
      // no entry of their own on purpose: they differ from `body`/`caption`
      // by weight only, so they are spelled `text-body font-medium` and
      // `text-caption font-medium`.
      fontSize: {
        display: ["34px", { lineHeight: "40px" }],
        h1: ["28px", { lineHeight: "34px" }],
        h2: ["24px", { lineHeight: "30px" }],
        h3: ["20px", { lineHeight: "26px" }],
        h4: ["18px", { lineHeight: "24px" }],
        "body-lg": ["16px", { lineHeight: "24px" }],
        body: ["15px", { lineHeight: "22px" }],
        label: ["14px", { lineHeight: "20px" }],
        caption: ["13px", { lineHeight: "18px" }],
        overline: ["11px", { lineHeight: "14px" }],
        tiny: ["11px", { lineHeight: "14px" }],
      },
      // Radius hierarchy — mirrors utils/design-tokens.ts `borderRadius` exactly
      // (see that file's doc comment for the per-tier rationale). `2xl`/`3xl`
      // moved from 20/28 to 18/26 (feature cards / hero surfaces); every other
      // key is unchanged.
      borderRadius: {
        xs: "6px",
        sm: "8px",
        md: "10px",
        lg: "12px",
        xl: "16px",
        "2xl": "18px",
        "3xl": "26px",
        full: "9999px",
      },
      // Lexend, not Inter (docs/02 §2.1 binding convention: weight lives in the
      // family name). Loaded in app/_layout.tsx via useFonts — these class names
      // must match those exact exported identifiers from @expo-google-fonts/lexend.
      // Inter stays installed (package.json) but is no longer loaded or referenced.
      fontFamily: {
        sans: ["Lexend_400Regular"],
        medium: ["Lexend_500Medium"],
        semibold: ["Lexend_600SemiBold"],
        bold: ["Lexend_700Bold"],
      },
      spacing: {
        18: "72px",
        22: "88px",
        // The grouping step, mirroring `spacing.group` in design-tokens.ts.
        // `mt-group` is the 18px break BETWEEN groups in a card stack; the
        // tight rhythm within a group stays on the 4px grid at `gap-2`.
        group: "18px",
      },
      // Also mirrored from `typography` (its `letterSpacing` field). `wide`
      // is the `overline` tracking, `tiny-wide` is `tiny`'s. Body-size styles
      // sit at 0 and need no class.
      letterSpacing: {
        "tight-display": "-0.8px",
        "tight-h1": "-0.6px",
        "tight-h2": "-0.4px",
        "tight-h3": "-0.2px",
        "tight-h4": "-0.1px",
        wide: "0.6px",
        "tiny-wide": "0.2px",
      },
    },
  },
  plugins: [],
};
