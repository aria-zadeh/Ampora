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

### How to use this log

- When Aria asks for a change, **append a dated entry** under a round heading
  here first (plain language + the why).
- If the change is a spec/behavior change, also update `docs/01_PRD.md` (add or
  amend the relevant FR + a Decision Log row) additively.
- If it is a styling change, update `docs/02_Design_System.md` so it stays the
  authoritative visual source.
- Never silently drop a prior decision — supersede it with a new dated entry
  that says what changed and why.
