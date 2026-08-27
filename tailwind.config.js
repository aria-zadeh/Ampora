/** @type {import('tailwindcss').Config} */

// Every colour resolves through a CSS variable defined in global.css, so a
// class like `bg-canvas` or `text-neutral-900` is correct in BOTH themes with
// no `dark:` variant at the call site. See global.css for the role mapping and
// utils/design-tokens.ts for the extracted values and their [E]/[I]/[F] tags.
const v = (name) => `rgb(var(--${name}) / <alpha-value>)`;

module.exports = {
  content: ["./app/**/*.{js,jsx,ts,tsx}", "./components/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // `white` is remapped to the card surface on purpose: 148 `bg-white`
        // call sites mean "card", not "literal white", and this makes every
        // one of them theme-correct untouched. `black` is deliberately NOT
        // remapped — `bg-black/40` scrims must stay black in both themes.
        // Use `pure-white` / `pure-black` when a literal is genuinely meant
        // (e.g. a toggle knob on the accent fill).
        white: v("color-surface"),
        pure: {
          white: "#FFFFFF",
          black: "#000000",
        },

        // Semantic names — prefer these in all new and migrated code.
        canvas: v("color-canvas"),
        surface: v("color-surface"),
        raised: v("color-raised"),
        "surface-ghost": v("color-surface-ghost"),
        "surface-hairline": v("color-surface-hairline"),
        line: v("color-line"),
        "line-strong": v("color-line-strong"),
        ink: {
          DEFAULT: v("color-ink"),
          strong: v("color-ink-strong"),
          secondary: v("color-ink-secondary"),
          muted: v("color-ink-muted"),
          disabled: v("color-ink-disabled"),
        },

        // Role-mapped neutral ramp (see global.css). Step 900 is always
        // primary text, 100 is always canvas, 200 is always border.
        neutral: {
          0: v("neutral-0"),
          50: v("neutral-50"),
          100: v("neutral-100"),
          200: v("neutral-200"),
          300: v("neutral-300"),
          400: v("neutral-400"),
          500: v("neutral-500"),
          600: v("neutral-600"),
          700: v("neutral-700"),
          800: v("neutral-800"),
          900: v("neutral-900"),
          950: v("neutral-950"),
        },

        // The single general interactive accent.
        primary: {
          50: v("primary-wash"),
          100: v("primary-wash"),
          200: v("primary-wash-strong"),
          300: v("primary-dark"),
          400: v("primary-light"),
          500: v("primary"),
          600: v("primary"),
          700: v("primary-dark"),
          800: v("primary-dark"),
          900: v("primary-dark"),
          foreground: v("primary-fg"),
        },
        success: {
          100: v("success-wash"),
          500: v("success"),
          600: v("success"),
          700: v("success-strong"),
        },
        warning: {
          100: v("warning-wash"),
          500: v("warning"),
          600: v("warning"),
          700: v("warning-strong"),
        },
        danger: {
          100: v("danger-wash"),
          500: v("danger"),
          600: v("danger"),
          700: v("danger-strong"),
        },
        // AI / smart / Projects ONLY. Never a second general accent.
        accent: {
          100: v("accent-wash"),
          500: v("accent"),
          600: v("accent"),
          700: v("accent-strong"),
        },
      },

      // MIRROR OF utils/design-tokens.ts `typography`. That object is the
      // scale of record; this block is how screens consume it. The two are
      // asserted equal, key for key, by core/__tests__/design-tokens.test.ts.
      // Every size is [E] measured off the Figma PDF text matrices.
      // `bodyMedium`/`captionMedium` have no entry of their own on purpose:
      // they differ from `body`/`caption` by weight only.
      fontSize: {
        display: ["54px", { lineHeight: "60px" }],
        h1: ["28px", { lineHeight: "34px" }],
        h2: ["22px", { lineHeight: "28px" }],
        h3: ["20px", { lineHeight: "26px" }],
        h4: ["18px", { lineHeight: "24px" }],
        "body-lg": ["16px", { lineHeight: "22px" }],
        body: ["15px", { lineHeight: "21px" }],
        label: ["14px", { lineHeight: "20px" }],
        caption: ["13px", { lineHeight: "18px" }],
        meta: ["12px", { lineHeight: "16px" }],
        overline: ["11px", { lineHeight: "15px" }],
        tiny: ["11px", { lineHeight: "15px" }],
        micro: ["9px", { lineHeight: "12px" }],
      },

      // Radius ladder — mirrors utils/design-tokens.ts `borderRadius`, all [E]
      // from corner-arc geometry. 16 is the dominant card/sheet radius (x44),
      // 12 buttons (x22), 8 chips/inputs (x28).
      borderRadius: {
        xxs: "2px",
        xs: "4px",
        sm: "6px",
        md: "8px",
        tile: "10px",
        lg: "12px",
        xl: "16px",
        "2xl": "18px",
        "3xl": "20px",
        sheet: "24px",
        full: "9999px",
      },

      // Outfit (docs/02 §2.1: weight lives in the family name). Loaded in
      // app/_layout.tsx via useFonts — these must match the exact exported
      // identifiers from @expo-google-fonts/outfit.
      fontFamily: {
        sans: ["Outfit_400Regular"],
        medium: ["Outfit_500Medium"],
        semibold: ["Outfit_600SemiBold"],
        bold: ["Outfit_700Bold"],
      },

      spacing: {
        // 3px hairline (a mini progress-fill bar thickness) — not on the
        // default Tailwind scale (which has 0.5 = 2px, 1 = 4px), added here
        // per the "add it to the scale, don't inline it" rule.
        0.75: "3px",
        13: "52px", // primary/large button height (docs/02 button ladder 36/44/52)
        18: "72px", // [E] measured card height
        19: "76px", // [E] measured profile avatar
        21: "84px", // [E] measured card pitch (72 + 12)
        22: "88px",
        // Kept so existing `mt-group` call sites resolve. The measured
        // rhythm is 12 (`gap-3`) within a stack and 24 between sections.
        group: "16px",
      },

      // Off-grid reading-width caps that appeared as arbitrary `max-w-[Npx]`
      // brackets during the screen migration (contract rule 2: add the exact
      // measured value here instead of inlining it). Same numeric-key-as-px
      // convention as `spacing` above.
      maxWidth: {
        180: "180px",
        260: "260px",
        280: "280px",
        300: "300px",
        330: "330px",
        360: "360px",
      },

      // Letter-spacing measured EXACTLY 0 on all 241 text runs across the
      // nine source screens, headings included. These keys are retained at 0
      // so existing `tracking-tight-h1` call sites resolve to the measured
      // value instead of failing to compile; prefer omitting them entirely.
      letterSpacing: {
        "tight-display": "0px",
        "tight-h1": "0px",
        "tight-h2": "0px",
        "tight-h3": "0px",
        "tight-h4": "0px",
        wide: "0px",
        "tiny-wide": "0px",
      },

      // The source design has no shadows at all — depth is carried by the
      // surface ladder. `shadow-*` classes resolve to nothing.
      boxShadow: {
        none: "none",
        xs: "none",
        sm: "none",
        md: "none",
        lg: "none",
        xl: "none",
      },
    },
  },
  plugins: [],
};
