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
