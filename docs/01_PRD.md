# Ampora — Product Requirements Document

> Built to the Karo PRD standard (structured, testable, AI-agent ready). This document is self-contained. An engineer or an AI coding agent (Claude Code) should be able to build the app from it without further clarification. Where a behavior was previously vague, an exact decision has been made and recorded in the Decision Log (Section 13) and Assumptions (Section 15). Pair with `02_Design_System.md` (visual standard), `06_Technical_Spec_App_Blocking.md` (app-blocking), `07_AI_Breakdown_Memory_and_Subtasks.md` (Task breakdown, memory, subtask semantics), `08_Claude_MCP_and_API.md` (connecting Ampora to Claude, and the portable engine), `09_Ignition_Verification.md` (how a stake verifies you started or finished a task), `10_Projects.md` (Projects as a first-class type with their own files, chat, and progress), and `12_Preferences_and_Decisions.md` (the living round-by-round log of Aria's product and design preferences, kept current on every change request).
>
> **Author style:** no em dashes, no semicolons, direct. Tables, numbered requirements, pseudocode, and Gherkin are used throughout.

## Table of Contents
0. [Version & Ownership](#0-version--ownership)
1. [Executive One-Pager](#1-executive-one-pager)
2. [Overview & Context](#2-overview--context)
3. [Customer Insights & Evidence](#3-customer-insights--evidence)
4. [Goals & Non-Goals](#4-goals--non-goals)
5. [Alternatives Considered + Multi-Perspective Critique](#5-alternatives-considered--multi-perspective-critique)
6. [Personas & Use Cases](#6-personas--use-cases)
7. [Requirements (Functional, Non-Functional, Acceptance Criteria)](#7-requirements)
8. [UX, Exact UI Naming & Copy](#8-ux-exact-ui-naming--copy)
9. [Technical Notes (Architecture & Algorithms)](#9-technical-notes)
10. [Metrics & Success Criteria](#10-metrics--success-criteria)
11. [Risks & Mitigations](#11-risks--mitigations)
12. [Rollout Plan](#12-rollout-plan)
13. [Decision Log](#13-decision-log)
14. [Success Story Narrative](#14-success-story-narrative)
15. [Open Questions & Assumptions](#15-open-questions--assumptions)
16. [Glossary](#16-glossary)
- [Appendix A: Quality Check Report](#appendix-a-quality-check-report)
- [Appendix B: AI Gap Report](#appendix-b-ai-gap-report)

---

## 0. Version & Ownership
- **Product:** Ampora (formerly Focal / Dandelion).
- **Version:** 2.0 (full rebuild spec). Date: 2026-06-30.
- **Owner:** Aria Zadeh (solo founder/dev, building with Claude Code).
- **Reviewers:** none formal yet. Co-design input from Garrett (ADHD co-designer, original Focal project).
- **Implementation target:** AI coding agent + founder.

---

## 1. Executive One-Pager

**TL;DR (5 bullets)**
1. **Problem:** Students who procrastinate and people with ADHD do not fail at scheduling, they fail at starting. Auto-calendars (FlowSavvy) optimize time but never move behavior, so a perfect schedule still loses to Instagram.
2. **Goals:** Ship a best-in-class auto-scheduler equal to FlowSavvy in quality, plus three differentiators: schedule the real you (behavioral learning), make starting free (initiation layer), and make slacking cost something now (lock your own apps).
3. **Scope:** Full task and calendar system, on-device scheduling engine, polished calendar UI, app-locking (Ignition), Learning Engine, voice/grounded capture, Recovery, Blindfold. iOS first, Android fast-follow.
4. **Success metrics:** Median reminder-to-first-action under 20 min, staked tasks complete more than unstaked with panic-valve use under 15%, over 50% of users resume within 2 days of a lapse, calendar holds 60fps, recompute under 300ms.
5. **Launch:** TestFlight after Milestone 4 (the lockable demo), public launch when the first session reliably reaches "I locked an app and started."

**Plain-language summary:** Ampora is a calendar that plans your week around how you actually behave, hands you a two-minute first step so starting is easy, and lets you lock your own apps (Instagram, games) behind a task so blowing it off costs you right now. When you fall behind, one tap rebuilds your week with no guilt.

**Build status (v1, 2026-07-01).** The rebuild is BUILT and shipping. It typechecks at zero `tsc` errors and web-exports cleanly. Shipped: task system + quick-add + lists/tags; the on-device deterministic scheduler; the full calendar (Day/3-Day/Week/Month/Agenda) with drag; AI breakdown (Claude via Supabase Edge Functions, with on-device fallbacks); focus session + Blindfold + verification; Ignition soft-lock + wellbeing (panic valve, caps, cooldowns, quiet-hour auto-release, never-lock categories); the Learning Engine (Focus DNA / Revealed Self / Energy) + Recovery; notifications; local-first cloud sync (schema applied); Projects (hub/detail/chat/progress/next-session); and full settings + a 2-week trial paywall. The design system (`02_Design_System.md`) is implemented as tokens + primitives. **Gated / deferred:** iOS OS-level app-locking is behind `FEATURE_FLAGS.IGNITION_NATIVE` (Apple Family Controls entitlement pending; the soft in-app lock ships today); live AI needs `ANTHROPIC_API_KEY` set as a Supabase secret + the edge functions deployed (otherwise local fallbacks run); subscription IAP is scaffolded (trial/entitlement logic only, StoreKit purchasing later); Android stakes, calendar-write sync, widgets, desktop hard-blocking, and MCP/public API remain P2–P3 per the Rollout Plan (§12).

---

## 2. Overview & Context

**2.1 Problem statement (why now).** The behavior gap (the 30 seconds before starting, and the zero cost of slacking in the moment) is unsolved by every leading tool. Three enabling shifts make solving it feasible solo in 2026: OS-level self-restriction is mature and sanctioned (Apple Family Controls / Screen Time, Android UsageStats), cheap personal LLMs make behavioral parsing and grounded task breakdown feasible without a data team, and ADHD/procrastination identity content is a large, sharing-heavy audience.

**2.2 Strategic alignment.** This is a consumer behavior-change app with a viral hook (lock-your-apps) and a defensible moat (a behavioral model of one user plus a brand people identify with). It also serves the founder's engineering and college narrative as a flagship artifact regardless of commercial outcome.

**2.3 Competitive snapshot.**
| Category | Examples | Promise | Gap Ampora fills |
|---|---|---|---|
| AI calendars | FlowSavvy, Motion, Reclaim | Schedule your time | Schedule your intentions; slacking stays free |
| Task managers | Todoist, TickTick, Notion | Organize tasks | The list is the wall, not the cure |
| Focus / blockers | Opal, Forest, One Sec | Block distractions | Disconnected from your schedule and tasks |
| ADHD tools | Tiimo, Goblin.tools, Inflow | Help ADHD function | Point tools, often deficit-framed |

FlowSavvy is the quality benchmark and closest competitor: beloved, polished, solo-built, with a public API and MCP server. Ampora must match its scheduler and win on behavior.

---

## 3. Customer Insights & Evidence

**3.1 Primary (co-design).** Garrett, an ADHD high-school student and the co-designer of the original Focal app. Documented profile: struggles with task initiation, poor time estimation, deadline-driven late-night work, stress when overwhelmed, finds constant notifications annoying, most energetic midday, essays and open-ended projects are hardest while structured math packets are manageable.

**3.2 Secondary (public review sentiment, paraphrased from FlowSavvy app-store reviews).** ADHD users repeatedly describe the core value as removing the anxiety of rearranging a plan when they inevitably miss things, and praise a free-tier-heavy model. Users also ask for things FlowSavvy lacks, including a lifetime pricing option and better handling of missed repeating tasks. These signals confirm both the audience demand and specific openings.

**3.3 Evidence gaps (honest).** There is no first-party quantitative research or analytics yet (pre-launch). All numeric targets in Section 10 are targets, not observed metrics. This is flagged in Appendix A (Evidence Rigor) and Appendix B.

---

## 4. Goals & Non-Goals

**4.1 Primary goals**
- G1. Match FlowSavvy-grade auto-scheduling quality and polish.
- G2. Reduce time-to-start (the initiation gap).
- G3. Make slacking carry an immediate, consensual cost (Ignition) without harming wellbeing.
- G4. Schedule the real user via behavioral learning.
- G5. Make recovery from a lapse frictionless and shame-free.

**4.2 Non-goals (prevent scope creep)**
- N1. No team or enterprise features (single-player only).
- N2. No social network / public feeds / leaderboards at launch.
- N3. No medical or clinical claims; not an ADHD treatment.
- N4. No manufactured financial or public-shame stakes (only self-imposed app-locking). See Section 5.
- N5. No habit-streak gamification with shame mechanics.
- N6. No web app-blocking (browser cannot enforce it); web keeps the non-blocking feature set.

---

## 5. Alternatives Considered + Multi-Perspective Critique

This section both records rejected directions and critiques the prior spec from four perspectives, with the resolution now baked into Section 7.

**5.1 Rejected directions**
| Direction | Why rejected |
|---|---|
| Manufactured financial/public-shame stakes ("Ignition" hard version) | Wellbeing and liability risk, especially minor-to-minor. Replaced by self-imposed app-locking only. |
| Handler Duty (asymmetric body-doubling) | Requires two-sided live liquidity a solo builder cannot cold-start. |
| Falconry vocabulary in the UI | Opaque to a stressed teenager. Kept only as private design language. |
| "Future self" video confrontation | Predecessors flop on avoidance; people will not confront themselves on video. |
| Generic AI task breakdown without source material | Inaccurate for tasks with specific steps. Replaced by source-grounded breakdown. |

**5.2 Critique from four perspectives (and resolutions)**

*The Outsider (a stressed 15-year-old who has never heard of this):*
- C1. Terms like "auto-schedule," "scheduling hours," "buffer," "splittable," "min block" are jargon. **Resolution:** friendly labels plus one-line helper text, advanced fields behind a "More options" disclosure (Section 8).
- C2. "Due date" vs "when I will do it" is confusing and causes missed deadlines. **Resolution:** the editor labels it "Due (the real deadline)" with helper text, and shows a separate scheduled-time concept visually distinct from the deadline (FR-12, Section 8).

*The ADHD user (the target):*
- C3. Beat-the-clock punishment-locks can trigger shame and rejection-sensitivity churn. **Resolution:** beat-the-clock is OFF by default, gated behind several successful lock-until-start sessions, framed as an opt-in challenge, and governed by de-escalation (FR-41 to FR-47).
- C4. A manual daily energy slider will be forgotten. **Resolution:** the energy check-in is optional, inferred from data when possible, pre-filled, and never blocks use (FR-55).
- C5. Revealed Self ("your data says 9:40") can feel like a callout. **Resolution:** strict non-shaming copy framed as "so the plan survives," always a suggestion, never auto-applied (FR-52).
- C6. A wall of overdue red items causes paralysis and shame. **Resolution:** overdue is a quiet dot plus a gentle Recovery nudge, never a shaming banner (FR-30, Section 8).

*The skeptical PM / FlowSavvy power user:*
- C7. The prior spec under-specified dependencies, scheduling-hours date overrides, partial-completion math, and external busy/free rules. **Resolution:** all specified (FR-9, FR-13, FR-18, FR-22).
- C8. Overdue repeating tasks doubling up (FlowSavvy's known complaint) was not nailed down. **Resolution:** default is drop-missed-occurrence, configurable per task (FR-16).

*The engineer / AI agent:*
- C9. "Smooth calendar" was not buildable without exact pixels, zoom stops, snap increments, font thresholds, and an overlap algorithm. **Resolution:** specified in FR-23 to FR-28 and the Design System.
- C10. "Lock apps" hand-waved the iOS reality (privileged entitlement, extensions, opaque tokens, escape-hatch wiring). **Resolution:** companion spec `06_Technical_Spec_App_Blocking.md`.
- C11. The scheduler must be deterministic and minimize churn, not reshuffle everything each recompute. **Resolution:** stability requirement plus pinned blocks (FR-21, NFR-2).

---

## 6. Personas & Use Cases

**6.1 Persona: Garrett (primary, ADHD).** See 3.1. Jobs-to-be-done: "Tell me the one thing to do now," "Get me to actually start," "Do not let me doomscroll instead," "Rescue my week when I fall behind without making me feel bad."

**6.2 Persona: Ambitious Procrastinator (secondary).** A 4.0-chasing student who does brilliant work only under last-minute pressure, juggles many classes and activities, and is online a lot. JTBD: "Plan everything so nothing slips," "Give me pressure on demand so I start," "Make my night-before crunch less chaotic."

**6.3 Key use cases (scenarios)**
- UC1. Add a week of assignments by voice in 60 seconds, see them scheduled.
- UC2. At 11 PM facing a dreaded essay, lock Instagram until the first sentence is written.
- UC3. Miss two days, open the app, tap one button, get a rebuilt week.
- UC4. Feel overwhelmed by a full calendar, collapse it to one step.
- UC5. A 12-hour project spreads itself into 2-hour sessions across the week.
- UC6. The app notices math always starts 2 hours late and offers to schedule it when the user really starts.

---

## 7. Requirements

Requirements are numbered (FR-#, NFR-#) and tied to goals (G#). Acceptance criteria are Gherkin. This section is the build checklist. Exact labels and copy are in Section 8 and referenced by name.

### 7.1 Functional Requirements

**Tasks, lists, capture**
- FR-1 (G1). The app supports Events (fixed, never auto-moved), Tasks (checkable to-dos), and within Tasks an Auto-schedule toggle. Auto-scheduled tasks are placed by the engine; fixed tasks have a user-set time and behave like events you check off. Data model per `01` Section 4 of v1 (carried, see Section 9.4).
- FR-2 (G1). Full task editor exposing every field in Section 8.3, with advanced fields behind "More options."
- FR-3 (G2). Quick-add field with natural-language parsing (Section 9.6) that previews parsed fields before saving.
- FR-4 (G2). Voice capture ("Brain dump"): record, transcribe, parse, preview, confirm.
- FR-5 (G1). Inbox for detail-less quick capture; Inbox items are not scheduled until given duration and due date.
- FR-6 (G1). Lists/Projects (one per class/area, color-coded), Tags, full-text Search, Filters (list, tag, priority, due range, scheduled/unscheduled, has-stake), Sorting (due, priority, manual, duration), and smart views (Today, Upcoming, Overdue, Unscheduled, Stakes active).
- FR-7 (G2). Source-grounded breakdown: a task may carry attached source material (paste, file/photo, or voice). The breakdown ("Break it down") derives subtasks from the real requirements when source is present. Rules in Section 9.7.
- FR-8 (G2). Every task gets one "First move" (2 to 5 min, concrete). Subtasks editable, reorderable, deletable; per-subtask "Make easier"; a "Refine" chat regenerates the breakdown from a user instruction. Breakdown memory per Section 9.7.

**Scheduling engine**
- FR-9 (G1). The on-device engine places auto-scheduled tasks into free time before each task's Due, honoring: duration minus progress, Start-after, Scheduling-hours profile, Split toggle with Minimum/Maximum block, buffers before/after, dependencies, priority, and (soft) energy match. Algorithm in Section 9.5.
- FR-10 (G1). Ordering. Default standard mode orders by priority then Due (Urgent>High>Medium>Low, then earliest Due). A "Due date only" mode (Settings) orders strictly by Due. Ties broken by manual order then creation time. Deterministic.
- FR-11 (G1). Task splitting. Splittable tasks break into sessions sized per Section 9.5.4, never below Minimum block, never above Maximum block, balanced or front-loaded per the Workload setting. Also a one-tap "Split into sessions" helper that pre-creates a repeat rule (FR-15).
- FR-12 (G1). Due is a hard deadline, not a reminder. The scheduled block(s) are distinct from Due and rendered distinctly (Section 8).
- FR-13 (G1). Scheduling-hours profiles (for example "Study hours," "Personal hours") with a weekly template and date overrides. Each task selects which profile it may occupy.
- FR-14 (G1). Workload distribution setting: Balanced (even daily load) or Front-load (as soon as possible). Auto-switch a task to front-load when it is near or past Due. Logic in Section 9.5.3.
- FR-15 (G1). Recurring tasks/events via the RecurrenceRule model (daily/weekly/monthly/yearly, every-N, by-weekday, by-monthday, from-completion option, per-occurrence start window, ends never/after-N/on-date, exceptions).
- FR-16 (G1, C8). Missed repeating occurrences default to drop (do not stack two on the next day). A per-task toggle allows carry-forward.
- FR-17 (G1). Auto-schedule cutoff (default 2 weeks, user-raisable with a compute-cost warning). Tasks due beyond the cutoff stay on the to-do list and schedule automatically when they enter the window. Days past the cutoff render with gray stripes.
- FR-18 (G1). Partial completion. Recording progress means only the remaining duration is scheduled on the next recompute. Progress bar shown.
- FR-19 (G1). Dependencies. A task is not placed until all its prerequisites are fully placed earlier in time. Topologically enforced.
- FR-20 (G1). Unschedulable tasks are never silently dropped. They stay on the to-do list, are flagged at-risk, and the app explains why with a one-tap fix (relax scheduling hours, extend deadline, make splittable, remove blocking all-day event).
- FR-21 (G1, C11). Recompute triggers: on task create/edit/delete/complete (debounced 300 ms), on the manual "Rebuild schedule" action, on a daily background pass and on app open, and after Recovery. Recompute is stable: blocks that need not move do not move; only changed blocks animate. Pinned blocks never move.
- FR-22 (G1). Calendar sync (Google, Outlook, iCloud). Read external events as busy blocks. Optional write-back. Auto-scheduled task blocks are marked Busy externally only within the external-busy buffer window of their Due, else Free. Fixed tasks always Busy externally. External events always win their own time.

**Calendar UI**
- FR-23 (G1). Views: Day, 3-Day (default on phone), Week, Month, Agenda. Pill switcher. Remembers last view.
- FR-24 (G1). Time grid with pinch-to-zoom hour height across defined stops (40/60/80/120 px per hour), persisted. Sticky day header. Fixed time gutter (44 px). Current-time line updating each minute.
- FR-25 (G1). Block geometry: top = minutesFromGridStart * pxPerMin; height = max(durationMin * pxPerMin, 22 px). Overlap clusters lay out side by side via the interval-graph algorithm in Section 9.8.
- FR-26 (G1). Dynamic block typography: title/time/list shown or hidden by block height and width thresholds (Section 8.7); never clip, always ellipsis.
- FR-27 (G1). An auto-broken task renders as one block spanning its total duration with an "N steps" label, not many tiny blocks. Split sessions (different times) render as separate blocks.
- FR-28 (G1). Calendar gestures at 60fps: vertical scroll, horizontal paged swipe between ranges, long-press-drag to reschedule (snaps to 5-min grid, becomes pinned, light haptic on pick-up and drop), drag top/bottom edge to resize, long-press empty space to create, tap to open detail sheet, tap checkbox to complete inline.

**Ignition (app-locking)**
- FR-40 (G3). Stake apps: the user selects their own leisure apps via the native picker (iOS FamilyActivityPicker, opaque tokens; Android installed-app list), Opal-style, so the user controls exactly what gets blocked. The block list is editable at any time and the user may add their own apps freely. The six never-lockable categories (phone, messages, maps, accessibility, OS settings, Ampora) are always protected, stay reachable, and can never be added to the list. Enforced in code (client and server) and in the picker copy.
- FR-41 (G3). Mode A "Lock until I start" (default): stake apps shield until the First move is marked done. Mode B "Lock until done": until the task/subtask is complete. Mode C "Beat the clock": start within X minutes or stake apps lock for a bounded cooldown. Mode C is a launch feature (it serves the core loop). A cooldown lock ends early if the task is completed during the cooldown. The wellbeing caps and de-escalation (14.4, 9.10) still govern it, and it is introduced after the user has used Lock until I start so nobody meets the hard version cold.
- FR-41b (G3). Stakes are per-device and independent. A lock started on one device does not lock another device. No multi-device lock at launch.
- FR-42 (G3). Panic valve ("Unlock early"): always available emergency unlock behind 60 seconds of friction (countdown plus a calm message). Required for App Store and wellbeing.
- FR-43 (G3, C3). De-escalation: repeated panic-valve use or repeated misses or a low energy state reduce stake strength, suggest a break, and offer "Pause stakes for today." The app never answers distress with more pressure.
- FR-44 (G3). Stake calibration: strength is tuned by the Learning Engine within wellbeing caps (Section 9.10).
- FR-45 (G3). Session lifecycle and edge cases per Section 9.9 and the companion blocking spec (shield persists across app kill/restart, auto-expires at the daily cap and quiet-hours boundary, never locks overnight).
- FR-46 (G3). Wellbeing caps enforced: daily total lock cap (default 180 min, user-lowerable, hard ceiling), single-cooldown cap (default 30 min), quiet-hours auto-release. Specified in Section 9.10.
- FR-47 (G3). A focus session may carry a stake (start with apps locked until the session goal).

**Learning Engine**
- FR-50 (G4). One behavioral model ingests BehavioralSignals (planned vs actual start, completion by hour/day/task-type, lapse/recovery, optional energy/sleep/gym, stake outcomes) and powers four surfaces.
- FR-51 (G4). Surface "Focus DNA": a stable personal summary screen with plain-language insights and one-tap actions, plus per-task-type estimation multipliers (time-blindness) applied as soft padding. Algorithm in Section 9.5.5 and 9.5.6.
- FR-52 (G4, C5). Surface "Revealed Self": at schedule time, when the gap between stated and revealed start is large and consistent, suggest rescheduling to the real slot, non-shaming, always optional. Trigger logic in Section 9.5.7.
- FR-53 (G4). Surface "Energy / State": a real-time "what can you handle now" view (low/normal/hyper) that re-sorts today (Section 9.5.8).
- FR-54 (G4). Surface "Stake calibration": feeds FR-44.
- FR-55 (G4, C4). Cold start: first 7 to 14 days use defaults with a subtle "still learning" state; no confident Revealed Self claims before there is data. Energy check-in optional and inferred.

**Recovery, Blindfold, Focus, Notifications, Onboarding, Settings**
- FR-60 (G5). Recovery Mode: triggered by opening after a lapse (2+ days of missed blocks) or "Catch me up." Reprioritizes by what matters now (drop moot past-due items per FR-16 rules, bump now-urgent), rebuilds the week, shows a preview, accepts in one tap, copy "Rebuilt your week," zero shame.
- FR-61 (G2). Blindfold Mode: "I'm overwhelmed" hides everything and shows one micro-step (the First move or smallest next subtask); the next is hidden until the current is swiped done. Can pair with a stake.
- FR-62 (G2). Focus session: full-screen, current step large, optional Pomodoro (default 25/5), ambient audio (white/brown noise, rain, cafe), buttons "I'm stuck" (AI simplify), "Take a break," "I'm overwhelmed," "Done." Logs a BehavioralSignal on completion.
- FR-63 (G1). Notifications: rate-limited (default max 1/hour; Due<12h up to 1/30min; Due<2h up to 1/20min; max 3 start-reminders/day/task), quiet hours (default 23:00 to 08:00), DND-respecting, snoozeable (30/60), warm and never shaming. Types and copy in Section 8.9.
- FR-64. Onboarding flow per Section 8.10. Never blocks use behind a permission; degrades gracefully.
- FR-65. Settings per Section 8.11 expose every configurable value.

**AI memory, subtasks, and integrations** (full specs in `07` and `08`)
- FR-70 (G2, G4). Breakdown memory. A per-user, per-task-type store learns from the user's edits, refine instructions, and completion fidelity, and is injected into future breakdowns (summarized preferences plus the user's own past accepted breakdowns as few-shot examples). Per-user and local-first; no cross-user training. Mechanism in `07` Part 2.
- FR-71 (G1, G2). Subtask semantics. The task (not the subtask) is the schedulable unit. Parent duration equals the sum of subtask estimates; completing subtasks advances progress and shrinks the remaining scheduled time; the next uncompleted subtask is the surfaced "current step"; an auto-broken task renders as one block per session, not many tiny blocks. An optional `Schedule subtasks separately` toggle (off by default) time-boxes each subtask. Full semantics, including recurrence and stakes interactions, in `07` Part 3.
- FR-72 (G2, G4). Breakdown grounding pipeline. When source material is attached (paste, file/photo via OCR, or voice), the breakdown derives steps from the real requirements, numbered steps, or rubric criteria, not a generic template. `Refine` regenerates conversationally. Pipeline and prompt structure in `07` Part 1.
- FR-73 (G1). Claude connection (MCP). A hosted MCP server exposes the full task, event, schedule, breakdown, and focus surface to Claude (OAuth or API-key auth), operating only on the authenticated user's own data. Stakes are read/configure only over MCP, never a remote device lock. Tool surface in `08` Section 2.
- FR-74 (G1). Public API. A REST or GraphQL API with the same operations as the MCP tools, API-key auth, rate-limited.
- FR-75 (NFR-2). Portable engine. The scheduling engine and the breakdown/memory modules are pure portable TypeScript with no platform dependencies, packaged once and run both on-device (instant, offline) and in Edge Functions (for Claude/MCP and the API), producing identical results. Architecture in `08` Section 1.
- FR-76 (G2). Custom and voice breakdown. The task editor offers `Break it down` (AI authors), `Write my own` (manual steps), and `Speak my own` (voice). For the user-provided modes, the AI cleans and structures the input without changing the plan or inventing steps (split into subtasks, preserve wording and intent, add time estimates, ensure a concrete First move, fix obvious ordering, remove filler). Spec in `07` Part 1C.
- FR-77 (G3). Ignition verification. A stake's start or completion is verified by a chosen method: honor, focus-time (app-verified time in a focus session, the recommended default), photo or screenshot proof with a lenient AI plausibility check and a private Proof Log, word-count, or screen-activity (the optional screen-aware tier). Start is verified by completing the First move. Full spec and the unlock flow in `09`.
- FR-77b (G3). Focus-time verification pauses when you leave the app. During a focus session the timer counts only while Ampora is in the foreground: leaving the app (backgrounding or switching away) pauses the timer, and returning resumes it. A task guarded by focus-time verification is not marked complete until the required focus duration has genuinely elapsed in the foreground. This is honest-by-design (the user is restricting their own device, so faking only cheats themselves). The panic valve and the "Unlock anyway" override still always apply, and repeated overrides trigger de-escalation, never more demands (FR-78).
- FR-78 (G3, NFR-6). Verification never traps. Every method has the panic valve and, for image proof, an "Unlock anyway" override. The AI check errs toward accepting (a false rejection is treated as worse than a false accept). Repeated overrides or panic use trigger de-escalation, never more demands. No shame copy on any failed or overridden verification.
- FR-79 (G2). Multi-day projects. A task large enough to span days (long duration, splittable across many days, marked Project, or AI-classified as project-scale) uses a two-level model: a mostly stable ordered list of phases, and a dynamic per-session breakdown generated from current progress and session length. The First move and session steps are always relative to where the user is now, so they change as progress advances and are determinable even for a huge vague task. Stakes lock against the per-session goal, not the whole project. Spec in `07` Part 1D.
- FR-80 (G2). Source in every mode. Source attachment (paste, PDF, photo, screenshot, voice) is available in AI-authored, `Write my own`, and `Speak my own` breakdown. A source that already lists the steps (a rubric, a numbered problem set, a worksheet) is extracted directly as the breakdown. Spec in `07` Part 1.3.
- FR-81 (G4). Claude context channel. `break_down_task` accepts an optional external context; when a breakdown runs through the Claude connection, Claude can supply what it knows about the user and the exact task as extra grounding, layered on the local memory and source. Optional, off the default in-app path. Spec in `07` Part 1C.6 and `08` Section 2.5.

**Projects (a first-class type, distinct from Tasks)** (full spec in `10`)
- FR-82 (G2). Two work types. Ampora has Tasks (short, 1 to 2 days, breakdown per `07`) and Projects (ongoing or large, often recurring). Projects are created explicitly, not auto-detected by size.
- FR-83 (G2, G4). Project knowledge base. A project keeps a persistent library of multiple uploaded files (PDFs, slides, notes, images) that stay in the project and are ingested (OCR plus retrieval) so the AI understands them collectively when generating tasks, answering, or quizzing.
- FR-84 (G2, G4). Project chat is an agentic study-plan planner. Each project has a scoped conversational interface whose purpose is to organize the study plan and, using tools, act on it: create, modify, reschedule, and regenerate the project's tasks, plan, breakdowns, and memory. It answers from the project's files and state and it acts. It is the primary controller and the universal repair mechanism, so an imperfect result is fixed by messaging it. It is a planner, not a tutor: its job is to organize the work, not to quiz the user. (The tool-calling layer that lets the chat change tasks/schedule/memory is a forward-looking capability; the chat plans and grounds today and gains tools over time.)
- FR-85 (G2, G4). Project progress and task generation. Projects track progress (phases plus percent for deliverables, topic coverage plus mastery for study projects), learn over time within scope (decisions, style, weak spots), and generate the next session as a normal schedulable Task whose First move is computed for the current position. Stakes lock against the generated session task, never the whole project.
- FR-87 (G2). Authentication and sign-in. An account is required. Onboarding offers Sign in with Apple, Sign in with Google, and email magic link (Sign in with Apple is required by Apple's guideline because Google is offered). All data syncs to the cloud as the source of truth, with a local cache for offline use and speed. There is no anonymous local-only mode. Account deletion and data export are available in Settings.
- FR-88 (business). Subscription and trial. Ampora is a paid app with no free tier. New users get a 2-week free trial, then a monthly or annual subscription (annual is about 10% cheaper per month). On iOS this uses Apple In-App Purchase with an introductory free trial. Immediately after sign-in, a real-app trial-and-plans screen presents the 2-week free trial and the monthly and annual plans; a paywall also appears at the end of the trial. Subscription state gates app access (not individual features, since there is no free tier). A clearly dev-only bypass lets development and test builds skip the paywall; it is never shipped as a user-facing "skip".
- FR-89 (platform). Targets. iOS and Android phones (full functionality including app-blocking), plus a web app with full functionality except app-blocking, which requires the phone (the web app can manage tasks, projects, schedule, and configure stakes, but the lock is enforced on the phone). English only at launch.
- FR-90 (G5). Pre-built tomorrow's plan (the retention hook). Each evening (or overnight) the app prepares tomorrow's schedule so that opening the app shows a ready plan, and the auto-rebuilding schedule is the reason to return daily. Surfaced as "Ready for tomorrow" with the day's first task and First move.

### 7.2 Non-Functional Requirements
- NFR-1 (Performance). Calendar interactions sustain 60fps on a mid-range phone. Block drag/resize never drops frames (Reanimated worklets + Gesture Handler; move the time grid to Skia if needed).
- NFR-2 (Performance/Correctness). A full recompute for a typical user (hundreds of tasks over 2 to 8 weeks) completes under 300 ms and is deterministic and churn-minimizing.
- NFR-3 (Offline). Tasks, calendar, scheduling, Focus, Blindfold, and Recovery work fully offline (engine is local). AI and sync degrade gracefully with clear messaging.
- NFR-4 (Privacy/Security). Local-first; minimize synced data; behavioral data stays on device where feasible. No ad SDKs, no selling/sharing behavioral data. iOS stake apps are opaque tokens, never de-anonymized. AI calls send only needed content, no identity. Secrets in Edge Function config. Age floor 13. COPPA-safe.
- NFR-5 (Accessibility). WCAG 2.1 AA targets: full dynamic type without layout breakage, color never the only signal, VoiceOver/TalkBack labels on all interactive elements including calendar blocks and drag handles, contrast in both themes, reduced-motion mode, 44x44 min tap targets. Checklist in Section 8.12.
- NFR-6 (Wellbeing). The Section 9.10 safety layer overrides feature behavior. No medical claims anywhere.
- NFR-7 (Reliability). App-blocking must fail safe: if a shield cannot be applied or the OS state is uncertain, never trap the user; default to unlocked and log. See blocking spec.

### 7.3 Acceptance Criteria (Gherkin, key flows)

```gherkin
Feature: Auto-schedule a new task
  Scenario: Task fits before its deadline
    Given I am on the Tasks tab
    And my Study hours are Mon-Fri 3:00 PM to 9:00 PM
    When I add "Read Chapter 11" with duration 60 min, due Friday 11:59 PM, auto-schedule on
    Then a 60-min block appears in my calendar within Study hours before Friday
    And the block is color-coded by deadline slack
    And no existing pinned block is moved

Feature: Recalculate after falling behind
  Scenario: Missed blocks are re-placed
    Given I missed two scheduled task blocks yesterday
    When I tap "Catch me up" (or open the app after a 2-day lapse)
    Then past-due moot occurrences are dropped per my settings
    And remaining work is rebuilt into upcoming free time respecting progress
    And I see a preview and the message "Rebuilt your week"
    And no shame or broken-streak language appears

Feature: Split a large task
  Scenario: 12-hour project across a week
    Given I add a 12-hour task due in 6 days, splittable, min block 60 min, max block 120 min, Balanced
    When the engine runs
    Then the task is placed as multiple sessions each between 60 and 120 min
    And daily load is roughly even across the available days
    And no session is shorter than 60 min

Feature: Missed repeating task does not stack
  Scenario: Skipped workout
    Given a daily "Workout" repeating task with drop-missed default
    When I miss Monday's occurrence
    Then Tuesday still shows only one "Workout"
    And Monday's occurrence is not carried into Tuesday

Feature: Drag to reschedule pins a block
  Scenario: User overrides the engine
    Given an auto-scheduled block at 4:00 PM
    When I long-press and drag it to 7:00 PM and release
    Then it snaps to the 5-min grid at 7:00 PM
    And it becomes pinned
    And future recomputes do not move it
    And other tasks reflow around it

Feature: Lock until I start (Ignition happy path)
  Scenario: Start a dreaded task with Instagram locked
    Given I have selected Instagram as a stake app and granted Screen Time permission
    And I attach a stake "Lock until I start" to "Write essay intro"
    When I begin the session
    Then Instagram is shielded
    And a banner shows what is locked and the unlock condition
    When I mark the First move done
    Then Instagram unshields automatically
    And the outcome is logged

Feature: Panic valve de-escalation
  Scenario: User repeatedly needs out
    Given I am in a staked session
    When I tap "Unlock early"
    Then I see a 60-second countdown and a calm message
    And after 60 seconds the stake apps unlock
    When I use the panic valve repeatedly in a short window
    Then the app offers "Pause stakes for today" and lowers stake strength
    And it never increases pressure

Feature: Revealed Self suggestion
  Scenario: Chronic late start
    Given over the last 10 instances I plan math at 7:00 PM but start near 9:40 PM
    When I next schedule a math task
    Then the app suggests booking it near 9:40 PM in non-shaming language
    And applies the change only if I accept

Feature: Wellbeing caps
  Scenario: Daily lock cap reached
    Given my daily lock cap is 180 minutes and I have hit it
    When I try to start another staked session
    Then stakes are unavailable until tomorrow
    And any active lock auto-releases at the quiet-hours boundary
    And the never-lock categories are never shielded

Feature: Blindfold mode
  Scenario: Overwhelm to one step
    Given my calendar shows 15 items
    When I tap "I'm overwhelmed"
    Then the calendar disappears and only one micro-step is shown
    And I cannot see the next step until I swipe the current one done

Feature: Calendar zoom and render
  Scenario: Dense day stays legible
    Given a day with overlapping and very short blocks
    When I pinch to change hour height
    Then blocks reflow smoothly between zoom stops at 60fps
    And short blocks show a truncated title without clipping
    And overlapping blocks lay out side by side
```

---

## 8. UX, Exact UI Naming & Copy

This section removes ambiguity by naming every primary screen, control, and key string. Visual styling is governed by `02_Design_System.md`.

**8.1 Tabs (bottom bar):** `Today`, `Calendar`, `Tasks`, `Focus`, `Profile`.

**8.2 Today screen**
- Header: "Good morning, {name}." (time-of-day variant) and a chip "Your best time today: {window}".
- "Urgent" strip: tasks due within 24h, each a row with a quiet red dot (never a shaming banner).
- "Today's focus" card: one AI-recommended task as a card with a checkbox, and below it the "First move" card.
- First move card: the AI starter-action text and a primary button labeled `Start`. Secondary text button `Not now`.
- Always-visible ghost button: `I'm overwhelmed` (triggers Blindfold).
- FAB `+` (opens quick-add sheet). A mic button labeled `Brain dump` in the quick-add sheet.
- Empty state: "You're all caught up." (invitation tone).

**8.3 Task editor (field labels and controls)**
Title, Notes, List, Tags, Priority (`Low` / `Medium` / `High` / `Urgent`), Auto-schedule (toggle, default on), Duration, `Due (the real deadline)` with helper "When it must be done by, not when you'll do it", Start after, Scheduling hours, `Split into sessions` (toggle) with `Minimum block` and `Maximum block`, Buffer before / Buffer after, Repeat, Depends on, Energy needed (`Low`/`Medium`/`High`), Color (`Smart` default or custom). Source attach button: `Add assignment details` (paste / upload / voice). Breakdown button: `Break it down`. Save button: `Save task`. Advanced fields (Start after, Scheduling hours, Split, buffers, dependencies, energy) live under a `More options` disclosure.

**8.4 Breakdown UI**
Subtask list with checkboxes; per-subtask `Make easier`; a `Refine` button opening a chat input with placeholder "Tell me how to break this down differently". The starter action is labeled `First move`.

**8.5 Tasks tab**
Segments `Overdue` / `Today` / `This week` / `Later`; an `Inbox` section with a swipe action `Schedule`; a collapsible `Completed` section (collapsed by default). Swipe actions on rows: `Done`, `Schedule`, `Delete`.

**8.6 Calendar tab**
View pills `Day` / `3-Day` / `Week` / `Month` / `Agenda`. Manual recompute button `Rebuild schedule`. When behind, a banner: "You have {N} unfinished blocks. Want me to rebuild?" with button `Catch me up`. Tap a block opens a bottom sheet with `Complete`, `Edit`, `Delete`.

**8.7 Block typography thresholds**
- Height >= 44 px and width >= 90 px: title + time + list dot.
- Height 28 to 44 px: title + time (one line each, ellipsis).
- Height < 28 px: title only, single line, ellipsis; tap for detail.
- Width < 56 px (dense week view): colored bar with first ~6 chars; tap for detail.

**8.8 Ignition (Stakes) UI**
- Settings entry `Stakes`. Setup copy: "Pick the apps you'll put on the line." Button `Choose apps` (opens the native picker).
- On a task: toggle `Put something on the line`, then a mode chooser: `Lock until I start`, `Lock until done`, `Beat the clock`.
- Lock banner during a session: "{Instagram and 2 more} are locked until you finish your first move."
- Panic valve button `Unlock early`. Friction screen copy: "Locked apps come back in 60 seconds. Take a breath, or head back to your task." with a live countdown and a secondary button `Back to task`.
- De-escalation sheet (after repeated panic use): "Looks like this is a rough one. Want to pause stakes for today?" buttons `Pause stakes` / `Keep going`.

**8.9 Notifications (copy)**
- Start Reminder: "Hey, {task} is on your plate. Want to do the first move? It takes 5 minutes."
- Deadline Approaching: "{task} is due {when}. Start with: {first subtask}."
- Motivation Nudge: "Haven't touched {task} in a day. Here's a small step to get going."
- Completion Celebrate: "Nice, you finished {task}." (calm, no confetti spam).

**8.10 Onboarding (steps)**
1. Welcome (one-line value). 2. Sign in (Apple, Google, or email magic link), or continue locally and sign in later. 3. Name (or pulled from the sign-in). 4. Scheduling hours (grid, sensible defaults). 5. Energy peak (when you focus best). 6. Notifications permission (primed). 7. First task (guided: add one real assignment, watch it break down). 8. Optional: pick stake apps and try one `Lock until I start` on the first task's First move (the aha; Screen Time permission primed honestly, skippable). Note for the lean v1: re-cut this so the aha (sign in, add one task, lock an app, start) is reached in the first session, with scheduling-hours and energy-peak setup deferred or made optional, since those feed deferred features.

**8.11 Settings (every value)**
Scheduling-hours profiles (+ date overrides), default buffers, default Split + Min/Max block, Workload distribution (Balanced/Front-load), Auto-schedule cutoff weeks, external-busy buffer days, quiet hours, notification cadence, Stakes (daily cap, max cooldown, never-lock categories, default strength), energy check-ins on/off, theme (Light/Dark/System), calendar sync accounts, BYO API key, data export, delete all, account.

**8.12 Accessibility checklist (WCAG 2.1 AA)**
- [ ] Dynamic type to largest size without truncation of essential content.
- [ ] Color never the sole signal (deadline status also via icon/label).
- [ ] VoiceOver/TalkBack labels on all controls incl. calendar blocks, drag handles, checkboxes.
- [ ] Contrast >= 4.5:1 for text in both themes.
- [ ] Reduced-motion mode disables non-essential animation.
- [ ] All tap targets >= 44x44.
- [ ] Focus order logical; no keyboard/switch traps.

**8.13 Design v2 direction (professional / real-app feel).** Aria's post-v1 note was that the app looked too simple. The visual target is a polished, real product, not a prototype. Direction, applied via the tokens in `02_Design_System.md`: a subtle dot-grid texture on white behind surfaces (the reference look), depth from a surface ladder (background shift, a 1px edge, and a soft low-opacity shadow used sparingly), tighter heading letter-spacing, and generous, varied spacing. One accent for CTAs, links, and focus (primary `#2563EB`); accent `#7C3AED` for Projects only; roughly 90% of every screen stays neutral. Buttons that pair an icon with a label place the icon inline with the text. Empty states stay refined (icon, short title, one line, one primary action). Restraint is the point: no heavy shadows, no decorative gradients, no neon. `02_Design_System.md` stays the authoritative source for the exact values.

---

## 9. Technical Notes

**9.1 Architecture.** React Native + Expo (SDK 54+), TypeScript. State in Zustand with selector discipline (raw select then derive via useMemo to avoid re-render loops). Local persistence via MMKV (faster than AsyncStorage). Backend Supabase (Postgres, Auth via Sign in with Apple, Sign in with Google, and email magic link, Edge Functions wrapping AI). Apple's guideline requires Sign in with Apple whenever a third-party login (Google) is offered, so all three ship together. On-device scheduling engine (no server round-trip for recompute). Calendar rendered custom with Reanimated 3 + Gesture Handler, Skia for the time grid if needed; Month may use a themed react-native-calendars.

**9.2 App-blocking.** Full implementation in `06_Technical_Spec_App_Blocking.md`. Summary: iOS uses Apple Family Controls (authorization for `.individual`), FamilyActivityPicker (opaque tokens), ManagedSettings (apply the shield), and a DeviceActivityMonitor app extension plus ShieldConfiguration and ShieldAction extensions, all sharing state via an App Group. This needs the privileged `com.apple.developer.family-controls` entitlement, which must be approved by Apple per bundle ID for distribution (apply early, can take days to weeks; use the Development capability while waiting). Android uses UsageStatsManager plus a foreground service and a system overlay. A recommended base package is `expo-app-blocker` or `react-native-device-activity`.

**9.3 Dependencies.** Internal: AI Edge Functions (Section 9.11). External: Google/Outlook/iCloud calendar APIs, a speech-to-text provider, the blocking frameworks above. All third-party calls degrade gracefully offline.

**9.4 Data schema.** The full entity set. Every entity also has `id`, `createdAt`, `updatedAt`, `syncState`. Times are epoch ms unless a field is noted as minutes-from-midnight. Cloud is the source of truth with a local cache (FR-87).

Core scheduling:
```ts
type CalEvent = { id: string; title: string; start: number; end: number; allDay?: boolean; source: 'local'|'google'|'apple'|'outlook'; externalId?: string; busy: boolean };
type Task = {
  id: string; title: string; notes?: string;
  durationMin: number; due?: number; autoSchedule: boolean;
  listId?: string; projectId?: string;            // projectId back-references doc 10
  subtasks: Subtask[]; firstMove?: StarterAction;
  recurrence?: RecurrenceRule; priority?: number;
  sourceRefs?: SourceRef[]; splittable?: boolean;
  status: 'todo'|'doing'|'done';
};
type Subtask = { id: string; title: string; done: boolean; durationMin?: number };
type StarterAction = { id: string; text: string; done: boolean };   // the First move, about 2 minutes
type ScheduledBlock = { id: string; taskId: string; start: number; end: number; pinned?: boolean; status: 'planned'|'in_progress'|'done'|'missed' };
type List = { id: string; name: string; color: string };            // color from the supporting hues (doc 02)
type SchedulingHours = { perDay: { day: number; windows: { start: number; end: number }[] }[] };  // minutes-from-midnight
type RecurrenceRule = { freq: 'daily'|'weekly'|'monthly'; interval: number; byWeekday?: number[]; until?: number; count?: number };
type SourceRef = { id: string; type: 'text'|'file'|'photo'|'voice'; uri?: string; extractedText?: string };
```

Ignition and behavioral (the headline subsystem):
```ts
type StakeApp = { id: string; platform: 'ios'|'android'|'desktop'; tokenOrPackage: string; label?: string; eligible: boolean };  // iOS stores an opaque ApplicationToken, never identity
type StakeSession = {
  id: string; taskId: string; deviceId: string;        // per-device and independent (FR-41b)
  mode: 'lock_until_start'|'lock_until_done'|'beat_the_clock';
  completionCondition: 'first_move'|'subtask'|'task'; conditionRefId?: string;
  timerMinutes?: number; cooldownMinutes?: number;      // beat-the-clock; cooldown ends early on completion (FR-41)
  strength: number;                                     // 0..1, calibrated
  startedAt: number; endedAt?: number;
  outcome?: 'completed'|'panic_valve'|'timed_out'|'expired';
};
type LockEvent = { id: string; sessionId: string; type: 'shield_on'|'shield_off'|'panic_valve'|'cooldown_start'|'cap_reached'|'quiet_hours_release'; at: number };
type BehavioralSignal = { id: string; taskType?: string; plannedStart?: number; actualStart?: number; hourOfDay: number; dayOfWeek: number; completed: boolean; context?: { energy?: 'low'|'normal'|'hyper'; afterGym?: boolean; sleepHours?: number }; stakeOutcome?: StakeSession['outcome'] };
type FocusProfile = { bestWindows: { start: number; end: number; score: number }[]; dodgedTaskTypes: string[]; conditionsThatHelp: string[]; ignitionPoint: number; updatedAt: number };  // Focus DNA, recomputed weekly
type BreakdownMemory = { taskTypeKey: string; preferredGranularity?: 'fine'|'coarse'|'by_function'; commonEdits: string[]; completionFidelity: number };
```

Verification (doc 09) and Projects (doc 10):
```ts
type Proof = { id: string; sessionId: string; method: 'focus_time'|'photo'|'screenshot'|'word_count'|'screen_aware'|'honor'; uri?: string; aiVerdict?: 'pass'|'uncertain'; overridden?: boolean; at: number };
// Project, ProjectFile, Phase, Topic, and ChatMessage are defined in doc 10 Section 12; Task.projectId links a generated task to its project.
```

Settings and enforcement:
```ts
type Settings = {
  dailyLockCapMin: number;                       // default 180
  quietHours: { start: number; end: number };    // minutes-from-midnight, auto-release
  neverLockCategories: string[];                 // phone, messages, maps, accessibility, OS, Ampora
  stakeStrengthBounds: { min: number; max: number };
  subscription: { status: 'trial'|'active'|'lapsed'; plan?: 'monthly'|'annual'; trialEndsAt?: number };
  // plus notification, scheduling-hours, and energy preferences
};
```
Caps, quiet hours, never-lock categories, and stake-strength bounds are enforced both client- and server-side.

**9.5 The scheduling engine (full algorithm).**

*9.5.1 Free-time construction.* Build a timeline from now to cutoff. Subtract, in order: busy CalEvents and fixed tasks plus their buffers, external busy blocks, time outside the relevant Scheduling-hours windows, quiet hours, and pinned ScheduledBlocks. Output a sorted list of FreeInterval {start, end, profileIds[], energyScore} where energyScore comes from FocusProfile.bestWindows for that time of day (default 0.5 if unknown).

*9.5.2 Ordering.* Build the eligible task list (auto-scheduled, due within cutoff, dependencies satisfiable). Sort by the comparator in FR-10. Topologically constrain so a task is only placed after all dependsOn are placed.

*9.5.3 Placement loop.*
```
for task in orderedTasks:
  remaining = task.durationMin - (task.progressMin or 0)
  remaining = applyEstimationMultiplier(task, remaining)        // 9.5.6, soft padding
  windows = freeIntervals filtered to: task.schedulingHours,
            within [task.startAfter, task.dueAt], after deps finish
  mode = (task near/over due) ? frontload : settings.workloadDistribution
  if not task.splittable:
     slot = bestWindow(remaining + buffers, windows, mode, task.energyRequired)
     if slot: addBlock(task, slot); consume(slot)
     else: markUnschedulable(task)
  else:
     sizes = sessionSizes(remaining, task.minBlockMin, task.maxBlockMin, mode,
                          daysAvailable(now, task.dueAt, windows))
     for size in sizes:
        slot = bestWindow(size + buffers, windows, mode, task.energyRequired)
        if slot: addBlock(task, slot); consume(slot); windows = refresh()
        else: markPartiallyUnschedulable(task, leftover); break
```
*bestWindow scoring.* For each candidate window of sufficient size, score = base - loadPenalty - energyMismatchPenalty - latenessPenalty, where:
- frontload: base favors earliest start (base = -startTimeOffset).
- balanced: loadPenalty = k1 * (minutesAlreadyPlacedOnThatDay / dayCapacityMinutes), k1 = 1.0 (push toward less-loaded days).
- energyMismatchPenalty = k2 * mismatch(task.energyRequired, window.energyScore), k2 = 0.3 (soft).
- latenessPenalty large if placing risks missing Due (forces front-load near deadline).
Pick the highest-scoring window. Energy and balance are soft and never cause a missed deadline.

*9.5.4 Session sizing.* daysAvailable = count of days between now and Due that have any free capacity in the task's scheduling hours. Balanced: target = clamp(ceil(remaining / daysAvailable), minBlock, maxBlock), emit sessions of target until remaining is exhausted (last session may be the remainder if >= minBlock, else merged into the previous). Front-load: emit maxBlock sessions earliest-first until exhausted.

*9.5.5 Color-coding (deadline slack).* For a task, slackRatio = (minutesUntilDue - remainingMinutes) / max(minutesUntilDue, 1). Green if slackRatio > 0.5, Amber if 0.2 to 0.5, Red if < 0.2 or overdue. Color is also surfaced as an icon/label for accessibility.

*9.5.6 Estimation multiplier (time-blindness).* Per task-type key, maintain EWMA of (actualMin / estimatedMin) with alpha 0.3. multiplier = clamp(EWMA, 0.5, 3.0). Apply as soft padding to future durations of that type only after >= 3 samples. Surface gently ("I'm giving writing tasks more time because they tend to run long for you").

*9.5.7 Revealed Self trigger.* Per task-type, over the last K=10 instances compute medianDelta = median(actualStart - plannedStart). If medianDelta >= 60 min and >= 70% of samples are late by >= 30 min, on the next schedule of that type suggest booking near (plannedStart + medianDelta), with non-shaming copy, applied only on accept.

*9.5.8 Energy/State re-sort.* On a state input or confident inference: Low -> surface only tasks with energyRequired = Low as "today's wins," defer High to later days where deadlines allow. Hyper -> cluster the single highest-priority High-energy task and hide low-value chores for the session. Normal -> default order.

*9.5.9 Recovery reprioritization.* On Recovery: mark moot any past-due, non-recurring task with no explicit "still needed" flag (or confirm with the user in batch), drop missed repeating occurrences per FR-16, bump now-urgent tasks (slackRatio < 0.2) to front-load, then run the placement loop. Present a diff preview.

*9.5.10 Stability.* Recompute compares new placement to existing blocks and preserves any block whose task and time are unchanged (no churn). Pinned blocks are immovable inputs. Only changed blocks animate.

*9.5.11 Undated auto-scheduled tasks.* A task with auto-schedule on but no due date is never force-placed (the engine has no deadline to plan against). It stays on the to-do list as available-anytime. If the user opts in to "fit it in when there is space", it backfills into leftover free time at the lowest priority, after all dated work, and is the first thing dropped when space is tight. It never displaces a task that has a deadline.

**9.6 Natural-language quick-add and voice parse.** Local lightweight parsing first (regex/date library for "due fri 2h high"), falling back to the AI parser `ai/extract-tasks` for ambiguous input. Voice uses device STT (or a Whisper-class service) to produce a transcript fed to the same parser. Always show a parsed preview before commit.

**9.7 Source-grounded breakdown.** If task.sourceMaterial is present, `ai/breakdown-grounded` derives subtasks from the real requirements. Rules: for Due > 24h, 1 to 3 starter subtasks each <= 10 min plus 15 to 30 min subtasks; for Due < 24h, only 5 to 10 min subtasks; first subtask always concrete and specific; max 8 subtasks; one First move of 2 to 5 min always. Abstract-task detection (keywords essay/research/analyze/write/project/presentation) increases granularity. "Refine" calls `ai/refine-breakdown` with prior breakdown plus instruction. Breakdown memory stores user edits, preferred granularity per task-type, and completion fidelity, fed back into future breakdowns. Fallback: a generic 4-step template behind a warm banner; never cache fallbacks; cache real results keyed by (title, dueAt, sourceHash).

**9.8 Calendar overlap layout.** Build an interval graph of blocks that overlap in time. For each connected cluster, compute the max concurrency (number of columns) and assign each block the first free column via a sweep; render block width = clusterWidth / columns, x = columnIndex * width. Fixed events may take priority column 0 and inset tasks if the design prefers.

**9.9 Stake session lifecycle (engine view).** Start -> confirm authorization (iOS first-time) -> apply shield via ManagedSettings -> show banner -> on completion condition met, remove shield and log outcome. Persistence, kill/restart recovery, auto-expiry at caps and quiet hours, and clock-change handling are specified in the blocking spec. Fail-safe per NFR-7.

**9.10 Wellbeing safety layer (enforced).** Daily total lock cap (default 180 min, hard ceiling), single-cooldown cap (default 30 min), quiet-hours auto-release, never-lock categories (phone, messages, maps, accessibility, OS settings, Ampora), no-shame copy, distress de-escalation (FR-43). These override feature behavior and are checked both client-side and in the blocking extensions.

**9.11 AI / Edge Functions.**
| Endpoint | Purpose |
|---|---|
| `ai/extract-tasks` | Paste/voice transcript to structured tasks + dates + duration guesses |
| `ai/breakdown-grounded` | Subtasks + First move grounded on attached source |
| `ai/refine-breakdown` | Conversational regeneration |
| `ai/reconcile-schedule` | Revealed Self stated-vs-revealed suggestion |
| `ai/recovery-replan` | Reprioritize + rebuild after a lapse |
| `sync/*` | Calendar sync |
| client STT | Voice to transcript |

AI provider is Google Gemini (`gemini-2.5-flash`) called from Supabase Edge Functions with strict JSON prompts. Gemini is used because it has a free tier and the subscription is meant to cover AI cost. The key is a server-side Edge Function secret (`GEMINI_API_KEY`), never in the client. When the key is unset every function returns `200 { error: "no_key" }` and the app degrades to its local grounded fallback, so nothing breaks without a key. The shipped functions are `ai-breakdown`, `ai-refine`, `ai-simplify`, `ai-extract-tasks`, `ai-project-chat`, and `ai-project-task` (`supabase/functions/`), fronted by `services/ai.ts` and `services/aiProjects.ts`. The scheduling engine is on-device and never depends on a server call.

**9.12 Offline & sync.** Full offline use of local features. Background sync to Supabase, last-write-wins per field with a conflict log. Home-screen widget shows a week offline.

**9.13 Future-proofing.** Keep the blocking layer behind an interface (BlockingStrategy) so Android, desktop, and future OS APIs slot in without touching core logic. Keep the Learning Engine behind a single service so new signals and surfaces add without rewrites.

**9.14 Breakdown engine and memory.** Full spec in `07`. Summary: breakdown assembles a prompt from the task, the resolved source material (text, OCR'd file/photo, or voice transcript), and the user's retrieved memory for the task-type (summarized preferences plus the user's last 1 to 3 accepted breakdowns as few-shot examples), with a strict JSON output contract and post-generation validation. Memory updates from the diff between generated and accepted breakdowns (rule-based summarization first, optional async LLM consolidation), from refine instructions, and from completion fidelity. It is per-user retrieval-augmented prompting, not shared-model fine-tuning. Local-first, synced minimally so it also works when breakdown runs server-side.

**9.15 Subtask semantics.** Full spec in `07` Part 3. The task is the schedulable unit; subtasks are an ordered execution checklist. Parent duration = sum of subtask estimates (kept in sync). Progress = sum of completed subtasks' estimates, which drives partial scheduling (only remaining time is placed). The next uncompleted subtask is the surfaced current step for Today, Focus, Blindfold, and notifications. Splitting (session sizing) and subtasks (decomposition) are orthogonal; sessions need not align to subtask boundaries. Rendering is one block per session with an `N steps` chip, not one block per subtask, unless `Schedule subtasks separately` is enabled.

**9.16 Claude connection, API, and portable engine.** Full spec in `08`. The scheduling engine and breakdown/memory modules are pure portable TypeScript run both on-device and in Edge Functions for identical results. A hosted MCP server exposes the full task/event/schedule/breakdown/focus surface to Claude (OAuth or API key), and a REST/GraphQL public API exposes the same operations. Stakes are read/configure only over MCP, never remotely engaged. This matches FlowSavvy's public-API-plus-MCP integration and adds breakdown, stakes config, and focus profile.

---

## 10. Metrics & Success Criteria

| KPI | Target | Measurement | Owner |
|---|---|---|---|
| Time-to-start | Median reminder-to-first-action < 20 min | Local event log (reminder fire, First move tap) | Founder |
| Stake effectiveness | Staked tasks complete > unstaked by a clear margin | Completion rate by has-stake | Founder |
| Stake safety | Panic-valve use < 15% of staked sessions | LockEvent log | Founder |
| Recovery | >= 50% resume within 2 days of a lapse | Lapse + resume events | Founder |
| Model trust | >= 60% of Revealed Self suggestions accepted by week 3 | Suggestion accept/dismiss | Founder |
| Wellbeing | Self-reported stress trends down; no uninstall spike after first stake | Optional in-app check-in + store data | Founder |
| Performance | 60fps interactions; recompute < 300 ms | Dev profiling + runtime timing | Founder |

Instrumentation: a privacy-respecting, on-device-first event log; only aggregate, non-identifying metrics leave the device, if any.

---

## 11. Risks & Mitigations

| Risk | Severity | Mitigation |
|---|---|---|
| Lock feels punitive, ADHD users churn | High | Consensual "lock your own stuff," panic valve, no-shame copy, de-escalation, gentle defaults, Mode C gated |
| App Store rejects blocking app | High | Panic valve + user-control framing, follow Family Controls rules, apply for the entitlement early, mirror Opal/Brick positioning |
| Family Controls entitlement delay blocks launch | High | Apply per bundle ID at project start; use Development capability meanwhile; do not gate the whole launch on stakes (the scheduler ships value alone) |
| Building a FlowSavvy-grade scheduler is hard | High | On-device deterministic engine fully specified (Section 9.5); milestone gating; iterate before adding the hook |
| iOS Screen Time API is finnicky (token mismatch, premature events, status lag) | Medium | Documented workarounds in the blocking spec; fail-safe to unlocked; re-check permission on foreground |
| Incumbent copies the lock | Medium | Moat is the behavioral model + brand, not the lock alone |
| Stakes harm wellbeing | High | Section 9.10 caps, never-lock list, quiet-hours release, de-escalation, 13+ floor, no medical claims |
| Solo founder, school schedule | Medium | One milestone at a time, Claude Code leverage, portfolio value even if slow |
| Distribution as an unknown solo dev | Medium | Lead with the one-sentence hook, seed ADHD/study creators, win one school first |

---

## 12. Rollout Plan

**Phases (also the build order):**
- P0 Core: task model + editor + quick-add/inbox + lists/tags; the on-device engine (ordering, free-time, placement, splitting, recalculate, overrides, recurring with overdue handling, unschedulable explanations); the calendar (Day/3-Day/Week/Month/Agenda) at 60fps with drag/resize/zoom; notifications; design system applied.
- P0.5 Hook: iOS stakes (Lock until I start + panic valve + caps), First move + Blindfold, voice capture + grounded breakdown.
- P1: Learning Engine + Revealed Self; Beat-the-clock + calibration; Recovery; refine-breakdown + memory; calendar sync (read).
- P2: Focus DNA + Energy/State; file/photo upload; LMS import; Android stakes; calendar sync (write); widgets.
- P3: Desktop companion (hard blocking); optional screen-aware focus check; BYO key.

**Feature-flag strategy:** gate stakes Mode C, Revealed Self auto-suggestions, and the optional screen-aware check behind flags so they can be enabled per cohort and rolled back. Stakes overall behind a flag until the entitlement is approved.

**Communication:** internal = the founder's milestone checklist. External = TestFlight with 10 to 50 real student testers, then the first lock-mechanic clip, then public launch when onboarding reliably reaches the aha.

---

## 13. Decision Log

| Date | Decision | Owner | Rationale |
|---|---|---|---|
| 2026-06-30 | Name = Ampora | Aria | Distinctive, ownable, "amp" = energy/amperage |
| 2026-06-30 | Stakes limited to self-imposed app-locking; no financial/public-shame stakes | Aria | Wellbeing + minor-safety + App Store |
| 2026-06-30 | Default stake mode = Lock until I start (First move) | Aria | Goal is initiation, gentlest effective version |
| 2026-06-30 | Beat-the-clock OFF by default, gated behind successful sessions | Aria | Avoid shame/rejection-sensitivity churn |
| 2026-06-30 | Default ordering = priority then Due; "Due date only" optional | Aria | Matches the more sophisticated FlowSavvy Pro behavior, predictable |
| 2026-06-30 | Missed repeating occurrences drop by default | Aria | Fixes the known double-stacking complaint |
| 2026-06-30 | Engine runs on-device | Aria | Instant recompute, offline, no per-recompute server cost |
| 2026-06-30 | Apply for Family Controls entitlement at project start | Aria | Approval can take weeks; do not block launch |
| 2026-06-30 | Did not ask clarifying questions; recorded assumptions instead | Claude | Per founder's standing instruction |
| 2026-06-30 | Breakdown "memory" = per-user retrieval-augmented prompting (preferences + the user's own accepted breakdowns as few-shot), not shared-model fine-tuning | Claude | Privacy, cost, and highest personalization signal |
| 2026-06-30 | The task, not the subtask, is the schedulable unit; subtasks are an execution checklist; one block per session | Claude | Calendar legibility and ADHD "one next step", resolves prior v1 contradiction |
| 2026-06-30 | One pure deterministic engine runs both on-device and server-side | Claude | Instant offline recompute plus identical results when Claude/MCP drives changes |
| 2026-06-30 | Connect to Claude via a hosted MCP server plus a public API; stakes are read/configure only over MCP | Claude | FlowSavvy parity, with a safety boundary against remote surprise locks |
| 2026-06-30 | Ignition verification is a spectrum (honor, focus-time, photo/screenshot with lenient AI, word-count, screen-aware), not a lie detector; focus-time is the default backbone | Claude | No app can truly verify work; friction beats faking; self-imposed so the user benefits from honesty |
| 2026-06-30 | Verification never traps: panic valve + override always, AI errs toward accepting | Claude | Rejection-sensitivity population; a false rejection is worse than a false accept |
| 2026-06-30 | Start is verified by completing the First move, not a bare button tap | Claude | The First move is a tiny real action, easier to do than to fake |
| 2026-06-30 | Custom and voice breakdown modes added; AI cleans up rather than authoring | Claude | Respect user expertise; user-authored breakdowns are the best memory exemplars |
| 2026-06-30 | Multi-day projects use phases (stable) + a rolling per-session breakdown (dynamic); the First move is computed for the current session, not the whole project | Claude | A flat checklist breaks for big tasks; "first step of today" is always determinable |
| 2026-06-30 | Stakes for projects lock against the per-session goal, not the whole project | Claude | Locking until a multi-day paper is "done" is impossible in one sitting |
| 2026-06-30 | Breakdown is a supporting feature; Ignition is the main feature; breakdown's job is to feed Ignition a sensible per-session goal | Aria | Do not over-build the planner; the lock is the product |
| 2026-06-30 | Source attachment works in all breakdown modes; a source that lists steps is extracted directly; Claude can supply external "knows you" context | Claude | Highest accuracy for specific tasks comes from the real source, not a bigger model |
| 2026-06-30 | Two first-class work types: Tasks (short) and Projects (ongoing, with files, chat, progress); created explicitly, not auto-detected | Aria | A flat task model breaks for ongoing work like a research paper or studying for SciOly |
| 2026-06-30 | A project is a knowledge base plus a chat plus progress that generates schedulable, lockable Tasks; the chat is the universal repair mechanism | Aria | Conversational control makes an imperfect AI cheap to correct; keeps Ignition central |
| 2026-06-30 | Sign-in offers Apple, Google, and email magic link; Apple is required because Google is offered | Claude | App Store guideline 4.8 |
| 2026-06-30 | Build the full product for launch (AI-accelerated build; not a stripped MVP). Launch includes the full scheduler, projects, Ignition with beat-the-clock and photo/screenshot verification, voice capture, calendar sync, breakdown and First move, sign-in, and the pre-built tomorrow's plan. The Claude MCP connection is a lighter/later piece | Aria | Claude Code collapses build time; the constraint is external (entitlement, review), not scope |
| 2026-06-30 | Beat-the-clock is in scope (it serves the core loop); a cooldown lock ends early if the task is completed | Aria | Founder correction |
| 2026-06-30 | Photo/screenshot verification is in scope at launch, not deferred | Aria | Founder correction |
| 2026-06-30 | Paid app, no free tier. 2-week free trial, then monthly or annual subscription (annual about 10% cheaper per month). Apple IAP on iOS | Aria | Monetization decision |
| 2026-06-30 | Subscription covers AI costs (company pays per-call). BYO model key remains optional, not required | Aria | No free tier funds the AI |
| 2026-06-30 | Retention hook = the schedule itself: tomorrow's plan is pre-built and the auto-rebuilding plan is the reason to return | Aria | "You need to come back for your schedule" |
| 2026-06-30 | Each device is independent for stakes; no multi-device lock | Aria | Simplicity |
| 2026-06-30 | Account required (Apple/Google/email); all data synced to the cloud as the source of truth, with a local cache for offline and speed; no anonymous local-only mode | Aria | Cloud-first sync |
| 2026-06-30 | Web is a target (full functionality except app-blocking, which requires the phone). English only for now | Aria | Platform scope |
| 2026-06-30 | Undated auto-scheduled tasks are not force-placed; they stay on the list and may backfill into leftover free time at lowest priority, never displacing dated work | Claude (founder said use recommended) | Sensible default |
| 2026-06-30 | No existing Focal users to migrate; treat as a brand-new app. Brand and visual identity handled by the founder separately | Aria | Clean start |
| 2026-07-01 | Design v2: the app must feel like a real, professional product, not a simple prototype. Subtle dot-grid on white, a surface ladder for depth, tighter heading tracking, generous spacing, one accent for CTAs. No heavy shadows, decorative gradients, or neon | Aria | v1 "looks too simple"; restraint reads as premium |
| 2026-07-01 | AI provider is Google Gemini (`gemini-2.5-flash`) behind a Supabase Edge Function; free tier for now, key is a server-side secret (`GEMINI_API_KEY`); no key falls back locally | Aria | Free while the subscription (which covers AI) ramps; no client-side key |
| 2026-07-01 | Stake app picker is user-chosen and Opal-style; the block list is editable and the user can add their own apps; the six never-lock categories stay protected and always reachable | Aria | User controls what is blocked; safety categories are non-negotiable |
| 2026-07-01 | Focus-time verification pauses the timer when the user leaves Ampora; a task is not counted done until the required focus time elapses in the foreground | Aria | Honest-by-design; you are restricting your own device, panic valve/override still apply |
| 2026-07-01 | Present the trial and plans right after sign-in (real-app flow), plus a paywall at trial end; a dev-only bypass skips the paywall in development, never shipped to users | Aria | Real subscription flow with a practical dev affordance |
| 2026-07-01 | Project chat is an agentic study-plan planner (organizes the plan and will use tools to change tasks/schedule/memory), not a quiz/tutor | Aria | The chat is the controller and repair mechanism, not a study drill |
| 2026-07-01 | Scheduler targets FlowSavvy parity as the baseline and goes beyond it with breaks and energy-aware placement | Aria | Match the proven behavior, then differentiate on ADHD-fit |

---

## 14. Success Story Narrative

It is a Sunday night in October. Maya, a junior with three AP classes, opens Ampora dreading a five-page history essay she has avoided for four days. She does not open a blank planner. She taps "Brain dump" and says her week out loud, and Ampora lays it into her calendar. The essay is the red one. She taps it, then taps "Put something on the line" and chooses "Lock until I start." Instagram and her game go dark. The First move says "Open a doc and write one sentence stating your thesis." She writes the sentence. The apps come back, but she keeps going, because the hard part, starting, is over. On Wednesday she falls behind after a late practice. She opens the app, taps "Catch me up," and her week rebuilds itself with no lecture about a broken streak. Three weeks in, Ampora notices she always starts essays around 10 PM no matter when she plans them, and asks if it should just book them at 10. She says yes. Her plan finally matches her. She tells two friends, "this app literally locks my phone until I start my homework," and they download it that night.

---

## 15. Open Questions & Assumptions

**Open questions (with the chosen default in brackets; revisit with data):**
- Q1. Default stake completion condition. [First move for new users.]
- Q2. iOS DeviceActivity granularity for Beat-the-clock timing. [Enforce timing in-app, use shielding for the lock.]
- Q3. Android enforcement path: accessibility service vs VPN filter vs Device Admin. [Start with UsageStats + overlay via expo-app-blocker; revisit reliability.]
- Q4. Calendar engine: pure RN views vs Skia canvas. [Start RN + Reanimated; move time grid to Skia if 60fps is not met.]
- Q5. Store account holder: parent vs LLC. [Decide before submission; start the entitlement request under whichever account.]
- Q6. STT provider (device vs Whisper-class). [Device STT first for cost/privacy; upgrade if accuracy is poor.]

**Assumptions (flagged for audit):**
- A1. Users are 13+ and restricting their own device (not parents managing a child). Authorization uses `.individual`.
- A2. The founder can obtain the Family Controls distribution entitlement.
- A3. Numeric targets in Section 10 are pre-launch targets, not observed data.
- A4. A strong-enough model is available for parsing/breakdown within budget; BYO key covers power users.
- A5. The on-device engine can hit the < 300 ms target on mid-range hardware with the specified data structures.

---

## 16. Glossary

- **Auto-schedule:** the engine finds a time for a task automatically (vs a fixed time the user sets).
- **Scheduling hours:** named windows (for example Study hours) a task may be placed in.
- **Split into sessions:** breaking a long task into multiple shorter blocks across time.
- **Minimum/Maximum block:** the smallest/largest single sitting allowed for a split task.
- **Buffer:** reserved time before/after a block the engine will not schedule into.
- **Pinned block:** a user-placed (dragged or locked) block the engine never moves.
- **Auto-schedule cutoff:** how many weeks ahead the engine schedules (for performance).
- **Stake / Ignition:** the user locking their own apps behind a task as a commitment device.
- **Panic valve:** the always-available emergency unlock for a stake.
- **First move:** the 2 to 5 minute concrete starter action for any task.
- **Revealed Self / Focus DNA / Energy-State:** the four surfaces of the one Learning Engine.
- **Recovery Mode:** the one-tap, shame-free rebuild after a lapse.
- **Blindfold:** collapsing the screen to a single next step.
- **Family Controls / Screen Time API:** Apple frameworks used to shield apps with the user's permission.
- **ManagedSettings / DeviceActivity:** the Apple frameworks that apply the shield and schedule when it is on.
- **FamilyActivityPicker / ApplicationToken:** the native app picker and the opaque token representing a chosen app (bundle IDs are not exposed on iOS).
- **Breakdown memory:** a per-user, per-task-type store of learned preferences and the user's own past accepted breakdowns, injected into future breakdowns. Not shared-model training.
- **Schedulable unit:** the thing the engine places in time. In Ampora this is the task, not its subtasks.
- **Subtask:** an ordered execution checklist item inside a task. Drives progress and the current step, but is not individually scheduled by default.
- **MCP server:** the hosted service that lets Claude read and write the user's Ampora tasks and schedule in natural language.
- **Portable engine:** the pure, deterministic TypeScript scheduling and breakdown module that runs both on-device and server-side with identical results.
- **Verification method:** how a stake confirms you started or finished a task (honor, focus-time, photo/screenshot, word-count, or screen-activity).
- **Focus-time unlock:** the recommended default, where apps unlock only after you complete a focus session of a required length inside Ampora (the app verifies its own timer).
- **Proof Log:** the user's private history of submitted photo/screenshot proofs.
- **Custom breakdown:** the user writes or speaks their own steps and the AI cleans and time-boxes them without changing the plan.
- **Project (multi-day task):** a task too large for one sitting, modeled as stable phases plus a dynamic per-session breakdown.
- **Phase:** one ordered milestone of a project (for example, outline, draft, revise).
- **Rolling session breakdown:** the just-in-time steps generated for the current work session based on where the user is, so they change as progress advances.
- **Task (short):** a short piece of work, doable in about 1 to 2 days, broken down per doc 07.
- **Project (ongoing):** a first-class, usually recurring workspace (a research paper, studying for a competition) with a persistent file library, its own chat, progress tracking, and the ability to generate the daily Tasks you schedule and lock against. Spec in doc 10.
- **Project chat:** the scoped conversational interface for a project that can both answer from its files and act on its tasks and plan.
- **Project knowledge base:** the persistent set of files uploaded to a project that the AI understands via retrieval.

---

## Appendix A: Quality Check Report

| # | Category | Status | Note |
|---|---|---|---|
| 1 | Completeness | ✅ | All 16 sections filled; requirements numbered FR/NFR |
| 2 | Clarity | ✅ | Exact UI naming/copy in Section 8; acronyms in Glossary |
| 3 | Actionability | ✅ | Gherkin acceptance criteria for key flows; algorithms with formulas |
| 4 | Feasibility | ✅ | Dependencies and the blocking implementation specified; companion technical doc |
| 5 | Risk & Edge Cases | ✅ | Section 11 + edge cases in 9.5/9.9 + Gherkin for caps and de-escalation |
| 6 | Alignment | ✅ | Every FR tagged to a goal (G#) |
| 7 | Assumption Audit | ✅ | Section 15 assumptions A1 to A5 flagged |
| 8 | Accessibility | ✅ | NFR-5 + 8.12 WCAG 2.1 AA checklist |
| 9 | Evidence Rigor | ⚠️ | Secondary review sentiment + one co-designer; no first-party quantitative research (pre-launch). Targets are targets, not data |
| 10 | No Contradictions | ✅ | Reviewed; stakes are self-imposed only (N4) and consistent across sections |

## Appendix B: AI Gap Report

**Overall risk for autonomous execution: Low to Medium.** The PRD plus the companion blocking spec and design system are buildable. The residual risk concentrates in two genuinely hard subsystems that will need iteration regardless of spec quality.

| Gap type | Risk | Recommendation |
|---|---|---|
| Hallucination / vague terms | Low | Terms defined in Glossary; UI strings fixed in Section 8 |
| Data reference risk | Medium | Section 10 targets are explicitly pre-launch, not sourced metrics. Do not treat as observed data |
| Implicit logic | Low | Engine and breakdown logic given as pseudocode/formulas in Section 9 |
| Ambiguous actor | Low | Single owner (founder); extensions and services named |
| Conditional/edge cases | Medium | Stake kill/restart, token mismatch, premature events, and quiet-hours release are specified but depend on finnicky iOS behavior; verify on-device against the blocking spec |
| Contradictions | Low | None found after review |
| Output clarity for AI build | Medium | The scheduling engine (9.5) and the calendar 60fps target (NFR-1) will need real-device iteration; treat first build as a draft to profile, not final |

**Top 3 things to validate first on-device:** (1) the Family Controls entitlement + shield persistence end to end, (2) the engine hitting < 300 ms with churn-minimizing stability, (3) the calendar holding 60fps under dense overlapping blocks during drag.
