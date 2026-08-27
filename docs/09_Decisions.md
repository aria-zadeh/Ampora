# Ampora — Preferences & Decisions (living log)

> A running, plain-language log of Aria's product and design decisions and the reasons behind them, so we do not re-litigate settled calls or drift from them. The PRD Decision Log (`01` Section 13) is the formal record; this file is the round-by-round companion. Deferred features live in `V2_Changes.md` and are not decisions to build against. No em dashes, no semicolons.
>
> Kept updated whenever Aria requests a change: append a dated entry, and reflect anything binding into `01_PRD.md` and `02_Design_System.md` so the canonical docs stay authoritative. Never silently drop a prior decision, supersede it with a dated entry that says what changed and why.

---

## Design (locked)

- **Professional, calm-premium look.** The app reads as a polished real product, not a prototype. Depth via a surface ladder (background shift plus a 1px edge plus a soft shadow used sparingly), tighter heading tracking, generous varied spacing. No heavy shadows, decorative gradients, or neon. Restraint reads as premium.
- **Warm neutral spine (Design System v3 "Calm Premium").** Warm Stone, not cool Zinc: canvas is warm bone `#F7F6F3`, ink is warm near-black `#1C1917`, one warm gray family throughout (never mix warm and cool grays). Shadows are warm-tinted and ultra-diffuse. A muted-pastel `listColors` set, a `FeatureShell` nested feature-card primitive for a few focal cards, and tabular numerals for all aligned numbers. Never hardcode colors; every value is a token. **`Lexend` is the typeface** (was `Inter`; see the "Stack" entry below).
- **The "Stack" design direction, adopted 2026-08-01.** Reference: `docs/design/stack-reference.html`, content spec `docs/design/SCREEN_SPEC.md`. One vertical stack of equal-width cards per screen with the focus card simply taller rather than a differently shaped hero; three radius tiers (12 rows / 18 feature cards / 26 hero) instead of one; four warm shadow tiers instead of two; a real 18px break between groups against an 8px rhythm within a group; the full 400-700 weight range with regular carrying most of the screen; and a single-hue tonal progress ring in place of the blue-cyan-mint gradient orb. Typeface moved Inter to Lexend, chosen for validated reading speed and reduced visual stress rather than for looks, which is the point for an ADHD audience. No purple or violet in anything new.
- **Navigation is a floating segmented pill at the bottom, not a full-width bar and not at the top.** The Stack reference put the five-segment pill at the TOP of the content area. That contradicted PRD §8.1 ("Tabs (bottom bar)") and `02` §6.5, and put primary navigation ~100px from the top of an 844pt screen, the worst place to reach one-handed, in an app built for frequent tab switching. Resolution: keep the pill exactly as designed (one rounded track, five icon segments, filled primary active state, FAB) and move it to the bottom, floating above the home indicator. All five PRD §8.1 surfaces stay reachable. The pill floats over content rather than reserving layout space, so every tab screen reserves its own bottom clearance via `useTabBarClearance()`. **Superseded 2026-08-07** — see the dated round entry below. Navigation moved again, this time to an in-flow top segmented control.
- **Dials locked:** DESIGN_VARIANCE 5, MOTION_INTENSITY 6, VISUAL_DENSITY 5. Motion is livelier than a quiet default: `SPRINGS.tactile` for control and drag physics, live drag feedback, one celebratory completion beat. Reduce-motion always respected. Do not re-litigate the dials.
- **One accent, used with intent.** Primary `#2563EB` is the single accent for CTAs, links, and focus rings. `#7C3AED` is reserved for Projects only. About 90 percent of every screen stays neutral.
- **Icon-inline buttons.** Buttons that pair an icon with a label render the icon inline with the text.
- **Refined empty states.** Never blank: icon plus short title plus one line plus one primary action.

## Ignition (the core feature)

- **The lock unit is the focus session.** A stake has two orthogonal properties: a `hold` (`session` by default, or `until_done` for short tasks) and a `trigger` (`manual`, or `scheduled` with an optional start window). This is the load-bearing decision of the whole app. It fixes the leak of "lock until I start" (do the first move, unlock, back to Instagram) and the trap of "lock until done" (a multi-hour task blows past the wellbeing cap).
- **The First move is the on-ramp, not the gate.** It is shown at the start of a session and is the Blindfold unit. Doing it never ends the lock. The session hold is served by focus-time; the until_done hold is served by a lenient photo/screenshot check.
- **Beat-the-clock is not a separate mode.** It is an optional start window on a scheduled trigger ("if I have not started within X minutes, lock anyway"). Three old modes collapse into two properties.
- **Only one session is active at a time.** Removes overlapping-lock edge cases.
- **Recurring stakes repeat.** A recurring task's scheduled stake repeats with each occurrence; a weekly summary notification reminds the user, with a one-tap edit.
- **App-picker, Opal-style, user-controlled.** The user chooses which apps get blocked via a picker (iOS `FamilyActivityPicker` with opaque tokens; Android installed-app list). The selection is editable at any time. The six never-lock categories stay protected and can never be added: phone, messages, maps, accessibility, OS settings, and Ampora itself. Enforced in code and in the picker copy.
- **Stake strength is fixed defaults plus one user control.** No automated calibration (that needed the Learning Engine, which is deferred).
- **Wellbeing spine.** Daily lock cap 180 min (user-lowerable, hard ceiling), single-session cap 50 min, quiet-hours auto-release, the six never-lock categories, a 60-second panic valve always available, de-escalation that lowers pressure and never escalates, and a stale lock reconciled (released) on app launch. Verification never traps: the panic valve and override always apply and the AI errs toward accepting.

## Verification

- **Three tiers only:** honor, focus-time (the automatic backbone and the mechanism of the session hold), and photo/screenshot (lenient AI plus a private Proof Log, used by the until_done hold). Word-count and screen-activity are deferred. Default for a new user is focus-time.
- **Focus-time pauses when you leave Ampora.** The session timer counts only while Ampora is foregrounded; backgrounding pauses it and returning resumes it. A session is not counted complete until the required focus time genuinely elapses in the foreground. Honest-by-design, since you are restricting your own device.

## Projects

- **Two work types:** Tasks (short, 1 to 2 days) and Projects (ongoing or large), created explicitly, not auto-detected by size.
- **Projects at launch are thin:** an AI-drafted editable phase list made from one line, one optional context-line paragraph, a percent bar, an end-of-session check-in (Done / Keep going / Stop here), and a nightly generator that emits one normal schedulable Task per project. No file library and no project chat at launch (both deferred). For a session that needs real material, paste it on that day's task.
- **Stakes lock against the generated session task, never the whole project.** The until_done hold is never offered against a project.
- **A task belongs to at most one project.** Deleting a project keeps and unlinks its tasks by default; the confirm dialog offers "also delete its tasks."

## Scheduling

- **FlowSavvy-parity, then better.** Match FlowSavvy's auto-scheduling as the baseline: priority-then-due ordering, hard deadlines distinct from scheduled blocks, splitting into sessions, deterministic churn-minimizing recompute, pinned blocks. Go beyond it by scheduling with breaks and by being the engine that supplies scheduled-lock times. (Energy-aware placement is deferred with the Learning Engine.)
- **Read-only calendar sync at launch;** the engine must see your classes to place sessions. Write-back is deferred.
- **The schedule is the retention hook.** Tomorrow's plan is pre-built each evening (including project-generated session tasks) so opening the app shows a ready plan.
- **Undated auto-scheduled tasks** stay on the list and may backfill into leftover free time at lowest priority, never displacing dated work.
- **Resolved scheduler edge cases:** day capacity is that day's scheduling-hours minutes minus fixed events; a real fixed event wins over a pinned task block, which reflows (never a silent drop); over-subscription keeps highest-priority plus earliest-due and surfaces the rest in the unschedulable list with a reason; an event crossing midnight splits at the day boundary; recompute on timezone change with wall-clock-local blocks; a denied notification permission degrades to in-app plus a one-time Settings nudge (no nagging).

## AI

- **Gemini, server-side.** AI is Google Gemini (`gemini-2.5-flash`) behind a Supabase Edge Function; the key (`GEMINI_API_KEY`) is a server-side secret, never in the client. With no key set, every function returns `{ error: "no_key" }` and the app falls back to local templates so nothing breaks.

## Monetization, account, platform

- **Paid app, no free tier.** A 2-week free trial then a monthly or annual subscription (annual about 10 percent cheaper per month), Apple IAP on iOS. The subscription covers AI costs. A trial-and-plans screen appears right after sign-in, and a paywall at trial end. Subscription state gates app access. A clearly dev-only bypass skips the paywall in development builds, never shipped user-facing.
- **Account required; cloud is the source of truth** with a local cache for offline and speed; no anonymous local-only mode. Sign in with Apple, Google, and email magic link (Apple required by guideline 4.8 because Google is offered). Account deletion and export in Settings.
- **Targets:** iOS and Android phones (full functionality including app-blocking) plus web (full functionality except blocking, which requires the phone). Phone ships first. English only at launch.
- **Stakes are per-device and independent;** no multi-device lock at launch.
- **MCP and the public API are post-launch** and must never gate store submission.

## Legal / operational (flagged, not code)

- A privacy policy and terms of service are required for a launch that includes minors. Privacy, GDPR, CCPA, and COPPA obligations attach regardless of business entity status.
- Apply for the Family Controls (Distribution) entitlement for all four bundle IDs at the very start; it is the single longest-lead dependency and gates the native lock. The soft in-app lock ships behind a flag while waiting; do not gate the whole launch on it.
- LLC formation is a "revisit when revenue is meaningful" decision, not a pre-launch requirement. A written co-founder agreement covering IP and revenue split is the highest-priority protective step available now. A parent serves as account holder for the Apple Developer and payment accounts given Aria's age.

---

## 2026-08-07 — screen restructure round

- **Focus tab rebuilt as a lock-first session composer, not a launcher.** The owner's direction: app-blocking is the product thesis, so the tab's one hero card must answer what task, what's on the line, and for how long, before Start is even offered. Three states in one card (idle, armed/scheduled, active). Replaces the green resume card and the green launcher card.
- **Today's focus card gets a lock chip.** One line under the meta row: armed or scheduled shows what's locked and for how long, no stake shows a ghost `Lock my apps` chip. Tap opens the stake sheet. `Start` stays the one primary and its label never changes.
- **Blue/green action-color ruling.** Blue is now the color of everything about to happen or in progress (Start, Resume, Lock in, Done, Save). Green is terminal-only (Completed, session served, celebration haptics). Supersedes `02_Design_System.md` §1.3's "green = start/run"; the current rule lives in §14.7.
- **Navigation moves from a bottom floating pill to a top in-flow segmented control (`TopSegmentedNav`), FAB becomes 52px ink.** Supersedes the "floating pill at the bottom" resolution logged above. Five tabs unchanged (PRD §8.1); the active segment now carries an icon plus a text label, inactive stays icon-only. `useTopNavClearance()` replaces `useTabBarClearance()`.
- **Calendar defaults to Agenda view.** `store/settingsStore.ts`'s `calendarView` default changed to `agenda`; a persisted user choice still overrides it. Time-grid views and every drag/zoom/resize gesture are untouched. Updates PRD FR-23.
- **Radius grows a fifth value: 14px filled primary buttons.** Joins the existing 12 (rows/cards), 18 (feature cards), 26 (focus hero), 16 (sheets), full (pills). 14 is deliberately not yet a named `radius.*` token. Logged in `02_Design_System.md` §14.7.
- **`components/ui/Text.tsx` is now the enforced typography consumption path.** Wraps the §2.2 type scale via `TYPOGRAPHY_CLASSES`, parity-tested in `core/__tests__/design-tokens.test.ts`. Hand-written `text-* font-*` combos are a violation in new code.

---

## Superseded (do not reintroduce)

These earlier decisions were replaced by the session model and the scope lock above:

- The three-mode Ignition model (Mode A "lock until I start", Mode B "lock until done", Mode C "beat the clock"), and the rule "beat-the-clock is earned after N successful lock-until-start sessions." Replaced by the `hold` plus `trigger` model; beat-the-clock is now the optional start window.
- "Start is verified by completing the First move." Replaced by "the session hold is served by focus-time; the First move is the on-ramp."
- The five-method verification spectrum (adding word-count and screen-activity). Reduced to three tiers.
- "Build the full product including the Learning Engine," energy-aware placement, and stake calibration. The Learning Engine (Focus DNA, Revealed Self, energy states, time-blindness multipliers) is deferred.
- Projects with a persistent file library (20 files/project, 25 MB/file), an agentic project chat with a client-side `ToolAction` pipeline, and study-project mastery/topic-coverage tracking. Deferred; Projects ship thin.
- Breakdown memory (per-user, per-task-type learned preferences and exemplars). Deferred; each breakdown is fresh with the Refine chat as the correction path.

All deferred items and their revival order are in `V2_Changes.md`.

---

## 2026-08-24 — session-screen correctness round

- **A task with no steps no longer claims completion.** `core/task-logic.ts`'s `nextStep` returned `{kind:'none'}` for two different situations that mean opposite things: every step finished, and there were never any steps. `components/focus/StepCard.tsx` branched on that single value and congratulated the user either way, so starting a 45 minute session on a task that had not been broken down opened with "You're done. Every step is complete. Nicely done." at 44:55 remaining. `NextStep` now carries a fourth variant, `{kind:'empty'}`, for the never-had-a-step case. Only `none` congratulates. `empty` reads "This session / No steps on this one. Just start." Callers that only ask "is there a step to mark done" (the session primary's Finish/Done label, Blindfold's exit) treat both the same and are unchanged in behavior. Covered by three new cases in `core/__tests__/task-logic.test.ts`.
- **The overwhelm valve gets its own full-width row in the session controls.** Supersedes the 2026-08-01 `DECISION_SPEC` D4 item 6 shape of "three equal quiet pills, one row." The row could not hold the copy: at 390pt each pill is 99pt wide with an 87pt content box, and "I'm overwhelmed" measures 113pt while even the shortened "Overwhelmed" measures 90pt, so the label wrapped and broke mid-word ("Overwhelme / d"). Trimming padding bought single-digit points and would still have failed at any larger Dynamic Type setting. Now "I'm stuck" and "Take a break" share one row and "I'm overwhelmed" takes the next one at full width. This restores the exact FR-61 phrase, survives text scaling, and matches the valve's real standing as the wellbeing exit rather than a third tertiary. The pills stay quiet and text-only, so "one primary action per screen" is untouched.
- **`AmbientAudioPicker` spaces its label from its value.** The session screen wraps it in `items-center` so the pill shrinks to its content, which leaves `justify-between` no free space to distribute and rendered "Ambient soundOff" as one word. A `gap-3` on the row holds at any width.

---

## 2026-08-24 — monetization, AI provider, and compliance round

- **Ampora becomes freemium. Supersedes "Paid app, no free tier" above.** The free tier is tasks, lists, tags, calendar, the auto-scheduler and a manual focus timer with no lock, and it does not expire. Paid adds the app-lock and the AI calls. The reason for the split is that those two are the only things that are either the actual differentiator or carry a real marginal cost, and the audience is 13-to-18-year-olds who mostly do not hold their own card. A paid-only wall put the payment conversation before any value was delivered. Subscription state no longer gates app access, so the paywall is always dismissible and a lapsed user keeps the whole free tier. Reflected in `01_PRD.md` FR-88.
- **Annual price is $39.99, monthly stays $6.99. Supersedes "annual about 10 percent cheaper per month".** The old wording implied roughly $74.99 a year, which is what `core/iap/MockPurchaseStrategy.ts` still carried. Aria's call is to price under the neurodivergent-planner and app-blocker categories rather than to hold a fixed percentage off monthly, so annual is now about 52 percent cheaper per month, not 10. Contribution lands near $34 per subscriber per year after the 15 percent Small Business Program commission. Anyone quoting the old "10 percent" line anywhere should treat it as retired.
- **Age gate at 13, added as FR-88a.** No age check existed anywhere before this. COPPA governs data collected from under-13s, and without a gate there is no basis for claiming Ampora does not knowingly collect it. Onboarding now takes date of birth, keeps only the derived boolean, and never persists the raw date.
- **The production sign-in bypass is removed.** `EXPO_PUBLIC_DEV_AUTH_BYPASS` is gone from `vercel.json` and `DEV_BYPASS_AUTH` is back to `__DEV__` only. It was defensible while the deployed URL was private and sign-in was broken, and it stopped being defensible the moment anything ships. It must not come back.
- **AI provider moves from Google Gemini to Anthropic Claude.** Google's Gemini API terms require the developer account holder to be 18+ and Ampora's owner is a minor. Note that Anthropic's terms carry the same 18+ requirement, so the key has to live on a parent-held account either way. This swapped the transport only: every SYSTEM prompt, the parse-and-validate step, and the `200 { error: "no_key" }` fallback contract are all unchanged.
- **Sonnet, always. Never Opus, never Haiku.** Aria's standing instruction for every AI edge function. `claude-sonnet-5` is the shipped model and `claude-sonnet-4-6` is the only sanctioned alternative. This is recorded in `supabase/functions/_shared/claude.ts` at the `MODEL` constant so a future change has to argue with it rather than drift past it.
- **One behavior note on the provider swap.** Gemini's `responseMimeType` guaranteed JSON at the wire level and Claude has no equivalent short of structured outputs. JSON-only output now rests on the prompt instruction plus `extractJson`, which strips code fences and falls back to a balanced-bracket scan. Every caller already validates before returning and an unparseable response funnels into the same local fallback as any other failure, so the user-visible contract is unchanged, but the enforcement moved from the wire to the prompt.

## 2026-08-26 — visual overhaul from the Figma source screens

**The nine Figma PDF exports became the sole authority for concrete visual values.** Aria supplied nine PDF exports of real Ampora screens (week-view, today-agenda, task-capture, ignition-lock, recovery-mode, blindfold-mode, learning-insights, voice-capture, profile-settings). `02_Design_System.md` was demoted to theme and intent only: its philosophy (§0), ADHD constraints (§9), colour semantics (§13.1), primitive mapping (§13.3), one-primary-action rule (§13.4) and the existence of the shape/colour locks (§14.7) all survive. Every concrete value in it is superseded. `01_PRD.md` §8 stays authoritative for screen names, component names and copy.

**The values were extracted from the PDF vector data, not eyeballed.** No `pdftocairo` or PyMuPDF was available, so the PDFs were parsed directly with Node's built-in `zlib`: object table, FlateDecode streams, and a full content-stream interpreter covering graphics state, CTM, clip paths, colour operators, path construction, text matrices, ExtGState alpha and Form XObject inlining. Four things had to be solved before the numbers were trustworthy: object scanning must be line-anchored (binary stream bytes fake `N 0 obj` headers), Figma nests all artwork in a Form XObject that must be inlined at the `Do` operator or the caller's colour is lost, all text is exported as Type3 glyphs whose CharProcs are empty `d1` stubs (an invisible accessibility layer, so text colour has to be recovered from the vector paths underneath), and ExtGState entries are inline dicts rather than indirect refs (resolving only refs reported every shape as opaque and hid the entire translucent-surface layer). Artboards are 402pt wide, so one PDF unit is one dp and every extracted number is a literal measurement.

**Dark-first, with light at parity.** All nine source screens are dark. Dark is now the app default (`settingsStore.themePreference` = `dark`) and is the extracted system. A light counterpart is derived from the same step relationships rather than mechanically inverted, and every pair is contrast-verified independently. The dark spine is cool-neutral, so the light theme is cool-neutral too, replacing the warm `#F7F6F3` canvas of Design System v3.

**What the source design actually contains.** A palette of fifteen colours, four of which are 6x6 categorical dots. Zero strokes (every border is a 1pt path expanded to a ribbon and halved by a clip). Zero shadows, zero gradients, zero blend modes, zero blurs. Depth is carried entirely by flat surface steps: canvas `#0C0C0E`, card `#18181B`, raised `#222226`, border `#2D2D30`. Letter-spacing measured exactly 0 on all 241 text runs, headings included, so the negative display tracking §2.2 called "the single most important detail" is simply not in the source and has been removed. This supersedes the "soft shadow used sparingly" and "tighter heading tracking" points in the Design (locked) section above.

**Outfit replaces Lexend.** Confirmed by Aria. The PDFs cannot carry the family name (Figma outlines text as Type3 glyphs with no `/BaseFont`), and the measured cap-height ratio of 0.736 fits Inter, SF Pro and Lexend equally, so it could not be inferred. Net dependency count is flat: `@expo-google-fonts/outfit` added, `lexend` and the installed-but-unused `inter` both removed.

**One accent, re-pointed.** The single general interactive accent is now the muted steel blue `#6A97AD` (with `#7CAEC4` for text and icons on dark), replacing `#2563EB`. The blue/green ruling from 2026-08-07 is unchanged in meaning: blue is about-to-do and doing, green is terminal only. Projects/AI purple moves from the saturated `#7C3AED` to the muted `#A793BD` so it sits in the same low-chroma register as the rest of the palette.

**Two WCAG failures in the source were corrected rather than shipped.**
- The mocks put a near-white `#F2F2F7` label on the `#6A97AD` accent fill. That measures **2.83:1** and fails body *and* large text. This is every primary CTA in the app. The accent hex is preserved exactly and the label moved to canvas ink `#0C0C0E`, which is 6.18:1. Every primary button now reads dark-on-blue rather than light-on-blue, which is a visible departure from the mock and was accepted deliberately. Darkening the accent instead was tested and is worse on both counts: at `#4E7285` the label only reaches 4.62 while the button itself drops to 3.79 against the canvas and stops looking like the source.
- The mocks use `#71717A` for muted text, 99 uses and mostly at 11pt. It measures 4.04 / 3.67 / 3.28 on canvas / card / raised and fails body text on all three. Replaced with `#8A8A93`, the smallest step along the same neutral line that clears 4.5 everywhere (5.71 / 5.18 / 4.63).

**Three semantic roles have no basis in the source and were proposed.** Red, orange and purple appear nowhere in the nine screens. Worse, `recovery-mode` paints "Drop" (destructive) and "Overdue by 1d" (at-risk) in the *accent*, which contradicts §13.1. Since §13.1's meanings are binding, destructive and at-risk move to a proposed red rather than inheriting the mock's accent. All three were derived in the extracted hue register (HSL S 21-29%, L 55-66%, matching `#6A97AD` and `#88B196`) and all clear AA: danger `#BD877F`, warning `#BCA076`, AI/purple `#A793BD`.

**9pt and 11pt ship as measured, overriding §9.9.** The source uses 11pt heavily (81 runs: tab labels, field labels, footnotes) and 9pt for micro labels. Design System §9.9 sets a floor of body >=15px and captions >=13px. Aria's explicit call is to use the mock sizes exactly, so §9.9's numeric floor is superseded and the rest of §9 stands unchanged. WCAG sets no minimum font size, so AA is unaffected. Note that the `textMuted` remediation above is what makes 11pt legible at all, and is therefore not optional.

**Theming mechanism: CSS variables, no `dark:` variants.** Every colour resolves through a CSS variable, so a class like `bg-canvas` or `text-neutral-900` is correct in both themes with nothing at the call site. The `neutral` ramp is mapped by ROLE rather than lightness (step 900 is always primary text, 100 is always canvas, 200 is always border), which is why roughly 843 existing call sites stayed correct without being touched. This is role-preserving, not a mechanical inversion. `white` is remapped to the card surface because all 148 `bg-white` call sites mean "card"; `black` is deliberately not remapped so scrims stay black. Any existing `dark:` class is now redundant and is being removed as files are touched.

**Superseded by this round:** the warm Stone spine and `#F7F6F3` canvas, the four-tier warm shadow ladder, the decorative-gradient presets, the negative heading tracking, the `#2563EB` primary, the `#7C3AED` Projects purple, the three-tier radius story of 12/18/26, and Lexend. The radius ladder is now the measured 2/4/6/8/10/12/14/16/18/20, with 16 dominant for cards and sheets and 12 for buttons.
