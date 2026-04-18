-- Trailers as first-class entities (reusable across loads) and tax/regulatory
-- filing deadlines (IFTA quarterly, Form 2290 annual, UCR annual). Both are
-- nullable additions; no existing rows change.

-- ── Trailers ────────────────────────────────────────────────────────────────
create table if not exists public.trailers (
  id             uuid primary key default gen_random_uuid(),
  trailer_number text,
  make           text,
  model          text,
  year           int,
  vin            text,
  license_plate  text,
  status         text,
  notes          text,
  created_at     timestamptz not null default now()
);

grant select, insert, update, delete on public.trailers to authenticated;
alter table public.trailers enable row level security;
drop policy if exists "trailers_authenticated_all" on public.trailers;
create policy "trailers_authenticated_all" on public.trailers
  for all to authenticated using (true) with check (true);

alter table public.loads add column if not exists trailer_id uuid
  references public.trailers(id) on delete set null;

-- Named shipper / receiver at each end of the load. Optional; lets you
-- see whether you've hauled for "Walmart DC #4321" before and the average
-- rating across those loads.
alter table public.loads add column if not exists shipper_name  text;
alter table public.loads add column if not exists receiver_name text;

-- ── Tax / regulatory filing deadlines ──────────────────────────────────────
-- kind: 'ifta' (quarterly), '2290' (annual heavy-vehicle use tax),
--       'ucr'  (annual Unified Carrier Registration), 'other'
create table if not exists public.tax_deadlines (
  id         uuid primary key default gen_random_uuid(),
  kind       text not null check (kind in ('ifta','2290','ucr','other')),
  period     text not null,          -- e.g. "Q1 2026", "2026"
  due_date   date not null,
  filed_on   date,
  notes      text,
  created_at timestamptz not null default now(),
  unique (kind, period)
);

grant select, insert, update, delete on public.tax_deadlines to authenticated;
alter table public.tax_deadlines enable row level security;
drop policy if exists "tax_deadlines_authenticated_all" on public.tax_deadlines;
create policy "tax_deadlines_authenticated_all" on public.tax_deadlines
  for all to authenticated using (true) with check (true);

-- Seed the standard deadlines for the current and next fiscal year. Skip
-- anything already inserted (unique constraint makes this idempotent).
insert into public.tax_deadlines (kind, period, due_date) values
  ('ifta', 'Q1 2026', '2026-04-30'),
  ('ifta', 'Q2 2026', '2026-07-31'),
  ('ifta', 'Q3 2026', '2026-10-31'),
  ('ifta', 'Q4 2026', '2027-01-31'),
  ('ifta', 'Q1 2027', '2027-04-30'),
  ('ifta', 'Q2 2027', '2027-07-31'),
  ('2290', '2026',    '2026-08-31'),
  ('2290', '2027',    '2027-08-31'),
  ('ucr',  '2026',    '2025-12-31'),
  ('ucr',  '2027',    '2026-12-31')
on conflict (kind, period) do nothing;

notify pgrst, 'reload schema';
