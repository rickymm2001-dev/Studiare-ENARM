-- Sincronización del banco cada hora con Supabase Cron (B11, 3.13 del plan de B11).
--
-- Qué agrega, solo donde existen las piezas
--   - La ficha de Cron bank_sync_cron_token en Vault, de 256 bits, si Vault existe y todavía no la
--     tiene. Nace dentro de la base y nunca pasa por el chat ni por el repo. bank-sync la compara con
--     bank_sync_cron_ok usando la llave de servicio
--   - Las extensiones pg_cron y pg_net y el trabajo bank-sync-hourly, a los 17 minutos de cada hora,
--     que llama a project_url/functions/v1/bank-sync con el encabezado x-bank-sync-token y 5 segundos
--     de espera. La función contesta 202 enseguida y sigue en segundo plano, así ese tiempo alcanza.
--     Con bank_sync.enabled en false la corrida termina como skipped con disabled
--   - project_url no va aquí. Lo guarda la sesión en Vault con el conector al desplegar (guion de la
--     sección 8 del plan de B11)
--
-- Documentación vigente que se siguió (supabase/supabase, apps/docs/content/guides, leída el
-- 2026-10-14). functions/schedule-functions.mdx (cron.schedule con net.http_post y los valores de
-- vault.decrypted_secrets), cron/install.mdx (create extension pg_cron with schema pg_catalog),
-- cron/quickstart.mdx (cron.schedule con el mismo nombre reemplaza el trabajo),
-- database/extensions/pg_net.mdx (create extension pg_net with schema extensions y
-- timeout_milliseconds) y database/vault.mdx (vault.create_secret con nombre y descripción).
--
-- En el Postgres de las pruebas no hay pg_cron, pg_net ni Vault, así que no hace nada. Lo comprueba
-- bank_sync_test.sql BS14. Es idempotente y no lleva delete ni drop (D-113).

-- ===================================================================== Ficha de Cron en Vault
do $$
declare
  v_token text;
  v_exists boolean;
begin
  -- Por nombre, porque según la versión de Vault create_secret trae o no un cuarto argumento con valor
  -- por omisión. Se llama con tres, como en la documentación
  if to_regclass('vault.decrypted_secrets') is null or not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'vault' and p.proname = 'create_secret'
  ) then
    raise notice 'Sin Vault. La ficha de Cron de bank-sync se crea en el proyecto real';
    return;
  end if;
  execute 'select exists (select 1 from vault.decrypted_secrets where name = $1)' into v_exists
    using 'bank_sync_cron_token';
  if v_exists then
    return;
  end if;
  -- 256 bits al azar. Con pgcrypto si está, y si no, el sha256 de tres uuid al azar
  if to_regprocedure('extensions.gen_random_bytes(integer)') is not null then
    execute 'select encode(extensions.gen_random_bytes(32), ''hex'')' into v_token;
  else
    v_token := encode(sha256(convert_to(
      gen_random_uuid()::text || gen_random_uuid()::text || gen_random_uuid()::text, 'UTF8')), 'hex');
  end if;
  execute 'select vault.create_secret($1, $2, $3)'
    using v_token, 'bank_sync_cron_token', 'Ficha de Cron para la función bank-sync (B11)';
end $$;

-- ===================================================================== Trabajo de cada hora
do $$
begin
  if not exists (select 1 from pg_available_extensions where name = 'pg_cron')
     or not exists (select 1 from pg_available_extensions where name = 'pg_net')
     or to_regclass('vault.decrypted_secrets') is null then
    raise notice 'Sin pg_cron, pg_net o Vault. La sincronización por hora se programa en el proyecto real';
    return;
  end if;
  execute 'create extension if not exists pg_cron with schema pg_catalog';
  execute 'create extension if not exists pg_net with schema extensions';
  -- El mismo nombre reemplaza el trabajo, así correr esto otra vez no lo duplica
  execute $sql$
    select cron.schedule(
      'bank-sync-hourly',
      '17 * * * *',
      $job$
      select net.http_post(
        url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url')
          || '/functions/v1/bank-sync',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-bank-sync-token',
          (select decrypted_secret from vault.decrypted_secrets where name = 'bank_sync_cron_token')
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 5000
      ) as request_id;
      $job$
    )
  $sql$;
end $$;
