# Ampora — Design Review and Open Gaps

> A critical review of the whole app against the MVP funnel you provided, an App Store reviewer pass, and a feature-by-feature gap scan. The point is to surface every unresolved question so we can close it. The LLM Council verdict that goes with this lives in the chat. No em dashes, no semicolons.

---

## Part A: The MVP funnel applied (Core Function to Shippable MVP)

Your framework: Core Function, Core Loop, Accessory Features (cut what does not serve the loop), Surface Area (5 to 7 screens), Retention Hook (unfinished state).

### A1. Core Function (the ONE thing, one sentence)
"Ampora locks your distractions until you actually start your work." Passes the gate. If you cannot demo that in one screen recording, nothing else matters.

### A2. Core Loop (action to reward, under 30 seconds, repeatable)
The loop is: see the one next thing, put your apps on the line, do the 2-minute First move, you are working and your apps come back. Initiating it is under 30 seconds. It repeats many times a day. The reward is the relief of having started plus regained access plus visible progress. This passes, with one caveat in A5.

### A3. Accessory Features audit (does it serve the loop, or cut/defer)
The spec has grown into a 2-year product. Held against "does it serve the core loop," most of it is roadmap, not MVP.

| Feature | Serves the core loop? | MVP call |
|---|---|---|
| Task capture (something to lock against) | Yes, directly | CORE |
| A simple "what is next today" list | Yes (produces the next thing) | CORE (simple version) |
| Breakdown to a First move | Yes (the start) | CORE |
| Ignition lock-until-start/done | Yes (the whole point) | CORE |
| Focus-time verification | Yes (makes the lock real) | CORE |
| Blindfold (one step) | Yes (kills overwhelm so you start) | CORE |
| Sign in (Apple/Google) | Yes (you need an account) | CORE |
| Full FlowSavvy-grade scheduler (recurring, dependencies, scheduling-hours profiles, workload balancing) | Indirectly | DEFER. A simple ordered today-list is enough for v1 |
| Photo/screenshot verification | Indirectly | DEFER (focus-time is enough for v1) |
| Beat-the-clock | No (lock-until-start is the gentle core) | DEFER |
| Learning Engine (Revealed Self, Focus DNA, energy) | No | DEFER |
| Recovery Mode | No (nice, not core) | DEFER |
| Voice capture | No | DEFER |
| Projects (files, chat, progress) | No (a phase-2 moat) | DEFER |
| Claude connection (MCP) and public API | No | DEFER |
| Calendar sync | No | DEFER |
| Desktop companion, widgets | No | DEFER |

Update after founder decision: the full product ships at launch (AI-accelerated build, not a stripped MVP). So this table is now a build-sequence guide, not a scope cut. "DEFER" means "build after the core loop," and everything still ships. Two corrections to the table above: Beat-the-clock and photo/screenshot verification are CORE (they serve the loop), not deferred. The only genuinely later piece is the Claude MCP connection (a lighter version at launch). The remaining real constraints are external (the Family Controls entitlement approval and App Store review), not scope.

### A4. Surface Area Check (max 5 to 7 screens)
The five tabs (Today, Calendar, Tasks, Focus, Profile) are within range. But the lean v1 needs even fewer. Recommended v1 tabs: Today, Tasks, Focus, Profile (four). Calendar can wait until the real scheduler exists. Watch sub-screen sprawl inside each tab.

### A5. Retention Hook (create an unfinished state) — this is a gap
The framework's last gate is the weakest part of the current design. There is no deliberate unfinished state pulling users back daily. Options to build one:
- End every session by surfacing the next First move, so the user always leaves mid-momentum.
- Pre-build tomorrow's plan and show "ready for tomorrow," so opening it is rewarding.
- A non-shaming momentum signal (a count of days you started, not a punishing streak).
- The standing lock as a commitment that is "armed" for the next session.
Decision needed (see Open Decisions): what is the unfinished state that brings someone back tomorrow.

---

## Part B: App Store reviewer pass (approval and success)

### B1. Approval risks
- **Family Controls entitlement.** Privileged, must be requested per bundle ID, can take weeks. Covered in `06`. Apply now.
- **Blocking apps get scrutiny.** Must have the panic valve and clear self-use framing. Covered in `06` and `09`. Mirror how Opal and Brick describe themselves.
- **Sign in with Apple is mandatory if you offer Google sign-in.** Apple guideline 4.8 requires an equivalent privacy-respecting login (Sign in with Apple) whenever you offer a third-party social login. So adding Google requires adding Apple. Good that both are in scope.
- **Privacy for minors.** A clear privacy policy and data handling are required, especially with behavioral and (optional) screenshot data on under-18 users. Needed before submission.
- **No medical claims.** Keep all copy as a focus and productivity tool, never an ADHD treatment.
- **In-app purchase.** Any paid tier must use Apple IAP on iOS (not an outside payment link), which Apple takes a cut of. Affects the monetization plan.

### B2. Success factors (beyond approval)
- The aha must hit in the first session (lock an app, start something). Onboarding cannot bury it behind setup.
- The App Store subtitle and screenshots must say what it does in plain words ("lock your apps until your work is done"), because "Ampora" alone says nothing.
- The lean core has to feel finished and smooth, not a broad app that is mediocre everywhere.

---

## Part C: Gap scan (every area, with status)

Status key: ANSWERED (where) or GAP (needs a decision). The GAPs are consolidated in Part D.

**Auth and account**
- Sign in with Apple and Google. Status: shipped (Part E, PRD FR-87). Round C: native magic-link deep-link handling (needs a native dev build plus routing/Supabase wiring on a device); web magic-link works today.
- Can you use the app before signing in (local-first implies yes)? On sign-in, how does local data migrate? RESOLVED: an account is required, the cloud is the source of truth with a local cache, and there is no anonymous local-only mode, so there is no pre-sign-in local set to migrate (FR-87, Part D item 7).
- Account deletion and data export specifics. RESOLVED: both are available in Settings (FR-87, NFR-4); Round B added Help/About/Legal entries alongside them (PRD §8.14).
- Migrating existing Focal v1 users vs a clean break. RESOLVED: no existing users, brand-new app, no migration (Part D).

**Scheduling engine**
- Ordering, splitting, recalculate, stability, unschedulable handling. ANSWERED (FR-9 to FR-21, 9.5).
- What does the engine do with an auto-scheduled task that has no due date? RESOLVED (Round B): not force-placed; stays on the list, optional lowest-priority backfill, never displaces dated work (PRD 9.5.11).
- Precise definition of a day's capacity used in balancing. RESOLVED (Round B): day capacity = scheduling-hours minutes minus fixed events that day; confirmed in placement.
- Pinned block versus a newly added fixed event that overlaps it, who wins? RESOLVED (Round B): the real fixed event wins; the pinned task block reflows (no silent drop).
- Time zone changes and travel. RESOLVED (Round B): recompute on tz change; blocks are wall-clock-local.
- Over-subscription (more work than time before deadlines), which tasks get dropped and how is it surfaced? RESOLVED (Round B): keep highest-priority + earliest-due; the rest surface in the unschedulable list with a reason (never silent-drop). Elapsed blocks of still-open tasks are marked missed and surfaced in Home "Needs attention" (PRD 9.5.12, FR-20).

**Calendar**
- Views, zoom, block rendering, overlap, gestures. ANSWERED (FR-23 to FR-28); Round B added the drag overhaul (live snapped-time pill, snap haptics, scroll-lock + edge autoscroll, tactile drop-spring, pinned lock glyph + Lock/Unlock, 44px resize targets) per PRD §8.14.
- Events crossing midnight and multi-day events rendering. RESOLVED (Round B): split at the day boundary in Day/3-Day/Week.
- Whether the calendar is even in v1 (Part A says defer). RESOLVED: the calendar ships (full Day/3-Day/Week/Month/Agenda). Remaining Round C item: cross-day drag in 3-Day/Week (needs a shared cross-column canvas), gated off today.

**Ignition and verification**
- Modes, panic valve, caps, the verification spectrum. ANSWERED (FR-40 to FR-47, 77, 78, docs 06 and 09). Round B: Beat-the-clock now defaults OFF and is earned after >= 3 successful lock-until-start completions (PRD §8.14).
- Multi-device stakes (start on phone, does it lock a tablet or second device?). RESOLVED (Round B): each device independent, no multi-device lock (FR-41b).
- Beat-the-clock cooldown: during cooldown, can finishing the task end the lock early, and exactly what is locked? RESOLVED (Round B): finishing the task ends the cooldown early (FR-41).
- If the user deletes Ampora mid-lock, does the iOS shield clear? (Likely yes since ManagedSettings is tied to the app, confirm and state.) Round C: verified end-to-end only once the native module ships behind the Family Controls entitlement; soft-lock has no OS shield to strand today.
- Cost and rate limits of AI vision verification, and offline behavior (cannot verify offline). RESOLVED (Round B): image verification runs through the `ai-verify-proof` edge function with a lenient default-pass `checkProofPlausibility`; no key or offline falls back to accept (never traps), consistent with the no-key contract and FR-78.

**Breakdown, memory, projects**
- Pipeline, grounding, memory, custom/voice, project model. ANSWERED (docs 07, 10). Round B: the project chat is now agentic on-device via the validated `ToolAction` union with one-tap Undo (PRD §8.14, FR-84).
- Which model powers breakdown and the project chat, the per-call cost, and the free-tier limits. RESOLVED: Google Gemini (`gemini-2.5-flash`) behind the edge functions; the subscription covers AI cost and there is no free tier, so no per-feature limits (PRD 9.11, §13 2026-07-01).
- Project file storage limits (count, size, types). RESOLVED (Round B): 20 files/project, 25 MB/file, types pdf/img/doc/sheet, enforced in the file picker.
- Deleting a project, what happens to its generated tasks. RESOLVED (Round B): default keep + unlink its generated tasks; the confirm dialog offers "also delete tasks".
- Can a task belong to more than one project. RESOLVED (Round B): no, one project per task.

**Notifications**
- Cadence, types, copy, quiet hours. ANSWERED (FR-63, 8.9). Round B: per-kind reminder toggles now feed scheduling (PRD §8.14).
- Exact behavior when notification permission is denied, and web push. RESOLVED (Round B): degrades to in-app/web plus a one-time Settings nudge, no nagging. Real-device timing tuning remains a Round C polish item.

**Monetization and limits (high priority)**
- Free versus Pro split exists in the business plan, but the PRD does not gate features or define limits (AI breakdowns per month, number of projects, which stakes, learning engine). RESOLVED: paid app, no free tier, so there is no per-feature gating for v1 (Part D item 2; FR-88).
- Payment infrastructure (Apple IAP on iOS, Stripe elsewhere) and the minor-founder account holder. Apple IAP is the chosen path (FR-88); real StoreKit/IAP purchasing is Round C (needs an Apple developer account). Account-holder (parent vs LLC) is still an external decision, tracked in §15 Q5.
- Free trial or freemium only. RESOLVED: 2-week free trial then monthly/annual subscription, no freemium (Part D item 2).

**Data, sync, privacy, legal**
- Local-first, no ads, COPPA 13+, opaque tokens. ANSWERED (NFR-4, 9.12, doc 06).
- Sync conflict resolution detail for complex objects like a day's schedule. RESOLVED (Round B): last-write-wins per field (built); device-local Settings fields are preserved across cloud reconcile.
- Privacy policy and terms of service. Round C (still required before submission): a legal task, flagged, not code. Especially important for minors given behavioral and optional screenshot data (see Part B1).

**Onboarding and brand**
- Steps. ANSWERED (8.10), re-cut so the aha (sign in, add one task, lock an app, start) comes first; scheduling-hours and energy-peak setup are deferred/optional.
- Final accent color, app icon, logo. Brand/identity is owned by the founder separately (Part D item 10). Round B locked the in-app visual system to Design System v3 "Calm Premium" (warm Stone spine, bone canvas, primary `#2563EB`, Projects accent `#7C3AED`) per PRD §8.14.
- The single reference app to copy most closely (Things 3 recommended). Superseded: the shipped bar is Todoist-grade task affordances plus FlowSavvy-grade scheduling, under Design System v3 (PRD §8.14).

**Platform scope**
- Web (no blocking possible) in or out for v1. RESOLVED: web is a target with full functionality except app-blocking, which needs the phone (FR-89, Part D item 9).
- iOS-first confirmed, Android timing. RESOLVED: iOS and Android phones both target full functionality including blocking; native iOS app-locking is gated on the Family Controls entitlement (Round C blocker), soft-lock ships today (FR-89).
- Internationalization (assume English-only first). RESOLVED: English only at launch (FR-89, Part D item 9).
- Analytics tool (privacy-respecting). Still a minor Round C item: on-device-first event log, only aggregate non-identifying metrics leave the device if any (§10). No third-party analytics chosen yet.

---

## Part D: Resolved decisions (founder answers, now folded into the docs)

All eleven open questions are answered. Each is reflected in the PRD (decision log and FRs) and the business plan.

1. **Scope.** Build the full product for launch. Not a stripped MVP. The scheduler, projects, Ignition (with beat-the-clock and photo/screenshot verification), voice capture, calendar sync, breakdown and First move, sign-in, and the pre-built tomorrow's plan all ship. The Claude MCP connection is a lighter, later piece.
2. **Monetization.** Paid app, no free tier. 2-week free trial, then monthly or annual subscription (annual about 10% cheaper per month), Apple IAP on iOS.
3. **AI cost.** Covered by the subscription (company pays per-call). BYO model key optional, not required.
4. **Retention hook.** The schedule itself: tomorrow's plan is pre-built and the auto-rebuilding plan is the reason to return. (PRD FR-90.)
5. **Multi-device stakes.** Each device independent, no multi-device lock. (PRD FR-41b.)
6. **Beat-the-clock cooldown.** A cooldown ends early if the task is completed during it. (PRD FR-41.)
7. **Account and sign-in.** Account required. All data synced to the cloud as the source of truth, local cache for offline and speed, no anonymous local-only mode. (PRD FR-87.)
8. **Undated tasks.** Not force-placed; stay on the list, optional lowest-priority backfill, never displace dated work. (PRD 9.5.11.)
9. **Platforms.** Web is a target (full functionality except blocking, which needs the phone). English only. (PRD FR-89.)
10. **Brand.** Handled by the founder separately. No brand or visual work needed here.
11. **Existing users.** None. Brand-new app, no migration.

**Round B (v2) resolutions (folded into the docs 2026-07-01).** The remaining Part C GAPs from the gap scan are now closed and reflected in the PRD (§8.14 and the §13 decision log):
- **Day capacity** = scheduling-hours minutes minus fixed events that day (PRD 9.5.11/placement).
- **Pinned block vs a new overlapping fixed event:** the real fixed event wins, the pinned task block reflows, never silently dropped.
- **Over-subscription:** keep highest-priority + earliest-due, surface the rest in the unschedulable list with a reason; elapsed blocks of open tasks are marked missed and shown in Home "Needs attention" with Reschedule / Let it go (no shame). (PRD 9.5.12.)
- **Events crossing midnight:** split at the day boundary in Day/3-Day/Week.
- **Time zone / travel:** recompute on tz change; blocks are wall-clock-local.
- **Notification permission denied:** degrades to in-app/web plus a one-time Settings nudge, no nagging.
- **Project file limits:** 20 files/project, 25 MB/file, types pdf/img/doc/sheet, enforced in the picker.
- **Delete a project:** default keep + unlink its generated tasks; the confirm dialog offers "also delete tasks".
- **Task in multiple projects:** no, one project per task.
- **Sync conflict on a day's schedule:** last-write-wins per field (built); device-local Settings fields preserved across cloud reconcile.
- **Beat-the-clock:** OFF by default, earned after >= 3 successful lock-until-start completions.
- **Agentic project chat:** on-device `ToolAction` union with one-tap Undo; the vocabulary lifts verbatim to the future MCP server.

Remaining external constraints and Round C items (not scope closed this pass): the Family Controls distribution entitlement approval and App Store review timelines; real IAP/StoreKit purchasing (needs an Apple developer account); native magic-link deep-link handling; document RAG "ask my syllabus" (pgvector + OCR + embeddings); voice brain-dump STT; home/lock-screen widgets; the MCP server + public API; real-device notification-timing tuning; calendar-sync OAuth (Google/Outlook/iCloud); cross-day calendar drag in 3-Day/Week; and the **privacy policy / terms of service** (required for submission, especially for minors, per Part B1). The Round B `ToolAction` vocabulary is deliberately designed to lift to the future MCP server verbatim.


---

## Part E: Sign-in (added to the PRD this pass)
Three options: Sign in with Apple, Sign in with Google, and email magic link. Apple's guideline requires Sign in with Apple whenever a third-party login is offered, so all three ship together. Spec folded into the PRD (FR-87, tech stack, onboarding).
