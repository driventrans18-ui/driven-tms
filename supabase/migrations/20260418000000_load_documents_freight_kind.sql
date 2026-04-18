-- Allow 'freight' as a load_documents kind. The driver app uploads
-- time-stamped freight photos via the Freight button (Home Quick actions
-- and Loads detail sheet), which is rejected by the original check
-- constraint that only permitted 'rate_con', 'pod', and 'other'.
--
-- Idempotent: safe to re-run.

alter table public.load_documents
  drop constraint if exists load_documents_kind_check;

alter table public.load_documents
  add constraint load_documents_kind_check
  check (kind in ('rate_con', 'pod', 'freight', 'other'));

notify pgrst, 'reload schema';
