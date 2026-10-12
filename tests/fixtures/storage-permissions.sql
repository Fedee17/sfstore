-- Minimal synthetic Supabase object metadata. No Storage API/files are used.
create schema storage;
create table storage.buckets (id text primary key, name text, file_size_limit bigint, allowed_mime_types text[], public boolean not null default false);
create table storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text not null references storage.buckets(id),
  name text not null,
  metadata jsonb,
  unique (bucket_id, name)
);
alter table storage.objects enable row level security;
grant usage on schema storage to anon, authenticated, service_role;
grant select, insert, update, delete on storage.objects to anon, authenticated, service_role;
