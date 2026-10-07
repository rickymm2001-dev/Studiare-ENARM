-- Esqueleto mínimo de Supabase para probar el esquema en un Postgres local (D-069).
-- Imita auth.users, auth.uid() y los roles anon, authenticated y service_role.
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth;
create table auth.users (
  id uuid primary key,
  email text,
  raw_user_meta_data jsonb not null default '{}'::jsonb
);
-- Igual que en Supabase. Los claims del token viajan en request.jwt.claims como JSON. El ajuste
-- anterior, request.jwt.claim.sub, se sigue aceptando para las pruebas viejas
create function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')
  )::jsonb
$$;
create function auth.uid() returns uuid language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;
grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
grant execute on function auth.jwt() to anon, authenticated, service_role;
-- En Supabase toda tabla, secuencia y función nueva del esquema public nace con permisos para anon,
-- authenticated y service_role. Aquí se imita ANTES de aplicar las migraciones, para que las pruebas
-- vean lo mismo que el proyecto real y los revoke de una migración no se deshagan después
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
