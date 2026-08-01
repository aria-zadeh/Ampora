# Ampora AI Edge Functions

Deno edge functions that back the AI features. Each wraps the Google **Gemini**
generateContent API (model `gemini-2.5-flash`) with a strict JSON-output prompt
(grounded in `docs/03_AI_Breakdown_and_Subtasks.md` and `docs/06_Projects.md` —
the doc set was renumbered; see `CLAUDE.md`'s doc index for the current 11-file
set, nothing else exists) and returns validated JSON. Gemini is used because it
has a free tier — the app's paid subscription covers AI cost, so routine use
stays cheap.

| Function            | Purpose                                                                   | Client call                                |
| ------------------- | -------------------------------------------------------------------------- | ------------------------------------------- |
| `ai-breakdown`      | task + optional source → `firstMove` + `subtasks[]`                        | `breakdownTask` (`services/ai.ts`)          |
| `ai-refine`         | prev breakdown + instruction → regenerated breakdown                      | `refineBreakdown` (`services/ai.ts`)        |
| `ai-simplify`       | one subtask → a 2-minute concrete `simplified` action                     | `simplifySubtask` (`services/ai.ts`)        |
| `ai-extract-tasks`  | free-form text → `tasks[]` (`title`, `due?`, `durationMin?`, `priority?`)  | `extractTasks` (`services/ai.ts`)           |
| `ai-project-task`   | project state (title/kind/contextLine/percent/currentPhase/phases/lastOutcome) + `sessionMin` → next schedulable session task | `generateNextTask` (`services/aiProjects.ts`) |
| `ai-verify-proof`   | task title + proof description → lenient `pass`/`uncertain` verdict       | `checkProofPlausibility` (`services/ai.ts`) |

`ai-project-chat` (the study-plan planner chat, and the client function
`projectChat`) does **not exist** — it was cut with the rest of the agentic
project chat / file library (`V2_Changes.md` §6; see `CLAUDE.md`'s "Being
deleted" list). It was still listed here until this pass; if you are looking
for it, you want `ai-project-task` (nightly session generation, FR-84), which
is a different, still-shipping feature.

Two more functions in this directory are **not** part of the Gemini/AI
cluster above and so are not Gemini calls: `send-auth-email` (a Resend-backed
Supabase Auth "Send Email" hook, invoked internally by Supabase Auth, not by
the client — see that function's own header for its separate setup steps)
and `delete-account` (FR-87 account deletion, calls the Supabase Admin API
with the service-role key, invoked by `deleteAccount()` in
`services/supabase.ts`). Neither reads `GEMINI_API_KEY` or follows the
no-key-fallback contract below.

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
supabase functions deploy ai-project-task
supabase functions deploy ai-verify-proof
supabase functions deploy send-auth-email
supabase functions deploy delete-account
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
- Every Gemini-cluster function above requests `responseMimeType:
  application/json` from Gemini (`callGemini`'s `json` option defaults to
  `true`) and still defensively parses the body (`extractJson` tolerates
  fences/prose). Nothing currently calls `callGemini(..., { json: false })` —
  that plain-text mode exists for a future non-JSON caller, not a live one.
- Shared helpers (CORS, the Gemini call, tolerant JSON extraction) live in
  `_shared/gemini.ts`. `send-auth-email` and `delete-account` do not import
  it (they are not Gemini calls) and hand-roll their own minimal CORS/JSON
  response helpers instead.
- `send-auth-email` sets `verify_jwt = false` (Supabase Auth calls it
  internally, not an authenticated end user). Every other function — INCLUDING
  `delete-account` — relies on the platform default (`verify_jwt = true`); do
  not disable JWT verification on `delete-account`, its safety depends on the
  platform rejecting an unauthenticated request before the code even runs
  (see that function's own header comment).
- This folder is **excluded from the React Native `tsconfig.json`** — it is
  Deno code (uses `Deno.env`, remote imports) and must not be typechecked or
  bundled with the app.
