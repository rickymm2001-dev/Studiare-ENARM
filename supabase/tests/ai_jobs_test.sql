-- Pruebas de la cola de trabajos por lote (B12, migración 20261026000002) y de la pieza de cron
-- (supabase/manual/ia-lotes-cron.sql). Corre al final sobre la misma base, con usuarios propios. Las
-- funciones se llaman como postgres, que es lo que hace la función con la llave de servicio. Cada
-- bloque falla con un error si algo no cumple.
--   J1 a J10. Encolar, reclamar, mandar, sondear, terminar, reencolar, estado, reusar, limpiar y varados
--   C. Candado del ciclo y secreto de Vault
--   K. La pieza de cron, dos veces, sobre imitaciones de Vault, pg_cron y pg_net
--   P. Permisos. Nadie con llave pública
\set ON_ERROR_STOP on

create or replace function pg_temp.expect(ok boolean, msg text) returns void language plpgsql as $$
begin
  if not coalesce(ok, false) then raise exception 'FALLA %', msg; end if;
end $$;

create or replace function pg_temp.fails_with(stmt text) returns text language plpgsql as $$
begin
  execute stmt;
  return null;
exception when others then
  return sqlstate;
end $$;

create or replace function pg_temp.enqueue(
  p_user uuid, p_key text, p_hash text default repeat('a', 64), p_max integer default 12,
  p_engine text default 'forgetting'
) returns jsonb language sql as $$
  select public.ai_job_enqueue(p_user, p_engine, p_key, '{"rule":"r"}'::jsonb, p_hash,
    'forgetting.base.v1', 'claude-haiku-5-5', p_max)
$$;

-- Lo que la función manda a ai_job_finish con una salida buena (FinishPayload del núcleo)
create or replace function pg_temp.ready_meta(p_cost numeric, p_real boolean default true) returns jsonb
language sql as $$
  select jsonb_build_object(
    'costUsd', p_cost, 'model', 'claude-haiku-5-5', 'real', p_real, 'inputTokens', 1700,
    'outputTokens', 400, 'cacheReadTokens', 0, 'cacheWriteTokens', 0, 'latencyMs', 0,
    'outcome', 'ok', 'promptVersion', 'forgetting.base.v1', 'refusalCategory', null,
    'callMeta', jsonb_build_object('engine', 'forgetting', 'mode', 'real', 'model', 'claude-haiku-5-5'))
$$;

-- Manda todo lo que está en cola en un lote
create or replace function pg_temp.send_all(p_batch text) returns jsonb language plpgsql as $$
declare
  v_claim jsonb := public.ai_jobs_claim(1000);
begin
  perform public.ai_jobs_submitted((v_claim ->> 'claimId')::uuid, p_batch, (
    select coalesce(jsonb_object_agg(j ->> 'id', 0.001), '{}'::jsonb) from jsonb_array_elements(v_claim -> 'jobs') j
  ));
  return v_claim;
end $$;

insert into auth.users (id, email, raw_user_meta_data) values
  ('c1300000-0000-0000-0000-000000000001', 'c13-uno@x.mx', '{"alias":"Uno"}'),
  ('c1300000-0000-0000-0000-000000000002', 'c13-dos@x.mx', '{"alias":"Dos"}'),
  ('c1300000-0000-0000-0000-000000000003', 'c13-tres@x.mx', '{"alias":"Tres"}');
\set u1 'c1300000-0000-0000-0000-000000000001'
\set u2 'c1300000-0000-0000-0000-000000000002'
-- Las demás pruebas no dejan trabajos. Así cada bloque sabe qué hay en la cola
select pg_temp.expect((select count(*) from public.ai_jobs) = 0, 'J0. La cola no empezó vacía');

-- ===================================================================== J1. Encolar
select pg_temp.expect(pg_temp.enqueue(:'u1', 'fgt_llave-uno-0001') ->> 'outcome' = 'queued', 'J1. No encoló');
select pg_temp.expect(pg_temp.enqueue(:'u1', 'fgt_llave-uno-0001') ->> 'outcome' = 'existing',
  'J1. Encolar dos veces la misma llave no devolvió el activo');
select pg_temp.expect((select count(*) from public.ai_jobs where user_id = :'u1') = 1, 'J1. Quedaron dos trabajos');
select pg_temp.expect(pg_temp.enqueue(:'u1', 'fgt_llave-dos-0002', p_max => 2) ->> 'outcome' = 'queued',
  'J1. El segundo pendiente no se encoló');
select pg_temp.expect(pg_temp.enqueue(:'u1', 'fgt_llave-tres-003', p_max => 2) ->> 'outcome' = 'too_many_pending',
  'J1. No respetó el tope de pendientes');
select pg_temp.expect(pg_temp.enqueue(:'u2', 'fgt_llave-uno-0001', p_max => 2) ->> 'outcome' = 'queued',
  'J1. El tope o la llave de otro alumno estorbaron');
select pg_temp.expect(
  (pg_temp.enqueue(:'u1', 'fgt_llave-cuatro-4') -> 'job') ?& array['jobKey', 'engine', 'status', 'queuedAt', 'readyAt'],
  'J1. El trabajo no trae su forma');
select pg_temp.expect(pg_temp.fails_with($q$select pg_temp.enqueue('c1300000-0000-0000-0000-000000000001', 'Llave Rara')$q$) = '22023'
  and pg_temp.fails_with($q$select pg_temp.enqueue(null, 'fgt_sin-alumno-01')$q$) = '22023'
  and pg_temp.fails_with($q$select pg_temp.enqueue('c1300000-0000-0000-0000-000000000001', 'fgt_otro-motor-01', p_engine => 'weekly_report')$q$) = '22023',
  'J1. Aceptó un trabajo no válido');
select pg_temp.expect(pg_temp.enqueue(null, 'rst_sistema-0001', p_engine => 'restructure') ->> 'outcome' = 'queued',
  'J1. Una reestructurada de sistema no se encoló sin alumno');

-- ===================================================================== J2. Reclamar sin dobles
select public.ai_jobs_claim(2) as claim_a \gset
select public.ai_jobs_claim(100) as claim_b \gset
select pg_temp.expect(jsonb_array_length(:'claim_a'::jsonb -> 'jobs') = 2
  and not exists (
    select 1 from jsonb_array_elements(:'claim_a'::jsonb -> 'jobs') a
    join jsonb_array_elements(:'claim_b'::jsonb -> 'jobs') b on a ->> 'id' = b ->> 'id'
  ), 'J2. Dos reclamos tomaron el mismo trabajo');
select pg_temp.expect((select count(*) from public.ai_jobs where status = 'submitting') = 5
  and (select count(*) from public.ai_jobs where status = 'queued') = 0, 'J2. No se reclamaron todos');
select pg_temp.expect(pg_get_functiondef('public.ai_jobs_claim(integer)'::regprocedure) ilike '%for update skip locked%',
  'J2. El reclamo no se salta las filas que toma otra sesión');
select pg_temp.expect((:'claim_a'::jsonb -> 'jobs' -> 0) ?& array['id', 'userId', 'engine', 'jobKey', 'input', 'model', 'promptVersion', 'attempts', 'issues'],
  'J2. Un trabajo reclamado no trae su forma');

-- ===================================================================== J3. Mandar lo que cupo y regresar lo demás
select public.ai_jobs_submitted((:'claim_a'::jsonb ->> 'claimId')::uuid, 'msgbatch_c13_a',
  jsonb_build_object(:'claim_a'::jsonb -> 'jobs' -> 0 ->> 'id', 0.0042));
select pg_temp.expect((select status = 'submitted' and attempts = 1 and batch_id = 'msgbatch_c13_a' and estimated_cost_usd = 0.0042
  from public.ai_jobs where id = (:'claim_a'::jsonb -> 'jobs' -> 0 ->> 'id')::uuid), 'J3. El trabajo que cupo no quedó mandado');
select pg_temp.expect((select status = 'queued' and attempts = 0 and claim_id is null
  from public.ai_jobs where id = (:'claim_a'::jsonb -> 'jobs' -> 1 ->> 'id')::uuid), 'J3. El que no cupo no volvió sin contar intento');
select pg_temp.expect((select request_count = 1 and status = 'in_progress' from public.ai_batches where id = 'msgbatch_c13_a'),
  'J3. El lote no quedó registrado');
select public.ai_jobs_unclaim((:'claim_b'::jsonb ->> 'claimId')::uuid);
select pg_temp.expect((select count(*) from public.ai_jobs where status = 'queued') = 4,
  'J3. Deshacer un reclamo no regresó sus trabajos');
select pg_temp.expect((public.ai_usage_summary_v2() ->> 'pendingJobs')::integer = 5
  and (public.ai_usage_summary_v2() -> 'inFlightUsd' ->> 'forgetting')::numeric = 0.0042
  and public.ai_usage_summary_v2() ? 'spentUsd', 'J3. El resumen v2 no suma la cola');

-- ===================================================================== J4. Sondear
select pg_temp.expect(jsonb_array_length(public.ai_batches_due(10)) = 0, 'J4. Un lote recién creado se sondeó antes de tiempo');
select pg_temp.expect(public.ai_batches_due(0) -> 0 ->> 'id' = 'msgbatch_c13_a', 'J4. Un lote vencido no se sondeó');
select pg_temp.expect((select last_polled_at is not null from public.ai_batches where id = 'msgbatch_c13_a'),
  'J4. La consulta no quedó marcada');
select public.ai_batch_mark('msgbatch_c13_a', 'ended');
select pg_temp.expect(public.ai_batches_due(60) -> 0 ->> 'status' = 'ended', 'J4. Un lote terminado sin procesar no salió');
select pg_temp.expect(pg_temp.fails_with($q$select public.ai_batch_mark('msgbatch_c13_a', 'quién sabe')$q$) = '22023',
  'J4. Aceptó un estado de lote que no existe');

-- ===================================================================== J5. Terminar y asentar una sola vez
select (:'claim_a'::jsonb -> 'jobs' -> 0 ->> 'id') as job_a \gset
select pg_temp.expect(jsonb_array_length(public.ai_jobs_pending('msgbatch_c13_a', array[:'job_a', 'no-es-uuid'])) = 1,
  'J5. pending no dio el trabajo que espera');
select coalesce((select spent_usd from public.ai_spend_day where day = public.ai_day()), 0) as spent_before \gset
select public.ai_job_finish(:'job_a', 'ready', '{"hypothesis":null}', null, pg_temp.ready_meta(0.0003));
select public.ai_job_finish(:'job_a', 'ready', '{"hypothesis":"otra"}', null, pg_temp.ready_meta(5));
select pg_temp.expect((select status = 'ready' and output = '{"hypothesis":null}' and input is null and cost_usd = 0.0003
  and meta ->> 'model' = 'claude-haiku-5-5' and finished_at is not null from public.ai_jobs where id = :'job_a'),
  'J5. El trabajo no quedó listo con su salida');
select pg_temp.expect((select spent_usd from public.ai_spend_day where day = public.ai_day()) = :spent_before + 0.0003,
  'J5. El costo no se asentó una sola vez');
select pg_temp.expect((select count(*) = 1 and bool_and(mode = 'batch' and ok and real and outcome = 'ok')
  from public.ai_call_log where job_id = :'job_a'), 'J5. El renglón del lote no quedó con mode batch');
select pg_temp.expect(pg_temp.fails_with($q$select public.ai_job_finish(gen_random_uuid(), 'ready', '{}', null, '{}')$q$) = '22023',
  'J5. Aceptó una salida sin lo que ve la app');

-- ===================================================================== J6. Reencolar con su tope
select pg_temp.send_all('msgbatch_c13_b') as claim_c \gset
select (:'claim_c'::jsonb -> 'jobs' -> 0 ->> 'id') as job_c \gset
select (:'claim_c'::jsonb -> 'jobs' -> 1 ->> 'id') as job_d \gset
select pg_temp.expect(public.ai_job_requeue(:'job_c', array['La respuesta no cumplió el esquema'], 'invalid_output') = 'requeued',
  'J6. El primer intento inválido no volvió a la cola');
select pg_temp.expect((select status = 'queued' and issues = array['La respuesta no cumplió el esquema'] and batch_id is null
  from public.ai_jobs where id = :'job_c'), 'J6. Volvió sin lo que falló');
select pg_temp.expect(public.ai_job_requeue(:'job_d', '{}', 'errored') = 'requeued', 'J6. errored no volvió al primero');
select pg_temp.send_all('msgbatch_c13_c');
-- Una sentencia aparte para leer: la subconsulta no ve lo que la función escribe en la misma sentencia
select pg_temp.expect(public.ai_job_requeue(:'job_c', array['otra vez'], 'invalid_output') = 'failed',
  'J6. El segundo intento inválido no dijo failed');
select pg_temp.expect((select status = 'failed' and error = 'invalid_output' and input is null from public.ai_jobs where id = :'job_c'),
  'J6. El segundo intento inválido no dejó el trabajo fallido');
select pg_temp.expect(public.ai_job_requeue(:'job_c', array['x'], 'invalid_output') = 'failed',
  'J6. Reencolar uno fallido lo revivió');
select pg_temp.expect(pg_temp.fails_with($q$select public.ai_job_requeue(gen_random_uuid(), '{}', 'por gusto')$q$) = '22023',
  'J6. Aceptó un motivo que no existe');
-- errored tiene tres intentos
select pg_temp.expect(public.ai_job_requeue(:'job_d', '{}', 'errored') = 'requeued', 'J6. errored no volvió al segundo');
select pg_temp.send_all('msgbatch_c13_d');
select pg_temp.expect(public.ai_job_requeue(:'job_d', '{}', 'errored') = 'failed', 'J6. errored no falló al tercero');
select pg_temp.expect((select error = 'provider_error' from public.ai_jobs where id = :'job_d'),
  'J6. errored falló sin provider_error');

-- ===================================================================== J7. Un lote procesado devuelve lo que faltó
-- Del lote b quedan dos trabajos sin resultado
select array_agg(id::text) as lost from public.ai_jobs where batch_id = 'msgbatch_c13_b' and status = 'submitted' \gset
select pg_temp.expect(cardinality(:'lost'::text[]) = 2, 'J7. El lote b no tenía trabajos sin resultado');
select public.ai_batch_mark('msgbatch_c13_b', 'processed');
select pg_temp.expect((select bool_and(status = 'queued' and batch_id is null and attempts = 1) from public.ai_jobs
  where id::text = any (:'lost'::text[])), 'J7. Lo que se quedó sin resultado no volvió a la cola');
select pg_temp.expect((select processed_at is not null and deleted_remote_at is not null from public.ai_batches where id = 'msgbatch_c13_b'),
  'J7. El lote no quedó procesado');

-- ===================================================================== J8. Estado para la app y entrega
select pg_temp.expect(jsonb_array_length(public.ai_job_status(:'u1', array['fgt_llave-uno-0001', 'fgt_no-existe-001'])) = 1,
  'J8. El estado trajo una llave que no existe');
select pg_temp.expect(public.ai_job_status(:'u2', array['fgt_llave-uno-0001']) -> 0 ->> 'jobKey' = 'fgt_llave-uno-0001'
  and (select count(*) from public.ai_jobs where user_id = :'u2') = 1, 'J8. El estado de otro alumno se mezcló');
select pg_temp.expect(pg_temp.fails_with($q$select public.ai_job_status('c1300000-0000-0000-0000-000000000001',
  array(select 'fgt_llave-' || g || '-xxxx' from generate_series(1, 21) g))$q$) = '22023', 'J8. Aceptó más de 20 llaves');
select (select job_key from public.ai_jobs where id = :'job_a') as key_a,
  (select user_id from public.ai_jobs where id = :'job_a') as user_a \gset
select public.ai_job_status(:'user_a', array[:'key_a']) as status_a \gset
select pg_temp.expect(:'status_a'::jsonb -> 0 ->> 'status' = 'ready'
  and (select delivered_at is not null from public.ai_jobs where id = :'job_a'), 'J8. El trabajo listo no quedó entregado');

-- ===================================================================== J9. Reusar y limpiar
select pg_temp.expect(pg_temp.enqueue(:'user_a', :'key_a') ->> 'outcome' = 'reused', 'J9. No reusó lo listo con la misma llave');
select pg_temp.enqueue(:'user_a', 'fgt_otro-dispositivo') as reused \gset
select pg_temp.expect(:'reused'::jsonb ->> 'outcome' = 'reused' and :'reused'::jsonb -> 'job' ->> 'status' = 'ready'
  and :'reused'::jsonb -> 'job' -> 'output' = '{"hypothesis":null}', 'J9. Otro dispositivo no recibió la misma salida');
select pg_temp.expect((select cost_usd = 0 from public.ai_jobs where user_id = :'user_a' and job_key = 'fgt_otro-dispositivo'),
  'J9. Reusar costó');
select pg_temp.expect(pg_temp.enqueue(:'user_a', 'fgt_otra-entrada-01', repeat('b', 64)) ->> 'outcome' = 'queued',
  'J9. Con otra entrada no creó uno nuevo');
-- Con la entrega de hace 15 días la salida se limpia. Sin borrar filas
update public.ai_jobs set delivered_at = now() - interval '15 days', finished_at = now() - interval '15 days' where id = :'job_a';
select count(*) as rows_before from public.ai_jobs \gset
select pg_temp.expect(public.ai_jobs_scrub() >= 1, 'J9. La limpieza no limpió nada');
select pg_temp.expect((select output is null and input is null from public.ai_jobs where id = :'job_a')
  and (select count(*) from public.ai_jobs) = :rows_before, 'J9. La limpieza no limpió la salida vieja o borró filas');
-- La copia del otro dispositivo sigue con su salida, pero tiene más de 7 días
update public.ai_jobs set finished_at = now() - interval '8 days' where job_key = 'fgt_otro-dispositivo';
select pg_temp.expect(pg_temp.enqueue(:'user_a', :'key_a') ->> 'outcome' = 'queued',
  'J9. Reusó una salida limpia o de más de 7 días');

-- ===================================================================== J10. Reclamos varados
select public.ai_jobs_claim(1) as claim_s \gset
update public.ai_jobs set claimed_at = now() - interval '20 minutes' where claim_id = (:'claim_s'::jsonb ->> 'claimId')::uuid;
select pg_temp.expect(public.ai_jobs_stale(15) -> 0 ->> 'claimId' = :'claim_s'::jsonb ->> 'claimId'
  and public.ai_jobs_stale(15) -> 0 -> 'jobIds' -> 0 = :'claim_s'::jsonb -> 'jobs' -> 0 -> 'id'
  and jsonb_array_length(public.ai_jobs_stale(30)) = 0, 'J10. No encontró el reclamo varado');

-- ===================================================================== C1. Un solo ciclo a la vez
\set h1 'c13c0000-0000-0000-0000-000000000001'
\set h2 'c13c0000-0000-0000-0000-000000000002'
select pg_temp.expect(public.ai_tick_lease_take(:'h1', 120), 'C1. El primero no tomó el candado');
select pg_temp.expect(not public.ai_tick_lease_take(:'h2', 120), 'C1. El segundo tomó el candado ocupado');
select pg_temp.expect(public.ai_tick_lease_take(:'h1', 120), 'C1. El dueño no renovó su candado');
select pg_temp.expect(public.ai_tick_lease_take(:'h1', 0), 'C1. El dueño no soltó su candado');
select pg_temp.expect(public.ai_tick_lease_take(:'h2', 120), 'C1. Con el candado suelto no lo tomó otro');
update public.ai_tick_lease set until = now() - interval '1 second';
select pg_temp.expect(public.ai_tick_lease_take(:'h1', 120), 'C1. Un candado vencido no se pudo tomar');
select public.ai_tick_lease_take(:'h1', 0);
select pg_temp.expect(pg_temp.fails_with($q$select public.ai_tick_lease_take('c13c0000-0000-0000-0000-000000000001', -1)$q$) = '22023',
  'C1. Aceptó segundos negativos');

-- ===================================================================== C2. Secreto del ciclo sin Vault
select pg_temp.expect(not public.ai_tick_secret_ok(repeat('a', 64)), 'C2. Sin Vault aceptó un secreto');

-- ===================================================================== K. Pieza de cron dos veces, con imitaciones
begin;
\ir stub_cron_vault.sql
-- Sin project_url la pieza se detiene y lo dice
savepoint sin_url;
\echo 'K. Se esperan tres errores. Sin project_url la pieza de cron se detiene y lo dice, y sus dos trabajos ya no corren'
\set ON_ERROR_STOP off
\ir ../manual/ia-lotes-cron.sql
\set ON_ERROR_STOP on
rollback to savepoint sin_url;
select pg_temp.expect((select count(*) from vault.decrypted_secrets) = 0 and (select count(*) from cron.job) = 0,
  'K. Sin project_url la pieza siguió');
select vault.create_secret('https://simulado.supabase.co', 'project_url', 'Dirección del proyecto');
\ir ../manual/ia-lotes-cron.sql
\ir ../manual/ia-lotes-cron.sql
select pg_temp.expect((select count(*) = 1 and bool_and(decrypted_secret ~ '^[0-9a-f]{64}$')
  from vault.decrypted_secrets where name = 'ai_tick_secret'), 'K. El secreto no quedó una sola vez con 256 bits');
select pg_temp.expect((select count(*) = 1 and bool_and(schedule = '*/10 * * * *') from cron.job where jobname = 'ia-lotes'),
  'K. El trabajo no quedó una sola vez cada 10 minutos');
select pg_temp.expect((select count(*) = 1 and bool_and(schedule = '17 9 * * *') from cron.job where jobname = 'ia-lotes-limpieza')
  and (select count(*) from cron.job) = 2, 'K. La limpieza diaria no quedó una sola vez');
select decrypted_secret as tick_secret from vault.decrypted_secrets where name = 'ai_tick_secret' \gset
select pg_temp.expect(public.ai_tick_secret_ok(:'tick_secret') and not public.ai_tick_secret_ok(repeat('f', 64))
  and not public.ai_tick_secret_ok(null) and not public.ai_tick_secret_ok(''), 'K. ai_tick_secret_ok no compara contra Vault');
-- Sin nada pendiente no llama a la función
update public.ai_jobs set status = 'failed' where status in ('queued', 'submitting', 'submitted');
update public.ai_batches set status = 'processed';
do $$ begin execute (select command from cron.job where jobname = 'ia-lotes'); end $$;
select pg_temp.expect((select count(*) from net.requests) = 0, 'K. Llamó a la función sin nada pendiente');
-- La limpieza diaria corre aunque no haya nada pendiente: una salida entregada hace 15 días se borra
-- y la reciente, y la entrada de lo terminado, también
select pg_temp.enqueue('c1300000-0000-0000-0000-000000000003', 'fgt_salida-vieja-01');
select pg_temp.enqueue('c1300000-0000-0000-0000-000000000003', 'fgt_salida-nueva-01', repeat('b', 64));
update public.ai_jobs set status = 'ready', output = '{"hypothesis":"vieja"}', finished_at = now() - interval '20 days',
  delivered_at = now() - interval '15 days' where job_key = 'fgt_salida-vieja-01';
update public.ai_jobs set status = 'ready', output = '{"hypothesis":"nueva"}', finished_at = now() - interval '2 days',
  delivered_at = now() - interval '1 day' where job_key = 'fgt_salida-nueva-01';
select pg_temp.expect(not exists (select 1 from public.ai_jobs where status in ('queued', 'submitting', 'submitted'))
  and not exists (select 1 from public.ai_batches where status <> 'processed'), 'K. Quedó algo pendiente antes de limpiar');
do $$ begin execute (select command from cron.job where jobname = 'ia-lotes-limpieza'); end $$;
select pg_temp.expect((select output is null from public.ai_jobs where job_key = 'fgt_salida-vieja-01')
  and (select output is not null from public.ai_jobs where job_key = 'fgt_salida-nueva-01')
  and (select input is null from public.ai_jobs where job_key = 'fgt_salida-nueva-01'),
  'K. La limpieza diaria no borró la salida de hace 14 días o borró la reciente');
do $$ begin execute (select command from cron.job where jobname = 'ia-lotes'); end $$;
select pg_temp.expect((select count(*) from net.requests) = 0, 'K. La limpieza hizo llamar a la función');
-- Con un trabajo en cola llama con el secreto en el encabezado
select pg_temp.enqueue('c1300000-0000-0000-0000-000000000003', 'fgt_para-el-cron-1');
do $$ begin execute (select command from cron.job where jobname = 'ia-lotes'); end $$;
select pg_temp.expect((select count(*) = 1
    and bool_and(url = 'https://simulado.supabase.co/functions/v1/ai-batch')
    and bool_and(headers ->> 'x-ai-tick' = :'tick_secret')
    and bool_and(timeout_milliseconds = 5000)
  from net.requests), 'K. No llamó a ai-batch con el secreto');
rollback;
select pg_temp.expect(to_regnamespace('vault') is null and to_regnamespace('cron') is null,
  'K. Las imitaciones se quedaron en la base');

-- ===================================================================== P. Permisos
begin;
set local role authenticated;
select pg_temp.expect(pg_temp.fails_with($q$select pg_temp.enqueue('c1300000-0000-0000-0000-000000000001', 'fgt_desde-la-api1')$q$) = '42501'
  and pg_temp.fails_with($q$select public.ai_job_status('c1300000-0000-0000-0000-000000000001', '{}')$q$) = '42501'
  and pg_temp.fails_with($q$select public.ai_jobs_claim(1)$q$) = '42501'
  and pg_temp.fails_with($q$select public.ai_tick_secret_ok('x')$q$) = '42501'
  and pg_temp.fails_with($q$select public.ai_usage_summary_v2()$q$) = '42501'
  and pg_temp.fails_with($q$select * from public.ai_jobs$q$) = '42501'
  and pg_temp.fails_with($q$select * from public.ai_batches$q$) = '42501'
  and pg_temp.fails_with($q$select * from public.ai_tick_lease$q$) = '42501',
  'P. Una sesión tocó la cola de lotes');
rollback;
begin;
set local role anon;
select pg_temp.expect(pg_temp.fails_with($q$select public.ai_tick_secret_ok('x')$q$) = '42501'
  and pg_temp.fails_with($q$select * from public.ai_jobs$q$) = '42501', 'P. anon tocó la cola de lotes');
rollback;
do $$
declare
  v_sig text;
begin
  foreach v_sig in array array[
    'public.ai_job_enqueue(uuid, text, text, jsonb, text, text, text, integer)',
    'public.ai_job_status(uuid, text[])', 'public.ai_jobs_claim(integer)',
    'public.ai_jobs_submitted(uuid, text, jsonb)', 'public.ai_jobs_unclaim(uuid)', 'public.ai_jobs_stale(integer)',
    'public.ai_batches_due(integer)', 'public.ai_jobs_pending(text, text[])', 'public.ai_job_requeue(uuid, text[], text)',
    'public.ai_batch_mark(text, text)', 'public.ai_job_finish(uuid, text, jsonb, text, jsonb)', 'public.ai_jobs_scrub()',
    'public.ai_tick_lease_take(uuid, integer)', 'public.ai_tick_secret_ok(text)', 'public.ai_usage_summary_v2()'
  ] loop
    if not has_function_privilege('service_role', v_sig, 'execute')
       or has_function_privilege('authenticated', v_sig, 'execute')
       or has_function_privilege('anon', v_sig, 'execute') then
      raise exception 'FALLA P. % no es solo de la llave de servicio', v_sig;
    end if;
  end loop;
  if has_function_privilege('service_role', 'public.ai_job_row_json(public.ai_jobs)', 'execute') then
    raise exception 'FALLA P. Una ayuda interna quedó expuesta';
  end if;
end $$;

select 'TODAS LAS PRUEBAS DE LA COLA DE LOTES PASARON' as resultado;
