-- Customers, company settings (logo + factoring email), and invoices.customer_id.
-- Idempotent.

-- ── customers ───────────────────────────────────────────────────────────────
create table if not exists public.customers (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  contact_name text,
  phone        text,
  email        text,
  address      text,
  notes        text,
  created_at   timestamptz not null default now()
);

grant select, insert, update, delete on public.customers to authenticated;
alter table public.customers enable row level security;
drop policy if exists "customers_authenticated_all" on public.customers;
create policy "customers_authenticated_all" on public.customers
  for all to authenticated using (true) with check (true);

-- ── invoices.customer_id ────────────────────────────────────────────────────
alter table public.invoices add column if not exists customer_id uuid
  references public.customers(id) on delete set null;

-- ── company_settings (singleton row) ────────────────────────────────────────
create table if not exists public.company_settings (
  id                uuid primary key default gen_random_uuid(),
  company_name      text,
  logo_path         text,
  factoring_email   text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- Ensure a single row exists so the UI can read/write without checking existence.
insert into public.company_settings (company_name)
select 'Driven Transportation Inc.'
where not exists (select 1 from public.company_settings);

grant select, insert, update, delete on public.company_settings to authenticated;
alter table public.company_settings enable row level security;
drop policy if exists "company_settings_authenticated_all" on public.company_settings;
create policy "company_settings_authenticated_all" on public.company_settings
  for all to authenticated using (true) with check (true);

-- ── Private storage bucket for branding (logo) ──────────────────────────────
insert into storage.buckets (id, name, public)
values ('branding', 'branding', false)
on conflict (id) do nothing;

drop policy if exists "branding_select" on storage.objects;
drop policy if exists "branding_insert" on storage.objects;
drop policy if exists "branding_update" on storage.objects;
drop policy if exists "branding_delete" on storage.objects;

create policy "branding_select" on storage.objects
  for select to authenticated using (bucket_id = 'branding');
create policy "branding_insert" on storage.objects
  for insert to authenticated with check (bucket_id = 'branding');
create policy "branding_update" on storage.objects
  for update to authenticated using (bucket_id = 'branding') with check (bucket_id = 'branding');
create policy "branding_delete" on storage.objects
  for delete to authenticated using (bucket_id = 'branding');

notify pgrst, 'reload schema';
