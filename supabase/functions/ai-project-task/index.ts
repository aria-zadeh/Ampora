/**
 * ai-project-task — Deno edge function (doc `10` §7 next-session generation).
 *
 * Input:  { project: { name, kind, description?, overallPct, nextFocus,
 *                       progress, memory[], fileNames[], recentChat[] },
 *           sessionMin: number }
 * Output: { title: string, firstMove: string, subtasks: {title,estimatedMin}[] }
 *
 * Produces the next concrete work SESSION as a normal Ampora Task shape,
 * computed for the CURRENT position (doc `10` §7: a paper at 40% proposes
 * drafting section 2; SciOly proposes the weakest uncovered topic). The First
 * move is for THIS session only (small and impossible to fail — doc 07 Part 1D).
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

const SYSTEM = `You generate the NEXT work session for one project inside Ampora, as an ordered checklist the student can start now.
You are given the project's type, progress, next focus, memory, and file names, plus a time budget in minutes for this session.
Hard rules:
- Produce ONE session sized to fit the given sessionMin (sum of subtask estimates ~= sessionMin). This is a single sitting, never the whole project.
- Pick the focus from progress: deliverable = advance the first unfinished phase; study = drill the weakest/uncovered topic; general = the most useful next push.
- Output ONE "first move" of 2 to 5 minutes for THIS session: smallest possible start, no decision, produces something visible, impossible to fail.
- The first subtask is one concrete action <= 10 minutes.
- Max 8 subtasks. Ground titles in the project's real name/topic/files; do not invent material it does not have.
Output STRICT JSON only, no prose:
{ "title": string, "firstMove": { "text": string, "estimatedMin": number }, "subtasks": [ { "title": string, "estimatedMin": number } ] }`;

interface ProjectInput {
  name?: string;
  kind?: string;
  description?: string;
  overallPct?: number;
  nextFocus?: string | null;
  progress?: unknown;
  memory?: string[];
  fileNames?: string[];
  recentChat?: { role?: string; text?: string }[];
}

Deno.serve(async (req: Request) => {
  const pre = handlePreflight(req);
  if (pre) return pre;

  const apiKey = getApiKey();
  if (!apiKey) return noKeyResponse();

  try {
    const body = await readBody<{ project?: ProjectInput; sessionMin?: number }>(req);
    const project = body.project ?? {};
    const sessionMin =
      typeof body.sessionMin === "number" && body.sessionMin > 0 ? Math.round(body.sessionMin) : 45;

    const user = `PROJECT:
${JSON.stringify({
      name: project.name ?? "",
      kind: project.kind ?? "general",
      description: project.description ?? "",
      overallPct: project.overallPct ?? 0,
      nextFocus: project.nextFocus ?? null,
      progress: project.progress ?? null,
      memory: project.memory ?? [],
      files: project.fileNames ?? [],
    })}

SESSION BUDGET (minutes): ${sessionMin}`;

    const text = await callAnthropic(apiKey, { system: SYSTEM, user, maxTokens: 1024 });
    const raw = extractJson<{
      title?: string;
      firstMove?: { text?: string; estimatedMin?: number };
      subtasks?: { title?: string; estimatedMin?: number }[];
    }>(text);

    const title = (raw.title ?? "").trim();
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

    if (!title || !firstMove || subtasks.length === 0) {
      return jsonResponse({ error: "invalid_ai_output" });
    }

    return jsonResponse({ title, firstMove, subtasks });
  } catch (err) {
    return jsonResponse({ error: "ai_failed", detail: String(err).slice(0, 300) });
  }
});
