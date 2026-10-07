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
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
-- En Supabase toda función nueva del esquema public nace con permiso de ejecución para anon,
-- authenticated y service_role. Aquí se imita para que las pruebas vean lo mismo que el proyecto real
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
