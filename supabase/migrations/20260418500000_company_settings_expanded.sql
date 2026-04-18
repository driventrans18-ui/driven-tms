-- Add the full "From" block fields to company_settings so generated
-- invoices can show MC/DOT numbers, address, and contact info without
-- hard-coding them. Seeds the single singleton row with the operator's
-- defaults (MC# 090949 / DOT# 3126831, 453 Tanton Way Apt A, Webster NY)
-- only when the field is still null — edits in Settings stay intact.

alter table public.company_settings
  add column if not exists address    text,
  add column if not exists city       text,
  add column if not exists state      text,
  add column if not exists zip        text,
  add column if not exists phone      text,
  add column if not exists email      text,
  add column if not exists mc_number  text,
  add column if not exists dot_number text,
  add column if not exists ein        text;

update public.company_settings set
  address    = coalesce(address,    '453 Tanton Way Apt A'),
  city       = coalesce(city,       'Webster'),
  state      = coalesce(state,      'NY'),
  zip        = coalesce(zip,        '14580'),
  mc_number  = coalesce(mc_number,  '090949'),
  dot_number = coalesce(dot_number, '3126831');

notify pgrst, 'reload schema';
