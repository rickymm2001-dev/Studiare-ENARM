-- Pruebas de la calibración nocturna en la base (B14, migraciones 20261028000001 y 20261028000002, 8.1 del
-- plan de B14). Corre sobre la base migrada después de las demás pruebas, con usuarios propios que empiezan
-- con ca. Aparecen los cinco tipos de usuario, sin sesión, alumno Gratis, alumno de pago, médico y admin.
-- Todo el texto que siembra es simulado y dice [Prueba].
--   CA1 permisos, CA2 quién cuenta, CA3 seudónimos, CA4 exportación, CA5 sin texto, CA6 publicación,
--   CA7 dry_run, CA8 apply, CA9 distractores, CA10 variantes, CA11 candado, CA12 acuerdo, CA13 solo
--   agregar, CA14 conversión de ids y CA15 límite de tiempo
\set ON_ERROR_STOP on
\ir bank_helpers.sql

\set f1 'ca000000-0000-0000-0000-0000000000f1'
\set p1 'ca000000-0000-0000-0000-0000000000a1'
\set m1 'ca000000-0000-0000-0000-0000000000d1'
\set ad 'ca000000-0000-0000-0000-0000000000e1'

insert into auth.users (id, email, raw_user_meta_data) values
  (:'f1', 'ca-f1@x.mx', '{"alias":"Gratis CA"}'),
  (:'p1', 'ca-p1@x.mx', '{"alias":"Pago CA"}'),
  (:'m1', 'ca-m1@x.mx', '{"alias":"Médica CA"}'),
  (:'ad', 'ca-ad@x.mx', '{"alias":"Admin CA"}');
update public.user_roles set role = 'physician' where user_id = :'m1';
update public.user_roles set role = 'admin' where user_id = :'ad';
insert into public.subscriptions (user_id, plan, status, provider, current_period_end)
  values (:'p1', 'monthly', 'active', 'stripe', now() + interval '20 days');

-- Un evento de la bitácora como lo sube la app. El id sale del orden, el seq lo da la base
create temp sequence ca_ev_seq;
create or replace function pg_temp.ev(
  p_user uuid, p_type text, p_at timestamptz, p_payload jsonb, p_session text default null
) returns void language sql as $$
  insert into public.events (id, user_id, type, at, tz, session_id, payload)
  values ('CA' || lpad(nextval('pg_temp.ca_ev_seq')::text, 20, '0'), p_user, p_type, p_at, 'America/Merida', p_session, p_payload)
$$;

-- Un permiso de mejora anónima como lo sube la app (consent_changed)
create or replace function pg_temp.consent(
  p_user uuid, p_status text, p_at timestamptz, p_version text default '2026-10-15b', p_purpose text default 'anonymized_improvement'
) returns void language sql as $$
  select pg_temp.ev(p_user, 'consent_changed', p_at,
    jsonb_build_object('purpose', p_purpose, 'status', p_status, 'noticeVersion', p_version))
$$;

-- ===================================================================== CA14. Conversión de ids
-- Los mismos pares que tests/calibration/idParity.test.ts. Los lee de tests/fixtures/ulid-uuid.json
\set fixture `cat :'fixtures'/ulid-uuid.json`
select pg_temp.expect(jsonb_array_length((:'fixture'::jsonb) -> 'pairs') >= 30, 'CA14. La lista de ids viene vacía');
select pg_temp.expect(
  (select bool_and(public.uuid_to_ulid((p ->> 'uuid')::uuid) = p ->> 'ulid'
                   and public.ulid_to_uuid(p ->> 'ulid') = (p ->> 'uuid')::uuid
                   and public.ulid_to_uuid(lower(p ->> 'ulid')) = (p ->> 'uuid')::uuid)
     from jsonb_array_elements((:'fixture'::jsonb) -> 'pairs') p),
  'CA14. uuid_to_ulid y ulid_to_uuid no dan lo mismo que cloudIds.ts');
select pg_temp.expect(
  (select bool_and(public.ulid_to_uuid(u) is null) from jsonb_array_elements_text((:'fixture'::jsonb) -> 'invalidUlids') u),
  'CA14. Un ULID inválido tiene uuid');
select pg_temp.expect(
  public.ulid_to_uuid('80000000000000000000000000') is null
  and public.ulid_to_uuid('8ZZZZZZZZZZZZZZZZZZZZZZZZZ') is null
  and public.ulid_to_uuid(null) is null
  and public.uuid_to_ulid(null) is null,
  'CA14. Un ULID que empieza con 8 o con null debía dar null');
-- Todo uuid cabe en un ULID, también los que empiezan con 8 o más
select pg_temp.expect(
  public.uuid_to_ulid('80000000-0000-0000-0000-000000000000') = '40000000000000000000000000'
  and public.uuid_to_ulid('ffffffff-ffff-ffff-ffff-ffffffffffff') = '7ZZZZZZZZZZZZZZZZZZZZZZZZZ',
  'CA14. Un uuid grande no cabe en el ULID');

-- ===================================================================== Ajustes del modelo
-- La clave nace sembrada, apagada y en solo reporte
select pg_temp.expect(
  (select value #>> '{calibration,enabled}' = 'false' and value #>> '{calibration,mode}' = 'dry_run'
          and value #>> '{calibration,minNoticeVersion}' = '2026-10-15b'
          and (value #>> '{thresholds,minGroupSize}')::int = 30
   from public.platform_settings where key = 'model_settings'),
  'CA0. model_settings no nació sembrada y apagada');
-- Volver a aplicar la siembra no pisa lo que el admin cambió
begin;
update public.platform_settings set value = jsonb_set(value, '{thresholds,adaptiveMinItems}', '77') where key = 'model_settings';
\ir ../migrations/20261028000001_model_core.sql
select pg_temp.expect((select (value #>> '{thresholds,adaptiveMinItems}')::int from public.platform_settings where key = 'model_settings') = 77,
  'CA0. Aplicar la migración otra vez pisó un ajuste del admin');
rollback;
-- minGroupSize nunca baja de 30 y un valor que no se lee queda con el de respaldo
begin;
update public.platform_settings set value = jsonb_set(jsonb_set(value, '{thresholds,minGroupSize}', '10'), '{thresholds,populationMinStudents}', '3')
  where key = 'model_settings';
select pg_temp.expect((public.model_settings_json() #>> '{thresholds,minGroupSize}')::int = 30
  and (public.model_settings_json() #>> '{thresholds,populationMinStudents}')::int = 30, 'CA6. minGroupSize en 10 no se leyó como 30');
update public.platform_settings set value = jsonb_set(value, '{thresholds,minGroupSize}', '"mucho"') where key = 'model_settings';
select pg_temp.expect((public.model_settings_json() #>> '{thresholds,minGroupSize}')::int = 30, 'CA6. Un minGroupSize que no es número no quedó en 30');
update public.platform_settings set value = jsonb_set(value, '{thresholds,minGroupSize}', '45') where key = 'model_settings';
select pg_temp.expect((public.model_settings_json() #>> '{thresholds,minGroupSize}')::int = 45, 'CA6. minGroupSize en 45 no se respetó');
-- Solo el booleano true prende la calibración y solo el false apaga una función
update public.platform_settings set value = jsonb_set(value, '{calibration,enabled}', '"true"') where key = 'model_settings';
select pg_temp.expect((public.model_settings_json() #>> '{calibration,enabled}') = 'false', 'CA11. El texto "true" prendió la calibración');
update public.platform_settings set value = jsonb_set(value, '{features,comparison}', '"false"') where key = 'model_settings';
select pg_temp.expect((public.model_settings_json() #>> '{features,comparison}') = 'true', 'MR4. El texto "false" apagó la comparación');
update public.platform_settings set value = jsonb_set(value, '{calibration,mode}', '"publicar"') where key = 'model_settings';
select pg_temp.expect((public.model_settings_json() #>> '{calibration,mode}') = 'dry_run', 'CA7. Un modo desconocido no quedó en solo reporte');
rollback;
-- Sin la clave, o con algo que no es un objeto, todo cae al respaldo
begin;
delete from public.platform_settings where key = 'model_settings';
select pg_temp.expect(public.model_settings_json() #>> '{calibration,enabled}' = 'false'
  and (public.model_settings_json() #>> '{thresholds,minBranchAnswers}')::int = 20
  and public.model_setting('{thresholds,provisionalMaxSe}', 0.5) = 0.5, 'CA11. Sin model_settings no quedó el respaldo');
insert into public.platform_settings (key, value) values ('model_settings', '[1,2]');
select pg_temp.expect(public.model_settings_json() #>> '{calibration,mode}' = 'dry_run'
  and (public.model_settings_json() #>> '{thresholds,minGroupSize}')::int = 30, 'CA11. Un model_settings que no es objeto no quedó de respaldo');
rollback;
-- Lo lee cualquiera, como todas las claves de platform_settings, y solo lo escribe el admin
begin;
select pg_temp.as_anon();
select pg_temp.expect((select count(*) from public.platform_settings where key = 'model_settings') = 1, 'MR1. anon no lee model_settings');
rollback;
begin;
select pg_temp.as_user(:'p1');
update public.platform_settings set value = '{}' where key = 'model_settings';
select pg_temp.expect((select value #>> '{thresholds,minGroupSize}' from public.platform_settings where key = 'model_settings') = '30',
  'CA1. Un alumno cambió model_settings');
rollback;
begin;
select pg_temp.as_user(:'ad');
update public.platform_settings set value = jsonb_set(value, '{thresholds,adaptiveMinItems}', '60') where key = 'model_settings';
select pg_temp.expect((select (value #>> '{thresholds,adaptiveMinItems}')::int from public.platform_settings where key = 'model_settings') = 60,
  'CA1. El admin no pudo cambiar model_settings');
rollback;

-- ===================================================================== CA2. Quién cuenta
\set s1 'ca000000-0000-0000-0000-000000000101'
\set s2 'ca000000-0000-0000-0000-000000000102'
\set s3 'ca000000-0000-0000-0000-000000000103'
\set s4 'ca000000-0000-0000-0000-000000000104'
\set s5 'ca000000-0000-0000-0000-000000000105'
\set s6 'ca000000-0000-0000-0000-000000000106'
\set s7 'ca000000-0000-0000-0000-000000000107'
\set s8 'ca000000-0000-0000-0000-000000000108'
\set s9 'ca000000-0000-0000-0000-000000000109'
\set s10 'ca000000-0000-0000-0000-00000000010a'
\set s11 'ca000000-0000-0000-0000-00000000010b'
insert into auth.users (id, email, raw_user_meta_data)
  select ('ca000000-0000-0000-0000-0000000001' || lpad(to_hex(n), 2, '0'))::uuid, 'ca-s' || n || '@x.mx', jsonb_build_object('alias', 'Alumno CA ' || n)
  from generate_series(1, 11) n;
-- Una vez que cada permiso quedó, el corte es el seq más alto de ese momento
select pg_temp.consent(:'s1', 'granted', '2026-09-01 10:00+00');
select pg_temp.consent(:'s2', 'granted', '2026-09-01 10:00+00');
select pg_temp.consent(:'s2', 'revoked', '2026-09-02 10:00+00');
select pg_temp.consent(:'s3', 'granted', '2026-09-01 10:00+00', '2026-10-14b');
select pg_temp.consent(:'s4', 'granted', '2026-09-01 10:00+00');
select pg_temp.consent(:'s5', 'granted', '2026-09-01 10:00+00');
update public.user_roles set role = 'physician' where user_id = :'s4';
update public.user_roles set role = 'admin' where user_id = :'s5';
-- s6 retira y vuelve a dar el permiso, vale el último. s7 solo dio otra finalidad. s8 lo dio con un aviso posterior
select pg_temp.consent(:'s6', 'revoked', '2026-09-01 10:00+00');
select pg_temp.consent(:'s6', 'granted', '2026-09-03 10:00+00');
select pg_temp.consent(:'s7', 'granted', '2026-09-01 10:00+00', '2026-10-15b', 'ai_analysis');
select pg_temp.consent(:'s7', 'granted', '2026-09-01 10:00+00', '2026-10-15b', 'party');
select pg_temp.consent(:'s8', 'granted', '2026-09-01 10:00+00', '2026-10-16');
-- Una versión escrita como texto: 2026-10-15 es anterior a 2026-10-15b
select pg_temp.consent(:'s9', 'granted', '2026-09-01 10:00+00', '2026-10-15');
-- Mismo instante: gana el evento que llegó después (seq mayor)
select pg_temp.consent(:'s10', 'granted', '2026-09-05 10:00+00');
select pg_temp.consent(:'s10', 'revoked', '2026-09-05 10:00+00');
select pg_temp.consent(:'s11', 'revoked', '2026-09-05 10:00+00');
select pg_temp.consent(:'s11', 'granted', '2026-09-05 10:00+00');
select max(seq) as cut1 from public.events \gset
-- Un permiso posterior al corte no cuenta en ese corte
select pg_temp.consent(:'s2', 'granted', '2026-09-10 10:00+00');
select pg_temp.consent(:'s9', 'granted', '2026-09-10 10:00+00', '2026-10-15b');
select pg_temp.expect(
  (select array_agg(user_id order by user_id) from public.calibration_consenters(:'cut1') where user_id::text like 'ca000000-%') =
    array[:'s1', :'s6', :'s8', :'s11']::uuid[],
  'CA2. Los alumnos con permiso vigente no son los que debían ser (s1, s6, s8 y s11)');
-- Con el corte siguiente, el permiso que s2 volvió a dar y el que s9 dio con el aviso nuevo ya cuentan
select pg_temp.expect(
  (select array_agg(user_id order by user_id) from public.calibration_consenters((select max(seq) from public.events))
     where user_id::text like 'ca000000-%') =
    array[:'s1', :'s2', :'s6', :'s8', :'s9', :'s11']::uuid[],
  'CA2. El corte siguiente no sumó a s2 y a s9');
-- El equipo no entra aunque prenda el permiso, ni el que lo dio bajo un aviso anterior a minNoticeVersion
select pg_temp.expect(not exists (
  select 1 from public.calibration_consenters((select max(seq) from public.events)) where user_id in (:'s3', :'s4', :'s5', :'s7', :'s10')),
  'CA2. Contó a alguien que no debía');
-- Si el admin sube la versión mínima del aviso, quien lo dio con la anterior deja de contar
begin;
update public.platform_settings set value = jsonb_set(value, '{calibration,minNoticeVersion}', '"2026-10-16"') where key = 'model_settings';
select pg_temp.expect(
  (select array_agg(user_id order by user_id) from public.calibration_consenters((select max(seq) from public.events))
     where user_id::text like 'ca000000-%') = array[:'s8']::uuid[],
  'CA2. Subir la versión mínima del aviso no dejó solo a s8');
rollback;
-- Un corte antes de que existiera cualquier evento no cuenta a nadie
select pg_temp.expect((select count(*) from public.calibration_consenters(0)) = 0, 'CA2. El corte 0 contó a alguien');

-- ===================================================================== CA13. Solo agregar
-- Una versión aprobada del banco y una corrida a mano, como superusuario, para probar que las tablas de
-- resultados no se editan ni así
select pg_temp.bank_seed('CA-0001') as q1 \gset
select pg_temp.latest(:'q1') as v1 \gset
insert into public.calibration_runs (id, run_trigger, mode) values ('ca100000-0000-0000-0000-000000000001', 'selftest', 'dry_run');
insert into public.item_calibrations (run_id, version_id, question_id, students, difficulty, se, state)
  values ('ca100000-0000-0000-0000-000000000001', :'v1', :'q1', 50, 0.5, 0.4, 'provisional');
insert into public.option_calibrations (run_id, version_id, option_id, exposures, choices)
  select 'ca100000-0000-0000-0000-000000000001', :'v1', coalesce(option_id, id), 50, 10 from public.question_options where question_version_id = :'v1' limit 1;
insert into public.population_snapshots (run_id, data) values ('ca100000-0000-0000-0000-000000000001', '{"items":{"calibrated":1}}');
insert into public.comparison_cells (run_id, cohort, cohort_key, metric, branch, students, cuts)
  values ('ca100000-0000-0000-0000-000000000001', 'all', '*', 'reviews', '*', 40,
    (select array_agg(g::numeric) from generate_series(1, 19) g));
insert into public.agreement_snapshots (run_id, pairs, kappa, observed, expected, parity)
  values ('ca100000-0000-0000-0000-000000000001', 31, 0.5, 0.7, 0.4, true);
select pg_temp.expect(pg_temp.fails_with($q$update public.item_calibrations set students = 51$q$) = '42501', 'CA13. Se pudo editar item_calibrations');
select pg_temp.expect(pg_temp.fails_with($q$update public.option_calibrations set choices = 11$q$) = '42501', 'CA13. Se pudo editar option_calibrations');
select pg_temp.expect(pg_temp.fails_with($q$update public.population_snapshots set data = '{}'$q$) = '42501', 'CA13. Se pudo editar population_snapshots');
select pg_temp.expect(pg_temp.fails_with($q$update public.comparison_cells set students = 41$q$) = '42501', 'CA13. Se pudo editar comparison_cells');
select pg_temp.expect(pg_temp.fails_with($q$update public.agreement_snapshots set pairs = 32$q$) = '42501', 'CA13. Se pudo editar agreement_snapshots');
-- La corrida sí cambia, es su estado
select pg_temp.expect(pg_temp.fails_with($q$update public.calibration_runs set status = 'ok', finished_at = now() where id = 'ca100000-0000-0000-0000-000000000001'$q$) is null,
  'CA13. calibration_runs debía poder cambiar de estado');

-- ===================================================================== CA6. Lo que guardan las tablas
-- Cortes con menos de 30 alumnos, con 18 o 20 cortes, o una celda de especialidad sin su clave
select pg_temp.expect(pg_temp.fails_with($q$insert into public.comparison_cells (run_id, cohort, cohort_key, metric, branch, students, cuts)
  values ('ca100000-0000-0000-0000-000000000001', 'all', '*', 'consistency', '*', 29, (select array_agg(g::numeric) from generate_series(1, 19) g))$q$) = '23514',
  'CA6. Una celda con 29 alumnos guardó cortes');
select pg_temp.expect(pg_temp.fails_with($q$insert into public.comparison_cells (run_id, cohort, cohort_key, metric, branch, students, cuts)
  values ('ca100000-0000-0000-0000-000000000001', 'all', '*', 'consistency', '*', 40, (select array_agg(g::numeric) from generate_series(1, 18) g))$q$) = '23514',
  'CA6. Una celda con 18 cortes se guardó');
select pg_temp.expect(pg_temp.fails_with($q$insert into public.comparison_cells (run_id, cohort, cohort_key, metric, branch, students, cuts)
  values ('ca100000-0000-0000-0000-000000000001', 'all', '*', 'consistency', '*', 40, (select array_agg(g::numeric) from generate_series(1, 20) g))$q$) = '23514',
  'CA6. Una celda con 20 cortes se guardó');
select pg_temp.expect(pg_temp.fails_with($q$insert into public.comparison_cells (run_id, cohort, cohort_key, metric, branch, students, cuts)
  values ('ca100000-0000-0000-0000-000000000001', 'specialty', '*', 'consistency', '*', 40, null)$q$) = '23514',
  'CA6. Una celda de especialidad sin especialidad se guardó');
select pg_temp.expect(pg_temp.fails_with($q$insert into public.comparison_cells (run_id, cohort, cohort_key, metric, branch, students, cuts)
  values ('ca100000-0000-0000-0000-000000000001', 'all', '*', 'consistency', '*', 5, null)$q$) is null,
  'CA6. Una celda chica sin cortes debía poder guardarse');
-- Los conteos y la población solo aceptan números y códigos
select pg_temp.expect(pg_temp.fails_with($q$update public.calibration_runs set counts = '{"texto":"Un caso de [Prueba] con espacios"}' where id = 'ca100000-0000-0000-0000-000000000001'$q$) = '23514',
  'CA6. calibration_runs.counts guardó texto');
select pg_temp.expect(pg_temp.fails_with($q$update public.calibration_runs set counts = '{"consenters":412,"items":{"calibrated":3},"mode":"dry_run","parity":true}' where id = 'ca100000-0000-0000-0000-000000000001'$q$) is null,
  'CA6. calibration_runs.counts no guardó números y códigos');
insert into public.calibration_runs (id, run_trigger, mode) values ('ca100000-0000-0000-0000-000000000002', 'selftest', 'dry_run');
select pg_temp.expect(pg_temp.fails_with($q$insert into public.population_snapshots (run_id, data) values ('ca100000-0000-0000-0000-000000000002', '{"alumno":"Ana López"}')$q$) = '23514',
  'CA6. population_snapshots guardó un nombre');
-- Esa corrida de apoyo no se queda en curso, porque estorbaría al candado de las pruebas que siguen
update public.calibration_runs set status = 'failed', finished_at = now() where id = 'ca100000-0000-0000-0000-000000000002';
select pg_temp.expect(public.model_json_numeric_only('{"pediatrics/neonatology":{"students":96,"accuracy":0.58},"fatigue":{"state":"calibrating"},"rows":[1,2,null,true]}')
  and not public.model_json_numeric_only('{"a":"Hola mundo"}')
  and not public.model_json_numeric_only('{"a":"MAYUSCULAS"}')
  and not public.model_json_numeric_only('{"clave con espacios":1}')
  and not public.model_json_numeric_only('{"a":{"b":["texto largo con espacios"]}}')
  and not public.model_json_numeric_only('"Ana"'::jsonb)
  and public.model_json_numeric_only('7'::jsonb)
  and not public.model_json_numeric_only(null),
  'CA6. model_json_numeric_only no distinguió texto de números y códigos');
-- La corrida solo guarda el número de la corrida de GitHub y el commit
select pg_temp.expect(pg_temp.fails_with($q$update public.calibration_runs set runner = '{"runId":"123","sha":"0a1b2c3","correo":"x@x.mx"}' where id = 'ca100000-0000-0000-0000-000000000001'$q$) = '23514',
  'CA6. La corrida guardó otra cosa que runId y sha');
select pg_temp.expect(pg_temp.fails_with($q$update public.calibration_runs set runner = '{"runId":"123","sha":"0a1b2c3"}' where id = 'ca100000-0000-0000-0000-000000000001'$q$) is null,
  'CA6. La corrida no guardó runId y sha');
-- Un solo model_publication
select pg_temp.expect(pg_temp.fails_with($q$insert into public.model_publication (id, run_id) values (false, null)$q$) = '23514',
  'CA6. model_publication aceptó más de una fila');

-- ===================================================================== CA1. Permisos de lo de la migración 1
-- Las tablas nuevas no se leen desde la API, tampoco como service_role. Las funciones internas no las
-- ejecuta nadie de la API
begin;
select pg_temp.as_anon();
select pg_temp.expect(pg_temp.is_blocked('select count(*) from public.calibration_runs')
  and pg_temp.is_blocked('select count(*) from public.item_calibrations')
  and pg_temp.is_blocked('select count(*) from public.option_calibrations')
  and pg_temp.is_blocked('select count(*) from public.population_snapshots')
  and pg_temp.is_blocked('select count(*) from public.comparison_cells')
  and pg_temp.is_blocked('select count(*) from public.agreement_snapshots')
  and pg_temp.is_blocked('select count(*) from public.model_publication'), 'CA1. anon leyó una tabla de la calibración');
rollback;
begin;
select pg_temp.as_user(:'f1');
select pg_temp.expect(pg_temp.is_blocked('select count(*) from public.calibration_runs')
  and pg_temp.is_blocked('select count(*) from public.item_calibrations')
  and pg_temp.is_blocked('select count(*) from public.comparison_cells')
  and pg_temp.is_blocked('select public.calibration_consenters(1)')
  and pg_temp.is_blocked('select public.model_settings_json()')
  and pg_temp.is_blocked('select public.uuid_to_ulid(gen_random_uuid())'), 'CA1. Un alumno Gratis tocó la calibración');
rollback;
begin;
select pg_temp.as_user(:'p1');
select pg_temp.expect(pg_temp.is_blocked('select count(*) from public.calibration_runs')
  and pg_temp.is_blocked('select public.calibration_consenters(1)')
  and pg_temp.is_blocked($$select public.calibration_pseudonym('ca100000-0000-0000-0000-000000000001', gen_random_uuid())$$), 'CA1. Un alumno de pago tocó la calibración');
rollback;
begin;
select pg_temp.as_user(:'m1');
select pg_temp.expect(pg_temp.is_blocked('select count(*) from public.calibration_runs')
  and pg_temp.is_blocked('select count(*) from public.item_calibrations')
  and pg_temp.is_blocked('select public.calibration_consenters(1)'), 'CA1. Un médico tocó la calibración');
rollback;
begin;
select pg_temp.as_user(:'ad');
select pg_temp.expect(pg_temp.is_blocked('select count(*) from public.calibration_runs')
  and pg_temp.is_blocked('select count(*) from public.item_calibrations')
  and pg_temp.is_blocked('select count(*) from public.population_snapshots')
  and pg_temp.is_blocked('select public.calibration_consenters(1)')
  and pg_temp.is_blocked('select public.model_json_numeric_only(''{}'')'), 'CA1. Un admin tocó la calibración');
rollback;
begin;
select pg_temp.as_service();
select pg_temp.expect(pg_temp.is_blocked('select count(*) from public.calibration_runs')
  and pg_temp.is_blocked('select count(*) from public.item_calibrations')
  and pg_temp.is_blocked('select count(*) from public.option_calibrations')
  and pg_temp.is_blocked('select count(*) from public.population_snapshots')
  and pg_temp.is_blocked('select count(*) from public.comparison_cells')
  and pg_temp.is_blocked('select count(*) from public.agreement_snapshots')
  and pg_temp.is_blocked('select count(*) from public.model_publication')
  and pg_temp.is_blocked('select public.calibration_consenters(1)')
  and pg_temp.is_blocked('select public.model_settings_json()'), 'CA1. La llave de servicio leyó una tabla o una ayuda interna directo');
rollback;
do $$
declare
  v_fn text;
begin
  foreach v_fn in array array[
    'public.uuid_to_ulid(uuid)', 'public.ulid_to_uuid(text)', 'public.model_json_numeric_only(jsonb)',
    'public.model_setting(text[], numeric)', 'public.model_settings_json()', 'public.calibration_consenters(bigint)',
    'public.calibration_hash(bytea, text)', 'public.calibration_pseudonym(uuid, uuid)'] loop
    if has_function_privilege('anon', v_fn, 'execute') or has_function_privilege('authenticated', v_fn, 'execute')
       or has_function_privilege('service_role', v_fn, 'execute') then
      raise exception 'FALLA CA1. % es interna y alguien de la API puede ejecutarla', v_fn;
    end if;
  end loop;
end $$;


-- ===================================================================== Ayudas de la noche
-- Los instantes caen a las 10 a. m. de Mérida de un día de estudio pasado, así la prueba da lo mismo a
-- cualquier hora del día. Los eventos suben como los sube la app, con ULID
create or replace function pg_temp.at(p_days integer, p_minutes numeric default 0) returns timestamptz language sql as $$
  select ((public.study_day() - p_days)::timestamp + interval '10 hours' + p_minutes * interval '1 minute') at time zone 'America/Merida'
$$;
create or replace function pg_temp.session_start(p_user uuid, p_session text, p_days integer, p_kind text default 'practice')
returns void language sql as $$
  select pg_temp.ev(p_user, 'session_started', pg_temp.at(p_days), jsonb_build_object('kind', p_kind, 'config', '{}'::jsonb), p_session)
$$;
-- El alumno pide la versión al servidor. Sin esto su respuesta no cuenta
create or replace function pg_temp.bank_read(p_user uuid, p_version uuid, p_days integer) returns void language sql as $$
  insert into public.bank_reads (user_id, question_id, version_id, day, plan, purpose)
  select p_user, q.question_id, q.id, public.study_day() - p_days, 'monthly', 'practice'
  from public.questions q where q.id = p_version
  on conflict (user_id, question_id, day) do nothing
$$;
-- Las opciones de una versión en el orden de su posición, como las muestra la app
create or replace function pg_temp.shown_options(p_version uuid) returns jsonb language sql as $$
  select jsonb_agg(jsonb_build_object('optionVersionId', public.uuid_to_ulid(o.id), 'position', o.position) order by o.position)
  from public.question_options o where o.question_version_id = p_version
$$;
create or replace function pg_temp.shown(p_user uuid, p_version uuid, p_days integer, p_minutes numeric, p_session text default null)
returns void language sql as $$
  select pg_temp.ev(p_user, 'question_shown', pg_temp.at(p_days, p_minutes), jsonb_build_object(
    'questionVersionId', public.uuid_to_ulid(p_version), 'shownOptions', pg_temp.shown_options(p_version),
    'seed', 'ca', 'samplingMode', 'random', 'highlightEnabled', false, 'positionInSession', 0), p_session)
$$;
-- p_pick es la posición de la opción elegida. La 0 es la correcta. El cliente dice siempre que acertó,
-- aunque no sea cierto, y el servidor no le cree
create or replace function pg_temp.answered(
  p_user uuid, p_version uuid, p_pick integer, p_days integer, p_minutes numeric,
  p_session text default null, p_extra jsonb default '{}'
) returns void language sql as $$
  select pg_temp.ev(p_user, 'question_answered', pg_temp.at(p_days, p_minutes), jsonb_build_object(
    'questionVersionId', public.uuid_to_ulid(p_version),
    'optionVersionId', (select public.uuid_to_ulid(o.id) from public.question_options o
                        where o.question_version_id = p_version and o.position = p_pick),
    'correct', true, 'confidence', 'sure', 'msToAnswer', 20000, 'changeCount', 0, 'highlightEnabled', false
  ) || p_extra, p_session)
$$;
-- Un intento bien armado, el alumno pide la versión, ve las opciones y contesta
create or replace function pg_temp.attempt(
  p_user uuid, p_version uuid, p_pick integer, p_days integer, p_minutes numeric,
  p_session text default null, p_extra jsonb default '{}'
) returns void language sql as $$
  select pg_temp.bank_read(p_user, p_version, p_days);
  select pg_temp.shown(p_user, p_version, p_days, p_minutes - 0.5, p_session);
  select pg_temp.answered(p_user, p_version, p_pick, p_days, p_minutes, p_session, p_extra);
$$;

-- ===================================================================== Siembra de la noche
select pg_temp.bank_seed('CA-0002') as q2 \gset
select pg_temp.latest(:'q2') as v2 \gset
select pg_temp.bank_seed('CA-0003', 'draft') as q3 \gset
select pg_temp.latest(:'q3') as v3 \gset
select pg_temp.bank_seed('CA-0004') as q4 \gset
select pg_temp.latest(:'q4') as v4 \gset
update public.questions set is_demo = true where id = :'v4';
select pg_temp.expect(
  (select o.position = 0 and o.is_correct from public.question_options o where o.question_version_id = :'v1' order by o.position limit 1),
  'CA0. La opción correcta de la siembra no está en la posición 0');
-- La médica que revisa q1 recibe el resumen de distractores. q2 no tiene a nadie asignado
insert into public.review_assignments (question_id, physician_id, role) values (:'q1', :'m1', 'reviewer');
-- Especialidad objetivo de dos alumnos. Todavía no lo decido cuenta como sin especialidad
update public.private_accounts set target_specialty = 'general_surgery' where user_id = :'s1';
update public.private_accounts set target_specialty = 'undecided' where user_id = :'s2';

-- s1. Una sesión de práctica. En q1 elige un distractor y el cliente dice que acertó. En q2 acierta
select pg_temp.session_start(:'s1', 'S-s1-a', 2);
select pg_temp.attempt(:'s1', :'v1', 1, 2, 2, 'S-s1-a', '{"changeCount": 1}');
select pg_temp.attempt(:'s1', :'v2', 0, 2, 4, 'S-s1-a', '{"msToAnswer": 15000, "confidence": "unsure"}');
select pg_temp.ev(:'s1', 'cause_reported', pg_temp.at(2, 5),
  jsonb_build_object('targetKind', 'question', 'targetId', public.uuid_to_ulid(:'v1'), 'cause', 'knowledge'), 'S-s1-a');
-- s2. q1 bien y q2 sin haberla pedido al servidor, que no cuenta
select pg_temp.attempt(:'s2', :'v1', 0, 3, 3);
select pg_temp.shown(:'s2', :'v2', 3, 4);
select pg_temp.answered(:'s2', :'v2', 0, 3, 4.5);
-- s6. Lo que un cliente mal hecho o malintencionado sube. Solo la última fila cuenta
select pg_temp.bank_read(:'s6', :'v1', 3);
select pg_temp.bank_read(:'s6', :'v2', 3);
select pg_temp.bank_read(:'s6', :'v3', 3);
select pg_temp.bank_read(:'s6', :'v4', 3);
-- una opción que no es de esa versión
select pg_temp.ev(:'s6', 'question_answered', pg_temp.at(3, 1), jsonb_build_object(
  'questionVersionId', public.uuid_to_ulid(:'v1'),
  'optionVersionId', (select public.uuid_to_ulid(o.id) from public.question_options o where o.question_version_id = :'v2' and o.position = 0),
  'correct', true, 'msToAnswer', 9000, 'changeCount', 0));
-- una versión en borrador y una de la demo
select pg_temp.answered(:'s6', :'v3', 0, 3, 2);
select pg_temp.answered(:'s6', :'v4', 0, 3, 3);
-- una versión que es un número y un cuerpo que no es objeto
select pg_temp.ev(:'s6', 'question_answered', pg_temp.at(3, 4), '{"questionVersionId": 5, "optionVersionId": 7}');
select pg_temp.ev(:'s6', 'question_answered', pg_temp.at(3, 4.5), '[1, 2, 3]');
-- una respuesta buena con campos fuera de rango: milisegundos con texto, confianza inventada y 999 cambios
select pg_temp.answered(:'s6', :'v2', 1, 3, 5, null, '{"msToAnswer": "rápido", "confidence": "bogus", "changeCount": 999}');
-- otra con milisegundos de más y de menos, en q1
select pg_temp.answered(:'s6', :'v1', 2, 3, 6, null, '{"msToAnswer": 1000000000000000}');
-- s8. Una sesión larga de 9 respuestas en 48 minutos y un motivo de error en la octava
select pg_temp.session_start(:'s8', 'S-s8-a', 1);
select pg_temp.bank_read(:'s8', :'v1', 1);
select pg_temp.bank_read(:'s8', :'v2', 1);
select pg_temp.answered(:'s8', case when n % 2 = 1 then :'v1'::uuid else :'v2'::uuid end, case when n % 3 = 0 then 0 else 2 end, 1, 6 * (n - 1), 'S-s8-a')
  from generate_series(1, 9) n;
select pg_temp.ev(:'s8', 'cause_reported', pg_temp.at(1, 44),
  jsonb_build_object('targetKind', 'question', 'targetId', public.uuid_to_ulid(:'q2'), 'cause', 'fatigue'), 'S-s8-a');
-- Un motivo de una tarjeta, otro de una causa que no existe y otro de una pregunta fuera del banco no cuentan
select pg_temp.ev(:'s8', 'cause_reported', pg_temp.at(1, 45),
  jsonb_build_object('targetKind', 'card', 'targetId', public.uuid_to_ulid(:'q2'), 'cause', 'fatigue'), 'S-s8-a');
select pg_temp.ev(:'s8', 'cause_reported', pg_temp.at(1, 46),
  jsonb_build_object('targetKind', 'question', 'targetId', public.uuid_to_ulid(:'q2'), 'cause', 'Ana López'), 'S-s8-a');
select pg_temp.ev(:'s8', 'cause_reported', pg_temp.at(1, 47),
  jsonb_build_object('targetKind', 'question', 'targetId', public.uuid_to_ulid(:'v3'), 'cause', 'time'), 'S-s8-a');
-- s9. Pidió q1 un día después de contestarla, así que no tenía la lectura previa
select pg_temp.bank_read(:'s9', :'v1', 1);
select pg_temp.shown(:'s9', :'v1', 2, 1);
select pg_temp.answered(:'s9', :'v1', 0, 2, 2);
-- s11. Sin sesión y con una sesión de un tipo que no existe
select pg_temp.attempt(:'s11', :'v1', 3, 2, 8);
select pg_temp.session_start(:'s11', 'S-s11-a', 2, 'bogus');
select pg_temp.attempt(:'s11', :'v2', 0, 2, 9, 'S-s11-a');
-- Los que no dieron permiso también contestan, y no entra ninguna de sus filas
select pg_temp.attempt(:'s3', :'v1', 0, 2, 3);
select pg_temp.attempt(:'s4', :'v1', 1, 2, 3);
select pg_temp.attempt(:'s5', :'v1', 1, 2, 3);
select pg_temp.attempt(:'s7', :'v1', 1, 2, 3);
select pg_temp.attempt(:'s10', :'v1', 1, 2, 3);
select pg_temp.attempt(:'f1', :'v1', 1, 2, 3);
select pg_temp.attempt(:'p1', :'v1', 1, 2, 3);
-- Repasos de tarjetas. Los de hoy y los de hace 45 días quedan fuera de la ventana de 30 días
select pg_temp.ev(u, 'card_reviewed', pg_temp.at(d, 20 + r),
  jsonb_build_object('cardId', public.uuid_to_ulid(gen_random_uuid()), 'deckId', public.uuid_to_ulid(gen_random_uuid()),
    'source', 'card', 'rating', 3, 'confidence', null, 'msToReveal', 3000, 'msToRate', 2000))
  from (values (:'s1'::uuid), (:'s2'::uuid), (:'s3'::uuid)) as t (u),
       (values (1), (2), (45)) as dd (d), generate_series(1, 3) r;

-- ===================================================================== CA11. Interruptor, modo y candado
-- Apagada, como nace, deja una corrida saltada con disabled y no lee nada
begin;
select pg_temp.as_service();
select public.calibration_begin('manual', false, '{"runId":"900","sha":"0a1b2c3","correo":"x@x.mx","nombre":"Ana"}') as skipped \gset
commit;
select pg_temp.expect(:'skipped'::jsonb ->> 'status' = 'skipped' and :'skipped'::jsonb ->> 'reason' = 'disabled'
  and :'skipped'::jsonb ->> 'mode' = 'dry_run' and (:'skipped'::jsonb -> 'asOfSeq') = 'null'::jsonb
  and (:'skipped'::jsonb -> 'settings') = 'null'::jsonb, 'CA11. Con la calibración apagada no saltó con disabled');
select pg_temp.expect((
  select status = 'skipped' and reason = 'disabled' and salt is null and as_of_seq is null and finished_at is not null
         and runner = '{"runId":"900","sha":"0a1b2c3"}'::jsonb and run_trigger = 'manual'
  from public.calibration_runs where id = (:'skipped'::jsonb ->> 'runId')::uuid),
  'CA11. La corrida saltada no quedó registrada, o guardó del runner más que runId y sha');
-- Sin la clave de ajustes todavía no está configurada
begin;
delete from public.platform_settings where key = 'model_settings';
select pg_temp.as_service();
select public.calibration_begin('manual', false, '{}') ->> 'reason' as not_configured \gset
rollback;
select pg_temp.expect(:'not_configured' = 'not_configured', 'CA11. Sin model_settings no saltó con not_configured');
select pg_temp.expect(pg_temp.fails_with($q$select public.calibration_begin('cron', false, '{}')$q$) = '22023',
  'CA11. Aceptó un disparador desconocido');
select pg_temp.expect(pg_temp.fails_with($q$select public.calibration_begin(null, false, '{}')$q$) = '22023',
  'CA11. Aceptó un disparador null');

-- Prendida y en dry_run. Una sola corrida a la vez
update public.platform_settings set value = jsonb_set(value, '{calibration,enabled}', 'true') where key = 'model_settings';
begin;
select pg_temp.as_service();
select public.calibration_begin('manual', false, '{}') as r1 \gset
select public.calibration_begin('manual', false, '{}') as r2 \gset
commit;
select pg_temp.expect(:'r1'::jsonb ->> 'status' = 'running' and :'r1'::jsonb ->> 'mode' = 'dry_run'
  and (:'r1'::jsonb -> 'reason') = 'null'::jsonb
  and (:'r1'::jsonb ->> 'asOfSeq')::bigint = (select max(seq) from public.events)
  and :'r1'::jsonb ->> 'studyDay' = to_char(public.study_day(), 'YYYY-MM-DD')
  and :'r1'::jsonb #>> '{settings,model,calibration,enabled}' = 'true'
  and jsonb_typeof(:'r1'::jsonb #> '{settings,thresholds}') = 'object'
  and (:'r1'::jsonb #>> '{counts,consenters}')::int >= 6,
  'CA11. La primera corrida no quedó running con su corte, su día y sus ajustes');
select pg_temp.expect(:'r2'::jsonb ->> 'status' = 'skipped' and :'r2'::jsonb ->> 'reason' = 'running',
  'CA11. Un segundo begin seguido no saltó con running');
select pg_temp.expect((select count(*) from public.calibration_runs where status = 'running') = 1,
  'CA11. Hay más de una corrida en curso');
select pg_temp.expect(pg_temp.fails_with($q$insert into public.calibration_runs (run_trigger, mode, status) values ('manual', 'dry_run', 'running')$q$) = '23505',
  'CA11. El índice no frenó una segunda corrida en curso');
-- Una corrida que lleva más de 3 horas en curso se da por perdida
select :'r1'::jsonb ->> 'runId' as r1id \gset
update public.calibration_runs set started_at = now() - interval '4 hours' where id = :'r1id';
begin;
select pg_temp.as_service();
select public.calibration_begin('manual', false, '{}') as r3 \gset
commit;
select pg_temp.expect((select status = 'interrupted' and reason = 'timeout' and salt is null and finished_at is not null
                       from public.calibration_runs where id = :'r1id') and :'r3'::jsonb ->> 'status' = 'running',
  'CA11. Una corrida de hace 4 horas no pasó a interrupted');
select :'r3'::jsonb ->> 'runId' as r3id \gset
begin;
select pg_temp.as_service();
select public.calibration_finish(:'r3id', 'failed', 'selftest_stop', '{"pages":0}') as fin3 \gset
commit;
select pg_temp.expect(:'fin3'::jsonb ->> 'status' = 'failed' and (:'fin3'::jsonb ->> 'applied')::boolean = false
  and (select status = 'failed' and reason = 'selftest_stop' and salt is null and finished_at is not null and applied_at is null
              and counts ->> 'pages' = '0' and (counts ->> 'consenters')::int >= 6
       from public.calibration_runs where id = :'r3id'),
  'CA11. Cerrar como failed no dejó la corrida con su motivo, sin sal y sin aplicar');
-- Una corrida cerrada no se cierra otra vez ni se sigue exportando
select pg_temp.expect(pg_temp.fails_with(format('select public.calibration_finish(%L, %L, null, null)', :'r3id', 'ok')) = '22023'
  and pg_temp.fails_with(format('select public.calibration_bank(%L)', :'r3id')) = '22023'
  and pg_temp.fails_with(format('select public.calibration_publish_items(%L, %L)', :'r3id', '[]')) = '22023',
  'CA11. Una corrida cerrada siguió aceptando llamadas');
select pg_temp.expect(pg_temp.fails_with(format('select public.calibration_finish(%L, %L, null, null)', gen_random_uuid(), 'ok')) = '22023',
  'CA11. Cerró una corrida que no existe');

-- Con apply en el ajuste, forzar dry_run gana. Sin forzar corre en apply
update public.platform_settings set value = jsonb_set(value, '{calibration,mode}', '"apply"') where key = 'model_settings';
begin;
select pg_temp.as_service();
select public.calibration_begin('manual', false, '{}') as ra1 \gset
select public.calibration_finish((:'ra1'::jsonb ->> 'runId')::uuid, 'failed', 'selftest_stop', '{}') as fa1 \gset
select public.calibration_begin('manual', true, '{}') as ra2 \gset
select public.calibration_finish((:'ra2'::jsonb ->> 'runId')::uuid, 'failed', 'selftest_stop', '{}') as fa2 \gset
commit;
select pg_temp.expect(:'ra1'::jsonb ->> 'mode' = 'apply' and :'ra2'::jsonb ->> 'mode' = 'dry_run',
  'CA11. Forzar dry_run no ganó a apply, o apply no corrió en apply');
-- Estados y motivos que no son códigos se rechazan
begin;
select pg_temp.as_service();
select public.calibration_begin('manual', true, '{}') ->> 'runId' as rbad \gset
select pg_temp.expect(pg_temp.fails_with(format('select public.calibration_finish(%L, %L, null, null)', :'rbad', 'listo')) = '22023'
  and pg_temp.fails_with(format('select public.calibration_finish(%L, %L, %L, null)', :'rbad', 'ok', 'Motivo con texto')) = '22023'
  and pg_temp.fails_with(format('select public.calibration_finish(%L, %L, null, %L)', :'rbad', 'ok', '{"a":"Hola mundo"}')) = '22023'
  and pg_temp.fails_with(format('select public.calibration_finish(%L, %L, null, %L)', :'rbad', 'ok', '[1]')) = '22023',
  'CA11. calibration_finish aceptó un estado, un motivo o unos conteos con texto');
rollback;

-- ===================================================================== CA1. Permisos del corredor
-- Ninguno de los cinco tipos de usuario ejecuta una función calibration_*. Solo la llave de servicio
create or replace function pg_temp.runner_closed(p_as text) returns void language plpgsql as $$
declare
  v_run uuid := gen_random_uuid();
  v_stmt text;
  v_code text;
begin
  if p_as = 'anon' then perform pg_temp.as_anon(); else perform pg_temp.as_user(p_as); end if;
  foreach v_stmt in array array[
    $f$select public.calibration_begin('manual', false, '{}')$f$,
    format($f$select public.calibration_bank(%L)$f$, v_run),
    format($f$select public.calibration_people(%L)$f$, v_run),
    format($f$select public.calibration_answers(%L, 0, 10)$f$, v_run),
    format($f$select public.calibration_exposures(%L, 0, 10)$f$, v_run),
    format($f$select public.calibration_activity(%L, null, 10)$f$, v_run),
    format($f$select public.calibration_motives(%L, 0, 10)$f$, v_run),
    format($f$select public.calibration_label_pairs(%L)$f$, v_run),
    format($f$select public.calibration_publish_items(%L, '[]')$f$, v_run),
    format($f$select public.calibration_publish_options(%L, '[]')$f$, v_run),
    format($f$select public.calibration_publish_population(%L, '{}')$f$, v_run),
    format($f$select public.calibration_publish_comparison(%L, '[]')$f$, v_run),
    format($f$select public.calibration_publish_agreement(%L, '{"pairs":0}')$f$, v_run),
    format($f$select public.calibration_finish(%L, 'failed', null, null)$f$, v_run),
    format($f$select public.calibration_apply(%L)$f$, v_run),
    format($f$select public.calibration_run_row(%L)$f$, v_run),
    $f$select public.calibration_words('a b')$f$,
    $f$select public.calibration_study_day(now())$f$,
    $f$select public.calibration_label_kappa()$f$
  ] loop
    v_code := pg_temp.fails_with(v_stmt);
    if v_code is distinct from '42501' then
      raise exception 'FALLA CA1. % (%) ejecutó o falló distinto de 42501 con %: %', p_as, current_user, v_code, v_stmt;
    end if;
  end loop;
  reset role;
end $$;
begin; select pg_temp.runner_closed('anon'); rollback;
begin; select pg_temp.runner_closed(:'f1'); rollback;
begin; select pg_temp.runner_closed(:'p1'); rollback;
begin; select pg_temp.runner_closed(:'m1'); rollback;
begin; select pg_temp.runner_closed(:'ad'); rollback;
-- La llave de servicio ejecuta las del corredor, pero no las ayudas internas ni calibration_apply
begin;
select pg_temp.as_service();
select pg_temp.expect(pg_temp.is_blocked($q$select public.calibration_apply(gen_random_uuid())$q$)
  and pg_temp.is_blocked($q$select public.calibration_run_row(gen_random_uuid())$q$)
  and pg_temp.is_blocked($q$select public.calibration_label_kappa()$q$)
  and pg_temp.is_blocked($q$select public.calibration_words('a')$q$), 'CA1. La llave de servicio ejecutó una ayuda interna');
rollback;
do $$
declare
  v_fn text;
begin
  foreach v_fn in array array[
    'public.calibration_begin(text, boolean, jsonb)', 'public.calibration_bank(uuid)', 'public.calibration_people(uuid)',
    'public.calibration_answers(uuid, bigint, integer)', 'public.calibration_exposures(uuid, bigint, integer)',
    'public.calibration_activity(uuid, text, integer)', 'public.calibration_motives(uuid, bigint, integer)',
    'public.calibration_label_pairs(uuid)', 'public.calibration_publish_items(uuid, jsonb)',
    'public.calibration_publish_options(uuid, jsonb)', 'public.calibration_publish_population(uuid, jsonb)',
    'public.calibration_publish_comparison(uuid, jsonb)', 'public.calibration_publish_agreement(uuid, jsonb)',
    'public.calibration_finish(uuid, text, text, jsonb)'] loop
    if not has_function_privilege('service_role', v_fn, 'execute')
       or has_function_privilege('anon', v_fn, 'execute') or has_function_privilege('authenticated', v_fn, 'execute') then
      raise exception 'FALLA CA1. % debía ser solo de service_role', v_fn;
    end if;
    if not (select prosecdef from pg_proc where oid = v_fn::regprocedure)
       or not exists (select 1 from pg_proc where oid = v_fn::regprocedure and proconfig @> array['search_path=public, pg_temp']) then
      raise exception 'FALLA CA1. % no es security definer con search_path fijo', v_fn;
    end if;
  end loop;
end $$;

-- ===================================================================== CA15. Límite de tiempo
select pg_temp.expect((
  select count(*) = 7 and bool_and(proconfig @> array['statement_timeout=50s'])
  from pg_proc where pronamespace = 'public'::regnamespace
    and proname in ('calibration_bank', 'calibration_people', 'calibration_answers', 'calibration_exposures',
                    'calibration_activity', 'calibration_motives', 'calibration_label_pairs')),
  'CA15. Las funciones de exportación no llevan statement_timeout de 50 s');
-- También las que guardan filas y la que cierra y aplica, que por la API heredarían los 8 s
select pg_temp.expect((
  select count(*) = 4 and bool_and(proconfig @> array['statement_timeout=50s'])
  from pg_proc where pronamespace = 'public'::regnamespace
    and proname in ('calibration_publish_items', 'calibration_publish_options', 'calibration_publish_comparison', 'calibration_finish')),
  'CA15. Las funciones que publican y cierran no llevan statement_timeout de 50 s');

-- ===================================================================== Corrida A. Exportación en solo reporte
begin;
select pg_temp.as_service();
select public.calibration_begin('selftest', true, '{"runId":"1001","sha":"abcdef0"}') as run_a_json \gset
commit;
select :'run_a_json'::jsonb ->> 'runId' as run_a, :'run_a_json'::jsonb ->> 'asOfSeq' as cut_a \gset
select pg_temp.expect(:'run_a_json'::jsonb ->> 'mode' = 'dry_run' and :'run_a_json'::jsonb ->> 'status' = 'running',
  'CA7. Forzar dry_run no dejó la corrida A en solo reporte');
-- Los seudónimos de la corrida. Las ayudas internas solo las ejecuta el superusuario
select public.calibration_pseudonym(:'run_a', :'s1') as a_s1, public.calibration_pseudonym(:'run_a', :'s2') as a_s2,
  public.calibration_pseudonym(:'run_a', :'s6') as a_s6, public.calibration_pseudonym(:'run_a', :'s8') as a_s8,
  public.calibration_pseudonym(:'run_a', :'s9') as a_s9, public.calibration_pseudonym(:'run_a', :'s11') as a_s11,
  public.calibration_pseudonym(:'run_a', :'s3') as a_s3, public.calibration_pseudonym(:'run_a', :'s4') as a_s4,
  public.calibration_pseudonym(:'run_a', :'s5') as a_s5, public.calibration_pseudonym(:'run_a', :'s7') as a_s7,
  public.calibration_pseudonym(:'run_a', :'s10') as a_s10, public.calibration_pseudonym(:'run_a', :'f1') as a_f1,
  public.calibration_pseudonym(:'run_a', :'p1') as a_p1 \gset
-- Eventos que llegan a media corrida, después del corte. Ninguno entra a las páginas
select pg_temp.consent(:'s3', 'granted', now(), '2026-10-15b');
select pg_temp.attempt(:'s3', :'v2', 0, 1, 12);
select pg_temp.attempt(:'s1', :'v2', 0, 1, 13);
select pg_temp.ev(:'s1', 'cause_reported', pg_temp.at(1, 14),
  jsonb_build_object('targetKind', 'question', 'targetId', public.uuid_to_ulid(:'v2'), 'cause', 'time'));
select pg_temp.ev(:'s1', 'card_reviewed', pg_temp.at(1, 15),
  jsonb_build_object('cardId', public.uuid_to_ulid(gen_random_uuid()), 'deckId', public.uuid_to_ulid(gen_random_uuid()),
    'source', 'card', 'rating', 3, 'confidence', null, 'msToReveal', 3000, 'msToRate', 2000));
select pg_temp.expect((select min(seq) from public.events where id like 'CA%' and seq > :'cut_a') is not null,
  'CA4. La siembra posterior al corte no quedó con seq mayor');

begin;
select pg_temp.as_service();
select public.calibration_bank(:'run_a') as bank_a \gset
select public.calibration_people(:'run_a') as people_a \gset
select public.calibration_answers(:'run_a') as answers_a \gset
select public.calibration_exposures(:'run_a') as exposures_a \gset
select public.calibration_activity(:'run_a') as activity_a \gset
select public.calibration_motives(:'run_a') as motives_a \gset
select public.calibration_label_pairs(:'run_a') as pairs_a \gset
commit;
select (:'bank_a'::jsonb)::text || (:'people_a'::jsonb)::text || (:'answers_a'::jsonb)::text || (:'exposures_a'::jsonb)::text
  || (:'activity_a'::jsonb)::text || (:'motives_a'::jsonb)::text || (:'pairs_a'::jsonb)::text as all_a \gset

-- ----------------------------------------------------------------- CA3. Seudónimos
select pg_temp.expect((select count(*) = 6 and bool_and(p ->> 0 ~ '^[0-9a-f]{16}$')
    from jsonb_array_elements(:'people_a'::jsonb -> 'people') p
    where p ->> 0 = any (array[:'a_s1', :'a_s2', :'a_s6', :'a_s8', :'a_s9', :'a_s11'])),
  'CA3. calibration_people no trae a los seis alumnos con permiso, con un seudónimo de 16 hex');
select pg_temp.expect(
  (select p ->> 1 from jsonb_array_elements(:'people_a'::jsonb -> 'people') p where p ->> 0 = :'a_s1') = 'general_surgery'
  and (select p -> 1 from jsonb_array_elements(:'people_a'::jsonb -> 'people') p where p ->> 0 = :'a_s2') = 'null'::jsonb
  and (select p -> 1 from jsonb_array_elements(:'people_a'::jsonb -> 'people') p where p ->> 0 = :'a_s6') = 'null'::jsonb,
  'CA3. La especialidad no salió como general_surgery, null para Todavía no lo decido y null sin elegir');
select pg_temp.expect(
  position(:'a_s3' in :'all_a') = 0 and position(:'a_s4' in :'all_a') = 0 and position(:'a_s5' in :'all_a') = 0
  and position(:'a_s7' in :'all_a') = 0 and position(:'a_s10' in :'all_a') = 0 and position(:'a_f1' in :'all_a') = 0
  and position(:'a_p1' in :'all_a') = 0, 'CA2. Salió un seudónimo de alguien sin permiso, del equipo o con el permiso posterior al corte');
-- El mismo alumno, el mismo seudónimo en todas las páginas
select pg_temp.expect(
  (select count(*) from jsonb_array_elements(:'answers_a'::jsonb -> 'rows') r where r ->> 0 = :'a_s1') = 2
  and (select count(*) from jsonb_array_elements(:'exposures_a'::jsonb -> 'rows') r where r ->> 0 = :'a_s1') = 2
  and (select count(*) from jsonb_array_elements(:'activity_a'::jsonb -> 'rows') r where r ->> 0 = :'a_s1') = 2
  and (select count(*) from jsonb_array_elements(:'motives_a'::jsonb -> 'rows') r where r ->> 0 = :'a_s1') = 1,
  'CA3. El seudónimo de s1 no es el mismo en las respuestas, las pantallas, la actividad y los motivos');
-- Ninguna salida trae cuentas, alias ni correos
select pg_temp.expect(position('ca000000-' in :'all_a') = 0 and position('@x.mx' in :'all_a') = 0
  and position('Alumno CA' in :'all_a') = 0 and position('Médica CA' in :'all_a') = 0 and position('Gratis CA' in :'all_a') = 0
  and position('Pago CA' in :'all_a') = 0 and position('Admin CA' in :'all_a') = 0 and position('"salt"' in :'all_a') = 0,
  'CA3. Una salida trae un id de cuenta, un alias o un correo');
-- La sal solo vive mientras corre la noche, y el seudónimo sale de ella
select pg_temp.expect((select salt is not null and octet_length(salt) = 32 from public.calibration_runs where id = :'run_a'),
  'CA3. La corrida en curso no tiene su sal de 32 bytes');
select pg_temp.expect(:'a_s1' = (select left(encode(sha256(salt || convert_to(:'s1', 'UTF8')), 'hex'), 16)
  from public.calibration_runs where id = :'run_a'), 'CA3. El seudónimo no es la primera parte de sha256(sal || id)');

-- ----------------------------------------------------------------- CA4. Exportación
select pg_temp.expect(
  exists (select 1 from jsonb_array_elements(:'bank_a'::jsonb -> 'items') i where i ->> 'v' = :'v1')
  and exists (select 1 from jsonb_array_elements(:'bank_a'::jsonb -> 'items') i where i ->> 'v' = :'v2')
  and not exists (select 1 from jsonb_array_elements(:'bank_a'::jsonb -> 'items') i where i ->> 'v' in (:'v3', :'v4')),
  'CA4. El banco exportado no trae las versiones aprobadas, o trae un borrador o la demo');
select pg_temp.expect(jsonb_array_length(:'bank_a'::jsonb -> 'items') = (
    select count(*) from public.questions q join public.bank_questions r on r.question_id = q.question_id
    where q.editorial_status = 'approved' and not q.is_demo),
  'CA4. El banco exportado no trae todas las versiones aprobadas');
-- Quien contesta y está en la lista de la corrida: solo las respuestas con lectura previa, 16 de 23
select pg_temp.expect((select count(*) from jsonb_array_elements(:'answers_a'::jsonb -> 'rows') r
    where r ->> 0 = any (array[:'a_s1', :'a_s2', :'a_s6', :'a_s8', :'a_s9', :'a_s11'])) = 16
  and (:'answers_a'::jsonb ->> 'dropped')::int >= 7 and (:'answers_a'::jsonb ->> 'done')::boolean
  and (:'answers_a'::jsonb ->> 'next')::bigint <= :'cut_a',
  'CA4. Las respuestas exportadas no son las 16 válidas de las 23 de los seis alumnos');
select pg_temp.expect((select count(*) from jsonb_array_elements(:'answers_a'::jsonb -> 'rows') r where r ->> 0 = :'a_s2') = 1
  and (select count(*) from jsonb_array_elements(:'answers_a'::jsonb -> 'rows') r where r ->> 0 = :'a_s9') = 0
  and (select count(*) from jsonb_array_elements(:'answers_a'::jsonb -> 'rows') r where r ->> 0 = :'a_s6') = 2
  and (select count(*) from jsonb_array_elements(:'answers_a'::jsonb -> 'rows') r where r ->> 0 = :'a_s8') = 9
  and (select count(*) from jsonb_array_elements(:'answers_a'::jsonb -> 'rows') r where r ->> 0 = :'a_s11') = 2,
  'CA4. Entró una respuesta sin lectura previa o con una opción de otra versión, un borrador o la demo');
-- s1 en q1 eligió un distractor y el cliente dijo que acertó. El acierto sale de la opción
select pg_temp.expect((
  select r ->> 3 = (select coalesce(option_id, id)::text from public.question_options where question_version_id = :'v1' and position = 1)
     and (r ->> 4)::int = 0 and r ->> 5 = 'practice' and (r ->> 6)::int = 2 and (r ->> 7)::int = 2
     and (r ->> 8)::bigint = 20000 and r ->> 9 = 'sure' and (r ->> 10)::int = 1 and r ->> 1 is not null and r ->> 1 <> :'a_s1'
     and (r ->> 11)::bigint > 0
  from jsonb_array_elements(:'answers_a'::jsonb -> 'rows') r where r ->> 0 = :'a_s1' and r ->> 2 = :'v1'),
  'CA4. La fila de s1 en q1 no trae la opción, el acierto derivado, la sesión, los días, el minuto, los milisegundos, la confianza y los cambios');
select pg_temp.expect((
  select (r ->> 4)::int = 1 and (r ->> 7)::int = 4 and (r ->> 8)::bigint = 15000 and r ->> 9 = 'unsure' and (r ->> 10)::int = 0
  from jsonb_array_elements(:'answers_a'::jsonb -> 'rows') r where r ->> 0 = :'a_s1' and r ->> 2 = :'v2'),
  'CA4. La fila de s1 en q2 no trae el acierto');
-- Campos mal formados quedan en null o recortados, sin tirar la corrida
select pg_temp.expect((
  select (r -> 1) = 'null'::jsonb and (r -> 5) = 'null'::jsonb and (r -> 7) = 'null'::jsonb and (r -> 8) = 'null'::jsonb
     and (r -> 9) = 'null'::jsonb and (r ->> 10)::int = 50 and (r ->> 4)::int = 0
  from jsonb_array_elements(:'answers_a'::jsonb -> 'rows') r where r ->> 0 = :'a_s6' and r ->> 2 = :'v2'),
  'CA4. Una respuesta con campos mal formados no quedó con null y 50 cambios');
select pg_temp.expect((
  select (r ->> 8)::bigint = 86400000
  from jsonb_array_elements(:'answers_a'::jsonb -> 'rows') r where r ->> 0 = :'a_s6' and r ->> 2 = :'v1'),
  'CA4. Unos milisegundos de más no quedaron en 86,400,000');
select pg_temp.expect((select count(*) from jsonb_array_elements(:'answers_a'::jsonb -> 'rows') r
    where r ->> 0 = :'a_s11' and (r -> 1) = 'null'::jsonb and (r -> 5) = 'null'::jsonb and (r -> 7) = 'null'::jsonb) = 1
  and (select count(*) from jsonb_array_elements(:'answers_a'::jsonb -> 'rows') r
    where r ->> 0 = :'a_s11' and (r -> 1) <> 'null'::jsonb and (r -> 5) = 'null'::jsonb and (r ->> 7)::int = 9) = 1,
  'CA4. Sin sesión, o con un tipo de sesión que no existe, no quedó con sesión, tipo y minuto en null');
select pg_temp.expect((select count(distinct r ->> 1) = 1 and bool_and(r ->> 5 = 'practice')
    and array_agg((r ->> 7)::int order by (r ->> 7)::int) = array[0, 6, 12, 18, 24, 30, 36, 42, 48]
    from jsonb_array_elements(:'answers_a'::jsonb -> 'rows') r where r ->> 0 = :'a_s8'),
  'CA4. La sesión larga de s8 no trae una sola sesión seudónima con sus minutos');
-- Pantallas de opciones
select pg_temp.expect((select count(*) from jsonb_array_elements(:'exposures_a'::jsonb -> 'rows') r
    where r ->> 0 = any (array[:'a_s1', :'a_s2', :'a_s6', :'a_s8', :'a_s9', :'a_s11'])) = 7,
  'CA4. Las pantallas de opciones de los seis alumnos no son 7');
select pg_temp.expect((
  select r -> 2 = (select jsonb_agg(coalesce(o.option_id, o.id) order by o.position) from public.question_options o where o.question_version_id = :'v1')
     and r ->> 1 = :'v1' and (r ->> 3)::bigint > 0
  from jsonb_array_elements(:'exposures_a'::jsonb -> 'rows') r where r ->> 0 = :'a_s1' and r ->> 1 = :'v1'),
  'CA4. Las opciones mostradas a s1 no salieron con sus ids estables en el orden de su posición');
-- Actividad dentro de la ventana, sin los 45 días ni el corte
select pg_temp.expect((select count(*) from jsonb_array_elements(:'activity_a'::jsonb -> 'rows') r
    where r ->> 0 = any (array[:'a_s1', :'a_s2', :'a_s6', :'a_s8', :'a_s9', :'a_s11'])) = 9
  and (:'activity_a'::jsonb ->> 'done')::boolean
  and not exists (select 1 from jsonb_array_elements(:'activity_a'::jsonb -> 'rows') r where (r ->> 1)::int not between 1 and 30),
  'CA4. La actividad no trae 9 filas dentro de la ventana de 30 días');
select pg_temp.expect(
  (select r -> 2 = '3'::jsonb and r -> 3 = '2'::jsonb from jsonb_array_elements(:'activity_a'::jsonb -> 'rows') r where r ->> 0 = :'a_s1' and (r ->> 1)::int = 2)
  and (select r -> 2 = '3'::jsonb and r -> 3 = '0'::jsonb from jsonb_array_elements(:'activity_a'::jsonb -> 'rows') r where r ->> 0 = :'a_s1' and (r ->> 1)::int = 1)
  and (select r -> 2 = '0'::jsonb and r -> 3 = '9'::jsonb from jsonb_array_elements(:'activity_a'::jsonb -> 'rows') r where r ->> 0 = :'a_s8' and (r ->> 1)::int = 1),
  'CA4. Los repasos y las respuestas por día no cuadran');
-- Motivos de error. Solo los de preguntas del banco, con una causa de la lista cerrada
select pg_temp.expect((select count(*) from jsonb_array_elements(:'motives_a'::jsonb -> 'rows') r
    where r ->> 0 = any (array[:'a_s1', :'a_s2', :'a_s6', :'a_s8', :'a_s9', :'a_s11'])) = 2
  and (select r ->> 2 = 'pediatrics' and r ->> 3 = 'knowledge' and (r ->> 1)::int = 2 and (r ->> 4)::int = 0
       from jsonb_array_elements(:'motives_a'::jsonb -> 'rows') r where r ->> 0 = :'a_s1')
  and (select r ->> 2 = 'pediatrics' and r ->> 3 = 'fatigue' and (r ->> 1)::int = 1 and (r ->> 4)::int = 1
       from jsonb_array_elements(:'motives_a'::jsonb -> 'rows') r where r ->> 0 = :'a_s8'),
  'CA4. Los motivos de error no son knowledge de s1 y fatigue de s8 en el último tercio de una sesión larga');
select pg_temp.expect(jsonb_typeof(:'pairs_a'::jsonb -> 'pairs') = 'array', 'CA4. calibration_label_pairs no trae una lista');

-- Páginas sin huecos ni repetidos con p_after. Pedir de 3 en 3, de 1 en 1 y de 2 en 2 da lo mismo que pedir todo
select set_config('ca.run', :'run_a', false);
begin;
select pg_temp.as_service();
do $$
declare
  v_run uuid := current_setting('ca.run')::uuid;
  v_after bigint;
  v_cursor text;
  v_page jsonb;
  v_all jsonb;
  v_loops integer;
  v_kind text;
begin
  foreach v_kind in array array['answers', 'exposures', 'motives'] loop
    v_after := 0; v_all := '[]'::jsonb; v_loops := 0;
    loop
      execute format('select public.calibration_%s($1, $2, $3)', v_kind) using v_run, v_after, case v_kind when 'motives' then 1 else 3 end into v_page;
      v_all := v_all || (v_page -> 'rows');
      v_loops := v_loops + 1;
      exit when (v_page ->> 'done')::boolean;
      if (v_page ->> 'next')::bigint <= v_after or v_loops > 1000 then
        raise exception 'FALLA CA4. La paginación de % no avanza', v_kind;
      end if;
      v_after := (v_page ->> 'next')::bigint;
    end loop;
    execute format('select public.calibration_%s($1) -> ''rows''', v_kind) using v_run into v_page;
    if v_all <> v_page then
      raise exception 'FALLA CA4. Las páginas de % tienen huecos o repetidos', v_kind;
    end if;
    if v_loops < 2 then
      raise exception 'FALLA CA4. La prueba de % no usó más de una página', v_kind;
    end if;
  end loop;
  -- La actividad pagina con un cursor de texto, seudónimo y días
  v_cursor := null; v_all := '[]'::jsonb; v_loops := 0;
  loop
    v_page := public.calibration_activity(v_run, v_cursor, 2);
    v_all := v_all || (v_page -> 'rows');
    v_loops := v_loops + 1;
    exit when (v_page ->> 'done')::boolean;
    if v_loops > 1000 or (v_page ->> 'next') is not distinct from v_cursor then
      raise exception 'FALLA CA4. La paginación de la actividad no avanza';
    end if;
    v_cursor := v_page ->> 'next';
  end loop;
  if v_all <> public.calibration_activity(v_run) -> 'rows' or v_loops < 2 then
    raise exception 'FALLA CA4. Las páginas de la actividad tienen huecos o repetidos';
  end if;
  -- Un tope de 0 o negativo se toma como 1 y uno enorme se recorta
  if jsonb_array_length(public.calibration_answers(v_run, 0, 0) -> 'rows') > 1
     or jsonb_array_length(public.calibration_answers(v_run, -5, -3) -> 'rows') > 1 then
    raise exception 'FALLA CA4. Un tope de 0 o negativo no se tomó como 1';
  end if;
end $$;
select pg_temp.expect(pg_temp.fails_with(format('select public.calibration_activity(%L, %L, 5)', :'run_a', 'cualquier cosa')) = '22023'
  and pg_temp.fails_with(format('select public.calibration_activity(%L, %L, 5)', :'run_a', 'a1b2c3d4e5f60718:x')) = '22023',
  'CA4. Un cursor de actividad inválido no dio 22023');
rollback;

-- ----------------------------------------------------------------- CA5. Sin texto
select pg_temp.expect(position('Prueba' in :'bank_a') = 0 and position('explanation' in :'bank_a') = 0
  and position('rationale' in :'bank_a') = 0 and position('prompt' in :'bank_a') = 0 and position('vignette' in :'bank_a') = 0
  and position('"text"' in :'bank_a') = 0 and position('gpcRefs' in :'bank_a') = 0,
  'CA5. calibration_bank trajo texto del banco');
select pg_temp.expect(
  (select array_agg(k order by k collate "C") from jsonb_object_keys((:'bank_a'::jsonb -> 'items') -> 0) k)
    = array['branch', 'canonical', 'current', 'lang', 'options', 'physician', 'prev', 'q', 'subtopic', 'topic', 'v', 'vUlid', 'variantOf', 'words']
  and (select array_agg(k order by k collate "C") from jsonb_object_keys(((:'bank_a'::jsonb -> 'items') -> 0 -> 'options') -> 0) k)
    = array['correct', 'o', 'ovUlid', 'tag', 'w'],
  'CA5. calibration_bank trae llaves de más o de menos');
-- 4 palabras del caso y 4 de la pregunta. Cada opción son 3
select pg_temp.expect((
  select i ->> 'vUlid' = public.uuid_to_ulid(:'v1') and i ->> 'q' = :'q1' and i ->> 'branch' = 'pediatrics' and i ->> 'lang' = 'es'
     and (i ->> 'physician')::int = (select difficulty from public.questions where id = :'v1')
     and i -> 'variantOf' = 'null'::jsonb and (i ->> 'current')::boolean and (i ->> 'words')::int = 8
     and i -> 'prev' = 'null'::jsonb
     and i -> 'canonical' = (select jsonb_agg(coalesce(o.option_id, o.id) order by coalesce(o.option_id, o.id)) from public.question_options o
                             where o.question_version_id = :'v1' and o.id = any (select unnest(canonical_option_ids) from public.questions where id = :'v1'))
     and i -> 'options' = (select jsonb_agg(jsonb_build_object('o', coalesce(o.option_id, o.id), 'ovUlid', public.uuid_to_ulid(o.id),
         'correct', o.is_correct, 'tag', case when o.is_correct then null else o.bias_tag end, 'w', 3) order by o.position)
       from public.question_options o where o.question_version_id = :'v1')
  from jsonb_array_elements(:'bank_a'::jsonb -> 'items') i where i ->> 'v' = :'v1'),
  'CA5. Las palabras, las opciones o los ids estables de q1 no cuadran con el banco');

-- ----------------------------------------------------------------- CA6. Publicación
create or replace function pg_temp.cuts(p_count integer, p_start numeric default 0.4) returns jsonb language sql as $$
  select coalesce(jsonb_agg(p_start + g * 0.01 order by g), '[]'::jsonb) from generate_series(1, p_count) g
$$;
create or replace function pg_temp.cell(p_students integer, p_cuts jsonb, p_cohort text default 'all', p_key text default '*',
  p_metric text default 'sim_accuracy', p_branch text default '*') returns jsonb language sql as $$
  select jsonb_build_object('cohort', p_cohort, 'key', p_key, 'metric', p_metric, 'branch', p_branch, 'students', p_students, 'cuts', p_cuts)
$$;
create or replace function pg_temp.publish_comparison(p_run text, p_rows jsonb) returns text language sql as $$
  select pg_temp.fails_with(format('select public.calibration_publish_comparison(%L, %L)', p_run, p_rows))
$$;
begin;
select pg_temp.as_service();
select pg_temp.expect(
  pg_temp.publish_comparison(:'run_a', jsonb_build_array(pg_temp.cell(29, pg_temp.cuts(19)))) = '22023'
  and pg_temp.publish_comparison(:'run_a', jsonb_build_array(pg_temp.cell(40, pg_temp.cuts(18)))) = '22023'
  and pg_temp.publish_comparison(:'run_a', jsonb_build_array(pg_temp.cell(40, pg_temp.cuts(20)))) = '22023'
  and pg_temp.publish_comparison(:'run_a', jsonb_build_array(pg_temp.cell(40, jsonb_set(pg_temp.cuts(19), '{9}', '0.1')))) = '22023'
  and pg_temp.publish_comparison(:'run_a', jsonb_build_array(pg_temp.cell(40, jsonb_set(pg_temp.cuts(19), '{3}', '"x"')))) = '22023'
  and pg_temp.publish_comparison(:'run_a', jsonb_build_array(pg_temp.cell(40, jsonb_set(pg_temp.cuts(19), '{3}', 'null')))) = '22023'
  and pg_temp.publish_comparison(:'run_a', jsonb_build_array(pg_temp.cell(40, '"abc"'))) = '22023'
  and pg_temp.publish_comparison(:'run_a', jsonb_build_array(pg_temp.cell(40, pg_temp.cuts(19), 'everyone'))) = '22023'
  and pg_temp.publish_comparison(:'run_a', jsonb_build_array(pg_temp.cell(40, pg_temp.cuts(19), 'specialty', '*'))) = '22023'
  and pg_temp.publish_comparison(:'run_a', jsonb_build_array(pg_temp.cell(40, pg_temp.cuts(19), 'all', '*', 'prediccion'))) = '22023'
  and pg_temp.publish_comparison(:'run_a', jsonb_build_array(jsonb_build_object('cohort', 'all', 'key', '*', 'metric', 'reviews', 'branch', '*', 'students', '40', 'cuts', pg_temp.cuts(19)))) = '22023'
  and pg_temp.publish_comparison(:'run_a', '[1]') = '22023'
  and pg_temp.publish_comparison(:'run_a', '{}') = '22023'
  and pg_temp.publish_comparison(:'run_a', (select jsonb_agg(pg_temp.cell(5, null)) from generate_series(1, 2001))) = '22023',
  'CA6. calibration_publish_comparison aceptó cortes con menos de 30 alumnos, con 18 o 20 cortes, que bajan, que no son números, o filas que no son');
-- Una celda con menos alumnos se guarda sin cortes. Volver a mandarla no la duplica
select pg_temp.expect(public.calibration_publish_comparison(:'run_a', jsonb_build_array(pg_temp.cell(5, null), pg_temp.cell(40, pg_temp.cuts(19), 'all', '*', 'reviews'))) = 2
  and public.calibration_publish_comparison(:'run_a', jsonb_build_array(pg_temp.cell(5, null))) = 0,
  'CA6. La celda chica sin cortes o la repetida no se guardó como debía');
commit;
select pg_temp.expect((select count(*) = 2 and bool_and((students >= 30) = (cuts is not null)) from public.comparison_cells where run_id = :'run_a'),
  'CA6. La base guardó cortes en una celda de menos de 30');
-- minGroupSize en 10 se lee como 30. Subirlo a 45 sí cuenta
begin;
update public.platform_settings set value = jsonb_set(value, '{thresholds,minGroupSize}', '10') where key = 'model_settings';
select pg_temp.as_service();
select pg_temp.expect(pg_temp.publish_comparison(:'run_a', jsonb_build_array(pg_temp.cell(29, pg_temp.cuts(19), 'all', '*', 'consistency'))) = '22023',
  'CA6. Con minGroupSize en 10 aceptó una celda de 29 alumnos');
rollback;
begin;
update public.platform_settings set value = jsonb_set(value, '{thresholds,minGroupSize}', '45') where key = 'model_settings';
select pg_temp.as_service();
select pg_temp.expect(pg_temp.publish_comparison(:'run_a', jsonb_build_array(pg_temp.cell(40, pg_temp.cuts(19), 'all', '*', 'consistency'))) = '22023',
  'CA6. Con minGroupSize en 45 aceptó una celda de 40 alumnos con cortes');
rollback;
-- Población, solo números, códigos y llaves de la taxonomía
begin;
select pg_temp.as_service();
select pg_temp.expect(
  pg_temp.fails_with(format('select public.calibration_publish_population(%L, %L)', :'run_a', '{"alumno":"Ana López"}')) = '22023'
  and pg_temp.fails_with(format('select public.calibration_publish_population(%L, %L)', :'run_a', '{"clave con espacios":1}')) = '22023'
  and pg_temp.fails_with(format('select public.calibration_publish_population(%L, %L)', :'run_a', '{"topics":{"x":{"nota":"Un texto largo con espacios"}}}')) = '22023'
  and pg_temp.fails_with(format('select public.calibration_publish_population(%L, %L)', :'run_a', '[1,2]')) = '22023'
  and pg_temp.fails_with(format('select public.calibration_publish_population(%L, %L)', :'run_a', '"texto"')) = '22023',
  'CA6. calibration_publish_population aceptó texto, llaves con espacios o algo que no es un objeto');
select public.calibration_publish_population(:'run_a',
  '{"bias":{"anchoring":{"students":140,"rate":0.18}},"topics":{"pediatrics/neonatology":{"students":96,"accuracy":0.58,"difficulty":null}},"fatigue":{"state":"calibrating","students":25,"longSessions":120},"items":{"physician_estimate":2,"provisional":0,"calibrated":0}}');
select public.calibration_publish_population(:'run_a', '{"items":{"calibrated":99}}');
commit;
select pg_temp.expect((select count(*) = 1 and bool_and((data #>> '{bias,anchoring,students}')::int = 140)
                       from public.population_snapshots where run_id = :'run_a'),
  'CA6. La población no se guardó una sola vez');
-- Dificultad y opciones, con filas inválidas
begin;
select pg_temp.as_service();
select pg_temp.expect(
  pg_temp.fails_with(format('select public.calibration_publish_items(%L, %L)', :'run_a', '{}')) = '22023'
  and pg_temp.fails_with(format('select public.calibration_publish_items(%L, %L)', :'run_a', '[{"v":"no-es-uuid","students":3,"state":"provisional"}]')) = '22023'
  and pg_temp.fails_with(format('select public.calibration_publish_items(%L, %L)', :'run_a', jsonb_build_array(jsonb_build_object('v', :'v1', 'students', 3, 'state', 'casi_lista')))) = '22023'
  and pg_temp.fails_with(format('select public.calibration_publish_items(%L, %L)', :'run_a', jsonb_build_array(jsonb_build_object('v', :'v1', 'state', 'provisional')))) = '22023'
  and pg_temp.fails_with(format('select public.calibration_publish_items(%L, %L)', :'run_a', (select jsonb_agg('{}'::jsonb) from generate_series(1, 5001)))) = '22023'
  and pg_temp.fails_with(format('select public.calibration_publish_options(%L, %L)', :'run_a', '[{"v":"x","o":"y","exposures":1,"choices":0}]')) = '22023'
  and pg_temp.fails_with(format('select public.calibration_publish_options(%L, %L)', :'run_a', jsonb_build_array(jsonb_build_object('v', :'v1', 'o', gen_random_uuid(), 'exposures', 10, 'choices', 11)))) = '22023'
  and pg_temp.fails_with(format('select public.calibration_publish_options(%L, %L)', :'run_a', '"x"')) = '22023',
  'CA6. calibration_publish_items o calibration_publish_options aceptó una fila inválida');
rollback;

-- ===================================================================== CA7. dry_run
-- La corrida A publica sus resultados y cierra en ok sin tocar el catálogo, las marcas ni la publicación
-- Las filas de opciones se arman antes de pasar a la llave de servicio, que no lee las tablas
select (select jsonb_agg(jsonb_build_object('v', :'v1', 'o', coalesce(o.option_id, o.id), 'exposures', 140,
    'choices', case o.position when 0 then 80 when 1 then 3 when 2 then 50 else 7 end))
  from public.question_options o where o.question_version_id = :'v1') as opts_a \gset
begin;
select pg_temp.as_service();
select public.calibration_publish_items(:'run_a', jsonb_build_array(
  jsonb_build_object('v', :'v1', 'students', 50, 'difficulty', 0.5, 'se', 0.4, 'elo', 0.45, 'eloResponses', 60,
    'state', 'provisional', 'extreme', false, 'variantReady', null),
  jsonb_build_object('v', :'v2', 'students', 120, 'difficulty', -0.3, 'se', 0.25, 'elo', -0.2, 'eloResponses', 130,
    'state', 'calibrated', 'extreme', false, 'variantReady', null))) as n_items \gset
select public.calibration_publish_options(:'run_a', :'opts_a'::jsonb) as n_options \gset
commit;
select pg_temp.expect(:'n_items' = '2' and :'n_options' = '4', 'CA7. La corrida A no guardó sus 2 versiones y sus 4 opciones');
select (select count(*) from public.distractor_flags) as flags_before, (select count(*) from public.model_publication) as pub_before,
  (select coalesce(max(seq), 0) from public.question_catalog) as seq_before,
  (select count(*) from public.question_catalog where calibration is not null) as cal_before,
  (select count(*) from public.email_outbox where kind = 'distractor_flags') as mail_before \gset
begin;
select pg_temp.as_service();
select public.calibration_finish(:'run_a', 'ok', null, '{"pages":9,"answers":16,"parity":true,"mode":"dry_run"}') as fin_a \gset
commit;
select pg_temp.expect(:'fin_a'::jsonb ->> 'status' = 'ok' and (:'fin_a'::jsonb ->> 'applied')::boolean = false
  and :'fin_a'::jsonb -> 'counts' = '{}'::jsonb, 'CA7. dry_run no cerró en ok sin aplicar');
select pg_temp.expect((select status = 'ok' and reason is null and mode = 'dry_run' and salt is null and finished_at is not null
         and applied_at is null and (counts ->> 'consenters')::int >= 6 and counts ->> 'pages' = '9' and counts ->> 'mode' = 'dry_run'
         and runner = '{"runId":"1001","sha":"abcdef0"}'::jsonb
       from public.calibration_runs where id = :'run_a'),
  'CA7. La corrida A no quedó ok, sin sal, con sus conteos y sin aplicar');
select pg_temp.expect(
  (select count(*) from public.distractor_flags) = :flags_before and (select count(*) from public.model_publication) = :pub_before
  and (select coalesce(max(seq), 0) from public.question_catalog) = :seq_before
  and (select count(*) from public.question_catalog where calibration is not null) = :cal_before
  and (select count(*) from public.email_outbox where kind = 'distractor_flags') = :mail_before,
  'CA7. dry_run cambió el catálogo, las marcas, los correos o la publicación');
select pg_temp.expect((select count(*) from public.item_calibrations where run_id = :'run_a') = 2
  and (select count(*) from public.option_calibrations where run_id = :'run_a') = 4,
  'CA7. dry_run no dejó guardados sus resultados para el reporte');
-- Cerrada la corrida, ya no se pueden dar seudónimos ni exportar
select pg_temp.expect(public.calibration_pseudonym(:'run_a', :'s1') is null, 'CA3. Cerrada la corrida todavía da seudónimos');
begin;
select pg_temp.as_service();
select pg_temp.expect(pg_temp.fails_with(format('select public.calibration_people(%L)', :'run_a')) = '22023'
  and pg_temp.fails_with(format('select public.calibration_answers(%L)', :'run_a')) = '22023',
  'CA3. Una corrida cerrada siguió exportando');
rollback;

-- ===================================================================== Corrida B. apply
-- Ayudas para armar las noches siguientes
create or replace function pg_temp.item(
  p_version uuid, p_students integer, p_difficulty numeric, p_se numeric, p_state text,
  p_extreme boolean default false, p_variant_ready boolean default null
) returns jsonb language sql as $$
  select jsonb_build_object('v', p_version, 'students', p_students, 'difficulty', p_difficulty, 'se', p_se,
    'elo', p_difficulty, 'eloResponses', p_students, 'state', p_state, 'extreme', p_extreme, 'variantReady', p_variant_ready)
$$;
create or replace function pg_temp.options_of(p_version uuid, p_exposures integer, p_choices integer[])
returns jsonb language sql as $$
  select coalesce(jsonb_agg(jsonb_build_object('v', p_version, 'o', coalesce(o.option_id, o.id), 'exposures', p_exposures,
    'choices', p_choices[o.position + 1]) order by o.position), '[]'::jsonb)
  from public.question_options o where o.question_version_id = p_version
$$;
-- Una noche completa con la llave de servicio: empieza, publica dificultad y opciones y cierra
create or replace function pg_temp.night(
  p_items jsonb, p_options jsonb default '[]', p_status text default 'ok', p_force boolean default false
) returns jsonb language plpgsql as $$
declare
  v_begin jsonb;
  v_run uuid;
  v_result jsonb;
begin
  perform pg_temp.as_service();
  v_begin := public.calibration_begin('schedule', p_force, '{}');
  if v_begin ->> 'status' <> 'running' then
    reset role;
    return v_begin;
  end if;
  v_run := (v_begin ->> 'runId')::uuid;
  if jsonb_array_length(p_items) > 0 then perform public.calibration_publish_items(v_run, p_items); end if;
  if jsonb_array_length(p_options) > 0 then perform public.calibration_publish_options(v_run, p_options); end if;
  v_result := public.calibration_finish(v_run, p_status, null, '{"pages":1}');
  reset role;
  return v_result || jsonb_build_object('runId', v_run);
end $$;

begin;
select pg_temp.as_service();
select public.calibration_begin('schedule', false, '{"runId":"1002","sha":"abcdef1"}') as run_b_json \gset
commit;
select :'run_b_json'::jsonb ->> 'runId' as run_b \gset
select pg_temp.expect(:'run_b_json'::jsonb ->> 'mode' = 'apply' and :'run_b_json'::jsonb ->> 'status' = 'running', 'CA8. La corrida B no quedó en apply');
-- Otra corrida, otro seudónimo para el mismo alumno
select public.calibration_pseudonym(:'run_b', :'s1') as b_s1 \gset
begin;
select pg_temp.as_service();
select public.calibration_people(:'run_b') as people_b \gset
select public.calibration_answers(:'run_b') as answers_b \gset
commit;
select pg_temp.expect(:'b_s1' <> :'a_s1' and :'b_s1' ~ '^[0-9a-f]{16}$'
  and position(:'b_s1' in :'people_b') > 0 and position(:'a_s1' in :'people_b') = 0
  and position(:'b_s1' in :'answers_b') > 0 and position(:'a_s1' in :'answers_b') = 0,
  'CA3. El mismo alumno tiene el mismo seudónimo en la siguiente corrida');
-- La corrida A y la B publican los mismos datos de entrada pero la B lo aplica
select max(seq) as seq0 from public.question_catalog \gset
select seq as seq_q1_0 from public.question_catalog where question_id = :'q1' \gset
select seq as seq_q2_0 from public.question_catalog where question_id = :'q2' \gset
select pg_temp.expect((select calibration is null from public.question_catalog where question_id = :'q1'),
  'CA8. q1 ya traía calibración antes de la primera noche en apply');
-- q1 tiene a la médica m1 de revisora y q2 no tiene a nadie asignado
select pg_temp.options_of(:'v1', 140, array[80, 3, 50, 7]) || pg_temp.options_of(:'v2', 99, array[60, 0, 20, 19]) as opts_b \gset
begin;
select pg_temp.as_service();
select public.calibration_publish_items(:'run_b', jsonb_build_array(
  pg_temp.item(:'v1', 50, 0.50, 0.40, 'provisional'), pg_temp.item(:'v2', 120, -0.30, 0.25, 'calibrated'))) as n_items_b \gset
select public.calibration_publish_options(:'run_b', :'opts_b'::jsonb) as n_options_b \gset
select public.calibration_finish(:'run_b', 'ok', null, '{"pages":9}') as fin_b \gset
commit;
select pg_temp.expect(:'fin_b'::jsonb ->> 'status' = 'ok' and (:'fin_b'::jsonb ->> 'applied')::boolean,
  'CA8. La corrida B no cerró aplicada');
select pg_temp.expect((:'fin_b'::jsonb #>> '{counts,catalogUpdated}')::int = 2 and (:'fin_b'::jsonb #>> '{counts,examEligible}')::int = 0
  and (:'fin_b'::jsonb #>> '{counts,flagsTouched}')::int = 1 and (:'fin_b'::jsonb #>> '{counts,flagsNew}')::int = 1
  and (:'fin_b'::jsonb #>> '{counts,emailsQueued}')::int = 1, 'CA8. Los conteos de lo aplicado no son los esperados');
select pg_temp.expect((select status = 'ok' and applied_at is not null and salt is null and finished_at is not null
         and (counts ->> 'catalogUpdated')::int = 2 and counts ->> 'pages' = '9'
       from public.calibration_runs where id = :'run_b'), 'CA8. La corrida B no guardó lo aplicado en sus conteos');

-- ===================================================================== CA8. Calibración en el catálogo
select pg_temp.expect((
  select calibration ->> 'versionId' = :'v1' and calibration ->> 'state' = 'provisional'
     and (calibration ->> 'difficulty')::numeric = 0.5 and (calibration ->> 'se')::numeric = 0.4
     and (calibration ->> 'students')::int = 50 and (calibration ->> 'elo')::numeric = 0.5
     and (calibration ->> 'extreme')::boolean = false
     and calibration ->> 'studyDay' = to_char(public.study_day(), 'YYYY-MM-DD') and seq > :seq_q1_0
  from public.question_catalog where question_id = :'q1')
  and (select calibration ->> 'versionId' = :'v2' and calibration ->> 'state' = 'calibrated' and seq > :seq_q2_0
       from public.question_catalog where question_id = :'q2'),
  'CA8. La calibración de q1 y q2 no llegó al catálogo con su versionId, su estado y un seq nuevo');
select pg_temp.expect((select run_id = :'run_b' from public.model_publication where id), 'CA8. model_publication no apunta a la corrida B');
-- Una segunda corrida igual no sube el seq ni cambia nada
select seq as seq_q1_1 from public.question_catalog where question_id = :'q1' \gset
select seq as seq_q2_1 from public.question_catalog where question_id = :'q2' \gset
select max(seq) as seq_max_1 from public.question_catalog \gset
select pg_temp.night(
  jsonb_build_array(pg_temp.item(:'v1', 50, 0.50, 0.40, 'provisional'), pg_temp.item(:'v2', 120, -0.30, 0.25, 'calibrated')),
  pg_temp.options_of(:'v1', 140, array[80, 3, 50, 7])) ->> 'runId' as run_c \gset
select pg_temp.expect((select seq = :seq_q1_1 from public.question_catalog where question_id = :'q1')
  and (select seq = :seq_q2_1 from public.question_catalog where question_id = :'q2')
  and (select max(seq) from public.question_catalog) = :seq_max_1
  and (select (counts ->> 'catalogUpdated')::int = 0 from public.calibration_runs where id = :'run_c')
  and (select run_id = :'run_c' from public.model_publication where id),
  'CA8. Una segunda corrida igual subió el seq o no apuntó la publicación a la nueva corrida');
-- Cambios chicos tampoco la suben: 0.09 de dificultad, 0.04 de error estándar y más alumnos
select pg_temp.night(jsonb_build_array(pg_temp.item(:'v1', 55, 0.59, 0.36, 'provisional'), pg_temp.item(:'v2', 130, -0.30, 0.25, 'calibrated'))) ->> 'runId' as run_d \gset
select pg_temp.expect((select seq = :seq_q1_1 and (calibration ->> 'difficulty')::numeric = 0.5 from public.question_catalog where question_id = :'q1')
  and (select max(seq) from public.question_catalog) = :seq_max_1, 'CA8. Un cambio de 0.09 subió el seq');
-- Con 0.10 de dificultad respecto de lo guardado, sí. Solo cambia q1
select pg_temp.night(jsonb_build_array(pg_temp.item(:'v1', 60, 0.60, 0.38, 'provisional'), pg_temp.item(:'v2', 130, -0.30, 0.25, 'calibrated'))) ->> 'runId' as run_e \gset
select pg_temp.expect((select seq > :seq_q1_1 and (calibration ->> 'difficulty')::numeric = 0.6 and (calibration ->> 'students')::int = 60
                       from public.question_catalog where question_id = :'q1')
  and (select seq = :seq_q2_1 from public.question_catalog where question_id = :'q2'), 'CA8. Un cambio de 0.10 no subió el seq de q1, o subió el de q2');
select seq as seq_q1_2 from public.question_catalog where question_id = :'q1' \gset
-- Un error estándar que se mueve 0.05, el estado y la marca de extrema
select pg_temp.night(jsonb_build_array(pg_temp.item(:'v1', 60, 0.60, 0.33, 'provisional'))) ->> 'runId' as run_f \gset
select pg_temp.expect((select seq > :seq_q1_2 and (calibration ->> 'se')::numeric = 0.33 from public.question_catalog where question_id = :'q1'), 'CA8. Un cambio de 0.05 de error estándar no subió el seq');
select seq as seq_q1_3 from public.question_catalog where question_id = :'q1' \gset
select pg_temp.night(jsonb_build_array(pg_temp.item(:'v1', 105, 0.60, 0.29, 'calibrated'))) ->> 'runId' as run_g \gset
select pg_temp.expect((select seq > :seq_q1_3 and calibration ->> 'state' = 'calibrated' from public.question_catalog where question_id = :'q1'), 'CA8. Un cambio de estado no subió el seq');
select seq as seq_q1_4 from public.question_catalog where question_id = :'q1' \gset
select pg_temp.night(jsonb_build_array(pg_temp.item(:'v1', 105, 0.60, 0.29, 'calibrated', true))) ->> 'runId' as run_h \gset
select pg_temp.expect((select seq > :seq_q1_4 and (calibration ->> 'extreme')::boolean from public.question_catalog where question_id = :'q1'), 'CA8. La marca de extrema no subió el seq');
-- failed y dry_run no aplican nada aunque traigan cambios grandes
select seq as seq_q1_5 from public.question_catalog where question_id = :'q1' \gset
select pg_temp.night(jsonb_build_array(pg_temp.item(:'v1', 400, 1.9, 0.1, 'calibrated')), '[]', 'failed') ->> 'runId' as run_i \gset
select pg_temp.night(jsonb_build_array(pg_temp.item(:'v1', 400, 1.9, 0.1, 'calibrated')), '[]', 'ok', true) ->> 'runId' as run_j \gset
select pg_temp.expect((select seq = :seq_q1_5 and (calibration ->> 'difficulty')::numeric = 0.6 from public.question_catalog where question_id = :'q1')
  and (select run_id <> :'run_i' and run_id <> :'run_j' from public.model_publication where id)
  and (select applied_at is null and status = 'failed' from public.calibration_runs where id = :'run_i')
  and (select applied_at is null and status = 'ok' and mode = 'dry_run' from public.calibration_runs where id = :'run_j'),
  'CA8. Una corrida failed o forzada a dry_run aplicó cambios');
-- partial sí aplica, porque lo que llegó es bueno
select pg_temp.night(jsonb_build_array(pg_temp.item(:'v1', 105, 0.80, 0.29, 'calibrated', true)), '[]', 'partial') ->> 'runId' as run_k \gset
select pg_temp.expect((select (calibration ->> 'difficulty')::numeric = 0.8 from public.question_catalog where question_id = :'q1')
  and (select status = 'partial' and applied_at is not null from public.calibration_runs where id = :'run_k'), 'CA8. Una corrida partial no aplicó');

-- ===================================================================== CA9. Distractores
-- La marca de la corrida B, la del distractor que casi nadie elige (3 de 140), y ninguna más
select pg_temp.expect((select count(*) = 1 and bool_and(exposures = 140 and choices = 3 and attraction = 0.0214 and source = 'calibration')
         from public.distractor_flags where question_version_id = :'v1' and status in ('open', 'kept')),
  'CA9. Con 140 exposiciones y 3 elecciones no nació una sola marca');
select pg_temp.expect(not exists (select 1 from public.distractor_flags where question_version_id = :'v2'),
  'CA9. Con 99 exposiciones nació una marca');
select id as flag_ca, option_id as flag_option from public.distractor_flags where question_version_id = :'v1' \gset
select pg_temp.expect(:'flag_option' = (select coalesce(option_id, id)::text from public.question_options where question_version_id = :'v1' and position = 1),
  'CA9. La marca no es del distractor que casi nadie elige');
-- Un solo correo al médico asignado, sin texto ni alumnos
select pg_temp.expect((select count(*) = 1 and bool_and(recipient_user = :'m1' and recipient_role is null and status = 'queued'
         and dedupe_key = 'distractor_flags:' || :'m1' || ':' || to_char(public.study_day(), 'YYYY-MM-DD')
         and data = '{"flags":1,"questionKeys":["CA-0001"]}'::jsonb)
       from public.email_outbox where kind = 'distractor_flags' and recipient_user = :'m1'),
  'CA9. No quedó un solo correo distractor_flags para la médica, con las claves de las preguntas y sin texto');
-- Otra noche con las mismas cifras no repite la marca ni el correo
select pg_temp.expect((select count(*) from public.distractor_flags where question_version_id = :'v1') = 1
  and (select count(*) from public.email_outbox where kind = 'distractor_flags' and recipient_user = :'m1') = 1,
  'CA9. Repetir las cifras duplicó la marca o el correo');
-- Una marca kept no se reabre. Otra noche trae cifras nuevas y una marca más, y el correo del día no se repite
update public.distractor_flags set status = 'kept', resolved_at = now(), resolved_by = :'m1' where id = :'flag_ca';
select pg_temp.night('[]', pg_temp.options_of(:'v1', 300, array[150, 5, 4, 100])) ->> 'runId' as run_n \gset
select pg_temp.expect((select status = 'kept' and exposures = 300 and choices = 5 from public.distractor_flags where id = :'flag_ca'),
  'CA9. Una marca kept se reabrió o no actualizó sus cifras');
select pg_temp.expect((select count(*) from public.distractor_flags where question_version_id = :'v1') = 2
  and (select count(*) from public.email_outbox where kind = 'distractor_flags' and recipient_user = :'m1') = 1
  and (select (counts ->> 'flagsNew')::int = 1 and (counts ->> 'emailsQueued')::int = 0 from public.calibration_runs where id = :'run_n'),
  'CA9. La marca nueva del mismo día mandó otro correo');
-- Sin médico asignado no hay correo (q2), pero la marca sí nace
select pg_temp.night('[]', pg_temp.options_of(:'v2', 250, array[200, 1, 30, 19])) ->> 'runId' as run_o \gset
select pg_temp.expect((select count(*) = 1 from public.distractor_flags where question_version_id = :'v2')
  and (select count(*) from public.email_outbox where kind = 'distractor_flags' and recipient_user = :'m1') = 1
  and (select (counts ->> 'flagsNew')::int = 1 and (counts ->> 'emailsQueued')::int = 0 from public.calibration_runs where id = :'run_o'),
  'CA9. Sin médico asignado no nació la marca o salió un correo');

-- Una versión publicada después deja la calibración vieja con otro versionId
select pg_temp.bank_seed('CA-0001') as q1_again \gset
select pg_temp.latest(:'q1') as v1b \gset
select pg_temp.expect(:'q1_again' = :'q1' and :'v1b' <> :'v1' and (select version_id = :'v1b' from public.question_catalog where question_id = :'q1')
  and (select calibration ->> 'versionId' = :'v1' from public.question_catalog where question_id = :'q1'),
  'CA8. La versión nueva de q1 no se publicó o la calibración vieja no conservó su versionId');
select seq as seq_q1_6 from public.question_catalog where question_id = :'q1' \gset
-- Una noche con la dificultad de la versión vieja no toca el catálogo, la de la versión nueva sí
select pg_temp.night(jsonb_build_array(pg_temp.item(:'v1', 105, 1.20, 0.29, 'calibrated'))) ->> 'runId' as run_l \gset
select pg_temp.expect((select seq = :seq_q1_6 and calibration ->> 'versionId' = :'v1' from public.question_catalog where question_id = :'q1'),
  'CA8. La dificultad de la versión vieja pisó la calibración de la versión publicada');
select pg_temp.night(jsonb_build_array(pg_temp.item(:'v1b', 20, 0.00, 0.60, 'physician_estimate'))) ->> 'runId' as run_m \gset
select pg_temp.expect((select seq > :seq_q1_6 and calibration ->> 'versionId' = :'v1b' and calibration ->> 'state' = 'physician_estimate'
                       from public.question_catalog where question_id = :'q1'),
  'CA8. La dificultad de la versión nueva no entró al catálogo con su versionId');

-- ===================================================================== CA10. Variantes
-- Una variante reestructurada nace fuera del examen. Pasa a true cuando la noche dice que está lista y nunca regresa sola
select pg_temp.bank_seed('CA-0005') as q5 \gset
select pg_temp.latest(:'q5') as v5 \gset
update public.questions set variant_of = :'q1' where id = :'v5';
select public.bank_publish(:'q5') as republished \gset
select pg_temp.expect(:'republished' = 'published' and (select variant_of = :'q1' and not exam_eligible from public.question_catalog where question_id = :'q5'),
  'CA10. La variante no nació fuera del examen');
select seq as seq_q5_0 from public.question_catalog where question_id = :'q5' \gset
-- Todavía no está lista
select pg_temp.night(jsonb_build_array(pg_temp.item(:'v5', 40, 0.10, 0.50, 'provisional', false, false))) ->> 'runId' as run_p \gset
select pg_temp.expect((select not exam_eligible from public.question_catalog where question_id = :'q5')
  and (select (counts ->> 'examEligible')::int = 0 from public.calibration_runs where id = :'run_p'), 'CA10. Una variante no lista entró al examen');
-- Lista. Pasa a true y el catálogo sube su seq aunque la dificultad no se haya movido
select pg_temp.night(jsonb_build_array(pg_temp.item(:'v5', 40, 0.10, 0.50, 'provisional', false, true))) ->> 'runId' as run_q \gset
select pg_temp.expect((select exam_eligible and seq > :seq_q5_0 from public.question_catalog where question_id = :'q5')
  and (select (counts ->> 'examEligible')::int = 1 from public.calibration_runs where id = :'run_q'),
  'CA10. Una variante lista no pasó a exam_eligible con un seq nuevo');
select seq as seq_q5_1 from public.question_catalog where question_id = :'q5' \gset
-- Una noche con la variante otra vez no lista no la saca del examen
select pg_temp.night(jsonb_build_array(pg_temp.item(:'v5', 40, 0.10, 0.50, 'provisional', false, false))) ->> 'runId' as run_r \gset
select pg_temp.expect((select exam_eligible and seq = :seq_q5_1 from public.question_catalog where question_id = :'q5'),
  'CA10. exam_eligible regresó solo a false o el seq subió sin cambio');
-- Una pregunta que no es variante no cambia con variantReady
select exam_eligible as q2_eligible_0, seq as q2_seq_0 from public.question_catalog where question_id = :'q2' \gset
select pg_temp.night(jsonb_build_array(pg_temp.item(:'v2', 120, -0.30, 0.25, 'calibrated', false, true))) ->> 'runId' as run_s \gset
select pg_temp.expect((select exam_eligible = :'q2_eligible_0' and seq = :q2_seq_0 from public.question_catalog where question_id = :'q2')
  and (select (counts ->> 'examEligible')::int = 0 from public.calibration_runs where id = :'run_s'),
  'CA10. variantReady cambió una pregunta que no es variante');

-- ===================================================================== CA12. Acuerdo del etiquetado
-- Los mismos 30 pares que BE13 y tests/content/kappaParity.test.ts. Se quitan las etiquetas de las pruebas
-- anteriores solo dentro de la transacción
begin;
delete from public.bias_labels;
insert into public.bias_labels (option_id, labeler_id, question_version_id, tag, author_tag, locked_at)
  select gen_random_uuid(), :'m1', :'v1', p.tag, p.author_tag, now()
  from (values ('anchoring', 'anchoring', 10), ('premature_closure', 'premature_closure', 9), ('framing_effect', 'framing_effect', 8),
               ('anchoring', 'premature_closure', 1), ('premature_closure', 'framing_effect', 1), ('framing_effect', 'anchoring', 1))
    as p (author_tag, tag, n), generate_series(1, p.n);
-- Una etiqueta sin cerrar no cuenta
insert into public.bias_labels (option_id, labeler_id, question_version_id, tag, author_tag)
  values (gen_random_uuid(), :'m1', :'v1', 'anchoring', 'anchoring');
select round(kappa, 6) as k6, pairs as np, round(observed, 4) as obs, round(expected, 4) as exp from public.calibration_label_kappa() \gset
select pg_temp.expect(:'np' = '30' and :'k6' = '0.849498', 'CA12. La fórmula de la base no da los 30 pares y el kappa 0.849498 de BE13');
select pg_temp.as_service();
select public.calibration_begin('manual', false, '{}') ->> 'runId' as run_x \gset
select public.calibration_label_pairs(:'run_x') as pairs_x \gset
select pg_temp.expect(jsonb_array_length(:'pairs_x'::jsonb -> 'pairs') = 30
  and (select bool_and(jsonb_array_length(p) = 3 and jsonb_typeof(p -> 0) = 'string' and p ->> 1 in ('anchoring', 'premature_closure', 'framing_effect'))
       from jsonb_array_elements(:'pairs_x'::jsonb -> 'pairs') p), 'CA12. calibration_label_pairs no trae los 30 pares como id de opción y las dos etiquetas');
-- Con la misma fórmula hay paridad y la corrida queda ok
select public.calibration_publish_agreement(:'run_x',
  format('{"pairs":30,"kappa":%s,"observed":%s,"expected":%s,"byTag":{"anchoring":0.9,"framing_effect":0.8,"premature_closure":0.9}}', :'k6', :'obs', :'exp')::jsonb) as agree_ok \gset
select public.calibration_finish(:'run_x', 'ok', null, '{"pages":3}') as fin_x \gset
select pg_temp.expect((:'agree_ok'::jsonb ->> 'parity')::boolean and :'fin_x'::jsonb ->> 'status' = 'ok', 'CA12. Con los pares de BE13 no hubo paridad');
reset role;
select pg_temp.expect((select parity and pairs = 30 and kappa = 0.8495 and sql_kappa = 0.8495
         and by_tag = '{"anchoring":0.9,"framing_effect":0.8,"premature_closure":0.9}'::jsonb
       from public.agreement_snapshots where run_id = :'run_x'), 'CA12. El acuerdo no quedó guardado con su paridad');
-- Con un kappa distinto la paridad es falsa y la corrida queda partial
select pg_temp.as_service();
select public.calibration_begin('manual', false, '{}') ->> 'runId' as run_y \gset
select public.calibration_publish_agreement(:'run_y', '{"pairs":30,"kappa":0.5,"observed":0.9,"expected":0.3,"byTag":{}}') as agree_bad \gset
select public.calibration_finish(:'run_y', 'ok', null, '{}') as fin_y \gset
reset role;
select pg_temp.expect(not (:'agree_bad'::jsonb ->> 'parity')::boolean and :'fin_y'::jsonb ->> 'status' = 'partial'
  and (select status = 'partial' and reason = 'kappa_mismatch' from public.calibration_runs where id = :'run_y')
  and (select not parity from public.agreement_snapshots where run_id = :'run_y'), 'CA12. Un kappa distinto no dejó la corrida en partial con kappa_mismatch');
-- Con otro número de pares tampoco hay paridad, aunque el kappa se parezca
select pg_temp.as_service();
select public.calibration_begin('manual', false, '{}') ->> 'runId' as run_z \gset
select (public.calibration_publish_agreement(:'run_z', format('{"pairs":29,"kappa":%s}', :'k6')::jsonb) ->> 'parity')::boolean as parity_z \gset
select public.calibration_finish(:'run_z', 'failed', 'selftest_stop', '{}');
reset role;
select pg_temp.expect(:'parity_z' = 'f', 'CA12. Con 29 pares de 30 hubo paridad');
-- Sin pares en la base, la noche manda pairs 0 y kappa null, y eso es paridad
delete from public.bias_labels;
select pg_temp.as_service();
select public.calibration_begin('manual', false, '{}') ->> 'runId' as run_w \gset
select (public.calibration_publish_agreement(:'run_w', '{"pairs":0,"kappa":null,"observed":null,"expected":null,"byTag":{}}') ->> 'parity')::boolean as parity_w \gset
-- Un acuerdo mal formado se rechaza
select pg_temp.expect(
  pg_temp.fails_with(format('select public.calibration_publish_agreement(%L, %L)', :'run_w', '[]')) = '22023'
  and pg_temp.fails_with(format('select public.calibration_publish_agreement(%L, %L)', :'run_w', '{"kappa":0.5}')) = '22023'
  and pg_temp.fails_with(format('select public.calibration_publish_agreement(%L, %L)', :'run_w', '{"pairs":-1}')) = '22023'
  and pg_temp.fails_with(format('select public.calibration_publish_agreement(%L, %L)', :'run_w', '{"pairs":"muchos"}')) = '22023'
  and pg_temp.fails_with(format('select public.calibration_publish_agreement(%L, %L)', :'run_w', '{"pairs":3,"byTag":"Ana"}')) = '22023'
  and pg_temp.fails_with(format('select public.calibration_publish_agreement(%L, %L)', :'run_w', '{"pairs":3,"byTag":{"anchoring":"Ana López"}}')) = '22023',
  'CA12. calibration_publish_agreement aceptó un acuerdo mal formado');
select public.calibration_finish(:'run_w', 'failed', 'selftest_stop', '{}');
reset role;
select pg_temp.expect(:'parity_w' = 't', 'CA12. Sin pares, pairs 0 y kappa null no dieron paridad');
rollback;

-- ===================================================================== Limpieza
-- La calibración vuelve a nacer apagada y en solo reporte, como la deja la migración
update public.platform_settings set value = jsonb_set(jsonb_set(value, '{calibration,enabled}', 'false'), '{calibration,mode}', '"dry_run"')
  where key = 'model_settings';
select pg_temp.expect((select count(*) = 0 from public.calibration_runs where status = 'running'), 'CA11. Quedó una corrida en curso al terminar');
select 'TODAS LAS PRUEBAS DE LA CALIBRACIÓN PASARON' as resultado;
