-- Compliance items + reminder engine.
-- Tracks expiring documents (CDL, medical card, DOT annual inspection,
-- registration, insurance, UCR, IFTA decals, endorsements) for drivers,
-- trucks, and the company. A daily edge function (`check-expirations`)
-- reads these tables, sends APNs push to any registered device_tokens,
-- and logs to reminder_deliveries to avoid duplicate sends.
--
-- Polymorphic parent: entity_type ∈ (driver|truck|company) with entity_id
-- kept as text because drivers.id is uuid while trucks.id is bigint in the
-- existing schema. No FK — the app filters by (entity_type, entity_id).

-- ── 1. Enums ────────────────────────────────────────────────────────────────
do $$ begin
  create type compliance_entity as enum ('driver', 'truck', 'company');
exception when duplicate_object then null; end $$;

do $$ begin
  create type compliance_kind as enum (
    'cdl',
    'medical_card',
    'hazmat_endorsement',
    'twic',
    'tsa_precheck',
    'annual_dot_inspection',
    'registration',
    'irp_apportioned_plate',
    'liability_insurance',
    'cargo_insurance',
    'ucr',
    'ifta_decal',
    'drug_alcohol_consortium'
  );
exception when duplicate_object then null; end $$;

-- ── 2. compliance_items ─────────────────────────────────────────────────────
create table if not exists public.compliance_items (
  id           uuid primary key default gen_random_uuid(),
  entity_type  compliance_entity not null,
  entity_id    text,                              -- null when entity_type='company'
  kind         compliance_kind not null,
  issued_at    date,
  expires_at   date not null,
  document_id  uuid references public.load_documents(id) on delete set null,
  notes        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists compliance_items_expires_idx
  on public.compliance_items (expires_at);
create index if not exists compliance_items_entity_idx
  on public.compliance_items (entity_type, entity_id);

-- Touch updated_at on row update so the UI can show last-edit time.
create or replace function public.touch_updated_at() returns trigger as $$
begin
  new.updated_at := now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists compliance_items_touch on public.compliance_items;
create trigger compliance_items_touch
  before update on public.compliance_items
  for each row execute function public.touch_updated_at();

-- ── 3. reminder_rules ───────────────────────────────────────────────────────
-- Each row defines a reminder cadence. A null `kind` means the row applies
-- to any compliance_items kind that does not have a kind-specific rule.
create table if not exists public.reminder_rules (
  id           uuid primary key default gen_random_uuid(),
  kind         compliance_kind,
  days_before  int[] not null default array[90,60,30,7,0,-1],
  created_at   timestamptz not null default now()
);

-- Seed a single global rule so the engine has something to fire on.
insert into public.reminder_rules (kind, days_before)
select null, array[90,60,30,7,0,-1]
where not exists (select 1 from public.reminder_rules where kind is null);

-- ── 4. device_tokens (for APNs routing) ─────────────────────────────────────
create table if not exists public.device_tokens (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  platform   text not null check (platform in ('ios','android','web')),
  token      text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, token)
);

create index if not exists device_tokens_user_idx
  on public.device_tokens (user_id);

drop trigger if exists device_tokens_touch on public.device_tokens;
create trigger device_tokens_touch
  before update on public.device_tokens
  for each row execute function public.touch_updated_at();

-- ── 5. reminder_deliveries (dedup log) ──────────────────────────────────────
-- Prevents sending the same (item, days_before) reminder twice.
create table if not exists public.reminder_deliveries (
  id                  uuid primary key default gen_random_uuid(),
  compliance_item_id  uuid not null references public.compliance_items(id) on delete cascade,
  days_before         int not null,
  recipients          int not null default 0,
  delivered_at        timestamptz not null default now(),
  unique (compliance_item_id, days_before)
);

-- ── 6. Grants + RLS ─────────────────────────────────────────────────────────
grant select, insert, update, delete on
  public.compliance_items,
  public.reminder_rules,
  public.device_tokens,
  public.reminder_deliveries
to authenticated;

alter table public.compliance_items    enable row level security;
alter table public.reminder_rules      enable row level security;
alter table public.device_tokens       enable row level security;
alter table public.reminder_deliveries enable row level security;

drop policy if exists "compliance_items_authenticated_all" on public.compliance_items;
create policy "compliance_items_authenticated_all" on public.compliance_items
  for all to authenticated using (true) with check (true);

drop policy if exists "reminder_rules_authenticated_all" on public.reminder_rules;
create policy "reminder_rules_authenticated_all" on public.reminder_rules
  for all to authenticated using (true) with check (true);

-- Drivers should only upsert their own device token; owners can read all.
drop policy if exists "device_tokens_self_rw" on public.device_tokens;
create policy "device_tokens_self_rw" on public.device_tokens
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "reminder_deliveries_authenticated_select" on public.reminder_deliveries;
create policy "reminder_deliveries_authenticated_select" on public.reminder_deliveries
  for select to authenticated using (true);

-- ── 7. Daily cron ───────────────────────────────────────────────────────────
-- Supabase exposes pg_cron + pg_net. Schedules the edge function at 08:00 UTC.
-- Skipped silently if extensions aren't available (local dev without them).
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
  end if;
  if exists (select 1 from pg_available_extensions where name = 'pg_net') then
    create extension if not exists pg_net;
  end if;
exception when insufficient_privilege then
  -- local dev: user isn't superuser; that's fine.
  null;
end $$;

-- The actual cron schedule is environment-specific (needs project URL + service
-- role JWT as a Vault secret). Apply this manually in the Supabase SQL editor
-- for each environment, substituting <PROJECT-REF> and <SERVICE-ROLE-JWT>:
--
--   select cron.schedule(
--     'check-expirations-daily',
--     '0 8 * * *',
--     $cron$
--       select net.http_post(
--         url := 'https://<PROJECT-REF>.supabase.co/functions/v1/check-expirations',
--         headers := jsonb_build_object(
--           'Authorization', 'Bearer <SERVICE-ROLE-JWT>',
--           'Content-Type', 'application/json'
--         ),
--         body := '{}'::jsonb
--       );
--     $cron$
--   );

notify pgrst, 'reload schema';
