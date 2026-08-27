/**
 * Shared helpers for Ampora's AI edge functions (Deno runtime).
 *
 * Every edge function follows the same contract:
 *  - Reads ANTHROPIC_API_KEY from the environment. If missing, the caller
 *    returns 200 with { error: "no_key" } so the app falls back locally.
 *  - Calls the Claude Messages API with a strict JSON-output prompt (model
 *    "claude-sonnet-5") via the official Anthropic SDK.
 *  - Parses/validates the JSON before returning it.
 *  - Always sends CORS headers (the app runs on web too).
 *
 * AI provider = Anthropic Claude. The key is a Supabase Edge Function secret
 * (`ANTHROPIC_API_KEY`); it is never shipped in the client. Moved off the
 * previous provider because its API terms required an 18+ account holder,
 * and Ampora's owner is a minor.
 *
 * This file is Deno-only (uses Deno.env, an `npm:` specifier import). It is
 * intentionally OUTSIDE the React Native tsconfig include set (see
 * supabase/functions/README).
 */

import Anthropic from "npm:@anthropic-ai/sdk";

/**
 * Model id for all breakdown/extraction/chat calls. Exact string, no date
 * suffix appended.
 *
 * Sonnet, on every function, by owner decision (2026-08-24, logged in
 * `docs/09_Decisions.md`). Not a cost accident and not a default to drift off:
 * Opus is not to be used here at any point, and neither is Haiku. If a future
 * change needs a different tier, it needs Aria's say-so first. Sonnet 4.6
 * (`claude-sonnet-4-6`) is the only sanctioned alternative.
 *
 * The request shape below is identical across the Sonnet 5 and Opus families,
 * so this is a one-line swap either way: adaptive thinking, effort in
 * `output_config`, and no `budget_tokens`, `temperature`, or assistant prefill
 * (all three are rejected with a 400 on this model).
 */
export const MODEL = "claude-sonnet-5";

export const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

/** JSON response with CORS headers attached. */
export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

/** The 200 + no_key body the client treats as "fall back locally". */
export function noKeyResponse(): Response {
  return jsonResponse({ error: "no_key" });
}

/** Handle a CORS preflight, returns a Response or null if not a preflight. */
export function handlePreflight(req: Request): Response | null {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }
  return null;
}

/** Read ANTHROPIC_API_KEY from the environment, or null when unset/blank. */
export function getApiKey(): string | null {
  const key = Deno.env.get("ANTHROPIC_API_KEY");
  return key && key.trim().length > 0 ? key : null;
}

interface ClaudeOptions {
  system: string;
  user: string;
}

/**
 * Call the Claude Messages API and return the concatenated text content.
 * Throws on any SDK error, a refusal stop reason, or empty output, so the
 * caller can fall back gracefully — same throw-to-fall-back contract this
 * helper has always had.
 *
 * The `system` prompt is sent via the top-level `system` param, `user` is the
 * single user turn. Every caller here is a short structured-extraction call
 * (break a task into steps, extract tasks from text, a lenient plausibility
 * check), never open-ended reasoning, so adaptive thinking at low effort is
 * the right depth/cost tradeoff for all of them.
 *
 * Claude has no wire-level "respond with pure JSON" toggle short of
 * structured outputs or assistant prefill, both out of scope for this
 * migration (prefill is flatly rejected on this model). JSON-only output is
 * enforced purely by the "Output STRICT JSON only" instruction already
 * present in every caller's SYSTEM prompt, unchanged by this transport swap.
 */
export async function callClaude(
  apiKey: string,
  { system, user }: ClaudeOptions,
): Promise<string> {
  const client = new Anthropic({ apiKey });

  let response: Anthropic.Message;
  try {
    response = await client.messages.create({
      model: MODEL,
      max_tokens: 16000,
      thinking: { type: "adaptive" },
      output_config: { effort: "low" },
      system,
      messages: [{ role: "user", content: user }],
    });
  } catch (err) {
    // Typed SDK classes only, never string-matching on err.message. Every
    // branch rethrows a plain Error so each function's existing catch block
    // (untouched by this migration) still funnels into its 200 fallback,
    // same as a failed provider call always has.
    if (err instanceof Anthropic.BadRequestError) {
      throw new Error(`claude bad_request: ${err.message}`);
    }
    if (err instanceof Anthropic.AuthenticationError) {
      throw new Error(`claude auth: ${err.message}`);
    }
    if (err instanceof Anthropic.PermissionDeniedError) {
      throw new Error(`claude permission: ${err.message}`);
    }
    if (err instanceof Anthropic.NotFoundError) {
      throw new Error(`claude not_found: ${err.message}`);
    }
    if (err instanceof Anthropic.RateLimitError) {
      throw new Error(`claude rate_limit: ${err.message}`);
    }
    if (err instanceof Anthropic.APIConnectionError) {
      throw new Error(`claude connection: ${err.message}`);
    }
    if (err instanceof Anthropic.APIError) {
      throw new Error(`claude ${err.status ?? "error"}: ${err.message}`);
    }
    throw err;
  }

  // A safety refusal has no usable JSON in .content — same soft-fail handling
  // as any other blocked-generation case.
  if (response.stop_reason === "refusal") {
    const category = response.stop_details?.category ?? "unknown";
    throw new Error(`claude refusal: ${category}`);
  }

  let text = "";
  for (const block of response.content) {
    if (block.type === "text") text += block.text;
  }
  text = text.trim();

  if (!text) throw new Error("claude: empty response");
  return text;
}

/**
 * Extract the first balanced JSON object or array from a model response, then
 * parse it. Tolerates ```json fences and leading/trailing prose even though the
 * prompt asks for pure JSON. Throws if nothing parseable is found.
 */
export function extractJson<T = unknown>(text: string): T {
  // Strip code fences first.
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text;

  const trimmed = candidate.trim();
  // Fast path: the whole thing is JSON.
  try {
    return JSON.parse(trimmed) as T;
  } catch {
    // fall through to bracket scan
  }

  // Scan for the first balanced { } or [ ] region.
  const start = trimmed.search(/[[{]/);
  if (start === -1) throw new Error("no JSON found in model output");
  const open = trimmed[start];
  const close = open === "{" ? "}" : "]";
  let depth = 0;
  let inStr = false;
  let escaped = false;
  for (let i = start; i < trimmed.length; i++) {
    const ch = trimmed[i];
    if (inStr) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === open) depth++;
    else if (ch === close) {
      depth--;
      if (depth === 0) {
        return JSON.parse(trimmed.slice(start, i + 1)) as T;
      }
    }
  }
  throw new Error("unbalanced JSON in model output");
}

/** Read + JSON-parse a request body, tolerating an empty body. */
export async function readBody<T = Record<string, unknown>>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    return {} as T;
  }
}
