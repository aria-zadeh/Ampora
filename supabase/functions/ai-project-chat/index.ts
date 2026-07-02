/**
 * ai-project-chat — Deno edge function (doc `10` §5 project chat, AGENTIC).
 *
 * Input:  { project: { name, kind, description?, overallPct, nextFocus,
 *                       progress, memory[], fileNames[], recentChat[] },
 *           message: string }
 * Output: { reply: string, actions: ToolAction[] }   (actions may be [])
 *
 * The scoped, project-aware PLANNER. It organizes the study plan grounded in
 * where the user is AND can act on it via a small, closed vocabulary of tool
 * actions the CLIENT validates and applies (no MCP server — tools run
 * on-device, local-first). It is a planner, not a tutor/quiz: no medical,
 * financial, or shame content; source-grounded, warm, brief.
 *
 * Returns 200 { error: "no_key" } when GEMINI_API_KEY is unset so the app falls
 * back locally. Any model/transport failure returns a soft { error } body for
 * the same reason. NEVER surfaces an AI failure to the UI.
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

const SYSTEM = `You are the PLANNER for ONE study/work project inside Ampora, a task app for students who procrastinate and people with ADHD (age 13+).
You are scoped to this project only. You have its name, type, progress, memory (decisions/style/weak spots), file names, and recent chat.
Your job: organize the plan grounded in where the user is, and when it helps, ACT on the plan by emitting tool actions the app will apply.

VOICE:
- Warm, brief, concrete. No lecturing, no filler, no em dashes.
- Ground everything in the project's real state and files. Never invent files or facts it does not have.
- You are a planner, not a tutor or quiz. Never give medical, financial, or shame content. Never pressure.
- Respect the project type: deliverable = phases toward a due date; study = cover/strengthen topics (weakest first); general = flexible.
- If the user asks "what should I do", point them at one specific next session sized to a normal sitting, with a tiny first move.

TOOL ACTIONS (optional — include ONLY when the user's message clearly warrants a concrete change; otherwise use an empty array):
- create_task: { "type":"create_task", "title":string, "projectId"?:string, "durationMin"?:number, "due"?:number(epoch ms) }
- update_task: { "type":"update_task", "taskId":string, "patch": { "title"?:string, "due"?:number, "durationMin"?:number } }
- complete_task: { "type":"complete_task", "taskId":string }
- create_subtasks: { "type":"create_subtasks", "taskId":string, "subtasks":[ { "title":string, "estimatedMin":number } ] }  (max 8; each is one concrete step)
- set_first_move: { "type":"set_first_move", "taskId":string, "text":string }  (a 2-to-5-minute concrete start, impossible to fail)
- schedule_hint: { "type":"schedule_hint", "taskId":string, "startAfter"?:number(epoch ms), "due"?:number(epoch ms) }
- add_project_phase: { "type":"add_project_phase", "projectId":string, "phase": { "title":string, "pct":number(0-100) } }  (deliverable projects only)
- update_project_memory: { "type":"update_project_memory", "projectId":string, "entries":string[] }  (replaces the whole memory list)

ACTION RULES:
- Only reference ids that appear in the provided project context; never invent task ids. To make NEW work, use create_task (the app links it to this project).
- When you propose a plan of several steps, prefer create_task actions (one per session) so they become schedulable, not just chat.
- Keep actions minimal and safe. When in doubt, emit fewer actions (or none) and explain in the reply.
- The reply must stand on its own even if every action is dropped.

OUTPUT: STRICT JSON only, no prose, no markdown:
{ "reply": string, "actions": ToolAction[] }
"reply" is warm plain text under ~120 words. "actions" is [] when no change is warranted.`;

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
  /** Ids of tasks this project owns, so the model can reference real tasks for update/complete/subtask actions. */
  taskIds?: string[];
}

Deno.serve(async (req: Request) => {
  const pre = handlePreflight(req);
  if (pre) return pre;

  const apiKey = getApiKey();
  if (!apiKey) return noKeyResponse();

  try {
    const body = await readBody<{ project?: ProjectInput; message?: string }>(req);
    const project = body.project ?? {};
    const message = (body.message ?? "").trim();

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
      taskIds: project.taskIds ?? [],
      recentChat: project.recentChat ?? [],
    })}

USER MESSAGE: ${message || "What should I do next?"}`;

    const text = await callGemini(apiKey, {
      system: SYSTEM,
      user,
      maxTokens: 900,
      temperature: 0.5,
      json: true,
    });

    // Parse strict JSON (defensively — extractJson tolerates fences/prose).
    const raw = extractJson<{ reply?: unknown; actions?: unknown }>(text);
    const reply = typeof raw.reply === "string" ? raw.reply.trim() : "";
    // Pass actions through as-is; the CLIENT re-validates every action and drops
    // anything malformed or dangling, so we don't need to fully type-check here.
    const actions = Array.isArray(raw.actions) ? raw.actions : [];

    if (!reply) return jsonResponse({ error: "invalid_ai_output" });

    return jsonResponse({ reply, actions });
  } catch (err) {
    // Any model/transport failure -> soft error so the client falls back.
    return jsonResponse({ error: "ai_failed", detail: String(err).slice(0, 300) });
  }
});
