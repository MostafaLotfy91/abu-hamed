-- Minimal stand-in for what a Supabase project provides before any migration runs, so the
-- migrations can be applied to a plain Postgres (PGlite) for tests. Mirrors Supabase where it
-- matters for security: the anon/authenticated/service_role roles, auth.uid() from the request's
-- JWT claims, the storage schema, and Supabase's default grants on the public schema.

create role anon nologin noinherit;
create role authenticated nologin noinherit;
create role service_role nologin noinherit bypassrls;

create schema if not exists auth;
create schema if not exists storage;
create schema if not exists extensions;

create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
$$;
create function auth.uid() returns uuid language sql stable as $$
  select nullif(auth.jwt() ->> 'sub', '')::uuid
$$;
create function auth.role() returns text language sql stable as $$
  select auth.jwt() ->> 'role'
$$;

create table storage.buckets (
  id text primary key,
  name text not null,
  public boolean not null default false,
  file_size_limit bigint,
  allowed_mime_types text[],
  created_at timestamptz not null default now()
);
create table storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets(id),
  name text not null,
  owner uuid,
  metadata jsonb,
  created_at timestamptz not null default now()
);
alter table storage.objects enable row level security;
create function storage.extension(name text) returns text language sql immutable as $$
  select reverse(split_part(reverse(name), '.', 1))
$$;

create publication supabase_realtime;

grant usage on schema public, auth, storage, extensions to anon, authenticated, service_role;
grant execute on all functions in schema auth, storage to anon, authenticated, service_role;
grant select on storage.buckets to anon, authenticated;
grant select, insert, update, delete on storage.objects to anon, authenticated;
grant all on storage.buckets, storage.objects to service_role;

-- Supabase grants the API roles everything in public by default; RLS is the real barrier.
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
