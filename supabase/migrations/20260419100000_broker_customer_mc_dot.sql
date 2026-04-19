-- Add MC#/DOT# to brokers and customers so invoices can surface those
-- identifiers in the bill-to block. brokers already has mc_number; we
-- add dot_number there, and both keys on customers (some bill-to parties
-- are shippers / factoring companies that also carry DOT numbers).

alter table public.brokers   add column if not exists dot_number text;
alter table public.customers add column if not exists mc_number  text;
alter table public.customers add column if not exists dot_number text;
