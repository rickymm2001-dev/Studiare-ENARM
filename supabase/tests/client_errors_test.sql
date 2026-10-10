-- Pruebas del registro de errores del navegador (migración 20261012000001). Corre después de
-- billing_portal_test.sql sobre la misma base, con usuarios propios. Cada bloque falla con un error
-- si algo no cumple.
\set ON_ERROR_STOP on

create or replace function pg_temp.as_user(uid text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', uid, 'role', 'authenticated')::text, true);
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

create or replace function pg_temp.is_blocked(stmt text) returns boolean language plpgsql as $$
begin
  execute stmt;
  return false;
exception when insufficient_privilege then
  return true;
end $$;

insert into auth.users (id, email, raw_user_meta_data) values
  ('92000000-0000-0000-0000-000000000001', 'e1@x.mx', '{"alias":"Alumno"}'),
  ('92000000-0000-0000-0000-000000000002', 'e2@x.mx', '{"alias":"Admin"}');
insert into public.user_roles (user_id, role) values ('92000000-0000-0000-0000-000000000002', 'admin')
  on conflict (user_id) do update set role = 'admin';
delete from public.client_errors;

-- ===================================================================== E1. Cualquiera reporta, incluso sin sesión
begin;
select pg_temp.as_anon();
select pg_temp.expect(
  public.report_client_error('aaaaaaaa11111111', 'error', 'Cannot read properties of undefined', E'at f (https://x/a.js:1:2)\nat g (https://x/a.js:3:4)', '/mazos', 'abc1234') = 'recorded',
  'E1. Sin sesión no se pudo reportar un error'
);
commit;
begin;
select pg_temp.as_user('92000000-0000-0000-0000-000000000001');
select pg_temp.expect(
  public.report_client_error('aaaaaaaa11111111', 'error', 'Cannot read properties of undefined', null, '/mazos', 'abc1234') = 'counted',
  'E1. El mismo error no sumó al conteo'
);
commit;
select pg_temp.expect(
  (select occurrences from public.client_errors where fingerprint = 'aaaaaaaa11111111') = 2
  and (select count(*) from public.client_errors) = 1,
  'E1. El mismo error duplicó la fila o no sumó'
);

-- ===================================================================== E2. No guarda quién fue
select pg_temp.expect(
  not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'client_errors'
      and column_name in ('user_id', 'email', 'ip', 'session_id')
  ),
  'E2. La tabla de errores tiene una columna que identifica a alguien'
);

-- ===================================================================== E3. Datos inválidos
select pg_temp.expect(public.report_client_error('aaaaaaaa22222222', 'virus', 'x', null, '/', 'v') = 'invalid', 'E3. Aceptó un tipo desconocido');
select pg_temp.expect(public.report_client_error('NO-ES-HEX!', 'error', 'x', null, '/', 'v') = 'invalid', 'E3. Aceptó una huella que no es hexadecimal');
select pg_temp.expect(public.report_client_error(null, 'error', 'x', null, '/', 'v') = 'invalid', 'E3. Aceptó una huella vacía');
select pg_temp.expect(public.report_client_error('aaaaaaaa33333333', 'error', '   ', null, '/', 'v') = 'invalid', 'E3. Aceptó un mensaje vacío');
select pg_temp.expect(public.report_client_error('aaaaaaaa33333333', 'error', null, null, '/', 'v') = 'invalid', 'E3. Aceptó un mensaje nulo');
select pg_temp.expect((select count(*) from public.client_errors) = 1, 'E3. Un reporte inválido dejó una fila');

-- ===================================================================== E4. Recorta lo largo y limpia lo raro
select pg_temp.expect(
  public.report_client_error('aaaaaaaa44444444', 'render', repeat('m', 900) || E'\u0007' || 'fin', repeat('s', 4000), repeat('/p', 200), repeat('v', 100)) = 'recorded',
  'E4. No aceptó un reporte largo'
);
select pg_temp.expect(
  (select char_length(message) from public.client_errors where fingerprint = 'aaaaaaaa44444444') = 300
  and (select char_length(stack) from public.client_errors where fingerprint = 'aaaaaaaa44444444') = 1500
  and (select char_length(screen) from public.client_errors where fingerprint = 'aaaaaaaa44444444') = 80
  and (select char_length(version) from public.client_errors where fingerprint = 'aaaaaaaa44444444') = 40,
  'E4. No recortó los campos largos'
);
select public.report_client_error('aaaaaaaa55555555', 'rejection', E'dos\nlíneas\tcon\u0001control', null, '/', 'v');
select pg_temp.expect(
  (select message from public.client_errors where fingerprint = 'aaaaaaaa55555555') = 'dos líneas con control',
  'E4. Dejó caracteres de control en el mensaje'
);

-- ===================================================================== E4b. Quita datos personales aunque el navegador no lo haya hecho
select public.report_client_error(
  'aaaaaaaa66666666', 'error',
  E'falló para alumna@ejemplo.mx con 3f9c1c2e-5b7a-4a52-9d1e-0a1b2c3d4e5f y tarjeta 01J9Z0000000000000000000A1 tel 5512345678 Bearer eyJhbGciOi.eyJzdWIiOiIxIn0.firma_abc llave sk-ant-api03-abcdefghijkl',
  E'at f (https://x.mx/a.js?token=secreto&correo=u@x.mx:10:200)\nUnexpected token ''a'', "texto privado del alumno" is not valid JSON',
  '/mazos/3f9c1c2e-5b7a-4a52-9d1e-0a1b2c3d4e5f', 'v'
);
select pg_temp.expect(
  (select message from public.client_errors where fingerprint = 'aaaaaaaa66666666')
    = 'falló para [correo] con [id] y tarjeta [id] tel [n] Bearer [token] llave [clave]',
  'E4b. El mensaje conservó datos personales: ' || (select message from public.client_errors where fingerprint = 'aaaaaaaa66666666')
);
select pg_temp.expect(
  (select stack from public.client_errors where fingerprint = 'aaaaaaaa66666666') not like '%secreto%'
  and (select stack from public.client_errors where fingerprint = 'aaaaaaaa66666666') not like '%u@x.mx%'
  and (select stack from public.client_errors where fingerprint = 'aaaaaaaa66666666') not like '%texto privado%'
  and (select stack from public.client_errors where fingerprint = 'aaaaaaaa66666666') like '%a.js?[q]%',
  'E4b. La traza conservó datos personales: ' || (select stack from public.client_errors where fingerprint = 'aaaaaaaa66666666')
);
select pg_temp.expect(
  (select screen from public.client_errors where fingerprint = 'aaaaaaaa66666666') = '/mazos/[id]',
  'E4b. La pantalla conservó un id'
);
-- Las líneas y columnas del código no se confunden con números largos
select public.report_client_error('aaaaaaaa77777777', 'error', 'x', 'at f (https://x.mx/a.js:1:2345678)', '/', 'v');
select pg_temp.expect(
  (select stack from public.client_errors where fingerprint = 'aaaaaaaa77777777') = 'at f (https://x.mx/a.js:1:2345678)',
  'E4b. Cambió una columna del código por un número largo'
);

-- ===================================================================== E5. Tope de filas por día
delete from public.client_errors;
insert into public.client_errors (day, fingerprint, kind, message, screen, version)
  select (now() at time zone 'UTC')::date, lpad(to_hex(n), 16, '0'), 'error', 'm', '/', 'v'
  from generate_series(1, public.client_errors_daily_cap()) as n;
select pg_temp.expect(
  public.report_client_error('bbbbbbbb00000001', 'error', 'nuevo', null, '/', 'v') = 'full',
  'E5. Pasado el tope siguió guardando errores nuevos'
);
select pg_temp.expect(
  public.report_client_error(lpad(to_hex(1), 16, '0'), 'error', 'm', null, '/', 'v') = 'counted',
  'E5. Pasado el tope dejó de sumar a los errores que ya estaban'
);
select pg_temp.expect(
  (select count(*) from public.client_errors) = public.client_errors_daily_cap(),
  'E5. El tope no se respetó'
);

-- ===================================================================== E6. Lo viejo se borra el primer reporte del día
delete from public.client_errors;
insert into public.client_errors (day, fingerprint, kind, message, screen, version)
  values ((now() at time zone 'UTC')::date - 15, 'cccccccc00000001', 'error', 'viejo', '/', 'v'),
         ((now() at time zone 'UTC')::date - 5, 'cccccccc00000002', 'error', 'reciente', '/', 'v');
select public.report_client_error('cccccccc00000003', 'error', 'hoy', null, '/', 'v');
select pg_temp.expect(
  (select count(*) from public.client_errors where fingerprint = 'cccccccc00000001') = 0
  and (select count(*) from public.client_errors where fingerprint = 'cccccccc00000002') = 1,
  'E6. No borró solo lo que pasó de los 14 días'
);

-- ===================================================================== E7. Quién lee y quién escribe directo
begin;
select pg_temp.as_user('92000000-0000-0000-0000-000000000001');
select pg_temp.expect((select count(*) from public.client_errors) = 0, 'E7. Un alumno leyó errores del navegador');
select pg_temp.expect(pg_temp.is_blocked($q$insert into public.client_errors (day, fingerprint, kind, message, screen, version) values (current_date, 'dddddddd00000001', 'error', 'x', '/', 'v')$q$), 'E7. Un alumno escribió directo en client_errors');
select pg_temp.expect(pg_temp.is_blocked($q$update public.client_errors set occurrences = 99$q$), 'E7. Un alumno editó client_errors');
select pg_temp.expect(pg_temp.is_blocked($q$delete from public.client_errors$q$), 'E7. Un alumno borró client_errors');
rollback;
begin;
select pg_temp.as_anon();
select pg_temp.expect(pg_temp.is_blocked('select count(*) from public.client_errors'), 'E7. anon leyó client_errors');
select pg_temp.expect(pg_temp.is_blocked($q$select public.client_errors_daily_cap()$q$), 'E7. anon ejecutó una función interna');
select pg_temp.expect(pg_temp.is_blocked($q$select public.client_errors_scrub('x')$q$), 'E7. anon ejecutó client_errors_scrub');
rollback;
begin;
select pg_temp.as_user('92000000-0000-0000-0000-000000000002');
select pg_temp.expect((select count(*) from public.client_errors) >= 2, 'E7. El admin no leyó los errores');
select pg_temp.expect(pg_temp.is_blocked($q$update public.client_errors set occurrences = 99$q$), 'E7. El admin editó client_errors');
rollback;

select 'TODAS LAS PRUEBAS DE ERRORES DEL NAVEGADOR PASARON' as resultado;
