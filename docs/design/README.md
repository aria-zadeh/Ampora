# The chosen design direction

## Missing file: `DECISION_SPEC.md`

**11 source files cite `design/DECISION_SPEC` 16 times, and the file is not in this repo.**

Comments point at specific numbered decisions in it (`doc design/DECISION_SPEC D1`, `D4 item 8`, and so on) across `app/(tabs)/focus.tsx`, `app/(tabs)/index.tsx`, `app/focus/session.tsx`, all six `components/focus/*` files, `components/home/TodayFocusCard.tsx` and `components/stakes/LockBanner.tsx`. `app/(tabs)/index.tsx` cites it as `DESIGN_DECISION_SPEC.md`, a slightly different name. Neither file exists.

This is exactly the failure the note at the bottom of this file warns about, the one explaining why `stack-reference.html` had to be committed at all: a design artefact that lived only inside a chat session, which no later session can see. The lesson got applied to the HTML reference and then not to the decision spec.

**If you have that document, commit it as `docs/design/DECISION_SPEC.md`.** Until then every one of those 16 comments is unresolvable, and the Focus and session screens cannot be checked against the decisions they were built to satisfy. Flagged 2026-08-07, see `docs/sessions/2026-08-07-session-record.md`.

## What is here

- **`stack-reference.html`** — the approved design, "Stack", across all four key screens. Open it in a browser. This is the target the app is being brought to. It is self-contained, so it works offline with no server and no internet.
- **`SCREEN_SPEC.md`** — the exact content those four screens show. Every design round used this same content deliberately, so directions were compared on structure and feel rather than on copy.

The file also opens with a written diagnosis of why the earlier version of this design read as AI-generated, and what was changed to fix it. That reasoning is worth reading before changing anything here, because it is easy to reintroduce.

## How much of it is applied to the app

**The foundation is applied. The per-screen layout is not.**

Applied, in `utils/design-tokens.ts`, `tailwind.config.js` and `app/_layout.tsx`:

| Thing | Before | Now |
|---|---|---|
| Typeface | Inter | **Lexend** (`@expo-google-fonts/lexend`, SIL OFL) |
| Corner radius | one value everywhere | three tiers: 12 rows, 18 cards, 26 hero |
| Shadows | two values, the stronger used once | four warm-tinted tiers |
| Type weights | 600 and 700 only | 400 through 700 |
| Spacing | flat 8px | grouped, with an 18px break between groups |
| Progress ring | flat stroke | single-hue tonal sweep |

Not applied: the actual **screen structure**. `stack-reference.html` shows a single vertical stack of equal-width cards with a taller focus card, a top segmented control plus a FAB, and an agenda-first calendar. The app's screens still have their previous structure.

This split was deliberate. Token changes propagate to every screen automatically and revert in one commit. Restructuring every screen is large and hard to unwind, so the foundation went in first to be judged on a real device before layering more on top.

## The thing that blocks a perfect match, in plain terms

`utils/design-tokens.ts` exports a `typography` object: a named list of text styles like "body is 15px at regular weight". Two entries were added to it (`bodyMedium`, `captionMedium`) that `docs/02_Design_System.md` §2.2 had specified from the beginning but nobody ever implemented.

**Nothing currently reads that object.** Every screen styles its text with Tailwind class names (`text-body`, `font-semibold`) instead of importing `typography`. So adding those entries changed nothing on screen.

That is not a limitation, it is just unfinished wiring, and it probably explains a real symptom: with no medium weight available in practice, screens defaulted to semibold, which is one of the things that made the old design look generated.

Making the app match `stack-reference.html` means doing the screen-level pass. Nothing structural prevents it.

## Rules that survive any redesign

These come from the product spec, not from taste, and a redesign does not get to break them:

- **One primary action per screen**, visually dominant. Everything else is outline or ghost.
- **Status is never colour alone.** Every state carries a text label or an icon too.
- **Minimum 44x44 touch targets.** Body text no smaller than 15px, captions no smaller than 13px.
- **WCAG AA**: 4.5:1 for body text, 3:1 for large text and UI glyphs.
- **The lock is consensual.** Neutral surface, no alarm red, no warning triangles, no shame language anywhere.
- **Tabular numerals** on the timer, times and counts, so digits do not jitter.
- **No raw colour literals.** Everything comes from `utils/design-tokens.ts`. The codebase is down to roughly 160 line-matches across 35 files as of 2026-08-07 (a 2026-07-30 sweep counted 172 across 36, per `CLAUDE.md`), not the 3 once claimed here. Migration is ongoing, not finished. The rule stands: add none.
- **Nothing critical is gesture-only.** Every gesture needs a visible alternative.
