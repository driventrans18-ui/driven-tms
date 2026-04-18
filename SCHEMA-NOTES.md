# Driven TMS — Schema Notes & Migration Roadmap

**Version:** 0.1
**Companions:** `AUDIT.md`, `DESIGN.md`
**Status:** **no migrations are written by this document.** Every item below
is a spec for a migration that will land in a later phase, after the
corresponding feature work is approved.

Existing migrations under `supabase/migrations/` are not modified. The last
applied migration is `20260417800000_trailers_and_filings.sql`; a follow-up
`20260418000000_load_documents_freight_kind.sql` (on branch
`claude/fix-photo-upload-uYU53`) permits `kind = 'freight'` on
`load_documents` and should merge independently of this overhaul.

---

## 1. Invoice type — factored vs. direct

### Problem

`invoices` is a flat table with no way to mark whether an invoice was generated
by the owner-operator (direct) or imported/referenced from the factoring
company (factored). The brief is explicit: the TMS must **not** auto-generate
factored invoices — factoring handles that — but it must clearly separate the
two worlds so the owner-operator doesn't double-bill a factored load.

Today: `invoices` carries `load_id`, `broker_id`, `customer_id`, `amount`,
`status`, `invoice_number`, `notes`. All invoices coexist in a single tab set
(Draft / Sent / Overdue / Paid). There is no way to answer "which of these am I
responsible for collecting?"

### Migration sketch (future, not written here)

```sql
alter table public.invoices
  add column invoice_type text not null default 'direct'
    check (invoice_type in ('direct', 'factored'));

alter table public.invoices
  add column factoring_reference text;         -- 3PL invoice/batch ID

alter table public.invoices
  add column source text not null default 'manual'
    check (source in ('manual', 'import', 'api'));

create index invoices_invoice_type_idx on public.invoices (invoice_type);
```

Backfill: all existing rows default to `'direct'` — the safe assumption for a
single-seat app. User can relabel from the Invoices page if needed.

### UI consequences (tracked in DESIGN.md §5.6)

- `InvoiceCard` carries a mandatory type badge (Factored / Direct).
- Factored invoices are read-only by default in the UI; "Mark Paid" is the
  only transition available (factoring collects, owner-operator records the
  payoff).
- Direct invoices use the full new invoice module (PDF, email, line items).

---

## 2. Invoice line items

### Problem

`invoices` has a single `amount` field. A direct invoice to, say, another
carrier for TONU or a reposition needs itemized lines: base rate, miles,
fuel surcharge, detention, lumper, etc. Flat amount can't represent that, and
a PDF built from it would look unprofessional.

### Migration sketch

```sql
create table public.invoice_line_items (
  id            uuid primary key default gen_random_uuid(),
  invoice_id    uuid not null references public.invoices(id) on delete cascade,
  load_id       uuid references public.loads(id) on delete set null,
  sort_order    smallint not null default 0,
  description   text not null,
  quantity      numeric(12, 3) default 1,     -- miles, hours, or count
  unit          text,                          -- 'miles', 'flat', 'hour'
  rate          numeric(12, 2) not null,
  amount        numeric(12, 2) generated always as (quantity * rate) stored,
  accessorial   text,                          -- 'detention', 'lumper', etc.
  created_at    timestamptz not null default now()
);

create index invoice_line_items_invoice_idx
  on public.invoice_line_items (invoice_id, sort_order);
```

`invoices.amount` becomes derived — either a generated column
(`sum(line_items.amount)`) via trigger, or a view, or left as the
canonical field with line items feeding it on save. Simpler: **keep
`amount` as canonical and recompute on save** so legacy data stays valid.

### Edge cases

- A direct invoice with zero line items is a draft — UI blocks "Send".
- Factored invoices don't use line items (factoring owns the detail). The UI
  hides the line-item section for `invoice_type = 'factored'`.

---

## 3. Company identity for invoice PDFs

### Problem

`company_settings` today
(`supabase/migrations/20260417300000_customers_settings_logo.sql:27–34`):

```sql
create table company_settings (
  id              uuid primary key default gen_random_uuid(),
  company_name    text,
  logo_path       text,
  factoring_email text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
```

A legal invoice needs much more: a physical address, a USDOT/MC number, an EIN
for 1099s, a phone number, and remit-to instructions.

### Migration sketch

```sql
alter table public.company_settings
  add column legal_name     text,             -- 'Driven Transportation Inc.'
  add column mc_number      text,             -- 'MC-XXXXXX'
  add column dot_number     text,             -- 'USDOT XXXXXXX'
  add column ein            text,             -- IRS EIN
  add column address_line1  text,
  add column address_line2  text,
  add column city           text,
  add column state          char(2),
  add column postal_code    text,
  add column phone          text,
  add column email          text,             -- remit-to email
  add column website        text,
  add column remit_to_name  text,             -- often same as legal_name
  add column ach_info       jsonb;            -- {bank_name, routing, account}

-- Enforce singleton (one row only)
create unique index if not exists company_settings_singleton
  on public.company_settings ((true));
```

ACH info is `jsonb` so it can be partial (not every customer needs it) and
encrypted at rest via Supabase's pgsodium or `vault` if the user wants.

### UI consequences

- Settings page grows an "Invoice Identity" section.
- Invoice PDF header pulls from these fields.
- Warn the user at first save of an invoice if MC# / DOT# / address is missing.

---

## 4. Load status enum

### Problem

`supabase/migrations/20260417000000_enable_rls_policies.sql:148–163` drops
every CHECK constraint on status/enum columns so the app could use free-text
values during rapid iteration. That phase is over; the UI now settles on a
known set (Pending, Assigned, In Transit, Delivered — visible in
`src/pages/Loads.tsx`). Free text lets typos create orphan tabs.

### Migration sketch

```sql
do $$
begin
  if not exists (select 1 from pg_type where typname = 'load_status') then
    create type load_status as enum
      ('Pending', 'Assigned', 'In Transit', 'Delivered', 'Cancelled');
  end if;
end $$;

-- Backfill unknown values into 'Pending' then convert
update public.loads set status = 'Pending'
  where status is null
     or status not in ('Pending','Assigned','In Transit','Delivered','Cancelled');

alter table public.loads
  alter column status type load_status using status::load_status,
  alter column status set default 'Pending',
  alter column status set not null;
```

Same pattern for `invoices.status` (Draft / Sent / Overdue / Paid) and
`expenses.category`.

### UI consequences

Small. TypeScript unions already exist in the page files
(`src/pages/Loads.tsx`, `src/pages/Invoices.tsx`); they become authoritative
instead of decorative.

---

## 5. IFTA miles-by-state

### Problem

IFTA requires quarterly reporting of miles driven in each jurisdiction and
fuel purchased in each jurisdiction. Today:

- `compliance_items` tracks the IFTA decal expiration.
- `tax_deadlines` tracks the quarterly filing due dates.
- **Nothing tracks actual mileage per state.**

`loads` has `origin_state` and `dest_state` as single fields, but a load from
Rochester NY to Laredo TX crosses eight states. Miles in each must be logged.
Expenses already track fuel purchases and the truck's odometer, but not the
state of the pump.

### Migration sketch

```sql
create table public.load_miles_by_state (
  id          uuid primary key default gen_random_uuid(),
  load_id     uuid not null references public.loads(id) on delete cascade,
  state       char(2) not null,
  miles       numeric(10, 2) not null check (miles >= 0),
  source      text not null default 'manual'
    check (source in ('manual', 'routing_api', 'gps_log')),
  created_at  timestamptz not null default now(),
  unique (load_id, state)
);

create index load_miles_by_state_load_idx on public.load_miles_by_state (load_id);

alter table public.expenses
  add column fuel_state char(2);               -- filled for category = 'fuel'
```

Populating `load_miles_by_state`:
- Phase A: manual entry on the load detail page.
- Phase B: compute from origin/dest via a routing API (already present in
  `ios-driver-app/src/lib/estimateMiles.ts`) and persist the per-state split.
- Phase C: derive from `load_checkins` GPS breadcrumbs with reverse-geocoding.

### UI consequences

- New "IFTA" page on web showing a quarter-over-quarter summary: miles by
  state, gallons by state, MPG, net taxable gallons per jurisdiction.
- Filings page links to the relevant IFTA quarter.

---

## 6. Activity log / audit trail

### Problem

No table records state transitions on loads or invoices. If a load moved from
"Assigned" to "Delivered" and someone needs to know when, there's no answer
beyond `updated_at` — which doesn't distinguish a status change from a notes
edit.

### Migration sketch

```sql
create table public.activity_log (
  id            uuid primary key default gen_random_uuid(),
  entity_type   text not null,                  -- 'load','invoice','expense'
  entity_id     uuid not null,
  action        text not null,                  -- 'status_changed','created', ...
  actor_id      uuid references auth.users(id) on delete set null,
  diff          jsonb,                          -- {from: 'Assigned', to: 'Delivered'}
  note          text,
  created_at    timestamptz not null default now()
);

create index activity_log_entity_idx
  on public.activity_log (entity_type, entity_id, created_at desc);
```

Populate via Postgres triggers on `loads` and `invoices` (status change) and
via explicit app-side insert for user-visible events like "emailed to
factoring".

### UI consequences

- Load detail sheet grows a small "History" section below the doc list.
- Invoice detail grows the same.
- No action on existing records — empty history for anything created before
  the trigger lands.

---

## 7. RLS hardening (future)

### Current state

Every table's RLS policy is `for all to authenticated using (true) with check
(true)` (first established in
`supabase/migrations/20260417000000_enable_rls_policies.sql`). That's fine for
a single-seat app where every authenticated user is the owner-operator.

### Risk

If the user ever invites a part-time bookkeeper, a dispatcher, or a co-driver,
they will be able to read and write everything — including ACH info once §3
lands.

### Roadmap

Not multi-tenant (one company, one truck). Just **role-scoped**:

```sql
-- After a user roles column is added
create type app_role as enum ('owner', 'bookkeeper', 'driver');

alter table public.drivers add column role app_role default 'driver';

-- Example policy
drop policy if exists loads_authenticated_all on public.loads;
create policy loads_owner_all on public.loads
  for all to authenticated
  using (exists (
    select 1 from public.drivers d
    where d.user_id = auth.uid() and d.role in ('owner','bookkeeper','driver')
  ))
  with check (exists (
    select 1 from public.drivers d
    where d.user_id = auth.uid() and d.role in ('owner','bookkeeper')
  ));
```

This is a **future** migration. Nothing in the current UX overhaul depends on
it. Listed here so the refactor doesn't paint us into a corner (e.g. don't
hardcode `using(true)` assumptions in the frontend).

---

## 8. Indexes for the pagination work

Per AUDIT §7, tables are unpaginated today. Before shipping pagination:

```sql
create index if not exists loads_created_at_idx
  on public.loads (created_at desc);
create index if not exists loads_status_idx
  on public.loads (status);

create index if not exists invoices_created_at_idx
  on public.invoices (created_at desc);
create index if not exists invoices_status_idx
  on public.invoices (status);
create index if not exists invoices_due_date_idx
  on public.invoices (due_date);

create index if not exists expenses_date_idx
  on public.expenses (expense_date desc);
create index if not exists expenses_category_idx
  on public.expenses (category);
```

Cheap at any data size; no downside to landing early.

---

## 9. Migration ordering (recommended)

If the UX overhaul is approved for follow-up work, schema migrations land in
this order. Each is a separate, small migration file — easy to revert if the
user wants to back out:

1. Indexes for pagination (§8) — zero risk, enables performance fixes.
2. Company identity (§3) — prerequisite for invoice PDFs.
3. Invoice type + factoring_reference (§1) — prerequisite for the invoice
   module split.
4. Invoice line items (§2) — enables PDF generation.
5. Load status enum (§4) — tighten once UI settles.
6. Activity log (§6) — additive, no disruption.
7. IFTA miles-by-state (§5) — additive, paired with new IFTA page.
8. RLS hardening (§7) — last, only when a second user joins.

---

## 10. Out of scope for this document

- Multi-tenant (`company_id` on every table) — not needed.
- Fault/diagnostic tracking on the truck — explicitly excluded per brief.
- Soft-delete / archival — not needed at this data volume.
- Analytics / BI tables — the single-truck dataset is small enough for direct
  queries.

Questions or changes to any of the above go in the Phase 1 kickoff — every
item here is a proposal until the user approves it.
