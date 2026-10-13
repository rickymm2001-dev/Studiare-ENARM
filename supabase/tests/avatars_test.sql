-- Pruebas del bucket de fotos de perfil (migraciones 20261016000001 y 20261017000001). Corre después
-- de plan_prices_test.sql sobre la misma base, con usuarios propios. Simula lo que hace la API de
-- Storage, que lee y escribe storage.objects con el rol y el token de quien llama, y que marca sus
-- borrados con storage.allow_delete_query porque Storage frena los borrados hechos con SQL (el
-- esqueleto lo imita). Cada bloque falla con un error si algo no cumple.
\set ON_ERROR_STOP on

-- ===================================================================== Ayudas de prueba
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
  perform set_config('request.jwt.claim.sub', '', true);
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

-- cuántas filas tocó una sentencia de update o delete
create or replace function pg_temp.rows_changed(stmt text) returns bigint language plpgsql as $$
declare n bigint;
begin
  execute stmt;
  get diagnostics n = row_count;
  return n;
end $$;

-- Lo que hace la API de Storage antes de borrar. Sin esto el freno de Storage rechaza el borrado
create or replace function pg_temp.as_storage_api() returns void language plpgsql as $$
begin
  perform set_config('storage.allow_delete_query', 'true', true);
end $$;

-- cuántas fotos ve quien consulta
create or replace function pg_temp.visible_photos() returns bigint language sql as $$
  select count(*) from storage.objects where bucket_id = 'avatars'
$$;

-- ===================================================================== Usuarios
-- F1 dueño de la foto, F2 otra persona, F3 compañero de grupo de F1, F4 admin
insert into auth.users (id, email, raw_user_meta_data) values
  ('fa000000-0000-0000-0000-000000000001', 'f1@x.mx', '{"alias":"Foto"}'),
  ('fa000000-0000-0000-0000-000000000002', 'f2@x.mx', '{"alias":"Ajeno"}'),
  ('fa000000-0000-0000-0000-000000000003', 'f3@x.mx', '{"alias":"Compa"}'),
  ('fa000000-0000-0000-0000-000000000004', 'f4@x.mx', '{"alias":"Admin"}');
insert into public.user_roles (user_id, role) values ('fa000000-0000-0000-0000-000000000004', 'admin')
  on conflict (user_id) do update set role = 'admin';
-- F1 y F3 comparten un grupo de Party. F2 no está en ninguno
insert into public.groups (id, name, invite_code, owner_id) values
  ('fa000000-0000-0000-0000-00000000000a', 'Fotos', 'FOTO01', 'fa000000-0000-0000-0000-000000000001');
insert into public.memberships (group_id, user_id) values
  ('fa000000-0000-0000-0000-00000000000a', 'fa000000-0000-0000-0000-000000000001'),
  ('fa000000-0000-0000-0000-00000000000a', 'fa000000-0000-0000-0000-000000000003');

-- ===================================================================== A1. El bucket es privado y solo acepta JPEG chicos
select pg_temp.expect(
  exists (
    select 1 from storage.buckets
    where id = 'avatars' and public = false and file_size_limit = 400000
      and allowed_mime_types = array['image/jpeg']
  ),
  'A1. El bucket avatars no es privado, o no limita el tipo y el tamaño'
);

-- ===================================================================== A2. El dueño sube, reemplaza y lee lo suyo
begin;
select pg_temp.as_user('fa000000-0000-0000-0000-000000000001');
insert into storage.objects (bucket_id, name, owner, owner_id, metadata)
  values ('avatars', 'fa000000-0000-0000-0000-000000000001/avatar.jpg', auth.uid(), auth.uid()::text,
          '{"mimetype":"image/jpeg","size":1}');
select pg_temp.expect(pg_temp.visible_photos() = 1, 'A2. El dueño no ve la foto que acaba de subir');
select pg_temp.expect(
  pg_temp.rows_changed($q$update storage.objects set metadata = '{"mimetype":"image/jpeg","size":2}'
    where bucket_id = 'avatars' and name = 'fa000000-0000-0000-0000-000000000001/avatar.jpg'$q$) = 1,
  'A2. El dueño no pudo reemplazar su foto'
);
-- Ni a la carpeta de otro, ni un segundo archivo, ni mover la suya a otra carpeta
select pg_temp.expect(
  pg_temp.fails_with($q$insert into storage.objects (bucket_id, name)
    values ('avatars', 'fa000000-0000-0000-0000-000000000002/avatar.jpg')$q$) = '42501',
  'A2. Subió una foto a la carpeta de otro'
);
select pg_temp.expect(
  pg_temp.fails_with($q$insert into storage.objects (bucket_id, name)
    values ('avatars', 'fa000000-0000-0000-0000-000000000001/otra.jpg')$q$) = '42501',
  'A2. Subió un segundo archivo a su carpeta'
);
select pg_temp.expect(
  pg_temp.fails_with($q$update storage.objects set name = 'fa000000-0000-0000-0000-000000000002/avatar.jpg'
    where bucket_id = 'avatars'$q$) = '42501',
  'A2. Movió su foto a la carpeta de otro'
);
commit;

-- ===================================================================== A3. Otro alumno no la ve ni la toca
begin;
select pg_temp.as_user('fa000000-0000-0000-0000-000000000002');
select pg_temp.as_storage_api();
select pg_temp.expect(pg_temp.visible_photos() = 0, 'A3. Un alumno ajeno vio la foto');
select pg_temp.expect(
  pg_temp.rows_changed($q$update storage.objects set metadata = '{}' where bucket_id = 'avatars'$q$) = 0,
  'A3. Un alumno ajeno editó la foto'
);
select pg_temp.expect(
  pg_temp.rows_changed($q$delete from storage.objects where bucket_id = 'avatars'$q$) = 0,
  'A3. Un alumno ajeno borró la foto'
);
rollback;

-- ===================================================================== A4. Un compañero de grupo la ve, pero no la cambia
begin;
select pg_temp.as_user('fa000000-0000-0000-0000-000000000003');
select pg_temp.as_storage_api();
select pg_temp.expect(pg_temp.visible_photos() = 1, 'A4. El compañero de grupo no ve la foto');
select pg_temp.expect(
  pg_temp.rows_changed($q$update storage.objects set metadata = '{}' where bucket_id = 'avatars'$q$) = 0,
  'A4. El compañero de grupo editó la foto'
);
select pg_temp.expect(
  pg_temp.rows_changed($q$delete from storage.objects where bucket_id = 'avatars'$q$) = 0,
  'A4. El compañero de grupo borró la foto'
);
rollback;

-- ===================================================================== A5. Sin sesión no se ve ni se sube nada
begin;
select pg_temp.as_anon();
select pg_temp.expect(pg_temp.visible_photos() = 0, 'A5. Alguien sin sesión vio la foto');
select pg_temp.expect(
  pg_temp.fails_with($q$insert into storage.objects (bucket_id, name)
    values ('avatars', 'fa000000-0000-0000-0000-000000000005/avatar.jpg')$q$) = '42501',
  'A5. Alguien sin sesión subió una foto'
);
rollback;

-- ===================================================================== A6. El admin no la ve
-- La ven solo el alumno y su grupo de Party (20261017000001). Ser admin no basta
begin;
select pg_temp.as_user('fa000000-0000-0000-0000-000000000004');
select pg_temp.expect(pg_temp.visible_photos() = 0, 'A6. El admin ve la foto de un alumno');
rollback;

-- ===================================================================== A7. Al salir del grupo deja de verla
update public.memberships set left_at = now() where user_id = 'fa000000-0000-0000-0000-000000000003';
begin;
select pg_temp.as_user('fa000000-0000-0000-0000-000000000003');
select pg_temp.expect(pg_temp.visible_photos() = 0, 'A7. Un excompañero sigue viendo la foto');
rollback;

-- ===================================================================== A8. Un dispositivo desplazado no la lee ni la reemplaza
begin;
select pg_temp.as_user('fa000000-0000-0000-0000-000000000001', 's-viejo');
select public.claim_device('dev-a', 'Chrome');
commit;
begin;
select pg_temp.as_user('fa000000-0000-0000-0000-000000000001', 's-nuevo');
select public.claim_device('dev-b', 'Safari');
commit;
begin;
select pg_temp.as_user('fa000000-0000-0000-0000-000000000001', 's-viejo');
select pg_temp.expect(pg_temp.visible_photos() = 0, 'A8. El dispositivo desplazado ve la foto');
select pg_temp.expect(
  pg_temp.rows_changed($q$update storage.objects set metadata = '{}' where bucket_id = 'avatars'$q$) = 0,
  'A8. El dispositivo desplazado reemplazó la foto'
);
rollback;
begin;
select pg_temp.as_user('fa000000-0000-0000-0000-000000000001', 's-nuevo');
select pg_temp.expect(pg_temp.visible_photos() = 1, 'A8. El dispositivo activo no ve la foto');
rollback;

-- ===================================================================== A9. El dueño borra la suya
begin;
select pg_temp.as_user('fa000000-0000-0000-0000-000000000001', 's-nuevo');
select pg_temp.as_storage_api();
select pg_temp.expect(
  pg_temp.rows_changed($q$delete from storage.objects where bucket_id = 'avatars'
    and name = 'fa000000-0000-0000-0000-000000000001/avatar.jpg'$q$) = 1,
  'A9. El dueño no pudo borrar su foto'
);
rollback;

-- ===================================================================== A10. El respaldo de la base no frena el borrado de la cuenta
-- Storage no deja que la base borre sus filas con SQL, así que el disparador de respaldo solo deja un
-- aviso, que aquí se calla, y la cuenta se borra igual. La foto la quita la app con la API (A13)
select pg_temp.expect(
  (select count(*) from storage.objects where name like 'fa000000-0000-0000-0000-000000000001/%') = 1,
  'A10. Preparación, la foto debía seguir ahí'
);
set client_min_messages = error;
delete from auth.users where id = 'fa000000-0000-0000-0000-000000000001';
reset client_min_messages;
select pg_temp.expect(
  not exists (select 1 from auth.users where id = 'fa000000-0000-0000-0000-000000000001'),
  'A10. El respaldo de la foto frenó el borrado de la cuenta'
);
select pg_temp.expect(
  (select count(*) from storage.objects where name like 'fa000000-0000-0000-0000-000000000001/%') = 1,
  'A10. La base borró la foto con SQL. Storage no lo permite y el esqueleto debe imitarlo'
);

-- ===================================================================== A11. Las rutas raras no rompen las políticas
select pg_temp.expect(
  public.avatar_owner('fa000000-0000-0000-0000-000000000002/avatar.jpg') = 'fa000000-0000-0000-0000-000000000002',
  'A11. avatar_owner no reconoce una ruta válida'
);
select pg_temp.expect(
  public.avatar_owner('no-es-uuid/avatar.jpg') is null
    and public.avatar_owner('fa000000-0000-0000-0000-000000000002/otra.jpg') is null
    and public.avatar_owner('avatar.jpg') is null,
  'A11. avatar_owner acepta rutas que no son de una foto'
);

-- ===================================================================== A12. La fecha de la elección de foto
-- Vive en la fila de la cuenta, nace vacía y la cambia solo el dueño desde su dispositivo activo
select pg_temp.expect(
  exists (
    select 1 from public.private_accounts
    where user_id = 'fa000000-0000-0000-0000-000000000003' and avatar_changed_at is null
  ),
  'A12. Una cuenta nueva ya traía una fecha de elección de foto'
);
begin;
select pg_temp.as_user('fa000000-0000-0000-0000-000000000003');
select pg_temp.expect(
  pg_temp.rows_changed($q$update public.private_accounts
    set avatar = '{"kind":"initials"}', avatar_changed_at = '2026-10-13T10:00:00.123Z'
    where user_id = auth.uid()$q$) = 1,
  'A12. El dueño no pudo guardar la fecha de su elección'
);
select pg_temp.expect(
  (select avatar_changed_at from public.private_accounts where user_id = auth.uid())
    = '2026-10-13T10:00:00.123Z'::timestamptz,
  'A12. La fecha no quedó como la mandó el dueño'
);
commit;
begin;
select pg_temp.as_user('fa000000-0000-0000-0000-000000000002');
select pg_temp.expect(
  pg_temp.rows_changed($q$update public.private_accounts set avatar_changed_at = now()
    where user_id = 'fa000000-0000-0000-0000-000000000003'$q$) = 0,
  'A12. Otro alumno cambió la fecha de la elección ajena'
);
rollback;

-- ===================================================================== A13. Eliminar la cuenta como lo hace la app
-- Primero la API de Storage quita la foto con la sesión del alumno y después delete_my_account. Son
-- peticiones distintas, así que van en transacciones distintas
begin;
select pg_temp.as_user('fa000000-0000-0000-0000-000000000002');
insert into storage.objects (bucket_id, name, owner, owner_id, metadata)
  values ('avatars', 'fa000000-0000-0000-0000-000000000002/avatar.jpg', auth.uid(), auth.uid()::text,
          '{"mimetype":"image/jpeg","size":1}');
commit;
begin;
select pg_temp.as_user('fa000000-0000-0000-0000-000000000002');
select pg_temp.as_storage_api();
select pg_temp.expect(
  pg_temp.rows_changed($q$delete from storage.objects where bucket_id = 'avatars'
    and name = 'fa000000-0000-0000-0000-000000000002/avatar.jpg'$q$) = 1,
  'A13. El alumno no pudo quitar su foto con la API antes de eliminar su cuenta'
);
commit;
begin;
select pg_temp.as_user('fa000000-0000-0000-0000-000000000002');
-- El respaldo de la base ya no encuentra foto, pero su aviso de que Storage no lo deja se calla igual
set local client_min_messages = error;
select public.delete_my_account();
commit;
select pg_temp.expect(
  not exists (select 1 from auth.users where id = 'fa000000-0000-0000-0000-000000000002')
    and not exists (
      select 1 from storage.objects where name like 'fa000000-0000-0000-0000-000000000002/%'
    ),
  'A13. Quedó la cuenta o quedó la foto'
);

select 'TODAS LAS PRUEBAS DE FOTOS DE PERFIL PASARON' as resultado;
