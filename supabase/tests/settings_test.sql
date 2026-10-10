-- Pruebas de la configuración del admin en el servidor (Fase G, G3). Corre después de
-- ai_hosted_test.sql sobre la misma base, con usuarios propios. La clave admin_overrides de
-- platform_settings la lee cualquiera y solo la escribe el admin. Cada bloque falla con un error
-- si algo no cumple.
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

-- ===================================================================== Usuarios
-- S1 alumno, S2 admin
insert into auth.users (id, email, raw_user_meta_data) values
  ('90000000-0000-0000-0000-000000000001', 's1@x.mx', '{"alias":"Alumno"}'),
  ('90000000-0000-0000-0000-000000000002', 's2@x.mx', '{"alias":"Admin"}');
insert into public.user_roles (user_id, role) values
  ('90000000-0000-0000-0000-000000000002', 'admin')
  on conflict (user_id) do update set role = 'admin';

-- ===================================================================== S1. El admin guarda
begin;
select pg_temp.as_user('90000000-0000-0000-0000-000000000002');
insert into public.platform_settings (key, value, updated_at)
  values ('admin_overrides', '{"thresholds":{"bias":{"minTaggedErrors":9}},"aiCostEstimateUsd":3.5}', now())
  on conflict (key) do update set value = excluded.value, updated_at = excluded.updated_at;
select pg_temp.expect(
  (select value #>> '{thresholds,bias,minTaggedErrors}' from public.platform_settings where key = 'admin_overrides') = '9',
  'S1. El admin no pudo guardar los cambios'
);
commit;

-- ===================================================================== S2. Todos lo leen
begin;
select pg_temp.as_anon();
select pg_temp.expect(
  (select value ->> 'aiCostEstimateUsd' from public.platform_settings where key = 'admin_overrides') = '3.5',
  'S2. Sin sesión no se leen los cambios del admin'
);
rollback;
begin;
select pg_temp.as_user('90000000-0000-0000-0000-000000000001');
select pg_temp.expect(
  (select value ->> 'aiCostEstimateUsd' from public.platform_settings where key = 'admin_overrides') = '3.5',
  'S2. Un alumno no lee los cambios del admin'
);
rollback;

-- ===================================================================== S3. El alumno no escribe
begin;
select pg_temp.as_user('90000000-0000-0000-0000-000000000001');
update public.platform_settings set value = '{"aiCostEstimateUsd":0}' where key = 'admin_overrides';
select pg_temp.expect(
  (select value ->> 'aiCostEstimateUsd' from public.platform_settings where key = 'admin_overrides') = '3.5',
  'S3. Un alumno cambió la configuración'
);
delete from public.platform_settings where key = 'admin_overrides';
select pg_temp.expect(
  (select count(*) from public.platform_settings where key = 'admin_overrides') = 1,
  'S3. Un alumno borró la configuración'
);
rollback;

-- Y una fila nueva tampoco la puede crear
begin;
select pg_temp.as_user('90000000-0000-0000-0000-000000000001');
do $$
begin
  begin
    insert into public.platform_settings (key, value) values ('admin_overrides_otra', '{}');
    raise exception 'FALLA S3. Un alumno creó una clave de configuración';
  exception when insufficient_privilege then
    null;
  end;
end $$;
rollback;

-- ===================================================================== S4. Sin sesión tampoco escribe
begin;
select pg_temp.as_anon();
do $$
begin
  begin
    update public.platform_settings set value = '{}' where key = 'admin_overrides';
    if (select value ->> 'aiCostEstimateUsd' from public.platform_settings where key = 'admin_overrides') <> '3.5' then
      raise exception 'FALLA S4. Sin sesión se cambió la configuración';
    end if;
  exception when insufficient_privilege then
    null;
  end;
end $$;
rollback;

-- ===================================================================== S5. El admin restablece
begin;
select pg_temp.as_user('90000000-0000-0000-0000-000000000002');
delete from public.platform_settings where key = 'admin_overrides';
select pg_temp.expect(
  (select count(*) from public.platform_settings where key = 'admin_overrides') = 0,
  'S5. El admin no pudo restablecer los valores de fábrica'
);
select pg_temp.expect(
  (select count(*) from public.platform_settings where key = 'plans') = 1,
  'S5. Restablecer borró otra configuración'
);
commit;

select 'TODAS LAS PRUEBAS DE CONFIGURACION DEL ADMIN PASARON' as resultado;
