-- Pruebas de permisos por fila y roles (D-069). Cada bloque falla con un error si algo no cumple.
\set ON_ERROR_STOP on

-- Usuarios de prueba. Al insertarlos nace su perfil, su rol de alumno y su cuenta
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'dueno@x.mx', '{"alias":"Dueño"}'),
  ('00000000-0000-0000-0000-00000000000b', 'admin@x.mx', '{"alias":"Admin"}'),
  ('00000000-0000-0000-0000-00000000000c', 'medico@x.mx', '{"alias":"Médica"}'),
  ('00000000-0000-0000-0000-00000000000d', 'alumno1@x.mx', '{"alias":"Uno"}'),
  ('00000000-0000-0000-0000-00000000000e', 'alumno2@x.mx', '{"alias":"Dos"}');

-- El dueño se fija una sola vez con la llave de servicio, nunca desde la app
update public.user_roles set role = 'owner' where user_id = '00000000-0000-0000-0000-00000000000a';

create or replace function pg_temp.as_user(uid text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', uid, true);
  execute 'set local role authenticated';
end $$;

-- 1. Toda cuenta nueva nace como alumno, con perfil y cuenta privada
do $$ begin
  if (select count(*) from public.user_roles where role = 'student') <> 4 then
    raise exception 'FALLA 1. Las cuentas nuevas no nacieron como alumno';
  end if;
  if (select count(*) from public.profiles) <> 5 or (select count(*) from public.private_accounts) <> 5 then
    raise exception 'FALLA 1. Falta perfil o cuenta privada';
  end if;
end $$;

-- 2. Un alumno no puede cambiar roles, ni el suyo
begin;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000d');
do $$ begin
  begin
    perform public.set_user_role('00000000-0000-0000-0000-00000000000e', 'admin');
    raise exception 'FALLA 2. Un alumno cambió un rol';
  exception when insufficient_privilege then null; end;
  update public.user_roles set role = 'admin' where user_id = auth.uid();
  if (select role from public.user_roles where user_id = auth.uid()) <> 'student' then
    raise exception 'FALLA 2. Un alumno se subió de rol escribiendo directo';
  end if;
end $$;
rollback;

-- 3. El dueño nombra administrador. El admin nombra médico pero no administradores
begin;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select public.set_user_role('00000000-0000-0000-0000-00000000000b', 'admin');
commit;
begin;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select public.set_user_role('00000000-0000-0000-0000-00000000000c', 'physician');
do $$ begin
  begin
    perform public.set_user_role('00000000-0000-0000-0000-00000000000d', 'admin');
    raise exception 'FALLA 3. Un admin nombró a otro admin';
  exception when insufficient_privilege then null; end;
end $$;
commit;

-- 4. Nadie puede quitar al dueño ni darse el rol de dueño
begin;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
do $$ begin
  begin
    perform public.set_user_role('00000000-0000-0000-0000-00000000000a', 'student');
    raise exception 'FALLA 4. Un admin quitó al dueño';
  exception when insufficient_privilege then null; end;
  begin
    perform public.set_user_role('00000000-0000-0000-0000-00000000000d', 'owner');
    raise exception 'FALLA 4. Se asignó el rol de dueño desde la app';
  exception when insufficient_privilege then null; end;
end $$;
rollback;

-- 5. Cada cambio de rol queda en la bitácora de auditoría
do $$ begin
  if (select count(*) from public.role_audit) <> 2 then
    raise exception 'FALLA 5. La auditoría no tiene los 2 cambios de rol';
  end if;
end $$;

-- 6. El médico solo ve las preguntas asignadas, además de las aprobadas
insert into public.questions (id, question_id, version, branch, topic, body, editorial_status) values
  ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 1, 'pediatrics', 'neonatology', '{}', 'in_review'),
  ('10000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000002', 1, 'pediatrics', 'neonatology', '{}', 'in_review'),
  ('10000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000003', 1, 'pediatrics', 'neonatology', '{}', 'approved');
insert into public.review_assignments (question_id, physician_id) values
  ('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000c');
begin;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
do $$ begin
  if (select count(*) from public.questions) <> 2 then
    raise exception 'FALLA 6. El médico ve preguntas que no le asignaron';
  end if;
  insert into public.review_decisions (question_version_id, physician_id, decision)
    values ('10000000-0000-0000-0000-000000000001', auth.uid(), 'approve');
  begin
    insert into public.review_decisions (question_version_id, physician_id, decision)
      values ('10000000-0000-0000-0000-000000000002', auth.uid(), 'approve');
    raise exception 'FALLA 6. El médico decidió sobre una pregunta no asignada';
  exception when insufficient_privilege then null; end;
end $$;
rollback;

-- 7. El alumno solo ve lo aprobado y no puede escribir preguntas
begin;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000d');
do $$ begin
  if (select count(*) from public.questions) <> 1 then
    raise exception 'FALLA 7. El alumno ve preguntas sin aprobar';
  end if;
  begin
    insert into public.questions (question_id, version, branch, topic, body)
      values (gen_random_uuid(), 1, 'x', 'y', '{}');
    raise exception 'FALLA 7. El alumno escribió una pregunta';
  exception when insufficient_privilege then null; end;
end $$;
rollback;

-- 8. Los datos de cuenta de un alumno no los ve otro alumno. El admin sí
begin;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000d');
do $$ begin
  if (select count(*) from public.private_accounts) <> 1 then
    raise exception 'FALLA 8. Un alumno ve la cuenta de otro';
  end if;
end $$;
rollback;
begin;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
do $$ begin
  if (select count(*) from public.private_accounts) <> 5 then
    raise exception 'FALLA 8. El admin no ve las cuentas';
  end if;
end $$;
rollback;

-- 9. La bitácora solo se agrega. Cada quien agrega la suya y nadie la edita ni la borra
begin;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000d');
insert into public.events (id, user_id, type, at, tz, payload)
  values ('evt-1', auth.uid(), 'card_reviewed', now(), 'America/Merida', '{}');
do $$ begin
  begin
    insert into public.events (id, user_id, type, at, tz, payload)
      values ('evt-2', '00000000-0000-0000-0000-00000000000e', 'card_reviewed', now(), 'America/Merida', '{}');
    raise exception 'FALLA 9. Un alumno agregó eventos a nombre de otro';
  exception when insufficient_privilege then null; end;
end $$;
commit;
do $$ begin
  begin
    update public.events set type = 'otro' where id = 'evt-1';
    raise exception 'FALLA 9. Se editó un evento';
  exception when insufficient_privilege then null; end;
  begin
    delete from public.events where id = 'evt-1';
    raise exception 'FALLA 9. Se borró un evento';
  exception when insufficient_privilege then null; end;
end $$;

-- 10. Perfiles de otros solo si comparten grupo
begin;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000d');
do $$ begin
  if (select count(*) from public.profiles) <> 1 then
    raise exception 'FALLA 10. Un alumno ve perfiles fuera de sus grupos';
  end if;
end $$;
insert into public.groups (id, name, invite_code, owner_id)
  values ('30000000-0000-0000-0000-000000000001', 'R0 Mérida', 'ABC234', auth.uid());
insert into public.memberships (group_id, user_id) values ('30000000-0000-0000-0000-000000000001', auth.uid());
commit;
begin;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000e');
insert into public.memberships (group_id, user_id) values ('30000000-0000-0000-0000-000000000001', auth.uid());
do $$ begin
  if (select count(*) from public.profiles) <> 2 then
    raise exception 'FALLA 10. Compañeros de grupo no se ven';
  end if;
end $$;
commit;

-- 11. La configuración la lee cualquiera, la cambia solo el admin
begin;
set local role anon;
do $$ begin
  if (select count(*) from public.platform_settings) < 1 then
    raise exception 'FALLA 11. Sin sesión no se lee la configuración';
  end if;
end $$;
rollback;
begin;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000d');
update public.platform_settings set value = '{}' where key = 'plans';
do $$ begin
  if (select value from public.platform_settings where key = 'plans') = '{}'::jsonb then
    raise exception 'FALLA 11. Un alumno cambió la configuración';
  end if;
end $$;
rollback;

-- 12. Un alumno no puede darse una suscripción
begin;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000d');
do $$ begin
  begin
    insert into public.subscriptions (user_id, plan, status) values (auth.uid(), 'annual', 'active');
    raise exception 'FALLA 12. Un alumno se activó una suscripción';
  exception when insufficient_privilege then null; end;
end $$;
rollback;

\echo 'TODAS LAS PRUEBAS DE PERMISOS PASARON'
