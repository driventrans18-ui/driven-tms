# Supabase

## Fixing "permission denied" / schema mismatch errors

The app talks to Supabase directly from the browser using the anon key and,
once a user signs in, as the `authenticated` role. If the project was set up
from a different schema (e.g. a multi-tenant template), new inserts fail
with errors like:

- `permission denied for table <name>` — role has no table-level GRANT.
- `null value in column "company_id" … violates not-null constraint` — the
  template added a tenant column the app does not populate.
- `new row … violates check constraint "<table>_status_check"` — the template
  enforces an enum whose values differ from the strings the app sends.

`migrations/20260417000000_enable_rls_policies.sql` handles all three:

1. Grants CRUD to `authenticated` on the seven app tables.
2. Enables RLS and adds a permissive `FOR ALL` policy per table.
3. Drops `NOT NULL` on any `company_id` column so the app's inserts succeed.
4. Drops all CHECK constraints on the app tables so free-form status
   strings (`Active`, `Pending`, etc.) are accepted.

Tables covered: `drivers`, `trucks`, `brokers`, `loads`, `expenses`,
`invoices`, `maintenance`.

### Apply it (Supabase dashboard)

1. Open the project → **SQL Editor** → **New query**.
2. Paste the contents of the migration file.
3. Run it.

Re-running is safe — each `create policy` is preceded by `drop policy if
exists`.

### Apply it (Supabase CLI)

```
supabase db push
```

### Tightening access later

The current policies let any authenticated user read and write every row. If
the app becomes multi-tenant, replace each policy with one keyed on
`auth.uid()` and a `user_id`/`org_id` column on the table.
