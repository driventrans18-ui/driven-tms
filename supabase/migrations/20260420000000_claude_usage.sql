-- Claude API usage log.
--
-- Every time an edge function calls Anthropic (parse-rate-con,
-- parse-receipt, …) it inserts one row here with the raw token
-- counts returned by the SDK. We store tokens only — costs are
-- computed client-side from a hard-coded price table so a future
-- rate change doesn't require a backfill.
--
-- user_id is nullable so anonymous / unauthenticated invocations
-- (shouldn't happen today but possible) don't block inserts.

create table if not exists public.claude_usage (
  id                 uuid primary key default gen_random_uuid(),
  created_at         timestamptz not null default now(),
  function           text not null,        -- 'parse-rate-con', 'parse-receipt', etc
  model              text not null,        -- e.g. 'claude-sonnet-4-6'
  input_tokens       integer not null default 0,
  output_tokens      integer not null default 0,
  cache_read_tokens  integer not null default 0,
  cache_write_tokens integer not null default 0,
  user_id            uuid references auth.users(id) on delete set null
);

create index if not exists claude_usage_created_idx  on public.claude_usage (created_at desc);
create index if not exists claude_usage_function_idx on public.claude_usage (function);

alter table public.claude_usage enable row level security;

-- Authenticated clients (drivers + admin) can read all rows so the
-- Settings "API usage" card reflects the full company draw, not just
-- one driver. Only the service role — i.e. the edge functions — can
-- write.
drop policy if exists "authenticated read claude_usage" on public.claude_usage;
create policy "authenticated read claude_usage" on public.claude_usage
  for select to authenticated using (true);

notify pgrst, 'reload schema';
