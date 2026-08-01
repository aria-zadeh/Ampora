/**
 * ai-project-task — Deno edge function (doc `06` §4 "Session generation",
 * PRD FR-84).
 *
 * Input:  { project: { title, kind, contextLine, percent,
 *                       currentPhase: { title, order } | null,
 *                       phases: { title, done, order }[],
 *                       lastOutcome: 'done'|'keep_going'|'stop_here'|null },
 *           sessionMin: number }
 * Output: { title: string, firstMove: string, subtasks: {title,estimatedMin}[] }
 *
 * Produces the next concrete work SESSION as a normal Ampora Task shape,
 * computed for the CURRENT phase, the context line, the last session's
 * outcome, and the session budget (FR-84's exact four inputs) — never the
 * whole project. The First move is for THIS session only (small and
 * impossible to fail — doc `03`). Returns 200 { error: "no_key" } when
 * GEMINI_API_KEY is unset so the app falls back locally.
 *
 * This input shape MUST mirror `services/aiProjects.ts#projectPayload`
 * exactly — that is the only client that calls this function. A prior
 * version of this file read `name`/`description`/`overallPct`/`nextFocus`/
 * `progress`/`memory`/`fileNames`/`recentChat`, none of which the current
 * client sends (those belonged to the cut agentic project-chat/file-library
 * model, V2_Changes.md §6) — every field silently read as `undefined`, so
 * once a GEMINI_API_KEY is set this would have generated UNGROUNDED session
 * content instead of a "no_key" fallback or a visible error. Fixed as part
 * of the account-layer task's supabase/functions/ rot sweep.
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

const SYSTEM = `You generate the NEXT work session for one project inside Ampora, as an ordered checklist the student can start now.
You are given the project's title, kind, one-line context, percent complete, current phase, the full phase list, the last session's check-in outcome, and a time budget in minutes for this session.
Hard rules:
- Produce ONE session sized to fit the given sessionMin (sum of subtask estimates ~= sessionMin). This is a single sitting, never the whole project.
- Focus on the CURRENT phase given. If none is given (no open phase — nothing planned yet, or everything already done), propose the single most useful next push toward the project's title/context.
- lastOutcome shapes tone, not content: "keep_going" means continue the same phase after a break; "stop_here" means pick back up where a prior session left off; null/"done" means a fresh start on the current phase.
- Output ONE "first move" of 2 to 5 minutes for THIS session: smallest possible start, no decision, produces something visible, impossible to fail.
- The first subtask is one concrete action <= 10 minutes.
- Max 8 subtasks. Ground titles in the project's real title/context/current phase; do not invent material it does not have.
Output STRICT JSON only, no prose:
{ "title": string, "firstMove": { "text": string, "estimatedMin": number }, "subtasks": [ { "title": string, "estimatedMin": number } ] }`;

interface ProjectPhaseInput {
  title?: string;
  done?: boolean;
  order?: number;
}

interface ProjectInput {
  title?: string;
  kind?: string;
  contextLine?: string;
  percent?: number;
  currentPhase?: { title?: string; order?: number } | null;
  phases?: ProjectPhaseInput[];
  lastOutcome?: "done" | "keep_going" | "stop_here" | null;
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
      title: project.title ?? "",
      kind: project.kind ?? "general",
      contextLine: project.contextLine ?? "",
      percent: project.percent ?? 0,
      currentPhase: project.currentPhase ?? null,
      phases: project.phases ?? [],
      lastOutcome: project.lastOutcome ?? null,
    })}

SESSION BUDGET (minutes): ${sessionMin}`;

    const text = await callGemini(apiKey, { system: SYSTEM, user, maxTokens: 1024 });
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
