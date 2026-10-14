-- Pruebas de pagos completos (migración 20261022000002, B10 del plan del cambio, 5.3 del diseño). Corre
-- después de las demás sobre la misma base, con usuarios propios. Cada bloque falla con un error si algo
-- no cumple.
--   P1 estados, P2 prueba única, P3 lugares Fundador, P4 avisos, P5 checkout_context, P6 permisos,
--   P7 borrar la cuenta, P8 compatibilidad, P9 limpieza de pagos de prueba y P10 la consulta de
--   comprobación de docs/SUPABASE.md
--
-- Cada aviso va en su propia sentencia y lo que escribió se lee en la siguiente, porque una subconsulta
-- no ve lo que una función escribe en la misma sentencia
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

-- Lo que devolvió una función contra lo esperado, con los dos valores en el error
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

-- my_plan como lo vería el alumno, sin cambiar de rol
create or replace function pg_temp.mp(uid text) returns jsonb language plpgsql as $$
declare
  v jsonb;
begin
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', uid, 'role', 'authenticated')::text, true);
  v := public.my_plan();
  perform set_config('request.jwt.claims', '', true);
  return v;
end $$;

-- Un aviso de estado como lo manda la función de avisos con la llave de servicio
create or replace function pg_temp.state(
  p_event text, p_user text, p_sub text, p_plan text, p_status text,
  p_period_end timestamptz default now() + interval '30 days',
  p_trial_end timestamptz default null,
  p_at timestamptz default clock_timestamp(),
  p_cancel boolean default false,
  p_scheduled boolean default false,
  p_price text default null,
  p_code text default null,
  p_provider text default 'stripe'
) returns text language sql as $$
  select public.apply_subscription_state(
    p_provider, p_event, p_at, jsonb_build_object('id', p_event), p_user::uuid, p_sub, p_plan, p_status,
    p_period_end, p_trial_end, p_cancel, p_scheduled, p_price, p_code
  )
$$;

-- Una prueba de 7 días
create or replace function pg_temp.trial(p_event text, p_user text, p_sub text, p_plan text, p_code text default null)
returns text language sql as $$
  select pg_temp.state(p_event, p_user, p_sub, p_plan, 'trialing',
    p_period_end => now() + interval '7 days', p_trial_end => now() + interval '7 days', p_code => p_code)
$$;

-- Un cobro como lo manda la función de avisos con la llave de servicio
create or replace function pg_temp.charge(
  p_event text, p_kind text, p_user text, p_purpose text, p_plan text, p_payment text,
  p_amount numeric default 149,
  p_sub text default null,
  p_method text default null,
  p_intent text default null,
  p_discount numeric default null,
  p_code text default null,
  p_period_end timestamptz default null,
  p_expires timestamptz default null,
  p_provider text default 'stripe'
) returns text language sql as $$
  select public.apply_charge(
    p_provider, p_event, jsonb_build_object('id', p_event), p_kind, p_user::uuid,
    p_purpose, p_plan, p_method, p_payment, p_intent, p_sub, p_amount, p_discount, p_code, p_period_end, p_expires
  )
$$;

create or replace function pg_temp.seat_of(uid text) returns text language sql as $$
  select status from public.founder_seats where user_id = uid::uuid
$$;

create or replace function pg_temp.claim_of(uid text) returns text language sql as $$
  select status from public.trial_claims where user_id = uid::uuid
$$;

create or replace function pg_temp.action_for(p_target text) returns text language sql as $$
  select reason from public.billing_actions where target = p_target
$$;

-- ===================================================================== Usuarios
\set u01 'ba100000-0000-0000-0000-000000000001'
\set u02 'ba100000-0000-0000-0000-000000000002'
\set u03 'ba100000-0000-0000-0000-000000000003'
\set u04 'ba100000-0000-0000-0000-000000000004'
\set u05 'ba100000-0000-0000-0000-000000000005'
\set u06 'ba100000-0000-0000-0000-000000000006'
\set u07 'ba100000-0000-0000-0000-000000000007'
\set u08 'ba100000-0000-0000-0000-000000000008'
\set u09 'ba100000-0000-0000-0000-000000000009'
\set u0b 'ba100000-0000-0000-0000-00000000000b'
\set u0c 'ba100000-0000-0000-0000-00000000000c'
\set u0d 'ba100000-0000-0000-0000-00000000000d'
\set u0e 'ba100000-0000-0000-0000-00000000000e'
\set u0f 'ba100000-0000-0000-0000-00000000000f'
\set u10 'ba100000-0000-0000-0000-000000000010'
\set u11 'ba100000-0000-0000-0000-000000000011'
\set u12 'ba100000-0000-0000-0000-000000000012'
\set u13 'ba100000-0000-0000-0000-000000000013'
\set u14 'ba100000-0000-0000-0000-000000000014'
\set u15 'ba100000-0000-0000-0000-000000000015'
\set u16 'ba100000-0000-0000-0000-000000000016'
\set u17 'ba100000-0000-0000-0000-000000000017'
\set u18 'ba100000-0000-0000-0000-000000000018'
\set u19 'ba100000-0000-0000-0000-000000000019'
\set u1a 'ba100000-0000-0000-0000-00000000001a'
\set adm 'ba100000-0000-0000-0000-0000000000ad'
\set ra 'af63865e-1152-457e-b3fd-697acbd2fbd5'
\set rb '7ab06582-5d4b-4990-819a-b65b531f94ed'
insert into auth.users (id, email, raw_user_meta_data) values
  (:'u01', 'p1@ba.mx', '{"alias":"Prueba Fundador"}'),
  (:'u02', 'p2@ba.mx', '{"alias":"Mensual"}'),
  (:'u03', 'p3@ba.mx', '{"alias":"Cobro fallido"}'),
  (:'u04', 'p4@ba.mx', '{"alias":"Cancela"}'),
  (:'u05', 'p5@ba.mx', '{"alias":"Pase"}'),
  (:'u06', 'p6@ba.mx', '{"alias":"Dos pruebas"}'),
  (:'u07', 'Ana.Perez+x@gmail.com', '{"alias":"Ana"}'),
  (:'u08', 'anaperez@googlemail.com', '{"alias":"Ana dos"}'),
  (:'u09', 'p9@ba.mx', '{"alias":"Ya pagó"}'),
  (:'u0b', 'pb@ba.mx', '{"alias":"Apagada"}'),
  (:'u0c', 'pc@ba.mx', '{"alias":"Contexto"}'),
  (:'u0d', 'pd@ba.mx', '{"alias":"Fundador uno"}'),
  (:'u0e', 'pe@ba.mx', '{"alias":"Fundador dos"}'),
  (:'u0f', 'pf@ba.mx', '{"alias":"Fundador tres"}'),
  (:'u10', 'q0@ba.mx', '{"alias":"Avisos"}'),
  (:'u11', 'q1@ba.mx', '{"alias":"Ficha vencida"}'),
  (:'u12', 'q2@ba.mx', '{"alias":"Refiere"}'),
  (:'u13', 'q3@ba.mx', '{"alias":"Referido"}'),
  (:'u14', 'q4@ba.mx', '{"alias":"Prorrateo"}'),
  (:'u15', 'q5@ba.mx', '{"alias":"Doble"}'),
  (:'u16', 'q6@ba.mx', '{"alias":"Borra prueba"}'),
  (:'u17', 'q7@ba.mx', '{"alias":"Borra Mercado Pago"}'),
  (:'u18', 'q8@ba.mx', '{"alias":"Borra cancelada"}'),
  (:'u19', 'q9@ba.mx', '{"alias":"Fundador sin prueba"}'),
  (:'u1a', 'qa@ba.mx', '{"alias":"Fundador devuelto"}'),
  (:'adm', 'adm@ba.mx', '{"alias":"Admin pagos"}');
update public.user_roles set role = 'admin' where user_id = :'adm';

-- ===================================================================== P1. Estados
-- Prueba gratis del Fundador mensual. Vale hasta el fin de la prueba y viene de un pago
select pg_temp.is(pg_temp.trial('evt-p1-01', :'u01', 'sub_p1_01', 'founder', 'prueba10'), 'applied', 'P1. La prueba debía aplicarse');
select pg_temp.expect(
  pg_temp.mp(:'u01') @> '{"plan":"founder","source":"payment","status":"trialing","provider":"stripe","trialAvailable":false,"cancelAtPeriodEnd":false}'::jsonb
  and (pg_temp.mp(:'u01') ->> 'trialEnd')::timestamptz between now() + interval '6 days' and now() + interval '8 days'
  and (pg_temp.mp(:'u01') ->> 'periodEnd')::timestamptz = (pg_temp.mp(:'u01') ->> 'trialEnd')::timestamptz
  and pg_temp.mp(:'u01') -> 'guaranteeUntil' = 'null'::jsonb,
  'P1. my_plan en prueba debía decir trialing, su fin y sin garantía'
);
select pg_temp.expect(
  (select promotion_code from public.subscriptions where user_id = :'u01') = 'PRUEBA10'
  and (select promotion_code from public.trial_claims where user_id = :'u01') = 'PRUEBA10'
  and public.user_plan(:'u01') = 'founder',
  'P1. La prueba debía dar el plan Fundador y guardar el código en mayúsculas'
);

-- Activa con su primer cobro. La garantía cuenta desde ahí
select pg_temp.is(pg_temp.state('evt-p1-02', :'u02', 'sub_p1_02', 'monthly', 'active', p_price => 'price_mensual'), 'applied',
  'P1. La suscripción activa debía aplicarse');
select pg_temp.is(pg_temp.charge('evt-p1-02c', 'paid', :'u02', 'subscription', 'monthly', 'in_p1_02', 149, 'sub_p1_02',
  p_period_end => now() + interval '30 days'), 'applied', 'P1. El cobro debía aplicarse');
select pg_temp.expect(
  pg_temp.mp(:'u02') @> '{"plan":"monthly","source":"payment","status":"active","trialAvailable":false}'::jsonb
  and (pg_temp.mp(:'u02') ->> 'guaranteeUntil')::timestamptz between now() + interval '6 days' and now() + interval '8 days'
  and pg_temp.mp(:'u02') -> 'trialEnd' = 'null'::jsonb,
  'P1. my_plan activo debía traer la garantía de 7 días'
);
select pg_temp.expect(
  (select purpose = 'subscription' and plan = 'monthly' and method = 'card' and paid_at is not null
     from public.payments where provider_payment_id = 'in_p1_02'),
  'P1. El cobro debía guardar para qué, plan, método y hora'
);

-- Cobro fallido. Vale hasta el fin de lo pagado aunque Stripe ya muestre el periodo siguiente
select pg_temp.state('evt-p1-03', :'u03', 'sub_p1_03', 'monthly', 'active', p_period_end => now() + interval '5 days');
select pg_temp.charge('evt-p1-03c', 'paid', :'u03', 'subscription', 'monthly', 'in_p1_03', 149, 'sub_p1_03',
  p_period_end => now() + interval '5 days');
select pg_temp.is(pg_temp.charge('evt-p1-03f', 'failed', :'u03', 'subscription', null, 'in_p1_03b', null, 'sub_p1_03'), 'applied',
  'P1. El cobro fallido debía aplicarse');
select pg_temp.is(pg_temp.state('evt-p1-03s', :'u03', 'sub_p1_03', 'monthly', 'past_due', p_period_end => now() + interval '35 days'),
  'applied', 'P1. El estado past_due debía aplicarse');
select pg_temp.expect(
  pg_temp.mp(:'u03') @> '{"plan":"monthly","status":"past_due","source":"payment"}'::jsonb
  and (pg_temp.mp(:'u03') ->> 'periodEnd')::timestamptz < now() + interval '6 days',
  'P1. Con cobro fallido debía valer solo hasta el fin de lo pagado'
);
update public.subscriptions set current_period_end = now() - interval '1 minute' where user_id = :'u03';
select pg_temp.is(public.user_plan(:'u03'), 'free', 'P1. Pasado lo pagado con cobro fallido debía quedar en free');

-- Cancelada al final del periodo. Sigue vigente y lo dice. Al terminar se recorta y queda en free
select pg_temp.state('evt-p1-04', :'u04', 'sub_p1_04', 'annual', 'active');
select pg_temp.charge('evt-p1-04c', 'paid', :'u04', 'subscription', 'annual', 'in_p1_04', 1499, 'sub_p1_04',
  p_period_end => now() + interval '300 days');
select pg_temp.is(pg_temp.state('evt-p1-04x', :'u04', 'sub_p1_04', 'annual', 'active', p_cancel => true), 'applied',
  'P1. La cancelación al final del periodo debía aplicarse');
select pg_temp.expect(
  pg_temp.mp(:'u04') @> '{"plan":"annual","status":"active","cancelAtPeriodEnd":true}'::jsonb,
  'P1. Cancelar al final del periodo debía conservar el plan y avisarlo'
);
select pg_temp.is(pg_temp.state('evt-p1-04e', :'u04', 'sub_p1_04', 'annual', 'ended', p_period_end => now() + interval '300 days'),
  'applied', 'P1. El fin debía aplicarse');
select pg_temp.expect(
  (select status = 'canceled' and current_period_end <= now() from public.subscriptions where user_id = :'u04')
  and pg_temp.mp(:'u04') @> '{"plan":"free","source":"none","status":"canceled"}'::jsonb,
  'P1. Al terminar debía quedar cancelada, recortada y en free'
);
-- Una cancelada de Mercado Pago (canceled) vale hasta el fin pagado y después free
select pg_temp.state('evt-p1-04m', :'u04', 'mp_pre_04', 'monthly', 'active', p_provider => 'mercadopago',
  p_period_end => now() + interval '20 days');
select pg_temp.is(pg_temp.state('evt-p1-04mc', :'u04', 'mp_pre_04', 'monthly', 'canceled', p_provider => 'mercadopago',
  p_period_end => now() + interval '20 days'), 'applied', 'P1. La cancelación de Mercado Pago debía aplicarse');
select pg_temp.expect(
  pg_temp.mp(:'u04') @> '{"plan":"monthly","status":"canceled","provider":"mercadopago","source":"payment"}'::jsonb,
  'P1. Una cancelada debía valer hasta el fin del periodo'
);
update public.subscriptions set current_period_end = now() - interval '1 minute' where user_id = :'u04';
select pg_temp.is(pg_temp.mp(:'u04') ->> 'plan', 'free', 'P1. Pasado el fin una cancelada debía quedar en free');

-- Pase OXXO. Pendiente, pagado y otro que suma desde el fin. Un pase devuelto deja de contar
select pg_temp.is(pg_temp.charge('evt-p1-05p', 'pending', :'u05', 'pass', 'monthly', 'pi_p1_05a', 149, null, 'oxxo', 'pi_p1_05a',
  p_expires => now() + interval '3 days'), 'applied', 'P1. La ficha pendiente debía aplicarse');
select pg_temp.expect(
  pg_temp.mp(:'u05') @> '{"plan":"free","pendingPayment":{"method":"oxxo","plan":"monthly","amountMxn":149}}'::jsonb,
  'P1. La ficha pendiente debía verse en my_plan'
);
select pg_temp.is(pg_temp.charge('evt-p1-05a', 'paid', :'u05', 'pass', 'monthly', 'pi_p1_05a', 149, null, 'oxxo', 'pi_p1_05a'),
  'applied', 'P1. El pase pagado debía aplicarse');
select pg_temp.expect(
  pg_temp.mp(:'u05') @> '{"plan":"monthly","source":"pass"}'::jsonb
  and pg_temp.mp(:'u05') -> 'pendingPayment' = 'null'::jsonb
  and (pg_temp.mp(:'u05') ->> 'passEnd')::timestamptz between now() + interval '27 days' and now() + interval '32 days'
  and (pg_temp.mp(:'u05') ->> 'guaranteeUntil') is not null
  and (select status from public.payments where provider_payment_id = 'pi_p1_05a') = 'paid',
  'P1. El pase pagado debía dar el plan mensual con su fin y su garantía'
);
select pg_temp.is(pg_temp.charge('evt-p1-05b', 'paid', :'u05', 'pass', 'annual', 'pi_p1_05b', 1499, null, 'spei', 'pi_p1_05b'),
  'applied', 'P1. El segundo pase debía aplicarse');
select pg_temp.expect(
  (select starts_at from public.plan_passes where provider_payment_id = 'pi_p1_05b')
    = (select ends_at from public.plan_passes where provider_payment_id = 'pi_p1_05a')
  and (pg_temp.mp(:'u05') ->> 'passEnd')::timestamptz
    = (select ends_at from public.plan_passes where provider_payment_id = 'pi_p1_05b')
  and public.user_plan(:'u05') = 'monthly',
  'P1. El segundo pase debía sumar desde el fin del primero'
);
-- Se devuelve el primero por su PaymentIntent. Deja de contar y el segundo no se recorre (8.11)
select pg_temp.is(pg_temp.charge('evt-p1-05r', 'refunded', :'u05', 'subscription', null, null, 149, null, null, 'pi_p1_05a'),
  'applied', 'P1. El reembolso del pase debía aplicarse');
select pg_temp.expect(
  (select status from public.plan_passes where provider_payment_id = 'pi_p1_05a') = 'refunded'
  and (select status = 'refunded' and refunded_at is not null from public.payments where provider_payment_id = 'pi_p1_05a')
  and public.user_plan(:'u05') = 'free'
  and (select starts_at > now() from public.plan_passes where provider_payment_id = 'pi_p1_05b'),
  'P1. El pase devuelto debía dejar de contar sin recorrer el siguiente'
);

-- ===================================================================== P2. Prueba única
-- Una segunda prueba de la misma cuenta mientras la primera sigue viva
select pg_temp.trial('evt-p2-06a', :'u06', 'sub_p2_06a', 'monthly');
select pg_temp.is(pg_temp.trial('evt-p2-06b', :'u06', 'sub_p2_06b', 'annual'), 'trial_duplicate',
  'P2. La segunda prueba de la misma cuenta debía rechazarse');
select pg_temp.expect(
  pg_temp.action_for('sub_p2_06b') = 'trial_duplicate'
  and (select provider_subscription_id from public.subscriptions where user_id = :'u06') = 'sub_p2_06a'
  and pg_temp.mp(:'u06') ->> 'issue' = 'trial_duplicate',
  'P2. La segunda prueba debía dejar su acción y su aviso sin tocar la primera'
);
-- La primera se cancela dentro de la prueba y termina. Cuenta como usada, así que otra no se da
select pg_temp.state('evt-p2-06c', :'u06', 'sub_p2_06a', 'monthly', 'trialing', p_cancel => true,
  p_period_end => now() + interval '7 days', p_trial_end => now() + interval '7 days');
select pg_temp.state('evt-p2-06d', :'u06', 'sub_p2_06a', 'monthly', 'ended', p_period_end => now() + interval '7 days');
select pg_temp.is(pg_temp.claim_of(:'u06'), 'canceled', 'P2. La prueba cancelada debía quedar canceled');
select pg_temp.is(pg_temp.trial('evt-p2-06e', :'u06', 'sub_p2_06e', 'monthly'), 'trial_duplicate',
  'P2. Una prueba después de cancelar la primera debía rechazarse');
select pg_temp.expect(
  pg_temp.action_for('sub_p2_06e') = 'trial_duplicate' and public.user_plan(:'u06') = 'free',
  'P2. La prueba rechazada debía dejar su acción y no dar acceso'
);
-- Los avisos de la suscripción rechazada ya no cambian nada
select pg_temp.is(pg_temp.state('evt-p2-06f', :'u06', 'sub_p2_06e', 'monthly', 'active'), 'ignored',
  'P2. Un aviso de la suscripción rechazada debía ignorarse');
select pg_temp.is(public.user_plan(:'u06'), 'free', 'P2. Un aviso de la suscripción rechazada no debía dar acceso');

-- El mismo correo normalizado en otra cuenta
select pg_temp.expect(
  public.trial_email_key('Ana.Perez+x@gmail.com') = 'anaperez@gmail.com'
  and public.trial_email_key(' anaperez@googlemail.com ') = 'anaperez@gmail.com'
  and public.trial_email_key('Luis.Gomez+promo@ba.mx') = 'luis.gomez@ba.mx'
  and public.trial_email_key('sin-arroba') is null,
  'P2. La clave del correo no quedó normalizada'
);
select pg_temp.is(pg_temp.trial('evt-p2-07', :'u07', 'sub_p2_07', 'monthly'), 'applied', 'P2. La prueba de Ana debía aplicarse');
select pg_temp.is(public.checkout_context(:'u08') ->> 'trialAvailable', 'false',
  'P2. Otra cuenta con el correo equivalente no debía tener prueba');
select pg_temp.is(pg_temp.trial('evt-p2-08', :'u08', 'sub_p2_08', 'monthly'), 'trial_duplicate',
  'P2. La prueba de la otra cuenta con el mismo correo debía rechazarse');
select pg_temp.is(pg_temp.action_for('sub_p2_08'), 'trial_duplicate', 'P2. Faltó la acción de cancelar la segunda prueba');

-- Quien ya tuvo un cobro sin prueba
select pg_temp.charge('evt-p2-09', 'paid', :'u09', 'pass', 'monthly', 'pi_p2_09', 149, null, 'spei', 'pi_p2_09');
select pg_temp.expect(
  (public.checkout_context(:'u09') ->> 'trialAvailable')::boolean = false
  and (pg_temp.mp(:'u09') ->> 'trialAvailable')::boolean = false,
  'P2. Quien ya pagó no debía tener prueba'
);

-- trialDays en 0 apaga la prueba para todos. Una prueba anulada por cupo lleno no cuenta (ver P3)
begin;
update public.platform_settings set value = '{"trialDays":0,"guaranteeDays":7,"oxxoExpiresDays":3,"passReminderDays":3}'
  where key = 'billing_rules';
select pg_temp.expect(
  (public.checkout_context(:'u0b') ->> 'trialAvailable')::boolean = false
  and (public.checkout_context(:'u0b') ->> 'trialDays')::integer = 0,
  'P2. trialDays en 0 debía apagar la prueba'
);
rollback;
select pg_temp.expect(
  (public.checkout_context(:'u0b') ->> 'trialAvailable')::boolean
  and (public.checkout_context(:'u0b') ->> 'trialDays')::integer = 7,
  'P2. Una cuenta nueva debía tener su prueba de 7 días'
);

-- ===================================================================== P3. Lugares Fundador
-- Quedan dos lugares. Se ocupan con una prueba del mensual y otra del anual
update public.platform_settings set value = jsonb_build_object('total', public.founder_seats_taken() + 2)
  where key = 'founder_seats';
select pg_temp.expect(
  (public.checkout_context(:'u0d') ->> 'founderSeatsLeft')::integer = 2
  and (public.checkout_context(:'u0d') ->> 'founderOpen')::boolean,
  'P3. Debían quedar dos lugares'
);
-- El candado del cupo se toma al apartar
begin;
select pg_temp.is(pg_temp.trial('evt-p3-0d', :'u0d', 'sub_p3_0d', 'founder'), 'applied', 'P3. La prueba Fundador debía aplicarse');
select pg_temp.expect(
  exists (
    select 1 from pg_locks l, (select hashtextextended('founder_seats', 0) as k) h
    where l.locktype = 'advisory' and l.pid = pg_backend_pid() and l.objsubid = 1
      and l.classid::bigint = ((h.k >> 32) & 4294967295) and l.objid::bigint = (h.k & 4294967295)
  ),
  'P3. Apartar un lugar debía tomar el candado del cupo'
);
commit;
select pg_temp.is(pg_temp.seat_of(:'u0d'), 'held', 'P3. La prueba debía apartar el lugar');
select pg_temp.is(pg_temp.trial('evt-p3-0e', :'u0e', 'sub_p3_0e', 'founder_annual'), 'applied',
  'P3. La prueba del anual Fundador debía aplicarse');
select pg_temp.expect(
  pg_temp.seat_of(:'u0e') = 'held'
  and (public.checkout_context(:'u0f') ->> 'founderSeatsLeft')::integer = 0
  and not (public.checkout_context(:'u0f') ->> 'founderOpen')::boolean,
  'P3. El mensual y el anual Fundador debían compartir el cupo'
);
-- La tercera prueba ya no tiene lugar
select pg_temp.is(pg_temp.trial('evt-p3-0f', :'u0f', 'sub_p3_0f', 'founder'), 'founder_full',
  'P3. La tercera prueba debía quedarse sin lugar');
select pg_temp.expect(
  pg_temp.action_for('sub_p3_0f') = 'founder_full'
  and pg_temp.claim_of(:'u0f') = 'voided'
  and pg_temp.seat_of(:'u0f') is null
  and public.user_plan(:'u0f') = 'free'
  and pg_temp.mp(:'u0f') ->> 'issue' = 'founder_full'
  and (pg_temp.mp(:'u0f') ->> 'trialAvailable')::boolean,
  'P3. Sin lugar la prueba debía anularse sin contar, con su acción y su aviso'
);
-- El primer cobro confirma el lugar y convierte la prueba
select pg_temp.is(pg_temp.charge('evt-p3-0dc', 'paid', :'u0d', 'subscription', 'founder', 'in_p3_0d', 79, 'sub_p3_0d',
  p_period_end => now() + interval '37 days'), 'applied', 'P3. El primer cobro debía aplicarse');
select pg_temp.expect(
  pg_temp.seat_of(:'u0d') = 'confirmed'
  and pg_temp.claim_of(:'u0d') = 'converted'
  and (select first_charge_at is not null and status = 'active' from public.subscriptions where user_id = :'u0d'),
  'P3. El primer cobro debía confirmar el lugar y convertir la prueba'
);
-- Cambiar al anual Fundador en el portal conserva el mismo lugar
select pg_temp.is(pg_temp.state('evt-p3-0dx', :'u0d', 'sub_p3_0d', 'founder_annual', 'active', p_price => 'price_fundador_anual'),
  'applied', 'P3. El cambio de precio debía aplicarse');
select pg_temp.expect(
  (select plan from public.subscriptions where user_id = :'u0d') = 'founder_annual'
  and (select count(*) from public.founder_seats where user_id = :'u0d') = 1
  and pg_temp.seat_of(:'u0d') = 'confirmed',
  'P3. Cambiar de precio debía conservar el lugar'
);
-- La prueba cancelada libera su lugar al terminar
select pg_temp.state('evt-p3-0ex', :'u0e', 'sub_p3_0e', 'founder_annual', 'trialing', p_cancel => true,
  p_period_end => now() + interval '7 days', p_trial_end => now() + interval '7 days');
select pg_temp.is(pg_temp.state('evt-p3-0ee', :'u0e', 'sub_p3_0e', 'founder_annual', 'ended'), 'applied',
  'P3. El fin de la prueba cancelada debía aplicarse');
select pg_temp.expect(
  pg_temp.seat_of(:'u0e') = 'released'
  and pg_temp.claim_of(:'u0e') = 'canceled'
  and pg_temp.mp(:'u0e') ->> 'plan' = 'free'
  and not (public.checkout_context(:'u0e') ->> 'founderLost')::boolean
  and (public.checkout_context(:'u0e') ->> 'founderSeatsLeft')::integer = 1,
  'P3. La prueba cancelada debía liberar su lugar'
);
-- Pagar y cancelar no libera. Pierde el precio
select pg_temp.is(pg_temp.state('evt-p3-0de', :'u0d', 'sub_p3_0d', 'founder_annual', 'ended'), 'applied',
  'P3. El fin del Fundador pagado debía aplicarse');
select pg_temp.expect(
  pg_temp.seat_of(:'u0d') = 'confirmed'
  and (public.checkout_context(:'u0d') ->> 'founderLost')::boolean
  and (public.checkout_context(:'u0d') ->> 'founderSeatsLeft')::integer = 1,
  'P3. Pagar y cancelar no debía liberar el lugar y debía perder el precio'
);
-- La promoción se cierra con open en false aunque haya lugares
begin;
update public.platform_settings set value = value || '{"open":false}' where key = 'founder_seats';
select pg_temp.expect(
  not (public.checkout_context(:'u0f') ->> 'founderOpen')::boolean
  and (public.checkout_context(:'u0f') ->> 'founderSeatsLeft')::integer = 1,
  'P3. open en false debía cerrar la promoción'
);
rollback;
-- El camino de antes también ocupa su lugar, y sin lugar deja el cobro para devolver
select pg_temp.is(
  public.apply_payment_notice('stripe', 'evt-p3-0f-viejo', '{}', 'paid', :'u0f', 'founder', 'in_p3_0f', 'sub_p3_0f_viejo', 79, null),
  'applied', 'P3. El camino de antes debía aplicarse');
select pg_temp.expect(
  pg_temp.seat_of(:'u0f') = 'confirmed' and (public.checkout_context(:'u0c') ->> 'founderSeatsLeft')::integer = 0,
  'P3. El camino de antes debía ocupar un lugar'
);
select pg_temp.is(
  public.apply_payment_notice('stripe', 'evt-p3-0c-viejo', '{}', 'paid', :'u0c', 'founder', 'in_p3_0c', 'sub_p3_0c', 79, null),
  'founder_full', 'P3. El camino de antes sin lugar debía responder founder_full');
select pg_temp.expect(
  (select status from public.payments where provider_payment_id = 'in_p3_0c') = 'needs_refund'
  and pg_temp.seat_of(:'u0c') is null,
  'P3. El camino de antes sin lugar debía dejar el cobro para devolver'
);
-- Sin prueba tampoco se pasa del cupo. El estado de la suscripción nueva aparta el lugar con el candado
select pg_temp.is(pg_temp.state('evt-p3-19', :'u19', 'sub_p3_19', 'founder', 'active'), 'founder_full',
  'P3. Una suscripción Fundador sin prueba y sin lugar debía rechazarse');
select pg_temp.is(pg_temp.charge('evt-p3-19c', 'paid', :'u19', 'subscription', 'founder', 'in_p3_19', 79, 'sub_p3_19'),
  'applied', 'P3. Su cobro debía asentarse');
select pg_temp.expect(
  pg_temp.seat_of(:'u19') is null
  and pg_temp.action_for('sub_p3_19') = 'founder_full'
  and (select status from public.payments where provider_payment_id = 'in_p3_19') = 'needs_refund'
  and public.user_plan(:'u19') = 'free'
  and pg_temp.mp(:'u19') ->> 'issue' = 'founder_full',
  'P3. Sin lugar la suscripción sin prueba debía cancelarse y su cobro quedar para devolver'
);
-- Una fila puesta a mano recibe su lugar por el disparador
update public.platform_settings set value = '{"total":100}' where key = 'founder_seats';
insert into public.subscriptions (user_id, plan, status, provider, provider_subscription_id, current_period_end)
  values (:'u0c', 'founder', 'trialing', 'stripe', 'sub_p3_0c_mano', now() + interval '7 days');
select pg_temp.is(pg_temp.seat_of(:'u0c'), 'held', 'P3. El disparador debía apartar el lugar de una fila puesta a mano');
-- El relleno de la migración da lugar a los Fundadores que no lo tenían
begin;
alter table public.subscriptions disable trigger subscriptions_sync_founder_seat;
update public.subscriptions set plan = 'founder', status = 'active' where user_id = :'u02';
alter table public.subscriptions enable trigger subscriptions_sync_founder_seat;
commit;
select pg_temp.is(pg_temp.seat_of(:'u02'), null, 'P3. Sin el disparador no debía haber lugar');
\ir ../migrations/20261022000002_billing_plans.sql
select pg_temp.is(pg_temp.seat_of(:'u02'), 'confirmed', 'P3. El relleno debía confirmar el lugar del Fundador');
update public.subscriptions set plan = 'monthly' where user_id = :'u02';
-- La devolución completa del único cobro de un Fundador libera su lugar (8.5)
select pg_temp.is(pg_temp.state('evt-p3-1a', :'u1a', 'sub_p3_1a', 'founder', 'active'), 'applied',
  'P3. La suscripción Fundador sin prueba debía aplicarse');
select pg_temp.is(pg_temp.seat_of(:'u1a'), 'held', 'P3. La suscripción sin prueba debía apartar su lugar');
select pg_temp.charge('evt-p3-1ac', 'paid', :'u1a', 'subscription', 'founder', 'in_p3_1a', 79, 'sub_p3_1a',
  p_period_end => now() + interval '30 days');
select pg_temp.is(pg_temp.seat_of(:'u1a'), 'confirmed', 'P3. El cobro debía confirmar el lugar');
select pg_temp.is(pg_temp.charge('evt-p3-1ar', 'refunded', :'u1a', 'subscription', null, 'in_p3_1a', 79), 'applied',
  'P3. La devolución debía aplicarse');
select pg_temp.expect(
  pg_temp.seat_of(:'u1a') = 'released'
  and not (public.checkout_context(:'u1a') ->> 'founderLost')::boolean
  and pg_temp.action_for('sub_p3_1a') = 'refund'
  and public.user_plan(:'u1a') = 'free',
  'P3. La devolución del único cobro debía liberar el lugar y dejar la acción de cancelar'
);

-- ===================================================================== P4. Avisos
-- El mismo evento dos veces
select pg_temp.is(pg_temp.state('evt-p4-1', :'u10', 'sub_p4_10', 'monthly', 'active', p_at => now() - interval '1 hour'),
  'applied', 'P4. El primer aviso debía aplicarse');
select pg_temp.is(pg_temp.state('evt-p4-1', :'u10', 'sub_p4_10', 'monthly', 'active'), 'duplicate',
  'P4. Un evento repetido debía reconocerse');
select pg_temp.is((select result from public.payment_webhook_events where event_id = 'evt-p4-1'), 'applied',
  'P4. El aviso debía guardar su resultado');
-- Un aviso de estado más viejo que el último aplicado se descarta
select pg_temp.state('evt-p4-2', :'u10', 'sub_p4_10', 'monthly', 'active', p_cancel => true, p_at => now());
select pg_temp.is(pg_temp.state('evt-p4-3', :'u10', 'sub_p4_10', 'monthly', 'active', p_cancel => false,
  p_at => now() - interval '30 minutes'), 'stale', 'P4. Un aviso viejo debía descartarse');
select pg_temp.expect((select cancel_at_period_end from public.subscriptions where user_id = :'u10'),
  'P4. Un aviso viejo no debía deshacer la cancelación');
-- El mismo cobro por dos temas no suma dos veces
select pg_temp.is(pg_temp.charge('evt-p4-4a', 'paid', :'u11', 'pass', 'monthly', 'mp_pago_44', 149, null, 'mercadopago',
  p_provider => 'mercadopago'), 'applied', 'P4. El pago por un tema debía aplicarse');
select pg_temp.is(pg_temp.charge('evt-p4-4b', 'paid', :'u11', 'pass', 'monthly', 'mp_pago_44', 149, null, 'mercadopago',
  p_provider => 'mercadopago'), 'applied', 'P4. El mismo pago por otro tema debía aplicarse sin sumar');
select pg_temp.expect(
  (select count(*) from public.plan_passes where user_id = :'u11') = 1
  and (select count(*) from public.payments where user_id = :'u11') = 1,
  'P4. El mismo cobro por dos temas debía sumar una vez'
);
-- Una ficha que vence avisa y no cambia el plan
select pg_temp.charge('evt-p4-5p', 'pending', :'u11', 'pass', 'annual', 'pi_p4_11', 1499, null, 'oxxo', 'pi_p4_11',
  p_expires => now() + interval '3 days');
select pg_temp.is(pg_temp.charge('evt-p4-5e', 'expired', :'u11', 'pass', null, 'pi_p4_11', null, null, 'oxxo', 'pi_p4_11'),
  'applied', 'P4. La ficha vencida debía aplicarse');
select pg_temp.expect(
  (select status = 'expired' and expires_at <= now() from public.payments where provider_payment_id = 'pi_p4_11')
  and pg_temp.mp(:'u11') ->> 'issue' = 'voucher_expired'
  and pg_temp.mp(:'u11') -> 'pendingPayment' = 'null'::jsonb
  and (select count(*) from public.plan_passes where user_id = :'u11') = 1,
  'P4. La ficha vencida debía avisar sin dar un pase'
);
-- Un pago que llega después de vencer se aplica como pase nuevo (8.27)
select pg_temp.is(pg_temp.charge('evt-p4-5t', 'paid', :'u11', 'pass', 'annual', 'pi_p4_11', 1499, null, 'oxxo', 'pi_p4_11'),
  'applied', 'P4. El pago después del vencimiento debía aplicarse');
select pg_temp.expect(
  (select status from public.payments where provider_payment_id = 'pi_p4_11') = 'paid'
  and (select count(*) from public.plan_passes where user_id = :'u11') = 2
  and pg_temp.mp(:'u11') -> 'issue' = 'null'::jsonb,
  'P4. Un pago después del vencimiento debía dar el pase y quitar el aviso'
);
-- Con una suscripción vigente un pase no suma y queda para devolver
select pg_temp.state('evt-p4-5s', :'u10', 'sub_p4_10', 'monthly', 'active');
select pg_temp.is(pg_temp.charge('evt-p4-5x', 'paid', :'u10', 'pass', 'monthly', 'pi_p4_10', 149, null, 'oxxo', 'pi_p4_10'),
  'applied', 'P4. El pase con suscripción vigente debía aplicarse');
select pg_temp.expect(
  (select status from public.payments where provider_payment_id = 'pi_p4_10') = 'needs_refund'
  and not exists (select 1 from public.plan_passes where user_id = :'u10'),
  'P4. Un pase con suscripción vigente debía quedar para devolver'
);
-- El cobro del prorrateo no regresa el plan de la metadata
select pg_temp.state('evt-p4-6', :'u14', 'sub_p4_14', 'monthly', 'active', p_price => 'price_mensual');
select pg_temp.charge('evt-p4-6c', 'paid', :'u14', 'subscription', 'monthly', 'in_p4_14', 149, 'sub_p4_14',
  p_period_end => now() + interval '30 days');
select pg_temp.state('evt-p4-7', :'u14', 'sub_p4_14', 'annual', 'active', p_price => 'price_anual');
select pg_temp.is(pg_temp.charge('evt-p4-7c', 'paid', :'u14', 'subscription', 'monthly', 'in_p4_14b', 1350, 'sub_p4_14',
  p_period_end => now() + interval '365 days'), 'applied', 'P4. El cobro del prorrateo debía aplicarse');
select pg_temp.expect(
  (select plan from public.subscriptions where user_id = :'u14') = 'annual'
  and (select plan from public.payments where provider_payment_id = 'in_p4_14b') = 'annual'
  and (select current_period_end > now() + interval '300 days' from public.subscriptions where user_id = :'u14'),
  'P4. El cobro del prorrateo no debía regresar el plan y sí alargar el periodo'
);
-- Reembolso de una suscripción. Quita el acceso y deja la acción de cancelarla en Stripe (8.6)
select pg_temp.is(pg_temp.charge('evt-p4-8', 'refunded', :'u14', 'subscription', null, 'in_p4_14b', 1350), 'applied',
  'P4. El reembolso debía aplicarse');
select pg_temp.expect(
  (select status from public.payments where provider_payment_id = 'in_p4_14b') = 'refunded'
  and public.user_plan(:'u14') = 'free'
  and pg_temp.action_for('sub_p4_14') = 'refund'
  and (select user_id from public.billing_actions where target = 'sub_p4_14') = :'u14',
  'P4. El reembolso debía quitar el acceso y dejar la acción de cancelar'
);
-- Un aviso tardío del cobro devuelto no lo reactiva
select pg_temp.is(pg_temp.charge('evt-p4-8b', 'paid', :'u14', 'subscription', 'annual', 'in_p4_14b', 1350, 'sub_p4_14'),
  'ignored', 'P4. Un cobro devuelto debía ignorarse');
select pg_temp.is(public.user_plan(:'u14'), 'free', 'P4. Un cobro devuelto no debía reactivar el plan');
-- Dos suscripciones a la vez. La segunda se marca, su cobro queda para devolver y la primera sigue
select pg_temp.state('evt-p4-9', :'u15', 'sub_p4_15a', 'monthly', 'active');
select pg_temp.charge('evt-p4-9c', 'paid', :'u15', 'subscription', 'monthly', 'in_p4_15a', 149, 'sub_p4_15a',
  p_period_end => now() + interval '30 days');
select pg_temp.is(pg_temp.charge('evt-p4-10c', 'paid', :'u15', 'subscription', 'annual', 'in_p4_15b', 1499, 'sub_p4_15b',
  p_period_end => now() + interval '365 days'), 'applied', 'P4. El cobro de la segunda suscripción debía aplicarse');
select pg_temp.is(pg_temp.state('evt-p4-10', :'u15', 'sub_p4_15b', 'annual', 'active'), 'ignored',
  'P4. El estado de la segunda suscripción debía ignorarse');
select pg_temp.expect(
  (select status from public.payments where provider_payment_id = 'in_p4_15b') = 'needs_refund'
  and pg_temp.action_for('sub_p4_15b') = 'second_subscription'
  and (select provider_subscription_id from public.subscriptions where user_id = :'u15') = 'sub_p4_15a'
  and public.user_plan(:'u15') = 'monthly'
  and pg_temp.mp(:'u15') ->> 'issue' = 'second_subscription',
  'P4. La segunda suscripción debía marcarse sin tocar la primera'
);
-- La segunda que llega primero por su estado también se marca
select pg_temp.is(pg_temp.state('evt-p4-11', :'u15', 'sub_p4_15c', 'monthly', 'active'), 'second_subscription',
  'P4. El estado de una segunda suscripción debía marcarse');
select pg_temp.is(pg_temp.action_for('sub_p4_15c'), 'second_subscription', 'P4. Faltó la acción de la segunda suscripción');
-- Alumno desconocido y plan sin reconocer
select pg_temp.is(pg_temp.state('evt-p4-12', 'ffffffff-ffff-ffff-ffff-fffffffffff1', 'sub_x', 'monthly', 'active'),
  'unknown_user', 'P4. Un alumno desconocido debía reconocerse');
select pg_temp.is(pg_temp.state('evt-p4-13', :'u0b', 'sub_p4_0b', null, 'active'), 'ignored',
  'P4. Una suscripción nueva sin plan reconocido debía ignorarse');
select pg_temp.expect(not exists (select 1 from public.subscriptions where user_id = :'u0b'),
  'P4. Un plan sin reconocer no debía guardar nada');
select pg_temp.expect(
  pg_temp.fails_with($q$select pg_temp.state('evt-p4-14', 'ba100000-0000-0000-0000-00000000000b', 'sub_y', 'monthly', 'pausada')$q$) = '22023'
  and pg_temp.fails_with($q$select pg_temp.charge('evt-p4-15', 'regalo', 'ba100000-0000-0000-0000-00000000000b', 'pass', 'monthly', 'x')$q$) = '22023'
  and pg_temp.fails_with($q$select pg_temp.charge('evt-p4-16', 'paid', 'ba100000-0000-0000-0000-00000000000b', 'pase', 'monthly', 'x')$q$) = '22023',
  'P4. Un estado, un tipo o un propósito desconocidos debían rechazarse'
);
-- Un reembolso completo revierte el referido (B7 sigue)
begin;
select pg_temp.as_user(:'u12');
select public.my_referral_code();
commit;
create temp table p4_code as select code from public.referral_codes where user_id = :'u12';
grant select on p4_code to authenticated;
begin;
select pg_temp.as_user(:'u13');
select pg_temp.is(public.redeem_referral_code((select code from p4_code)), 'ok', 'P4. El referido debía canjear el código');
commit;
select pg_temp.trial('evt-p4-17', :'u13', 'sub_p4_13', 'monthly');
select pg_temp.is((select status from public.referrals where referred_id = :'u13'), 'pending',
  'P4. La prueba no debía concretar el referido');
select pg_temp.charge('evt-p4-17c', 'paid', :'u13', 'subscription', 'monthly', 'in_p4_13', 149, 'sub_p4_13',
  p_period_end => now() + interval '37 days');
select pg_temp.expect(
  (select status from public.referrals where referred_id = :'u13') = 'completed'
  and public.user_plan(:'u12') = 'monthly',
  'P4. El primer cobro después de la prueba debía concretar el referido'
);
select pg_temp.is(pg_temp.charge('evt-p4-17r', 'refunded', :'u13', 'subscription', null, 'in_p4_13', 149), 'applied',
  'P4. El reembolso del primer cobro debía aplicarse');
select pg_temp.expect(
  (select reverted_at is not null from public.referrals where referred_id = :'u13')
  and public.user_plan(:'u12') = 'free',
  'P4. El reembolso completo debía revertir el referido'
);

-- ===================================================================== P5. checkout_context
-- Sin nada
select pg_temp.expect(
  public.checkout_context(:'u0b') @> '{"inForce":null,"subscription":null,"passEnd":null,"trialAvailable":true,"trialDays":7,"founderOpen":true,"founderLost":false,"oxxoExpiresDays":3,"customerId":null}'::jsonb
  and (public.checkout_context(:'u0b') ->> 'founderSeatsLeft')::integer = 100 - public.founder_seats_taken(),
  'P5. Sin plan checkout_context no era el esperado'
);
-- Con su cliente de Stripe
select public.record_billing_customer('stripe', 'cus_p5_0b', :'u0b');
select pg_temp.is(public.checkout_context(:'u0b') ->> 'customerId', 'cus_p5_0b', 'P5. Faltó el cliente');
-- En prueba
select pg_temp.expect(
  public.checkout_context(:'u01') @> '{"inForce":"subscription","subscription":{"plan":"founder","status":"trialing","provider":"stripe","subscriptionId":"sub_p1_01","cancelAtPeriodEnd":false},"trialAvailable":false}'::jsonb
  and (public.checkout_context(:'u01') -> 'subscription' ->> 'periodEnd') is not null,
  'P5. En prueba checkout_context no era el esperado'
);
-- Con pase
select pg_temp.expect(
  public.checkout_context(:'u11') @> '{"inForce":"pass","subscription":null}'::jsonb
  and (public.checkout_context(:'u11') ->> 'passEnd')::timestamptz > now() + interval '1 year',
  'P5. Con pase checkout_context no era el esperado'
);
-- Terminada
select pg_temp.expect(
  public.checkout_context(:'u14') @> '{"inForce":null,"subscription":{"status":"canceled"}}'::jsonb,
  'P5. Terminada checkout_context no era el esperado'
);
select pg_temp.is(pg_temp.fails_with($q$select public.checkout_context(null)$q$), '22023',
  'P5. checkout_context sin alumno debía rechazarse');

-- ===================================================================== P6. Permisos
do $$
declare
  v_fn text;
begin
  foreach v_fn in array array[
    'public.checkout_context(uuid)',
    'public.apply_charge(text, text, jsonb, text, uuid, text, text, text, text, text, text, numeric, numeric, text, timestamptz, timestamptz)',
    'public.apply_subscription_state(text, text, timestamptz, jsonb, uuid, text, text, text, timestamptz, timestamptz, boolean, boolean, text, text)',
    'public.note_trial_will_end(text, text, jsonb, uuid, text, timestamptz)',
    'public.claim_billing_actions(integer, text)',
    'public.finish_billing_action(uuid, boolean, text)',
    'public.apply_payment_notice(text, text, jsonb, text, uuid, text, text, text, numeric, timestamptz)'] loop
    if has_function_privilege('authenticated', v_fn, 'execute') or has_function_privilege('anon', v_fn, 'execute')
       or not has_function_privilege('service_role', v_fn, 'execute') then
      raise exception 'FALLA P6. % debe ser solo del servidor', v_fn;
    end if;
  end loop;
  foreach v_fn in array array[
    'public.trial_email_key(text)', 'public.trial_account_key(uuid)', 'public.founder_seats_taken()',
    'public.founder_seats_total()', 'public.founder_promo_open()', 'public.trial_available(uuid)',
    'public.trial_already_used(uuid)', 'public.user_plan(uuid)', 'public.billing_blocks_account_deletion(uuid)',
    'public.subscriptions_sync_founder_seat()', 'public.billing_refund_payment(uuid, boolean, text)',
    'public.billing_take_seat(uuid, text, text, text, text)', 'public.billing_close_subscription(text, text)',
    'public.billing_register_event(text, text, jsonb)', 'public.billing_event_done(text, text, text)',
    'public.billing_queue_cancel(uuid, text, text, text)', 'public.billing_mark_issue(uuid, text, text)',
    'public.billing_in_force(text, text, timestamptz)', 'public.billing_promo_code(text)'] loop
    if has_function_privilege('authenticated', v_fn, 'execute') or has_function_privilege('anon', v_fn, 'execute')
       or has_function_privilege('service_role', v_fn, 'execute') then
      raise exception 'FALLA P6. % es interna y nadie debe ejecutarla por la API', v_fn;
    end if;
  end loop;
  foreach v_fn in array array[
    'public.my_plan()', 'public.delete_my_account()', 'public.admin_billing_summary()',
    'public.admin_recent_payments(integer, integer)', 'public.admin_mark_payment_refunded(uuid, text)',
    'public.admin_promotion_code_stats()'] loop
    if not has_function_privilege('authenticated', v_fn, 'execute') or has_function_privilege('anon', v_fn, 'execute') then
      raise exception 'FALLA P6. % debe ser solo para sesiones iniciadas', v_fn;
    end if;
  end loop;
end $$;

-- Un alumno no ve las funciones del admin ni las tablas internas, y sus pases solo desde su dispositivo
begin;
select pg_temp.as_user(:'u05', 'ses-p6-a');
select public.claim_device('dev-p6-a', 'Chrome');
select pg_temp.expect(
  pg_temp.fails_with('select public.admin_billing_summary()') = '42501'
  and pg_temp.fails_with('select * from public.admin_recent_payments()') = '42501'
  and pg_temp.fails_with('select * from public.admin_promotion_code_stats()') = '42501'
  and pg_temp.fails_with($q$select public.admin_mark_payment_refunded(gen_random_uuid(), 'nota')$q$) = '42501',
  'P6. Un alumno llamó a una función del admin'
);
select pg_temp.expect(
  pg_temp.is_blocked('select * from public.founder_seats')
  and pg_temp.is_blocked('select * from public.trial_claims')
  and pg_temp.is_blocked('select * from public.billing_actions')
  and pg_temp.is_blocked('select * from public.email_outbox')
  and pg_temp.is_blocked($q$insert into public.plan_passes (user_id, plan, provider, provider_payment_id, method, starts_at, ends_at) values (auth.uid(), 'annual', 'stripe', 'x', 'oxxo', now(), now() + interval '1 year')$q$),
  'P6. Un alumno tocó una tabla interna o se dio un pase'
);
select pg_temp.expect(
  (select count(*) from public.plan_passes) = 2
  and (select count(*) from public.plan_passes where user_id <> auth.uid()) = 0,
  'P6. Un alumno debía ver solo sus pases'
);
commit;
begin;
select pg_temp.as_user(:'u05', 'ses-p6-b');
select public.claim_device('dev-p6-b', 'Safari');
commit;
begin;
select pg_temp.as_user(:'u05', 'ses-p6-a');
select pg_temp.expect(
  (select count(*) from public.plan_passes) = 0 and pg_temp.fails_with('select public.my_plan()') = '42501',
  'P6. El dispositivo desplazado leyó sus pases o su plan'
);
commit;
begin;
set local role anon;
select pg_temp.expect(
  pg_temp.is_blocked('select * from public.plan_passes')
  and pg_temp.is_blocked('select public.my_plan()')
  and pg_temp.is_blocked('select public.admin_billing_summary()')
  and pg_temp.is_blocked($q$select public.checkout_context('ba100000-0000-0000-0000-000000000001')$q$),
  'P6. anon llegó a algo de pagos'
);
rollback;

-- El admin ve el resumen, los pagos y los códigos, y marca como devuelto un pase OXXO (8.7)
select pg_temp.charge('evt-p6-oxxo', 'paid', :'u0b', 'pass', 'monthly', 'pi_p6_0b', 134.1, null, 'oxxo', 'pi_p6_0b',
  p_discount => 14.9, p_code => 'PRUEBA10');
-- Las pruebas que trae el código, contadas aparte porque el admin no lee trial_claims directo
create temp table p6_trials as
  select count(*) as trials from public.trial_claims where promotion_code = 'PRUEBA10' and status <> 'voided';
grant select on p6_trials to authenticated;
begin;
select pg_temp.as_user(:'adm');
select pg_temp.expect(
  public.admin_billing_summary() ?& array['founder', 'activeTrials', 'activePasses', 'needsRefund', 'pendingActions', 'failedActions', 'pendingInvoices']
  and (public.admin_billing_summary() -> 'founder' ->> 'total')::integer = 100
  and (public.admin_billing_summary() ->> 'needsRefund')::integer >= 3
  and (public.admin_billing_summary() ->> 'pendingActions')::integer >= 7
  and (public.admin_billing_summary() ->> 'activeTrials')::integer >= 3,
  'P6. El resumen del admin no era el esperado'
);
select pg_temp.expect(
  (select count(*) from public.admin_recent_payments(100, 0) r
    where r.promotion_code = 'PRUEBA10' and r.method = 'oxxo' and r.alias = 'Apagada' and r.purpose = 'pass') = 1
  and (select max(total) from public.admin_recent_payments(5, 0)) > 5
  and (select count(*) from public.admin_recent_payments(5, 0)) = 5,
  'P6. Los pagos recientes no eran los esperados'
);
select pg_temp.expect(
  exists (
    select 1 from public.admin_promotion_code_stats() s
    where s.code = 'PRUEBA10' and s.payments = 1 and s.paying_users = 1 and s.revenue_mxn = 134.1
      and s.trials = (select trials from p6_trials)
      and s.trials >= 1
  ),
  'P6. Los códigos de descuento no se contaron'
);
select pg_temp.is(
  public.admin_mark_payment_refunded((select id from public.payments where provider_payment_id = 'pi_p6_0b'), 'Devuelto por transferencia'),
  'refunded', 'P6. El admin no pudo marcar el pase como devuelto');
select pg_temp.is(
  public.admin_mark_payment_refunded((select id from public.payments where provider_payment_id = 'pi_p6_0b'), 'Otra vez'),
  'already_refunded', 'P6. Marcar dos veces debía decir que ya estaba devuelto');
select pg_temp.is(
  pg_temp.fails_with($q$select public.admin_mark_payment_refunded((select id from public.payments where provider_payment_id = 'pi_p1_05b'), '  ')$q$),
  '22023', 'P6. Marcar sin nota debía rechazarse');
commit;
select pg_temp.expect(
  (select status = 'refunded' and admin_note = 'Devuelto por transferencia' and refunded_at is not null
     from public.payments where provider_payment_id = 'pi_p6_0b')
  and (select status from public.plan_passes where provider_payment_id = 'pi_p6_0b') = 'refunded'
  and public.user_plan(:'u0b') = 'free',
  'P6. Marcar como devuelto debía quitar el pase y guardar la nota'
);

-- Acciones con la pasarela. Se toman una vez, no se repiten en 2 minutos y se cierran
select pg_temp.is((select count(*) from public.claim_billing_actions(20, 'mercadopago'))::text, '0',
  'P6. No debía haber acciones de Mercado Pago');
create temp table p6_claimed as select * from public.claim_billing_actions(20, 'stripe');
select pg_temp.expect(
  (select count(*) from p6_claimed) >= 7 and (select bool_and(attempts = 1) from p6_claimed),
  'P6. Las acciones de Stripe debían tomarse con un intento'
);
select pg_temp.is((select count(*) from public.claim_billing_actions(20, 'stripe'))::text, '0',
  'P6. Una acción recién tomada no debía repetirse');
select public.finish_billing_action((select id from p6_claimed where target = 'sub_p4_15b'), true, null);
select public.finish_billing_action((select id from p6_claimed where target = 'sub_p4_15c'), false, 'Stripe respondió 500');
select pg_temp.expect(
  (select status = 'done' and done_at is not null from public.billing_actions where target = 'sub_p4_15b')
  and (select status = 'failed' and last_error = 'Stripe respondió 500' from public.billing_actions where target = 'sub_p4_15c'),
  'P6. Las acciones no se cerraron'
);
update public.billing_actions set claimed_at = now() - interval '5 minutes' where target = 'sub_p4_15c';
select pg_temp.is((select attempts from public.claim_billing_actions(20, 'stripe') where target = 'sub_p4_15c')::text, '2',
  'P6. Una acción fallida debía reintentarse');

-- ===================================================================== P7. Borrar la cuenta
-- Con una prueba activa
select pg_temp.trial('evt-p7-16', :'u16', 'sub_p7_16', 'monthly');
begin;
select pg_temp.as_user(:'u16');
select pg_temp.is(pg_temp.fails_with('select public.delete_my_account()'), 'FR002', 'P7. Borró la cuenta con una prueba activa');
rollback;
-- Con Mercado Pago activo
select pg_temp.state('evt-p7-17', :'u17', 'mp_pre_17', 'monthly', 'active', p_provider => 'mercadopago');
begin;
select pg_temp.as_user(:'u17');
select pg_temp.is(pg_temp.fails_with('select public.delete_my_account()'), 'FR002', 'P7. Borró la cuenta con Mercado Pago activo');
rollback;
-- Cancelada al final del periodo sí se puede
select pg_temp.state('evt-p7-18', :'u18', 'sub_p7_18', 'monthly', 'active');
select pg_temp.state('evt-p7-18x', :'u18', 'sub_p7_18', 'monthly', 'active', p_cancel => true);
begin;
select pg_temp.as_user(:'u18');
select public.delete_my_account();
commit;
select pg_temp.expect(
  not exists (select 1 from auth.users where id = :'u18')
  and not exists (select 1 from public.subscriptions where user_id = :'u18'),
  'P7. No borró la cuenta con la suscripción cancelada al final del periodo'
);
-- El lugar de un Fundador que borra su cuenta sigue contando sin dueño (respuesta 17)
create temp table p7_seats as select public.founder_seats_taken() as taken,
  (select count(*) from public.founder_seats where user_id is null) as orphans;
update public.subscriptions set status = 'canceled', current_period_end = now() - interval '1 day' where user_id = :'u0f';
begin;
select pg_temp.as_user(:'u0f');
select public.delete_my_account();
commit;
select pg_temp.expect(
  (select count(*) from public.founder_seats where user_id is null) = (select orphans + 1 from p7_seats)
  and public.founder_seats_taken() = (select taken from p7_seats),
  'P7. El lugar de una cuenta borrada debía seguir contando'
);

-- ===================================================================== P8. Compatibilidad
-- payments_test.sql, billing_portal_test.sql y referral_first_charge_test.sql corren antes con
-- apply_payment_notice y siguen pasando. Además, su cobro no pisa el plan de una suscripción vigente
select pg_temp.is(pg_temp.state('evt-p8', :'u0c', 'sub_p3_0c_mano', 'founder_annual', 'active'), 'applied',
  'P8. El cambio de plan debía aplicarse');
select pg_temp.is(
  public.apply_payment_notice('stripe', 'evt-p8-viejo', '{}', 'paid', :'u0c', 'founder', 'in_p8', 'sub_p3_0c_mano', 79, null),
  'applied', 'P8. El aviso de la forma anterior debía aplicarse');
select pg_temp.expect(
  (select plan from public.subscriptions where user_id = :'u0c') = 'founder_annual' and pg_temp.seat_of(:'u0c') = 'confirmed',
  'P8. apply_payment_notice pisó el plan de la suscripción vigente'
);

-- ===================================================================== P9. Limpieza de pagos de prueba
-- supabase/manual/limpiar-pagos-de-prueba.sql borra todo lo de pagos de las cuentas de prueba
insert into auth.users (id, email, raw_user_meta_data) values
  (:'ra', 'ricardo-a@ba.mx', '{"alias":"Prueba A"}'),
  (:'rb', 'ricardo-b@ba.mx', '{"alias":"Prueba B"}');
select pg_temp.trial('evt-p9-a', :'ra', 'sub_p9_a', 'founder');
select pg_temp.trial('evt-p9-b', :'rb', 'sub_p9_b', 'monthly');
select pg_temp.is(pg_temp.state('evt-p9-b2', :'rb', 'sub_p9_b2', 'monthly', 'active'), 'second_subscription',
  'P9. La segunda suscripción de prueba debía marcarse');
select pg_temp.charge('evt-p9-c', 'paid', :'ra', 'subscription', 'founder', 'in_p9_a', 79, 'sub_p9_a');
select public.record_billing_customer('stripe', 'cus_p9_a', :'ra');
select pg_temp.is(public.note_trial_will_end('stripe', 'evt-p9-t', '{}', :'rb', 'sub_p9_b', now() + interval '3 days'),
  'queued', 'P9. El correo de fin de prueba debía encolarse');
select pg_temp.expect(
  (select count(*) from public.founder_seats where user_id = :'ra') = 1
  and (select count(*) from public.trial_claims where user_id in (:'ra', :'rb')) = 2
  and pg_temp.action_for('sub_p9_b2') = 'second_subscription'
  and (select count(*) from public.email_outbox where recipient_user = :'rb') = 1,
  'P9. Las cuentas de prueba no quedaron con pagos'
);
\ir ../manual/limpiar-pagos-de-prueba.sql
select pg_temp.expect(
  not exists (select 1 from public.payments where user_id in (:'ra', :'rb'))
  and not exists (select 1 from public.subscriptions where user_id in (:'ra', :'rb'))
  and not exists (select 1 from public.billing_customers where user_id in (:'ra', :'rb'))
  and not exists (select 1 from public.founder_seats where user_id in (:'ra', :'rb'))
  and not exists (select 1 from public.trial_claims where user_id in (:'ra', :'rb'))
  and not exists (select 1 from public.email_outbox where recipient_user in (:'ra', :'rb'))
  and pg_temp.action_for('sub_p9_b2') is null
  and exists (select 1 from auth.users where id = :'ra'),
  'P9. La limpieza dejó filas de pago de las cuentas de prueba'
);

-- ===================================================================== P10. Comprobación de docs/SUPABASE.md
-- La misma consulta que la guía pide correr después de aplicar las tres migraciones de B10
create temp table p10 as
select
  (select count(*) from pg_tables where schemaname = 'public'
     and tablename in ('founder_seats', 'trial_claims', 'plan_passes', 'billing_actions', 'email_kinds', 'email_outbox',
                       'invoice_requests')) as tablas_nuevas,
  (select bool_and(relrowsecurity) from pg_class where oid in (
     'public.founder_seats'::regclass, 'public.trial_claims'::regclass, 'public.plan_passes'::regclass,
     'public.billing_actions'::regclass, 'public.email_kinds'::regclass, 'public.email_outbox'::regclass,
     'public.invoice_requests'::regclass)) as tablas_con_seguridad_por_fila,
  has_function_privilege('authenticated', 'public.apply_charge(text, text, jsonb, text, uuid, text, text, text, text, text, text, numeric, numeric, text, timestamptz, timestamptz)', 'execute') as alumno_aplica_cobros,
  has_function_privilege('service_role', 'public.apply_subscription_state(text, text, timestamptz, jsonb, uuid, text, text, text, timestamptz, timestamptz, boolean, boolean, text, text)', 'execute') as servicio_aplica_estados,
  has_function_privilege('authenticated', 'public.checkout_context(uuid)', 'execute') as alumno_lee_contexto,
  has_table_privilege('authenticated', 'public.founder_seats', 'select') as alumno_lee_lugares,
  has_function_privilege('authenticated', 'public.request_invoice(uuid, text, text, text, text, text, text)', 'execute') as alumno_pide_factura,
  (select pg_get_constraintdef(oid) like '%founder_annual%' from pg_constraint where conname = 'subscriptions_plan_check') as plan_fundador_anual,
  (select pg_get_constraintdef(oid) like '%trialing%' from pg_constraint where conname = 'subscriptions_status_check') as estado_prueba,
  position('billing_blocks_account_deletion' in pg_get_functiondef('public.delete_my_account()'::regprocedure)) > 0 as borrar_cuenta_b10,
  (select value ->> 'trialDays' from public.platform_settings where key = 'billing_rules') as dias_de_prueba,
  (select value ->> 'enabled' from public.platform_settings where key = 'billing_emails') as correos_encendidos,
  (select count(*) from pg_policies
    where schemaname = 'public'
      and coalesce(qual, '') || coalesce(with_check, '') like '%is_active_device%') as politicas_con_barrera;
select pg_temp.expect(
  (select tablas_nuevas = 7 and tablas_con_seguridad_por_fila and not alumno_aplica_cobros and servicio_aplica_estados
      and not alumno_lee_contexto and not alumno_lee_lugares and alumno_pide_factura and plan_fundador_anual
      and estado_prueba and borrar_cuenta_b10 and dias_de_prueba = '7' and correos_encendidos = 'false'
      and politicas_con_barrera = 33
   from p10),
  'P10. La consulta de comprobación de docs/SUPABASE.md no da lo que dice la guía'
);

select 'TODAS LAS PRUEBAS DE PAGOS COMPLETOS PASARON' as resultado;
