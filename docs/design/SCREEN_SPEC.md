# Ampora theme mockups — shared screen spec

Every theme renders these EXACT four screens with this EXACT content. Themes are
compared on visual identity, so the content must not vary between them. Do not
invent different task names, times, or copy.

Each screen is a phone frame, 390 x 844 CSS px inner viewport, rendered as static
HTML/CSS. No JavaScript. No external assets, no image URLs, no icon fonts, no font
CDNs. Icons are inline SVG or drawn with CSS. The status bar reads `9:41`.

---

## What Ampora is (so the design has a point of view)

An auto-scheduling task app for students who procrastinate and people with ADHD.
It plans your week, hands you a 2-minute "First move" so starting is easy, and lets
you lock your own distracting apps for the length of a focus session, so blowing a
task off costs you right now.

Three feelings the design has to carry:
- **Calm.** The audience is overwhelmed. Density and noise are the enemy.
- **Momentum.** One obvious next action, always.
- **Consensual pressure.** The lock is something you chose. It must never read as
  punishment, alarm, or a parental control. No red alert states on the lock screen.

---

## Screen 1 — Today

- Greeting: `Good evening, Aria.`
- Sub-line: `3 things left. About 2 hours.`
- **Urgent strip**, one row: `History essay — due in 9 hours` with a quiet urgency dot.
- **Today's focus** card, the single focal element on the screen:
  - Task title: `Write essay intro`
  - Meta: `45 min · History · 4 steps`
  - Nested inside it, the **First move** block:
    - Label: `First move`
    - Text: `Open a doc and write one sentence stating your thesis.`
    - Duration chip: `2 min`
  - One primary button: `Start`
  - One quiet secondary text button: `Not now`
- Below, an **Up next** list, three rows, each with a time, a title and a list dot:
  - `6:30 PM` · `Spanish review` · Spanish
  - `7:45 PM` · `Calc problem set 7` · Math
  - `9:00 PM` · `Read Ch. 11` · History
- A persistent ghost button, low emphasis: `I'm overwhelmed`
- A `+` FAB.

## Screen 2 — Calendar, 3-day view

- Header: `Calendar`, view pills `Day` `3-Day` `Week` `Month` `Agenda` with `3-Day` active.
- Three day columns: `WED 12` `THU 13` `FRI 14`. THU is today.
- A time gutter down the left showing `3 PM` through `9 PM`.
- A current-time line across THU at roughly 5:20 PM, with a small time label.
- Blocks (each shows title, time range, and a list colour):
  - WED: `Calc pset 6` 3:00–4:30 PM · Math
  - WED: `Track practice` 5:00–6:30 PM · fixed event, visually distinct from task blocks
  - THU: `Write essay intro` 5:30–6:15 PM · History · carries a small `4 steps` chip and a lock glyph
  - THU: `Spanish review` 6:30–7:00 PM · Spanish
  - THU: `Calc problem set 7` 7:45–9:00 PM · Math
  - FRI: `Read Ch. 11` 4:00–5:00 PM · History
  - FRI: `Essay draft` 4:30–6:30 PM · History · shows an at-risk state, and that state must
    be readable without relying on colour alone
- The two FRI blocks deliberately overlap 4:30–5:00 so the side-by-side overlap
  treatment is visible. Keep these times exactly.

## Screen 3 — Focus session with the lock active

This is the product's headline moment. Give it the most attention.

- A large session timer reading `24:18`, with a circular or linear progress
  indication of the session.
- Above it, small label: `Session 1 of 2`
- The current step, large and legible, the biggest text on screen:
  `Write one sentence stating your thesis.`
- Step position: `Step 1 of 4`
- **Lock banner**, neutral and calm, never alarming:
  `Instagram and 2 more are locked. 24 min left.`
- Three low-emphasis controls in a row: `I'm stuck` · `Take a break` · `I'm overwhelmed`
- One quiet escape affordance at the bottom: `Unlock early`
- Optional ambient-audio affordance if the theme wants it: `Rain`

## Screen 4 — Task detail with the AI breakdown

- Back chevron, task title `Write essay intro`, an overflow control.
- Meta row: `History` list chip · `45 min` · `Due Fri 11:59 PM` · priority `High`
- **First move** block, visually elevated:
  `Open a doc and write one sentence stating your thesis.` · `2 min`
- **Steps** checklist, 4 rows, first one checked:
  1. `Open your doc and paste the prompt` · `5 min` · done
  2. `Write your thesis sentence` · `10 min`
  3. `List three supporting points` · `15 min`
  4. `Draft the opening paragraph` · `15 min`
- A progress indication showing 5 of 45 minutes done.
- Two secondary actions: `Refine` and `Make easier`
- A stake row: `Put something on the line` with an on/off control, currently on,
  and a summary line `Unlocks when this session ends · 45 min`
- One primary button: `Save task`

---

## Non-negotiables that survive every theme

These come from the product spec and are not stylistic choices:

1. **One primary action per screen.** Everything else is outline or ghost.
2. **Status is never colour alone.** Every state carries a text label or an icon
   too. The at-risk block on Friday and the lock banner both must satisfy this.
3. **Minimum 44 px touch targets**, body text no smaller than 15 px, captions no
   smaller than 13 px.
4. **WCAG AA contrast**, 4.5:1 for body text, 3:1 for large text and UI glyphs, in
   whichever ground the theme commits to.
5. **The lock is consensual.** Neutral surface, no alarm red, no warning triangles,
   no shame language anywhere.
6. **Tabular numerals** for the timer, times and counts, so digits do not jitter.
7. No emoji as UI. No lorem. No placeholder greeking.
