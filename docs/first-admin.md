# Creating the first admin

The app has no self-service way to become admin. Admin access is granted with the
service role, which never reaches the browser.

1. The store owner signs up in the app normally (email or Google).
2. Grant admin to that account using **one** of the options below.
3. The owner signs out and back in, then opens `/admin`.

## Option A: Supabase dashboard (SQL editor)

The SQL editor runs as the database owner, so it can call the service-only function:

```sql
select public.grant_admin_by_email('owner@example.com');
```

## Option B: REST call with the service role key

Run this from your own machine. Take the key from Dashboard → Project Settings → API
(`service_role`). Never commit it, put it in a `VITE_` variable, or paste it into frontend code.

```sh
export SUPABASE_URL="https://<project-ref>.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="<service role key>"

curl -X POST "$SUPABASE_URL/rest/v1/rpc/grant_admin_by_email" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"_email": "owner@example.com"}'
```

It returns the user's id. `user_not_found` means the person hasn't signed up yet.

## Rules to know

- Once one admin exists, more admins can be added the same way, or by an admin inserting into `user_roles`.
- The **last** admin role can't be deleted or changed (`last_admin` error). This also blocks deleting
  the last admin's auth user. Grant admin to someone else first.
- `has_role` and `is_staff` only answer for the signed-in caller, so they return `false` when run in the
  SQL editor. To list admins there, query the table directly:
  `select u.email from public.user_roles r join auth.users u on u.id = r.user_id where r.role = 'admin';`
