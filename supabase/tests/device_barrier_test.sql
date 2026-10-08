-- Pruebas de la barrera del dispositivo único (migración 20261008000001). Corre después de rls_test.sql
-- sobre la misma base. Usa usuarios propios para no depender del estado que dejó aquella.
-- Para simular un token, as_user fija request.jwt.claims con sub y, si se da, session_id, igual que
-- hace PostgREST. Cada bloque falla con un error si algo no cumple.
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

create or replace function pg_temp.n(tbl text) returns bigint language plpgsql as $$
declare c bigint;
begin
  execute 'select count(*) from ' || tbl into c;
  return c;
end $$;

-- Cuántas filas propias ve quien llama en las tablas protegidas
create or replace function pg_temp.protected_rows() returns bigint language sql as $$
  select (select count(*) from public.decks where owner_id = auth.uid())
       + (select count(*) from public.notes)
       + (select count(*) from public.cards)
       + (select count(*) from public.events)
       + (select count(*) from public.subscriptions)
       + (select count(*) from public.ai_artifacts)
       + (select count(*) from public.private_accounts where user_id = auth.uid())
       + (select count(*) from public.content_reports)
       + (select count(*) from public.groups)
       + (select count(*) from public.memberships where user_id = auth.uid())
       + (select count(*) from public.challenges)
$$;

-- ===================================================================== Usuarios
-- S1 alumno principal, S2 compañero de grupo, NEW sin reclamar, LIM límite, SAME mismo dispositivo,
-- LEG fila vieja, WIN y WIN2 ventana, CFG configuración, DEL borrado, REL sin fila, ADM administrador
insert into auth.users (id, email, raw_user_meta_data) values
  ('b0000000-0000-0000-0000-000000000001', 's1@x.mx', '{"alias":"Uno"}'),
  ('b0000000-0000-0000-0000-000000000002', 's2@x.mx', '{"alias":"Dos"}'),
  ('b0000000-0000-0000-0000-000000000003', 'new@x.mx', '{"alias":"Nueva"}'),
  ('b0000000-0000-0000-0000-000000000004', 'lim@x.mx', '{"alias":"Limite"}'),
  ('b0000000-0000-0000-0000-000000000005', 'same@x.mx', '{"alias":"Mismo"}'),
  ('b0000000-0000-0000-0000-000000000006', 'leg@x.mx', '{"alias":"Vieja"}'),
  ('b0000000-0000-0000-0000-000000000007', 'win@x.mx', '{"alias":"Afuera"}'),
  ('b0000000-0000-0000-0000-000000000008', 'win2@x.mx', '{"alias":"Adentro"}'),
  ('b0000000-0000-0000-0000-000000000009', 'cfg@x.mx', '{"alias":"Config"}'),
  ('b0000000-0000-0000-0000-00000000000a', 'del@x.mx', '{"alias":"Borrar"}'),
  ('b0000000-0000-0000-0000-00000000000b', 'rel@x.mx', '{"alias":"Libre"}'),
  ('b0000000-0000-0000-0000-0000000000ad', 'adm@x.mx', '{"alias":"Admin"}');
update public.user_roles set role = 'admin' where user_id = 'b0000000-0000-0000-0000-0000000000ad';

-- B0. El registro de cuentas nuevas sigue funcionando con la barrera puesta
do $$ begin
  if (select count(*) from public.profiles where id::text like 'b0000000-%') <> 12
     or (select count(*) from public.user_roles where user_id::text like 'b0000000-%') <> 12
     or (select count(*) from public.private_accounts where user_id::text like 'b0000000-%') <> 12 then
    raise exception 'FALLA B0. Las cuentas nuevas no nacieron con perfil, rol y cuenta privada';
  end if;
end $$;

-- Datos que crea el servidor o que sirven de contenido compartido
insert into public.subscriptions (user_id, plan, status) values ('b0000000-0000-0000-0000-000000000001', 'monthly', 'active');
insert into public.payments (user_id, provider, provider_payment_id, amount_mxn, status)
  values ('b0000000-0000-0000-0000-000000000001', 'stripe', 'barrera-pay-1', 249, 'paid');
insert into public.ai_artifacts (id, user_id, kind, content)
  values ('b1000000-0000-0000-0000-0000000000a1', 'b0000000-0000-0000-0000-000000000001', 'summary', '{}');
insert into public.decks (id, owner_id, name, origin, visibility) values
  ('b2000000-0000-0000-0000-0000000000f1', 'b0000000-0000-0000-0000-000000000002', 'Público de Dos', 'manual', 'public'),
  ('b2000000-0000-0000-0000-0000000000f2', 'b0000000-0000-0000-0000-000000000002', 'Privado de Dos', 'manual', 'private');
insert into public.clinical_cases (id, vignette) values ('b3000000-0000-0000-0000-0000000000c1', 'Caso de la barrera');
insert into public.questions (id, question_id, version, branch, topic, body, editorial_status)
  values ('b4000000-0000-0000-0000-0000000000e1', 'b4000000-0000-0000-0000-0000000000e2', 1, 'pediatrics', 'neonatology', '{}', 'approved');

-- ===================================================================== B1. El ganador lee y escribe
begin;
select pg_temp.as_user('b0000000-0000-0000-0000-000000000001', 'ses-1');
select public.claim_device('dev-1', 'Chrome en Windows');
insert into public.decks (id, owner_id, name, origin) values ('b2000000-0000-0000-0000-0000000000d1', auth.uid(), 'Mazo de Uno', 'manual');
insert into public.notes (id, deck_id, body) values ('b2000000-0000-0000-0000-0000000000a1', 'b2000000-0000-0000-0000-0000000000d1', '{}');
insert into public.cards (id, note_id, deck_id)
  values ('b2000000-0000-0000-0000-0000000000b1', 'b2000000-0000-0000-0000-0000000000a1', 'b2000000-0000-0000-0000-0000000000d1');
insert into public.events (id, user_id, type, at, tz, payload)
  values ('barrera-evt-1', auth.uid(), 'card_reviewed', now(), 'America/Merida', '{}');
insert into public.content_reports (reporter_id, target_kind, target_id, reason)
  values (auth.uid(), 'question', gen_random_uuid(), 'typo');
insert into public.groups (id, name, invite_code, owner_id) values ('b5000000-0000-0000-0000-0000000000a1', 'Grupo de la barrera', 'BAR234', auth.uid());
insert into public.memberships (group_id, user_id) values ('b5000000-0000-0000-0000-0000000000a1', auth.uid());
insert into public.challenges (group_id, title, metric, target, starts_at, ends_at)
  values ('b5000000-0000-0000-0000-0000000000a1', 'Reto', 'cards', 10, now(), now() + interval '7 days');
select pg_temp.expect(pg_temp.rows_changed($q$update public.profiles set alias = 'Uno B' where id = auth.uid()$q$) = 1, 'B1. El ganador no actualizó su perfil');
select pg_temp.expect(pg_temp.rows_changed($q$update public.private_accounts set state = 'YUC' where user_id = auth.uid()$q$) = 1, 'B1. El ganador no actualizó su cuenta');
select pg_temp.expect(pg_temp.rows_changed($q$update public.ai_artifacts set status = 'approved' where user_id = auth.uid()$q$) = 1, 'B1. El ganador no decidió su borrador');
select pg_temp.expect(pg_temp.rows_changed($q$update public.decks set name = 'Mazo de Uno B' where owner_id = auth.uid()$q$) = 1, 'B1. El ganador no editó su mazo');
-- Ve lo suyo y los mazos públicos, no el mazo privado de otro
select pg_temp.expect((select count(*) from public.decks) = 2, 'B1. El ganador no ve su mazo y el público');
select pg_temp.expect(pg_temp.protected_rows() = 11, 'B1. El ganador no ve todas sus filas protegidas');
select pg_temp.expect((select active from (select public.is_active_device() as active) x), 'B1. is_active_device debe ser true para el ganador');
commit;

-- El compañero de grupo todavía no reclamó nada, así que pasa
begin;
select pg_temp.as_user('b0000000-0000-0000-0000-000000000002', 'ses-s2');
insert into public.memberships (group_id, user_id) values ('b5000000-0000-0000-0000-0000000000a1', auth.uid());
commit;
begin;
select pg_temp.as_user('b0000000-0000-0000-0000-000000000001', 'ses-1');
select pg_temp.expect((select count(*) from public.profiles) = 2, 'B1. El ganador no ve el perfil de su compañero de grupo');
commit;

-- ===================================================================== B2. El anterior queda bloqueado
-- Otro dispositivo toma la cuenta con otra sesión del mismo usuario
begin;
select pg_temp.as_user('b0000000-0000-0000-0000-000000000001', 'ses-2');
select public.claim_device('dev-2', 'Safari en iOS');
commit;

-- El token viejo sigue siendo válido para Supabase, pero la base ya no le deja tocar los datos
begin;
select pg_temp.as_user('b0000000-0000-0000-0000-000000000001', 'ses-1');
do $$ begin
  if public.is_active_device() then raise exception 'FALLA B2. is_active_device es true para el dispositivo anterior'; end if;
  if pg_temp.protected_rows() <> 0 then
    raise exception 'FALLA B2. El dispositivo anterior ve % filas protegidas', pg_temp.protected_rows();
  end if;
  -- Del mazo solo ve el público de otro. Notas y tarjetas heredan esa regla
  if (select count(*) from public.decks) <> 1 or (select count(*) from public.decks where visibility = 'public') <> 1 then
    raise exception 'FALLA B2. El dispositivo anterior ve mazos que no son públicos';
  end if;
  if (select count(*) from public.profiles) <> 1 then
    raise exception 'FALLA B2. El dispositivo anterior ve perfiles de compañeros de grupo';
  end if;
  -- Escrituras. Los insert los rechaza la política y los update y delete no tocan filas
  if not pg_temp.is_blocked($q$insert into public.decks (owner_id, name, origin) values (auth.uid(), 'x', 'manual')$q$) then
    raise exception 'FALLA B2. Insertó un mazo'; end if;
  if not pg_temp.is_blocked($q$insert into public.notes (deck_id, body) values ('b2000000-0000-0000-0000-0000000000d1', '{}')$q$) then
    raise exception 'FALLA B2. Insertó una nota'; end if;
  if not pg_temp.is_blocked($q$insert into public.cards (note_id, deck_id) values ('b2000000-0000-0000-0000-0000000000a1', 'b2000000-0000-0000-0000-0000000000d1')$q$) then
    raise exception 'FALLA B2. Insertó una tarjeta'; end if;
  if not pg_temp.is_blocked($q$insert into public.events (id, user_id, type, at, tz, payload) values ('barrera-evt-x', auth.uid(), 'card_reviewed', now(), 'America/Merida', '{}')$q$) then
    raise exception 'FALLA B2. Insertó un evento'; end if;
  if not pg_temp.is_blocked($q$insert into public.content_reports (reporter_id, target_kind, target_id, reason) values (auth.uid(), 'question', gen_random_uuid(), 'typo')$q$) then
    raise exception 'FALLA B2. Insertó un reporte'; end if;
  if not pg_temp.is_blocked($q$insert into public.groups (name, invite_code, owner_id) values ('x', 'BAR999', auth.uid())$q$) then
    raise exception 'FALLA B2. Creó un grupo'; end if;
  if not pg_temp.is_blocked($q$insert into public.memberships (group_id, user_id) values ('b5000000-0000-0000-0000-0000000000a1', auth.uid())$q$) then
    raise exception 'FALLA B2. Insertó una membresía'; end if;
  if not pg_temp.is_blocked($q$insert into public.challenges (group_id, title, metric, target, starts_at, ends_at) values ('b5000000-0000-0000-0000-0000000000a1', 'x', 'cards', 1, now(), now())$q$) then
    raise exception 'FALLA B2. Insertó un reto'; end if;
  if pg_temp.rows_changed($q$update public.profiles set alias = 'Hackeado' where id = auth.uid()$q$) <> 0
     or pg_temp.rows_changed($q$update public.private_accounts set state = 'CDMX' where user_id = auth.uid()$q$) <> 0
     or pg_temp.rows_changed($q$update public.ai_artifacts set status = 'rejected' where user_id = auth.uid()$q$) <> 0
     or pg_temp.rows_changed($q$update public.decks set name = 'Hackeado' where owner_id = auth.uid()$q$) <> 0
     or pg_temp.rows_changed($q$update public.memberships set left_at = now() where user_id = auth.uid()$q$) <> 0
     or pg_temp.rows_changed($q$delete from public.decks where owner_id = auth.uid()$q$) <> 0
     or pg_temp.rows_changed($q$delete from public.notes$q$) <> 0
     or pg_temp.rows_changed($q$delete from public.cards$q$) <> 0 then
    raise exception 'FALLA B2. El dispositivo anterior modificó datos protegidos';
  end if;
end $$;
commit;

-- Lo que NO se protege sigue abierto para el dispositivo anterior, o no podría ni entrar de nuevo
begin;
select pg_temp.as_user('b0000000-0000-0000-0000-000000000001', 'ses-1');
do $$ begin
  if (select count(*) from public.user_roles where user_id = auth.uid()) <> 1 then
    raise exception 'FALLA B2. No lee su rol'; end if;
  if (select alias from public.profiles where id = auth.uid()) <> 'Uno B' then
    raise exception 'FALLA B2. No lee su propio perfil'; end if;
  if (select device_id from public.device_sessions where user_id = auth.uid()) <> 'dev-2' then
    raise exception 'FALLA B2. No lee quién tiene la cuenta'; end if;
  if (select count(*) from public.platform_settings) < 1 then
    raise exception 'FALLA B2. No lee la configuración'; end if;
  if (select count(*) from public.questions where id = 'b4000000-0000-0000-0000-0000000000e1') <> 1 then
    raise exception 'FALLA B2. No lee las preguntas aprobadas'; end if;
  if (select count(*) from public.clinical_cases where id = 'b3000000-0000-0000-0000-0000000000c1') <> 1 then
    raise exception 'FALLA B2. No lee los casos clínicos'; end if;
  if (select count(*) from public.payments) <> 1 then
    raise exception 'FALLA B2. No lee su historial de pagos'; end if;
  -- El aviso de privacidad se registra al entrar, antes de que se sepa quién tiene la cuenta
  insert into public.privacy_acceptances (user_id, notice_version) values (auth.uid(), 'barrera-v1');
  if (select count(*) from public.privacy_acceptances where user_id = auth.uid()) <> 1 then
    raise exception 'FALLA B2. No registró el aviso de privacidad'; end if;
end $$;
commit;

-- El dispositivo nuevo sí lee y escribe
begin;
select pg_temp.as_user('b0000000-0000-0000-0000-000000000001', 'ses-2');
do $$ begin
  if not public.is_active_device() then raise exception 'FALLA B2. El ganador nuevo no pasa'; end if;
  if pg_temp.protected_rows() <> 11 then raise exception 'FALLA B2. El ganador nuevo no ve sus filas'; end if;
  insert into public.events (id, user_id, type, at, tz, payload)
    values ('barrera-evt-2', auth.uid(), 'card_reviewed', now(), 'America/Merida', '{}');
end $$;
commit;

-- Quien perdió puede volver a entrar. Reclama de nuevo y ahora el otro queda bloqueado
begin;
select pg_temp.as_user('b0000000-0000-0000-0000-000000000001', 'ses-1b');
select public.claim_device('dev-1', 'Chrome en Windows');
do $$ begin
  if pg_temp.protected_rows() <> 12 then raise exception 'FALLA B2. Al reclamar de nuevo no recuperó sus filas'; end if;
end $$;
commit;
do $$ begin
  if (select string_agg(kind, ',' order by id) from public.device_claims where user_id = 'b0000000-0000-0000-0000-000000000001') <> 'first,switch,switch' then
    raise exception 'FALLA B2. La bitácora de reclamos no registró first, switch, switch';
  end if;
end $$;
begin;
select pg_temp.as_user('b0000000-0000-0000-0000-000000000001', 'ses-2');
do $$ begin
  if public.is_active_device() or pg_temp.protected_rows() <> 0 then
    raise exception 'FALLA B2. El dispositivo desplazado en segundo lugar no quedó bloqueado'; end if;
end $$;
commit;
-- La sesión anterior de ese mismo dispositivo (ses-1) tampoco sirve. Cada sesión es una entrada
begin;
select pg_temp.as_user('b0000000-0000-0000-0000-000000000001', 'ses-1');
do $$ begin
  if public.is_active_device() then raise exception 'FALLA B2. Una sesión vieja del mismo dispositivo pasa'; end if;
end $$;
rollback;

-- B2b. Un alumno no ve ni toca lo de otro alumno, tenga o no la cuenta activa
begin;
select pg_temp.as_user('b0000000-0000-0000-0000-000000000002', 'ses-s2');
do $$ begin
  if (select count(*) from public.events) <> 0 or (select count(*) from public.subscriptions) <> 0 then
    raise exception 'FALLA B2. Un alumno ve la bitácora o la suscripción de otro'; end if;
  if pg_temp.rows_changed($q$update public.decks set name = 'x' where id = 'b2000000-0000-0000-0000-0000000000d1'$q$) <> 0 then
    raise exception 'FALLA B2. Un alumno editó el mazo de otro'; end if;
end $$;
rollback;

-- ===================================================================== B3. Cuenta sin reclamar
begin;
select pg_temp.as_user('b0000000-0000-0000-0000-000000000003', 'cualquier-sesion');
do $$ begin
  if not public.is_active_device() then raise exception 'FALLA B3. Una cuenta sin reclamar no pasa'; end if;
  insert into public.privacy_acceptances (user_id, notice_version) values (auth.uid(), 'barrera-v1');
  insert into public.decks (id, owner_id, name, origin) values ('b2000000-0000-0000-0000-0000000000d3', auth.uid(), 'Mazo nuevo', 'manual');
  insert into public.events (id, user_id, type, at, tz, payload)
    values ('barrera-evt-3', auth.uid(), 'card_reviewed', now(), 'America/Merida', '{}');
  update public.profiles set alias = 'Nueva B' where id = auth.uid();
  if (select alias from public.profiles where id = auth.uid()) <> 'Nueva B' then
    raise exception 'FALLA B3. No actualizó su perfil'; end if;
  if pg_temp.protected_rows() <> 3 then raise exception 'FALLA B3. No ve lo que escribió'; end if;
end $$;
commit;
-- Un token sin session_id tampoco estorba mientras nadie haya reclamado
begin;
select pg_temp.as_user('b0000000-0000-0000-0000-000000000003');
do $$ begin
  if not public.is_active_device() or pg_temp.protected_rows() <> 3 then
    raise exception 'FALLA B3. Un token sin session_id no pasa en una cuenta sin reclamar'; end if;
end $$;
commit;
-- Sin sesión no hay dispositivo. Ni siquiera como postgres, que no trae token
do $$ begin
  if public.is_active_device() then raise exception 'FALLA B3. is_active_device es true sin auth.uid()'; end if;
end $$;

-- ===================================================================== B4. Filas viejas y tokens sin session_id
-- Una fila reclamada antes de la migración no tiene session_id. Deja pasar cualquier token de la cuenta
insert into public.device_sessions (user_id, device_id, label, session_id, claimed_at)
  values ('b0000000-0000-0000-0000-000000000006', 'dev-old', 'Chrome en Windows', null, now());
begin;
select pg_temp.as_user('b0000000-0000-0000-0000-000000000006', 'ses-l1');
do $$ begin
  if not public.is_active_device() then raise exception 'FALLA B4. Una fila sin session_id bloquea a su dueño'; end if;
  insert into public.events (id, user_id, type, at, tz, payload)
    values ('barrera-evt-l1', auth.uid(), 'card_reviewed', now(), 'America/Merida', '{}');
end $$;
commit;
begin;
select pg_temp.as_user('b0000000-0000-0000-0000-000000000006');
do $$ begin
  if not public.is_active_device() then raise exception 'FALLA B4. Una fila sin session_id bloquea a un token sin session_id'; end if;
end $$;
commit;
-- El cliente nuevo confirma el mismo dispositivo y la fila queda amarrada a su sesión, sin gastar el límite
begin;
select pg_temp.as_user('b0000000-0000-0000-0000-000000000006', 'ses-l2');
select public.claim_device('dev-old', 'Chrome en Windows');
commit;
do $$ begin
  if (select session_id from public.device_sessions where user_id = 'b0000000-0000-0000-0000-000000000006') <> 'ses-l2' then
    raise exception 'FALLA B4. La confirmación no guardó el session_id'; end if;
  if (select kind from public.device_claims where user_id = 'b0000000-0000-0000-0000-000000000006') <> 'refresh' then
    raise exception 'FALLA B4. La confirmación del mismo dispositivo no quedó como refresh'; end if;
end $$;
begin;
select pg_temp.as_user('b0000000-0000-0000-0000-000000000006', 'ses-l1');
do $$ begin
  if public.is_active_device() or pg_temp.protected_rows() <> 0 then
    raise exception 'FALLA B4. La sesión vieja pasa en una fila ya amarrada'; end if;
end $$;
commit;
-- Un token sin session_id no abre una cuenta ya amarrada a una sesión
begin;
select pg_temp.as_user('b0000000-0000-0000-0000-000000000006');
do $$ begin
  if public.is_active_device() or pg_temp.protected_rows() <> 0 then
    raise exception 'FALLA B4. Un token sin session_id abre una cuenta amarrada'; end if;
end $$;
commit;
begin;
select pg_temp.as_user('b0000000-0000-0000-0000-000000000006', 'ses-l2');
do $$ begin
  if not public.is_active_device() or pg_temp.protected_rows() <> 2 then
    raise exception 'FALLA B4. La sesión amarrada no ve su bitácora y su cuenta'; end if;
end $$;
commit;
-- Confirmar el mismo dispositivo con un token sin session_id no desamarra la cuenta ni deja otro renglón
begin;
select pg_temp.as_user('b0000000-0000-0000-0000-000000000006');
select public.claim_device('dev-old', 'Chrome en Windows');
commit;
do $$ begin
  if (select session_id from public.device_sessions where user_id = 'b0000000-0000-0000-0000-000000000006') <> 'ses-l2' then
    raise exception 'FALLA B4. Un token sin session_id desamarró la cuenta'; end if;
  if (select count(*) from public.device_claims where user_id = 'b0000000-0000-0000-0000-000000000006') <> 1 then
    raise exception 'FALLA B4. Confirmar sin cambios dejó otro renglón en la bitácora'; end if;
end $$;
-- Un token sin session_id que reclama deja la fila sin amarrar (queda abierta como antes, hasta el siguiente reclamo)
begin;
select pg_temp.as_user('b0000000-0000-0000-0000-000000000005');
select public.claim_device('dev-same-0', 'Firefox en Linux');
do $$ begin
  if (select session_id from public.device_sessions where user_id = auth.uid()) is not null then
    raise exception 'FALLA B4. Un token sin session_id guardó un session_id'; end if;
end $$;
commit;

-- ===================================================================== B5. El administrador pasa
begin;
select pg_temp.as_user('b0000000-0000-0000-0000-0000000000ad', 'ses-a1');
select public.claim_device('dev-adm', 'Chrome en Windows');
commit;
begin;
select pg_temp.as_user('b0000000-0000-0000-0000-0000000000ad', 'ses-a2');
do $$ begin
  if not public.is_active_device() then raise exception 'FALLA B5. El admin con otra sesión no pasa'; end if;
  insert into public.decks (id, owner_id, name, origin) values ('b2000000-0000-0000-0000-0000000000ad', auth.uid(), 'Mazo del admin', 'manual');
  insert into public.events (id, user_id, type, at, tz, payload)
    values ('barrera-evt-adm', auth.uid(), 'card_reviewed', now(), 'America/Merida', '{}');
  -- Ve y edita lo de los demás, como antes de la barrera
  if (select count(*) from public.decks where id in ('b2000000-0000-0000-0000-0000000000d1', 'b2000000-0000-0000-0000-0000000000f2')) <> 2 then
    raise exception 'FALLA B5. El admin no ve los mazos de los alumnos'; end if;
  if pg_temp.rows_changed($q$update public.decks set description = 'revisado' where id = 'b2000000-0000-0000-0000-0000000000d1'$q$) <> 1 then
    raise exception 'FALLA B5. El admin no editó el mazo de un alumno'; end if;
  if (select count(*) from public.private_accounts) < 12 then
    raise exception 'FALLA B5. El admin no ve las cuentas'; end if;
end $$;
commit;

-- ===================================================================== B6. Límite de cambios
-- Primer reclamo y volver al mismo dispositivo no cuentan. Los cambios entre dispositivos sí
begin;
select pg_temp.as_user('b0000000-0000-0000-0000-000000000004', 'l-1');
select public.claim_device('dev-a', 'Chrome en Windows');
select public.claim_device('dev-b', 'Safari en iOS');
select public.claim_device('dev-a', 'Chrome en Windows');
select public.claim_device('dev-b', 'Safari en iOS');
do $$
declare msg text; det text; st text;
begin
  perform public.claim_device('dev-a', 'Chrome en Windows');
  raise exception 'FALLA B6. El cuarto cambio en 24 horas no se rechazó';
exception when sqlstate 'DV001' then
  get stacked diagnostics msg = message_text, det = pg_exception_detail, st = returned_sqlstate;
  if st <> 'DV001' or msg not like 'Cambiaste de dispositivo demasiadas veces%' then
    raise exception 'FALLA B6. Mensaje inesperado %', msg; end if;
  -- La hora para volver a intentar es la del cambio más antiguo más 24 horas, en UTC y formato ISO
  if det !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$'
     or det::timestamptz < now() + interval '23 hours 59 minutes'
     or det::timestamptz > now() + interval '24 hours 2 minutes' then
    raise exception 'FALLA B6. Hora de reintento inesperada %', det; end if;
end $$;
-- El rechazo no cambió nada
do $$ begin
  if (select device_id from public.device_sessions where user_id = auth.uid()) <> 'dev-b' then
    raise exception 'FALLA B6. Un cambio rechazado movió la cuenta'; end if;
end $$;
-- Volver a reclamar desde el MISMO dispositivo no cuenta aunque ya se pasó del límite
select public.claim_device('dev-b', 'Safari en iOS');
select public.claim_device('dev-b', 'Safari en iOS');
commit;
do $$ begin
  if (select count(*) from public.device_claims where user_id = 'b0000000-0000-0000-0000-000000000004' and kind = 'first') <> 1
     or (select count(*) from public.device_claims where user_id = 'b0000000-0000-0000-0000-000000000004' and kind = 'switch' and not rejected) <> 3
     or (select count(*) from public.device_claims where user_id = 'b0000000-0000-0000-0000-000000000004' and kind = 'refresh') <> 0
     or (select count(*) from public.device_claims where user_id = 'b0000000-0000-0000-0000-000000000004' and rejected) <> 0 then
    raise exception 'FALLA B6. La bitácora no tiene 1 first y 3 switch aceptados';
  end if;
end $$;

-- El rechazo queda en device_claims cuando el cliente lo reporta, porque la excepción deshizo lo demás
begin;
select pg_temp.as_user('b0000000-0000-0000-0000-000000000004', 'l-1');
do $$ begin
  if not public.log_rejected_claim('dev-a', 'Chrome en Windows') then
    raise exception 'FALLA B6. No registró el intento rechazado'; end if;
  -- El mismo rechazo en pocos minutos no se repite
  if public.log_rejected_claim('dev-a', 'Chrome en Windows') then
    raise exception 'FALLA B6. Repitió el mismo rechazo'; end if;
  -- El dispositivo que ya tiene la cuenta no se rechaza a sí mismo
  if public.log_rejected_claim('dev-b', 'Safari en iOS') then
    raise exception 'FALLA B6. Registró un rechazo de quien ya tiene la cuenta'; end if;
end $$;
commit;
do $$ begin
  if (select count(*) from public.device_claims where user_id = 'b0000000-0000-0000-0000-000000000004' and rejected) <> 1
     or (select kind from public.device_claims where user_id = 'b0000000-0000-0000-0000-000000000004' and rejected) <> 'switch'
     or (select device_id from public.device_claims where user_id = 'b0000000-0000-0000-0000-000000000004' and rejected) <> 'dev-a' then
    raise exception 'FALLA B6. El rechazo no quedó asentado como switch rechazado de dev-a'; end if;
  -- Un rechazo no cuenta como cambio: sigue habiendo 3
  if (select count(*) from public.device_claims where user_id = 'b0000000-0000-0000-0000-000000000004' and kind = 'switch' and not rejected) <> 3 then
    raise exception 'FALLA B6. Un rechazo contó como cambio'; end if;
end $$;

-- Un cliente no puede llenar la bitácora con rechazos inventados si no está en el límite
begin;
select pg_temp.as_user('b0000000-0000-0000-0000-000000000005', 's-5');
do $$ begin
  if public.log_rejected_claim('dev-falso', 'x') then
    raise exception 'FALLA B6. Registró un rechazo de una cuenta que no está en el límite'; end if;
end $$;
rollback;
begin;
select pg_temp.as_user('b0000000-0000-0000-0000-000000000003', 's-3');
do $$ begin
  if public.log_rejected_claim('dev-falso', 'x') then
    raise exception 'FALLA B6. Registró un rechazo de una cuenta sin reclamar'; end if;
end $$;
rollback;

-- Confirmar el mismo dispositivo muchas veces, con sesiones nuevas, no gasta el límite
begin;
select pg_temp.as_user('b0000000-0000-0000-0000-000000000005', 's-5-0');
select public.claim_device('dev-same-0', 'Firefox en Linux');
select public.claim_device('dev-same-0', 'Firefox en Linux');
select pg_temp.as_user('b0000000-0000-0000-0000-000000000005', 's-5-1');
select public.claim_device('dev-same-0', 'Firefox en Linux');
select pg_temp.as_user('b0000000-0000-0000-0000-000000000005', 's-5-2');
select public.claim_device('dev-same-0', 'Firefox en Linux');
select pg_temp.as_user('b0000000-0000-0000-0000-000000000005', 's-5-3');
select public.claim_device('dev-same-0', 'Firefox en Linux');
select pg_temp.as_user('b0000000-0000-0000-0000-000000000005', 's-5-4');
select public.claim_device('dev-same-0', 'Firefox en Linux');
select public.claim_device('dev-same-1', 'Edge en Windows');
select public.claim_device('dev-same-0', 'Firefox en Linux');
select public.claim_device('dev-same-1', 'Edge en Windows');
commit;
do $$ begin
  -- 3 cambios aceptados pese a las 5 confirmaciones con sesión nueva. Repetir la misma sesión no deja fila
  if (select count(*) from public.device_claims where user_id = 'b0000000-0000-0000-0000-000000000005' and kind = 'switch' and not rejected) <> 3
     or (select count(*) from public.device_claims where user_id = 'b0000000-0000-0000-0000-000000000005' and kind = 'refresh') <> 5 then
    raise exception 'FALLA B6. Las confirmaciones del mismo dispositivo contaron como cambios';
  end if;
end $$;
begin;
select pg_temp.as_user('b0000000-0000-0000-0000-000000000005', 's-5-4');
do $$ begin
  begin
    perform public.claim_device('dev-same-0', 'Firefox en Linux');
    raise exception 'FALLA B6. No rechazó el cuarto cambio de quien ya había confirmado antes';
  exception when sqlstate 'DV001' then null; end;
end $$;
rollback;

-- La ventana es de 24 horas. Tres cambios de hace más de un día ya no cuentan
insert into public.device_sessions (user_id, device_id, label, session_id) values
  ('b0000000-0000-0000-0000-000000000007', 'dev-a', 'Chrome en Windows', 's-7'),
  ('b0000000-0000-0000-0000-000000000008', 'dev-a', 'Chrome en Windows', 's-8');
insert into public.device_claims (user_id, device_id, label, claimed_at, kind) values
  ('b0000000-0000-0000-0000-000000000007', 'dev-b', '', now() - interval '26 hours', 'switch'),
  ('b0000000-0000-0000-0000-000000000007', 'dev-a', '', now() - interval '25 hours', 'switch'),
  ('b0000000-0000-0000-0000-000000000007', 'dev-b', '', now() - interval '24 hours 1 minute', 'switch'),
  ('b0000000-0000-0000-0000-000000000008', 'dev-b', '', now() - interval '23 hours', 'switch'),
  ('b0000000-0000-0000-0000-000000000008', 'dev-a', '', now() - interval '22 hours', 'switch'),
  ('b0000000-0000-0000-0000-000000000008', 'dev-b', '', now() - interval '1 hour', 'switch');
begin;
select pg_temp.as_user('b0000000-0000-0000-0000-000000000007', 's-7');
select public.claim_device('dev-b', 'Safari en iOS');
do $$ begin
  if (select device_id from public.device_sessions where user_id = auth.uid()) <> 'dev-b' then
    raise exception 'FALLA B6. Un cambio fuera de la ventana de 24 horas se rechazó'; end if;
end $$;
commit;
-- Con tres dentro de la ventana se rechaza, y la hora de reintento es cuando sale el más antiguo
begin;
select pg_temp.as_user('b0000000-0000-0000-0000-000000000008', 's-8');
do $$
declare det text;
begin
  perform public.claim_device('dev-b', 'Safari en iOS');
  raise exception 'FALLA B6. Tres cambios dentro de la ventana no bloquearon';
exception when sqlstate 'DV001' then
  get stacked diagnostics det = pg_exception_detail;
  if det::timestamptz < now() + interval '59 minutes' or det::timestamptz > now() + interval '61 minutes' then
    raise exception 'FALLA B6. La hora de reintento debía ser en una hora, y fue %', det; end if;
end $$;
rollback;

-- ===================================================================== B7. Límite configurable
-- Con maxChanges en 2 y tres cambios en la ventana, hay que esperar a que salgan dos
update public.platform_settings set value = '{"maxChanges":2,"windowHours":24}' where key = 'device_limits';
begin;
select pg_temp.as_user('b0000000-0000-0000-0000-000000000008', 's-8');
do $$
declare det text;
begin
  perform public.claim_device('dev-b', 'Safari en iOS');
  raise exception 'FALLA B7. No respetó maxChanges en 2';
exception when sqlstate 'DV001' then
  get stacked diagnostics det = pg_exception_detail;
  if det::timestamptz < now() + interval '1 hour 59 minutes' or det::timestamptz > now() + interval '2 hours 1 minute' then
    raise exception 'FALLA B7. Con tres cambios y tope de dos la espera debía ser de 2 horas, y fue %', det; end if;
end $$;
rollback;
-- Con maxChanges en 1, el segundo cambio de un usuario nuevo ya se rechaza
update public.platform_settings set value = '{"maxChanges":1,"windowHours":24}' where key = 'device_limits';
begin;
select pg_temp.as_user('b0000000-0000-0000-0000-000000000009', 's-9');
select public.claim_device('dev-a', 'Chrome en Windows');
select public.claim_device('dev-b', 'Safari en iOS');
do $$ begin
  perform public.claim_device('dev-a', 'Chrome en Windows');
  raise exception 'FALLA B7. No respetó maxChanges en 1';
exception when sqlstate 'DV001' then null; end $$;
rollback;
-- Una configuración que no se entiende no apaga el límite: vuelven los valores de respaldo (3 y 24)
update public.platform_settings set value = '{"maxChanges":"muchos","windowHours":-5}' where key = 'device_limits';
begin;
select pg_temp.as_user('b0000000-0000-0000-0000-000000000008', 's-8');
do $$ begin
  perform public.claim_device('dev-b', 'Safari en iOS');
  raise exception 'FALLA B7. Una configuración inválida apagó el límite';
exception when sqlstate 'DV001' then null; end $$;
rollback;
delete from public.platform_settings where key = 'device_limits';
begin;
select pg_temp.as_user('b0000000-0000-0000-0000-000000000008', 's-8');
do $$ begin
  perform public.claim_device('dev-b', 'Safari en iOS');
  raise exception 'FALLA B7. Sin la fila de configuración se apagó el límite';
exception when sqlstate 'DV001' then null; end $$;
rollback;
update public.platform_settings set value = '{"maxChanges":3,"windowHours":24}' where key = 'device_limits';
insert into public.platform_settings (key, value) values ('device_limits', '{"maxChanges":3,"windowHours":24}')
  on conflict (key) do nothing;
-- Solo el admin cambia el límite
begin;
select pg_temp.as_user('b0000000-0000-0000-0000-000000000001', 'ses-1b');
update public.platform_settings set value = '{"maxChanges":50,"windowHours":1}' where key = 'device_limits';
do $$ begin
  if (select (value ->> 'maxChanges')::int from public.platform_settings where key = 'device_limits') <> 3 then
    raise exception 'FALLA B7. Un alumno cambió el límite'; end if;
end $$;
rollback;

-- ===================================================================== B8. Liberar una cuenta
-- Un alumno no ejecuta las funciones del admin
begin;
select pg_temp.as_user('b0000000-0000-0000-0000-000000000001', 'ses-1b');
do $$ begin
  if not pg_temp.is_blocked($q$select public.admin_release_device('b0000000-0000-0000-0000-000000000004')$q$) then
    raise exception 'FALLA B8. Un alumno liberó una cuenta'; end if;
  if not pg_temp.is_blocked($q$select * from public.admin_device_claims('b0000000-0000-0000-0000-000000000004')$q$) then
    raise exception 'FALLA B8. Un alumno leyó los reclamos de otro'; end if;
end $$;
rollback;
-- El admin ve los últimos reclamos, del más reciente al más antiguo
begin;
select pg_temp.as_user('b0000000-0000-0000-0000-0000000000ad', 'ses-a2');
do $$
declare first_kind text; total int;
begin
  select count(*) into total from public.admin_device_claims('b0000000-0000-0000-0000-000000000004');
  select kind into first_kind from public.admin_device_claims('b0000000-0000-0000-0000-000000000004') limit 1;
  if total <> 5 or first_kind <> 'switch' then
    raise exception 'FALLA B8. admin_device_claims devolvió % filas, la primera %', total, first_kind; end if;
  if (select rejected from public.admin_device_claims('b0000000-0000-0000-0000-000000000004') limit 1) is not true then
    raise exception 'FALLA B8. El rechazo debía ser el reclamo más reciente'; end if;
end $$;
rollback;
-- Libera a LIM. Su fila se borra, queda asentado quién lo hizo y el conteo del límite arranca de cero
begin;
select pg_temp.as_user('b0000000-0000-0000-0000-0000000000ad', 'ses-a2');
do $$ begin
  if not public.admin_release_device('b0000000-0000-0000-0000-000000000004') then
    raise exception 'FALLA B8. No liberó una cuenta que tenía dispositivo'; end if;
  -- Liberar a quien no tiene dispositivo devuelve false pero también se asienta
  if public.admin_release_device('b0000000-0000-0000-0000-00000000000b') then
    raise exception 'FALLA B8. Dijo que liberó una cuenta sin dispositivo'; end if;
  -- Una cuenta que no existe o un destino vacío se rechazan
  begin
    perform public.admin_release_device('b0000000-0000-0000-0000-0000000000ff');
    raise exception 'FALLA B8. Liberó una cuenta que no existe';
  exception when invalid_parameter_value then null; end;
  begin
    perform public.admin_release_device(null);
    raise exception 'FALLA B8. Liberó un destino vacío';
  exception when invalid_parameter_value then null; end;
end $$;
commit;
do $$
begin
  if (select count(*) from public.device_sessions where user_id = 'b0000000-0000-0000-0000-000000000004') <> 0 then
    raise exception 'FALLA B8. Siguió la fila del dispositivo liberado'; end if;
  if (select device_id from public.device_claims where user_id = 'b0000000-0000-0000-0000-000000000004' and kind = 'release') <> 'dev-b'
     or (select actor_id from public.device_claims where user_id = 'b0000000-0000-0000-0000-000000000004' and kind = 'release') <> 'b0000000-0000-0000-0000-0000000000ad' then
    raise exception 'FALLA B8. La liberación no quedó asentada con el dispositivo y el admin'; end if;
  if (select device_id from public.device_claims where user_id = 'b0000000-0000-0000-0000-00000000000b' and kind = 'release') <> '' then
    raise exception 'FALLA B8. La liberación sin dispositivo no quedó asentada'; end if;
end $$;
-- Después de liberar, el primero que reclama se queda con la cuenta y el límite arranca de cero
begin;
select pg_temp.as_user('b0000000-0000-0000-0000-000000000004', 'l-2');
select public.claim_device('dev-a', 'Chrome en Windows');
select public.claim_device('dev-b', 'Safari en iOS');
select public.claim_device('dev-a', 'Chrome en Windows');
select public.claim_device('dev-b', 'Safari en iOS');
do $$ begin
  perform public.claim_device('dev-a', 'Chrome en Windows');
  raise exception 'FALLA B8. Tras liberar, el conteo debía arrancar de cero y rechazar el cuarto cambio nuevo';
exception when sqlstate 'DV001' then null; end $$;
commit;
do $$ begin
  -- Los 3 cambios nuevos se cuentan solos. Los 3 de antes de la liberación ya no cuentan
  if (select count(*) from public.device_claims where user_id = 'b0000000-0000-0000-0000-000000000004' and kind = 'switch' and not rejected) <> 6 then
    raise exception 'FALLA B8. Faltan cambios en la bitácora tras liberar'; end if;
end $$;
-- La función de reclamos devuelve como mucho 50 filas
insert into public.device_claims (user_id, device_id, label, kind)
  select 'b0000000-0000-0000-0000-000000000007', 'dev-x', '', 'refresh' from generate_series(1, 60);
begin;
select pg_temp.as_user('b0000000-0000-0000-0000-0000000000ad', 'ses-a2');
select pg_temp.expect((select count(*) from public.admin_device_claims('b0000000-0000-0000-0000-000000000007')) = 50, 'B8. admin_device_claims devuelve más de 50 filas');
rollback;

-- ===================================================================== B9. device_claims no se edita ni se borra
-- Ni la API ni el admin leen o escriben la tabla. Solo las funciones
begin;
select pg_temp.as_user('b0000000-0000-0000-0000-0000000000ad', 'ses-a2');
do $$ begin
  if not pg_temp.is_blocked('select count(*) from public.device_claims') then raise exception 'FALLA B9. El admin lee device_claims directo'; end if;
  if not pg_temp.is_blocked($q$update public.device_claims set label = 'x'$q$) then raise exception 'FALLA B9. El admin editó device_claims'; end if;
  if not pg_temp.is_blocked('delete from public.device_claims') then raise exception 'FALLA B9. El admin borró device_claims'; end if;
  if not pg_temp.is_blocked($q$insert into public.device_claims (user_id, device_id, kind) values ('b0000000-0000-0000-0000-000000000001', 'x', 'first')$q$) then
    raise exception 'FALLA B9. El admin insertó en device_claims'; end if;
  if not pg_temp.is_blocked('truncate public.device_claims') then raise exception 'FALLA B9. El admin vació device_claims'; end if;
end $$;
rollback;
begin;
select pg_temp.as_user('b0000000-0000-0000-0000-000000000001', 'ses-1b');
do $$ begin
  if not pg_temp.is_blocked('select count(*) from public.device_claims') then raise exception 'FALLA B9. Un alumno lee device_claims'; end if;
  if not pg_temp.is_blocked('delete from public.device_claims') then raise exception 'FALLA B9. Un alumno borró device_claims'; end if;
end $$;
rollback;
begin;
set local role service_role;
do $$ begin
  if not pg_temp.is_blocked('select count(*) from public.device_claims') then raise exception 'FALLA B9. service_role lee device_claims'; end if;
  if not pg_temp.is_blocked($q$update public.device_claims set label = 'x'$q$) then raise exception 'FALLA B9. service_role editó device_claims'; end if;
end $$;
rollback;
begin;
set local role anon;
do $$ begin
  if not pg_temp.is_blocked('select count(*) from public.device_claims') then raise exception 'FALLA B9. anon lee device_claims'; end if;
end $$;
rollback;
-- Aunque se llegue como dueño de la tabla, la bitácora solo se agrega
create temp table claims_before as select count(*) as n, max(id) as max_id from public.device_claims;
do $$ begin
  if not pg_temp.is_blocked($q$update public.device_claims set label = 'x'$q$) then raise exception 'FALLA B9. El dueño de la tabla editó device_claims'; end if;
  if not pg_temp.is_blocked('delete from public.device_claims') then raise exception 'FALLA B9. El dueño de la tabla borró device_claims'; end if;
  if not pg_temp.is_blocked($q$delete from public.device_claims where kind = 'refresh'$q$) then raise exception 'FALLA B9. El dueño borró filas sueltas'; end if;
  if not pg_temp.is_blocked('truncate public.device_claims') then raise exception 'FALLA B9. El dueño vació device_claims'; end if;
  if (select count(*) from public.device_claims) <> (select n from claims_before) or exists (select 1 from public.device_claims where label = 'x') then
    raise exception 'FALLA B9. device_claims cambió';
  end if;
end $$;
-- Lo único que la borra es borrar la cuenta entera
begin;
select pg_temp.as_user('b0000000-0000-0000-0000-00000000000a', 's-a');
select public.claim_device('dev-del-1', 'Chrome en Windows');
select public.claim_device('dev-del-2', 'Safari en iOS');
commit;
do $$ begin
  if (select count(*) from public.device_claims where user_id = 'b0000000-0000-0000-0000-00000000000a') <> 2 then
    raise exception 'FALLA B9. No hay reclamos de la cuenta que se va a borrar'; end if;
  delete from auth.users where id = 'b0000000-0000-0000-0000-00000000000a';
  if (select count(*) from public.device_claims where user_id = 'b0000000-0000-0000-0000-00000000000a') <> 0
     or (select count(*) from public.device_sessions where user_id = 'b0000000-0000-0000-0000-00000000000a') <> 0 then
    raise exception 'FALLA B9. Al borrar la cuenta quedaron reclamos o dispositivo'; end if;
end $$;

-- ===================================================================== B10. Permisos de las funciones
do $$
declare
  api text[] := array[
    'public.is_active_device()', 'public.claim_device(text, text)', 'public.log_rejected_claim(text, text)',
    'public.admin_release_device(uuid)', 'public.admin_device_claims(uuid)'];
  internal text[] := array[
    'public.assert_device_input(text, text)', 'public.device_limit_status(uuid)', 'public.forbid_device_claim_changes()'];
  f text;
begin
  foreach f in array api || internal loop
    if has_function_privilege('anon', f, 'execute') then raise exception 'FALLA B10. anon puede ejecutar %', f; end if;
    if has_function_privilege('service_role', f, 'execute') then raise exception 'FALLA B10. service_role puede ejecutar %', f; end if;
    -- Sin lista de permisos explícita rige el valor por defecto, que da ejecución a public
    if exists (
      select 1 from pg_proc p
      where p.oid = f::regprocedure
        and (p.proacl is null or exists (select 1 from aclexplode(p.proacl) a where a.grantee = 0))
    ) then
      raise exception 'FALLA B10. public puede ejecutar %', f; end if;
  end loop;
  foreach f in array api loop
    if not has_function_privilege('authenticated', f, 'execute') then raise exception 'FALLA B10. authenticated no puede ejecutar %', f; end if;
  end loop;
  foreach f in array internal loop
    if has_function_privilege('authenticated', f, 'execute') then raise exception 'FALLA B10. authenticated puede ejecutar la ayuda interna %', f; end if;
  end loop;
end $$;
begin;
set local role anon;
do $$ begin
  if not pg_temp.is_blocked($q$select public.claim_device('dev-anon', 'x')$q$) then raise exception 'FALLA B10. anon llamó claim_device'; end if;
  if not pg_temp.is_blocked($q$select public.log_rejected_claim('dev-anon', 'x')$q$) then raise exception 'FALLA B10. anon llamó log_rejected_claim'; end if;
  if not pg_temp.is_blocked($q$select public.is_active_device()$q$) then raise exception 'FALLA B10. anon llamó is_active_device'; end if;
  if not pg_temp.is_blocked($q$select public.admin_release_device('b0000000-0000-0000-0000-000000000001')$q$) then
    raise exception 'FALLA B10. anon llamó admin_release_device'; end if;
  if not pg_temp.is_blocked($q$select * from public.admin_device_claims('b0000000-0000-0000-0000-000000000001')$q$) then
    raise exception 'FALLA B10. anon llamó admin_device_claims'; end if;
  -- anon sigue leyendo la configuración pública para la portada y nada de los datos del alumno
  if (select count(*) from public.platform_settings) < 1 then raise exception 'FALLA B10. anon dejó de leer la configuración'; end if;
  if pg_temp.n('public.decks') <> 0 or pg_temp.n('public.events') <> 0 then raise exception 'FALLA B10. anon ve datos del alumno'; end if;
end $$;
rollback;
begin;
select pg_temp.as_user('b0000000-0000-0000-0000-000000000001', 'ses-1b');
do $$ begin
  if not pg_temp.is_blocked($q$select * from public.device_limit_status('b0000000-0000-0000-0000-000000000001')$q$) then
    raise exception 'FALLA B10. Un alumno llamó a la ayuda interna device_limit_status'; end if;
  if not pg_temp.is_blocked($q$select public.assert_device_input('x', 'y')$q$) then
    raise exception 'FALLA B10. Un alumno llamó a la ayuda interna assert_device_input'; end if;
end $$;
rollback;

-- ===================================================================== B11. Cobertura de las políticas
-- Toda política que dé acceso por auth.uid() o por grupo debe exigir is_active_device(), salvo estas, que
-- se dejan abiertas a propósito (ver el encabezado de la migración). Si alguien agrega una política nueva
-- y se le olvida la barrera, esta prueba falla y obliga a decidirlo
do $$
declare
  open_on_purpose text[] := array[
    'roles_select', 'privacy_own', 'payments_select', 'device_sessions_select',
    'assignments_select', 'decisions_insert', 'decisions_select', 'questions_select'];
  missing text;
  protected int;
begin
  select string_agg(policyname, ', ' order by policyname) into missing
  from pg_policies
  where schemaname = 'public'
    and coalesce(qual, '') || ' ' || coalesce(with_check, '') ~ '(auth\.uid\(\)|is_group_member|shares_group)'
    and coalesce(qual, '') || ' ' || coalesce(with_check, '') not like '%is_active_device%'
    and policyname <> all (open_on_purpose);
  if missing is not null then
    raise exception 'FALLA B11. Políticas sin la barrera y sin estar en la lista abierta a propósito: %', missing;
  end if;
  select count(*) into protected from pg_policies
    where schemaname = 'public'
      and coalesce(qual, '') || ' ' || coalesce(with_check, '') like '%is_active_device%';
  -- 22 de la barrera y 1 de la sincronización (sync_records_select, migración 20261008000002)
  if protected <> 23 then
    raise exception 'FALLA B11. Debían ser 23 políticas con la barrera y hay %', protected;
  end if;
end $$;

\echo 'TODAS LAS PRUEBAS DE LA BARRERA DEL DISPOSITIVO PASARON'
