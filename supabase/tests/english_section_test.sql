-- Pruebas de Inglés médico en el servidor (B13, migración 20261027000001, 6.1 del plan de B13). La
-- taxonomía, los pendientes de una versión en inglés (fuente y licencia del texto), el idioma que tiene que
-- ir con la rama, el flujo completo de un caso de lectura, su lectura con el tope de Gratis, la paridad con
-- passageSource.ts y los permisos. Corre sobre la base migrada después de las demás pruebas, con usuarios
-- propios que empiezan con ee. Los de B11 (bank_core_test y bank_editorial_test) corren sin cambios antes
-- que esta, como prueba de que nada del español se rompió. Todo el texto es simulado.
-- supabase/tests/run.sh exporta PASSAGE_SOURCES_FILE con la ruta de tests/fixtures/passage-sources.json
\set ON_ERROR_STOP on
\ir bank_helpers.sql

\set p1 'ee000000-0000-0000-0000-0000000000d1'
\set p2 'ee000000-0000-0000-0000-0000000000d2'
\set s1 'ee000000-0000-0000-0000-0000000000a1'
\set f2 'ee000000-0000-0000-0000-0000000000f2'
\set f3 'ee000000-0000-0000-0000-0000000000f3'
\set ad 'ee000000-0000-0000-0000-0000000000e1'

insert into auth.users (id, email, raw_user_meta_data) values
  (:'p1', 'ee-p1@x.mx', '{"alias":"Autora inglés"}'),
  (:'p2', 'ee-p2@x.mx', '{"alias":"Revisor inglés"}'),
  (:'s1', 'ee-s1@x.mx', '{"alias":"Alumno de pago"}'),
  (:'f2', 'ee-f2@x.mx', '{"alias":"Gratis dos"}'),
  (:'f3', 'ee-f3@x.mx', '{"alias":"Gratis tres"}'),
  (:'ad', 'ee-ad@x.mx', '{"alias":"Admin inglés"}');
update public.user_roles set role = 'physician' where user_id in (:'p1', :'p2');
update public.user_roles set role = 'admin' where user_id = :'ad';
insert into public.subscriptions (user_id, plan, status, provider, current_period_end)
  values (:'s1', 'monthly', 'active', 'stripe', now() + interval '20 days');
select pg_temp.set_flag('cloudBank', true);

-- El contenido de una versión en inglés, en la forma interna de bank_insert_version. p_refs son los
-- títulos de las referencias, la fuente del texto va como la primera. Por omisión es de Inglés médico
create or replace function pg_temp.en_content(
  p_n integer, p_refs text[], p_branch text default 'medical_english', p_topic text default 'reading_comprehension',
  p_subtopic text default 'english_pediatrics', p_language text default 'en', p_format text default 'clinical_case'
) returns jsonb language sql as $$
  select pg_temp.bank_content(p_n, 4, p_branch, p_topic, p_subtopic, p_format) || jsonb_build_object(
    'language', p_language, 'task', 'data_interpretation',
    'vignette', '[Prueba] Simulated passage ' || p_n,
    'prompt', '[Prueba] Which statement does the passage support?',
    'gpcRefs', (select coalesce(jsonb_agg(jsonb_build_object('title', r, 'status', 'to_verify') order by ord), '[]'::jsonb)
      from unnest(p_refs) with ordinality as x (r, ord)))
$$;

-- Una versión suelta, sin registro, para revisar sus pendientes
create or replace function pg_temp.en_version(p_key text, p_content jsonb) returns uuid language sql as $$
  select public.bank_insert_version(public.stable_bank_uuid('test-en', p_key), p_content, 'sheet', null, null, null, null, '{}')
$$;

-- Los pendientes de una versión nueva. Se lee en otra sentencia que la inserta, porque bank_version_issues
-- es stable y no ve lo que escribe una función volátil en la misma sentencia
create or replace function pg_temp.en_issues(p_key text, p_content jsonb) returns text[] language plpgsql as $$
declare
  v_version uuid;
begin
  v_version := pg_temp.en_version(p_key, p_content);
  return public.bank_version_issues(v_version);
end $$;

-- Siembra una pregunta en inglés de un caso seriado, ya aprobada y publicada. Devuelve el id estable
create or replace function pg_temp.en_seed(p_key text, p_case uuid, p_order integer, p_refs text[]) returns uuid language plpgsql as $$
declare
  v_question uuid := public.stable_bank_uuid('test-q', p_key);
  v_version uuid;
begin
  v_version := public.bank_insert_version(
    v_question, pg_temp.en_content(abs(hashtext(p_key)) % 1000, p_refs, p_format => 'serial_case'),
    'sheet', null, p_case, p_order, null, '{}');
  insert into public.bank_questions (question_id, origin, source_key, latest_version_id)
    values (v_question, 'sheet', 'sheet:' || p_key, v_version)
    on conflict (question_id) do update set latest_version_id = excluded.latest_version_id, updated_at = now();
  update public.questions set editorial_status = 'approved', decided_at = now() where id = v_version;
  perform public.bank_publish(v_question);
  return v_question;
end $$;

-- Los casos de la lista compartida con passageSource.ts cuya respuesta de la función SQL no coincide
create or replace function pg_temp.parity_failures(p_fixture jsonb) returns text language sql as $$
  select coalesce(string_agg(c ->> 'name', ' | '), '')
  from jsonb_array_elements(p_fixture -> 'cases') c
  where coalesce(public.bank_passage_source_issue((
      select coalesce(jsonb_agg(jsonb_build_object('title', r, 'status', 'to_verify') order by ord), '[]'::jsonb)
      from jsonb_array_elements_text(c -> 'refs') with ordinality as x (r, ord)
    )), 'ok') is distinct from coalesce(c ->> 'issue', 'ok')
$$;

\set src_ok 'Fuente del texto. [Prueba] Texto simulado. CC BY. https://example.org/texto'

-- ===================================================================== EN1. Taxonomía
select pg_temp.expect(
  (select count(*) from public.bank_taxonomy where branch = 'medical_english' and topic = 'medical_vocabulary'
    and subtopic = 'english_terms' and section = 'english') = 1,
  'EN1. medical_vocabulary no quedó sembrado en la sección english');
select pg_temp.expect(
  (select count(*) from public.bank_taxonomy where branch = 'medical_english') = 8
  and (select count(*) from public.bank_taxonomy where branch = 'medical_english' and topic = 'reading_comprehension') = 7,
  'EN1. Inglés médico no trae sus 7 subtemas de lectura y el de vocabulario');
select pg_temp.expect(
  public.bank_taxonomy_has('medical_english', 'reading_comprehension', 'english_internal_medicine')
  and public.bank_taxonomy_has('medical_english', 'reading_comprehension', 'english_public_health')
  and public.bank_taxonomy_has('medical_english', 'medical_vocabulary', 'english_terms')
  and not public.bank_taxonomy_has('pediatrics', 'medical_vocabulary', 'english_terms')
  and not public.bank_taxonomy_has('medical_english', 'medical_vocabulary', 'english_internal_medicine'),
  'EN1. bank_taxonomy_has no acepta Inglés médico con sus temas y subtemas');

-- ===================================================================== EN2. Español sin cambios
select pg_temp.en_version('es-ok', pg_temp.bank_content(1)) as v_es_ok \gset
select pg_temp.expect(public.bank_version_issues(:'v_es_ok') = '{}', 'EN2. Una versión en español completa dejó de estar completa');
select pg_temp.en_version('es-bad', pg_temp.bank_content(2) || '{"explanation": "", "gpcRefs": []}') as v_es_bad \gset
update public.question_options set rationale = '' where question_version_id = :'v_es_bad' and position = 1;
update public.question_options set bias_tag = null where question_version_id = :'v_es_bad' and position = 2;
select pg_temp.expect(public.bank_version_issues(:'v_es_bad') = '{explanation_missing,references_missing,rationale_missing:B,bias_missing:C}',
  'EN2. Los pendientes de una versión en español cambiaron');
-- Una referencia que parece fuente, o con una licencia mala, no importa en español
select pg_temp.en_version('es-source', pg_temp.bank_content(3)
  || jsonb_build_object('gpcRefs', jsonb_build_array(jsonb_build_object('title', 'Fuente del texto. X. CC BY-NC. https://example.org/x', 'status', 'to_verify')))) as v_es_src \gset
select pg_temp.expect(public.bank_version_issues(:'v_es_src') = '{}', 'EN2. Una versión en español pidió fuente del texto');
select pg_temp.expect(
  public.bank_incomplete_of('{prompt_missing,options_count,correct_count,canonical_invalid,task_undetected,explanation_missing,rationale_missing:B}'::text[])
    = '{task_undetected,explanation_missing,rationale_missing:B}'
  and public.bank_incomplete_of('{language_branch_mismatch,passage_source_missing,license_not_allowed}'::text[])
    = '{passage_source_missing,license_not_allowed}'
  and public.bank_incomplete_of(null) = '{}',
  'EN2. bank_incomplete_of no separa bien la estructura');

-- ===================================================================== EN3. Inglés completo
-- Con fuente válida y CC BY no tiene pendientes, se manda a revisión, se aprueba y se publica en inglés
select pg_temp.en_version('en-ok', pg_temp.en_content(10, array[:'src_ok'])) as v_en_ok \gset
select pg_temp.expect(public.bank_version_issues(:'v_en_ok') = '{}', 'EN3. Una versión en inglés con fuente CC BY tiene pendientes');
select pg_temp.expect(public.bank_refresh_incomplete(:'v_en_ok') = '{}', 'EN3. bank_refresh_incomplete dejó pendientes');
select pg_temp.expect(
  pg_temp.en_issues('en-ok-guia', pg_temp.en_content(11, array[:'src_ok', '[Prueba] Guía simulada'])) = '{}'
  and pg_temp.en_issues('en-ok-solo',
    pg_temp.en_content(12, array['Fuente del texto. Texto propio del equipo Studiare.'])) = '{}'
  and pg_temp.en_issues('en-ok-guia-primero',
    pg_temp.en_content(13, array['[Prueba] Guía simulada', :'src_ok'])) = '{}',
  'EN3. La fuente sola, con una guía o detrás de una guía dejó pendientes');

select jsonb_build_object(
  'branch', 'medical_english', 'topic', 'reading_comprehension', 'subtopic', 'english_pediatrics',
  'physicianDifficulty', 3, 'itemKinds', '[]'::jsonb,
  'structure', jsonb_build_object('polarity', 'affirmative', 'task', 'data_interpretation', 'format', 'clinical_case'),
  'language', 'en', 'vignette', '[Prueba] Simulated passage for the editor',
  'prompt', '[Prueba] Which statement does the passage support?', 'explanation', '[Prueba] Explicación simulada',
  'gpcRefs', jsonb_build_array(jsonb_build_object('title', :'src_ok', 'status', 'to_verify')),
  'clues', '[]'::jsonb, 'options', pg_temp.bank_content(20) -> 'options')::text as draft_en \gset
begin;
select pg_temp.as_user(:'p1');
select public.editor_create_question(:'draft_en') as r \gset en3_
commit;
select (:'en3_r')::jsonb ->> 'questionId' as q_en3 \gset
select (:'en3_r')::jsonb ->> 'versionId' as v_en3 \gset
select pg_temp.expect((:'en3_r')::jsonb -> 'incomplete' = '[]'::jsonb, 'EN3. El editor guardó el caso en inglés con pendientes');
select pg_temp.expect((select language from public.questions where id = :'v_en3') = 'en'
  and (select body -> 'gpcRefs' -> 0 ->> 'title' from public.questions where id = :'v_en3') = :'src_ok',
  'EN3. La versión no guardó el idioma o la fuente como primera referencia');
begin;
select pg_temp.as_user(:'ad');
select public.admin_assign_questions(array[:'q_en3']::uuid[], null, :'p2');
commit;
begin;
select pg_temp.as_user(:'p1');
select pg_temp.expect(public.editor_submit(:'v_en3') ->> 'status' = 'in_review', 'EN3. No mandó a revisión el caso en inglés');
commit;
begin;
select pg_temp.as_user(:'p2');
select pg_temp.label_all(:'q_en3', 'belief_bias');
select pg_temp.expect(public.editor_decide(:'v_en3', 'approve', null, null) = '{"status":"approved","published":true,"waitingCase":false}'::jsonb,
  'EN3. No aprobó ni publicó el caso en inglés');
commit;
select pg_temp.expect((select language from public.question_catalog where question_id = :'q_en3') = 'en'
  and (select branch || '/' || topic || '/' || subtopic from public.question_catalog where question_id = :'q_en3')
    = 'medical_english/reading_comprehension/english_pediatrics'
  and (select status from public.question_catalog where question_id = :'q_en3') = 'published',
  'EN3. El catálogo no trae la pregunta publicada con language en');

-- ===================================================================== EN4. Sin fuente
select pg_temp.en_version('en-sin', pg_temp.en_content(30, array['[Prueba] Guía simulada'])) as v_en_sin \gset
select pg_temp.expect(public.bank_version_issues(:'v_en_sin') = '{passage_source_missing}'
  and public.bank_refresh_incomplete(:'v_en_sin') = '{passage_source_missing}',
  'EN4. Sin fuente no queda passage_source_missing en incomplete');
select pg_temp.expect(
  pg_temp.en_issues('en-sin-refs', pg_temp.en_content(31, array[]::text[])) = '{references_missing,passage_source_missing}'
  and pg_temp.en_issues('en-solo-titulo',
    pg_temp.en_content(32, array['Fuente del texto. [Prueba] Texto simulado'])) = '{passage_source_missing}',
  'EN4. Sin referencias o con la fuente sin licencia no quedan los pendientes');
select pg_temp.expect(
  pg_temp.en_issues('en-sin-orden', pg_temp.en_content(33, array[]::text[]) || '{"explanation": ""}')
    = '{explanation_missing,references_missing,passage_source_missing}',
  'EN4. La fuente no va después de la explicación y las referencias');
-- El editor la guarda con el pendiente y no la deja mandar a revisión
select jsonb_set(:'draft_en'::jsonb, '{gpcRefs}', '[]'::jsonb)::text as draft_sin \gset
begin;
select pg_temp.as_user(:'p1');
select public.editor_create_question(:'draft_sin') as r \gset en4_
commit;
select (:'en4_r')::jsonb ->> 'questionId' as q_en4 \gset
select (:'en4_r')::jsonb ->> 'versionId' as v_en4 \gset
select pg_temp.expect((:'en4_r')::jsonb -> 'incomplete' = '["references_missing","passage_source_missing"]'::jsonb,
  'EN4. El editor no guardó el caso sin fuente con sus pendientes');
begin;
select pg_temp.as_user(:'ad');
select public.admin_assign_questions(array[:'q_en4']::uuid[], null, :'p2');
commit;
begin;
select pg_temp.as_user(:'p1');
select pg_temp.expect(pg_temp.fails_with(format('select public.editor_submit(%L)', :'v_en4')) = 'BK005', 'EN4. Mandó a revisión un caso sin fuente');
rollback;

-- ===================================================================== EN5. Licencia fuera de la lista
select pg_temp.expect(
  pg_temp.en_issues('en-nc', pg_temp.en_content(40,
    array['Fuente del texto. [Prueba] Texto. CC BY-NC. https://example.org/texto'])) = '{license_not_allowed}'
  and pg_temp.en_issues('en-nd', pg_temp.en_content(41,
    array['Fuente del texto. [Prueba] Texto. CC BY-ND. https://example.org/texto'])) = '{license_not_allowed}'
  and pg_temp.en_issues('en-reservados', pg_temp.en_content(42,
    array['Fuente del texto. [Prueba] Texto. Todos los derechos reservados. https://example.org/texto'])) = '{license_not_allowed}'
  and pg_temp.en_issues('en-version', pg_temp.en_content(43,
    array['Fuente del texto. [Prueba] Texto. CC BY 4.0. https://example.org/texto'])) = '{license_not_allowed}',
  'EN5. Una licencia fuera de la lista no deja license_not_allowed');
select jsonb_set(:'draft_en'::jsonb, '{gpcRefs}', jsonb_build_array(jsonb_build_object(
  'title', 'Fuente del texto. [Prueba] Texto. CC BY-NC. https://example.org/texto', 'status', 'to_verify')))::text as draft_nc \gset
begin;
select pg_temp.as_user(:'p1');
select public.editor_create_question(:'draft_nc') as r \gset en5_
commit;
select pg_temp.expect((:'en5_r')::jsonb -> 'incomplete' = '["license_not_allowed"]'::jsonb, 'EN5. El editor no guardó el pendiente de licencia');
select (:'en5_r')::jsonb ->> 'questionId' as q_en5 \gset
select (:'en5_r')::jsonb ->> 'versionId' as v_en5 \gset
begin;
select pg_temp.as_user(:'ad');
select public.admin_assign_questions(array[:'q_en5']::uuid[], null, :'p2');
commit;
begin;
select pg_temp.as_user(:'p1');
select pg_temp.expect(pg_temp.fails_with(format('select public.editor_submit(%L)', :'v_en5')) = 'BK005', 'EN5. Mandó a revisión una licencia con NC');
rollback;

-- ===================================================================== EN6. Enlace que falta
select pg_temp.expect(
  pg_temp.en_issues('en-sin-enlace', pg_temp.en_content(50, array['Fuente del texto. [Prueba] Texto. CC BY.'])) = '{passage_source_missing}'
  and pg_temp.en_issues('en-http', pg_temp.en_content(51,
    array['Fuente del texto. [Prueba] Texto. Dominio público. http://example.org/texto'])) = '{passage_source_missing}'
  and pg_temp.en_issues('en-sin-titulo', pg_temp.en_content(52,
    array['Fuente del texto. CC BY. https://example.org/texto'])) = '{passage_source_missing}'
  and pg_temp.en_issues('en-sin-punto', pg_temp.en_content(53,
    array['Fuente del texto. [Prueba] Texto. CC0. https://localhost/texto'])) = '{passage_source_missing}',
  'EN6. La licencia sin enlace https, sin título o con un host sin punto no deja passage_source_missing');
-- El texto propio del equipo no pide enlace ni título, y CC0, dominio público y CC BY-SA con enlace pasan
select pg_temp.expect(
  pg_temp.en_issues('en-equipo', pg_temp.en_content(54, array['Fuente del texto. Texto propio del equipo Studiare.'])) = '{}'
  and pg_temp.en_issues('en-cc0', pg_temp.en_content(55,
    array['Fuente del texto. [Prueba] Texto. CC0. https://example.org/texto'])) = '{}'
  and pg_temp.en_issues('en-dp', pg_temp.en_content(56,
    array['Fuente del texto. [Prueba] Texto. Dominio público. https://example.org/texto'])) = '{}'
  and pg_temp.en_issues('en-sa', pg_temp.en_content(57,
    array['Fuente del texto. [Prueba] Texto. CC BY-SA. https://example.org/texto'])) = '{}',
  'EN6. Una fuente válida dejó pendientes');

-- ===================================================================== EN7. Idioma y rama cruzados
-- Inglés fuera de Inglés médico y español dentro de esa rama son de estructura. No entran a incomplete
-- y la versión no se manda a revisión ni se aprueba
select pg_temp.en_version('en-fuera', pg_temp.en_content(60, array[:'src_ok'], 'pediatrics', 'neonatology', 'neonatal_jaundice')) as v_en_fuera \gset
select pg_temp.en_version('es-dentro', pg_temp.en_content(61, array[:'src_ok'], p_language => 'es')) as v_es_dentro \gset
select pg_temp.expect(
  public.bank_version_issues(:'v_en_fuera') = '{language_branch_mismatch}'
  and public.bank_version_issues(:'v_es_dentro') = '{language_branch_mismatch}'
  and public.bank_refresh_incomplete(:'v_en_fuera') = '{}'
  and public.bank_refresh_incomplete(:'v_es_dentro') = '{}',
  'EN7. El idioma que no va con la rama no es de estructura');
select pg_temp.expect(
  pg_temp.en_issues('en-fuera-sin-fuente',
    pg_temp.en_content(62, array[]::text[], 'pediatrics', 'neonatology', 'neonatal_jaundice') || '{"explanation": ""}')
    = '{language_branch_mismatch,explanation_missing,references_missing,passage_source_missing}'
  and pg_temp.en_issues('es-dentro-sin-fuente',
    pg_temp.en_content(63, array['[Prueba] Guía simulada'], p_language => 'es')) = '{language_branch_mismatch}',
  'EN7. La estructura no va antes de los demás pendientes o el español pidió fuente');
-- Por el editor, la versión se guarda sin pendientes y no se manda a revisión
select jsonb_set(:'draft_en'::jsonb, '{language}', '"es"')::text as draft_cruzado \gset
begin;
select pg_temp.as_user(:'p1');
select public.editor_create_question(:'draft_cruzado') as r \gset en7_
commit;
select pg_temp.expect((:'en7_r')::jsonb -> 'incomplete' = '[]'::jsonb, 'EN7. El editor guardó el idioma cruzado con pendientes');
select (:'en7_r')::jsonb ->> 'questionId' as q_en7 \gset
select (:'en7_r')::jsonb ->> 'versionId' as v_en7 \gset
begin;
select pg_temp.as_user(:'ad');
select public.admin_assign_questions(array[:'q_en7']::uuid[], null, :'p2');
commit;
begin;
select pg_temp.as_user(:'p1');
select pg_temp.expect(pg_temp.fails_with(format('select public.editor_submit(%L)', :'v_en7')) = 'BK005', 'EN7. Mandó a revisión el idioma cruzado');
rollback;
-- Y aunque llegara a revisión, el revisor no la aprueba
update public.questions set editorial_status = 'in_review', submitted_at = now() where id = :'v_en7';
begin;
select pg_temp.as_user(:'p2');
select pg_temp.label_all(:'q_en7', 'belief_bias');
select pg_temp.expect(pg_temp.fails_with(format('select public.editor_decide(%L, %L, null, null)', :'v_en7', 'approve')) = 'BK005',
  'EN7. Aprobó el idioma cruzado');
rollback;
select pg_temp.expect(not exists (select 1 from public.question_catalog where question_id = :'q_en7'), 'EN7. El idioma cruzado llegó al catálogo');

-- ===================================================================== EN8. Lectura
-- Un caso de 3 en inglés. El catálogo y fetch_questions traen language en y la fuente como primera referencia
select pg_temp.bank_case('EE-C1') as case_en \gset
select pg_temp.en_seed('EE-C1-' || g, :'case_en', g, array[:'src_ok']) from generate_series(1, 3) g;
select array_agg(question_id order by source_key)::text as q_case from public.bank_questions where source_key like 'sheet:EE-C1-%' \gset
select pg_temp.expect((select count(*) from public.question_catalog where case_id = :'case_en' and case_size = 3 and language = 'en'
    and status = 'published') = 3, 'EN8. El caso en inglés no se publicó completo con language en');
begin;
select pg_temp.as_user(:'s1', 'ses-s1');
select public.fetch_questions(:'q_case'::uuid[], null, 'practice') as r \gset en8_
commit;
select pg_temp.expect(jsonb_array_length((:'en8_r')::jsonb -> 'questions') = 3
  and (select bool_and(q ->> 'language' = 'en' and q -> 'gpcRefs' -> 0 ->> 'title' = :'src_ok'
      and q ->> 'branch' = 'medical_english' and (q -> 'structure' ->> 'format') = 'serial_case')
    from jsonb_array_elements((:'en8_r')::jsonb -> 'questions') q)
  and jsonb_array_length((:'en8_r')::jsonb -> 'cases') = 1,
  'EN8. fetch_questions no trae language en y la fuente del texto en cada pregunta del caso');
begin;
select pg_temp.as_user(:'s1', 'ses-s1');
select pg_temp.expect((select bool_and(c ->> 'language' = 'en' and c ->> 'branch' = 'medical_english')
  from jsonb_array_elements(public.catalog_changes(0, 1000) -> 'rows') c where c ->> 'caseId' = :'case_en'),
  'EN8. catalog_changes no trae language en');
rollback;
-- Gratis. Con 2 libres el caso de 3 sale entero negado sin gastar, y con 3 libres gasta 3
select pg_temp.bank_seed('EE-' || lpad(g::text, 3, '0')) from generate_series(1, 20) g;
select array_agg(question_id order by source_key)::text as q_es from public.bank_questions where source_key like 'sheet:EE-0%' \gset
begin;
select pg_temp.as_user(:'f2', 'ses-f2');
select pg_temp.expect((public.fetch_questions((:'q_es'::uuid[])[1:18]) -> 'quota' ->> 'left')::int = 2, 'EN8. f2 no quedó con 2');
select pg_temp.expect(
  (select count(*) from jsonb_array_elements(public.fetch_questions(:'q_case'::uuid[]) -> 'denied') d where d ->> 'reason' = 'daily_limit') = 3
  and public.fetch_questions(:'q_case'::uuid[]) -> 'questions' = '[]'::jsonb,
  'EN8. El caso en inglés de 3 con 2 libres no salió entero negado');
select pg_temp.expect((public.bank_quota() ->> 'used')::int = 18, 'EN8. El caso negado gastó');
commit;
begin;
select pg_temp.as_user(:'f3', 'ses-f3');
select pg_temp.expect((public.fetch_questions((:'q_es'::uuid[])[1:17]) -> 'quota' ->> 'left')::int = 3, 'EN8. f3 no quedó con 3');
select public.fetch_questions(:'q_case'::uuid[]) as r \gset en8b_
commit;
select pg_temp.expect(jsonb_array_length((:'en8b_r')::jsonb -> 'questions') = 3 and (:'en8b_r')::jsonb -> 'denied' = '[]'::jsonb
  and ((:'en8b_r')::jsonb -> 'quota' ->> 'used')::int = 20 and ((:'en8b_r')::jsonb -> 'quota' ->> 'left')::int = 0,
  'EN8. El caso en inglés de 3 con 3 libres no gastó 3');

-- ===================================================================== EN9. Paridad con passageSource.ts
\set passage_json `cat "$PASSAGE_SOURCES_FILE"`
select pg_temp.expect(jsonb_array_length((:'passage_json'::jsonb) -> 'cases') >= 30
  and exists (select 1 from jsonb_array_elements((:'passage_json'::jsonb) -> 'cases') c where c ->> 'issue' = 'license_not_allowed')
  and exists (select 1 from jsonb_array_elements((:'passage_json'::jsonb) -> 'cases') c where c ->> 'issue' = 'passage_source_missing')
  and exists (select 1 from jsonb_array_elements((:'passage_json'::jsonb) -> 'cases') c where c -> 'issue' = 'null'::jsonb),
  'EN9. La lista de casos compartida no llegó completa');
select pg_temp.parity_failures(:'passage_json'::jsonb) as failures \gset
select pg_temp.expect(:'failures' = '', 'EN9. bank_passage_source_issue no da lo mismo que passageSource.ts en: ' || :'failures');
-- Entradas raras que no truenan
select pg_temp.expect(
  public.bank_passage_source_issue('[]') = 'passage_source_missing'
  and public.bank_passage_source_issue(null) = 'passage_source_missing'
  and public.bank_passage_source_issue('{}') = 'passage_source_missing'
  and public.bank_passage_source_issue('["Fuente del texto. X. CC BY. https://example.org/x"]') = 'passage_source_missing'
  and public.bank_passage_source_issue('[{"status":"to_verify"}]') = 'passage_source_missing'
  and public.bank_passage_source_issue('[{"title":null}]') = 'passage_source_missing',
  'EN9. Una lista rara de referencias truena o pasa');

-- ===================================================================== EN10. Permisos
select pg_temp.expect(
  not has_function_privilege('anon', 'public.bank_passage_source_issue(jsonb)', 'execute')
  and not has_function_privilege('authenticated', 'public.bank_passage_source_issue(jsonb)', 'execute')
  and not has_function_privilege('service_role', 'public.bank_passage_source_issue(jsonb)', 'execute')
  and not has_function_privilege('anon', 'public.bank_version_issues(uuid)', 'execute')
  and not has_function_privilege('authenticated', 'public.bank_version_issues(uuid)', 'execute')
  and not has_function_privilege('service_role', 'public.bank_version_issues(uuid)', 'execute')
  and not has_function_privilege('anon', 'public.bank_incomplete_of(text[])', 'execute')
  and not has_function_privilege('authenticated', 'public.bank_incomplete_of(text[])', 'execute')
  and not has_function_privilege('service_role', 'public.bank_incomplete_of(text[])', 'execute'),
  'EN10. Alguien de la API ejecuta una de las funciones internas');
do $$
declare
  f text;
begin
  foreach f in array array['public.bank_passage_source_issue(jsonb)', 'public.bank_version_issues(uuid)', 'public.bank_incomplete_of(text[])'] loop
    if (select proacl from pg_proc where oid = f::regprocedure) is null
       or exists (select 1 from pg_proc p, aclexplode(p.proacl) a where p.oid = f::regprocedure and a.grantee = 0) then
      raise exception 'FALLA EN10. public puede ejecutar %', f;
    end if;
  end loop;
end $$;
-- Siguen igual de B11. bank_version_issues con security definer y search_path fijo, y las otras dos inmutables
select pg_temp.expect(
  (select prosecdef and provolatile = 's' and exists (select 1 from unnest(proconfig) c where c = 'search_path=public, pg_temp')
    from pg_proc where oid = 'public.bank_version_issues(uuid)'::regprocedure)
  and (select provolatile = 'i' and exists (select 1 from unnest(proconfig) c where c = 'search_path=public, pg_temp')
    from pg_proc where oid = 'public.bank_incomplete_of(text[])'::regprocedure)
  and (select provolatile = 'i' and not prosecdef and exists (select 1 from unnest(proconfig) c where c = 'search_path=public, pg_temp')
    from pg_proc where oid = 'public.bank_passage_source_issue(jsonb)'::regprocedure),
  'EN10. Las funciones perdieron su volatilidad, su security definer o su search_path');
begin;
select pg_temp.as_anon();
select pg_temp.expect(pg_temp.is_blocked($q$select public.bank_passage_source_issue('[]')$q$), 'EN10. anon ejecutó la lectura de la fuente');
rollback;
begin;
select pg_temp.as_user(:'s1', 'ses-s1');
select pg_temp.expect(pg_temp.is_blocked($q$select public.bank_passage_source_issue('[]')$q$), 'EN10. Un alumno ejecutó la lectura de la fuente');
select pg_temp.expect(pg_temp.is_blocked(format('select public.bank_version_issues(%L)', :'v_en_ok')), 'EN10. Un alumno ejecutó bank_version_issues');
rollback;
begin;
select pg_temp.as_service();
select pg_temp.expect(pg_temp.is_blocked($q$select public.bank_passage_source_issue('[]')$q$), 'EN10. service_role ejecutó la lectura de la fuente');
rollback;

\echo 'TODAS LAS PRUEBAS DE INGLES MEDICO PASARON'
