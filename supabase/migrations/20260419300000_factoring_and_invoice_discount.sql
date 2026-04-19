-- Factoring deduction + per-invoice discount + per-invoice tax.
--
-- Factoring_enabled / factoring_pct live on company_settings so the
-- rate applies to every generated invoice without re-typing it.
-- Default rate is 1.5% — the typical non-recourse factor cut — but
-- editable from Settings any time.
--
-- Discount_pct and tax_pct are per-invoice (loyalty discount, early-pay
-- incentive, sales tax on accessorials / warehousing, etc.) and
-- nullable; null = no discount / no tax.

alter table public.company_settings
  add column if not exists factoring_enabled boolean not null default false,
  add column if not exists factoring_pct     numeric;

alter table public.invoices
  add column if not exists discount_pct numeric,
  add column if not exists tax_pct      numeric;

notify pgrst, 'reload schema';
