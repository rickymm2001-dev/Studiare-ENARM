-- Pruebas de la sincronización con el Google Sheet y de la importación del admin (B11, migración
-- 20261023000004, 6.1 del plan de B11). Los renglones llegan ya planeados, como los manda la función
-- bank-sync. Usuarios propios que empiezan con cc, con los cinco tipos. Todo el texto es simulado.
\set ON_ERROR_STOP on
\ir bank_helpers.sql

\set d1 'cc000000-0000-0000-0000-0000000000d1'
\set d2 'cc000000-0000-0000-0000-0000000000d2'
\set st 'cc000000-0000-0000-0000-0000000000a1'
\set ad 'cc000000-0000-0000-0000-0000000000e1'

insert into auth.users (id, email, raw_user_meta_data) values
  (:'d1', 'cc-d1@x.mx', '{"alias":"Paco simulado"}'),
  (:'d2', 'cc-d2@x.mx', '{"alias":"Revisora simulada"}'),
  (:'st', 'cc-st@x.mx', '{"alias":"Alumno CC"}'),
  (:'ad', 'cc-ad@x.mx', '{"alias":"Admin CC"}');
update public.user_roles set role = 'physician' where user_id in (:'d1', :'d2');
update public.user_roles set role = 'admin' where user_id = :'ad';
select user_id::text as owner from public.user_roles where role = 'owner' \gset
insert into public.physician_codes (code, user_id) values ('PMS', :'d1'), ('ALS', :'d2');
-- Las pruebas anteriores siembran preguntas con clave sheet: en la misma base. Aquí el Sheet simulado
-- solo trae las de este archivo, así que las de otros archivos pasan a otra clave para que no cuenten
-- como faltantes. Ninguna prueba posterior las busca por su clave
update public.bank_questions set source_key = 'otra-prueba:' || substring(source_key from 7)
  where source_key like 'sheet:%';

-- ===================================================================== BS1. Permisos
do $$
declare
  f text;
  r text;
begin
  foreach f in array array['public.bank_sync_cron_ok(text)', 'public.bank_sync_begin(text, text, uuid)',
      'public.bank_sync_versions_content(uuid[])', 'public.bank_sync_apply(uuid, jsonb, boolean)',
      'public.bank_sync_finish(uuid, text[], jsonb, text, text)'] loop
    if not has_function_privilege('service_role', f, 'execute') then raise exception 'FALLA BS1. service_role no ejecuta %', f; end if;
    foreach r in array array['anon', 'authenticated'] loop
      if has_function_privilege(r, f, 'execute') then raise exception 'FALLA BS1. % ejecuta %', r, f; end if;
    end loop;
  end loop;
  foreach f in array array['public.admin_bank_sync_authorize()', 'public.admin_bank_sync_runs(integer)',
      'public.admin_bank_sync_rows(uuid, text, integer, integer)', 'public.admin_bank_import(jsonb)'] loop
    if not has_function_privilege('authenticated', f, 'execute') or has_function_privilege('anon', f, 'execute')
       or has_function_privilege('service_role', f, 'execute') then
      raise exception 'FALLA BS1. Permisos de %', f;
    end if;
  end loop;
  foreach f in array array['public.bank_sync_settings()', 'public.bank_sync_problems(jsonb)', 'public.bank_text_array(jsonb)',
      'public.bank_sheet_content(text, text, jsonb)', 'public.bank_apply_row(uuid, text, jsonb, boolean)',
      'public.bank_admin_assigned_other(uuid, text, uuid)',
      'public.bank_sync_run_json(public.bank_sync_runs)'] loop
    foreach r in array array['anon', 'authenticated', 'service_role'] loop
      if has_function_privilege(r, f, 'execute') then raise exception 'FALLA BS1. % ejecuta la ayuda interna %', r, f; end if;
    end loop;
  end loop;
  foreach f in array array['public.bank_sync_runs', 'public.bank_sync_row_results'] loop
    foreach r in array array['anon', 'authenticated', 'service_role'] loop
      if has_table_privilege(r, f, 'select') or has_table_privilege(r, f, 'insert') then
        raise exception 'FALLA BS1. % tiene permisos sobre %', r, f;
      end if;
    end loop;
  end loop;
end $$;
begin;
select pg_temp.as_user(:'ad');
select pg_temp.expect(public.admin_bank_sync_authorize() = jsonb_build_object('actorId', :'ad'), 'BS1. El admin no se autorizó');
rollback;
begin;
select pg_temp.as_user(:'owner');
select pg_temp.expect(public.admin_bank_sync_authorize() ->> 'actorId' = :'owner', 'BS1. El dueño no se autorizó');
rollback;
begin;
select pg_temp.as_user(:'d1');
select pg_temp.expect(pg_temp.fails_with('select public.admin_bank_sync_authorize()') = '42501', 'BS1. Un médico pidió sincronizar');
select pg_temp.expect(pg_temp.is_blocked('select public.bank_sync_begin(''manual'', ''real'', null)'), 'BS1. Un médico empezó una corrida');
rollback;
begin;
select pg_temp.as_user(:'st');
select pg_temp.expect(pg_temp.fails_with('select public.admin_bank_sync_authorize()') = '42501', 'BS1. Un alumno pidió sincronizar');
select pg_temp.expect(pg_temp.fails_with('select public.admin_bank_sync_runs()') = '42501', 'BS1. Un alumno leyó las corridas');
rollback;
begin;
select pg_temp.as_anon();
select pg_temp.expect(pg_temp.is_blocked('select public.admin_bank_sync_authorize()'), 'BS1. anon pidió sincronizar');
select pg_temp.expect(pg_temp.is_blocked('select public.bank_sync_cron_ok(''x'')'), 'BS1. anon probó la ficha');
rollback;
-- La ficha de Cron. Sin Vault, false. Con una vista de prueba de Vault, true solo con la ficha
select pg_temp.expect(not public.bank_sync_cron_ok(repeat('a', 64)), 'BS1. Sin Vault aceptó una ficha');
begin;
create schema vault;
create view vault.decrypted_secrets as select 'bank_sync_cron_token'::text as name, repeat('f', 64)::text as decrypted_secret;
select pg_temp.as_service();
select pg_temp.expect(public.bank_sync_cron_ok(repeat('f', 64)), 'BS1. No aceptó la ficha de Vault');
select pg_temp.expect(not public.bank_sync_cron_ok(repeat('e', 64)), 'BS1. Aceptó otra ficha');
select pg_temp.expect(not public.bank_sync_cron_ok(null) and not public.bank_sync_cron_ok('corta'), 'BS1. Aceptó una ficha vacía o corta');
rollback;

-- ===================================================================== BS2. Inicio
select pg_temp.expect(public.bank_sync_begin('cron', 'real', null) @> '{"status":"skipped","reason":"disabled"}'::jsonb,
  'BS2. Apagada no salió skipped con disabled');
select pg_temp.set_setting('bank_sync', 'enabled', 'true');
select public.bank_sync_begin('manual', 'real', :'ad') as b1 \gset
select pg_temp.expect((:'b1')::jsonb @> '{"status":"running","mode":"dry_run","target":"real","settings":{"tab":"Preguntas","maxRows":5000}}'::jsonb,
  'BS2. La primera corrida no empezó en solo reporte');
select pg_temp.expect(public.bank_sync_begin('cron', 'real', null) @> '{"status":"skipped","reason":"running"}'::jsonb,
  'BS2. Corrieron dos a la vez');
select public.bank_sync_finish(((:'b1')::jsonb ->> 'runId')::uuid, null, '{}', 'ok', null);
select pg_temp.expect(public.bank_sync_begin('manual', 'real', :'ad') @> '{"status":"skipped","reason":"too_soon"}'::jsonb,
  'BS2. Sincronizar ahora corrió muy seguido');
select public.bank_sync_begin('cron', 'real', null) ->> 'runId' as b2 \gset
select pg_temp.expect((select status from public.bank_sync_runs where id = :'b2') = 'running', 'BS2. Cron no empezó');
select pg_temp.expect(public.bank_sync_finish(:'b2', null, '{"read":3}', 'skipped', 'no_changes') @> '{"status":"skipped","reason":"no_changes"}'::jsonb,
  'BS2. No terminó sin cambios');
-- El Sheet de prueba siempre va en solo reporte, aunque el modo sea aplicar
select pg_temp.set_setting('bank_sync', 'minIntervalSeconds', '0');
select pg_temp.set_setting('bank_sync', 'mode', '"apply"');
select public.bank_sync_begin('manual', 'test', :'ad') as b3 \gset
select pg_temp.expect((:'b3')::jsonb ->> 'mode' = 'dry_run', 'BS2. El Sheet de prueba no forzó solo reporte');
select public.bank_sync_finish(((:'b3')::jsonb ->> 'runId')::uuid, null, '{}', 'ok', null);
select pg_temp.expect((select count(*) from public.bank_sync_runs where status = 'skipped' and actor_id = :'ad') >= 1,
  'BS2. Una corrida saltada no quedó registrada');

-- ===================================================================== BS3. Crear
select public.bank_sync_begin('manual', 'real', :'ad') ->> 'runId' as r3 \gset
select public.bank_sync_apply(:'r3', jsonb_build_array(
  pg_temp.sync_row(2, 'GO-0001', 'create', 'hash-1', 'draft', 'PMS', null, null, null, null, null,
    '["explanation_missing"]', '["kind_control_check","structure_auto"]', ''),
  pg_temp.sync_row(3, 'GO-0002', 'create', 'hash-2', 'ready', 'PMS', 'ALS'),
  pg_temp.sync_row(4, 'GO-0003', 'create', 'hash-3', 'ready', 'XX9', null, null, null, null, null,
    '["references_missing"]', '[]'))) as res3 \gset
select public.bank_sync_finish(:'r3', array['GO-0001', 'GO-0002', 'GO-0003'], '{"read":3,"created":3,"sheetHash":"sheet-1"}', 'ok', null);
select pg_temp.expect((select array_agg(r ->> 'outcome') from jsonb_array_elements((:'res3')::jsonb) r) = '{created,created,created}',
  'BS3. No salieron tres creadas');
select public.stable_bank_uuid('sheet-q', 'GO-0001') as q1, public.stable_bank_uuid('sheet-q', 'GO-0002') as q2,
       public.stable_bank_uuid('sheet-q', 'GO-0003') as q3 \gset
select pg_temp.expect((select source_key = 'sheet:GO-0001' and sheet_row_hash = 'hash-1' and sheet_applied_version_id = latest_version_id
  and sheet_status = 'draft' from public.bank_questions where question_id = :'q1'), 'BS3. El registro de GO-0001');
select pg_temp.latest(:'q1') as q1v1 \gset
select pg_temp.expect((select version = 1 and editorial_status = 'draft' and author_id = :'d1' and version_source = 'sheet'
  and incomplete = '{explanation_missing}' and review_flags = '{kind_control_check}' and structure_source = 'physician'
  from public.questions where id = :'q1v1'), 'BS3. La versión 1 de GO-0001');
-- Ids estables. Repetir da los mismos
select pg_temp.expect((select option_id from public.question_options where question_version_id = :'q1v1' and position = 0)
  = public.stable_bank_uuid('sheet-opt', 'GO-0001|A')
  and (select letter from public.question_options where question_version_id = :'q1v1' and position = 1) = 'B',
  'BS3. Las opciones no tienen id estable por letra');
select pg_temp.expect(public.bank_assignee(:'q1', 'author') = :'d1' and public.bank_assignee(:'q1', 'reviewer') is null,
  'BS3. La autora no quedó asignada por su clave');
-- Lista para revisión y completa, con revisor distinto del autor, queda en revisión
select pg_temp.expect((select editorial_status from public.questions where id = pg_temp.latest(:'q2')) = 'in_review'
  and public.bank_assignee(:'q2', 'reviewer') = :'d2', 'BS3. GO-0002 no pasó a revisión');
-- Incompleta no va a revisión y avisa. Una clave desconocida solo avisa
select pg_temp.expect((select editorial_status from public.questions where id = pg_temp.latest(:'q3')) = 'draft',
  'BS3. GO-0003 incompleta pasó a revisión');
select pg_temp.expect((select notices from public.bank_sync_row_results where run_id = :'r3' and sheet_key = 'GO-0003')
  = '{author_unknown,not_ready}', 'BS3. GO-0003 no avisó la clave desconocida y que no está lista');
select pg_temp.expect((select notices from public.bank_sync_row_results where run_id = :'r3' and sheet_key = 'GO-0001')
  = '{kind_control_check,structure_auto}', 'BS3. Los avisos de GO-0001');
select pg_temp.expect((select counts from public.bank_sync_runs where id = :'r3') = '{"read":3,"created":3,"missing":0}'::jsonb
  and (select sheet_hash from public.bank_sync_runs where id = :'r3') = 'sheet-1', 'BS3. Conteos y huella del Sheet');

-- ===================================================================== BS4. Solo reporte
select pg_temp.set_setting('bank_sync', 'mode', '"dry_run"');
select public.bank_sync_begin('manual', 'real', :'ad') ->> 'runId' as r4 \gset
select public.bank_sync_apply(:'r4', jsonb_build_array(pg_temp.sync_row(9, 'GO-0100', 'create', 'hash-100', 'ready', 'PMS', 'ALS')));
select public.bank_sync_finish(:'r4', null, '{}', 'ok', null);
select pg_temp.expect((select outcome from public.bank_sync_row_results where run_id = :'r4' and sheet_key = 'GO-0100') = 'created'
  and not exists (select 1 from public.bank_questions where source_key = 'sheet:GO-0100')
  and not exists (select 1 from public.questions where question_id = public.stable_bank_uuid('sheet-q', 'GO-0100')),
  'BS4. Solo reporte escribió algo más que el reporte');
-- Con fórmulas en la columna ID, la función baja la corrida a solo reporte
select pg_temp.set_setting('bank_sync', 'mode', '"apply"');
select public.bank_sync_begin('manual', 'real', :'ad') ->> 'runId' as r4b \gset
select public.bank_sync_apply(:'r4b', jsonb_build_array(pg_temp.sync_row(9, 'GO-0101', 'create', 'hash-101')), true);
select public.bank_sync_finish(:'r4b', null, '{}', 'ok', 'id_formula');
select pg_temp.expect((select mode from public.bank_sync_runs where id = :'r4b') = 'dry_run'
  and not exists (select 1 from public.bank_questions where source_key = 'sheet:GO-0101'), 'BS4. Con fórmulas en el ID escribió preguntas');

-- ===================================================================== BS5. Lo que sabe la base para planear
select public.bank_sync_begin('manual', 'real', :'ad') as b5 \gset
select pg_temp.expect((:'b5')::jsonb -> 'known' @> jsonb_build_array(jsonb_build_object('key', 'GO-0001', 'rowHash', 'hash-1',
  'questionId', :'q1', 'latestVersionId', :'q1v1', 'appliedVersionId', :'q1v1', 'latestSource', 'sheet', 'forceNext', false)),
  'BS5. bank_sync_begin no trae lo que sabe de GO-0001');
select pg_temp.expect((:'b5')::jsonb ->> 'lastSheetHash' = 'sheet-1', 'BS5. No trae la huella del Sheet anterior');
select pg_temp.expect(position('[Prueba]' in (:'b5')) = 0, 'BS5. bank_sync_begin trae texto');
select public.bank_sync_finish(((:'b5')::jsonb ->> 'runId')::uuid, null, '{}', 'skipped', 'no_changes');
-- La huella solo sale de una corrida que aplicó, y ninguna si algo cambió fuera del Sheet (M4 de la revisión)
begin;
select pg_temp.set_setting('bank_sync', 'mode', '"dry_run"');
select public.bank_sync_begin('manual', 'real', :'ad') ->> 'runId' as r5dry \gset
select public.bank_sync_finish(:'r5dry', null, '{"sheetHash":"sheet-dry"}', 'ok', null);
select pg_temp.expect(public.bank_sync_begin('manual', 'real', :'ad') ->> 'lastSheetHash' = 'sheet-1',
  'BS5. La huella salió de una corrida en solo reporte');
rollback;
begin;
update public.bank_questions set sheet_force_next = true where question_id = :'q1';
select pg_temp.expect(public.bank_sync_begin('manual', 'real', :'ad') ->> 'lastSheetHash' is null,
  'BS5. Con una pregunta que pide la siguiente corrida trajo la huella');
rollback;
begin;
update public.physician_codes set set_at = now() where user_id = :'d2';
select pg_temp.expect(public.bank_sync_begin('manual', 'real', :'ad') ->> 'lastSheetHash' is null,
  'BS5. Con una clave de médico nueva trajo la huella');
rollback;
begin;
insert into public.bank_topic_reviewers (branch, topic, physician_id, set_at)
  values ('obstetrics_gynecology', 'prenatal_care', :'d2', now());
select pg_temp.expect(public.bank_sync_begin('manual', 'real', :'ad') ->> 'lastSheetHash' is null,
  'BS5. Con un revisor por subespecialidad nuevo trajo la huella');
rollback;

-- ===================================================================== BS6. Versión nueva
-- GO-0002 se aprueba y se publica. Una versión nueva del Sheet no la saca del catálogo
update public.questions set editorial_status = 'approved', incomplete = '{}' where id = pg_temp.latest(:'q2');
select public.bank_publish(:'q2');
select pg_temp.latest(:'q2') as q2v1 \gset
select public.bank_sync_begin('manual', 'real', :'ad') ->> 'runId' as r6 \gset
select pg_temp.expect(public.bank_sync_apply(:'r6', jsonb_build_array(pg_temp.sync_row(3, 'GO-0002', 'version', 'hash-2b', 'draft', 'PMS', 'ALS', :'q2v1',
  p_prompt => '[Prueba] ¿Pregunta simulada corregida en el Sheet?'))) -> 0 ->> 'outcome' = 'versioned', 'BS6. No salió versión nueva');
select public.bank_sync_finish(:'r6', null, '{}', 'ok', null);
select pg_temp.expect((select version from public.questions where id = pg_temp.latest(:'q2')) = 2
  and (select editorial_status from public.questions where id = pg_temp.latest(:'q2')) = 'draft'
  and (select version_id from public.question_catalog where question_id = :'q2') = :'q2v1'
  and (select sheet_row_hash = 'hash-2b' and sheet_applied_version_id = latest_version_id from public.bank_questions where question_id = :'q2'),
  'BS6. La versión nueva no quedó como borrador o sacó a la publicada');

-- El Revisor y el Autor del Sheet no pisan a quien el admin reasignó en la app. La app gana y el reporte
-- avisa con reviewer_differs o author_differs. Quien vino del Sheet sí cambia con el Sheet (B7 de la revisión)
begin;
insert into auth.users (id, email, raw_user_meta_data)
  values ('cc000000-0000-0000-0000-0000000000d3', 'cc-d3@x.mx', '{"alias":"Tercera simulada"}');
update public.user_roles set role = 'physician' where user_id = 'cc000000-0000-0000-0000-0000000000d3';
insert into public.physician_codes (code, user_id) values ('TRS', 'cc000000-0000-0000-0000-0000000000d3');
select pg_temp.latest(:'q2') as q2v2 \gset
select public.bank_sync_begin('manual', 'real', :'ad') ->> 'runId' as r6b \gset
select public.bank_sync_apply(:'r6b', jsonb_build_array(pg_temp.sync_row(3, 'GO-0002', 'meta_only', 'hash-2b', 'draft', 'PMS', 'TRS', :'q2v2')));
select pg_temp.expect(public.bank_assignee(:'q2', 'reviewer') = 'cc000000-0000-0000-0000-0000000000d3'
  and not (select 'reviewer_differs' = any (notices) from public.bank_sync_row_results where run_id = :'r6b' and row_number = 3),
  'BS6. El Revisor del Sheet no cambió al revisor que vino del Sheet');
select pg_temp.as_user(:'ad');
select public.admin_assign_questions(array[:'q2']::uuid[], null, :'d2');
reset role;
select public.bank_sync_apply(:'r6b', jsonb_build_array(pg_temp.sync_row(3, 'GO-0002', 'meta_only', 'hash-2b', 'draft', 'PMS', 'TRS', :'q2v2')));
select pg_temp.expect(public.bank_assignee(:'q2', 'reviewer') = :'d2', 'BS6. El Revisor del Sheet pisó la reasignación del admin');
select pg_temp.expect((select notices from public.bank_sync_row_results where run_id = :'r6b' and row_number = 3
    order by id desc limit 1) @> '{reviewer_differs}', 'BS6. El reporte no avisó que el Sheet dice otro revisor');
-- Lo mismo con el Autor (caso hermano de B7). Una autora que vino del Sheet sí cambia con el Sheet
insert into auth.users (id, email, raw_user_meta_data)
  values ('cc000000-0000-0000-0000-0000000000d4', 'cc-d4@x.mx', '{"alias":"Cuarta simulada"}');
update public.user_roles set role = 'physician' where user_id = 'cc000000-0000-0000-0000-0000000000d4';
insert into public.physician_codes (code, user_id) values ('CUS', 'cc000000-0000-0000-0000-0000000000d4');
select public.bank_sync_apply(:'r6b', jsonb_build_array(pg_temp.sync_row(3, 'GO-0002', 'meta_only', 'hash-2b', 'draft', 'CUS', 'TRS', :'q2v2')));
select pg_temp.expect(public.bank_assignee(:'q2', 'author') = 'cc000000-0000-0000-0000-0000000000d4'
  and not (select 'author_differs' = any (notices) from public.bank_sync_row_results where run_id = :'r6b' and row_number = 3
    order by id desc limit 1),
  'BS6. El Autor del Sheet no cambió a la autora que vino del Sheet');
select pg_temp.as_user(:'ad');
select public.admin_assign_questions(array[:'q2']::uuid[], :'d1', null);
reset role;
select public.bank_sync_apply(:'r6b', jsonb_build_array(pg_temp.sync_row(3, 'GO-0002', 'meta_only', 'hash-2b', 'draft', 'CUS', 'TRS', :'q2v2')));
select pg_temp.expect(public.bank_assignee(:'q2', 'author') = :'d1', 'BS6. El Autor del Sheet pisó la reasignación del admin');
select pg_temp.expect((select notices from public.bank_sync_row_results where run_id = :'r6b' and row_number = 3
    order by id desc limit 1) @> '{author_differs}', 'BS6. El reporte no avisó que el Sheet dice otro autor');
rollback;

-- ===================================================================== BS7. Conflicto
-- Alguien guardó entre el plan y la escritura. El candado lo ve y no pisa nada
select public.bank_sync_begin('manual', 'real', :'ad') ->> 'runId' as r7 \gset
select pg_temp.expect(public.bank_sync_apply(:'r7', jsonb_build_array(pg_temp.sync_row(2, 'GO-0001', 'version', 'hash-1c', 'draft', 'PMS', null,
  gen_random_uuid()))) -> 0 ->> 'outcome' = 'conflict', 'BS7. El candado no vio el cambio de en medio');
select public.bank_sync_finish(:'r7', null, '{}', 'partial', null);
select pg_temp.expect(pg_temp.latest(:'q1') = :'q1v1'
  and (select conflict_since is not null and conflict_row_hash = 'hash-1c' from public.bank_questions where question_id = :'q1'),
  'BS7. El conflicto creó versión o no quedó marcado');
-- Conservar la de la app. La huella del Sheet de ese momento queda como aplicada
begin;
select pg_temp.as_user(:'st');
select pg_temp.expect(pg_temp.fails_with(format('select public.editor_resolve_sync_conflict(%L, %L)', :'q1', 'keep_app')) = '42501',
  'BS7. Un alumno resolvió un conflicto');
rollback;
begin;
select pg_temp.as_user(:'d1');
select pg_temp.expect(public.editor_resolve_sync_conflict(:'q1', 'keep_app') = 'keep_app', 'BS7. La autora no conservó la de la app');
commit;
select pg_temp.expect((select sheet_row_hash = 'hash-1c' and conflict_since is null from public.bank_questions where question_id = :'q1'),
  'BS7. Conservar la de la app no guardó la huella');
-- Usar la del Sheet. La siguiente corrida crea la versión desde el renglón
update public.bank_questions set conflict_since = now(), conflict_row_hash = 'hash-1d' where question_id = :'q1';
begin;
select pg_temp.as_user(:'ad');
select pg_temp.expect(public.editor_resolve_sync_conflict(:'q1', 'take_sheet') = 'take_sheet', 'BS7. El admin no tomó la del Sheet');
select pg_temp.expect(pg_temp.fails_with(format('select public.editor_resolve_sync_conflict(%L, %L)', :'q1', 'take_sheet')) = '22023',
  'BS7. Resolvió un conflicto que ya no existe');
commit;
select public.bank_sync_begin('manual', 'real', :'ad') as b7 \gset
select pg_temp.expect((:'b7')::jsonb -> 'known' @> '[{"key":"GO-0001","forceNext":true}]'::jsonb, 'BS7. La siguiente corrida no sabe que debe usar la del Sheet');
select public.bank_sync_apply(((:'b7')::jsonb ->> 'runId')::uuid,
  jsonb_build_array(pg_temp.sync_row(2, 'GO-0001', 'version', 'hash-1d', 'draft', 'PMS', null, :'q1v1')));
select public.bank_sync_finish(((:'b7')::jsonb ->> 'runId')::uuid, null, '{}', 'ok', null);
select pg_temp.expect((select version from public.questions where id = pg_temp.latest(:'q1')) = 2
  and (select not sheet_force_next and sheet_row_hash = 'hash-1d' from public.bank_questions where question_id = :'q1'),
  'BS7. Usar la del Sheet no creó la versión');

-- ===================================================================== BS8. Coincidencia
-- La autora corrige en la app y después copia lo mismo al Sheet
select pg_temp.latest(:'q1') as q1v2 \gset
select pg_temp.draft_of(:'q1v2', '{"explanation":"[Prueba] Corregida en la app"}')::text as d_q1 \gset
begin;
select pg_temp.as_user(:'d1');
select (public.editor_save_version(:'q1', :'q1v2', :'d_q1')) ->> 'versionId' as q1v3 \gset
commit;
select pg_temp.expect((select r.latest_version_id <> r.sheet_applied_version_id from public.bank_questions r where question_id = :'q1'),
  'BS8. La versión de la app quedó como aplicada');
-- La función pide el contenido de esa versión para compararlo con el renglón
select pg_temp.expect(public.bank_sync_versions_content(array[:'q1v3']::uuid[]) -> 0 -> 'content'
  @> '{"explanation":"[Prueba] Corregida en la app","canonical":["A","B","C","D"],"caseKey":null}'::jsonb
  and jsonb_array_length(public.bank_sync_versions_content(array[:'q1v3']::uuid[]) -> 0 -> 'content' -> 'options') = 4,
  'BS8. El contenido de la versión no tiene la forma de VersionContent');
select public.bank_sync_begin('manual', 'real', :'ad') ->> 'runId' as r8 \gset
select pg_temp.expect(public.bank_sync_apply(:'r8', jsonb_build_array(pg_temp.sync_row(2, 'GO-0001', 'converged', 'hash-1e', 'draft', 'PMS', null,
  :'q1v3'))) -> 0 ->> 'outcome' = 'converged', 'BS8. No coincidió');
select public.bank_sync_finish(:'r8', null, '{}', 'ok', null);
select pg_temp.expect(pg_temp.latest(:'q1') = :'q1v3'
  and (select sheet_row_hash = 'hash-1e' and sheet_applied_version_id = :'q1v3' from public.bank_questions where question_id = :'q1'),
  'BS8. Coincidir creó versión o no guardó la huella');

-- ===================================================================== BS9. Faltantes
select array(select substring(source_key from 7) from public.bank_questions
  where source_key like 'sheet:%' and source_key <> 'sheet:GO-0003')::text as seen9 \gset
select public.bank_sync_begin('manual', 'real', :'ad') ->> 'runId' as r9 \gset
select public.bank_sync_finish(:'r9', :'seen9'::text[], '{}', 'ok', null);
select pg_temp.expect((select sheet_missing_since is not null and status = 'active' from public.bank_questions where question_id = :'q3')
  and (select count(*) from public.bank_sync_row_results where run_id = :'r9' and outcome = 'missing' and sheet_key = 'GO-0003' and row_number is null) = 1
  and (select (counts ->> 'missing')::int from public.bank_sync_runs where id = :'r9') = 1,
  'BS9. GO-0003 no quedó marcada como faltante');
begin;
select pg_temp.as_user(:'ad');
select pg_temp.expect(public.admin_bank_overview() ->> 'missing' = '1', 'BS9. El resumen no cuenta la faltante');
select pg_temp.expect(public.admin_confirm_missing(array[:'q3']::uuid[], 'keep') = 1, 'BS9. No la dejó');
commit;
select pg_temp.expect((select sheet_missing_since is null and status = 'active' from public.bank_questions where question_id = :'q3'),
  'BS9. Dejarla no quitó la marca');
select public.bank_sync_begin('manual', 'real', :'ad') ->> 'runId' as r9b \gset
select public.bank_sync_finish(:'r9b', :'seen9'::text[], '{}', 'ok', null);
begin;
select pg_temp.as_user(:'ad');
select pg_temp.expect(public.admin_confirm_missing(array[:'q3']::uuid[], 'retire') = 1, 'BS9. No la retiró');
commit;
select pg_temp.expect((select status from public.bank_questions where question_id = :'q3') = 'retired', 'BS9. Retirar no la retiró');
-- Si vuelve a aparecer, la marca se quita
update public.bank_questions set sheet_missing_since = now() where question_id = :'q1';
select public.bank_sync_begin('manual', 'real', :'ad') ->> 'runId' as r9c \gset
select public.bank_sync_finish(:'r9c', array['GO-0001'], '{}', 'ok', null);
select pg_temp.expect((select sheet_missing_since from public.bank_questions where question_id = :'q1') is null, 'BS9. Al volver no se quitó la marca');
-- En solo reporte se listan, pero no se marca nada
select pg_temp.set_setting('bank_sync', 'mode', '"dry_run"');
select public.bank_sync_begin('manual', 'real', :'ad') ->> 'runId' as r9d \gset
select public.bank_sync_finish(:'r9d', array['GO-0002'], '{}', 'ok', null);
select pg_temp.expect((select count(*) from public.bank_sync_row_results where run_id = :'r9d' and outcome = 'missing' and sheet_key = 'GO-0001') = 1
  and (select sheet_missing_since from public.bank_questions where question_id = :'q1') is null, 'BS9. Solo reporte marcó faltantes');
select pg_temp.set_setting('bank_sync', 'mode', '"apply"');

-- ===================================================================== BS10. Caso con viñeta nueva
select public.bank_sync_begin('manual', 'real', :'ad') ->> 'runId' as r10 \gset
select public.bank_sync_apply(:'r10', (select jsonb_agg(pg_temp.sync_row(10 + g, 'GO-020' || g, 'create', 'hash-c' || g, 'draft', 'PMS', null, null,
  'GO-C001', g, '[Prueba] Viñeta simulada del caso')) from generate_series(1, 3) g));
select public.bank_sync_finish(:'r10', null, '{}', 'ok', null);
select public.stable_bank_uuid('sheet-case', 'GO-C001|' || md5('[Prueba] Viñeta simulada del caso')) as case1 \gset
select pg_temp.expect((select count(*) from public.bank_questions r join public.questions q on q.id = r.latest_version_id
  where r.source_key like 'sheet:GO-020%' and q.case_id = :'case1' and q.format = 'serial_case') = 3
  and (select vignette from public.clinical_cases where id = :'case1') = '[Prueba] Viñeta simulada del caso'
  and (select case_key from public.clinical_cases where id = :'case1') = 'GO-C001', 'BS10. El caso no entró con sus tres preguntas');
select public.bank_sync_begin('manual', 'real', :'ad') ->> 'runId' as r10b \gset
select public.bank_sync_apply(:'r10b', (select jsonb_agg(pg_temp.sync_row(10 + g, 'GO-020' || g, 'version', 'hash-d' || g, 'draft', 'PMS', null,
  pg_temp.latest(public.stable_bank_uuid('sheet-q', 'GO-020' || g)), 'GO-C001', g, '[Prueba] Viñeta simulada cambiada')) from generate_series(1, 3) g));
select public.bank_sync_finish(:'r10b', null, '{}', 'ok', null);
select pg_temp.expect((select count(*) from public.bank_questions r join public.questions q on q.id = r.latest_version_id
  where r.source_key like 'sheet:GO-020%' and q.version = 2
    and q.case_id = public.stable_bank_uuid('sheet-case', 'GO-C001|' || md5('[Prueba] Viñeta simulada cambiada'))) = 3
  and (select count(*) from public.questions where case_id = :'case1') = 3, 'BS10. La viñeta nueva no dio caso nuevo y versiones nuevas');

-- ===================================================================== BS11. Rechazados
select public.bank_sync_begin('manual', 'real', :'ad') ->> 'runId' as r11 \gset
select public.bank_sync_apply(:'r11', jsonb_build_array(
  pg_temp.sync_row(30, 'GO-0300', 'rejected') || jsonb_build_object('problems', jsonb_build_array(
    jsonb_build_object('code', 'subtopic_is_topic', 'column', 'Subtema', 'value', repeat('x', 80)),
    jsonb_build_object('code', 'prompt_missing', 'column', 'Pregunta'))),
  pg_temp.sync_row(31, '', 'create')));
select public.bank_sync_finish(:'r11', null, '{}', 'partial', null);
select pg_temp.expect((select problems from public.bank_sync_row_results where run_id = :'r11' and row_number = 30)
  = jsonb_build_array(jsonb_build_object('code', 'subtopic_is_topic', 'column', 'Subtema', 'value', repeat('x', 60)),
                      jsonb_build_object('code', 'prompt_missing', 'column', 'Pregunta')), 'BS11. Los valores no se recortaron a 60');
select pg_temp.expect((select count(*) from public.bank_sync_row_results where run_id = :'r11' and outcome = 'rejected') = 2
  and not exists (select 1 from public.bank_questions where source_key = 'sheet:GO-0300'), 'BS11. Un rechazado dejó una pregunta');

-- Un renglón sin tarea detectada entra con su pendiente y no se aprueba hasta elegirla (revisión de B11)
begin;
select public.bank_sync_begin('manual', 'real', :'ad') ->> 'runId' as r11b \gset
select public.bank_sync_apply(:'r11b', jsonb_build_array(jsonb_set(
  pg_temp.sync_row(32, 'GO-0302', 'create', 'hash-302', p_incomplete => '["task_undetected"]'),
  '{question,task}', '""')));
select public.bank_sync_finish(:'r11b', null, '{}', 'ok', null);
select latest_version_id as v302 from public.bank_questions where source_key = 'sheet:GO-0302' \gset
select pg_temp.expect((select outcome from public.bank_sync_row_results where run_id = :'r11b' and row_number = 32) = 'created',
  'BS11. Un renglón sin tarea se rechazó');
select pg_temp.expect((select task is null and incomplete = '{task_undetected}' from public.questions where id = :'v302'),
  'BS11. La versión sin tarea no quedó con su pendiente');
select pg_temp.expect(public.bank_version_issues(:'v302') = '{task_undetected}', 'BS11. bank_version_issues no pidió la tarea');
-- El editor la recibe vacía y la huella compara con la tarea vacía del renglón
select pg_temp.expect(public.bank_version_json(:'v302', false) -> 'structure' ->> 'task' = ''
  and public.bank_sync_versions_content(array[:'v302']::uuid[]) -> 0 -> 'content' ->> 'task' = '',
  'BS11. La tarea vacía salió como otra');
rollback;

-- ===================================================================== BS12. Importación del admin
select pg_temp.set_setting('bank_sync', 'enabled', 'false');
begin;
select pg_temp.as_user(:'d1');
select pg_temp.expect(pg_temp.fails_with(format('select public.admin_bank_import(%L)',
  jsonb_build_array(pg_temp.sync_row(2, 'MI-0001', 'create'))::text)) = '42501', 'BS12. Un médico importó');
rollback;
begin;
select pg_temp.as_user(:'ad');
select public.admin_bank_import(jsonb_build_array(pg_temp.sync_row(2, 'MI-0001', 'create', 'imp-1', 'draft', 'PMS'),
  pg_temp.sync_row(3, 'MI-0002', 'rejected'))) as r12 \gset
commit;
select pg_temp.expect((:'r12')::jsonb @> '{"status":"partial","counts":{"read":2,"created":1,"rejected":1}}'::jsonb
  and (:'r12')::jsonb -> 'rows' -> 0 ->> 'outcome' = 'created', 'BS12. La importación no aplicó');
select pg_temp.expect((select run_trigger = 'import' and target = 'file' and mode = 'apply' from public.bank_sync_runs
  where id = ((:'r12')::jsonb ->> 'runId')::uuid), 'BS12. La corrida no es de importación');
select pg_temp.expect((select origin = 'import' and question_id = public.stable_bank_uuid('import-q', 'MI-0001') from public.bank_questions
  where source_key = 'import:MI-0001'), 'BS12. La importada no quedó con su origen');
select public.stable_bank_uuid('import-q', 'MI-0001') as mi1 \gset
begin;
select pg_temp.as_user(:'ad');
select pg_temp.expect(public.admin_bank_import(jsonb_build_array(pg_temp.sync_row(2, 'MI-0001', 'create', 'imp-1', 'draft', 'PMS')))
  @> '{"counts":{"unchanged":1,"created":0}}'::jsonb, 'BS12. Importar lo mismo otra vez cambió algo');
select pg_temp.expect(jsonb_array_length(public.admin_bank_sync_runs(5)) = 5
  and public.admin_bank_sync_runs(1) -> 0 ? 'trigger', 'BS12. admin_bank_sync_runs');
select pg_temp.expect(public.admin_bank_sync_rows(((:'r12')::jsonb ->> 'runId')::uuid, 'created')
  = jsonb_build_array(jsonb_build_object('rowNumber', 2, 'sheetKey', 'MI-0001', 'outcome', 'created', 'incomplete', '[]'::jsonb,
    'notices', '[]'::jsonb, 'problems', '[]'::jsonb, 'questionId', :'mi1')),
  'BS12. admin_bank_sync_rows');
commit;

-- ===================================================================== BS13. Sin texto
select pg_temp.expect(not exists (
  select 1 from public.bank_sync_row_results
  where problems::text ~ '\[Prueba\]|Opción|Justificación|Explicación simulada'
    or array_to_string(notices || incomplete, ',') ~ '\[Prueba\]' or coalesce(sheet_key, '') ~ '\[Prueba\]'),
  'BS13. El reporte de renglones trae texto de una pregunta');
select pg_temp.expect(not exists (select 1 from public.bank_sync_runs where counts::text ~ '\[Prueba\]' or coalesce(reason, '') ~ '\[Prueba\]'),
  'BS13. Una corrida trae texto');
select pg_temp.expect((select array_agg(column_name::text order by column_name::text) from information_schema.columns
  where table_schema = 'public' and table_name = 'bank_sync_row_results')
  = '{id,incomplete,notices,outcome,problems,question_id,row_number,run_id,sheet_key}', 'BS13. bank_sync_row_results tiene otra columna');

-- ===================================================================== BS14. Cron
-- En el Postgres de las pruebas no hay pg_cron, pg_net ni Vault, así que 20261023000006 no hizo nada
select pg_temp.expect(to_regnamespace('cron') is null and to_regnamespace('net') is null and to_regnamespace('vault') is null
  and not exists (select 1 from pg_extension where extname in ('pg_cron', 'pg_net')), 'BS14. La migración de Cron hizo algo sin sus piezas');
-- Con un Vault de prueba crea la ficha una sola vez, de 256 bits, y bank_sync_cron_ok la acepta. Sin
-- pg_cron no programa nada
begin;
create schema vault;
create table vault.secrets (id uuid primary key default gen_random_uuid(), name text unique, secret text, description text);
create view vault.decrypted_secrets as select id, name, secret as decrypted_secret, description from vault.secrets;
create function vault.create_secret(new_secret text, new_name text default null, new_description text default '',
  new_key_id uuid default null) returns uuid language sql as $$
  insert into vault.secrets (name, secret, description) values (new_name, new_secret, new_description) returning id
$$;
\ir ../migrations/20261023000006_bank_sync_cron.sql
\ir ../migrations/20261023000006_bank_sync_cron.sql
select pg_temp.expect((select count(*) = 1 and bool_and(decrypted_secret ~ '^[0-9a-f]{64}$') from vault.decrypted_secrets
  where name = 'bank_sync_cron_token'), 'BS14. La ficha no quedó una sola vez con 64 caracteres hexadecimales');
select decrypted_secret as cron_token from vault.decrypted_secrets where name = 'bank_sync_cron_token' \gset
select pg_temp.as_service();
select pg_temp.expect(public.bank_sync_cron_ok(:'cron_token'), 'BS14. bank_sync_cron_ok no aceptó la ficha nueva');
reset role;
select pg_temp.expect(to_regnamespace('cron') is null and not exists (select 1 from pg_extension where extname in ('pg_cron', 'pg_net')),
  'BS14. Sin pg_cron programó algo');
rollback;

-- ===================================================================== BS15. Nivel cognitivo (V4-B5)
-- La columna opcional Nivel cognitivo del Sheet llega a la versión nueva y a su contenido para comparar. Un
-- renglón sin la columna queda sin nivel, y su huella de contenido no cambia por esta columna
select pg_temp.set_setting('bank_sync', 'enabled', 'true');
select pg_temp.set_setting('bank_sync', 'minIntervalSeconds', '0');
select pg_temp.set_setting('bank_sync', 'mode', '"apply"');
select public.bank_sync_begin('manual', 'real', :'ad') ->> 'runId' as r15 \gset
select public.bank_sync_apply(:'r15', jsonb_build_array(
  jsonb_set(pg_temp.sync_row(70, 'GO-0501', 'create', 'hash-501'), '{question,cognitiveLevel}', '"application"'),
  pg_temp.sync_row(71, 'GO-0502', 'create', 'hash-502'))) as res15 \gset
select public.bank_sync_finish(:'r15', array['GO-0501', 'GO-0502'], '{"read":2,"created":2}', 'ok', null);
select pg_temp.expect((select array_agg(r ->> 'outcome' order by r ->> 'rowNumber') from jsonb_array_elements((:'res15')::jsonb) r) = '{created,created}',
  'BS15. No se crearon los dos renglones');
select pg_temp.latest(public.stable_bank_uuid('sheet-q', 'GO-0501')) as c1 \gset
select pg_temp.latest(public.stable_bank_uuid('sheet-q', 'GO-0502')) as c2 \gset
select pg_temp.expect((select cognitive_level from public.questions where id = :'c1') = 'application',
  'BS15. El renglón con nivel no lo dejó en la versión');
select pg_temp.expect((select cognitive_level from public.questions where id = :'c2') is null,
  'BS15. El renglón sin nivel quedó con nivel');
-- Lo que compara la función con la huella del renglón
select pg_temp.as_service();
select public.bank_sync_versions_content(array[:'c1', :'c2']::uuid[]) as content15 \gset
reset role;
select pg_temp.expect((select x -> 'content' ->> 'cognitiveLevel' from jsonb_array_elements((:'content15')::jsonb) x
  where x ->> 'versionId' = :'c1') = 'application', 'BS15. El contenido de la versión no dijo el nivel');
select pg_temp.expect((select x -> 'content' -> 'cognitiveLevel' from jsonb_array_elements((:'content15')::jsonb) x
  where x ->> 'versionId' = :'c2') = 'null'::jsonb, 'BS15. El contenido sin nivel no dijo null');
-- El contenido interno trae el nivel solo si el renglón lo trae
select pg_temp.expect(public.bank_sheet_content('sheet', 'GO-0501', pg_temp.sync_row(1, 'GO-0501', 'create') -> 'question'
    || '{"cognitiveLevel":"evaluation"}'::jsonb) ->> 'cognitiveLevel' = 'evaluation', 'BS15. bank_sheet_content no pasó el nivel');
select pg_temp.expect(public.bank_sheet_content('sheet', 'GO-0501', pg_temp.sync_row(1, 'GO-0501', 'create') -> 'question') ->> 'cognitiveLevel' is null,
  'BS15. bank_sheet_content inventó un nivel');

\echo 'TODAS LAS PRUEBAS DE LA SINCRONIZACION DEL BANCO PASARON'
