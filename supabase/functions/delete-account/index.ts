/**
 * delete-account — Deno edge function (FR-87, Apple guideline 5.1.1(v),
 * GDPR/CCPA erasure).
 *
 * Permanently deletes the CALLING user's own Supabase Auth account. This is
 * the only place account deletion can actually happen: doing it client-side
 * would require the service-role key, which must never ship in the client.
 *
 * SECURITY — read before changing anything here: the user being deleted is
 * taken ONLY from the caller's own, server-verified JWT (a client scoped to
 * the caller's own `Authorization` header, then `auth.getUser()` re-verifies
 * it) — NEVER from a request body or query param. That is what makes this
 * function safe to expose: it can only ever delete the account making the
 * request, never anyone else's. `verify_jwt` is left at its platform default
 * (true) — deliberately NOT set to false like `send-auth-email` (which is
 * called internally by Supabase Auth, not by an end user) — so an
 * unauthenticated request is rejected before this code even runs; the
 * `getUser()` check below is a second, independent confirmation, not the
 * only guard.
 *
 * Row cleanup is automatic, not manual: every table in `supabase/migrations/`
 * that stores user data declares `user_id uuid references auth.users(id) on
 * delete cascade`, so deleting the `auth.users` row cascades through tasks,
 * subtasks, settings, lists, tags, projects, stake_sessions, lock_events,
 * proofs, and app_events in one transaction. If a future migration adds a new
 * user-owned table WITHOUT that cascade, this function will leave orphaned
 * rows behind — the cascade is the actual deletion mechanism, not this file.
 *
 * Env: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY are
 * injected automatically by the edge runtime for every Supabase project —
 * nothing to configure beyond deploying this function.
 */

import { createClient } from "npm:@supabase/supabase-js@2";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return jsonResponse({ error: "unauthorized" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Scoped to the CALLER's own JWT — used only to find out who is asking.
    // getUser() re-verifies the token against Supabase Auth server-side; the
    // caller never gets to just assert its own user id.
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const {
      data: { user },
      error: userErr,
    } = await callerClient.auth.getUser();
    if (userErr || !user) return jsonResponse({ error: "unauthorized" }, 401);

    // Service-role client — the only credential that can actually delete a
    // user. Constructed fresh here, never from anything the request supplied,
    // and only ever applied to the id `getUser()` just verified above.
    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error: deleteErr } = await adminClient.auth.admin.deleteUser(user.id);
    if (deleteErr) {
      console.error("delete-account: deleteUser failed:", deleteErr.message);
      return jsonResponse({ error: "delete_failed" }, 500);
    }

    return jsonResponse({ ok: true });
  } catch (err) {
    console.error("delete-account error:", (err as Error).message);
    return jsonResponse({ error: "delete_failed" }, 500);
  }
});
