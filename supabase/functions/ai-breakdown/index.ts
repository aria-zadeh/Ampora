/**
 * ai-breakdown — Deno edge function.
 *
 * Input:  { task: { title, notes?, durationMin?, dueAt?, hoursUntilDue?, energyRequired? },
 *           source?: string }
 * Output: { firstMove: string, subtasks: { title, estimatedMin }[], taskTypeKey?: string }
 *
 * Grounded per doc 07 Part 1.5/1B: first move 2-5 min, first subtask <= 10 min,
 * deadline-aware granularity, max 8 subtasks, derive from SOURCE when provided.
 * Returns 200 { error: "no_key" } when ANTHROPIC_API_KEY is unset so the app
 * falls back locally.
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

const SYSTEM = `You break a student task into an ordered checklist they can actually start.
Hard rules:
- The FIRST subtask is one concrete physical action that takes <= 10 minutes (e.g. "open a doc and write one sentence stating your thesis", never "start the essay").
- Also output ONE "first move" of 2 to 5 minutes: the smallest possible start, requires no decision, produces something visible, basically impossible to fail.
- If a deadline is more than 24h away: 1 to 3 starter subtasks <= 10 min each, plus larger subtasks of 15 to 30 min for the rest.
- If the deadline is within 24h: only short subtasks of 5 to 10 min, no large blocks, minimum-viable, highest-impact first.
- Max 8 subtasks total.
- If SOURCE is provided, derive steps from its real requirements, numbered steps, or rubric criteria. Do not invent steps the source does not imply.
- Subtasks are an ordered sequence.
Output STRICT JSON only, no prose, matching:
{ "taskTypeKey": string, "firstMove": { "text": string, "estimatedMin": number }, "subtasks": [ { "title": string, "estimatedMin": number } ] }`;

interface TaskInput {
  title?: string;
  notes?: string;
  durationMin?: number;
  dueAt?: number;
  hoursUntilDue?: number;
  energyRequired?: string;
}

Deno.serve(async (req: Request) => {
  const pre = handlePreflight(req);
  if (pre) return pre;

  const apiKey = getApiKey();
  if (!apiKey) return noKeyResponse();

  try {
    const body = await readBody<{ task?: TaskInput; source?: string }>(req);
    const task = body.task ?? {};
    const source = body.source && body.source !== "none" ? body.source : "none";

    const user = `CONTEXT:
TASK: ${JSON.stringify({
      title: task.title ?? "",
      notes: task.notes ?? "",
      durationMin: task.durationMin ?? null,
      dueAt: task.dueAt ?? null,
      hoursUntilDue: task.hoursUntilDue ?? null,
      energyRequired: task.energyRequired ?? null,
    })}
SOURCE: ${source}`;

    const text = await callAnthropic(apiKey, { system: SYSTEM, user, maxTokens: 1024 });
    const raw = extractJson<{
      taskTypeKey?: string;
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

    return jsonResponse({ firstMove, subtasks, taskTypeKey: raw.taskTypeKey ?? null });
  } catch (err) {
    // Any model/parse failure -> soft error so the client falls back.
    return jsonResponse({ error: "ai_failed", detail: String(err).slice(0, 300) });
  }
});
