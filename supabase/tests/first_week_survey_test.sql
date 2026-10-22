-- Pruebas de la encuesta de los primeros días (B18, migraciones 20261030000001 y 20261030000002). Corre al final
-- sobre la misma base, con usuarios propios. Cada bloque falla con un error si algo no cumple.
--   S1. Permisos. La tabla no se toca por la API y cada tipo de usuario (anónimo, alumno, médico, admin y dueño)
--       ve solo lo suyo. Un dispositivo desplazado no contesta
--   S2. submit_survey con el ajuste, la fecha y los días cumplidos, y el rechazo de lo que no cumple las reglas
--   S3. Una sola respuesta por cuenta y códigos sin repetir
--   S4. Solo se agrega. Cambiar falla, borrar directo falla, la función del alumno borra solo lo propio y borrar la
--       cuenta arrastra la fila. Borrar mis datos no la toca
--   S5. Las funciones del equipo no traen user_id, correo, alias, fecha ni días de la cuenta, y ordenan por código
--   S6. my_survey_response es solo lo propio
--   S7. El ajuste se valida campo por campo, y médicos, admins y cuentas posteriores a la fecha límite no la ven
\set ON_ERROR_STOP on

-- Sesión de un usuario con su nivel de autenticación. session_id es el del token, que usa la barrera del
-- dispositivo único
create or replace function pg_temp.as_user(uid text, aal text default 'aal1', sid text default null)
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claim', '', true);
  perform set_config('request.jwt.claims', jsonb_build_object(
    'sub', uid, 'role', 'authenticated', 'aal', aal,
    'session_id', coalesce(sid, 'b18-sesion-' || uid))::text, true);
  execute 'set local role authenticated';
end $$;

create or replace function pg_temp.expect(ok boolean, msg text) returns void language plpgsql as $$
begin
  if not coalesce(ok, false) then raise exception 'FALLA %', msg; end if;
end $$;

-- El código SQLSTATE con el que falla una sentencia, o null si no falla
create or replace function pg_temp.fails_with(stmt text) returns text language plpgsql as $$
begin
  execute stmt;
  return null;
exception when others then
  return sqlstate;
end $$;

-- El código y el mensaje con el que falla una sentencia, o null si no falla
create or replace function pg_temp.error_of(stmt text) returns text language plpgsql as $$
begin
  execute stmt;
  return null;
exception when others then
  return sqlstate || ' ' || sqlerrm;
end $$;

-- Prende o apaga el segundo factor del equipo en la bandera que comparten la app y el servidor
create or replace function pg_temp.require_mfa(p_flag jsonb) returns void language sql as $$
  insert into public.platform_settings (key, value) values ('feature_flags', jsonb_build_object('requireMfa', p_flag))
  on conflict (key) do update set value = public.platform_settings.value || jsonb_build_object('requireMfa', p_flag)
$$;

-- Escribe el ajuste de la encuesta tal cual, para probar cada campo
create or replace function pg_temp.set_survey(p_value jsonb) returns void language sql as $$
  insert into public.platform_settings (key, value) values ('survey_first_week', p_value)
  on conflict (key) do update set value = excluded.value
$$;

-- Escribe el ajuste tal cual y devuelve lo que lee survey_setting, ya validado
create or replace function pg_temp.cfg(p_value jsonb) returns jsonb language plpgsql as $$
declare
  v_row record;
begin
  perform pg_temp.set_survey(p_value);
  select * into v_row from public.survey_setting();
  return to_jsonb(v_row);
end $$;

-- El ajuste bueno, ya prendido y con la espera de siempre
create or replace function pg_temp.survey_on(p_delay integer default 7, p_until text default null) returns void
language sql as $$
  select pg_temp.set_survey(jsonb_build_object(
    'enabled', true, 'id', 'first-week-v1', 'delay_days', p_delay, 'accounts_until', p_until))
$$;

-- Unas respuestas buenas, con lo que se pida cambiar encima
create or replace function pg_temp.good(p_extra jsonb default '{}') returns jsonb language sql as $$
  select jsonb_build_object(
    'days_used', 'd5_6', 'used', jsonb_build_array('review', 'practice'), 'clarity', 4, 'ease', 5, 'useful', 4,
    'blockers', jsonb_build_array('slow'), 'recommend', 'yes') || p_extra
$$;

-- Contesta como un alumno y deja la sesión como estaba
create or replace function pg_temp.submit_as(uid text, p_answers jsonb, p_comment text default null)
returns jsonb language plpgsql as $$
declare
  v_reply jsonb;
begin
  perform pg_temp.as_user(uid);
  v_reply := public.submit_survey('first-week-v1', p_answers, p_comment);
  execute 'reset role';
  return v_reply;
end $$;

-- El resumen del equipo, pedido por el admin de la prueba. Deja la sesión como estaba
create or replace function pg_temp.summary_as_admin(p_survey text default 'first-week-v1') returns jsonb
language plpgsql as $$
declare
  v_reply jsonb;
begin
  perform pg_temp.as_user('b1800000-0000-0000-0000-000000000006', 'aal2');
  v_reply := public.admin_survey_summary(p_survey);
  execute 'reset role';
  return v_reply;
end $$;

-- ===================================================================== Usuarios
-- A1 alumna con 10 días, A2 alumna con 2 días, A3 alumna con 10 días (la que borra lo suyo), A4 alumna con 10 días
-- sin correo confirmado, M médica, D admin. El dueño es el de rls_test
insert into auth.users (id, email, raw_user_meta_data, email_confirmed_at, created_at) values
  ('b1800000-0000-0000-0000-000000000001', 'b18-alumna1@x.mx', '{"alias":"Alumna Uno B18"}', now(), now() - interval '10 days'),
  ('b1800000-0000-0000-0000-000000000002', 'b18-alumna2@x.mx', '{"alias":"Alumna Dos B18"}', now(), now() - interval '2 days'),
  ('b1800000-0000-0000-0000-000000000003', 'b18-alumna3@x.mx', '{"alias":"Alumna Tres B18"}', now(), now() - interval '10 days'),
  ('b1800000-0000-0000-0000-000000000004', 'b18-alumna4@x.mx', '{"alias":"Alumna Cuatro B18"}', null, now() - interval '10 days'),
  ('b1800000-0000-0000-0000-000000000005', 'b18-medica@x.mx', '{"alias":"Médica B18"}', now(), now() - interval '30 days'),
  ('b1800000-0000-0000-0000-000000000006', 'b18-admin@x.mx', '{"alias":"Admin B18"}', now(), now() - interval '30 days');
update public.user_roles set role = 'physician' where user_id = 'b1800000-0000-0000-0000-000000000005';
update public.user_roles set role = 'admin' where user_id = 'b1800000-0000-0000-0000-000000000006';

do $$
declare
  v_owner uuid;
begin
  select user_id into v_owner from public.user_roles where role = 'owner';
  if v_owner is null then
    v_owner := 'b1800000-0000-0000-0000-000000000007';
    insert into auth.users (id, email, raw_user_meta_data, email_confirmed_at, created_at)
      values (v_owner, 'b18-dueno@x.mx', '{"alias":"Dueño B18"}', now(), now() - interval '60 days');
    update public.user_roles set role = 'owner' where user_id = v_owner;
  end if;
  perform set_config('b18.owner', v_owner::text, false);
end $$;

-- ===================================================================== S0. Lo que nace con la migración
-- El ajuste nace apagado, con el id y la espera de siempre y sin fecha límite
select pg_temp.expect(
  (select value from public.platform_settings where key = 'survey_first_week')
    = '{"enabled":false,"id":"first-week-v1","delay_days":7,"accounts_until":null}'::jsonb,
  'S0. El ajuste de la encuesta no nace apagado y con los valores de siempre'
);
select pg_temp.expect(
  (select enabled from public.survey_setting()) is false
  and (select id from public.survey_setting()) = 'first-week-v1'
  and (select delay_days from public.survey_setting()) = 7
  and (select accounts_until from public.survey_setting()) is null,
  'S0. survey_setting no lee el ajuste de fábrica'
);

-- survey_answers_ok es una función pura. Las respuestas buenas pasan y cada regla rota se rechaza
select pg_temp.expect(public.survey_answers_ok('first-week-v1', pg_temp.good()), 'S0. Unas respuestas buenas no pasaron');
select pg_temp.expect(
  public.survey_answers_ok('first-week-v1', pg_temp.good('{"used":["none"],"blockers":["nothing"]}'))
  and public.survey_answers_ok('first-week-v1', pg_temp.good(jsonb_build_object('blockers', jsonb_build_array('slow', 'error', 'unclear_start'))))
  and public.survey_answers_ok('first-week-v1', pg_temp.good('{"clarity":1,"ease":1,"useful":1,"recommend":"no","days_used":"d0"}'))
  and public.survey_answers_ok('first-week-v1', pg_temp.good(jsonb_build_object('used', jsonb_build_array(
        'review', 'practice', 'exam', 'outlines', 'progress', 'party', 'tutor', 'import')))),
  'S0. Un borde válido (nada, nada me frenó, tres motivos, todas las opciones) no pasó'
);
select pg_temp.expect(
  not public.survey_answers_ok('otra-encuesta', pg_temp.good())
  and not public.survey_answers_ok(null, pg_temp.good())
  and not public.survey_answers_ok('first-week-v1', null)
  and not public.survey_answers_ok('first-week-v1', '[]'::jsonb)
  and not public.survey_answers_ok('first-week-v1', '"texto"'::jsonb)
  and not public.survey_answers_ok('first-week-v1', 'null'::jsonb),
  'S0. Se aceptó una encuesta ajena o algo que no es un objeto'
);

-- ===================================================================== S1. Permisos
select pg_temp.expect(
  not has_table_privilege('anon', 'public.survey_responses', 'select,insert,update,delete')
  and not has_table_privilege('authenticated', 'public.survey_responses', 'select,insert,update,delete')
  and not has_table_privilege('service_role', 'public.survey_responses', 'select,insert,update,delete')
  and (select relrowsecurity from pg_class where oid = 'public.survey_responses'::regclass)
  and not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'survey_responses'),
  'S1. survey_responses debe tener RLS, ninguna política y ningún permiso de tabla para la API'
);
select pg_temp.expect(
  not has_function_privilege('anon', 'public.my_survey_status()', 'execute')
  and not has_function_privilege('anon', 'public.submit_survey(text, jsonb, text)', 'execute')
  and not has_function_privilege('anon', 'public.my_survey_response()', 'execute')
  and not has_function_privilege('anon', 'public.delete_my_survey_response()', 'execute')
  and not has_function_privilege('anon', 'public.admin_survey_summary(text)', 'execute')
  and not has_function_privilege('anon', 'public.admin_survey_responses(text)', 'execute')
  and not has_function_privilege('service_role', 'public.admin_survey_responses(text)', 'execute')
  and not has_function_privilege('service_role', 'public.my_survey_status()', 'execute'),
  'S1. Un anónimo o la llave de servicio puede ejecutar una función de la encuesta'
);

-- Un anónimo no llega a ninguna
begin;
set local role anon;
select pg_temp.expect(
  pg_temp.fails_with($q$select public.my_survey_status()$q$) = '42501'
  and pg_temp.fails_with($q$select public.submit_survey('first-week-v1', '{}', null)$q$) = '42501'
  and pg_temp.fails_with($q$select public.my_survey_response()$q$) = '42501'
  and pg_temp.fails_with($q$select public.delete_my_survey_response()$q$) = '42501'
  and pg_temp.fails_with($q$select * from public.admin_survey_summary('first-week-v1')$q$) = '42501'
  and pg_temp.fails_with($q$select * from public.admin_survey_responses('first-week-v1')$q$) = '42501'
  and pg_temp.fails_with($q$select count(*) from public.survey_responses$q$) = '42501',
  'S1. Un anónimo llegó a una función o a la tabla de la encuesta'
);
rollback;

-- Una alumna con sesión no toca la tabla ni escribe en ella, aunque marque que está borrando
begin;
select pg_temp.as_user('b1800000-0000-0000-0000-000000000001');
select pg_temp.expect(
  pg_temp.fails_with($q$select count(*) from public.survey_responses$q$) = '42501'
  and pg_temp.fails_with($q$insert into public.survey_responses (user_id, survey_id, respondent_code, days_since_signup, answers)
      values ('b1800000-0000-0000-0000-000000000001', 'first-week-v1', 'RABCDEF', 10, '{}')$q$) = '42501'
  and pg_temp.fails_with($q$update public.survey_responses set comment = 'x'$q$) = '42501'
  and pg_temp.fails_with($q$delete from public.survey_responses$q$) = '42501',
  'S1. Una alumna llegó a la tabla de la encuesta por la API'
);
select set_config('app.erasing_user', 'b1800000-0000-0000-0000-000000000001', true);
select pg_temp.expect(
  pg_temp.fails_with($q$delete from public.survey_responses$q$) = '42501',
  'S1. Marcar app.erasing_user abrió la tabla a una alumna'
);
rollback;

-- Apagada, a nadie le toca. La alumna ve su estado, que dice que no está disponible
begin;
select pg_temp.as_user('b1800000-0000-0000-0000-000000000001');
select pg_temp.expect(
  (public.my_survey_status() ->> 'available')::boolean is false
  and (public.my_survey_status() ->> 'answered')::boolean is false
  and public.my_survey_status() ->> 'surveyId' = 'first-week-v1'
  and (public.my_survey_status() ->> 'daysSinceSignup')::integer = 10
  and (public.my_survey_status() - 'daysSinceSignup' - 'surveyId' - 'answered' - 'available') = '{}'::jsonb,
  'S1. El estado de la encuesta apagada no dice que no está disponible'
);
select pg_temp.expect(
  public.submit_survey('first-week-v1', pg_temp.good(), 'Con la encuesta apagada') = '{"ok": false, "reason": "closed"}'::jsonb,
  'S1. Se pudo contestar con la encuesta apagada'
);
reset role;
rollback;
select pg_temp.expect(
  (select count(*) from public.survey_responses) = 0,
  'S1. La encuesta apagada dejó una fila'
);

-- Con la encuesta prendida, la espera de 7 días decide
select pg_temp.survey_on(7);
begin;
select pg_temp.as_user('b1800000-0000-0000-0000-000000000001');
select pg_temp.expect(
  (public.my_survey_status() ->> 'available')::boolean is true,
  'S1. La alumna con 10 días no tiene la encuesta disponible'
);
reset role;
select pg_temp.as_user('b1800000-0000-0000-0000-000000000002');
select pg_temp.expect(
  (public.my_survey_status() ->> 'available')::boolean is false
  and (public.my_survey_status() ->> 'daysSinceSignup')::integer = 2
  and public.submit_survey('first-week-v1', pg_temp.good(), null) = '{"ok": false, "reason": "closed"}'::jsonb,
  'S1. La alumna con 2 días tiene la encuesta a los 7'
);
reset role;
rollback;

-- Las funciones del alumno, con la encuesta prendida, piden sesión
begin;
select set_config('request.jwt.claims', '', true);
select set_config('request.jwt.claim.sub', '', true);
set local role authenticated;
select pg_temp.expect(
  pg_temp.fails_with($q$select public.my_survey_status()$q$) = '28000'
  and pg_temp.fails_with($q$select public.submit_survey('first-week-v1', '{}', null)$q$) = '28000'
  and pg_temp.fails_with($q$select public.my_survey_response()$q$) = '28000'
  and pg_temp.fails_with($q$select public.delete_my_survey_response()$q$) = '28000',
  'S1. Una sesión sin usuario llegó a una función del alumno'
);
rollback;

-- Un dispositivo que ya no es el activo no contesta, no ve su estado ni borra a nombre de la cuenta
begin;
select pg_temp.as_user('b1800000-0000-0000-0000-000000000001', 'aal1', 'b18-sesion-ganadora');
select public.claim_device('b18-dispositivo-a', 'Prueba B18');
reset role;
select pg_temp.as_user('b1800000-0000-0000-0000-000000000001', 'aal1', 'b18-sesion-desplazada');
select pg_temp.expect(
  pg_temp.fails_with($q$select public.my_survey_status()$q$) = '42501'
  and pg_temp.fails_with($q$select public.submit_survey('first-week-v1', '{}', null)$q$) = '42501'
  and pg_temp.fails_with($q$select public.my_survey_response()$q$) = '42501'
  and pg_temp.fails_with($q$select public.delete_my_survey_response()$q$) = '42501',
  'S1. Un dispositivo desplazado llegó a una función del alumno'
);
reset role;
-- El dispositivo activo sí
select pg_temp.as_user('b1800000-0000-0000-0000-000000000001', 'aal1', 'b18-sesion-ganadora');
select pg_temp.expect(
  (public.my_survey_status() ->> 'available')::boolean is true,
  'S1. El dispositivo activo no ve la encuesta'
);
reset role;
rollback;

-- La médica, el admin y el dueño no la ven ni la contestan, y no cuentan como alumnos aunque su sesión no tenga el
-- segundo factor y current_app_role los vea como alumnos
select set_config('b18.flags', coalesce((select value::text from public.platform_settings where key = 'feature_flags'), ''), false);
select pg_temp.require_mfa('true'::jsonb);
begin;
select pg_temp.as_user('b1800000-0000-0000-0000-000000000005');
select pg_temp.expect(
  public.current_app_role() = 'student'
  and (public.my_survey_status() ->> 'available')::boolean is false
  and public.submit_survey('first-week-v1', pg_temp.good(), null) = '{"ok": false, "reason": "closed"}'::jsonb
  and pg_temp.fails_with($q$select * from public.admin_survey_summary('first-week-v1')$q$) = '42501',
  'S1. Una médica sin segundo factor vio o contestó la encuesta'
);
reset role;
select pg_temp.as_user('b1800000-0000-0000-0000-000000000006');
select pg_temp.expect(
  public.current_app_role() = 'student'
  and (public.my_survey_status() ->> 'available')::boolean is false
  and public.submit_survey('first-week-v1', pg_temp.good(), null) = '{"ok": false, "reason": "closed"}'::jsonb
  and pg_temp.fails_with($q$select * from public.admin_survey_summary('first-week-v1')$q$) = '42501'
  and pg_temp.fails_with($q$select * from public.admin_survey_responses('first-week-v1')$q$) = '42501',
  'S1. Un admin sin segundo factor vio o contestó la encuesta'
);
reset role;
-- Con el segundo factor, el admin y el dueño ven los conteos y las respuestas, y siguen sin poder contestar
select pg_temp.as_user('b1800000-0000-0000-0000-000000000006', 'aal2');
select pg_temp.expect(
  (public.admin_survey_summary('first-week-v1') ->> 'answered')::integer = 0
  and (select count(*) from public.admin_survey_responses('first-week-v1')) = 0
  and (public.my_survey_status() ->> 'available')::boolean is false
  and public.submit_survey('first-week-v1', pg_temp.good(), null) = '{"ok": false, "reason": "closed"}'::jsonb,
  'S1. El admin con segundo factor no ve los conteos o pudo contestar'
);
reset role;
select pg_temp.as_user(current_setting('b18.owner'), 'aal2');
select pg_temp.expect(
  (public.admin_survey_summary('first-week-v1') ->> 'answered')::integer = 0
  and (public.my_survey_status() ->> 'available')::boolean is false
  and public.submit_survey('first-week-v1', pg_temp.good(), null) = '{"ok": false, "reason": "closed"}'::jsonb,
  'S1. El dueño no ve los conteos o pudo contestar'
);
reset role;
-- Una alumna no llega a lo del equipo, tenga o no el segundo factor
select pg_temp.as_user('b1800000-0000-0000-0000-000000000001', 'aal2');
select pg_temp.expect(
  pg_temp.fails_with($q$select * from public.admin_survey_summary('first-week-v1')$q$) = '42501'
  and pg_temp.fails_with($q$select * from public.admin_survey_responses('first-week-v1')$q$) = '42501',
  'S1. Una alumna llegó a las funciones del equipo'
);
reset role;
rollback;
-- La bandera queda como estaba
do $$ begin
  if current_setting('b18.flags') = '' then
    delete from public.platform_settings where key = 'feature_flags';
  else
    update public.platform_settings set value = current_setting('b18.flags')::jsonb where key = 'feature_flags';
  end if;
end $$;

-- ===================================================================== S2. submit_survey
select pg_temp.survey_on(7);

-- Una encuesta con otro id, o con la encuesta apagada, está cerrada
begin;
select pg_temp.as_user('b1800000-0000-0000-0000-000000000001');
select pg_temp.expect(
  public.submit_survey('otra-encuesta', pg_temp.good(), null) = '{"ok": false, "reason": "closed"}'::jsonb
  and public.submit_survey(null, pg_temp.good(), null) = '{"ok": false, "reason": "closed"}'::jsonb,
  'S2. Se contestó una encuesta que no es la del ajuste'
);
reset role;
rollback;

-- Cada regla rota se rechaza con invalid y sin dejar nada
begin;
select pg_temp.as_user('b1800000-0000-0000-0000-000000000001');
do $$
declare
  v_case record;
  v_reply jsonb;
begin
  for v_case in
    select * from (values
      ('falta una llave', pg_temp.good() - 'ease'),
      ('sobra una llave', pg_temp.good('{"nps": 9}')),
      ('días fuera de la lista', pg_temp.good('{"days_used":"d8"}')),
      ('días como número', pg_temp.good('{"days_used":3}')),
      ('escala en cero', pg_temp.good('{"clarity":0}')),
      ('escala en seis', pg_temp.good('{"ease":6}')),
      ('escala con decimal', pg_temp.good('{"useful":3.5}')),
      ('escala con texto', pg_temp.good('{"useful":"3"}')),
      ('escala con nulo', pg_temp.good('{"clarity":null}')),
      ('qué usó vacío', pg_temp.good('{"used":[]}')),
      ('qué usó con una opción ajena', pg_temp.good('{"used":["review","chat"]}')),
      ('qué usó repetido', pg_temp.good('{"used":["review","review"]}')),
      ('qué usó con nada y algo más', pg_temp.good('{"used":["none","review"]}')),
      ('qué usó como texto', pg_temp.good('{"used":"review"}')),
      ('qué usó con un número', pg_temp.good('{"used":[1]}')),
      ('motivos vacío', pg_temp.good('{"blockers":[]}')),
      ('cuatro motivos', pg_temp.good('{"blockers":["slow","error","unclear_start","few_questions"]}')),
      ('nada me frenó con otro', pg_temp.good('{"blockers":["nothing","slow"]}')),
      ('motivo ajeno', pg_temp.good('{"blockers":["price"]}')),
      ('recomendación ajena', pg_temp.good('{"recommend":"nps9"}')),
      ('respuestas como lista', '[1,2,3]'::jsonb),
      ('respuestas como texto', '"hola"'::jsonb),
      ('respuestas nulas', null::jsonb),
      ('objeto vacío', '{}'::jsonb)
    ) as t(label, answers)
  loop
    v_reply := public.submit_survey('first-week-v1', v_case.answers, null);
    if v_reply is distinct from '{"ok": false, "reason": "invalid"}'::jsonb then
      raise exception 'FALLA S2. "%" no se rechazó con invalid y dio %', v_case.label, v_reply;
    end if;
  end loop;
end $$;
-- Los comentarios que no sirven
select pg_temp.expect(
  public.submit_survey('first-week-v1', pg_temp.good(), repeat('a', 501)) = '{"ok": false, "reason": "invalid"}'::jsonb
  and public.submit_survey('first-week-v1', pg_temp.good(), 'escríbeme a alguien@correo.mx para platicar') = '{"ok": false, "reason": "invalid"}'::jsonb
  and public.submit_survey('first-week-v1', pg_temp.good(), 'mi correo es A.B+c@Sub.Dominio.COM') = '{"ok": false, "reason": "invalid"}'::jsonb
  and public.submit_survey('first-week-v1', pg_temp.good(), 'mi cel es 55 1234 5678') = '{"ok": false, "reason": "invalid"}'::jsonb
  and public.submit_survey('first-week-v1', pg_temp.good(), 'llámame al +52 (55) 1234-5678') = '{"ok": false, "reason": "invalid"}'::jsonb
  and public.submit_survey('first-week-v1', pg_temp.good(), '5512345678') = '{"ok": false, "reason": "invalid"}'::jsonb
  -- Un correo disfrazado: con espacios, con la arroba de ancho completo, con un carácter de ancho cero, escrito (at) o
  -- arroba, y un teléfono con rayas y puntos medios o con dígitos de ancho completo
  and public.submit_survey('first-week-v1', pg_temp.good(), 'ana @ ejemplo . mx') = '{"ok": false, "reason": "invalid"}'::jsonb
  and public.submit_survey('first-week-v1', pg_temp.good(), 'ana' || chr(65312) || 'ejemplo.mx') = '{"ok": false, "reason": "invalid"}'::jsonb
  and public.submit_survey('first-week-v1', pg_temp.good(), 'ana' || chr(8203) || '@ejemplo.mx') = '{"ok": false, "reason": "invalid"}'::jsonb
  and public.submit_survey('first-week-v1', pg_temp.good(), 'ana (at) ejemplo.mx') = '{"ok": false, "reason": "invalid"}'::jsonb
  and public.submit_survey('first-week-v1', pg_temp.good(), 'ana arroba ejemplo punto mx') = '{"ok": false, "reason": "invalid"}'::jsonb
  and public.submit_survey('first-week-v1', pg_temp.good(), '55 ' || chr(8211) || ' 1234 ' || chr(8211) || ' 5678') = '{"ok": false, "reason": "invalid"}'::jsonb
  and public.submit_survey('first-week-v1', pg_temp.good(), '55' || chr(183) || '1234' || chr(183) || '5678') = '{"ok": false, "reason": "invalid"}'::jsonb
  and public.submit_survey('first-week-v1', pg_temp.good(), chr(65301) || chr(65301) || chr(65297) || chr(65298) || chr(65299) || chr(65300) || chr(65301) || chr(65302) || chr(65303) || chr(65304)) = '{"ok": false, "reason": "invalid"}'::jsonb,
  'S2. Se aceptó un comentario largo, con correo o con teléfono, también disfrazados'
);
reset role;
rollback;
select pg_temp.expect(
  (select count(*) from public.survey_responses) = 0,
  'S2. Un rechazo dejó una fila'
);

-- Lo que sí cabe en un comentario. Números cortos, una fecha, la sigla at sin paréntesis y 500 caracteres justos. La
-- palabra arroba sola ya no cabe: es una forma de escribir un correo
select pg_temp.expect(
  public.survey_comment_ok('Tardó 3 segundos en cargar, como 12 veces en 2 días')
  and not public.survey_comment_ok('Mejor poner arroba en lugar del símbolo')
  and public.survey_comment_ok('El aviso decía look at this y no lo entendí')
  and public.survey_comment_ok(repeat('a', 500))
  and public.survey_comment_ok('Quiero que el 5 de enero salga el simulacro 7')
  and not public.survey_comment_ok('')
  and not public.survey_comment_ok(null)
  and not public.survey_comment_ok(repeat('a', 501)),
  'S2. survey_comment_ok rechaza lo que sí cabe o acepta lo que no'
);

-- Los mismos casos que corren en Vitest (src/config/surveys.test.ts, commentProblem), de
-- tests/fixtures/survey-comments.json. survey_comment_ok debe decir que sirve justo en los que la app deja pasar. Cada
-- caso trae los caracteres invisibles y de ancho completo con su escape de Unicode, que jsonb vuelve el carácter
\set comment_cases `cat "$SURVEY_COMMENTS_FILE"`
select pg_temp.expect(
  jsonb_array_length((:'comment_cases'::jsonb) -> 'cases') >= 40
  and exists (select 1 from jsonb_array_elements((:'comment_cases'::jsonb) -> 'cases') c where c -> 'problem' = 'null'::jsonb)
  and exists (select 1 from jsonb_array_elements((:'comment_cases'::jsonb) -> 'cases') c where c ->> 'problem' = 'phone')
  and exists (select 1 from jsonb_array_elements((:'comment_cases'::jsonb) -> 'cases') c where position(chr(8203) in c ->> 'comment') > 0)
  and exists (select 1 from jsonb_array_elements((:'comment_cases'::jsonb) -> 'cases') c where position(chr(65312) in c ->> 'comment') > 0)
  and exists (select 1 from jsonb_array_elements((:'comment_cases'::jsonb) -> 'cases') c where position(chr(65301) in c ->> 'comment') > 0),
  'S2. La lista compartida de comentarios no llegó completa o perdió sus caracteres invisibles y de ancho completo'
);
select coalesce(string_agg(c ->> 'name', '; '), '') as failures
  from jsonb_array_elements((:'comment_cases'::jsonb) -> 'cases') c
  where public.survey_comment_ok(c ->> 'comment') is distinct from (c -> 'problem' = 'null'::jsonb) \gset comment_
select pg_temp.expect(:'comment_failures' = '', 'S2. survey_comment_ok no da lo mismo que commentProblem en: ' || :'comment_failures');

-- Contestar bien guarda la fila con un código, los días y el comentario sin espacios sobrantes
select pg_temp.expect(
  (select (pg_temp.submit_as('b1800000-0000-0000-0000-000000000001', pg_temp.good(), '  Me costó ubicar Simular  ') ->> 'code')
     ~ '^R[0-9A-F]{6}$'),
  'S2. Contestar bien no devolvió un código R y 6 caracteres hexadecimales'
);
select pg_temp.expect(
  (select count(*) from public.survey_responses where user_id = 'b1800000-0000-0000-0000-000000000001') = 1
  and (select comment from public.survey_responses where user_id = 'b1800000-0000-0000-0000-000000000001') = 'Me costó ubicar Simular'
  and (select days_since_signup from public.survey_responses where user_id = 'b1800000-0000-0000-0000-000000000001') = 10
  and (select survey_id from public.survey_responses where user_id = 'b1800000-0000-0000-0000-000000000001') = 'first-week-v1'
  and (select answers from public.survey_responses where user_id = 'b1800000-0000-0000-0000-000000000001') = pg_temp.good(),
  'S2. La fila guardada no trae el código, los días, el comentario limpio y las respuestas'
);
-- Un comentario vacío o de espacios se guarda como null, y un comentario de 500 caracteres cabe
select pg_temp.expect(
  (pg_temp.submit_as('b1800000-0000-0000-0000-000000000003', pg_temp.good('{"used":["none"],"blockers":["nothing"]}'), '   ') ->> 'ok')::boolean,
  'S2. No se pudo contestar con un comentario de espacios'
);
-- Una sentencia aparte para leer: la subconsulta no ve lo que la función escribe en la misma sentencia
select pg_temp.expect(
  (select comment is null from public.survey_responses where user_id = 'b1800000-0000-0000-0000-000000000003'),
  'S2. Un comentario de espacios no se guardó como null'
);

-- Una cuenta con el correo sin confirmar no pasa por aquí (no tiene sesión en el proyecto real), pero la base no la
-- cuenta como elegible. Se prueba en S5

-- Con 0 días de espera se contesta de inmediato
select pg_temp.survey_on(0);
select pg_temp.expect(
  (pg_temp.submit_as('b1800000-0000-0000-0000-000000000002', pg_temp.good(), repeat('a', 500)) ->> 'ok')::boolean,
  'S2. Con 0 días de espera no se pudo contestar'
);
select pg_temp.expect(
  (select days_since_signup from public.survey_responses where user_id = 'b1800000-0000-0000-0000-000000000002') = 2
  and (select char_length(comment) from public.survey_responses where user_id = 'b1800000-0000-0000-0000-000000000002') = 500,
  'S2. Los días guardados o el comentario de 500 caracteres no son los de la prueba'
);
select pg_temp.survey_on(7);

-- La tabla es la segunda defensa. Aunque alguien llegue a insertar como dueño de la base, las reglas se cumplen
select pg_temp.expect(
  pg_temp.fails_with($q$insert into public.survey_responses (user_id, survey_id, respondent_code, days_since_signup, answers)
    values ('b1800000-0000-0000-0000-000000000004', 'first-week-v1', 'R000001', 10, '{"clarity":4}')$q$) = '23514'
  and pg_temp.fails_with($q$insert into public.survey_responses (user_id, survey_id, respondent_code, days_since_signup, answers, comment)
    values ('b1800000-0000-0000-0000-000000000004', 'first-week-v1', 'R000002', 10,
      '{"days_used":"d0","used":["none"],"clarity":1,"ease":1,"useful":1,"blockers":["nothing"],"recommend":"no"}', 'a@b.mx')$q$) = '23514'
  and pg_temp.fails_with($q$insert into public.survey_responses (user_id, survey_id, respondent_code, days_since_signup, answers)
    values ('b1800000-0000-0000-0000-000000000004', 'first-week-v1', 'r000003', 10,
      '{"days_used":"d0","used":["none"],"clarity":1,"ease":1,"useful":1,"blockers":["nothing"],"recommend":"no"}')$q$) = '23514'
  and pg_temp.fails_with($q$insert into public.survey_responses (user_id, survey_id, respondent_code, days_since_signup, answers)
    values ('b1800000-0000-0000-0000-000000000004', 'first-week-v1', 'R000004', 401,
      '{"days_used":"d0","used":["none"],"clarity":1,"ease":1,"useful":1,"blockers":["nothing"],"recommend":"no"}')$q$) = '23514'
  and pg_temp.fails_with($q$insert into public.survey_responses (user_id, survey_id, respondent_code, days_since_signup, answers)
    values ('b1800000-0000-0000-0000-000000000004', 'Mala Id', 'R000005', 10,
      '{"days_used":"d0","used":["none"],"clarity":1,"ease":1,"useful":1,"blockers":["nothing"],"recommend":"no"}')$q$) = '23514',
  'S2. La tabla aceptó respuestas, comentario, código, días o encuesta que no cumplen las reglas'
);

-- ===================================================================== S3. Una sola respuesta y códigos sin repetir
select pg_temp.expect(
  pg_temp.submit_as('b1800000-0000-0000-0000-000000000001', pg_temp.good('{"clarity":1}'), 'Otra vez')
    = '{"ok": false, "reason": "already"}'::jsonb
  and pg_temp.submit_as('b1800000-0000-0000-0000-000000000001', '{}'::jsonb, null)
    = '{"ok": false, "reason": "already"}'::jsonb,
  'S3. Una alumna contestó dos veces'
);
select pg_temp.expect(
  (select answers ->> 'clarity' from public.survey_responses where user_id = 'b1800000-0000-0000-0000-000000000001') = '4'
  and (select comment from public.survey_responses where user_id = 'b1800000-0000-0000-0000-000000000001') = 'Me costó ubicar Simular',
  'S3. El segundo envío cambió la respuesta de la primera vez'
);
begin;
select pg_temp.as_user('b1800000-0000-0000-0000-000000000001');
select pg_temp.expect(
  (public.my_survey_status() ->> 'available')::boolean is false
  and (public.my_survey_status() ->> 'answered')::boolean is true,
  'S3. Quien ya contestó sigue con la encuesta disponible'
);
reset role;
rollback;
-- La tabla también lo exige
select pg_temp.expect(
  pg_temp.fails_with($q$insert into public.survey_responses (user_id, survey_id, respondent_code, days_since_signup, answers)
    values ('b1800000-0000-0000-0000-000000000001', 'first-week-v1', 'R123456', 10,
      '{"days_used":"d0","used":["none"],"clarity":1,"ease":1,"useful":1,"blockers":["nothing"],"recommend":"no"}')$q$) = '23505',
  'S3. La tabla aceptó dos filas de la misma cuenta y encuesta'
);

-- Cuarenta alumnas más contestan y ningún código se repite
insert into auth.users (id, email, email_confirmed_at, created_at)
  select ('b1810000-0000-0000-0000-' || lpad(i::text, 12, '0'))::uuid, 'b18-masiva' || i || '@x.mx', now(),
         now() - interval '12 days'
  from generate_series(1, 40) i;
do $$
declare
  i integer;
begin
  for i in 1..40 loop
    perform pg_temp.submit_as(('b1810000-0000-0000-0000-' || lpad(i::text, 12, '0')), pg_temp.good());
  end loop;
end $$;
select pg_temp.expect(
  (select count(*) from public.survey_responses where user_id::text like 'b1810000%') = 40
  and (select count(distinct respondent_code) from public.survey_responses) = (select count(*) from public.survey_responses),
  'S3. Se repitió un código o faltó una respuesta de las 40'
);
-- El código no sale de la cuenta ni de la fecha: dos cuentas seguidas no dan códigos seguidos
select pg_temp.expect(
  (select count(distinct left(respondent_code, 3)) from public.survey_responses where user_id::text like 'b1810000%') > 5,
  'S3. Los códigos parecen derivar de algo que no es el azar'
);
select pg_temp.expect(
  public.survey_new_code() ~ '^R[0-9A-F]{6}$' and public.survey_new_code() <> public.survey_new_code(),
  'S3. survey_new_code no da un código al azar con la forma pedida'
);
-- Dos cuentas no comparten código en la misma encuesta
select pg_temp.expect(
  pg_temp.fails_with(format($q$insert into public.survey_responses (user_id, survey_id, respondent_code, days_since_signup, answers)
    values ('b1800000-0000-0000-0000-000000000004', 'first-week-v1', %L, 10,
      '{"days_used":"d0","used":["none"],"clarity":1,"ease":1,"useful":1,"blockers":["nothing"],"recommend":"no"}')$q$,
    (select respondent_code from public.survey_responses limit 1))) = '23505',
  'S3. La tabla aceptó un código repetido en la misma encuesta'
);

-- ===================================================================== S4. Solo se agrega
select pg_temp.expect(
  pg_temp.error_of($q$update public.survey_responses set comment = 'cambiado'$q$) = '42501 La encuesta solo se agrega'
  and pg_temp.error_of($q$update public.survey_responses set answers = '{}'$q$) like '42501%'
  and pg_temp.error_of($q$delete from public.survey_responses$q$) = '42501 La encuesta solo se agrega'
  and pg_temp.error_of($q$delete from public.survey_responses where user_id = 'b1800000-0000-0000-0000-000000000001'$q$) like '42501%',
  'S4. Un cambio o un borrado directo pasó, incluso como dueño de la base'
);
select pg_temp.expect(
  (select count(*) from public.survey_responses) = 43,
  'S4. Un intento de cambiar o borrar tocó filas'
);

-- Borrar mis datos no toca la encuesta (8.4)
begin;
select pg_temp.as_user('b1800000-0000-0000-0000-000000000003');
select public.delete_my_data();
reset role;
commit;
select pg_temp.expect(
  (select count(*) from public.survey_responses where user_id = 'b1800000-0000-0000-0000-000000000003') = 1,
  'S4. Borrar mis datos quitó la respuesta de la encuesta'
);

-- La función del alumno borra solo lo propio y dice si había algo
begin;
select pg_temp.as_user('b1800000-0000-0000-0000-000000000003');
select pg_temp.expect(
  public.delete_my_survey_response() is true
  and public.delete_my_survey_response() is false,
  'S4. delete_my_survey_response no borró lo propio una vez y luego dijo que no había nada'
);
reset role;
commit;
select pg_temp.expect(
  (select count(*) from public.survey_responses where user_id = 'b1800000-0000-0000-0000-000000000003') = 0
  and (select count(*) from public.survey_responses where user_id = 'b1800000-0000-0000-0000-000000000001') = 1
  and (select count(*) from public.survey_responses) = 42
  and coalesce(current_setting('app.erasing_user', true), '') = '',
  'S4. Borrar lo propio tocó la respuesta de otra cuenta, o dejó app.erasing_user marcado'
);
-- Y después de borrar sigue sin abrir la tabla
select pg_temp.expect(
  pg_temp.fails_with($q$delete from public.survey_responses$q$) = '42501',
  'S4. El freno quedó abierto después de borrar lo propio'
);
-- Quien borró la suya puede contestar de nuevo y recibe otro código
select pg_temp.expect(
  (pg_temp.submit_as('b1800000-0000-0000-0000-000000000003', pg_temp.good('{"recommend":"maybe"}'), null) ->> 'ok')::boolean,
  'S4. Quien borró su respuesta no pudo contestar de nuevo'
);

-- Borrar la cuenta arrastra la fila, con la función de la app y también desde fuera, como el panel de Supabase
begin;
select pg_temp.as_user('b1800000-0000-0000-0000-000000000003');
select public.delete_my_account();
reset role;
commit;
select pg_temp.expect(
  not exists (select 1 from auth.users where id = 'b1800000-0000-0000-0000-000000000003')
  and (select count(*) from public.survey_responses where user_id = 'b1800000-0000-0000-0000-000000000003') = 0,
  'S4. Borrar la cuenta no se llevó la respuesta'
);
delete from auth.users where id = 'b1810000-0000-0000-0000-000000000001';
select pg_temp.expect(
  (select count(*) from public.survey_responses where user_id = 'b1810000-0000-0000-0000-000000000001') = 0
  and (select count(*) from public.survey_responses) = 41,
  'S4. Quitar la cuenta desde fuera no se llevó la respuesta, o se llevó otra'
);

-- ===================================================================== S5. Lo que ve el equipo
-- La encuesta solo se agrega, así que para armar un caso conocido la prueba apaga el freno un momento, vacía la tabla y
-- lo vuelve a prender. Es lo único que lo hace
alter table public.survey_responses disable trigger survey_responses_append_only;
delete from public.survey_responses;
alter table public.survey_responses enable trigger survey_responses_append_only;

insert into auth.users (id, email, raw_user_meta_data, email_confirmed_at, created_at) values
  ('b1820000-0000-0000-0000-000000000001', 'b18-x1@x.mx', '{"alias":"Equis Uno"}', now(), now() - interval '12 days'),
  ('b1820000-0000-0000-0000-000000000002', 'b18-x2@x.mx', '{"alias":"Equis Dos"}', now(), now() - interval '12 days'),
  ('b1820000-0000-0000-0000-000000000003', 'b18-x3@x.mx', '{"alias":"Equis Tres"}', now(), now() - interval '12 days');
-- Los códigos no siguen el orden en que se contestó ni el de los días de la cuenta (RF 9, RA 10, RB 12): ni por fecha ni
-- por días, ascendente o descendente, saldría el orden por código
insert into public.survey_responses (user_id, survey_id, respondent_code, days_since_signup, answers, comment, created_at) values
  ('b1820000-0000-0000-0000-000000000001', 'first-week-v1', 'RF00001', 9,
   '{"days_used":"d7","used":["review","practice","exam"],"clarity":5,"ease":4,"useful":5,"blockers":["nothing"],"recommend":"yes"}',
   'Primera respuesta', now() - interval '3 days'),
  ('b1820000-0000-0000-0000-000000000002', 'first-week-v1', 'RA00002', 10,
   '{"days_used":"d3_4","used":["review"],"clarity":3,"ease":3,"useful":4,"blockers":["slow","error"],"recommend":"maybe"}',
   null, now() - interval '2 days'),
  ('b1820000-0000-0000-0000-000000000003', 'first-week-v1', 'RB00003', 12,
   '{"days_used":"d5_6","used":["none"],"clarity":2,"ease":2,"useful":3,"blockers":["unclear_start"],"recommend":"no"}',
   'Tercera respuesta', now() - interval '1 day');

begin;
select pg_temp.as_user('b1800000-0000-0000-0000-000000000006', 'aal2');
-- Los conteos por opción, el total y los comentarios (solo cuántos)
select pg_temp.expect(
  (public.admin_survey_summary('first-week-v1') ->> 'answered')::integer = 3
  and (public.admin_survey_summary('first-week-v1') ->> 'comments')::integer = 2
  and public.admin_survey_summary('first-week-v1') -> 'questions' = '{
    "days_used": {"d7": 1, "d3_4": 1, "d5_6": 1},
    "used": {"review": 2, "practice": 1, "exam": 1, "none": 1},
    "clarity": {"5": 1, "3": 1, "2": 1},
    "ease": {"4": 1, "3": 1, "2": 1},
    "useful": {"5": 1, "4": 1, "3": 1},
    "blockers": {"nothing": 1, "slow": 1, "error": 1, "unclear_start": 1},
    "recommend": {"yes": 1, "maybe": 1, "no": 1}
  }'::jsonb,
  'S5. Los conteos por opción del resumen no son los de las tres respuestas'
);
-- El resumen solo trae cuatro llaves y ni una dice quién
select pg_temp.expect(
  (select array_agg(k order by k) from jsonb_object_keys(public.admin_survey_summary('first-week-v1')) k)
    = array['answered', 'comments', 'eligible', 'questions'],
  'S5. El resumen trae una llave que no debe'
);
select pg_temp.expect(
  public.admin_survey_summary('first-week-v1')::text !~* '(@|user_id|b182|b180|equis|alumna|first_week|primera respuesta|tercera respuesta|created_at)',
  'S5. El resumen del equipo trae un correo, una cuenta, un alias, un comentario o una fecha'
);
-- Otra encuesta o una nula dan ceros y nada más
select pg_temp.expect(
  (public.admin_survey_summary('otra') ->> 'answered')::integer = 0
  and public.admin_survey_summary('otra') -> 'questions' = '{}'::jsonb
  and (public.admin_survey_summary(null) ->> 'answered')::integer = 0,
  'S5. El resumen de otra encuesta no da ceros'
);

-- La lista, ordenada por código y con solo tres columnas
select pg_temp.expect(
  (select array_agg(code) from public.admin_survey_responses('first-week-v1')) = array['RA00002', 'RB00003', 'RF00001'],
  'S5. Las respuestas no salen ordenadas por código'
);
select pg_temp.expect(
  (select comment from public.admin_survey_responses('first-week-v1') where code = 'RF00001') = 'Primera respuesta'
  and (select comment from public.admin_survey_responses('first-week-v1') where code = 'RA00002') is null
  and (select answers ->> 'recommend' from public.admin_survey_responses('first-week-v1') where code = 'RB00003') = 'no',
  'S5. La lista del equipo no trae el comentario o las respuestas de cada código'
);
select pg_temp.expect(
  (select string_agg(r::text, ' ') from public.admin_survey_responses('first-week-v1') r)
    !~* '(@|user_id|b182|b180|equis|alumna|created_at|[0-9a-f]{8}-[0-9a-f]{4}-)',
  'S5. La lista del equipo trae un correo, una cuenta, un alias o una fecha'
);
select pg_temp.expect(
  (select array_agg(a order by n) from (
     select a, n from (select unnest(p.proargnames) a, generate_series(1, cardinality(p.proargnames)) n
       from pg_proc p where p.oid = 'public.admin_survey_responses(text)'::regprocedure) x) y)
    = array['p_survey_id', 'code', 'answers', 'comment'],
  'S5. admin_survey_responses devuelve columnas de más o de menos'
);
-- Ninguna salida del equipo trae días de la cuenta ni fechas, ni en el nombre de una columna ni en lo que devuelve. Con 5
-- personas, los días más la fecha de alta que ya ve el equipo en Usuarios ligarían un código con una cuenta
select pg_temp.expect(
  not exists (
    select 1 from pg_proc p cross join lateral unnest(p.proargnames) n
    where p.oid in ('public.admin_survey_responses(text)'::regprocedure, 'public.admin_survey_summary(text)'::regprocedure)
      and n ~* '(days_since|signup|since|created|date|fecha|time|dias|días)'),
  'S5. Una función del equipo tiene un argumento o una columna de días o de fecha'
);
select pg_temp.expect(
  (select string_agg(r::text, ' ') from public.admin_survey_responses('first-week-v1') r) !~* '(days_since|signup|since)'
  and public.admin_survey_summary('first-week-v1')::text !~* '(days_since|signup|since)'
  and not (public.admin_survey_summary('first-week-v1') ? 'days_since_signup'),
  'S5. Una salida del equipo trae los días de la cuenta'
);
reset role;
rollback;

-- Hasta 200 respuestas, también ordenadas por código
insert into auth.users (id, email, email_confirmed_at, created_at)
  select ('b1830000-0000-0000-0000-' || lpad(i::text, 12, '0'))::uuid, 'b18-lote' || i || '@x.mx', now(), now() - interval '12 days'
  from generate_series(1, 210) i;
insert into public.survey_responses (user_id, survey_id, respondent_code, days_since_signup, answers)
  select ('b1830000-0000-0000-0000-' || lpad(i::text, 12, '0'))::uuid, 'first-week-v1',
         'R' || upper(lpad(to_hex(1000000 + (i * 7919) % 210), 6, '0')), 12,
         '{"days_used":"d0","used":["none"],"clarity":1,"ease":1,"useful":1,"blockers":["nothing"],"recommend":"no"}'
  from generate_series(1, 210) i;
begin;
select pg_temp.as_user('b1800000-0000-0000-0000-000000000006', 'aal2');
select pg_temp.expect(
  (select count(*) from public.admin_survey_responses('first-week-v1')) = 200
  and (select array_agg(code) from public.admin_survey_responses('first-week-v1'))
    = (select array_agg(code order by code) from public.admin_survey_responses('first-week-v1'))
  and (public.admin_survey_summary('first-week-v1') ->> 'answered')::integer = 213,
  'S5. La lista no se corta en 200 por código, o el resumen no cuenta las 213'
);
reset role;
rollback;
alter table public.survey_responses disable trigger survey_responses_append_only;
delete from public.survey_responses where user_id::text like 'b1830000%';
alter table public.survey_responses enable trigger survey_responses_append_only;
delete from auth.users where id::text like 'b1830000%';

-- Las cuentas elegibles se cuentan sin decir cuáles. Cada tipo de cuenta suma o no suma
select pg_temp.survey_on(7);
create temp table b18_eligible as
  select (pg_temp.summary_as_admin() ->> 'eligible')::integer as n;
select pg_temp.expect(
  (select n from b18_eligible) = (
    select count(*) from auth.users u
    where u.email_confirmed_at is not null and u.created_at <= now() - interval '7 days'
      and not exists (select 1 from public.user_roles r where r.user_id = u.id and r.role <> 'student')),
  'S5. Las cuentas elegibles no son las de alumnos confirmados con 7 días o más'
);
select pg_temp.expect(
  (select n from b18_eligible) >= 4,
  'S5. Las cuentas elegibles no cuentan a las alumnas de la prueba con más de 7 días'
);
insert into auth.users (id, email, email_confirmed_at, created_at) values
  ('b1840000-0000-0000-0000-000000000001', 'b18-e1@x.mx', now(), now() - interval '8 days'),
  ('b1840000-0000-0000-0000-000000000002', 'b18-e2@x.mx', null, now() - interval '8 days'),
  ('b1840000-0000-0000-0000-000000000003', 'b18-e3@x.mx', now(), now() - interval '6 days 23 hours'),
  ('b1840000-0000-0000-0000-000000000004', 'b18-e4@x.mx', now(), now() - interval '9 days'),
  ('b1840000-0000-0000-0000-000000000005', 'b18-e5@x.mx', now(), now() - interval '9 days');
update public.user_roles set role = 'physician' where user_id = 'b1840000-0000-0000-0000-000000000004';
update public.user_roles set role = 'admin' where user_id = 'b1840000-0000-0000-0000-000000000005';
-- Solo la primera suma: la sin confirmar, la de 6 días y 23 horas, la médica y la admin no
select pg_temp.expect(
  (pg_temp.summary_as_admin() ->> 'eligible')::integer = (select n from b18_eligible) + 1,
  'S5. Las cuentas elegibles no suman solo a la alumna confirmada de 8 días'
);
-- Un dueño sin su fila de alumno tampoco suma, y una cuenta sin fila de rol cuenta como alumna (la base le da la fila)
delete from public.user_roles where user_id = 'b1840000-0000-0000-0000-000000000001';
select pg_temp.expect(
  (pg_temp.summary_as_admin() ->> 'eligible')::integer = (select n from b18_eligible) + 1,
  'S5. Una cuenta sin fila de rol dejó de contar como alumna'
);

-- ===================================================================== S6. Lo propio
begin;
select pg_temp.as_user('b1820000-0000-0000-0000-000000000001');
select pg_temp.expect(
  public.my_survey_response() ->> 'code' = 'RF00001'
  and public.my_survey_response() ->> 'surveyId' = 'first-week-v1'
  and (public.my_survey_response() ->> 'daysSinceSignup')::integer = 9
  and public.my_survey_response() ->> 'comment' = 'Primera respuesta'
  and public.my_survey_response() -> 'answers' ->> 'recommend' = 'yes'
  and public.my_survey_response() ? 'answeredAt'
  and public.my_survey_response()::text !~* '(@|user_id|b182)',
  'S6. my_survey_response no devuelve lo propio, o trae la cuenta'
);
reset role;
select pg_temp.as_user('b1820000-0000-0000-0000-000000000002');
select pg_temp.expect(
  public.my_survey_response() ->> 'code' = 'RA00002' and public.my_survey_response() -> 'comment' = 'null'::jsonb,
  'S6. my_survey_response de otra alumna no devuelve la suya'
);
reset role;
-- Quien no contestó recibe null
select pg_temp.as_user('b1800000-0000-0000-0000-000000000002');
select pg_temp.expect(public.my_survey_response() is null, 'S6. Quien no contestó no recibe null');
reset role;
-- Ni un admin recibe lo de otra cuenta con esta función
select pg_temp.as_user('b1800000-0000-0000-0000-000000000006', 'aal2');
select pg_temp.expect(public.my_survey_response() is null, 'S6. Un admin recibió una respuesta con la función del alumno');
reset role;
rollback;

-- ===================================================================== S7. El ajuste y quién la ve
-- Cada campo se valida por separado y, si no sirve, usa el de fábrica sin tocar a los demás
select pg_temp.expect(
  pg_temp.cfg('{"enabled":"true","id":"first-week-v1","delay_days":7,"accounts_until":null}') ->> 'enabled' = 'false'
  and pg_temp.cfg('{"enabled":1,"delay_days":7}') ->> 'enabled' = 'false'
  and pg_temp.cfg('{"enabled":null}') ->> 'enabled' = 'false'
  and pg_temp.cfg('{}') ->> 'enabled' = 'false'
  and pg_temp.cfg('true') ->> 'enabled' = 'false'
  and pg_temp.cfg('[1,2]') ->> 'enabled' = 'false'
  and pg_temp.cfg('{"enabled":false}') ->> 'enabled' = 'false'
  and pg_temp.cfg('{"enabled":true}') ->> 'enabled' = 'true',
  'S7. Solo el booleano true prende la encuesta'
);
select pg_temp.expect(
  (pg_temp.cfg('{"enabled":true,"delay_days":0}') ->> 'delay_days')::integer = 0
  and (pg_temp.cfg('{"enabled":true,"delay_days":30}') ->> 'delay_days')::integer = 30
  and (pg_temp.cfg('{"enabled":true,"delay_days":3}') ->> 'delay_days')::integer = 3
  and (pg_temp.cfg('{"enabled":true,"delay_days":31}') ->> 'delay_days')::integer = 7
  and (pg_temp.cfg('{"enabled":true,"delay_days":-1}') ->> 'delay_days')::integer = 7
  and (pg_temp.cfg('{"enabled":true,"delay_days":3.5}') ->> 'delay_days')::integer = 7
  and (pg_temp.cfg('{"enabled":true,"delay_days":"3"}') ->> 'delay_days')::integer = 7
  and (pg_temp.cfg('{"enabled":true,"delay_days":null}') ->> 'delay_days')::integer = 7
  and (pg_temp.cfg('{"enabled":true}') ->> 'delay_days')::integer = 7,
  'S7. delay_days no se valida de 0 a 30 con 7 de respaldo'
);
select pg_temp.expect(
  pg_temp.cfg('{"enabled":true,"id":"first-week-v1"}') ->> 'id' = 'first-week-v1'
  -- Un id con buena forma pero que la base no conoce usa el de respaldo, igual que uno con mala forma
  and pg_temp.cfg('{"enabled":true,"id":"first-week-v2"}') ->> 'id' = 'first-week-v1'
  and pg_temp.cfg('{"enabled":true,"id":"otra-encuesta"}') ->> 'id' = 'first-week-v1'
  and pg_temp.cfg('{"enabled":true,"id":"First-Week-V1"}') ->> 'id' = 'first-week-v1'
  and pg_temp.cfg('{"enabled":true,"id":"Mala Id"}') ->> 'id' = 'first-week-v1'
  and pg_temp.cfg('{"enabled":true,"id":"ab"}') ->> 'id' = 'first-week-v1'
  and pg_temp.cfg('{"enabled":true,"id":5}') ->> 'id' = 'first-week-v1'
  and pg_temp.cfg('{"enabled":true,"id":null}') ->> 'id' = 'first-week-v1'
  and pg_temp.cfg('{"enabled":true}') ->> 'id' = 'first-week-v1',
  'S7. El id de la encuesta no se valida contra la lista conocida con first-week-v1 de respaldo'
);
-- La franja nunca queda abierta con una encuesta que no se puede contestar: con un id raro en el ajuste, la encuesta de
-- siempre sigue disponible y se contesta
begin;
select pg_temp.set_survey('{"enabled":true,"id":"first-week-v2","delay_days":7,"accounts_until":null}');
select pg_temp.as_user('b1800000-0000-0000-0000-000000000001');
select pg_temp.expect(
  (public.my_survey_status() ->> 'available')::boolean is true
  and public.my_survey_status() ->> 'surveyId' = 'first-week-v1'
  and (public.submit_survey(public.my_survey_status() ->> 'surveyId', pg_temp.good(), null) ->> 'ok')::boolean is true,
  'S7. Con un id desconocido en el ajuste la franja sale y la encuesta no se puede contestar'
);
reset role;
rollback;
select pg_temp.expect(
  pg_temp.cfg('{"enabled":true,"accounts_until":"2026-10-30"}') ->> 'accounts_until' is not null
  and (select (pg_temp.cfg('{"enabled":true,"accounts_until":"2026-10-30"}') ->> 'accounts_until')::timestamptz)
      = '2026-10-30 00:00:00-06'::timestamptz
  and pg_temp.cfg('{"enabled":true,"accounts_until":"ayer"}') -> 'accounts_until' = 'null'::jsonb
  and pg_temp.cfg('{"enabled":true,"accounts_until":"2026-13-45"}') -> 'accounts_until' = 'null'::jsonb
  and pg_temp.cfg('{"enabled":true,"accounts_until":"2026-02-30"}') -> 'accounts_until' = 'null'::jsonb
  and pg_temp.cfg('{"enabled":true,"accounts_until":20261030}') -> 'accounts_until' = 'null'::jsonb
  and pg_temp.cfg('{"enabled":true,"accounts_until":"2026-10-30T10:00"}') -> 'accounts_until' = 'null'::jsonb
  and pg_temp.cfg('{"enabled":true,"accounts_until":null}') -> 'accounts_until' = 'null'::jsonb,
  'S7. accounts_until no es una fecha AAAA-MM-DD a medianoche de la Ciudad de México, o una fecha mala no se ignora'
);
-- Sin la clave todo es de fábrica y apagado
select pg_temp.set_survey('{"enabled":true}');
delete from public.platform_settings where key = 'survey_first_week';
select pg_temp.expect(
  (select enabled from public.survey_setting()) is false
  and (select id from public.survey_setting()) = 'first-week-v1'
  and (select delay_days from public.survey_setting()) = 7
  and (select accounts_until from public.survey_setting()) is null,
  'S7. Sin la clave la encuesta no queda apagada con los valores de fábrica'
);
begin;
select pg_temp.as_user('b1800000-0000-0000-0000-000000000001');
select pg_temp.expect(
  (public.my_survey_status() ->> 'available')::boolean is false and (public.my_survey_status() ->> 'surveyId') = 'first-week-v1',
  'S7. Sin la clave del ajuste la encuesta sigue disponible'
);
reset role;
rollback;

-- Las cuentas posteriores a la fecha límite no la reciben, con el día contado desde la medianoche de la Ciudad de
-- México. La fecha límite es del pasado para que la prueba valga a cualquier hora
insert into auth.users (id, email, email_confirmed_at, created_at) values
  ('b1850000-0000-0000-0000-000000000001', 'b18-z1@x.mx', now(), '2020-01-01 22:00:00-06'),
  ('b1850000-0000-0000-0000-000000000002', 'b18-z2@x.mx', now(), '2020-01-02 00:30:00-06'),
  ('b1850000-0000-0000-0000-000000000003', 'b18-z3@x.mx', null, '2019-12-01 12:00:00-06'),
  ('b1850000-0000-0000-0000-000000000004', 'b18-z4@x.mx', now(), '2019-12-01 12:00:00-06');
update public.user_roles set role = 'physician' where user_id = 'b1850000-0000-0000-0000-000000000004';
select pg_temp.survey_on(0, '2020-01-02');
select pg_temp.expect(
  (pg_temp.summary_as_admin() ->> 'eligible')::integer = 1,
  'S7. Con la fecha límite, las cuentas elegibles no son solo la alumna confirmada anterior a ella'
);
begin;
select pg_temp.as_user('b1850000-0000-0000-0000-000000000001');
select pg_temp.expect(
  (public.my_survey_status() ->> 'available')::boolean is true
  and (public.my_survey_status() ->> 'daysSinceSignup')::integer = 400,
  'S7. La alumna anterior a la fecha límite no la ve, o los días no se topan en 400'
);
reset role;
select pg_temp.as_user('b1850000-0000-0000-0000-000000000002');
select pg_temp.expect(
  (public.my_survey_status() ->> 'available')::boolean is false
  and public.submit_survey('first-week-v1', pg_temp.good(), null) = '{"ok": false, "reason": "closed"}'::jsonb,
  'S7. Una cuenta posterior a la fecha límite la ve o la contesta'
);
reset role;
-- La médica anterior a la fecha límite tampoco
select pg_temp.as_user('b1850000-0000-0000-0000-000000000004');
select pg_temp.expect(
  (public.my_survey_status() ->> 'available')::boolean is false
  and public.submit_survey('first-week-v1', pg_temp.good(), null) = '{"ok": false, "reason": "closed"}'::jsonb,
  'S7. Una médica la ve o la contesta'
);
reset role;
rollback;
-- La de 400 días contesta y queda con el tope
select pg_temp.expect(
  (pg_temp.submit_as('b1850000-0000-0000-0000-000000000001', pg_temp.good(), null) ->> 'ok')::boolean,
  'S7. La alumna de más de 400 días no pudo contestar'
);
select pg_temp.expect(
  (select days_since_signup from public.survey_responses where user_id = 'b1850000-0000-0000-0000-000000000001') = 400,
  'S7. Una cuenta de más de 400 días no se guardó con el tope de 400'
);

-- Quien ya contestó antes de la fecha límite conserva su respuesta y sigue sin poder contestar otra vez
select pg_temp.expect(
  pg_temp.submit_as('b1850000-0000-0000-0000-000000000001', pg_temp.good(), null) = '{"ok": false, "reason": "already"}'::jsonb,
  'S7. Contestó dos veces con la fecha límite puesta'
);

-- Un médico que antes fue alumno y contestó puede quitar lo suyo
update public.user_roles set role = 'physician' where user_id = 'b1850000-0000-0000-0000-000000000001';
begin;
select pg_temp.as_user('b1850000-0000-0000-0000-000000000001');
select pg_temp.expect(
  public.my_survey_response() ->> 'surveyId' = 'first-week-v1'
  and (public.my_survey_status() ->> 'available')::boolean is false
  and public.delete_my_survey_response() is true,
  'S7. Quien ya no es alumno no pudo ver ni quitar lo que contestó'
);
reset role;
commit;
select pg_temp.expect(
  (select count(*) from public.survey_responses where user_id = 'b1850000-0000-0000-0000-000000000001') = 0,
  'S7. La respuesta de quien dejó de ser alumno no se quitó'
);

-- ===================================================================== Limpieza
-- Deja el ajuste apagado y de fábrica, como nace, y la bandera del segundo factor como estaba
select pg_temp.set_survey('{"enabled":false,"id":"first-week-v1","delay_days":7,"accounts_until":null}');
select pg_temp.expect(
  (select value from public.platform_settings where key = 'survey_first_week')
    = '{"enabled":false,"id":"first-week-v1","delay_days":7,"accounts_until":null}'::jsonb,
  'S7. El ajuste no volvió a su valor de fábrica'
);

select 'TODAS LAS PRUEBAS DE LA ENCUESTA DE LOS PRIMEROS DÍAS PASARON' as resultado;
