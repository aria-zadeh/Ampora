/**
 * ai-simplify — Deno edge function (doc 07 Part 1B.4 first-move rules).
 *
 * Input:  { subtask: { title: string } }
 * Output: { simplified: string }
 *
 * Shrinks a single subtask into the smallest possible concrete start (a 2-minute
 * action, no decision, impossible to fail). Returns { error: "no_key" } when the
 * key is unset so the client falls back to a local "Just start:" nudge.
 */

import {
  callGemini,
  extractJson,
  getApiKey,
  handlePreflight,
  jsonResponse,
  noKeyResponse,
  readBody,
} from "../_shared/gemini.ts";

const SYSTEM = `You make one task step feel impossible to avoid by shrinking it to the smallest concrete start.
Rules:
- Rewrite the step as ONE physical action that takes about 2 minutes.
- No decisions, no ambiguity, produces something visible, basically impossible to fail.
- Keep the same intent; just make starting trivially easy (e.g. "Write the intro" -> "Open the doc and type one sentence").
Output STRICT JSON only: { "simplified": string }`;

Deno.serve(async (req: Request) => {
  const pre = handlePreflight(req);
  if (pre) return pre;

  const apiKey = getApiKey();
  if (!apiKey) return noKeyResponse();

  try {
    const body = await readBody<{ subtask?: { title?: string } }>(req);
    const title = (body.subtask?.title ?? "").trim();
    if (!title) return jsonResponse({ error: "invalid_input" });

    const user = `STEP: ${title}`;
    const text = await callGemini(apiKey, {
      system: SYSTEM,
      user,
      maxTokens: 256,
      temperature: 0.3,
    });
    const raw = extractJson<{ simplified?: string }>(text);
    const simplified = (raw.simplified ?? "").trim();
    if (!simplified) return jsonResponse({ error: "invalid_ai_output" });

    return jsonResponse({ simplified });
  } catch (err) {
    return jsonResponse({ error: "ai_failed", detail: String(err).slice(0, 300) });
  }
});
