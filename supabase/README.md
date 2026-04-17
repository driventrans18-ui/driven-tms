# Supabase

## Fixing "permission denied for table ..." errors

The app talks to Supabase directly from the browser using the anon key. After a
user signs in, requests are made as the `authenticated` role. Supabase enables
Row Level Security by default, and with no policy in place every query/insert
comes back as `permission denied for table <name>`.

`migrations/20260417000000_enable_rls_policies.sql` adds a permissive
`FOR ALL` policy to the `authenticated` role on every table the app uses:
`drivers`, `trucks`, `brokers`, `loads`, `expenses`, `invoices`,
`maintenance`.

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
