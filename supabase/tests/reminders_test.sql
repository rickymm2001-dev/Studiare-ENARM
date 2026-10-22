-- Pruebas de los recordatorios de repaso por correo y del envío de la cola (migración 20261029000001, B15 del
-- plan del cambio, 3 del diseño). Corre después de billing_emails_test.sql sobre la misma base, con usuarios
-- propios. Cada bloque falla con un error si algo no cumple.
--   R1 permisos, R2 ajustes del alumno, R3 encolar con el reloj fijado, R4 solo si tengo pendientes y la foto
--   vieja, R5 con el envío apagado o en pausa, R6 lo que guarda la cola, R7 la baja de un clic,
--   R8 reclamar v2 y soltar, R9 destinatarios, R10 conteos del admin, R11 la foto de vencidas
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
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  execute 'set local role anon';
end $$;

create or replace function pg_temp.expect(ok boolean, msg text) returns void language plpgsql as $$
begin
  if not coalesce(ok, false) then raise exception 'FALLA %', msg; end if;
end $$;

create or replace function pg_temp.is(actual text, expected text, msg text) returns void language plpgsql as $$
begin
  if actual is distinct from expected then
    raise exception 'FALLA % (salió %, se esperaba %)', msg, coalesce(actual, 'null'), coalesce(expected, 'null');
  end if;
end $$;

create or replace function pg_temp.is_blocked(stmt text) returns boolean language plpgsql as $$
begin
  execute stmt;
  return false;
exception when insufficient_privilege then
  return true;
end $$;

create or replace function pg_temp.fails_with(stmt text) returns text language plpgsql as $$
begin
  execute stmt;
  return null;
exception when others then
  return sqlstate;
end $$;

-- Prende o apaga el envío de correos y fija los tipos en pausa
create or replace function pg_temp.delivery(p_enabled boolean, p_paused text[] default '{}') returns void language sql as $$
  update public.platform_settings
    set value = jsonb_build_object('enabled', p_enabled, 'paused', to_jsonb(p_paused))
    where key = 'email_delivery'
$$;

-- ===================================================================== Usuarios
-- a Mérida, b Tijuana, c Cancún, d solo domingos, e foto con 0, f foto con 37, g foto con 0 sin el freno,
-- h foto de hace 20 días, i sin foto, j foto sin el día, k sin correo confirmado, l médico, m y n administradores
\set a 'ba150000-0000-0000-0000-00000000000a'
\set b 'ba150000-0000-0000-0000-00000000000b'
\set c 'ba150000-0000-0000-0000-00000000000c'
\set d 'ba150000-0000-0000-0000-00000000000d'
\set e 'ba150000-0000-0000-0000-00000000000e'
\set f 'ba150000-0000-0000-0000-00000000000f'
\set g 'ba150000-0000-0000-0000-000000000010'
\set h 'ba150000-0000-0000-0000-000000000011'
\set i 'ba150000-0000-0000-0000-000000000012'
\set j 'ba150000-0000-0000-0000-000000000013'
\set k 'ba150000-0000-0000-0000-000000000014'
\set l 'ba150000-0000-0000-0000-000000000015'
\set m 'ba150000-0000-0000-0000-000000000016'
\set n 'ba150000-0000-0000-0000-000000000017'
insert into auth.users (id, email, raw_user_meta_data, email_confirmed_at) values
  (:'a', 'ra@r15.mx', '{"alias":"Ana de Mérida"}', now()),
  (:'b', 'rb@r15.mx', '{"alias":"Beto de Tijuana"}', now()),
  (:'c', 'rc@r15.mx', '{"alias":"Cata de Cancún"}', now()),
  (:'d', 'rd@r15.mx', '{"alias":"Dani de domingos"}', now()),
  (:'e', 're@r15.mx', '{"alias":"Eli con cero"}', now()),
  (:'f', 'rf@r15.mx', '{"alias":"Fer con 37"}', now()),
  (:'g', 'rg@r15.mx', '{"alias":"Gabo sin freno"}', now()),
  (:'h', 'rh@r15.mx', '{"alias":"Hugo foto vieja"}', now()),
  (:'i', 'ri@r15.mx', '{"alias":"Ines sin foto"}', now()),
  (:'j', 'rj@r15.mx', '{"alias":"Jose foto sin dia"}', now()),
  (:'k', 'rk@r15.mx', '{"alias":"Kari sin confirmar"}', null),
  (:'l', 'rl@r15.mx', '{"alias":"Medica Lola"}', now()),
  (:'m', 'rm@r15.mx', '{"alias":"Admin Mario"}', now()),
  (:'n', 'rn@r15.mx', '{"alias":"Dueña Nora"}', now());
insert into public.user_roles (user_id, role) values
  (:'l', 'physician'), (:'m', 'admin'), (:'n', 'admin')
  on conflict (user_id) do update set role = excluded.role;

-- ===================================================================== R1. Permisos
do $$
declare
  v_fn text;
begin
  -- Del alumno, con sesión
  foreach v_fn in array array[
    'public.my_reminder_prefs()',
    'public.set_reminder_prefs(boolean, integer, integer[], boolean, text)',
    'public.put_due_snapshot(jsonb)',
    'public.admin_email_overview(integer)'] loop
    if not has_function_privilege('authenticated', v_fn, 'execute') or has_function_privilege('anon', v_fn, 'execute')
       or has_function_privilege('service_role', v_fn, 'execute') then
      raise exception 'FALLA R1. % debe ser solo de una sesión iniciada', v_fn;
    end if;
  end loop;
  -- Del servidor, solo con la llave de servicio
  foreach v_fn in array array[
    'public.enqueue_review_reminders()',
    'public.email_recipients(uuid[])',
    'public.claim_email_batch(integer)',
    'public.release_email(uuid)',
    'public.email_unsubscribe(text)',
    'public.email_tick_ok(text)'] loop
    if has_function_privilege('authenticated', v_fn, 'execute') or has_function_privilege('anon', v_fn, 'execute')
       or not has_function_privilege('service_role', v_fn, 'execute') then
      raise exception 'FALLA R1. % debe ser solo del servidor', v_fn;
    end if;
  end loop;
  -- Las ayudas internas no las ejecuta nadie de la API
  foreach v_fn in array array[
    'public.email_new_token()',
    'public.email_delivery_on(text)',
    'public.email_data_time(jsonb, text)',
    'public.reminder_frequency_of(smallint[])',
    'public.engagement_user()',
    'public.reminder_prefs_json(uuid)',
    'public.enqueue_review_reminders_at(timestamptz)'] loop
    if has_function_privilege('authenticated', v_fn, 'execute') or has_function_privilege('anon', v_fn, 'execute')
       or has_function_privilege('service_role', v_fn, 'execute') then
      raise exception 'FALLA R1. % es interna', v_fn;
    end if;
  end loop;
  -- Las funciones con security definer fijan search_path
  if exists (
    select 1 from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
    where ns.nspname = 'public' and p.prosecdef
      and p.proname in ('my_reminder_prefs', 'set_reminder_prefs', 'put_due_snapshot', 'enqueue_review_reminders',
        'enqueue_review_reminders_at', 'email_recipients', 'claim_email_batch', 'release_email', 'email_unsubscribe',
        'email_tick_ok', 'admin_email_overview', 'engagement_user', 'reminder_prefs_json', 'email_delivery_on')
      and not exists (select 1 from unnest(p.proconfig) c where c like 'search_path=%')
  ) then
    raise exception 'FALLA R1. Una función con security definer no fija search_path';
  end if;
  -- Las tablas nuevas tienen RLS y ningún permiso de tabla para nadie de la API
  foreach v_fn in array array['review_reminder_prefs', 'review_due_snapshots'] loop
    if has_table_privilege('anon', 'public.' || v_fn, 'select,insert,update,delete')
       or has_table_privilege('authenticated', 'public.' || v_fn, 'select,insert,update,delete')
       or has_table_privilege('service_role', 'public.' || v_fn, 'select,insert,update,delete')
       or not (select relrowsecurity from pg_class where oid = ('public.' || v_fn)::regclass) then
      raise exception 'FALLA R1. % tiene permisos de tabla para la API o no tiene RLS', v_fn;
    end if;
  end loop;
end $$;
-- Un alumno no lee ni escribe las tablas, ni llama lo del servidor
begin;
select pg_temp.as_user(:'a');
select pg_temp.expect(
  pg_temp.is_blocked('select * from public.review_reminder_prefs')
  and pg_temp.is_blocked('select * from public.review_due_snapshots')
  and pg_temp.is_blocked($q$update public.review_reminder_prefs set enabled = true$q$)
  and pg_temp.is_blocked('select public.enqueue_review_reminders()')
  and pg_temp.is_blocked('select * from public.email_recipients(array[gen_random_uuid()])')
  and pg_temp.is_blocked($q$select public.email_unsubscribe('0123456789abcdef0123456789abcdef0123')$q$)
  and pg_temp.is_blocked($q$select public.email_tick_ok('x')$q$)
  and pg_temp.is_blocked('select public.release_email(gen_random_uuid())'),
  'R1. Un alumno tocó las tablas o las funciones del servidor'
);
rollback;
-- Sin sesión no se llama a nada del alumno
begin;
select pg_temp.as_anon();
select pg_temp.expect(
  pg_temp.is_blocked('select public.my_reminder_prefs()')
  and pg_temp.is_blocked($q$select public.set_reminder_prefs(true, 20, array[1], true, 'America/Merida')$q$)
  and pg_temp.is_blocked($q$select public.put_due_snapshot('{}')$q$),
  'R1. Un anónimo llamó a los recordatorios'
);
rollback;
-- Con un token sin sub tampoco, y un dispositivo desplazado no cambia los ajustes
begin;
select set_config('request.jwt.claims', '{"role":"authenticated"}', true);
set local role authenticated;
select pg_temp.is(pg_temp.fails_with('select public.my_reminder_prefs()'), '28000', 'R1. Sin sub debía pedir iniciar sesión');
rollback;
begin;
select pg_temp.as_user(:'k', 's-viejo');
select public.claim_device('dev-a', 'Chrome');
commit;
begin;
select pg_temp.as_user(:'k', 's-nuevo');
select public.claim_device('dev-b', 'Safari');
commit;
begin;
select pg_temp.as_user(:'k', 's-viejo');
select pg_temp.expect(
  pg_temp.fails_with($q$select public.set_reminder_prefs(true, 20, array[1], true, 'America/Merida')$q$) = '42501'
  and pg_temp.fails_with('select public.my_reminder_prefs()') = '42501'
  and pg_temp.fails_with($q$select public.put_due_snapshot('{"computedAt":"2026-10-20T15:00:00Z","timeZone":"America/Merida","days":[],"newAvailable":0}')$q$) = '42501',
  'R1. Un dispositivo desplazado cambió los recordatorios'
);
rollback;

-- ===================================================================== R2. Ajustes del alumno
begin;
select pg_temp.as_user(:'a');
-- Sin ajustes guardados, todo apagado y con lo de fábrica
select pg_temp.expect(
  (select r = '{"available":true,"enabled":false,"hour":20,"days":[0,1,2,3,4,5,6],"frequency":"daily","onlyWhenDue":true,"timeZone":"America/Merida","unsubscribed":false}'::jsonb
   from (select public.my_reminder_prefs() as r) x),
  'R2. Sin guardar, los recordatorios debían venir apagados y de fábrica'
);
-- Valida hora, días, zona y booleanos
select pg_temp.is(pg_temp.fails_with($q$select public.set_reminder_prefs(true, 4, array[1], true, 'America/Merida')$q$), '22023', 'R2. La hora 4 debía rechazarse');
select pg_temp.is(pg_temp.fails_with($q$select public.set_reminder_prefs(true, 24, array[1], true, 'America/Merida')$q$), '22023', 'R2. La hora 24 debía rechazarse');
select pg_temp.is(pg_temp.fails_with($q$select public.set_reminder_prefs(true, null, array[1], true, 'America/Merida')$q$), '22023', 'R2. Sin hora debía rechazarse');
select pg_temp.is(pg_temp.fails_with($q$select public.set_reminder_prefs(true, 20, array[]::integer[], true, 'America/Merida')$q$), '22023', 'R2. Sin días debía rechazarse');
select pg_temp.is(pg_temp.fails_with($q$select public.set_reminder_prefs(true, 20, array[7], true, 'America/Merida')$q$), '22023', 'R2. El día 7 debía rechazarse');
select pg_temp.is(pg_temp.fails_with($q$select public.set_reminder_prefs(true, 20, array[-1], true, 'America/Merida')$q$), '22023', 'R2. El día -1 debía rechazarse');
select pg_temp.is(pg_temp.fails_with($q$select public.set_reminder_prefs(true, 20, array[1, null], true, 'America/Merida')$q$), '22023', 'R2. Un día nulo debía rechazarse');
select pg_temp.is(pg_temp.fails_with($q$select public.set_reminder_prefs(true, 20, null, true, 'America/Merida')$q$), '22023', 'R2. Días nulos debía rechazarse');
select pg_temp.is(pg_temp.fails_with($q$select public.set_reminder_prefs(true, 20, array[1], true, 'Marte/Olimpo')$q$), '22023', 'R2. Una zona que no existe debía rechazarse');
select pg_temp.is(pg_temp.fails_with($q$select public.set_reminder_prefs(true, 20, array[1], true, null)$q$), '22023', 'R2. Sin zona debía rechazarse');
select pg_temp.is(pg_temp.fails_with($q$select public.set_reminder_prefs(null, 20, array[1], true, 'America/Merida')$q$), '22023', 'R2. Sin enabled debía rechazarse');
select pg_temp.is(pg_temp.fails_with($q$select public.set_reminder_prefs(true, 20, array[1], null, 'America/Merida')$q$), '22023', 'R2. Sin only_when_due debía rechazarse');
reset role;
select pg_temp.expect((select count(*) from public.review_reminder_prefs where user_id = :'a') = 0,
  'R2. Un guardado rechazado dejó filas');
select pg_temp.as_user(:'a');
-- Lunes a viernes, a las 20, solo si hay pendientes
select pg_temp.expect(
  (select r = '{"available":true,"enabled":true,"hour":20,"days":[1,2,3,4,5],"frequency":"weekdays","onlyWhenDue":true,"timeZone":"America/Merida","unsubscribed":false}'::jsonb
   from (select public.set_reminder_prefs(true, 20, array[1, 2, 3, 4, 5], true, 'America/Merida') as r) x),
  'R2. Guardar lunes a viernes no devolvió la forma del plan'
);
select pg_temp.expect(
  public.my_reminder_prefs() = '{"available":true,"enabled":true,"hour":20,"days":[1,2,3,4,5],"frequency":"weekdays","onlyWhenDue":true,"timeZone":"America/Merida","unsubscribed":false}'::jsonb,
  'R2. my_reminder_prefs no devolvió lo guardado'
);
-- Los días se guardan sin repetir y en orden, y la frecuencia sale de ellos
select pg_temp.is(public.set_reminder_prefs(true, 7, array[5, 1, 1, 3], false, 'America/Tijuana') ->> 'frequency', 'custom', 'R2. Días sueltos debían ser custom');
select pg_temp.expect(
  (select r -> 'days' = '[1,3,5]'::jsonb and r ->> 'hour' = '7' and r ->> 'onlyWhenDue' = 'false' and r ->> 'timeZone' = 'America/Tijuana'
   from (select public.my_reminder_prefs() as r) x),
  'R2. Los días no quedaron sin repetir y en orden'
);
select pg_temp.is(public.set_reminder_prefs(true, 20, array[0, 1, 2, 3, 4, 5, 6], true, 'America/Merida') ->> 'frequency', 'daily', 'R2. Los siete días debían ser daily');
select pg_temp.is(public.set_reminder_prefs(true, 20, array[1, 2, 3, 4, 5], true, 'America/Merida') ->> 'frequency', 'weekdays', 'R2. De lunes a viernes debía ser weekdays');
-- Guardar sin cambiar el estado de prendido conserva la ficha de baja
commit;
select unsubscribe_token as token_a from public.review_reminder_prefs where user_id = :'a' \gset
begin;
select pg_temp.as_user(:'a');
select public.set_reminder_prefs(true, 21, array[1, 2, 3, 4, 5], true, 'America/Merida');
commit;
select pg_temp.expect((select unsubscribe_token = :'token_a' from public.review_reminder_prefs where user_id = :'a'),
  'R2. Cambiar la hora con los recordatorios prendidos cambió la ficha de baja');
select pg_temp.expect(:'token_a' ~ '^[0-9a-f]{36}$', 'R2. La ficha de baja no son 36 caracteres hexadecimales');
-- Apagarlos conserva la ficha, y prenderlos otra vez la cambia
begin;
select pg_temp.as_user(:'a');
select pg_temp.is(public.set_reminder_prefs(false, 21, array[1, 2, 3, 4, 5], true, 'America/Merida') ->> 'enabled', 'false', 'R2. Apagar debía devolver enabled false');
commit;
select pg_temp.expect((select unsubscribe_token = :'token_a' and not enabled from public.review_reminder_prefs where user_id = :'a'),
  'R2. Apagar cambió la ficha de baja');
begin;
select pg_temp.as_user(:'a');
select public.set_reminder_prefs(true, 20, array[1, 2, 3, 4, 5], true, 'America/Merida');
commit;
select pg_temp.expect((select unsubscribe_token <> :'token_a' and enabled from public.review_reminder_prefs where user_id = :'a'),
  'R2. Volver a prender no cambió la ficha de baja');
-- Sin fila, la zona del perfil si la base la conoce
update public.profiles set time_zone = 'America/Cancun' where id = :'c';
update public.profiles set time_zone = 'Zona/Inventada' where id = :'d';
begin;
select pg_temp.as_user(:'c');
select pg_temp.is(public.my_reminder_prefs() ->> 'timeZone', 'America/Cancun', 'R2. Debía usar la zona del perfil');
rollback;
begin;
select pg_temp.as_user(:'d');
select pg_temp.is(public.my_reminder_prefs() ->> 'timeZone', 'America/Merida', 'R2. Una zona del perfil que la base no conoce debía caer en Mérida');
rollback;

-- ===================================================================== Ajustes de partida de los demás
-- Se escriben directo como postgres. Todos prendidos, a las 20 de su zona, salvo lo que cada uno prueba
delete from public.review_reminder_prefs where user_id::text like 'ba150000%' and user_id <> :'a';
insert into public.review_reminder_prefs (user_id, enabled, hour, days, only_when_due, time_zone) values
  (:'b', true, 19, '{0,1,2,3,4,5,6}', false, 'America/Tijuana'),
  (:'c', true, 21, '{0,1,2,3,4,5,6}', false, 'America/Cancun'),
  (:'d', true, 20, '{0}', false, 'America/Merida'),
  (:'e', true, 20, '{0,1,2,3,4,5,6}', true, 'America/Merida'),
  (:'f', true, 20, '{0,1,2,3,4,5,6}', true, 'America/Merida'),
  (:'g', true, 20, '{0,1,2,3,4,5,6}', false, 'America/Merida'),
  (:'h', true, 20, '{0,1,2,3,4,5,6}', true, 'America/Merida'),
  (:'i', true, 20, '{0,1,2,3,4,5,6}', true, 'America/Merida'),
  (:'j', true, 20, '{0,1,2,3,4,5,6}', true, 'America/Merida');
-- a ya está prendida de lunes a viernes a las 20, solo si hay pendientes. Sin foto, así que va sin número
update public.review_reminder_prefs set only_when_due = false where user_id = :'a';
-- Fotos. Todas con la zona de Mérida y el día 2026-10-20, que es el del reloj fijado
insert into public.review_due_snapshots (user_id, computed_at, time_zone, days, new_available) values
  (:'e', '2026-10-20T12:00:00Z', 'America/Merida', '[{"day":"2026-10-20","due":0},{"day":"2026-10-21","due":4}]', 5),
  (:'f', '2026-10-20T12:00:00Z', 'America/Merida', '[{"day":"2026-10-20","due":37},{"day":"2026-10-21","due":52}]', 10),
  (:'g', '2026-10-20T12:00:00Z', 'America/Merida', '[{"day":"2026-10-20","due":0}]', 3),
  (:'h', '2026-09-30T12:00:00Z', 'America/Merida', '[{"day":"2026-10-20","due":99}]', 7),
  (:'j', '2026-10-19T12:00:00Z', 'America/Merida', '[{"day":"2026-10-19","due":8},{"day":"2026-10-22","due":9}]', 6);

-- ===================================================================== R5. Con el envío apagado o en pausa no encola
-- El reloj fijado es el martes 20 de octubre de 2026 a las 20:00 en Mérida (02:00 UTC del 21), las 21:00 en
-- Cancún y las 19:00 en Tijuana, que sigue con horario de verano
select pg_temp.delivery(false);
select pg_temp.is(public.enqueue_review_reminders_at('2026-10-21 02:00:00+00')::text, '0', 'R5. Con el envío apagado no debía encolar');
select pg_temp.delivery(true, array['daily_review_reminder']);
select pg_temp.is(public.enqueue_review_reminders_at('2026-10-21 02:00:00+00')::text, '0', 'R5. Con el tipo en pausa no debía encolar');
select pg_temp.delivery(true, array['trial_ending']);
select pg_temp.expect((select count(*) from public.email_outbox where kind = 'daily_review_reminder' and recipient_user::text like 'ba150000%') = 0,
  'R5. Quedó un recordatorio encolado con el envío apagado o en pausa');
-- Sin encolar tampoco marcó el día: al prender el envío el mismo día sí sale
select pg_temp.expect((select count(*) from public.review_reminder_prefs where last_enqueued_on is not null) = 0,
  'R5. Con el envío apagado se marcó el día');

-- ===================================================================== R3. Encolar con el reloj fijado
select pg_temp.delivery(true);
-- Solo a su hora local: en Mérida a las 20 entran a, e, f, g, h, i y j, y d no (solo domingos). En Cancún son
-- las 21 y en Tijuana las 19, y también les toca a c y a b. e no se encola (conteo 0 con el freno prendido)
select pg_temp.is(public.enqueue_review_reminders_at('2026-10-21 02:00:00+00')::text, '8', 'R3. Debía encolar a, b, c, f, g, h, i y j');
select pg_temp.expect(
  (select array_agg(recipient_user::text order by recipient_user::text) from public.email_outbox
    where kind = 'daily_review_reminder' and recipient_user::text like 'ba150000%' and dedupe_key like '%:2026-10-20')
  = array[:'a', :'b', :'c', :'f', :'g', :'h', :'i', :'j'],
  'R3. Los recordatorios no fueron a quien tocaba, a su hora local'
);
select pg_temp.expect(
  (select count(*) from public.email_outbox where kind = 'daily_review_reminder' and recipient_user = :'d') = 0,
  'R3. Encoló a quien solo quiere domingos en un martes'
);

-- ===================================================================== R4. Solo si tengo pendientes y la foto vieja
-- e tenía 0 vencidas el 20 y el freno prendido: no se encoló y el día quedó marcado
select pg_temp.expect(
  not exists (select 1 from public.email_outbox where recipient_user = :'e' and dedupe_key like '%:2026-10-20')
  and (select last_enqueued_on from public.review_reminder_prefs where user_id = :'e') = '2026-10-20',
  'R4. Con 0 vencidas y el freno prendido no debía encolar y debía marcar el día'
);
-- f tenía 37 con 10 nuevas
select pg_temp.expect(
  (select data = '{"due":37,"newAvailable":10,"day":"2026-10-20"}'::jsonb from public.email_outbox
    where recipient_user = :'f' and dedupe_key = 'daily_review_reminder:' || :'f' || ':2026-10-20'),
  'R4. f debía llevar 37 vencidas y 10 nuevas'
);
-- g tenía 0 pero sin el freno: se manda con el 0
select pg_temp.expect(
  (select data = '{"due":0,"newAvailable":3,"day":"2026-10-20"}'::jsonb from public.email_outbox
    where recipient_user = :'g' and dedupe_key = 'daily_review_reminder:' || :'g' || ':2026-10-20'),
  'R4. g sin el freno debía mandarse con 0 vencidas'
);
-- h tenía una foto de hace 20 días: sin número y sin nuevas, aunque tiene el freno prendido
select pg_temp.expect(
  (select data = '{"due":null,"newAvailable":0,"day":"2026-10-20"}'::jsonb from public.email_outbox
    where recipient_user = :'h' and dedupe_key = 'daily_review_reminder:' || :'h' || ':2026-10-20'),
  'R4. Con la foto vieja debía mandarse sin número'
);
-- i no tiene foto: sin número, y el freno no lo detiene
select pg_temp.expect(
  (select data = '{"due":null,"newAvailable":0,"day":"2026-10-20"}'::jsonb from public.email_outbox
    where recipient_user = :'i' and dedupe_key = 'daily_review_reminder:' || :'i' || ':2026-10-20'),
  'R4. Sin foto debía mandarse sin número'
);
-- j tiene una foto reciente que no trae el día: sin número, con las nuevas de la foto
select pg_temp.expect(
  (select data = '{"due":null,"newAvailable":6,"day":"2026-10-20"}'::jsonb from public.email_outbox
    where recipient_user = :'j' and dedupe_key = 'daily_review_reminder:' || :'j' || ':2026-10-20'),
  'R4. Una foto sin el día debía mandarse sin número'
);

-- ===================================================================== R6. Lo que guarda la cola
select pg_temp.expect(
  (select bool_and(strpos(data::text, '@') = 0 and data ? 'due' and data ? 'newAvailable' and data ? 'day'
                   and dedupe_key = 'daily_review_reminder:' || recipient_user::text || ':' || (data ->> 'day')
                   and status = 'queued' and recipient_role is null
                   and (data ->> 'day') ~ '^\d{4}-\d{2}-\d{2}$')
   from public.email_outbox where kind = 'daily_review_reminder' and recipient_user::text like 'ba150000%'),
  'R6. Los datos del recordatorio llevan arroba, les falta un campo o la clave no es la del día'
);
-- Una restricción rechaza un correo en los datos
select pg_temp.is(
  pg_temp.fails_with($q$select public.enqueue_email('ba150000-0000-0000-0000-00000000000a', null, 'daily_review_reminder', 'r6-arroba', '{"to":"x@y.mx"}')$q$),
  '23514', 'R6. La cola aceptó un correo en los datos');

-- ===================================================================== R3 (sigue). Una vez por día, a su hora
-- Una vez por día local: ni a la misma hora ni 30 minutos después
select pg_temp.is(public.enqueue_review_reminders_at('2026-10-21 02:00:00+00')::text, '0', 'R3. Repetir la misma hora no debía encolar otra vez');
select pg_temp.is(public.enqueue_review_reminders_at('2026-10-21 02:30:00+00')::text, '0', 'R3. A la media hora no debía encolar otra vez');
-- Fuera de la hora local de cada quien no encola. A las 03:00 UTC son las 21 en Mérida, las 22 en Cancún
select pg_temp.is(public.enqueue_review_reminders_at('2026-10-21 03:00:00+00')::text, '0', 'R3. Fuera de su hora local no debía encolar');
-- A las 05:00 UTC son las 23 en Mérida, las 00 en Cancún (fuera de 5 a 23) y las 22 en Tijuana
select pg_temp.is(public.enqueue_review_reminders_at('2026-10-21 05:00:00+00')::text, '0', 'R3. A esa hora ninguna zona estaba en su hora');
-- Al día siguiente, a su hora, vuelve a salir. En Mérida es miércoles 21 a las 20, y ahora las fotos de e y f
-- traen el día 21. Les toca a todos menos a d, que solo quiere domingos
select pg_temp.is(public.enqueue_review_reminders_at('2026-10-22 02:00:00+00')::text, '9',
  'R3. Al día siguiente debía encolar a todos menos a d');
select pg_temp.expect(
  (select data = '{"due":4,"newAvailable":5,"day":"2026-10-21"}'::jsonb from public.email_outbox
    where recipient_user = :'e' and dedupe_key = 'daily_review_reminder:' || :'e' || ':2026-10-21'),
  'R3. e debía llevar las 4 vencidas del día siguiente de su foto'
);
-- Domingo 25 a las 20 en Mérida: a (lunes a viernes) no, d (solo domingos) sí, y los de todos los días
select pg_temp.is(public.enqueue_review_reminders_at('2026-10-26 02:00:00+00')::text, '9',
  'R3. El domingo debía tocarle a d y a los de todos los días, y no a a');
select pg_temp.expect(
  exists (select 1 from public.email_outbox where recipient_user = :'d' and dedupe_key = 'daily_review_reminder:' || :'d' || ':2026-10-25')
  and not exists (select 1 from public.email_outbox where recipient_user = :'a' and dedupe_key like '%:2026-10-25'),
  'R3. El domingo debía tocarle a d y no a a, que quiere lunes a viernes'
);
-- Una persona dada de baja o con los recordatorios apagados no recibe nada
update public.review_reminder_prefs set unsubscribed_at = now() where user_id = :'b';
update public.review_reminder_prefs set enabled = false where user_id = :'c';
select pg_temp.expect(public.enqueue_review_reminders_at('2026-10-23 02:00:00+00') >= 1
  and not exists (select 1 from public.email_outbox where recipient_user in (:'b', :'c') and dedupe_key like '%:2026-10-22'),
  'R3. Encoló a quien se dio de baja o los apagó');
update public.review_reminder_prefs set unsubscribed_at = null where user_id = :'b';
update public.review_reminder_prefs set enabled = true where user_id = :'c';
-- Una zona que la base ya no conoce se salta sin frenar a los demás. El aviso que deja en el registro es
-- el esperado
set client_min_messages to error;
update public.review_reminder_prefs set time_zone = 'Zona/Inventada' where user_id = :'i';
select pg_temp.expect(public.enqueue_review_reminders_at('2026-10-24 02:00:00+00') >= 1
  and not exists (select 1 from public.email_outbox where recipient_user = :'i' and dedupe_key like '%:2026-10-23'),
  'R3. Una zona rara de un alumno frenó a los demás');
update public.review_reminder_prefs set time_zone = 'America/Merida' where user_id = :'i';
reset client_min_messages;

-- ===================================================================== R7. La baja de un clic
select unsubscribe_token as token_f from public.review_reminder_prefs where user_id = :'f' \gset
select pg_temp.is(public.email_unsubscribe(:'token_f'), 'done', 'R7. Una ficha buena debía dar de baja');
select pg_temp.expect(
  (select not enabled and unsubscribed_at is not null from public.review_reminder_prefs where user_id = :'f'),
  'R7. La baja no apagó el recordatorio ni marcó unsubscribed_at'
);
select pg_temp.is(public.email_unsubscribe(:'token_f'), 'already', 'R7. Repetir la baja debía decir already');
select pg_temp.is(public.email_unsubscribe(null), 'invalid', 'R7. Sin ficha debía ser invalid');
select pg_temp.is(public.email_unsubscribe(''), 'invalid', 'R7. Ficha vacía debía ser invalid');
select pg_temp.is(public.email_unsubscribe('abc'), 'invalid', 'R7. Ficha corta debía ser invalid');
select pg_temp.is(public.email_unsubscribe(upper(:'token_f')), 'invalid', 'R7. Ficha con mayúsculas debía ser invalid');
select pg_temp.is(public.email_unsubscribe(repeat('0', 36)), 'invalid', 'R7. Ficha que no existe debía ser invalid');
select pg_temp.is(public.email_unsubscribe(:'token_f' || '0'), 'invalid', 'R7. Ficha larga debía ser invalid');
select pg_temp.is(public.email_unsubscribe($q$' or true or '$q$), 'invalid', 'R7. Una ficha con comillas debía ser invalid');
-- La app lo ve como dado de baja
begin;
select pg_temp.as_user(:'f');
select pg_temp.expect(
  (select r ->> 'unsubscribed' = 'true' and r ->> 'enabled' = 'false' from (select public.my_reminder_prefs() as r) x),
  'R7. La app no ve la baja'
);
-- Guardar sin prender no la quita, y prender sí, con otra ficha
select pg_temp.is(public.set_reminder_prefs(false, 20, array[1, 2], true, 'America/Merida') ->> 'unsubscribed', 'true',
  'R7. Guardar con los recordatorios apagados quitó la baja');
select pg_temp.is(public.set_reminder_prefs(true, 20, array[1, 2], true, 'America/Merida') ->> 'unsubscribed', 'false',
  'R7. Volver a prender debía quitar la baja');
commit;
select pg_temp.expect(
  (select unsubscribe_token <> :'token_f' and enabled and unsubscribed_at is null from public.review_reminder_prefs where user_id = :'f'),
  'R7. Volver a prender no cambió la ficha'
);
select pg_temp.is(public.email_unsubscribe(:'token_f'), 'invalid', 'R7. La ficha de antes debía dejar de valer');

-- ===================================================================== R8. Reclamar v2 y soltar
-- Se limpia la cola de lo de arriba para ver solo lo de esta sección
delete from public.email_outbox where recipient_user::text like 'ba150000%';
-- Lo que dejaron otras pruebas en la cola se aparta, para que el reclamo solo vea esta sección
update public.email_outbox set status = 'skipped', last_error = 'prueba' where status in ('queued', 'failed');
insert into public.email_outbox (recipient_user, recipient_role, kind, dedupe_key, data, created_at) values
  (:'a', null, 'daily_review_reminder', 'r8-recordatorio-viejo', '{"due":3,"newAvailable":0,"day":"2026-10-20"}', now() - interval '7 hours'),
  (:'b', null, 'daily_review_reminder', 'r8-recordatorio-nuevo', '{"due":3,"newAvailable":0,"day":"2026-10-20"}', now() - interval '5 hours'),
  (:'c', null, 'trial_ending', 'r8-prueba-pasada', jsonb_build_object('trialEnd', now() - interval '1 day', 'plan', 'monthly'), now()),
  (:'d', null, 'trial_ending', 'r8-prueba-futura', jsonb_build_object('trialEnd', now() + interval '3 days', 'plan', 'monthly'), now()),
  (:'e', null, 'pass_expiring', 'r8-pase-vencido', jsonb_build_object('passEnd', now() - interval '1 hour', 'plan', 'monthly'), now()),
  (:'f', null, 'pass_expiring', 'r8-pase-vigente', jsonb_build_object('passEnd', now() + interval '2 days', 'plan', 'monthly'), now()),
  (:'g', null, 'pass_expiring', 'r8-pase-sin-fecha', '{"plan":"monthly"}', now()),
  (:'l', null, 'content_report', 'r8-reporte', '{"questionKey":"GO-0001","reason":"typo"}', now()),
  (null, 'team', 'invoice_requested', 'r8-factura', '{"amountMxn":149}', now());
-- Con el envío apagado no entrega nada ni marca nada
select pg_temp.delivery(false);
select pg_temp.is((select count(*) from public.claim_email_batch(100) where dedupe_key like 'r8-%')::text, '0',
  'R8. Con el envío apagado no debía entregar nada');
select pg_temp.expect((select count(*) from public.email_outbox where dedupe_key like 'r8-%' and status = 'queued') = 9,
  'R8. Con el envío apagado se marcó un correo como viejo');
-- El interruptor viejo ya no manda
update public.platform_settings set value = '{"enabled":true}' where key = 'billing_emails';
select pg_temp.is((select count(*) from public.claim_email_batch(100) where dedupe_key like 'r8-%')::text, '0',
  'R8. billing_emails todavía abría el envío');
update public.platform_settings set value = '{"enabled":false}' where key = 'billing_emails';
-- Con el envío prendido y el reporte en pausa
select pg_temp.delivery(true, array['content_report']);
create temp table r8_batch as select * from public.claim_email_batch(100) where dedupe_key like 'r8-%';
select pg_temp.expect(
  (select array_agg(dedupe_key order by dedupe_key) from r8_batch)
    = array['r8-factura', 'r8-pase-sin-fecha', 'r8-pase-vigente', 'r8-prueba-futura', 'r8-recordatorio-nuevo'],
  'R8. El reclamo entregó lo que ya no sirve o lo que está en pausa'
);
select pg_temp.expect(
  (select bool_and(status = 'skipped' and last_error = 'stale') from public.email_outbox
    where dedupe_key in ('r8-recordatorio-viejo', 'r8-prueba-pasada', 'r8-pase-vencido')),
  'R8. Lo vencido debía quedar skipped con el motivo stale'
);
select pg_temp.expect(
  (select status = 'queued' and attempts = 0 from public.email_outbox where dedupe_key = 'r8-reporte'),
  'R8. El tipo en pausa debía quedarse en la cola sin gastar intentos'
);
select pg_temp.expect(
  (select bool_and(attempts = 1 and send_after > now() + interval '9 minutes') from r8_batch),
  'R8. Lo entregado debía quedar apartado y con un intento'
);
-- Soltar devuelve a la cola sin gastar el intento. Un correo ya cerrado no cambia
select pg_temp.delivery(true);
select public.release_email((select id from r8_batch where dedupe_key = 'r8-factura'));
select pg_temp.expect(
  (select status = 'queued' and attempts = 0 and send_after <= now() from public.email_outbox where dedupe_key = 'r8-factura'),
  'R8. Soltar no devolvió el correo sin gastar el intento'
);
select public.finish_email((select id from r8_batch where dedupe_key = 'r8-pase-vigente'), 'sent');
select public.release_email((select id from r8_batch where dedupe_key = 'r8-pase-vigente'));
select pg_temp.expect(
  (select status = 'sent' and attempts = 1 from public.email_outbox where dedupe_key = 'r8-pase-vigente'),
  'R8. Soltar cambió un correo ya mandado'
);
select public.release_email(gen_random_uuid());
-- Sale otra vez, con el mismo número de intentos que la primera vez, y ahora también el que estaba en pausa
create temp table r8_again as select * from public.claim_email_batch(100) where dedupe_key like 'r8-%';
select pg_temp.expect(
  (select array_agg(dedupe_key order by dedupe_key) from r8_again) = array['r8-factura', 'r8-reporte']
  and (select attempts from r8_again where dedupe_key = 'r8-factura') = 1,
  'R8. El correo soltado debía volver a salir con un solo intento'
);
-- Quitar el tipo de la pausa o apagar el envío no deja un recordatorio de ayer: el reclamo marca stale
update public.email_outbox set created_at = now() - interval '8 hours', send_after = now() - interval '1 minute',
  status = 'failed', attempts = 2 where dedupe_key = 'r8-recordatorio-nuevo';
select pg_temp.is((select count(*) from public.claim_email_batch(100) where dedupe_key = 'r8-recordatorio-nuevo')::text, '0',
  'R8. Un recordatorio fallido de hace más de 6 horas no debía reintentarse');
select pg_temp.is((select last_error from public.email_outbox where dedupe_key = 'r8-recordatorio-nuevo'), 'stale',
  'R8. Un recordatorio fallido viejo debía quedar stale');
-- Con 5 intentos no vuelve a salir
update public.email_outbox set status = 'failed', attempts = 5, send_after = now() - interval '1 minute' where dedupe_key = 'r8-prueba-futura';
select pg_temp.is((select count(*) from public.claim_email_batch(100) where dedupe_key = 'r8-prueba-futura')::text, '0',
  'R8. Después de 5 intentos no debía volver a entregarse');
-- El límite acota lo que entrega
update public.email_outbox set status = 'queued', attempts = 0, send_after = now() - interval '1 minute', last_error = null
  where dedupe_key in ('r8-pase-sin-fecha', 'r8-reporte', 'r8-factura');
select pg_temp.is((select count(*) from public.claim_email_batch(2) where dedupe_key like 'r8-%')::text, '2', 'R8. El límite de 2 debía entregar 2');

-- ===================================================================== R9. Destinatarios
select pg_temp.delivery(false);
delete from public.email_outbox where dedupe_key ~ '^r(8|9|10)-' or recipient_user::text like 'ba150000%';
update public.review_reminder_prefs set enabled = true, unsubscribed_at = null where user_id in (:'a', :'b');
update public.review_reminder_prefs set enabled = false where user_id = :'c';
update public.review_reminder_prefs set enabled = true, unsubscribed_at = now() where user_id = :'d';
select unsubscribe_token as token_a2 from public.review_reminder_prefs where user_id = :'a' \gset
insert into public.email_outbox (id, recipient_user, recipient_role, kind, dedupe_key, data) values
  ('ba150000-1111-0000-0000-00000000000a', :'a', null, 'daily_review_reminder', 'r9-a', '{"due":1,"newAvailable":0,"day":"2026-10-20"}'),
  ('ba150000-1111-0000-0000-00000000000b', :'a', null, 'trial_ending', 'r9-a-prueba', '{"plan":"monthly"}'),
  ('ba150000-1111-0000-0000-00000000000c', :'c', null, 'daily_review_reminder', 'r9-c', '{"due":1,"newAvailable":0,"day":"2026-10-20"}'),
  ('ba150000-1111-0000-0000-00000000000d', :'d', null, 'daily_review_reminder', 'r9-d', '{"due":1,"newAvailable":0,"day":"2026-10-20"}'),
  ('ba150000-1111-0000-0000-00000000000e', :'k', null, 'trial_ending', 'r9-k', '{"plan":"monthly"}'),
  ('ba150000-1111-0000-0000-00000000000f', :'l', null, 'content_report', 'r9-l', '{"questionKey":"GO-0001","reason":"typo"}'),
  ('ba150000-1111-0000-0000-000000000010', null, 'team', 'invoice_requested', 'r9-equipo', '{"amountMxn":149}'),
  ('ba150000-1111-0000-0000-000000000011', :'i', null, 'daily_review_reminder', 'r9-sin-ajustes', '{"due":null,"newAvailable":0,"day":"2026-10-20"}');
delete from public.review_reminder_prefs where user_id = :'i';
create temp table r9 as select * from public.email_recipients(array[
  'ba150000-1111-0000-0000-00000000000a', 'ba150000-1111-0000-0000-00000000000b', 'ba150000-1111-0000-0000-00000000000c',
  'ba150000-1111-0000-0000-00000000000d', 'ba150000-1111-0000-0000-00000000000e', 'ba150000-1111-0000-0000-00000000000f',
  'ba150000-1111-0000-0000-000000000010', 'ba150000-1111-0000-0000-000000000011', gen_random_uuid()]::uuid[]);
select pg_temp.expect((select count(*) from r9) = 8, 'R9. Debía devolver una fila por correo que existe');
-- El alumno: su correo, su alias y la ficha solo en el recordatorio
select pg_temp.expect(
  (select emails = array['ra@r15.mx'] and alias = 'Ana de Mérida' and unsubscribe_token = :'token_a2'
    from r9 where id = 'ba150000-1111-0000-0000-00000000000a'),
  'R9. El recordatorio de a debía traer su correo, su alias y su ficha'
);
select pg_temp.expect(
  (select emails = array['ra@r15.mx'] and alias = 'Ana de Mérida' and unsubscribe_token is null
    from r9 where id = 'ba150000-1111-0000-0000-00000000000b'),
  'R9. Un correo que no es recordatorio no debía traer ficha de baja'
);
-- Recordatorio de quien lo apagó, se dio de baja o ya no tiene ajustes: sin ficha, y send-emails lo salta
select pg_temp.expect(
  (select unsubscribe_token is null from r9 where id = 'ba150000-1111-0000-0000-00000000000c')
  and (select unsubscribe_token is null from r9 where id = 'ba150000-1111-0000-0000-00000000000d')
  and (select unsubscribe_token is null from r9 where id = 'ba150000-1111-0000-0000-000000000011'),
  'R9. Un recordatorio apagado, dado de baja o sin ajustes no debía traer ficha'
);
-- Sin correo confirmado, sin dirección
select pg_temp.expect((select emails = '{}' from r9 where id = 'ba150000-1111-0000-0000-00000000000e'),
  'R9. Una cuenta sin el correo confirmado debía quedar sin dirección');
-- El médico
select pg_temp.expect((select emails = array['rl@r15.mx'] and alias = 'Medica Lola' from r9 where id = 'ba150000-1111-0000-0000-00000000000f'),
  'R9. El correo del médico debía ir a su cuenta');
-- El equipo son los administradores y el dueño con el correo confirmado, sin alias. El dueño es único en la
-- base y otra prueba puede tenerlo, así que aquí son dos administradores
select pg_temp.expect(
  (select emails @> array['rm@r15.mx', 'rn@r15.mx'] and alias is null and unsubscribe_token is null
    from r9 where id = 'ba150000-1111-0000-0000-000000000010')
  and not exists (select 1 from r9, unnest(r9.emails) e where r9.id = 'ba150000-1111-0000-0000-000000000010' and e in ('rl@r15.mx', 'ra@r15.mx')),
  'R9. El correo del equipo debía ir a los administradores, y a nadie más'
);
select pg_temp.expect((select count(*) from public.email_recipients(null)) = 0 and (select count(*) from public.email_recipients('{}')) = 0,
  'R9. Sin ids no debía devolver nada');

-- ===================================================================== R10. Conteos para el admin
delete from public.email_outbox where dedupe_key ~ '^r(8|9|10)-' or recipient_user::text like 'ba150000%';
insert into public.email_outbox (recipient_user, recipient_role, kind, dedupe_key, data, status, created_at) values
  (:'a', null, 'daily_review_reminder', 'r10-1', '{}', 'sent', now() - interval '1 day'),
  (:'b', null, 'daily_review_reminder', 'r10-2', '{}', 'sent', now() - interval '2 days'),
  (:'c', null, 'daily_review_reminder', 'r10-3', '{}', 'failed', now() - interval '3 days'),
  (:'d', null, 'daily_review_reminder', 'r10-4', '{}', 'skipped', now() - interval '10 days'),
  (null, 'team', 'invoice_requested', 'r10-5', '{"amountMxn":1}', 'queued', now());
-- Lo que cuenta cada tipo en los últimos 7 días, leído directo de la cola, para comparar sin depender de lo
-- que dejaron otras pruebas
select count(*) as kinds_total from public.email_kinds \gset
select count(*) filter (where status = 'queued') as inv_queued, count(*) filter (where status = 'sent') as inv_sent,
       count(*) filter (where status = 'skipped') as inv_skipped, count(*) filter (where status = 'failed') as inv_failed
  from public.email_outbox where kind = 'invoice_requested' and created_at >= now() - interval '7 days' \gset
begin;
select pg_temp.as_user(:'m');
create temp table r10 as select public.admin_email_overview() as r;
select pg_temp.expect(
  (select r ->> 'days' = '7' and jsonb_array_length(r -> 'kinds') = :kinds_total from r10),
  'R10. El conteo debía traer 7 días y todos los tipos'
);
select pg_temp.expect(
  (select k = '{"kind":"daily_review_reminder","queued":0,"sent":2,"skipped":0,"failed":1}'::jsonb
   from r10, jsonb_array_elements(r10.r -> 'kinds') k where k ->> 'kind' = 'daily_review_reminder'),
  'R10. Los conteos de los recordatorios de los últimos 7 días no cuadran'
);
select pg_temp.expect(
  (select k = jsonb_build_object('kind', 'invoice_requested', 'queued', :inv_queued, 'sent', :inv_sent,
                                 'skipped', :inv_skipped, 'failed', :inv_failed)
   from r10, jsonb_array_elements(r10.r -> 'kinds') k where k ->> 'kind' = 'invoice_requested')
  and :inv_queued >= 1,
  'R10. El conteo de facturas no cuadra'
);
-- Todos los tipos vienen, también los que no tienen correos, y en orden
select pg_temp.expect(
  (select array_agg(k ->> 'kind') = array['content_report', 'daily_review_reminder', 'distractor_flags',
          'invoice_requested', 'pass_expiring', 'trial_ending']
   from r10, jsonb_array_elements(r10.r -> 'kinds') k),
  'R10. Los tipos no vinieron todos y en orden');
select pg_temp.expect((public.admin_email_overview(30) -> 'kinds') @> '[{"kind":"daily_review_reminder","skipped":1}]'::jsonb,
  'R10. Con 30 días debía contar el skipped de hace 10');
select pg_temp.is(public.admin_email_overview(0) ->> 'days', '1', 'R10. Cero días debía acotarse a 1');
select pg_temp.is(public.admin_email_overview(1000) ->> 'days', '90', 'R10. Mil días debía acotarse a 90');
select pg_temp.is(public.admin_email_overview(null) ->> 'days', '7', 'R10. Sin días debía ser 7');
-- Sin destinatarios ni claves de la cola
select pg_temp.expect(
  (select strpos(r::text, '@') = 0 and strpos(r::text, 'dedupe') = 0 and strpos(r::text, 'recipient') = 0 and strpos(r::text, 'ba150000') = 0 from r10),
  'R10. El conteo del admin trae destinatarios'
);
rollback;
begin;
select pg_temp.as_user(:'a');
select pg_temp.is(pg_temp.fails_with('select public.admin_email_overview()'), '42501', 'R10. Un alumno vio los conteos de correos');
rollback;
begin;
select pg_temp.as_user(:'l');
select pg_temp.is(pg_temp.fails_with('select public.admin_email_overview()'), '42501', 'R10. Un médico vio los conteos de correos');
rollback;
begin;
select pg_temp.as_anon();
select pg_temp.expect(pg_temp.is_blocked('select public.admin_email_overview()'), 'R10. Un anónimo vio los conteos de correos');
rollback;
begin;
select set_config('request.jwt.claims', '{"role":"authenticated"}', true);
set local role authenticated;
select pg_temp.is(pg_temp.fails_with('select public.admin_email_overview()'), '28000', 'R10. Sin sub debía pedir iniciar sesión');
rollback;

-- ===================================================================== R11. La foto de vencidas
begin;
select pg_temp.as_user(:'a');
select public.put_due_snapshot('{"computedAt":"2026-10-20T15:00:00.000Z","timeZone":"America/Merida","days":[{"day":"2026-10-20","due":37},{"day":"2026-10-21","due":52}],"newAvailable":10}');
commit;
select pg_temp.expect(
  (select computed_at = '2026-10-20T15:00:00Z' and time_zone = 'America/Merida' and new_available = 10
          and days = '[{"day":"2026-10-20","due":37},{"day":"2026-10-21","due":52}]'::jsonb
   from public.review_due_snapshots where user_id = :'a'),
  'R11. La foto no quedó como se mandó'
);
-- Subir otra reemplaza la anterior
begin;
select pg_temp.as_user(:'a');
select public.put_due_snapshot('{"computedAt":"2026-10-20T16:00:00Z","timeZone":"America/Merida","days":[],"newAvailable":0}');
commit;
select pg_temp.expect((select count(*) = 1 and bool_and(jsonb_array_length(days) = 0) from public.review_due_snapshots where user_id = :'a'),
  'R11. La segunda foto no reemplazó a la primera');
-- Solo fechas y números: una clave de más, un texto, una fecha mala o un conteo fuera de rango se rechazan
begin;
select pg_temp.as_user(:'a');
select pg_temp.is(pg_temp.fails_with($q$select public.put_due_snapshot('{"computedAt":"2026-10-20T16:00:00Z","timeZone":"America/Merida","days":[],"newAvailable":0,"cards":["abc"]}')$q$), '22023', 'R11. Una clave de más debía rechazarse');
select pg_temp.is(pg_temp.fails_with($q$select public.put_due_snapshot('{"computedAt":"2026-10-20T16:00:00Z","timeZone":"America/Merida","days":[{"day":"2026-10-20","due":1,"title":"x"}],"newAvailable":0}')$q$), '22023', 'R11. Una clave de más en un día debía rechazarse');
select pg_temp.is(pg_temp.fails_with($q$select public.put_due_snapshot('{"computedAt":"2026-10-20T16:00:00Z","timeZone":"America/Merida","days":[{"day":"hoy","due":1}],"newAvailable":0}')$q$), '22023', 'R11. Una fecha mala debía rechazarse');
select pg_temp.is(pg_temp.fails_with($q$select public.put_due_snapshot('{"computedAt":"2026-10-20T16:00:00Z","timeZone":"America/Merida","days":[{"day":"2026-10-20","due":-1}],"newAvailable":0}')$q$), '22023', 'R11. Un conteo negativo debía rechazarse');
select pg_temp.is(pg_temp.fails_with($q$select public.put_due_snapshot('{"computedAt":"2026-10-20T16:00:00Z","timeZone":"America/Merida","days":[{"day":"2026-10-20","due":100001}],"newAvailable":0}')$q$), '22023', 'R11. Un conteo mayor a 100000 debía rechazarse');
select pg_temp.is(pg_temp.fails_with($q$select public.put_due_snapshot('{"computedAt":"2026-10-20T16:00:00Z","timeZone":"America/Merida","days":[{"day":"2026-10-20","due":"ana@x.mx"}],"newAvailable":0}')$q$), '22023', 'R11. Un texto en el conteo debía rechazarse');
select pg_temp.is(pg_temp.fails_with($q$select public.put_due_snapshot('{"computedAt":"2026-10-20T16:00:00Z","timeZone":"America/Merida","days":[],"newAvailable":1.5}')$q$), '22023', 'R11. Un conteo con decimales debía rechazarse');
select pg_temp.is(pg_temp.fails_with($q$select public.put_due_snapshot('{"computedAt":"2026-10-20T16:00:00Z","timeZone":"Marte/Olimpo","days":[],"newAvailable":0}')$q$), '22023', 'R11. Una zona que no existe debía rechazarse');
select pg_temp.is(pg_temp.fails_with($q$select public.put_due_snapshot('{"computedAt":"no es fecha","timeZone":"America/Merida","days":[],"newAvailable":0}')$q$), '22023', 'R11. Una hora que no se lee debía rechazarse');
select pg_temp.is(pg_temp.fails_with($q$select public.put_due_snapshot('{"computedAt":"2099-01-01T00:00:00Z","timeZone":"America/Merida","days":[],"newAvailable":0}')$q$), '22023', 'R11. Una foto del futuro debía rechazarse');
select pg_temp.is(pg_temp.fails_with($q$select public.put_due_snapshot('{"timeZone":"America/Merida","days":[],"newAvailable":0}')$q$), '22023', 'R11. Sin hora debía rechazarse');
select pg_temp.is(pg_temp.fails_with($q$select public.put_due_snapshot('[]')$q$), '22023', 'R11. Un arreglo en lugar de objeto debía rechazarse');
select pg_temp.is(pg_temp.fails_with($q$select public.put_due_snapshot(null)$q$), '22023', 'R11. Sin foto debía rechazarse');
select pg_temp.is(pg_temp.fails_with(format($q$select public.put_due_snapshot(%L)$q$,
  '{"computedAt":"2026-10-20T16:00:00Z","timeZone":"America/Merida","days":' || (
    select jsonb_agg(jsonb_build_object('day', to_char(date '2026-10-20' + g, 'YYYY-MM-DD'), 'due', 1))::text from generate_series(0, 14) g)
  || ',"newAvailable":0}')), '22023', 'R11. Quince días debían rechazarse');
rollback;
select pg_temp.expect((select jsonb_array_length(days) = 0 from public.review_due_snapshots where user_id = :'a'),
  'R11. Una foto rechazada cambió la guardada');

-- ===================================================================== Ficha de Cron
-- Sin Vault no hay ficha que valga. La comparación contra Vault se prueba en A8 de analytics_test.sql

-- Se deja el envío de correos apagado, como en el proyecto real
select pg_temp.delivery(false);
update public.platform_settings set value = '{"enabled":false}' where key = 'billing_emails';

select 'TODAS LAS PRUEBAS DE LOS RECORDATORIOS PASARON' as resultado;
