-- Pruebas de cuentas y acceso (B9, migración 20261020000001). Corre al final sobre la misma base, con
-- usuarios propios. Cada bloque falla con un error si algo no cumple.
--   H. El gancho Before User Created y el registro por invitación
--   I. Las invitaciones, solo para el dueño y los admins
--   M. El segundo factor del equipo en los permisos por fila, apagado y prendido
--   R. Restablecer el segundo factor, solo el dueño
--   S. Cómo nos conociste, privado y con conteos para el admin
--   D. Las fechas nuevas de private_accounts
--   P. El segundo factor no cambia el plan Gratis ni Party (B7 y B8)
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
    'session_id', coalesce(sid, 'b9-sesion-' || uid))::text, true);
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

create or replace function pg_temp.rows_changed(stmt text) returns integer language plpgsql as $$
declare
  n integer;
begin
  execute stmt;
  get diagnostics n = row_count;
  return n;
end $$;

-- El evento que manda Supabase Auth al gancho. El usuario todavía no existe
create or replace function pg_temp.hook(email text, provider text default 'email') returns jsonb
language sql as $$
  select public.before_user_created_hook(jsonb_build_object(
    'metadata', jsonb_build_object('name', 'before-user-created', 'uuid', gen_random_uuid()),
    'user', jsonb_build_object(
      'id', gen_random_uuid(), 'aud', 'authenticated', 'role', '', 'email', email, 'phone', '',
      'app_metadata', jsonb_build_object('provider', provider, 'providers', jsonb_build_array(provider)),
      'user_metadata', '{}'::jsonb, 'identities', '[]'::jsonb, 'is_anonymous', false)))
$$;

-- Prende o apaga el segundo factor del equipo en la bandera que comparten la app y el servidor
create or replace function pg_temp.require_mfa(p_flag jsonb) returns void language sql as $$
  insert into public.platform_settings (key, value) values ('feature_flags', jsonb_build_object('requireMfa', p_flag))
  on conflict (key) do update set value = public.platform_settings.value || jsonb_build_object('requireMfa', p_flag)
$$;

-- ===================================================================== Usuarios
-- B1 alumna, B2 médica, B3 admin, B5 alumna invitada que ya tenía cuenta y confirmó su correo, B8
-- invitada que pidió el código y nunca lo abrió, así que Supabase ya creó su fila sin confirmarla. El
-- dueño es el de rls_test
insert into auth.users (id, email, raw_user_meta_data, email_confirmed_at) values
  ('b9000000-0000-0000-0000-000000000001', 'b9-alumna@x.mx', '{"alias":"Alumna B9"}', now()),
  ('b9000000-0000-0000-0000-000000000002', 'b9-medica@x.mx', '{"alias":"Médica B9"}', now()),
  ('b9000000-0000-0000-0000-000000000003', 'b9-admin@x.mx', '{"alias":"Admin B9"}', now()),
  ('b9000000-0000-0000-0000-000000000005', 'b9-ya-tenia@x.mx', '{"alias":"Ya tenía B9"}', now()),
  ('b9000000-0000-0000-0000-000000000008', 'b9-sin-abrir@x.mx', '{}', null);
update public.user_roles set role = 'physician' where user_id = 'b9000000-0000-0000-0000-000000000002';
update public.user_roles set role = 'admin' where user_id = 'b9000000-0000-0000-0000-000000000003';

do $$
declare
  v_owner uuid;
begin
  select user_id into v_owner from public.user_roles where role = 'owner';
  if v_owner is null then
    v_owner := 'b9000000-0000-0000-0000-000000000004';
    insert into auth.users (id, email, raw_user_meta_data) values (v_owner, 'b9-dueno@x.mx', '{"alias":"Dueño B9"}');
    update public.user_roles set role = 'owner' where user_id = v_owner;
  end if;
  perform set_config('b9.owner', v_owner::text, false);
  -- La sesión con la que el dueño tiene su dispositivo, si ya reclamó uno en otra prueba
  perform set_config('b9.owner_sid',
    coalesce((select session_id from public.device_sessions where user_id = v_owner), 'b9-sesion-dueno'), false);
end $$;

-- Una pregunta del banco en revisión con la médica de revisora, para probar sus decisiones. Desde B11
-- nadie lee ni escribe las tablas de preguntas directo, así que se siembra como superusuario con las
-- funciones del banco y la médica la ve y decide con editor_question y editor_decide, como la app
do $$
declare
  v_question uuid := public.stable_bank_uuid('b9-q', 'B9-0001');
  v_version uuid;
begin
  v_version := public.bank_insert_version(
    v_question,
    jsonb_build_object(
      'branch', 'pediatrics', 'topic', 'neonatology', 'subtopic', 'neonatal_jaundice', 'difficulty', 3,
      'itemKinds', '[]'::jsonb, 'polarity', 'affirmative', 'task', 'diagnosis', 'format', 'clinical_case',
      'structureSource', 'physician', 'language', 'es',
      'vignette', '[Prueba] Caso simulado B9', 'prompt', '[Prueba] ¿Pregunta simulada B9?',
      'explanation', '[Prueba] Explicación simulada B9',
      'gpcRefs', jsonb_build_array(jsonb_build_object('title', '[Prueba] Guía simulada', 'status', 'to_verify')),
      'clues', '[]'::jsonb,
      'options', (
        select jsonb_agg(jsonb_build_object(
          'letter', chr(64 + i), 'text', '[Prueba] Opción ' || chr(64 + i), 'isCorrect', i = 1,
          'biasTag', (array[null, 'anchoring', 'premature_closure', 'framing_effect'])[i],
          'rationale', '[Prueba] Justificación ' || chr(64 + i), 'canonical', true) order by i)
        from generate_series(1, 4) i)),
    'sheet', null, null, null, null, '{}');
  insert into public.bank_questions (question_id, origin, source_key, latest_version_id)
    values (v_question, 'sheet', 'sheet:B9-0001', v_version);
  update public.questions set editorial_status = 'in_review' where id = v_version;
  perform public.bank_assign(v_question, 'reviewer', 'b9000000-0000-0000-0000-000000000002', null);
  perform set_config('b9.question', v_question::text, false);
  perform set_config('b9.version', v_version::text, false);
end $$;

-- Invitaciones que mete el dueño desde el editor de SQL. El correo se guarda limpio
insert into public.signup_invitations (email) values
  ('  Invitada@B9.MX '), ('b9-ya-tenia@x.mx'), ('b9-sin-abrir@x.mx');

-- ===================================================================== H1. Registro cerrado
select pg_temp.expect(
  (select value from public.platform_settings where key = 'registration_open') = 'false'::jsonb,
  'H1. El registro no nació cerrado'
);
select pg_temp.expect(
  exists (select 1 from public.signup_invitations where email = 'invitada@b9.mx' and invited_by is null),
  'H1. La invitación no se guardó con el correo en minúsculas y sin espacios'
);
begin;
set local role supabase_auth_admin;
select pg_temp.expect(pg_temp.hook('invitada@b9.mx') = '{}'::jsonb, 'H1. Rechazó un correo invitado');
select pg_temp.expect(
  pg_temp.hook(' INVITADA@b9.mx ') = '{}'::jsonb,
  'H1. Rechazó un correo invitado escrito con mayúsculas y espacios'
);
select pg_temp.expect(
  pg_temp.hook('invitada@b9.mx', 'google') = '{}'::jsonb,
  'H1. Rechazó con Google un correo invitado'
);
select pg_temp.expect(
  (pg_temp.hook('nadie@b9.mx') -> 'error' ->> 'http_code') = '403'
  and (pg_temp.hook('nadie@b9.mx') -> 'error' ->> 'message') like '%(invitation_required)%',
  'H1. Dejó crear una cuenta sin invitación o sin la forma de error del gancho'
);
select pg_temp.expect(
  (pg_temp.hook('nadie@b9.mx', 'google') -> 'error' ->> 'http_code') = '403',
  'H1. Dejó crear una cuenta con Google sin invitación'
);
-- Sin correo, como un usuario anónimo o con teléfono, tampoco entra
select pg_temp.expect(
  (pg_temp.hook('') -> 'error' ->> 'http_code') = '403'
  and (public.before_user_created_hook('{}'::jsonb) -> 'error' ->> 'http_code') = '403',
  'H1. Dejó crear una cuenta sin correo'
);
-- Un correo parecido no cuenta como invitado
select pg_temp.expect(
  (pg_temp.hook('invitada@b9.mx.otro') -> 'error') is not null
  and (pg_temp.hook('otra.invitada@b9.mx') -> 'error') is not null,
  'H1. Un correo parecido pasó como invitado'
);
rollback;

-- ===================================================================== H2. Registro abierto
begin;
update public.platform_settings set value = 'true'::jsonb where key = 'registration_open';
set local role supabase_auth_admin;
select pg_temp.expect(
  pg_temp.hook('cualquiera@b9.mx') = '{}'::jsonb and pg_temp.hook('otra@b9.mx', 'google') = '{}'::jsonb,
  'H2. Con el registro abierto rechazó un correo sin invitación'
);
rollback;
-- Un valor que no es true deja el registro cerrado
begin;
update public.platform_settings set value = '"true"'::jsonb where key = 'registration_open';
set local role supabase_auth_admin;
select pg_temp.expect(
  (pg_temp.hook('cualquiera@b9.mx') -> 'error') is not null,
  'H2. Un valor de texto abrió el registro'
);
rollback;
-- Sin la clave, cerrado
begin;
delete from public.platform_settings where key = 'registration_open';
set local role supabase_auth_admin;
select pg_temp.expect(
  (pg_temp.hook('cualquiera@b9.mx') -> 'error') is not null,
  'H2. Sin la clave el registro quedó abierto'
);
rollback;

-- ===================================================================== H3. Solo Auth ejecuta el gancho
select pg_temp.expect(
  has_function_privilege('supabase_auth_admin', 'public.before_user_created_hook(jsonb)', 'execute')
  and not has_function_privilege('anon', 'public.before_user_created_hook(jsonb)', 'execute')
  and not has_function_privilege('authenticated', 'public.before_user_created_hook(jsonb)', 'execute')
  and not has_function_privilege('service_role', 'public.before_user_created_hook(jsonb)', 'execute')
  and has_schema_privilege('supabase_auth_admin', 'public', 'usage'),
  'H3. Los permisos del gancho no son los que pide la documentación'
);
begin;
select pg_temp.as_user('b9000000-0000-0000-0000-000000000001');
select pg_temp.expect(
  pg_temp.fails_with($q$select public.before_user_created_hook('{}'::jsonb)$q$) = '42501',
  'H3. Un alumno ejecutó el gancho'
);
rollback;
begin;
set local role anon;
select pg_temp.expect(
  pg_temp.fails_with($q$select public.before_user_created_hook('{}'::jsonb)$q$) = '42501',
  'H3. Un anónimo ejecutó el gancho'
);
rollback;
-- El rol de Auth solo lee lo que necesita. No escribe invitaciones ni configuración
begin;
set local role supabase_auth_admin;
select pg_temp.expect(
  pg_temp.fails_with($q$insert into public.signup_invitations (email) values ('auth@b9.mx')$q$) = '42501'
  and pg_temp.fails_with($q$update public.platform_settings set value = 'true'::jsonb where key = 'registration_open'$q$) = '42501',
  'H3. El rol de Auth pudo escribir invitaciones o configuración'
);
rollback;

-- ===================================================================== H4. Las cuentas que ya existen no cambian
-- El gancho no es un disparador. Crear un usuario desde el panel de Supabase, que no pasa por él, sigue
-- creando perfil, rol y cuenta, y quien ya tenía cuenta sigue entrando a lo suyo con el registro cerrado
insert into auth.users (id, email, raw_user_meta_data)
  values ('b9000000-0000-0000-0000-000000000006', 'b9-desde-panel@x.mx', '{"alias":"Desde el panel"}');
select pg_temp.expect(
  (select role from public.user_roles where user_id = 'b9000000-0000-0000-0000-000000000006') = 'student'
  and exists (select 1 from public.private_accounts where user_id = 'b9000000-0000-0000-0000-000000000006'),
  'H4. Con el registro cerrado, el alta desde el panel ya no crea rol y cuenta'
);
begin;
select pg_temp.as_user('b9000000-0000-0000-0000-000000000001');
select pg_temp.expect(
  (select count(*) from public.profiles where id = auth.uid()) = 1
  and (select count(*) from public.private_accounts where user_id = auth.uid()) = 1
  and pg_temp.rows_changed($q$update public.private_accounts set state = 'YUC' where user_id = auth.uid()$q$) = 1,
  'H4. Con el registro cerrado, una alumna que ya existía dejó de ver o guardar lo suyo'
);
rollback;

-- ===================================================================== I1. Solo el dueño y los admins manejan invitaciones
begin;
select pg_temp.as_user('b9000000-0000-0000-0000-000000000003');
insert into public.signup_invitations (email) values (' Aspirante.Uno@Correo.MX ');
select pg_temp.expect(
  (select invited_by from public.signup_invitations where email = 'aspirante.uno@correo.mx')
    = 'b9000000-0000-0000-0000-000000000003'::uuid,
  'I1. La invitación del admin no quedó limpia o no dice quién invitó'
);
select pg_temp.expect(
  (select count(*) from public.signup_invitations where email in ('invitada@b9.mx', 'aspirante.uno@correo.mx')) = 2,
  'I1. El admin no ve las invitaciones'
);
select pg_temp.expect(
  pg_temp.rows_changed($q$delete from public.signup_invitations where email = 'aspirante.uno@correo.mx'$q$) = 1,
  'I1. El admin no pudo quitar una invitación'
);
-- Nadie edita una invitación, se quita y se vuelve a dar
select pg_temp.expect(
  pg_temp.fails_with($q$update public.signup_invitations set email = 'otro@b9.mx' where email = 'invitada@b9.mx'$q$) = '42501',
  'I1. Una invitación se pudo editar'
);
rollback;
begin;
select pg_temp.as_user(current_setting('b9.owner'), 'aal1', current_setting('b9.owner_sid'));
insert into public.signup_invitations (email) values ('del-dueno@b9.mx');
select pg_temp.expect(
  (select count(*) from public.signup_invitations where email = 'del-dueno@b9.mx') = 1,
  'I1. El dueño no pudo invitar'
);
rollback;
-- Un correo mal escrito no se guarda
begin;
select pg_temp.as_user('b9000000-0000-0000-0000-000000000003');
select pg_temp.expect(
  pg_temp.fails_with($q$insert into public.signup_invitations (email) values ('sin-arroba')$q$) = '23514',
  'I1. Se guardó una invitación sin correo válido'
);
rollback;
-- La médica, la alumna y quien no entró no ven ni tocan invitaciones
do $$
declare
  v_user text;
begin
  foreach v_user in array array['b9000000-0000-0000-0000-000000000001', 'b9000000-0000-0000-0000-000000000002'] loop
    perform pg_temp.as_user(v_user);
    if (select count(*) from public.signup_invitations) <> 0 then
      raise exception 'FALLA I1. % vio invitaciones', v_user;
    end if;
    if pg_temp.fails_with($q$insert into public.signup_invitations (email) values ('colado@b9.mx')$q$) is distinct from '42501' then
      raise exception 'FALLA I1. % invitó a alguien', v_user;
    end if;
    if pg_temp.rows_changed($q$delete from public.signup_invitations$q$) <> 0 then
      raise exception 'FALLA I1. % quitó invitaciones', v_user;
    end if;
    if pg_temp.fails_with($q$select * from public.admin_list_invitations()$q$) is distinct from '42501' then
      raise exception 'FALLA I1. % leyó la lista de invitaciones', v_user;
    end if;
    reset role;
  end loop;
end $$;
begin;
set local role anon;
select pg_temp.expect(
  pg_temp.fails_with($q$select count(*) from public.signup_invitations$q$) = '42501'
  and pg_temp.fails_with($q$insert into public.signup_invitations (email) values ('anon@b9.mx')$q$) = '42501'
  and pg_temp.fails_with($q$select * from public.admin_list_invitations()$q$) = '42501',
  'I1. Un anónimo leyó o escribió invitaciones'
);
rollback;

-- ===================================================================== I2. La lista dice quién ya creó su cuenta
begin;
select pg_temp.as_user('b9000000-0000-0000-0000-000000000003');
select pg_temp.expect(
  (select registered from public.admin_list_invitations() where email = 'b9-ya-tenia@x.mx')
  and not (select registered from public.admin_list_invitations() where email = 'invitada@b9.mx'),
  'I2. La lista no distingue quién ya creó su cuenta'
);
-- Pedir el código crea la fila de auth.users, pero sin abrir el correo todavía no creó su cuenta
select pg_temp.expect(
  not (select registered from public.admin_list_invitations() where email = 'b9-sin-abrir@x.mx'),
  'I2. Contó como cuenta creada a quien pidió el código y nunca confirmó su correo'
);
reset role;
update auth.users set email_confirmed_at = now() where id = 'b9000000-0000-0000-0000-000000000008';
select pg_temp.as_user('b9000000-0000-0000-0000-000000000003');
select pg_temp.expect(
  (select registered from public.admin_list_invitations() where email = 'b9-sin-abrir@x.mx'),
  'I2. Al confirmar su correo no contó como cuenta creada'
);
rollback;

-- ===================================================================== M1. Sin la bandera nada cambia
begin;
select pg_temp.as_user('b9000000-0000-0000-0000-000000000003');
select pg_temp.expect(public.current_app_role() = 'admin' and public.is_admin()
  and pg_temp.fails_with($q$select public.admin_bank_overview()$q$) is null,
  'M1. Sin la bandera, el admin con aal1 dejó de ser admin');
rollback;
begin;
select pg_temp.as_user('b9000000-0000-0000-0000-000000000002');
select pg_temp.expect(public.current_app_role() = 'physician'
  and public.editor_question(current_setting('b9.question')::uuid) -> 'review' ->> 'role' = 'reviewer'
  and (select count(*) from jsonb_array_elements(public.editor_list('{"view":"to_review"}') -> 'items') i
       where i ->> 'questionId' = current_setting('b9.question')) = 1,
  'M1. Sin la bandera, la médica con aal1 dejó de ver lo que tiene asignado');
select pg_temp.expect(
  public.editor_decide(current_setting('b9.version')::uuid, 'request_changes', '[Prueba] Comentario simulado', null)
    ->> 'status' = 'draft',
  'M1. Sin la bandera, la médica con aal1 no pudo decidir');
rollback;
-- Las funciones auxiliares nuevas no se llaman desde la API. current_app_role e is_admin siguen igual
select pg_temp.expect(
  not has_function_privilege('authenticated', 'public.assigned_app_role()', 'execute')
  and not has_function_privilege('anon', 'public.assigned_app_role()', 'execute')
  and not has_function_privilege('authenticated', 'public.staff_mfa_required()', 'execute')
  and has_function_privilege('authenticated', 'public.current_app_role()', 'execute')
  and has_function_privilege('authenticated', 'public.is_admin()', 'execute'),
  'M1. Los permisos de las funciones de rol cambiaron'
);

-- ===================================================================== M2. Con la bandera, el equipo pide aal2
begin;
select pg_temp.require_mfa('true'::jsonb);
select pg_temp.expect(public.staff_mfa_required(), 'M2. La bandera no prendió el segundo factor');

-- El admin sin segundo factor cuenta como alumno
select pg_temp.as_user('b9000000-0000-0000-0000-000000000003', 'aal1');
select pg_temp.expect(public.current_app_role() = 'student' and not public.is_admin(),
  'M2. El admin sin segundo factor conservó su rol');
select pg_temp.expect(
  pg_temp.fails_with($q$select * from public.admin_list_users(null, null, 10, 0)$q$) = '42501',
  'M2. El admin sin segundo factor leyó la lista de usuarios'
);
select pg_temp.expect(
  (select count(*) from public.role_audit) = 0
  and (select count(*) from public.signup_invitations) = 0
  and (select count(*) from public.private_accounts where user_id <> auth.uid()) = 0,
  'M2. El admin sin segundo factor vio datos del equipo'
);
select pg_temp.expect(
  pg_temp.fails_with($q$insert into public.platform_settings (key, value) values ('b9_prueba', '1')$q$) = '42501'
  and pg_temp.fails_with($q$insert into public.signup_invitations (email) values ('sin-factor@b9.mx')$q$) = '42501'
  and pg_temp.fails_with($q$select public.set_user_role('b9000000-0000-0000-0000-000000000001', 'physician')$q$) = '42501',
  'M2. El admin sin segundo factor cambió configuración, invitó o cambió un rol'
);
reset role;

-- Con aal2 vuelve a ser admin
select pg_temp.as_user('b9000000-0000-0000-0000-000000000003', 'aal2');
select pg_temp.expect(public.current_app_role() = 'admin' and public.is_admin(),
  'M2. El admin con segundo factor no recuperó su rol');
select pg_temp.expect(
  (select count(*) from public.admin_list_users(null, null, 100, 0)) >= 1
  and (select count(*) from public.signup_invitations) >= 1
  and (select count(*) from public.private_accounts where user_id <> auth.uid()) >= 1,
  'M2. El admin con segundo factor no ve lo del equipo'
);
insert into public.signup_invitations (email) values ('con-factor@b9.mx');
reset role;

-- Las funciones del banco del admin también piden el factor
select pg_temp.as_user('b9000000-0000-0000-0000-000000000003', 'aal1');
select pg_temp.expect(
  pg_temp.fails_with($q$select public.admin_bank_overview()$q$) = '42501'
  and pg_temp.fails_with($q$select public.admin_bank_sync_authorize()$q$) = '42501',
  'M2. El admin sin segundo factor usó las funciones del banco'
);
reset role;
select pg_temp.as_user('b9000000-0000-0000-0000-000000000003', 'aal2');
select pg_temp.expect(
  public.admin_bank_sync_authorize() ->> 'actorId' = 'b9000000-0000-0000-0000-000000000003'
  and pg_temp.fails_with($q$select public.admin_bank_overview()$q$) is null,
  'M2. El admin con segundo factor no pudo usar las funciones del banco'
);
reset role;

-- La médica sin segundo factor no ve lo asignado ni decide
select pg_temp.as_user('b9000000-0000-0000-0000-000000000002', 'aal1');
select pg_temp.expect(
  public.current_app_role() = 'student'
  and pg_temp.fails_with(format('select public.editor_question(%L)', current_setting('b9.question'))) = '42501'
  and pg_temp.fails_with($q$select public.editor_list('{}')$q$) = '42501',
  'M2. La médica sin segundo factor vio su pregunta asignada'
);
select pg_temp.expect(
  pg_temp.fails_with(format('select public.editor_decide(%L, %L, %L, null)', current_setting('b9.version'),
    'request_changes', '[Prueba] Comentario simulado')) = '42501',
  'M2. La médica sin segundo factor decidió sobre una pregunta'
);
reset role;

-- Con aal2 ve y decide
select pg_temp.as_user('b9000000-0000-0000-0000-000000000002', 'aal2');
select pg_temp.expect(
  public.current_app_role() = 'physician'
  and public.editor_question(current_setting('b9.question')::uuid) -> 'review' ->> 'role' = 'reviewer',
  'M2. La médica con segundo factor no ve su pregunta asignada'
);
select pg_temp.expect(
  public.editor_decide(current_setting('b9.version')::uuid, 'request_changes', '[Prueba] Comentario simulado', null)
    ->> 'status' = 'draft',
  'M2. La médica con segundo factor no pudo decidir'
);
reset role;

-- El dueño sin segundo factor no administra
select pg_temp.as_user(current_setting('b9.owner'), 'aal1', current_setting('b9.owner_sid'));
select pg_temp.expect(public.current_app_role() = 'student'
  and pg_temp.fails_with($q$select public.set_user_role('b9000000-0000-0000-0000-000000000001', 'physician')$q$) = '42501',
  'M2. El dueño sin segundo factor cambió un rol');
reset role;
select pg_temp.as_user(current_setting('b9.owner'), 'aal2', current_setting('b9.owner_sid'));
select pg_temp.expect(public.current_app_role() = 'owner', 'M2. El dueño con segundo factor no recuperó su rol');
rollback;

-- ===================================================================== M3. La alumna no cambia con la bandera
-- Las mismas operaciones de la alumna dan lo mismo con la bandera apagada y prendida, y con aal1
create or replace function pg_temp.student_snapshot() returns text language plpgsql as $$
declare
  result text;
begin
  perform pg_temp.as_user('b9000000-0000-0000-0000-000000000001', 'aal1');
  result := concat_ws('|',
    public.current_app_role()::text,
    public.is_admin()::text,
    (select count(*) from public.profiles where id = auth.uid())::text,
    (select count(*) from public.private_accounts)::text,
    (select count(*) from public.user_roles)::text,
    (select count(*) from public.signup_invitations)::text,
    pg_temp.rows_changed($q$update public.private_accounts set situation = 'internship' where user_id = auth.uid()$q$)::text,
    coalesce(pg_temp.fails_with($q$insert into public.events (id, user_id, type, at, tz, payload)
      values ('b9-evento-' || gen_random_uuid(), auth.uid(), 'card_reviewed', now(), 'America/Merida', '{}')$q$), 'ok'),
    coalesce(pg_temp.fails_with($q$select * from public.admin_list_users(null, null, 10, 0)$q$), 'ok'));
  reset role;
  return result;
end $$;
begin;
select set_config('b9.snapshot_off', pg_temp.student_snapshot(), true);
select pg_temp.require_mfa('true'::jsonb);
select pg_temp.expect(
  pg_temp.student_snapshot() = current_setting('b9.snapshot_off')
  and current_setting('b9.snapshot_off') like 'student|false|1|1|1|0|1|ok|42501',
  'M3. La alumna cambió con la bandera del segundo factor: ' || current_setting('b9.snapshot_off')
);
rollback;

-- ===================================================================== M4. El dueño no se borra sin segundo factor
begin;
select pg_temp.require_mfa('true'::jsonb);
select pg_temp.as_user(current_setting('b9.owner'), 'aal1', current_setting('b9.owner_sid'));
select pg_temp.expect(
  pg_temp.error_of('select public.delete_my_account()') like '42501 %dueño%',
  'M4. El dueño sin segundo factor pudo borrar su cuenta'
);
rollback;
select pg_temp.expect(
  (select count(*) from auth.users where id = current_setting('b9.owner')::uuid) = 1,
  'M4. La cuenta del dueño se fue'
);
-- Borrar desde el panel, sin la marca de borrar mi cuenta, no lo frena el disparador
begin;
insert into auth.users (id, email, raw_user_meta_data)
  values ('b9000000-0000-0000-0000-000000000007', 'b9-otro-dueno@x.mx', '{"alias":"Dueño de paso"}');
update public.user_roles set role = 'student' where role = 'owner';
update public.user_roles set role = 'owner' where user_id = 'b9000000-0000-0000-0000-000000000007';
delete from auth.users where id = 'b9000000-0000-0000-0000-000000000007';
select pg_temp.expect(
  (select count(*) from auth.users where id = 'b9000000-0000-0000-0000-000000000007') = 0,
  'M4. El disparador frenó un borrado hecho desde el panel'
);
rollback;

-- ===================================================================== M5. Solo el booleano true prende la bandera
-- Igual que la app, que con un valor que no es booleano descarta las banderas y no pide el código. Así
-- la app y la base nunca piden cosas distintas
begin;
do $$
declare
  v_flag text;
begin
  foreach v_flag in array array['"sí"', '"true"', '1', '{}', '[true]', 'null', 'false'] loop
    perform pg_temp.require_mfa(v_flag::jsonb);
    if public.staff_mfa_required() then
      raise exception 'FALLA M5. La bandera con % prendió el segundo factor', v_flag;
    end if;
  end loop;
  update public.platform_settings set value = '[]'::jsonb where key = 'feature_flags';
  if public.staff_mfa_required() then
    raise exception 'FALLA M5. Una clave sin objeto prendió el segundo factor';
  end if;
  update public.platform_settings set value = '"requireMfa"'::jsonb where key = 'feature_flags';
  if public.staff_mfa_required() then
    raise exception 'FALLA M5. Una clave de texto prendió el segundo factor';
  end if;
end $$;
rollback;
begin;
select pg_temp.require_mfa('"sí"'::jsonb);
select pg_temp.as_user('b9000000-0000-0000-0000-000000000003', 'aal1');
select pg_temp.expect(public.is_admin(),
  'M5. Con un valor que no es booleano el admin sin factor dejó de ser admin, y la app no le pide el código');
rollback;
begin;
select pg_temp.require_mfa('true'::jsonb);
select pg_temp.expect(public.staff_mfa_required(), 'M5. El booleano true no prendió el segundo factor');
rollback;

-- ===================================================================== R1. Solo el dueño restablece el segundo factor
begin;
select pg_temp.as_user(current_setting('b9.owner'), 'aal1', current_setting('b9.owner_sid'));
select public.authorize_mfa_reset('b9000000-0000-0000-0000-000000000002');
select pg_temp.expect(
  pg_temp.fails_with($q$select public.authorize_mfa_reset(auth.uid())$q$) = '42501'
  and pg_temp.fails_with($q$select public.authorize_mfa_reset('b9000000-0000-0000-0000-0000000000ff')$q$) = 'P0002'
  and pg_temp.fails_with($q$select public.authorize_mfa_reset(null)$q$) = '42501',
  'R1. El dueño restableció su propio factor, el de alguien que no existe o sin cuenta'
);
-- La bitácora no la lee la API
select pg_temp.expect(
  pg_temp.fails_with($q$select count(*) from public.mfa_resets$q$) = '42501',
  'R1. La bitácora de restablecimientos se pudo leer desde la API'
);
reset role;
select pg_temp.expect(
  (select count(*) from public.mfa_resets
    where user_id = 'b9000000-0000-0000-0000-000000000002' and reset_by = current_setting('b9.owner')::uuid) = 1,
  'R1. El restablecimiento no quedó en la bitácora'
);
rollback;
do $$
declare
  v_user text;
begin
  foreach v_user in array array[
    'b9000000-0000-0000-0000-000000000001', 'b9000000-0000-0000-0000-000000000002',
    'b9000000-0000-0000-0000-000000000003'] loop
    perform pg_temp.as_user(v_user, 'aal2');
    if pg_temp.fails_with($q$select public.authorize_mfa_reset('b9000000-0000-0000-0000-000000000005')$q$)
       is distinct from '42501' then
      raise exception 'FALLA R1. % restableció el segundo factor de alguien', v_user;
    end if;
    reset role;
  end loop;
end $$;
begin;
set local role anon;
select pg_temp.expect(
  pg_temp.fails_with($q$select public.authorize_mfa_reset('b9000000-0000-0000-0000-000000000002')$q$) = '42501',
  'R1. Un anónimo llamó a authorize_mfa_reset'
);
rollback;
-- Con la bandera, el dueño necesita su propio segundo factor
begin;
select pg_temp.require_mfa('true'::jsonb);
select pg_temp.as_user(current_setting('b9.owner'), 'aal1', current_setting('b9.owner_sid'));
select pg_temp.expect(
  pg_temp.fails_with($q$select public.authorize_mfa_reset('b9000000-0000-0000-0000-000000000002')$q$) = '42501',
  'R1. El dueño sin segundo factor restableció el de una médica'
);
reset role;
select pg_temp.as_user(current_setting('b9.owner'), 'aal2', current_setting('b9.owner_sid'));
select public.authorize_mfa_reset('b9000000-0000-0000-0000-000000000002');
rollback;

-- ===================================================================== S1. Cómo nos conociste
begin;
select pg_temp.as_user('b9000000-0000-0000-0000-000000000001');
select pg_temp.expect(
  public.record_signup_source('instagram', ' ana_2026 ')
  and not public.record_signup_source('tiktok', null),
  'S1. La primera respuesta no se guardó o la segunda la pisó'
);
select pg_temp.expect(
  pg_temp.fails_with($q$select count(*) from public.signup_sources$q$) = '42501',
  'S1. La alumna leyó la tabla de respuestas'
);
reset role;
select pg_temp.expect(
  (select channel || ' ' || influencer_code from public.signup_sources
    where user_id = 'b9000000-0000-0000-0000-000000000001') = 'instagram ANA_2026',
  'S1. La respuesta no quedó con el canal y el código limpio'
);
-- Otra cuenta responde sin código
select pg_temp.as_user('b9000000-0000-0000-0000-000000000005');
select pg_temp.expect(public.record_signup_source('friend', '  '), 'S1. Sin código no se guardó');
select pg_temp.expect(
  pg_temp.fails_with($q$select public.record_signup_source('periódico', null)$q$) = '23514',
  'S1. Se aceptó un canal que no está en la lista'
);
reset role;
select pg_temp.as_user('b9000000-0000-0000-0000-000000000006');
select pg_temp.expect(
  pg_temp.fails_with($q$select public.record_signup_source('youtube', 'código con espacios')$q$) = '23514',
  'S1. Se aceptó un código de influencer con caracteres raros'
);
reset role;

-- El admin solo ve conteos, nunca filas
select pg_temp.as_user('b9000000-0000-0000-0000-000000000003');
select pg_temp.expect(
  pg_temp.fails_with($q$select count(*) from public.signup_sources$q$) = '42501',
  'S1. El admin leyó las respuestas una por una'
);
select pg_temp.expect(
  (select total from public.admin_signup_source_counts() where channel = 'instagram') >= 1
  and (select total from public.admin_signup_source_counts() where channel = 'friend') >= 1
  and (select total from public.admin_influencer_code_counts() where code = 'ANA_2026') >= 1
  and not exists (select 1 from public.admin_influencer_code_counts() where code is null),
  'S1. El admin no ve los conteos por canal y por código'
);
reset role;
select pg_temp.as_user('b9000000-0000-0000-0000-000000000001');
select pg_temp.expect(
  pg_temp.fails_with($q$select * from public.admin_signup_source_counts()$q$) = '42501'
  and pg_temp.fails_with($q$select * from public.admin_influencer_code_counts()$q$) = '42501',
  'S1. La alumna leyó los conteos del admin'
);
reset role;
rollback;
begin;
set local role anon;
select pg_temp.expect(
  pg_temp.fails_with($q$select public.record_signup_source('google', null)$q$) = '42501',
  'S1. Un anónimo guardó una respuesta'
);
rollback;
-- Un dispositivo que ya no es el activo no responde a nombre de la cuenta
begin;
select pg_temp.as_user('b9000000-0000-0000-0000-000000000005', 'aal1', 'b9-sesion-ganadora');
select public.claim_device('b9-dispositivo-a', 'Prueba B9');
reset role;
select pg_temp.as_user('b9000000-0000-0000-0000-000000000005', 'aal1', 'b9-sesion-desplazada');
select pg_temp.expect(
  pg_temp.fails_with($q$select public.record_signup_source('google', null)$q$) = '42501',
  'S1. Un dispositivo desplazado guardó la respuesta'
);
rollback;

-- ===================================================================== D1. Fechas nuevas de la cuenta
begin;
select pg_temp.as_user('b9000000-0000-0000-0000-000000000001');
select pg_temp.expect(
  pg_temp.rows_changed($q$update public.private_accounts
    set details_changed_at = '2026-10-13T10:00:00Z', adult_confirmed_at = '2026-10-13T10:00:00Z'
    where user_id = auth.uid()$q$) = 1,
  'D1. La alumna no pudo guardar las fechas de sus datos y de su mayoría de edad'
);
-- La confirmación de mayoría de edad se queda con la primera fecha y no se borra
update public.private_accounts set adult_confirmed_at = null where user_id = auth.uid();
update public.private_accounts set adult_confirmed_at = '2027-01-01T00:00:00Z' where user_id = auth.uid();
select pg_temp.expect(
  (select adult_confirmed_at from public.private_accounts where user_id = auth.uid()) = '2026-10-13T10:00:00Z'::timestamptz
  and (select details_changed_at from public.private_accounts where user_id = auth.uid()) = '2026-10-13T10:00:00Z'::timestamptz,
  'D1. La confirmación de mayoría de edad se borró o cambió de fecha'
);
rollback;

-- ===================================================================== P1. El segundo factor y el plan Gratis
-- Party y los apuntes de la nube siguen el plan y no el rol (B8, 20261021000001). En el proyecto real
-- esta migración se aplica después de las del plan Gratis, así que no debe pisar party_open ni
-- sync_push_records. Con la bandera prendida, un admin con plan de pago y sin segundo factor conserva
-- Party, pero deja de ver como admin los perfiles de todos. La alumna en Gratis sigue sin Party
begin;
select pg_temp.expect(
  position('caller_has_paid_plan' in pg_get_functiondef('public.party_open()'::regprocedure)) > 0
  and position('v_outlines_open' in pg_get_functiondef('public.sync_push_records(jsonb)'::regprocedure)) > 0
  and position('party_moderator' in pg_get_functiondef('public.party_assert_owner(uuid, uuid)'::regprocedure)) > 0,
  'P1. La migración de cuentas y acceso pisó lo del plan Gratis en party_open, sync_push_records o la moderación'
);
select pg_temp.require_mfa('true'::jsonb);
insert into public.subscriptions (user_id, plan, status, provider, current_period_end) values
  ('b9000000-0000-0000-0000-000000000003', 'monthly', 'active', 'stripe', now() + interval '20 days');
select pg_temp.as_user('b9000000-0000-0000-0000-000000000003', 'aal1');
select pg_temp.expect(
  public.party_open() and not public.is_admin() and (select count(id) from public.profiles) = 1,
  'P1. Sin segundo factor el admin perdió Party, que es del plan, o siguió viendo todos los perfiles'
);
reset role;
select pg_temp.as_user('b9000000-0000-0000-0000-000000000003', 'aal2');
select pg_temp.expect(
  public.party_open() and public.is_admin() and (select count(id) from public.profiles) > 1,
  'P1. Con segundo factor el admin no recuperó Party o los perfiles de todos'
);
reset role;
select pg_temp.as_user('b9000000-0000-0000-0000-000000000001', 'aal1');
select pg_temp.expect(not public.party_open(), 'P1. La alumna en Gratis abrió Party con la bandera prendida');
reset role;
rollback;

select 'TODAS LAS PRUEBAS DE CUENTAS Y ACCESO PASARON' as resultado;
