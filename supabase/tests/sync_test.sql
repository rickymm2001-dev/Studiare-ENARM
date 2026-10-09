-- Pruebas de la sincronización entre dispositivos (migración 20261008000002). Corre después de
-- device_barrier_test.sql sobre la misma base, con usuarios propios. Cada bloque falla con un error
-- si algo no cumple.
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

create or replace function pg_temp.expect(ok boolean, msg text) returns void language plpgsql as $$
begin
  if not coalesce(ok, false) then raise exception 'FALLA %', msg; end if;
end $$;

-- true si la sentencia la rechazan los permisos (sqlstate 42501)
create or replace function pg_temp.is_blocked(stmt text) returns boolean language plpgsql as $$
begin
  execute stmt;
  return false;
exception when insufficient_privilege then
  return true;
end $$;

-- cuántas filas tocó una sentencia de update o delete
create or replace function pg_temp.rows_changed(stmt text) returns bigint language plpgsql as $$
declare n bigint;
begin
  execute stmt;
  get diagnostics n = row_count;
  return n;
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
-- Y1 alumno principal, Y2 otra persona, Y3 con dispositivo reclamado
insert into auth.users (id, email, raw_user_meta_data) values
  ('c0000000-0000-0000-0000-000000000001', 'y1@x.mx', '{"alias":"Uno"}'),
  ('c0000000-0000-0000-0000-000000000002', 'y2@x.mx', '{"alias":"Dos"}'),
  ('c0000000-0000-0000-0000-000000000003', 'y3@x.mx', '{"alias":"Tres"}');

-- ===================================================================== Y1. Subir y bajar registros
begin;
select pg_temp.as_user('c0000000-0000-0000-0000-000000000001');
select pg_temp.expect(
  public.sync_push_records('[
    {"kind":"deck","id":"D1","updatedAt":"2026-10-08T10:00:00.000Z","deletedAt":null,"data":{"id":"D1","name":"Mazo uno"}},
    {"kind":"note","id":"N1","updatedAt":"2026-10-08T10:00:01.000Z","deletedAt":null,"data":{"id":"N1","front":"a"}}
  ]'::jsonb) = 2,
  'Y1. La primera subida debía cambiar 2 registros'
);
select pg_temp.expect((select count(*) from public.sync_records) = 2, 'Y1. El dueño no ve sus 2 registros');
select pg_temp.expect(
  (select server_seq from public.sync_records where record_id = 'N1') >
  (select server_seq from public.sync_records where record_id = 'D1'),
  'Y1. El contador debe crecer en el orden de la subida'
);
commit;

-- Otra persona no ve nada de lo de Y1
begin;
select pg_temp.as_user('c0000000-0000-0000-0000-000000000002');
select pg_temp.expect((select count(*) from public.sync_records) = 0, 'Y1. Otra persona ve registros ajenos');
commit;

-- ===================================================================== Y2. Gana la fecha más reciente
begin;
select pg_temp.as_user('c0000000-0000-0000-0000-000000000001');
create temp table seq_before as select record_id, server_seq from public.sync_records;
-- Una edición más vieja no cambia nada y no mueve el contador
select pg_temp.expect(
  public.sync_push_records('[{"kind":"deck","id":"D1","updatedAt":"2026-10-08T09:00:00.000Z","deletedAt":null,"data":{"id":"D1","name":"Vieja"}}]'::jsonb) = 0,
  'Y2. Una edición más vieja no debía cambiar nada'
);
select pg_temp.expect(
  (select data ->> 'name' from public.sync_records where record_id = 'D1') = 'Mazo uno',
  'Y2. La edición vieja pisó a la nueva'
);
-- Con la misma fecha se queda la que ya estaba
select pg_temp.expect(
  public.sync_push_records('[{"kind":"deck","id":"D1","updatedAt":"2026-10-08T10:00:00.000Z","deletedAt":null,"data":{"id":"D1","name":"Empate"}}]'::jsonb) = 0,
  'Y2. Un empate no debía cambiar nada'
);
select pg_temp.expect(
  (select data ->> 'name' from public.sync_records where record_id = 'D1') = 'Mazo uno',
  'Y2. El empate pisó a lo que ya estaba'
);
select pg_temp.expect(
  (select server_seq from public.sync_records where record_id = 'D1') =
  (select server_seq from seq_before where record_id = 'D1'),
  'Y2. Lo que no cambió movió su contador'
);
-- Una edición más nueva sí gana y mueve el contador
select pg_temp.expect(
  public.sync_push_records('[{"kind":"deck","id":"D1","updatedAt":"2026-10-08T11:00:00.000Z","deletedAt":null,"data":{"id":"D1","name":"Nueva"}}]'::jsonb) = 1,
  'Y2. Una edición más nueva debía cambiar el registro'
);
select pg_temp.expect(
  (select data ->> 'name' from public.sync_records where record_id = 'D1') = 'Nueva',
  'Y2. La edición nueva no quedó guardada'
);
select pg_temp.expect(
  (select server_seq from public.sync_records where record_id = 'D1') >
  (select max(server_seq) from seq_before),
  'Y2. Lo que cambió no avanzó su contador'
);
commit;

-- ===================================================================== Y3. Borrados
begin;
select pg_temp.as_user('c0000000-0000-0000-0000-000000000001');
-- Borrar es una fila con deleted_at, que otro dispositivo baja como cualquier cambio
select pg_temp.expect(
  public.sync_push_records('[{"kind":"note","id":"N1","updatedAt":"2026-10-08T12:00:00.000Z","deletedAt":"2026-10-08T12:00:00.000Z","data":{"id":"N1","front":"a"}}]'::jsonb) = 1,
  'Y3. El borrado debía cambiar el registro'
);
select pg_temp.expect(
  (select deleted_at is not null from public.sync_records where record_id = 'N1'),
  'Y3. El borrado no dejó su marca'
);
-- Una edición anterior al borrado no lo revive
select pg_temp.expect(
  public.sync_push_records('[{"kind":"note","id":"N1","updatedAt":"2026-10-08T11:30:00.000Z","deletedAt":null,"data":{"id":"N1","front":"b"}}]'::jsonb) = 0,
  'Y3. Una edición anterior al borrado lo revivió'
);
select pg_temp.expect(
  (select deleted_at is not null from public.sync_records where record_id = 'N1'),
  'Y3. La edición vieja quitó la marca de borrado'
);
-- Una edición posterior sí lo revive
select pg_temp.expect(
  public.sync_push_records('[{"kind":"note","id":"N1","updatedAt":"2026-10-08T13:00:00.000Z","deletedAt":null,"data":{"id":"N1","front":"c"}}]'::jsonb) = 1,
  'Y3. Una edición posterior al borrado debía poder revivirlo'
);
select pg_temp.expect(
  (select deleted_at is null and data ->> 'front' = 'c' from public.sync_records where record_id = 'N1'),
  'Y3. La edición posterior no quedó guardada'
);
commit;

-- ===================================================================== Y4. Entradas inválidas
begin;
select pg_temp.as_user('c0000000-0000-0000-0000-000000000001');
select pg_temp.expect(
  pg_temp.fails_with($q$select public.sync_push_records('[{"kind":"nada","id":"X","updatedAt":"2026-10-08T10:00:00.000Z","data":{}}]'::jsonb)$q$) = '22023',
  'Y4. Un tipo desconocido debía rechazarse'
);
rollback;
begin;
select pg_temp.as_user('c0000000-0000-0000-0000-000000000001');
select pg_temp.expect(
  pg_temp.fails_with($q$select public.sync_push_records('{"kind":"deck"}'::jsonb)$q$) = '22023',
  'Y4. Algo que no es un arreglo debía rechazarse'
);
select pg_temp.expect(
  pg_temp.fails_with($q$select public.sync_push_records('[{"kind":"deck","id":"X","updatedAt":"2026-10-08T10:00:00.000Z","data":[]}]'::jsonb)$q$) = '22023',
  'Y4. Un data que no es objeto debía rechazarse'
);
select pg_temp.expect(
  pg_temp.fails_with($q$select public.sync_push_records('[{"kind":"deck","id":"X","data":{}}]'::jsonb)$q$) in ('22023', '22004', '23502'),
  'Y4. Sin updatedAt debía rechazarse'
);
select pg_temp.expect(
  pg_temp.fails_with($q$select public.sync_push_records((select jsonb_agg(jsonb_build_object('kind','deck','id','m' || g,'updatedAt','2026-10-08T10:00:00.000Z','data','{}'::jsonb)) from generate_series(1, 501) g))$q$) = '22023',
  'Y4. Más de 500 registros debía rechazarse'
);
select pg_temp.expect(
  pg_temp.fails_with($q$select public.sync_push_records(jsonb_build_array(jsonb_build_object('kind','deck','id','futuro','updatedAt', to_char(now() + interval '1 hour', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),'data','{}'::jsonb)))$q$) = 'SY002',
  'Y4. Una fecha en el futuro debía rechazarse'
);
select pg_temp.expect(
  pg_temp.fails_with($q$select public.sync_push_records(jsonb_build_array(jsonb_build_object('kind','deck','id','grande','updatedAt','2026-10-08T10:00:00.000Z','data', jsonb_build_object('x', repeat('a', 300000)))))$q$) = '22023',
  'Y4. Un registro de más de 256 KB debía rechazarse'
);
commit;

-- ===================================================================== Y5. Nadie escribe por fuera de la función
begin;
select pg_temp.as_user('c0000000-0000-0000-0000-000000000001');
select pg_temp.expect(
  pg_temp.is_blocked($q$insert into public.sync_records (user_id, kind, record_id, data, updated_at, server_seq) values (auth.uid(), 'deck', 'directo', '{}', now(), 1)$q$),
  'Y5. Se pudo insertar directo en sync_records'
);
select pg_temp.expect(
  pg_temp.is_blocked($q$update public.sync_records set data = '{}'$q$),
  'Y5. Se pudo editar directo en sync_records'
);
select pg_temp.expect(
  pg_temp.is_blocked($q$delete from public.sync_records$q$),
  'Y5. Se pudo borrar directo en sync_records'
);
commit;

-- Sin sesión no hay nada. anon no ejecuta las funciones ni lee la tabla
begin;
set local role anon;
select pg_temp.expect(
  pg_temp.is_blocked($q$select count(*) from public.sync_records$q$),
  'Y5. anon pudo leer sync_records'
);
select pg_temp.expect(
  pg_temp.is_blocked($q$select public.sync_push_records('[]'::jsonb)$q$),
  'Y5. anon pudo ejecutar sync_push_records'
);
select pg_temp.expect(
  pg_temp.is_blocked($q$select public.sync_push_events('[]'::jsonb)$q$),
  'Y5. anon pudo ejecutar sync_push_events'
);
commit;

-- ===================================================================== Y6. Reloj
begin;
select pg_temp.as_user('c0000000-0000-0000-0000-000000000001');
select pg_temp.expect(abs(extract(epoch from (public.sync_clock() - now()))) < 5, 'Y6. sync_clock no devolvió la hora del servidor');
commit;

-- ===================================================================== Y7. Bitácora
begin;
select pg_temp.as_user('c0000000-0000-0000-0000-000000000001');
select pg_temp.expect(
  public.sync_push_events('[
    {"id":"sync-evt-1","type":"card_reviewed","at":"2026-10-08T10:00:00.000Z","tz":"America/Merida","sessionId":null,"schemaVersion":1,"payload":{"x":1}},
    {"id":"sync-evt-2","type":"card_reviewed","at":"2026-10-08T10:00:05.000Z","tz":"America/Merida","sessionId":"s-1","schemaVersion":1,"payload":{"x":2}}
  ]'::jsonb) = 2,
  'Y7. La primera subida de eventos debía agregar 2'
);
-- Subir lo mismo otra vez no duplica ni cambia nada
select pg_temp.expect(
  public.sync_push_events('[{"id":"sync-evt-1","type":"card_reviewed","at":"2026-10-08T10:00:00.000Z","tz":"America/Merida","sessionId":null,"schemaVersion":1,"payload":{"x":999}}]'::jsonb) = 0,
  'Y7. Un evento repetido debía ignorarse'
);
select pg_temp.expect(
  (select payload ->> 'x' from public.events where id = 'sync-evt-1') = '1',
  'Y7. Un evento repetido cambió el original'
);
select pg_temp.expect(
  (select seq from public.events where id = 'sync-evt-2') > (select seq from public.events where id = 'sync-evt-1'),
  'Y7. El contador de eventos debe crecer en el orden de la subida'
);
select pg_temp.expect(
  (select session_id from public.events where id = 'sync-evt-2') = 's-1'
    and (select session_id is null from public.events where id = 'sync-evt-1'),
  'Y7. La sesión del evento no se guardó bien'
);
-- La bitácora sigue siendo de solo agregar
select pg_temp.expect(
  pg_temp.rows_changed($q$update public.events set payload = '{}' where id = 'sync-evt-1'$q$) = 0,
  'Y7. Se pudo editar un evento'
);
select pg_temp.expect(
  pg_temp.rows_changed($q$delete from public.events where id = 'sync-evt-1'$q$) = 0,
  'Y7. Se pudo borrar un evento'
);
select pg_temp.expect(
  pg_temp.fails_with($q$select public.sync_push_events('[{"id":"f","type":"x","at":"2099-01-01T00:00:00.000Z","tz":"America/Merida","payload":{}}]'::jsonb)$q$) = 'SY002',
  'Y7. Un evento en el futuro debía rechazarse'
);
select pg_temp.expect(
  pg_temp.fails_with($q$select public.sync_push_events('[{"id":"g","type":"x","tz":"America/Merida","payload":[]}]'::jsonb)$q$) = '22023',
  'Y7. Un evento con payload inválido debía rechazarse'
);
commit;

-- Otra persona no ve la bitácora ajena y su mismo id no pisa al original
begin;
select pg_temp.as_user('c0000000-0000-0000-0000-000000000002');
select pg_temp.expect((select count(*) from public.events where id like 'sync-evt-%') = 0, 'Y7. Otra persona ve eventos ajenos');
select pg_temp.expect(
  public.sync_push_events('[{"id":"sync-evt-1","type":"card_reviewed","at":"2026-10-08T10:00:00.000Z","tz":"America/Merida","payload":{"x":7}}]'::jsonb) = 0,
  'Y7. Un id ya usado por otra persona debía ignorarse'
);
commit;
begin;
select pg_temp.as_user('c0000000-0000-0000-0000-000000000001');
select pg_temp.expect(
  (select payload ->> 'x' from public.events where id = 'sync-evt-1') = '1',
  'Y7. El evento de otra persona pisó al original'
);
-- Bajar solo lo nuevo, con el contador como cursor
select pg_temp.expect(
  (select count(*) from public.events where id like 'sync-evt-%' and seq > (select seq from public.events where id = 'sync-evt-1')) = 1,
  'Y7. El cursor por seq no devolvió solo lo nuevo'
);
commit;

-- ===================================================================== Y8. Solo el dispositivo activo
begin;
select pg_temp.as_user('c0000000-0000-0000-0000-000000000003', 'ses-a');
select public.claim_device('dev-a', 'Chrome');
select pg_temp.expect(
  public.sync_push_records('[{"kind":"deck","id":"DA","updatedAt":"2026-10-08T10:00:00.000Z","deletedAt":null,"data":{"id":"DA"}}]'::jsonb) = 1,
  'Y8. El dispositivo activo debía poder subir'
);
select pg_temp.expect((select count(*) from public.sync_records) = 1, 'Y8. El dispositivo activo no ve sus registros');
commit;
-- Otro dispositivo toma la cuenta
begin;
select pg_temp.as_user('c0000000-0000-0000-0000-000000000003', 'ses-b');
select public.claim_device('dev-b', 'Safari');
commit;
-- El token viejo conserva su sesión, pero ya no sube ni baja nada
begin;
select pg_temp.as_user('c0000000-0000-0000-0000-000000000003', 'ses-a');
select pg_temp.expect(
  pg_temp.fails_with($q$select public.sync_push_records('[{"kind":"deck","id":"DB","updatedAt":"2026-10-08T10:00:00.000Z","deletedAt":null,"data":{"id":"DB"}}]'::jsonb)$q$) = '42501',
  'Y8. El dispositivo desplazado pudo subir registros'
);
select pg_temp.expect(
  pg_temp.fails_with($q$select public.sync_push_events('[{"id":"b","type":"x","at":"2026-10-08T10:00:00.000Z","tz":"America/Merida","payload":{}}]'::jsonb)$q$) = '42501',
  'Y8. El dispositivo desplazado pudo subir eventos'
);
select pg_temp.expect((select count(*) from public.sync_records) = 0, 'Y8. El dispositivo desplazado pudo leer registros');
commit;
-- El nuevo dispositivo baja lo que subió el anterior
begin;
select pg_temp.as_user('c0000000-0000-0000-0000-000000000003', 'ses-b');
select pg_temp.expect((select count(*) from public.sync_records where record_id = 'DA') = 1, 'Y8. El dispositivo nuevo no bajó lo del anterior');
commit;

\echo 'TODAS LAS PRUEBAS DE LA SINCRONIZACION PASARON'
