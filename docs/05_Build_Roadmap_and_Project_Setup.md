# Ampora — Build Roadmap & Project Setup

> The "make it easier for me" doc. How to set up the new Claude project, and the exact order to build so this never feels overwhelming. Do these in sequence. Each step is small enough to finish.

## A. Set up the new Claude project
1. Create a new Claude Project named Ampora.
2. Add all six docs as project knowledge: `00_Backstory`, `01_PRD`, `02_Design_System`, `03_Business_Plan`, `04_Marketing`, and this file.
3. In the project's custom instructions, paste a short rule set: "Build strictly from 01_PRD. Match 02_Design_System for all UI. The scheduling engine is on-device and must be smooth and correct. No story in code or specs. My style: no em dashes, no semicolons, direct. Give one best recommendation, not a list."
4. Decide the name first (Section D) and find-replace "Ampora" everywhere before you start, so the codebase is named right from day one.

## B. Tools to get before building
- **Mobbin** (reference real app screens, copy structure from Things/Todoist/FlowSavvy).
- **Figma** (lock your tokens: color, type, spacing, radius) before coding the UI.
- For the marketing site: **v0** + **Vercel** + shadcn/Tailwind, with Aceternity/Magic UI for flashy sections.
- For app UI generation: **Google Stitch** or v0 for directions, then refine with your frontend-design / ui-ux skills.
- Run your loaded design skills (impeccable, ui-ux-pro, frontend-design) when generating actual components, not for the spec docs.

## C. Build order (do not skip ahead)
The rule: the boring core has to be excellent before the hook matters. A great lock on a janky calendar still fails.

**Milestone 1 — The data + task system (foundation)**
1. Implement the full data model (PRD Section 4).
2. Task editor with every field, quick-add with natural-language parse, Inbox/quick-capture (PRD 6).
3. Lists, tags, filtering, sorting, search (PRD 7).
4. Apply the design system from the very first screen (tokens, components). Do not build ugly-now-pretty-later.

**Milestone 2 — The scheduling engine (the hard part, do it right)**
5. Free-time model + ordering + placement + splitting + recalculate + overrides (PRD 9), on-device.
6. Recurring tasks, including overdue-repeat handling and the "spread across N sessions" helper (PRD 8).
7. Unschedulable-task explanations (PRD 9.8). Verify it never silently drops a task.
8. Stress-test: hundreds of tasks over weeks, confirm recompute is well under a few hundred ms.

**Milestone 3 — The calendar (must be smooth)**
9. Day/3-day/week time grid with zoom, dynamic block typography, overlap layout, current-time line (PRD 10, Design 7).
10. Drag-to-reschedule, resize, long-press create, complete-from-block, all at 60fps (Reanimated + Gesture Handler; move to Skia if needed).
11. Month + Agenda views. Workload signals, cutoff stripes.
12. Polish until it stands next to FlowSavvy in a screenshot.

**Milestone 1.5 — The data + breakdown foundation (do alongside Milestone 1)**
- Implement the subtask semantics from `07` Part 3 (task is the schedulable unit, duration rollup, progress mapping, one block per session). Get this right early; it touches scheduling, the calendar, and completion everywhere.
- Build the portable engine as a shared pure-TS package from day one (`08` Section 1), so on-device and server use the same code.

**Milestone 4 — The hook (the reason people download)**
13. iOS stakes: Family Controls auth, app picker, lock-until-done, banner, auto-unlock (PRD 14, full spec in `06`).
14. Panic valve + wellbeing caps + never-lock list + quiet-hours release (PRD 14.4, 22). Build these with the lock, not after.
14b. Verification: ship focus-time unlock first (automatic, no AI), then photo/screenshot proof with the lenient AI check and Proof Log (`09`). Start = completing the First move.
15. Starter Action + Blindfold Mode (PRD 17.starter, 19).
16. Voice capture + the grounded breakdown pipeline + refine chat, plus the custom and voice breakdown modes (PRD 16, 17, full spec in `07` Parts 1, 1B, 1C).
17. This is the demo. Cut the first clip here.

**Milestone 5 — The depth (retention + moat)**
18. Learning Engine + Revealed Self (PRD 15).
19. Beat-the-clock + stake calibration.
20. Recovery Mode (PRD 18).
21. Breakdown memory system: the learning loop, retrieval, and few-shot exemplars (`07` Part 2).
22. Calendar sync (read first, then optional write) (PRD 11).
23. Notifications, polished (PRD 12).

**Milestone 6 — Expand and connect**
24. Focus DNA screen + Energy/State surface.
25. File/photo upload (with OCR for grounding), LMS import.
26. Android stakes.
27. The Claude connection: MCP server + public API (`08`). The portable engine from Milestone 1.5 makes this mostly a matter of exposing tools, since the logic already runs server-side.
28. Widgets, offline polish, accessibility pass.
29. Desktop companion + optional screen-aware check + BYO model key.

**Milestone 7 — Projects (after the core works)**
30. Projects as a first-class type (`10`): explicit creation, the two types (deliverable, study).
31. The persistent file knowledge base (upload, OCR, retrieval over multiple files).
32. The project chat that answers from files and acts on the project's tasks and plan (the universal repair surface).
33. Progress tracking (phases plus percent, or topic coverage plus mastery) and next-task generation into the scheduler, with stakes locking against the generated session task.
34. Project memory and learning over time. Mastery and quizzing can ship last.

## D. Decisions to lock now (they block things)
- **Name** (Section D of marketing). Pick, run the searchability test, find-replace.
- **Store account path** (parent vs LLC). This gates submission and payments; start it early.
- **Default stake completion condition:** Starter Action for new users.
- **Accent color** once the name is set.

## E. How to not get overwhelmed
- Work one milestone at a time. Do not touch the hook until the calendar is smooth.
- End each session with a working build, even if small.
- Use the PRD as the checklist. A feature is done when it matches the PRD section and the Design System definition-of-done.
- Test on real friends after Milestone 4. Watch behavior, not opinions.
- Treat each milestone as shippable to yourself first. If you would not use it, fix it before adding more.

## F. First three things to do today
1. Pick the name and find-replace it.
2. Spin up the new Claude project with all six docs.
3. Start Milestone 1, step 1 (the data model), with the design tokens already defined in Figma.
