-- Add paid tracking to compliance_items so the driver can log when a
-- recurring obligation (IFTA filing, UCR, annual DOT inspection, etc.) was
-- paid and for how much. Used by the iOS app's reminders card.
--
-- paid_date is set when the driver marks the item paid; paid_amount is
-- optional (not all compliance items have a dollar amount — medical card
-- renewals, for example). Both are null when the item is still outstanding.

alter table public.compliance_items
  add column if not exists paid_date   date,
  add column if not exists paid_amount numeric;

notify pgrst, 'reload schema';
