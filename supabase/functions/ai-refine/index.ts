/**
 * ai-refine — Deno edge function (doc 07 §1.7).
 *
 * Input:  { prev: { firstMove: string, subtasks: {title,estimatedMin}[] },
 *           instruction: string, source?: string }
 * Output: { firstMove: string, subtasks: {title,estimatedMin}[] }
 *
 * Regenerates a prior breakdown per a natural-language instruction
 * ("break it down by function", "step 3 is too big, split it"). Keeps the same
 * hard rules as ai-breakdown. Returns { error: "no_key" } when the key is unset.
 */

import {
  callAnthropic,
  extractJson,
  getApiKey,
  handlePreflight,
  jsonResponse,
  noKeyResponse,
  readBody,
} from "../_shared/anthropic.ts";

const SYSTEM = `You revise an existing task breakdown according to the user's instruction.
Keep it an ordered checklist they can actually start. Hard rules:
- Exactly ONE "first move" of 2 to 5 minutes: smallest possible start, no decision, impossible to fail.
- The first subtask is one concrete action <= 10 minutes.
- Max 8 subtasks total.
- Honor the user's INSTRUCTION (e.g. "break down by function", "split step 3", "fewer bigger steps", "follow the rubric").
- If SOURCE is provided, stay grounded in it; do not invent steps it does not imply.
- Preserve the parts of PREV the instruction does not ask to change.
Output STRICT JSON only, no prose:
{ "firstMove": { "text": string, "estimatedMin": number }, "subtasks": [ { "title": string, "estimatedMin": number } ] }`;

interface PrevInput {
  firstMove?: string;
  subtasks?: { title?: string; estimatedMin?: number }[];
}

Deno.serve(async (req: Request) => {
  const pre = handlePreflight(req);
  if (pre) return pre;

  const apiKey = getApiKey();
  if (!apiKey) return noKeyResponse();

  try {
    const body = await readBody<{ prev?: PrevInput; instruction?: string; source?: string }>(req);
    const prev = body.prev ?? {};
    const instruction = (body.instruction ?? "").trim();
    const source = body.source && body.source !== "none" ? body.source : "none";

    const user = `CONTEXT:
PREV: ${JSON.stringify({ firstMove: prev.firstMove ?? "", subtasks: prev.subtasks ?? [] })}
INSTRUCTION: ${instruction || "improve this breakdown"}
SOURCE: ${source}`;

    const text = await callAnthropic(apiKey, { system: SYSTEM, user, maxTokens: 1024 });
    const raw = extractJson<{
      firstMove?: { text?: string; estimatedMin?: number };
      subtasks?: { title?: string; estimatedMin?: number }[];
    }>(text);

    const firstMove = (raw.firstMove?.text ?? "").trim();
    const subtasks = (raw.subtasks ?? [])
      .map((s) => ({
        title: (s.title ?? "").trim(),
        estimatedMin:
          typeof s.estimatedMin === "number" && s.estimatedMin > 0
            ? Math.round(s.estimatedMin)
            : 15,
      }))
      .filter((s) => s.title.length > 0)
      .slice(0, 8);

    if (!firstMove || subtasks.length === 0) {
      return jsonResponse({ error: "invalid_ai_output" });
    }

    return jsonResponse({ firstMove, subtasks });
  } catch (err) {
    return jsonResponse({ error: "ai_failed", detail: String(err).slice(0, 300) });
  }
});
