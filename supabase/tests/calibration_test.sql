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

select 'TODAS LAS PRUEBAS DE LA CALIBRACIÓN PASARON' as resultado;
