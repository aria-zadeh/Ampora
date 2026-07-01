# Ampora AI Edge Functions

Deno edge functions that back the AI features. Each wraps the Google **Gemini**
generateContent API (model `gemini-2.5-flash`) with a strict JSON-output prompt
(grounded in `docs/07_AI_Breakdown_Memory_and_Subtasks.md` and `docs/10_Projects.md`)
and returns validated JSON. Gemini is used because it has a free tier — the app's
paid subscription covers AI cost, so routine use stays cheap.

| Function           | Purpose                                                                   | Client call                       |
| ------------------ | ------------------------------------------------------------------------- | --------------------------------- |
| `ai-breakdown`     | task + optional source → `firstMove` + `subtasks[]`                        | `breakdownTask` (`services/ai.ts`)        |
| `ai-refine`        | prev breakdown + instruction → regenerated breakdown                      | `refineBreakdown` (`services/ai.ts`)      |
| `ai-simplify`      | one subtask → a 2-minute concrete `simplified` action                     | `simplifySubtask` (`services/ai.ts`)      |
| `ai-extract-tasks` | free-form text → `tasks[]` (`title`, `due?`, `durationMin?`, `priority?`) | `extractTasks` (`services/ai.ts`)         |
| `ai-project-chat`  | project state + message → assistant `text` (the study-plan planner chat)  | `projectChat` (`services/aiProjects.ts`)  |
| `ai-project-task`  | project state + `sessionMin` → next schedulable session task              | `generateNextTask` (`services/aiProjects.ts`) |

## The API key (required for live AI)

Every function reads `GEMINI_API_KEY` from its environment. **Until this secret
is set, each function returns `200 { "error": "no_key" }`** and the app degrades
to its local fallback (a warm generic breakdown, a "Just start:" simplify,
per-line quick-add extraction, a grounded templated project reply / next session).
Nothing crashes without a key.

Get a key from Google AI Studio (https://aistudio.google.com/apikey), then set the
secret one of two ways:

```bash
# CLI (from the repo root, with the Supabase CLI linked to the project):
supabase secrets set GEMINI_API_KEY=...
```

Or in the Supabase dashboard: **Project → Edge Functions → Manage secrets →**
add `GEMINI_API_KEY`.

The model is pinned via the `MODEL` const in `_shared/gemini.ts`
(`gemini-2.5-flash`).

## Deploy

```bash
supabase functions deploy ai-breakdown
supabase functions deploy ai-refine
supabase functions deploy ai-simplify
supabase functions deploy ai-extract-tasks
supabase functions deploy ai-project-chat
supabase functions deploy ai-project-task
```

## Local dev

```bash
supabase functions serve --env-file supabase/functions/.env
# put GEMINI_API_KEY=... in that .env (git-ignored) for local testing
```

## Contract notes

- All functions send permissive CORS headers (the app also runs on web).
- All soft failures (no key, bad model output, safety block, transport error)
  return a `200` with an `{ error: ... }` body rather than a non-2xx, so the
  client's single "fall back locally" path covers every case. The client never
  surfaces an AI failure to the UI.
- JSON functions request `responseMimeType: application/json` from Gemini and
  still defensively parse the body (`extractJson` tolerates fences/prose). The
  plain-text project chat calls `callGemini(..., { json: false })`.
- Shared helpers (CORS, the Gemini call, tolerant JSON extraction) live in
  `_shared/gemini.ts`.
- This folder is **excluded from the React Native `tsconfig.json`** — it is
  Deno code (uses `Deno.env`, remote imports) and must not be typechecked or
  bundled with the app.
