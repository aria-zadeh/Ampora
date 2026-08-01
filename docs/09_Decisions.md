# Ampora — Preferences & Decisions (living log)

> A running, plain-language log of Aria's product and design decisions and the reasons behind them, so we do not re-litigate settled calls or drift from them. The PRD Decision Log (`01` Section 13) is the formal record; this file is the round-by-round companion. Deferred features live in `V2_Changes.md` and are not decisions to build against. No em dashes, no semicolons.
>
> Kept updated whenever Aria requests a change: append a dated entry, and reflect anything binding into `01_PRD.md` and `02_Design_System.md` so the canonical docs stay authoritative. Never silently drop a prior decision, supersede it with a dated entry that says what changed and why.

---

## Design (locked)

- **Professional, calm-premium look.** The app reads as a polished real product, not a prototype. Depth via a surface ladder (background shift plus a 1px edge plus a soft shadow used sparingly), tighter heading tracking, generous varied spacing. No heavy shadows, decorative gradients, or neon. Restraint reads as premium.
- **Warm neutral spine (Design System v3 "Calm Premium").** Warm Stone, not cool Zinc: canvas is warm bone `#F7F6F3`, ink is warm near-black `#1C1917`, one warm gray family throughout (never mix warm and cool grays). Shadows are warm-tinted and ultra-diffuse. A muted-pastel `listColors` set, a `FeatureShell` nested feature-card primitive for a few focal cards, and tabular numerals for all aligned numbers. Never hardcode colors; every value is a token. `Inter` is the typeface.
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

## Superseded (do not reintroduce)

These earlier decisions were replaced by the session model and the scope lock above:

- The three-mode Ignition model (Mode A "lock until I start", Mode B "lock until done", Mode C "beat the clock"), and the rule "beat-the-clock is earned after N successful lock-until-start sessions." Replaced by the `hold` plus `trigger` model; beat-the-clock is now the optional start window.
- "Start is verified by completing the First move." Replaced by "the session hold is served by focus-time; the First move is the on-ramp."
- The five-method verification spectrum (adding word-count and screen-activity). Reduced to three tiers.
- "Build the full product including the Learning Engine," energy-aware placement, and stake calibration. The Learning Engine (Focus DNA, Revealed Self, energy states, time-blindness multipliers) is deferred.
- Projects with a persistent file library (20 files/project, 25 MB/file), an agentic project chat with a client-side `ToolAction` pipeline, and study-project mastery/topic-coverage tracking. Deferred; Projects ship thin.
- Breakdown memory (per-user, per-task-type learned preferences and exemplars). Deferred; each breakdown is fresh with the Refine chat as the correction path.

All deferred items and their revival order are in `V2_Changes.md`.
