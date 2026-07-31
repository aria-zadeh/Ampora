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
