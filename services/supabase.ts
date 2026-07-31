/**
 * Supabase client — Ampora
 * Uses expo-secure-store for secure auth session persistence on native.
 * Falls back to localStorage on web.
 */

import { createClient, type SupabaseClient, type User, type Session, type AuthChangeEvent } from "@supabase/supabase-js";
import * as SecureStore from "expo-secure-store";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { Platform } from "react-native";
import {
  DEFAULT_SESSION_MIN,
  DEFAULT_SINGLE_SESSION_CAP_MIN,
  DEFAULT_STAKE_STRENGTH,
  STAKE_STRENGTH_BOUNDS,
} from "@/core/blocking/limits";
// Deliberately NOT importing `core/dataExport#wipeAllData` here (it used to be
// called inline from `deleteAccount` below) — `core/dataExport.ts` imports
// `store/syncStore.ts`, which imports THIS file for its upsert/delete/pull
// functions, so importing `wipeAllData` here would close a require cycle
// (dataExport -> syncStore -> supabase -> dataExport). Local-state clearing
// on account deletion now happens the same way it does for an ordinary
// sign-out: reactively, off the `SIGNED_OUT` auth event, in
// `app/_layout.tsx`. See `deleteAccount`'s doc comment below.

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
// can still boot (e.g. local dev without a .env configured yet) instead of
// crashing at import time. Auth/sync calls will fail gracefully in that
// case, matching the existing try/catch handling around every call site —
// this is a dev-environment safety net, not a supported anonymous mode.
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

/**
 * Sign the current user out and clear the session. Deliberately just the raw
 * auth call — it does NOT flush pending pushes or clear local Zustand state
 * itself. Two other places pick up the rest of the work, both reacting to
 * this call rather than being invoked by it, so every sign-out path (this
 * function, and `deleteAccount`'s own internal `supabase.auth.signOut()`)
 * behaves identically:
 *   - a caller that wants unsynced edits to land in the OUTGOING account
 *     before they become unreachable should `await
 *     flushBeforeSignOut()` (`store/syncStore.ts`) first — see
 *     `components/settings/DataSettings.tsx`'s "Sign out" handler;
 *   - `app/_layout.tsx`'s `onAuthStateChange` listener reacts to the
 *     resulting `SIGNED_OUT` event by wiping local state, so a second
 *     account signing in on this device can never have the first account's
 *     tasks/proofs/etc. pulled in and pushed back out under its own id.
 */
export async function signOut(): Promise<void> {
  await supabase.auth.signOut();
}

/**
 * Permanently delete the signed-in user's account — the `auth.users` row AND
 * every row it owns, via `on delete cascade` from every table in
 * `supabase/migrations/`. This is a DIFFERENT action from "wipe this device"
 * (`core/dataExport.ts#wipeAllData`, local-only and reversible by signing
 * back in): account deletion is irreversible and removes the account from
 * every device, not just this one. Settings UI must present these as two
 * separate, clearly-labeled actions, never one button.
 *
 * Required by FR-87 ("Account deletion... in Settings"), Apple guideline
 * 5.1.1(v) (in-app account deletion is mandatory for any app that offers
 * account creation), and GDPR/CCPA erasure rights. The app targets 13+, so
 * this is a launch gate, not a nicety.
 *
 * The deletion itself cannot happen client-side — `auth.admin.deleteUser`
 * needs the Supabase service-role key, which must NEVER ship in the client —
 * so this calls the `delete-account` Edge Function, which independently
 * re-verifies the caller's own JWT server-side and deletes only that account
 * (see `supabase/functions/delete-account/index.ts`; it never trusts a
 * client-supplied user id).
 *
 * On success this signs out (`supabase.auth.signOut()`): a deleted account
 * must never be left signed in locally. It deliberately does NOT call
 * `wipeAllData()` itself (that used to live here, but importing
 * `core/dataExport.ts` from this file closes a require cycle — see the note
 * above the imports). Local state is cleared anyway, and just as reliably:
 * `app/_layout.tsx`'s `onAuthStateChange` listener reacts to the resulting
 * `SIGNED_OUT` event and calls `wipeAllData()` + resets the sync/recovery
 * stores there, the same as it does for an ordinary sign-out — which is
 * exactly what's needed here too, since stale local data must never leak
 * into whichever account signs in next on this device (the local-first sync
 * in `store/syncStore.ts` would otherwise happily push a dead account's old
 * tasks into a new one). Callers still do not need to call `wipeAllData()`
 * themselves. Returns `{ error }`; a null error means the account and all
 * its data are gone.
 */
export async function deleteAccount(): Promise<{ error: Error | null }> {
  try {
    const { data, error } = await supabase.functions.invoke("delete-account", { body: {} });
    if (error) return { error: error as Error };
    if (data && typeof data === "object" && "error" in (data as Record<string, unknown>)) {
      return { error: new Error(String((data as Record<string, unknown>).error)) };
    }
    await supabase.auth.signOut();
    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err : new Error(String(err)) };
  }
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
// Sign in with Apple / Google (FR-87). Both land in the same Supabase auth
// session as the magic-link path above, so `onAuthStateChange` above is the
// ONLY place routing reacts to a successful sign-in for any of the three
// methods — neither function below navigates anywhere itself.
// ---------------------------------------------------------------------------

/**
 * The subset of `expo-apple-authentication`'s default-export surface this
 * file calls. Deliberately a LOCAL structural type, never imported from the
 * real package — this file must typecheck on a Windows/web checkout where
 * that package is NOT installed (it needs native code, so it lives in
 * `native/package-additions.json`, not `package.json`; see that file). Kept
 * in sync BY HAND with `expo-apple-authentication`'s public API. Mirrors this
 * codebase's existing precedent for the identical problem: `core/iap/
 * NativePurchaseStrategy.ts` + `core/iap/nativeTypes.ts` (RevenueCat) and
 * `components/verification/VerificationSheet.tsx`'s `loadImagePicker()`.
 */
interface AppleAuthModule {
  isAvailableAsync(): Promise<boolean>;
  signInAsync(options: { requestedScopes: number[] }): Promise<{
    identityToken: string | null;
    authorizationCode: string | null;
    user: string;
    email: string | null;
    fullName: { givenName?: string | null; familyName?: string | null } | null;
  }>;
  AppleAuthenticationScope: { FULL_NAME: number; EMAIL: number };
}

let cachedAppleAuthModule: AppleAuthModule | null | undefined;

/**
 * Resolve `expo-apple-authentication` via a lazy REQUIRE CALL EXPRESSION —
 * never a static `import`, so `tsc` never needs the package to exist in
 * `node_modules` (a `require()` call is just a function call to `tsc`; only
 * `import`/`export ... from` syntax triggers module resolution). Memoized;
 * never throws — module-absent, Metro-stub, and genuinely-uninstalled all
 * collapse to `null`, so every caller takes the same "unavailable" branch
 * (NFR-7-style fail-safe, matching `NativePurchaseStrategy.resolvePurchasesModule`).
 * iOS-only by construction: never even attempts resolution elsewhere, so this
 * can never affect an Android or web build.
 */
function resolveAppleAuthModule(): AppleAuthModule | null {
  if (Platform.OS !== "ios") return null;
  if (cachedAppleAuthModule !== undefined) return cachedAppleAuthModule;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const required = require("expo-apple-authentication");
    const resolved = (required?.default ?? required) as AppleAuthModule | null;
    cachedAppleAuthModule =
      resolved && typeof resolved.signInAsync === "function" ? resolved : null;
  } catch (err) {
    console.warn(
      "[Ampora] expo-apple-authentication not available, Apple sign-in disabled:",
      err
    );
    cachedAppleAuthModule = null;
  }
  return cachedAppleAuthModule;
}

/**
 * Whether the "Sign in with Apple" button should render at all: iOS, the
 * native module actually resolved, and the device/account supports it. Never
 * throws. Callers should hide the button (not just disable it) when this is
 * false — FR-64 "never block use behind a permission; degrade gracefully".
 */
export async function isAppleSignInAvailable(): Promise<boolean> {
  const mod = resolveAppleAuthModule();
  if (!mod) return false;
  try {
    return await mod.isAvailableAsync();
  } catch {
    return false;
  }
}

/**
 * Sign in with Apple's native ID sheet, then exchange the identity token for a
 * Supabase session via `signInWithIdToken`. Returns `{ error }` — null error
 * means a session now exists (the `onAuthStateChange` listener in
 * `app/_layout.tsx` picks it up and routes onward). A user-cancelled sheet
 * resolves `{ error: null }` (a normal outcome, not a failure) so the screen
 * does not flash an error for a deliberate dismissal.
 */
export async function signInWithApple(): Promise<{ error: Error | null }> {
  const mod = resolveAppleAuthModule();
  if (!mod) {
    return { error: new Error("Sign in with Apple is not available on this device.") };
  }
  try {
    const credential = await mod.signInAsync({
      requestedScopes: [
        mod.AppleAuthenticationScope.FULL_NAME,
        mod.AppleAuthenticationScope.EMAIL,
      ],
    });
    if (!credential.identityToken) {
      return { error: new Error("Apple did not return an identity token.") };
    }
    const { error } = await supabase.auth.signInWithIdToken({
      provider: "apple",
      token: credential.identityToken,
    });
    return { error: error as Error | null };
  } catch (err) {
    const code = (err as { code?: string } | null)?.code;
    // expo-apple-authentication rejects with this code when the user cancels
    // the sheet — a normal outcome, not an error.
    if (code === "ERR_REQUEST_CANCELED") return { error: null };
    return { error: err instanceof Error ? err : new Error(String(err)) };
  }
}

/**
 * Best-effort parse of an OAuth redirect URL's query string AND fragment into
 * a flat key/value map. Handles both the implicit flow (tokens in the `#`
 * fragment) and PKCE (a `code` in the `?` query) without assuming
 * `URLSearchParams` exists globally (React Native's JS engine has not
 * historically guaranteed it) — a small dependency-free parser instead,
 * matching `core/id.ts`'s "zero dependencies, works identically everywhere"
 * house style.
 */
function parseAuthCallbackUrl(url: string): Record<string, string> {
  const out: Record<string, string> = {};
  // A callback URL may carry a `?query`, a `#fragment`, or both (providers
  // differ on which one carries the tokens) — split on both delimiters and
  // merge every `key=value` pair found in any segment after the base URL.
  const segments = url.split(/[?#]/).slice(1);
  for (const segment of segments) {
    for (const pair of segment.split("&")) {
      if (!pair) continue;
      const eq = pair.indexOf("=");
      if (eq === -1) continue;
      const key = decodeURIComponent(pair.slice(0, eq));
      const value = decodeURIComponent(pair.slice(eq + 1));
      if (key) out[key] = value;
    }
  }
  return out;
}

/**
 * Sign in with Google via Supabase's OAuth redirect flow. Needs ZERO new
 * native packages: `expo-web-browser` (native) + a plain redirect
 * (web) are both already dependencies. On web this is a full-page redirect —
 * `detectSessionInUrl: Platform.OS === 'web'` above already picks the session
 * up on return. On native, `WebBrowser.openAuthSessionAsync` opens the
 * provider's consent screen in an in-app browser tab (`ASWebAuthenticationSession`
 * / Chrome Custom Tabs under the hood) and resolves with the app's own
 * redirect URL, which is then parsed for tokens (implicit flow) or a `code`
 * (PKCE) and turned into a session. Returns `{ error }`; a dismissed/cancelled
 * browser sheet resolves `{ error: null }` (normal outcome, not a failure).
 *
 * REQUIRES a one-time dashboard step this code cannot perform: add
 * `ampora://auth/callback` (the native redirect) to Supabase Auth's allowed
 * Redirect URLs, and configure the Google provider (client id/secret) under
 * Authentication -> Providers. See the task report for the full list.
 */
export async function signInWithGoogle(): Promise<{ error: Error | null }> {
  try {
    if (Platform.OS === "web") {
      const redirectTo = typeof window !== "undefined" ? window.location.origin : undefined;
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo },
      });
      return { error: error as Error | null };
    }

    const redirectTo = Linking.createURL("auth/callback");
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo, skipBrowserRedirect: true },
    });
    if (error) return { error: error as Error | null };
    if (!data?.url) return { error: new Error("No authorization URL returned.") };

    const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
    if (result.type !== "success" || !result.url) {
      // Dismissed/cancelled by the user — not an error.
      return { error: null };
    }

    const tokens = parseAuthCallbackUrl(result.url);
    if (tokens.access_token && tokens.refresh_token) {
      const { error: sessionErr } = await supabase.auth.setSession({
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
      });
      return { error: sessionErr as Error | null };
    }
    if (tokens.code) {
      const { error: exchangeErr } = await supabase.auth.exchangeCodeForSession(tokens.code);
      return { error: exchangeErr as Error | null };
    }
    if (tokens.error_description) {
      return { error: new Error(tokens.error_description) };
    }
    return { error: new Error("No session tokens in the Google sign-in callback.") };
  } catch (err) {
    return { error: err instanceof Error ? err : new Error(String(err)) };
  }
}

// ===========================================================================
// CLOUD SYNC (Phase 6, PRD FR-87 + §9.12) — rebuilt on the NEW data model.
//
// Local-first: the app writes Zustand -> MMKV immediately, then fires these
// helpers in the background (see store/syncStore.ts). Every function here
// NO-OPS GRACEFULLY when there is no signed-in user yet (see `currentUserId`'s
// doc comment below — this is a transient state, not a supported anonymous
// mode) and never throws — errors are logged, never surfaced.
//
// Reconciliation is LAST-WRITE-WINS on `updated_at` (epoch ms), with local
// winning ties (§9.12) — EXCEPT for the four single-writer-device log
// entities (StakeSession, LockEvent, Proof, AppEvent, all below), which carry
// no `updatedAt` to compare and instead use a union merge: local always wins
// outright (this device is the sole writer of its own rows, FR-41b), and
// cloud-only rows are adopted (this is what restores Proof Log / stake
// history after a reinstall). The row mappers below translate between the
// camelCase app model (types/index.ts) and snake_case DB columns.
//
// ---------------------------------------------------------------------------
// SQL SCHEMA: see `supabase/migrations/` — that directory, not this comment,
// is now the source of truth. It did not exist before this change; the
// schema previously lived ONLY as a comment here plus whatever was manually
// applied to the live project — untracked, unreviewable, unreproducible. Run
// order and the RLS design are documented in the migration files and in the
// task report that introduced them.
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
  List,
  Tag,
  Project,
  Phase,
  ProjectKind,
  StakeSession,
  LockEvent,
  Proof,
  AppEvent,
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
// Sync functions — all no-op gracefully with no signed-in user, never throw.
// ---------------------------------------------------------------------------

/**
 * Resolve the signed-in user id, or `null`. Swallows errors.
 *
 * IMPORTANT — what `null` means post-FR-87: there is no more permanent,
 * user-facing "guest mode" to conflate this with (removed from `app/auth.tsx`
 * / `app/_layout.tsx` — an account is required). `null` here means only the
 * legitimate TRANSIENT states of "not signed in yet" or "signed out": the
 * brief window during app boot before the auth check resolves, or a session
 * that expired/was revoked between one sync call and the next. Every sync
 * function below treats `null` as "no-op for now, try again later" rather
 * than throwing, which is still correct and necessary for those states — the
 * routing gate in `app/_layout.tsx` is what prevents `null` from ever being a
 * PERMANENT, intentional way to use the app.
 */
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
 * logs errors, never throws. No-ops with no signed-in user.
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

/** Delete a task (subtasks cascade via FK). Fire-and-forget. No-ops with no signed-in user. */
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
 * Delete multiple tasks in one batch (subtasks cascade via FK). Fire-and-
 * forget, scoped to the signed-in user (belt-and-suspenders alongside RLS,
 * matching every other bulk delete below). No-ops with no signed-in user.
 * This is what `store/syncStore.ts`'s per-mutation task pusher calls — see
 * that file for why task deletion needs an explicit push path at all
 * (`reconcileTasks` deliberately never infers a deletion from local absence).
 */
export async function deleteTasks(taskIds: string[]): Promise<void> {
  if (taskIds.length === 0) return;
  const userId = await currentUserId();
  if (!userId) return;
  await deleteRowsById("tasks", userId, taskIds);
}

/**
 * Pull all of the signed-in user's tasks (with nested subtasks) from the cloud.
 * Returns [] with no signed-in user or on error. Caller reconciles last-write-wins.
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

/** Upsert the user's Settings row. Fire-and-forget. No-ops with no signed-in user. */
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
 * Pull the user's Settings row, or null if none / not signed in / error. Returns the
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

// ===========================================================================
// FULL SYNC COVERAGE (FR-87 "cloud is the source of truth") — Lists, Tags,
// Projects, StakeSessions, LockEvents, Proofs, and the on-device AppEvent log.
// Same local-first / fire-and-forget / no-op-for-signed-out contract as
// everything above. The three generic helpers below exist because this is the
// SAME upsert/delete/pull shape repeated seven times — factored out here
// rather than in the Task/Settings functions above so those stay untouched.
//
// NOT synced here, by deliberate decision (see the task report for the full
// reasoning):
//   - `ScheduledBlock` — not asked for by this task, and arguably shouldn't be
//     synced at all: the scheduler is deterministic (NFR-2), so once Tasks +
//     Settings sync, a recompute() on the receiving device regenerates the
//     same schedule from scratch. Owned by `store/scheduleStore.ts`, excluded
//     from this task's file scope anyway.
//   - `StakeApp` (the picker's opted-in-app catalog) and `StakeSelection`
//     (what `applyShield` actually shields) — both hold opaque, per-picker
//     tokens (`docs/05` §1: "never de-anonymized"). A token minted by one
//     device's `FamilyActivityPicker` session is meaningless — and per doc
//     `05` §3.6, not even guaranteed stable — on another device or after a
//     re-pick, and FR-41b makes stakes explicitly per-device and independent.
//     NFR-4 "minimize synced data" further argues against shipping these
//     off-device for zero benefit. Re-selecting apps after a reinstall is a
//     ~10-second native-picker flow, not a real loss.
//   - `StakeSession` rows still in `scheduledStakes` (armed later, not yet
//     started) — only the `sessions` record (history + the currently-active
//     session, which is written into `sessions` immediately per
//     `store/stakesStore.ts`'s own field comment) syncs. Syncing a
//     not-yet-armed scheduled stake cross-device risks a SURPRISE auto-arm on
//     a device the user never configured that stake on, which cuts against
//     FR-41b's per-device independence and the wellbeing rule that a lock must
//     never surprise the user. The task's own motivation for syncing stake
//     data — surviving a reinstall — is about HISTORY (the Proof Log's
//     companion record), not live configuration.
// ===========================================================================

/** Fire-and-forget batch upsert to `table`. Caller has already resolved/checked the user id. */
async function upsertRows(table: string, rows: unknown[]): Promise<void> {
  if (rows.length === 0) return;
  try {
    const { error } = await supabase.from(table).upsert(rows);
    if (error) console.warn(`[Ampora] upsert ${table} error:`, error.message);
  } catch (err) {
    console.warn(`[Ampora] upsert ${table} exception:`, err);
  }
}

/** Fire-and-forget batch delete by id from `table`, scoped to `userId` (belt-and-suspenders alongside RLS). */
async function deleteRowsById(table: string, userId: string, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  try {
    const { error } = await supabase.from(table).delete().eq("user_id", userId).in("id", ids);
    if (error) console.warn(`[Ampora] delete ${table} error:`, error.message);
  } catch (err) {
    console.warn(`[Ampora] delete ${table} exception:`, err);
  }
}

/** Pull every row of `table` belonging to `userId`. Returns [] on any error. */
async function pullRows<T>(table: string, userId: string): Promise<T[]> {
  try {
    const { data, error } = await supabase.from(table).select("*").eq("user_id", userId);
    if (error) {
      console.warn(`[Ampora] pull ${table} error:`, error.message);
      return [];
    }
    return (data ?? []) as T[];
  } catch (err) {
    console.warn(`[Ampora] pull ${table} exception:`, err);
    return [];
  }
}

// ---------------------------------------------------------------------------
// List
// ---------------------------------------------------------------------------

export interface ListRow {
  id: string;
  user_id: string;
  name: string;
  color: string;
  scheduling_hours: SchedulingHours | null;
  created_at: number;
  updated_at: number;
}

export function listToRow(list: List, userId: string): ListRow {
  return {
    id: list.id,
    user_id: userId,
    name: list.name,
    color: list.color,
    scheduling_hours: list.schedulingHours ?? null,
    created_at: list.createdAt,
    updated_at: list.updatedAt,
  };
}

export function listFromRow(row: ListRow): List {
  return {
    id: row.id,
    name: row.name,
    color: row.color,
    schedulingHours: row.scheduling_hours ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    syncState: "synced",
  };
}

export async function upsertLists(lists: List[]): Promise<void> {
  if (lists.length === 0) return;
  const userId = await currentUserId();
  if (!userId) return;
  await upsertRows("lists", lists.map((l) => listToRow(l, userId)));
}

export async function deleteLists(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const userId = await currentUserId();
  if (!userId) return;
  await deleteRowsById("lists", userId, ids);
}

export async function pullLists(): Promise<List[]> {
  const userId = await currentUserId();
  if (!userId) return [];
  const rows = await pullRows<ListRow>("lists", userId);
  return rows.map(listFromRow);
}

// ---------------------------------------------------------------------------
// Tag
// ---------------------------------------------------------------------------

export interface TagRow {
  id: string;
  user_id: string;
  name: string;
  color: string;
  created_at: number;
  updated_at: number;
}

export function tagToRow(tag: Tag, userId: string): TagRow {
  return {
    id: tag.id,
    user_id: userId,
    name: tag.name,
    color: tag.color,
    created_at: tag.createdAt,
    updated_at: tag.updatedAt,
  };
}

export function tagFromRow(row: TagRow): Tag {
  return {
    id: row.id,
    name: row.name,
    color: row.color,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    syncState: "synced",
  };
}

export async function upsertTags(tags: Tag[]): Promise<void> {
  if (tags.length === 0) return;
  const userId = await currentUserId();
  if (!userId) return;
  await upsertRows("tags", tags.map((t) => tagToRow(t, userId)));
}

export async function deleteTags(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const userId = await currentUserId();
  if (!userId) return;
  await deleteRowsById("tags", userId, ids);
}

export async function pullTags(): Promise<Tag[]> {
  const userId = await currentUserId();
  if (!userId) return [];
  const rows = await pullRows<TagRow>("tags", userId);
  return rows.map(tagFromRow);
}

// ---------------------------------------------------------------------------
// Project (+ embedded Phase list, stored as jsonb — Phase has no sync fields
// of its own, per types/index.ts's own comment: "it syncs with the Project")
// ---------------------------------------------------------------------------

export interface ProjectRow {
  id: string;
  user_id: string;
  title: string;
  kind: ProjectKind;
  deadline: number | null;
  context_line: string | null;
  phases: Phase[];
  percent: number;
  created_at: number;
  updated_at: number;
}

export function projectToRow(project: Project, userId: string): ProjectRow {
  return {
    id: project.id,
    user_id: userId,
    title: project.title,
    kind: project.kind,
    deadline: project.deadline ?? null,
    context_line: project.contextLine ?? null,
    phases: project.phases,
    percent: project.percent,
    created_at: project.createdAt,
    updated_at: project.updatedAt,
  };
}

export function projectFromRow(row: ProjectRow): Project {
  return {
    id: row.id,
    title: row.title,
    kind: row.kind,
    deadline: row.deadline ?? undefined,
    contextLine: row.context_line ?? undefined,
    phases: row.phases ?? [],
    percent: row.percent,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    syncState: "synced",
  };
}

export async function upsertProjects(projects: Project[]): Promise<void> {
  if (projects.length === 0) return;
  const userId = await currentUserId();
  if (!userId) return;
  await upsertRows("projects", projects.map((p) => projectToRow(p, userId)));
}

export async function deleteProjects(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const userId = await currentUserId();
  if (!userId) return;
  await deleteRowsById("projects", userId, ids);
}

export async function pullProjects(): Promise<Project[]> {
  const userId = await currentUserId();
  if (!userId) return [];
  const rows = await pullRows<ProjectRow>("projects", userId);
  return rows.map(projectFromRow);
}

// ---------------------------------------------------------------------------
// StakeSession — no `updatedAt`/`syncState` on the app type (see the union-
// merge note in the file header above). History only (`stakesStore.sessions`,
// which already includes the currently-active session) — `scheduledStakes`
// deliberately does not sync, see the file header note.
// ---------------------------------------------------------------------------

export interface StakeSessionRow {
  id: string;
  user_id: string;
  task_id: string;
  device_id: string;
  hold: StakeSession["hold"];
  trigger: StakeSession["trigger"];
  session_min: number | null;
  start_window_min: number | null;
  scheduled_at: number | null;
  verification: StakeSession["verification"];
  strength: number;
  started_at: number | null;
  ended_at: number | null;
  focus_sec: number | null;
  outcome: StakeSession["outcome"] | null;
}

export function stakeSessionToRow(session: StakeSession, userId: string): StakeSessionRow {
  return {
    id: session.id,
    user_id: userId,
    task_id: session.taskId,
    device_id: session.deviceId,
    hold: session.hold,
    trigger: session.trigger,
    session_min: session.sessionMin ?? null,
    start_window_min: session.startWindowMin ?? null,
    scheduled_at: session.scheduledAt ?? null,
    verification: session.verification,
    strength: session.strength,
    started_at: session.startedAt ?? null,
    ended_at: session.endedAt ?? null,
    focus_sec: session.focusSec ?? null,
    outcome: session.outcome ?? null,
  };
}

export function stakeSessionFromRow(row: StakeSessionRow): StakeSession {
  return {
    id: row.id,
    taskId: row.task_id,
    deviceId: row.device_id,
    hold: row.hold,
    trigger: row.trigger,
    sessionMin: row.session_min ?? undefined,
    startWindowMin: row.start_window_min ?? undefined,
    scheduledAt: row.scheduled_at ?? undefined,
    verification: row.verification,
    strength: row.strength,
    startedAt: row.started_at ?? undefined,
    endedAt: row.ended_at ?? undefined,
    focusSec: row.focus_sec ?? undefined,
    outcome: row.outcome ?? undefined,
  };
}

export async function upsertStakeSessions(sessions: StakeSession[]): Promise<void> {
  if (sessions.length === 0) return;
  const userId = await currentUserId();
  if (!userId) return;
  await upsertRows("stake_sessions", sessions.map((s) => stakeSessionToRow(s, userId)));
}

export async function deleteStakeSessions(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const userId = await currentUserId();
  if (!userId) return;
  await deleteRowsById("stake_sessions", userId, ids);
}

export async function pullStakeSessions(): Promise<StakeSession[]> {
  const userId = await currentUserId();
  if (!userId) return [];
  const rows = await pullRows<StakeSessionRow>("stake_sessions", userId);
  return rows.map(stakeSessionFromRow);
}

// ---------------------------------------------------------------------------
// LockEvent — append-only lifecycle log, no `updatedAt`. Additions only (no
// delete path exists in `stakesStore` for `events`).
// ---------------------------------------------------------------------------

export interface LockEventRow {
  id: string;
  user_id: string;
  session_id: string;
  type: LockEvent["type"];
  at: number;
}

export function lockEventToRow(event: LockEvent, userId: string): LockEventRow {
  return {
    id: event.id,
    user_id: userId,
    session_id: event.sessionId,
    type: event.type,
    at: event.at,
  };
}

export function lockEventFromRow(row: LockEventRow): LockEvent {
  return { id: row.id, sessionId: row.session_id, type: row.type, at: row.at };
}

export async function upsertLockEvents(events: LockEvent[]): Promise<void> {
  if (events.length === 0) return;
  const userId = await currentUserId();
  if (!userId) return;
  await upsertRows("lock_events", events.map((e) => lockEventToRow(e, userId)));
}

export async function pullLockEvents(): Promise<LockEvent[]> {
  const userId = await currentUserId();
  if (!userId) return [];
  const rows = await pullRows<LockEventRow>("lock_events", userId);
  return rows.map(lockEventFromRow);
}

// ---------------------------------------------------------------------------
// Proof — the private Proof Log (doc `04` §4: "a motivating record of work
// done"). No `updatedAt`. `uri` is synced AS OPAQUE METADATA ONLY — see the
// task report for the full reasoning, summarized here: it is a local
// `file://`-style path on the device that captured the proof. Round-tripping
// it through sync preserves provenance (which session/task, when, what the
// AI/user decided) but the path will NOT resolve to real image bytes on a
// different device, and is unlikely to resolve even on the SAME device after
// a true reinstall (the sandboxed file is gone, only the DB row's string
// survives). A real cross-device/durable photo-proof implementation would
// need to actually upload the image to object storage (e.g. Supabase Storage)
// and store a fetchable storage key/URL here instead of a bare local path —
// that upload step does not exist and is NOT implemented by this change.
// ---------------------------------------------------------------------------

export interface ProofRow {
  id: string;
  user_id: string;
  session_id: string;
  method: Proof["method"];
  uri: string | null;
  ai_verdict: Proof["aiVerdict"] | null;
  overridden: boolean | null;
  at: number;
}

export function proofToRow(proof: Proof, userId: string): ProofRow {
  return {
    id: proof.id,
    user_id: userId,
    session_id: proof.sessionId,
    method: proof.method,
    uri: proof.uri ?? null,
    ai_verdict: proof.aiVerdict ?? null,
    overridden: proof.overridden ?? null,
    at: proof.at,
  };
}

export function proofFromRow(row: ProofRow): Proof {
  return {
    id: row.id,
    sessionId: row.session_id,
    method: row.method,
    uri: row.uri ?? undefined,
    aiVerdict: row.ai_verdict ?? undefined,
    overridden: row.overridden ?? undefined,
    at: row.at,
  };
}

export async function upsertProofs(proofs: Proof[]): Promise<void> {
  if (proofs.length === 0) return;
  const userId = await currentUserId();
  if (!userId) return;
  await upsertRows("proofs", proofs.map((p) => proofToRow(p, userId)));
}

export async function deleteProofs(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const userId = await currentUserId();
  if (!userId) return;
  await deleteRowsById("proofs", userId, ids);
}

export async function pullProofs(): Promise<Proof[]> {
  const userId = await currentUserId();
  if (!userId) return [];
  const rows = await pullRows<ProofRow>("proofs", userId);
  return rows.map(proofFromRow);
}

// ---------------------------------------------------------------------------
// AppEvent — the on-device analytics log (PRD §10). Additions only, no
// delete propagation: this is internal analytics plumbing, not user-facing
// content like the Proof Log, so the 500-event local cap (`eventLogStore`)
// intentionally does not chase down and delete the matching cloud rows when
// it trims — a proportionate simplification for a log nothing reads to
// change app behavior (see that store's own doc comment).
// ---------------------------------------------------------------------------

export interface AppEventRow {
  id: string;
  user_id: string;
  type: string;
  at: number;
}

export function appEventToRow(event: AppEvent, userId: string): AppEventRow {
  return { id: event.id, user_id: userId, type: event.type, at: event.at };
}

export function appEventFromRow(row: AppEventRow): AppEvent {
  return { id: row.id, type: row.type, at: row.at };
}

export async function upsertAppEvents(events: AppEvent[]): Promise<void> {
  if (events.length === 0) return;
  const userId = await currentUserId();
  if (!userId) return;
  await upsertRows("app_events", events.map((e) => appEventToRow(e, userId)));
}

export async function pullAppEvents(): Promise<AppEvent[]> {
  const userId = await currentUserId();
  if (!userId) return [];
  const rows = await pullRows<AppEventRow>("app_events", userId);
  return rows.map(appEventFromRow);
}
