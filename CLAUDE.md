# Ampora — Project CLAUDE.md

An auto-scheduling task app where you can lock your own distracting apps for a bounded work session, so slacking costs something now and starting is made as small as possible. For students who procrastinate and people with ADHD, age 13+. Five nouns are the whole app: Task, Project, Session, Stake, Proof. Five tabs: Today, Calendar, Tasks, Focus, Profile.

## Doc index (read in this order, nothing else exists)
The doc set was renumbered. These 11 files are the complete current set — no `docs/12`, `docs/13`, or backstory/business/marketing files exist anymore.

- `docs/00_Overview.md` — orientation: product in one sentence, the object model, the five tabs. Start here.
- `docs/01_PRD.md` — exhaustive product spec. **Source of truth for what to build.**
- `docs/02_Design_System.md` — tokens, palette, components, motion, accessibility. **Source of truth for styling.**
- `docs/03_AI_Breakdown_and_Subtasks.md` — breakdown pipeline (task → subtasks → First move), source grounding, Refine chat, subtask semantics.
- `docs/04_Ignition_Sessions_and_Verification.md` — the session model: the two holds (`session`/`until_done`), the two triggers (`manual`/`scheduled`), panic valve, wellbeing spine, the three-tier proof spectrum. **Source of truth for locking behavior** — supersedes the old three-mode Ignition model still present in code.
- `docs/05_App_Blocking_Technical.md` — native iOS/Android/desktop implementation of the lock (Family Controls, shielding, the `BlockingStrategy` interface).
- `docs/06_Projects.md` — Projects as a first-class type: phases, one context line, percent progress, nightly session generation. Thin at launch by design (no files, no chat, no mastery tracking).
- `docs/07_Build_Roadmap.md` — build sequence, milestones, current build status, the standing rule for every session (§A2, quoted below).
- `docs/08_MCP_and_API.md` — Claude MCP connection + public API. Post-launch, never gates store submission.
- `docs/09_Decisions.md` — locked product/technical decisions; the living round-by-round preferences log. **Log here when Aria requests a product/design change**, and reflect anything binding into `01_PRD.md` / `02_Design_System.md`.
- `docs/V2_Changes.md` — everything deliberately deferred. **Never build from this file** — consult it only to know what NOT to build. See standing rule below.
- `docs/CONFORMANCE.md` — a generated conformance audit (FR/NFR → code, dated per run), **not a spec and not part of the doc set above**. Read it to see what's actually built; never build *from* it — a gap it lists is only real if the numbered docs above also require it.

## Standing rule for every session (docs/07 §A2)
"Build strictly from `01_PRD` and its companion specs. Match `02_Design_System` for all UI. The scheduling engine is on-device and must be smooth and correct. The lock unit is the focus session (`04`). Never build anything in `V2_Changes.md`. The existing codebase is a foundation, but the Ignition/session/verification layer is a rebuild to the new model, not an incremental patch. My style: no em dashes, no semicolons, direct, one best recommendation."

## Project state (honest, read before touching anything)
The codebase typechecks at zero `tsc` errors. The old Focal/Dandelion prototype and the Express `backend/` are gone. But the spec was revised (the session model in `04` and the deferral list in `V2_Changes.md` are newer than large parts of the code) — treat the code as a partial foundation, not a finished baseline to extend uncritically.

**Shipped and correct — extend, do not regress:**
- Task system — editor, quick-add NL parse (`core/quick-add.ts`), lists, tags, priorities, subtask checklists, completed/undo.
- Scheduler engine — on-device deterministic auto-placement (`core/scheduler/`) around busy blocks + quiet hours, recompute well under 300ms.
- Calendar — Day/3-Day/Week/Month/Agenda with drag, zoom, snap haptics, one consolidated block per session.
- AI breakdown — Gemini via edge functions with on-device fallbacks in `services/ai.ts`; first move, source grounding, Refine chat.
- Notifications — native `expo-notifications` + web polling (`services/notifications.ts`).
- Cloud sync — local-first, last-write-wins background reconciliation (`store/syncStore.ts`, `services/supabase.ts`).
- Design tokens/motion primitives — `utils/design-tokens.ts`, `utils/motion.ts`, `hooks/useReduceMotion`. The token system itself is solid; consistent *use* of it is not (see Rules below).

**Being rebuilt — do not extend the old shape, build to `docs/04` instead:**
- Ignition/session/verification. The code still carries the old three-mode model (`lock_until_start` / `lock_until_done` / `beat_the_clock`, see `core/blocking/NativeBlockingStrategy.ts`, `store/stakesStore.ts`). That model is superseded by the `hold` (`session` default / `until_done` opt-in) + `trigger` (`manual` / `scheduled` with optional start window) model in `docs/04`. Beat-the-clock is no longer a separate mode — it's an optional start window on a scheduled trigger.

**Being deleted — present in code today, but out of scope per `docs/V2_Changes.md`; do not build on top of these, and do not treat them as shipped baseline:**
- The Learning Engine in full — Focus DNA, Revealed Self, energy states (`core/learning/`, `store/learningStore.ts`, `store/behavioralStore.ts`, `app/insights.tsx`, `components/insights/*`), plus the energy-peak onboarding step (`app/onboarding/energy.tsx`).
- Stake calibration by the Learning Engine (fixed defaults + one manual strength control only, at launch).
- Verification tiers beyond three: word-count and screen-activity are cut. Only honor / focus-time / photo-screenshot ship.
- Breakdown memory (per-user, per-task-type learned preferences).
- The agentic project chat with client-side `ToolAction`s (`core/ai-actions.ts`, `components/projects/ProjectChat.tsx`, the `ai-project-chat` edge function) and the project file library (`components/projects/FileList.tsx`). Projects ship thin: phases, one context line, percent bar, nightly session generation, end-of-session check-in only.
- Widgets and desktop companion.

**Never built:**
- Apple and Google sign-in (`app/auth.tsx` currently only does email magic-link).
- Voice capture for breakdown.
- Recurrence occurrence generation (recurring-task drop-missed handling and split-into-sessions).
- Read-only calendar sync (Google/Outlook/iCloud).
- Unschedulable-task UI (the scheduler computes it internally but nothing surfaces the list + reason to the user).
- The nightly pre-built-tomorrow pass.
- Real subscription IAP — `core/subscription.ts` computes trial/entitlement state only; no StoreKit/`react-native-iap` purchasing.

**Gated:**
- iOS native app-locking is behind `FEATURE_FLAGS.IGNITION_NATIVE` (`constants/featureFlags.ts`), off until Apple grants the Family Controls entitlement and `native/ignition/` is wired. `getBlockingStrategy()` returns the soft in-app strategy until then. `native/**` is excluded from tsconfig.
- Real AI: edge functions in `supabase/functions/` are deployed to the live Supabase project `pgqbwhksxqgnfdkmwlop` and return `200 { error: "no_key" }` until `GEMINI_API_KEY` is set as an Edge Function secret. The project-scoped Supabase MCP points at the dead Dandelion project `dypqqazrwwtwekbligpy` — use the account-level MCP with an explicit `project_id`.

## Stack (from package.json, do not invent versions)
Expo `~54.0.33` (new architecture enabled) | React Native `0.81.5` | React `19.1.0` | expo-router `~6.0.23` (typed routes) | TypeScript `~5.9.2` strict | NativeWind `^4.1` + tailwindcss `^3.4` | Zustand `^5.0.12` + react-native-mmkv `^4.3.2` (local-first state + persistence) | @supabase/supabase-js `^2.103.0` (auth + DB + Edge Functions) | Google Gemini (`gemini-2.5-flash`) via Supabase Edge Functions, with on-device fallbacks | react-native-reanimated `~4.1.1` + react-native-gesture-handler `~2.28.0` + react-native-worklets `0.5.1` | @shopify/flash-list `2.0.2` | @expo-google-fonts/inter | react-native-calendars `^1.1314.0` | expo-notifications, expo-haptics, expo-secure-store, expo-image, expo-av, expo-linear-gradient, @expo/vector-icons.

Path alias: `@/*` → repo root (`tsconfig.json`). `Reference/**`, `supabase/functions/**`, and `native/**` are excluded from typecheck.

## Architecture (current directories)
Expo Router file-based. Auth gate + Zustand hydration + notification scheduling + daily schedule recompute + background sync wire up in `app/_layout.tsx`.

- **5 tabs** (`app/(tabs)/`): `index` (Today/Home), `tasks`, `calendar`, `focus`, `profile`.
- **Onboarding** (`app/onboarding/`).
- **Modal/stack screens**: `task/new`, `task/[id]`, `focus/session`, `blindfold`, `insights`, `paywall`, `projects/`, `settings/`, `auth`.
- **Portable core** (`core/`): pure, I/O-free logic — `scheduler/`, `blocking/` (`BlockingStrategy` + Soft/Native strategies, `getBlockingStrategy()`), `calendar/`, `learning/` (deferred, see above), `recovery.ts`, `quick-add.ts`, `subscription.ts`, `task-logic.ts`, `dataExport.ts`, `id.ts`, `ai-actions.ts` (deferred, see above).
- **Stores** (`store/`, Zustand + MMKV persist): `taskStore`, `listStore`, `settingsStore`, `scheduleStore`, `schedulingStore`, `sessionStore`, `stakesStore`, `learningStore`, `behavioralStore`, `recoveryStore`, `proofStore`, `projectStore`, `syncStore`, `insightsStore`. MMKV adapter in `store/mmkv.ts`.
- **Services** (`services/`): `ai.ts` (thin client over the `ai-*` edge functions, auto-detected via `EXPO_PUBLIC_SUPABASE_URL`, with local fallbacks), `aiProjects.ts`, `supabase.ts` (auth + background sync row mappers, SecureStore key hex-sanitization), `notifications.ts`.
- **Edge Functions** (`supabase/functions/`): `ai-breakdown`, `ai-simplify`, `ai-refine`, `ai-extract-tasks`, `ai-project-chat`, `ai-project-task`, `ai-verify-proof`, `send-auth-email`; shared Gemini client in `_shared/gemini.ts` (calls `gemini-2.5-flash` generateContent, reads `GEMINI_API_KEY`, returns `200 { error: "no_key" }` when unset). No Express backend — it was removed.
- **Components** (`components/`): `ui/` primitives (Button, Card, Badge, TaskCard, FAB, Input, ProgressBar, EmptyState, TaskActionSheet, SkeletonLoader, PressableScale, GradientCard, Heading, Screen, etc.) plus feature folders: `home`, `calendar`, `schedule`, `projects`, `stakes`, `recovery`, `verification`, `task-editor`, `insights`, `settings`, `focus`.
- **Native scaffolding** (`native/ignition/`): isolated iOS Family Controls extensions + config plugin, wired only when `IGNITION_NATIVE` is on. Excluded from tsconfig.

## Rules

### Design system (`docs/02` — binding)
- **Never hardcode colors, radii, or spacing.** All values come from the canonical tokens (`docs/02` §10/§14: warm-neutral Zinc→Stone spine, canvas `#F7F6F3`, ink `#1C1917`; primary/success/warning/accent/red semantic ramps). Reference semantic aliases, not raw ramp steps or literals.
- **This rule is NOT yet enforced.** A raw-literal sweep found roughly 377 hardcoded color values (hex, `hsl()`, `rgba()`) across ~74 files in `app/`, `components/`, and `hooks/`. Tokenizing these is outstanding work, not a finished migration — do not claim otherwise, and do not add new literals while touching a file that has them.
- Neutral-dominant: ~90% of every screen is canvas/off-white/gray/near-black ink. Ink is never pure black. Accent color only when it carries meaning (`#2563EB` primary; `#7C3AED` reserved for Projects only).
- **One primary action per screen**, visually dominant. Others are outline/ghost.
- Typography: Inter, weight bound into the family name (e.g. `Inter_600SemiBold`); headings use negative letter-spacing. Body ≥15px, inputs 16px, captions ≥13px. Tabular numerals for aligned numbers.
- Spacing on a 4px grid (8 is the common rhythm). Radius: cards 12, buttons 10, inputs 8-10, pills full, modals 16. Shadows soft, warm-tinted, low-opacity; default card = shadow.sm + 1px border.
- **Min touch target 48×48** (use `hitSlop`); button heights 36/44/52.
- **WCAG AA throughout**: 4.5:1 body, 3:1 large/UI glyphs. Status is never color alone — every pill/state carries a text label.
- **Every icon-only control gets `accessibilityLabel`** (+ `accessibilityHint` when non-obvious); set `accessibilityRole` and announce state. Support Dynamic Type.
- Motion is quiet, fast, eased by default; reserve spring (`SPRINGS.tactile`) for controls (toggles, FAB, drag), never text/layout. **Respect reduce-motion** (`hooks/useReduceMotion`). One prominent animation at a time.
- Empty states: never blank — icon + short title + one line + one primary action.

### Product / safety constraints (`docs/01`, `docs/04`, `docs/05`)
- **App-locking is self-imposed and local only. Never remote device-lock.** Never manufacture financial or public-shame stakes; no medical claims.
- **The lock unit is the focus session**, not "until start" and not "until whole task done" (see `docs/04`). A stake has a `hold` (`session` default / `until_done` opt-in, short tasks only) and a `trigger` (`manual` / `scheduled` with an optional start window). Only one session active at a time.
- **The First move is the on-ramp, never the unlock condition.** Doing it never ends a lock.
- **Panic valve always available**: 60-second countdown + calm message (required for App Store). Repeated panic use or overrides trigger de-escalation, never more demands.
- **Wellbeing caps**: daily lock cap default 180 min (hard ceiling, user-lowerable), single-session cap 50 min, quiet hours default 23:00–08:00 with auto-release. The single-session cap converts any `until_done` lock to a release — a bad estimate can never produce a marathon lock.
- **Never-lock categories** (enforced client + server, and in picker copy): phone, messages, maps, accessibility, OS settings, Ampora itself.
- Verification is three tiers only: honor, focus-time (automatic backbone, foreground-only timer), photo/screenshot (lenient AI plausibility check, private Proof Log, errs toward accepting). No shame copy on any failed or overridden verification.
- iOS Family Controls entitlement (`com.apple.developer.family-controls`) needs Apple approval per bundle ID and can take days-to-weeks.
- Scheduling is deterministic, recompute <300ms, calendar 60fps, churn-minimizing. Never silently drop an unschedulable task — explain why (UI for this is not yet built, see Project state).

### AI / breakdown (`docs/03`, `docs/08`)
- **AI is Google Gemini (`gemini-2.5-flash`) behind the edge functions** (free tier for now; the subscription is meant to cover AI cost). The key lives server-side only, never in the client.
- **AI API budget: do NOT call the `ai-*` edge functions during routine testing.** The on-device fallbacks in `services/ai.ts` cover every path; single-shot curl against a deployed function for verification only.
- Edge functions read `GEMINI_API_KEY` and return `200 { error: "no_key" }` when unset, so "no key" and "network failed" both funnel into the same graceful local fallback. **Never surface an AI failure to the UI.**
- **First move**: ≤10 min, concrete physical action, impossible to fail. Max 8 subtasks. Source-grounded (derive from the real assignment/rubric/problems, not a generic template).
- **The task is the schedulable unit, not subtasks.** Subtasks are an execution checklist. Parent duration = sum of subtask estimates (sync on edit); progress = sum of completed subtask durations. Calendar shows one block per session labeled "N steps," not many tiny blocks.
- Breakdown is fresh per task at launch (memory is deferred, see Project state). The Refine chat is the correction path.

### Data / sync / env
- Local-first: write Zustand → persist MMKV (immediate, via `store/mmkv.ts`) → fire-and-forget Supabase upsert (background; errors logged, never surfaced). Merge is last-write-wins on `updatedAt`, local wins on ties (`store/syncStore.ts`).
- **Zustand v5 + React 19 selector discipline**: raw-select fields + `useMemo` for derived objects/arrays; use **`useShallow`** for multi-field / object-returning selectors. No inline `.map`/`.filter`/`.sort` in selectors — `Object.values`-style selectors need `useShallow` or they infinite-loop (React #185).
- **NativeWind + Reanimated**: `className` on `Animated.View` (and other Animated primitives) is dropped unless `cssInterop` is registered for them — done once in `nativewind-reanimated.ts`. Do not remove that registration.
- **NativeWind `useColorScheme`**: always import from `"nativewind"`, never `"react-native"`.
- Env: `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY` in `.env` (gitignored). `GEMINI_API_KEY` as a Supabase Edge Function secret (never in the client). Auth tokens only in expo-secure-store (`:` in keys is hex-encoded — SecureStore rejects it).
- **Never commit `.env` or secrets.**
- **Quality gate: `npx tsc --noEmit` must pass with 0 errors before marking any task complete.**

## Living docs
After any task completion or new requirement: update `docs/01_PRD.md` (feature/change), update this file (new conventions), and keep `docs/02_Design_System.md` authoritative for styling. When Aria requests a product/design change, log it in `docs/09_Decisions.md` (the living round-by-round preferences log) and reflect anything binding into the PRD/Design System. A feature is done only when it matches the PRD section and the Design System definition-of-done.

## Aria's style
No em dashes. No semicolons. Terse, direct, one best recommendation, no preamble.

## Global rules also apply
→ `C:\Users\Aria\.claude\CLAUDE.md`
