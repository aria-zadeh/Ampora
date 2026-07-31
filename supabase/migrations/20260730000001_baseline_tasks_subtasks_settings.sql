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
