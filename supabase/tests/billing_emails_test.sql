-- Pruebas de la cola de correos de pagos (migración 20261022000001, B10 del plan del cambio, 4 del
-- diseño). Corre después de las demás sobre la misma base, con usuarios propios. Cada bloque falla con un
-- error si algo no cumple.
--   E1 tipos de correo extensibles, E2 fin de la prueba, E3 pase por vencer, E4 la cola de B15,
--   E5 lo que puede guardar la cola y E6 permisos
-- Con B15 (20261029000001_email_reminders.sql) el envío lo manda email_delivery y no billing_emails, y
-- claim_email_batch salta los tipos en pausa y marca stale lo que ya no tiene sentido mandar. Aquí se prueba
-- que la cola de B10 sigue igual con el interruptor nuevo. reminders_test.sql prueba lo de B15 a fondo
\set ON_ERROR_STOP on

-- ===================================================================== Ayudas de prueba
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

-- ===================================================================== Usuarios
\set e1 'ba200000-0000-0000-0000-000000000001'
\set e2 'ba200000-0000-0000-0000-000000000002'
\set e3 'ba200000-0000-0000-0000-000000000003'
\set e4 'ba200000-0000-0000-0000-000000000004'
\set e5 'ba200000-0000-0000-0000-000000000005'
\set e6 'ba200000-0000-0000-0000-000000000006'
insert into auth.users (id, email, raw_user_meta_data) values
  (:'e1', 'e1@ba.mx', '{"alias":"Prueba que termina"}'),
  (:'e2', 'e2@ba.mx', '{"alias":"Prueba cancelada"}'),
  (:'e3', 'e3@ba.mx', '{"alias":"Pase por vencer"}'),
  (:'e4', 'e4@ba.mx', '{"alias":"Pase lejano"}'),
  (:'e5', 'e5@ba.mx', '{"alias":"Pase con suscripción"}'),
  (:'e6', 'e6@ba.mx', '{"alias":"Cola"}');

-- ===================================================================== E1. Tipos de correo extensibles
select pg_temp.expect(
  (select array_agg(kind order by kind) from public.email_kinds)
    = array['content_report', 'daily_review_reminder', 'distractor_flags', 'invoice_requested', 'pass_expiring', 'trial_ending'],
  'E1. Faltan los tipos sembrados, los de B10 más content_report de B11, daily_review_reminder de B15 y distractor_flags de B14'
);
select pg_temp.is(
  pg_temp.fails_with($q$select public.enqueue_email('ba200000-0000-0000-0000-000000000006', null, 'promocion', 'e1-x', '{}')$q$),
  '22023', 'E1. Un tipo que no existe debía rechazarse');
select pg_temp.is(
  pg_temp.fails_with($q$insert into public.email_outbox (recipient_user, kind, dedupe_key) values ('ba200000-0000-0000-0000-000000000006', 'promocion', 'e1-y')$q$),
  '23503', 'E1. La cola debía rechazar un tipo sin su fila en email_kinds');
-- Un tipo nuevo es solo un insert, sin drop
begin;
insert into public.email_kinds (kind, description) values ('tipo_de_prueba', 'Tipo agregado por la prueba');
select pg_temp.expect(
  public.enqueue_email(:'e6', null, 'tipo_de_prueba', 'e1-nuevo', '{"n":1}'),
  'E1. Un tipo agregado con un insert debía poder encolarse'
);
rollback;
select pg_temp.is(
  pg_temp.fails_with($q$insert into public.email_kinds (kind, description) values ('Con Mayúsculas', 'x')$q$),
  '23514', 'E1. Una clave de tipo con mayúsculas o espacios debía rechazarse');

-- ===================================================================== E2. Fin de la prueba
-- Una prueba viva y sin cancelar encola trial_ending una sola vez
select public.apply_subscription_state('stripe', 'evt-e2-1', now(), '{}', :'e1', 'sub_e2_1', 'founder', 'trialing',
  now() + interval '3 days', now() + interval '3 days', false, false, 'price_fundador', 'PRUEBA10');
select pg_temp.is(public.note_trial_will_end('stripe', 'evt-e2-t1', '{}', :'e1', 'sub_e2_1', now() + interval '3 days'),
  'queued', 'E2. El aviso de fin de prueba debía encolar el correo');
select pg_temp.is(public.note_trial_will_end('stripe', 'evt-e2-t1', '{}', :'e1', 'sub_e2_1', now() + interval '3 days'),
  'duplicate', 'E2. El mismo aviso repetido debía reconocerse');
select pg_temp.is(public.note_trial_will_end('stripe', 'evt-e2-t2', '{}', :'e1', 'sub_e2_1', now() + interval '3 days'),
  'queued', 'E2. Otro aviso de la misma prueba debía responder queued');
select pg_temp.expect(
  (select count(*) from public.email_outbox where recipient_user = :'e1' and kind = 'trial_ending') = 1
  and (select dedupe_key like 'trial_ending:sub_e2_1:%' and status = 'queued' and recipient_role is null
         and data ?& array['trialEnd', 'plan', 'amountMxn'] and data ->> 'plan' = 'founder'
         and (data ->> 'amountMxn')::numeric = 79 and data ->> 'promotionCode' = 'PRUEBA10'
       from public.email_outbox where recipient_user = :'e1' and kind = 'trial_ending'),
  'E2. trial_ending debía quedar una vez con su fecha, su plan y su monto'
);
-- Una prueba cancelada no recibe el correo
select public.apply_subscription_state('stripe', 'evt-e2-2', now(), '{}', :'e2', 'sub_e2_2', 'monthly', 'trialing',
  now() + interval '3 days', now() + interval '3 days', true, false, null, null);
select pg_temp.is(public.note_trial_will_end('stripe', 'evt-e2-t3', '{}', :'e2', 'sub_e2_2', now() + interval '3 days'),
  'skipped', 'E2. Una prueba cancelada debía saltarse');
select pg_temp.is(public.note_trial_will_end('stripe', 'evt-e2-t4', '{}', :'e1', 'sub_otra', now() + interval '3 days'),
  'skipped', 'E2. Otra suscripción debía saltarse');
select pg_temp.is(public.note_trial_will_end('stripe', 'evt-e2-t5', '{}', 'ffffffff-ffff-ffff-ffff-fffffffffff2', 'sub_x', null),
  'unknown_user', 'E2. Un alumno desconocido debía reconocerse');
select pg_temp.is((select count(*) from public.email_outbox where recipient_user = :'e2')::text, '0',
  'E2. La prueba cancelada no debía recibir correo');

-- ===================================================================== E3. Pase por vencer
insert into public.plan_passes (user_id, plan, provider, provider_payment_id, method, starts_at, ends_at) values
  (:'e3', 'monthly', 'stripe', 'pi_e3', 'oxxo', now() - interval '28 days', now() + interval '2 days'),
  (:'e4', 'annual', 'stripe', 'pi_e4', 'spei', now() - interval '10 days', now() + interval '355 days'),
  (:'e5', 'monthly', 'stripe', 'pi_e5', 'oxxo', now() - interval '29 days', now() + interval '1 day');
-- Con una suscripción vigente el pase no es lo que lo deja estudiar
select public.apply_subscription_state('stripe', 'evt-e3-5', now(), '{}', :'e5', 'sub_e3_5', 'annual', 'active',
  now() + interval '300 days', null, false, false, null, null);
select pg_temp.is(public.enqueue_pass_expiry_reminders()::text, '1', 'E3. Debía encolar un aviso de pase por vencer');
select pg_temp.expect(
  (select dedupe_key = 'pass_expiring:' || :'e3' || ':' || to_char((now() + interval '2 days') at time zone 'America/Mexico_City', 'YYYY-MM-DD')
     and data ->> 'plan' = 'monthly' and (data ->> 'passEnd') is not null
   from public.email_outbox where recipient_user = :'e3' and kind = 'pass_expiring')
  and not exists (select 1 from public.email_outbox where recipient_user in (:'e4', :'e5')),
  'E3. pass_expiring debía ir solo al pase que vence pronto y sin suscripción'
);
select pg_temp.is(public.enqueue_pass_expiry_reminders()::text, '0', 'E3. Una segunda vez no debía repetir el aviso');
-- Paga otro periodo. Al acercarse el nuevo fin avisa otra vez
update public.plan_passes set ends_at = now() + interval '33 days' where provider_payment_id = 'pi_e3';
select pg_temp.is(public.enqueue_pass_expiry_reminders()::text, '0', 'E3. Un pase que todavía no vence no debía avisar');
update public.plan_passes set ends_at = now() + interval '3 days' where provider_payment_id = 'pi_e3';
select pg_temp.is(public.enqueue_pass_expiry_reminders()::text, '1', 'E3. El nuevo fin debía avisar otra vez');
select pg_temp.is((select count(*) from public.email_outbox where recipient_user = :'e3')::text, '2',
  'E3. Debía haber un aviso por cada fecha de fin');

-- ===================================================================== E4. La cola de B15
-- Con email_delivery apagado nada sale
select pg_temp.is((select count(*) from public.claim_email_batch(100))::text, '0', 'E4. Con los correos apagados no debía entregar nada');
select pg_temp.expect(public.enqueue_email(null, 'team', 'invoice_requested', 'e4-equipo', '{"amountMxn":149}'),
  'E4. Debía encolar un correo al equipo');
select pg_temp.expect(not public.enqueue_email(null, 'team', 'invoice_requested', 'e4-equipo', '{"amountMxn":149}'),
  'E4. La misma clave no debía encolar otro');
select pg_temp.expect(not public.enqueue_email('ffffffff-ffff-ffff-ffff-fffffffffff3', null, 'trial_ending', 'e4-nadie', '{}'),
  'E4. Un alumno que no existe no debía encolar nada');
-- El interruptor de B10 ya no abre nada: manda email_delivery
update public.platform_settings set value = '{"enabled":true}' where key = 'billing_emails';
select pg_temp.is((select count(*) from public.claim_email_batch(100))::text, '0', 'E4. billing_emails todavía abría el envío');
update public.platform_settings set value = '{"enabled":true,"paused":[]}' where key = 'email_delivery';
create temp table e4_batch as select * from public.claim_email_batch(100);
select pg_temp.expect(
  (select count(*) from e4_batch) = (select count(*) from public.email_outbox where status = 'queued')
  and (select bool_and(attempts = 1 and send_after > now() + interval '9 minutes') from e4_batch)
  and (select count(*) from e4_batch where dedupe_key = 'e4-equipo') = 1,
  'E4. La cola debía entregar los correos listos y apartarlos'
);
select pg_temp.is((select count(*) from public.claim_email_batch(100))::text, '0', 'E4. Un correo apartado no debía entregarse dos veces');
select public.finish_email((select id from e4_batch where dedupe_key = 'e4-equipo'), 'sent');
select public.finish_email((select id from e4_batch where recipient_user = :'e1'), 'failed', 'Resend respondió 500');
select pg_temp.expect(
  (select status = 'sent' and sent_at is not null and last_error is null from public.email_outbox where dedupe_key = 'e4-equipo')
  and (select status = 'failed' and last_error = 'Resend respondió 500' and send_after > now()
       from public.email_outbox where recipient_user = :'e1'),
  'E4. Los correos no se cerraron'
);
-- Un correo mandado no cambia y uno fallido vuelve a intentarse hasta 5 veces
select public.finish_email((select id from e4_batch where dedupe_key = 'e4-equipo'), 'failed', 'tarde');
select pg_temp.is((select status from public.email_outbox where dedupe_key = 'e4-equipo'), 'sent', 'E4. Un correo mandado cambió');
update public.email_outbox set send_after = now() - interval '1 minute' where recipient_user = :'e1';
select pg_temp.is((select attempts from public.claim_email_batch(100) where recipient_user = :'e1')::text, '2',
  'E4. Un correo fallido debía reintentarse');
update public.email_outbox set attempts = 5, status = 'failed', send_after = now() - interval '1 minute' where recipient_user = :'e1';
select pg_temp.is((select count(*) from public.claim_email_batch(100) where recipient_user = :'e1')::text, '0',
  'E4. Después de 5 intentos no debía volver a entregarse');
select pg_temp.is(pg_temp.fails_with($q$select public.finish_email(gen_random_uuid(), 'perdido')$q$), '22023',
  'E4. Un estado de correo desconocido debía rechazarse');
-- Un tipo en pausa no sale, y un correo vencido se marca stale en lugar de mandarse
insert into public.email_outbox (recipient_user, kind, dedupe_key, data) values
  (:'e6', 'pass_expiring', 'e4-pase-vencido', jsonb_build_object('passEnd', now() - interval '1 hour', 'plan', 'monthly')),
  (:'e6', 'trial_ending', 'e4-prueba-pausada', jsonb_build_object('trialEnd', now() + interval '1 day', 'plan', 'monthly'));
update public.platform_settings set value = '{"enabled":true,"paused":["trial_ending"]}' where key = 'email_delivery';
select pg_temp.is((select count(*) from public.claim_email_batch(100) where dedupe_key like 'e4-%')::text, '0',
  'E4. Un tipo en pausa o un pase vencido no debían entregarse');
select pg_temp.expect(
  (select status = 'skipped' and last_error = 'stale' from public.email_outbox where dedupe_key = 'e4-pase-vencido')
  and (select status = 'queued' and attempts = 0 from public.email_outbox where dedupe_key = 'e4-prueba-pausada'),
  'E4. El pase vencido debía quedar stale y el tipo en pausa seguir en la cola'
);
update public.platform_settings set value = '{"enabled":false,"paused":[]}' where key = 'email_delivery';
update public.platform_settings set value = '{"enabled":false}' where key = 'billing_emails';

-- ===================================================================== E5. Lo que puede guardar la cola
select pg_temp.is(
  pg_temp.fails_with($q$select public.enqueue_email('ba200000-0000-0000-0000-000000000006', null, 'trial_ending', 'e5-correo', '{"to":"alguien@ba.mx"}')$q$),
  '23514', 'E5. La cola no debía guardar un correo electrónico en sus datos');
select pg_temp.is(
  pg_temp.fails_with($q$select public.enqueue_email('ba200000-0000-0000-0000-000000000006', 'team', 'trial_ending', 'e5-dos', '{}')$q$),
  '22023', 'E5. Un correo no puede ir a un alumno y al equipo a la vez');
select pg_temp.is(
  pg_temp.fails_with($q$select public.enqueue_email(null, null, 'trial_ending', 'e5-nadie', '{}')$q$),
  '22023', 'E5. Un correo necesita a quién va');
select pg_temp.is(
  pg_temp.fails_with($q$select public.enqueue_email(null, 'team', 'invoice_requested', '  ', '{}')$q$),
  '22023', 'E5. Un correo necesita su clave');
-- Al borrar la cuenta se van sus correos pendientes
select public.enqueue_email(:'e6', null, 'pass_expiring', 'e5-borrar', '{}');
delete from auth.users where id = :'e6';
select pg_temp.is((select count(*) from public.email_outbox where dedupe_key = 'e5-borrar')::text, '0',
  'E5. Los correos de una cuenta borrada debían irse con ella');

-- ===================================================================== E6. Permisos
do $$
declare
  v_fn text;
begin
  foreach v_fn in array array[
    'public.enqueue_email(uuid, text, text, text, jsonb, timestamptz)',
    'public.enqueue_pass_expiry_reminders()',
    'public.claim_email_batch(integer)',
    'public.finish_email(uuid, text, text)'] loop
    if has_function_privilege('authenticated', v_fn, 'execute') or has_function_privilege('anon', v_fn, 'execute')
       or not has_function_privilege('service_role', v_fn, 'execute') then
      raise exception 'FALLA E6. % debe ser solo del servidor', v_fn;
    end if;
  end loop;
  if has_function_privilege('authenticated', 'public.billing_rule(text, integer)', 'execute')
     or has_function_privilege('service_role', 'public.billing_rule(text, integer)', 'execute') then
    raise exception 'FALLA E6. billing_rule es interna';
  end if;
end $$;
begin;
select pg_temp.as_user(:'e1');
select pg_temp.expect(
  pg_temp.is_blocked('select * from public.email_outbox')
  and pg_temp.is_blocked('select * from public.email_kinds')
  and pg_temp.is_blocked($q$insert into public.email_kinds (kind, description) values ('pirata', 'x')$q$)
  and pg_temp.is_blocked($q$select public.enqueue_email(auth.uid(), null, 'trial_ending', 'pirata', '{}')$q$)
  and pg_temp.is_blocked('select * from public.claim_email_batch(1)'),
  'E6. Un alumno tocó la cola de correos'
);
rollback;
begin;
set local role anon;
select pg_temp.expect(
  pg_temp.is_blocked('select * from public.email_outbox') and pg_temp.is_blocked('select * from public.email_kinds'),
  'E6. anon leyó la cola de correos'
);
rollback;

select 'TODAS LAS PRUEBAS DE LA COLA DE CORREOS PASARON' as resultado;
