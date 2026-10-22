-- Pruebas de la programación con Cron de los correos y la analítica (migración 20261029000003, B15 del plan
-- del cambio, 3.9 del diseño). Corre al final sobre la misma base, con usuarios propios.
--   C1 sin pg_cron, pg_net ni Vault la migración no hace nada, C2 con imitaciones de esos esquemas crea las
--   fichas y los cuatro trabajos, y repetirla no los duplica, C3 cada trabajo hace lo que dice y solo cuando
--   toca, C4 permisos
\set ON_ERROR_STOP on

create or replace function pg_temp.expect(ok boolean, msg text) returns void language plpgsql as $$
begin
  if not coalesce(ok, false) then raise exception 'FALLA %', msg; end if;
end $$;

-- ===================================================================== C1. Sin pg_cron, pg_net ni Vault no hace nada
-- La base de las pruebas no tiene esos esquemas. Correr la migración otra vez no crea ninguno
select pg_temp.expect(
  not exists (select 1 from pg_namespace where nspname in ('cron', 'net', 'vault'))
  and not exists (select 1 from pg_extension where extname in ('pg_cron', 'pg_net', 'supabase_vault')),
  'C1. La base de las pruebas no debía tener pg_cron, pg_net ni Vault');
\ir ../migrations/20261029000003_engagement_cron.sql
select pg_temp.expect(
  not exists (select 1 from pg_namespace where nspname in ('cron', 'net', 'vault'))
  and not exists (select 1 from pg_extension where extname in ('pg_cron', 'pg_net', 'supabase_vault')),
  'C1. Sin pg_cron, pg_net ni Vault la migración creó algo');

-- ===================================================================== Usuarios
\set a 'ba150000-0000-0000-0000-000000000201'
insert into auth.users (id, email, raw_user_meta_data, email_confirmed_at)
  values (:'a', 'ca@r15.mx', '{"alias":"Alumna Cron"}', now());
insert into public.analytics_subjects (user_id, consent) values (:'a', true);
-- Lo que dejaron las pruebas de antes en las dos colas se aparta, para ver solo lo de esta
update public.email_outbox set status = 'skipped', last_error = 'prueba' where status in ('queued', 'failed');
update public.analytics_outbox set status = 'dropped' where status in ('queued', 'failed');
update public.platform_settings set value = '{"enabled":false,"paused":[]}' where key = 'email_delivery';
update public.platform_settings set value = '{"enabled":false}' where key = 'analytics';

-- ===================================================================== C2. Con imitaciones de Vault, pg_cron y pg_net
begin;
\ir stub_cron_vault.sql
select vault.create_secret('https://simulado.supabase.co', 'project_url', 'Dirección del proyecto');
\ir ../migrations/20261029000003_engagement_cron.sql
\ir ../migrations/20261029000003_engagement_cron.sql
-- Las fichas, cada una una vez y de 256 bits, distintas entre sí
select pg_temp.expect(
  (select count(*) = 1 and bool_and(decrypted_secret ~ '^[0-9a-f]{64}$') from vault.decrypted_secrets where name = 'email_tick_secret')
  and (select count(*) = 1 and bool_and(decrypted_secret ~ '^[0-9a-f]{64}$') from vault.decrypted_secrets where name = 'analytics_tick_secret')
  and (select decrypted_secret from vault.decrypted_secrets where name = 'email_tick_secret')
      <> (select decrypted_secret from vault.decrypted_secrets where name = 'analytics_tick_secret'),
  'C2. Las fichas no quedaron una sola vez, con 256 bits y distintas');
select decrypted_secret as email_secret from vault.decrypted_secrets where name = 'email_tick_secret' \gset
select decrypted_secret as analytics_secret from vault.decrypted_secrets where name = 'analytics_tick_secret' \gset
-- Las compara la base
select pg_temp.expect(public.email_tick_ok(:'email_secret') and public.analytics_tick_ok(:'analytics_secret')
  and not public.email_tick_ok(:'analytics_secret') and not public.analytics_tick_ok(:'email_secret'),
  'C2. Las fichas creadas no valen contra email_tick_ok y analytics_tick_ok');
-- Los cuatro trabajos, cada uno una vez y con su horario en GMT
select pg_temp.expect(
  (select count(*) = 4 from cron.job)
  and (select schedule = '*/15 * * * *' and command like '%enqueue_review_reminders()%' from cron.job where jobname = 'correos-recordatorios')
  and (select schedule = '7 14 * * *' and command like '%enqueue_pass_expiry_reminders()%' from cron.job where jobname = 'correos-pases')
  and (select schedule = '* * * * *' and command like '%/functions/v1/send-emails%' and command like '%x-email-tick%'
              and command like '%email_has_ready()%' and command like '%timeout_milliseconds := 5000%'
       from cron.job where jobname = 'correos-enviar')
  and (select schedule = '*/5 * * * *' and command like '%/functions/v1/analytics-flush%' and command like '%x-analytics-tick%'
              and command like '%analytics_has_ready()%' and command like '%timeout_milliseconds := 5000%'
       from cron.job where jobname = 'analitica-enviar'),
  'C2. Los cuatro trabajos no quedaron una sola vez con su horario y su llamada');
-- Ningún trabajo trae las fichas escritas: las lee de Vault al correr
select pg_temp.expect(
  not exists (select 1 from cron.job where command like '%' || :'email_secret' || '%' or command like '%' || :'analytics_secret' || '%'),
  'C2. Un trabajo trae una ficha escrita');
-- Repetir la migración no cambia las fichas
\ir ../migrations/20261029000003_engagement_cron.sql
select pg_temp.expect(
  (select decrypted_secret from vault.decrypted_secrets where name = 'email_tick_secret') = :'email_secret'
  and (select decrypted_secret from vault.decrypted_secrets where name = 'analytics_tick_secret') = :'analytics_secret'
  and (select count(*) from cron.job) = 4,
  'C2. Repetir la migración cambió una ficha o duplicó un trabajo');

-- ===================================================================== C3. Cada trabajo hace lo que dice
-- Con todo apagado Cron no llama a nadie
do $$ begin execute (select command from cron.job where jobname = 'correos-enviar'); end $$;
do $$ begin execute (select command from cron.job where jobname = 'analitica-enviar'); end $$;
select pg_temp.expect((select count(*) from net.requests) = 0, 'C3. Con todo apagado Cron llamó a una función');
-- Hay un correo listo pero el envío está apagado, y analytics igual
insert into public.email_outbox (recipient_user, kind, dedupe_key, data)
  values (:'a', 'trial_ending', 'c3-correo', jsonb_build_object('trialEnd', now() + interval '3 days', 'plan', 'monthly'));
insert into public.analytics_outbox (user_id, analytics_id, event, properties, occurred_at)
  select :'a'::uuid, analytics_id, 'trial_started', '{"plan":"monthly"}'::jsonb, now() from public.analytics_subjects where user_id = :'a';
do $$ begin execute (select command from cron.job where jobname = 'correos-enviar'); end $$;
do $$ begin execute (select command from cron.job where jobname = 'analitica-enviar'); end $$;
select pg_temp.expect((select count(*) from net.requests) = 0, 'C3. Con el envío apagado Cron llamó a una función');
-- Prendidos, llaman con la dirección del proyecto y su ficha
update public.platform_settings set value = '{"enabled":true,"paused":[]}' where key = 'email_delivery';
update public.platform_settings set value = '{"enabled":true}' where key = 'analytics';
do $$ begin execute (select command from cron.job where jobname = 'correos-enviar'); end $$;
select pg_temp.expect(
  (select count(*) = 1 and bool_and(url = 'https://simulado.supabase.co/functions/v1/send-emails'
          and headers ->> 'x-email-tick' = :'email_secret' and headers ->> 'Content-Type' = 'application/json'
          and timeout_milliseconds = 5000) from net.requests),
  'C3. Cron no llamó a send-emails con la dirección del proyecto y su ficha');
do $$ begin execute (select command from cron.job where jobname = 'analitica-enviar'); end $$;
select pg_temp.expect(
  (select count(*) = 1 and bool_and(headers ->> 'x-analytics-tick' = :'analytics_secret') from net.requests where url like '%/analytics-flush'),
  'C3. Cron no llamó a analytics-flush con su ficha');
-- Un tipo en pausa no cuenta como correo listo
delete from net.requests;
update public.platform_settings set value = '{"enabled":true,"paused":["trial_ending"]}' where key = 'email_delivery';
do $$ begin execute (select command from cron.job where jobname = 'correos-enviar'); end $$;
select pg_temp.expect((select count(*) from net.requests) = 0, 'C3. Cron llamó a send-emails por un tipo en pausa');
update public.platform_settings set value = '{"enabled":true,"paused":[]}' where key = 'email_delivery';
-- Un correo apartado, mandado o con 5 intentos tampoco
update public.email_outbox set send_after = now() + interval '5 minutes' where dedupe_key = 'c3-correo';
do $$ begin execute (select command from cron.job where jobname = 'correos-enviar'); end $$;
select pg_temp.expect((select count(*) from net.requests) = 0, 'C3. Cron llamó a send-emails por un correo apartado');
update public.email_outbox set send_after = now(), status = 'failed', attempts = 5 where dedupe_key = 'c3-correo';
do $$ begin execute (select command from cron.job where jobname = 'correos-enviar'); end $$;
select pg_temp.expect((select count(*) from net.requests) = 0, 'C3. Cron llamó a send-emails por un correo con 5 intentos');
update public.email_outbox set status = 'sent' where dedupe_key = 'c3-correo';
do $$ begin execute (select command from cron.job where jobname = 'correos-enviar'); end $$;
select pg_temp.expect((select count(*) from net.requests) = 0, 'C3. Cron llamó a send-emails por un correo mandado');
-- Los eventos de analítica ya mandados tampoco
update public.analytics_outbox set status = 'sent' where user_id = :'a';
do $$ begin execute (select command from cron.job where jobname = 'analitica-enviar'); end $$;
select pg_temp.expect((select count(*) from net.requests) = 0, 'C3. Cron llamó a analytics-flush por un evento mandado');
-- Los trabajos de encolar corren sin lanzar nada
do $$ begin execute (select command from cron.job where jobname = 'correos-recordatorios'); end $$;
do $$ begin execute (select command from cron.job where jobname = 'correos-pases'); end $$;
rollback;

-- La imitación se deshizo con la transacción: la base sigue sin esos esquemas, y lo de la migración que no
-- depende de ellos, las dos ayudas, sigue
select pg_temp.expect(
  not exists (select 1 from pg_namespace where nspname in ('cron', 'net', 'vault'))
  and to_regprocedure('public.email_has_ready()') is not null and to_regprocedure('public.analytics_has_ready()') is not null,
  'C2. La imitación de Vault, pg_cron y pg_net no se deshizo');

-- ===================================================================== C4. Permisos
select pg_temp.expect(
  not has_function_privilege('anon', 'public.email_has_ready()', 'execute')
  and not has_function_privilege('authenticated', 'public.email_has_ready()', 'execute')
  and not has_function_privilege('service_role', 'public.email_has_ready()', 'execute')
  and not has_function_privilege('anon', 'public.analytics_has_ready()', 'execute')
  and not has_function_privilege('authenticated', 'public.analytics_has_ready()', 'execute')
  and not has_function_privilege('service_role', 'public.analytics_has_ready()', 'execute'),
  'C4. Las ayudas de Cron son internas');

-- Los dos envíos quedan apagados, como en el proyecto real
update public.platform_settings set value = '{"enabled":false,"paused":[]}' where key = 'email_delivery';
update public.platform_settings set value = '{"enabled":false}' where key = 'analytics';

select 'TODAS LAS PRUEBAS DE LA PROGRAMACIÓN CON CRON PASARON' as resultado;
