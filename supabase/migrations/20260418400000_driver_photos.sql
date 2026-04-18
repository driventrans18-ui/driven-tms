-- Driver profile photos. Adds drivers.photo_path + a private `driver-photos`
-- storage bucket. The iOS app uploads the selected photo to
-- `<driver_id>/avatar.jpg`, saves the storage path back to the driver row,
-- and renders a signed URL when present (falls back to initials otherwise).

alter table public.drivers
  add column if not exists photo_path text;

insert into storage.buckets (id, name, public)
values ('driver-photos', 'driver-photos', false)
on conflict (id) do nothing;

drop policy if exists "driver_photos_select" on storage.objects;
drop policy if exists "driver_photos_insert" on storage.objects;
drop policy if exists "driver_photos_update" on storage.objects;
drop policy if exists "driver_photos_delete" on storage.objects;

create policy "driver_photos_select" on storage.objects
  for select to authenticated
  using (bucket_id = 'driver-photos');

create policy "driver_photos_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'driver-photos');

create policy "driver_photos_update" on storage.objects
  for update to authenticated
  using (bucket_id = 'driver-photos')
  with check (bucket_id = 'driver-photos');

create policy "driver_photos_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'driver-photos');

notify pgrst, 'reload schema';
