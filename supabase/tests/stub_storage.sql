-- Esqueleto mínimo de Supabase Storage para probar en un Postgres local las políticas del bucket de
-- fotos de perfil (B2 del plan del cambio). Imita storage.buckets, storage.objects y las funciones
-- storage.foldername y storage.filename como las crea Supabase, con los mismos permisos de tabla
-- para anon, authenticated y service_role, y el freno que impide borrar sus filas con SQL. Los
-- permisos por fila deciden qué objetos ve cada quien. Corre después de stub_auth.sql y antes de las
-- migraciones.
create schema storage;

create table storage.buckets (
  id text primary key,
  name text not null unique,
  owner uuid,
  public boolean not null default false,
  file_size_limit bigint,
  allowed_mime_types text[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets (id),
  name text,
  owner uuid,
  owner_id text,
  metadata jsonb,
  path_tokens text[] generated always as (string_to_array(name, '/')) stored,
  version text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  last_accessed_at timestamptz default now(),
  unique (bucket_id, name)
);

create function storage.foldername(name text) returns text[] language plpgsql immutable as $$
declare parts text[];
begin
  select string_to_array(name, '/') into parts;
  return parts[1 : array_length(parts, 1) - 1];
end $$;

create function storage.filename(name text) returns text language plpgsql immutable as $$
declare parts text[];
begin
  select string_to_array(name, '/') into parts;
  return parts[array_length(parts, 1)];
end $$;

-- Como en el proyecto real, Storage no deja borrar sus filas con SQL. Solo su API, que marca sus
-- propios borrados con storage.allow_delete_query. Copia de storage.protect_delete de Supabase,
-- leída del proyecto el 2026-10-13. Un borrado directo dejaría el archivo huérfano en el almacén
create function storage.protect_delete() returns trigger language plpgsql as $$
begin
  if coalesce(current_setting('storage.allow_delete_query', true), 'false') != 'true' then
    raise exception 'Direct deletion from storage tables is not allowed. Use the Storage API instead.'
      using hint = 'This prevents accidental data loss from orphaned objects.', errcode = '42501';
  end if;
  return null;
end $$;
create trigger protect_buckets_delete before delete on storage.buckets
  for each statement execute function storage.protect_delete();
create trigger protect_objects_delete before delete on storage.objects
  for each statement execute function storage.protect_delete();

alter table storage.buckets enable row level security;
alter table storage.objects enable row level security;

grant usage on schema storage to anon, authenticated, service_role;
grant all on storage.buckets to anon, authenticated, service_role;
grant all on storage.objects to anon, authenticated, service_role;
grant execute on function storage.foldername(text) to anon, authenticated, service_role;
grant execute on function storage.filename(text) to anon, authenticated, service_role;
