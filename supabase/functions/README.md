# Ampora AI Edge Functions

Deno edge functions that back the AI features. Each wraps the Anthropic
Messages API with a strict JSON-output prompt (grounded in
`docs/07_AI_Breakdown_Memory_and_Subtasks.md`) and returns validated JSON.

| Function           | Purpose                                                        | Client call (`services/ai.ts`) |
| ------------------ | ------------------------------------------------------------- | ------------------------------ |
| `ai-breakdown`     | task + optional source → `firstMove` + `subtasks[]`           | `breakdownTask`                |
| `ai-refine`        | prev breakdown + instruction → regenerated breakdown          | `refineBreakdown`              |
| `ai-simplify`      | one subtask → a 2-minute concrete `simplified` action         | `simplifySubtask`              |
| `ai-extract-tasks` | free-form text → `tasks[]` (`title`, `due?`, `durationMin?`, `priority?`) | `extractTasks`      |

## The API key (required for live AI)

Every function reads `ANTHROPIC_API_KEY` from its environment. **Until this
secret is set, each function returns `200 { "error": "no_key" }`** and the app
degrades to its local fallback (a warm generic breakdown, a "Just start:"
simplify, per-line quick-add extraction). Nothing crashes without a key.

Set the secret one of two ways:

```bash
# CLI (from the repo root, with the Supabase CLI linked to the project):
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
```

Or in the Supabase dashboard: **Project → Edge Functions → Manage secrets →**
add `ANTHROPIC_API_KEY`.

The model is pinned via the `MODEL` const in `_shared/anthropic.ts`
(`claude-sonnet-5`).

## Deploy

```bash
supabase functions deploy ai-breakdown
supabase functions deploy ai-refine
supabase functions deploy ai-simplify
supabase functions deploy ai-extract-tasks
```

## Local dev

```bash
supabase functions serve --env-file supabase/functions/.env
# put ANTHROPIC_API_KEY=... in that .env (git-ignored) for local testing
```

## Contract notes

- All functions send permissive CORS headers (the app also runs on web).
- All soft failures (no key, bad model output, transport error) return a
  `200` with an `{ error: ... }` body rather than a non-2xx, so the client's
  single "fall back locally" path covers every case.
- Shared helpers (CORS, the Anthropic call, tolerant JSON extraction) live in
  `_shared/anthropic.ts`.
- This folder is **excluded from the React Native `tsconfig.json`** — it is
  Deno code (uses `Deno.env`, remote imports) and must not be typechecked or
  bundled with the app.
