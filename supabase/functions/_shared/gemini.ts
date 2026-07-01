/**
 * Shared helpers for Ampora's AI edge functions (Deno runtime).
 *
 * Every edge function follows the same contract:
 *  - Reads GEMINI_API_KEY from the environment. If missing, the caller returns
 *    200 with { error: "no_key" } so the app falls back locally.
 *  - Calls the Google Gemini generateContent REST API with a strict JSON-output
 *    prompt (model "gemini-2.5-flash").
 *  - Parses/validates the JSON before returning it.
 *  - Always sends CORS headers (the app runs on web too).
 *
 * AI provider = Google Gemini (free tier for now). The key is a Supabase Edge
 * Function secret (`GEMINI_API_KEY`); it is never shipped in the client.
 *
 * This file is Deno-only (uses Deno.env, remote fetch). It is intentionally
 * OUTSIDE the React Native tsconfig include set (see supabase/functions/README).
 */

/** Model id for all breakdown/extraction/chat calls. */
export const MODEL = "gemini-2.5-flash";

/** Gemini generateContent REST endpoint (v1beta). Key is passed as ?key=. */
const GEMINI_ENDPOINT =
  `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

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

/** Read GEMINI_API_KEY from the environment, or null when unset/blank. */
export function getApiKey(): string | null {
  const key = Deno.env.get("GEMINI_API_KEY");
  return key && key.trim().length > 0 ? key : null;
}

interface GeminiOptions {
  system: string;
  user: string;
  maxTokens?: number;
  temperature?: number;
  /**
   * When true (default), ask Gemini for `application/json` responses so the
   * body is pure JSON. Chat-style plain-text callers pass false.
   */
  json?: boolean;
}

/**
 * Call the Gemini generateContent API and return the concatenated text content.
 * Throws on any non-2xx, transport error, safety block, or empty output so the
 * caller can fall back gracefully.
 *
 * The `system` prompt is sent via `systemInstruction`; the `user` prompt is the
 * single user turn. When `json` is true we set `responseMimeType` to
 * `application/json` so Gemini returns strict JSON (still defensively parsed by
 * `extractJson`).
 */
export async function callGemini(
  apiKey: string,
  { system, user, maxTokens = 1024, temperature = 0.4, json = true }: GeminiOptions,
): Promise<string> {
  const generationConfig: Record<string, unknown> = {
    temperature,
    maxOutputTokens: maxTokens,
  };
  if (json) generationConfig.responseMimeType = "application/json";

  const res = await fetch(`${GEMINI_ENDPOINT}?key=${encodeURIComponent(apiKey)}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text: user }] }],
      generationConfig,
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`gemini ${res.status}: ${detail.slice(0, 500)}`);
  }

  const data = await res.json();

  // A prompt/response blocked by safety filters has no candidate content.
  const blockReason = data?.promptFeedback?.blockReason;
  if (blockReason) throw new Error(`gemini blocked: ${blockReason}`);

  const candidate = Array.isArray(data?.candidates) ? data.candidates[0] : null;
  const parts = candidate?.content?.parts;
  const text = Array.isArray(parts)
    ? parts
        .map((p: { text?: string }) => (typeof p?.text === "string" ? p.text : ""))
        .join("")
        .trim()
    : "";

  if (!text) throw new Error("gemini: empty response");
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
