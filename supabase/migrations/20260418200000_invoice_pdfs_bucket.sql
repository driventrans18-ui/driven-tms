-- Storage bucket for generated invoice PDFs. The driver app renders invoices
-- client-side, uploads the PDF to this bucket on Share, and flips the invoice
-- from Draft → Sent so the archived copy matches what was actually sent.
-- Private bucket; access is gated by the same "authenticated users only"
-- policy used by load-documents.

insert into storage.buckets (id, name, public)
values ('invoice-pdfs', 'invoice-pdfs', false)
on conflict (id) do nothing;

drop policy if exists "invoice_pdfs_select" on storage.objects;
drop policy if exists "invoice_pdfs_insert" on storage.objects;
drop policy if exists "invoice_pdfs_update" on storage.objects;
drop policy if exists "invoice_pdfs_delete" on storage.objects;

create policy "invoice_pdfs_select" on storage.objects
  for select to authenticated
  using (bucket_id = 'invoice-pdfs');

create policy "invoice_pdfs_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'invoice-pdfs');

create policy "invoice_pdfs_update" on storage.objects
  for update to authenticated
  using (bucket_id = 'invoice-pdfs')
  with check (bucket_id = 'invoice-pdfs');

create policy "invoice_pdfs_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'invoice-pdfs');

notify pgrst, 'reload schema';
