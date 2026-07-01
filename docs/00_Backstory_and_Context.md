# Ampora — Backstory & Context

> Orientation for anyone (or any AI project) picking up this app cold. Short on purpose.

## Where this came from
The app began as **Focal** (repo name "Dandelion"), built for the **MIT CREATe Challenge** by a small student team, with an ADHD co-designer (Garrett). It is a mobile-first ADHD task and time app: AI task breakdown, a smallest-first "starter action," basic auto-scheduling, ADHD-aware notifications, and a focus mode. It reached finalist status. Stack: React Native + Expo, Supabase, Gemini.

## The honest current state
Focal v1 is a **working prototype, not a production app.** Side by side with FlowSavvy, FlowSavvy is professional and polished and Focal is not something the founder would actually use day to day. The scheduling, calendar smoothness, task model, and visual design are all below the bar. So the core (scheduler, calendar, task system, UI) is being rebuilt to a high standard, not assumed as done. The prototype is reference, not foundation, for those parts.

## The pivot
The app is being repositioned and rebuilt as **Ampora** (provisional name): a best-in-class auto-scheduler (full FlowSavvy-grade functionality) plus three things no scheduler has:
1. **Schedules the real you** (a learning engine that plans around your actual behavior, not your intentions).
2. **Makes starting free** (every task hands you a 2-minute first move; a Blindfold mode hides everything but one step).
3. **Makes slacking cost something now** (you lock your own apps, like Instagram and games, behind your task as a commitment device you control).
It rebuilds your week without guilt when you fall behind (Recovery Mode).

## Who it is for
Ambitious students who procrastinate and people with ADHD. Age 13+.

## The founder
Aria Zadeh, a solo high-school builder shipping production apps with heavy AI-coding leverage (Claude Code). Track record of shipping (Focal/CREATe finalist, plus competitive STEM and robotics). This project doubles as a strong engineering portfolio artifact regardless of commercial outcome.

## The document set (project knowledge)
- `00_Backstory_and_Context.md` — this file.
- `01_PRD.md` — the exhaustive technical spec. The source of truth for what to build.
- `02_Design_System.md` — the visual design system (the founder's own spec): tokens, neutral-dominant palette, components, motion, accessibility, ADHD-friendly, plus an Ampora application section. The source of truth for styling.
- `03_Business_Plan.md` — market, positioning, monetization, operations, risk.
- `04_Marketing_and_GTM.md` — the story, the hooks, the channels, the loop.
- `05_Build_Roadmap_and_Project_Setup.md` — the sequence to build, and how to run the new Claude project.
- `06_Technical_Spec_App_Blocking.md` — the iOS/Android/desktop app-locking implementation.
- `07_AI_Breakdown_Memory_and_Subtasks.md` — how breakdown works, how it remembers the user, and how subtasks behave inside a task.
- `08_Claude_MCP_and_API.md` — connecting Ampora to Claude (MCP), the public API, and the portable engine.
- `09_Ignition_Verification.md` — how a stake verifies you started or finished a task (the proof spectrum).
- `10_Projects.md` — Projects as a first-class type: persistent files, a chat you talk to, progress tracking, and the daily Tasks they generate.
- `11_Review_and_Open_Gaps.md` — the MVP-funnel review, App Store reviewer pass, full gap scan, and the open decisions to resolve.

The PRD has no story by design. The story lives here and in the marketing doc. Build from the PRD and the Design System.
