/**
 * AI client — Ampora Phase 4.
 *
 * Thin, defensive client over four Supabase Edge Functions (ai-breakdown,
 * ai-simplify, ai-refine, ai-extract-tasks). AI is Google Gemini
 * (`gemini-2.5-flash`) behind those functions; the key lives server-side, never
 * in the client. Every function has a LOCAL FALLBACK so the whole feature set
 * works with no `GEMINI_API_KEY` set and never throws to the UI. The edge
 * functions themselves return 200 with `{ error: "no_key" }` when the key is
 * missing, so the "no key" path and the "network failed" path funnel into the
 * same graceful fallback here.
 *
 * Grounding for the fallbacks: doc 07 (breakdown pipeline). First move is a
 * 2-to-5-minute concrete start, subtasks are deadline-aware (crunch = short
 * steps only, comfortable = a few starters plus larger blocks), max 8 steps.
 *
 * It does not import react-native/expo directly beyond the shared supabase
 * client, so it stays portable and web-safe.
 */

import { supabase } from "@/services/supabase";
import { parseQuickAdd } from "@/core/quick-add";
import type { Task } from "@/types";

// ---------------------------------------------------------------------------
// Public result shapes
// ---------------------------------------------------------------------------

export interface BreakdownSubtask {
  title: string;
  estimatedMin: number;
}

export interface BreakdownResult {
  /** The 2-to-5-minute concrete first move (doc 07 Part 1B.4). */
  firstMove: string;
  /** Ordered checklist, max 8 (doc 07 Part 1.5). */
  subtasks: BreakdownSubtask[];
  /** True when this came from the local template, not live AI. */
  isFallback: boolean;
  /** Present when a fallback fired, for optional UI messaging. */
  note?: string;
}

export interface SimplifyResult {
  simplified: string;
  isFallback: boolean;
}

export interface ExtractedTask {
  title: string;
  /** Epoch ms deadline. */
  due?: number;
  durationMin?: number;
  /** 1=Low, 2=Medium, 3=High, 4=Urgent. */
  priority?: number;
}

// ---------------------------------------------------------------------------
// Edge invocation helper
// ---------------------------------------------------------------------------

/**
 * Invoke a Supabase Edge Function and return its parsed JSON body, or null if
 * the call errored, returned nothing, or the server reported it has no API key
 * (`{ error: "no_key" }`). Never throws — callers treat null as "use fallback".
 */
async function invokeEdge<T = unknown>(
  name: string,
  body: Record<string, unknown>
): Promise<T | null> {
  try {
    const { data, error } = await supabase.functions.invoke(name, { body });
    if (error) return null;
    if (data == null) return null;
    // Edge functions signal "no key configured" (and other soft failures) with
    // a 200 + { error: ... } body rather than an HTTP error, so we detect it here.
    if (typeof data === "object" && "error" in (data as Record<string, unknown>)) {
      return null;
    }
    return data as T;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Fallback sizing (doc 07 §1.5 / 1B.3): deadline-aware granularity
// ---------------------------------------------------------------------------

/** Hours until due, or a comfortable default (72h) when there is no deadline. */
function hoursUntilDue(due?: number, now: number = Date.now()): number {
  if (due == null) return 72;
  return Math.max(0, (due - now) / 3_600_000);
}

/**
 * A warm, generic breakdown template sized by time-to-due:
 * - Crunch (< 24h): only short 5-to-10-min steps, minimum-viable, no big blocks.
 * - Otherwise: 1-2 short starter steps plus a couple of larger 15-30 min blocks.
 * Always <= 8 subtasks. Titles are deliberately generic-but-actionable so the
 * "showing general steps" banner reads honestly (doc 07 §1.8).
 */
function fallbackBreakdown(task: { title?: string; durationMin?: number }, due?: number): BreakdownResult {
  const title = (task.title ?? "this task").trim() || "this task";
  const crunch = hoursUntilDue(due) < 24;

  const subtasks: BreakdownSubtask[] = crunch
    ? [
        { title: `Open ${title} and read exactly what's required`, estimatedMin: 5 },
        { title: "Do the single highest-impact part first", estimatedMin: 10 },
        { title: "Do the next most important part", estimatedMin: 10 },
        { title: "Do a fast pass to make it submittable", estimatedMin: 10 },
      ]
    : [
        { title: `Open ${title} and write one line on what "done" looks like`, estimatedMin: 5 },
        { title: "Gather everything you need in one place", estimatedMin: 10 },
        { title: "Do the main body of the work", estimatedMin: 25 },
        { title: "Review, fix, and finish it off", estimatedMin: 15 },
      ];

  return {
    firstMove: `Open ${title} and type the first word or heading`,
    subtasks,
    isFallback: true,
    note: "Showing general steps, not task-specific.",
  };
}

// ---------------------------------------------------------------------------
// Validation of live edge results (defensive — never trust the wire)
// ---------------------------------------------------------------------------

function coerceBreakdown(raw: unknown): BreakdownResult | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const firstMove = typeof r.firstMove === "string" ? r.firstMove.trim() : "";
  const rawSubs = Array.isArray(r.subtasks) ? r.subtasks : [];
  const subtasks: BreakdownSubtask[] = rawSubs
    .map((s): BreakdownSubtask | null => {
      if (!s || typeof s !== "object") return null;
      const so = s as Record<string, unknown>;
      const t = typeof so.title === "string" ? so.title.trim() : "";
      if (!t) return null;
      const estRaw = typeof so.estimatedMin === "number" ? so.estimatedMin : Number(so.estimatedMin);
      const est = Number.isFinite(estRaw) && estRaw > 0 ? Math.round(estRaw) : 15;
      return { title: t, estimatedMin: est };
    })
    .filter((s): s is BreakdownSubtask => s != null)
    .slice(0, 8); // doc 07: max 8 subtasks

  if (!firstMove || subtasks.length === 0) return null;
  return { firstMove, subtasks, isFallback: false };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Break a task into a First move + ordered subtasks. `sourceText` is optional
 * grounding material (extracted PDF/photo/voice text — doc 07 §1.3). Falls back
 * to a warm generic template sized by time-to-due when AI is unavailable.
 */
export async function breakdownTask(
  task: Pick<Task, "title"> & Partial<Pick<Task, "notes" | "durationMin" | "due" | "energyRequired">>,
  sourceText?: string
): Promise<BreakdownResult> {
  const payload = {
    task: {
      title: task.title,
      notes: task.notes ?? "",
      durationMin: task.durationMin,
      dueAt: task.due,
      hoursUntilDue: Math.round(hoursUntilDue(task.due)),
      energyRequired: task.energyRequired,
    },
    source: sourceText ?? "none",
  };

  const raw = await invokeEdge("ai-breakdown", payload);
  const coerced = coerceBreakdown(raw);
  if (coerced) return coerced;
  return fallbackBreakdown(task, task.due);
}

/**
 * Regenerate a breakdown from a prior one plus a natural-language instruction
 * ("break it down by function", "step 3 is too big", doc 07 §1.7). Returns the
 * same shape as `breakdownTask`. On failure returns the previous breakdown
 * unchanged, flagged, so the UI can tell the user refine did not apply.
 */
export async function refineBreakdown(
  prev: BreakdownResult,
  instruction: string,
  sourceText?: string
): Promise<BreakdownResult> {
  const payload = {
    prev: { firstMove: prev.firstMove, subtasks: prev.subtasks },
    instruction,
    source: sourceText ?? "none",
  };

  const raw = await invokeEdge("ai-refine", payload);
  const coerced = coerceBreakdown(raw);
  if (coerced) return coerced;
  return { ...prev, isFallback: true, note: "Couldn't refine right now — showing your previous steps." };
}

/**
 * Simplify a single subtask into a smaller, 2-minute concrete action (doc 07
 * Part 1B.4 first-move rules applied to an existing step). Fallback prepends a
 * warm "Just start:" nudge and trims to the first clause.
 */
export async function simplifySubtask(title: string): Promise<SimplifyResult> {
  const raw = await invokeEdge<{ simplified?: unknown }>("ai-simplify", { subtask: { title } });
  const s = raw && typeof raw.simplified === "string" ? raw.simplified.trim() : "";
  if (s) return { simplified: s, isFallback: false };

  // Fallback: trim to the first clause and prepend a gentle starter cue.
  const firstClause = title.split(/[,.;:]/)[0].trim() || title.trim();
  const lower = firstClause.charAt(0).toLowerCase() + firstClause.slice(1);
  return { simplified: `Just start: ${lower}`, isFallback: true };
}

/**
 * Extract discrete tasks from free-form text (a syllabus paste, a brain dump —
 * PRD FR-7/8). Fallback splits on lines and runs the deterministic quick-add
 * parser per line so multi-task capture still works offline.
 */
export async function extractTasks(text: string): Promise<ExtractedTask[]> {
  const raw = await invokeEdge<{ tasks?: unknown } | unknown[]>("ai-extract-tasks", { text });

  // Accept either { tasks: [...] } or a bare array.
  const list: unknown[] = Array.isArray(raw)
    ? raw
    : raw && typeof raw === "object" && Array.isArray((raw as { tasks?: unknown[] }).tasks)
      ? ((raw as { tasks: unknown[] }).tasks)
      : [];

  const parsed = list
    .map((t): ExtractedTask | null => {
      if (!t || typeof t !== "object") return null;
      const to = t as Record<string, unknown>;
      const title = typeof to.title === "string" ? to.title.trim() : "";
      if (!title) return null;
      const out: ExtractedTask = { title };
      if (typeof to.due === "number" && Number.isFinite(to.due)) out.due = to.due;
      if (typeof to.durationMin === "number" && Number.isFinite(to.durationMin)) out.durationMin = Math.round(to.durationMin);
      if (typeof to.priority === "number" && Number.isFinite(to.priority)) out.priority = to.priority;
      return out;
    })
    .filter((t): t is ExtractedTask => t != null);

  if (parsed.length > 0) return parsed;

  // Fallback: per-line quick-add parse.
  const now = Date.now();
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      const q = parseQuickAdd(line, now);
      const out: ExtractedTask = { title: q.title || line };
      if (q.due != null) out.due = q.due;
      if (q.durationMin != null) out.durationMin = q.durationMin;
      if (q.priority != null) out.priority = q.priority;
      return out;
    })
    .filter((t) => t.title.length > 0);
}
