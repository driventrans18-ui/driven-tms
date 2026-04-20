-- Explicit grants for the service_role used by edge functions.
--
-- The original enable_rls_policies.sql granted CRUD only to `authenticated`.
-- Supabase's default setup usually grants service_role too, but after the
-- JWT signing-key rotation we observed edge functions hitting
-- "permission denied for table loads" even though they authenticate with
-- SUPABASE_SERVICE_ROLE_KEY. Granting explicitly makes the role's access
-- independent of whatever defaults a given project was seeded with.
--
-- Safe to re-run — GRANT is idempotent.

grant usage on schema public to service_role;

grant select, insert, update, delete on
  public.drivers,
  public.trucks,
  public.brokers,
  public.loads,
  public.expenses,
  public.invoices,
  public.maintenance
to service_role;

-- Tables the driver app and AI functions touch that aren't in the base migration.
do $$
declare
  t text;
begin
  foreach t in array array['ai_usage','hos_events','load_checkins','claude_usage']
  loop
    if exists (select 1 from information_schema.tables where table_schema='public' and table_name=t) then
      execute format('grant select, insert, update, delete on public.%I to service_role', t);
    end if;
  end loop;
end $$;

grant usage, select on all sequences in schema public to service_role;

alter default privileges in schema public
  grant select, insert, update, delete on tables to service_role;
alter default privileges in schema public
  grant usage, select on sequences to service_role;

notify pgrst, 'reload schema';
