-- Recurring expense templates + a daily pg_cron job that inserts a regular
-- expenses row on the scheduled day-of-month. Safe to re-run.

create table if not exists public.recurring_expenses (
  id           uuid primary key default gen_random_uuid(),
  category     text not null,
  amount       numeric not null,
  vendor       text,
  notes        text,
  day_of_month int not null check (day_of_month between 1 and 28),
  truck_id     uuid references public.trucks(id) on delete set null,
  active       boolean not null default true,
  last_run_on  date,
  created_at   timestamptz not null default now()
);

grant select, insert, update, delete on public.recurring_expenses to authenticated;
alter table public.recurring_expenses enable row level security;
drop policy if exists "recurring_expenses_authenticated_all" on public.recurring_expenses;
create policy "recurring_expenses_authenticated_all" on public.recurring_expenses
  for all to authenticated using (true) with check (true);

-- pg_cron ships with Supabase Postgres. This is a no-op if already enabled.
create extension if not exists pg_cron;

-- Unschedule any previous version of the job so re-running this migration is idempotent.
do $$
declare
  jid int;
begin
  select jobid into jid from cron.job where jobname = 'materialize-recurring-expenses';
  if jid is not null then
    perform cron.unschedule(jid);
  end if;
end $$;

-- Daily at 06:00 UTC: materialize every active template whose day_of_month
-- is today and that hasn't already run this calendar month.
select cron.schedule(
  'materialize-recurring-expenses',
  '0 6 * * *',
  $$
  with due as (
    select id, category, amount, vendor, notes, truck_id
    from public.recurring_expenses
    where active
      and day_of_month = extract(day from current_date)
      and (last_run_on is null
           or date_trunc('month', last_run_on) < date_trunc('month', current_date))
  ),
  inserted as (
    insert into public.expenses (expense_date, category, amount, vendor, notes, truck_id)
    select current_date, category, amount, vendor, notes, truck_id from due
    returning 1
  )
  update public.recurring_expenses
  set last_run_on = current_date
  where id in (select id from due);
  $$
);

notify pgrst, 'reload schema';
