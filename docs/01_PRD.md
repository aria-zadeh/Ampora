# Ampora — Product Requirements Document

> Self-contained build spec for an engineer or an AI coding agent (Claude Code). Where a behavior was vague, an exact decision is recorded in the Decision Log (Section 13). Pair with `02_Design_System.md` (visual standard), `03_AI_Breakdown_and_Subtasks.md` (task breakdown and subtasks), `04_Ignition_Sessions_and_Verification.md` (the session model, stakes, and proof spectrum), `05_App_Blocking_Technical.md` (native app-blocking), `06_Projects.md` (Projects as a first-class type), and `09_Decisions.md` (the locked decision log). Deferred scope is in `V2_Changes.md` and must not appear here.
>
> **Author style:** no em dashes, no semicolons, direct. Tables, numbered requirements, pseudocode, and Gherkin are used throughout.

## Table of Contents
0. Version & Ownership
1. Executive One-Pager
2. Overview & Context
3. Customer Insights & Evidence
4. Goals & Non-Goals
5. Alternatives Considered
6. Personas & Use Cases
7. Requirements (Functional, Non-Functional, Acceptance Criteria)
8. UX, Exact UI Naming & Copy
9. Technical Notes (Architecture & Algorithms)
10. Metrics & Success Criteria
11. Risks & Mitigations
12. Rollout Plan
13. Decision Log
14. Success Story Narrative
15. Open Questions & Assumptions
16. Glossary

---

## 0. Version & Ownership
- **Product:** Ampora (formerly Focal / Dandelion).
- **Version:** 3.0 (session-model rebuild). Owner: Aria Zadeh (solo founder/dev, building with Claude Code).
- **Co-design input:** Garrett (ADHD co-designer, original Focal project).
- **Implementation target:** AI coding agent plus founder.

---

## 1. Executive One-Pager

**TL;DR**
1. **Problem:** Students who procrastinate and people with ADHD do not fail at scheduling, they fail at starting, and slacking costs nothing in the moment. Auto-calendars optimize time but never move behavior, so a perfect schedule still loses to Instagram.
2. **Goals:** Ship a best-in-class auto-scheduler equal to FlowSavvy in quality, plus two differentiators: make starting small (a 2-minute First move and a Blindfold mode) and make slacking cost something now (lock your own apps for a work session).
3. **Scope:** Full task and calendar system, on-device scheduling engine, polished calendar UI, Ignition app-locking on a session model, AI breakdown, voice capture, Projects, Recovery, Blindfold. iOS and Android phones plus web (web has everything except the lock). Post-launch: MCP and public API.
4. **Success metrics:** median time-to-start under 20 min, staked sessions complete more often than unstaked with panic-valve use under 15%, over 50% of users resume within 2 days of a lapse, calendar holds 60fps, recompute under 300ms.
5. **Launch gate:** the first session reliably reaches "I locked an app and started."

**Plain-language summary:** Ampora is a calendar that plans your week, hands you a two-minute first step so starting is easy, and lets you lock your own apps (Instagram, games) for a work session so blowing it off costs you right now. When you fall behind, one tap rebuilds your week with no guilt.

---

## 2. Overview & Context

**2.1 Problem statement (why now).** The behavior gap (the 30 seconds before starting, and the zero cost of slacking in the moment) is unsolved by every leading tool. Three shifts make solving it feasible solo in 2026: OS-level self-restriction is mature and sanctioned (Apple Family Controls / Screen Time, Android UsageStats), cheap personal LLMs make grounded task breakdown feasible without a data team, and ADHD/procrastination identity content is a large, sharing-heavy audience.

**2.2 Strategic alignment.** A consumer behavior-change app with a viral hook (lock-your-apps) and a defensible moat (a brand people identify with, plus a lock mechanic wired directly into the schedule that point blockers cannot match). It also serves the founder's engineering and college narrative as a flagship artifact regardless of commercial outcome.

**2.3 Competitive snapshot.**
| Category | Examples | Promise | Gap Ampora fills |
|---|---|---|---|
| AI calendars | FlowSavvy, Motion, Reclaim | Schedule your time | Slacking stays free; no push to actually start |
| Task managers | Todoist, TickTick, Notion | Organize tasks | The list is the wall, not the cure |
| Focus / blockers | Opal, Forest, One Sec | Block distractions | Disconnected from your schedule and tasks |
| ADHD tools | Tiimo, Goblin.tools, Inflow | Help ADHD function | Point tools, often deficit-framed |

FlowSavvy is the quality benchmark and closest competitor: beloved, polished, solo-built. Ampora must match its scheduler and win on behavior.

---

## 3. Customer Insights & Evidence

**3.1 Primary (co-design).** Garrett, an ADHD high-school student and co-designer of the original Focal app. Profile: struggles with task initiation, poor time estimation, deadline-driven late-night work, stress when overwhelmed, finds constant notifications annoying, essays and open-ended projects are hardest while structured math packets are manageable.

**3.2 Secondary (public review sentiment).** ADHD users repeatedly describe the core value of a good scheduler as removing the anxiety of rearranging a plan when they inevitably miss things. They also ask for things scheduler apps lack, including better handling of missed repeating tasks. This confirms both the audience demand and specific openings.

**3.3 Design principles from ADHD/productivity research (directional, not first-party data).** Tools that stick share four traits: quick capture (a thought must leave your head in seconds), visible progress, built-in prompting (the app reminds you, you do not have to remember to check it), and forgiveness for inconsistency (missing a day must not cascade into guilt). Tools that get abandoned demand the exact executive functions ADHD disrupts: heavy setup, manual categorization, daily maintenance. Ampora is built to those four traits and against that failure mode.

**3.4 Evidence gaps (honest).** No first-party quantitative research yet (pre-launch). All numeric targets in Section 10 are targets, not observed metrics.

---

## 4. Goals & Non-Goals

**4.1 Primary goals**
- G1. Match FlowSavvy-grade auto-scheduling quality and polish.
- G2. Reduce time-to-start (the initiation gap).
- G3. Make slacking carry an immediate, consensual cost (Ignition) without harming wellbeing.
- G4. Make recovery from a lapse frictionless and shame-free.

**4.2 Non-goals**
- N1. No team or enterprise features (single-player only).
- N2. No social network, public feeds, or leaderboards.
- N3. No medical or clinical claims; not an ADHD treatment.
- N4. No manufactured financial or public-shame stakes (only self-imposed app-locking).
- N5. No habit-streak gamification with shame mechanics.
- N6. No web app-blocking (a browser cannot enforce it); web keeps the non-blocking feature set.

---

## 5. Alternatives Considered

| Direction | Why rejected |
|---|---|
| Manufactured financial/public-shame stakes | Wellbeing and liability risk, especially minor-to-minor. Replaced by self-imposed app-locking only. |
| Lock-until-start as a mode | Leaks: the user does the first move, unlocks, and is back on Instagram in a minute. Replaced by the session hold. |
| Lock-until-done as the only mode | Traps: a multi-hour task exceeds the wellbeing cap, and lenient photo checking cannot police a multi-hour lock. Kept only as an opt-in for short tasks. |
| Generic AI breakdown without source | Inaccurate for tasks with specific steps. Replaced by source-grounded breakdown. |
| Two separate systems for Focus and Ignition | Redundant. There is one session concept; a session may or may not carry a stake. |

**Critique resolutions carried forward.** Jargon labels get friendly names plus helper text with advanced fields behind "More options." "Due date" versus "when I will do it" is disambiguated in the editor. Overdue is a quiet dot plus a gentle Recovery nudge, never a shaming banner. Overdue repeating tasks default to drop-missed (do not stack). The scheduler is deterministic and churn-minimizing with pinned blocks. iOS app-locking reality is handled in `05_App_Blocking_Technical.md`.

---

## 6. Personas & Use Cases

**6.1 Persona: Garrett (primary, ADHD).** JTBD: "Tell me the one thing to do now," "Get me to actually start," "Do not let me doomscroll instead," "Rescue my week when I fall behind without making me feel bad."

**6.2 Persona: Ambitious Procrastinator (secondary).** A 4.0-chasing student who does brilliant work only under last-minute pressure. JTBD: "Plan everything so nothing slips," "Give me pressure on demand so I start," "Make my night-before crunch less chaotic."

**6.3 Key use cases**
- UC1. Add a week of assignments by voice in 60 seconds, see them scheduled.
- UC2. At 11 PM facing a dreaded essay, tap Start, lock Instagram for the session, and get moving.
- UC3. Set the task you always dodge to lock automatically at 5 PM every day.
- UC4. Miss two days, open the app, tap one button, get a rebuilt week.
- UC5. Feel overwhelmed by a full calendar, collapse it to one step.
- UC6. A 12-hour project spreads itself into sessions across the week, each one lockable.

---

## 7. Requirements

Requirements are numbered (FR-#, NFR-#) and tied to goals (G#). Acceptance criteria are Gherkin. This is the build checklist. Exact labels and copy are in Section 8.

### 7.1 Functional Requirements

**Tasks, lists, capture**
- FR-1 (G1). The app supports Events (fixed, never auto-moved), Tasks (checkable to-dos), and within Tasks an Auto-schedule toggle. Auto-scheduled tasks are placed by the engine; fixed tasks have a user-set time.
- FR-2 (G1). Full task editor exposing every field in Section 8.3, with advanced fields behind "More options."
- FR-3 (G2). Quick-add field with natural-language parsing (Section 9.6) that previews parsed fields before saving.
- FR-4 (G2). Voice capture ("Brain dump"): record, transcribe, parse, preview, confirm.
- FR-5 (G1). Inbox for detail-less quick capture; Inbox items are not scheduled until given a duration and due date.
- FR-6 (G1). Lists (one per class/area, color-coded), Tags, full-text Search, Filters (list, tag, priority, due range, scheduled/unscheduled, has-stake), Sorting (due, priority, manual, duration), and smart views (Today, Upcoming, Overdue, Unscheduled, Stakes active).
- FR-7 (G2). Source-grounded breakdown: a task may carry attached source material (paste text or a single attached document). When a source is present, the breakdown derives subtasks from the real requirements. Rules in Section 9.7 and `03`.
- FR-8 (G2). Every task gets one "First move" (2 to 5 min, concrete). Subtasks are editable, reorderable, deletable; per-subtask "Make easier"; a "Refine" chat regenerates the breakdown from a user instruction. The First move is the on-ramp shown at the start of a session and the unit shown in Blindfold; it is not itself an unlock condition (see `04`).

**Scheduling engine**
- FR-9 (G1). The on-device engine places auto-scheduled tasks into free time before each task's Due, honoring: duration minus progress, Start-after, Scheduling-hours profile, Split toggle with Minimum/Maximum block, buffers before/after, dependencies, and priority. Algorithm in Section 9.5.
- FR-10 (G1). Ordering. Default standard mode orders by priority then Due (Urgent > High > Medium > Low, then earliest Due). A "Due date only" mode (Settings) orders strictly by Due. Ties broken by manual order then creation time. Deterministic.
- FR-11 (G1). Task splitting. Splittable tasks break into sessions sized per Section 9.5.4, never below Minimum block, never above Maximum block, balanced or front-loaded per the Workload setting. Also a one-tap "Split into sessions" helper.
- FR-12 (G1). Due is a hard deadline, not a reminder. The scheduled block(s) are distinct from Due and rendered distinctly (Section 8).
- FR-13 (G1). Scheduling-hours profiles (for example "Study hours," "Personal hours") with a weekly template and date overrides. Resolution per task is `Task.schedulingHours ?? List.schedulingHours ?? Settings.schedulingHours`.
- FR-14 (G1). Workload distribution setting: Balanced (even daily load) or Front-load (as soon as possible). Auto-switch a task to front-load when it is near or past Due. Logic in Section 9.5.3.
- FR-15 (G1). Recurring tasks/events via the RecurrenceRule model (daily/weekly/monthly, every-N, by-weekday, from-completion option, per-occurrence start window, ends never/after-N/on-date, exceptions).
- FR-16 (G1). Missed repeating occurrences default to drop (do not stack two on the next day). A per-task toggle allows carry-forward.
- FR-17 (G1). Auto-schedule cutoff (default 2 weeks, user-raisable with a compute-cost warning). Tasks due beyond the cutoff stay on the to-do list and schedule automatically when they enter the window.
- FR-18 (G1). Partial completion. Recording progress means only the remaining duration is scheduled on the next recompute. Progress bar shown.
- FR-19 (G1). Dependencies. A task is not placed until all its prerequisites are fully placed earlier in time. Topologically enforced.
- FR-20 (G1). Unschedulable tasks are never silently dropped. They stay on the to-do list, are flagged at-risk, and the app explains why with a one-tap fix (relax scheduling hours, extend deadline, make splittable, remove a blocking all-day event).
- FR-21 (G1). Recompute triggers: on task create/edit/delete/complete (debounced 300ms), on the manual "Rebuild schedule" action, on a daily background pass and on app open, and after Recovery. Recompute is stable: blocks that need not move do not move; only changed blocks animate. Pinned blocks never move.
- FR-22 (G1). Calendar sync (Google, Outlook, iCloud), read-only for launch. External events are read as busy blocks so the engine never schedules over them. External events always win their own time. Write-back is out of scope for launch.

**Calendar UI**
- FR-23 (G1). Views: Day, 3-Day (default on phone), Week, Month, Agenda. Pill switcher. Remembers last view.
- FR-24 (G1). Time grid with pinch-to-zoom hour height across stops (40/60/80/120 px per hour), persisted. Sticky day header. Fixed time gutter (44 px). Current-time line updating each minute.
- FR-25 (G1). Block geometry: top = minutesFromGridStart * pxPerMin; height = max(durationMin * pxPerMin, 22 px). Overlap clusters lay out side by side via the interval-graph algorithm in Section 9.8.
- FR-26 (G1). Dynamic block typography: title/time/list shown or hidden by block height and width thresholds (Section 8.7); never clip, always ellipsis.
- FR-27 (G1). An auto-broken task renders as one block spanning its total duration with an "N steps" label, not many tiny blocks. Split sessions (different times) render as separate blocks.
- FR-28 (G1). Calendar gestures at 60fps: vertical scroll, horizontal paged swipe, long-press-drag to reschedule (snaps to 5-min grid, becomes pinned, shows a live snapped-time pill, selection haptic on each snap step, page-scroll locked during a drag with edge autoscroll, tactile drop-spring), drag top/bottom edge to resize (44px handles), long-press empty space to create, tap to open detail sheet, tap checkbox to complete inline. Pinned blocks show a lock glyph and a Lock/Unlock toggle.

**Ignition (app-locking on a session model)** (full spec in `04`)
- FR-40 (G3). Stake apps: the user selects their own leisure apps via the native picker (iOS FamilyActivityPicker, opaque tokens; Android installed-app list), Opal-style. The block list is editable at any time. The six never-lockable categories (phone, messages, maps, accessibility, OS settings, Ampora) are always protected, stay reachable, and can never be added. Enforced in code (client and server) and in the picker copy.
- FR-41 (G3). A stake has two properties: a **hold** and a **trigger**.
  - **Hold = `session` (default):** stake apps lock for the length of the focus session (Section 9.9). Default session length 45 min, tunable 15 to 50. Unlock is by focus-time served (FR-77). The First move is shown at session start as the on-ramp and does not unlock anything. This is the anti-leak mechanism: doing the first move does not end the lock, serving the session does.
  - **Hold = `until_done` (opt-in):** stake apps lock until completion is verified (photo/screenshot, lenient AI). Only offered when the task or subtask estimate fits inside one session under the wellbeing cap, so it stays for short concrete tasks. If the session cap is reached before completion, the lock converts to a normal session release (wellbeing wins, outcome logged). It is never offered against a whole project.
- FR-41a (G3). **Trigger = `manual`:** the user taps Start now. **Trigger = `scheduled`:** the session auto-arms at a set time (the implementation-intention cue). An optional `startWindowMin` means "if I have not started within X minutes of the cue, arm the lock anyway" (this absorbs the old beat-the-clock behavior; it is not a separate mode). A scheduled lock never arms inside quiet hours, releases early if the task is completed, and can always be dismissed behind the 60-second panic-valve friction.
- FR-41b (G3). Stakes are per-device and independent. A lock on one device does not lock another. No multi-device lock at launch.
- FR-41c (G3). Only one session (staked or not) can be active at a time. No overlapping locks.
- FR-41d (G3). Recurring stakes repeat. If a recurring task carries a scheduled stake, the stake config repeats with each occurrence. A weekly summary notification reminds the user the recurring stake is active, with a one-tap edit.
- FR-42 (G3). Panic valve ("Unlock early"): always available emergency unlock behind 60 seconds of friction (countdown plus a calm message). Required for App Store and wellbeing.
- FR-43 (G3). De-escalation: repeated panic-valve use or repeated misses reduce stake strength, suggest a break, and offer "Pause stakes for today." The app never answers distress with more pressure.
- FR-44 (G3). Stake strength uses fixed sensible defaults plus a single user-set strength control. (No automated calibration at launch.)
- FR-45 (G3). Session lifecycle and edge cases per Section 9.9 and `05` (shield persists across app kill/restart, auto-expires at the session end, at the daily cap, and at the quiet-hours boundary, never locks overnight).
- FR-46 (G3). Wellbeing caps enforced: daily total lock cap (default 180 min, user-lowerable, hard ceiling), single-session cap (50 min, so the daily cap is hard to hit by accident), quiet-hours auto-release. Specified in Section 9.10.

**Verification** (full spec in `04`)
- FR-77 (G3). A stake's unlock is confirmed by one of three methods: honor (tap done), focus-time (app-verified time served in the session, the recommended default and the backbone of the session hold), or photo/screenshot proof with a lenient AI plausibility check and a private Proof Log (used by the `until_done` hold). Full unlock flow in `04`.
- FR-77b (G3). Focus-time verification pauses when you leave the app. The session timer counts only while Ampora is in the foreground: backgrounding pauses it, returning resumes it. A session is not counted complete until the required focus time has genuinely elapsed in the foreground. This is honest-by-design (you are restricting your own device). The panic valve and override always apply.
- FR-78 (G3, NFR-6). Verification never traps. Every method has the panic valve and, for image proof, an "Unlock anyway" override. The AI check errs toward accepting (a false rejection is treated as worse than a false accept). Repeated overrides or panic use trigger de-escalation, never more demands. No shame copy on any failed or overridden verification.

**Projects (a first-class type, distinct from Tasks)** (full spec in `06`)
- FR-82 (G2). Two work types. Ampora has Tasks (short, 1 to 2 days) and Projects (ongoing or large). Projects are created explicitly, not auto-detected by size.
- FR-83 (G2). Project structure. A project is created from one line, is typed deliverable or study, and holds an ordered, editable phase list (drafted by AI, edited like a breakdown) plus one optional context line (one paragraph, for example "MLA format, topic is Cold War containment, 5 pages"). No file library at launch; for a session that needs real material, the user pastes it on that day's task (FR-7).
- FR-84 (G2). Session generation. Each night, during the pre-built-tomorrow pass, every active project emits one normal schedulable Task whose session goal, subtasks, and First move are computed from the current phase, the context line, the last session's outcome, and tomorrow's block length. That task schedules, locks, and verifies like any other task.
- FR-85 (G2). Progress and check-in. A session's end check-in ("Did you finish today's goal?" Done / Keep going / Stop here) advances the project. Done marks the session goal complete; Keep going starts the next session after a break; Stop here reflows the remainder. If the check-in is skipped, progress is inferred from subtask checkboxes so generation never stalls. Progress is shown as a simple percent bar (completed phases plus fraction of the current phase). Stakes lock against the generated session task, never the whole project.

**Account, subscription, platform, retention**
- FR-87 (G1). Authentication. An account is required. Onboarding offers Sign in with Apple, Sign in with Google, and email magic link (Sign in with Apple is required by Apple's guideline 4.8 because Google is offered). All data syncs to the cloud as the source of truth, with a local cache for offline use and speed. No anonymous local-only mode. Account deletion and data export in Settings.
- FR-88 (business). Subscription and trial. Ampora is a paid app with no free tier. New users get a 2-week free trial, then a monthly or annual subscription (annual about 10% cheaper per month). On iOS this uses Apple In-App Purchase with an introductory free trial. A trial-and-plans screen appears right after sign-in, and a paywall appears at trial end. Subscription state gates app access. A dev-only bypass skips the paywall in development builds, never shipped user-facing.
- FR-89 (platform). Targets. iOS and Android phones (full functionality including app-blocking), plus a web app with full functionality except app-blocking (the web app manages tasks, projects, schedule, and configures stakes; the lock is enforced on the phone). Phone ships first, web polish follows. English only at launch.
- FR-90 (G4). Pre-built tomorrow's plan (the retention hook). Each evening the app prepares tomorrow's schedule (including project-generated session tasks per FR-84) so opening the app shows a ready plan. Surfaced as "Ready for tomorrow" with the day's first task and First move.

**Recovery, Blindfold, Focus, Notifications, Onboarding, Settings**
- FR-60 (G4). Recovery Mode: triggered by opening after a lapse (2+ days of missed blocks) or "Catch me up." Drops moot past-due items per FR-16, bumps now-urgent, rebuilds the week, shows a preview, accepts in one tap, copy "Rebuilt your week," zero shame. Missed blocks surface in a calm "Needs attention" view with per-item Reschedule / Let it go.
- FR-61 (G2). Blindfold Mode: "I'm overwhelmed" hides everything and shows one micro-step (the First move or smallest next subtask); the next is hidden until the current is swiped done. Can pair with a stake.
- FR-62 (G2). Focus session: the room a session runs in. Full-screen, current step large, the session timer, optional ambient audio (white/brown noise, rain, cafe), buttons "I'm stuck" (AI simplify), "Take a break," "I'm overwhelmed," and the end check-in (FR-85). If a stake is attached, apps are locked and a lock banner shows what is locked and the time remaining. Logs session completion to the on-device event log.
- FR-63 (G1). Notifications: rate-limited (default max 1/hour; Due<12h up to 1/30min; Due<2h up to 1/20min; max 3 start-reminders/day/task), plus scheduled-session cues and the recurring-stake weekly summary. Quiet hours (default 23:00 to 08:00), DND-respecting, snoozeable, warm and never shaming. Types and copy in Section 8.9.
- FR-64. Onboarding per Section 8.10. Never blocks use behind a permission; degrades gracefully.
- FR-65. Settings per Section 8.11 expose every configurable value.
- FR-71 (G1). Subtask semantics. The task (not the subtask) is the schedulable unit. Parent duration equals the sum of subtask estimates; completing subtasks advances progress and shrinks remaining scheduled time; the next uncompleted subtask is the surfaced "current step"; an auto-broken task renders as one block per session.

**Post-launch integrations** (spec in `08`; must never gate store submission)
- FR-73 (G1). Claude connection (MCP). A hosted MCP server exposes the task, event, schedule, breakdown, and focus surface to Claude (OAuth or API-key auth), operating only on the authenticated user's own data. Stakes are read/configure only over MCP, never a remote device lock.
- FR-74 (G1). Public API. A REST or GraphQL API with the same operations as the MCP tools, API-key auth, rate-limited.
- FR-75 (NFR-2). Portable engine. The scheduling engine and breakdown modules are pure portable TypeScript with no platform dependencies, run both on-device (instant, offline) and in Edge Functions (for Claude/MCP and the API), producing identical results.

### 7.2 Non-Functional Requirements
- NFR-1 (Performance). Calendar interactions sustain 60fps on a mid-range phone. Block drag/resize never drops frames (Reanimated worklets plus Gesture Handler; move the time grid to Skia if needed).
- NFR-2 (Performance/Correctness). A full recompute for a typical user (hundreds of tasks over 2 to 8 weeks) completes under 300ms and is deterministic and churn-minimizing.
- NFR-3 (Offline). Tasks, calendar, scheduling, Focus, Blindfold, Recovery, and lock enforcement work fully offline. AI and sync degrade gracefully with clear messaging.
- NFR-4 (Privacy/Security). Local-first; minimize synced data. No ad SDKs, no selling/sharing data. iOS stake apps are opaque tokens, never de-anonymized. AI calls send only needed content, no identity. Secrets in Edge Function config. Age floor 13. COPPA-safe.
- NFR-5 (Accessibility). WCAG 2.1 AA: full dynamic type without layout breakage, color never the only signal, VoiceOver/TalkBack labels on all interactive elements including calendar blocks and drag handles, contrast in both themes, reduced-motion mode, 44x44 min tap targets. Checklist in Section 8.12.
- NFR-6 (Wellbeing). The Section 9.10 safety layer overrides feature behavior. No medical claims anywhere.
- NFR-7 (Reliability). App-blocking must fail safe: if a shield cannot be applied or the OS state is uncertain, never trap the user; default to unlocked and log. See `05`.

### 7.3 Acceptance Criteria (Gherkin, key flows)

```gherkin
Feature: Auto-schedule a new task
  Scenario: Task fits before its deadline
    Given my Study hours are Mon-Fri 3:00 PM to 9:00 PM
    When I add "Read Chapter 11" with duration 60 min, due Friday 11:59 PM, auto-schedule on
    Then a 60-min block appears within Study hours before Friday
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

Feature: Session hold (Ignition default, anti-leak)
  Scenario: Start a dreaded task with Instagram locked for the session
    Given I have selected Instagram as a stake app and granted Screen Time permission
    And I attach a stake with hold "this session" to "Write essay intro"
    When I tap Start
    Then Instagram is shielded
    And a banner shows what is locked and the minutes remaining
    And the First move is shown as the on-ramp
    When I complete the First move
    Then Instagram stays locked because the session is not over
    When the session timer completes in the foreground
    Then Instagram unshields automatically
    And the end check-in appears
    And the outcome is logged

Feature: Scheduled lock with a start window (absorbs beat-the-clock)
  Scenario: Auto-arm if not started in time
    Given I set "Study Spanish" to lock automatically at 5:00 PM with a 10-minute start window
    When 5:00 PM arrives and I have not started by 5:10 PM
    And it is not quiet hours
    Then the stake apps lock for one session length
    And completing the task during the lock releases it early
    And I can dismiss the lock behind the 60-second panic valve

Feature: Until-done hard mode is capped
  Scenario: Estimate was wrong
    Given I attach a stake with hold "until it's done" to a short task
    When the single-session cap is reached before I submit proof
    Then the lock converts to a normal session release
    And wellbeing wins over the stricter condition
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

Feature: Project generates today's session
  Scenario: Research paper at 40 percent
    Given a "Research paper" project in the Draft phase
    When tomorrow's plan is built overnight
    Then one schedulable Task appears for tomorrow
    And its First move is computed for the current position ("open your draft and reread your last paragraph")
    And a stake can be attached to that session task, never to the whole project
```

---

## 8. UX, Exact UI Naming & Copy

Visual styling is governed by `02_Design_System.md`.

**8.1 Tabs (bottom bar):** `Today`, `Calendar`, `Tasks`, `Focus`, `Profile`. The bar is a floating segmented pill, icon-only, spec'd in `02` §6.5 and reference `docs/design/stack-reference.html`. All five surfaces stay reachable from it.

**8.2 Today screen**
- Header: "Good morning, {name}." (time-of-day variant).
- "Urgent" strip: tasks due within 24h, each a row with a quiet red dot (never a shaming banner).
- "Today's focus" card: one recommended task with a checkbox, and below it the "First move" card.
- First move card: the starter-action text and a primary button labeled `Start`. Secondary text button `Not now`.
- Always-visible ghost button: `I'm overwhelmed` (triggers Blindfold).
- FAB `+` (opens quick-add sheet). A mic button labeled `Brain dump` in the sheet.
- Empty state: "You're all caught up."

**8.3 Task editor (field labels and controls)**
Title, Notes, List, Tags, Priority (`Low` / `Medium` / `High` / `Urgent`), Auto-schedule (toggle, default on), Duration, `Due (the real deadline)` with helper "When it must be done by, not when you'll do it", Start after, Scheduling hours, `Split into sessions` (toggle) with `Minimum block` and `Maximum block`, Buffer before / Buffer after, Repeat, Depends on, Color (`Smart` default or custom). Source attach button: `Add assignment details` (paste or upload). Breakdown button: `Break it down`. Save button: `Save task`. Advanced fields live under a `More options` disclosure.

**8.4 Breakdown UI**
Subtask list with checkboxes; per-subtask `Make easier`; a `Refine` button opening a chat input with placeholder "Tell me how to break this down differently". The starter action is labeled `First move`.

**8.5 Tasks tab**
Segments `Overdue` / `Today` / `This week` / `Later`; an `Inbox` section with swipe action `Schedule`; a `Missed` filter chip; a collapsible `Completed` section. Swipe actions: `Done`, `Schedule`, `Delete`. Long-press opens a `TaskActionSheet`. Manual drag-reorder with a screen-reader reorder path. Sticky section headers, sticky quick-add, animated checkbox, list-color tint bar per row.

**8.6 Calendar tab**
View pills `Day` / `3-Day` / `Week` / `Month` / `Agenda`. Manual recompute button `Rebuild schedule`. When behind, a banner: "You have {N} unfinished blocks. Want me to rebuild?" with button `Catch me up`. Tap a block opens a bottom sheet with `Complete`, `Edit`, `Delete`.

**8.7 Block typography thresholds**
- Height >= 44 px and width >= 90 px: title + time + list dot.
- Height 28 to 44 px: title + time (one line each, ellipsis).
- Height < 28 px: title only, ellipsis; tap for detail.
- Width < 56 px (dense week view): colored bar with first ~6 chars; tap for detail.

**8.8 Ignition (Stakes) UI**
- On a task: toggle `Put something on the line`. Then one question, `Unlock when?`, with two options: `When this session ends` (default) and `When it's done` (offered only for short tasks). Then one optional toggle: `Lock automatically at [time]`, and when on, an optional `If I haven't started within [X] min`.
- A `Session length` control (default 45 min, range 15 to 50), with a `Just get me started` preset that sets a short session.
- Lock banner during a session: "{Instagram and 2 more} are locked. {N} min left." Neutral surface, no alarm colors, since the lock is consensual.
- Stake app picker: Opal-style native picker, editable, with the six never-lock categories shown as permanently protected.
- End check-in sheet: `Done` / `Keep going` / `Stop here`.
- Panic valve: `Unlock early`, a 60-second countdown, a calm message.

**8.9 Notifications (copy)**
- Start Reminder: "Hey, {task} is on your plate. Want to do the first move? It takes 5 minutes."
- Scheduled-session cue: "{task} starts now. Tap to begin, or your apps lock in {X} min."
- Lock arm cue (fires once the start window above closes, so the cue and this one are never posted at the identical instant): "{task} locks now. Open Ampora to start your session."
- Ready for tomorrow: "Tomorrow's plan is ready. First up: {task}."
- Recurring-stake weekly summary: "Your daily lock on {task} at {time} is still on. Tap to edit."
- All warm, never shaming, snoozeable, rate-limited per FR-63.

**8.10 Onboarding**
1. Welcome (one-line value). 2. Sign in (Apple, Google, or email magic link). 3. Name. 4. Scheduling hours (grid, sensible defaults). 5. Notifications permission (primed honestly). 6. First task (guided: add one real assignment, watch it break down). 7. The aha, reached in the first session: pick stake apps and run one short locked session on the first task (Screen Time permission primed honestly, skippable). No energy-peak step.

**8.11 Settings** expose: scheduling hours and profiles, workload distribution, notification per-kind toggles and quiet hours, daily lock cap and single-session cap, stake strength, never-lock categories (view only), account (sign out, delete, export), subscription and trial state, appearance (light/dark), Help/About/Legal.

**8.12 Accessibility checklist:** dynamic type, color-plus-icon for all status, VoiceOver/TalkBack labels on blocks and drag handles, reduced-motion, 44x44 targets, contrast verified in both themes (`02`).

**8.13 Visual system.** Design System v3 "Calm Premium" is authoritative in `02`: warm Stone neutral spine, bone canvas `#F7F6F3`, ink `#1C1917`, primary `#2563EB`, Projects accent `#7C3AED`, tinted diffuse shadows, muted-pastel list hues, tabular numerals for times and counts, tactile motion. Dials locked VARIANCE 5 / MOTION 6 / DENSITY 5.

---

## 9. Technical Notes

**9.1 Architecture.** React Native + Expo (SDK 54+), TypeScript. State in Zustand with selector discipline (raw select then derive via useMemo). Local persistence via MMKV. Backend Supabase (Postgres, Auth via Sign in with Apple, Google, and email magic link, Edge Functions wrapping AI). On-device scheduling engine (no server round-trip for recompute). Calendar rendered custom with Reanimated 3 + Gesture Handler, Skia for the time grid if needed; Month may use a themed react-native-calendars.

**9.2 App-blocking.** Full implementation in `05_App_Blocking_Technical.md`. Summary: iOS uses Apple Family Controls (authorization for `.individual`), FamilyActivityPicker (opaque tokens), ManagedSettings (apply the shield), a DeviceActivityMonitor extension plus ShieldConfiguration and ShieldAction extensions, sharing state via an App Group. Needs the `com.apple.developer.family-controls` entitlement (apply early; use the Development capability while waiting; soft in-app lock ships today behind a flag). Android uses UsageStatsManager plus a foreground service and a system overlay.

**9.3 AI.** Google Gemini (`gemini-2.5-flash`) behind a Supabase Edge Function; key is a server-side secret (`GEMINI_API_KEY`); when no key is set, the function returns `{ error: "no_key" }` and the app falls back to a local template. All AI degrades gracefully offline.

**9.4 Data schema.** Every entity has `id`, `createdAt`, `updatedAt`, `syncState`. Times are epoch ms unless noted as minutes-from-midnight. Cloud is the source of truth with a local cache.

Core scheduling:
```ts
type CalEvent = { id: string; title: string; start: number; end: number; allDay?: boolean; source: 'local'|'google'|'apple'|'outlook'; externalId?: string; busy: boolean };
type Task = {
  id: string; title: string; notes?: string;
  durationMin: number; due?: number; autoSchedule: boolean;
  listId?: string; projectId?: string;            // projectId back-references doc 06; at most one project per task
  subtasks: Subtask[]; firstMove?: StarterAction;
  recurrence?: RecurrenceRule; priority?: number;
  sourceRefs?: SourceRef[]; splittable?: boolean;
  status: 'todo'|'doing'|'done';
};
type Subtask = { id: string; title: string; done: boolean; durationMin?: number };
type StarterAction = { id: string; text: string; done: boolean };   // the First move, the session on-ramp
type ScheduledBlock = { id: string; taskId: string; start: number; end: number; pinned?: boolean; status: 'planned'|'in_progress'|'done'|'missed' };
type List = { id: string; name: string; color: string };
type SchedulingHours = { perDay: { day: number; windows: { start: number; end: number }[] }[] };  // minutes-from-midnight
type RecurrenceRule = { freq: 'daily'|'weekly'|'monthly'; interval: number; byWeekday?: number[]; until?: number; count?: number };
type SourceRef = { id: string; type: 'text'|'file'; uri?: string; extractedText?: string };
```

Ignition (the headline subsystem):
```ts
type StakeApp = { id: string; platform: 'ios'|'android'|'desktop'; tokenOrPackage: string; label?: string; eligible: boolean };  // iOS stores an opaque ApplicationToken, never identity
type StakeSession = {
  id: string; taskId: string; deviceId: string;        // per-device and independent (FR-41b)
  hold: 'session'|'until_done';                         // session = locked for the focus session; until_done = short tasks only
  trigger: 'manual'|'scheduled';
  sessionMin?: number;                                  // for hold='session', default 45, range 15..50
  startWindowMin?: number;                              // scheduled only: arm if not started within X of the cue (absorbs beat-the-clock)
  scheduledAt?: number;                                 // scheduled trigger time
  verification: 'honor'|'focus_time'|'photo'|'screenshot';   // session hold uses focus_time; until_done uses photo/screenshot
  strength: number;                                     // 0..1, user-set, not auto-calibrated
  startedAt?: number; endedAt?: number;
  outcome?: 'completed'|'panic_valve'|'timed_out'|'expired'|'session_served';
};
type LockEvent = { id: string; sessionId: string; type: 'shield_on'|'shield_off'|'panic_valve'|'session_complete'|'cap_reached'|'quiet_hours_release'|'auto_arm'; at: number };
type Proof = { id: string; sessionId: string; method: 'focus_time'|'photo'|'screenshot'|'honor'; uri?: string; aiVerdict?: 'pass'|'uncertain'; overridden?: boolean; at: number };
type AppEvent = { id: string; type: string; at: number };  // on-device analytics only; session completion + time-to-start
```

Projects (doc 06):
```ts
type Project = { id: string; title: string; kind: 'deliverable'|'study'; contextLine?: string; phases: Phase[]; percent: number };
type Phase = { id: string; title: string; done: boolean };
// A project generates a normal Task per day (FR-84); Task.projectId links it back.
```

Settings and enforcement:
```ts
type Settings = {
  dailyLockCapMin: number;                       // default 180
  singleSessionCapMin: number;                   // default 50
  quietHours: { start: number; end: number };    // minutes-from-midnight, auto-release
  neverLockCategories: string[];                 // phone, messages, maps, accessibility, OS, Ampora
  stakeStrength: number;                          // 0..1 user-set
  subscription: { status: 'trial'|'active'|'lapsed'; plan?: 'monthly'|'annual'; trialEndsAt?: number };
};
```
Caps, quiet hours, never-lock categories, and the single-session cap are enforced both client- and server-side.

**9.5 The scheduling engine (full algorithm).**

*9.5.1 Free-time construction.* Build a timeline from now to cutoff. Subtract, in order: busy CalEvents and fixed tasks plus buffers, external busy blocks, time outside the relevant Scheduling-hours windows, quiet hours, and pinned ScheduledBlocks. Output a sorted list of FreeInterval {start, end, profileIds[]}.

*9.5.2 Ordering.* Build the eligible task list (auto-scheduled, due within cutoff, dependencies satisfiable). Sort by the comparator in FR-10. Topologically constrain so a task is only placed after all dependsOn are placed.

*9.5.3 Placement loop.*
```
for task in orderedTasks:
  remaining = task.durationMin - (task.progressMin or 0)
  windows = freeIntervals filtered to: task.schedulingHours,
            within [task.startAfter, task.dueAt], after deps finish
  mode = (task near/over due) ? frontload : settings.workloadDistribution
  if not task.splittable:
     slot = bestWindow(remaining + buffers, windows, mode)
     if slot: addBlock(task, slot); consume(slot)
     else: markUnschedulable(task)
  else:
     sizes = sessionSizes(remaining, task.minBlockMin, task.maxBlockMin, mode,
                          daysAvailable(now, task.dueAt, windows))
     for size in sizes:
        slot = bestWindow(size + buffers, windows, mode)
        if slot: addBlock(task, slot); consume(slot); windows = refresh()
        else: markPartiallyUnschedulable(task, leftover); break
```
*bestWindow scoring.* score = base - loadPenalty - latenessPenalty, where frontload favors earliest start (base = -startTimeOffset); balanced sets loadPenalty = k1 * (minutesAlreadyPlacedOnThatDay / dayCapacityMinutes), k1 = 1.0; latenessPenalty is large if placing risks missing Due (forces front-load near deadline). Balance is soft and never causes a missed deadline.

*9.5.4 Session sizing.* daysAvailable = count of days between now and Due with free capacity in the task's scheduling hours. Balanced: target = clamp(ceil(remaining / daysAvailable), minBlock, maxBlock), emit sessions of target until exhausted (last remainder merged into the previous if below minBlock). Front-load: emit maxBlock sessions earliest-first until exhausted.

*9.5.5 Color-coding (deadline slack).* slackRatio = (minutesUntilDue - remainingMinutes) / max(minutesUntilDue, 1). Green if > 0.5, Amber if 0.2 to 0.5, Red if < 0.2 or overdue. Surfaced as an icon/label for accessibility.

*9.5.6 Recovery reprioritization.* On Recovery: mark moot any past-due, non-recurring task with no explicit "still needed" flag (confirm in batch), drop missed repeating occurrences per FR-16, bump now-urgent tasks (slackRatio < 0.2) to front-load, then run the placement loop. Present a diff preview.

*9.5.7 Stability.* Recompute compares new placement to existing blocks and preserves any block whose task and time are unchanged (no churn). Pinned blocks are immovable inputs. Only changed blocks animate. Recompute flips elapsed blocks of still-open tasks to `status: 'missed'`, which feeds the "Needs attention" view.

*9.5.8 Undated auto-scheduled tasks.* A task with auto-schedule on but no due date is never force-placed. It stays on the to-do list as available-anytime. If the user opts in to "fit it in when there is space", it backfills into leftover free time at the lowest priority, after all dated work, and is the first thing dropped when space is tight. It never displaces a task with a deadline.

**9.6 Natural-language quick-add.** Parse a typed line into {title, duration, due, list, priority, recurrence} and show a preview chip set before saving. Ambiguity defaults to a safe interpretation and is editable in the preview.

**9.7 Source-grounded breakdown.** If a source is attached, the breakdown derives subtasks from the real requirements (see `03`). Rules: for Due > 24h, 1 to 3 starter subtasks each <= 10 min plus 15 to 30 min subtasks; for Due < 24h, only 5 to 10 min subtasks; first subtask always concrete; max 8 subtasks; one First move of 2 to 5 min. Abstract-task detection (keywords essay/research/analyze/write/project/presentation) increases granularity. `Refine` regenerates conversationally. Fallback: a generic 4-step template behind a warm banner.

**9.8 Overlap layout.** Build an interval graph of a day's blocks; find connected components; within each component assign columns by a greedy sweep; render blocks at equal width within their cluster.

**9.9 Session lifecycle.** A session has a length (`sessionMin`, default 45). On start (manual tap or scheduled auto-arm), if a stake is attached the shield is applied and a LockEvent `shield_on` is logged. The foreground-only timer runs (pauses on background, resumes on foreground). On timer completion the shield is removed (`shield_off`, `session_complete`), the end check-in appears, and the outcome is logged. The shield persists across app kill/restart; it auto-expires at the session end, at the daily cap, and at the quiet-hours boundary, and never locks overnight. For `until_done`, the shield holds until verified completion or until the single-session cap converts it to a normal release. Only one session is active at a time.

**9.10 Wellbeing safety layer (overrides features).** Daily lock cap (default 180 min, user-lowerable, hard ceiling). Single-session cap 50 min. Quiet-hours auto-release. The six never-lock categories are never shielded. Panic valve is always available behind 60 seconds. De-escalation lowers stake strength and offers a pause after repeated panic use or repeated misses, and never escalates. No shame copy anywhere. Enforced client- and server-side.

**9.11 AI Edge Functions.** `ai-breakdown` (subtasks + First move, grounded when a source is present), `ai-refine-breakdown` (regenerate from an instruction), `ai-verify-proof` (lenient photo/screenshot plausibility, default-pass). All behind the no-key contract with local fallbacks.

---

## 10. Metrics & Success Criteria

| Metric | Target | Source |
|---|---|---|
| Time-to-start | Median reminder-to-first-action < 20 min | On-device event log (reminder fire, First move tap) |
| Session completion rate | Staked sessions complete more often than unstaked | On-device event log |
| Panic-valve rate | < 15% of staked sessions | LockEvent log |
| Lapse recovery | > 50% resume within 2 days of a lapse | On-device event log |
| Calendar performance | 60fps sustained under dense/drag | Profiling |
| Recompute | < 300ms typical | Profiling |

All are pre-launch targets, not observed data. The two headline numbers to instrument first are session completion rate and time-to-start.

---

## 11. Risks & Mitigations

| Risk | Severity | Mitigation |
|---|---|---|
| Lock feels punitive, ADHD users churn | High | Consensual "lock your own stuff", session hold not until-done by default, panic valve, no-shame copy, de-escalation, gentle defaults, until-done gated to short tasks |
| Family Controls entitlement delayed | High | Apply at project start; ship soft in-app lock behind a flag while waiting; never block launch on it |
| Scheduler churn or missed deadlines | Medium | Deterministic engine, stability rule, pinned blocks, latenessPenalty dominates placement |
| Calendar performance under load | Medium | Reanimated worklets, interval-graph overlap, Skia fallback for the time grid |
| Photo verification is spoofable | Low | Lenient by design; the lock is self-imposed so faking only cheats the user; session hold (not photo) is the default |
| Scheduled lock surprises a busy user | Medium | Never arms in quiet hours, 60-second dismiss, completing the task releases early, de-escalation on repeated dismiss |

---

## 12. Rollout Plan

Build order and current state live in `07_Build_Roadmap.md`. High-level: the core loop first (capture, breakdown to a First move, the session with a stake, focus-time unlock, the panic valve and caps), then the full scheduler and calendar polish, then Projects, then Recovery and notifications, then post-launch MCP and public API. Native iOS app-locking is gated on the Family Controls entitlement; the soft in-app lock ships today behind a flag. Launch is iOS and Android phones plus web (web minus blocking); the store submission never waits on MCP or the API.

---

## 13. Decision Log

The full living log is `09_Decisions.md`. The load-bearing decisions:

| Decision | Owner | Why |
|---|---|---|
| Ignition unit is the focus session; a stake has a `hold` (session default, or until_done for short tasks) and a `trigger` (manual or scheduled with an optional start window) | Aria | Session hold fixes the leak (start then bail) that lock-until-start had, and stays under wellbeing caps unlike lock-until-done |
| The First move is the session on-ramp and the Blindfold unit, not an unlock condition | Aria | Serving the session is what unlocks; doing a 2-minute move must not end the lock |
| Beat-the-clock is not a separate mode; it is an optional start window on a scheduled trigger | Aria | Collapses three old modes into two orthogonal properties |
| Verification tiers are honor, focus-time (backbone), and photo/screenshot only | Aria | Three is enough; word-count and screen-activity were choice overload (moved to V2) |
| Stake strength is fixed defaults plus a manual control (no auto-calibration) | Aria | The Learning Engine is deferred; strength stays simple and user-controlled |
| Projects ship as phases plus a one-line context field plus a nightly-generated session task; no file library or project chat at launch | Aria | Multi-day work must exist for Ignition to lock against; files/chat are a V2 moat, not launch-critical |
| Recurring stakes repeat; a weekly summary reminds the user with a one-tap edit | Aria | The whole point of a scheduled recurring lock; visibility satisfies App Store review |
| Only one session active at a time | Aria | Removes a class of overlapping-lock edge cases |
| Full FlowSavvy-grade scheduler is kept and is the retention hook's engine | Aria | Retention and it supplies scheduled-lock times for free |
| Read-only calendar sync at launch; write-back deferred | Aria | The engine must see your classes to place sessions; write-back is not launch-critical |
| Voice capture kept | Aria | Voice is the ideal low-friction capture for the audience |
| MCP and public API kept but post-launch; never gate store submission | Aria | Zero value to a day-one user; must not delay the store |
| Paid app, no free tier; 2-week trial then monthly/annual IAP; subscription covers AI | Aria | Monetization |
| Account required; cloud is the source of truth with a local cache; no anonymous mode | Aria | Cloud-first sync |
| Web is a target (full functionality except blocking); English only at launch; phone ships first | Aria | Platform scope |
| On-device deterministic engine runs on-device and server-side identically | Aria | Instant offline recompute plus identical results when Claude/MCP drives changes |

**Superseded (do not reintroduce).** The prior three-mode model (Mode A "lock until I start", Mode B "lock until done", Mode C "beat the clock") is replaced by the hold + trigger model above. "Start is verified by completing the First move" is replaced by "the session hold is served by focus-time; the First move is the on-ramp." "Build the full product including the Learning Engine" is replaced by the trimmed launch scope; the Learning Engine, stake calibration, breakdown memory, multi-modal attachments, project files/chat/mastery, and the word-count and screen-activity verification tiers are deferred to `V2_Changes.md`.

---

## 14. Success Story Narrative

It is a Sunday night in October. Maya, a junior with three AP classes, opens Ampora dreading a five-page history essay she has avoided for four days. She does not open a blank planner. She taps "Brain dump" and says her week out loud, and Ampora lays it into her calendar. The essay is the red one. She taps it, taps "Put something on the line", and leaves it on the default, locked for this session. Instagram and her game go dark. The First move says "Open a doc and write one sentence stating your thesis." She writes the sentence, and the apps stay dark, because the session is not over. Forty-five minutes later the timer completes, her apps come back, and the app asks if she is done or wants to keep going. She keeps going. For the tasks she knows she will dodge, she sets her Spanish review to lock automatically at 5 PM every day, and after a few days she stops fighting it. On Wednesday she falls behind after a late practice. She opens the app, taps "Catch me up," and her week rebuilds itself with no lecture about a broken streak. She tells two friends, "this app literally locks my phone until I do my homework," and they download it that night.

---

## 15. Open Questions & Assumptions

**Open questions (chosen default in brackets; revisit with data):**
- Q1. Default session length. [45 min, tunable 15 to 50; a "Just get me started" preset sets a short session.]
- Q2. iOS DeviceActivity granularity for the scheduled start window. [Enforce timing in-app, use shielding for the lock.]
- Q3. Android enforcement path. [Start with UsageStats + overlay via expo-app-blocker; revisit reliability.]
- Q4. Calendar engine: pure RN views vs Skia canvas. [Start RN + Reanimated; move the time grid to Skia if 60fps is not met.]
- Q5. Store account holder: parent vs LLC. [Decide before submission; start the entitlement request under whichever account.]
- Q6. STT provider (device vs Whisper-class). [Device STT first for cost/privacy; upgrade if accuracy is poor.]

**Assumptions (flagged for audit):**
- A1. Users are 13+ and restricting their own device. Authorization uses `.individual`.
- A2. The founder can obtain the Family Controls distribution entitlement.
- A3. Numeric targets in Section 10 are pre-launch targets, not observed data.
- A4. A strong-enough model is available for breakdown within budget.
- A5. The on-device engine can hit < 300ms on mid-range hardware with the specified data structures.

---

## 16. Glossary

- **Auto-schedule:** the engine finds a time for a task automatically (vs a fixed time the user sets).
- **Scheduling hours:** named windows (for example Study hours) a task may be placed in.
- **Split into sessions:** breaking a long task into multiple shorter blocks across time.
- **Minimum/Maximum block:** the smallest/largest single sitting allowed for a split task.
- **Buffer:** reserved time before/after a block the engine will not schedule into.
- **Pinned block:** a user-placed (dragged or locked) block the engine never moves.
- **Session:** a bounded run of work on a task (15 to 50 min). May carry a stake. The foreground-only focus timer lives here.
- **Stake / Ignition:** the user locking their own apps behind a task as a commitment device.
- **Hold:** what keeps apps locked. `session` (locked for the session, the default) or `until_done` (locked until verified complete, short tasks only).
- **Trigger:** what starts the session. `manual` (tap Start) or `scheduled` (auto-arms at a set time, with an optional start window).
- **Start window:** on a scheduled stake, the grace minutes after the cue before the lock arms (the old beat-the-clock, absorbed).
- **Panic valve:** the always-available emergency unlock for a stake, behind 60 seconds.
- **First move:** the 2 to 5 minute concrete starter action; the session on-ramp and the Blindfold unit, not an unlock condition.
- **Blindfold:** collapsing the screen to a single next step.
- **Recovery Mode:** the one-tap, shame-free rebuild after a lapse.
- **Verification method:** how a stake confirms work: honor, focus-time (the automatic backbone), or photo/screenshot.
- **Focus-time unlock:** the session hold's mechanism: apps unlock only after the required focus time is served in the foreground.
- **Proof Log:** the user's private history of submitted photo/screenshot proofs.
- **Project:** a multi-day work type: an ordered phase list plus a one-line context field plus percent progress, generating one schedulable Task per day.
- **Phase:** one ordered milestone of a project (for example outline, draft, revise).
- **Schedulable unit:** the thing the engine places in time. In Ampora this is the task, not its subtasks.
- **Subtask:** an ordered execution checklist item inside a task.
- **Family Controls / Screen Time API:** Apple frameworks used to shield apps with the user's permission.
- **FamilyActivityPicker / ApplicationToken:** the native app picker and the opaque token representing a chosen app (bundle IDs are not exposed on iOS).
- **Portable engine:** the pure deterministic TypeScript scheduling and breakdown module that runs on-device and server-side with identical results.
- **MCP server:** the hosted service that lets Claude read and write the user's Ampora tasks and schedule in natural language (post-launch).
