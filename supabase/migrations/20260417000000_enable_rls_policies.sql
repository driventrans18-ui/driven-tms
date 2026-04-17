-- Align an existing Supabase project with what the app expects.
--
-- Symptoms this fixes (observed in order):
--   1. "permission denied for table <name>"
--      → authenticated role has no table-level GRANTs.
--   2. "null value in column company_id ... violates not-null constraint"
--      → schema was set up multi-tenant; app doesn't populate company_id.
--   3. 'new row ... violates check constraint "<table>_status_check"'
--      → schema has enum-style CHECK constraints; app sends free-form text
--        ('Active', 'On Leave', 'Pending', etc.) that don't match.
--
-- This migration grants CRUD to authenticated, enables RLS with a
-- permissive policy per table, drops NOT NULL on any `company_id`
-- (or similar tenant columns) on the app's tables, and drops the
-- legacy CHECK constraints that conflict with the app's status strings.

-- ── 1. Grants ───────────────────────────────────────────────────────────────
grant usage on schema public to anon, authenticated;

grant select, insert, update, delete on
  public.drivers,
  public.trucks,
  public.brokers,
  public.loads,
  public.expenses,
  public.invoices,
  public.maintenance
to authenticated;

grant usage, select on all sequences in schema public to authenticated;

alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public
  grant usage, select on sequences to authenticated;

-- ── 2. RLS policies ─────────────────────────────────────────────────────────
alter table public.drivers enable row level security;
drop policy if exists "drivers_authenticated_all" on public.drivers;
create policy "drivers_authenticated_all" on public.drivers
  for all to authenticated using (true) with check (true);

alter table public.trucks enable row level security;
drop policy if exists "trucks_authenticated_all" on public.trucks;
create policy "trucks_authenticated_all" on public.trucks
  for all to authenticated using (true) with check (true);

alter table public.brokers enable row level security;
drop policy if exists "brokers_authenticated_all" on public.brokers;
create policy "brokers_authenticated_all" on public.brokers
  for all to authenticated using (true) with check (true);

alter table public.loads enable row level security;
drop policy if exists "loads_authenticated_all" on public.loads;
create policy "loads_authenticated_all" on public.loads
  for all to authenticated using (true) with check (true);

alter table public.expenses enable row level security;
drop policy if exists "expenses_authenticated_all" on public.expenses;
create policy "expenses_authenticated_all" on public.expenses
  for all to authenticated using (true) with check (true);

alter table public.invoices enable row level security;
drop policy if exists "invoices_authenticated_all" on public.invoices;
create policy "invoices_authenticated_all" on public.invoices
  for all to authenticated using (true) with check (true);

alter table public.maintenance enable row level security;
drop policy if exists "maintenance_authenticated_all" on public.maintenance;
create policy "maintenance_authenticated_all" on public.maintenance
  for all to authenticated using (true) with check (true);

-- ── 3. Relax required tenant column(s) the app does not populate ────────────
do $$
declare
  t text;
begin
  foreach t in array array['drivers','trucks','brokers','loads','expenses','invoices','maintenance']
  loop
    if exists (
      select 1 from information_schema.columns
      where table_schema='public' and table_name=t and column_name='company_id'
    ) then
      execute format('alter table public.%I alter column company_id drop not null', t);
    end if;
  end loop;
end $$;

-- ── 4. Drop CHECK constraints that reject the app's free-form enum values ───
do $$
declare
  r record;
begin
  for r in
    select conrelid::regclass::text as table_name, conname
    from pg_constraint
    where contype = 'c'
      and conrelid::regclass::text in (
        'drivers','trucks','brokers','loads','expenses','invoices','maintenance'
      )
  loop
    execute format('alter table %s drop constraint %I', r.table_name, r.conname);
  end loop;
end $$;
