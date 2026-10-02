-- Supabase da estos permisos por defecto. Los permisos por fila deciden qué filas se ven
grant usage on schema public to anon, authenticated, service_role;
grant all on all tables in schema public to anon, authenticated, service_role;
grant all on all sequences in schema public to anon, authenticated, service_role;
