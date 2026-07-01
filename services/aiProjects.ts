/**
 * Project AI client — Phase 7 (doc `10` §5 project chat, §7 next-task
 * generation).
 *
 * Two capabilities, each backed by a Supabase Edge Function with a LOCAL
 * FALLBACK so both work with no ANTHROPIC_API_KEY and never throw to the UI:
 *  - `projectChat(project, userMessage)` → assistant reply text.
 *  - `generateNextTask(project, sessionMin)` → the next schedulable session as a
 *    { title, firstMove, subtasks } shape (doc `10` §7: a normal Ampora Task
 *    whose First move is computed for the CURRENT position, not the whole
 *    project).
 *
 * Same defensive contract as `services/ai.ts`: the edge functions return 200 +
 * `{ error: "no_key" }` when the key is missing, so the "no key" and "network
 * failed" paths funnel into the same graceful fallback. Fallbacks are grounded
 * in the project's own name / kind / progress / files so they read as helpful,
 * not generic. This file mirrors — and intentionally does NOT import —
 * `services/ai.ts`, to keep that file untouched.
 *
 * Portable/web-safe: imports only the shared supabase client and types.
 */

import { supabase } from "@/services/supabase";
import type { Project, ProjectProgress } from "@/types";

// ---------------------------------------------------------------------------
// Public result shapes
// ---------------------------------------------------------------------------

export interface NextTaskSubtask {
  title: string;
  estimatedMin: number;
}

/** The next work session, shaped so a caller can create a normal Task from it (doc `10` §7). */
export interface NextTaskResult {
  title: string;
  /** The 2-to-5-minute concrete first move for THIS session (doc 07 Part 1B.4). */
  firstMove: string;
  subtasks: NextTaskSubtask[];
  /** True when this came from the local template, not live AI. */
  isFallback: boolean;
  /** Present when a fallback fired, for optional UI messaging. */
  note?: string;
}

export interface ProjectChatResult {
  text: string;
  /** True when this came from the local templated reply, not live AI. */
  isFallback: boolean;
}

// ---------------------------------------------------------------------------
// Edge invocation helper (mirrors services/ai.ts#invokeEdge — never throws)
// ---------------------------------------------------------------------------

/**
 * Invoke a Supabase Edge Function and return its parsed JSON body, or null if
 * the call errored, returned nothing, or the server reported a soft failure
 * (`{ error: ... }`, e.g. no key). Never throws — callers treat null as "use
 * fallback".
 */
async function invokeEdge<T = unknown>(
  name: string,
  body: Record<string, unknown>
): Promise<T | null> {
  try {
    const { data, error } = await supabase.functions.invoke(name, { body });
    if (error) return null;
    if (data == null) return null;
    if (typeof data === "object" && "error" in (data as Record<string, unknown>)) {
      return null;
    }
    return data as T;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Progress summarization (shared by the payload and the fallbacks)
// ---------------------------------------------------------------------------

/** Overall percent-complete for any progress shape, 0..100 (rounded). */
function overallPct(progress: ProjectProgress): number {
  switch (progress.kind) {
    case "general":
      return clampPct(progress.pct);
    case "deliverable": {
      if (progress.phases.length === 0) return 0;
      const sum = progress.phases.reduce((acc, p) => acc + clampPct(p.pct), 0);
      return Math.round(sum / progress.phases.length);
    }
    case "study": {
      if (progress.topics.length === 0) return 0;
      // Mastery is 0..1; average it across topics and express as a percent.
      const sum = progress.topics.reduce((acc, t) => acc + clamp01(t.mastery), 0);
      return Math.round((sum / progress.topics.length) * 100);
    }
  }
}

function clampPct(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(100, Math.max(0, Math.round(n)));
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

/**
 * The most useful "where are you" focus for the next session, derived from
 * progress: the first unfinished phase (deliverable), the weakest topic
 * (study), or null (general). Drives both the payload hint and the fallback.
 */
function nextFocus(progress: ProjectProgress): string | null {
  switch (progress.kind) {
    case "deliverable": {
      const pending = progress.phases.find((p) => clampPct(p.pct) < 100);
      return pending ? pending.title : null;
    }
    case "study": {
      if (progress.topics.length === 0) return null;
      const weakest = progress.topics.reduce((a, b) =>
        clamp01(b.mastery) < clamp01(a.mastery) ? b : a
      );
      return weakest.title;
    }
    case "general":
      return null;
  }
}

/** A compact, wire-safe snapshot of the project for the edge functions. */
function projectPayload(project: Project) {
  return {
    name: project.name,
    kind: project.kind,
    description: project.description ?? "",
    overallPct: overallPct(project.progress),
    nextFocus: nextFocus(project.progress),
    progress: project.progress,
    memory: project.memory,
    fileNames: project.files.map((f) => f.name),
    // Trim to keep the payload bounded; the server retrieves the rest as needed.
    recentChat: project.chat.slice(-8).map((m) => ({ role: m.role, text: m.text })),
  };
}

// ---------------------------------------------------------------------------
// Public API — project chat
// ---------------------------------------------------------------------------

/**
 * Answer/act on a message in the project's scoped chat (doc `10` §5). Calls the
 * `ai-project-chat` edge function; on any failure returns a warm, templated
 * reply grounded in the project's name, kind, progress, and files so the chat
 * still responds offline. Never throws.
 */
export async function projectChat(
  project: Project,
  userMessage: string
): Promise<ProjectChatResult> {
  const raw = await invokeEdge<{ text?: unknown }>("ai-project-chat", {
    project: projectPayload(project),
    message: userMessage,
  });

  const text = raw && typeof raw.text === "string" ? raw.text.trim() : "";
  if (text) return { text, isFallback: false };

  return { text: fallbackChatReply(project, userMessage), isFallback: true };
}

/**
 * Templated, grounded reply used when live AI is unavailable. Reflects the
 * project's real state (name, percent complete, next focus, file count) and
 * points the user at the concrete next action, matching the "always hand you a
 * sensible next step" framing (doc `10` §1).
 */
function fallbackChatReply(project: Project, userMessage: string): string {
  const pct = overallPct(project.progress);
  const focus = nextFocus(project.progress);
  const fileCount = project.files.length;
  const filePart =
    fileCount > 0
      ? ` I'm working from ${fileCount} file${fileCount === 1 ? "" : "s"} in this project.`
      : " Add some files and I can ground my help in your real material.";

  const focusPart =
    focus != null
      ? ` Right now the best next step looks like: ${focus}.`
      : project.progress.kind === "study"
        ? " Add the topics you need to cover and I'll steer you to the weakest one next."
        : " Tell me what 'done' looks like and I'll lay out the phases.";

  const asked = userMessage.trim();
  const echo = asked ? ` You asked: "${truncate(asked, 120)}".` : "";

  return (
    `You're about ${pct}% through "${project.name}".${focusPart}${filePart}${echo}` +
    ` (I'm offline right now, so this is a general answer — reconnect for a fuller, source-grounded reply.)`
  );
}

// ---------------------------------------------------------------------------
// Public API — next-session task generation
// ---------------------------------------------------------------------------

/**
 * Generate the next work session as a schedulable Task shape (doc `10` §7).
 * `sessionMin` is the time budget for the session (used to size subtasks). Calls
 * the `ai-project-task` edge function; on failure returns a sensible templated
 * next session derived from the current progress (first unfinished phase /
 * weakest topic / a general push). Never throws.
 */
export async function generateNextTask(
  project: Project,
  sessionMin: number = 45
): Promise<NextTaskResult> {
  const budget = Number.isFinite(sessionMin) && sessionMin > 0 ? Math.round(sessionMin) : 45;

  const raw = await invokeEdge("ai-project-task", {
    project: projectPayload(project),
    sessionMin: budget,
  });

  const coerced = coerceNextTask(raw);
  if (coerced) return coerced;

  return fallbackNextTask(project, budget);
}

/** Validate a live edge result into a NextTaskResult, or null if unusable. */
function coerceNextTask(raw: unknown): NextTaskResult | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const title = typeof r.title === "string" ? r.title.trim() : "";
  const firstMove = typeof r.firstMove === "string" ? r.firstMove.trim() : "";
  const rawSubs = Array.isArray(r.subtasks) ? r.subtasks : [];
  const subtasks: NextTaskSubtask[] = rawSubs
    .map((s): NextTaskSubtask | null => {
      if (!s || typeof s !== "object") return null;
      const so = s as Record<string, unknown>;
      const t = typeof so.title === "string" ? so.title.trim() : "";
      if (!t) return null;
      const estRaw =
        typeof so.estimatedMin === "number" ? so.estimatedMin : Number(so.estimatedMin);
      const est = Number.isFinite(estRaw) && estRaw > 0 ? Math.round(estRaw) : 15;
      return { title: t, estimatedMin: est };
    })
    .filter((s): s is NextTaskSubtask => s != null)
    .slice(0, 8); // doc 07: max 8 subtasks

  if (!title || !firstMove || subtasks.length === 0) return null;
  return { title, firstMove, subtasks, isFallback: false };
}

/**
 * A sensible templated next session, grounded in the project's current
 * position. Deliverable → advance the first unfinished phase; study → drill the
 * weakest topic; general → a focused push on the project itself. Subtasks are
 * sized to fit `sessionMin` (a short starter plus one or two work blocks), max 8,
 * and the First move is a 2-to-5-minute impossible-to-fail start (doc 07 / `10`
 * §7).
 */
function fallbackNextTask(project: Project, sessionMin: number): NextTaskResult {
  const focus = nextFocus(project.progress);
  const name = project.name.trim() || "this project";

  // Work-block budget after a ~5 min starter step.
  const workMin = Math.max(10, sessionMin - 5);
  const half = Math.max(10, Math.round(workMin / 2));

  let title: string;
  let firstMove: string;
  let subtasks: NextTaskSubtask[];

  switch (project.progress.kind) {
    case "deliverable": {
      const phase = focus ?? "the next section";
      title = `Advance ${phase} (${sessionMin} min)`;
      firstMove = `Open your ${name} draft and write the heading for ${phase}`;
      subtasks = [
        { title: `Re-read what "${phase}" needs and jot 2 bullet points`, estimatedMin: 5 },
        { title: `Do the core of ${phase}`, estimatedMin: half },
        { title: `Tidy it into something you could hand in`, estimatedMin: Math.max(10, workMin - half) },
      ];
      break;
    }
    case "study": {
      const topic = focus ?? "your weakest topic";
      title = `Study ${topic} (${sessionMin} min)`;
      firstMove = `Open your ${name} notes and read the first line on ${topic}`;
      subtasks = [
        { title: `Review the basics of ${topic}`, estimatedMin: 5 },
        { title: `Work through the key ideas / worked examples for ${topic}`, estimatedMin: half },
        { title: `Do a few practice questions on ${topic} and mark them`, estimatedMin: Math.max(10, workMin - half) },
      ];
      break;
    }
    case "general":
    default: {
      title = `Push ${name} forward (${sessionMin} min)`;
      firstMove = `Open ${name} and write one line on the single most useful next thing`;
      subtasks = [
        { title: `Decide the one outcome for this session`, estimatedMin: 5 },
        { title: `Do the main chunk of work toward it`, estimatedMin: half },
        { title: `Wrap up and note where to pick up next time`, estimatedMin: Math.max(10, workMin - half) },
      ];
      break;
    }
  }

  return {
    title,
    firstMove,
    subtasks: subtasks.slice(0, 8),
    isFallback: true,
    note: "Showing a general next session, not source-grounded.",
  };
}

// ---------------------------------------------------------------------------
// Local utilities
// ---------------------------------------------------------------------------

function truncate(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, max - 1)}…`;
}
