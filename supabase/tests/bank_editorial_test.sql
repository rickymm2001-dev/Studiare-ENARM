-- Pruebas del flujo editorial del banco en la nube (B11, migración 20261023000003, 6.1 del plan de B11).
-- Asignaciones, versiones, revisión a ciegas, decisiones, casos seriados, reportes con su correo,
-- distractores, acuerdo y retiro. Usuarios propios que empiezan con be, con los cinco tipos, sin sesión,
-- alumno, médico, admin y dueño. Todo el texto es simulado.
\set ON_ERROR_STOP on
\ir bank_helpers.sql

\set p1 'be000000-0000-0000-0000-0000000000d1'
\set p2 'be000000-0000-0000-0000-0000000000d2'
\set p3 'be000000-0000-0000-0000-0000000000d3'
\set s1 'be000000-0000-0000-0000-0000000000a1'
\set s2 'be000000-0000-0000-0000-0000000000a2'
\set ad 'be000000-0000-0000-0000-0000000000e1'

insert into auth.users (id, email, raw_user_meta_data) values
  (:'p1', 'be-p1@x.mx', '{"alias":"Autora"}'),
  (:'p2', 'be-p2@x.mx', '{"alias":"Revisor"}'),
  (:'p3', 'be-p3@x.mx', '{"alias":"Otra médica"}'),
  (:'s1', 'be-s1@x.mx', '{"alias":"Alumno uno"}'),
  (:'s2', 'be-s2@x.mx', '{"alias":"Alumno dos"}'),
  (:'ad', 'be-ad@x.mx', '{"alias":"Admin BE"}');
update public.user_roles set role = 'physician' where user_id in (:'p1', :'p2', :'p3');
update public.user_roles set role = 'admin' where user_id = :'ad';
select user_id::text as owner from public.user_roles where role = 'owner' \gset
select pg_temp.set_flag('cloudBank', true);

-- Preguntas del Sheet en borrador, sin asignar
select pg_temp.bank_seed('BE-0001', 'draft') as q1 \gset
select pg_temp.bank_seed('BE-0002', 'draft') as q2 \gset
select pg_temp.bank_seed('BE-0003', 'draft') as q3 \gset
select pg_temp.bank_seed('BE-0004', 'draft') as q4 \gset

-- ===================================================================== BE1. Asignación
begin;
select pg_temp.as_user(:'ad');
select pg_temp.expect(public.admin_assign_questions(array[:'q1', :'q2', :'q3']::uuid[], :'p1', :'p2') = 3, 'BE1. No asignó');
select pg_temp.expect(pg_temp.fails_with(format('select public.admin_assign_questions(array[%L]::uuid[], %L, %L)', :'q1', :'p1', :'p1')) = 'BK003',
  'BE1. Aceptó al mismo médico como autor y revisor');
select pg_temp.expect(pg_temp.fails_with(format('select public.admin_assign_questions(array[%L]::uuid[], null, %L)', :'q1', :'s1')) = '22023',
  'BE1. Un alumno quedó de revisor');
select pg_temp.expect(public.admin_set_physician_code(:'p1', 'pm') = 'ok' and public.admin_set_physician_code(:'p2', 'AL') = 'ok',
  'BE1. Claves del Sheet');
select pg_temp.expect(public.admin_set_physician_code(:'p3', 'PM') = 'taken', 'BE1. Clave repetida');
select pg_temp.expect(public.admin_set_physician_code(:'s1', 'XX') = 'not_physician', 'BE1. Clave a un alumno');
select pg_temp.expect(pg_temp.fails_with(format('select public.admin_set_physician_code(%L, %L)', :'p3', 'p')) = '22023', 'BE1. Clave corta');
select public.admin_set_topic_reviewer('pediatrics', 'neonatology', :'p2');
-- Lo que el admin ve de claves y revisores por omisión (B1 de la revisión)
select pg_temp.expect(public.admin_bank_team() -> 'codes' @> jsonb_build_array(
    jsonb_build_object('userId', :'p1', 'alias', 'Autora', 'code', 'PM'),
    jsonb_build_object('userId', :'p2', 'alias', 'Revisor', 'code', 'AL'))
  and public.admin_bank_team() -> 'topicReviewers' @> jsonb_build_array(jsonb_build_object('branch', 'pediatrics',
    'topic', 'neonatology', 'physicianId', :'p2', 'alias', 'Revisor', 'active', true))
  and position('@' in public.admin_bank_team()::text) = 0, 'BE1. admin_bank_team no da claves y revisores sin correos');
commit;
begin;
select pg_temp.as_user(:'p1');
select pg_temp.expect(pg_temp.fails_with('select public.admin_bank_team()') = '42501', 'BE1. Un médico leyó las claves del equipo');
select pg_temp.expect(pg_temp.fails_with('select public.admin_bank_settings()') = '42501', 'BE1. Un médico leyó los topes privados');
select pg_temp.expect(pg_temp.fails_with($q$select public.admin_save_bank_settings('{}', '{}')$q$) = '42501',
  'BE1. Un médico guardó los topes');
rollback;
-- Topes y tarifa del admin. Cada campo va a su tabla y solo los públicos quedan en platform_settings (B5)
begin;
select pg_temp.as_user(:'ad');
select pg_temp.expect(public.admin_bank_settings() = jsonb_build_object('limits', jsonb_build_object('perMinute', 300,
    'perHour', 900, 'alertDaily', 600, 'alertWeekShare', 0.5, 'reportsPerDay', 10, 'maxFetch', 100),
    'pay', jsonb_build_object('perReviewMxn', null)), 'BE1. admin_bank_settings no dio los de fábrica');
select public.admin_save_bank_settings('{"perMinute":120,"perHour":800,"alertDaily":500,"alertWeekShare":0.4,"reportsPerDay":8,"maxFetch":90}',
  '{"perReviewMxn":45}');
select pg_temp.expect(public.admin_bank_settings() = jsonb_build_object('limits', jsonb_build_object('perMinute', 120,
    'perHour', 800, 'alertDaily', 500, 'alertWeekShare', 0.4, 'reportsPerDay', 8, 'maxFetch', 90),
    'pay', jsonb_build_object('perReviewMxn', 45)), 'BE1. admin_save_bank_settings no guardó');
select pg_temp.expect((select value from public.platform_settings where key = 'bank_limits')
    = '{"perMinute":120,"reportsPerDay":8,"maxFetch":90}'::jsonb, 'BE1. Un tope privado quedó en platform_settings');
select pg_temp.expect(pg_temp.fails_with($q$select public.admin_save_bank_settings('{"perMinute":120,"perHour":800,"alertDaily":500,"alertWeekShare":2,"reportsPerDay":8,"maxFetch":90}', '{}')$q$) = '22023'
  and pg_temp.fails_with($q$select public.admin_save_bank_settings('{"perMinute":1.5,"perHour":800,"alertDaily":500,"alertWeekShare":0.4,"reportsPerDay":8,"maxFetch":90}', '{}')$q$) = '22023'
  and pg_temp.fails_with($q$select public.admin_save_bank_settings('{"perMinute":120,"perHour":800,"alertDaily":500,"alertWeekShare":0.4,"reportsPerDay":8}', '{}')$q$) = '22023'
  and pg_temp.fails_with($q$select public.admin_save_bank_settings('{"perMinute":120,"perHour":800,"alertDaily":500,"alertWeekShare":0.4,"reportsPerDay":8,"maxFetch":90}', '{"perReviewMxn":-1}')$q$) = '22023',
  'BE1. admin_save_bank_settings aceptó un valor fuera de rango');
reset role;
-- Un perHour escrito a mano en platform_settings no cuenta
update public.platform_settings set value = value || '{"perHour":5}' where key = 'bank_limits';
select pg_temp.expect(public.bank_limit('perHour', 900) = 800, 'BE1. Contó un perHour de platform_settings');
rollback;
-- Un revisor por omisión que dejó de ser médico no se usa al mandar a revisión (B1 de la revisión)
begin;
select pg_temp.bank_seed('BE-0099', 'draft') as q99 \gset
update public.questions set branch = 'pediatrics', topic = 'neonatology', subtopic = (
    select subtopic from public.bank_taxonomy where branch = 'pediatrics' and topic = 'neonatology' limit 1)
  where id = pg_temp.latest(:'q99');
select pg_temp.latest(:'q99') as q99v1 \gset
select pg_temp.as_user(:'ad');
select public.admin_assign_questions(array[:'q99']::uuid[], :'p1', null);
reset role;
update public.user_roles set role = 'student' where user_id = :'p2';
select pg_temp.as_user(:'p1');
select pg_temp.expect(pg_temp.fails_with(format('select public.editor_submit(%L)', :'q99v1')) = 'BK003',
  'BE1. Usó de revisor por omisión a quien ya no es médico');
reset role;
update public.user_roles set role = 'physician' where user_id = :'p2';
select pg_temp.as_user(:'p1');
select pg_temp.expect(public.editor_submit(:'q99v1') ->> 'reviewerId' = :'p2',
  'BE1. No usó al revisor por omisión de la subespecialidad');
rollback;
-- Un admin que asignó puede borrar su cuenta. La asignación queda y pierde quién la hizo (B2 de la revisión)
begin;
insert into auth.users (id, email, raw_user_meta_data)
  values ('be000000-0000-0000-0000-0000000000e2', 'be-ad2@x.mx', '{"alias":"Admin que se va"}');
update public.user_roles set role = 'admin' where user_id = 'be000000-0000-0000-0000-0000000000e2';
select pg_temp.as_user('be000000-0000-0000-0000-0000000000e2');
select public.admin_assign_questions(array[:'q4']::uuid[], :'p3', null);
reset role;
select pg_temp.expect(pg_temp.fails_with('delete from auth.users where id = ''be000000-0000-0000-0000-0000000000e2''') is null,
  'BE1. Borrar la cuenta de un admin que asignó falló');
select pg_temp.expect(exists (select 1 from public.review_assignments where question_id = :'q4'
    and physician_id = :'p3' and assigned_by is null), 'BE1. La asignación no quedó sin quién la hizo');
rollback;
-- Reasignar al revisor como autor no deja a nadie con los dos papeles
begin;
select pg_temp.as_user(:'ad');
select public.admin_assign_questions(array[:'q3']::uuid[], :'p2', :'p1');
select pg_temp.expect(public.editor_question(:'q3') -> 'question' -> 'author' ->> 'id' = :'p2'
  and public.editor_question(:'q3') -> 'question' -> 'reviewer' ->> 'id' = :'p1', 'BE1. Cambio de papeles');
rollback;
select pg_temp.expect((select count(*) from public.review_assignments where question_id = :'q1' and revoked_at is null) = 2,
  'BE1. q1 no quedó con autor y revisor');
begin;
select pg_temp.as_user(:'p1');
select pg_temp.expect(pg_temp.fails_with(format('select public.admin_assign_questions(array[%L]::uuid[], %L, %L)', :'q4', :'p1', :'p2')) = '42501',
  'BE1. Un médico llamó admin_assign_questions');
select pg_temp.expect(pg_temp.fails_with(format('select public.admin_set_physician_code(%L, %L)', :'p1', 'ZZ')) = '42501', 'BE1. Un médico puso claves');
select pg_temp.expect(pg_temp.fails_with('select public.admin_bank_overview()') = '42501', 'BE1. Un médico leyó el resumen del admin');
rollback;
begin;
select pg_temp.as_user(:'owner');
select pg_temp.expect((public.admin_bank_overview() ->> 'drafts')::int >= 4, 'BE1. El dueño no leyó el resumen');
rollback;

-- ===================================================================== BE2. Quién ve qué
begin;
select pg_temp.as_user(:'p1');
select pg_temp.expect((public.editor_list() ->> 'total')::int = 3, 'BE2. La autora no ve sus 3');
select pg_temp.expect(public.editor_list() -> 'items' @> jsonb_build_array(jsonb_build_object('questionId', :'q1',
  'sourceKey', 'sheet:BE-0001', 'myRole', 'author', 'status', 'draft', 'author', jsonb_build_object('id', :'p1', 'code', 'PM'))),
  'BE2. El renglón de editor_list no trae lo esperado');
select pg_temp.expect(position('be-p1@x.mx' in public.editor_list()::text) = 0, 'BE2. editor_list trae un correo');
rollback;
begin;
select pg_temp.as_user(:'p2');
select pg_temp.expect((public.editor_list('{"view":"all"}') ->> 'total')::int = 3, 'BE2. El revisor no ve sus 3');
rollback;
begin;
select pg_temp.as_user(:'p3');
select pg_temp.expect((public.editor_list() ->> 'total')::int = 0, 'BE2. Otra médica ve lo no asignado');
select pg_temp.expect(pg_temp.fails_with(format('select public.editor_question(%L)', :'q1')) = 'BK007', 'BE2. Otra médica abrió la pregunta');
rollback;
begin;
select pg_temp.as_user(:'s1');
select pg_temp.expect(pg_temp.fails_with('select public.editor_list()') = '42501', 'BE2. Un alumno listó el banco');
select pg_temp.expect(pg_temp.fails_with(format('select public.editor_question(%L)', :'q1')) = '42501', 'BE2. Un alumno abrió la pregunta');
rollback;
begin;
select pg_temp.as_anon();
select pg_temp.expect(pg_temp.is_blocked('select public.editor_list()'), 'BE2. anon listó el banco');
select pg_temp.expect(pg_temp.is_blocked('select public.admin_bank_overview()'), 'BE2. anon leyó el resumen');
rollback;
begin;
select pg_temp.as_user(:'ad');
select pg_temp.expect((public.editor_list() ->> 'total')::int >= 4, 'BE2. El admin no ve todo');
select pg_temp.expect(public.editor_question(:'q4') -> 'review' ->> 'role' = 'admin', 'BE2. Papel del admin');
rollback;
-- Con requireMfa (B9), el equipo sin segundo factor cuenta como alumno y no usa el editor ni las
-- funciones del admin. Con aal2 sí
begin;
select pg_temp.set_flag('requireMfa', true);
select pg_temp.as_user(:'p2', null, 'aal1');
select pg_temp.expect(pg_temp.fails_with('select public.editor_list()') = '42501'
  and pg_temp.fails_with(format('select public.editor_question(%L)', :'q1')) = '42501',
  'BE2. El revisor sin segundo factor usó el editor');
select pg_temp.as_user(:'ad', null, 'aal1');
select pg_temp.expect(pg_temp.fails_with('select public.admin_bank_overview()') = '42501'
  and pg_temp.fails_with('select public.editor_list()') = '42501'
  and pg_temp.fails_with(format('select public.admin_set_physician_code(%L, %L)', :'p1', 'ZZ')) = '42501',
  'BE2. El admin sin segundo factor usó las funciones del admin');
select pg_temp.as_user(:'owner', null, 'aal1');
select pg_temp.expect(pg_temp.fails_with('select public.admin_bank_overview()') = '42501', 'BE2. El dueño sin segundo factor leyó el resumen');
select pg_temp.as_user(:'p2', null, 'aal2');
select pg_temp.expect((public.editor_list('{"view":"all"}') ->> 'total')::int = 3, 'BE2. El revisor con segundo factor no ve sus 3');
select pg_temp.as_user(:'ad', null, 'aal2');
select pg_temp.expect((public.admin_bank_overview() ->> 'drafts')::int >= 4 and (public.editor_list() ->> 'total')::int >= 4,
  'BE2. El admin con segundo factor no ve todo');
rollback;
-- Si alguien vuelve a dar permisos de tabla, las políticas de respaldo también piden el segundo factor
begin;
select pg_temp.set_flag('requireMfa', true);
grant select on public.questions, public.review_assignments, public.clinical_cases to authenticated;
select pg_temp.as_user(:'p2', null, 'aal1');
select pg_temp.expect((select count(*) from public.questions) = 0 and (select count(*) from public.clinical_cases) = 0,
  'BE2. Con permisos de tabla, el revisor sin segundo factor leyó preguntas');
select pg_temp.as_user(:'p2', null, 'aal2');
select pg_temp.expect((select count(distinct question_id) from public.questions) = 3,
  'BE2. Con permisos de tabla, el revisor con segundo factor no ve sus 3');
rollback;

-- ===================================================================== BE3. Versiones
select pg_temp.latest(:'q1') as q1v1 \gset
select pg_temp.draft_of(:'q1v1', '{"explanation": ""}')::text as draft_incomplete \gset
begin;
select pg_temp.as_user(:'p1');
select public.editor_save_version(:'q1', :'q1v1', :'draft_incomplete') as r \gset be3_
commit;
select pg_temp.expect((:'be3_r')::jsonb ->> 'status' = 'saved' and ((:'be3_r')::jsonb ->> 'version')::int = 2
  and (:'be3_r')::jsonb -> 'incomplete' = '["explanation_missing"]'::jsonb, 'BE3. No guardó la v2 incompleta');
select (:'be3_r')::jsonb ->> 'versionId' as q1v2 \gset
select pg_temp.expect((select author_id from public.questions where id = :'q1v2') = :'p1'
  and (select version_source from public.questions where id = :'q1v2') = 'app'
  and (select array_agg(option_id order by position) from public.question_options where question_version_id = :'q1v2')
    = (select array_agg(option_id order by position) from public.question_options where question_version_id = :'q1v1'),
  'BE3. La v2 no conservó autor, origen o ids de opción');
begin;
select pg_temp.as_user(:'p1');
select pg_temp.expect(pg_temp.fails_with(format('select public.editor_save_version(%L, %L, %L)', :'q1', :'q1v1', :'draft_incomplete')) = 'BK002',
  'BE3. Guardó sobre una base vieja');
select pg_temp.expect(pg_temp.fails_with(format('select public.editor_save_version(%L, %L, %L)', :'q1', :'q1v2',
  (:'draft_incomplete')::jsonb || '{"branch":"inventada"}')) = '22023', 'BE3. Guardó fuera de la taxonomía');
select pg_temp.expect(pg_temp.fails_with(format('select public.editor_save_version(%L, %L, %L)', :'q1', :'q1v2',
  jsonb_set((:'draft_incomplete')::jsonb, '{options,0,optionId}', to_jsonb(gen_random_uuid())))) = '22023',
  'BE3. Aceptó una opción de otra pregunta');
rollback;
begin;
select pg_temp.as_user(:'p3');
select pg_temp.expect(pg_temp.fails_with(format('select public.editor_save_version(%L, %L, %L)', :'q1', :'q1v2', :'draft_incomplete')) = 'BK007',
  'BE3. Otra médica guardó');
rollback;
begin;
select pg_temp.as_user(:'ad');
select pg_temp.expect(pg_temp.fails_with(format('select public.editor_save_version(%L, %L, %L)', :'q1', :'q1v2', :'draft_incomplete')) = '42501',
  'BE3. El admin guardó contenido');
select pg_temp.expect(pg_temp.fails_with(format('select public.editor_create_question(%L)', :'draft_incomplete')) = '42501',
  'BE3. El admin creó contenido');
rollback;

-- ===================================================================== BE4. A revisión
begin;
select pg_temp.as_user(:'p1');
select pg_temp.expect(pg_temp.fails_with(format('select public.editor_submit(%L)', :'q1v2')) = 'BK005', 'BE4. Mandó a revisión con pendientes');
commit;
select pg_temp.draft_of(:'q1v2', '{"explanation": "[Prueba] Explicación completa"}')::text as draft_complete \gset
begin;
select pg_temp.as_user(:'p1');
select (public.editor_save_version(:'q1', :'q1v2', :'draft_complete')) ->> 'versionId' as q1v3 \gset
commit;
begin;
select pg_temp.as_user(:'p1');
select public.editor_submit(:'q1v3') as r \gset be4_
commit;
select pg_temp.expect((:'be4_r')::jsonb = jsonb_build_object('status', 'in_review', 'versionId', :'q1v3', 'reviewerId', :'p2'),
  'BE4. No pasó a revisión con el revisor');
select pg_temp.expect((select editorial_status from public.questions where id = :'q1v3') = 'in_review', 'BE4. Estado');

-- ===================================================================== BE5. A ciegas
begin;
select pg_temp.as_user(:'p2');
select public.editor_question(:'q1') as r \gset be5_
rollback;
select pg_temp.expect((:'be5_r')::jsonb -> 'review' ->> 'state' = 'blind_pending'
  and jsonb_array_length((:'be5_r')::jsonb -> 'review' -> 'pendingOptionIds') = 3, 'BE5. El revisor no está a ciegas');
select pg_temp.expect((select bool_and(o ->> 'biasTag' is null and o -> 'secondaryBiasTags' = '[]'::jsonb
    and o ->> 'rationale' is null and (o ->> 'hidden')::boolean)
  from jsonb_array_elements((:'be5_r')::jsonb -> 'versions') v, jsonb_array_elements(v -> 'options') o
  where not (o ->> 'isCorrect')::boolean), 'BE5. Se ve lo del autor en algún distractor, también en la historia');
select pg_temp.expect((select bool_and(o ->> 'rationale' is not null and not (o ->> 'hidden')::boolean)
  from jsonb_array_elements((:'be5_r')::jsonb -> 'versions' -> 0 -> 'options') o where (o ->> 'isCorrect')::boolean),
  'BE5. La correcta no se ve');
select pg_temp.expect(jsonb_array_length((:'be5_r')::jsonb -> 'versions') = 3, 'BE5. Faltan versiones en la historia');
select option_id as optb from public.question_options where question_version_id = :'q1v3' and position = 1 \gset
select option_id as optc from public.question_options where question_version_id = :'q1v3' and position = 2 \gset
select option_id as optd from public.question_options where question_version_id = :'q1v3' and position = 3 \gset
begin;
select pg_temp.as_user(:'p2');
select pg_temp.expect(public.editor_label_option(:'q1v3', :'optb', 'anchoring') = '{"done":1,"total":3,"revealed":false}'::jsonb,
  'BE5. Primera etiqueta');
-- La que ya etiquetó deja de estar pendiente aunque no se cierre hasta terminar, así el editor dice 1 de 3
select pg_temp.expect(public.editor_question(:'q1') -> 'review' -> 'pendingOptionIds' = jsonb_build_array(:'optc', :'optd'),
  'BE5. La opción etiquetada sigue pendiente');
-- Antes de terminar puede cambiarla
select pg_temp.expect(public.editor_label_option(:'q1v3', :'optb', 'framing_effect') = '{"done":1,"total":3,"revealed":false}'::jsonb,
  'BE5. Cambiar antes de terminar');
select pg_temp.expect(pg_temp.fails_with(format('select public.editor_label_option(%L, %L, %L)', :'q1v3', :'optc', 'inventado')) = '22023',
  'BE5. Etiqueta inventada');
select public.editor_label_option(:'q1v3', :'optc', 'premature_closure');
select pg_temp.expect(public.editor_label_option(:'q1v3', :'optd', 'framing_effect') = '{"done":3,"total":3,"revealed":true}'::jsonb,
  'BE5. Al terminar no se reveló');
select pg_temp.expect(public.editor_question(:'q1') -> 'review' ->> 'state' = 'ready', 'BE5. No quedó listo');
select pg_temp.expect((select bool_and(o ->> 'biasTag' is not null and not (o ->> 'hidden')::boolean)
  from jsonb_array_elements(public.editor_question(:'q1') -> 'versions' -> 0 -> 'options') o where not (o ->> 'isCorrect')::boolean),
  'BE5. Al terminar no ve lo del autor');
select pg_temp.expect(pg_temp.fails_with(format('select public.editor_label_option(%L, %L, %L)', :'q1v3', :'optb', 'anchoring')) = 'BK004',
  'BE5. Cambió una etiqueta cerrada');
commit;
select pg_temp.expect((select author_tag from public.bias_labels where option_id = :'optb' and labeler_id = :'p2') = 'anchoring'
  and (select tag from public.bias_labels where option_id = :'optb' and labeler_id = :'p2') = 'framing_effect'
  and (select count(*) from public.bias_labels where labeler_id = :'p2' and locked_at is not null) = 3,
  'BE5. Las etiquetas no guardaron la del autor o no se cerraron');
-- Si la reasignan como revisora no etiqueta su propia versión (M5)
begin;
select pg_temp.as_user(:'ad');
select public.admin_assign_questions(array[:'q1']::uuid[], :'p2', :'p1');
select pg_temp.as_user(:'p1');
select pg_temp.expect(pg_temp.fails_with(format('select public.editor_label_option(%L, %L, %L)', :'q1v3', :'optb', 'anchoring')) = 'BK003',
  'BE5. La autora reasignada etiquetó su propia versión');
rollback;
-- La autora ve sus etiquetas siempre
begin;
select pg_temp.as_user(:'p1');
select pg_temp.expect((select bool_and(o ->> 'biasTag' is not null)
  from jsonb_array_elements(public.editor_question(:'q1') -> 'versions' -> 0 -> 'options') o where not (o ->> 'isCorrect')::boolean),
  'BE5. La autora no ve sus etiquetas');
select pg_temp.expect(pg_temp.fails_with(format('select public.editor_label_option(%L, %L, %L)', :'q1v3', :'optb', 'anchoring')) = 'BK007',
  'BE5. La autora etiquetó');
rollback;

-- ===================================================================== BE6. Decisión
select pg_temp.latest(:'q2') as q2v1 \gset
begin;
select pg_temp.as_user(:'p1');
select public.editor_submit(:'q2v1');
commit;
update public.questions set review_flags = '{kind_control_check}' where id = :'q2v1';
begin;
select pg_temp.as_user(:'p2');
select pg_temp.expect(pg_temp.fails_with(format('select public.editor_decide(%L, %L, null, null)', :'q2v1', 'approve')) = 'BK004',
  'BE6. Aprobó sin etiquetar');
select pg_temp.label_all(:'q2', 'anchoring');
select pg_temp.expect(pg_temp.fails_with(format('select public.editor_decide(%L, %L, null, null)', :'q2v1', 'approve')) = 'BK008',
  'BE6. Aprobó sin confirmar la casilla');
commit;
-- El revisor que escribió la versión no la aprueba
update public.questions set author_id = :'p2' where id = :'q2v1';
begin;
select pg_temp.as_user(:'p2');
select pg_temp.expect(pg_temp.fails_with(format('select public.editor_decide(%L, %L, null, %L::text[])', :'q2v1', 'approve', '{kind_control_check}')) = 'BK003',
  'BE6. El autor aprobó su versión');
rollback;
update public.questions set author_id = null where id = :'q2v1';
select coalesce(max(seq), 0) as seq_before from public.question_catalog \gset
begin;
select pg_temp.as_user(:'p1');
select pg_temp.expect(pg_temp.fails_with(format('select public.editor_decide(%L, %L, null, null)', :'q2v1', 'approve')) = 'BK007',
  'BE6. La autora decidió');
rollback;
begin;
select pg_temp.as_user(:'ad');
select pg_temp.expect(pg_temp.fails_with(format('select public.editor_decide(%L, %L, null, null)', :'q2v1', 'approve')) = '42501',
  'BE6. El admin aprobó');
rollback;
begin;
select pg_temp.as_user(:'p2');
select pg_temp.expect(public.editor_decide(:'q2v1', 'approve', null, '{kind_control_check}') = '{"status":"approved","published":true,"waitingCase":false}'::jsonb,
  'BE6. No aprobó');
select pg_temp.expect(pg_temp.fails_with(format('select public.editor_decide(%L, %L, %L, null)', :'q2v1', 'reject', 'otra')) = '22023',
  'BE6. Otra decisión sobre la misma versión');
commit;
select pg_temp.expect((select seq from public.question_catalog where question_id = :'q2') > :'seq_before'
  and (select version_id from public.question_catalog where question_id = :'q2') = :'q2v1', 'BE6. No se publicó con un seq nuevo');
select pg_temp.expect((select count(*) from public.review_decisions where question_version_id = :'q2v1') = 1
  and (select checks from public.review_decisions where question_version_id = :'q2v1') = '{kind_control_check}'
  and (select question_id from public.review_decisions where question_version_id = :'q2v1') = :'q2',
  'BE6. La decisión no quedó registrada');
select pg_temp.expect(pg_temp.fails_with($q$update public.review_decisions set comment = 'editado'$q$) = '42501', 'BE6. Se editó una decisión');
select pg_temp.expect(pg_temp.fails_with(format('insert into public.review_decisions (question_version_id, physician_id, decision) values (%L, %L, %L)',
  :'q2v1', :'p2', 'reject')) = '23505', 'BE6. Dos decisiones del mismo revisor en una versión');
begin;
select pg_temp.as_user(:'p2');
select pg_temp.expect(pg_temp.is_blocked(format('insert into public.review_decisions (question_version_id, physician_id, decision) values (%L, %L, %L)',
  :'q1v3', :'p2', 'approve')), 'BE6. Un médico escribió una decisión directo');
rollback;

-- ===================================================================== BE7. Caso seriado
select pg_temp.bank_case('BE-C1') as case1 \gset
select pg_temp.bank_seed('BE-C1-' || g, 'draft', :'case1', g) from generate_series(1, 3) g;
select array_agg(question_id order by source_key)::text as qcase,
       array_agg(latest_version_id order by source_key)::text as vcase
  from public.bank_questions where source_key like 'sheet:BE-C1-%' \gset
begin;
select pg_temp.as_user(:'ad');
select public.admin_assign_questions(:'qcase'::uuid[], :'p1', :'p2');
commit;
begin;
select pg_temp.as_user(:'p1');
select public.editor_submit(v) from unnest(:'vcase'::uuid[]) v;
commit;
begin;
select pg_temp.as_user(:'p2');
select pg_temp.label_all(q, 'anchoring') from unnest(:'qcase'::uuid[]) q;
select pg_temp.expect(public.editor_decide((:'vcase'::uuid[])[1], 'approve', null, null)
  = '{"status":"approved","published":false,"waitingCase":true}'::jsonb, 'BE7. La primera del caso no esperó');
select pg_temp.expect(public.editor_decide((:'vcase'::uuid[])[2], 'approve', null, null)
  = '{"status":"approved","published":false,"waitingCase":true}'::jsonb, 'BE7. La segunda del caso no esperó');
commit;
select pg_temp.expect((select count(*) from public.question_catalog where case_id = :'case1') = 0, 'BE7. Se publicó medio caso');
begin;
select pg_temp.as_user(:'p2');
select pg_temp.expect(public.editor_decide((:'vcase'::uuid[])[3], 'approve', null, null)
  = '{"status":"approved","published":true,"waitingCase":false}'::jsonb, 'BE7. La tercera no publicó el caso');
commit;
select pg_temp.expect((select count(*) from public.question_catalog where case_id = :'case1' and case_size = 3 and status = 'published') = 3,
  'BE7. No se publicaron las tres juntas');
begin;
select pg_temp.as_user(:'p2');
select pg_temp.expect(public.editor_question((:'qcase'::uuid[])[2]) -> 'case' -> 'members' @>
  jsonb_build_array(jsonb_build_object('questionId', (:'qcase'::uuid[])[1], 'caseOrder', 1, 'status', 'approved')),
  'BE7. editor_question no trae el caso');
rollback;

-- ===================================================================== BE8. Aprobada con versión nueva
select seq as q2seq from public.question_catalog where question_id = :'q2' \gset
select pg_temp.draft_of(:'q2v1', '{"prompt":"[Prueba] ¿Pregunta simulada corregida?"}')::text as draft_q2 \gset
begin;
select pg_temp.as_user(:'p1');
select (public.editor_save_version(:'q2', :'q2v1', :'draft_q2')) ->> 'versionId' as q2v2 \gset
commit;
select pg_temp.expect((select version_id from public.question_catalog where question_id = :'q2') = :'q2v1',
  'BE8. Un borrador sacó del catálogo a la publicada');
begin;
select pg_temp.as_user(:'p1');
select public.editor_submit(:'q2v2');
commit;
-- Las opciones que siguen igual conservan su etiqueta y no se vuelven a pedir
begin;
select pg_temp.as_user(:'p2');
select pg_temp.expect(public.editor_question(:'q2') -> 'review' ->> 'state' = 'ready', 'BE8. Volvió a pedir etiquetas que ya estaban');
select pg_temp.expect((public.editor_decide(:'q2v2', 'approve', null, null) ->> 'published')::boolean, 'BE8. No publicó la v2');
commit;
select pg_temp.expect((select version_id from public.question_catalog where question_id = :'q2') = :'q2v2'
  and (select version from public.question_catalog where question_id = :'q2') = 2
  and (select seq from public.question_catalog where question_id = :'q2') > :'q2seq', 'BE8. La v2 no reemplazó a la v1');

-- ===================================================================== BE9. Pedir cambios y rechazar
begin;
select pg_temp.as_user(:'p2');
select pg_temp.expect(pg_temp.fails_with(format('select public.editor_decide(%L, %L, %L, null)', :'q1v3', 'request_changes', '  ')) = '22023',
  'BE9. Pidió cambios sin comentario');
select pg_temp.expect(public.editor_decide(:'q1v3', 'request_changes', '[Prueba] Corrige la explicación', null) ->> 'status' = 'draft',
  'BE9. Pedir cambios no regresó a borrador');
commit;
select pg_temp.expect((select editorial_status from public.questions where id = :'q1v3') = 'draft'
  and (select comment from public.review_decisions where question_version_id = :'q1v3') = '[Prueba] Corrige la explicación',
  'BE9. Estado y comentario tras pedir cambios');
-- Los cambios van en una versión nueva. La misma versión ya decidida no vuelve a revisión
select pg_temp.draft_of(:'q1v3', '{"explanation": "[Prueba] Explicación corregida"}')::text as draft_q1v4 \gset
begin;
select pg_temp.as_user(:'p1');
select pg_temp.expect(pg_temp.fails_with(format('select public.editor_submit(%L)', :'q1v3')) = '22023', 'BE9. Volvió a revisión sin cambios');
select (public.editor_save_version(:'q1', :'q1v3', :'draft_q1v4')) ->> 'versionId' as q1v4 \gset
select pg_temp.expect(public.editor_submit(:'q1v4') ->> 'status' = 'in_review', 'BE9. La versión corregida no fue a revisión');
commit;
begin;
select pg_temp.as_user(:'p2');
select pg_temp.expect(pg_temp.fails_with(format('select public.editor_decide(%L, %L, null, null)', :'q1v4', 'reject')) = '22023',
  'BE9. Rechazó sin comentario');
select pg_temp.expect(public.editor_decide(:'q1v4', 'reject', '[Prueba] No sirve', null) = '{"status":"rejected","published":false,"waitingCase":false}'::jsonb,
  'BE9. No rechazó');
commit;
select pg_temp.expect((select count(*) from public.review_decisions where question_id = :'q1') = 2
  and not exists (select 1 from public.question_catalog where question_id = :'q1'), 'BE9. Decisiones de q1 o se publicó una rechazada');
-- Rechazar una versión nueva no quita la publicada
select pg_temp.draft_of(:'q2v2', '{"prompt":"[Prueba] ¿Otra pregunta simulada?"}')::text as draft_q2v3 \gset
begin;
select pg_temp.as_user(:'p1');
select (public.editor_save_version(:'q2', :'q2v2', :'draft_q2v3')) ->> 'versionId' as q2v3 \gset
select public.editor_submit(:'q2v3');
commit;
begin;
select pg_temp.as_user(:'p2');
select public.editor_decide(:'q2v3', 'reject', '[Prueba] Se queda la anterior', null);
commit;
select pg_temp.expect((select version_id from public.question_catalog where question_id = :'q2') = :'q2v2', 'BE9. Rechazar quitó la publicada');

-- ===================================================================== BE10. El revisor edita
-- Primero etiqueta a ciegas. En borrador tampoco ve lo del autor ni lo edita (M5 de la revisión)
select pg_temp.latest(:'q3') as q3v1 \gset
select pg_temp.draft_of(:'q3v1', '{"vignette":"[Prueba] Caso editado por el revisor"}')::text as draft_q3 \gset
begin;
select pg_temp.as_user(:'p2');
select pg_temp.expect((select bool_and((o ->> 'hidden')::boolean and o ->> 'biasTag' is null and o ->> 'rationale' is null)
  from jsonb_array_elements(public.editor_question(:'q3') -> 'versions' -> 0 -> 'options') o where not (o ->> 'isCorrect')::boolean),
  'BE10. El revisor vio lo del autor en un borrador');
select pg_temp.expect(pg_temp.fails_with(format('select public.editor_save_version(%L, %L, %L)', :'q3', :'q3v1', :'draft_q3')) = 'BK004',
  'BE10. El revisor editó un borrador sin etiquetar a ciegas');
rollback;
-- La autora la manda, el revisor la etiqueta y ya la puede editar. Su versión va a la autora
begin;
select pg_temp.as_user(:'p1');
select public.editor_submit(:'q3v1');
select pg_temp.as_user(:'p2');
select pg_temp.label_all(:'q3', 'anchoring');
select (public.editor_save_version(:'q3', :'q3v1', :'draft_q3')) ->> 'versionId' as q3v2 \gset
select pg_temp.expect(public.editor_submit(:'q3v2') ->> 'reviewerId' = :'p1', 'BE10. La versión del revisor no fue a la autora');
commit;
select pg_temp.expect(public.bank_assignee(:'q3', 'reviewer') = :'p1' and public.bank_assignee(:'q3', 'author') = :'p2',
  'BE10. No cambiaron los papeles');
-- Sin otro médico, BK003
begin;
select pg_temp.as_user(:'ad');
select public.admin_assign_questions(array[:'q4']::uuid[], null, :'p3');
commit;
select pg_temp.latest(:'q4') as q4v1 \gset
select pg_temp.draft_of(:'q4v1')::text as draft_q4 \gset
begin;
select pg_temp.as_user(:'p3');
select public.editor_submit(:'q4v1');
select pg_temp.label_all(:'q4', 'anchoring');
select (public.editor_save_version(:'q4', :'q4v1', :'draft_q4')) ->> 'versionId' as q4v2 \gset
select pg_temp.expect(pg_temp.fails_with(format('select public.editor_submit(%L)', :'q4v2')) = 'BK003', 'BE10. Sin otro médico no dio BK003');
rollback;

-- ===================================================================== BE11. Reportes
select count(pg_temp.bank_seed('BE-R' || lpad(g::text, 3, '0'))) from generate_series(1, 12) g;
select array_agg(latest_version_id order by source_key)::text as rv from public.bank_questions where source_key like 'sheet:BE-R%' \gset
select study_day()::text as today \gset
begin;
select pg_temp.as_user(:'s1');
select public.report_question(:'q2v2', 'typo') as r \gset be11_
select pg_temp.expect(public.report_question(:'q2v2', 'typo') ->> 'status' = 'duplicate', 'BE11. El repetido no salió como duplicate');
select pg_temp.expect(public.report_question(:'q2v2', 'wrong_key') ->> 'status' = 'created', 'BE11. Otro motivo');
select pg_temp.expect(public.report_question(gen_random_uuid(), 'typo') = '{"status":"not_found","reportId":null}'::jsonb, 'BE11. not_found');
select pg_temp.expect(pg_temp.fails_with(format('select public.report_question(%L, %L)', :'q2v2', 'texto libre')) = '22023', 'BE11. Motivo libre');
commit;
select pg_temp.expect((:'be11_r')::jsonb ->> 'status' = 'created', 'BE11. No creó el reporte');
select pg_temp.expect((select question_id from public.content_reports where id = ((:'be11_r')::jsonb ->> 'reportId')::uuid) = :'q2',
  'BE11. El reporte no apunta a la pregunta');
select pg_temp.expect((select count(*) from public.email_outbox where kind = 'content_report'
    and dedupe_key = 'content_report:' || :'q2' || ':' || :'today' and recipient_user = :'p2') = 1,
  'BE11. No hay un solo correo para el revisor con su clave');
select pg_temp.expect((select data from public.email_outbox where dedupe_key = 'content_report:' || :'q2' || ':' || :'today')
  = jsonb_build_object('questionKey', 'BE-0002', 'reason', 'typo', 'openReports', 1), 'BE11. Los datos del correo no son los esperados');
select pg_temp.expect(not exists (select 1 from public.email_outbox where kind = 'content_report'
  and (data::text like '%' || :'s1' || '%' or data::text like '%[Prueba]%' or data::text like '%@%')), 'BE11. El correo lleva datos del alumno o texto');
-- El reporte 11 del día sale limit
begin;
select pg_temp.as_user(:'s1');
select count(public.report_question(v, 'outdated')) from unnest((:'rv'::uuid[])[1:8]) v;
select pg_temp.expect((select count(*) from public.content_reports where reporter_id = auth.uid()) = 10, 'BE11. No llegó a 10');
select pg_temp.expect(public.report_question((:'rv'::uuid[])[9], 'outdated') = '{"status":"limit","reportId":null}'::jsonb,
  'BE11. El reporte 11 no salió limit');
commit;
-- Sin médico asignado va al equipo
select pg_temp.expect((select count(*) from public.email_outbox where kind = 'content_report' and recipient_role = 'team'
  and dedupe_key like 'content_report:%') >= 8, 'BE11. Sin médico no fue al equipo');
-- Una inserción directa también pasa por el guardián
begin;
select pg_temp.as_user(:'s2');
insert into public.content_reports (reporter_id, target_kind, target_id, reason) values (auth.uid(), 'question', :'q2v2', 'clinical_error');
insert into public.content_reports (reporter_id, target_kind, target_id, reason) values (auth.uid(), 'question', :'q2v2', 'clinical_error');
select pg_temp.expect((select count(*) from public.content_reports where reporter_id = auth.uid()) = 1, 'BE11. La inserción directa duplicó');
select pg_temp.expect(pg_temp.is_blocked($q$update public.content_reports set status = 'resolved'$q$), 'BE11. Un alumno resolvió su reporte');
commit;
select pg_temp.expect((select question_id from public.content_reports where reporter_id = :'s2') = :'q2', 'BE11. La inserción directa no llenó la pregunta');
select pg_temp.expect((select count(*) from public.email_outbox where dedupe_key = 'content_report:' || :'q2' || ':' || :'today') = 1,
  'BE11. Dos correos por la misma pregunta y día');
-- El revisor resuelve y otra médica no lo ve
select id as rep1 from public.content_reports where id = ((:'be11_r')::jsonb ->> 'reportId')::uuid \gset
begin;
select pg_temp.as_user(:'p3');
select pg_temp.expect(public.editor_reports('all') = '[]'::jsonb, 'BE11. Otra médica ve el reporte');
select pg_temp.expect(public.editor_set_report_status(array[:'rep1']::uuid[], 'resolved') = 0, 'BE11. Otra médica resolvió');
rollback;
begin;
select pg_temp.as_user(:'p2');
select pg_temp.expect(jsonb_array_length(public.editor_reports('open')) = 3, 'BE11. El revisor no ve los 3 reportes abiertos');
select pg_temp.expect(position(:'s1' in public.editor_reports('all')::text) = 0, 'BE11. editor_reports trae al alumno');
select pg_temp.expect(public.editor_set_report_status(array[:'rep1']::uuid[], 'resolved') = 1, 'BE11. No resolvió');
commit;
select pg_temp.expect((select resolved_at is not null and resolved_by = :'p2' from public.content_reports where id = :'rep1'),
  'BE11. No quedó quién y cuándo');

-- ===================================================================== BE12. Distractores
select option_id as q2b from public.question_options where question_version_id = :'q2v2' and position = 1 \gset
select option_id as q2c from public.question_options where question_version_id = :'q2v2' and position = 2 \gset
select option_id as q2d from public.question_options where question_version_id = :'q2v2' and position = 3 \gset
begin;
select pg_temp.as_service();
select pg_temp.expect(public.upsert_distractor_stats(jsonb_build_array(
  jsonb_build_object('questionVersionId', :'q2v2', 'optionId', :'q2b', 'exposures', 140, 'choices', 3),
  jsonb_build_object('questionVersionId', :'q2v2', 'optionId', :'q2c', 'exposures', 99, 'choices', 0),
  jsonb_build_object('questionVersionId', :'q2v2', 'optionId', :'q2d', 'exposures', 200, 'choices', 10))) = 1,
  'BE12. No marcó solo el distractor con 100 o más y menos de 5%');
commit;
select pg_temp.expect((select attraction from public.distractor_flags where option_id = :'q2b') = 0.0214, 'BE12. Atracción');
begin;
select pg_temp.as_user(:'p2');
select pg_temp.expect(pg_temp.is_blocked('select public.upsert_distractor_stats(''[]'')'), 'BE12. Un médico mandó estadísticas');
select pg_temp.expect(jsonb_array_length(public.editor_distractor_queue()) = 1, 'BE12. El revisor no ve la marca');
rollback;
select id as flag1 from public.distractor_flags where option_id = :'q2b' \gset
begin;
select pg_temp.as_user(:'p3');
select pg_temp.expect(public.editor_distractor_queue() = '[]'::jsonb, 'BE12. Otra médica ve la marca');
select pg_temp.expect(pg_temp.fails_with(format('select public.editor_resolve_distractor(%L, %L)', :'flag1', 'kept')) = 'BK007', 'BE12. Otra médica resolvió');
rollback;
begin;
select pg_temp.as_user(:'p2');
select pg_temp.expect(public.editor_resolve_distractor(:'flag1', 'kept', '[Prueba] Se queda') = 'kept', 'BE12. No resolvió');
commit;
select pg_temp.expect((select status = 'kept' and resolved_by = :'p2' and resolved_at is not null from public.distractor_flags where id = :'flag1'),
  'BE12. No guardó quién y cuándo');
-- Una marca atendida conserva su estado aunque lleguen cifras nuevas
begin;
select pg_temp.as_service();
select public.upsert_distractor_stats(jsonb_build_array(
  jsonb_build_object('questionVersionId', :'q2v2', 'optionId', :'q2b', 'exposures', 300, 'choices', 6)));
commit;
select pg_temp.expect((select status = 'kept' and exposures = 300 from public.distractor_flags where id = :'flag1'), 'BE12. Reabrió la marca');

-- ===================================================================== BE13. Kappa
-- Los mismos pares que tests/content/kappaParity.test.ts. Se quitan las etiquetas de las pruebas de
-- arriba solo dentro de la transacción
begin;
delete from public.bias_labels;
insert into public.bias_labels (option_id, labeler_id, question_version_id, tag, author_tag, locked_at)
  select gen_random_uuid(), :'p3', :'q2v2', p.tag, p.author_tag, now()
  from (values ('anchoring', 'anchoring', 10), ('premature_closure', 'premature_closure', 9), ('framing_effect', 'framing_effect', 8),
               ('anchoring', 'premature_closure', 1), ('premature_closure', 'framing_effect', 1), ('framing_effect', 'anchoring', 1))
    as p (author_tag, tag, n), generate_series(1, p.n);
select pg_temp.as_user(:'s1');
select pg_temp.expect(public.bias_agreement_summary() = '{"pairs":30,"kappa":0.849498,"vocabulary":"bias","calibrating":false,"minPairs":30,"minKappa":0.4}'::jsonb,
  'BE13. 30 pares con mucho acuerdo no dieron sesgos');
rollback;
begin;
delete from public.bias_labels;
insert into public.bias_labels (option_id, labeler_id, question_version_id, tag, author_tag, locked_at)
  select gen_random_uuid(), :'p3', :'q2v2', p.tag, p.author_tag, now()
  from (values ('anchoring', 'anchoring', 10), ('premature_closure', 'premature_closure', 9), ('framing_effect', 'framing_effect', 7),
               ('anchoring', 'premature_closure', 1), ('premature_closure', 'framing_effect', 1), ('framing_effect', 'anchoring', 1))
    as p (author_tag, tag, n), generate_series(1, p.n);
-- Una etiqueta sin cerrar no cuenta
insert into public.bias_labels (option_id, labeler_id, question_version_id, tag, author_tag)
  values (gen_random_uuid(), :'p3', :'q2v2', 'anchoring', 'anchoring');
select pg_temp.as_user(:'s1');
select pg_temp.expect(public.bias_agreement_summary() = '{"pairs":29,"kappa":0.843525,"vocabulary":"trap","calibrating":true,"minPairs":30,"minKappa":0.4}'::jsonb,
  'BE13. 29 pares no dieron calibrando y trampas');
rollback;
begin;
delete from public.bias_labels;
insert into public.bias_labels (option_id, labeler_id, question_version_id, tag, author_tag, locked_at)
  select gen_random_uuid(), :'p3', :'q2v2', p.tag, p.author_tag, now()
  from (values ('anchoring', 'anchoring', 6), ('premature_closure', 'premature_closure', 5), ('framing_effect', 'framing_effect', 4),
               ('anchoring', 'premature_closure', 5), ('premature_closure', 'framing_effect', 5), ('framing_effect', 'anchoring', 5))
    as p (author_tag, tag, n), generate_series(1, p.n);
select pg_temp.as_user(:'p2');
select pg_temp.expect(public.bias_agreement_summary() = '{"pairs":30,"kappa":0.247492,"vocabulary":"trap","calibrating":false,"minPairs":30,"minKappa":0.4}'::jsonb,
  'BE13. 30 pares con poco acuerdo no dieron trampas');
select pg_temp.expect((select count(*) from public.editor_label_pairs()) = 30, 'BE13. editor_label_pairs no trae los 30 pares');
-- Quien escribió la versión no cuenta como revisor de sí mismo, aunque lo hayan reasignado (M5)
reset role;
insert into public.bias_labels (option_id, labeler_id, question_version_id, tag, author_tag, locked_at)
  values (gen_random_uuid(), :'p1', :'q1v3', 'anchoring', 'anchoring', now());
select pg_temp.as_user(:'p2');
select pg_temp.expect((select count(*) from public.editor_label_pairs()) = 30
  and (public.bias_agreement_summary() ->> 'pairs')::int = 30, 'BE13. Contó el par de la autora consigo misma');
rollback;
-- Los umbrales del admin mandan
begin;
insert into public.platform_settings (key, value) values ('admin_overrides', '{"thresholds":{"bias":{"minLabeledPairs":3,"minKappaForBiasLanguage":0.1}}}')
  on conflict (key) do update set value = excluded.value;
select pg_temp.as_user(:'s1');
select pg_temp.expect((public.bias_agreement_summary() ->> 'minPairs')::int = 3 and (public.bias_agreement_summary() ->> 'minKappa')::numeric = 0.1,
  'BE13. No leyó los umbrales del admin');
rollback;
begin;
select pg_temp.as_user(:'s1');
select pg_temp.expect(pg_temp.fails_with('select * from public.editor_label_pairs()') = '42501', 'BE13. Un alumno leyó los pares');
rollback;

-- ===================================================================== BE14. Retirar y restaurar
select seq as seq_pub from public.question_catalog where question_id = :'q2' \gset
begin;
select pg_temp.as_user(:'p2');
select pg_temp.expect(pg_temp.fails_with(format('select public.admin_retire_question(%L, null)', :'q2')) = '42501', 'BE14. Un médico retiró');
rollback;
begin;
select pg_temp.as_user(:'ad');
select pg_temp.expect(public.admin_retire_question(:'q2', '[Prueba] Retiro') = 'retired', 'BE14. No retiró');
commit;
select seq as seq_ret from public.question_catalog where question_id = :'q2' \gset
select pg_temp.expect(:'seq_ret'::bigint > :'seq_pub'::bigint
  and (select status from public.question_catalog where question_id = :'q2') = 'retired', 'BE14. El retiro no subió el seq');
begin;
select pg_temp.as_user(:'s1');
select pg_temp.expect(public.fetch_questions(array[:'q2']::uuid[]) -> 'denied' -> 0 ->> 'reason' = 'retired', 'BE14. El alumno leyó una retirada');
select pg_temp.expect(public.catalog_changes(:'seq_pub') -> 'rows' @> jsonb_build_array(jsonb_build_object('questionId', :'q2', 'status', 'retired')),
  'BE14. El catálogo no dice retirada');
rollback;
begin;
select pg_temp.as_user(:'ad');
select pg_temp.expect(public.admin_restore_question(:'q2') = 'restored', 'BE14. No restauró');
commit;
select pg_temp.expect((select seq from public.question_catalog where question_id = :'q2') > :'seq_ret'::bigint
  and (select status from public.question_catalog where question_id = :'q2') = 'published', 'BE14. Restaurar no subió el seq');
begin;
select pg_temp.as_user(:'s1');
select pg_temp.expect(jsonb_array_length(public.fetch_questions(array[:'q2']::uuid[]) -> 'questions') = 1, 'BE14. No volvió para el alumno');
rollback;

-- ===================================================================== Permisos de las funciones
do $$
declare
  internal text[] := array[
    'public.bank_team_role()', 'public.bank_assignee(uuid, text)', 'public.bank_assigned_physician(uuid)',
    'public.bank_can_see(uuid)', 'public.bank_person(uuid)', 'public.bank_question_key(uuid)',
    'public.bank_review_state(uuid, uuid)', 'public.bank_reviewer_blind(uuid, uuid)', 'public.bank_list_item(uuid, uuid)',
    'public.bank_version_json(uuid, boolean)',
    'public.bank_check_content(jsonb)', 'public.bank_insert_version(uuid, jsonb, text, uuid, uuid, integer, uuid, text[], text[])',
    'public.bank_draft_content(jsonb, uuid)', 'public.bank_save_result(uuid)', 'public.bank_threshold(text, text, numeric)',
    'public.bank_assign(uuid, text, uuid, uuid)', 'public.bank_send_to_review(uuid, uuid)', 'public.bank_require_admin()',
    'public.bank_pay_rate()', 'public.content_reports_guard()', 'public.content_reports_notify()'];
  team text[] := array[
    'public.report_question(uuid, text)', 'public.bias_agreement_summary()', 'public.editor_list(jsonb, integer, integer)',
    'public.editor_question(uuid)', 'public.editor_create_question(jsonb, uuid)', 'public.editor_save_version(uuid, uuid, jsonb)',
    'public.editor_submit(uuid)', 'public.editor_label_option(uuid, uuid, text)', 'public.editor_decide(uuid, text, text, text[])',
    'public.editor_reports(text, integer, integer)', 'public.editor_set_report_status(uuid[], text)',
    'public.editor_distractor_queue(text)', 'public.editor_resolve_distractor(uuid, text, text)', 'public.editor_label_pairs()',
    'public.editor_my_reviews(date, date)', 'public.editor_resolve_sync_conflict(uuid, text)', 'public.admin_bank_overview()',
    'public.admin_assign_questions(uuid[], uuid, uuid)', 'public.admin_set_topic_reviewer(text, text, uuid)',
    'public.admin_set_physician_code(uuid, text)', 'public.admin_retire_question(uuid, text)',
    'public.admin_restore_question(uuid)', 'public.admin_confirm_missing(uuid[], text)', 'public.admin_bank_read_alerts(integer)',
    'public.admin_review_report(date, date)', 'public.admin_review_report_detail(date, date, uuid)',
    'public.admin_bank_team()', 'public.admin_bank_settings()', 'public.admin_save_bank_settings(jsonb, jsonb)'];
  f text;
  r text;
begin
  foreach f in array internal loop
    foreach r in array array['anon', 'authenticated', 'service_role'] loop
      if has_function_privilege(r, f, 'execute') then raise exception 'FALLA BE. % ejecuta la ayuda interna %', r, f; end if;
    end loop;
  end loop;
  foreach f in array team loop
    if not has_function_privilege('authenticated', f, 'execute') or has_function_privilege('anon', f, 'execute')
       or has_function_privilege('service_role', f, 'execute') then
      raise exception 'FALLA BE. Permisos de %', f;
    end if;
  end loop;
  if not has_function_privilege('service_role', 'public.upsert_distractor_stats(jsonb)', 'execute')
     or has_function_privilege('authenticated', 'public.upsert_distractor_stats(jsonb)', 'execute') then
    raise exception 'FALLA BE. upsert_distractor_stats es solo del servidor';
  end if;
  foreach f in array array['public.bank_topic_reviewers', 'public.physician_codes', 'public.bias_labels', 'public.distractor_flags'] loop
    foreach r in array array['anon', 'authenticated', 'service_role'] loop
      if has_table_privilege(r, f, 'select') or has_table_privilege(r, f, 'insert') then
        raise exception 'FALLA BE. % tiene permisos sobre %', r, f;
      end if;
    end loop;
  end loop;
end $$;

-- ===================================================================== BE9. Nivel cognitivo (V4-B5)
-- El borrador del editor lleva el nivel a la versión nueva, y cada versión lo dice en editor_question. Sin
-- nivel es null y la versión de antes no cambia. Un nivel fuera de la lista de Bloom lanza 22023
select pg_temp.bank_seed('BE-COG1', 'draft') as cog_q \gset
select pg_temp.latest(:'cog_q') as cog_v1 \gset
begin;
select pg_temp.as_user(:'ad');
select public.admin_assign_questions(array[:'cog_q']::uuid[], :'p1', :'p2');
commit;
select pg_temp.expect((select cognitive_level from public.questions where id = :'cog_v1') is null,
  'BE9. La versión sembrada sin nivel quedó con nivel');
select pg_temp.expect(public.bank_draft_content(pg_temp.draft_of(:'cog_v1', '{"cognitiveLevel":"synthesis"}'), :'cog_q')
  ->> 'cognitiveLevel' = 'synthesis', 'BE9. El borrador no llevó el nivel a la forma interna');
select pg_temp.expect(public.bank_draft_content(pg_temp.draft_of(:'cog_v1'), :'cog_q') ->> 'cognitiveLevel' is null,
  'BE9. Un borrador sin nivel llegó con nivel');
select pg_temp.draft_of(:'cog_v1', '{"cognitiveLevel":"synthesis"}')::text as cog_draft \gset
begin;
select pg_temp.as_user(:'p1');
select (public.editor_save_version(:'cog_q', :'cog_v1', :'cog_draft')) ->> 'versionId' as cog_v2 \gset
commit;
select pg_temp.expect((select cognitive_level from public.questions where id = :'cog_v2') = 'synthesis',
  'BE9. Guardar no dejó el nivel en la versión');
begin;
select pg_temp.as_user(:'p1');
select pg_temp.expect((select v ->> 'cognitiveLevel' from jsonb_array_elements(public.editor_question(:'cog_q') -> 'versions') v
  where v ->> 'versionId' = :'cog_v2') = 'synthesis', 'BE9. El editor no recibió el nivel de la versión nueva');
select pg_temp.expect((select v -> 'cognitiveLevel' from jsonb_array_elements(public.editor_question(:'cog_q') -> 'versions') v
  where v ->> 'versionId' = :'cog_v1') = 'null'::jsonb, 'BE9. La versión anterior debía decir null');
rollback;
-- Quitar el nivel en el editor crea otra versión sin nivel, porque las versiones no se editan
select pg_temp.draft_of(:'cog_v2', '{"cognitiveLevel":null}')::text as cog_draft_none \gset
begin;
select pg_temp.as_user(:'p1');
select (public.editor_save_version(:'cog_q', :'cog_v2', :'cog_draft_none')) ->> 'versionId' as cog_v3 \gset
commit;
select pg_temp.expect((select cognitive_level from public.questions where id = :'cog_v3') is null
  and (select cognitive_level from public.questions where id = :'cog_v2') = 'synthesis',
  'BE9. Quitar el nivel cambió la versión anterior o no dejó la nueva sin nivel');
-- Un nivel inventado no se guarda
select pg_temp.draft_of(:'cog_v3', '{"cognitiveLevel":"dificil"}')::text as cog_draft_bad \gset
begin;
select pg_temp.as_user(:'p1');
select pg_temp.expect(pg_temp.fails_with(format('select public.editor_save_version(%L, %L, %L)', :'cog_q', :'cog_v3', :'cog_draft_bad')) = '22023',
  'BE9. Guardó un nivel inventado');
rollback;

\echo 'TODAS LAS PRUEBAS DEL FLUJO EDITORIAL DEL BANCO PASARON'
