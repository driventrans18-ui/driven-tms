-- Add a user-editable line-item description to invoices so the driver can
-- override the auto-generated "Load # · Origin to Destination" string that
-- the PDF generator falls back to. Kept nullable so existing invoices
-- continue to use the auto-generated description.

alter table public.invoices add column if not exists description text;
