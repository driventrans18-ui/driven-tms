-- Load documents: rate confirmations, proofs of delivery, and other files
-- attached to a load. Files live in the private `load-documents` storage
-- bucket; this table tracks metadata and pairs each row to a storage path.

create table if not exists public.load_documents (
  id           uuid primary key default gen_random_uuid(),
  load_id      uuid not null references public.loads(id) on delete cascade,
  kind         text not null check (kind in ('rate_con', 'pod', 'other')),
  storage_path text not null,
  file_name    text not null,
  mime_type    text,
  file_size    bigint,
  created_at   timestamptz not null default now()
);

create index if not exists load_documents_load_id_idx on public.load_documents (load_id);

-- Grants + RLS for signed-in users.
grant select, insert, update, delete on public.load_documents to authenticated;

alter table public.load_documents enable row level security;

drop policy if exists "load_documents_authenticated_all" on public.load_documents;
create policy "load_documents_authenticated_all" on public.load_documents
  for all to authenticated using (true) with check (true);

-- Private storage bucket for the actual files.
insert into storage.buckets (id, name, public)
values ('load-documents', 'load-documents', false)
on conflict (id) do nothing;

-- Storage RLS: any authenticated user can read/write objects in this bucket.
drop policy if exists "load_docs_select" on storage.objects;
drop policy if exists "load_docs_insert" on storage.objects;
drop policy if exists "load_docs_update" on storage.objects;
drop policy if exists "load_docs_delete" on storage.objects;

create policy "load_docs_select" on storage.objects
  for select to authenticated
  using (bucket_id = 'load-documents');

create policy "load_docs_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'load-documents');

create policy "load_docs_update" on storage.objects
  for update to authenticated
  using (bucket_id = 'load-documents')
  with check (bucket_id = 'load-documents');

create policy "load_docs_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'load-documents');

notify pgrst, 'reload schema';
