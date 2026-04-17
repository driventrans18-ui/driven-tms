-- Pickup and delivery appointment times on loads.
-- The existing `eta` column is a date; rate cons usually specify an
-- appointment time window. Both fields are nullable.

alter table public.loads add column if not exists pickup_at  timestamptz;
alter table public.loads add column if not exists deliver_by timestamptz;

notify pgrst, 'reload schema';
