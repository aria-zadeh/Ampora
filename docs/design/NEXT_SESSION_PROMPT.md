# Prompt for a fresh Claude Code session

Copy everything in the fenced block below into a new conversation in this project. It is self-contained: it points at files in the repo rather than assuming any memory of the previous session.

---

```
Restructure Ampora's screens to match the approved design direction.

## Start here

1. Open `docs/design/README.md`. It explains what is already applied and what is not.
2. Open `docs/design/stack-reference.html` in a browser. This is the target. Four
   screens: Today, Calendar, Focus with the lock active, and Task detail. It also
   opens with a written diagnosis of why an earlier version of this design looked
   AI-generated, which is worth reading so it does not get reintroduced.
3. Read `docs/design/SCREEN_SPEC.md` for the exact content those screens show.
4. Read `docs/02_Design_System.md`, especially section 2 (type), section 12 (the
   contrast audit) and section 14 (the warm Stone palette).
5. Read `CLAUDE.md` for the project rules.

## What is already done, do not redo it

The token layer is already migrated and is on `main`: Lexend replaced Inter, corner
radius went from one value to three tiers, shadows from two values to four warm
tiers, type weights from 600-and-700-only to a full 400 through 700 range, spacing
gained a grouping step, and the progress ring became a single-hue tonal sweep.

So the app already has the right typeface, depth and rhythm. What it does not have
is the right screen STRUCTURE.

## What to build

Bring the screens to the structure in `stack-reference.html`:

- **Today**: one vertical stack of equal-width cards, where the focus card is simply
  taller rather than a differently-shaped hero. No split hero.
- **Navigation**: a top segmented control plus a floating action button, rather than
  the current bottom tab bar. Note PRD section 8.1 fixes the five surfaces as
  Today, Calendar, Tasks, Focus, Profile, so all five still have to be reachable.
  If moving away from a bottom bar makes any of them hard to reach, say so rather
  than quietly dropping one.
- **Calendar**: agenda-first, with the time grid still reachable. Do not regress
  drag-to-reschedule, resize, pinch-zoom across the 40/60/80/120 stops, the overlap
  layout, long-press-to-create, or complete-from-block. That surface is the most
  expensive in the app to get working and it currently works.
- **Focus and Task detail**: match the reference.

## One piece of wiring worth fixing while you are there

`utils/design-tokens.ts` exports a `typography` object with named text styles. No
screen imports it, every screen uses Tailwind classes instead. Two entries
(`bodyMedium`, `captionMedium`) were added because `docs/02` section 2.2 specified
them and they were never implemented, and their absence is likely why screens
defaulted to semibold everywhere.

Decide whether screens should consume `typography` directly or whether the Tailwind
scale should mirror it, then make one of those true. Right now neither is, which is
why the two are able to drift apart.

## Non-negotiables, from the product spec rather than taste

- One primary action per screen, visually dominant.
- Status is never colour alone. Every state carries a text label or icon.
- 44x44 minimum touch targets. Body text 15px or larger, captions 13px or larger.
- WCAG AA: 4.5:1 body, 3:1 large text and UI glyphs. Section 12 records deliberate
  contrast decisions, for example filled buttons using the darker step. Do not
  flatten those.
- The lock is consensual: neutral surface, no alarm red, no shame language.
- Tabular numerals on the timer, times and counts.
- No raw colour literals. Use `utils/design-tokens.ts`. The codebase is down to
  three literals total from 377, do not add more.
- No purple or violet in anything new. The owner rejected it explicitly.
- Nothing critical is gesture-only.
- Zustand v5: raw-select then `useMemo`, or `useShallow`. An inline `.filter` or
  `.map` inside a selector causes an infinite render loop (React error 185).

## Gates

`npx tsc --noEmit` at 0 errors, `npm test` passing (501 at time of writing), and
`npx expo export --platform web` completing. Run all three before saying you are
done.

## Two things that will bite

**Lexend is wider than Inter**, so text that used to fit on one line may now wrap.
Four spots were identified and never verified on a device, because Windows cannot
run the app: the task title in `components/ui/TaskCard.tsx`, the dense-column
heuristic in `components/calendar/CalendarBlock.tsx` (it shows roughly the first
six characters under a 56px width, and a fixed character count at a wider font
measures wider), the lock banner headline in `components/stakes/LockBanner.tsx`,
and the option copy in `components/stakes/StakeSetupSheet.tsx`. Check them.

**Lexend has no arrow glyphs.** A literal arrow character falls back to another
font and will not match. Use icon components instead.

## How to work

Work in reviewable pieces rather than one enormous change, and keep the three gates
green between them. Suggested order: Today, then Focus, then Task detail, then
Calendar last since it is the highest-risk surface.

If something in the reference conflicts with a spec rule above, the spec wins. Say
so rather than silently picking one.
```

---

## Why this exists as a file

The design reference lived in temporary session storage, which a new conversation cannot see. Committing `stack-reference.html` to the repo is what makes a fresh session possible at all. If the design changes again, update that file, not a chat message.
