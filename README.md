# Ampora

Auto-scheduling task and time-management app for students who procrastinate and people with ADHD (age 13+). It plans your week around how you actually behave, hands you a 2-minute first move so starting is easy, and lets you lock your own apps behind a task so blowing it off costs you now.

---

## Stack

- **Expo SDK 54** (new architecture) + **React Native 0.81** + **React 19**
- **Expo Router** (file-based, typed routes)
- **TypeScript** (strict)
- **NativeWind v4** + Tailwind (styling; `className` works on `Animated.View` via a registered `cssInterop`)
- **Zustand** + **react-native-mmkv** (local-first state and persistence)
- **Supabase** (magic-link auth, Postgres, Edge Functions)
- **Claude (Anthropic)** for AI features, via Supabase Edge Functions (with local fallbacks)
- **react-native-reanimated** + **react-native-gesture-handler** (motion, drag)
- **@shopify/flash-list** (virtualized lists)
- **expo-notifications**, **expo-haptics**, **expo-secure-store**, **expo-image**, **@expo-google-fonts/inter**

---

## Features (v1, built)

- **Task system** — task editor, quick-add (natural-language parse), lists, tags, priorities, subtask checklists, completed section with undo.
- **Scheduler** — on-device, deterministic auto-placement around busy blocks and quiet hours; learns from behavioral outcomes; recompute under 300ms.
- **Calendar** — Day / 3-Day / Week / Month / Agenda views, drag to reschedule, one consolidated block per session labeled "N steps".
- **AI breakdown** — Claude-powered first move (2–5 min) plus an ordered subtask checklist (max 8), source-grounded; graceful local fallback when no key is set.
- **Focus session** — session timer with breaks, **Blindfold** (distraction-free lock), and **verification** that you actually started or finished.
- **Ignition (soft-lock)** — self-imposed in-app app-locking with wellbeing caps, panic valve (60s), cooldowns, quiet hours with auto-release, and never-lock categories. Real OS-level locking is gated behind a feature flag (see below).
- **Learning engine** — Focus DNA, Revealed Self, and energy/state modeling from behavioral signals.
- **Recovery** — one-tap, guilt-free week rebuild after a lapse.
- **Notifications** — native scheduling plus web polling.
- **Projects** — first-class project hub, detail, chat, progress, and next-session flows.
- **Settings + subscription** — full settings, 2-week trial and paywall (IAP scaffolded).
- **Cloud sync** — local-first with background, last-write-wins Supabase reconciliation (schema applied).

---

## Setup

Requires Node 18+ and a Supabase project.

```bash
npm install
```

Create `.env` in the repo root:

```
EXPO_PUBLIC_SUPABASE_URL=your_supabase_url
EXPO_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
```

Start the app:

```bash
npx expo start
```

> iOS/Android on-device requires a **custom dev build** (`expo-dev-client` is installed), not Expo Go, because the app uses native modules (MMKV, secure store, notifications).

---

## Enabling real AI

The AI features (breakdown, simplify, refine, extract-tasks, project chat) run through Supabase Edge Functions and fall back to on-device templates when no key is configured, so the whole feature set works out of the box with no key.

To enable live Claude responses:

1. Set the secret in your Supabase project:
   ```bash
   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
   ```
2. Deploy the functions:
   ```bash
   supabase functions deploy ai-breakdown
   supabase functions deploy ai-simplify
   supabase functions deploy ai-refine
   supabase functions deploy ai-extract-tasks
   supabase functions deploy ai-project-chat
   supabase functions deploy ai-project-task
   ```

The client auto-detects the deployed functions via `EXPO_PUBLIC_SUPABASE_URL`. If the key is missing, each function returns `200 { error: "no_key" }` and the client uses its local fallback.

---

## Enabling native iOS Ignition (later)

By default Ignition uses the in-app **SoftBlockingStrategy** (works today on web and dev builds, no entitlement needed). To enable real OS-level app shielding via Apple **Family Controls**:

1. Request and obtain the **Family Controls (Distribution) entitlement** (`com.apple.developer.family-controls`) from Apple for every bundle ID (main app + extensions). This can take days to weeks.
2. Wire the native module and extensions in `native/ignition/` (see its README) and register `NativeBlockingStrategy`.
3. Flip `FEATURE_FLAGS.IGNITION_NATIVE` to `true` in `constants/featureFlags.ts`.

`getBlockingStrategy()` returns the native strategy only when the flag is on and the platform supports it; otherwise it always returns the soft strategy.

---

## Web preview and deploy

```bash
npx expo start --web
```

The project ships a `vercel.json` (build: `npx expo export -p web`, output: `dist`, SPA rewrites), so it deploys to **Vercel** as a static web export. App-locking has no effect on web.

---

## Project structure

```
app/            # Expo Router screens (tabs, onboarding, task, focus, projects, settings, paywall, blindfold, insights)
components/     # UI primitives + feature components (home, calendar, schedule, projects, stakes, recovery, verification, task-editor, insights)
core/           # Portable logic: scheduler, blocking strategies, calendar, learning, recovery, quick-add, subscription, task-logic
services/       # ai, aiProjects, supabase, notifications
store/          # Zustand + MMKV stores (task, list, settings, schedule, session, stakes, learning, behavioral, recovery, proof, project, sync, insights)
utils/          # design-tokens, motion, audioConfig
supabase/       # Edge Functions (ai-*) + shared Anthropic client
native/         # Isolated iOS Family Controls scaffolding (excluded from tsconfig)
docs/           # PRD, design system, and deep specs
```

---

## Docs

- `docs/01_PRD.md` — product spec (source of truth) and v1 build status
- `docs/02_Design_System.md` — tokens, palette, components, motion, accessibility
- `docs/05_Build_Roadmap_and_Project_Setup.md` — build order
- `docs/06`–`docs/10` — app-blocking, AI breakdown/memory, MCP + API + portable engine, verification, projects
- `CLAUDE.md` — architecture and working conventions
