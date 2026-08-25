# Ampora AI Edge Functions

Deno edge functions that back the AI features. Each wraps the **Anthropic
Claude** Messages API (model `claude-opus-5`) with a strict JSON-output prompt
(grounded in `docs/03_AI_Breakdown_and_Subtasks.md` and `docs/06_Projects.md` —
the doc set was renumbered; see `CLAUDE.md`'s doc index for the current 11-file
set, nothing else exists) and returns validated JSON. The provider is Anthropic
rather than Google because Google's API terms require the developer/account
holder to be 18+, and Ampora's owner is a minor; the app's paid subscription
covers AI cost, so routine use stays affordable.

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

Two more functions in this directory are **not** part of the AI cluster above
and so are not Claude calls: `send-auth-email` (a Resend-backed Supabase Auth
"Send Email" hook, invoked internally by Supabase Auth, not by the client —
see that function's own header for its separate setup steps) and
`delete-account` (FR-87 account deletion, calls the Supabase Admin API with
the service-role key, invoked by `deleteAccount()` in `services/supabase.ts`).
Neither reads `ANTHROPIC_API_KEY` nor follows the no-key-fallback contract
below.

## The API key (required for live AI)

Every function reads `ANTHROPIC_API_KEY` from its environment. **Until this
secret is set, each function returns `200 { "error": "no_key" }`** and the app
degrades to its local fallback (a warm generic breakdown, a "Just start:"
simplify, per-line quick-add extraction, a grounded templated project reply /
next session). Nothing crashes without a key.

Get a key from the Anthropic Console (https://console.anthropic.com/settings/keys),
then set the secret one of two ways:

```bash
# CLI (from the repo root, with the Supabase CLI linked to the project):
supabase secrets set ANTHROPIC_API_KEY=...
```

Or in the Supabase dashboard: **Project → Edge Functions → Manage secrets →**
add `ANTHROPIC_API_KEY`.

The model is pinned via the `MODEL` const in `_shared/claude.ts`
(`claude-opus-5`) — an exact model id with no date suffix, do not substitute
a different model.

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
# put ANTHROPIC_API_KEY=... in that .env (git-ignored) for local testing
```

## Contract notes

- All functions send permissive CORS headers (the app also runs on web).
- All soft failures (no key, bad model output, safety refusal, transport/SDK
  error) return a `200` with an `{ error: ... }` body rather than a non-2xx,
  so the client's single "fall back locally" path covers every case. The
  client never surfaces an AI failure to the UI.
- Claude has no wire-level "respond with pure JSON" toggle the way some
  providers do (and structured outputs / assistant prefill are both out of
  scope for this call shape, prefill is rejected outright on this model), so
  every AI-cluster function enforces JSON purely through its own "Output
  STRICT JSON only" prompt instruction, then defensively parses the body
  (`extractJson` tolerates ```` ```json ```` fences and stray prose either
  side of the object).
- Every call uses adaptive thinking at low effort
  (`thinking: { type: "adaptive" }`, `output_config: { effort: "low" }`) —
  these are short structured-extraction calls, not open-ended reasoning, so
  low effort is the right cost/latency tradeoff.
- Shared helpers (CORS, the Claude call, tolerant JSON extraction) live in
  `_shared/claude.ts`, which imports the official SDK via the Deno `npm:`
  specifier (`npm:@anthropic-ai/sdk`) — never raw `fetch`. `send-auth-email`
  and `delete-account` do not import it (they are not Claude calls) and
  hand-roll their own minimal CORS/JSON response helpers instead.
- `send-auth-email` sets `verify_jwt = false` (Supabase Auth calls it
  internally, not an authenticated end user). Every other function — INCLUDING
  `delete-account` — relies on the platform default (`verify_jwt = true`); do
  not disable JWT verification on `delete-account`, its safety depends on the
  platform rejecting an unauthenticated request before the code even runs
  (see that function's own header comment).
- This folder is **excluded from the React Native `tsconfig.json`** — it is
  Deno code (uses `Deno.env`, an `npm:` specifier import) and must not be
  typechecked or bundled with the app.
