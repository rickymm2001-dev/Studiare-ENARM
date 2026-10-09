-- Pruebas de pagos, plan Gratis y referidos (migración 20261008000003). Corre después de
-- sync_test.sql sobre la misma base, con usuarios propios. Cada bloque falla con un error si algo no
-- cumple.
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

create or replace function pg_temp.rows_changed(stmt text) returns bigint language plpgsql as $$
declare n bigint;
begin
  execute stmt;
  get diagnostics n = row_count;
  return n;
end $$;

-- Un aviso de pago con los datos mínimos. Lo manda la función de avisos con la llave de servicio
create or replace function pg_temp.notice(
  p_event text, p_kind text, p_user text, p_plan text, p_payment text, p_amount numeric default 150,
  p_provider text default 'stripe', p_period timestamptz default null
) returns text language sql as $$
  select public.apply_payment_notice(
    p_provider, p_event, jsonb_build_object('id', p_event), p_kind, p_user::uuid, p_plan,
    p_payment, 'sub_' || p_user, p_amount, p_period
  )
$$;

-- ===================================================================== Usuarios
-- A1 referente, A2 y A3 referidos, A4 alumno que paga, A5 a A7 alumnos Gratis y de cupo, ADM admin
insert into auth.users (id, email, raw_user_meta_data) values
  ('d0000000-0000-0000-0000-000000000001', 'a1@x.mx', '{"alias":"Uno"}'),
  ('d0000000-0000-0000-0000-000000000002', 'a2@x.mx', '{"alias":"Dos"}'),
  ('d0000000-0000-0000-0000-000000000003', 'a3@x.mx', '{"alias":"Tres"}'),
  ('d0000000-0000-0000-0000-000000000004', 'a4@x.mx', '{"alias":"Cuatro"}'),
  ('d0000000-0000-0000-0000-000000000005', 'a5@x.mx', '{"alias":"Cinco"}'),
  ('d0000000-0000-0000-0000-000000000006', 'a6@x.mx', '{"alias":"Seis"}'),
  ('d0000000-0000-0000-0000-000000000007', 'a7@x.mx', '{"alias":"Siete"}'),
  ('d0000000-0000-0000-0000-0000000000ad', 'adm2@x.mx', '{"alias":"Admin dos"}');
update public.user_roles set role = 'admin' where user_id = 'd0000000-0000-0000-0000-0000000000ad';

-- ===================================================================== Q1. Avisos de pago
select pg_temp.expect(public.study_day() = ((now() at time zone 'America/Merida') - interval '4 hours')::date, 'Q1. study_day');

-- Un alumno nuevo no tiene plan
begin;
select pg_temp.as_user('d0000000-0000-0000-0000-000000000004');
select pg_temp.expect(public.my_plan() ->> 'plan' = 'free', 'Q1. Un alumno nuevo debía ser free');
select pg_temp.expect(public.my_plan() ->> 'source' = 'none', 'Q1. Un alumno nuevo no tiene fuente de plan');
commit;

-- Pagar activa la suscripción
begin;
select pg_temp.expect(
  pg_temp.notice('evt-1', 'paid', 'd0000000-0000-0000-0000-000000000004', 'monthly', 'pay-1') = 'applied',
  'Q1. El primer aviso debía aplicarse'
);
select pg_temp.expect(
  (select plan = 'monthly' and status = 'active' and provider = 'stripe' from public.subscriptions where user_id = 'd0000000-0000-0000-0000-000000000004'),
  'Q1. La suscripción no quedó activa'
);
select pg_temp.expect((select count(*) from public.payments where user_id = 'd0000000-0000-0000-0000-000000000004') = 1, 'Q1. Debía haber un pago');
commit;
begin;
select pg_temp.as_user('d0000000-0000-0000-0000-000000000004');
select pg_temp.expect(public.my_plan() ->> 'plan' = 'monthly', 'Q1. my_plan debía decir monthly');
select pg_temp.expect(public.my_plan() ->> 'source' = 'payment', 'Q1. my_plan debía venir de un pago');
select pg_temp.expect((public.my_plan() ->> 'periodEnd') is not null, 'Q1. my_plan debía traer el fin del periodo');
commit;

-- El mismo aviso repetido no activa dos veces
begin;
select pg_temp.expect(
  pg_temp.notice('evt-1', 'paid', 'd0000000-0000-0000-0000-000000000004', 'monthly', 'pay-1') = 'duplicate',
  'Q1. Un aviso repetido debía reconocerse'
);
select pg_temp.expect((select count(*) from public.payments where user_id = 'd0000000-0000-0000-0000-000000000004') = 1, 'Q1. El aviso repetido duplicó el pago');
select pg_temp.expect((select count(*) from public.payment_webhook_events where event_id = 'evt-1') = 1, 'Q1. El aviso repetido duplicó el evento');
-- Otro aviso del mismo pago, como cuando el procesador manda dos eventos, no cuenta un pago más
select pg_temp.expect(
  pg_temp.notice('evt-1b', 'paid', 'd0000000-0000-0000-0000-000000000004', 'monthly', 'pay-1') = 'applied',
  'Q1. Otro evento del mismo pago debía aplicarse sin duplicar el pago'
);
select pg_temp.expect((select count(*) from public.payments where user_id = 'd0000000-0000-0000-0000-000000000004') = 1, 'Q1. El mismo pago se contó dos veces');
commit;

-- Avisos que no se pueden aplicar
begin;
select pg_temp.expect(pg_temp.notice('evt-u', 'paid', 'ffffffff-ffff-ffff-ffff-ffffffffffff', 'monthly', 'pay-u') = 'unknown_user', 'Q1. Un usuario inexistente debía ignorarse');
select pg_temp.expect(pg_temp.notice('evt-p', 'paid', 'd0000000-0000-0000-0000-000000000005', 'gratis', 'pay-p') = 'ignored', 'Q1. Un plan inválido debía ignorarse');
select pg_temp.expect(pg_temp.notice('evt-a', 'paid', 'd0000000-0000-0000-0000-000000000005', 'monthly', 'pay-a', 0) = 'ignored', 'Q1. Un monto en cero debía ignorarse');
select pg_temp.expect(pg_temp.notice('evt-n', 'paid', 'd0000000-0000-0000-0000-000000000005', 'monthly', '') = 'ignored', 'Q1. Sin id de pago debía ignorarse');
select pg_temp.expect(not exists (select 1 from public.subscriptions where user_id = 'd0000000-0000-0000-0000-000000000005'), 'Q1. Un aviso ignorado activó algo');
commit;
select pg_temp.expect(pg_temp.fails_with($q$select pg_temp.notice('evt-x', 'paid', 'd0000000-0000-0000-0000-000000000005', 'monthly', 'pay-x', 150, 'paypal')$q$) = '22023', 'Q1. Un procesador desconocido debía rechazarse');
select pg_temp.expect(pg_temp.fails_with($q$select pg_temp.notice('evt-y', 'regalo', 'd0000000-0000-0000-0000-000000000005', 'monthly', 'pay-y')$q$) = '22023', 'Q1. Un tipo de aviso desconocido debía rechazarse');
select pg_temp.expect(pg_temp.fails_with($q$select pg_temp.notice('', 'paid', 'd0000000-0000-0000-0000-000000000005', 'monthly', 'pay-z')$q$) = '22023', 'Q1. Sin id de evento debía rechazarse');

-- Un cobro fallido no quita el acceso del periodo ya pagado. Cancelar tampoco
begin;
select pg_temp.expect(pg_temp.notice('evt-f', 'failed', 'd0000000-0000-0000-0000-000000000004', null, null) = 'applied', 'Q1. El cobro fallido debía aplicarse');
select pg_temp.expect((select status from public.subscriptions where user_id = 'd0000000-0000-0000-0000-000000000004') = 'past_due', 'Q1. El cobro fallido debía dejar past_due');
select pg_temp.expect(public.user_plan('d0000000-0000-0000-0000-000000000004') = 'monthly', 'Q1. Con cobro fallido debía conservar el periodo pagado');
select pg_temp.expect(pg_temp.notice('evt-c', 'canceled', 'd0000000-0000-0000-0000-000000000004', null, null) = 'applied', 'Q1. La cancelación debía aplicarse');
select pg_temp.expect((select status from public.subscriptions where user_id = 'd0000000-0000-0000-0000-000000000004') = 'canceled', 'Q1. La cancelación debía dejar canceled');
select pg_temp.expect(public.user_plan('d0000000-0000-0000-0000-000000000004') = 'monthly', 'Q1. Cancelada debía conservar el periodo pagado');
-- Terminado el periodo, vuelve a free
update public.subscriptions set current_period_end = now() - interval '1 day' where user_id = 'd0000000-0000-0000-0000-000000000004';
select pg_temp.expect(public.user_plan('d0000000-0000-0000-0000-000000000004') = 'free', 'Q1. Terminado el periodo debía volver a free');
-- Pagar otra vez lo reactiva
select pg_temp.expect(pg_temp.notice('evt-2', 'paid', 'd0000000-0000-0000-0000-000000000004', 'annual', 'pay-2', 1200) = 'applied', 'Q1. Pagar otra vez debía aplicarse');
select pg_temp.expect(public.user_plan('d0000000-0000-0000-0000-000000000004') = 'annual', 'Q1. Pagar otra vez debía reactivar el plan');
-- Un reembolso quita el acceso en el acto
select pg_temp.expect(pg_temp.notice('evt-r', 'refunded', 'd0000000-0000-0000-0000-000000000004', null, 'pay-2') = 'applied', 'Q1. El reembolso debía aplicarse');
select pg_temp.expect((select status from public.payments where provider_payment_id = 'pay-2') = 'refunded', 'Q1. El pago reembolsado debía marcarse');
select pg_temp.expect(public.user_plan('d0000000-0000-0000-0000-000000000004') = 'free', 'Q1. Reembolsado debía volver a free');
commit;

-- ===================================================================== Q2. Cupo del plan Fundador
begin;
update public.platform_settings set value = '{"total":2}' where key = 'founder_seats';
select pg_temp.expect(pg_temp.notice('evt-fo1', 'paid', 'd0000000-0000-0000-0000-000000000005', 'founder', 'pay-fo1', 79) = 'applied', 'Q2. El primer Fundador debía aplicarse');
select pg_temp.expect(pg_temp.notice('evt-fo2', 'paid', 'd0000000-0000-0000-0000-000000000006', 'founder', 'pay-fo2', 79) = 'applied', 'Q2. El segundo Fundador debía aplicarse');
select pg_temp.expect(pg_temp.notice('evt-fo3', 'paid', 'd0000000-0000-0000-0000-000000000007', 'founder', 'pay-fo3', 79) = 'founder_full', 'Q2. El tercero debía quedar fuera del cupo');
select pg_temp.expect(not exists (select 1 from public.subscriptions where user_id = 'd0000000-0000-0000-0000-000000000007'), 'Q2. El tercero no debía activarse');
select pg_temp.expect((select status from public.payments where provider_payment_id = 'pay-fo3') = 'needs_refund', 'Q2. El cobro sin lugar debía quedar para devolver');
-- Un Fundador renueva sin gastar otro lugar
select pg_temp.expect(pg_temp.notice('evt-fo1r', 'paid', 'd0000000-0000-0000-0000-000000000005', 'founder', 'pay-fo1r', 79) = 'applied', 'Q2. Un Fundador debía poder renovar con el cupo lleno');
select pg_temp.expect((select count(*) from public.subscriptions where plan = 'founder') = 2, 'Q2. Debían seguir siendo 2 Fundadores');
-- El tercero sí puede tomar el plan mensual
select pg_temp.expect(pg_temp.notice('evt-fo3m', 'paid', 'd0000000-0000-0000-0000-000000000007', 'monthly', 'pay-fo3m') = 'applied', 'Q2. El tercero debía poder tomar el mensual');
update public.platform_settings set value = '{"total":100}' where key = 'founder_seats';
commit;

-- La función de avisos de pago corre con la llave de servicio
begin;
set local role service_role;
select pg_temp.expect(
  public.apply_payment_notice('mercadopago', 'evt-sr', '{}', 'paid', 'd0000000-0000-0000-0000-000000000005', 'monthly', 'pay-sr', null, 150, null) = 'applied',
  'Q1. service_role debía poder aplicar un aviso'
);
commit;
select pg_temp.expect((select provider from public.subscriptions where user_id = 'd0000000-0000-0000-0000-000000000005') in ('stripe', 'mercadopago'), 'Q1. El aviso de service_role no dejó proveedor');

-- ===================================================================== Q3. Quién puede qué
begin;
select pg_temp.as_user('d0000000-0000-0000-0000-000000000005');
select pg_temp.expect(
  pg_temp.is_blocked($q$select public.apply_payment_notice('stripe','x','{}','paid','d0000000-0000-0000-0000-000000000005','monthly','p',null,150,null)$q$),
  'Q3. Un alumno ejecutó apply_payment_notice'
);
select pg_temp.expect(pg_temp.is_blocked($q$select public.user_plan('d0000000-0000-0000-0000-000000000006')$q$), 'Q3. Un alumno ejecutó user_plan');
select pg_temp.expect(pg_temp.is_blocked($q$select public.complete_referral('d0000000-0000-0000-0000-000000000006')$q$), 'Q3. Un alumno ejecutó complete_referral');
select pg_temp.expect(pg_temp.is_blocked($q$insert into public.subscriptions (user_id, plan, status) values (auth.uid(), 'annual', 'active')$q$), 'Q3. Un alumno insertó su suscripción');
select pg_temp.expect(pg_temp.rows_changed($q$update public.subscriptions set plan = 'annual' where user_id = auth.uid()$q$) = 0, 'Q3. Un alumno editó su suscripción');
select pg_temp.expect(pg_temp.is_blocked($q$insert into public.subscription_grants (user_id, kind, starts_at, ends_at) values (auth.uid(), 'admin', now(), now() + interval '1 year')$q$), 'Q3. Un alumno se dio meses gratis');
select pg_temp.expect(pg_temp.is_blocked($q$insert into public.referrals (referrer_id, referred_id, code) values (auth.uid(), 'd0000000-0000-0000-0000-000000000006', 'XXXXXXXX')$q$), 'Q3. Un alumno insertó un referido');
select pg_temp.expect(pg_temp.is_blocked($q$insert into public.question_grants (user_id, question_id, day) values (auth.uid(), gen_random_uuid(), current_date)$q$), 'Q3. Un alumno insertó un permiso de pregunta');
select pg_temp.expect((select count(*) from public.subscriptions) = 1, 'Q3. Un alumno ve la suscripción de otros');
commit;
begin;
set local role anon;
select pg_temp.expect(pg_temp.is_blocked($q$select public.my_plan()$q$), 'Q3. anon ejecutó my_plan');
select pg_temp.expect(pg_temp.is_blocked($q$select public.grant_question_access(gen_random_uuid())$q$), 'Q3. anon ejecutó grant_question_access');
select pg_temp.expect(pg_temp.is_blocked($q$select public.my_referral_code()$q$), 'Q3. anon ejecutó my_referral_code');
select pg_temp.expect(pg_temp.is_blocked($q$select public.redeem_referral_code('XXXXXXXX')$q$), 'Q3. anon ejecutó redeem_referral_code');
select pg_temp.expect(pg_temp.is_blocked($q$select public.apply_payment_notice('stripe','x','{}','paid',null,null,null,null,null,null)$q$), 'Q3. anon ejecutó apply_payment_notice');
commit;

-- ===================================================================== Q4. Tope del plan Gratis
-- 25 preguntas aprobadas y una en borrador
insert into public.questions (id, question_id, version, branch, topic, body, editorial_status)
  select ('e0000000-0000-0000-0000-' || lpad(g::text, 12, '0'))::uuid, gen_random_uuid(), 1, 'pediatrics', 'neonatology', '{}', 'approved'
  from generate_series(1, 25) g;
insert into public.questions (id, question_id, version, branch, topic, body, editorial_status)
  values ('e0000000-0000-0000-0000-0000000000ff', gen_random_uuid(), 1, 'pediatrics', 'neonatology', '{}', 'draft');
insert into public.question_options (question_version_id, text, is_correct, rationale)
  select ('e0000000-0000-0000-0000-' || lpad(g::text, 12, '0'))::uuid, 'Opción', true, 'Porque sí'
  from generate_series(1, 25) g;

insert into auth.users (id, email, raw_user_meta_data) values
  ('d0000000-0000-0000-0000-000000000011', 'g1@x.mx', '{"alias":"Gratis"}'),
  ('d0000000-0000-0000-0000-000000000012', 'g2@x.mx', '{"alias":"Gratis dos"}');

begin;
select pg_temp.as_user('d0000000-0000-0000-0000-000000000011', 'ses-g1');
select pg_temp.expect(public.free_daily_questions() = 20, 'Q4. El tope diario debía ser 20');
-- Sin abrir nada no ve ninguna pregunta, aunque estén aprobadas
select pg_temp.expect((select count(*) from public.questions) = 0, 'Q4. Un alumno Gratis veía preguntas sin abrirlas');
select pg_temp.expect((select count(*) from public.question_options) = 0, 'Q4. Un alumno Gratis veía opciones sin abrir la pregunta');
select pg_temp.expect(public.grant_question_access('e0000000-0000-0000-0000-000000000001'), 'Q4. Abrir la primera debía permitirse');
select pg_temp.expect((select count(*) from public.questions) = 1, 'Q4. Debía ver solo la que abrió');
select pg_temp.expect((select count(*) from public.question_options) = 1, 'Q4. Debía ver solo las opciones de la que abrió');
select pg_temp.expect((select count(*) from public.questions where id = 'e0000000-0000-0000-0000-000000000002') = 0, 'Q4. Una pregunta sin abrir se podía leer por su id');
-- Volver a abrir la misma no gasta cupo
select pg_temp.expect(public.grant_question_access('e0000000-0000-0000-0000-000000000001'), 'Q4. Volver a abrir la misma debía permitirse');
commit;
select pg_temp.expect((select count(*) from public.question_grants where user_id = 'd0000000-0000-0000-0000-000000000011') = 1, 'Q4. Volver a abrir la misma gastó cupo');
begin;
select pg_temp.as_user('d0000000-0000-0000-0000-000000000011', 'ses-g1');
do $$ begin
  for i in 2..20 loop
    perform public.grant_question_access(('e0000000-0000-0000-0000-' || lpad(i::text, 12, '0'))::uuid);
  end loop;
end $$;
select pg_temp.expect((select count(*) from public.questions) = 20, 'Q4. Debía ver las 20 que abrió');
-- La 21 se rechaza con FR001 y no se puede leer
select pg_temp.expect(
  pg_temp.fails_with($q$select public.grant_question_access('e0000000-0000-0000-0000-000000000021')$q$) = 'FR001',
  'Q4. La pregunta 21 debía rechazarse con FR001'
);
commit;
begin;
select pg_temp.as_user('d0000000-0000-0000-0000-000000000011', 'ses-g1');
select pg_temp.expect((select count(*) from public.questions) = 20, 'Q4. La pregunta rechazada se podía leer');
select pg_temp.expect((select count(*) from public.questions where id = 'e0000000-0000-0000-0000-000000000021') = 0, 'Q4. La pregunta 21 se leyó por su id');
-- Una en borrador nunca se abre
select pg_temp.expect(not public.grant_question_access('e0000000-0000-0000-0000-0000000000ff'), 'Q4. Una pregunta en borrador no debía abrirse');
-- Otra persona Gratis no ve lo que abrió esta
commit;
begin;
select pg_temp.as_user('d0000000-0000-0000-0000-000000000012');
select pg_temp.expect((select count(*) from public.questions) = 0, 'Q4. Otra persona veía lo que abrió esta');
commit;
-- Al día siguiente el cupo se renueva
update public.question_grants set day = day - 1;
begin;
select pg_temp.as_user('d0000000-0000-0000-0000-000000000011', 'ses-g1');
select pg_temp.expect((select count(*) from public.questions) = 0, 'Q4. Al día siguiente lo abierto ayer no debía verse');
select pg_temp.expect(public.grant_question_access('e0000000-0000-0000-0000-000000000021'), 'Q4. Al día siguiente el cupo debía renovarse');
commit;

-- Un plan de pago no tiene tope
begin;
select pg_temp.as_user('d0000000-0000-0000-0000-000000000007');
do $$ begin
  for i in 1..25 loop
    perform public.grant_question_access(('e0000000-0000-0000-0000-' || lpad(i::text, 12, '0'))::uuid);
  end loop;
end $$;
select pg_temp.expect((select count(*) from public.questions where id::text like 'e0000000-%') = 25, 'Q4. Un plan de pago debía ver las 25 aprobadas');
commit;
select pg_temp.expect((select count(*) from public.question_grants where user_id = 'd0000000-0000-0000-0000-000000000007') = 0, 'Q4. Un plan de pago no debía gastar cupo');

-- Un administrador ve todo, también el borrador
begin;
select pg_temp.as_user('d0000000-0000-0000-0000-0000000000ad');
select pg_temp.expect((select count(*) from public.questions where id::text like 'e0000000-%') = 26, 'Q4. Un administrador debía ver las 26');
commit;

-- Un dispositivo desplazado no abre preguntas aunque conserve su token
begin;
select pg_temp.as_user('d0000000-0000-0000-0000-000000000012', 'ses-a');
select public.claim_device('dev-a', 'Chrome');
commit;
begin;
select pg_temp.as_user('d0000000-0000-0000-0000-000000000012', 'ses-b');
select public.claim_device('dev-b', 'Safari');
commit;
begin;
select pg_temp.as_user('d0000000-0000-0000-0000-000000000012', 'ses-a');
select pg_temp.expect(pg_temp.fails_with($q$select public.grant_question_access('e0000000-0000-0000-0000-000000000003')$q$) = '42501', 'Q4. El dispositivo desplazado abrió una pregunta');
select pg_temp.expect(pg_temp.fails_with($q$select public.my_plan()$q$) = '42501', 'Q4. El dispositivo desplazado leyó su plan');
select pg_temp.expect(pg_temp.fails_with($q$select public.my_referral_code()$q$) = '42501', 'Q4. El dispositivo desplazado pidió su código');
commit;

-- ===================================================================== Q5. Referidos
begin;
select pg_temp.as_user('d0000000-0000-0000-0000-000000000001');
select pg_temp.expect(public.my_referral_code() ~ '^[A-Z0-9]{8}$', 'Q5. El código debía tener 8 caracteres');
select pg_temp.expect(public.my_referral_code() = public.my_referral_code(), 'Q5. El código debía ser estable');
select pg_temp.expect((public.my_referrals() ->> 'completed')::int = 0 and (public.my_referrals() ->> 'pending')::int = 0, 'Q5. Sin referidos todo en cero');
select pg_temp.expect(public.redeem_referral_code(public.my_referral_code()) = 'own', 'Q5. Canjear el propio código debía rechazarse');
select pg_temp.expect((select count(*) from public.referral_codes) = 1, 'Q5. A1 debía ver su código');
commit;
select pg_temp.expect((select count(*) from public.referral_codes) = 1, 'Q5. Debía haber un solo código');

begin;
select pg_temp.as_user('d0000000-0000-0000-0000-000000000002');
select pg_temp.expect(public.redeem_referral_code('NOEXISTE') = 'invalid', 'Q5. Un código inexistente debía ser inválido');
select pg_temp.expect(public.redeem_referral_code(null) = 'invalid', 'Q5. Un código nulo debía ser inválido');
select pg_temp.expect(public.redeem_referral_code((select code from public.referral_codes limit 1)) = 'invalid', 'Q5. Un alumno no ve códigos ajenos');
commit;

-- A2 canjea el código de A1. Se toma el código con privilegios de prueba
create temp table a1_code as select code from public.referral_codes where user_id = 'd0000000-0000-0000-0000-000000000001';
grant select on a1_code to authenticated;
begin;
select pg_temp.as_user('d0000000-0000-0000-0000-000000000002');
select pg_temp.expect(public.redeem_referral_code((select lower(code) from a1_code)) = 'ok', 'Q5. Canjear el código de A1 debía funcionar sin importar mayúsculas');
select pg_temp.expect(public.redeem_referral_code((select code from a1_code)) = 'already', 'Q5. Canjear dos veces debía rechazarse');
select pg_temp.expect((public.my_referrals() ->> 'referredBy')::boolean, 'Q5. El referido debía saber que lo invitaron');
commit;

-- Mientras no pague, el referido está pendiente y A1 no tiene meses
begin;
select pg_temp.as_user('d0000000-0000-0000-0000-000000000001');
select pg_temp.expect((public.my_referrals() ->> 'pending')::int = 1 and (public.my_referrals() ->> 'completed')::int = 0, 'Q5. El referido debía estar pendiente');
select pg_temp.expect(public.my_plan() ->> 'plan' = 'free', 'Q5. Sin pago del referido A1 seguía en free');
select pg_temp.expect((select count(*) from public.referrals) = 1, 'Q5. A1 debía ver su referido');
commit;
begin;
select pg_temp.as_user('d0000000-0000-0000-0000-000000000003');
select pg_temp.expect((select count(*) from public.referrals) = 0, 'Q5. Un tercero veía referidos ajenos');
select pg_temp.expect((select count(*) from public.referral_codes) = 0, 'Q5. Un tercero veía códigos ajenos');
commit;

-- El primer pago verificado del referido da un mes gratis al referente
begin;
select pg_temp.expect(pg_temp.notice('evt-ref1', 'paid', 'd0000000-0000-0000-0000-000000000002', 'monthly', 'pay-ref1') = 'applied', 'Q5. El pago del referido debía aplicarse');
select pg_temp.expect((select status from public.referrals where referred_id = 'd0000000-0000-0000-0000-000000000002') = 'completed', 'Q5. El referido debía concretarse');
select pg_temp.expect((select count(*) from public.subscription_grants where user_id = 'd0000000-0000-0000-0000-000000000001') = 1, 'Q5. A1 debía recibir un mes');
select pg_temp.expect(
  (select ends_at - starts_at = interval '30 days' from public.subscription_grants where user_id = 'd0000000-0000-0000-0000-000000000001'),
  'Q5. El mes gratis debía durar 30 días'
);
-- Un segundo pago del mismo referido no da otro mes
select pg_temp.expect(pg_temp.notice('evt-ref2', 'paid', 'd0000000-0000-0000-0000-000000000002', 'monthly', 'pay-ref2') = 'applied', 'Q5. El segundo pago debía aplicarse');
select pg_temp.expect((select count(*) from public.subscription_grants where user_id = 'd0000000-0000-0000-0000-000000000001') = 1, 'Q5. Un segundo pago dio otro mes gratis');
-- El mismo aviso repetido tampoco
select pg_temp.expect(pg_temp.notice('evt-ref1', 'paid', 'd0000000-0000-0000-0000-000000000002', 'monthly', 'pay-ref1') = 'duplicate', 'Q5. El aviso repetido debía reconocerse');
select pg_temp.expect((select count(*) from public.subscription_grants where user_id = 'd0000000-0000-0000-0000-000000000001') = 1, 'Q5. El aviso repetido dio otro mes gratis');
commit;
begin;
select pg_temp.as_user('d0000000-0000-0000-0000-000000000001');
select pg_temp.expect(public.my_plan() ->> 'plan' = 'monthly' and public.my_plan() ->> 'source' = 'referral', 'Q5. A1 debía tener el mensual por referido');
select pg_temp.expect((public.my_referrals() ->> 'completed')::int = 1 and (public.my_referrals() ->> 'monthsEarned')::int = 1, 'Q5. A1 debía ver su mes ganado');
commit;

-- Los meses se encadenan
begin;
select pg_temp.as_user('d0000000-0000-0000-0000-000000000003');
select pg_temp.expect(public.redeem_referral_code((select code from a1_code)) = 'ok', 'Q5. A3 debía poder canjear el código de A1');
commit;
begin;
select pg_temp.expect(pg_temp.notice('evt-ref3', 'paid', 'd0000000-0000-0000-0000-000000000003', 'annual', 'pay-ref3', 1200) = 'applied', 'Q5. El pago de A3 debía aplicarse');
select pg_temp.expect((select count(*) from public.subscription_grants where user_id = 'd0000000-0000-0000-0000-000000000001') = 2, 'Q5. A1 debía tener 2 meses');
select pg_temp.expect(
  (select max(starts_at) from public.subscription_grants where user_id = 'd0000000-0000-0000-0000-000000000001')
  = (select min(ends_at) from public.subscription_grants where user_id = 'd0000000-0000-0000-0000-000000000001'),
  'Q5. El segundo mes debía empezar cuando termina el primero'
);
commit;

-- Quien ya pagó no puede entrar como referido, y hay ventana para canjear
begin;
select pg_temp.as_user('d0000000-0000-0000-0000-000000000004');
select pg_temp.expect(public.redeem_referral_code((select code from a1_code)) = 'already_paid', 'Q5. Quien ya pagó no debía poder canjear');
commit;
begin;
select pg_temp.as_user('d0000000-0000-0000-0000-000000000011');
select pg_temp.expect(public.redeem_referral_code((select code from a1_code)) = 'ok', 'Q5. Una cuenta nueva debía poder canjear');
commit;
insert into auth.users (id, email, raw_user_meta_data, created_at) values
  ('d0000000-0000-0000-0000-000000000013', 'old@x.mx', '{"alias":"Vieja"}', now() - interval '30 days');
begin;
select pg_temp.as_user('d0000000-0000-0000-0000-000000000013');
select pg_temp.expect(public.redeem_referral_code((select code from a1_code)) = 'too_late', 'Q5. Pasada la ventana debía rechazarse');
commit;

-- Tope de meses por referente
begin;
update public.platform_settings set value = '{"rewardDays":30,"maxRewards":2,"redeemWindowDays":14}' where key = 'referral_rules';
select pg_temp.expect(pg_temp.notice('evt-ref4', 'paid', 'd0000000-0000-0000-0000-000000000011', 'monthly', 'pay-ref4') = 'applied', 'Q5. El pago de g1 debía aplicarse');
select pg_temp.expect((select status from public.referrals where referred_id = 'd0000000-0000-0000-0000-000000000011') = 'completed', 'Q5. El referido sobre el tope debía concretarse');
select pg_temp.expect((select count(*) from public.subscription_grants where user_id = 'd0000000-0000-0000-0000-000000000001') = 2, 'Q5. Pasado el tope no debía dar otro mes');
update public.platform_settings set value = '{"rewardDays":30,"maxRewards":12,"redeemWindowDays":14}' where key = 'referral_rules';
commit;

-- Los meses regalados abren el plan mensual, también el tope de preguntas
begin;
select pg_temp.as_user('d0000000-0000-0000-0000-000000000001');
do $$ begin
  for i in 1..25 loop
    perform public.grant_question_access(('e0000000-0000-0000-0000-' || lpad(i::text, 12, '0'))::uuid);
  end loop;
end $$;
select pg_temp.expect((select count(*) from public.questions where id::text like 'e0000000-%') = 25, 'Q5. Un mes regalado debía abrir el banco sin tope');
commit;

\echo 'TODAS LAS PRUEBAS DE PAGOS, PLAN GRATIS Y REFERIDOS PASARON'
