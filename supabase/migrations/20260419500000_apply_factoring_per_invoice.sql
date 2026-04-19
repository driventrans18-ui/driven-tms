-- Per-invoice and per-load override for the factoring deduction.
--
-- Before this migration, factoring was purely a company_settings flag
-- (`factoring_enabled`) applied to every generated invoice. Drivers
-- need to opt in / out on individual invoices — e.g. a factored load
-- paired with a direct-bill load — so we add a nullable boolean:
--   null  -> fall back to company_settings.factoring_enabled
--   true  -> apply factoring on this row
--   false -> don't apply factoring on this row
--
-- Carrying the flag on loads lets the driver tick "apply factoring"
-- at rate-con upload time and have the setting propagate to the
-- invoice when the load is attached.

alter table public.invoices
  add column if not exists apply_factoring boolean;

alter table public.loads
  add column if not exists apply_factoring boolean;

notify pgrst, 'reload schema';
