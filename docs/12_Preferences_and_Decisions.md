# 12. Preferences & Decisions (living log)

> **Purpose.** A running log of Aria's product and design preferences and the
> decisions made from her feedback. It is the fast reference for "what did Aria
> ask for and why" so we do not re-litigate settled calls or drift from them.
> **This doc is kept updated whenever Aria requests a change** — add a dated
> entry, and reflect anything binding into `docs/01_PRD.md` (spec) and
> `docs/02_Design_System.md` (styling) so the canonical docs stay authoritative.
> The PRD Decision Log (`01` §13) remains the formal record; this file is the
> plain-language, round-by-round companion.

---

## Round A — post-v1 feedback (2026-07-01)

Context: v1 is fully built (0 `tsc` errors, clean web export). Aria reviewed the
running app and gave feedback. The headline note was that the app **"looks too
simple"** and needs to feel like a real, professional product. This round is
careful and mostly additive — do not regress v1.

### Design

- **Professional / real-app look (design v2).** The app must read as a polished
  real product, not a simple prototype. Direction: a subtle **dot-grid texture
  on white** behind surfaces (like the reference Aria shared), depth via a
  **surface ladder** (background shift + 1px edge + soft `shadow.sm` used
  sparingly), **tighter heading tracking**, and **generous, varied spacing**.
  Restraint is the point — **no heavy shadows, no decorative gradients, no
  neon**. Premium = calm and considered.
- **One accent, used with intent.** Primary **`#2563EB`** is the single accent
  for CTAs, links, and focus rings. Accent **`#7C3AED`** is reserved for
  **Projects** only. ~90% of every screen stays neutral (white / off-white /
  gray / near-black ink `#18181B`).
- **Icon-inline buttons.** Buttons that pair an icon with a label render the
  **icon inline with the text** (not floated/detached), for a tighter, more
  intentional control.
- **Refined empty states.** Never blank — icon + short title + one line + one
  primary action; quiet and on-brand.

### Stakes / Ignition (the core feature)

- **App-picker, Opal-style.** The user **chooses which apps get blocked**
  themselves, via a picker modeled on Opal (iOS `FamilyActivityPicker` with
  opaque tokens; Android installed-app list). The user is in control of the
  block list.
- **Editable and always reachable.** The stake-app selection is editable at any
  time. The **six never-lock categories stay protected** and can never be added
  to the block list: **phone, messages, maps, accessibility, OS settings, and
  Ampora itself.** Aria also wants the user to be able to **add their own** apps
  to the block list freely (beyond any presets), while those six safety
  categories remain off-limits in code and in the picker copy.

### Focus timer verification

- **Timer pauses when you leave Ampora.** During a focus session the timer
  **pauses if the user leaves the app** (backgrounds it / switches away) and
  resumes when they return. Focused time only counts while Ampora is in the
  foreground.
- **Task not counted done unless the focus time actually elapsed in-foreground.**
  A task guarded by focus-time verification is **not marked complete** until the
  required focus duration has genuinely elapsed with the app in front. This is
  the honest-by-design default (you are restricting your own device, so you
  benefit from not faking it). The panic valve and overrides still always apply
  — verification never traps.

### Paywall / trial (real-app flow)

- **Present the trial and plans after sign-in.** After a user signs in, show the
  **2-week free trial and the subscription plans** (monthly / annual, annual
  ~10% cheaper per month). Paid app, **no free tier**; subscription state gates
  app access.
- **Dev bypass.** There is a **developer bypass** so builds can be used without
  paying during development/testing. It must be clearly a dev-only affordance,
  not shipped as a user-facing "skip paywall".

### AI

- **Gemini, free for now.** AI is **Google Gemini (`gemini-2.5-flash`)** behind
  a **Supabase Edge Function**. Chosen because it has a free tier — cost stays
  low while the subscription (which is meant to cover AI) ramps. The key
  (`GEMINI_API_KEY`) is a **server-side Edge Function secret**, never in the
  client. With no key set, every function returns `200 { error: "no_key" }` and
  the app falls back to its local, grounded templates — nothing breaks.
- **Project chat = agentic planner, not a quiz.** The project chat's purpose is
  to **organize and control the study plan** and, in future, **use tools to
  change tasks / schedule / memory**. It answers and acts; it does **not** quiz
  the user. It is the universal repair mechanism — an imperfect AI result is
  fixed by messaging the chat.

### Scheduling

- **FlowSavvy-parity, then better.** The scheduler should match FlowSavvy's
  auto-scheduling behavior as the baseline (priority-then-due ordering, hard
  deadlines distinct from scheduled blocks, splitting, deterministic recompute),
  and go **beyond it** by scheduling **with breaks** and by adapting to the
  user's **energy** (the Learning Engine's energy/state surface re-sorts the
  day; soft energy match in placement).

---

## Round B — design v2 + finish the app (2026-07-01)

Context: Round A shipped; Aria reviewed and asked for (1) design that reaches
**Todoist / Trello-level professional**, (2) a fix for the buggy, feedback-less
calendar drag, (3) polish + finish the remaining features, (4) everything AI
**ready but not keyed** yet. Executed autonomously as Plan v2 (Phases 0–7).

### Design direction (locked)

- **The mix: "clean & minimal" (Linear / Todoist) + "warm & premium" (Notion /
  Things), with richer & tactile motion** — Aria explicitly approved motion that
  is livelier than the old quiet-motion default. Dials locked: **DESIGN_VARIANCE 5,
  MOTION_INTENSITY 6, VISUAL_DENSITY 5**. Do not re-litigate.
- **Warm the neutral spine.** Migrated cool Zinc → warm Stone: canvas is warm
  bone **`#F7F6F3`**, ink is warm near-black **`#1C1917`** (supersedes the old
  `#18181B`), one warm gray family throughout (never mix warm/cool grays).
  Shadows are warm-tinted (`#292524`) and ultra-diffuse. Added a muted-pastel
  **`listColors`** set, a **`FeatureShell`** nested "feature card" primitive
  (reserved for ~4 focal cards only), and **tabular numerals** for all aligned
  numbers. **Never hardcode colors** is now actually enforced — every legacy
  hardcoded gray was migrated to tokens (0 cool-Zinc literals remain). `Inter`
  stays (correct for the Linear-style brief; the design skills' own override).
- **Motion vocabulary:** `SPRINGS.tactile` for control/drag physics, live drag
  feedback, a single celebratory completion beat. Reduce-motion always respected.

### Calendar drag (the headline bug — fixed)

Live snapped-time pill while dragging (the missing feedback), snap-during-drag
selection haptics, deterministic scroll-lock + edge autoscroll, a tactile
drop-spring, a pinned-block lock glyph with a working Lock/Unlock toggle, and
44px resize targets. **Cross-day drag in 3-Day/Week is deliberately gated off**
(RN clips sibling day columns; a correct version needs one shared absolute
canvas — Round C). Vertical drag is fully polished; better janky-free than shipped-janky.

### §2.6 open-GAP decisions (all resolved this round)

- **Day capacity** = that day's scheduling-hours minutes minus fixed events.
- **Pinned block vs a new overlapping fixed event:** the real fixed event wins;
  the pinned task block reflows (never a silent drop).
- **Over-subscription:** keep highest-priority + earliest-due; the rest surface
  in the unschedulable list with a reason. Never silently dropped.
- **Event crossing midnight:** split at the day boundary in Day/3-Day/Week.
- **Timezone/travel:** recompute on tz change; blocks are wall-clock-local.
- **Notification permission denied:** degrade to in-app/web + a *one-time*
  Settings nudge (no nagging).
- **Project files:** 20 files/project, 25 MB/file, types pdf/img/doc/sheet.
- **Delete a project:** default **keep + unlink** its tasks; the confirm dialog
  offers "also delete its N tasks". Don't destroy the user's work by default.
- **A task belongs to at most one project** (no multi-project tasks).
- **Undated auto-scheduled tasks** backfill and never displace dated work
  (confirmed). **Multi-device stakes / beat-the-clock cooldown** confirmed built.
- **Monetization:** paid app, **no free tier**, so no per-feature AI/project
  gating for v1. (Revisit only if a Free tier is ever wanted.)
- **Privacy policy / ToS** (required for minors at launch): **Round C legal
  task — flagged to Aria, not code.**

### AI — ready for key, not keyed

- **Agentic project chat = a planner that acts.** It edits the plan via a
  client-side **`ToolAction`** pipeline (create/update/complete task, subtasks,
  first move, schedule hints, project phase/memory) validated + applied on-device
  with one-tap **Undo**; confirmation chips render in the thread. Local-first —
  no MCP server this round; the tool vocabulary is designed to lift to the future
  MCP server verbatim.
- All 6 existing edge functions + a new `ai-verify-proof` are **deployed** and
  return the `no_key` contract until the key is set. **Activation is one step:**
  set `GEMINI_API_KEY` as an Edge Function secret on the **active** Supabase
  project **`pgqbwhksxqgnfdkmwlop`** (the project-scoped MCP points at a *dead*
  Dandelion project `dypqqazrwwtwekbligpy` — do not use it). No rebuild needed.

### Wellbeing

- **Beat-the-clock is OFF by default and must be earned** — it only becomes
  available after **≥3 successful lock-until-start sessions** (restores the
  invariant that was silently violated by a hardcoded-true flag). Panic valve,
  180-min daily cap, 30-min cooldown, quiet-hours auto-release, and the 6
  never-lock categories are all preserved; a stale lock session is now
  reconciled (released) on app launch. Never-lock is client-enforced today;
  full server/device enforcement lands with native shielding (Round C).

### Deep review (Phase 7)

A multi-agent adversarial review (find → refute → confirm) surfaced **14
confirmed findings**, all fixed: the biggest were a **scheduler missed-marking
bug** (elapsed non-pinned blocks were dropped before they could be marked, so
"Needs attention" silently never populated) and the **beat-the-clock default**.
Also fixed: the warm migration was incomplete (legacy hardcoded grays), a
caption-contrast AA failure (`text-neutral-400` on the warm canvas), a
per-kind-reminder toggle that didn't reschedule, web reminders that never
polled, an unwired completion celebration, and a stale-lock-session gap.

### Deferred to Round C+ (explicit, with blockers)

Native iOS Ignition locking (Apple Family Controls entitlement, weeks) · real
IAP/StoreKit (Apple dev account) · **native magic-link deep-link** (works on
web; native needs a dev build + routing/supabase wiring + a device) · document
RAG "ask my syllabus" (pgvector + OCR + embeddings) · voice brain-dump STT ·
home/lock-screen widgets · MCP server + public API · real-device notification
timing · calendar-sync OAuth. Also flagged: `send-auth-email` exists only on
the dead Dandelion project — if magic-link emails are needed live, redeploy it
to the active project.

---

### How to use this log

- When Aria asks for a change, **append a dated entry** under a round heading
  here first (plain language + the why).
- If the change is a spec/behavior change, also update `docs/01_PRD.md` (add or
  amend the relevant FR + a Decision Log row) additively.
- If it is a styling change, update `docs/02_Design_System.md` so it stays the
  authoritative visual source.
- Never silently drop a prior decision — supersede it with a new dated entry
  that says what changed and why.
