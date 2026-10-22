-- Programación con Supabase Cron de los correos y la analítica (B15 del plan del cambio, 3.9 del diseño).
--
-- Qué agrega, solo donde existen las piezas
--   - Las fichas de Cron email_tick_secret y analytics_tick_secret en Vault, de 256 bits, si Vault existe y
--     todavía no las tiene. Nacen dentro de la base y nunca pasan por el chat ni por el repo. send-emails y
--     analytics-flush las comparan con email_tick_ok y analytics_tick_ok usando la llave de servicio
--   - Cuatro trabajos, con las horas en GMT, que es como cuenta Cron
--       correos-recordatorios  cada 15 minutos      select public.enqueue_review_reminders()
--       correos-pases          a las 14:07          select public.enqueue_pass_expiry_reminders()
--                                                   (las 8:07 de la mañana en Mérida)
--       correos-enviar         cada minuto          llama a send-emails con la ficha email_tick, solo si
--                                                   email_delivery está prendido y hay correos listos
--       analitica-enviar       cada 5 minutos       llama a analytics-flush con la ficha analytics_tick,
--                                                   solo si analytics está prendido y hay pendientes
--   - email_has_ready y analytics_has_ready, que dicen si hay algo que mandar. Los dos trabajos de envío
--     las preguntan antes de llamar a la función, así con todo apagado Cron no hace ninguna llamada
--   - project_url no va aquí. Ya lo guardó la sesión en Vault con B11 y B12 (si falta, los dos trabajos de
--     envío fallan en el registro de Cron, sin mandar nada, hasta que se guarde)
--
-- Documentación vigente que se siguió (supabase/supabase, apps/docs/content/guides, leída el 2026-10-21).
-- functions/schedule-functions.mdx (cron.schedule con net.http_post y los valores de
-- vault.decrypted_secrets, horas en GMT), cron/install.mdx (create extension pg_cron with schema pg_catalog),
-- cron/quickstart.mdx (cron.schedule con el mismo nombre reemplaza el trabajo), database/extensions/pg_net.mdx
-- (create extension pg_net with schema extensions y timeout_milliseconds) y database/vault.mdx
-- (vault.create_secret con nombre y descripción).
--
-- En el Postgres de las pruebas no hay pg_cron, pg_net ni Vault, así que los dos bloques no hacen nada. Lo
-- comprueba engagement_cron_test.sql, que también los corre sobre imitaciones de esos esquemas
-- (supabase/tests/stub_cron_vault.sql). Es idempotente y no lleva delete ni drop (D-113).

-- ===================================================================== Si hay algo que mandar
-- Con el envío prendido, si hay algún correo listo de un tipo que no esté en pausa. Lo mismo que reclamaría
-- claim_email_batch, sin reclamar nada
create or replace function public.email_has_ready() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((select value -> 'enabled' = 'true'::jsonb from public.platform_settings where key = 'email_delivery'), false)
    and exists (
      select 1 from public.email_outbox o
      where o.status in ('queued', 'failed') and o.attempts < 5 and o.send_after <= now()
        and public.email_delivery_on(o.kind)
    )
$$;

-- Con analytics prendido, si hay algún evento listo
create or replace function public.analytics_has_ready() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((select value -> 'enabled' = 'true'::jsonb from public.platform_settings where key = 'analytics'), false)
    and exists (
      select 1 from public.analytics_outbox o
      where o.status in ('queued', 'failed') and o.attempts < 5 and o.send_after <= now()
    )
$$;

-- Solo las ejecuta Cron, que corre como el dueño de la base
revoke all on function public.email_has_ready() from public, anon, authenticated, service_role;
revoke all on function public.analytics_has_ready() from public, anon, authenticated, service_role;

-- ===================================================================== Fichas de Cron en Vault
do $$
declare
  v_name text;
  v_exists boolean;
  v_token text;
begin
  -- Por nombre, porque según la versión de Vault create_secret trae o no un cuarto argumento con valor
  -- por omisión. Se llama con tres, como en la documentación
  if to_regclass('vault.decrypted_secrets') is null or not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'vault' and p.proname = 'create_secret'
  ) then
    raise notice 'Sin Vault. Las fichas de Cron de send-emails y analytics-flush se crean en el proyecto real';
    return;
  end if;
  foreach v_name in array array['email_tick_secret', 'analytics_tick_secret'] loop
    execute 'select exists (select 1 from vault.decrypted_secrets where name = $1)' into v_exists using v_name;
    if v_exists then
      continue;
    end if;
    -- 256 bits al azar. Con pgcrypto si está, y si no, el sha256 de tres uuid al azar
    if to_regprocedure('extensions.gen_random_bytes(integer)') is not null then
      execute 'select encode(extensions.gen_random_bytes(32), ''hex'')' into v_token;
    else
      v_token := encode(sha256(convert_to(
        gen_random_uuid()::text || gen_random_uuid()::text || gen_random_uuid()::text, 'UTF8')), 'hex');
    end if;
    execute 'select vault.create_secret($1, $2, $3)'
      using v_token, v_name,
        case v_name
          when 'email_tick_secret' then 'Ficha de Cron para la función send-emails (B15)'
          else 'Ficha de Cron para la función analytics-flush (B15)'
        end;
  end loop;
end $$;

-- ===================================================================== Los cuatro trabajos
do $$
begin
  if (to_regnamespace('cron') is null and not exists (select 1 from pg_available_extensions where name = 'pg_cron'))
     or (to_regnamespace('net') is null and not exists (select 1 from pg_available_extensions where name = 'pg_net'))
     or to_regclass('vault.decrypted_secrets') is null then
    raise notice 'Sin pg_cron, pg_net o Vault. Los correos y la analítica se programan en el proyecto real';
    return;
  end if;
  if to_regnamespace('cron') is null then
    execute 'create extension if not exists pg_cron with schema pg_catalog';
  end if;
  if to_regnamespace('net') is null then
    execute 'create extension if not exists pg_net with schema extensions';
  end if;
  -- El mismo nombre reemplaza el trabajo, así correr esto otra vez no lo duplica
  execute $sql$
    select cron.schedule(
      'correos-recordatorios',
      '*/15 * * * *',
      $job$ select public.enqueue_review_reminders() $job$
    )
  $sql$;
  execute $sql$
    select cron.schedule(
      'correos-pases',
      '7 14 * * *',
      $job$ select public.enqueue_pass_expiry_reminders() $job$
    )
  $sql$;
  execute $sql$
    select cron.schedule(
      'correos-enviar',
      '* * * * *',
      $job$
      select net.http_post(
        url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url')
          || '/functions/v1/send-emails',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-email-tick',
          (select decrypted_secret from vault.decrypted_secrets where name = 'email_tick_secret')
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 5000
      ) as request_id
      where public.email_has_ready();
      $job$
    )
  $sql$;
  execute $sql$
    select cron.schedule(
      'analitica-enviar',
      '*/5 * * * *',
      $job$
      select net.http_post(
        url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url')
          || '/functions/v1/analytics-flush',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-analytics-tick',
          (select decrypted_secret from vault.decrypted_secrets where name = 'analytics_tick_secret')
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 5000
      ) as request_id
      where public.analytics_has_ready();
      $job$
    )
  $sql$;
end $$;
