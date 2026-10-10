-- Pruebas de la lista de usuarios para el admin (migración 20261013000001). Corre después de
-- client_errors_test.sql sobre la misma base, con usuarios propios. Cada bloque falla con un error
-- si algo no cumple.
\set ON_ERROR_STOP on

create or replace function pg_temp.as_user(uid text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', uid, 'role', 'authenticated')::text, true);
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

-- ===================================================================== Usuarios
-- U1 alumno, U2 médico, U3 admin, U4 alumna con comodines en el alias, U5 alumno con plan de pago
insert into auth.users (id, email, raw_user_meta_data) values
  ('93000000-0000-0000-0000-000000000001', 'u1@x.mx', '{"alias":"Zeta Aprendiz"}'),
  ('93000000-0000-0000-0000-000000000002', 'u2@x.mx', '{"alias":"Zeta Doctora"}'),
  ('93000000-0000-0000-0000-000000000003', 'u3@x.mx', '{"alias":"Zeta Admin"}'),
  ('93000000-0000-0000-0000-000000000004', 'u4_100%@x.mx', '{"alias":"Zeta_100%"}'),
  ('93000000-0000-0000-0000-000000000005', 'u5@x.mx', '{"alias":"Zeta Premium"}');
update public.user_roles set role = 'physician' where user_id = '93000000-0000-0000-0000-000000000002';
update public.user_roles set role = 'admin' where user_id = '93000000-0000-0000-0000-000000000003';
insert into public.subscriptions (user_id, plan, status, provider, current_period_end)
  values ('93000000-0000-0000-0000-000000000005', 'monthly', 'active', 'stripe', now() + interval '10 days');

-- ===================================================================== U1. El admin ve las cuentas con lo necesario
begin;
select pg_temp.as_user('93000000-0000-0000-0000-000000000003');
select pg_temp.expect(
  (select count(*) from public.admin_list_users(null, null, 100, 0) where user_id::text like '93000000%') = 5,
  'U1. El admin no vio las cinco cuentas de prueba'
);
select pg_temp.expect(
  (select email from public.admin_list_users('Zeta Premium', null, 10, 0)) = 'u5@x.mx'
  and (select role from public.admin_list_users('Zeta Premium', null, 10, 0)) = 'student'
  and (select plan from public.admin_list_users('Zeta Premium', null, 10, 0)) = 'monthly'
  and (select plan from public.admin_list_users('Zeta Aprendiz', null, 10, 0)) = 'free',
  'U1. Faltó el correo, el rol o el plan'
);
commit;

-- ===================================================================== U2. Filtros por texto y por rol
begin;
select pg_temp.as_user('93000000-0000-0000-0000-000000000003');
select pg_temp.expect(
  (select count(*) from public.admin_list_users('U2@X.MX', null, 10, 0)) = 1
  and (select count(*) from public.admin_list_users('zeta doc', null, 10, 0)) = 1,
  'U2. La búsqueda por correo o alias no ignora mayúsculas'
);
select pg_temp.expect(
  (select count(*) from public.admin_list_users(null, 'physician', 100, 0) where user_id::text like '93000000%') = 1
  and (select count(*) from public.admin_list_users(null, 'admin', 100, 0) where user_id::text like '93000000%') = 1,
  'U2. El filtro por rol no separa a médicos y admins'
);
-- Los comodines se buscan tal cual. Un guion bajo o un porcentaje no son comodines
select pg_temp.expect(
  (select count(*) from public.admin_list_users('%', null, 100, 0) where user_id::text like '93000000%') = 1
  and (select count(*) from public.admin_list_users('_', null, 100, 0) where user_id::text like '93000000%') = 1,
  'U2. Los comodines de la búsqueda se tomaron como comodines'
);
select pg_temp.expect(
  (select count(*) from public.admin_list_users('texto-que-nadie-tiene', null, 10, 0)) = 0,
  'U2. Una búsqueda sin resultados devolvió filas'
);
-- Un rol que no existe se ignora y no truena
select pg_temp.expect(
  (select count(*) from public.admin_list_users(null, 'superusuario', 100, 0) where user_id::text like '93000000%') = 5,
  'U2. Un rol inválido rompió o filtró la lista'
);
commit;

-- ===================================================================== U3. Orden y paginación
begin;
select pg_temp.as_user('93000000-0000-0000-0000-000000000003');
select pg_temp.expect(
  (select role from public.admin_list_users(null, null, 1, 0)) in ('owner', 'admin'),
  'U3. El equipo no va primero'
);
select pg_temp.expect(
  (select count(*) from public.admin_list_users(null, null, 2, 0)) = 2
  and (select max(total) from public.admin_list_users(null, null, 2, 0)) >= 5
  and (select count(*) from public.admin_list_users(null, null, 2, 2)) = 2,
  'U3. La paginación no respeta el límite o no cuenta el total'
);
select pg_temp.expect(
  (select count(*) from public.admin_list_users(null, null, 100000, 0)) <= 100,
  'U3. El tope del tamaño de página no se respetó'
);
select pg_temp.expect(
  (select count(*) from public.admin_list_users(null, null, -5, -5)) between 1 and 100,
  'U3. Un límite negativo rompió la lista'
);
commit;

-- ===================================================================== U4. Quien no es admin no la ve
begin;
select pg_temp.as_user('93000000-0000-0000-0000-000000000001');
select pg_temp.expect(
  pg_temp.fails_with($q$select * from public.admin_list_users(null, null, 10, 0)$q$) = '42501',
  'U4. Un alumno leyó la lista de usuarios'
);
rollback;
begin;
select pg_temp.as_user('93000000-0000-0000-0000-000000000002');
select pg_temp.expect(
  pg_temp.fails_with($q$select * from public.admin_list_users(null, null, 10, 0)$q$) = '42501',
  'U4. Un médico leyó la lista de usuarios'
);
rollback;
begin;
set local role anon;
select pg_temp.expect(
  pg_temp.fails_with($q$select * from public.admin_list_users(null, null, 10, 0)$q$) = '42501',
  'U4. Sin sesión se leyó la lista de usuarios'
);
rollback;

-- ===================================================================== U5. Nombrar a un médico de punta a punta
-- Un admin nombra médicos, y la lista refleja el cambio. Nombrar admins es solo del dueño y eso ya lo
-- prueba rls_test.sql
begin;
select pg_temp.as_user('93000000-0000-0000-0000-000000000003');
select public.set_user_role('93000000-0000-0000-0000-000000000001', 'physician');
commit;
select pg_temp.expect(
  (select role from public.user_roles where user_id = '93000000-0000-0000-0000-000000000001') = 'physician',
  'U5. El cambio de rol no quedó'
);
begin;
select pg_temp.as_user('93000000-0000-0000-0000-000000000003');
select pg_temp.expect(
  (select role from public.admin_list_users('Zeta Aprendiz', null, 10, 0)) = 'physician',
  'U5. La lista no refleja el rol nuevo'
);
commit;

select 'TODAS LAS PRUEBAS DE USUARIOS DEL ADMIN PASARON' as resultado;
