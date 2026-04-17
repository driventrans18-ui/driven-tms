-- Enable RLS and grant authenticated users full CRUD access on all app tables.
--
-- Why this is needed:
-- The client connects to Supabase using the anon key. After a user logs in,
-- their JWT upgrades the request role to `authenticated`. RLS is on by default
-- in Supabase, so without explicit policies every query/insert fails with
-- "permission denied for table <name>". These policies restore access for any
-- signed-in user while still blocking the public anon role.

-- ── drivers ──────────────────────────────────────────────────────────────────
alter table public.drivers enable row level security;

drop policy if exists "drivers_authenticated_all" on public.drivers;
create policy "drivers_authenticated_all"
  on public.drivers
  for all
  to authenticated
  using (true)
  with check (true);

-- ── trucks ───────────────────────────────────────────────────────────────────
alter table public.trucks enable row level security;

drop policy if exists "trucks_authenticated_all" on public.trucks;
create policy "trucks_authenticated_all"
  on public.trucks
  for all
  to authenticated
  using (true)
  with check (true);

-- ── brokers ──────────────────────────────────────────────────────────────────
alter table public.brokers enable row level security;

drop policy if exists "brokers_authenticated_all" on public.brokers;
create policy "brokers_authenticated_all"
  on public.brokers
  for all
  to authenticated
  using (true)
  with check (true);

-- ── loads ────────────────────────────────────────────────────────────────────
alter table public.loads enable row level security;

drop policy if exists "loads_authenticated_all" on public.loads;
create policy "loads_authenticated_all"
  on public.loads
  for all
  to authenticated
  using (true)
  with check (true);

-- ── expenses ─────────────────────────────────────────────────────────────────
alter table public.expenses enable row level security;

drop policy if exists "expenses_authenticated_all" on public.expenses;
create policy "expenses_authenticated_all"
  on public.expenses
  for all
  to authenticated
  using (true)
  with check (true);

-- ── invoices ─────────────────────────────────────────────────────────────────
alter table public.invoices enable row level security;

drop policy if exists "invoices_authenticated_all" on public.invoices;
create policy "invoices_authenticated_all"
  on public.invoices
  for all
  to authenticated
  using (true)
  with check (true);

-- ── maintenance ──────────────────────────────────────────────────────────────
alter table public.maintenance enable row level security;

drop policy if exists "maintenance_authenticated_all" on public.maintenance;
create policy "maintenance_authenticated_all"
  on public.maintenance
  for all
  to authenticated
  using (true)
  with check (true);
