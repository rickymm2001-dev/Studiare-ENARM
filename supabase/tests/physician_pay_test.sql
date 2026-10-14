-- Pruebas del reporte de revisiones y pagos a médicos (B11, respuesta 58, 4.5 y 6.1 del plan de B11).
-- El resumen por médico y mes cuadra con el detalle y con review_decisions, en hora de Mérida. Usuarios
-- propios que empiezan con pa. Todo el texto es simulado.
\set ON_ERROR_STOP on
\ir bank_helpers.sql

\set m1 'fa000000-0000-0000-0000-0000000000d1'
\set m2 'fa000000-0000-0000-0000-0000000000d2'
\set m3 'fa000000-0000-0000-0000-0000000000d3'
\set st 'fa000000-0000-0000-0000-0000000000a1'
\set ad 'fa000000-0000-0000-0000-0000000000e1'

insert into auth.users (id, email, raw_user_meta_data) values
  (:'m1', 'pa-m1@x.mx', '{"alias":"Médica uno"}'),
  (:'m2', 'pa-m2@x.mx', '{"alias":"Médico dos"}'),
  (:'m3', 'pa-m3@x.mx', '{"alias":"Médica tres"}'),
  (:'st', 'pa-st@x.mx', '{"alias":"Alumno PA"}'),
  (:'ad', 'pa-ad@x.mx', '{"alias":"Admin PA"}');
update public.user_roles set role = 'physician' where user_id in (:'m1', :'m2', :'m3');
update public.user_roles set role = 'admin' where user_id = :'ad';
select user_id::text as owner from public.user_roles where role = 'owner' \gset
insert into public.physician_codes (code, user_id) values ('PAU', :'m1'), ('PAD', :'m2');

-- Seis versiones para decidir. Una decisión por versión y revisor
select count(pg_temp.bank_seed('PA-' || g, 'in_review')) from generate_series(1, 6) g;
select array_agg(latest_version_id order by source_key)::text as v from public.bank_questions where source_key like 'sheet:PA-%' \gset

-- Decisiones de tres médicos en agosto, septiembre y octubre de 2026. Las horas van en UTC. Mérida es
-- UTC-6, así que el 31 de agosto a las 23:30 de Mérida es el 1 de septiembre a las 05:30 UTC y cuenta en
-- agosto. El 31 de julio a las 23:00 de Mérida queda fuera del rango
insert into public.review_decisions (question_version_id, physician_id, decision, comment, decided_at) values
  ((:'v'::uuid[])[1], :'m1', 'approve', null, '2026-08-10 15:00:00Z'),
  ((:'v'::uuid[])[2], :'m1', 'approve', null, '2026-09-01 05:30:00Z'),
  ((:'v'::uuid[])[1], :'m2', 'request_changes', '[Prueba] Cambios', '2026-08-15 18:00:00Z'),
  ((:'v'::uuid[])[3], :'m1', 'reject', '[Prueba] Rechazo', '2026-09-03 17:00:00Z'),
  ((:'v'::uuid[])[2], :'m2', 'approve', null, '2026-09-10 17:00:00Z'),
  ((:'v'::uuid[])[3], :'m2', 'approve', null, '2026-09-30 23:00:00Z'),
  ((:'v'::uuid[])[1], :'m3', 'approve', null, '2026-09-12 12:00:00Z'),
  ((:'v'::uuid[])[2], :'m3', 'approve', null, '2026-10-02 12:00:00Z'),
  ((:'v'::uuid[])[3], :'m3', 'request_changes', '[Prueba] Cambios', '2026-10-20 12:00:00Z'),
  ((:'v'::uuid[])[4], :'m1', 'approve', null, '2026-10-05 12:00:00Z'),
  ((:'v'::uuid[])[5], :'m1', 'approve', null, '2026-08-01 05:00:00Z');
-- Un distractor atendido por el médico dos en septiembre
insert into public.distractor_flags (question_id, option_id, question_version_id, exposures, choices, attraction, source, status, resolved_at, resolved_by)
  select q.question_id, o.option_id, q.id, 150, 2, 0.0133, 'calibration', 'kept', '2026-09-20 12:00:00Z', :'m2'
  from public.questions q join public.question_options o on o.question_version_id = q.id and o.position = 1
  where q.id = (:'v'::uuid[])[6];

-- ===================================================================== PP1. Cuadre
begin;
select pg_temp.as_user(:'ad');
-- Solo los médicos de esta prueba. Las otras pruebas deciden con la hora de hoy
create temp table pp_summary on commit drop as
  select * from public.admin_review_report('2026-08-01', '2026-10-31') where physician_id in (:'m1', :'m2', :'m3');
create temp table pp_detail on commit drop as
  select * from public.admin_review_report_detail('2026-08-01', '2026-10-31') where physician_id in (:'m1', :'m2', :'m3');
-- Todo el reporte, de todos los médicos, cuadra con su detalle
select pg_temp.expect((select sum(reviewed) from public.admin_review_report('2026-08-01', '2026-10-31'))
  = (select count(*) from public.admin_review_report_detail('2026-08-01', '2026-10-31')), 'PP1. El reporte completo no cuadra');
select pg_temp.expect((select sum(reviewed) from pp_summary) = 10, 'PP1. El resumen no suma 10 revisiones');
select pg_temp.expect((select count(*) from pp_detail) = 10, 'PP1. El detalle no trae 10 filas');
select pg_temp.expect((select sum(approved + changes_requested + rejected) from pp_summary) = 10, 'PP1. Las tres decisiones no suman');
-- Por mes, el resumen cuadra con el detalle
select pg_temp.expect(not exists (
  select 1 from (select month, physician_id, count(*) as n from pp_detail group by 1, 2) d
  full join pp_summary s on s.month = d.month and s.physician_id = d.physician_id
  where coalesce(d.n, 0) <> coalesce(s.reviewed, 0)), 'PP1. El resumen no cuadra con el detalle por mes');
-- La de las 23:30 del 31 de agosto de Mérida cuenta en agosto
select pg_temp.expect((select approved from pp_summary where physician_id = :'m1' and month = '2026-08-01') = 2,
  'PP1. La decisión del 31 de agosto a las 23:30 de Mérida no contó en agosto');
select pg_temp.expect((select reviewed from pp_summary where physician_id = :'m1' and month = '2026-09-01') = 1
  and (select rejected from pp_summary where physician_id = :'m1' and month = '2026-09-01') = 1, 'PP1. Septiembre de la médica uno');
-- El 30 de septiembre a las 23:00 UTC es 17:00 de Mérida, todavía septiembre
select pg_temp.expect((select approved from pp_summary where physician_id = :'m2' and month = '2026-09-01') = 2, 'PP1. Septiembre del médico dos');
select pg_temp.expect((select distractors_resolved from pp_summary where physician_id = :'m2' and month = '2026-09-01') = 1,
  'PP1. El distractor atendido no contó');
select pg_temp.expect((select alias || '|' || code from pp_summary where physician_id = :'m1' limit 1) = 'Médica uno|PAU', 'PP1. Alias y clave');
select pg_temp.expect((select count(*) from pp_summary where physician_id = :'m3') = 2, 'PP1. La médica tres no trae sus dos meses');
select pg_temp.expect(position('@' in (select string_agg(alias, ',') from pp_summary)) = 0, 'PP1. El resumen trae un correo');
select pg_temp.expect((select question_key from pp_detail where physician_id = :'m1' order by decided_at limit 1) = 'PA-1'
  and (select decision from pp_detail where physician_id = :'m1' order by decided_at limit 1) = 'approve', 'PP1. Clave de la pregunta en el detalle');
select pg_temp.expect((select count(*) from public.admin_review_report_detail('2026-08-01', '2026-10-31', :'m3')) = 3, 'PP1. Detalle de un médico');
-- El 31 de julio de Mérida queda fuera del rango, y con el rango de julio aparece
select pg_temp.expect((select sum(reviewed) from public.admin_review_report('2026-07-01', '2026-07-31') where physician_id = :'m1') = 1, 'PP1. Julio');
commit;
select pg_temp.expect((select count(*) from public.review_decisions
  where (decided_at at time zone 'America/Merida')::date between '2026-08-01' and '2026-10-31'
    and physician_id in (:'m1', :'m2', :'m3')) = 10, 'PP1. review_decisions no tiene 10 en el rango');

-- ===================================================================== PP2. Permisos
begin;
select pg_temp.as_user(:'m1');
select pg_temp.expect(pg_temp.fails_with('select * from public.admin_review_report(''2026-08-01'', ''2026-10-31'')') = '42501',
  'PP2. Un médico leyó el reporte de pagos');
select pg_temp.expect(pg_temp.fails_with('select * from public.admin_review_report_detail(''2026-08-01'', ''2026-10-31'')') = '42501',
  'PP2. Un médico leyó el detalle');
-- El médico ve solo lo suyo
select pg_temp.expect(public.editor_my_reviews('2026-08-01', '2026-10-31') = '{"from":"2026-08-01","to":"2026-10-31","approved":3,"changesRequested":0,"rejected":1,"reviewed":4,"distractorsResolved":0}'::jsonb,
  'PP2. Mis revisiones de la médica uno');
select pg_temp.expect(pg_temp.fails_with('select public.editor_my_reviews(''2026-10-31'', ''2026-08-01'')') = '22023', 'PP2. Rango al revés');
rollback;
begin;
select pg_temp.as_user(:'m2');
select pg_temp.expect((public.editor_my_reviews('2026-09-01', '2026-09-30') ->> 'distractorsResolved')::int = 1
  and (public.editor_my_reviews('2026-09-01', '2026-09-30') ->> 'reviewed')::int = 2, 'PP2. Mis revisiones del médico dos');
rollback;
begin;
select pg_temp.as_user(:'st');
select pg_temp.expect(pg_temp.fails_with('select * from public.admin_review_report(''2026-08-01'', ''2026-10-31'')') = '42501',
  'PP2. Un alumno leyó el reporte');
select pg_temp.expect(pg_temp.fails_with('select public.editor_my_reviews(''2026-08-01'', ''2026-10-31'')') = '42501', 'PP2. Un alumno leyó revisiones');
rollback;
begin;
select pg_temp.as_anon();
select pg_temp.expect(pg_temp.is_blocked('select * from public.admin_review_report(''2026-08-01'', ''2026-10-31'')'), 'PP2. anon leyó el reporte');
rollback;
begin;
select pg_temp.as_user(:'owner');
select pg_temp.expect((select sum(reviewed) from public.admin_review_report('2026-08-01', '2026-10-31') where physician_id in (:'m1', :'m2', :'m3')) = 10,
  'PP2. El dueño no leyó el reporte');
rollback;

-- ===================================================================== PP3. Tarifa
begin;
select pg_temp.as_user(:'ad');
select pg_temp.expect((select bool_and(amount_mxn is null) from public.admin_review_report('2026-08-01', '2026-10-31')),
  'PP3. Sin tarifa el monto no es null');
commit;
select pg_temp.set_setting('physician_pay', 'perReviewMxn', '50');
begin;
select pg_temp.as_user(:'ad');
select pg_temp.expect((select bool_and(amount_mxn = reviewed * 50) from public.admin_review_report('2026-08-01', '2026-10-31'))
  and (select sum(amount_mxn) from public.admin_review_report('2026-08-01', '2026-10-31') where physician_id in (:'m1', :'m2', :'m3')) = 500,
  'PP3. Con tarifa de 50 el monto no es revisiones por 50');
commit;
select pg_temp.set_setting('physician_pay', 'perReviewMxn', 'null');

-- ===================================================================== PP4. Cuenta con revisiones
-- Un médico con decisiones no borra su cuenta solo, porque su historial respalda pagos (8.33). La base
-- responde 23503 y la decisión sigue con su nombre
select pg_temp.expect(pg_temp.fails_with(format('delete from auth.users where id = %L', :'m3')) = '23503',
  'PP4. Se borró la cuenta de un médico con revisiones');
select pg_temp.expect((select count(*) from public.review_decisions where physician_id = :'m3') = 3, 'PP4. Las decisiones perdieron al médico');

\echo 'TODAS LAS PRUEBAS DEL REPORTE DE PAGOS A MÉDICOS PASARON'
