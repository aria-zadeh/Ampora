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
