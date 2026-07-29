# Ampora — Overview (Orientation)

> Orientation for a coding agent picking up this app cold. Short on purpose. The narrative, the market, and the positioning live in the business and marketing docs (Word files, not needed to build). This file and the ones it indexes are what you build from.

## What Ampora is, in one sentence

An auto-scheduling task app where you can lock your own distracting apps for a bounded work session, so slacking costs something now and starting is made as small as possible.

## The three things that make it different

1. **Starting is made small.** Every task hands you a 2 to 5 minute "First move," and a Blindfold mode hides everything but one step.
2. **Slacking costs something now.** Ignition lets you lock your own leisure apps (Instagram, games) for a work session, as a commitment device you control.
3. **It is a genuinely good auto-scheduler.** FlowSavvy-grade placement, recurring tasks, workload balancing, and a no-shame Recovery Mode when you fall behind.

## Who it is for

Ambitious students who procrastinate, and people with ADHD. Age 13+.

## The object model (the whole app in five nouns)

- **Task.** Title, optional due date, duration estimate, priority, and advanced fields (splittable, min/max block) behind "More options." Has subtasks and one First move.
- **Project.** A multi-day work type: an ordered phase list, one optional context line, and percent progress. Emits one normal Task per day.
- **Session.** A bounded run of work on a task, 15 to 50 minutes. May carry a stake or not. The foreground-only focus timer lives here.
- **Stake.** What you put on the line. Two properties: a **hold** (`session` = locked for the session, the default; or `until_done` = locked until verified complete, short tasks only) and a **trigger** (`manual` = you tap Start; or `scheduled` = auto-arms at a set time, with an optional start window).
- **Proof.** How a stake confirms work: honor, focus-time (the automatic backbone), or photo/screenshot (lenient AI plus a private Proof Log).

One rule that removes a class of edge cases: **only one session can be active at a time**, staked or not. No overlapping locks.

## The five surfaces (bottom tabs)

`Today` · `Calendar` · `Tasks` · `Focus` · `Profile`

Ignition is not a place; it is an option you attach to a session. Focus is the room a session runs in.

## The document set (build from these)

- `00_Overview.md` — this file.
- `01_PRD.md` — the exhaustive product spec. The source of truth for what to build.
- `02_Design_System.md` — the visual system: tokens, palette, components, motion, accessibility. The source of truth for styling.
- `03_AI_Breakdown_and_Subtasks.md` — how a task breaks down into subtasks and a First move, including source grounding and the Refine chat.
- `04_Ignition_Sessions_and_Verification.md` — the session model, the two holds, the two triggers, the panic valve and wellbeing spine, and the proof spectrum.
- `05_App_Blocking_Technical.md` — the native iOS, Android, and desktop implementation of the lock.
- `06_Projects.md` — Projects as a first-class type: phases, context line, progress, and the daily Tasks they generate.
- `07_Build_Roadmap.md` — the build sequence, the project setup, and current build state.
- `08_MCP_and_API.md` — connecting Ampora to Claude (MCP) and the public API. Post-launch, never gates store submission.
- `09_Decisions.md` — the locked product and technical decisions.
- `V2_Changes.md` — everything deliberately deferred. Do not build from this; it is the out-of-scope list.

The PRD carries no story by design. Build from the PRD, the Design System, and the specs above.
