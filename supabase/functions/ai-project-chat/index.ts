/**
 * ai-project-chat — Deno edge function (doc `10` §5 project chat).
 *
 * Input:  { project: { name, kind, description?, overallPct, nextFocus,
 *                       progress, memory[], fileNames[], recentChat[] },
 *           message: string }
 * Output: { text: string }
 *
 * The scoped, project-aware assistant. Answers from the project's state and
 * files (names + extracted context supplied by the client / retrieval layer),
 * grounded in where the user is. Returns 200 { error: "no_key" } when
 * GEMINI_API_KEY is unset so the app falls back locally.
 */

import {
  callGemini,
  getApiKey,
  handlePreflight,
  jsonResponse,
  noKeyResponse,
  readBody,
} from "../_shared/gemini.ts";

const SYSTEM = `You are the assistant for ONE study/work project inside Ampora, a task app for students who procrastinate and people with ADHD.
You are scoped to this project only. You have its name, type, progress, memory (decisions/style/weak spots), and file names.
Your job: answer the user's message helpfully and, above all, always point them at a small, concrete NEXT step grounded in where they are.
Rules:
- Be warm, brief, and concrete. No lecturing, no filler, no em dashes.
- Ground answers in the project's real state and files. Do not invent files or facts the project does not have.
- If the user asks "what should I do", propose one specific next session sized to a normal sitting, with a tiny first move.
- Respect the project type: deliverable = phases toward a due date, study = cover/strengthen topics (weakest first), general = flexible.
- If you lack the material to answer precisely, say so briefly and still give the best next step.
Output PLAIN TEXT only (no JSON, no markdown headers). Keep it under ~120 words.`;

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
      recentChat: project.recentChat ?? [],
    })}

USER MESSAGE: ${message || "What should I do next?"}`;

    const text = await callGemini(apiKey, {
      system: SYSTEM,
      user,
      maxTokens: 700,
      temperature: 0.5,
      json: false,
    });
    const trimmed = text.trim();
    if (!trimmed) return jsonResponse({ error: "invalid_ai_output" });

    return jsonResponse({ text: trimmed });
  } catch (err) {
    // Any model/transport failure -> soft error so the client falls back.
    return jsonResponse({ error: "ai_failed", detail: String(err).slice(0, 300) });
  }
});
