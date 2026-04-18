-- Loads get three new optional columns:
--   deadhead_miles   — empty miles driven before pickup
--   pickup_rating    — 1..5 star rating for the pickup shipper
--   pickup_notes     — free-form notes about the pickup experience
--   delivery_rating  — 1..5 star rating for the delivery receiver
--   delivery_notes   — free-form notes about the delivery experience
-- All nullable so existing rows stay valid.

alter table public.loads add column if not exists deadhead_miles  numeric;
alter table public.loads add column if not exists pickup_rating   int;
alter table public.loads add column if not exists pickup_notes    text;
alter table public.loads add column if not exists delivery_rating int;
alter table public.loads add column if not exists delivery_notes  text;

-- Guard rating values in 1..5. Use DO blocks so re-runs don't error.
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'loads_pickup_rating_range') then
    alter table public.loads add constraint loads_pickup_rating_range
      check (pickup_rating is null or pickup_rating between 1 and 5);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'loads_delivery_rating_range') then
    alter table public.loads add constraint loads_delivery_rating_range
      check (delivery_rating is null or delivery_rating between 1 and 5);
  end if;
end $$;

notify pgrst, 'reload schema';
