-- AI usage log + configurable per-token prices. Every Claude call from
-- the client logs a row here with input / output / cache token counts,
-- so the Settings screen can show month-to-date consumption and an
-- estimated dollar cost. Prices live on company_settings so the user
-- can update them if Anthropic changes their rate card.
--
-- Defaults are Claude Sonnet 4.7 list prices ($/MTok):
--   input $3, output $15, cache read $0.30, cache write $3.75.

create table if not exists public.ai_usage (
  id                      uuid primary key default gen_random_uuid(),
  event                   text not null,          -- 'parse_rate_con', 'parse_receipt', etc.
  input_tokens            int  not null default 0,
  output_tokens           int  not null default 0,
  cache_read_tokens       int  not null default 0,
  cache_write_tokens      int  not null default 0,
  created_at              timestamptz not null default now()
);

create index if not exists ai_usage_created_idx on public.ai_usage (created_at desc);

grant select, insert, update, delete on public.ai_usage to authenticated;

alter table public.ai_usage enable row level security;
drop policy if exists "ai_usage_authenticated_all" on public.ai_usage;
create policy "ai_usage_authenticated_all" on public.ai_usage
  for all to authenticated using (true) with check (true);

alter table public.company_settings
  add column if not exists ai_price_input_per_mtok       numeric not null default 3,
  add column if not exists ai_price_output_per_mtok      numeric not null default 15,
  add column if not exists ai_price_cache_read_per_mtok  numeric not null default 0.3,
  add column if not exists ai_price_cache_write_per_mtok numeric not null default 3.75;

notify pgrst, 'reload schema';
