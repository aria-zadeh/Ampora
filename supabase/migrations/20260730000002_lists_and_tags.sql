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
