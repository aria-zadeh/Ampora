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
- Sign in with Apple and Google. Status: being added now (Part E, PRD FR-87).
- Can you use the app before signing in (local-first implies yes)? On sign-in, how does local data migrate? GAP.
- Account deletion and data export specifics. Partially answered (NFR-4 says export and delete exist), exact flow GAP.
- Migrating existing Focal v1 users vs a clean break. RESOLVED: no existing users, brand-new app, no migration (Part D).

**Scheduling engine**
- Ordering, splitting, recalculate, stability, unschedulable handling. ANSWERED (FR-9 to FR-21, 9.5).
- What does the engine do with an auto-scheduled task that has no due date? GAP.
- Precise definition of a day's capacity used in balancing. GAP (define = scheduling-hours minutes minus fixed events that day).
- Pinned block versus a newly added fixed event that overlaps it, who wins? GAP.
- Time zone changes and travel. GAP.
- Over-subscription (more work than time before deadlines), which tasks get dropped and how is it surfaced? Partially answered (FR-20), priority of dropping GAP.

**Calendar**
- Views, zoom, block rendering, overlap, gestures. ANSWERED (FR-23 to FR-28).
- Events crossing midnight and multi-day events rendering. GAP.
- Whether the calendar is even in v1 (Part A says defer). GAP/decision.

**Ignition and verification**
- Modes, panic valve, caps, the verification spectrum. ANSWERED (FR-40 to FR-47, 77, 78, docs 06 and 09).
- Multi-device stakes (start on phone, does it lock a tablet or second device?). GAP.
- Beat-the-clock cooldown: during cooldown, can finishing the task end the lock early, and exactly what is locked? GAP.
- If the user deletes Ampora mid-lock, does the iOS shield clear? (Likely yes since ManagedSettings is tied to the app, confirm and state.) GAP.
- Cost and rate limits of AI vision verification, and offline behavior (cannot verify offline). GAP.

**Breakdown, memory, projects**
- Pipeline, grounding, memory, custom/voice, project model. ANSWERED (docs 07, 10).
- Which model powers breakdown and the project chat, the per-call cost, and the free-tier limits. GAP (ties to monetization).
- Project file storage limits (count, size, types). GAP.
- Deleting a project, what happens to its generated tasks. GAP.
- Can a task belong to more than one project. GAP (recommend no).

**Notifications**
- Cadence, types, copy, quiet hours. ANSWERED (FR-63, 8.9).
- Exact behavior when notification permission is denied, and web push. GAP (minor).

**Monetization and limits (high priority)**
- Free versus Pro split exists in the business plan, but the PRD does not gate features or define limits (AI breakdowns per month, number of projects, which stakes, learning engine). GAP, important.
- Payment infrastructure (Apple IAP on iOS, Stripe elsewhere) and the minor-founder account holder. GAP, important (touched in the business plan, not resolved).
- Free trial or freemium only. GAP.

**Data, sync, privacy, legal**
- Local-first, no ads, COPPA 13+, opaque tokens. ANSWERED (NFR-4, 9.12, doc 06).
- Sync conflict resolution detail for complex objects like a day's schedule. Partially answered (last-write-wins per field), edge detail GAP.
- Privacy policy and terms of service. GAP (required for launch).

**Onboarding and brand**
- Steps. ANSWERED (8.10), but must be re-cut for the lean v1 so it reaches the aha fast. GAP/decision.
- Final accent color, app icon, logo. GAP.
- The single reference app to copy most closely (Things 3 recommended). GAP/confirm.

**Platform scope**
- Web (no blocking possible) in or out for v1. GAP.
- iOS-first confirmed, Android timing. GAP/confirm.
- Internationalization (assume English-only first). GAP/confirm.
- Analytics tool (privacy-respecting). GAP (minor).

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

Remaining external constraints (not scope, not code): the Family Controls distribution entitlement approval and App Store review timelines.


---

## Part E: Sign-in (added to the PRD this pass)
Three options: Sign in with Apple, Sign in with Google, and email magic link. Apple's guideline requires Sign in with Apple whenever a third-party login is offered, so all three ship together. Spec folded into the PRD (FR-87, tech stack, onboarding).
