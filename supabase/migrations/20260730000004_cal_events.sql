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
