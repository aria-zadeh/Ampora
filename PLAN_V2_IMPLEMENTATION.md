# Ampora — Plan v2 Implementation (Round B)

> **For the implementing session:** this plan is self-contained. Execute it top to bottom.
> Written 2026-07-01 after Round A shipped (commit `7cddc41`, pushed to `aria-zadeh/ampora` main).
> **Model note from Aria:** this plan was authored with Fable 5; do **not** use Fable 5 for the
> implementation itself — implement with Opus (orchestrator) + Sonnet subagents per the global rules.
> Aria's standing instruction applies: **run autonomously, batch everything, show the result at the end.**

---

## 0. Context

v1 + Round A are built and verified: task system, deterministic scheduler, calendar with
drag/resize/action-sheet, AI breakdown with local fallbacks, Ignition soft-lock + Opal-style app
picker, learning engine, recovery, notifications, sync, projects, settings, trial/paywall with dev
bypass, design v2 (dot-grid, inline icon buttons). Codebase is at **0 `tsc` errors** and web-exports
cleanly. Repo conventions live in `CLAUDE.md`; Aria's preference log is
`docs/12_Preferences_and_Decisions.md`.

Aria's Round B feedback:
1. **Design still reads "barebones."** Target bar: **Todoist / Trello-level professional**. Her chosen
   direction: **a mix of "clean & minimal" (Linear/Todoist) and "warm & premium" (Notion/Things)**,
   with **richer & tactile motion** (explicitly approved — not the quiet-motion default).
2. **Calendar drag is buggy and gives no feedback** while dragging.
3. **Polish everything further.** Finish the remaining app features (Round B scope below).
4. **AI: do not set the Gemini key yet** — make everything ready so it works the moment the key is added.

Five skills were installed for this round and **must be read before the design phases**
(they are in `~/.claude/skills/`, invocable via the Skill tool):

| Skill | Use it for |
|---|---|
| `taste-skill` | The dial system + anti-slop bias corrections (§1 dials, §4 directives, §9 AI-tells) |
| `soft-skill` | Warm-premium techniques: nested card architecture, tactile press physics, spring motion |
| `minimalist-skill` | Clean-editorial restraint: hairline borders, muted pastels, ultra-diffuse shadows |
| `redesign-skill` | The audit-first process + fix priority for upgrading an existing app without breaking it |
| `webapp-testing` | Playwright verification harness for the final QA pass |

Also already installed and relevant: `polish`, `animate`, `arrange`, `typeset`, `delight`,
`critique`, `audit`, `optimize`, `react-native-best-practices`, `web-design-guidelines`, and the
`design:*` plugin skills. Use them as checklists during Phases 1–4.

### Taste dials for Ampora (locked — do not re-litigate)

Per taste-skill §1 inference ("minimalist/clean/Linear" × "premium consumer" × Aria's explicit
"richer & tactile" answer):

- **DESIGN_VARIANCE: 5** — structured, aligned, calm; asymmetry only where it aids scanning.
- **MOTION_INTENSITY: 6** — tactile springs on controls, live drag physics, satisfying completion
  beats. Never decorative loops. Reduce-motion always respected.
- **VISUAL_DENSITY: 5** — productivity-tool density: compact list rows, rich row metadata,
  generous section rhythm around them.

### Translation rules — web skills → this RN app (binding)

The four design skills are written for web landing pages. Apply their **principles**, not their
literal CSS:

- **Inter stays.** taste-skill's own override: Inter is correct for a "neutral/Linear-style" brief,
  and `docs/02` binds it. Do not swap fonts.
- **No backdrop-blur, no scroll-driven landing animations, no 100dvh tricks** — RN app, not a website.
- **Do apply:** color-consistency lock (one accent), shape-consistency lock (documented radius rule),
  tinted/diffuse shadows, hairline borders, tactile `:active` physics, skeleton-not-spinner,
  label-above-input, full state cycles (loading/empty/error), tabular numerals for times,
  muted-pastel semantic tints, staggered list entrances, no AI-tell copy ("Oops!", exclamation
  marks in success toasts, Title Case Everywhere).
- **Never hardcode colors/radii/spacing** — every new value goes through `utils/design-tokens.ts` /
  `tailwind.config.js` (CLAUDE.md rule; the audit found the codebase is already clean on this).

---

## 1. Hard constraints (from CLAUDE.md + memories — violations are regressions)

- `npx tsc --noEmit` = **0 errors** before any task is "done". `npx expo export -p web` must pass.
- **Zustand v5 discipline:** any selector returning a fresh array/object needs `useShallow`
  (React #185 loops). All current call sites are clean — keep them clean.
- **NativeWind + Reanimated:** `className` on Animated components requires the `cssInterop`
  registrations in `nativewind-reanimated.ts`. `PressableScale` is a single `AnimatedPressable`
  with `cssInterop` — do not split it back into two nodes (breaks either `flex-row` or `flex-1`).
- **Scheduler invariant:** pinned blocks' minutes are credited against the owning task in
  `core/scheduler/recompute.ts` → `placement.ts` (`pinnedMinutesByTask`). Preserve this or tasks
  double-schedule.
- **AI budget:** never call the deployed `ai-*` edge functions during routine testing. The local
  fallbacks in `services/ai.ts` / `services/aiProjects.ts` cover every path. One single-shot curl
  per function max, and only for post-deploy verification.
- **Wellbeing invariants:** panic valve always available; 6 never-lock categories protected;
  daily cap 180 min; quiet-hours auto-release. Never regress these.
- Web preview flow: `npx expo export -p web` → serve `dist` → Playwright. Deep links 404 on the
  static server (navigate in-app from `/`); guest flag is in-memory (re-enter guest after reload).

---

## 2. Phase plan

Execute phases in order. Commit per phase (conventional message, `Co-Authored-By` per global
rules), push at the end. Each phase ends with: 0 tsc errors + web export clean.

**Phase 0 is a discovery phase — it produces the authoritative gap matrix that the rest of the
plan closes.** Do not skip it. The design/feature phases (1–6) are the *known* work; Phase 0 finds
the *rest* (every PRD FR, every acceptance criterion, every open GAP in `docs/11`) so nothing is
missed. This is the "get the remaining PRD and docs right" that Aria asked for.

---

### Phase 0 — PRD / Docs / Gap conformance audit (discovery, produces the master checklist)

Goal: a single, authoritative **Conformance Matrix** that maps every requirement in the docs to
its real status in the code, so Round B closes *all* of it, not just the visible bugs. Ampora's
own rule (CLAUDE.md): "a feature is done only when it matches the PRD section AND the Design System
definition-of-done." Phase 0 makes that checkable.

Run a **multi-agent read-only sweep** (one agent per doc, in parallel — `explorer`/`Explore`
agents), each cross-referencing its doc against the shipped code:

- **`docs/01_PRD.md` §7.1 Functional Requirements (FR-1 … FR-90+)** — for every FR, mark
  `built | partial | missing | gated`, with the file that implements it (or the gap).
- **`docs/01_PRD.md` §7.3 Acceptance Criteria** — the 11 Gherkin flows (see §2.5). Each becomes a
  test case in Phase 7; mark which pass today.
- **`docs/02_Design_System.md`** — the definition-of-done per component (tokens, a11y, motion,
  states). Feeds Phases 1/3/4.
- **`docs/06` (app-blocking), `09` (verification)** — soft-lock parity, panic valve, caps,
  quiet-hours release, never-lock enforcement (client + server), verification spectrum.
- **`docs/07` (breakdown/memory/subtasks)** — first-move rules, ≤8 subtasks, source-grounding,
  per-user breakdown memory (retrieval, not training), custom/voice modes.
- **`docs/08` (MCP + public API)** — confirm Round C scope; ensure the Phase 5 `ToolAction` vocab
  aligns with the doc-08 tool list so it lifts to the server later.
- **`docs/10` (projects)** — project model, files, chat-as-planner, next-session, RAG hooks.
- **`docs/11_Review_and_Open_Gaps.md` Part C** — the explicit open-GAP list (see §2.6). Each GAP
  gets a resolution: adopt the doc-11 recommended default, implement, or flag to Aria.

**Output:** write the matrix to `docs/13_Conformance_Matrix.md` (new living doc). It is the master
checklist; Phases 1–7 must leave zero in-scope rows unclosed. Any row that is genuinely Round C+
(native locking, IAP, RAG, voice, widgets, MCP server) is marked as such with its blocker, so the
deferral is explicit and auditable, never a silent drop.

**Also in Phase 0 — resolve the open GAPs (see §2.6).** Most have a recommended default in
`docs/11` already; adopt it, implement the small ones inline where cheap, and fold the resulting
behavior into the PRD. Only genuinely product-level open questions get surfaced to Aria (don't
block the build on them — log them in `docs/12` and proceed with the documented default).

---

### §2.5 — Persona & user-scenario catalog (the "hone into all the user cases" spine)

Every design and QA decision is checked against the **real PRD personas walking real flows**, not
abstract critique. This catalog is the test matrix for the Phase 7 deep review and the acceptance
bar for Phases 1–6.

**Personas (PRD §6):**
- **Garrett — primary, ADHD high-schooler.** Struggles to *start*; poor time estimation;
  deadline-driven late-night work; overwhelmed easily; annoyed by notification spam; most
  energetic midday; essays/open-ended work are hardest, structured math is manageable. JTBD:
  "tell me the one thing now," "get me to actually start," "don't let me doomscroll," "rescue my
  week without shaming me."
- **The Ambitious Procrastinator — secondary.** 4.0-chaser, brilliant only under last-minute
  pressure, many classes, online constantly. JTBD: "plan everything so nothing slips," "give me
  pressure on demand," "make my night-before crunch less chaotic."

**Core acceptance flows (PRD §7.3 Gherkin — each must pass in Phase 7):**
S1 auto-schedule fits before deadline · S2 recalc after falling behind ("Rebuilt your week," no
shame) · S3 split a 12-hour project evenly · S4 missed repeating task doesn't stack · S5 drag to
reschedule pins the block + others reflow · S6 lock-until-start happy path (shield → first move →
unshield) · S7 panic-valve de-escalation (repeat use → "pause for today," never more pressure) ·
S8 Revealed Self suggestion (accept-only) · S9 wellbeing caps (daily cap, quiet-hours auto-release,
never-lock never shielded) · S10 Blindfold overwhelm→one step · S11 calendar zoom stays 60fps +
legible.

**Journey scenarios (walk end-to-end as the persona):**
- **Cold start (Garrett, first session):** onboarding → first task → breakdown → first move →
  lock Instagram → start → unshield. The aha must land in the first session (doc 11 B2).
- **Night-before crunch (Procrastinator, 11pm):** big essay due tomorrow, beat-the-clock, tight
  deadline front-loads, focus session, completion.
- **Fell behind 3 days (Garrett):** open after a lapse → Recovery "Catch me up" → rebuild preview
  → calm re-entry. Zero shame language anywhere.
- **Doomscroll defense:** stake armed, panic valve pressed twice → de-escalation offer.
- **Overwhelm:** 15-item day → "I'm overwhelmed" → Blindfold single step.
- **Quiet-hours boundary hit mid-lock** → auto-release; **daily cap reached** → stakes unavailable
  till tomorrow, calm copy.

**Edge cases / robustness (from doc 11 + ADHD reality — Phase 7 must probe these):**
offline / no-network (AI falls back locally, never errors to UI) · reduce-motion on (everything
works statically) · screen-reader labels on every icon-only control · Dynamic Type / long titles
(truncate, never clip) · over-subscription (more work than time → explained, never silent-dropped) ·
timezone/travel change · event crossing midnight · rapid taps / double-submit · guest → sign-in
data handoff · empty states on every surface.

### §2.6 — Open GAPs to close (from `docs/11` Part C)

Phase 0 resolves each of these. Where `docs/11` Part D already answered it, just confirm the code
matches. Recommended defaults below — implement the cheap ones, log every decision in `docs/12`,
and flag only the starred ones to Aria.

| GAP | Resolution to implement |
|---|---|
| Day-capacity definition (for load balancing) | scheduling-hours minutes on that day minus fixed events that day. Confirm `placement.ts` matches. |
| Pinned block vs. a newly added overlapping fixed event | the fixed calendar event (real busy time) wins; the pinned task block reflows with an inline "moved — your calendar filled up" note, never silent. |
| Over-subscription drop priority | keep highest-priority + earliest-due; surface the rest in the unschedulable list (FR-20) with the reason. Never silently drop. |
| Event crossing midnight / multi-day | render split at the day boundary in Day/3-Day/Week. |
| Timezone / travel change | recompute on tz change; blocks are wall-clock-local. |
| Notification permission denied | already degrades to in-app/web; add a one-time Settings nudge, no nagging. |
| Project file limits | default 20 files/project, 25 MB/file, types pdf/img/doc/sheet; enforce in `FileList`. |
| Delete a project → its generated tasks | default keep + unlink (don't destroy work); confirm dialog offers "also delete tasks." |
| Task in multiple projects | No — one project per task (doc 11 recommendation). |
| Sync conflict on a whole day's schedule | last-write-wins per field (built); add a quiet "schedule updated on another device" notice. |
| Undated auto-scheduled task | RESOLVED (9.5.11 backfill, never displaces dated). Confirm only. |
| Multi-device stakes / beat-the-clock cooldown | RESOLVED (FR-41b, FR-41). Confirm only. |
| \*Monetization feature limits (AI/projects caps per tier) | paid app, no free tier (doc 11 D2) — so no per-feature gating needed for v1. Confirm with Aria if a Free tier is ever wanted. |
| \*Privacy policy / ToS (required for launch, minors) | Round C / legal task — flag to Aria; not code. |

---

### Phase 1 — Design System v3: "Calm Premium" foundations

Goal: the token-level moves that make every screen instantly feel warmer and more expensive,
before touching individual screens. Files: `utils/design-tokens.ts`, `tailwind.config.js`,
`utils/motion.ts`, `docs/02_Design_System.md`.

1. **Warm the neutral spine** (the single highest-leverage "warm & premium" move, per
   minimalist-skill §4). Migrate the neutral ramp from cool Zinc to a warm-tinted family:
   canvas `#F4F4F5` → warm bone **`#F7F6F3`**, and re-tint neutral 50–900 consistently warm
   (stone-like) so grays stay in ONE family (redesign-skill: never mix warm and cool grays).
   Ink stays `#18181B`-class near-black. **Re-verify WCAG AA contrast for every text/background
   pair after the shift** (the `audit` skill has the checklist). Because everything references
   tokens, this is a small diff with app-wide effect.
2. **Tinted, ultra-diffuse shadows.** Shadow color moves from pure black to a warm hue-matched
   tint at lower opacity (soft-skill: "unbelievably soft, highly diffused ambient shadows";
   redesign-skill: tint shadows to background hue). Update `shadows.xs–xl` in design-tokens.
3. **Muted-pastel semantic tints** for list colors, tags, and badges (minimalist-skill palette:
   pale red `#FDEBEC`/`#9F2F2D`, pale blue `#E1F3FE`/`#1F6C9F`, pale green `#EDF3EC`/`#346538`,
   pale yellow `#FBF3DB`/`#956400`, plus 4–6 more in the same washed family). Expose as a
   `listColors` token set; used in Phase 3's list tint bars and chips.
4. **Nested "feature card" treatment** (soft-skill double-bezel, translated subtly for RN): a new
   `FeatureShell` primitive — outer wrapper `bg-black/[0.02]` + hairline ring + `p-1` +
   `rounded-2xl`, inner card with its own radius (`rounded-xl`) and a 1px top inner highlight.
   Use ONLY on the 3–4 focal cards (Home starter card, paywall plan cards, project next-session
   card) — restraint is the point.
5. **Hairline discipline:** borders standardize on `rgba(0,0,0,0.06)`-class hairlines
   (minimalist-skill §5). Keep the documented radius rule (cards 12, buttons 10, inputs 8–10,
   pills full) — that IS the shape-consistency lock; write it into `docs/02` explicitly.
6. **Tabular numerals** everywhere numbers align: timer, calendar gutter, block times, durations
   (`fontVariant: ['tabular-nums']` on `TimerDisplay`, calendar time labels, due chips).
7. **Motion vocabulary upgrade** (`utils/motion.ts`): add a `SPRINGS.tactile` (snappier
   damping/stiffness for drag pickup/drop), a `DURATIONS.drag` set, and a documented haptic
   vocabulary: selection = snap/tick events, light = pickup/drop, success = completion. MOTION 6:
   springs are for controls and drag physics — never text/layout.
8. Update `docs/02_Design_System.md` with all of the above (it is the binding styling source).

**Verify:** export web, screenshot Home/Tasks/Calendar before-and-after, run the contrast audit,
0 console errors.

---

### Phase 2 — Calendar drag overhaul (the headline bug)

Aria: "dragging the tasks on the calendar is buggy and doesn't give me feedback." A prior
investigation traced the exact gaps. The gesture architecture in
`components/calendar/DayView.tsx` (`DraggableBlock`, lines ~163–553) is sound — long-press arm →
pan with `translateY` → snap-on-release → `moveBlock` commit — but the user drags blind.

Fix, in this order:

1. **Live time label during drag** (`DayView.tsx` + `components/calendar/CalendarBlock.tsx`):
   while `dragging`, render a floating pill above the block showing the **snapped** target time
   ("7:15 – 8:15 PM"), driven on the UI thread from `translateY` via `useDerivedValue`
   (snap math worklet-side: px → minutes → 5-min snap → formatted string via `runOnJS`-throttled
   state or a Reanimated text approach). Tabular numerals. This single feature removes the
   "no feedback" complaint.
2. **Snap-during-drag + snap haptics:** quantize the *rendered* offset to the 5-min grid while
   dragging (block visually ticks between slots instead of floating free), and fire
   `Haptics.selectionAsync()` each time the snapped slot changes (throttle to slot transitions).
   Same for edge-resize (`topEdgeGesture`/`bottomEdgeGesture`, DayView ~287–327).
3. **Scroll/gesture coordination:** the pan currently fights the `TimeGrid` ScrollView (no
   `activeOffsetY`/`simultaneousHandlers` — `components/calendar/TimeGrid.tsx` ~122–128). Since
   drag only arms after the 220 ms long-press, the fix is: `panGesture.activateAfterLongPress` /
   keep the LongPress→Pan composition but mark the ScrollView's native gesture with
   `simultaneousWithExternalGesture` + disable ScrollView scrolling while `dragging === 1`
   (`scrollEnabled` bound to drag state via `useAnimatedProps` or a tiny state bridge).
4. **Edge autoscroll:** while dragging within ~60 px of the grid's top/bottom viewport edge,
   auto-scroll the TimeGrid (speed proportional to edge proximity) and keep the block tracking
   the finger (compensate `translateY` by the scroll delta). This unlocks long-distance
   reschedules (8 AM → 6 PM) in one gesture.
5. **Cross-day drag in 3-Day/Week** (`components/calendar/ThreeDayView.tsx` ~244–316, `WeekView`):
   track `translationX`; when the drag crosses a day-column boundary, ghost the block into the
   target column and commit `moveBlock` with the day-shifted snapped start. Vertical-only in Day
   view stays as-is.
6. **Drop polish:** on release, spring the block into its snapped slot (`SPRINGS.tactile`) instead
   of the current instant reflow; success haptic on commit; keep the existing lift
   (scale 1.02 + shadow) but raise to 1.03 with the Phase 1 tinted shadow.
7. **Pinned-block affordance:** blocks with `pinned: true` show a tiny lock glyph (they already
   survive recompute); dragging a pinned block is allowed (re-pins at the new slot) — but the
   BlockActionSheet's "Lock at this time" state should render as active/toggleable ("Unlock").
8. **Fix the resize-grip hit area** to ≥ 44 px effective (hitSlop) and make grips visible only on
   the active/lifted block to reduce visual noise at rest.

**Verify (Playwright + screenshots):** drag shows live label; release lands on snapped slot with
exactly ONE block (pinned-minutes invariant); tap still opens; resize snaps; autoscroll reaches
late-evening; 3-day cross-column drag works; zero console errors.

---

### Phase 3 — Todoist-grade affordances (the "not professional yet" gap)

The design audit's verdict: tokens/primitives/motion are already strong — what's missing is
**affordances**. Work items, ranked by the audit's effort-to-polish ratio:

1. **Swipe actions, both directions** (`app/(tabs)/tasks.tsx` rows, existing `Swipeable`):
   right-swipe reveals **Complete** (green, success haptic, PulseScale beat); left-swipe reveals
   **Schedule tomorrow / Delete**. Icons peek progressively with the swipe; threshold haptic.
2. **Sticky section headers with collapse** (Tasks screen FlashList): headers (Overdue / Today /
   This week / Later / Completed) pin while their section scrolls; chevron rotates on collapse
   (spring). FlashList supports `stickyHeaderIndices`-style patterns; keep 60 fps.
3. **Long-press context menu on task rows:** long-press lifts the card (scale 1.02 + tinted
   shadow) and opens an action sheet — Edit, Complete, Schedule tomorrow, Move to list, Put on
   the line, Delete. Reuse the `BlockActionSheet` visual pattern from the calendar
   (`components/calendar/BlockActionSheet.tsx`) as the shared sheet look.
4. **List color tint bar on TaskCard** (`components/ui/TaskCard.tsx`): 3 px rounded left-edge bar
   in the list's (new pastel) color; the meta-row dot stays. Instant Todoist-style scanability.
5. **Sticky quick-add:** the quick-add input pins to the top of the Tasks screen on scroll; on
   focus, expands with NL-parse hint chips ("tomorrow 3pm", "#list", "!high" — wired to the
   existing `core/quick-add.ts`).
6. **Manual reorder with drag handle:** when sort = Manual, rows show a `≡` handle (neutral-400);
   long-press-drag reorders with spring displacement of neighbors and selection haptics per slot.
7. **Checkbox completion craft:** animated check-draw + fill on complete (Reanimated stroke or a
   two-frame crossfade + PulseScale), success haptic; the *single* celebratory beat per doc 02.
8. **Richer row metadata** (density dial 5): due chip, subtask count ("3/8"), first-move dot,
   project glyph — all in the existing `caption`/pastel-chip system, one line, truncating cleanly.
9. **Empty/loading states sweep:** every list surface gets its skeleton (shape-matched, existing
   `SkeletonLoader`) and a composed empty state (existing `EmptyState`) — audit each tab.

**Verify:** screenshot every affordance; swipe/complete/reorder flows in Playwright (pointer
events); FlashList perf sanity (no blank cells while scrolling).

---

### Phase 4 — Screen-by-screen polish pass ("polish everything even further")

Run the redesign-skill **Fix Priority** loop per screen (states → spacing → components → type),
with `polish`/`arrange`/`typeset`/`delight` as checklists. Order: **Home → Tasks → Calendar →
Focus session → Task editor → Projects (hub/detail/chat) → Profile/Settings → Paywall →
Onboarding → Auth**.

Per screen, at minimum:
- Optical alignment + spacing rhythm on the 4 px grid; kill any uneven card gaps.
- Full state cycle present (loading skeleton, empty, error, success).
- Copy pass: sentence case, no "Oops!", no exclamation in success, active voice
  (`clarify` / `design:ux-copy` checklists).
- Motion: staggered entrance where lists mount; tactile press everywhere interactive;
  one celebratory beat max per flow.
- A11y: labels on icon-only controls, 44×44 targets, contrast AA (post-warm-shift), Dynamic Type.

Screen-specific highlights:
- **Home:** greeting block gets display-type presence (larger, tighter tracking); StarterActionCard
  gets the Phase 1 `FeatureShell` treatment; "Ready for tomorrow" card gets a quiet moon-phase
  visual moment; EnergyChip animates state changes.
- **Focus session:** timer digits tabular + larger; ambient progress ring (Reanimated arc) around
  the timer; break transitions spring; Blindfold entry smoothed.
- **Projects chat:** message entrance animations, typing indicator polish, day dividers in the
  thread, auto-scroll behavior fixed on new messages.
- **Paywall:** plan cards get `FeatureShell`; annual card's "Best value" flag refined; trial
  countdown chip in Profile animates.
- **Onboarding:** stagger option-card entrances; selected states spring; progress dots.

**Verify:** full Playwright walk of all 10 surfaces with screenshots; zero console errors;
reduce-motion pass (everything still works statically).

---

### Phase 5 — AI Round B: agentic planner, ready-for-key

**Architecture decision (binding):** Ampora is local-first — the stores live on-device, so AI
"tools" must execute **on the client**. No MCP server this round. The pattern:

```
client → ai-project-chat (Gemini, JSON mode) → { reply, actions: ToolAction[] }
client validates each action → applies to stores → renders confirmation chips in the thread
```

1. **Tool action schema** (`types/index.ts` + `core/ai-actions.ts`, new): a discriminated union —
   `create_task`, `update_task`, `complete_task`, `create_subtasks`, `set_first_move`,
   `schedule_hint` (startAfter/due changes), `add_project_phase`, `update_project_memory`.
   Zod-style manual validation (no new deps): every field checked, ids resolved, unknown types
   dropped silently.
2. **Edge function upgrade** (`supabase/functions/ai-project-chat/index.ts` + `_shared/gemini.ts`):
   system prompt teaches the action vocabulary + JSON response shape `{ reply, actions }`;
   `responseMimeType: application/json` already supported. Grounding stays (project state, files,
   memory, recent messages). **Keep the `no_key` → `200 {error:"no_key"}` contract untouched** so
   everything still degrades to local fallbacks with no key set.
3. **Client executor** (`services/aiProjects.ts` + `components/projects/ProjectChat.tsx`): parse
   actions → apply via existing store APIs (`taskStore.createTask/updateTask`,
   `projectStore` phase/memory ops) → schedule recompute happens automatically via the existing
   task-store subscription → render an inline "✓ Added 3 tasks to your plan" confirmation chip
   with **Undo** (store the inverse ops for one-tap revert).
4. **Thread history UI:** `Project.chat` is already persisted — add scrollback rendering on
   open (currently only the live session shows cleanly), day dividers, and a "Clear conversation"
   row in the project menu. No new thread model (project-scoped chat stays the design).
5. **Extend to task breakdown chat:** the same action pattern powers "Refine" on the task editor
   (out: `update_task`/`create_subtasks` actions instead of free text parse).
6. **Ready-for-key checklist** (do all of this now; it activates the moment Aria adds the key):
   - All 6 functions (`ai-breakdown`, `ai-simplify`, `ai-refine`, `ai-extract-tasks`,
     `ai-project-chat`, `ai-project-task`) reviewed for the Gemini request shape and the
     no-key contract.
   - **Deploy all 6 to Supabase now** (Supabase MCP `deploy_edge_function` or CLI). With no
     secret set they return `{error:"no_key"}` — safe, free, and the client already treats that
     as "use local fallback."
   - Leave Aria the one-step activation note (see §5 below).
7. **Local fallbacks for the agentic path:** with no key, the chat's "turn this into tasks"
   suggestion falls back to the deterministic `extractTasks` parser → same action pipeline
   (actions work even offline; only the conversational quality needs the key).

**Verify:** with NO key: chat falls back, action chips still work via local parse, nothing errors.
Single-shot curl of one deployed function returns `{error:"no_key"}` (that is the pass condition).

---

### Phase 6 — Scheduler depth + missed-work surface

From the feature-map investigation (most engine depth already exists — deps, buffers, workload
modes, pinning are DONE):

1. **Missed view + auto-mark** (medium): a recompute-time pass marks past blocks whose task isn't
   done as `status: 'missed'` (type already exists on `ScheduledBlock`). New "Needs attention"
   section on Home (and a filter on Tasks) listing missed items with two actions: **Reschedule**
   (clears + lets the engine re-place) and **Let it go** (drops the block, no shame copy — FR-60
   tone). Feeds the existing Recovery banner logic instead of competing with it.
2. **Per-list scheduling hours** (low, ~2 h): `List.schedulingHours?: SchedulingHours` in types +
   list editor UI; `core/scheduler/placement.ts` `taskHoursSpans()` resolves task-override →
   list-override → settings default. Pure engine change + one settings surface.
3. **Buffers UI:** `bufferBeforeMin/AfterMin` exist in the engine but have no editor surface —
   add to task editor "More options" (stepper, 0/5/10/15).
4. **Workload mode toggle** ("Balanced" / "Front-load") in scheduling settings — engine supports
   it (`WorkloadMode`), settings default exists, just expose it.

**Verify:** unit-style checks via a scratch script against `core/scheduler/recompute` (pure
functions, no app needed) + Playwright for the missed-view UI.

---

### Phase 7 — Deep multi-agent review (persona + scenario driven) + conformance gate + ship

This is the "full deep review using agents" Aria asked for. It is **scenario-first**: agents walk
the real personas (§2.5) through the real flows, and every finding is verified before it counts.
Run it as a `Workflow` (find → verify → synthesize), not a single pass.

1. **Conformance gate.** Re-open `docs/13_Conformance_Matrix.md` from Phase 0. **Every in-scope row
   must be `built` and passing.** Any still-open row is either closed now or explicitly reclassified
   Round C+ with a logged reason. This is the "remaining PRD/docs right" checkpoint — the build is
   not done until the matrix is clean.

2. **Persona-scenario walk (webapp-testing + Playwright).** Export web, serve, and drive **every
   scenario in §2.5** end-to-end as the relevant persona — the 11 Gherkin flows (S1–S11) plus the
   journey scenarios (cold start, night-before crunch, fell-behind-3-days, doomscroll defense,
   overwhelm, quiet-hours/cap boundaries) plus the edge cases (offline, reduce-motion, screen-reader
   labels, long-title truncation, over-subscription, midnight event, rapid taps, empty states).
   Console error-free on every screen (the two benign Expo web warnings excepted). Screenshot each.

3. **Parallel review dimensions (one agent each, then adversarially verify every finding).**
   - **Design** — `critique` + `soft`/`minimalist`/`taste` pre-flight checks against fresh
     screenshots of all ~12 surfaces; hunt AI-tells, inconsistent radius/accent, weak hierarchy.
   - **Accessibility** — `design:accessibility-review` + WCAG AA: contrast (post warm-shift),
     44×44 targets, icon-only labels, Dynamic Type, reduce-motion, focus order.
   - **Scheduler correctness** — scratch-script the pure engine against S1–S5 + the §2.6 edge cases
     (over-subscription, pinned-vs-fixed, midnight, undated backfill); assert determinism +
     recompute <300 ms + no double-schedule (pinned-minutes invariant).
   - **Notifications** — cadence, rate-limit, quiet-hours, warm/no-shame copy, permission-denied
     path.
   - **Wellbeing/safety** — panic valve always reachable, caps enforced, never-lock enforced
     client + server, no shame/medical/financial-stakes copy anywhere.
   - **Perf** — `react-native-best-practices` + `optimize`: FlashList blank-cells, drag re-renders
     stay UI-thread, 60fps calendar.
   Each finding is handed to a second agent prompted to **refute** it; only confirmed findings
   survive. Fix all P0/P1; log P2+ in the `docs/12` backlog (never silently dropped).

4. **Copy sweep.** No "Oops!", no exclamation in success toasts, sentence case, active voice,
   no-shame throughout (Garrett must never feel judged). `clarify` + `design:ux-copy`.

5. **Living docs (binding — a feature isn't done until docs match).** Update `docs/01_PRD.md`
   (missed view, per-list hours, agentic actions, resolved §2.6 GAPs, design v3), re-check
   `docs/02_Design_System.md` (v3 tokens), `docs/13_Conformance_Matrix.md` (final status),
   `docs/12_Preferences_and_Decisions.md` (Round B entry: direction mix, motion, dials, every GAP
   decision), `CLAUDE.md` (new conventions). Keep `docs/11` honest: move closed GAPs to resolved.

6. Commit + push. Present Aria a summary: before/after screenshots, the conformance matrix result,
   the confirmed-and-fixed findings, and the explicit Round C+ deferrals with their blockers.

---

## 3. Beyond v1 — full roadmap (what this plan covers vs. what is Round C+)

This is the complete "beyond v1" surface, grouped into coherent milestones in rough priority
order. Each line is annotated with where it lands: **[Round B]** = built in the phases above,
**[Round B partial]** = started here, finished later, **[Round C+]** = deliberately deferred
(reason given). The feature-map investigation confirmed how much engine depth already exists, so
several "big" items are actually small surfacing tasks.

### M-A · Scheduler depth (FlowSavvy-grade)
- Task **dependencies** — **already DONE** in the engine (`core/scheduler/ordering.ts` topo-sort,
  dep-aware `candidateSlots`). Only a task-editor "depends on" picker UI remains. **[Round B partial → Phase 6]**
- **Missed / auto-ignored view** — **[Round B → Phase 6]** (recompute marks `status:'missed'`,
  Home "Needs attention" section, Reschedule / Let-it-go).
- **Per-list scheduling-hours profiles** — **[Round B → Phase 6]** (`List.schedulingHours`).
- **Placement buffers** — engine **already DONE** (`bufferBeforeMin/AfterMin` in `placement.ts`);
  only the editor stepper is new. **[Round B → Phase 6]**
- **Lock-started-blocks** — pinning **already DONE** in the engine; the UI affordance (lock glyph +
  BlockActionSheet toggle) is **[Round B → Phase 2.7]**.
- **Smarter churn minimization** — the stability pass exists (`recompute.ts` preserves unchanged
  blocks verbatim); deeper heuristics (minimize cross-day moves on replan) are **[Round C+]**.

### M-B · Real AI turned on
- **Agentic planning chat** — the AI itself edits tasks/schedule/project memory via tool-calling.
  **[Round B → Phase 5]** via the client-side `ToolAction` pipeline (local-first; tools run
  on-device). Ready the moment the key is added.
- **Chat-history threads** — `Project.chat` is already persisted; scrollback + day-divider UI is
  **[Round B → Phase 5.4]**. A standalone (non-project) thread model is **[Round C+]**.
- **Document RAG (pgvector) — "ask my syllabus"** — **[Round C+]**. Nothing started: needs the
  `vector` extension, OCR/text-extraction on upload, chunking, an embedding model, and a retrieval
  layer feeding the chat. Highest-value Round C AI item; the Phase 5 grounding payload is built to
  accept retrieved chunks later.
- **Optional web search in chat** — **[Round C+]**, zero scaffolding; a tool-call that hits a
  search provider and returns grounded snippets (slots into the same `ToolAction`/grounding path).

### M-C · Native iOS Ignition (real device app-locking)
- **[Round C+ — external blocker.]** Needs the Apple **Family Controls (Distribution) entitlement**
  on all four bundle IDs (main app + 3 extensions), which takes **weeks** to be granted.
  **Action for Aria: request the entitlement early — it is the long pole.** Code is ready: the
  `NativeBlockingStrategy` stub + Swift extensions + config-plugin live in `native/ignition/`
  (excluded from tsconfig), gated behind `FEATURE_FLAGS.IGNITION_NATIVE=false`. Soft in-app lock
  ships today and is unaffected. Enable checklist is in `native/ignition/README.md`.

### M-D · Accounts & sync
- **Real IAP / StoreKit** — **[Round C+]**. Needs an Apple Developer account. `core/subscription.ts`
  + `app/paywall.tsx` already model trial/active/lapsed and plan selection locally; Round C wires
  `expo-iap`/`react-native-iap`, App Store receipt validation (a Supabase Edge Function), and
  server-to-server renewal webhooks. Keep local plan state + dev bypass until then.
- **Full cloud sync with conflict UI** — sync is built (local-first, last-write-wins,
  `store/syncStore.ts`); a user-facing **conflict-resolution UI** for true multi-device edits is
  **[Round C+]**.
- **Magic-link polish** — auth works; deep-link handling, resend/expiry states, and error copy
  polish are **[Round B partial → Phase 4 (Auth screen)]**.

### M-E · Input & reach
- **Voice "brain dump" (speech-to-text)** — **[Round C+]**. `SourceRef` type + the `sourceText`
  breakdown hook exist; needs an `expo-av` record UI + an STT provider (device-native or
  Whisper-class) feeding the existing `extractTasks` → action pipeline.
- **Notifications tuned + device-tested** — the service is fully built (`services/notifications.ts`,
  4 kinds, rate-limited, quiet-hours, warm copy). **[Round B partial]**: expose
  `maxNotificationsPerHour` + reminder toggles in Settings (Phase 4). Real-device timing tuning is
  **[Round C+]** (needs a dev build + hardware).
- **Widgets (home / lock screen)** — **[Round C+]**, no scaffolding; a separate WidgetKit extension
  showing "next block / time to start". Needs the Apple dev account + custom dev client.

### M-F · Platform
- **MCP server + public API (docs/08)** — **[Round C+]**, fully spec'd (30+ tools in
  `docs/08_Claude_MCP_and_API.md`), zero code. Requires splitting the pure engine into a
  `packages/engine/` with no React/Zustand deps, an MCP transport, OAuth/API-key management, and
  per-user tool authorization. **The Phase 5 `ToolAction` vocabulary is deliberately designed so
  this server can reuse it verbatim** — build it once on the client now, lift it to the server later.

### The deep multi-agent review
The skills are now installed, so the **deep review** (design + a11y + scheduler correctness +
notifications + dozens of user scenarios, via the `critique`/`audit`/`design:*`/`webapp-testing`
skills and adversarial verification) runs as **Phase 7's review gate** and its findings feed back
into Phases 1–6 before ship. Anything it surfaces beyond this scope is logged in `docs/12`'s
backlog, not silently dropped.

---

## 4. Orchestration notes for the implementing session

- Follow Aria's global rules: **delegate** — `ui-builder` for screens/components, `qa` for
  tsc/export gates, `reviewer` on each phase's diff, `explorer` for lookups. 3–5 workers max,
  review everything before folding in.
- **Phase 0 runs first** — a parallel multi-agent read-only doc sweep producing
  `docs/13_Conformance_Matrix.md`. Its gap list may add work to later phases; reconcile before
  building. Phases 1→2→3 then have a dependency spine (tokens → drag → affordances); Phases 5 and
  6 are independent of 3–4 and can run as a parallel workstream after Phase 1. Phase 7 is a
  `Workflow` (find → adversarially verify → synthesize), driven by the §2.5 scenarios.
- Read the five installed skills BEFORE Phase 1 (taste, soft, minimalist, redesign) and keep
  taste-skill's Pre-Flight Check as the exit gate for every design phase.
- Commit per phase; push once at the end. Never commit `.env`, screenshots, or `dist/`.

## 5. For Aria — activating real AI later (one step)

Everything ships ready. When you want live AI:
1. aistudio.google.com → **Get API key** → create (free, no card).
2. Supabase dashboard → Ampora project → **Edge Functions → Secrets** → add
   `GEMINI_API_KEY` = your key (or `supabase secrets set GEMINI_API_KEY=...`).
That's it — functions are already deployed and the app auto-detects them; no rebuild needed.
(Free-tier inputs may be used by Google for training — use test data until we swap to a paid key.)
