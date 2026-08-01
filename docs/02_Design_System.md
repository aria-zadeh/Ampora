# Ampora Design System

A complete, agent-executable design specification for a React Native (Expo) app. Extracted from the reference screenshots: a clean, neutral-dominant SaaS aesthetic with white surfaces, near-black ink, soft rounded geometry, restrained shadows, and a small set of semantic accent colors used only to carry meaning.

This document is the single source of truth. An agent should be able to read this file and rewrite an entire app's styling to match. Every value below is exact and intended to be used verbatim. The `theme.ts` block in the Design Tokens section is the canonical implementation. Everything else explains how to apply it.

---

## 0. Design Philosophy

**The feeling:** calm, organized, professional, fast. Nothing shouts. The interface gets out of the way and the content leads. Color is rationed, whitespace is generous, motion is quiet and purposeful.

**Five rules that govern every decision:**

1. **Neutrals do the work.** 90% of any screen is white, off-white, gray, and near-black ink. Accent color appears only when it means something (a state, a category, an action).
2. **One focal point per screen.** There is always exactly one primary action and it is the most visually prominent element. Everything else recedes.
3. **Soft, not sharp.** Rounded corners everywhere (12-16px on containers), gentle low-opacity shadows, no hard black hairlines. The mood is approachable.
4. **Predictable structure.** The same component looks and behaves the same everywhere. No surprises, no novel layouts per screen. Consistency reduces cognitive load.
5. **Motion confirms, never decorates.** Animation exists to acknowledge a tap, show a transition, or reveal completion. It is short, eased, and never competes for attention.

**ADHD-friendly is a first-class constraint, not an afterthought.** See Section 9. In short: low visual noise, strong and obvious CTAs, color-coding for categories, large touch targets, progressive disclosure, immediate feedback, and calm motion.

---

## 1. Color Palette

The system uses a neutral spine (Zinc-family grays) plus five semantic accent ramps. Each ramp runs 50 (lightest tint) to 900 (darkest). In practice you rarely need every step, but the full ramp is defined so an agent never has to guess an in-between shade.

### 1.1 Neutrals (the spine)

These carry text, surfaces, borders, and the app chrome. This is where most of the UI lives.

| Token | Hex | Usage |
|---|---|---|
| `neutral.0` | `#FFFFFF` | Card surfaces, sheets, primary content backgrounds, input fields |
| `neutral.50` | `#FAFAFA` | Subtle raised surface, hover fill, secondary section background |
| `neutral.100` | `#F4F4F5` | App canvas / screen background, the soft gray behind cards |
| `neutral.200` | `#E4E4E7` | Default borders, dividers, card outlines, input borders |
| `neutral.300` | `#D4D4D8` | Stronger borders, disabled control fill, slider track |
| `neutral.400` | `#A1A1AA` | Placeholder text, disabled text, inactive icons |
| `neutral.500` | `#71717A` | Secondary / muted body text, captions, helper text |
| `neutral.600` | `#52525B` | Body text on light surfaces (default reading color) |
| `neutral.700` | `#3F3F46` | Strong body text, secondary headings |
| `neutral.800` | `#27272A` | Headings |
| `neutral.900` | `#18181B` | Primary ink: titles, primary buttons, highest-emphasis text |
| `neutral.950` | `#09090B` | True near-black for max contrast moments (rare) |

> **Ink note:** Primary text and the black primary button use `#18181B`, not pure `#000000`. Pure black is reserved for nothing. Softened black reads as intentional and reduces harsh contrast strain.

### 1.2 Primary / Blue (actions, links, focus, save)

The interactive brand color. Used for the main "do it" actions when they are not the black primary button (for example the `Add node` button and the save control), for links, for selection, and for focus rings.

| Token | Hex | Usage |
|---|---|---|
| `primary.50` | `#EFF6FF` | Selected row tint, focus halo background, info surface |
| `primary.100` | `#DBEAFE` | Selected/active soft fill, info badge background |
| `primary.200` | `#BFDBFE` | Hover on tinted elements |
| `primary.300` | `#93C5FD` | Disabled-but-colored, decorative |
| `primary.400` | `#60A5FA` | Secondary blue, icon accents |
| `primary.500` | `#3B82F6` | Default blue (links, active icons, focus ring) |
| `primary.600` | `#2563EB` | **Primary action fill** (filled blue buttons, save) |
| `primary.700` | `#1D4ED8` | Pressed state of blue buttons |
| `primary.800` | `#1E40AF` | Deep accent |
| `primary.900` | `#1E3A8A` | Text on very light blue surfaces |

### 1.3 Success / Green (start, completed, run, positive)

Reserved for positive states and "begin/run" affordances. Seen on the START node, the green run button, the `COMPLETED` badges, and active toggles.

| Token | Hex | Usage |
|---|---|---|
| `success.50` | `#F0FDF4` | Success surface, completed-row tint |
| `success.100` | `#DCFCE7` | **Completed/success badge background** |
| `success.200` | `#BBF7D0` | Soft success fill, toggle-on hover |
| `success.300` | `#86EFAC` | Decorative |
| `success.400` | `#4ADE80` | Green icon accents |
| `success.500` | `#22C55E` | **Default green** (toggle-on track, run button, success icon) |
| `success.600` | `#16A34A` | **Success badge text**, pressed green |
| `success.700` | `#15803D` | Deep success text |
| `success.800` | `#166534` | Text on light green |
| `success.900` | `#14532D` | — |

### 1.4 Warning / Orange (classify, attention, in-progress caution)

Used for the CLASSIFIER node, caution states, and attention without alarm.

| Token | Hex | Usage |
|---|---|---|
| `warning.50` | `#FFF7ED` | Warning surface tint |
| `warning.100` | `#FFEDD5` | Warning badge background |
| `warning.200` | `#FED7AA` | Soft fill (calendar-style event blocks) |
| `warning.300` | `#FDBA74` | Decorative |
| `warning.400` | `#FB923C` | Orange icon accents, connector handles |
| `warning.500` | `#F97316` | **Default orange** (classifier icon, caution) |
| `warning.600` | `#EA580C` | Warning text, pressed |
| `warning.700` | `#C2410C` | Deep warning text |
| `warning.800` | `#9A3412` | — |
| `warning.900` | `#7C2D12` | — |

### 1.5 Accent / Purple (routing, special, premium)

Used for the ROUTER node and "special / smart" affordances. Use sparingly so it stays meaningful.

| Token | Hex | Usage |
|---|---|---|
| `accent.50` | `#F5F3FF` | Accent surface tint |
| `accent.100` | `#EDE9FE` | **Accent badge background** |
| `accent.200` | `#DDD6FE` | Soft fill |
| `accent.300` | `#C4B5FD` | Decorative |
| `accent.400` | `#A78BFA` | Purple icon accents |
| `accent.500` | `#8B5CF6` | **Default purple** (router icon, special action) |
| `accent.600` | `#7C3AED` | **Accent text**, pressed |
| `accent.700` | `#6D28D9` | Deep accent text |
| `accent.800` | `#5B21B6` | — |
| `accent.900` | `#4C1D95` | — |

### 1.6 Supporting hues (categorical color-coding)

Used only for categorization (calendar events, tags, multi-category lists), never for actions. These give ADHD users a fast visual sort without adding action ambiguity.

| Token | Hex | Usage |
|---|---|---|
| `amber.400` | `#FBBF24` | Star ratings, highlights, "favorite" |
| `amber.500` | `#F59E0B` | Stronger amber accent |
| `amber.100` | `#FEF3C7` | Amber/yellow event block background |
| `pink.400` | `#F472B6` | Category color |
| `pink.100` | `#FCE7F3` | Pink event block background |
| `teal.500` | `#14B8A6` | Category color |
| `teal.100` | `#CCFBF1` | Teal event block background |
| `red.500` | `#EF4444` | Destructive accent: icons, borders, error text on white |
| `red.600` | `#DC2626` | **Destructive button fill** (white label passes AA at 4.83:1) |
| `red.700` | `#B91C1C` | Destructive pressed, error badge text on `red.100` |
| `red.100` | `#FEE2E2` | Error badge / error field background |

> **Contrast-verified (WCAG AA).** Every foreground/background pair in this system was checked. Two rules came out of it and are applied throughout: (1) a filled button carrying a **white text label** uses the darker step (success `#15803D`, destructive `#DC2626`) because the mid 500 greens/reds fail 4.5:1 against white; the 500 shades stay as accents, icon fills, dots, and toggle tracks. (2) **Badge text uses the 700 step** on a `.100` background, not 600, so 11-13px badge text clears 4.5:1.

### 1.7 Semantic aliases (use these in components, not raw ramps)

Components should reference semantic names, not raw color steps. This makes a future theme change a one-line edit.

| Alias | Value | Meaning |
|---|---|---|
| `bg.canvas` | `neutral.100` `#F4F4F5` | The screen behind everything |
| `bg.surface` | `neutral.0` `#FFFFFF` | Cards, sheets, inputs |
| `bg.surfaceAlt` | `neutral.50` `#FAFAFA` | Raised/secondary surface, hover |
| `bg.sunken` | `neutral.100` `#F4F4F5` | Inset wells, search bars on white |
| `border.default` | `neutral.200` `#E4E4E7` | Standard 1px border |
| `border.strong` | `neutral.300` `#D4D4D8` | Emphasized border |
| `border.focus` | `primary.500` `#3B82F6` | Focused input outline |
| `text.primary` | `neutral.900` `#18181B` | Titles, key labels |
| `text.secondary` | `neutral.600` `#52525B` | Default body. Safe on white (7.7:1) and on the gray canvas (7:1) |
| `text.tertiary` | `neutral.500` `#71717A` | Captions, helper. Use **on white only** (4.8:1). On the gray canvas it dips to 4.4:1, so use `text.secondary` for helper text sitting directly on the canvas |
| `text.disabled` | `neutral.400` `#A1A1AA` | Disabled, placeholder. Intentionally low contrast (2.6:1); WCAG exempts disabled controls, so this is deliberate, not a violation |
| `text.inverse` | `neutral.0` `#FFFFFF` | Text on dark/colored fills |
| `text.link` | `primary.600` `#2563EB` | Links (5.2:1 on white) |
| `action.primary` | `neutral.900` `#18181B` | Black primary button fill (white label 17.7:1) |
| `action.primaryBlue` | `primary.600` `#2563EB` | Blue primary button fill (white label 5.2:1) |
| `action.success` | `success.700` `#15803D` | **Green button fill with white label** (5:1). The brand/accent green stays `success.500` `#22C55E` for toggle tracks, dots, and icon fills |
| `action.destructive` | `red.600` `#DC2626` | Delete / irreversible, white label (4.8:1) |

### 1.8 Dark mode (optional, supported)

If the app ships dark mode, invert the spine. The accent ramps stay the same hex values but step lighter for legibility on dark surfaces (use the 400 step where you used 600 on light).

| Alias | Light | Dark |
|---|---|---|
| `bg.canvas` | `#F4F4F5` | `#09090B` |
| `bg.surface` | `#FFFFFF` | `#18181B` |
| `bg.surfaceAlt` | `#FAFAFA` | `#27272A` |
| `border.default` | `#E4E4E7` | `#27272A` |
| `text.primary` | `#18181B` | `#FAFAFA` |
| `text.secondary` | `#52525B` | `#A1A1AA` |
| `text.tertiary` | `#71717A` | `#71717A` |
| `action.primary` | `#18181B` | `#FAFAFA` (black-on-light becomes white-on-dark) |
| `primary` (action) | `#2563EB` | `#3B82F6` |
| `success` | `#22C55E` | `#4ADE80` |

> **Dark mode contrast notes (verified).** Primary `#FAFAFA` (17:1) and secondary `#A1A1AA` (6.9:1) on the `#18181B` surface both clear AA body. Tertiary `#71717A` lands at 3.7:1, which meets the 3:1 bar for secondary-tier/caption text but not the 4.5:1 body bar, so do not use tertiary for primary reading text in dark mode. Borders (`#27272A` on `#18181B`) are intentionally subtle separators and are not relied on to convey state, so they sit below the 3:1 UI-component threshold by design.

---

## 2. Typography

### 2.1 Font family

The reference uses a tight, modern geometric sans for headings (heavy weight, slightly negative tracking) and a clean neutral sans for UI and body. For Expo, the exact, reliable match is the **Inter** family, which is purpose-built for screens and ships as a maintained Expo Google Fonts package.

- **Display / Headings:** `Inter` at weights 600/700 with tightened letter spacing (this reproduces the condensed, confident headline look). Optional upgrade: `Inter Tight` for headings if you want the tracking even snugger.
- **Body / UI:** `Inter` at 400/500.
- **Numeric / data (token counts, timers, metrics):** `Inter` with tabular figures enabled, or `JetBrains Mono` / `Geist Mono` for monospaced data readouts if desired.

> Do not mix in system fonts. Load Inter explicitly so iOS and Android render identically.

**Expo install:**

```bash
npx expo install @expo-google-fonts/inter expo-font expo-splash-screen
```

```tsx
import {
  useFonts,
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from '@expo-google-fonts/inter';

const [loaded] = useFonts({
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
});
```

Map weights to named families (React Native does not reliably combine `fontFamily` + numeric `fontWeight` across platforms, so bind the exact weight into the family name):

| Role | fontFamily |
|---|---|
| Regular (400) | `Inter_400Regular` |
| Medium (500) | `Inter_500Medium` |
| SemiBold (600) | `Inter_600SemiBold` |
| Bold (700) | `Inter_700Bold` |

### 2.2 Type scale (mobile-tuned)

Sizes are in `px` (React Native uses density-independent points, so these map 1:1 to `fontSize`). Line heights are absolute `px` values (React Native `lineHeight` is absolute, not a multiplier). Letter spacing is in `px` (React Native `letterSpacing` is absolute).

| Style | Size | Line height | Weight (family) | Letter spacing | Use |
|---|---|---|---|---|---|
| `display` | 34 | 40 | 700 `Inter_700Bold` | -0.8 | Hero / onboarding headline |
| `h1` | 28 | 34 | 700 `Inter_700Bold` | -0.6 | Screen title |
| `h2` | 24 | 30 | 600 `Inter_600SemiBold` | -0.4 | Section title |
| `h3` | 20 | 26 | 600 `Inter_600SemiBold` | -0.2 | Card title, subsection |
| `h4` | 18 | 24 | 600 `Inter_600SemiBold` | -0.1 | Group label, list header |
| `bodyLg` | 16 | 24 | 400 `Inter_400Regular` | 0 | Primary reading text |
| `body` | 15 | 22 | 400 `Inter_400Regular` | 0 | Default UI text |
| `bodyMedium` | 15 | 22 | 500 `Inter_500Medium` | 0 | Emphasized body, list item title |
| `label` | 14 | 20 | 500 `Inter_500Medium` | 0 | Buttons, form labels, tabs |
| `caption` | 13 | 18 | 400 `Inter_400Regular` | 0 | Helper text, metadata |
| `captionMedium` | 13 | 18 | 500 `Inter_500Medium` | 0 | Badge text, small emphasis |
| `overline` | 11 | 14 | 600 `Inter_600SemiBold` | 0.6 (uppercase) | Eyebrow labels, node-type tags |
| `tiny` | 11 | 14 | 500 `Inter_500Medium` | 0.2 | Timestamps, counters |

**Rules:**

- Headings (`h1`-`h4`, `display`) always use negative tracking. That tight spacing is the single most important detail that reproduces the reference headline look.
- Body never goes below 15 for primary content and never below 13 for any readable text. (Touch-app legibility floor.)
- Use `overline` uppercased for the small category tags seen on nodes (`AI WORKER`, `EVALUATION WORKER`, `INPUT SOURCES`). Apply `textTransform: 'uppercase'`.
- Enable tabular numbers for any column of numbers (`fontVariant: ['tabular-nums']`) so counters and metrics do not jitter.

### 2.3 Text color pairing

| Element | Color token |
|---|---|
| Screen/card titles | `text.primary` `#18181B` |
| Body copy | `text.secondary` `#52525B` |
| Helper / metadata / captions | `text.tertiary` `#71717A` |
| Placeholder / disabled | `text.disabled` `#A1A1AA` |
| Links / interactive text | `text.link` `#2563EB` |
| Text on black/colored buttons | `text.inverse` `#FFFFFF` |

---

## 3. Spacing System

### 3.1 Base unit

**4px base grid.** All spacing, padding, and gaps are multiples of 4, with 8 as the most common rhythm. This is the standard that keeps every edge aligned.

| Token | px | Typical use |
|---|---|---|
| `space.0` | 0 | Reset |
| `space.1` | 4 | Icon-to-label micro gap, tight inner padding |
| `space.2` | 8 | Default small gap, chip padding, between stacked labels |
| `space.3` | 12 | Compact card padding, gap between related items |
| `space.4` | 16 | **Default padding** (screen edges, card interior), standard gap |
| `space.5` | 20 | Comfortable card padding |
| `space.6` | 24 | Section padding, gap between cards |
| `space.8` | 32 | Between major sections |
| `space.10` | 40 | Large section break |
| `space.12` | 48 | Hero vertical padding |
| `space.16` | 64 | Page-level top/bottom breathing room |

### 3.2 Layout constants

| Constant | Value | Notes |
|---|---|---|
| Screen horizontal padding | `16` (`space.4`) | Standard left/right gutter on phones |
| Screen horizontal padding (large phones/tablet) | `24` (`space.6`) | Optional responsive bump at width ≥ 600 |
| Max content width | `560` | Center content on wide screens; never let text lines run full-width on tablets |
| Card interior padding | `16`-`20` | `16` for dense cards, `20` for feature cards |
| Gap between cards in a list | `12` | `space.3` |
| Gap between sections | `24`-`32` | `space.6` to `space.8` |
| List row vertical padding | `12`-`14` | Keeps row height ≥ 48 |
| Section header bottom margin | `12` | Between an `h4`/`overline` and its content |

### 3.3 Grid

- Single-column by default on phones. Content is a vertical stack of full-width cards and sections.
- Two-column card grids (like the feature cards) only at width ≥ 600, with a `12`-`16px` gutter.
- Everything aligns to the 4px grid. There are no arbitrary offsets.

---

## 4. Border Radius

Soft, rounded geometry is core to the brand. Nothing has sharp 0 corners except full-bleed backgrounds.

| Token | px | Use |
|---|---|---|
| `radius.xs` | 6 | Small badges, tags, tiny chips |
| `radius.sm` | 8 | Inputs, small buttons, toggles-inner |
| `radius.md` | 10 | Default buttons |
| `radius.lg` | 12 | **Cards, list items, sheets (default container radius)** |
| `radius.xl` | 16 | Large feature cards, modals |
| `radius.2xl` | 20 | Hero containers, bottom sheets top corners |
| `radius.3xl` | 28 | Oversized surfaces |
| `radius.full` | 9999 | Pills, switches, avatars, circular icon buttons, status dots |

**Defaults to apply automatically:**

- Cards and list rows: `radius.lg` (12)
- Buttons: `radius.md` (10)
- Inputs / search bars: `radius.sm` (8) to `radius.md` (10)
- Badges / status pills: `radius.full` (the `COMPLETED` style pills) or `radius.xs` for square-ish tags
- Modals / bottom sheets: `radius.xl` (16) on top corners
- Avatars, switch tracks, circular FAB: `radius.full`

---

## 5. Elevation and Shadows

Shadows are **soft, low-opacity, and subtle**. The reference relies more on a 1px border + a faint shadow than on heavy drop shadows. The effect is "lifted paper," not "floating card."

React Native needs both iOS shadow props and an Android `elevation`. Define each level with all of them.

| Level | iOS shadow | Android `elevation` | Use |
|---|---|---|---|
| `shadow.none` | none | 0 | Flush elements, inputs at rest |
| `shadow.xs` | color `#18181B`, opacity `0.04`, radius `2`, offset `{0,1}` | 1 | Hairline lift, list rows on canvas |
| `shadow.sm` | color `#18181B`, opacity `0.06`, radius `8`, offset `{0,2}` | 2 | **Default card shadow** |
| `shadow.md` | color `#18181B`, opacity `0.08`, radius `16`, offset `{0,4}` | 4 | Raised cards, popovers, active drag |
| `shadow.lg` | color `#18181B`, opacity `0.10`, radius `24`, offset `{0,8}` | 8 | Modals, floating panels, menus |
| `shadow.xl` | color `#18181B`, opacity `0.12`, radius `32`, offset `{0,12}` | 12 | Bottom sheets, command palette |

**Implementation note (iOS vs Android parity):**

```tsx
// shadow.sm
{
  shadowColor: '#18181B',
  shadowOpacity: 0.06,
  shadowRadius: 8,
  shadowOffset: { width: 0, height: 2 },
  elevation: 2, // Android
}
```

**Rule:** prefer a `1px border.default` + `shadow.sm` for resting cards. Reserve `shadow.md`+ for things that are genuinely floating (menus, dragged items, modals). Over-shadowing reads cheap and adds visual noise, which hurts the ADHD-friendly goal.

---

## 6. Component Library

Every component references semantic tokens. Sizes assume a phone. Minimum touch target for any interactive element is **48 x 48** (use `hitSlop` to expand the tap area without changing the visual size when needed).

### 6.1 Buttons

Shared specs:

- Radius: `radius.md` (10)
- Height: `sm` 36, `md` 44 (default), `lg` 52
- Horizontal padding: `sm` 12, `md` 16, `lg` 20
- Text style: `label` (14 / 500), centered, never wraps
- Icon + label gap: `space.2` (8); icons 18-20px
- Press feedback: scale to `0.97` + opacity to `0.9` over 100ms (see Motion). Use `Pressable`, not `TouchableOpacity`, for state control.

| Variant | Fill | Text | Border | Pressed | Disabled |
|---|---|---|---|---|---|
| **Primary (black)** | `#18181B` | `#FFFFFF` | none | fill `#000000` / scale 0.97 | fill `neutral.300`, text `neutral.500` |
| **Primary (blue)** | `#2563EB` | `#FFFFFF` | none | fill `#1D4ED8` | fill `primary.200`, text `#FFFFFF` |
| **Success** | `#15803D` | `#FFFFFF` | none | fill `#166534` | fill `success.200`, text `success.700` |
| **Secondary (outline)** | `#FFFFFF` | `#18181B` | 1px `neutral.200` | fill `neutral.50`, border `neutral.300` | text `neutral.400`, border `neutral.200` |
| **Ghost / text** | transparent | `#2563EB` (or `#52525B`) | none | fill `neutral.100` | text `neutral.400` |
| **Destructive** | `#DC2626` | `#FFFFFF` | none | fill `#B91C1C` | fill `red.100`, text `red.600` |
| **Icon button** | transparent or `#FFFFFF` | icon `neutral.700` | optional 1px `neutral.200` | fill `neutral.100` | icon `neutral.300` |

- The single most prominent action on any screen is the **black primary** (matching `Start for free` / `Get template`) or the **blue primary** (matching `Add node` / save). Never put two filled primary buttons of equal weight on the same screen.
- The green run/confirm button (matching the play control) uses the **Success** variant, often as a circular icon button (`radius.full`, 48x48).
- Floating action button (FAB): circular, 56x56, `radius.full`, `shadow.md`, primary fill, white icon, anchored bottom-right with 16-24px inset.

### 6.2 Inputs and forms

- Background: `bg.surface` `#FFFFFF` (on canvas) or `bg.sunken` `#F4F4F5` (search bar style on white)
- Border: 1px `border.default` `#E4E4E7`
- Radius: `radius.sm` to `radius.md` (8-10)
- Height: 48 (single line); multiline grows with content
- Padding: 12 horizontal, 12-14 vertical
- Text: `bodyLg` (16 / 400) `text.primary`; placeholder `text.disabled` `#A1A1AA`. Input text is 16, not 15, on purpose: it is the readability floor and, on Expo web, iOS Safari auto-zooms when an input's font is under 16. General UI text can stay 15; input fields specifically use 16.
- Leading icon (optional): 18-20px `neutral.400`, with 8px gap (the search-bar pattern)
- **Focus state:** border becomes `border.focus` `#3B82F6`, plus a soft focus halo (a 3-4px ring using `primary.100` via an outer shadow or a wrapping View). Animate border color over 150ms.
- **Error state:** border `red.500`, helper text `red.600` (13 / 400) below the field with `space.1` gap
- **Disabled:** fill `neutral.100`, text `neutral.400`, no shadow
- Label above the field: `label` (14 / 500) `text.secondary`, `space.2` gap to input
- Helper/hint text below: `caption` (13 / 400) `text.tertiary`

**Toggle / Switch** (matching the green on/off toggles):

- Track: `radius.full`, width 48, height 28
- Off: track `neutral.300` `#D4D4D8`, knob `#FFFFFF`
- On: track `success.500` `#22C55E`, knob `#FFFFFF`
- Knob: 24px circle, `shadow.xs`, slides with a spring (see Motion)
- Use the native `Switch` styled with these colors, or a custom Reanimated switch for exact control.

**Checkbox / Radio:**

- 20x20, `radius.xs` for checkbox / `radius.full` for radio
- Unchecked: 1.5px `neutral.300` border, transparent fill
- Checked: fill `primary.600`, white check icon, border same as fill
- Min 48x48 tap target via `hitSlop`

### 6.3 Cards

The fundamental container. Everything content-bearing sits in a card.

- Background: `bg.surface` `#FFFFFF`
- Border: 1px `border.default` `#E4E4E7`
- Radius: `radius.lg` (12); feature cards `radius.xl` (16)
- Shadow: `shadow.sm` (resting). Plain list cards on a white background can use `shadow.none` + border only.
- Padding: 16 (dense) to 20 (feature)
- Internal vertical rhythm: title -> `space.2` -> body -> `space.3` -> meta/footer

**Node card pattern** (the workflow node look, reusable as a rich list item):

```
[ icon chip ] [ Title (h4 / 18 / 600) ]              [ ⋮ menu ]
              [ Subtitle (caption / 13 / tertiary) ]
[ optional body card: sunken #F4F4F5, radius.md, 12 padding ]
[ status pill ]                              [ meta: 190 TOKEN / 0.1 sec ]
```

- Icon chip: 36-40px rounded square (`radius.md`), tinted background using the category's `.100` color, icon in the category's `.600` step (green start, orange classify, purple route, blue handler). Use 600 rather than 500 so the glyph clears the 3:1 contrast bar for graphical objects on the tint.
- The inner "answer/body" block uses `bg.sunken` `#F4F4F5` with `radius.md` to nest content visually.

### 6.4 Badges and status pills

The `COMPLETED` / `IDLE` / `AI WORKER` pattern. These carry state and category at a glance, which is essential for ADHD-friendly scanning.

- Shape: `radius.full` (pill) or `radius.xs` (tag)
- Padding: 4 vertical, 8-10 horizontal
- Text: `captionMedium` (13 / 500) or `overline` (11 / 600 uppercased) for type tags
- Always soft-fill background (`.100`) + **700-step** text. The 700 step (not 600) is required so 11-13px badge text clears 4.5:1 on the tint:

| State | Background | Text | Ratio |
|---|---|---|---|
| Success / Completed | `success.100` `#DCFCE7` | `success.700` `#15803D` | 4.6:1 |
| In progress / Active | `primary.100` `#DBEAFE` | `primary.700` `#1D4ED8` | 5.5:1 |
| Idle / Neutral | `neutral.100` `#F4F4F5` | `neutral.600` `#52525B` | 7:1 |
| Warning / Caution | `warning.100` `#FFEDD5` | `warning.700` `#C2410C` | 4.5:1 |
| Special / Routing | `accent.100` `#EDE9FE` | `accent.700` `#6D28D9` | 6:1 |
| Error | `red.100` `#FEE2E2` | `red.700` `#B91C1C` | 5.3:1 |

- Status is **never conveyed by color alone.** Every pill carries a text label (and optionally a leading dot/icon), so meaning survives for colorblind users and at a glance. This is both a WCAG requirement and an ADHD-scanning win.

- A small leading status dot (8px, `radius.full`, filled with the saturated color) before the label is an optional flourish that matches the calendar/category pattern.

### 6.5 Navigation

The reference shows a sidebar of line icons. Translate this to mobile patterns:

**Bottom tab bar (primary navigation) — AS BUILT, `components/ui/SegmentedTabBar.tsx`:**

Ampora ships the "Stack" variant of this pattern (`docs/design/stack-reference.html`, decision logged in `09`): a **floating segmented pill**, not a full-width slab.

- One rounded track, `radius.full`, floating: `left`/`right` 18, `bottom` = bottom safe-area inset + 8. Height 48 (a 44px segment row + 2px padding each side).
- Background `bg.surface` `#FFFFFF`, 1px `border.default`, `shadow.lg` (it genuinely floats, so it earns the heavier tier).
- 5 segments, `flex: 1`, evenly distributed. At a 390pt width each segment is ~70x44, clearing the 44x44 minimum.
- Icon-only, 24px. There is no text label, so **every segment carries an `accessibilityLabel`** plus `accessibilityRole="tab"` and `accessibilityState={{ selected }}`.
- Active: a filled `primary.600` pill behind a `#FFFFFF` glyph (5.2:1, §12). The pill slides on `SPRINGS.tactile`, direct-assigned under reduce-motion. Active state is carried by fill and shape, not hue alone.
- Inactive: `text.tertiary` `#6F6862` (5.5:1 on white). Do not go lighter — `neutral.400` fails the 3:1 bar for UI glyphs.
- **It floats over content and reserves no layout space.** Every tab screen must reserve its own bottom clearance with `useTabBarClearance()`, and a FAB on a tab screen needs `liftAboveTabBar`.

The older full-width bar (56 + inset, 1px top border, icon + `tiny` label) is superseded and should not be reintroduced.

**Top app bar (screen header):**

- Height: 56 + top safe-area inset
- Background: `bg.canvas` or `bg.surface`; no heavy shadow, optional 1px bottom border on scroll
- Title: `h3`/`h1` `text.primary`, left-aligned (the left-aligned screen-title style from the reference headers)
- Subtitle (optional): `caption` `text.tertiary` directly under title
- Leading: back chevron (24px, `neutral.700`) or hamburger
- Trailing: 1-2 icon buttons or a single primary action (the `Add node` blue button pattern)

**Tabs (segmented, in-page):**

- The `LIST OF / PAGE` tab pattern: pill or underline tabs
- Active tab: `text.primary` with `bg.surface` pill (`radius.md`) + `shadow.xs`, on a `bg.sunken` track
- Inactive tab: `text.tertiary`, transparent

**Bottom sheet (the search/picker pattern):**

- Slides up from bottom, `radius.xl` top corners, `shadow.xl`, drag handle (36x4, `neutral.300`, `radius.full`, centered, 8px top margin)
- Backdrop: `#18181B` at 32-40% opacity, fades in over 200ms
- Use `@gorhom/bottom-sheet` for the gesture-driven version.

### 6.6 Icons

- **Library:** `lucide-react-native`. It exactly matches the thin, rounded, consistent line-icon style across all screenshots (home, brain, share, pencil, gear, chart, zoom, etc.).
- Default size: 20 (inline/buttons), 24 (navigation/standalone), 18 (dense/badges)
- Stroke width: 1.75 (lucide default 2 is slightly heavy; 1.75 matches the lighter reference look). Set globally via the `strokeWidth` prop.
- Color: inherit from context. `neutral.700` for default, `neutral.400` for inactive/secondary, category color when inside a tinted icon chip, `text.inverse` on filled buttons.
- Icon chips (the rounded-square colored icon containers): 36-40px, `radius.md`, background = category `.100`, icon = category `.500`/`.600`.

```bash
npx expo install lucide-react-native react-native-svg
```

### 6.7 Lists and list items

- Row: full-width, `bg.surface`, `radius.lg` if card-style or flush rows separated by 1px `border.default` dividers if list-style
- Min height: 56 (comfortable) / 48 (compact)
- Layout: `[leading icon/avatar] [title + subtitle stack] [trailing meta/chevron]`
- Title: `bodyMedium` (15 / 500) `text.primary`; subtitle `caption` (13 / 400) `text.tertiary`
- Trailing chevron: 20px `neutral.400`
- Press: background flashes to `neutral.50` over 100ms
- Use `FlashList` (from `@shopify/flash-list`) for long lists for performance.

### 6.8 Avatars

- Sizes: 24 (inline), 32 (list), 40 (header), 64 (profile)
- `radius.full`, 1px `border.default` ring optional
- Fallback: initials on a `neutral.200` background, `text.secondary` text

### 6.9 Empty states

ADHD-critical: never show a blank screen. Every empty state has a centered small icon (40px, `neutral.300`), a short `h4` title `text.primary`, one line of `caption` `text.tertiary`, and one primary action button.

---

## 7. Visual Patterns

### 7.1 Surface layering (depth model)

Three layers, distinguished by tone and shadow, never by heavy borders:

1. **Canvas** `#F4F4F5` (the bottom). The screen background.
2. **Surface** `#FFFFFF` + 1px border + `shadow.sm`. Cards float here.
3. **Sunken** `#F4F4F5` inside a surface. Inset wells (search bars, nested answer blocks).

A floating layer (menus, sheets, modals) sits above all three with `shadow.lg`/`shadow.xl`.

### 7.2 The dotted-grid background (signature texture)

The workflow canvases use a subtle dotted grid. Reproduce it for any canvas/board surface:

- Dot color: `neutral.300` `#D4D4D8` at ~40% opacity (effectively a very light gray)
- Dot size: 1.5px
- Spacing: 24px grid
- Implement with a tiled `react-native-svg` `Pattern`, or a repeating background image. Keep it faint; it should read as texture, not pattern.

### 7.3 Connector / flow lines (if building node UIs)

- Stroke: `neutral.300` `#D4D4D8`, 1.5-2px
- Smooth bezier curves between node anchor points
- Connection handles: 8-10px squares/circles in the category color, `radius.xs`/`radius.full`

### 7.4 Border radius summary

Covered in Section 4. Default container = 12, button = 10, input = 8-10, pill = full, modal = 16.

### 7.5 Shadow / elevation summary

Covered in Section 5. Default card = `shadow.sm`. Floating = `shadow.lg`+.

### 7.6 Interactive states (the full matrix)

Apply consistently to every interactive element:

| State | Treatment |
|---|---|
| Default | Resting tokens |
| Pressed | Scale `0.97`, opacity `0.9` (filled) or fill flashes to `neutral.50`/`neutral.100` (ghost/list). 100ms in, 150ms out. |
| Focused (inputs) | Border -> `primary.500`, soft `primary.100` halo, 150ms |
| Selected | Background -> `primary.50`, optional 1px `primary.200` border, or left accent bar `primary.500` |
| Disabled | Fill -> `neutral.300`/`neutral.100`, text/icon -> `neutral.400`, no shadow, no press feedback |
| Loading | Replace label with spinner (same color), keep size; or skeleton shimmer for content |
| Error | Border/text -> red tokens |

### 7.7 Content hierarchy principles

1. **Size and weight first, color second.** Establish hierarchy with type scale and weight before reaching for color. Color is for meaning, not emphasis.
2. **One primary action per screen**, visually dominant. Secondary actions are outline/ghost.
3. **Group with whitespace, not lines.** Prefer 24-32px gaps between sections over divider rules. Use dividers only inside dense lists.
4. **Left-align text.** Titles and body are left-aligned. Center only short standalone elements (empty states, hero, single CTAs).
5. **Progressive disclosure.** Show the essential first; reveal detail on tap (sheets, expanders). Do not crowd a screen.
6. **Consistent left edge.** All content shares the same left gutter so the eye tracks a single vertical line down the screen.

---

## 8. Motion and Animation

Motion is quiet, fast, and eased. It confirms actions and smooths transitions. It never loops, bounces aggressively, or runs more than one prominent animation at a time. **Library: `react-native-reanimated` v3** (plus `react-native-gesture-handler` for gestures, optionally `moti` for a simpler declarative API).

### 8.1 Duration tokens

| Token | ms | Use |
|---|---|---|
| `duration.instant` | 100 | Press feedback (scale/opacity) |
| `duration.fast` | 150 | Color/border transitions, small fades |
| `duration.base` | 200 | **Default** for most transitions, sheet backdrop |
| `duration.slow` | 300 | Screen/sheet entrance, larger reveals |
| `duration.slower` | 400 | Onboarding/hero orchestration only |

### 8.2 Easing

| Token | Curve | Use |
|---|---|---|
| `easing.standard` | `Easing.out(Easing.cubic)` | Entrances, most movement (decelerate) |
| `easing.accelerate` | `Easing.in(Easing.cubic)` | Exits (accelerate out) |
| `easing.inOut` | `Easing.inOut(Easing.cubic)` | Position changes that start and end on screen |
| `spring.default` | `{ damping: 18, stiffness: 220, mass: 1 }` | Toggles, knobs, playful taps, FAB |
| `spring.gentle` | `{ damping: 22, stiffness: 160, mass: 1 }` | Sheets, cards settling |

> No springy overshoot on text or layout content (it reads as jitter and is distracting for ADHD users). Reserve spring for controls and small affordances (switch knob, FAB, drag).

### 8.3 Standard motion patterns

- **Press (every button/row):** `scale 1 -> 0.97`, `opacity 1 -> 0.9` over `duration.instant`, release back over `duration.fast`. Implement with a Reanimated shared value driven by `Pressable`'s `onPressIn`/`onPressOut`.
- **Screen transition:** slide-in from right + fade for forward navigation, reverse for back. `duration.base`-`duration.slow`, `easing.standard`. (Use the navigator's native stack animations tuned to these durations.)
- **Bottom sheet:** slide up with `spring.gentle`; backdrop fades `0 -> 0.36` opacity over `duration.base`.
- **Modal / dialog:** fade + scale `0.96 -> 1` over `duration.base`, `easing.standard`.
- **List item entrance:** stagger fade + 8px upward slide, 30-40ms delay between items, capped at ~8 items so it never feels slow. Use Reanimated `entering={FadeInDown.delay(i * 35).duration(200)}`.
- **Toggle:** knob slides with `spring.default`; track color cross-fades over `duration.fast`.
- **Status change (e.g., to COMPLETED):** badge cross-fades color + a subtle scale pulse `1 -> 1.05 -> 1` over `duration.base`. This is the one celebratory beat (completion feedback) and it matters for ADHD reinforcement. Keep it to a single pulse.
- **Loading:** skeleton shimmer (a soft `neutral.100`/`neutral.200` gradient sweeping left-to-right over 1200ms) for content; inline spinner for buttons.
- **Layout changes:** wrap reflowing lists in `LinearTransition` (Reanimated layout animation) at `duration.base` so additions/removals animate smoothly instead of jumping.

- **Exit faster than enter.** Exit/dismiss animations run at roughly 60-70% of the enter duration (a 300ms enter exits in ~200ms) so dismissing feels snappy, not sluggish.
- **Never block input.** Animations stay interruptible: a tap or gesture cancels the in-progress animation immediately and the UI remains interactive throughout. No animation traps the user.

### 8.4 Reduce-motion

Respect the OS setting. Read `AccessibilityInfo.isReduceMotionEnabled()`; when true, drop slides/scale and use plain `duration.fast` fades only. This is both an accessibility requirement and an ADHD comfort feature.

---

## 9. ADHD-Friendly Design Guidelines

These are binding constraints, baked into the tokens and components above, and restated here so an agent applies them deliberately.

1. **Low visual noise.** Neutral-dominant palette, generous whitespace, max one prominent animation at a time, faint textures only. Never fill a screen edge to edge with content.
2. **One clear next action.** Every screen has a single, obvious primary button. The user should never have to hunt for "what do I do here."
3. **Strong, obvious CTAs.** High contrast (black or saturated fill, white text), large (≥44 height), generous tap targets (≥48x48 hit area).
4. **Color-coding for categories, consistently.** A category color always means the same thing (green = start/done, blue = action/active, orange = attention, purple = routing/smart, red = destructive). This lets users sort visually without reading.
5. **Chunk and disclose progressively.** Group related items into cards with clear headers. Hide secondary detail behind taps (sheets, expanders). Short lists over long ones; pagination/sections over endless scroll.
6. **Immediate, unambiguous feedback.** Every tap responds within 100ms (press animation). Every state change is visible (badges, color, the completion pulse). Never leave the user wondering if something registered.
7. **Predictable, repeated patterns.** The same component looks and acts identically everywhere. No per-screen reinvention. Familiarity lowers cognitive load.
8. **Calm, non-jarring motion.** Short, eased, single-focus. No autoplay loops, no aggressive bounce, no motion that pulls the eye away from the task. Honor reduce-motion.
9. **Legible by default.** Body ≥15px (inputs 16px), captions ≥13px. WCAG AA throughout: 4.5:1 for body and small text, 3:1 for large text (≥18px) and UI glyphs. Every pair in this doc is verified. `text.secondary` is the safe body color on both white and the gray canvas; reserve `text.tertiary` for white surfaces only, and never put either tertiary or low-step accents on a colored fill.
10. **Progress and completion visible.** Use progress indicators, step counters, and the completion pulse so users get a sense of momentum and closure (the dopamine of "done").
11. **Forgiving and reversible.** Confirm destructive actions, offer undo (toast with action), never trap the user. Reduce the cost of mistakes.
12. **Respect focus.** Avoid badges/notifications that demand attention unless truly necessary. Quiet by default.
13. **Label everything for assistive tech.** Every icon-only control gets an `accessibilityLabel` (and an `accessibilityHint` when the action is not obvious). Set `accessibilityRole` and announce state (`selected`, `disabled`, `expanded`, `busy`) so the screen-reader order matches the visual order.
14. **Support Dynamic Type.** Allow OS text scaling. Use flexible heights and wrapping, not fixed heights with clipped text, so layouts survive larger type. Do not hard-disable scaling. Test at the largest accessibility text size.
15. **Light, purposeful haptics.** A subtle `Haptics.selectionAsync()` on toggles/selection and `notificationAsync(Success)` on a completed action reinforces feedback for ADHD users. Use sparingly; never on every tap.
16. **One primary gesture per region, with a visible fallback.** Never make a critical action gesture-only. Anything reachable by swipe (delete, archive) also has a visible control, and drag uses a movement threshold so it does not fire by accident.

---

## 10. Design Tokens (canonical `theme.ts`)

This is the implementation source of truth. Drop it in at `src/theme/theme.ts` (or similar) and reference it everywhere. Nothing in the app should hard-code a hex value, a radius, or a spacing number; all values come from here.

```ts
// theme.ts — canonical design tokens for the Ampora design system (React Native / Expo)

export const palette = {
  neutral: {
    0:   '#FFFFFF',
    50:  '#FAFAFA',
    100: '#F4F4F5',
    200: '#E4E4E7',
    300: '#D4D4D8',
    400: '#A1A1AA',
    500: '#71717A',
    600: '#52525B',
    700: '#3F3F46',
    800: '#27272A',
    900: '#18181B',
    950: '#09090B',
  },
  primary: { // blue
    50:  '#EFF6FF',
    100: '#DBEAFE',
    200: '#BFDBFE',
    300: '#93C5FD',
    400: '#60A5FA',
    500: '#3B82F6',
    600: '#2563EB',
    700: '#1D4ED8',
    800: '#1E40AF',
    900: '#1E3A8A',
  },
  success: { // green
    50:  '#F0FDF4',
    100: '#DCFCE7',
    200: '#BBF7D0',
    300: '#86EFAC',
    400: '#4ADE80',
    500: '#22C55E',
    600: '#16A34A',
    700: '#15803D',
    800: '#166534',
    900: '#14532D',
  },
  warning: { // orange
    50:  '#FFF7ED',
    100: '#FFEDD5',
    200: '#FED7AA',
    300: '#FDBA74',
    400: '#FB923C',
    500: '#F97316',
    600: '#EA580C',
    700: '#C2410C',
    800: '#9A3412',
    900: '#7C2D12',
  },
  accent: { // purple
    50:  '#F5F3FF',
    100: '#EDE9FE',
    200: '#DDD6FE',
    300: '#C4B5FD',
    400: '#A78BFA',
    500: '#8B5CF6',
    600: '#7C3AED',
    700: '#6D28D9',
    800: '#5B21B6',
    900: '#4C1D95',
  },
  red: { 100: '#FEE2E2', 500: '#EF4444', 600: '#DC2626', 700: '#B91C1C' },
  amber: { 100: '#FEF3C7', 400: '#FBBF24', 500: '#F59E0B' },
  pink: { 100: '#FCE7F3', 400: '#F472B6' },
  teal: { 100: '#CCFBF1', 500: '#14B8A6' },
} as const;

export const colors = {
  bg: {
    canvas:     palette.neutral[100],
    surface:    palette.neutral[0],
    surfaceAlt: palette.neutral[50],
    sunken:     palette.neutral[100],
    backdrop:   'rgba(24,24,27,0.36)',
  },
  border: {
    default: palette.neutral[200],
    strong:  palette.neutral[300],
    focus:   palette.primary[500],
  },
  text: {
    primary:   palette.neutral[900],
    secondary: palette.neutral[600],
    tertiary:  palette.neutral[500],
    disabled:  palette.neutral[400],
    inverse:   palette.neutral[0],
    link:      palette.primary[600],
  },
  action: {
    primary:       palette.neutral[900], // black button, white label 17.7:1
    primaryPress:  palette.neutral[950],
    primaryBlue:   palette.primary[600],  // white label 5.2:1
    primaryBluePress: palette.primary[700],
    success:       palette.success[700],  // green button fill w/ white label 5:1 (NOT 500)
    successPress:  palette.success[800],
    successAccent: palette.success[500],  // brand green for toggles/dots/icons (no white text on it)
    destructive:   palette.red[600],      // white label 4.8:1 (NOT 500)
    destructivePress: palette.red[700],
    destructiveAccent: palette.red[500],  // red for icons/borders/error text on white
  },
  status: { // badge text uses the 700 step so 11-13px text clears 4.5:1 on the .100 tint
    successBg: palette.success[100], successFg: palette.success[700],
    activeBg:  palette.primary[100],  activeFg:  palette.primary[700],
    idleBg:    palette.neutral[100],  idleFg:    palette.neutral[600],
    warnBg:    palette.warning[100],  warnFg:    palette.warning[700],
    routeBg:   palette.accent[100],   routeFg:   palette.accent[700],
    errorBg:   palette.red[100],      errorFg:   palette.red[700],
  },
  category: { // icon-chip glyphs use the 600 step to clear the 3:1 bar on the tint
    start:   { bg: palette.success[100], fg: palette.success[600] },
    classify:{ bg: palette.warning[100], fg: palette.warning[600] },
    route:   { bg: palette.accent[100],  fg: palette.accent[600] },
    handle:  { bg: palette.primary[100], fg: palette.primary[600] },
  },
} as const;

export const spacing = {
  0: 0, 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 8: 32, 10: 40, 12: 48, 16: 64,
} as const;

export const radius = {
  xs: 6, sm: 8, md: 10, lg: 12, xl: 16, '2xl': 20, '3xl': 28, full: 9999,
} as const;

export const layout = {
  screenPaddingX: 16,
  screenPaddingXLarge: 24,
  maxContentWidth: 560,
  cardPadding: 16,
  cardPaddingLg: 20,
  cardGap: 12,
  sectionGap: 24,
  minTouchTarget: 48,
  tabBarHeight: 56,
  appBarHeight: 56,
} as const;

export const fonts = {
  regular:  'Inter_400Regular',
  medium:   'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold:     'Inter_700Bold',
} as const;

export const typography = {
  display:       { fontFamily: fonts.bold,     fontSize: 34, lineHeight: 40, letterSpacing: -0.8 },
  h1:            { fontFamily: fonts.bold,     fontSize: 28, lineHeight: 34, letterSpacing: -0.6 },
  h2:            { fontFamily: fonts.semibold, fontSize: 24, lineHeight: 30, letterSpacing: -0.4 },
  h3:            { fontFamily: fonts.semibold, fontSize: 20, lineHeight: 26, letterSpacing: -0.2 },
  h4:            { fontFamily: fonts.semibold, fontSize: 18, lineHeight: 24, letterSpacing: -0.1 },
  bodyLg:        { fontFamily: fonts.regular,  fontSize: 16, lineHeight: 24, letterSpacing: 0 },
  body:          { fontFamily: fonts.regular,  fontSize: 15, lineHeight: 22, letterSpacing: 0 },
  bodyMedium:    { fontFamily: fonts.medium,   fontSize: 15, lineHeight: 22, letterSpacing: 0 },
  label:         { fontFamily: fonts.medium,   fontSize: 14, lineHeight: 20, letterSpacing: 0 },
  caption:       { fontFamily: fonts.regular,  fontSize: 13, lineHeight: 18, letterSpacing: 0 },
  captionMedium: { fontFamily: fonts.medium,   fontSize: 13, lineHeight: 18, letterSpacing: 0 },
  overline:      { fontFamily: fonts.semibold, fontSize: 11, lineHeight: 14, letterSpacing: 0.6, textTransform: 'uppercase' as const },
  tiny:          { fontFamily: fonts.medium,   fontSize: 11, lineHeight: 14, letterSpacing: 0.2 },
} as const;

export const shadows = {
  none: {},
  xs: { shadowColor: '#18181B', shadowOpacity: 0.04, shadowRadius: 2,  shadowOffset: { width: 0, height: 1 },  elevation: 1 },
  sm: { shadowColor: '#18181B', shadowOpacity: 0.06, shadowRadius: 8,  shadowOffset: { width: 0, height: 2 },  elevation: 2 },
  md: { shadowColor: '#18181B', shadowOpacity: 0.08, shadowRadius: 16, shadowOffset: { width: 0, height: 4 },  elevation: 4 },
  lg: { shadowColor: '#18181B', shadowOpacity: 0.10, shadowRadius: 24, shadowOffset: { width: 0, height: 8 },  elevation: 8 },
  xl: { shadowColor: '#18181B', shadowOpacity: 0.12, shadowRadius: 32, shadowOffset: { width: 0, height: 12 }, elevation: 12 },
} as const;

export const motion = {
  duration: { instant: 100, fast: 150, base: 200, slow: 300, slower: 400 },
  spring: {
    default: { damping: 18, stiffness: 220, mass: 1 },
    gentle:  { damping: 22, stiffness: 160, mass: 1 },
  },
  press: { scale: 0.97, opacity: 0.9 },
} as const;

export const theme = {
  palette, colors, spacing, radius, layout, fonts, typography, shadows, motion,
} as const;

export type Theme = typeof theme;
export default theme;
```

### 10.1 CSS variables equivalent (for NativeWind / web / reference)

If the project uses NativeWind or also targets web, mirror the tokens as CSS custom properties.

```css
:root {
  /* neutrals */
  --color-neutral-0: #FFFFFF;
  --color-neutral-50: #FAFAFA;
  --color-neutral-100: #F4F4F5;
  --color-neutral-200: #E4E4E7;
  --color-neutral-300: #D4D4D8;
  --color-neutral-400: #A1A1AA;
  --color-neutral-500: #71717A;
  --color-neutral-600: #52525B;
  --color-neutral-700: #3F3F46;
  --color-neutral-800: #27272A;
  --color-neutral-900: #18181B;
  --color-neutral-950: #09090B;

  /* primary (blue) */
  --color-primary-500: #3B82F6;
  --color-primary-600: #2563EB;
  --color-primary-700: #1D4ED8;

  /* success (green) */
  --color-success-100: #DCFCE7;
  --color-success-500: #22C55E;
  --color-success-600: #16A34A;

  /* warning (orange) */
  --color-warning-100: #FFEDD5;
  --color-warning-500: #F97316;
  --color-warning-600: #EA580C;

  /* accent (purple) */
  --color-accent-100: #EDE9FE;
  --color-accent-500: #8B5CF6;
  --color-accent-600: #7C3AED;

  /* destructive */
  --color-red-500: #EF4444;
  --color-red-600: #DC2626;
  --color-red-700: #B91C1C;

  /* semantic */
  --bg-canvas: var(--color-neutral-100);
  --bg-surface: var(--color-neutral-0);
  --bg-sunken: var(--color-neutral-100);
  --border-default: var(--color-neutral-200);
  --border-focus: var(--color-primary-500);
  --text-primary: var(--color-neutral-900);
  --text-secondary: var(--color-neutral-600);
  --text-tertiary: var(--color-neutral-500);
  --text-inverse: var(--color-neutral-0);
  --action-primary: var(--color-neutral-900);
  --action-primary-blue: var(--color-primary-600);

  /* spacing (4px base) */
  --space-1: 4px;  --space-2: 8px;  --space-3: 12px; --space-4: 16px;
  --space-5: 20px; --space-6: 24px; --space-8: 32px; --space-10: 40px;
  --space-12: 48px; --space-16: 64px;

  /* radius */
  --radius-xs: 6px;  --radius-sm: 8px;  --radius-md: 10px; --radius-lg: 12px;
  --radius-xl: 16px; --radius-2xl: 20px; --radius-full: 9999px;

  /* type */
  --font-sans: 'Inter', system-ui, sans-serif;

  /* motion */
  --duration-instant: 100ms; --duration-fast: 150ms; --duration-base: 200ms;
  --duration-slow: 300ms;
  --ease-standard: cubic-bezier(0.22, 1, 0.36, 1);
}
```

---

## 11. Implementation Notes (React Native Expo)

**Dependencies to install:**

```bash
npx expo install @expo-google-fonts/inter expo-font expo-splash-screen
npx expo install lucide-react-native react-native-svg
npx expo install react-native-reanimated react-native-gesture-handler react-native-safe-area-context
npx expo install @shopify/flash-list @gorhom/bottom-sheet
# optional, simpler animation API:
npx expo install moti
```

**Setup essentials:**

- Add the Reanimated Babel plugin (`react-native-reanimated/plugin`) as the last plugin in `babel.config.js`.
- Wrap the app root in `GestureHandlerRootView` and `SafeAreaProvider`.
- Load fonts at the root and hold the splash screen until `useFonts` resolves (`SplashScreen.preventAutoHideAsync()` then `hideAsync()` when loaded).
- Always pad for notches/home-indicator with `useSafeAreaInsets()`; never hard-code top/bottom insets.

**Practical rules for the agent rewriting the app:**

1. Replace every hard-coded color, font size, radius, padding, and shadow with a reference to `theme`. Zero magic numbers in component files.
2. Build a small set of primitives first: `<Button>`, `<Card>`, `<Input>`, `<Badge>`, `<Text>` (a typed wrapper that takes a `variant` from `typography`), `<Screen>` (handles safe-area + canvas background + horizontal padding). Compose all screens from these.
3. Use `Pressable` (not `TouchableOpacity`) so press states use the exact press motion (`scale 0.97`, `opacity 0.9`). Wrap with a reusable `AnimatedPressable` driven by Reanimated shared values.
4. Apply `shadow.sm` + 1px `border.default` to cards by default. Reserve heavier shadows for floating surfaces.
5. Keep one primary action per screen. Everything else is outline or ghost.
6. Enforce ≥48x48 touch targets, ≥15px body text, and WCAG AA contrast on every screen.
7. Respect reduce-motion (Section 8.4).
8. Use the category color map for any icon chips, tags, or status the app needs, keeping each color's meaning consistent app-wide.

**Definition of done:** the app reads as calm, white-and-neutral with soft 12px-rounded cards, near-black `#18181B` ink, Inter type with tight headings, a single saturated accent per context, faint `shadow.sm` lift, and quick eased motion that confirms every tap. If a screen feels noisy, loud, or has more than one competing call to action, it does not match this system.

---

## 12. Accessibility Verification (audit log)

Every foreground/background pair in this system was contrast-checked against WCAG 2.1 AA (4.5:1 for body and small text, 3:1 for large text and graphical objects). The values in this doc are the corrected, passing set. Treat them as verified; do not substitute the mid (500) accent shades into white-text buttons or badge text, which is exactly what fails.

| Element | Foreground | Background | Ratio | Bar | Status |
|---|---|---|---|---|---|
| Primary text | `#18181B` | `#FFFFFF` | 17.7:1 | 4.5 | Pass |
| Body (secondary) | `#52525B` | `#FFFFFF` | 7.7:1 | 4.5 | Pass |
| Body on canvas | `#52525B` | `#F4F4F5` | 7.0:1 | 4.5 | Pass |
| Caption (tertiary) | `#71717A` | `#FFFFFF` | 4.8:1 | 4.5 | Pass (white only) |
| Link | `#2563EB` | `#FFFFFF` | 5.2:1 | 4.5 | Pass |
| Black button label | `#FFFFFF` | `#18181B` | 17.7:1 | 4.5 | Pass |
| Blue button label | `#FFFFFF` | `#2563EB` | 5.2:1 | 4.5 | Pass |
| Green button label | `#FFFFFF` | `#15803D` | 5.0:1 | 4.5 | Pass |
| Destructive button label | `#FFFFFF` | `#DC2626` | 4.8:1 | 4.5 | Pass |
| Success badge text | `#15803D` | `#DCFCE7` | 4.6:1 | 4.5 | Pass |
| Active badge text | `#1D4ED8` | `#DBEAFE` | 5.5:1 | 4.5 | Pass |
| Warning badge text | `#C2410C` | `#FFEDD5` | 4.5:1 | 4.5 | Pass |
| Routing badge text | `#6D28D9` | `#EDE9FE` | 6.0:1 | 4.5 | Pass |
| Error badge text | `#B91C1C` | `#FEE2E2` | 5.3:1 | 4.5 | Pass |
| Icon-chip glyph (green) | `#16A34A` | `#DCFCE7` | 3.0:1 | 3.0 | Pass |
| Focus ring | `#3B82F6` | `#FFFFFF` | 3.7:1 | 3.0 | Pass |
| Dark: primary text | `#FAFAFA` | `#18181B` | 17.0:1 | 4.5 | Pass |
| Dark: secondary text | `#A1A1AA` | `#18181B` | 6.9:1 | 4.5 | Pass |

**Intentional exemptions (deliberate, not failures):** disabled text (`#A1A1AA` on white, 2.6:1) is exempt because WCAG does not require contrast for disabled controls; subtle card borders/dividers (~1.3:1) are decorative separators that never carry state on their own, so they sit below the 3:1 UI bar by design; dark-mode tertiary text (3.7:1) is restricted to secondary/caption use where the 3:1 bar applies, not body.

**What changed in this revision (and why):** filled green and red buttons moved off the mid 500 shade onto `#15803D` / `#DC2626` so white labels pass 4.5:1; badge text moved from the 600 to the 700 step for the same reason at small sizes; `red.700 #B91C1C` was added to support that; input text moved 15 to 16 to clear the readability floor and avoid iOS web input zoom; tertiary text was scoped to white surfaces only. Structure, spacing, radius, shadow, motion, and the overall aesthetic are unchanged.

---

## 13. Applying this system to Ampora (added for this project)

This section maps the system above onto Ampora's actual screens and components. Everything above is unchanged and remains the source of truth. This only shows how to use it. Exact UI names and copy come from `01_PRD.md` Section 8.

### 13.1 The color semantics carry over
The reference screenshots were a node/workflow UI (START, CLASSIFIER, ROUTER). In Ampora the same color meanings hold:
- **Green (success):** begin and completed states. The First move "Start", a completed task, the focus-session-complete state, toggles on.
- **Blue (primary):** interactive actions that are not the black primary button, links, selection, focus rings.
- **Black ink (`neutral.900`):** the single highest-emphasis primary button per screen, and titles.
- **Orange (warning):** caution without alarm. A deadline getting close, a gentle "getting behind" nudge.
- **Purple (accent):** smart and special affordances. The AI breakdown, the Refine chat, and Projects.
- **Red (destructive):** delete and errors, and the "at risk / overdue" deadline status as a quiet dot, never a shaming banner.
- **Supporting hues (amber, pink, teal):** categorical color-coding for lists, projects, and calendar event blocks only, never actions.

### 13.2 Deadline-slack status (PRD 9.5.5)
Comfortable, getting close, and at risk map to `success.500`, `warning.500`, `red.500` as a small dot or a left edge on a calendar block or task row, plus an icon or label so color is never the only signal. Quiet, never a loud banner.

### 13.3 Key screens mapped to the primitives
- **Screen wrapper:** `<Screen>` with `bg.canvas`, safe-area insets, horizontal padding.
- **Today:** a "Today's focus" `<Card>`, then the First move `<Card>` as the one focal point. The "Start" button is the screen's single primary action. Since this system reserves green for begin and run affordances, "Start" reads well as the green success action, and that is the one primary action on Today. "Not now" is a text button, "I'm overwhelmed" is a low-emphasis ghost button.
- **First move card:** distinct, warm, one line of copy, one primary button. The most important component in the app.
- **Stake (lock) banner:** an inline banner or `<Card>` showing what is locked and the unlock condition, with a small lock icon, the condition in `text.secondary`. Neutral surface, no alarm colors, since the lock is consensual, not a warning.
- **Panic valve "Unlock early" screen:** calm and neutral, a single countdown and a ghost "Back to task". No red.
- **De-escalation sheet:** a `@gorhom/bottom-sheet`, calm copy, two buttons.
- **Blindfold:** a full `<Screen>` with one `<Card>` (the single micro-step) and one primary action. Maximum whitespace, zero other UI.
- **Calendar blocks:** list or project color as a soft tint fill (the supporting `.100` hues or the list color) with a stronger left edge, the deadline-status dot from 13.2, and dynamic typography per PRD 8.7.
- **Verification proof screen:** an upload or `<Input>` control, a primary submit, and an "Unlock anyway" text button.
- **Refine chat (breakdown):** chat bubbles (user in a `primary.100` or `neutral.100` tint, assistant in `neutral.0` with `border.default`), an `<Input>` pinned to the bottom, send is the primary action.
- **Paywall / trial:** a `<Card>` with the monthly and annual options, the subscribe control is the black primary button, the trial state shown in `text.secondary`.
- **Badges:** COMPLETED uses the success badge (`success.100` background, `success.700` text), at-risk uses the red badge, AI and smart features use the accent badge.

### 13.4 One primary action per screen (the rule that matters most for ADHD)
Every Ampora screen has exactly one most-prominent action. Today is Start, Focus is the in-session control, the task editor is Save task, Blindfold is the one step. Everything else is outline, ghost, or text. This is philosophy rule 2 and the single biggest lever for this audience.

### 13.5 Reference and tooling
Build the primitives first (Section 11), keep every value in `theme.ts`, and reference the semantic aliases in components. For reference layouts of comparably calm, token-driven apps, Mobbin is the best library to study (Things, Todoist, Linear). Generate the actual components against these tokens with your frontend-design and ui-ux skills.

---

## 14. Design System v3 — "Calm Premium" (warm neutral spine)

Phase 1 of the v3 pass. Everything in Sections 0-13 stays the philosophy and structure; this section supersedes the specific neutral hexes and adds new tokens. Token file: `utils/design-tokens.ts` (`colors`, `shadows`, `gradients`, `motion`, plus new exports `listColors`, `tabularNums`); Tailwind mirror: `tailwind.config.js` (`theme.extend.colors.neutral`); motion re-exports: `utils/motion.ts`.

### 14.1 Warm neutral spine (cool Zinc → warm Stone)
The neutral ramp moved from a cool Zinc family to a warm Stone family, one family only — never mix warm and cool grays in the same surface. This is the single biggest move toward a more premium, less "SaaS-generic" feel: the canvas reads as warm bone paper instead of clinical gray.

| Token | Old (Zinc) | New (Stone) | Usage |
|---|---|---|---|
| `neutral.0` | `#FFFFFF` | `#FFFFFF` | Cards stay pure white (unchanged — the white/canvas contrast is the point) |
| `neutral.50` | `#FAFAFA` | `#FAF9F7` | Elevated surface |
| `neutral.100` | `#F4F4F5` | `#F7F6F3` | **Canvas — warm bone.** The headline move |
| `neutral.200` | `#E4E4E7` | `#E8E6E0` | Hairline/border base |
| `neutral.300` | `#D4D4D8` | `#D7D3CC` | Stronger borders |
| `neutral.400` | `#A1A1AA` | `#A8A29A` | Placeholder/disabled |
| `neutral.500` | `#71717A` | `#6F6862` | Muted text |
| `neutral.600` | `#52525B` | `#57534E` | Secondary text |
| `neutral.700` | `#3F3F46` | `#44403C` | Strong body text |
| `neutral.800` | `#27272A` | `#292524` | Headings, shadow tint source |
| `neutral.900` | `#18181B` | `#1C1917` | **Ink** — the new warm near-black, "#18181B-class" |
| `neutral.950` | `#09090B` | `#0C0A09` | Max-contrast rare use |

Semantic light-mode aliases (`utils/design-tokens.ts` `colors.light`): `background` `#F7F6F3`, `card` `#FFFFFF`, `elevated` `#FAF9F7`, `text` `#1C1917`, `textSecondary` `#57534E`, `textMuted` `#6F6862`, `border` `#E8E6E0`.

Dark mode (`colors.dark`) warm-tints the same way: `background` `#0C0A09`, `card` `#1C1917`, `elevated` `#292524`, `text` `#FAF9F7`, `textSecondary` `#A8A29A`, `textMuted` `#78716C` (kept intentionally one step lower-contrast than `textSecondary`, matching the original Zinc scheme's secondary/muted split — see 14.5), `border` `#292524`.

**Primary (`#2563EB` family) and accent (`#7C3AED`/`#8B5CF6`) are UNCHANGED.** Blue remains the single primary action color; purple remains reserved for distinct "smart/AI" meaning. This is the color-consistency lock (see 14.7).

Gradients (`gradients.heroWash`, `gradients.fade`) that referenced the old canvas hex as a transparent endpoint were updated: `rgba(244,244,245,0)` → `rgba(247,246,243,0)`, and the solid canvas stop `#F4F4F5` → `#F7F6F3`.

### 14.2 Tinted, ultra-diffuse shadows
Every shadow level (`shadows.none` through `shadows.xl`) changed `shadowColor` from `#18181B` to the warm `#292524` (Stone-800). Opacities are unchanged (0.04-0.12, still low/diffuse). The effect: shadows now read as warm ambient depth rather than hard black drop-shadow, without adding visual weight.

### 14.3 `listColors` — muted-pastel semantic tints
New export in `utils/design-tokens.ts`: `listColors` (type `ListColorName = keyof typeof listColors`), 10 named washed pastels, each `{ bg, text, bar }`:

| Name | bg | text | bar |
|---|---|---|---|
| red | `#FDEBEC` | `#9F2F2D` | `#E4726F` |
| blue | `#E1F3FE` | `#1F6C9F` | `#6BB6E4` |
| green | `#EDF3EC` | `#346538` | `#74A878` |
| yellow | `#FBF3DB` | `#956400` | `#D9B65B` |
| purple | `#EDE9FE` | `#6D28D9` | `#A992F0` |
| orange | `#FFEDD5` | `#C2410C` | `#F0A46B` |
| teal | `#D9F2EE` | `#0F6E60` | `#5FC4B4` |
| pink | `#FCE7F1` | `#A32B68` | `#EC8BB8` |
| indigo | `#E6E9FD` | `#3730A3` | `#8B93E8` |
| slate | `#ECEAE6` | `#52525B` | `#A8A29A` |

`bg` = pale tint for chips/badges/pills. `text` = the readable label color for that bg — every pair audited at ≥4.5:1 (see 14.6, all passed as-given, no darkening needed). `bar` = a slightly stronger tone reserved for the TaskCard left tint-bar (decorative only, never carries text, so it is not itself AA-audited). This set is exposed now as a foundation token; wiring it into TaskCard/tag chips is a later phase (Phase 3) — do not wire it into components in this phase.

### 14.4 `FeatureShell` primitive — nested "feature card" treatment
New file `components/ui/FeatureShell.tsx`. A subtle double-bezel: an outer wrapper (`bg-black/[0.02]`, hairline `border-black/[0.06]`, `p-1`, `rounded-2xl`) around an inner content surface (`bg-white`, its own smaller `rounded-xl`, a 1px top inner-highlight `border-t border-white`). Props: `{ children, className?, style? }`. Presentational — a `View`, not pressable; wrap a `<Card>`/`<PressableScale>` inside it for interactive content.

**Restraint rule (binding):** reserve `FeatureShell` for the 3-4 true focal cards in the whole app — the Home starter/first-move card, the paywall plan cards, and the project next-session card. Everywhere else, use the plain `<Card>` primitive. If it starts appearing on more than a handful of screens, that is a regression of the "one focal point" philosophy (Section 0, rule 2).

### 14.5 Tabular numerals
New export `tabularNums` (`Pick<TextStyle, "fontVariant">` = `{ fontVariant: ["tabular-nums"] }`) in `utils/design-tokens.ts`. Applied to `components/ui/TimerDisplay.tsx` in place of the previous inline `fontVariant` array, so timer digits align without jitter. (Calendar labels and due-date chips get the same treatment in a later phase — this phase only touches `TimerDisplay`.)

### 14.6 WCAG AA audit (this revision)
Every pair touched by the warm shift was recomputed against WCAG 2.1 AA (4.5:1 body/small text, 3:1 large/UI glyphs). All passed at the seed hex values — nothing needed darkening.

| Element | Foreground | Background | Ratio | Bar | Status |
|---|---|---|---|---|---|
| **Muted text on canvas (tightest pair)** | `#6F6862` | `#F7F6F3` | **5.07:1** | 4.5 | Pass |
| Muted text on white card | `#6F6862` | `#FFFFFF` | 5.48:1 | 4.5 | Pass |
| Muted text on elevated | `#6F6862` | `#FAF9F7` | 5.21:1 | 4.5 | Pass |
| Secondary text on canvas | `#57534E` | `#F7F6F3` | 7.06:1 | 4.5 | Pass |
| Secondary text on white | `#57534E` | `#FFFFFF` | 7.63:1 | 4.5 | Pass |
| Primary ink on canvas | `#1C1917` | `#F7F6F3` | 16.18:1 | 4.5 | Pass |
| Primary ink on white | `#1C1917` | `#FFFFFF` | 17.49:1 | 4.5 | Pass |
| Link `#2563EB` on canvas | `#2563EB` | `#F7F6F3` | 4.78:1 | 4.5 | Pass (moved from 5.2:1 on old canvas, still clears) |
| White label on primary button | `#FFFFFF` | `#2563EB` | 5.17:1 | 4.5 | Pass (unchanged color, re-verified) |
| White label on success button | `#FFFFFF` | `#15803D` | 5.02:1 | 4.5 | Pass |
| White label on destructive button | `#FFFFFF` | `#DC2626` | 4.83:1 | 4.5 | Pass |
| Badge text (success .100) | `#15803D` | `#DCFCE7` | 4.57:1 | 4.5 | Pass |
| Badge text (warning .100) | `#C2410C` | `#FFEDD5` | 4.52:1 | 4.5 | Pass |
| Badge text (accent .100) | `#6D28D9` | `#EDE9FE` | 5.98:1 | 4.5 | Pass |
| Badge text (danger .100) | `#B91C1C` | `#FEE2E2` | 5.30:1 | 4.5 | Pass |
| Dark: primary text | `#FAF9F7` | `#1C1917` | 16.62:1 | 4.5 | Pass |
| Dark: secondary text | `#A8A29A` | `#1C1917` | 6.91:1 | 4.5 | Pass |
| Dark: muted text (caption-tier, see below) | `#78716C` | `#1C1917` | 3.65:1 | 3.0 | Pass (secondary/caption tier only, matches the pre-existing dark-tertiary exemption in §12) |
| `listColors.red` text on bg | `#9F2F2D` | `#FDEBEC` | 6.26:1 | 4.5 | Pass |
| `listColors.blue` text on bg | `#1F6C9F` | `#E1F3FE` | 4.98:1 | 4.5 | Pass |
| `listColors.green` text on bg | `#346538` | `#EDF3EC` | 6.08:1 | 4.5 | Pass |
| `listColors.yellow` text on bg | `#956400` | `#FBF3DB` | 4.62:1 | 4.5 | Pass |
| `listColors.purple` text on bg | `#6D28D9` | `#EDE9FE` | 5.98:1 | 4.5 | Pass |
| `listColors.orange` text on bg | `#C2410C` | `#FFEDD5` | 4.52:1 | 4.5 | Pass |
| `listColors.teal` text on bg | `#0F6E60` | `#D9F2EE` | 5.23:1 | 4.5 | Pass |
| `listColors.pink` text on bg | `#A32B68` | `#FCE7F1` | 5.75:1 | 4.5 | Pass |
| `listColors.indigo` text on bg | `#3730A3` | `#E6E9FD` | 8.25:1 | 4.5 | Pass |
| `listColors.slate` text on bg | `#52525B` | `#ECEAE6` | 6.43:1 | 4.5 | Pass |

**The one adjustment made from the original plan values:** dark-mode `textMuted` was set to `#78716C` (Stone-500-on-dark) rather than reusing `textSecondary`'s `#A8A29A`, because the pre-warm scheme had `textMuted` (`#71717A`, 3.67:1 on `#18181B` — caption-tier only) meaningfully lower-contrast than `textSecondary` (`#A1A1AA`, 6.91:1 — body-tier); collapsing them to the same value would have silently upgraded muted text to body-tier contrast everywhere it's used and erased an intentional two-tier hierarchy. `#78716C` preserves the original ratio class (3.65:1, matching the existing dark-tertiary exemption documented in §12) while staying in the warm family. No other hex needed adjustment — the warm ramp and the `listColors` seed values all passed 4.5:1 as given.

### 14.7 Shape-consistency and color-consistency locks
**Radius (binding, do not deviate per-screen):**

| Element | Radius | Tailwind |
|---|---|---|
| Cards, list items | 12 | `rounded-lg` |
| Buttons | 10 | `rounded-md` |
| Inputs | 8-10 | `rounded-sm` to `rounded-md` |
| Pills / badges | full | `rounded-full` |
| Modals / sheets | 16 | `rounded-xl` |
| `FeatureShell` outer / inner | 16 / 12 | `rounded-2xl` outer, `rounded-xl` inner |

**Color-consistency lock:** primary blue `#2563EB` is the single accent color for interactive "do it" actions across the whole app. Purple `#7C3AED`/`#8B5CF6` is reserved exclusively for distinct semantic meaning (AI/smart/breakdown/project-chat affordances per §13.1) — never as a second general-purpose accent, never interchangeable with blue. Ink is the warm near-black `#1C1917` (an "#18181B-class" value, same role and contrast tier as before, just warm-shifted).

### 14.8 Motion vocabulary additions
`utils/design-tokens.ts` `motion.spring.tactile` = `{ damping: 26, mass: 0.8, stiffness: 340 }` — snappier than `spring.default`, for drag pickup/drop and control toggles (e.g. calendar block drag). `motion.duration.drag` = `120`ms — fast drag-follow (block tracking a finger), distinct from settle/entrance durations. Both re-export automatically through `utils/motion.ts` as `SPRINGS.tactile` and `DURATIONS.drag` since those re-export `motion.spring`/`motion.duration` wholesale. `EASINGS` is unchanged — still no bounce/elastic curves anywhere.

**Haptic vocabulary** (documented as a comment block in `utils/motion.ts`, three cases only — do not invent new meanings per screen):
- `selection` (`Haptics.selectionAsync`) — snap/tick on discrete state change: drag snapping to a calendar slot, segmented control switch.
- `light` (`Haptics.impactAsync(Light)`) — pickup/drop: grabbing a draggable block, releasing it. Matches `PressableScale`'s existing default `haptic="light"`.
- `success` (`Haptics.notificationAsync(Success)`) — completion/commit: task done, drag committed to its final slot.
