/**
 * Supabase client — Ampora
 * Uses expo-secure-store for secure auth session persistence on native.
 * Falls back to localStorage on web.
 */

import { createClient, type SupabaseClient, type User, type Session, type AuthChangeEvent } from "@supabase/supabase-js";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import {
  DEFAULT_SESSION_MIN,
  DEFAULT_SINGLE_SESSION_CAP_MIN,
  DEFAULT_STAKE_STRENGTH,
  STAKE_STRENGTH_BOUNDS,
} from "@/core/blocking/limits";

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

// ===========================================================================
// CLOUD SYNC (Phase 6, PRD FR-87 + §9.12) — rebuilt on the NEW data model.
//
// Local-first: the app writes Zustand -> MMKV immediately, then fires these
// helpers in the background (see store/syncStore.ts). Every function here
// NO-OPS GRACEFULLY when there is no signed-in user (guest mode) and never
// throws — errors are logged, never surfaced.
//
// Reconciliation is LAST-WRITE-WINS on `updated_at` (epoch ms), with local
// winning ties (§9.12). The row mappers below translate between the camelCase
// app model (types/index.ts) and snake_case DB columns.
//
// ---------------------------------------------------------------------------
// EXPECTED SQL SCHEMA (apply as a separate migration — the DB tables do not
// exist yet). All timestamps are epoch-ms BIGINT to match the app model.
//
//   -- tasks -----------------------------------------------------------------
//   create table public.tasks (
//     id           text primary key,
//     user_id      uuid not null references auth.users(id) on delete cascade,
//     title        text not null,
//     notes        text,
//     duration_min integer not null default 0,
//     progress_min integer not null default 0,
//     due          bigint,
//     auto_schedule boolean not null default true,
//     list_id      text,
//     project_id   text,
//     tags         jsonb  not null default '[]'::jsonb,
//     first_move   jsonb,          -- { id, text, done }
//     recurrence   jsonb,
//     priority     integer,
//     source_refs  jsonb,
//     splittable   boolean,
//     status       text   not null default 'todo',   -- 'todo'|'doing'|'done'
//     completed_at bigint,
//     schedule_subtasks_separately boolean,
//     start_after  bigint,
//     depends_on   jsonb,
//     min_block_min integer,
//     max_block_min integer,
//     buffer_before_min integer,
//     buffer_after_min  integer,
//     color        text,
//     scheduling_hours jsonb,
//     created_at   bigint not null,
//     updated_at   bigint not null
//   );
//   alter table public.tasks enable row level security;
//   create policy "tasks_owner" on public.tasks
//     for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
//   create index tasks_user_updated_idx on public.tasks (user_id, updated_at desc);
//
//   -- subtasks (child rows of a task; ordered by `position`) -----------------
//   create table public.subtasks (
//     id             text primary key,
//     parent_task_id text not null references public.tasks(id) on delete cascade,
//     user_id        uuid not null references auth.users(id) on delete cascade,
//     title          text not null,
//     estimated_min  integer not null default 0,
//     completed_at   bigint,
//     position       integer not null default 0
//   );
//   alter table public.subtasks enable row level security;
//   create policy "subtasks_owner" on public.subtasks
//     for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
//   create index subtasks_parent_idx on public.subtasks (parent_task_id, position);
//
//   -- settings (one row per user; user_id is the PK) -------------------------
//   create table public.settings (
//     user_id                 uuid primary key references auth.users(id) on delete cascade,
//     daily_lock_cap_min      integer not null default 180,
//     quiet_hours             jsonb   not null,   -- { start, end } minutes-from-midnight
//     never_lock_categories   jsonb   not null default '[]'::jsonb,
//     stake_strength_bounds   jsonb   not null,   -- { min, max }
//     subscription            jsonb   not null,   -- { status, plan?, trialEndsAt? }
//     scheduling_hours        jsonb   not null,   -- SchedulingHours
//     max_notifications_per_hour integer not null default 1,
//     display_name            text,
//     theme_preference        text    not null default 'system',
//     onboarding_complete     boolean not null default false,
//     calendar_view           text,
//     calendar_zoom_px_per_hour integer,
//     updated_at              bigint  not null
//   );
//   alter table public.settings enable row level security;
//   create policy "settings_owner" on public.settings
//     for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
// ===========================================================================

import type {
  Task,
  Subtask,
  Settings,
  StarterAction,
  RecurrenceRule,
  SourceRef,
  SchedulingHours,
  TimeWindow,
  TaskStatus,
} from "@/types";

// ---------------------------------------------------------------------------
// Row shapes (snake_case, mirror the DB columns above)
// ---------------------------------------------------------------------------

export interface TaskRow {
  id: string;
  user_id: string;
  title: string;
  notes: string | null;
  duration_min: number;
  progress_min: number;
  due: number | null;
  auto_schedule: boolean;
  list_id: string | null;
  project_id: string | null;
  tags: string[];
  first_move: StarterAction | null;
  recurrence: RecurrenceRule | null;
  priority: number | null;
  source_refs: SourceRef[] | null;
  splittable: boolean | null;
  status: TaskStatus;
  completed_at: number | null;
  schedule_subtasks_separately: boolean | null;
  start_after: number | null;
  depends_on: string[] | null;
  min_block_min: number | null;
  max_block_min: number | null;
  buffer_before_min: number | null;
  buffer_after_min: number | null;
  color: string | null;
  scheduling_hours: SchedulingHours | null;
  created_at: number;
  updated_at: number;
}

export interface SubtaskRow {
  id: string;
  parent_task_id: string;
  user_id: string;
  title: string;
  estimated_min: number;
  completed_at: number | null;
  position: number;
}

export interface SettingsRow {
  user_id: string;
  daily_lock_cap_min: number;
  quiet_hours: TimeWindow;
  never_lock_categories: string[];
  stake_strength_bounds: { min: number; max: number };
  subscription: Settings["subscription"];
  scheduling_hours: SchedulingHours;
  max_notifications_per_hour: number;
  display_name: string | null;
  theme_preference: Settings["themePreference"];
  onboarding_complete: boolean;
  calendar_view: string | null;
  calendar_zoom_px_per_hour: number | null;
  updated_at: number;
}

// ---------------------------------------------------------------------------
// Row mappers — Task
// ---------------------------------------------------------------------------

/** App Task -> DB row (subtasks are stored in their own table, excluded here). */
export function taskToRow(task: Task, userId: string): TaskRow {
  return {
    id: task.id,
    user_id: userId,
    title: task.title,
    notes: task.notes ?? null,
    duration_min: task.durationMin,
    progress_min: task.progressMin,
    due: task.due ?? null,
    auto_schedule: task.autoSchedule,
    list_id: task.listId ?? null,
    project_id: task.projectId ?? null,
    tags: task.tags,
    first_move: task.firstMove ?? null,
    recurrence: task.recurrence ?? null,
    priority: task.priority ?? null,
    source_refs: task.sourceRefs ?? null,
    splittable: task.splittable ?? null,
    status: task.status,
    completed_at: task.completedAt ?? null,
    schedule_subtasks_separately: task.scheduleSubtasksSeparately ?? null,
    start_after: task.startAfter ?? null,
    depends_on: task.dependsOn ?? null,
    min_block_min: task.minBlockMin ?? null,
    max_block_min: task.maxBlockMin ?? null,
    buffer_before_min: task.bufferBeforeMin ?? null,
    buffer_after_min: task.bufferAfterMin ?? null,
    color: task.color ?? null,
    scheduling_hours: task.schedulingHours ?? null,
    created_at: task.createdAt,
    updated_at: task.updatedAt,
  };
}

/** DB row (+ its already-fetched subtask rows) -> app Task. `syncState` is 'synced' (came from cloud). */
export function taskFromRow(row: TaskRow, subtaskRows: SubtaskRow[] = []): Task {
  const subtasks = subtaskRows
    .slice()
    .sort((a, b) => a.position - b.position)
    .map(subtaskFromRow);
  return {
    id: row.id,
    title: row.title,
    notes: row.notes ?? undefined,
    durationMin: row.duration_min,
    progressMin: row.progress_min,
    due: row.due ?? undefined,
    autoSchedule: row.auto_schedule,
    listId: row.list_id ?? undefined,
    projectId: row.project_id ?? undefined,
    tags: row.tags ?? [],
    subtasks,
    firstMove: row.first_move ?? undefined,
    recurrence: row.recurrence ?? undefined,
    priority: row.priority ?? undefined,
    sourceRefs: row.source_refs ?? undefined,
    splittable: row.splittable ?? undefined,
    status: row.status,
    completedAt: row.completed_at ?? undefined,
    scheduleSubtasksSeparately: row.schedule_subtasks_separately ?? undefined,
    startAfter: row.start_after ?? undefined,
    dependsOn: row.depends_on ?? undefined,
    minBlockMin: row.min_block_min ?? undefined,
    maxBlockMin: row.max_block_min ?? undefined,
    bufferBeforeMin: row.buffer_before_min ?? undefined,
    bufferAfterMin: row.buffer_after_min ?? undefined,
    color: row.color ?? undefined,
    schedulingHours: row.scheduling_hours ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    syncState: "synced",
  };
}

/** App Subtask -> DB row (needs its parent + owner + ordinal position). */
export function subtaskToRow(
  subtask: Subtask,
  parentTaskId: string,
  userId: string,
  position: number
): SubtaskRow {
  return {
    id: subtask.id,
    parent_task_id: parentTaskId,
    user_id: userId,
    title: subtask.title,
    estimated_min: subtask.estimatedMin,
    completed_at: subtask.completedAt ?? null,
    position,
  };
}

/** DB subtask row -> app Subtask (position is carried by array order upstream). */
export function subtaskFromRow(row: SubtaskRow): Subtask {
  return {
    id: row.id,
    title: row.title,
    estimatedMin: row.estimated_min,
    completedAt: row.completed_at ?? undefined,
  };
}

/** App Settings -> DB row (one per user). */
export function settingsToRow(settings: Settings, userId: string): SettingsRow {
  return {
    user_id: userId,
    daily_lock_cap_min: settings.dailyLockCapMin,
    quiet_hours: settings.quietHours,
    never_lock_categories: settings.neverLockCategories,
    // The `stake_strength_bounds` COLUMN still exists on the settings table, but
    // the bounds stopped being user data in v1 (they are `STAKE_STRENGTH_BOUNDS`
    // in `core/blocking/limits.ts`). Writing the constant keeps the row shape
    // valid without a schema migration; the column can be dropped, and
    // `stake_strength` / `single_session_cap_min` / `default_session_min` added,
    // when the settings table is next migrated.
    stake_strength_bounds: { ...STAKE_STRENGTH_BOUNDS },
    subscription: settings.subscription,
    scheduling_hours: settings.schedulingHours,
    max_notifications_per_hour: settings.maxNotificationsPerHour,
    display_name: settings.displayName ?? null,
    theme_preference: settings.themePreference,
    onboarding_complete: settings.onboardingComplete,
    calendar_view: settings.calendarView ?? null,
    calendar_zoom_px_per_hour: settings.calendarZoomPxPerHour ?? null,
    // Settings has no createdAt/updatedAt in the model; stamp updated_at now so
    // last-write-wins has a comparable value on the row.
    updated_at: Date.now(),
  };
}

/** DB settings row -> app Settings. */
export function settingsFromRow(row: SettingsRow): Settings {
  return {
    dailyLockCapMin: row.daily_lock_cap_min,
    quietHours: row.quiet_hours,
    neverLockCategories: row.never_lock_categories ?? [],
    // The v1 wellbeing fields have no columns yet (see `settingsToRow`), so a
    // synced row falls back to the shipped defaults. The local blob is the
    // source of truth for these until the table gains the columns; a sync merge
    // therefore never silently widens a cap.
    singleSessionCapMin: DEFAULT_SINGLE_SESSION_CAP_MIN,
    defaultSessionMin: DEFAULT_SESSION_MIN,
    stakeStrength: DEFAULT_STAKE_STRENGTH,
    subscription: row.subscription,
    schedulingHours: row.scheduling_hours,
    maxNotificationsPerHour: row.max_notifications_per_hour,
    displayName: row.display_name ?? undefined,
    themePreference: row.theme_preference,
    onboardingComplete: row.onboarding_complete,
    calendarView: row.calendar_view ?? undefined,
    calendarZoomPxPerHour: row.calendar_zoom_px_per_hour ?? undefined,
  };
}

// ---------------------------------------------------------------------------
// Sync functions — all no-op gracefully for guests, never throw.
// ---------------------------------------------------------------------------

/** Resolve the signed-in user id, or null (guest). Swallows errors. */
async function currentUserId(): Promise<string | null> {
  try {
    const user = await getCurrentUser();
    return user?.id ?? null;
  } catch {
    return null;
  }
}

/**
 * Upsert one task (and replace its subtask rows) to the cloud. Fire-and-forget:
 * logs errors, never throws. No-ops for guests.
 */
export async function upsertTask(task: Task): Promise<void> {
  const userId = await currentUserId();
  if (!userId) return;
  try {
    const { error: taskErr } = await supabase.from("tasks").upsert(taskToRow(task, userId));
    if (taskErr) {
      console.warn("[Ampora] upsertTask error:", taskErr.message);
      return;
    }
    // Replace the task's subtasks: delete any that no longer exist, upsert the
    // rest with their current ordinal position.
    const rows = task.subtasks.map((s, i) => subtaskToRow(s, task.id, userId, i));
    if (rows.length > 0) {
      const { error: subErr } = await supabase.from("subtasks").upsert(rows);
      if (subErr) console.warn("[Ampora] upsertTask subtasks error:", subErr.message);
    }
    const keepIds = task.subtasks.map((s) => s.id);
    let del = supabase.from("subtasks").delete().eq("parent_task_id", task.id);
    if (keepIds.length > 0) del = del.not("id", "in", `(${keepIds.join(",")})`);
    const { error: delErr } = await del;
    if (delErr) console.warn("[Ampora] upsertTask subtask cleanup error:", delErr.message);
  } catch (err) {
    console.warn("[Ampora] upsertTask exception:", err);
  }
}

/** Delete a task (subtasks cascade via FK). Fire-and-forget. No-ops for guests. */
export async function deleteTask(taskId: string): Promise<void> {
  const userId = await currentUserId();
  if (!userId) return;
  try {
    const { error } = await supabase.from("tasks").delete().eq("id", taskId);
    if (error) console.warn("[Ampora] deleteTask error:", error.message);
  } catch (err) {
    console.warn("[Ampora] deleteTask exception:", err);
  }
}

/**
 * Pull all of the signed-in user's tasks (with nested subtasks) from the cloud.
 * Returns [] for guests or on error. Caller reconciles last-write-wins.
 */
export async function pullTasks(): Promise<Task[]> {
  const userId = await currentUserId();
  if (!userId) return [];
  try {
    const { data: taskRows, error: taskErr } = await supabase
      .from("tasks")
      .select("*")
      .eq("user_id", userId);
    if (taskErr) {
      console.warn("[Ampora] pullTasks error:", taskErr.message);
      return [];
    }
    if (!taskRows || taskRows.length === 0) return [];

    const ids = (taskRows as TaskRow[]).map((t) => t.id);
    const { data: subRows, error: subErr } = await supabase
      .from("subtasks")
      .select("*")
      .in("parent_task_id", ids);
    if (subErr) console.warn("[Ampora] pullTasks subtasks error:", subErr.message);

    const byParent: Record<string, SubtaskRow[]> = {};
    for (const s of (subRows ?? []) as SubtaskRow[]) {
      (byParent[s.parent_task_id] ??= []).push(s);
    }
    return (taskRows as TaskRow[]).map((row) => taskFromRow(row, byParent[row.id] ?? []));
  } catch (err) {
    console.warn("[Ampora] pullTasks exception:", err);
    return [];
  }
}

/** Upsert the user's Settings row. Fire-and-forget. No-ops for guests. */
export async function upsertSettings(settings: Settings): Promise<void> {
  const userId = await currentUserId();
  if (!userId) return;
  try {
    const { error } = await supabase.from("settings").upsert(settingsToRow(settings, userId));
    if (error) console.warn("[Ampora] upsertSettings error:", error.message);
  } catch (err) {
    console.warn("[Ampora] upsertSettings exception:", err);
  }
}

/**
 * Pull the user's Settings row, or null if none / guest / error. Returns the
 * app-shaped Settings plus the row's `updated_at` so the caller can run
 * last-write-wins against the local copy.
 */
export async function pullSettings(): Promise<{ settings: Settings; updatedAt: number } | null> {
  const userId = await currentUserId();
  if (!userId) return null;
  try {
    const { data, error } = await supabase
      .from("settings")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) {
      console.warn("[Ampora] pullSettings error:", error.message);
      return null;
    }
    if (!data) return null;
    const row = data as SettingsRow;
    return { settings: settingsFromRow(row), updatedAt: row.updated_at };
  } catch (err) {
    console.warn("[Ampora] pullSettings exception:", err);
    return null;
  }
}
