-- Referidos con el primer cobro (migración 20261019000001, bloque B7 del plan del cambio, respuesta
-- 77 y 4.3). El mes gratis llega con el primer cobro verificado del referido, nunca con la factura de
-- 0 pesos de una prueba gratis, y una sola vez por referido aunque el aviso se repita. Corre después de
-- payments_test.sql sobre la misma base, con usuarios propios. Cada bloque falla con un error si algo
-- no cumple.
\set ON_ERROR_STOP on

-- ===================================================================== Ayudas de prueba
create or replace function pg_temp.as_user(uid text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', uid, 'role', 'authenticated')::text,
    true
  );
  execute 'set local role authenticated';
end $$;

create or replace function pg_temp.expect(ok boolean, msg text) returns void language plpgsql as $$
begin
  if not coalesce(ok, false) then raise exception 'FALLA %', msg; end if;
end $$;

-- Un aviso de pago como lo manda la función de avisos con la llave de servicio
create or replace function pg_temp.notice(
  p_event text, p_user text, p_payment text, p_amount numeric, p_plan text default 'monthly'
) returns text language sql as $$
  select public.apply_payment_notice(
    'stripe', p_event, jsonb_build_object('id', p_event), 'paid', p_user::uuid, p_plan,
    p_payment, 'sub_' || p_user, p_amount, null
  )
$$;

create or replace function pg_temp.grants_of(p_user text) returns bigint language sql as $$
  select count(*) from public.subscription_grants where user_id = p_user::uuid and kind = 'referral'
$$;

create or replace function pg_temp.referral_of(p_user text) returns text language sql as $$
  select status from public.referrals where referred_id = p_user::uuid
$$;

-- ===================================================================== Usuarios
-- R1 refiere. P1 entra con prueba gratis, P2 con una fila de 0 pesos como la podría guardar B10, P3
-- ya tuvo un cobro antes de canjear
insert into auth.users (id, email, raw_user_meta_data) values
  ('f7000000-0000-0000-0000-000000000001', 'r1@b7.mx', '{"alias":"Refiere"}'),
  ('f7000000-0000-0000-0000-000000000002', 'p1@b7.mx', '{"alias":"Prueba"}'),
  ('f7000000-0000-0000-0000-000000000003', 'p2@b7.mx', '{"alias":"Cero"}'),
  ('f7000000-0000-0000-0000-000000000004', 'p3@b7.mx', '{"alias":"Pagado"}');

begin;
select pg_temp.as_user('f7000000-0000-0000-0000-000000000001');
select pg_temp.expect(public.my_referral_code() ~ '^[A-Z0-9]{8}$', 'R0. R1 debía tener su código');
commit;
create temp table r1_code as
  select code from public.referral_codes where user_id = 'f7000000-0000-0000-0000-000000000001';
grant select on r1_code to authenticated;

-- ===================================================================== R1. Prueba gratis y primer cobro
begin;
select pg_temp.as_user('f7000000-0000-0000-0000-000000000002');
select pg_temp.expect(public.redeem_referral_code((select code from r1_code)) = 'ok', 'R1. P1 debía canjear el código de R1');
commit;

begin;
-- Stripe abre la prueba con una factura pagada de 0 pesos. No es un cobro y no concreta nada
select pg_temp.expect(
  pg_temp.notice('evt_b7_prueba', 'f7000000-0000-0000-0000-000000000002', 'in_b7_prueba', 0) = 'ignored',
  'R1. La factura de 0 pesos de la prueba debía ignorarse'
);
select pg_temp.expect(pg_temp.referral_of('f7000000-0000-0000-0000-000000000002') = 'pending', 'R1. Con la prueba el referido debía seguir pendiente');
select pg_temp.expect(pg_temp.grants_of('f7000000-0000-0000-0000-000000000001') = 0, 'R1. La prueba dio un mes gratis');
select pg_temp.expect(
  not exists (select 1 from public.payments where user_id = 'f7000000-0000-0000-0000-000000000002'),
  'R1. La factura de 0 pesos quedó como pago'
);

-- El primer cobro después de la prueba concreta el referido y da el mes
select pg_temp.expect(
  pg_temp.notice('evt_b7_cobro1', 'f7000000-0000-0000-0000-000000000002', 'in_b7_cobro1', 149) = 'applied',
  'R1. El primer cobro debía aplicarse'
);
select pg_temp.expect(pg_temp.referral_of('f7000000-0000-0000-0000-000000000002') = 'completed', 'R1. El primer cobro debía concretar el referido');
select pg_temp.expect(pg_temp.grants_of('f7000000-0000-0000-0000-000000000001') = 1, 'R1. El primer cobro debía dar un mes a R1');
select pg_temp.expect(
  (select ends_at - starts_at = interval '30 days' from public.subscription_grants
    where user_id = 'f7000000-0000-0000-0000-000000000001'),
  'R1. El mes debía durar 30 días'
);

-- El mismo aviso repetido no da otro mes
select pg_temp.expect(
  pg_temp.notice('evt_b7_cobro1', 'f7000000-0000-0000-0000-000000000002', 'in_b7_cobro1', 149) = 'duplicate',
  'R1. El aviso repetido debía reconocerse'
);
select pg_temp.expect(pg_temp.grants_of('f7000000-0000-0000-0000-000000000001') = 1, 'R1. El aviso repetido dio otro mes');

-- El mismo cobro con otro aviso, como checkout.session.completed e invoice.paid de la misma factura
select pg_temp.expect(
  pg_temp.notice('evt_b7_sesion1', 'f7000000-0000-0000-0000-000000000002', 'in_b7_cobro1', 149) = 'applied',
  'R1. El otro aviso del mismo cobro debía aplicarse'
);
select pg_temp.expect(
  (select count(*) from public.payments where provider_payment_id = 'in_b7_cobro1') = 1,
  'R1. El mismo cobro quedó dos veces'
);
select pg_temp.expect(pg_temp.grants_of('f7000000-0000-0000-0000-000000000001') = 1, 'R1. El mismo cobro con otro aviso dio otro mes');

-- La renovación del mes siguiente tampoco
select pg_temp.expect(
  pg_temp.notice('evt_b7_cobro2', 'f7000000-0000-0000-0000-000000000002', 'in_b7_cobro2', 149) = 'applied',
  'R1. La renovación debía aplicarse'
);
select pg_temp.expect(pg_temp.grants_of('f7000000-0000-0000-0000-000000000001') = 1, 'R1. La renovación dio otro mes');
commit;

begin;
select pg_temp.as_user('f7000000-0000-0000-0000-000000000001');
select pg_temp.expect(
  (public.my_referrals() ->> 'completed')::int = 1 and (public.my_referrals() ->> 'monthsEarned')::int = 1,
  'R1. R1 debía ver un referido concretado y un mes ganado'
);
select pg_temp.expect(
  public.my_plan() ->> 'plan' = 'monthly' and public.my_plan() ->> 'source' = 'referral',
  'R1. R1 debía tener el mensual por referido'
);
commit;

-- ===================================================================== R2. Una fila de 0 pesos no gasta el turno
-- Si B10 guardara la prueba como un pago de 0 pesos, ese pago no es un cobro. Quien lo tiene todavía
-- puede canjear un código y su primer cobro de verdad concreta el referido
insert into public.payments (user_id, provider, provider_payment_id, amount_mxn, status)
  values ('f7000000-0000-0000-0000-000000000003', 'stripe', 'in_b7_cero', 0, 'paid');

begin;
select pg_temp.as_user('f7000000-0000-0000-0000-000000000003');
select pg_temp.expect(public.redeem_referral_code((select code from r1_code)) = 'ok', 'R2. Una prueba sin cobro debía dejar canjear');
commit;

begin;
-- Llamarla directo con solo el pago de 0 pesos no concreta nada
select public.complete_referral('f7000000-0000-0000-0000-000000000003');
select pg_temp.expect(pg_temp.referral_of('f7000000-0000-0000-0000-000000000003') = 'pending', 'R2. Un pago de 0 pesos concretó el referido');
select pg_temp.expect(pg_temp.grants_of('f7000000-0000-0000-0000-000000000001') = 1, 'R2. Un pago de 0 pesos dio un mes');

select pg_temp.expect(
  pg_temp.notice('evt_b7_cero_cobro', 'f7000000-0000-0000-0000-000000000003', 'in_b7_cero_cobro', 1499, 'annual') = 'applied',
  'R2. El primer cobro debía aplicarse'
);
select pg_temp.expect(pg_temp.referral_of('f7000000-0000-0000-0000-000000000003') = 'completed', 'R2. El primer cobro, aunque haya otro pago de 0 antes, debía concretar');
select pg_temp.expect(pg_temp.grants_of('f7000000-0000-0000-0000-000000000001') = 2, 'R2. R1 debía tener su segundo mes');
-- Se encadena al que ya tenía
select pg_temp.expect(
  (select max(starts_at) from public.subscription_grants where user_id = 'f7000000-0000-0000-0000-000000000001')
  = (select min(ends_at) from public.subscription_grants where user_id = 'f7000000-0000-0000-0000-000000000001'),
  'R2. El segundo mes debía empezar cuando termina el primero'
);
-- Llamarla otra vez no da un tercer mes
select public.complete_referral('f7000000-0000-0000-0000-000000000003');
select pg_temp.expect(pg_temp.grants_of('f7000000-0000-0000-0000-000000000001') = 2, 'R2. Repetir complete_referral dio otro mes');
commit;

-- ===================================================================== R3. Quien ya tuvo un cobro no entra como referido
begin;
select pg_temp.expect(
  pg_temp.notice('evt_b7_pagado', 'f7000000-0000-0000-0000-000000000004', 'in_b7_pagado', 149) = 'applied',
  'R3. El cobro de P3 debía aplicarse'
);
commit;
begin;
select pg_temp.as_user('f7000000-0000-0000-0000-000000000004');
select pg_temp.expect(public.redeem_referral_code((select code from r1_code)) = 'already_paid', 'R3. Quien ya tuvo un cobro no debía poder canjear');
commit;
select pg_temp.expect(pg_temp.referral_of('f7000000-0000-0000-0000-000000000004') is null, 'R3. Quedó un referido de quien ya pagó');
select pg_temp.expect(pg_temp.grants_of('f7000000-0000-0000-0000-000000000001') = 2, 'R3. Un cobro sin referido dio un mes');

-- ===================================================================== R4. Permisos
-- Ninguna sesión de la app concreta un referido ni aplica un aviso
begin;
select pg_temp.as_user('f7000000-0000-0000-0000-000000000004');
do $$ begin
  begin
    perform public.complete_referral('f7000000-0000-0000-0000-000000000004');
    raise exception 'FALLA R4. Un alumno ejecutó complete_referral';
  exception when insufficient_privilege then null;
  end;
end $$;
commit;

\echo 'TODAS LAS PRUEBAS DE REFERIDOS CON EL PRIMER COBRO PASARON'
