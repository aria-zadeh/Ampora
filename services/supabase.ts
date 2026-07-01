/**
 * Supabase client — Ampora
 * Uses expo-secure-store for secure auth session persistence on native.
 * Falls back to localStorage on web.
 */

import { createClient, type SupabaseClient, type User, type Session, type AuthChangeEvent } from "@supabase/supabase-js";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

// ---------------------------------------------------------------------------
// Env vars
// ---------------------------------------------------------------------------

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "";

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    "[Ampora] Supabase env vars missing. Set EXPO_PUBLIC_SUPABASE_URL and " +
      "EXPO_PUBLIC_SUPABASE_ANON_KEY in your .env file. Auth will not work."
  );
}

// ---------------------------------------------------------------------------
// Storage adapter
// ---------------------------------------------------------------------------

/**
 * SecureStore adapter that implements Supabase's SupportedStorage interface.
 * Keys may contain characters that SecureStore rejects (e.g. `-`, `.`) so we
 * base64url-encode them to a safe string.
 */
class SecureStoreAdapter {
  /** SecureStore keys must be [a-zA-Z0-9._-] and ≤ 255 chars */
  private sanitize(key: string): string {
    // Replace any character outside the safe set with its hex code
    return key.replace(/[^a-zA-Z0-9._-]/g, (c) => `_${c.charCodeAt(0).toString(16)}`);
  }

  async getItem(key: string): Promise<string | null> {
    try {
      return await SecureStore.getItemAsync(this.sanitize(key));
    } catch {
      return null;
    }
  }

  async setItem(key: string, value: string): Promise<void> {
    try {
      await SecureStore.setItemAsync(this.sanitize(key), value);
    } catch (err) {
      console.warn("[SecureStoreAdapter] setItem failed:", err);
    }
  }

  async removeItem(key: string): Promise<void> {
    try {
      await SecureStore.deleteItemAsync(this.sanitize(key));
    } catch {
      // Ignore — item may not exist
    }
  }
}

/**
 * Minimal localStorage adapter for web fallback.
 * Uses the exact same interface so we can swap it in easily.
 */
class LocalStorageAdapter {
  getItem(key: string): string | null {
    try {
      return typeof localStorage !== "undefined" ? localStorage.getItem(key) : null;
    } catch {
      return null;
    }
  }

  setItem(key: string, value: string): void {
    try {
      if (typeof localStorage !== "undefined") localStorage.setItem(key, value);
    } catch {}
  }

  removeItem(key: string): void {
    try {
      if (typeof localStorage !== "undefined") localStorage.removeItem(key);
    } catch {}
  }
}

const storageAdapter = Platform.OS === "web" ? new LocalStorageAdapter() : new SecureStoreAdapter();

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

// Falls back to a placeholder URL/key when env vars are missing so the app
// can still boot (guest mode, local-only testing) instead of crashing at
// import time. Auth/sync calls will fail gracefully in that case, matching
// the existing try/catch handling around every call site.
export const supabase: SupabaseClient = createClient(
  supabaseUrl || "https://placeholder.supabase.co",
  supabaseAnonKey || "placeholder-anon-key",
  {
    auth: {
      storage: storageAdapter,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: Platform.OS === 'web',
    },
  }
);

// ---------------------------------------------------------------------------
// Auth helpers
// ---------------------------------------------------------------------------

/**
 * Send a magic-link sign-in email to the given address.
 * Returns `{ error }` — null error means the email was dispatched.
 */
export async function signInWithMagicLink(email: string): Promise<{ error: Error | null }> {
  // On web, redirect back to the current origin so the magic link always lands
  // on whatever deployment is active (local dev, preview, or production Vercel).
  // Without this, Supabase falls back to the project's hard-coded "Site URL".
  const emailRedirectTo =
    Platform.OS === "web" && typeof window !== "undefined"
      ? window.location.origin
      : undefined;

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: true,
      ...(emailRedirectTo ? { emailRedirectTo } : {}),
    },
  });
  return { error: error as Error | null };
}

/** Sign the current user out and clear the session. */
export async function signOut(): Promise<void> {
  await supabase.auth.signOut();
}

/** Return the currently authenticated user, or null if no session. */
export async function getCurrentUser(): Promise<User | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

/** Return the current session object, or null. */
export async function getSession(): Promise<Session | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session;
}

/**
 * Subscribe to auth state changes.
 * Returns an unsubscribe function — call it in a useEffect cleanup.
 */
export function onAuthStateChange(
  callback: (event: AuthChangeEvent, session: Session | null) => void
): () => void {
  const { data } = supabase.auth.onAuthStateChange(callback);
  return () => data.subscription.unsubscribe();
}

// ---------------------------------------------------------------------------
// Supabase schema types (snake_case — mirrors DB column names)
// ---------------------------------------------------------------------------

export interface SupabaseTask {
  id: string;
  user_id: string;
  title: string;
  subject: string | null;
  description: string | null;
  due_date: string;
  start_time: string | null;
  proposed_time: string | null;
  duration_minutes: number | null;
  is_abstract: boolean;
  difficulty: "low" | "medium" | "high";
  source: "manual" | "ai_extracted";
  external_id: string | null;
  starter_action: string;
  status: "not_started" | "in_progress" | "complete";
  schedule_status: string | null;
  created_at: string;
  updated_at: string;
  // Populated client-side after fetching subtasks
  subtasks?: SupabaseSubtask[];
}

export interface SupabaseSubtask {
  id: string;
  parent_task_id: string;
  user_id: string;
  title: string;
  estimated_minutes: number;
  is_complete: boolean;
  order: number;
}

export interface SupabaseFocusSession {
  id: string;
  user_id: string;
  task_id: string;
  subtask_id: string | null;
  start_time: string;
  end_time: string | null;
  duration_minutes: number | null;
  breaks_taken: number;
  completed_subtask_ids: string[];
}

export interface SupabaseUserSettings {
  user_id: string;
  display_name: string | null;
  energy_peak_start: number;
  energy_peak_end: number;
  pomodoro_enabled: boolean;
  pomodoro_work_minutes: number;
  pomodoro_break_minutes: number;
  quiet_hours_start: number;
  quiet_hours_end: number;
  focus_audio: "white_noise" | "brown_noise" | "rain" | "cafe" | "none";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- JSONB column, shape validated at runtime
  busy_blocks: any;
  availability_notes: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- JSONB column
  calendar_events: any;
  auto_accept_proposed_schedule: boolean;
  onboarding_complete: boolean;
  web_push_subscription: string | null;
}

// ---------------------------------------------------------------------------
// Converter helpers
// ---------------------------------------------------------------------------

import type { Task, Subtask, FocusSession, UserSettings, ScheduleStatus } from "@/types";

/** Convert app camelCase Task → Supabase snake_case row (subtasks excluded). */
export function taskToSupabase(task: Task, userId: string): SupabaseTask {
  return {
    id: task.id,
    user_id: userId,
    title: task.title,
    subject: task.subject,
    description: task.description,
    due_date: task.dueDate,
    start_time: task.startTime ?? null,
    proposed_time: task.proposedTime ?? null,
    duration_minutes: task.durationMinutes,
    is_abstract: task.isAbstract,
    difficulty: task.difficulty,
    source: task.source,
    external_id: task.externalId,
    starter_action: task.starterAction,
    status: task.status,
    schedule_status: task.scheduleStatus,
    created_at: task.createdAt,
    updated_at: task.updatedAt,
  };
}

/** Convert Supabase task row → app Task (subtasks provided separately). */
export function taskFromSupabase(row: SupabaseTask): Task {
  return {
    id: row.id,
    title: row.title,
    subject: row.subject,
    description: row.description,
    dueDate: row.due_date,
    startTime: row.start_time ?? undefined,
    proposedTime: row.proposed_time ?? undefined,
    durationMinutes: row.duration_minutes ?? null,
    isAbstract: row.is_abstract,
    difficulty: row.difficulty,
    source: row.source as Task["source"],
    externalId: row.external_id,
    starterAction: row.starter_action,
    status: row.status,
    scheduleStatus: (row.schedule_status as ScheduleStatus) ?? "unscheduled",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    subtasks: (row.subtasks ?? []).map(subtaskFromSupabase),
  };
}

/** Convert app camelCase Subtask → Supabase snake_case row. */
export function subtaskToSupabase(subtask: Subtask, userId: string): SupabaseSubtask {
  return {
    id: subtask.id,
    parent_task_id: subtask.parentTaskId,
    user_id: userId,
    title: subtask.title,
    estimated_minutes: subtask.estimatedMinutes,
    is_complete: subtask.isComplete,
    order: subtask.order,
  };
}

/** Convert Supabase subtask row → app Subtask. */
export function subtaskFromSupabase(row: SupabaseSubtask): Subtask {
  return {
    id: row.id,
    parentTaskId: row.parent_task_id,
    title: row.title,
    estimatedMinutes: row.estimated_minutes,
    isComplete: row.is_complete,
    order: row.order,
  };
}

/** Convert app UserSettings + userId → Supabase user_settings row. */
export function settingsToSupabase(settings: Partial<UserSettings>, userId: string): Partial<SupabaseUserSettings> & { user_id: string } {
  const row: Partial<SupabaseUserSettings> & { user_id: string } = { user_id: userId };
  if (settings.displayName !== undefined) row.display_name = settings.displayName;
  if (settings.energyPeakStart !== undefined) row.energy_peak_start = settings.energyPeakStart;
  if (settings.energyPeakEnd !== undefined) row.energy_peak_end = settings.energyPeakEnd;
  if (settings.pomodoroEnabled !== undefined) row.pomodoro_enabled = settings.pomodoroEnabled;
  if (settings.pomodoroWorkMinutes !== undefined) row.pomodoro_work_minutes = settings.pomodoroWorkMinutes;
  if (settings.pomodoroBreakMinutes !== undefined) row.pomodoro_break_minutes = settings.pomodoroBreakMinutes;
  if (settings.quietHoursStart !== undefined) row.quiet_hours_start = settings.quietHoursStart;
  if (settings.quietHoursEnd !== undefined) row.quiet_hours_end = settings.quietHoursEnd;
  if (settings.focusAudio !== undefined) row.focus_audio = settings.focusAudio;
  if (settings.busyBlocks !== undefined) row.busy_blocks = settings.busyBlocks;
  if (settings.availabilityNotes !== undefined) row.availability_notes = settings.availabilityNotes;
  if (settings.calendarEvents !== undefined) row.calendar_events = settings.calendarEvents;
  if (settings.autoAcceptProposedSchedule !== undefined) row.auto_accept_proposed_schedule = settings.autoAcceptProposedSchedule;
  if (settings.onboardingComplete !== undefined) row.onboarding_complete = settings.onboardingComplete;
  if (settings.webPushSubscription !== undefined) row.web_push_subscription = settings.webPushSubscription ?? null;
  return row;
}

/** Convert Supabase user_settings row → partial UserSettings. */
export function settingsFromSupabase(row: SupabaseUserSettings): Partial<UserSettings> {
  return {
    displayName: row.display_name ?? null,
    energyPeakStart: row.energy_peak_start,
    energyPeakEnd: row.energy_peak_end,
    pomodoroEnabled: row.pomodoro_enabled,
    pomodoroWorkMinutes: row.pomodoro_work_minutes,
    pomodoroBreakMinutes: row.pomodoro_break_minutes,
    quietHoursStart: row.quiet_hours_start,
    quietHoursEnd: row.quiet_hours_end,
    focusAudio: row.focus_audio,
    busyBlocks: row.busy_blocks ?? [],
    availabilityNotes: row.availability_notes ?? "",
    calendarEvents: row.calendar_events ?? [],
    autoAcceptProposedSchedule: row.auto_accept_proposed_schedule ?? false,
    onboardingComplete: row.onboarding_complete,
    webPushSubscription: row.web_push_subscription ?? null,
  };
}

// ---------------------------------------------------------------------------
// Sync functions — local-first pattern
// Writes go to Zustand immediately (optimistic), then fire-and-forget to Supabase.
// Reads are background-only; caller merges based on updated_at.
// ---------------------------------------------------------------------------

/**
 * Fetch all tasks (with nested subtasks) for the given user from Supabase.
 * Supabase wins on updated_at conflicts — merge logic lives in the caller.
 */
export async function syncTasksFromSupabase(userId: string): Promise<{ tasks: Task[] }> {
  // Fetch tasks
  const { data: taskRows, error: taskError } = await supabase
    .from("tasks")
    .select("*")
    .eq("user_id", userId);

  if (taskError) throw taskError;
  if (!taskRows || taskRows.length === 0) return { tasks: [] };

  const taskIds = taskRows.map((t: SupabaseTask) => t.id);

  // Fetch subtasks for all task IDs in one query
  const { data: subtaskRows, error: subtaskError } = await supabase
    .from("subtasks")
    .select("*")
    .in("parent_task_id", taskIds);

  if (subtaskError) throw subtaskError;

  // Nest subtasks onto their parent tasks
  const subtasksByTaskId: Record<string, SupabaseSubtask[]> = {};
  for (const sub of (subtaskRows ?? []) as SupabaseSubtask[]) {
    if (!subtasksByTaskId[sub.parent_task_id]) subtasksByTaskId[sub.parent_task_id] = [];
    subtasksByTaskId[sub.parent_task_id].push(sub);
  }

  const tasks: Task[] = (taskRows as SupabaseTask[]).map((row) => {
    const withSubtasks: SupabaseTask = {
      ...row,
      subtasks: subtasksByTaskId[row.id] ?? [],
    };
    return taskFromSupabase(withSubtasks);
  });

  return { tasks };
}

/** Upsert a single task row. Fire-and-forget — logs errors, does not throw. */
export async function upsertTask(task: SupabaseTask, userId: string): Promise<void> {
  try {
    const row = { ...task, user_id: userId };
    // Remove client-side subtasks field before sending to DB
    const { subtasks: _subtasks, ...rowWithoutSubtasks } = row;
    const { error } = await supabase.from("tasks").upsert(rowWithoutSubtasks);
    if (error) console.warn("[Ampora] upsertTask error:", error.message);
  } catch (err) {
    console.warn("[Ampora] upsertTask exception:", err);
  }
}

/** Delete a task row by ID. Fire-and-forget. */
export async function deleteTask(taskId: string): Promise<void> {
  try {
    const { error } = await supabase.from("tasks").delete().eq("id", taskId);
    if (error) console.warn("[Ampora] deleteTask error:", error.message);
  } catch (err) {
    console.warn("[Ampora] deleteTask exception:", err);
  }
}

/** Upsert a single subtask row. Fire-and-forget. */
export async function upsertSubtask(subtask: SupabaseSubtask, userId: string): Promise<void> {
  try {
    const row = { ...subtask, user_id: userId };
    const { error } = await supabase.from("subtasks").upsert(row);
    if (error) console.warn("[Ampora] upsertSubtask error:", error.message);
  } catch (err) {
    console.warn("[Ampora] upsertSubtask exception:", err);
  }
}

/** Delete a subtask row by ID. Fire-and-forget. */
export async function deleteSubtask(subtaskId: string): Promise<void> {
  try {
    const { error } = await supabase.from("subtasks").delete().eq("id", subtaskId);
    if (error) console.warn("[Ampora] deleteSubtask error:", error.message);
  } catch (err) {
    console.warn("[Ampora] deleteSubtask exception:", err);
  }
}

/**
 * Fetch user settings for the given user from Supabase.
 * Returns null if no row found.
 */
export async function syncSettingsFromSupabase(userId: string): Promise<Partial<UserSettings> | null> {
  const { data, error } = await supabase
    .from("user_settings")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  return settingsFromSupabase(data as SupabaseUserSettings);
}

/** Upsert user settings. Fire-and-forget. */
export async function upsertSettings(settings: Partial<UserSettings>, userId: string): Promise<void> {
  try {
    const row = settingsToSupabase(settings, userId);
    const { error } = await supabase.from("user_settings").upsert(row);
    if (error) console.warn("[Ampora] upsertSettings error:", error.message);
  } catch (err) {
    console.warn("[Ampora] upsertSettings exception:", err);
  }
}

/** Upsert a focus session row. Fire-and-forget. */
export async function upsertFocusSession(session: FocusSession, userId: string): Promise<void> {
  try {
    const row: SupabaseFocusSession = {
      id: session.id,
      user_id: userId,
      task_id: session.taskId,
      subtask_id: session.subtaskId,
      start_time: session.startTime,
      end_time: session.endTime,
      duration_minutes: session.durationMinutes,
      breaks_taken: session.breaksTaken,
      completed_subtask_ids: session.completedSubtasks,
    };
    const { error } = await supabase.from("focus_sessions").upsert(row);
    if (error) console.warn("[Ampora] upsertFocusSession error:", error.message);
  } catch (err) {
    console.warn("[Ampora] upsertFocusSession exception:", err);
  }
}
