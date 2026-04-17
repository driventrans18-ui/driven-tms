-- Tables & schema changes the iOS driver app needs.

-- 1. Link a driver row to an auth user so "my loads" knows who's signed in.
alter table public.drivers add column if not exists user_id uuid references auth.users(id) on delete set null;
create unique index if not exists drivers_user_id_unique on public.drivers(user_id) where user_id is not null;

-- 2. Hours-of-service event log. One open row (ended_at = null) per driver
--    at a time; the app closes it and opens a new one on each status change.
create table if not exists public.hos_events (
  id         uuid primary key default gen_random_uuid(),
  driver_id  uuid not null references public.drivers(id) on delete cascade,
  status     text not null check (status in ('off_duty', 'sleeper', 'driving', 'on_duty')),
  started_at timestamptz not null default now(),
  ended_at   timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists hos_events_driver_started_idx on public.hos_events (driver_id, started_at desc);

-- 3. GPS check-ins, optionally tied to a load.
create table if not exists public.load_checkins (
  id         uuid primary key default gen_random_uuid(),
  load_id    uuid references public.loads(id) on delete cascade,
  driver_id  uuid references public.drivers(id) on delete set null,
  latitude   numeric,
  longitude  numeric,
  note       text,
  created_at timestamptz not null default now()
);
create index if not exists load_checkins_load_idx   on public.load_checkins (load_id);
create index if not exists load_checkins_driver_idx on public.load_checkins (driver_id);

-- 4. Grants + RLS for the new tables.
grant select, insert, update, delete on public.hos_events     to authenticated;
grant select, insert, update, delete on public.load_checkins  to authenticated;

alter table public.hos_events    enable row level security;
alter table public.load_checkins enable row level security;

drop policy if exists "hos_events_authenticated_all" on public.hos_events;
create policy "hos_events_authenticated_all" on public.hos_events
  for all to authenticated using (true) with check (true);

drop policy if exists "load_checkins_authenticated_all" on public.load_checkins;
create policy "load_checkins_authenticated_all" on public.load_checkins
  for all to authenticated using (true) with check (true);

notify pgrst, 'reload schema';
