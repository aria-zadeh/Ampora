# Ampora — Project CLAUDE.md

An auto-scheduling task app where you can lock your own distracting apps for a bounded work session, so slacking costs something now and starting is made as small as possible. For students who procrastinate and people with ADHD, age 13+. Five nouns are the whole app: Task, Project, Session, Stake, Proof. Five tabs: Today, Calendar, Tasks, Focus, Profile.

## Doc index (read in this order, nothing else exists)
The doc set was renumbered. These 11 files are the complete current set — no `docs/12`, `docs/13`, or backstory/business/marketing files exist anymore.

- `docs/00_Overview.md` — orientation: product in one sentence, the object model, the five tabs. Start here.
- `docs/01_PRD.md` — exhaustive product spec. **Source of truth for what to build.**
- `docs/02_Design_System.md` — tokens, palette, components, motion, accessibility. **Source of truth for styling.**
- `docs/03_AI_Breakdown_and_Subtasks.md` — breakdown pipeline (task → subtasks → First move), source grounding, Refine chat, subtask semantics.
- `docs/04_Ignition_Sessions_and_Verification.md` — the session model: the two holds (`session`/`until_done`), the two triggers (`manual`/`scheduled`), panic valve, wellbeing spine, the three-tier proof spectrum. **Source of truth for locking behavior.** The rebuild to this model is done, the old three-mode Ignition model survives only as a one-way migration path for old persisted data (`store/migrations/stakes.ts`), not as live logic.
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
The codebase typechecks at zero `tsc` errors and the full test suite passes (`npm test`, 465 tests across 24 files as of this writing, that count moves as workstreams land, re-run it rather than trusting the number). The old Focal/Dandelion prototype and the Express `backend/` are gone. This state was re-audited against `01_PRD` §7 and the codebase on 2026-07-30. Full file:line evidence for every claim below lives in `docs/CONFORMANCE.md`, read that for detail, this section is the summary.

**Shipped and correct, extend, do not regress:**
- Task system: editor, quick-add NL parse (`core/quick-add.ts`), voice capture ("Brain dump", `services/voiceCapture.ts` + `components/capture/BrainDumpSheet.tsx`, real on-device STT via `expo-speech-recognition`), lists, tags, priorities, subtask checklists, completed/undo.
- Scheduler engine: on-device deterministic auto-placement (`core/scheduler/`) around busy blocks and quiet hours, recompute well under 300ms and tested at that budget. Recurrence occurrence generation (`core/recurrence.ts`, drop-missed and carry-forward both implemented and tested) and the unschedulable-task UI (`selectUnschedulable` now has a real caller in `app/(tabs)/tasks.tsx`, an "At risk" filter chip, and `components/schedule/UnschedulableFixSheet.tsx` with four one-tap remedies) are both real now, not gaps.
- Calendar: Day/3-Day/Week/Month/Agenda with drag, zoom, snap haptics, one consolidated block per session. Fixed Events now have a full create/edit/delete loop (`components/ui/AddEventModal.tsx`, a toolbar button plus long-press-empty-space, `store/scheduleStore.ts`'s `addLocalEvent`/`updateLocalEvent`/`deleteLocalEvent`) and feed the engine as busy time. Read-only calendar sync (Google/Outlook/iCloud via the on-device calendar DB) is real: `services/calendarSync.ts` plus a picker in `components/settings/CalendarSyncSettings.tsx`.
- AI breakdown: Gemini via edge functions with on-device fallbacks in `services/ai.ts`, first move, source grounding, Refine chat.
- Notifications: native `expo-notifications` plus web polling (`services/notifications.ts`). The nightly pre-built-tomorrow pass is real and wired: `core/nightlyPass.ts` + `hooks/useNightlyPass`, mounted in `app/_layout.tsx`, fires "Ready for tomorrow."
- Ignition/session/verification: the rebuild to the `docs/04` session model is done, not in progress. Hold (`session` default, `until_done` opt-in) and trigger (`manual`, `scheduled` with optional start window) are the live model everywhere. The old three-mode strings (`lock_until_start`/`lock_until_done`/`beat_the_clock`) survive only inside `store/migrations/stakes.ts` as a one-way migration path for old persisted data, they are not live logic anywhere. Panic valve, de-escalation, the three-tier proof spectrum, and the wellbeing caps are wired and tested, see `docs/CONFORMANCE.md` §3 for the item-by-item trace (including confirming the daily cap's clamp actually holds through every write path, not just at the constant's definition).
- Auth: Sign in with Apple, Sign in with Google, and email magic link, no anonymous mode anywhere (`app/auth.tsx`, `services/supabase.ts`). Account deletion (typed "DELETE" confirmation, export offered first, a real `delete-account` edge function that re-verifies the caller's own JWT server-side) and data export live in Settings (`components/settings/DataSettings.tsx`, mounted at `app/settings/all.tsx`).
- Cloud sync: local-first, `syncNow()` has a real caller (`app/_layout.tsx`, on sign-in and every return to foreground), covering tasks, settings, lists, tags, projects, stake session history, lock events, proofs, and the on-device event log. One nuance: `syncStore`'s `pushTask`/`pushSettings` per-edit push functions have zero callers anywhere, tasks and settings still sync correctly through `syncNow`'s coarser full reconcile, they just do not get the instant per-edit push that lists/tags/projects/stakes/proofs/events get via store subscriptions.
- Design tokens/motion primitives: `utils/design-tokens.ts`, `utils/motion.ts`, `hooks/useReduceMotion`. Nine new semantic aliases landed this round (`textDisabled`, `textStrong`, `successAccent`, `successStrong`, `warningAccent`, `warningStrong`, `dangerStrong`, `borderStrong`, `accentStrong`). The token system itself is solid, consistent *use* of it is not, see Rules below for the real current count.
- Projects: phases, one context line, percent bar, nightly session generation, end-of-session check-in, all thin as specced. Confirmed no UI path exists anywhere to stake a Project directly, only the generated session Task.

**Precise known gaps, see `docs/CONFORMANCE.md` for full file:line evidence on each:**
- The Settings auto-schedule-cutoff-weeks value never reaches the live engine, `store/scheduleStore.ts`'s recompute call never passes `cutoffDays` through to `core/scheduler/recompute.ts`.
- The PRD's "single user-set stake strength control" (FR-44, also `09_Decisions.md`) does not exist as an editable UI control anywhere. `components/stakes/StakeSetupSheet.tsx` deliberately renders it as a read-only Firm/Balanced/Gentle badge, its own comment says why. The only writer of `stakeStrength` is one-way automatic de-escalation.
- In Settings, `StakesSettings.tsx`'s "Longest single lock" row displays the daily cap value under the wrong label (it should show `singleSessionCapMin`, which the file never reads), stake strength is not exposed at all, and the never-lock list is editable beyond the six protected categories where the spec says view-only.
- The six never-lock categories are enforced client-side only. No server-side check exists anywhere in `supabase/`, despite FR-40 and §9.10 both promising "client and server."
- The "has-stake"/"Stakes active" task filter is still a stale TODO in `app/(tabs)/tasks.tsx`, no longer blocked on the stakes rewrite since that rewrite is done.
- No inline checkbox exists to complete a task from its calendar block, completion is still action-sheet only.
- Blindfold advances by tap, the PRD's own Gherkin text says swipe. Same outcome, different word.
- Dark mode is wired end to end (token palette, a real theme picker in `app/(tabs)/profile.tsx`) but has zero live effect. Every `dark:` NativeWind class in the shipped component tree lives in two files nothing imports (`components/BreakModal.tsx`, `components/ui/LoadingSkeleton.tsx`).

**History, already removed, not pending work:**
- The Learning Engine in full: Focus DNA, Revealed Self, energy states (`core/learning/`, `store/learningStore.ts`, `store/behavioralStore.ts`, `app/insights.tsx`, `components/insights/*`), the energy-peak onboarding step, and the `Task.energyRequired`/`Settings.energyPeak` fields, confirmed gone from the working tree this round, not merely scheduled for removal. A migration (`supabase/migrations/20260730000007_drop_energy_columns_PENDING_REVIEW.sql`) exists to retire the columns on the live DB if they were ever created there.
- Stake calibration by the Learning Engine, the agentic project chat and file library (`core/ai-actions.ts`, `components/projects/ProjectChat.tsx`, `components/projects/FileList.tsx`), and widgets/desktop are all confirmed absent, matching `docs/V2_Changes.md`.
- Verification tiers beyond three (word-count, screen-activity) are cut. The Proof model handles the cut by remapping migration, not deletion, so no user's private history was destroyed retiring them.

**Gated:**
- iOS native app-locking is behind `FEATURE_FLAGS.IGNITION_NATIVE` (`constants/featureFlags.ts`), off on every shared branch. The native module is now actually written, not just scaffolded: `native/modules/ampora-ignition/ios/AmporaIgnitionModule.swift` is real Family Controls/ManagedSettings/DeviceActivity Swift, plus `AppGroupStore.swift` and a config-plugin package. It is uncompiled and unverifiable from this repo, `native/**` is excluded from `tsconfig.json`. Needs a Mac and Apple's Family Controls (Distribution) entitlement per bundle ID.
- Real subscription IAP is behind the identical pattern (`FEATURE_FLAGS.IAP_NATIVE`). `core/iap/NativePurchaseStrategy.ts` now calls real RevenueCat SDK methods (configure/getOfferings/purchasePackage/restorePurchases/getCustomerInfo) via a lazy `require()`, mirroring how native locking resolves. `react-native-purchases` is deliberately not in `package.json` (this repo builds on Windows/web, it needs `native/package-additions.json`'s `purchases` group installed on a native checkout first), and the flag is off everywhere shared, so `getPurchaseStrategy()` always returns the mock. Needs App Store Connect and Play Console product setup plus installing the real package.
- Real AI: edge functions in `supabase/functions/` are deployed to the live Supabase project `pgqbwhksxqgnfdkmwlop` and return `200 { error: "no_key" }` until `GEMINI_API_KEY` is set as an Edge Function secret. The project-scoped Supabase MCP points at the dead Dandelion project `dypqqazrwwtwekbligpy`, use the account-level MCP with an explicit `project_id`.
- `supabase/migrations/` now exists: seven files, owner-only RLS on six of them, one pending-review column drop for the retired energy fields. Whether they are actually applied to the live project could not be checked this round (no authorized Supabase MCP session, and calling any edge function was off-limits for a read-only audit). Treat live schema state as unverified, not as either applied or unapplied, until someone checks it directly.

## Stack (from package.json, do not invent versions)
Expo `~54.0.33` (new architecture enabled) | React Native `0.81.5` | React `19.1.0` | expo-router `~6.0.23` (typed routes) | TypeScript `~5.9.2` strict | NativeWind `^4.1` + tailwindcss `^3.4` | Zustand `^5.0.12` + react-native-mmkv `^4.3.2` (local-first state + persistence) | @supabase/supabase-js `^2.103.0` (auth + DB + Edge Functions) | Google Gemini (`gemini-2.5-flash`) via Supabase Edge Functions, with on-device fallbacks | react-native-reanimated `~4.1.1` + react-native-gesture-handler `~2.28.0` + react-native-worklets `0.5.1` | @shopify/flash-list `2.0.2` | @expo-google-fonts/inter | react-native-calendars `^1.1314.0` | expo-notifications, expo-haptics, expo-secure-store, expo-image, expo-av, expo-linear-gradient, @expo/vector-icons.

Path alias: `@/*` → repo root (`tsconfig.json`). `Reference/**`, `supabase/functions/**`, and `native/**` are excluded from typecheck.

## Architecture (current directories)
Expo Router file-based. Auth gate + Zustand hydration + notification scheduling + daily schedule recompute + background sync wire up in `app/_layout.tsx`.

- **5 tabs** (`app/(tabs)/`): `index` (Today/Home), `tasks`, `calendar`, `focus`, `profile`.
- **Onboarding** (`app/onboarding/`).
- **Modal/stack screens**: `task/new`, `task/[id]`, `focus/session`, `blindfold`, `paywall`, `projects/`, `settings/`, `auth`. (`app/insights.tsx` no longer exists, it shipped with the Learning Engine and was removed with it.)
- **Portable core** (`core/`): pure, I/O-free logic — `scheduler/`, `blocking/` (`BlockingStrategy` + Soft/Native strategies, `getBlockingStrategy()`), `calendar/`, `recovery.ts`, `quick-add.ts`, `subscription.ts`, `task-logic.ts`, `dataExport.ts`, `id.ts`, `recurrence.ts`, `nightlyPass.ts`, `stakeAutoArm.ts`, `projects/`. (`core/learning/` and `core/ai-actions.ts` no longer exist, removed with the Learning Engine and the agentic project chat.)
- **Stores** (`store/`, Zustand + MMKV persist): `taskStore`, `listStore`, `settingsStore`, `scheduleStore`, `stakesStore`, `recoveryStore`, `proofStore`, `projectStore`, `syncStore`, `eventLogStore`. MMKV adapter in `store/mmkv.ts`, migrations in `store/migrations/`. (`learningStore`, `behavioralStore`, and `insightsStore` no longer exist.)
- **Services** (`services/`): `ai.ts` (thin client over the `ai-*` edge functions, auto-detected via `EXPO_PUBLIC_SUPABASE_URL`, with local fallbacks), `aiProjects.ts`, `supabase.ts` (auth incl. Apple/Google, full sync row mappers, SecureStore key hex-sanitization), `notifications.ts`, `voiceCapture.ts`, `calendarSync.ts`, `nightlyPass.ts`, `stakeScheduling.ts`.
- **Edge Functions** (`supabase/functions/`): `ai-breakdown`, `ai-simplify`, `ai-refine`, `ai-extract-tasks`, `ai-project-chat`, `ai-project-task`, `ai-verify-proof`, `send-auth-email`, `delete-account`; shared Gemini client in `_shared/gemini.ts` (calls `gemini-2.5-flash` generateContent, reads `GEMINI_API_KEY`, returns `200 { error: "no_key" }` when unset). No Express backend, it was removed.
- **Components** (`components/`): `ui/` primitives (Button, Card, Badge, TaskCard, FAB, Input, ProgressBar, EmptyState, TaskActionSheet, SkeletonLoader, PressableScale, GradientCard, Heading, Screen, etc.) plus feature folders: `home`, `calendar`, `schedule`, `projects`, `stakes`, `recovery`, `verification`, `task-editor`, `settings`, `focus`, `capture`. (`components/insights/` no longer exists.)
- **Native scaffolding** (`native/modules/ampora-ignition/`): isolated iOS Family Controls extensions plus config plugin, real Swift now (not a stub), wired only when `IGNITION_NATIVE` is on. Excluded from tsconfig.

## Rules

### Design system (`docs/02` — binding)
- **Never hardcode colors, radii, or spacing.** All values come from the canonical tokens (`docs/02` §10/§14: warm-neutral Zinc→Stone spine, canvas `#F7F6F3`, ink `#1C1917`; primary/success/warning/accent/red semantic ramps). Reference semantic aliases, not raw ramp steps or literals.
- **This rule is NOT yet enforced.** A fresh sweep on 2026-07-30 (`grep` for hex/`rgba()`/`hsla()` literals across `app/`, `components/`, `hooks/`) found 172 hardcoded color values across 36 files, down from the original ~377 across ~74 but real work remains, this is not close to zero. Tokenizing these is outstanding, not a finished migration, do not claim otherwise, and do not add new literals while touching a file that has them. Re-run the same sweep before trusting either number, it moves.
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
- **Never-lock categories** (spec calls for client + server enforcement, and in picker copy): phone, messages, maps, accessibility, OS settings, Ampora itself. Client-side enforcement is real (`core/blocking/limits.ts`, `store/stakesStore.ts`). Server-side enforcement does not exist yet, `supabase/migrations/` has no constraint or check behind the never-lock list, see `docs/CONFORMANCE.md` FR-40.
- Verification is three tiers only: honor, focus-time (automatic backbone, foreground-only timer), photo/screenshot (lenient AI plausibility check, private Proof Log, errs toward accepting). No shame copy on any failed or overridden verification.
- iOS Family Controls entitlement (`com.apple.developer.family-controls`) needs Apple approval per bundle ID and can take days-to-weeks.
- Scheduling is deterministic, recompute <300ms, calendar 60fps, churn-minimizing. Never silently drop an unschedulable task, explain why. The UI for this shipped this round (`app/(tabs)/tasks.tsx`, `components/schedule/UnschedulableFixSheet.tsx`), do not treat it as still missing.

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
