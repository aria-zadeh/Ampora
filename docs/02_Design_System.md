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

**Extracted, not designed.** Every value below was read out of the vector data of the nine Figma PDF exports of real Ampora screens. Values are tagged **[E]** extracted, **[I]** interpolated between two extracted steps, **[F]** inferred because a PDF cannot carry it. Nothing here is a preference.

The whole palette is fifteen colours, and four of those are 6x6 categorical dots.

### 1.1 The dark spine (the default theme)

| Token | Hex | Tag | Role |
|---|---|---|---|
| `background` | `#0C0C0E` | [E] | canvas, the page itself |
| `surfaceHairline` | `#111113` | [E] | white at 2.0% over canvas |
| `surfaceGhost` | `#141416` | [E] | white at 3.1% over canvas, ghost/outline button fill |
| `card` | `#18181B` | [E] | card and sheet surface |
| `elevated` | `#222226` | [E] | raised surface, icon wells, fields inside a sheet |
| `border` | `#2D2D30` | [E] | the 1pt border, everywhere |
| `borderStrong` | `#3A3A3C` | [E] | emphasised border |
| `textDisabled` | `#515154` | [E] | primary text at 30%, disabled only |
| `textMuted` | `#8A8A93` | **[I]** | see the WCAG note below |
| `textSecondary` | `#A1A1AA` | [E] | secondary body |
| `text` | `#F2F2F7` | [E] | primary text |
| `textStrong` | `#FFFFFF` | [E] | highest emphasis, knobs, on-accent glyphs |

There is **no warm Stone spine any more**. The measured spine is cool-neutral. The old `#F7F6F3` canvas and `#1C1917` ink are gone.

### 1.2 The accent — one, and only one

| Token | Hex | Tag | Role |
|---|---|---|---|
| `primary` | `#6A97AD` | [E] | the single general interactive accent |
| `primaryLight` | `#7CAEC4` | [E] | accent text and icons on dark, active nav |
| `primaryDark` | `#A3CCDB` | [E] | palest accent step |
| `primaryForeground` | `#0C0C0E` | [E]+fix | the label on any saturated fill |
| `primaryWash` | `#1A2024` | [E] | accent at 12.2% over canvas |
| `primaryWashStrong` | `#222D34` | [E] | accent at 23.9% over canvas |

`#2563EB` is gone. So is the `#7C3AED` Projects purple.

### 1.3 Semantic hues

| Role | Dark | Light | Tag |
|---|---|---|---|
| `success` — terminal only | `#88B196` | `#50795E` | [E] dark |
| `warning` — caution, no alarm | `#BCA076` | `#876B42` | **[F]** |
| `danger` — destructive and at-risk | `#BD877F` | `#A25D53` | **[F]** |
| `accent` — AI / smart / Projects only | `#A793BD` | `#8063A0` | **[F]** |

**Red, orange and purple appear nowhere in the nine source screens.** Worse, the source paints "Drop" (destructive) and "Overdue by 1d" (at-risk) in the *accent*, which contradicts §13.1. Since §13.1's meanings are binding, those three roles were derived in the extracted hue register (HSL saturation 21-29%, lightness 55-66%, matching `#6A97AD` and `#88B196`) rather than inherited from the mock. They are the only invented colours in the system and are marked as such.

### 1.4 Categorical hues

The source contains exactly four categorical dots — `#7AAEBB`, `#8295B3`, `#88B196`, `#A3CCDB`, all 6x6px. The full ten-hue `listColors` set is **[I]**, built in the same muted register. Every `text`-on-`bg` pair is audited at >=4.5:1 in both themes (§12).

Categorical hues tint lists, tags, projects and calendar blocks. **Never an action.**

### 1.5 The light theme

Derived from the dark system's *step relationships*, never mechanically inverted: canvas is the extreme, surfaces step toward the viewer, border sits one step off surface, text steps primary -> secondary -> muted at matching contrast tiers. Because the dark spine is cool-neutral, the light theme is too.

Every light hue was darkened until it cleared 4.5:1 against the light **canvas** `#F4F4F5` — the worst-case light surface, not the white card.

Light spine: canvas `#F4F4F5`, card `#FFFFFF`, raised `#FAFAFA`, border `#E4E4E7`, borderStrong `#D4D4D8`, text `#18181B`, textSecondary `#52525B`, textMuted `#6B6B74`, textDisabled `#A1A1AA`, textStrong `#09090B`.

### 1.6 Two corrections to the source, both for WCAG

These are the only places the build deliberately departs from the mock. Both are logged in `09_Decisions.md`.

1. **The primary CTA label.** The source puts a near-white `#F2F2F7` label on the `#6A97AD` accent fill. That measures **2.83:1** and fails body *and* large text. This is every primary button in the app. The accent hex is preserved exactly; the label moved to canvas ink at **6.18:1**. Every primary button reads dark-on-blue. Darkening the accent instead was tested and is worse: at `#4E7285` the label only reaches 4.62 while the button drops to 3.79 against the canvas and stops looking like the source.
2. **Muted text.** The source uses `#71717A`, 99 uses and mostly at 11pt. It measures 4.04 / 3.67 / 3.28 on canvas / card / raised and fails on all three. Replaced with `#8A8A93`, the smallest step on the same neutral line that clears 4.5 everywhere.

### 1.7 How colour is consumed

Every colour resolves through a CSS variable declared in `global.css`, so a class is correct in **both themes with no `dark:` variant at the call site**. Writing `dark:` is now a defect.

The `neutral` ramp is mapped **by role, not by lightness**, in both themes:

| class | role | dark | light |
|---|---|---|---|
| `neutral-0` | card surface | `#18181B` | `#FFFFFF` |
| `neutral-50` | raised surface | `#222226` | `#FAFAFA` |
| `neutral-100` | **canvas** | `#0C0C0E` | `#F4F4F5` |
| `neutral-200` | border | `#2D2D30` | `#E4E4E7` |
| `neutral-300` | border strong | `#3A3A3C` | `#D4D4D8` |
| `neutral-400` | disabled text | `#515154` | `#A1A1AA` |
| `neutral-500` | muted text | `#8A8A93` | `#6B6B74` |
| `neutral-600` | secondary text | `#A1A1AA` | `#52525B` |
| `neutral-900` | primary text | `#F2F2F7` | `#18181B` |
| `neutral-950` | strongest text | `#FFFFFF` | `#09090B` |

> **The sharpest hazard in this system.** `neutral-100` is the CANVAS, not "a light grey". `bg-neutral-100` on a screen root is correct. `bg-neutral-100` as a *fill* on top of the canvas is invisible — a hole in the page. Use `bg-raised` for icon wells, chips, tracks and inset panels. This mistake erased the top nav, the FAB and several chips during the migration.

`white` is remapped to the card surface, because all 148 `bg-white` call sites meant "card". `black` is deliberately NOT remapped so scrims stay black. Use `pure-white` / `pure-black` for a genuine literal, e.g. a toggle knob.

Preferred semantic classes: `bg-canvas`, `bg-surface`, `bg-raised`, `bg-surface-ghost`, `border-line`, `border-line-strong`, `text-ink`, `text-ink-secondary`, `text-ink-muted`, `text-ink-disabled`, `text-ink-strong`.

---

## 2. Typography

### 2.1 Font family

**Outfit.** Weight is bound into the family name, because React Native does not reliably combine `fontFamily` with a numeric `fontWeight` across platforms:

`Outfit_400Regular` / `Outfit_500Medium` / `Outfit_600SemiBold` / `Outfit_700Bold`

Loaded in `app/_layout.tsx` via `useFonts`. These four identifiers must stay in lockstep with `tailwind.config.js`'s `fontFamily` block. Lexend and Inter are both removed from the project.

The PDFs cannot carry a family name — Figma outlines all text as Type3 glyphs with no `/BaseFont` — so Outfit was confirmed directly rather than inferred. The measured cap-height ratio of 0.736 is consistent with it.

### 2.2 Type scale

Every size **[E]**, measured off the text matrices.

| Variant | Size / line | Weight | Where |
|---|---|---|---|
| `display` | 54 / 60 | 700 | the blindfold timer, the one hero number |
| `h1` | 28 / 34 | 600 | screen title |
| `h2` | 22 / 28 | 600 | sheet title |
| `h3` | 20 / 26 | 600 | section title |
| `h4` | 18 / 24 | 600 | card title |
| `bodyLg` | 16 / 22 | 500 | list title, CTA label |
| `body` | 15 / 21 | 400 | body, row title |
| `bodyMedium` | 15 / 21 | 500 | emphasised body |
| `label` | 14 / 20 | 400 | secondary body |
| `caption` | 13 / 18 | 400 | secondary detail |
| `captionMedium` | 13 / 18 | 500 | emphasised detail |
| `meta` | 12 / 16 | 500 | badges, meta, chips |
| `overline` | 11 / 15 | 500 | field labels, uppercase |
| `tiny` | 11 / 15 | 400 | tab labels, footnotes |
| `micro` | 9 / 12 | 500 | micro labels |

**Letter-spacing is 0 on every style, headings included.** Measured 0 on all 241 text runs in the source. The negative display tracking the old system called "the single most important detail" is not in the source and has been removed. `tracking-*` classes still exist in the config but all resolve to `0px`; prefer omitting them.

**9pt and 11pt ship as measured.** This overrides the old §9.9 floor of body >=15 / captions >=13, on Aria's explicit call (`09_Decisions.md`, 2026-08-26). WCAG sets no minimum font size, so AA is unaffected — but the `textMuted` remediation in §1.6 is what makes 11pt legible and is therefore not optional.

**`components/ui/Text.tsx` is the enforced consumption path.** Hand-writing `text-* font-*` combinations is a violation. `tailwind.config.js` mirrors the scale and `core/__tests__/design-tokens.test.ts` asserts the mirror holds key for key.

---

## 3. Spacing System

**Base unit 4 [E].** Every measured gap, padding and dimension in the nine screens divides by 4. Nothing sits off-grid.

| Token | px | Tag | Use |
|---|---|---|---|
| `xs` | 4 | [E] | hairline gaps |
| `sm` | 8 | [E] | tight rhythm |
| `md` | 12 | [E] | **the card-to-card gap, measured 16 times** |
| `base` | 16 | [E] | card padding |
| `lg` | 20 | [I] | |
| `xl` | 24 | [E] | **screen padding** |
| `2xl` | 32 | [I] | section gap |
| `3xl` / `4xl` / `5xl` | 40 / 48 / 64 | [I] | |

### 3.1 Measured layout constants

| Constant | Value | Tag |
|---|---|---|
| screen padding | 24 each side | [E] left edge on 56 elements |
| content width | 354 (402 - 24 - 24) | [E] |
| card height | 72 | [E] |
| card pitch | 84 (72 + 12) | [E] |
| card padding | 16 | [E] |
| icon tile | 40x40, 12 to its label | [E] |
| button height | 44 (ladder 36 / 44 / 52) | [E] |
| toggle | track 48x28, knob 24x24 | [E] |

---

## 4. Border Radius

Entirely **[E]**, derived from corner-arc geometry, with usage counts across the nine screens.

| Token | px | Uses | Applies to |
|---|---|---|---|
| `xxs` | 2 | x3 | grab handles, thin bars |
| `xs` | 4 | x6 | micro elements |
| `sm` | 6 | x8 | |
| `md` | 8 | x28 | chips, small inputs |
| `tile` | 10 | x18 | 40x40 icon tiles |
| `lg` | 12 | x22 | buttons, input fields |
| `xl` | 16 | **x44** | cards — the dominant radius |
| `2xl` | 18 | x4 | feature surfaces |
| `3xl` | 20 | x2 | the full-bleed banner |
| `sheet` | 24 | | bottom sheets, top corners |
| `full` | 9999 | | pills, avatars, toggle tracks and knobs |

A radius equal to half the element height is a **pill**, not a ladder value: the 48x28 toggle track measures 14 and the 24x24 knob measures 12, and both are `rounded-full` in code. The 36pt value in the data is the artboard's device corner and is deliberately absent.

**One radius per element class, app-wide.** No per-screen improvisation.

### 4.1 Bottom sheet spec (measured)

- Surface `bg-surface` `#18181B`. **Not the canvas.** Much of the app previously used canvas for sheets; that was wrong.
- Top corners `rounded-t-sheet` (24).
- Grab handle 40x4, `bg-line`, `rounded-xxs`.
- Fields and rows inside sit on `bg-raised` `#222226`, `rounded-lg` (12).
- Chips inside are 32 tall, `rounded-full`; the selected chip is `bg-primary`.

---

## 5. Elevation and Shadows

**There are none.**

Nine screens: zero shadow geometry, zero blend modes, zero blurs, zero gradients. The only raster images are avatar photos. Depth is carried **entirely** by the flat surface ladder:

`canvas #0C0C0E` -> `card #18181B` -> `raised #222226` -> `border #2D2D30`

The `shadows.*` export and every `shadow-*` class are retained as inert no-ops so the ~54 existing call sites keep compiling and render flat. **To raise a surface, step it up the ladder or give it `border border-line`. Do not reintroduce a shadow.**

The old warm four-tier ladder (`#292524` at 0.04-0.20 opacity) is gone.

### 5.1 Borders

Every border in the source is **1pt**, drawn as a path expanded to a ribbon and halved by a clip. There are zero stroke operations in the entire file set. `border border-line` is the app-wide border.

### 5.2 Translucency

The only transparency in the system, all measured and exposed **pre-composited** so nothing stacks alpha at runtime:

| Fill @ alpha | Composited over canvas | Token |
|---|---|---|
| white @ 2.0% | `#111113` | `surfaceHairline` |
| white @ 3.1% | `#141416` | `surfaceGhost` |
| primary text @ 30% | `#515154` | `textDisabled` |
| accent @ 12.2% | `#1A2024` | `primaryWash` |
| accent @ 23.9% | `#222D34` | `primaryWashStrong` |
| success @ 10.2% | `#191D1C` | `successWash` |

---

## 6. Component Library

### 6.1 Buttons

Heights **36 / 44 / 52**, radius **12** (`rounded-lg`) for every variant.

| Variant | Fill | Label |
|---|---|---|
| primary | `bg-primary` | `text-primary-foreground` (dark ink — see §1.6) |
| destructive | `bg-danger-600` | `text-primary-foreground` |
| secondary / outline | `bg-surface` + `border border-line` | `text-ink` |
| ghost | none | `text-ink-secondary` |
| text | none | `text-primary` |

**One filled primary per screen.** Everything else is outline, ghost or text. The 36px size sits under the 44px touch floor and must carry a compensating `hitSlop`.

### 6.2 Inputs

`bg-raised`, `rounded-lg` (12), 1pt `border-line`, 16px text so iOS does not auto-zoom. Focus raises the border to `border-primary`. Error state uses `danger` **plus** a text message, never colour alone.

### 6.3 Cards

`bg-surface` + `border border-line` + `rounded-xl` (16) + `p-4`. That is the measured card: 354 wide, 72 tall, 16 padding, 1pt `#2D2D30` border. Feature surfaces step to `rounded-2xl` (18).

### 6.4 Badges and pills

`rounded-full`, `meta` type (12/16), a wash background with its matching strong text tone. **Every badge carries a text label** — status is never colour alone.

### 6.5 Navigation

`TopSegmentedNav`, an in-flow top segmented control (not a bottom bar). The track is `bg-raised` + `border-line` — **not** `bg-neutral-100`, which is the canvas and renders the nav invisible. The active segment is `bg-primary` with a `text-primary-foreground` label.

### 6.6 Icons

One set (`@expo/vector-icons` / Ionicons), one stroke weight per screen. Sizes from `iconSizes`: 16 / 18 / 20 / 24 / 32 / 48. Never an emoji. Every icon-only control gets an `accessibilityLabel`.

### 6.7 Lists and rows

Row height >=56, `rounded-xl`, `bg-surface`, separated by 12 (`gap-3`). Icon tile 40x40 `bg-raised` `rounded-tile`, 12 to its label.

### 6.8 Empty states

Never blank: icon + short title + one line + one primary action.

---

## 7. Visual Patterns

### 7.1 Surface layering

Four steps, and only four: canvas -> card -> raised -> border. Depth comes from stepping, never from a shadow. A surface that needs to separate from an identical neighbour gets a 1pt border, not elevation.

### 7.2 Full-bleed banner

The source carries one full-bleed treatment: 402 wide, radius 20, an accent wash fill with a 1pt opaque accent border, content inset 24 from the screen edge. Used for a prominent system state, distinct from the inset 354-wide cards.

### 7.3 Interactive states

Every state is designed: default, pressed, disabled, loading, empty, error. Pressed is `scale 0.97` + `opacity 0.9` over `duration.instant`. Disabled is `text-ink-disabled` with reduced opacity and no interaction. Loading is a skeleton for content, an inline spinner for buttons.

### 7.4 Content hierarchy

Content leads, chrome recedes. Roughly 90% of every screen is canvas, surface, border and ink. The accent appears only where it carries meaning.


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


> **Amended 2026-08-26.** Item 9 above set a floor of body >=15px and captions >=13px. The
> source screens use 11pt heavily and 9pt for micro labels, and Aria chose to ship the
> measured sizes exactly (`09_Decisions.md`). That numeric floor is superseded; every other
> item in this section stands unchanged. WCAG sets no minimum font size, and the `textMuted`
> remediation in section 1.6 is what keeps 11pt legible.

## 10. Design Tokens

The canonical token file is **`utils/design-tokens.ts`**. It is the single source of truth and every value in it is tagged [E] extracted / [I] interpolated / [F] inferred.

`tailwind.config.js` mirrors it, and `global.css` declares the CSS variables that make every colour class theme-aware. `core/__tests__/design-tokens.test.ts` asserts the three stay in lockstep and walks every text-on-surface pair in both themes; a drift in any one of them produces a named failure.

Do not reproduce token values in this document. Read the file.

**Consumption rules**

- Screens style with Tailwind classes. `utils/design-tokens.ts` is imported only for RN props that cannot take a class (Ionicons `color`, `placeholderTextColor`, Reanimated `backgroundColor`), and then through `useThemeColors()` / `useListColors()` from `hooks/useThemeColors.ts`, never by reaching into `colors.light` or `colors.dark` directly.
- Never hardcode a colour, spacing, radius, shadow or duration in a screen or feature component. If a value is not in the tokens, add it to the tokens.
- Never write a `dark:` variant. Colour classes are already theme-aware.

**Verification.** `scratchpad/verify-tokens.js` re-extracts every colour, type size and radius from the nine source PDFs and diffs them against the shipped token file. Any extracted value that does not map to a token is a failure. It currently reports one deliberate replacement, `#71717A` (see §1.6), and passes everything else.


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


## 12. Accessibility Verification

WCAG 2.1 AA: 4.5:1 for body and small text, 3:1 for large text and UI glyphs. Generated from the SHIPPED token file, not from this document.


### DARK  (canvas #0C0C0E / card #18181B / raised #222226)

| Foreground | on canvas | on card | on raised | bar (worst) | AA body |
|---|---|---|---|---|---|
| `text` #F2F2F7 | 17.51 | 15.88 | 14.21 | `##############.......` | PASS |
| `textStrong` #FFFFFF | 19.54 | 17.72 | 15.85 | `################.....` | PASS |
| `textSecondary` #A1A1AA | 7.63 | 6.91 | 6.18 | `######...............` | PASS |
| `textMuted` #8A8A93 | 5.71 | 5.18 | 4.63 | `#####................` | PASS |
| `primary` #6A97AD | 6.18 | 5.60 | 5.01 | `#####................` | PASS |
| `success` #88B196 | 8.17 | 7.40 | 6.62 | `#######..............` | PASS |
| `warning` #BCA076 | 7.84 | 7.11 | 6.36 | `######...............` | PASS |
| `danger` #BD877F | 6.45 | 5.85 | 5.24 | `#####................` | PASS |
| `accent` #A793BD | 7.03 | 6.37 | 5.70 | `######...............` | PASS |

**Fill labels** — `primaryForeground` #0C0C0E on each saturated fill:

| Fill | ratio | AA body |
|---|---|---|
| `primary` #6A97AD | 6.18 | PASS |
| `success` #88B196 | 8.17 | PASS |
| `warning` #BCA076 | 7.84 | PASS |
| `danger` #BD877F | 6.45 | PASS |
| `accent` #A793BD | 7.03 | PASS |

**Disabled** `textDisabled` #515154 on card = 2.24 (WCAG-exempt, disabled controls).
**Dividers** `border` #2D2D30 on card = 1.29 (decorative, exempt).

### LIGHT  (canvas #F4F4F5 / card #FFFFFF / raised #FAFAFA)

| Foreground | on canvas | on card | on raised | bar (worst) | AA body |
|---|---|---|---|---|---|
| `text` #18181B | 16.12 | 17.72 | 16.97 | `################.....` | PASS |
| `textStrong` #09090B | 18.10 | 19.90 | 19.06 | `##################...` | PASS |
| `textSecondary` #52525B | 7.03 | 7.73 | 7.41 | `#######..............` | PASS |
| `textMuted` #6B6B74 | 4.80 | 5.28 | 5.05 | `#####................` | PASS |
| `primary` #4C758A | 4.53 | 4.98 | 4.77 | `#####................` | PASS |
| `success` #50795E | 4.51 | 4.96 | 4.75 | `#####................` | PASS |
| `warning` #876B42 | 4.54 | 4.99 | 4.78 | `#####................` | PASS |
| `danger` #A25D53 | 4.52 | 4.97 | 4.76 | `#####................` | PASS |
| `accent` #8063A0 | 4.54 | 4.99 | 4.78 | `#####................` | PASS |

**Fill labels** — `primaryForeground` #FFFFFF on each saturated fill:

| Fill | ratio | AA body |
|---|---|---|
| `primary` #4C758A | 4.98 | PASS |
| `success` #50795E | 4.96 | PASS |
| `warning` #876B42 | 4.99 | PASS |
| `danger` #A25D53 | 4.97 | PASS |
| `accent` #8063A0 | 4.99 | PASS |

**Disabled** `textDisabled` #A1A1AA on card = 2.56 (WCAG-exempt, disabled controls).
**Dividers** `border` #E4E4E7 on card = 1.27 (decorative, exempt).


**Non-colour requirements**

- Minimum touch target 44x44 (`hitSlop` where the visual is smaller).
- Status is never colour alone — every pill, dot and state carries a text label or icon.
- Every icon-only control has an `accessibilityLabel`, and an `accessibilityHint` when the action is not obvious. `accessibilityRole` and state (`selected`, `disabled`, `expanded`, `busy`) are announced.
- Dynamic Type is supported; layouts use flexible heights, never fixed heights with clipped text.
- Reduce-motion is respected via `hooks/useReduceMotion`.


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


## 14. Superseded

Design System v3 "Calm Premium" (the warm-Stone spine) is **retired**. It was replaced on 2026-08-26 by the system extracted from the nine Figma source screens, described in sections 1 through 7 above.

Specifically retired, do not reintroduce:

- the warm Stone spine, the `#F7F6F3` canvas and the `#1C1917` ink
- the four-tier warm shadow ladder — there are no shadows at all
- the decorative gradient presets — there are no gradients at all
- negative heading tracking — letter-spacing is 0 everywhere
- the `#2563EB` primary and the `#7C3AED` Projects purple
- the 12 / 18 / 26 radius story and the separate `rounded-[14px]` for filled primaries
- Lexend and Inter
- the dotted-grid signature texture, which does not appear anywhere in the source
- the §9.9 type floor of body >=15 / captions >=13

**What survives from the old document:** section 0 (philosophy), section 8 (motion), section 9 (the ADHD constraints, minus the 9.9 numeric floor), section 11 (implementation notes) and section 13 (the colour semantics, the primitive mapping, and one-primary-action-per-screen). The new system was built to serve exactly those.

The shape and colour consistency locks of the old §14.7 remain binding as a *principle* — one radius per element class, one general accent, a second colour only for a distinct semantic meaning — but their values are now sections 1 and 4.

**Blue/green ruling, unchanged in meaning:** blue is about-to-do and doing (Start, Resume, Lock in, Save, Done, selected states, progress fills). Green is terminal only (Completed, session served). Only the hexes moved.

