# Ampora — Build Roadmap & Project Setup

> How to set up the Claude Code project and the exact order to build so this never feels overwhelming. Do these in sequence. Each step is small enough to finish. No em dashes, no semicolons.

## Build status (read first)

A prior build (v1) shipped a large amount of this app already: the task system and quick-add, the on-device deterministic scheduler, the full calendar with drag, AI breakdown with local fallbacks, focus session and Blindfold, notifications, local-first cloud sync, and the design system as tokens and primitives. That work is a strong foundation and most of it carries forward unchanged (the scheduler, calendar, task model, breakdown, and design system).

What must be rebuilt to this spec: v1 shipped the old three-mode Ignition model (lock-until-start, lock-until-done, beat-the-clock). The session model in `04` replaces it. The Ignition, session, and verification layer needs to be rebuilt around the `hold` plus `trigger` model, the session-length focus-time unlock, the until_done cap-to-release conversion, and the scheduled trigger with a start window. Everything that was cut (the Learning Engine, stake calibration, breakdown memory, project files and chat and mastery, word-count and screen-activity verification, widgets, desktop) should be flag-disabled or removed, and never referenced outside `V2_Changes.md`.

Native iOS app-locking stays gated on the Apple Family Controls entitlement; the soft in-app lock ships behind a flag while waiting.

## A. Set up the Claude Code project
1. Point Claude Code at the repo. Load the canonical docs as the working spec: `00_Overview`, `01_PRD`, `02_Design_System`, `03_AI_Breakdown_and_Subtasks`, `04_Ignition_Sessions_and_Verification`, `05_App_Blocking_Technical`, `06_Projects`, `07_Build_Roadmap` (this file), `08_MCP_and_API`, and `09_Decisions`. `V2_Changes` is the out-of-scope list, not a build input.
2. Standing rule for every session: "Build strictly from 01_PRD and its companion specs. Match 02_Design_System for all UI. The scheduling engine is on-device and must be smooth and correct. The lock unit is the focus session (04). Never build anything in V2_Changes. The existing codebase is a foundation, but the Ignition/session/verification layer is a rebuild to the new model, not an incremental patch. My style: no em dashes, no semicolons, direct, one best recommendation."

## B. Tools
- **Mobbin** for reference app screens (Things, Todoist, FlowSavvy).
- **Figma** to lock tokens (color, type, spacing, radius) before coding UI.
- **v0 / Vercel / shadcn / Tailwind** for the marketing site.
- Run the loaded design skills (frontend-design, ui-ux-pro) when generating actual components, not for spec docs.

## C. Build order (do not skip ahead)
The rule: the boring core has to be excellent before the hook matters. A great lock on a janky calendar still fails.

**Milestone 1 — Data + task system (foundation)**
1. The full data model (PRD Section 9.4).
2. Task editor with every field, quick-add with natural-language parse, Inbox/quick-capture.
3. Lists, tags, filtering, sorting, search.
4. Apply the design system from the first screen. Do not build ugly-now-pretty-later.

**Milestone 1.5 — Breakdown + subtask foundation (alongside Milestone 1)**
5. Subtask semantics from `03` Part 2 (task is the schedulable unit, duration rollup, progress mapping, one block per session). Get this right early; it touches scheduling, the calendar, and completion everywhere.
6. Build the scheduling and breakdown modules as a shared pure-TS package from day one (`08`), so on-device and server use the same code.

**Milestone 2 — Scheduling engine (the hard part)**
7. Free-time model, ordering, placement, splitting, recompute, overrides (PRD 9.5), on-device.
8. Recurring tasks including drop-missed handling and the split-into-sessions helper.
9. Unschedulable-task explanations; verify it never silently drops a task.
10. Stress-test hundreds of tasks over weeks; recompute well under 300ms.

**Milestone 3 — Calendar (must be smooth)**
11. Day/3-Day/Week time grid with zoom, dynamic block typography, overlap layout, current-time line.
12. Drag-to-reschedule (snapped-time pill, snap haptics, scroll-lock plus edge autoscroll, tactile drop-spring), resize, long-press create, complete-from-block, all at 60fps.
13. Month plus Agenda views, workload signals, cutoff stripes.
14. Polish until it stands next to FlowSavvy in a screenshot.

**Milestone 4 — The hook (the session-based lock)**
15. iOS stakes: Family Controls auth, app picker, apply/remove shield, the lock banner (PRD 7, full spec in `05`).
16. The session model (`04`): the `hold` (session default, until_done opt-in for short tasks) and the `trigger` (manual, scheduled with an optional start window). One active session at a time. The First move as the on-ramp, not an unlock condition.
17. Verification: ship the session-hold focus-time unlock first (automatic, no AI, foreground-only timer). Then the until_done photo/screenshot proof with the lenient AI check and the private Proof Log, including the single-session cap-to-release conversion (`04`).
18. Panic valve, wellbeing caps (daily 180, single-session 50), never-lock list, quiet-hours release, de-escalation, stale-lock reconciliation on launch. Build these with the lock, not after.
19. First move plus Blindfold Mode.
20. Voice capture plus the grounded breakdown pipeline and Refine chat, plus the custom and voice breakdown modes (`03`).
21. This is the demo. Cut the first clip here.

**Milestone 5 — Depth (retention)**
22. Recovery Mode: the shame-free rebuild after a lapse, plus the calm "Needs attention" missed view.
23. The pre-built-tomorrow pass (the retention hook) and the recurring-stake weekly summary.
24. Read-only calendar sync (Google, Outlook, iCloud), so the engine never schedules over classes.
25. Notifications, polished (rate limits, quiet hours, scheduled-session cues).

**Milestone 6 — Projects (thin, after the core works)**
26. Projects as a first-class type (`06`): explicit creation from one line, the two kinds (deliverable, study), the AI-drafted editable phase list, the one-line context field.
27. The end-of-session check-in (Done / Keep going / Stop here), the percent bar, and progress inference from subtask checkboxes.
28. The nightly session generator that emits one schedulable, lockable Task per project, with the First move computed for the current position.

**Milestone 7 — Post-launch (never gates store submission)**
29. Android stakes (UsageStats plus overlay).
30. Web polish (full functionality except the lock).
31. The Claude connection: MCP server plus public API (`08`). The portable engine makes this mostly a matter of exposing tools.

## D. Decisions to lock now (they gate things)
- **Store account path** (parent vs LLC). Gates submission and payments; start it early.
- **Family Controls (Distribution) entitlement** for all four bundle IDs. The longest-lead dependency; submit at project start.
- **Default hold** is `session`; **default verification** is focus-time. **Default session length** 45 min.

## E. How to not get overwhelmed
- Work one milestone at a time. Do not touch the hook until the calendar is smooth.
- End each session with a working build.
- Use the PRD as the checklist. A feature is done when it matches the PRD section and the Design System definition-of-done.
- Test on real friends after Milestone 4. Watch behavior, not opinions.

## F. First three things
1. Confirm the Ignition/session/verification rebuild plan against `04` before touching that code.
2. Load the canonical docs into Claude Code with the standing rule from Section A.
3. Start with the highest-value gap: rebuild the session model on top of the existing scheduler and calendar.
