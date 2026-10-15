-- Ciclo de lotes de IA cada 10 minutos con Supabase Cron (B12, 3.4 y 6.4 del plan de B12).
--
-- Qué hace, en el proyecto real y solo con sus piezas
--   - Crea en Vault el secreto ai_tick_secret, de 256 bits, si todavía no existe. Nace dentro de la base
--     y nunca pasa por el chat ni por el repo. La función ai-batch lo compara con ai_tick_secret_ok
--   - Instala pg_cron y pg_net si faltan y programa el trabajo ia-lotes, cada 10 minutos, que llama a
--     project_url/functions/v1/ai-batch con el encabezado x-ai-tick y 5 segundos de espera, y solo si
--     hay trabajos pendientes o lotes sin procesar. La función contesta 202 enseguida y sigue en
--     segundo plano, así ese tiempo alcanza
--   - Programa también ia-lotes-limpieza, una vez al día, que corre ai_jobs_scrub directo en la base. El
--     ciclo de lotes limpia las salidas de más de 14 días al final de cada corrida, pero el trabajo de
--     arriba solo llama a la función si hay algo pendiente, así que en una semana sin hipótesis nuevas
--     las salidas entregadas seguían guardadas más de los 14 días prometidos (3.4)
--   - project_url ya lo guardó la sesión en Vault al desplegar B11. Si falta, se detiene y lo dice
--
-- No es migración porque en el Postgres de las pruebas no hay pg_cron, pg_net ni Vault. Las pruebas la
-- corren dos veces sobre imitaciones de esos esquemas (supabase/tests/stub_cron_vault.sql). Es
-- repetible, porque cron.schedule con el mismo nombre reemplaza el trabajo, y la sesión la corre con
-- el conector, porque no lleva sentencias que pidan confirmación (D-113).
--
-- Documentación vigente que se siguió (la misma que B11, 20261023000006_bank_sync_cron.sql)
-- functions/schedule-functions.mdx, cron/install.mdx, cron/quickstart.mdx, database/extensions/pg_net.mdx
-- y database/vault.mdx.

-- ===================================================================== Secreto del ciclo en Vault
do $$
declare
  v_exists boolean;
  v_secret text;
begin
  if to_regclass('vault.decrypted_secrets') is null or not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'vault' and p.proname = 'create_secret'
  ) then
    raise exception 'Falta Vault. El ciclo de lotes se programa en el proyecto real' using errcode = '55000';
  end if;
  execute 'select exists (select 1 from vault.decrypted_secrets where name = $1)' into v_exists
    using 'project_url';
  if not v_exists then
    raise exception 'Falta project_url en Vault, la dirección del proyecto. Guárdala antes de programar el ciclo'
      using errcode = '55000';
  end if;
  execute 'select exists (select 1 from vault.decrypted_secrets where name = $1)' into v_exists
    using 'ai_tick_secret';
  if v_exists then
    return;
  end if;
  -- 256 bits al azar. Con pgcrypto si está, y si no, el sha256 de tres uuid al azar
  if to_regprocedure('extensions.gen_random_bytes(integer)') is not null then
    execute 'select encode(extensions.gen_random_bytes(32), ''hex'')' into v_secret;
  else
    v_secret := encode(sha256(convert_to(
      gen_random_uuid()::text || gen_random_uuid()::text || gen_random_uuid()::text, 'UTF8')), 'hex');
  end if;
  execute 'select vault.create_secret($1, $2, $3)'
    using v_secret, 'ai_tick_secret', 'Secreto del ciclo de lotes de IA (B12)';
end $$;

-- ===================================================================== Trabajo cada 10 minutos
do $$
begin
  if to_regnamespace('cron') is null then
    execute 'create extension if not exists pg_cron with schema pg_catalog';
  end if;
  if to_regnamespace('net') is null then
    execute 'create extension if not exists pg_net with schema extensions';
  end if;
  execute $sql$
    select cron.schedule(
      'ia-lotes',
      '*/10 * * * *',
      $job$
      select net.http_post(
        url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url')
          || '/functions/v1/ai-batch',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-ai-tick', (select decrypted_secret from vault.decrypted_secrets where name = 'ai_tick_secret')
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 5000
      ) as request_id
      where exists (select 1 from public.ai_jobs where status in ('queued', 'submitting', 'submitted'))
         or exists (select 1 from public.ai_batches where status <> 'processed');
      $job$
    )
  $sql$;
end $$;

-- ===================================================================== Limpieza diaria de salidas
-- A las 09:17 UTC, de madrugada en la Ciudad de México. Corre aunque no haya trabajos ni lotes, sin
-- llamar a ninguna función. Pone en null la entrada de lo terminado y la salida 14 días después de
-- entregada o fallida. No borra filas
do $$
begin
  execute $sql$
    select cron.schedule(
      'ia-lotes-limpieza',
      '17 9 * * *',
      $job$ select public.ai_jobs_scrub() $job$
    )
  $sql$;
end $$;
