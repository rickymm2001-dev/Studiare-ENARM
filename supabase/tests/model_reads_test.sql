-- Pruebas de lo que leen la app y las pantallas del equipo (B14, migración 20261028000003, 8.1 del plan de
-- B14). Corre sobre la base migrada después de las demás pruebas, con usuarios propios que empiezan con
-- mr. Aparecen los cinco tipos de usuario, sin sesión, alumno Gratis, alumno de pago, médico y admin o
-- dueño. Todo se siembra dentro de transacciones que se deshacen, así que la base queda como estaba. Todo
-- el texto que siembra es simulado y dice [Prueba].
--   MR1 permisos, MR2 comparison_snapshot, MR3 dispositivo desplazado, MR4 sin publicación o apagada,
--   MR5 catálogo con calibración, MR6 pantallas del equipo y MR7 población con el mínimo de 30
\set ON_ERROR_STOP on
\ir bank_helpers.sql

\set s1 'ad000000-0000-0000-0000-000000000001'
\set s2 'ad000000-0000-0000-0000-000000000002'
\set s3 'ad000000-0000-0000-0000-000000000003'
\set s4 'ad000000-0000-0000-0000-000000000004'
\set p1 'ad000000-0000-0000-0000-0000000000a1'
\set m1 'ad000000-0000-0000-0000-0000000000d1'
\set ad 'ad000000-0000-0000-0000-0000000000e1'
\set ow 'ad000000-0000-0000-0000-0000000000f1'

insert into auth.users (id, email, raw_user_meta_data) values
  (:'s1', 'mr-s1@x.mx', '{"alias":"Gratis MR uno"}'),
  (:'s2', 'mr-s2@x.mx', '{"alias":"Gratis MR dos"}'),
  (:'s3', 'mr-s3@x.mx', '{"alias":"Gratis MR tres"}'),
  (:'s4', 'mr-s4@x.mx', '{"alias":"Gratis MR cuatro"}'),
  (:'p1', 'mr-p1@x.mx', '{"alias":"Pago MR"}'),
  (:'m1', 'mr-m1@x.mx', '{"alias":"Médica MR"}'),
  (:'ad', 'mr-ad@x.mx', '{"alias":"Admin MR"}'),
  (:'ow', 'mr-ow@x.mx', '{"alias":"Dueño MR"}');
update public.user_roles set role = 'physician' where user_id = :'m1';
update public.user_roles set role = 'admin' where user_id = :'ad';
-- El dueño es único. Si la base todavía no tiene uno, esta prueba nombra al suyo
update public.user_roles set role = 'owner' where user_id = :'ow' and not exists (select 1 from public.user_roles where role = 'owner');
insert into public.subscriptions (user_id, plan, status, provider, current_period_end)
  values (:'p1', 'monthly', 'active', 'stripe', now() + interval '20 days');
select user_id::text as owner from public.user_roles where role = 'owner' \gset
-- Cirugía general, pediatría, sin elegir y Todavía no lo decido
update public.private_accounts set target_specialty = 'general_surgery' where user_id = :'s1';
update public.private_accounts set target_specialty = 'pediatrics' where user_id = :'s2';
update public.private_accounts set target_specialty = 'undecided' where user_id = :'s4';
update public.private_accounts set target_specialty = 'pediatrics' where user_id = :'p1';

-- Una corrida aplicada con su comparación, su población y su acuerdo, publicada hace una hora. Se llama
-- dentro de cada transacción de prueba, que luego se deshace
create or replace function pg_temp.cuts(p_start numeric) returns numeric[] language sql as $$
  select array_agg(round(p_start + g * 0.01, 2) order by g) from generate_series(1, 19) g
$$;
create or replace function pg_temp.mr_seed() returns void language plpgsql as $$
declare
  v_run constant uuid := 'ab100000-0000-0000-0000-000000000001';
begin
  -- Las corridas que dejaron otras pruebas no cuentan dentro de esta transacción, que luego se deshace
  update public.calibration_runs set status = 'failed' where status in ('ok', 'partial');
  insert into public.calibration_runs (id, run_trigger, mode, status, study_day, started_at, finished_at, applied_at, counts)
    values (v_run, 'schedule', 'apply', 'ok', public.study_day(), now() - interval '2 hours', now() - interval '1 hour',
            now() - interval '1 hour', '{"windowDays":28,"consenters":412}');
  insert into public.comparison_cells (run_id, cohort, cohort_key, metric, branch, students, cuts) values
    (v_run, 'all', '*', 'sim_accuracy', '*', 212, pg_temp.cuts(0.40)),
    (v_run, 'all', '*', 'sim_accuracy', 'pediatrics', 150, pg_temp.cuts(0.50)),
    (v_run, 'all', '*', 'reviews', '*', 40, pg_temp.cuts(100)),
    (v_run, 'all', '*', 'consistency', '*', 12, null),
    (v_run, 'specialty', 'general_surgery', 'sim_accuracy', '*', 45, pg_temp.cuts(0.45)),
    (v_run, 'specialty', 'general_surgery', 'consistency', '*', 18, null),
    (v_run, 'specialty', 'pediatrics', 'reviews', '*', 33, pg_temp.cuts(120)),
    (v_run, 'specialty', 'cardiology', 'reviews', '*', 31, pg_temp.cuts(90));
  insert into public.population_snapshots (run_id, data) values (v_run, jsonb_build_object(
    'bias', jsonb_build_object('anchoring', jsonb_build_object('students', 140, 'rate', 0.183),
                               'framing_effect', jsonb_build_object('students', 29, 'rate', 0.1)),
    'motives', jsonb_build_object(
      'pediatrics', jsonb_build_object('reports', 830, 'knowledge', 0.41, 'time', 0.08, 'fatigue', 0.06),
      'general_surgery', jsonb_build_object('reports', 12, 'knowledge', 0.5)),
    'topics', jsonb_build_object(
      'pediatrics/neonatology', jsonb_build_object('students', 96, 'accuracy', 0.58, 'difficulty', 0.31),
      'pediatrics/rare', jsonb_build_object('students', 29, 'accuracy', 0.2, 'difficulty', null),
      'internal_medicine/cardiology', jsonb_build_object('students', 110, 'accuracy', 0.49, 'difficulty', 0.12)),
    'indicators', jsonb_build_object('rapid_guess', jsonb_build_object('students', 140, 'rate', 0.06),
                                     'answer_flipping', jsonb_build_object('students', 3, 'rate', 0.5)),
    'fatigue', jsonb_build_object('state', 'validated', 'students', 41, 'longSessions', 160),
    'items', jsonb_build_object('physician_estimate', 260, 'provisional', 30, 'calibrated', 10)));
  insert into public.agreement_snapshots (run_id, pairs, kappa, observed, expected, by_tag, sql_kappa, parity)
    values (v_run, 31, 0.5234, 0.7, 0.4, '{"anchoring":0.8}', 0.5234, true);
  insert into public.model_publication (id, run_id, published_at) values (true, v_run, now() - interval '1 hour')
    on conflict (id) do update set run_id = excluded.run_id, published_at = excluded.published_at;
end $$;

-- ===================================================================== MR1. Permisos
-- Sin sesión, anon no ejecuta ninguna. Un token sin sub responde 28000
begin;
select pg_temp.as_anon();
select pg_temp.expect(pg_temp.is_blocked('select public.comparison_snapshot()')
  and pg_temp.is_blocked('select public.population_baselines()')
  and pg_temp.is_blocked('select public.editor_agreement_history()')
  and pg_temp.is_blocked('select public.admin_calibration_runs()'), 'MR1. anon ejecutó una función de lectura del modelo');
rollback;
begin;
select pg_temp.as_user('');
select pg_temp.expect(pg_temp.fails_with('select public.comparison_snapshot()') = '28000'
  and pg_temp.fails_with('select public.population_baselines()') = '28000'
  and pg_temp.fails_with('select public.editor_agreement_history()') = '28000'
  and pg_temp.fails_with('select public.admin_calibration_runs()') = '28000', 'MR1. Sin usuario no respondió 28000');
rollback;
-- Los alumnos leen lo suyo y nada del equipo
begin;
select pg_temp.as_user(:'s1');
select pg_temp.expect(pg_temp.fails_with('select public.editor_agreement_history()') = '42501'
  and pg_temp.fails_with('select public.admin_calibration_runs()') = '42501', 'MR1. Un alumno Gratis leyó una pantalla del equipo');
select pg_temp.expect(pg_temp.fails_with('select public.comparison_snapshot()') is null
  and pg_temp.fails_with('select public.population_baselines()') is null, 'MR1. Un alumno Gratis no pudo leer su comparación y la población');
rollback;
begin;
select pg_temp.as_user(:'p1');
select pg_temp.expect(pg_temp.fails_with('select public.editor_agreement_history()') = '42501'
  and pg_temp.fails_with('select public.admin_calibration_runs()') = '42501', 'MR1. Un alumno de pago leyó una pantalla del equipo');
rollback;
-- El médico ve el acuerdo y no las corridas
begin;
select pg_temp.as_user(:'m1');
select pg_temp.expect(pg_temp.fails_with('select public.editor_agreement_history()') is null
  and pg_temp.fails_with('select public.admin_calibration_runs()') = '42501', 'MR1. El médico no vio solo el historial de acuerdo');
rollback;
-- El admin y el dueño ven las dos
begin;
select pg_temp.as_user(:'ad');
select pg_temp.expect(pg_temp.fails_with('select public.editor_agreement_history()') is null
  and pg_temp.fails_with('select public.admin_calibration_runs()') is null, 'MR1. El admin no vio las dos pantallas');
rollback;
begin;
select pg_temp.as_user(:'owner');
select pg_temp.expect(pg_temp.fails_with('select public.editor_agreement_history()') is null
  and pg_temp.fails_with('select public.admin_calibration_runs()') is null, 'MR1. El dueño no vio las dos pantallas');
rollback;
-- La llave de servicio no las ejecuta
begin;
select pg_temp.as_service();
select pg_temp.expect(pg_temp.is_blocked('select public.comparison_snapshot()')
  and pg_temp.is_blocked('select public.population_baselines()')
  and pg_temp.is_blocked('select public.admin_calibration_runs()'), 'MR1. La llave de servicio ejecutó una función del alumno o del admin');
rollback;

-- ===================================================================== MR2. comparison_snapshot
begin;
select pg_temp.mr_seed();
select pg_temp.as_user(:'s1');
select public.comparison_snapshot() as snap_s1 \gset
rollback;
select pg_temp.expect((:'snap_s1'::jsonb ->> 'available')::boolean and :'snap_s1'::jsonb ->> 'specialty' = 'general_surgery'
  and (:'snap_s1'::jsonb ->> 'windowDays')::int = 28 and (:'snap_s1'::jsonb ->> 'minGroupSize')::int = 30
  and :'snap_s1'::jsonb ->> 'studyDay' = to_char(public.study_day(), 'YYYY-MM-DD')
  and :'snap_s1'::jsonb ->> 'runAt' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9:.]{12}Z$',
  'MR2. La foto de s1 no trae su especialidad, la ventana de la corrida, el mínimo y las fechas');
-- Todos (4 celdas) y su especialidad (2). Nada de pediatría ni cardiología
select pg_temp.expect(jsonb_array_length(:'snap_s1'::jsonb -> 'cells') = 6
  and (select count(*) filter (where c ->> 'cohort' = 'all') = 4 and count(*) filter (where c ->> 'cohort' = 'specialty') = 2
       from jsonb_array_elements(:'snap_s1'::jsonb -> 'cells') c)
  and position('cardiology' in :'snap_s1') = 0 and position('"pediatrics"' in (
    select jsonb_agg(c)::text from jsonb_array_elements(:'snap_s1'::jsonb -> 'cells') c where c ->> 'cohort' = 'specialty')) = 0,
  'MR2. s1 no recibió solo Todos y cirugía general');
-- Cortes solo donde hay 30 alumnos o más, el estado lo dice y los valores salen tal cual
select pg_temp.expect((select bool_and(((c ->> 'students')::int >= 30) = (c -> 'cuts' <> 'null'::jsonb)
                                and (c ->> 'state' = 'ready') = ((c ->> 'students')::int >= 30)
                                and (c -> 'cuts' = 'null'::jsonb or jsonb_array_length(c -> 'cuts') = 19))
       from jsonb_array_elements(:'snap_s1'::jsonb -> 'cells') c),
  'MR2. Una celda de menos de 30 trae cortes o una de 30 o más no los trae, o no son 19');
select pg_temp.expect((select c -> 'cuts' = to_jsonb(pg_temp.cuts(0.40)) and (c ->> 'students')::int = 212
       from jsonb_array_elements(:'snap_s1'::jsonb -> 'cells') c
       where c ->> 'cohort' = 'all' and c ->> 'metric' = 'sim_accuracy' and c ->> 'branch' = '*'),
  'MR2. Los cortes de Todos en aciertos no salen como se guardaron');
select pg_temp.expect((select c ->> 'state' = 'calibrating' and (c ->> 'students')::int = 18 and c -> 'cuts' = 'null'::jsonb
       from jsonb_array_elements(:'snap_s1'::jsonb -> 'cells') c
       where c ->> 'cohort' = 'specialty' and c ->> 'metric' = 'consistency'),
  'MR2. La celda chica de cirugía no sale calibrando con sus 18 alumnos y sin cortes');
-- Nada de cuentas ni texto, y las celdas salen en un orden fijo con el total primero
select pg_temp.expect(position('ad000000' in :'snap_s1') = 0 and position('@' in :'snap_s1') = 0
  and (select array_agg(c ->> 'metric' || '/' || (c ->> 'branch') order by o)
       from jsonb_array_elements(:'snap_s1'::jsonb -> 'cells') with ordinality t (c, o) where c ->> 'cohort' = 'all')
    = array['consistency/*', 'reviews/*', 'sim_accuracy/*', 'sim_accuracy/pediatrics'],
  'MR2. La foto trae cuentas, arrobas o un orden distinto de las celdas');
-- Otro alumno con otra especialidad recibe la suya, y sin especialidad o con Todavía no lo decido, ninguna
begin;
select pg_temp.mr_seed();
select pg_temp.as_user(:'s2');
select public.comparison_snapshot() as snap_s2 \gset
select pg_temp.as_user(:'s3');
select public.comparison_snapshot() as snap_s3 \gset
select pg_temp.as_user(:'s4');
select public.comparison_snapshot() as snap_s4 \gset
select pg_temp.as_user(:'p1');
select public.comparison_snapshot() as snap_p1 \gset
rollback;
select pg_temp.expect(:'snap_s2'::jsonb ->> 'specialty' = 'pediatrics' and jsonb_array_length(:'snap_s2'::jsonb -> 'cells') = 5
  and exists (select 1 from jsonb_array_elements(:'snap_s2'::jsonb -> 'cells') c where c ->> 'cohort' = 'specialty' and c ->> 'metric' = 'reviews' and (c ->> 'students')::int = 33)
  and not exists (select 1 from jsonb_array_elements(:'snap_s2'::jsonb -> 'cells') c where c ->> 'cohort' = 'specialty' and (c ->> 'students')::int in (45, 18, 31)),
  'MR2. s2 no recibió la comparación de pediatría');
select pg_temp.expect((:'snap_s3'::jsonb -> 'specialty') = 'null'::jsonb and jsonb_array_length(:'snap_s3'::jsonb -> 'cells') = 4
  and (:'snap_s3'::jsonb ->> 'available')::boolean, 'MR2. Sin especialidad debía venir null y solo Todos');
select pg_temp.expect((:'snap_s4'::jsonb -> 'specialty') = 'null'::jsonb and jsonb_array_length(:'snap_s4'::jsonb -> 'cells') = 4,
  'MR2. Con Todavía no lo decido debía venir null y solo Todos');
select pg_temp.expect(:'snap_p1'::jsonb ->> 'specialty' = 'pediatrics' and jsonb_array_length(:'snap_p1'::jsonb -> 'cells') = 5,
  'MR2. El alumno de pago no recibió su comparación');
-- Si el admin sube el mínimo a 45, las celdas con 33 y 40 alumnos vuelven a calibrar sin cortes. Si lo baja
-- a 10 se lee como 30
begin;
select pg_temp.mr_seed();
update public.platform_settings set value = jsonb_set(value, '{thresholds,minGroupSize}', '45') where key = 'model_settings';
select pg_temp.as_user(:'s2');
select public.comparison_snapshot() as snap_45 \gset
rollback;
select pg_temp.expect((:'snap_45'::jsonb ->> 'minGroupSize')::int = 45
  and (select bool_and((c ->> 'state' = 'ready') = ((c ->> 'students')::int >= 45) and ((c -> 'cuts') <> 'null'::jsonb) = ((c ->> 'students')::int >= 45))
       from jsonb_array_elements(:'snap_45'::jsonb -> 'cells') c)
  and (select count(*) from jsonb_array_elements(:'snap_45'::jsonb -> 'cells') c where c ->> 'state' = 'ready') = 2,
  'MR2. Con minGroupSize en 45 las celdas de 33 y 40 alumnos no volvieron a calibrar');
begin;
select pg_temp.mr_seed();
update public.platform_settings set value = jsonb_set(value, '{thresholds,minGroupSize}', '10') where key = 'model_settings';
select pg_temp.as_user(:'s2');
select public.comparison_snapshot() as snap_10 \gset
rollback;
select pg_temp.expect((:'snap_10'::jsonb ->> 'minGroupSize')::int = 30, 'MR2. minGroupSize en 10 no se leyó como 30');

-- ===================================================================== MR3. Dispositivo desplazado
begin;
select pg_temp.as_user(:'s3', 'ses-a');
select public.claim_device('mr-dev-a', 'Chrome');
commit;
begin;
select pg_temp.as_user(:'s3', 'ses-b');
select public.claim_device('mr-dev-b', 'Safari');
commit;
begin;
select pg_temp.mr_seed();
select pg_temp.as_user(:'s3', 'ses-a');
select pg_temp.expect(pg_temp.fails_with('select public.comparison_snapshot()') = '42501'
  and pg_temp.fails_with('select public.population_baselines()') = '42501', 'MR3. Un dispositivo desplazado leyó la comparación o la población');
rollback;
begin;
select pg_temp.mr_seed();
select pg_temp.as_user(:'s3', 'ses-b');
select pg_temp.expect(pg_temp.fails_with('select public.comparison_snapshot()') is null
  and pg_temp.fails_with('select public.population_baselines()') is null, 'MR3. El dispositivo activo no pudo leer');
rollback;

-- ===================================================================== MR4. Sin publicación o apagada
-- Sin corrida publicada, available es false y no hay celdas
begin;
select pg_temp.mr_seed();
update public.model_publication set run_id = null, published_at = null where id;
select pg_temp.as_user(:'s1');
select public.comparison_snapshot() as snap_none \gset
select public.population_baselines() as pop_none \gset
rollback;
select pg_temp.expect(not (:'snap_none'::jsonb ->> 'available')::boolean and :'snap_none'::jsonb -> 'cells' = '[]'::jsonb
  and (:'snap_none'::jsonb -> 'runAt') = 'null'::jsonb and (:'snap_none'::jsonb -> 'studyDay') = 'null'::jsonb
  and :'snap_none'::jsonb ->> 'specialty' = 'general_surgery' and (:'snap_none'::jsonb ->> 'minGroupSize')::int = 30,
  'MR4. Sin publicación la comparación no dijo available false con sus celdas vacías');
select pg_temp.expect(not (:'pop_none'::jsonb ->> 'available')::boolean and :'pop_none'::jsonb -> 'bias' = '{}'::jsonb
  and :'pop_none'::jsonb #>> '{fatigue,state}' = 'calibrating' and (:'pop_none'::jsonb -> 'runAt') = 'null'::jsonb,
  'MR4. Sin publicación la población no dijo available false y la fatiga calibrando');
-- Con features.comparison en false tampoco, aunque haya publicación. La población sigue
begin;
select pg_temp.mr_seed();
update public.platform_settings set value = jsonb_set(value, '{features,comparison}', 'false') where key = 'model_settings';
select pg_temp.as_user(:'s1');
select public.comparison_snapshot() as snap_off \gset
select public.population_baselines() as pop_on \gset
rollback;
select pg_temp.expect(not (:'snap_off'::jsonb ->> 'available')::boolean and :'snap_off'::jsonb -> 'cells' = '[]'::jsonb
  and (:'pop_on'::jsonb ->> 'available')::boolean, 'MR4. Con features.comparison en false la comparación siguió disponible');
-- Una corrida sin población no inventa nada
begin;
select pg_temp.mr_seed();
insert into public.calibration_runs (id, run_trigger, mode, status, study_day, finished_at, applied_at)
  values ('ab100000-0000-0000-0000-000000000002', 'schedule', 'apply', 'ok', public.study_day(), now(), now());
update public.model_publication set run_id = 'ab100000-0000-0000-0000-000000000002' where id;
select pg_temp.as_user(:'s1');
select public.population_baselines() as pop_empty \gset
select public.comparison_snapshot() as snap_empty \gset
rollback;
select pg_temp.expect(not (:'pop_empty'::jsonb ->> 'available')::boolean
  and (:'snap_empty'::jsonb ->> 'available')::boolean and :'snap_empty'::jsonb -> 'cells' = '[]'::jsonb
  and (:'snap_empty'::jsonb ->> 'windowDays')::int = 30,
  'MR4. Una corrida sin población ni celdas no dejó la población sin disponible y la comparación sin celdas');

-- ===================================================================== MR5. El catálogo trae calibration
select pg_temp.bank_seed('MR-0001') as q1 \gset
select pg_temp.bank_seed('MR-0002') as q2 \gset
select pg_temp.latest(:'q1') as v1 \gset
begin;
select pg_temp.set_flag('cloudBank', true);
update public.question_catalog set calibration = jsonb_build_object(
    'versionId', :'v1', 'state', 'provisional', 'difficulty', -0.42, 'se', 0.21, 'students', 134, 'elo', -0.38,
    'extreme', false, 'studyDay', '2026-10-15'), seq = nextval('public.bank_catalog_seq')
  where question_id = :'q1';
select min(seq) - 1 as since from public.question_catalog where question_id in (:'q1', :'q2') \gset
select pg_temp.as_user(:'s1');
select public.catalog_changes(:since, 1000) as cat \gset
rollback;
select pg_temp.expect((select r -> 'calibration' = jsonb_build_object('versionId', :'v1', 'state', 'provisional', 'difficulty', -0.42,
         'se', 0.21, 'students', 134, 'elo', -0.38, 'extreme', false, 'studyDay', '2026-10-15')
       from jsonb_array_elements(:'cat'::jsonb -> 'rows') r where r ->> 'questionId' = :'q1'),
  'MR5. catalog_changes no trae calibration de la pregunta calibrada');
select pg_temp.expect((select (r -> 'calibration') = 'null'::jsonb and r ? 'distractorBiases' and r ? 'seq' and r ->> 'status' = 'published'
       from jsonb_array_elements(:'cat'::jsonb -> 'rows') r where r ->> 'questionId' = :'q2'),
  'MR5. Una pregunta sin calibración no trae la llave en null o perdió una de las de antes');
select pg_temp.expect(not (:'cat'::text ~ '"(prompt|vignette|explanation|options|rationale|text)"') and position('[Prueba]' in :'cat') = 0,
  'MR5. El catálogo trae texto con la calibración');
-- Una app de antes ignora la llave: las demás son las de siempre
select pg_temp.expect((select array_agg(k order by k collate "C") from jsonb_object_keys((select r from jsonb_array_elements(:'cat'::jsonb -> 'rows') r where r ->> 'questionId' = :'q2')) k)
    @> array['branch', 'caseId', 'caseOrder', 'caseSize', 'distractorBiases', 'examEligible', 'format', 'itemKinds', 'language',
             'optionCount', 'polarity', 'questionId', 'seq', 'status', 'subtopic', 'task', 'topic', 'variantOf', 'version', 'versionId', 'difficulty'],
  'MR5. A la fila del catálogo le falta una de las llaves de siempre');

-- ===================================================================== MR6. Pantallas del equipo
-- Un segundo acuerdo de una noche en solo reporte, otro de una corrida fallida (no cuenta) y otro parcial
begin;
select pg_temp.mr_seed();
insert into public.calibration_runs (id, run_trigger, mode, status, study_day, finished_at) values
  ('ab100000-0000-0000-0000-000000000003', 'schedule', 'dry_run', 'ok', public.study_day() - 1, now() - interval '25 hours'),
  ('ab100000-0000-0000-0000-000000000004', 'schedule', 'apply', 'failed', public.study_day() - 2, now() - interval '49 hours'),
  ('ab100000-0000-0000-0000-000000000005', 'schedule', 'apply', 'partial', public.study_day() - 3, now() - interval '73 hours');
insert into public.agreement_snapshots (run_id, pairs, kappa, observed, expected, by_tag, sql_kappa, parity) values
  ('ab100000-0000-0000-0000-000000000003', 30, 0.4, 0.6, 0.33, '{}', 0.4, true),
  ('ab100000-0000-0000-0000-000000000004', 12, 0.9, 0.9, 0.5, '{}', 0.9, true),
  ('ab100000-0000-0000-0000-000000000005', 0, null, null, null, '{}', null, false);
select pg_temp.as_user(:'m1');
select public.editor_agreement_history() as hist \gset
select public.editor_agreement_history(2) as hist2 \gset
select pg_temp.as_user(:'ad');
select public.editor_agreement_history() as hist_ad \gset
select public.admin_calibration_runs() as runs \gset
select public.admin_calibration_runs(2) as runs2 \gset
rollback;
-- Una línea por noche terminada, la más reciente primero, sin la fallida
select pg_temp.expect(jsonb_array_length(:'hist'::jsonb -> 'nights') = 3
  and (select array_agg(n ->> 'pairs' order by o) from jsonb_array_elements(:'hist'::jsonb -> 'nights') with ordinality t (n, o)) = array['31', '30', '0']
  and (:'hist'::jsonb -> 'nights' -> 0) = jsonb_build_object('studyDay', to_char(public.study_day(), 'YYYY-MM-DD'),
      'at', :'hist'::jsonb -> 'nights' -> 0 -> 'at', 'pairs', 31, 'kappa', 0.5234, 'observed', 0.7, 'expected', 0.4, 'parity', true)
  and :'hist'::jsonb -> 'nights' -> 0 ->> 'at' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9:.]{12}Z$'
  and (:'hist'::jsonb -> 'nights' -> 2 -> 'kappa') = 'null'::jsonb and not (:'hist'::jsonb -> 'nights' -> 2 ->> 'parity')::boolean,
  'MR6. El historial de acuerdo no trae una línea por noche terminada, la más reciente primero y sin la fallida');
select pg_temp.expect(jsonb_array_length(:'hist2'::jsonb -> 'nights') = 2 and :'hist_ad'::jsonb = :'hist'::jsonb,
  'MR6. El tope de noches del historial no se respetó o el admin ve otra cosa que el médico');
select pg_temp.expect((select array_agg(k order by k collate "C") from jsonb_object_keys(:'hist'::jsonb) k) = array['nights'],
  'MR6. El historial no es un objeto con nights');
-- La pantalla del admin
select pg_temp.expect(:'runs'::jsonb ->> 'lastOkAt' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9:.]{12}Z$'
  and :'runs'::jsonb #>> '{publication,runId}' = 'ab100000-0000-0000-0000-000000000001'
  and :'runs'::jsonb #>> '{publication,at}' ~ '^[0-9]{4}'
  and :'runs'::jsonb #>> '{settings,calibration,mode}' = 'dry_run' and (:'runs'::jsonb #>> '{settings,thresholds,minGroupSize}')::int = 30,
  'MR6. admin_calibration_runs no trae la última corrida buena, la publicación y los ajustes');
select pg_temp.expect(jsonb_array_length(:'runs'::jsonb -> 'runs') >= 4 and jsonb_array_length(:'runs2'::jsonb -> 'runs') = 2
  and (select (r ->> 'id') = 'ab100000-0000-0000-0000-000000000001' and r ->> 'trigger' = 'schedule' and r ->> 'mode' = 'apply'
         and r ->> 'status' = 'ok' and (r -> 'reason') = 'null'::jsonb and (r -> 'runner') = '{}'::jsonb
         and (r #>> '{counts,consenters}')::int = 412 and r ->> 'startedAt' ~ '^[0-9]{4}' and r ->> 'finishedAt' ~ '^[0-9]{4}'
       from jsonb_array_elements(:'runs'::jsonb -> 'runs') r where r ->> 'id' = 'ab100000-0000-0000-0000-000000000001'),
  'MR6. Las corridas no vienen con sus campos o el tope no se respetó');
select pg_temp.expect((:'runs'::jsonb #> '{overview,items}') = '{"physician_estimate":260,"provisional":30,"calibrated":10}'::jsonb
  and (:'runs'::jsonb #> '{overview,hardestTopics}') = '[{"key":"internal_medicine/cardiology","students":110,"accuracy":0.49},
                                                         {"key":"pediatrics/neonatology","students":96,"accuracy":0.58}]'::jsonb
  and (select array_agg(k order by k) from jsonb_object_keys(:'runs'::jsonb #> '{overview,motives}') k) = array['pediatrics']
  and :'runs'::jsonb #>> '{overview,fatigue,state}' = 'validated' and (:'runs'::jsonb #>> '{overview,fatigue,students}')::int = 41
  and (:'runs'::jsonb #> '{overview,agreement}') = '{"kappa":0.5234,"parity":true}'::jsonb,
  'MR6. El resumen de la noche no trae los estados, los temas que más cuestan con 30 o más, los motivos, la fatiga y el acuerdo');
select pg_temp.expect(position('ad000000' in :'runs') = 0 and position('@' in :'runs') = 0 and position('Admin MR' in :'runs') = 0,
  'MR6. La pantalla del admin trae cuentas, alias o correos');
-- Sin corridas terminadas el resumen sale vacío, con los estados del catálogo de hoy
begin;
select pg_temp.as_user(:'ad');
select public.admin_calibration_runs() as runs_live \gset
rollback;
select pg_temp.expect(jsonb_typeof(:'runs_live'::jsonb #> '{overview,items}') = 'object'
  and (select sum(v::int) from jsonb_each_text(:'runs_live'::jsonb #> '{overview,items}') e (k, v)) >= 2
  and jsonb_typeof(:'runs_live'::jsonb #> '{overview,hardestTopics}') = 'array',
  'MR6. Sin población el resumen no cayó a los estados del catálogo');
-- Con requireMfa, el admin y el médico necesitan aal2 para ver lo del equipo
begin;
select pg_temp.mr_seed();
select pg_temp.set_flag('requireMfa', true);
select pg_temp.as_user(:'ad', null, 'aal1');
select pg_temp.expect(pg_temp.fails_with('select public.admin_calibration_runs()') = '42501'
  and pg_temp.fails_with('select public.editor_agreement_history()') = '42501', 'MR6. El admin sin segundo factor vio lo del equipo');
select pg_temp.as_user(:'m1', null, 'aal1');
select pg_temp.expect(pg_temp.fails_with('select public.editor_agreement_history()') = '42501', 'MR6. El médico sin segundo factor vio el acuerdo');
select pg_temp.as_user(:'ad', null, 'aal2');
select pg_temp.expect(pg_temp.fails_with('select public.admin_calibration_runs()') is null
  and pg_temp.fails_with('select public.editor_agreement_history()') is null, 'MR6. El admin con segundo factor no vio lo del equipo');
select pg_temp.as_user(:'m1', null, 'aal2');
select pg_temp.expect(pg_temp.fails_with('select public.editor_agreement_history()') is null
  and pg_temp.fails_with('select public.admin_calibration_runs()') = '42501', 'MR6. El médico con segundo factor no vio solo el acuerdo');
rollback;

-- ===================================================================== MR7. La población no trae celdas de menos de 30
begin;
select pg_temp.mr_seed();
select pg_temp.as_user(:'s1');
select public.population_baselines() as pop \gset
rollback;
select pg_temp.expect((:'pop'::jsonb ->> 'available')::boolean and :'pop'::jsonb ->> 'runAt' ~ '^[0-9]{4}',
  'MR7. La población no está disponible');
select pg_temp.expect((select array_agg(k order by k) from jsonb_object_keys(:'pop'::jsonb -> 'bias') k) = array['anchoring']
  and (:'pop'::jsonb #>> '{bias,anchoring,students}')::int = 140 and (:'pop'::jsonb #>> '{bias,anchoring,rate}')::numeric = 0.183
  and (select array_agg(k order by k) from jsonb_object_keys(:'pop'::jsonb -> 'topics') k) = array['internal_medicine/cardiology', 'pediatrics/neonatology']
  and (select array_agg(k order by k) from jsonb_object_keys(:'pop'::jsonb -> 'indicators') k) = array['rapid_guess']
  and (select array_agg(k order by k) from jsonb_object_keys(:'pop'::jsonb -> 'motives') k) = array['pediatrics']
  and (:'pop'::jsonb #>> '{motives,pediatrics,reports}')::int = 830 and (:'pop'::jsonb #>> '{motives,pediatrics,knowledge}')::numeric = 0.41,
  'MR7. La población trae una celda de menos de 30 alumnos o le falta una de 30 o más');
select pg_temp.expect(:'pop'::jsonb #>> '{fatigue,state}' = 'validated' and (:'pop'::jsonb #>> '{fatigue,students}')::int = 41
  and (:'pop'::jsonb #>> '{fatigue,longSessions}')::int = 160
  and (:'pop'::jsonb #> '{topics,pediatrics/neonatology,difficulty}') = '0.31'::jsonb
  and position('ad000000' in :'pop') = 0 and position('items' in :'pop') = 0,
  'MR7. La fatiga, la dificultad del tema o lo que no debía salir no cuadran');
-- Bajar populationMinStudents no deja pasar las de 29. Subirlo a 100 sí quita las de menos
begin;
select pg_temp.mr_seed();
update public.platform_settings set value = jsonb_set(value, '{thresholds,populationMinStudents}', '3') where key = 'model_settings';
select pg_temp.as_user(:'s1');
select public.population_baselines() as pop3 \gset
rollback;
select pg_temp.expect((select array_agg(k order by k) from jsonb_object_keys(:'pop3'::jsonb -> 'bias') k) = array['anchoring']
  and (select array_agg(k order by k) from jsonb_object_keys(:'pop3'::jsonb -> 'topics') k) = array['internal_medicine/cardiology', 'pediatrics/neonatology']
  and (select array_agg(k order by k) from jsonb_object_keys(:'pop3'::jsonb -> 'indicators') k) = array['rapid_guess'],
  'MR7. Con populationMinStudents en 3 salieron celdas de menos de 30');
begin;
select pg_temp.mr_seed();
update public.platform_settings set value = jsonb_set(value, '{thresholds,populationMinStudents}', '100') where key = 'model_settings';
select pg_temp.as_user(:'s1');
select public.population_baselines() as pop100 \gset
rollback;
select pg_temp.expect((select array_agg(k order by k) from jsonb_object_keys(:'pop100'::jsonb -> 'bias') k) = array['anchoring']
  and (select array_agg(k order by k) from jsonb_object_keys(:'pop100'::jsonb -> 'topics') k) = array['internal_medicine/cardiology']
  and (select array_agg(k order by k) from jsonb_object_keys(:'pop100'::jsonb -> 'motives') k) = array['pediatrics'],
  'MR7. Con populationMinStudents en 100 salieron celdas de menos de 100');
-- Quien dio o no el permiso lee lo mismo: no hay dato de nadie en lo que se ve
begin;
select pg_temp.mr_seed();
select pg_temp.as_user(:'m1');
select pg_temp.expect(pg_temp.fails_with('select public.population_baselines()') is null and pg_temp.fails_with('select public.comparison_snapshot()') is null,
  'MR7. El médico no pudo leer la población y la comparación');
rollback;

select 'TODAS LAS PRUEBAS DE LECTURA DEL MODELO PASARON' as resultado;
