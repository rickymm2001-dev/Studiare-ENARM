-- Pruebas de la compuerta 1 (B12, migración 20261026000003). Corre al final sobre la misma base, con
-- usuarios propios. Cada bloque falla con un error si algo no cumple.
--   G1. Importar una muestra, solo el admin y con exactamente dos médicos
--   G2. Solo el médico asignado ve sus textos, en su orden y sin ver al otro
--   G3. Calificar con la rúbrica, cambiar mientras está abierta
--   G4. Avance y cierre con el veredicto de 5.4 (pasa, grave, seguridad, anclaje, utilidad, acuerdo, incompleto)
--   G5. Abrir pide veredicto y cerrar no. La pausa
--   G6. La clave ai_gate no se escribe directo, ni siquiera un admin
--   G7. Las reseñas sobreviven a que el médico borre su cuenta
\set ON_ERROR_STOP on

create or replace function pg_temp.as_user(uid text, sid text default null, aal text default 'aal2')
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claim', '', true);
  perform set_config('request.jwt.claims', (jsonb_build_object('sub', uid, 'role', 'authenticated', 'aal', aal)
    || case when sid is null then '{}'::jsonb else jsonb_build_object('session_id', sid) end)::text, true);
  execute 'set local role authenticated';
end $$;

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

-- Un texto de la muestra con la forma de AiGateItemSchema
create or replace function pg_temp.item(p_n integer, p_engine text, p_model text default 'claude-haiku-5-5')
returns jsonb language sql as $$
  select jsonb_build_object(
    'id', 'c1400000-0000-0000-0000-' || lpad(p_n::text, 12, '0'),
    'engine', p_engine,
    'model', p_model,
    'effort', 'low',
    'thinking', 'adaptive',
    'promptVersion', case when p_engine = 'flashcards' then 'flashcards.provisional.v1' else p_engine || '.base.v1' end,
    'promptHash', repeat('a', 64),
    'sourceKind', 'demo',
    'input', jsonb_build_object('texto', 'fuente ' || p_n),
    'output', jsonb_build_object('texto', 'salida ' || p_n)
  )
$$;

create or replace function pg_temp.item_id(p_n integer) returns uuid language sql as $$
  select ('c1400000-0000-0000-0000-' || lpad(p_n::text, 12, '0'))::uuid
$$;

-- Una reseña como la manda la pantalla (AiGateReviewSchema)
create or replace function pg_temp.review(
  p_n integer, p_accuracy text default 'correct', p_grounded boolean default true,
  p_safety boolean default false, p_usefulness integer default 4, p_clarity integer default 4,
  p_verdict text default 'approved', p_comment text default null
) returns void language sql as $$
  select public.ai_gate_review(pg_temp.item_id(p_n), jsonb_build_object(
    'accuracy', p_accuracy, 'grounded', p_grounded, 'safetyIssue', p_safety, 'usefulness', p_usefulness,
    'clarity', p_clarity, 'verdict', p_verdict, 'comment', p_comment))
$$;

-- ===================================================================== Usuarios
-- 01 y 02 médicas asignadas, 03 médica sin asignar, 04 admin, 05 alumna
insert into auth.users (id, email, raw_user_meta_data) values
  ('c1400000-0000-0000-0000-0000000000a1', 'c14-medica-a@x.mx', '{"alias":"Médica A"}'),
  ('c1400000-0000-0000-0000-0000000000a2', 'c14-medica-b@x.mx', '{"alias":"Médica B"}'),
  ('c1400000-0000-0000-0000-0000000000a3', 'c14-medica-c@x.mx', '{"alias":"Médica C"}'),
  ('c1400000-0000-0000-0000-0000000000a4', 'c14-admin@x.mx', '{"alias":"Admin"}'),
  ('c1400000-0000-0000-0000-0000000000a5', 'c14-alumna@x.mx', '{"alias":"Alumna"}');
update public.user_roles set role = 'physician'
  where user_id in ('c1400000-0000-0000-0000-0000000000a1', 'c1400000-0000-0000-0000-0000000000a2', 'c1400000-0000-0000-0000-0000000000a3');
update public.user_roles set role = 'admin' where user_id = 'c1400000-0000-0000-0000-0000000000a4';
\set pa 'c1400000-0000-0000-0000-0000000000a1'
\set pb 'c1400000-0000-0000-0000-0000000000a2'
\set pc 'c1400000-0000-0000-0000-0000000000a3'
\set admin 'c1400000-0000-0000-0000-0000000000a4'
\set student 'c1400000-0000-0000-0000-0000000000a5'

-- La muestra. Consejos 1 a 4, hipótesis 5 y 6, informes 7 y 8, tarjetas 9 a 12, reestructurada 13
select jsonb_build_object('version', 1, 'id', 'c14-muestra', 'createdAt', '2026-10-15T15:00:00Z', 'items', jsonb_build_array(
  pg_temp.item(1, 'bias_tips'), pg_temp.item(2, 'bias_tips'), pg_temp.item(3, 'bias_tips'), pg_temp.item(4, 'bias_tips'),
  pg_temp.item(5, 'forgetting'), pg_temp.item(6, 'forgetting'),
  pg_temp.item(7, 'weekly_report'), pg_temp.item(8, 'weekly_report'),
  pg_temp.item(9, 'flashcards'), pg_temp.item(10, 'flashcards'), pg_temp.item(11, 'flashcards'), pg_temp.item(12, 'flashcards'),
  pg_temp.item(13, 'restructure')
)) as sample \gset

-- ===================================================================== G1. Importar
begin;
select pg_temp.as_user(:'student');
select pg_temp.expect(pg_temp.fails_with(format('select public.admin_ai_gate_sample_create(%L, array[%L, %L]::uuid[])', :'sample', :'pa', :'pb')) = '42501',
  'G1. Una alumna importó una muestra');
rollback;
begin;
select pg_temp.as_user(:'pa');
select pg_temp.expect(pg_temp.fails_with(format('select public.admin_ai_gate_sample_create(%L, array[%L, %L]::uuid[])', :'sample', :'pa', :'pb')) = '42501',
  'G1. Una médica importó una muestra');
rollback;
begin;
select pg_temp.as_user(:'admin');
select pg_temp.expect(pg_temp.fails_with(format('select public.admin_ai_gate_sample_create(%L, array[%L, %L]::uuid[])', :'sample', :'pa', :'student')) = '22023',
  'G1. Aceptó a una alumna como revisora');
select pg_temp.expect(pg_temp.fails_with(format('select public.admin_ai_gate_sample_create(%L, array[%L, %L]::uuid[])', :'sample', :'pa', :'pa')) = '22023',
  'G1. Aceptó a la misma médica dos veces');
select pg_temp.expect(pg_temp.fails_with(format('select public.admin_ai_gate_sample_create(%L, array[%L]::uuid[])', :'sample', :'pa')) = '22023',
  'G1. Aceptó un solo revisor');
select pg_temp.expect(pg_temp.fails_with(format('select public.admin_ai_gate_sample_create(%L, array[%L, %L]::uuid[])',
  jsonb_set(:'sample'::jsonb, '{version}', '2'), :'pa', :'pb')) = '22023', 'G1. Aceptó otra versión del archivo');
select pg_temp.expect(pg_temp.fails_with(format('select public.admin_ai_gate_sample_create(%L, array[%L, %L]::uuid[])',
  jsonb_set(:'sample'::jsonb, '{items,0,engine}', '"chat_libre"'), :'pa', :'pb')) = '23514', 'G1. Aceptó un motor que no existe');
select pg_temp.expect(public.admin_ai_gate_sample_create(:'sample', array[:'pa', :'pb']::uuid[]) = 'c14-muestra',
  'G1. El admin no pudo importar la muestra');
commit;
select pg_temp.expect((select count(*) from public.ai_gate_items where sample_id = 'c14-muestra') = 13
  and (select position from public.ai_gate_items where id = pg_temp.item_id(13)) = 12,
  'G1. La muestra no quedó con sus 13 textos en orden');
select pg_temp.expect(pg_temp.fails_with(format(
  'select set_config(''request.jwt.claims'', %L, true), public.admin_ai_gate_sample_create(%L, array[%L, %L]::uuid[])',
  jsonb_build_object('sub', :'admin', 'role', 'authenticated', 'aal', 'aal2'), :'sample', :'pa', :'pb')) = '23505',
  'G1. Se importó dos veces la misma muestra');

-- ===================================================================== G2. Lo que ve cada médico
begin;
select pg_temp.as_user(:'pa');
select public.ai_gate_my_items('c14-muestra') as items_a \gset
reset role;
select pg_temp.as_user(:'pb');
select public.ai_gate_my_items('c14-muestra') as items_b \gset
rollback;
select pg_temp.expect((:'items_a'::jsonb ->> 'total')::integer = 13 and jsonb_array_length(:'items_a'::jsonb -> 'items') = 13
  and (:'items_a'::jsonb ->> 'reviewed')::integer = 0 and :'items_a'::jsonb -> 'items' -> 0 -> 'review' = 'null'::jsonb,
  'G2. La médica no vio sus 13 textos sin calificar');
select pg_temp.expect(not (:'items_a'::jsonb -> 'items' -> 0) ? 'model' and not (:'items_a'::jsonb -> 'items' -> 0) ? 'promptHash'
  and (:'items_a'::jsonb -> 'items' -> 0) ?& array['id', 'engine', 'sourceKind', 'input', 'output', 'review'],
  'G2. El texto trae el modelo o le falta algo');
select pg_temp.expect((select array_agg(i ->> 'id') from jsonb_array_elements(:'items_a'::jsonb -> 'items') i)
  is distinct from (select array_agg(i ->> 'id') from jsonb_array_elements(:'items_b'::jsonb -> 'items') i),
  'G2. Las dos médicas ven los textos en el mismo orden');
do $$
declare
  v_uid text;
begin
  foreach v_uid in array array['c1400000-0000-0000-0000-0000000000a3', 'c1400000-0000-0000-0000-0000000000a5'] loop
    perform pg_temp.as_user(v_uid);
    if pg_temp.fails_with($q$select public.ai_gate_my_items('c14-muestra')$q$) is distinct from '42501' then
      raise exception 'FALLA G2. % vio una muestra que no le tocaba', v_uid;
    end if;
    reset role;
  end loop;
end $$;
begin;
set local role anon;
select pg_temp.expect(pg_temp.fails_with($q$select public.ai_gate_my_items('c14-muestra')$q$) = '42501', 'G2. anon vio la muestra');
rollback;
-- Con un dispositivo desplazado o sin segundo factor cuando la bandera lo pide, tampoco
begin;
insert into public.device_sessions (user_id, device_id, label, session_id) values (:'pa', 'dev-c14', 'Firefox', 'sesion-c14-a');
select pg_temp.as_user(:'pa', 'sesion-c14-b');
select pg_temp.expect(pg_temp.fails_with($q$select public.ai_gate_my_items('c14-muestra')$q$) = '42501',
  'G2. Un dispositivo que ya no es el activo vio la muestra');
rollback;
begin;
insert into public.platform_settings (key, value) values ('feature_flags', '{"requireMfa": true}')
  on conflict (key) do update set value = public.platform_settings.value || '{"requireMfa": true}'::jsonb;
select pg_temp.as_user(:'pa', null, 'aal1');
select pg_temp.expect(pg_temp.fails_with($q$select public.ai_gate_my_items('c14-muestra')$q$) = '42501',
  'G2. Sin segundo factor la médica vio la muestra');
rollback;
begin;
select pg_temp.as_user(:'pa');
select pg_temp.expect(public.ai_gate_my_samples() -> 0 ->> 'sampleId' = 'c14-muestra', 'G2. La médica no vio su muestra abierta');
rollback;

-- ===================================================================== G3. Calificar
begin;
select pg_temp.as_user(:'pa');
-- Rúbrica mal armada
select pg_temp.expect(pg_temp.fails_with($q$select pg_temp.review(1, 'grave')$q$) = '22023', 'G3. Aceptó otra exactitud');
select pg_temp.expect(pg_temp.fails_with($q$select pg_temp.review(1, p_usefulness => 5)$q$) = '22023', 'G3. Aceptó utilidad 5');
select pg_temp.expect(pg_temp.fails_with($q$select pg_temp.review(1, p_verdict => 'aprobado')$q$) = '22023', 'G3. Aceptó otro veredicto');
select pg_temp.expect(pg_temp.fails_with($q$select pg_temp.review(1, p_comment => repeat('x', 501))$q$) = '22023', 'G3. Aceptó un comentario largo');
select pg_temp.expect(pg_temp.fails_with(format('select public.ai_gate_review(%L, %L)', pg_temp.item_id(1),
  '{"accuracy":"correct","grounded":true,"safetyIssue":false,"usefulness":4,"clarity":4,"verdict":"approved","comment":null,"extra":1}')) = '22023',
  'G3. Aceptó un campo de más');
select pg_temp.expect(pg_temp.fails_with(format('select public.ai_gate_review(%L, %L)', pg_temp.item_id(1),
  '{"accuracy":"correct","grounded":"sí","safetyIssue":false,"usefulness":4,"clarity":4,"verdict":"approved"}')) = '22023',
  'G3. Aceptó un anclaje que no es booleano');
-- Médica A. Consejos todo bien. Hipótesis con un error grave. Informes con utilidad 2.
-- Tarjetas aprobadas. Reestructurada calificada solo por ella
select pg_temp.review(1, p_verdict => 'rejected', p_comment => '  primero lo rechazó  ');
select pg_temp.review(1);
select pg_temp.review(2); select pg_temp.review(3); select pg_temp.review(4);
select pg_temp.review(5, 'severe'); select pg_temp.review(6);
select pg_temp.review(7, p_usefulness => 2); select pg_temp.review(8, p_usefulness => 2);
select pg_temp.review(9); select pg_temp.review(10); select pg_temp.review(11); select pg_temp.review(12);
select pg_temp.review(13);
commit;
select pg_temp.expect((select count(*) = 1 and bool_and(verdict = 'approved' and comment is null) from public.ai_gate_reviews
  where item_id = pg_temp.item_id(1) and reviewer_id = :'pa'), 'G3. Cambiar la reseña no la reemplazó');
begin;
select pg_temp.as_user(:'pb');
-- Médica B. Consejos todo bien. Hipótesis con un problema de seguridad. Informes con un texto sin
-- anclar y utilidad 2. Tarjetas con un veredicto distinto. La reestructurada sin calificar
select pg_temp.review(1); select pg_temp.review(2); select pg_temp.review(3); select pg_temp.review(4);
select pg_temp.review(5); select pg_temp.review(6, p_safety => true);
select pg_temp.review(7, p_grounded => false, p_usefulness => 2); select pg_temp.review(8, p_usefulness => 2);
select pg_temp.review(9); select pg_temp.review(10); select pg_temp.review(11);
select pg_temp.review(12, p_verdict => 'minor_changes');
commit;
-- Cada una ve solo su reseña
begin;
select pg_temp.as_user(:'pb');
select public.ai_gate_my_items('c14-muestra') as items_b \gset
rollback;
select pg_temp.expect((select i -> 'review' ->> 'accuracy' from jsonb_array_elements(:'items_b'::jsonb -> 'items') i
  where (i ->> 'id')::uuid = pg_temp.item_id(5)) = 'correct'
  and (select i -> 'review' from jsonb_array_elements(:'items_b'::jsonb -> 'items') i
  where (i ->> 'id')::uuid = pg_temp.item_id(13)) = 'null'::jsonb
  and (:'items_b'::jsonb ->> 'reviewed')::integer = 12, 'G3. La médica B vio la reseña de la A');

-- ===================================================================== G4. Avance y cierre
begin;
select pg_temp.as_user(:'pa');
select pg_temp.expect(pg_temp.fails_with($q$select public.admin_ai_gate_progress('c14-muestra')$q$) = '42501'
  and pg_temp.fails_with($q$select public.admin_ai_gate_close('c14-muestra')$q$) = '42501',
  'G4. Una médica vio el avance o cerró la muestra');
rollback;
begin;
select pg_temp.as_user(:'admin');
select public.admin_ai_gate_progress('c14-muestra') as progress \gset
select pg_temp.expect((:'progress'::jsonb ->> 'total')::integer = 13
  and (:'progress'::jsonb -> 'reviewers' -> 0 ->> 'reviewed')::integer = 13
  and (:'progress'::jsonb -> 'reviewers' -> 1 ->> 'reviewed')::integer = 12
  and (:'progress'::jsonb -> 'reviewers' -> 0 ->> 'severe')::integer = 1
  and :'progress'::jsonb ->> 'status' = 'open', 'G4. El avance no es el esperado');
select pg_temp.expect(public.admin_ai_gate_samples() -> 0 ->> 'sampleId' = 'c14-muestra', 'G4. El admin no vio la muestra');
select public.admin_ai_gate_close('c14-muestra') as verdict \gset
commit;
select pg_temp.expect((:'verdict'::jsonb -> 'engines' -> 'bias_tips' ->> 'passed')::boolean
  and :'verdict'::jsonb -> 'engines' -> 'bias_tips' -> 'reasons' = '[]'::jsonb
  and (:'verdict'::jsonb -> 'engines' -> 'bias_tips' ->> 'agreement')::numeric = 1
  and :'verdict'::jsonb -> 'engines' -> 'bias_tips' -> 'kappa' = 'null'::jsonb,
  'G4. Los consejos no pasaron');
select pg_temp.expect(:'verdict'::jsonb -> 'engines' -> 'forgetting' -> 'reasons' = '["severe", "safety"]'::jsonb,
  'G4. Las hipótesis no fallaron por el error grave y la seguridad');
select pg_temp.expect(:'verdict'::jsonb -> 'engines' -> 'weekly_report' -> 'reasons' = '["grounded", "usefulness"]'::jsonb
  and (:'verdict'::jsonb -> 'engines' -> 'weekly_report' ->> 'groundedMin')::numeric = 0.5,
  'G4. Los informes no fallaron por anclaje y utilidad');
select pg_temp.expect(:'verdict'::jsonb -> 'engines' -> 'flashcards' -> 'reasons' = '["agreement"]'::jsonb
  and (:'verdict'::jsonb -> 'engines' -> 'flashcards' ->> 'agreement')::numeric = 0.75
  and (:'verdict'::jsonb -> 'engines' -> 'flashcards' ->> 'approvedMin')::numeric = 1,
  'G4. Las tarjetas no fallaron solo por acuerdo');
select pg_temp.expect(not (:'verdict'::jsonb -> 'engines' -> 'restructure' ->> 'passed')::boolean
  and :'verdict'::jsonb -> 'engines' -> 'restructure' -> 'reasons' ? 'incomplete',
  'G4. La reestructurada incompleta pasó');
select pg_temp.expect((select status = 'closed' and closed_at is not null and verdict = :'verdict'::jsonb
  from public.ai_gate_samples where id = 'c14-muestra'), 'G4. La muestra no quedó cerrada con su veredicto');
-- Cerrada, nadie califica y cerrar otra vez da lo mismo
begin;
select pg_temp.as_user(:'pb');
select pg_temp.expect(pg_temp.fails_with($q$select pg_temp.review(13)$q$) = '55000', 'G4. Se calificó una muestra cerrada');
reset role;
select pg_temp.as_user(:'admin');
select pg_temp.expect(public.admin_ai_gate_close('c14-muestra') = :'verdict'::jsonb, 'G4. Cerrar otra vez cambió el veredicto');
rollback;

-- ===================================================================== G5. Abrir, cerrar y pausar
begin;
select pg_temp.as_user(:'pa');
select pg_temp.expect(pg_temp.fails_with($q$select public.admin_ai_gate_set('bias_tips', true, 'c14-muestra')$q$) = '42501'
  and pg_temp.fails_with($q$select public.admin_ai_pause(true)$q$) = '42501', 'G5. Una médica abrió un motor o pausó');
rollback;
begin;
select pg_temp.as_user(:'admin');
select pg_temp.expect(pg_temp.fails_with($q$select public.admin_ai_gate_set('forgetting', true, 'c14-muestra')$q$) = '55000',
  'G5. Se abrió un motor que no pasó');
select pg_temp.expect(pg_temp.fails_with($q$select public.admin_ai_gate_set('bias_tips', true, 'no-existe')$q$) = '55000',
  'G5. Se abrió un motor sin muestra');
select public.admin_ai_gate_set('bias_tips', true, 'c14-muestra') as opened \gset
-- Cerrar uno que nunca se abrió no inventa su entrada
select public.admin_ai_gate_set('weekly_report', false, null) as closed_never \gset
commit;
select pg_temp.expect(:'opened'::jsonb -> 'engines' -> 'bias_tips' @> jsonb_build_object(
    'open', true, 'model', 'claude-haiku-5-5', 'effort', 'low', 'thinking', 'adaptive',
    'promptVersion', 'bias_tips.base.v1', 'promptHash', repeat('a', 64), 'sampleId', 'c14-muestra')
  and (select value -> 'engines' -> 'bias_tips' ->> 'open' from public.platform_settings where key = 'ai_gate') = 'true',
  'G5. Abrir no guardó con qué se auditó');
select pg_temp.expect(not (:'closed_never'::jsonb -> 'engines') ? 'weekly_report', 'G5. Cerrar inventó una entrada');
begin;
select pg_temp.as_user(:'admin');
select public.admin_ai_gate_set('bias_tips', false, null);
reset role;
select pg_temp.expect((select value -> 'engines' -> 'bias_tips' ->> 'open' = 'false'
  and value -> 'engines' -> 'bias_tips' ->> 'model' = 'claude-haiku-5-5' from public.platform_settings where key = 'ai_gate'),
  'G5. Cerrar no cerró el motor');
select pg_temp.as_user(:'admin');
select public.admin_ai_pause(true);
reset role;
select pg_temp.expect((select (value ->> 'paused')::boolean from public.platform_settings where key = 'ai_gate'), 'G5. La pausa no quedó');
rollback;
-- Una muestra cuyos textos de un motor salieron de dos modelos no abre ese motor
begin;
select pg_temp.as_user(:'admin');
select public.admin_ai_gate_sample_create(jsonb_build_object('version', 1, 'id', 'c14-mezcla', 'createdAt', 'x',
  'items', jsonb_build_array(pg_temp.item(21, 'bias_tips'), pg_temp.item(22, 'bias_tips', 'claude-sonnet-5-5'))),
  array[:'pa', :'pb']::uuid[]);
reset role;
select pg_temp.as_user(:'pa');
select pg_temp.review(21); select pg_temp.review(22);
reset role;
select pg_temp.as_user(:'pb');
select pg_temp.review(21); select pg_temp.review(22);
reset role;
select pg_temp.as_user(:'admin');
select pg_temp.expect((public.admin_ai_gate_close('c14-mezcla') -> 'engines' -> 'bias_tips' ->> 'passed')::boolean,
  'G5. La muestra mezclada no pasó');
select pg_temp.expect(pg_temp.fails_with($q$select public.admin_ai_gate_set('bias_tips', true, 'c14-mezcla')$q$) = '22023',
  'G5. Se abrió un motor auditado con dos modelos');
rollback;

-- ===================================================================== G6. Nadie escribe ai_gate directo
begin;
select pg_temp.as_user(:'admin');
select pg_temp.expect(pg_temp.fails_with($q$update public.platform_settings set value = '{"paused":false,"engines":{}}' where key = 'ai_gate'$q$) = '42501',
  'G6. Un admin escribió ai_gate directo');
select pg_temp.expect(pg_temp.fails_with($q$delete from public.platform_settings where key = 'ai_gate'$q$) = '42501',
  'G6. Un admin borró ai_gate');
-- Las demás claves siguen en sus manos
insert into public.platform_settings (key, value) values ('c14_prueba', '1');
rollback;
select pg_temp.expect(pg_temp.fails_with($q$update public.platform_settings set value = '{"paused":true,"engines":{}}' where key = 'ai_gate'$q$) = '42501',
  'G6. La base escribió ai_gate sin pasar por las funciones');
select pg_temp.expect(pg_temp.fails_with($q$update public.platform_settings set key = 'ai_gate' where key = 'enarm_exam'$q$) = '42501',
  'G6. Otra clave se volvió ai_gate');
select pg_temp.expect((select value -> 'engines' -> 'bias_tips' ->> 'open' from public.platform_settings where key = 'ai_gate') = 'true',
  'G6. La bandera cambió');
begin;
set local role anon;
select pg_temp.expect((select value ? 'engines' from public.platform_settings where key = 'ai_gate'), 'G6. La bandera no se lee sin sesión');
rollback;

-- ===================================================================== G7. Las reseñas sobreviven a la cuenta
begin;
delete from auth.users where id = :'pb';
select pg_temp.expect((select count(*) from public.ai_gate_reviews where reviewer_id is null) = 12,
  'G7. Las reseñas de la médica se fueron con su cuenta');
rollback;

-- ===================================================================== P. Permisos
select pg_temp.expect(
  not has_table_privilege('authenticated', 'public.ai_gate_samples', 'select,insert,update,delete')
  and not has_table_privilege('authenticated', 'public.ai_gate_items', 'select,insert,update,delete')
  and not has_table_privilege('authenticated', 'public.ai_gate_reviews', 'select,insert,update,delete')
  and not has_function_privilege('authenticated', 'public.ai_gate_write(jsonb)', 'execute')
  and not has_function_privilege('authenticated', 'public.ai_gate_verdict(text)', 'execute')
  and not has_function_privilege('anon', 'public.ai_gate_review(uuid, jsonb)', 'execute')
  and has_function_privilege('authenticated', 'public.ai_gate_review(uuid, jsonb)', 'execute')
  and not has_function_privilege('service_role', 'public.admin_ai_gate_set(text, boolean, text)', 'execute'),
  'P. Los permisos de la compuerta no son los esperados');

select 'TODAS LAS PRUEBAS DE LA COMPUERTA 1 PASARON' as resultado;
