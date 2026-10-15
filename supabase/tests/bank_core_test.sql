-- Pruebas del banco en la nube, lectura del alumno (B11, migraciones 20261023000001 y 20261023000002,
-- 6.1 del plan de B11). Corre sobre la base migrada después de las demás pruebas, con usuarios propios
-- que empiezan con bc. Aparecen los cinco tipos de usuario, sin sesión, alumno Gratis, alumno de pago,
-- médico y admin o dueño. Todo el texto es simulado.
\set ON_ERROR_STOP on
\ir bank_helpers.sql

\set f1 'bc000000-0000-0000-0000-0000000000f1'
\set f2 'bc000000-0000-0000-0000-0000000000f2'
\set f3 'bc000000-0000-0000-0000-0000000000f3'
\set p1 'bc000000-0000-0000-0000-0000000000a1'
\set p2 'bc000000-0000-0000-0000-0000000000a2'
\set p3 'bc000000-0000-0000-0000-0000000000a3'
\set p4 'bc000000-0000-0000-0000-0000000000a4'
\set p5 'bc000000-0000-0000-0000-0000000000a5'
\set p6 'bc000000-0000-0000-0000-0000000000a6'
\set p7 'bc000000-0000-0000-0000-0000000000a7'
\set m1 'bc000000-0000-0000-0000-0000000000d1'
\set ad 'bc000000-0000-0000-0000-0000000000e1'

insert into auth.users (id, email, raw_user_meta_data) values
  (:'f1', 'bc-f1@x.mx', '{"alias":"Gratis uno"}'),
  (:'f2', 'bc-f2@x.mx', '{"alias":"Gratis dos"}'),
  (:'f3', 'bc-f3@x.mx', '{"alias":"Gratis tres"}'),
  (:'p1', 'bc-p1@x.mx', '{"alias":"Mensual"}'),
  (:'p2', 'bc-p2@x.mx', '{"alias":"Prueba"}'),
  (:'p3', 'bc-p3@x.mx', '{"alias":"Pase"}'),
  (:'p4', 'bc-p4@x.mx', '{"alias":"Regalo"}'),
  (:'p5', 'bc-p5@x.mx', '{"alias":"Avisos"}'),
  (:'p6', 'bc-p6@x.mx', '{"alias":"Fundador anual"}'),
  (:'p7', 'bc-p7@x.mx', '{"alias":"Ya no paga"}'),
  (:'m1', 'bc-m1@x.mx', '{"alias":"Médica BC"}'),
  (:'ad', 'bc-ad@x.mx', '{"alias":"Admin BC"}');
update public.user_roles set role = 'physician' where user_id = :'m1';
update public.user_roles set role = 'admin' where user_id = :'ad';
-- Planes de pago de B10. Mensual activo, prueba gratis, pase de un solo pago y mes regalado
insert into public.subscriptions (user_id, plan, status, provider, current_period_end) values
  (:'p1', 'monthly', 'active', 'stripe', now() + interval '20 days'),
  (:'p2', 'monthly', 'trialing', 'stripe', now() + interval '5 days'),
  (:'p5', 'annual', 'active', 'stripe', now() + interval '200 days');
insert into public.plan_passes (user_id, plan, provider, provider_payment_id, method, starts_at, ends_at)
  values (:'p3', 'monthly', 'stripe', 'pi_bc_pass', 'oxxo', now() - interval '1 day', now() + interval '29 days');
insert into public.subscription_grants (user_id, kind, starts_at, ends_at)
  values (:'p4', 'admin', now() - interval '1 day', now() + interval '29 days');
-- Fundador anual (B10) y alguien que ya no paga, con la prueba cancelada y un pase vencido
insert into public.subscriptions (user_id, plan, status, provider, current_period_end) values
  (:'p6', 'founder_annual', 'active', 'stripe', now() + interval '300 days'),
  (:'p7', 'monthly', 'canceled', 'stripe', now() - interval '1 day');
insert into public.plan_passes (user_id, plan, provider, provider_payment_id, method, starts_at, ends_at)
  values (:'p7', 'monthly', 'stripe', 'pi_bc_pass_old', 'oxxo', now() - interval '40 days', now() - interval '10 days');
select pg_temp.expect(public.user_plan(:'p2') = 'monthly' and public.user_plan(:'p3') = 'monthly'
  and public.user_plan(:'p4') = 'monthly' and public.user_plan(:'f1') = 'free'
  and public.user_plan(:'p6') = 'founder_annual' and public.user_plan(:'p7') = 'free', 'BC0. Los planes de B10');

-- 25 preguntas publicadas, una sola por pregunta estable
select pg_temp.bank_seed('BC-' || lpad(g::text, 4, '0')) from generate_series(1, 25) g;
select array_agg(question_id order by source_key)::text as q25,
       (array_agg(question_id order by source_key))[1:10]::text as q10,
       (array_agg(question_id order by source_key))[11:25]::text as q15
  from public.bank_questions where source_key like 'sheet:BC-%' \gset

-- ===================================================================== BC1. Sin sesión
begin;
select pg_temp.as_anon();
select pg_temp.expect(pg_temp.is_blocked('select public.catalog_changes()'), 'BC1. anon leyó el catálogo');
select pg_temp.expect(pg_temp.is_blocked(format('select public.fetch_questions(%L::uuid[])', :'q10')), 'BC1. anon pidió preguntas');
select pg_temp.expect(pg_temp.is_blocked('select public.bank_quota()'), 'BC1. anon leyó su cuota');
select pg_temp.expect(pg_temp.is_blocked(format('select public.report_question(%L, %L)', gen_random_uuid(), 'typo')), 'BC1. anon reportó');
select pg_temp.expect(pg_temp.is_blocked('select public.bias_agreement_summary()'), 'BC1. anon leyó el acuerdo');
select pg_temp.expect(pg_temp.is_blocked('select count(*) from public.bank_questions'), 'BC1. anon leyó bank_questions');
select pg_temp.expect(pg_temp.is_blocked('select count(*) from public.question_catalog'), 'BC1. anon leyó el catálogo directo');
select pg_temp.expect(pg_temp.is_blocked('select count(*) from public.bank_reads'), 'BC1. anon leyó bank_reads');
select pg_temp.expect(pg_temp.is_blocked('select count(*) from public.questions'), 'BC1. anon leyó questions');
select pg_temp.expect(pg_temp.is_blocked('select count(*) from public.question_options'), 'BC1. anon leyó question_options');
select pg_temp.expect(pg_temp.is_blocked('select count(*) from public.clinical_cases'), 'BC1. anon leyó clinical_cases');
select pg_temp.expect(pg_temp.is_blocked('select count(*) from public.bank_taxonomy'), 'BC1. anon leyó la taxonomía del banco');
select pg_temp.expect((select count(*) from public.platform_settings where key in ('bank_limits', 'bank_goal')) = 2,
  'BC1. anon dejó de leer bank_limits y bank_goal');
select pg_temp.expect(not exists (select 1 from public.platform_settings where value::text ~* 'sheet_id|private_key'),
  'BC1. platform_settings trae un secreto');
rollback;
-- Un token sin usuario no llega a ninguna lectura
begin;
select pg_temp.as_user('');
select pg_temp.expect(pg_temp.fails_with('select public.catalog_changes()') = '28000', 'BC1. Sin usuario leyó el catálogo');
select pg_temp.expect(pg_temp.fails_with(format('select public.fetch_questions(%L::uuid[])', :'q10')) = '28000', 'BC1. Sin usuario pidió preguntas');
select pg_temp.expect(pg_temp.fails_with('select public.bank_quota()') = '28000', 'BC1. Sin usuario leyó la cuota');
select pg_temp.expect(pg_temp.fails_with(format('select public.report_question(%L, %L)', gen_random_uuid(), 'typo')) = '28000', 'BC1. Sin usuario reportó');
select pg_temp.expect(pg_temp.fails_with('select public.bias_agreement_summary()') = '28000', 'BC1. Sin usuario leyó el acuerdo');
rollback;

-- ===================================================================== BC2. Banco cerrado
-- Sin la clave feature_flags o sin cloudBank, el banco está cerrado. Otras pruebas pueden haberlo tocado
begin;
delete from public.platform_settings where key = 'feature_flags';
select pg_temp.expect(not public.bank_open_for_students(), 'BC2. Sin feature_flags el banco debía estar cerrado');
rollback;
select pg_temp.set_flag('cloudBank', false);
select pg_temp.expect(not public.bank_open_for_students(), 'BC2. Con cloudBank apagada el banco debía estar cerrado');
begin;
select pg_temp.as_user(:'f3');
select pg_temp.expect(public.catalog_changes() = '{"open":false,"rows":[],"nextSince":0,"done":true}'::jsonb,
  'BC2. Gratis vio el catálogo con el banco cerrado');
select pg_temp.expect(
  (select bool_and(d ->> 'reason' = 'closed') and count(*) = 10
   from jsonb_array_elements(public.fetch_questions(:'q10'::uuid[]) -> 'denied') d),
  'BC2. Gratis recibió cuerpos con el banco cerrado');
select pg_temp.expect(public.fetch_questions(:'q10'::uuid[]) -> 'questions' = '[]'::jsonb, 'BC2. Gratis recibió preguntas cerrado');
select pg_temp.expect((public.bank_quota() ->> 'open')::boolean = false, 'BC2. La cuota decía abierto');
rollback;
begin;
select pg_temp.as_user(:'p1');
select pg_temp.expect((public.catalog_changes() ->> 'open')::boolean = false, 'BC2. Pago vio el catálogo cerrado');
select pg_temp.expect(public.fetch_questions(:'q10'::uuid[]) -> 'denied' -> 0 ->> 'reason' = 'closed', 'BC2. Pago leyó cerrado');
rollback;
-- El equipo sí lee con el banco cerrado, para revisar cómo quedó lo publicado
begin;
select pg_temp.as_user(:'m1');
select pg_temp.expect((public.catalog_changes() ->> 'open')::boolean
  and (select count(*) from jsonb_array_elements(public.catalog_changes() -> 'rows') r
       where (r ->> 'questionId')::uuid = any (:'q25'::uuid[])) = 25, 'BC2. El médico no leyó el catálogo cerrado');
select pg_temp.expect(jsonb_array_length(public.fetch_questions(:'q10'::uuid[]) -> 'questions') = 10,
  'BC2. El médico no leyó los cuerpos cerrado');
rollback;
begin;
select pg_temp.as_user(:'ad');
select pg_temp.expect(jsonb_array_length(public.fetch_questions(:'q25'::uuid[]) -> 'questions') = 25,
  'BC2. El admin no leyó los cuerpos cerrado');
rollback;
begin;
select pg_temp.as_user((select user_id::text from public.user_roles where role = 'owner'));
select pg_temp.expect((select count(*) from jsonb_array_elements(public.catalog_changes() -> 'rows') r
  where (r ->> 'questionId')::uuid = any (:'q25'::uuid[])) = 25, 'BC2. El dueño no leyó el catálogo');
rollback;

-- ===================================================================== BC3. Gratis con 25 publicadas
select pg_temp.set_flag('cloudBank', true);
select pg_temp.expect(public.bank_open_for_students(), 'BC3. El banco no abrió con cloudBank');
begin;
select pg_temp.as_user(:'f1', 'ses-f1');
select pg_temp.expect((select count(*) from jsonb_array_elements(public.catalog_changes() -> 'rows') r
  where (r ->> 'questionId')::uuid = any (:'q25'::uuid[])) = 25, 'BC3. El catálogo no trae las 25');
-- Ninguna llave de texto en el catálogo
select pg_temp.expect(not (public.catalog_changes()::text ~ '"(prompt|vignette|explanation|options|rationale|text)"'),
  'BC3. El catálogo trae una llave de texto');
select pg_temp.expect(position('[Prueba]' in public.catalog_changes()::text) = 0, 'BC3. El catálogo trae texto');
-- Páginas desde un seq, sin repetir y hasta done
select pg_temp.expect(
  (public.catalog_changes(0, 10) ->> 'done')::boolean = false
  and jsonb_array_length(public.catalog_changes(0, 10) -> 'rows') = 10
  and jsonb_array_length(public.catalog_changes((public.catalog_changes(0, 10) ->> 'nextSince')::bigint, 1000) -> 'rows')
    = jsonb_array_length(public.catalog_changes() -> 'rows') - 10
  and (public.catalog_changes((public.catalog_changes(0, 10) ->> 'nextSince')::bigint, 1000) ->> 'done')::boolean,
  'BC3. Las páginas del catálogo no cuadran');
select pg_temp.expect(
  (select bool_and(r ? 'distractorBiases' and r ? 'caseSize' and r ->> 'status' = 'published')
   from jsonb_array_elements(public.catalog_changes() -> 'rows') r),
  'BC3. A una fila del catálogo le falta una llave');
select public.fetch_questions(:'q10'::uuid[]) as r \gset bc3_
commit;
select pg_temp.expect(jsonb_array_length((:'bc3_r')::jsonb -> 'questions') = 10, 'BC3. Pedir 10 no dio 10 cuerpos');
select pg_temp.expect((:'bc3_r')::jsonb -> 'questions' -> 0 ->> 'explanation' like '[Prueba] Explicación%',
  'BC3. El cuerpo no trae la explicación (respuesta 19)');
select pg_temp.expect(jsonb_array_length((:'bc3_r')::jsonb -> 'questions' -> 0 -> 'options') = 4, 'BC3. Faltan opciones');
select pg_temp.expect(((:'bc3_r')::jsonb -> 'quota' ->> 'used')::int = 10 and ((:'bc3_r')::jsonb -> 'quota' ->> 'left')::int = 10
  and ((:'bc3_r')::jsonb -> 'quota' ->> 'limit')::int = 20 and (:'bc3_r')::jsonb -> 'quota' ->> 'plan' = 'free',
  'BC3. La cuota no dice 10 de 20');
select pg_temp.expect((:'bc3_r')::jsonb -> 'quota' ->> 'day' = to_char(public.study_day(), 'YYYY-MM-DD'), 'BC3. Día de estudio');
select pg_temp.expect((:'bc3_r')::jsonb -> 'quota' ->> 'resetsAt' ~ '^\d{4}-\d{2}-\d{2}T10:00:00\.000Z$', 'BC3. resetsAt no es a las 4 de Mérida');
begin;
select pg_temp.as_user(:'f1', 'ses-f1');
-- Las mismas otra vez no gastan
select pg_temp.expect((public.fetch_questions(:'q10'::uuid[]) -> 'quota' ->> 'used')::int = 10, 'BC3. Repetir gastó');
-- 15 más dan 10 y 5 con daily_limit, en el orden pedido
select public.fetch_questions(:'q15'::uuid[]) as r \gset bc3b_
commit;
select pg_temp.expect(jsonb_array_length((:'bc3b_r')::jsonb -> 'questions') = 10
  and jsonb_array_length((:'bc3b_r')::jsonb -> 'denied') = 5
  and (select bool_and(d ->> 'reason' = 'daily_limit') from jsonb_array_elements((:'bc3b_r')::jsonb -> 'denied') d)
  and ((:'bc3b_r')::jsonb -> 'quota' ->> 'left')::int = 0,
  'BC3. Pedir 15 con 10 libres no dio 10 y 5 negadas');
select pg_temp.expect(
  (select array_agg(d ->> 'id' order by o) from jsonb_array_elements((:'bc3b_r')::jsonb -> 'denied') with ordinality x (d, o))
  = (select array_agg(x::text order by o) from unnest((:'q15'::uuid[])[11:15]) with ordinality u (x, o)),
  'BC3. Las negadas no son las últimas pedidas');
select pg_temp.expect((select count(*) from public.bank_reads where user_id = :'f1') = 20, 'BC3. bank_reads no tiene 20');
begin;
select pg_temp.as_user(:'f1', 'ses-f1');
-- Ya en 20, lo nuevo sale con daily_limit y lo ya abierto sigue saliendo
select pg_temp.expect(public.fetch_questions(:'q25'::uuid[]) -> 'denied' @> '[{"reason":"daily_limit"}]'::jsonb
  and jsonb_array_length(public.fetch_questions(:'q25'::uuid[]) -> 'questions') = 20, 'BC3. En 20 no negó lo nuevo');
-- Leer las tablas directo da permiso negado
select pg_temp.expect(pg_temp.is_blocked('select count(*) from public.questions'), 'BC3. Gratis leyó questions directo');
select pg_temp.expect(pg_temp.is_blocked('select count(*) from public.question_options'), 'BC3. Gratis leyó question_options');
select pg_temp.expect(pg_temp.is_blocked('select count(*) from public.clinical_cases'), 'BC3. Gratis leyó clinical_cases');
select pg_temp.expect(pg_temp.is_blocked('select count(*) from public.question_catalog'), 'BC3. Gratis leyó el catálogo directo');
select pg_temp.expect(pg_temp.is_blocked('select count(*) from public.bank_reads'), 'BC3. Gratis leyó bank_reads');
select pg_temp.expect(pg_temp.is_blocked($q$insert into public.bank_reads (user_id, question_id, version_id, day, plan, purpose) values (auth.uid(), gen_random_uuid(), gen_random_uuid(), current_date, 'free', 'practice')$q$),
  'BC3. Gratis escribió bank_reads');
-- Un propósito desconocido y pedir de más fallan como entrada inválida
select pg_temp.expect(pg_temp.fails_with(format('select public.fetch_questions(%L::uuid[], null, %L)', :'q10', 'robar')) = '22023', 'BC3. Propósito');
select pg_temp.expect(pg_temp.fails_with('select public.fetch_questions(array(select gen_random_uuid() from generate_series(1, 101)))') = '22023',
  'BC3. Pedir 101 a la vez');
rollback;

-- Borrador, rechazada y retirada
select pg_temp.bank_seed('BC-D001', 'draft') as draft_q \gset
select pg_temp.bank_seed('BC-R001', 'rejected') as rejected_q \gset
select pg_temp.bank_seed('BC-T001') as retired_q \gset
begin;
select pg_temp.as_user(:'ad');
select public.admin_retire_question(:'retired_q', 'Prueba de retiro');
commit;
begin;
select pg_temp.as_user(:'f2', 'ses-f2');
select public.fetch_questions(array[:'draft_q', :'rejected_q', :'retired_q']::uuid[]) as r \gset bc3c_
rollback;
select pg_temp.expect((:'bc3c_r')::jsonb -> 'denied' = jsonb_build_array(
    jsonb_build_object('id', :'draft_q', 'reason', 'not_found'),
    jsonb_build_object('id', :'rejected_q', 'reason', 'not_found'),
    jsonb_build_object('id', :'retired_q', 'reason', 'retired')),
  'BC3. Borrador, rechazada o retirada salieron mal');
select pg_temp.expect((select status from public.question_catalog where question_id = :'retired_q') = 'retired',
  'BC3. La retirada no quedó retirada en el catálogo');

-- Un caso de 3 con 2 libres sale entero negado sin gastar
select pg_temp.bank_case('BC-C1') as case1 \gset
select pg_temp.bank_seed('BC-C1-' || g, 'approved', :'case1', g) from generate_series(1, 3) g;
select array_agg(question_id order by source_key)::text as qcase from public.bank_questions where source_key like 'sheet:BC-C1-%' \gset
select pg_temp.expect((select count(*) from public.question_catalog where case_id = :'case1' and case_size = 3) = 3,
  'BC3. El caso no se publicó completo con su tamaño');
begin;
select pg_temp.as_user(:'f2', 'ses-f2');
select pg_temp.expect((public.fetch_questions((:'q25'::uuid[])[1:18]) -> 'quota' ->> 'left')::int = 2, 'BC3. f2 no quedó con 2');
select pg_temp.expect(
  (select count(*) from jsonb_array_elements(public.fetch_questions(:'qcase'::uuid[]) -> 'denied') d where d ->> 'reason' = 'daily_limit') = 3,
  'BC3. El caso de 3 con 2 libres no salió entero negado');
select pg_temp.expect((public.bank_quota() ->> 'used')::int = 18, 'BC3. El caso negado gastó');
-- Con lo que queda sí entra una pregunta suelta
select pg_temp.expect(jsonb_array_length(public.fetch_questions((:'q25'::uuid[])[19:19]) -> 'questions') = 1, 'BC3. No entró la 19');
commit;

-- Una versión nueva publicada el mismo día no gasta otra vez
select (:'q10'::uuid[])[1] as first_q \gset
select public.bank_insert_version(:'first_q', pg_temp.bank_content(777), 'sheet', null, null, null, null, '{}') as v2 \gset
update public.questions set editorial_status = 'approved' where id = :'v2';
update public.bank_questions set latest_version_id = :'v2' where question_id = :'first_q';
select public.bank_publish(:'first_q');
begin;
select pg_temp.as_user(:'f1', 'ses-f1');
select public.fetch_questions(array[:'first_q']::uuid[]) as r \gset bc3d_
commit;
select pg_temp.expect((:'bc3d_r')::jsonb -> 'questions' -> 0 ->> 'versionId' = :'v2'
  and ((:'bc3d_r')::jsonb -> 'questions' -> 0 ->> 'version')::int = 2, 'BC3. No salió la versión nueva');
select pg_temp.expect((select count(*) from public.bank_reads where user_id = :'f1') = 20, 'BC3. La versión nueva gastó otra vez');

-- El dispositivo desplazado no lee
begin;
select pg_temp.as_user(:'f3', 'ses-a');
select public.claim_device('bc-dev-a', 'Chrome');
commit;
begin;
select pg_temp.as_user(:'f3', 'ses-b');
select public.claim_device('bc-dev-b', 'Safari');
commit;
begin;
select pg_temp.as_user(:'f3', 'ses-a');
select pg_temp.expect(pg_temp.fails_with(format('select public.fetch_questions(%L::uuid[])', :'q10')) = '42501', 'BC3. Desplazado pidió preguntas');
select pg_temp.expect(pg_temp.fails_with('select public.catalog_changes()') = '42501', 'BC3. Desplazado leyó el catálogo');
select pg_temp.expect(pg_temp.fails_with('select public.bank_quota()') = '42501', 'BC3. Desplazado leyó la cuota');
select pg_temp.expect(pg_temp.fails_with(format('select public.report_question(%L, %L)', gen_random_uuid(), 'typo')) = '42501', 'BC3. Desplazado reportó');
rollback;

-- Al día siguiente se renueva. El superusuario apaga el freno de bank_reads solo para mover el día
alter table public.bank_reads disable trigger bank_reads_append_only;
update public.bank_reads set day = day - 1 where user_id = :'f1';
alter table public.bank_reads enable trigger bank_reads_append_only;
begin;
select pg_temp.as_user(:'f1', 'ses-f1');
select pg_temp.expect((public.bank_quota() ->> 'used')::int = 0, 'BC3. Al día siguiente la cuota no se renovó');
select pg_temp.expect(jsonb_array_length(public.fetch_questions((:'q25'::uuid[])[21:25]) -> 'questions') = 5, 'BC3. Al día siguiente no leyó');
commit;

-- ===================================================================== BC4. Planes de pago y freno
-- Mensual, prueba, pase y mes regalado no tienen tope
begin;
select pg_temp.as_user(:'p2');
select pg_temp.expect(jsonb_array_length(public.fetch_questions(:'q25'::uuid[]) -> 'questions') = 25
  and (public.bank_quota() ->> 'limit') is null and (public.bank_quota() ->> 'left') is null, 'BC4. La prueba gratis tuvo tope');
rollback;
begin;
select pg_temp.as_user(:'p3');
select pg_temp.expect(jsonb_array_length(public.fetch_questions(:'q25'::uuid[]) -> 'questions') = 25, 'BC4. El pase tuvo tope');
rollback;
begin;
select pg_temp.as_user(:'p4');
select pg_temp.expect(jsonb_array_length(public.fetch_questions(:'q25'::uuid[]) -> 'questions') = 25, 'BC4. El mes regalado tuvo tope');
rollback;
begin;
select pg_temp.as_user(:'p6');
select pg_temp.expect(jsonb_array_length(public.fetch_questions(:'q25'::uuid[]) -> 'questions') = 25
  and public.bank_quota() @> '{"plan":"founder_annual","limit":null}', 'BC4. El Fundador anual tuvo tope');
rollback;
-- Con la prueba cancelada y el pase vencido vuelve el tope de Gratis
begin;
select pg_temp.as_user(:'p7');
select public.fetch_questions(:'q25'::uuid[]) as r \gset bc4b_
select pg_temp.expect(public.bank_quota() @> '{"plan":"free","limit":20,"left":0}', 'BC4. Quien ya no paga no tiene la cuota de Gratis');
rollback;
select pg_temp.expect(jsonb_array_length((:'bc4b_r')::jsonb -> 'questions') = 20
  and (select count(*) from jsonb_array_elements((:'bc4b_r')::jsonb -> 'denied') d where d ->> 'reason' = 'daily_limit') = 5,
  'BC4. Quien ya no paga leyó sin tope');
-- 300 preguntas más para el freno de 300 por minuto
select count(pg_temp.bank_seed('BK-' || lpad(g::text, 4, '0'))) from generate_series(1, 300) g;
select (array_agg(question_id order by source_key))[1:100]::text as k1,
       (array_agg(question_id order by source_key))[101:200]::text as k2,
       (array_agg(question_id order by source_key))[201:280]::text as k3,
       (array_agg(question_id order by source_key))[281:300]::text as k4
  from public.bank_questions where source_key like 'sheet:BK-%' \gset
begin;
select pg_temp.as_user(:'p1');
select pg_temp.expect(jsonb_array_length(public.fetch_questions(:'k1'::uuid[], null, 'exam') -> 'questions') = 100, 'BC4. 100 en el minuto');
select pg_temp.expect(jsonb_array_length(public.fetch_questions(:'k2'::uuid[], null, 'exam') -> 'questions') = 100, 'BC4. 200 en el minuto');
select pg_temp.expect(jsonb_array_length(public.fetch_questions(:'k3'::uuid[], null, 'exam') -> 'questions') = 80, 'BC4. 280 en el minuto');
select pg_temp.expect(jsonb_array_length(public.fetch_questions(:'k4'::uuid[], null, 'exam') -> 'questions') = 20, 'BC4. 300 en el minuto');
-- La 301 del mismo minuto sale con freno y la hora para volver
select public.fetch_questions((:'q25'::uuid[])[1:1]) as r \gset bc4_
commit;
select pg_temp.expect((:'bc4_r')::jsonb -> 'denied' -> 0 ->> 'reason' = 'brake', 'BC4. La 301 no salió con freno');
select pg_temp.expect(((:'bc4_r')::jsonb -> 'quota' -> 'brake' ->> 'retryAt')::timestamptz > now(), 'BC4. Sin retryAt');
select pg_temp.expect((select count(*) from public.bank_reads where user_id = :'p1') = 300, 'BC4. El freno gastó');
select pg_temp.expect(exists (select 1 from public.bank_read_alerts where user_id = :'p1' and kind = 'brake'), 'BC4. Sin aviso de freno');
select pg_temp.expect((select count(*) from public.bank_read_alerts where user_id = :'p1' and kind = 'week_share') = 1,
  'BC4. Leer casi todo el catálogo en la semana no avisó');
-- Con alertDaily en 30 nace un aviso daily_volume sin bloquear, una sola vez por día
select pg_temp.set_setting('bank_limits', 'alertDaily', '30');
select pg_temp.set_setting('bank_limits', 'alertWeekShare', '0.9');
begin;
select pg_temp.as_user(:'p5');
select pg_temp.expect(jsonb_array_length(public.fetch_questions(:'q25'::uuid[]) -> 'questions') = 25, 'BC4. Avisos, 25');
commit;
select pg_temp.expect(not exists (select 1 from public.bank_read_alerts where user_id = :'p5'), 'BC4. Avisó antes de 30');
begin;
select pg_temp.as_user(:'p5');
select pg_temp.expect(jsonb_array_length(public.fetch_questions((:'k1'::uuid[])[1:10]) -> 'questions') = 10, 'BC4. El aviso bloqueó');
select pg_temp.expect(jsonb_array_length(public.fetch_questions((:'k1'::uuid[])[11:20]) -> 'questions') = 10, 'BC4. El aviso bloqueó después');
commit;
select pg_temp.expect((select count(*) from public.bank_read_alerts where user_id = :'p5' and kind = 'daily_volume') = 1
  and not exists (select 1 from public.bank_read_alerts where user_id = :'p5' and kind = 'week_share'),
  'BC4. daily_volume no salió una sola vez');
select pg_temp.set_setting('bank_limits', 'alertWeekShare', '0.1');
begin;
select pg_temp.as_user(:'p5');
select public.fetch_questions((:'k1'::uuid[])[21:21]);
commit;
select pg_temp.expect(exists (select 1 from public.bank_read_alerts where user_id = :'p5' and kind = 'week_share'), 'BC4. Sin week_share');
select pg_temp.set_setting('bank_limits', 'alertDaily', '600');
select pg_temp.set_setting('bank_limits', 'alertWeekShare', '0.5');

-- ===================================================================== BC5 y BC6. Equipo
begin;
select pg_temp.as_user(:'m1');
select pg_temp.expect(jsonb_array_length(public.fetch_questions(:'k1'::uuid[]) -> 'questions') = 100
  and jsonb_array_length(public.fetch_questions(:'k2'::uuid[]) -> 'questions') = 100
  and jsonb_array_length(public.fetch_questions(:'k3'::uuid[]) -> 'questions') = 80
  and jsonb_array_length(public.fetch_questions(:'k4'::uuid[]) -> 'questions') = 20
  and jsonb_array_length(public.fetch_questions(:'q25'::uuid[]) -> 'questions') = 25, 'BC5. El médico tuvo tope o freno');
select pg_temp.expect(public.bank_quota() ->> 'plan' = 'physician' and (public.bank_quota() ->> 'limit') is null, 'BC5. Cuota del médico');
rollback;
begin;
select pg_temp.as_user(:'ad');
select pg_temp.expect(public.bank_quota() ->> 'plan' = 'admin' and (public.bank_quota() ->> 'limit') is null, 'BC6. Cuota del admin');
rollback;
-- Con requireMfa (B9), el equipo sin segundo factor cuenta como alumno. Con el banco cerrado no lo ve y
-- abierto tiene el tope de Gratis. Con aal2 vuelve a leer siempre y sin tope
begin;
select pg_temp.set_flag('requireMfa', true);
select pg_temp.set_flag('cloudBank', false);
select pg_temp.as_user(:'m1', null, 'aal1');
select pg_temp.expect(public.current_app_role() = 'student'
  and public.bank_quota() @> '{"plan":"free","open":false,"limit":20}'
  and public.catalog_changes() @> '{"open":false,"rows":[]}'
  and public.fetch_questions(:'q25'::uuid[]) -> 'denied' -> 0 ->> 'reason' = 'closed',
  'BC5. El médico sin segundo factor vio el banco cerrado');
select pg_temp.as_user(:'ad', null, 'aal1');
select pg_temp.expect(public.current_app_role() = 'student'
  and public.bank_quota() @> '{"plan":"free","open":false}' and public.catalog_changes() @> '{"open":false}',
  'BC6. El admin sin segundo factor vio el banco cerrado');
select pg_temp.as_user(:'m1', null, 'aal2');
select pg_temp.expect(public.bank_quota() @> '{"plan":"physician","open":true,"limit":null}'
  and public.catalog_changes() @> '{"open":true}'
  and jsonb_array_length(public.fetch_questions(:'q25'::uuid[]) -> 'questions') = 25,
  'BC5. El médico con segundo factor no leyó el banco cerrado sin tope');
select pg_temp.as_user(:'ad', null, 'aal2');
select pg_temp.expect(public.bank_quota() @> '{"plan":"admin","open":true,"limit":null}', 'BC6. El admin con segundo factor');
rollback;
begin;
select pg_temp.set_flag('requireMfa', true);
select pg_temp.as_user(:'m1', null, 'aal1');
select public.fetch_questions(:'q25'::uuid[]) as r \gset bc5_
rollback;
select pg_temp.expect(jsonb_array_length((:'bc5_r')::jsonb -> 'questions') = 20
  and (select count(*) from jsonb_array_elements((:'bc5_r')::jsonb -> 'denied') d where d ->> 'reason' = 'daily_limit') = 5,
  'BC5. El médico sin segundo factor no tuvo el tope de Gratis');

-- ===================================================================== BC7. Versión exacta
-- La versión 1 ya reemplazada se lee por p_version_ids y gasta como la misma pregunta. Una que nunca se
-- aprobó sale not_found
select q.id as v1 from public.questions q where q.question_id = :'first_q' and q.version = 1 \gset
select public.bank_insert_version(:'first_q', pg_temp.bank_content(778), 'sheet', null, null, null, null, '{}') as v3 \gset
update public.bank_questions set latest_version_id = :'v3' where question_id = :'first_q';
begin;
select pg_temp.as_user(:'f2', 'ses-f2');
select public.fetch_questions(null, array[:'v1', :'v3']::uuid[], 'duel') as r \gset bc7_
commit;
select pg_temp.expect((:'bc7_r')::jsonb -> 'questions' -> 0 ->> 'versionId' = :'v1', 'BC7. No salió la versión exacta');
select pg_temp.expect((:'bc7_r')::jsonb -> 'denied' = jsonb_build_array(jsonb_build_object('id', :'v3', 'reason', 'not_found')),
  'BC7. Una versión sin aprobar salió');
select pg_temp.expect((select count(*) from public.bank_reads where user_id = :'f2') = 19
  and (select count(*) from public.bank_reads where user_id = :'f2' and question_id = :'first_q') = 1,
  'BC7. La versión exacta no gastó como la misma pregunta');
select pg_temp.expect((select purpose from public.bank_reads where user_id = :'f2' and question_id = :'first_q') = 'practice',
  'BC7. La lectura de antes se editó');

-- ===================================================================== BC8. Duelos
insert into public.groups (id, name, invite_code, owner_id) values ('bc000000-0000-0000-0000-00000000aaaa', 'Grupo BC', 'BCDUEL', :'p1');
insert into public.memberships (group_id, user_id) values
  ('bc000000-0000-0000-0000-00000000aaaa', :'p1'), ('bc000000-0000-0000-0000-00000000aaaa', :'p2');
select pg_temp.expect(pg_temp.fails_with(format(
  'insert into public.party_duels (group_id, challenger_id, opponent_id, question_ids) values (%L, %L, %L, array[%L])',
  'bc000000-0000-0000-0000-00000000aaaa', :'p1', :'p2', '01HZY3K8Q2W4T5V6X7Y8Z9A0BC')) = '22023',
  'BC8. Con el banco abierto entró un id de la demo');
select pg_temp.expect(pg_temp.fails_with(format(
  'insert into public.party_duels (group_id, challenger_id, opponent_id, question_ids) values (%L, %L, %L, array[%L])',
  'bc000000-0000-0000-0000-00000000aaaa', :'p1', :'p2', :'v3')) = '22023',
  'BC8. Entró una versión sin aprobar');
select pg_temp.expect(pg_temp.fails_with(format(
  'insert into public.party_duels (group_id, challenger_id, opponent_id, question_ids) values (%L, %L, %L, array[%L, %L])',
  'bc000000-0000-0000-0000-00000000aaaa', :'p1', :'p2', :'v1', :'v2')) is null,
  'BC8. No entraron versiones aprobadas');
select pg_temp.set_flag('cloudBank', false);
select pg_temp.expect(pg_temp.fails_with(format(
  'insert into public.party_duels (group_id, challenger_id, opponent_id, question_ids) values (%L, %L, %L, array[%L])',
  'bc000000-0000-0000-0000-00000000aaaa', :'p1', :'p2', '01HZY3K8Q2W4T5V6X7Y8Z9A0BC')) is null,
  'BC8. Con la bandera apagada no entró un id de la demo');
select pg_temp.set_flag('cloudBank', true);

-- ===================================================================== BC9. Bitácora
select pg_temp.expect(pg_temp.fails_with('update public.bank_reads set purpose = ''other''') = '42501',
  'BC9. El superusuario editó bank_reads');
begin;
select pg_temp.as_user(:'f1', 'ses-f1');
select pg_temp.expect(pg_temp.is_blocked('delete from public.bank_reads'), 'BC9. Un alumno borró bank_reads con la API');
select pg_temp.expect(pg_temp.is_blocked('update public.bank_reads set day = day - 1'), 'BC9. Un alumno editó bank_reads');
rollback;
begin;
select pg_temp.as_service();
select pg_temp.expect(pg_temp.is_blocked('delete from public.bank_reads'), 'BC9. service_role borró bank_reads');
select pg_temp.expect(pg_temp.is_blocked('select count(*) from public.bank_reads'), 'BC9. service_role leyó bank_reads');
rollback;

-- ===================================================================== BC10. Ids
-- Todo id que crean las funciones del banco convierte a ULID, porque su primer dígito va de 0 a 7
select pg_temp.expect((select count(*) from public.questions where version_source is not null and id::text !~ '^[0-7]') = 0,
  'BC10. Una versión no convierte a ULID');
select pg_temp.expect((select count(*) from public.question_options o join public.questions q on q.id = o.question_version_id
  where q.version_source is not null and (o.id::text !~ '^[0-7]' or o.option_id::text !~ '^[0-7]')) = 0,
  'BC10. Una opción no convierte a ULID');
select pg_temp.expect((select count(*) from public.bank_questions r join public.questions q on q.id = r.latest_version_id
  where q.version_source is not null and r.question_id::text !~ '^[0-7]') = 0,
  'BC10. Una pregunta estable no convierte a ULID');
select pg_temp.expect((select bool_and(public.stable_bank_uuid('x', g::text)::text ~ '^[0-7]') from generate_series(1, 500) g),
  'BC10. stable_bank_uuid dio un id que no convierte');
select pg_temp.expect(public.stable_bank_uuid('sheet-q', 'GO-0001') = public.stable_bank_uuid('sheet-q', 'GO-0001')
  and public.stable_bank_uuid('sheet-q', 'GO-0001') <> public.stable_bank_uuid('sheet-opt', 'GO-0001'),
  'BC10. stable_bank_uuid no es estable o no separa espacios');
select pg_temp.expect((select bool_and(public.ulid_uuid()::text ~ '^0') from generate_series(1, 200)), 'BC10. ulid_uuid no empieza con 0');
select pg_temp.expect(public.ulid_uuid() <> public.ulid_uuid(), 'BC10. ulid_uuid se repite');
-- Los primeros 48 bits son la hora en milisegundos, así ordena por tiempo como un ULID
select pg_temp.expect(abs(('x' || left(replace(public.ulid_uuid()::text, '-', ''), 12))::bit(48)::bigint
  - floor(extract(epoch from clock_timestamp()) * 1000)::bigint) < 5000, 'BC10. ulid_uuid no lleva la hora');

-- ===================================================================== BC11. Permisos de funciones
do $$
declare
  internal text[] := array[
    'public.ulid_uuid()', 'public.stable_bank_uuid(text, text)', 'public.bank_iso(timestamptz)',
    'public.bank_taxonomy_has(text, text, text)', 'public.bank_open_for_students()', 'public.bank_limits()',
    'public.bank_limit(text, numeric)', 'public.forbid_bank_changes()', 'public.bank_version_issues(uuid)',
    'public.bank_incomplete_of(text[])', 'public.bank_refresh_incomplete(uuid)', 'public.bank_publish(uuid)',
    'public.bank_catalog_retire(uuid)', 'public.bank_catalog_json(public.question_catalog)',
    'public.bank_body_json(uuid)', 'public.bank_quota_json(uuid, boolean, text, boolean, timestamptz)',
    'public.party_duels_check_questions()', 'public.grant_question_access(uuid)', 'public.can_access_question(uuid)'];
  student text[] := array[
    'public.catalog_changes(bigint, integer)', 'public.fetch_questions(uuid[], uuid[], text)', 'public.bank_quota()'];
  f text;
  r text;
begin
  foreach f in array internal loop
    foreach r in array array['anon', 'authenticated', 'service_role'] loop
      if has_function_privilege(r, f, 'execute') then raise exception 'FALLA BC11. % ejecuta la ayuda interna %', r, f; end if;
    end loop;
  end loop;
  foreach f in array student loop
    if not has_function_privilege('authenticated', f, 'execute') then raise exception 'FALLA BC11. authenticated no ejecuta %', f; end if;
    if has_function_privilege('anon', f, 'execute') then raise exception 'FALLA BC11. anon ejecuta %', f; end if;
    if has_function_privilege('service_role', f, 'execute') then raise exception 'FALLA BC11. service_role ejecuta %', f; end if;
  end loop;
  -- Las tablas del banco no tienen permisos para la API, y content_reports solo leer y crear
  foreach f in array array['public.bank_questions', 'public.question_catalog', 'public.bank_reads', 'public.bank_read_alerts',
      'public.bank_taxonomy', 'public.bank_bias_tags', 'public.questions', 'public.question_options',
      'public.clinical_cases', 'public.review_assignments', 'public.review_decisions'] loop
    foreach r in array array['anon', 'authenticated', 'service_role'] loop
      if has_table_privilege(r, f, 'select') or has_table_privilege(r, f, 'insert') or has_table_privilege(r, f, 'update') then
        raise exception 'FALLA BC11. % tiene permisos sobre %', r, f;
      end if;
    end loop;
  end loop;
  if not has_table_privilege('authenticated', 'public.content_reports', 'insert')
     or not has_table_privilege('authenticated', 'public.content_reports', 'select')
     or has_table_privilege('authenticated', 'public.content_reports', 'update')
     or has_table_privilege('anon', 'public.content_reports', 'select') then
    raise exception 'FALLA BC11. Permisos de content_reports';
  end if;
end $$;

-- ===================================================================== BC12. Candado del seq del catálogo
-- bank_publish y bank_catalog_retire toman el mismo candado antes de pedir un seq, así el orden en que se
-- confirman es el del seq (M3 de la revisión). Se ve en pg_locks dentro de la transacción
create or replace function pg_temp.holds_catalog_seq_lock() returns boolean language sql as $$
  select exists (
    select 1 from pg_locks
    where locktype = 'advisory' and pid = pg_backend_pid() and objsubid = 1
      and classid::bigint = ((hashtextextended('bank-catalog-seq', 0) >> 32) & 4294967295)
      and objid::bigint = (hashtextextended('bank-catalog-seq', 0) & 4294967295)
  )
$$;
begin;
select pg_temp.expect(not pg_temp.holds_catalog_seq_lock(), 'BC12. El candado ya estaba tomado');
select pg_temp.bank_seed('BC-L001') as lock_q \gset
select pg_temp.expect(pg_temp.holds_catalog_seq_lock(), 'BC12. bank_publish no tomó el candado del seq');
rollback;
begin;
select public.bank_catalog_retire(:'first_q');
select pg_temp.expect(pg_temp.holds_catalog_seq_lock(), 'BC12. bank_catalog_retire no tomó el candado del seq');
rollback;

\echo 'TODAS LAS PRUEBAS DEL BANCO, LECTURA DEL ALUMNO, PASARON'
