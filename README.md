# Ampora

ADHD task and time management app for high school students. Built for the MIT CREATe Challenge (Team 495).

**Live:** _TODO: add Ampora deployment URL_

---

## Stack

- React Native + Expo SDK 54
- NativeWind v4 (Tailwind styling on native)
- Expo Router (file-based navigation)
- Zustand + AsyncStorage (local-first, background Supabase sync)
- Supabase (magic link auth, Postgres, Edge Functions)
- Gemini 2.5 Flash (AI features via Supabase Edge Functions)
- expo-notifications + Web Notifications API
- react-native-reanimated + gesture-handler
- Vercel (web, auto-deploy from main)

---

## Features

**Tasks**
- Task creation with due dates and optional start times
- AI subtask breakdown via Gemini 2.5 Flash
- Paste syllabus or assignment text → AI extracts deadlines
- One-tap reschedule for overdue tasks
- Completed tasks section with 5-second undo

**Calendar**
- 3-day sliding window with drag-to-reschedule (15-min snap)
- Tasks with subtasks render as a single consolidated block
- All-day pills, proposed blocks (dashed), manual events (gray)
- Month view via react-native-calendars

**Scheduling**
- Auto-scheduler places tasks around busy blocks on creation
- Slot scoring: energy peaks, 15-min break buffers, completion history signals
- Daily recalculation on app open (1hr throttle)
- Push notification 15 min before scheduled optimal window

**Focus Mode**
- Session timer with break system (Resume/Skip)
- 4 ambient audio tracks with volume control

**Auth & Settings**
- Magic link auth (Supabase), guest mode
- Light/Dark/System dark mode
- Quiet hours, max notifications, focus audio — all configurable

---

## Setup

Requires Node 18+, Expo CLI, and a Supabase project.

```bash
git clone https://github.com/aria-zadeh/ampora.git
cd ampora
npm install
```

Create `.env` in the root:

```
EXPO_PUBLIC_SUPABASE_URL=your_supabase_url
EXPO_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
```

```bash
npx expo start
```

For AI features, deploy the Edge Functions and set `GEMINI_API_KEY` in Supabase dashboard (Settings → Edge Functions → Secrets):

```bash
supabase functions deploy ai-breakdown
supabase functions deploy ai-simplify
supabase functions deploy ai-extract-dates
```

---

## Project structure

```
app/               # Expo Router screens (tabs, modals, onboarding)
components/        # Shared UI components
services/          # AI client, Supabase client, notifications, scheduler
store/             # Zustand stores (tasks, settings, focus)
utils/             # Design tokens, audio config, helpers
backend/           # Edge Function source (Deno)
public/            # Service worker + PWA manifest (web only)
types/             # Shared TypeScript types
```

---

## References

UI design referenced [Open SaaS](https://github.com/wasp-lang/open-saas) as a template.

---

## Team

Saketh Baddam, Aria Zadeh, Srihith Chennareddy, Shayan Mohammad-Rafiee
MIT CREATe Challenge 2025–2026 | Team 495
