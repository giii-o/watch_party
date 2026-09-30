-- ============================================================
-- Watch Party: COMPLETE DATABASE SCHEMA (the only file you need)
-- ============================================================
-- How to run this:
--   Supabase -> SQL Editor -> paste this whole file -> Run.
--   Safe to run again at any time — every statement is guarded,
--   so it repairs an existing database AND builds a fresh one.
--
-- What the app needs (nothing else):
--   1. The "rooms" table — the middle ground. One row = one party.--   Its columns carry the shared playback truth:
--     active_video_id  — which video
--     is_playing       — playing or paused
--     position_seconds — where, as of state_updated_at
--     playback_rate    — the room's shared playback speed (1 = normal)
--     state_updated_at — when the truth was last written
--     closed_at        — NULL = the party is live
--   2. Row Level Security: everyone may read, only the host may write.
--   3. Realtime: room updates are PUSHED to every browser live.
--   4. NO playlist feature — any leftover playlist table is removed.
--   5. The "demo_signups" table — the landing-page waitlist (email only).
-- ============================================================

-- ------------------------------------------------------------
-- 1. The rooms table (created only if it does not exist yet)
-- ------------------------------------------------------------
create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  room_code text not null unique,
  name text not null default 'Our watch party',
  host_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  active_video_id text,
  is_playing boolean not null default false,
  position_seconds double precision not null default 0,
  playback_rate double precision not null default 1,
  state_updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  closed_at timestamptz
);

-- Older databases may miss columns that were added later.
-- Each line only adds what is actually missing.
alter table public.rooms
  add column if not exists active_video_id text,
  add column if not exists is_playing boolean not null default false,
  add column if not exists position_seconds double precision not null default 0,
  add column if not exists playback_rate double precision not null default 1,
  add column if not exists state_updated_at timestamptz not null default now(),
  add column if not exists closed_at timestamptz;

-- The database stamps the logged-in user as host automatically.
-- (Without this default, room creation can fail the security check.)
alter table public.rooms
  alter column host_id set default auth.uid();

-- Room codes must be unique, even on very old databases.
create unique index if not exists rooms_room_code_key
  on public.rooms (room_code);

-- ------------------------------------------------------------
-- 2. Row Level Security: the database enforces who may do what
-- ------------------------------------------------------------
alter table public.rooms enable row level security;

-- Policies are dropped and re-created so re-running this file
-- always leaves the rules in exactly the right state.
drop policy if exists "Rooms are viewable by everyone" on public.rooms;
create policy "Rooms are viewable by everyone"
  on public.rooms for select
  using (true);

drop policy if exists "Logged-in users can create rooms they host" on public.rooms;
create policy "Logged-in users can create rooms they host"
  on public.rooms for insert
  with check (auth.uid() = host_id);

drop policy if exists "Hosts can update their rooms" on public.rooms;
create policy "Hosts can update their rooms"
  on public.rooms for update
  using (auth.uid() = host_id);

drop policy if exists "Hosts can delete their rooms" on public.rooms;
create policy "Hosts can delete their rooms"
  on public.rooms for delete
  using (auth.uid() = host_id);

-- ------------------------------------------------------------
-- 3. Realtime: push room updates to every browser
-- ------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'rooms'
  ) then
    alter publication supabase_realtime add table public.rooms;
  end if;
end $$;

-- ------------------------------------------------------------
-- 4. Remove the playlist feature (it was cut from the app)
-- ------------------------------------------------------------
do $$
begin
  if exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'playlist_items'
  ) then
    alter publication supabase_realtime drop table public.playlist_items;
  end if;
end $$;

drop table if exists public.playlist_items;

-- ------------------------------------------------------------
-- 5. The landing-page waitlist (the /demo page's email form)
-- ------------------------------------------------------------
create table if not exists public.demo_signups (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  created_at timestamptz not null default now()
);

-- Anyone may leave their email (the form has no login);
-- nobody may read, change, or delete other people's rows.
alter table public.demo_signups enable row level security;

drop policy if exists "Anyone can join the waitlist" on public.demo_signups;
create policy "Anyone can join the waitlist"
  on public.demo_signups for insert
  with check (true);
