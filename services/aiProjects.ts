/**
 * Project AI client (doc `06` §4 "Session generation", PRD FR-84).
 *
 * `generateNextTask(project, options)` -> the next schedulable session as a
 * { title, firstMove, subtasks } shape: a normal Ampora Task whose First move
 * is computed for the CURRENT phase, not the whole project. Backed by a
 * Supabase Edge Function with a LOCAL FALLBACK so it works with no
 * `GEMINI_API_KEY` and never throws to the UI.
 *
 * `generateNextTask` is the one capability this file keeps from the project's
 * old, cut conversational assistant (`V2_Changes.md` §6) — it is also the
 * function the nightly pre-built-tomorrow pass (FR-90, not yet built) will
 * call once per active project.
 *
 * AI is Google Gemini (`gemini-2.5-flash`) behind the edge function; the key
 * lives server-side. Same defensive contract as `services/ai.ts`: the edge
 * function returns 200 + `{ error: "no_key" }` when the key is missing, so the
 * "no key" and "network failed" paths funnel into the same graceful fallback.
 * The fallback is grounded in the project's own title/kind/current phase/
 * context line so it reads as helpful, not generic. This file mirrors — and
 * intentionally does NOT import — `services/ai.ts`, to keep that file untouched.
 *
 * Portable/web-safe: imports only the shared supabase client, `@/types`, and
 * the pure `core/projects/progress` helpers. No react-native imports.
 */

import { supabase } from "@/services/supabase";
import { findCurrentPhase, type CheckInAnswer } from "@/core/projects/progress";
import type { Project } from "@/types";

// ---------------------------------------------------------------------------
// Public result shapes
// ---------------------------------------------------------------------------

export interface NextTaskSubtask {
  title: string;
  estimatedMin: number;
}

/** The next work session, shaped so a caller can create a normal Task from it (doc `06` §4). */
export interface NextTaskResult {
  title: string;
  /** The 2-to-5-minute concrete first move for THIS session (doc `03`). */
  firstMove: string;
  subtasks: NextTaskSubtask[];
  /** True when this came from the local template, not live AI. */
  isFallback: boolean;
  /** Present when a fallback fired, for optional UI messaging. */
  note?: string;
}

/** Inputs for `generateNextTask` beyond the project itself (doc `06` §4's four inputs). */
export interface GenerateNextTaskOptions {
  /** Tomorrow's (or today's) available block length, in minutes. @default 45 */
  sessionMin?: number;
  /**
   * The end-of-session check-in answer from the LAST session this project
   * generated, so the copy can tell "starting a fresh phase" apart from
   * "still finishing the same one". Undefined for a project's first-ever
   * session, or when the last check-in was skipped and nothing could be
   * inferred.
   */
  lastOutcome?: CheckInAnswer;
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
// Payload + fallback shared helpers
// ---------------------------------------------------------------------------

/** A compact, wire-safe snapshot of the project for the edge function (doc `06` §4's inputs, minus session length which travels separately). */
function projectPayload(project: Project, lastOutcome: CheckInAnswer | undefined) {
  const current = findCurrentPhase(project.phases);
  return {
    title: project.title,
    kind: project.kind,
    contextLine: project.contextLine ?? "",
    percent: project.percent,
    currentPhase: current ? { title: current.title, order: current.order } : null,
    phases: project.phases.map((p) => ({ title: p.title, done: p.done, order: p.order })),
    lastOutcome: lastOutcome ?? null,
  };
}

/** Lead phrase for the fallback title/first-move, shaped by the last check-in (doc `06` §4). */
function leadPhrase(kind: Project["kind"], lastOutcome: CheckInAnswer | undefined): string {
  if (lastOutcome === "keep_going") return kind === "study" ? "Keep drilling" : "Keep going on";
  if (lastOutcome === "stop_here") return "Pick back up on";
  return kind === "study" ? "Study" : "Advance";
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, max - 1).trimEnd()}…`;
}

function clampBudget(n: number | undefined, fallback: number): number {
  return n != null && Number.isFinite(n) && n > 0 ? Math.round(n) : fallback;
}

// ---------------------------------------------------------------------------
// Public API — next-session task generation
// ---------------------------------------------------------------------------

/**
 * Generate the next work session as a schedulable Task shape (doc `06` §4).
 * `options.sessionMin` is the time budget for the session (used to size
 * subtasks); `options.lastOutcome` is the prior session's check-in answer,
 * used to flavor the fallback copy. Calls the `ai-project-task` edge
 * function; on failure returns a sensible templated next session derived
 * from the project's current phase and context line. Never throws.
 */
export async function generateNextTask(
  project: Project,
  options: GenerateNextTaskOptions = {}
): Promise<NextTaskResult> {
  const budget = clampBudget(options.sessionMin, 45);

  const raw = await invokeEdge("ai-project-task", {
    project: projectPayload(project, options.lastOutcome),
    sessionMin: budget,
  });

  const coerced = coerceNextTask(raw);
  if (coerced) return coerced;

  return fallbackNextTask(project, budget, options.lastOutcome);
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
    .slice(0, 8); // doc `03`: max 8 subtasks

  if (!title || !firstMove || subtasks.length === 0) return null;
  return { title, firstMove, subtasks, isFallback: false };
}

/**
 * A sensible templated next session, grounded in the project's current phase
 * (doc `06` §4). Subtasks are sized to fit `sessionMin` (a short starter plus
 * one or two work blocks), max 8, and the First move is a 2-to-5-minute
 * impossible-to-fail start (doc `03`).
 */
function fallbackNextTask(
  project: Project,
  sessionMin: number,
  lastOutcome: CheckInAnswer | undefined
): NextTaskResult {
  const title = project.title.trim() || "this project";
  const current = findCurrentPhase(project.phases);
  const contextSuffix = project.contextLine?.trim()
    ? ` (${truncate(project.contextLine.trim(), 140)})`
    : "";

  // Work-block budget after a ~5 min starter step.
  const workMin = Math.max(10, sessionMin - 5);
  const half = Math.max(10, Math.round(workMin / 2));
  const note = "This is a template session, not grounded in your material.";

  if (!current) {
    // No open phase — either nothing has been planned yet, or every phase is
    // already done. Either way there's no specific phase/topic name to use.
    return {
      title: `Push ${title} forward (${sessionMin} min)`,
      firstMove: `Open ${title} and write one line on the single most useful next thing${contextSuffix}`,
      subtasks: [
        { title: "Decide the one outcome for this session", estimatedMin: 5 },
        { title: "Do the main chunk of work toward it", estimatedMin: half },
        { title: "Wrap up and note where to pick up next time", estimatedMin: Math.max(10, workMin - half) },
      ],
      isFallback: true,
      note,
    };
  }

  const focus = current.title;
  const lead = leadPhrase(project.kind, lastOutcome);
  const subtasks: NextTaskSubtask[] =
    project.kind === "study"
      ? [
          { title: `Review the basics of ${focus}`, estimatedMin: 5 },
          { title: `Work through the key ideas / worked examples for ${focus}`, estimatedMin: half },
          { title: `Do a few practice questions on ${focus} and mark them`, estimatedMin: Math.max(10, workMin - half) },
        ]
      : [
          { title: `Re-read what "${focus}" needs and jot 2 bullet points`, estimatedMin: 5 },
          { title: `Do the core of ${focus}`, estimatedMin: half },
          { title: "Tidy it into something you could hand in", estimatedMin: Math.max(10, workMin - half) },
        ];

  return {
    title: `${lead} ${focus} (${sessionMin} min)`,
    firstMove:
      project.kind === "study"
        ? `Open your ${title} notes and read the first line on ${focus}${contextSuffix}`
        : `Open your ${title} draft and reread your last paragraph on ${focus}${contextSuffix}`,
    subtasks: subtasks.slice(0, 8),
    isFallback: true,
    note,
  };
}
