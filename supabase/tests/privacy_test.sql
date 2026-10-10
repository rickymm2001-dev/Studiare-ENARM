-- Pruebas de la privacidad del alumno (migración 20261009000001). Corre después de payments_test.sql
-- sobre la misma base, con usuarios propios. Cada bloque falla con un error si algo no cumple.
\set ON_ERROR_STOP on

create or replace function pg_temp.as_user(uid text, sid text default null) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config(
    'request.jwt.claims',
    (jsonb_build_object('sub', uid, 'role', 'authenticated')
      || case when sid is null then '{}'::jsonb else jsonb_build_object('session_id', sid) end)::text,
    true
  );
  execute 'set local role authenticated';
end $$;

create or replace function pg_temp.as_anon() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  execute 'set local role anon';
end $$;

create or replace function pg_temp.expect(ok boolean, msg text) returns void language plpgsql as $$
begin
  if not coalesce(ok, false) then raise exception 'FALLA %', msg; end if;
end $$;

-- el sqlstate con que falla una sentencia, o null si no falla
create or replace function pg_temp.fails_with(stmt text) returns text language plpgsql as $$
begin
  execute stmt;
  return null;
exception when others then
  return sqlstate;
end $$;

-- ===================================================================== Usuarios
-- V1 alumno con datos, V2 otra persona, V3 con el dispositivo desplazado, V4 admin que cambió un rol
insert into auth.users (id, email, raw_user_meta_data) values
  ('e0000000-0000-0000-0000-000000000001', 'v1@x.mx', '{"alias":"Uno"}'),
  ('e0000000-0000-0000-0000-000000000002', 'v2@x.mx', '{"alias":"Dos"}'),
  ('e0000000-0000-0000-0000-000000000003', 'v3@x.mx', '{"alias":"Tres"}'),
  ('e0000000-0000-0000-0000-000000000004', 'v4@x.mx', '{"alias":"Cuatro"}');
insert into public.user_roles (user_id, role) values
  ('e0000000-0000-0000-0000-000000000004', 'admin')
  on conflict (user_id) do update set role = 'admin';

-- Datos de V1 y de V2 en todas las tablas que borra la función
do $$
declare u uuid;
begin
  foreach u in array array['e0000000-0000-0000-0000-000000000001'::uuid, 'e0000000-0000-0000-0000-000000000002'::uuid] loop
    insert into public.events (id, user_id, type, at, tz, payload)
      values ('priv-evt-' || u, u, 'card_reviewed', now(), 'America/Merida', '{}'),
             ('priv-evt-b-' || u, u, 'question_answered', now(), 'America/Merida', '{}');
    insert into public.sync_records (user_id, kind, record_id, data, updated_at, server_seq)
      values (u, 'deck', 'D-' || u, '{"id":"x"}', now(), nextval('public.sync_records_seq'));
    insert into public.ai_artifacts (user_id, kind, content) values (u, 'flashcard', '{}');
    insert into public.content_reports (reporter_id, target_kind, target_id, reason)
      values (u, 'question', gen_random_uuid(), 'typo');
    insert into public.payments (user_id, provider, provider_payment_id, amount_mxn, status)
      values (u, 'stripe', 'pi_priv_' || u, 150, 'succeeded');
  end loop;
  -- V4 cambió el rol de V2, y eso quedó en la auditoría con su nombre
  update public.user_roles set updated_by = 'e0000000-0000-0000-0000-000000000004'
    where user_id = 'e0000000-0000-0000-0000-000000000002';
  insert into public.role_audit (user_id, old_role, new_role, changed_by)
    values ('e0000000-0000-0000-0000-000000000002', 'student', 'student', 'e0000000-0000-0000-0000-000000000004');
end $$;

-- ===================================================================== P1. La bitácora sigue cerrada
-- Ni siquiera el dueño de la base la edita o la borra fuera de las funciones de borrado
select pg_temp.expect(
  pg_temp.fails_with($q$delete from public.events where user_id = 'e0000000-0000-0000-0000-000000000001'$q$) = '42501',
  'P1. Se pudo borrar la bitácora sin pasar por la función'
);
select pg_temp.expect(
  pg_temp.fails_with($q$update public.events set tz = 'UTC' where user_id = 'e0000000-0000-0000-0000-000000000001'$q$) = '42501',
  'P1. Se pudo editar la bitácora'
);
-- Marcar la transacción a mano para otro usuario tampoco abre nada
begin;
select set_config('app.erasing_user', 'e0000000-0000-0000-0000-000000000002', true);
select pg_temp.expect(
  pg_temp.fails_with($q$delete from public.events where user_id = 'e0000000-0000-0000-0000-000000000001'$q$) = '42501',
  'P1. La marca de otro usuario dejó borrar la bitácora de V1'
);
select pg_temp.expect(
  pg_temp.fails_with($q$update public.events set tz = 'UTC' where user_id = 'e0000000-0000-0000-0000-000000000002'$q$) = '42501',
  'P1. La marca dejó editar la bitácora, y solo el borrado se permite'
);
rollback;

-- ===================================================================== P2. Sin sesión no se borra nada
begin;
select pg_temp.as_anon();
select pg_temp.expect(
  pg_temp.fails_with('select public.delete_my_data()') = '42501',
  'P2. Anon pudo llamar a delete_my_data'
);
select pg_temp.expect(
  pg_temp.fails_with('select public.delete_my_account()') = '42501',
  'P2. Anon pudo llamar a delete_my_account'
);
rollback;

-- ===================================================================== P3. Un dispositivo desplazado no borra
begin;
select pg_temp.as_user('e0000000-0000-0000-0000-000000000003', 's-viejo');
select public.claim_device('dev-a', 'Chrome');
commit;
begin;
select pg_temp.as_user('e0000000-0000-0000-0000-000000000003', 's-nuevo');
select public.claim_device('dev-b', 'Safari');
commit;
begin;
select pg_temp.as_user('e0000000-0000-0000-0000-000000000003', 's-viejo');
select pg_temp.expect(
  pg_temp.fails_with('select public.delete_my_data()') = '42501',
  'P3. Un dispositivo desplazado pudo borrar los datos'
);
select pg_temp.expect(
  pg_temp.fails_with('select public.delete_my_account()') = '42501',
  'P3. Un dispositivo desplazado pudo borrar la cuenta'
);
rollback;

-- ===================================================================== P4. Borrar mis datos
begin;
select pg_temp.as_user('e0000000-0000-0000-0000-000000000001');
select pg_temp.expect(
  (public.delete_my_data() ->> 'events')::int = 2,
  'P4. Debía borrar sus 2 eventos'
);
select pg_temp.expect((select count(*) from public.events) = 0, 'P4. Le quedaron eventos a V1');
select pg_temp.expect((select count(*) from public.sync_records) = 0, 'P4. Le quedaron registros a V1');
select pg_temp.expect((select count(*) from public.content_reports) = 0, 'P4. Le quedaron reportes a V1');
select pg_temp.expect((select count(*) from public.ai_artifacts) = 0, 'P4. Le quedaron borradores de IA a V1');
-- La cuenta y el perfil siguen, y repetirlo no falla ni borra otra cosa
select pg_temp.expect((select count(*) from public.profiles) >= 1, 'P4. Se fue el perfil de V1');
select pg_temp.expect((public.delete_my_data() ->> 'events')::int = 0, 'P4. Repetir debía borrar 0');
commit;

-- Lo de V2 sigue completo, y los pagos de V1 también
select pg_temp.expect(
  (select count(*) from public.events where user_id = 'e0000000-0000-0000-0000-000000000002') = 2,
  'P4. Se borraron eventos de V2'
);
select pg_temp.expect(
  (select count(*) from public.sync_records where user_id = 'e0000000-0000-0000-0000-000000000002') = 1,
  'P4. Se borraron registros de V2'
);
select pg_temp.expect(
  (select count(*) from public.payments where user_id = 'e0000000-0000-0000-0000-000000000001') = 1,
  'P4. Borrar los datos no debe tocar los pagos'
);

-- ===================================================================== P5. Borrar mi cuenta
begin;
select pg_temp.as_user('e0000000-0000-0000-0000-000000000001');
select public.delete_my_account();
commit;
select pg_temp.expect(
  (select count(*) from auth.users where id = 'e0000000-0000-0000-0000-000000000001') = 0,
  'P5. La cuenta de V1 sigue en auth.users'
);
select pg_temp.expect(
  (select count(*) from public.profiles where id = 'e0000000-0000-0000-0000-000000000001') = 0,
  'P5. Quedó el perfil de V1'
);
select pg_temp.expect(
  (select count(*) from public.payments where user_id = 'e0000000-0000-0000-0000-000000000001') = 0,
  'P5. Quedaron pagos de V1'
);

-- V2, con su bitácora, también se puede dar de baja, y nada de V3 se toca
begin;
select pg_temp.as_user('e0000000-0000-0000-0000-000000000002');
select public.delete_my_account();
commit;
select pg_temp.expect(
  (select count(*) from public.events where user_id = 'e0000000-0000-0000-0000-000000000002') = 0,
  'P5. Quedó la bitácora de V2 tras darse de baja'
);
select pg_temp.expect(
  (select count(*) from auth.users where id = 'e0000000-0000-0000-0000-000000000003') = 1,
  'P5. Se fue la cuenta de V3'
);

-- ===================================================================== P6. Un admin se da de baja sin romper la auditoría
-- V4 cambió el rol de V3. El registro de auditoría debe sobrevivir cuando V4 se dé de baja
insert into public.role_audit (user_id, old_role, new_role, changed_by)
  values ('e0000000-0000-0000-0000-000000000003', 'student', 'student', 'e0000000-0000-0000-0000-000000000004');
select pg_temp.expect(
  (select count(*) from public.role_audit where changed_by = 'e0000000-0000-0000-0000-000000000004') >= 1,
  'P6. Preparación, la auditoría apunta al admin antes de que se dé de baja'
);
begin;
select pg_temp.as_user('e0000000-0000-0000-0000-000000000004');
select public.delete_my_account();
commit;
select pg_temp.expect(
  (select count(*) from auth.users where id = 'e0000000-0000-0000-0000-000000000004') = 0,
  'P6. El admin no se pudo dar de baja'
);
select pg_temp.expect(
  (select count(*) from public.role_audit where changed_by = 'e0000000-0000-0000-0000-000000000004') = 0,
  'P6. La auditoría sigue apuntando a un usuario que ya no existe'
);
select pg_temp.expect(
  (select count(*) from public.role_audit
    where user_id = 'e0000000-0000-0000-0000-000000000003' and changed_by is null) >= 1,
  'P6. El registro de auditoría se fue con el admin en lugar de quedarse sin su nombre'
);

-- ===================================================================== P7. El dueño no se da de baja
do $$
declare
  v_owner uuid;
begin
  select user_id into v_owner from public.user_roles where role = 'owner';
  if v_owner is null then
    v_owner := 'e0000000-0000-0000-0000-000000000005';
    insert into auth.users (id, email, raw_user_meta_data) values (v_owner, 'v5@x.mx', '{"alias":"Dueño"}');
    insert into public.user_roles (user_id, role) values (v_owner, 'owner')
      on conflict (user_id) do update set role = 'owner';
  end if;
  perform set_config('privacy.owner', v_owner::text, false);
end $$;
begin;
select pg_temp.as_user(current_setting('privacy.owner'));
select pg_temp.expect(
  pg_temp.fails_with('select public.delete_my_account()') = '42501',
  'P7. El dueño pudo borrar su cuenta'
);
rollback;
select pg_temp.expect(
  (select count(*) from auth.users where id = current_setting('privacy.owner')::uuid) = 1,
  'P7. La cuenta del dueño se fue'
);

-- ===================================================================== P8. Ninguna llave hacia usuarios bloquea el borrado
select pg_temp.expect(
  not exists (
    select 1 from pg_constraint
    where contype = 'f' and confrelid = 'auth.users'::regclass
      and connamespace = 'public'::regnamespace and confdeltype = 'a'
  ),
  'P8. Queda una llave hacia auth.users sin regla al borrar'
);

-- ===================================================================== P9. Un administrador quita a un usuario desde el panel
-- Borrar al usuario de auth.users, sin pasar por las funciones, también arrastra su bitácora
insert into auth.users (id, email, raw_user_meta_data)
  values ('e0000000-0000-0000-0000-000000000006', 'v6@x.mx', '{"alias":"Seis"}');
insert into public.events (id, user_id, type, at, tz, payload)
  values ('priv-evt-v6', 'e0000000-0000-0000-0000-000000000006', 'card_reviewed', now(), 'America/Merida', '{}');
-- Mientras el usuario existe, su bitácora sigue cerrada
select pg_temp.expect(
  pg_temp.fails_with($q$delete from public.events where user_id = 'e0000000-0000-0000-0000-000000000006'$q$) = '42501',
  'P9. Se pudo borrar la bitácora de un usuario que sigue existiendo'
);
delete from auth.users where id = 'e0000000-0000-0000-0000-000000000006';
select pg_temp.expect(
  (select count(*) from public.events where user_id = 'e0000000-0000-0000-0000-000000000006') = 0,
  'P9. La bitácora de un usuario dado de baja por un administrador no se fue con él'
);

select 'TODAS LAS PRUEBAS DE PRIVACIDAD PASARON' as resultado;
