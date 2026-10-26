-- Minimal stand-ins for the parts of Supabase that schema.sql relies on.
create schema auth;
create table auth.users (id uuid primary key default gen_random_uuid(), email text unique, created_at timestamptz default now());
create table auth.mfa_factors (id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  factor_type text not null default 'totp', status text not null default 'unverified', friendly_name text, secret text);
create table auth.sessions (id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade);
create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
create function auth.uid() returns uuid language sql stable as $$ select nullif(auth.jwt() ->> 'sub', '')::uuid $$;
create role anon nologin; create role authenticated nologin;
grant usage on schema public, auth to anon, authenticated;
grant execute on function auth.uid(), auth.jwt() to anon, authenticated;

-- Supabase Storage's tables, as far as the bucket policies in schema.sql need them (the test shim keeps the bytes in memory).
create schema storage;
create table storage.buckets (id text primary key, name text not null, owner uuid, public boolean default false, file_size_limit bigint, allowed_mime_types text[],
  created_at timestamptz default now(), updated_at timestamptz default now());
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets(id), name text not null, owner uuid, owner_id text,
  created_at timestamptz default now(), updated_at timestamptz default now(), last_accessed_at timestamptz, metadata jsonb, version text, unique (bucket_id, name));
alter table storage.objects enable row level security;
grant usage on schema storage to anon, authenticated;
grant select on storage.buckets to authenticated;
grant select, insert, update, delete on storage.objects to authenticated;
