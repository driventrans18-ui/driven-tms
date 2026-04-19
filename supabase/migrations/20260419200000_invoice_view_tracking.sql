-- Track when a bill-to recipient opens the signed PDF link, so the driver
-- can see proof the invoice was viewed. The client polls last_viewed_at
-- and shows a "Viewed" badge / push notification when it updates.

alter table public.invoices add column if not exists last_viewed_at timestamptz;
alter table public.invoices add column if not exists view_count     int not null default 0;
