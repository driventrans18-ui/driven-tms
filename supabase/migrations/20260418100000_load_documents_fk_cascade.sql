-- Fix: deleting a load fails with
--   "null value in column load_id of relation load_documents violates not-null constraint"
--
-- Root cause: migration 20260417000000_enable_rls_policies.sql:165-196 loops
-- over every FK referencing the seven app tables (incl. `loads`) and rewrites
-- them to ON DELETE SET NULL. That's the right behavior for most children,
-- but load_documents.load_id is NOT NULL, so the SET NULL action itself
-- violates the column constraint when the parent load is deleted.
--
-- A child document has no meaning without its load, so restore the original
-- CASCADE behavior from 20260417100000_load_documents.sql.
--
-- Idempotent: drops any existing FK on load_documents.load_id and re-creates
-- it with ON DELETE CASCADE.

do $$
declare
  r record;
begin
  for r in
    select con.conname
    from pg_constraint con
    where con.contype = 'f'
      and con.conrelid  = 'public.load_documents'::regclass
      and con.confrelid = 'public.loads'::regclass
  loop
    execute format('alter table public.load_documents drop constraint %I', r.conname);
  end loop;
end $$;

alter table public.load_documents
  add constraint load_documents_load_id_fkey
  foreign key (load_id) references public.loads(id) on delete cascade;

notify pgrst, 'reload schema';
