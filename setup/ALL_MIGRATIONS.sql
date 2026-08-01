-- Ampora schema, all migrations combined for a single paste.
-- Generated from supabase/migrations/. Safe to run once, top to bottom.
-- Excludes 20260730000007 (PENDING_REVIEW): it DROPS columns and needs a look first.


-- ===================================================================
-- 20260730000001_baseline_tasks_subtasks_settings.sql
-- ===================================================================

-- Baseline schema: tasks, subtasks, settings (PRD §9.4, FR-2/FR-9/FR-65).
--
-- IDEMPOTENT ON PURPOSE, unlike every other migration in this directory:
-- these three tables ALREADY EXIST on the live project (created ad hoc,
-- outside any tracked migration, before this directory existed — this file
-- is the first real migration ever committed for Ampora, so it captures that
-- already-live shape as a real, reviewable, reproducible artifact instead of
-- inventing a new one). Written with `if not exists` / `drop policy if
-- exists` throughout so it is SAFE TO RUN AGAINST THE LIVE PROJECT (a no-op
-- where the shape already matches) and ALSO bootstraps a fresh/empty
-- environment (a new Supabase project, a CI database, a teammate's local
-- `supabase start`) from nothing. Every migration after this one is for
-- tables that do not exist anywhere yet, so none of them need this
-- idempotency treatment.
--
-- RLS: every table in this whole migration set is owner-only — a user can
-- read/write only their own rows (`auth.uid() = user_id`). This is
-- single-player with a 13+ age floor (NFR-4, COPPA-safe); there is no
-- sharing, no team, no admin role that needs a broader policy.
--
-- Deleting a user (see supabase/functions/delete-account) cascades through
-- every table below via `on delete cascade` on `user_id` — that is the
-- actual account-deletion mechanism, not application code deleting rows
-- table by table.

create table if not exists public.tasks (
  id           text primary key,
  user_id      uuid not null references auth.users(id) on delete cascade,
  title        text not null,
  notes        text,
  duration_min integer not null default 0,
  progress_min integer not null default 0,
  due          bigint,
  auto_schedule boolean not null default true,
  list_id      text,
  project_id   text,
  tags         jsonb  not null default '[]'::jsonb,
  first_move   jsonb,
  recurrence   jsonb,
  priority     integer,
  source_refs  jsonb,
  splittable   boolean,
  status       text   not null default 'todo',
  completed_at bigint,
  schedule_subtasks_separately boolean,
  start_after  bigint,
  depends_on   jsonb,
  min_block_min integer,
  max_block_min integer,
  buffer_before_min integer,
  buffer_after_min  integer,
  color        text,
  scheduling_hours jsonb,
  created_at   bigint not null,
  updated_at   bigint not null
);
alter table public.tasks enable row level security;
drop policy if exists "tasks_owner" on public.tasks;
create policy "tasks_owner" on public.tasks
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index if not exists tasks_user_updated_idx on public.tasks (user_id, updated_at desc);

-- Subtasks: child rows of a task, ordered by `position` (doc 07 Part 3).
-- `tasks.list_id` / `tasks.project_id` above are plain text columns, not
-- FKs — see migration 0003's header for why a project_id FK is deliberately
-- not added retroactively (same reasoning applies to list_id).
create table if not exists public.subtasks (
  id             text primary key,
  parent_task_id text not null references public.tasks(id) on delete cascade,
  user_id        uuid not null references auth.users(id) on delete cascade,
  title          text not null,
  estimated_min  integer not null default 0,
  completed_at   bigint,
  position       integer not null default 0
);
alter table public.subtasks enable row level security;
drop policy if exists "subtasks_owner" on public.subtasks;
create policy "subtasks_owner" on public.subtasks
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index if not exists subtasks_parent_idx on public.subtasks (parent_task_id, position);

-- Settings: one row per user (user_id IS the primary key, not a separate id).
create table if not exists public.settings (
  user_id                 uuid primary key references auth.users(id) on delete cascade,
  daily_lock_cap_min      integer not null default 180,
  quiet_hours             jsonb   not null,
  never_lock_categories   jsonb   not null default '[]'::jsonb,
  stake_strength_bounds   jsonb   not null,
  subscription            jsonb   not null,
  scheduling_hours        jsonb   not null,
  max_notifications_per_hour integer not null default 1,
  display_name            text,
  theme_preference        text    not null default 'system',
  onboarding_complete     boolean not null default false,
  calendar_view           text,
  calendar_zoom_px_per_hour integer,
  updated_at              bigint  not null
);
alter table public.settings enable row level security;
drop policy if exists "settings_owner" on public.settings;
create policy "settings_owner" on public.settings
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ===================================================================
-- 20260730000002_lists_and_tags.sql
-- ===================================================================

-- Lists and Tags (PRD §9.4, FR-6). New tables — did not exist before this
-- change, so (unlike migration 0001) this is plain, non-idempotent DDL.

create table public.lists (
  id               text primary key,
  user_id          uuid not null references auth.users(id) on delete cascade,
  name             text not null,
  color            text not null,
  scheduling_hours jsonb,
  created_at       bigint not null,
  updated_at       bigint not null
);
alter table public.lists enable row level security;
create policy "lists_owner" on public.lists
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index lists_user_updated_idx on public.lists (user_id, updated_at desc);

create table public.tags (
  id         text primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  name       text not null,
  color      text not null,
  created_at bigint not null,
  updated_at bigint not null
);
alter table public.tags enable row level security;
create policy "tags_owner" on public.tags
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index tags_user_updated_idx on public.tags (user_id, updated_at desc);

-- ===================================================================
-- 20260730000003_projects.sql
-- ===================================================================

-- Projects (doc `06`, PRD FR-82..85). `phases` is a jsonb array of
-- { id, title, done, order } — Phase is an embedded value object with no
-- sync fields of its own (types/index.ts's own comment: "it syncs with the
-- Project"), so it is not a separate table.
--
-- `tasks.project_id` (migration 0001) is deliberately NOT given a foreign
-- key to this table, even though it conceptually references it: tasks and
-- projects sync from two independent stores/subscriptions with no ordering
-- guarantee between them (a task can be pushed before or after the project
-- it links to). A hard FK would make an out-of-order sync fail outright
-- instead of just leaving a soft dangling reference that resolves itself on
-- the next successful project sync. Same reasoning as the stake/lock/proof
-- session_id/task_id columns in migration 0005.

create table public.projects (
  id           text primary key,
  user_id      uuid not null references auth.users(id) on delete cascade,
  title        text not null,
  kind         text not null check (kind in ('deliverable', 'study')),
  deadline     bigint,
  context_line text,
  phases       jsonb not null default '[]'::jsonb,
  percent      integer not null default 0,
  created_at   bigint not null,
  updated_at   bigint not null
);
alter table public.projects enable row level security;
create policy "projects_owner" on public.projects
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index projects_user_updated_idx on public.projects (user_id, updated_at desc);

-- ===================================================================
-- 20260730000004_cal_events.sql
-- ===================================================================

-- CalEvent (PRD §9.4, FR-1). SCHEMA ONLY — no client code populates this
-- table yet. `store/scheduleStore.ts` currently holds only a READ-ONLY cache
-- of external (device-calendar) busy events (`externalEvents`), refetched
-- from the OS calendar on each device; syncing THAT cache through Supabase
-- would duplicate data already stored by Google/Apple/Outlook for zero
-- benefit and cuts against NFR-4 "minimize synced data". There is also no
-- local, user-created CalEvent store yet — FR-1's own "Events" as a
-- user-creatable type is not built end to end today
-- (`components/ui/AddEventModal.tsx` exists but has zero importers). This
-- table exists so the schema is complete and RLS is ready before that
-- feature ships, not because anything writes to it today.
--
-- `starts_at`/`ends_at` rather than `start`/`end`: `end` needs quoting to
-- use as a bare column name in Postgres (not reserved in the SQL standard,
-- but treated specially enough in places to be worth just avoiding).

create table public.cal_events (
  id          text primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  title       text not null,
  starts_at   bigint not null,
  ends_at     bigint not null,
  all_day     boolean,
  source      text not null default 'local' check (source in ('local', 'google', 'apple', 'outlook')),
  external_id text,
  busy        boolean not null default true,
  created_at  bigint not null,
  updated_at  bigint not null
);
alter table public.cal_events enable row level security;
create policy "cal_events_owner" on public.cal_events
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index cal_events_user_updated_idx on public.cal_events (user_id, updated_at desc);

-- ===================================================================
-- 20260730000005_stake_sessions_lock_events_proofs.sql
-- ===================================================================

-- Ignition history: StakeSession, LockEvent, Proof (PRD §9.4, FR-41/77,
-- doc `04`). None of these three app types carry an `updatedAt` — they sync
-- via a union merge (local always wins outright since this device is the
-- sole writer of its own rows, FR-41b; cloud-only rows are adopted), not
-- last-write-wins. See services/supabase.ts's "FULL SYNC COVERAGE" header
-- for the full reasoning.
--
-- `task_id` / `session_id` below are plain indexed text columns, NOT foreign
-- keys, on purpose: these three tables sync from independent store
-- subscriptions with no cross-entity ordering guarantee (a LockEvent can be
-- pushed before or after the StakeSession it belongs to; a StakeSession can
-- be pushed before or after the task it targets, especially for a session
-- started fully offline). A hard FK would make an out-of-order sync fail
-- outright; a soft reference just resolves once every side has synced.
--
-- `scheduledStakes` (armed later, not yet started) deliberately does NOT
-- sync into this table — only history (`sessions`, which already includes
-- the currently active session) does. Syncing a not-yet-armed scheduled
-- stake cross-device would risk a surprise auto-arm on a device the user
-- never configured it on, against FR-41b's per-device independence and the
-- wellbeing rule that a lock must never surprise the user.

create table public.stake_sessions (
  id               text primary key,
  user_id          uuid not null references auth.users(id) on delete cascade,
  task_id          text not null,
  device_id        text not null,
  hold             text not null check (hold in ('session', 'until_done')),
  trigger          text not null check (trigger in ('manual', 'scheduled')),
  session_min      integer,
  start_window_min integer,
  scheduled_at     bigint,
  verification     text not null check (verification in ('honor', 'focus_time', 'photo', 'screenshot')),
  strength         double precision not null default 0.6,
  started_at       bigint,
  ended_at         bigint,
  focus_sec        integer,
  outcome          text check (outcome in ('completed', 'panic_valve', 'timed_out', 'expired', 'session_served'))
);
alter table public.stake_sessions enable row level security;
create policy "stake_sessions_owner" on public.stake_sessions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index stake_sessions_user_idx on public.stake_sessions (user_id, task_id);
create index stake_sessions_started_idx on public.stake_sessions (user_id, started_at desc);

create table public.lock_events (
  id         text primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  session_id text not null,
  type       text not null check (type in (
    'shield_on', 'shield_off', 'panic_valve', 'session_complete',
    'auto_arm', 'cap_reached', 'quiet_hours_release'
  )),
  at         bigint not null
);
alter table public.lock_events enable row level security;
create policy "lock_events_owner" on public.lock_events
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index lock_events_session_idx on public.lock_events (user_id, session_id);
create index lock_events_at_idx on public.lock_events (user_id, at desc);

-- Proof: the private Proof Log (doc `04` §4, "a motivating record of work
-- done"). `uri` is synced as OPAQUE METADATA ONLY — it is a local
-- file://-style path from the device that captured the proof, and will NOT
-- resolve to real image bytes on a different device (and is unlikely to
-- resolve even on the same device after a true reinstall — the sandboxed
-- file is gone, only this column's string survives). A real cross-device/
-- durable photo-proof implementation would need to upload the image to
-- object storage (e.g. Supabase Storage) and store a fetchable storage
-- key/URL here instead of a bare local path — that upload step does not
-- exist and is not implemented by this migration or the sync code that
-- populates this table.
create table public.proofs (
  id          text primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  session_id  text not null,
  method      text not null check (method in ('honor', 'focus_time', 'photo', 'screenshot')),
  uri         text,
  ai_verdict  text check (ai_verdict in ('pass', 'uncertain')),
  overridden  boolean,
  at          bigint not null
);
alter table public.proofs enable row level security;
create policy "proofs_owner" on public.proofs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index proofs_session_idx on public.proofs (user_id, session_id);
create index proofs_at_idx on public.proofs (user_id, at desc);

-- ===================================================================
-- 20260730000006_app_events.sql
-- ===================================================================

-- AppEvent: the on-device analytics log (PRD §10). Powers only the two
-- headline launch metrics (session completion rate, time-to-start) — nothing
-- reads it to change app behavior. Additions-only from the client
-- (`store/eventLogStore.ts` has no per-item delete; the local 500-event cap
-- trims the oldest without chasing down and deleting the matching cloud row
-- — a proportionate simplification for a log this low-stakes, see
-- services/supabase.ts).

create table public.app_events (
  id      text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  type    text not null,
  at      bigint not null
);
alter table public.app_events enable row level security;
create policy "app_events_owner" on public.app_events
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index app_events_at_idx on public.app_events (user_id, at desc);

-- ===================================================================
-- 20260730000008_settings_never_lock_categories_check.sql
-- ===================================================================

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
