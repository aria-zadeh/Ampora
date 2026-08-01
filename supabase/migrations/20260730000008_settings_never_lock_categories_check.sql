-- Server-side never-lock enforcement (FR-40, PRD §9.10, docs/04 §7).
--
-- The PRD and §9.10 both promise the six never-lock categories — phone,
-- messages, maps, accessibility, os_settings, ampora
-- (`core/blocking/limits.ts` NEVER_LOCK_CATEGORIES) — are "enforced client
-- and server side." Client-side this is real:
-- `store/migrations/settings.ts#safeNeverLock` re-unions the six into every
-- normalize (on both read and write), and `stakesStore.setSelection` refuses
-- to shield any of them. Server-side, until this migration, there was
-- nothing: `public.settings.never_lock_categories` (migration 0001) was a
-- plain, unconstrained `jsonb` column. A direct API write, a bad manual
-- edit, or a future bug in the client-side union could have shipped a row
-- missing one of the six with nothing to catch it.
--
-- SCOPE — read this before assuming it closes the whole promise. There are
-- two genuinely different things "never-lock" could mean server-side, and
-- only one of them is possible given how stake data actually reaches
-- Supabase today:
--
--   1. The per-session APP SELECTION — which specific apps/categories a
--      shield actually locks (`StakeSelection.applicationTokens` /
--      `.categoryTokens` / `.webDomainTokens`) — is NEVER synced to Supabase
--      at all. `public.stake_sessions` (migration 0005) carries only session
--      metadata: hold, trigger, timing, strength, verification, outcome.
--      There is no selection/token column, by design — the shield itself is
--      applied 100% on-device via `getBlockingStrategy()`, with no server
--      round-trip anywhere in that path (confirmed against
--      `services/supabase.ts#stakeSessionToRow`, which maps every
--      `StakeSession` field EXCEPT any selection data — there isn't any to
--      map). So a constraint here CANNOT stop a shield from including a
--      protected app at the moment a lock is applied, and this migration does
--      not attempt to. That enforcement is necessarily client + (later) OS
--      only, and stays that way until app selections themselves sync
--      somewhere server-readable.
--
--   2. The CONFIGURATION LIST itself — `settings.never_lock_categories`, the
--      identifiers the client is supposed to treat as protected — DOES sync
--      (`services/supabase.ts`: `never_lock_categories: settings.neverLockCategories`,
--      a direct passthrough of the client array). This IS something a
--      database constraint can genuinely guard: that the list can never be
--      persisted without all six protected categories present, matching the
--      guarantee the client already treats as sacred. That is what this
--      migration adds.
--
-- In short: "server-side enforcement" here means the server refuses to store
-- a never-lock list with a gap in it, not that the server participates in
-- the act of locking (it never does, and nothing about the current sync
-- architecture lets it).
--
-- jsonb `@>` (contains) is an order-independent SUBSET check: it passes iff
-- every element of the right-hand array is present in the left-hand array,
-- regardless of extra elements (a user's own earlier always-reachable
-- additions — still permitted to exist, see `safeNeverLock`) or ordering. It
-- is an exact string match per element, which is correct here because the
-- client always writes the canonical lowercase identifiers
-- (`core/blocking/limits.ts` NEVER_LOCK_CATEGORIES) — never a display label.
--
-- Run order: this is migration 8, applied after 20260730000007 (the pending
-- energy-columns drop). It does not depend on 0007 and would apply cleanly
-- before or after it — 8 simply keeps the filenames in one strictly
-- increasing sequence, which is what Supabase sorts on.
--
-- NOT APPLIED BY THIS CHANGE. Written and reviewed here only, per this
-- task's instructions — apply it the normal way (`supabase db push` /
-- the dashboard SQL editor / the Supabase MCP `apply_migration` tool) when
-- ready.

-- Backfill BEFORE constraining: a constraint must never be added against
-- data it would itself reject. Any pre-existing row missing one or more of
-- the six (shouldn't happen given the client-side union, but this migration
-- must not assume that) is repaired first by unioning the six into whatever
-- that row already has — the exact same operation `safeNeverLock` performs
-- client-side, just expressed in SQL. Rows that already satisfy the
-- constraint are left untouched (the `where not (...)` guard), so this is a
-- no-op on a healthy table.
update public.settings
set never_lock_categories = (
  select jsonb_agg(distinct elem)
  from jsonb_array_elements(
    never_lock_categories || '["phone","messages","maps","accessibility","os_settings","ampora"]'::jsonb
  ) as elem
)
where not (
  never_lock_categories @> '["phone","messages","maps","accessibility","os_settings","ampora"]'::jsonb
);

-- Keep the column DEFAULT compliant too, so a raw insert that omits the
-- column entirely (bypassing the application, which always supplies it
-- explicitly today) starts compliant rather than landing on the old empty
-- array default and instantly violating the constraint below.
alter table public.settings
  alter column never_lock_categories
  set default '["phone","messages","maps","accessibility","os_settings","ampora"]'::jsonb;

-- The constraint itself. Fails a write that would drop any of the six; a
-- user's own extra always-reachable entries (anything beyond the six) remain
-- unrestricted.
alter table public.settings
  add constraint settings_never_lock_categories_protected
  check (
    never_lock_categories @> '["phone","messages","maps","accessibility","os_settings","ampora"]'::jsonb
  );
