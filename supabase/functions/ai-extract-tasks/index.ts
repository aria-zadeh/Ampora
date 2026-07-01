/**
 * ai-extract-tasks — Deno edge function (PRD FR-7/8).
 *
 * Input:  { text: string }   (a syllabus paste, a brain dump, a message)
 * Output: { tasks: { title: string, due?: number, durationMin?: number, priority?: number }[] }
 *
 * Extracts discrete actionable tasks from free-form text. `due` is epoch ms.
 * `priority` is 1=Low, 2=Medium, 3=High, 4=Urgent. Returns { error: "no_key" }
 * when the key is unset so the client falls back to the local quick-add parser.
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

const SYSTEM = `You extract discrete, actionable tasks from free-form text (a syllabus, an email, a brain dump).
Rules:
- One task per distinct thing to do. Do not merge or invent tasks.
- title: a short imperative task name.
- due: epoch milliseconds if the text states or clearly implies a deadline, else omit. Resolve relative dates against NOW.
- durationMin: integer minutes if a duration is stated or clearly implied, else omit.
- priority: 1=Low, 2=Medium, 3=High, 4=Urgent, only if signaled (words like "urgent", "important"), else omit.
- If the text contains no tasks, return an empty array.
Output STRICT JSON only: { "tasks": [ { "title": string, "due"?: number, "durationMin"?: number, "priority"?: number } ] }`;

Deno.serve(async (req: Request) => {
  const pre = handlePreflight(req);
  if (pre) return pre;

  const apiKey = getApiKey();
  if (!apiKey) return noKeyResponse();

  try {
    const body = await readBody<{ text?: string }>(req);
    const text = (body.text ?? "").trim();
    if (!text) return jsonResponse({ tasks: [] });

    const user = `NOW: ${Date.now()}
TEXT:
${text}`;

    const out = await callGemini(apiKey, { system: SYSTEM, user, maxTokens: 1500 });
    const raw = extractJson<{ tasks?: unknown[] } | unknown[]>(out);
    const list: unknown[] = Array.isArray(raw)
      ? raw
      : Array.isArray((raw as { tasks?: unknown[] }).tasks)
        ? (raw as { tasks: unknown[] }).tasks
        : [];

    const tasks = list
      .map((t) => {
        if (!t || typeof t !== "object") return null;
        const to = t as Record<string, unknown>;
        const title = typeof to.title === "string" ? to.title.trim() : "";
        if (!title) return null;
        const out: {
          title: string;
          due?: number;
          durationMin?: number;
          priority?: number;
        } = { title };
        if (typeof to.due === "number" && Number.isFinite(to.due)) out.due = to.due;
        if (typeof to.durationMin === "number" && Number.isFinite(to.durationMin)) {
          out.durationMin = Math.round(to.durationMin);
        }
        if (typeof to.priority === "number" && Number.isFinite(to.priority)) {
          out.priority = Math.max(1, Math.min(4, Math.round(to.priority)));
        }
        return out;
      })
      .filter((t) => t != null);

    return jsonResponse({ tasks });
  } catch (err) {
    return jsonResponse({ error: "ai_failed", detail: String(err).slice(0, 300) });
  }
});
