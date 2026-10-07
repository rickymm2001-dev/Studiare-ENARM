-- Supabase da estos permisos por defecto. Los permisos por fila deciden qué filas se ven.
-- Los permisos de tablas, secuencias y funciones nuevas los imita stub_auth.sql con
-- alter default privileges, antes de las migraciones, así los revoke de una migración se respetan
grant usage on schema public to anon, authenticated, service_role;
