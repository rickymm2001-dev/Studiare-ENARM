-- Pruebas de la analítica de producto (migración 20261029000002, B15 del plan del cambio, 1.3 y 1.7 a 1.10 del
-- diseño). Corre después de reminders_test.sql sobre la misma base, con usuarios propios. Cada bloque falla
-- con un error si algo no cumple.
--   A1 el ID seudónimo, A2 el permiso, A3 sin permiso no se encola nada, A4 con analytics apagado tampoco,
--   A5 con los dos cada cambio de dinero encola su evento, A6 un error en el disparador no rompe el pago,
--   A7 lo que cabe en la cola y quién la toca, A8 las fichas de Cron contra Vault, A9 reclamar y cerrar
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

create or replace function pg_temp.switch(p_enabled boolean) returns void language sql as $$
  update public.platform_settings set value = jsonb_build_object('enabled', p_enabled) where key = 'analytics'
$$;

-- Un aviso de estado de la suscripción de Stripe
create or replace function pg_temp.state(
  p_event text, p_user text, p_sub text, p_plan text, p_status text, p_cancel boolean default false,
  p_trial_end timestamptz default null
) returns text language sql as $$
  select public.apply_subscription_state('stripe', p_event, now(), '{}', p_user::uuid, p_sub, p_plan, p_status,
    now() + interval '30 days', p_trial_end, p_cancel, false, null, null)
$$;

-- Un cobro o un reembolso de Stripe de una suscripción
create or replace function pg_temp.charge(
  p_event text, p_kind text, p_user text, p_payment text, p_amount numeric, p_plan text default 'monthly',
  p_sub text default null, p_purpose text default 'subscription', p_method text default 'card'
) returns text language sql as $$
  select public.apply_charge('stripe', p_event, jsonb_build_object('id', p_event), p_kind, p_user::uuid,
    p_purpose, p_plan, p_method, p_payment, null, p_sub, p_amount, null, null, null, null)
$$;

-- Los eventos de un alumno, en orden, con sus propiedades
create or replace function pg_temp.events_of(p_user text) returns jsonb language sql as $$
  select coalesce(jsonb_agg(jsonb_build_object('event', event, 'properties', properties) order by created_at, event), '[]'::jsonb)
  from public.analytics_outbox where user_id = p_user::uuid
$$;

-- ===================================================================== Usuarios
\set a 'ba150000-0000-0000-0000-000000000101'
\set b 'ba150000-0000-0000-0000-000000000102'
\set c 'ba150000-0000-0000-0000-000000000103'
\set d 'ba150000-0000-0000-0000-000000000104'
\set e 'ba150000-0000-0000-0000-000000000105'
\set f 'ba150000-0000-0000-0000-000000000106'
\set g 'ba150000-0000-0000-0000-000000000107'
insert into auth.users (id, email, raw_user_meta_data, email_confirmed_at) values
  (:'a', 'aa@r15.mx', '{"alias":"Alumna A"}', now()),
  (:'b', 'ab@r15.mx', '{"alias":"Alumno B"}', now()),
  (:'c', 'ac@r15.mx', '{"alias":"Alumna C"}', now()),
  (:'d', 'ad@r15.mx', '{"alias":"Alumno D"}', now()),
  (:'e', 'ae@r15.mx', '{"alias":"Alumna E"}', now()),
  (:'f', 'af@r15.mx', '{"alias":"Alumno F"}', now()),
  (:'g', 'ag@r15.mx', '{"alias":"Alumna G"}', now());

-- ===================================================================== Permisos de lo nuevo
do $$
declare
  v_fn text;
begin
  foreach v_fn in array array['public.analytics_identity()', 'public.set_analytics_consent(boolean)'] loop
    if not has_function_privilege('authenticated', v_fn, 'execute') or has_function_privilege('anon', v_fn, 'execute')
       or has_function_privilege('service_role', v_fn, 'execute') then
      raise exception 'FALLA A7. % debe ser solo de una sesión iniciada', v_fn;
    end if;
  end loop;
  foreach v_fn in array array['public.claim_analytics_batch(integer)', 'public.finish_analytics_batch(uuid[], text)',
    'public.analytics_tick_ok(text)'] loop
    if has_function_privilege('authenticated', v_fn, 'execute') or has_function_privilege('anon', v_fn, 'execute')
       or not has_function_privilege('service_role', v_fn, 'execute') then
      raise exception 'FALLA A7. % debe ser solo del servidor', v_fn;
    end if;
  end loop;
  foreach v_fn in array array['public.analytics_props_ok(jsonb)', 'public.analytics_enqueue(uuid, text, jsonb, timestamptz)',
    'public.analytics_on_subscription()', 'public.analytics_on_payment()'] loop
    if has_function_privilege('authenticated', v_fn, 'execute') or has_function_privilege('anon', v_fn, 'execute')
       or has_function_privilege('service_role', v_fn, 'execute') then
      raise exception 'FALLA A7. % es interna', v_fn;
    end if;
  end loop;
  if exists (
    select 1 from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
    where ns.nspname = 'public' and p.prosecdef
      and p.proname in ('analytics_identity', 'set_analytics_consent', 'analytics_enqueue', 'analytics_on_subscription',
        'analytics_on_payment', 'claim_analytics_batch', 'finish_analytics_batch', 'analytics_tick_ok')
      and not exists (select 1 from unnest(p.proconfig) c where c like 'search_path=%')
  ) then
    raise exception 'FALLA A7. Una función con security definer no fija search_path';
  end if;
  foreach v_fn in array array['analytics_subjects', 'analytics_outbox'] loop
    if has_table_privilege('anon', 'public.' || v_fn, 'select,insert,update,delete')
       or has_table_privilege('authenticated', 'public.' || v_fn, 'select,insert,update,delete')
       or has_table_privilege('service_role', 'public.' || v_fn, 'select,insert,update,delete')
       or not (select relrowsecurity from pg_class where oid = ('public.' || v_fn)::regclass) then
      raise exception 'FALLA A7. % tiene permisos de tabla para la API o no tiene RLS', v_fn;
    end if;
  end loop;
end $$;
-- El interruptor nace apagado
select pg_temp.expect((select value = '{"enabled":false}'::jsonb from public.platform_settings where key = 'analytics'),
  'A4. El interruptor analytics debía nacer apagado');
begin;
select pg_temp.as_user(:'a');
select pg_temp.expect(
  pg_temp.is_blocked('select * from public.analytics_subjects')
  and pg_temp.is_blocked('select * from public.analytics_outbox')
  and pg_temp.is_blocked($q$update public.analytics_subjects set consent = true$q$)
  and pg_temp.is_blocked('select public.claim_analytics_batch(1)')
  and pg_temp.is_blocked('select public.finish_analytics_batch(array[gen_random_uuid()], $$sent$$)')
  and pg_temp.is_blocked($q$select public.analytics_tick_ok('x')$q$)
  and pg_temp.is_blocked($q$select public.analytics_enqueue(auth.uid(), 'trial_started', '{}', now())$q$),
  'A7. Un alumno tocó las tablas o las funciones del servidor de la analítica'
);
rollback;
begin;
select pg_temp.as_anon();
select pg_temp.expect(
  pg_temp.is_blocked('select public.analytics_identity()') and pg_temp.is_blocked('select public.set_analytics_consent(true)'),
  'A7. Un anónimo llamó a la analítica');
rollback;
begin;
select set_config('request.jwt.claims', '{"role":"authenticated"}', true);
set local role authenticated;
select pg_temp.is(pg_temp.fails_with('select public.analytics_identity()'), '28000', 'A7. Sin sub debía pedir iniciar sesión');
rollback;

-- ===================================================================== A1. El ID seudónimo
begin;
select pg_temp.as_user(:'a');
create temp table a1 as select public.analytics_identity() as first, public.analytics_identity() as second;
select pg_temp.expect(
  (select (first ->> 'analyticsId') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          and first ->> 'consent' = 'false' and first = second from a1),
  'A1. analytics_identity debía devolver un uuid y el permiso apagado, igual la segunda vez'
);
rollback;
select pg_temp.expect((select count(*) from public.analytics_subjects where user_id = :'a') = 0, 'A1. La prueba dejó filas');
begin;
select pg_temp.as_user(:'a');
select public.analytics_identity();
commit;
begin;
select pg_temp.as_user(:'b');
select public.analytics_identity();
commit;
select pg_temp.expect(
  (select count(*) = 2 and count(distinct analytics_id) = 2 and bool_and(not consent) from public.analytics_subjects
    where user_id in (:'a', :'b'))
  and (select analytics_id::text <> user_id::text from public.analytics_subjects where user_id = :'a'),
  'A1. Cada alumno debía tener su propio ID, distinto del de su cuenta, y sin permiso'
);
-- Cada quien recibe el suyo, no el de otro alumno que ya tenga fila
begin;
select pg_temp.as_user(:'b');
create temp table a1_b as select public.analytics_identity() as r;
commit;
begin;
select pg_temp.as_user(:'a');
create temp table a1_a as select public.analytics_identity() as r;
commit;
select pg_temp.expect(
  (select r ->> 'analyticsId' from a1_b) = (select analytics_id::text from public.analytics_subjects where user_id = :'b')
  and (select r ->> 'analyticsId' from a1_a) = (select analytics_id::text from public.analytics_subjects where user_id = :'a')
  and (select r ->> 'analyticsId' from a1_a) <> (select r ->> 'analyticsId' from a1_b),
  'A1. analytics_identity debía devolver el ID de quien llama y no el de otro alumno');
-- El ID es aleatorio, no se deriva de nada: borrar la fila y volver a pedirlo da otro
select analytics_id as id_a from public.analytics_subjects where user_id = :'a' \gset
delete from public.analytics_subjects where user_id = :'a';
begin;
select pg_temp.as_user(:'a');
select public.analytics_identity();
commit;
select pg_temp.expect((select analytics_id::text <> :'id_a' from public.analytics_subjects where user_id = :'a'),
  'A1. El ID no es aleatorio');

-- ===================================================================== A3 y A4. Sin permiso o apagado no se encola nada
-- c tiene el permiso y analytics apagado (A4). d no tiene el permiso y analytics prendido (A3)
begin;
select pg_temp.as_user(:'c');
select public.set_analytics_consent(true);
commit;
begin;
select pg_temp.as_user(:'d');
select public.analytics_identity();
commit;
select pg_temp.switch(false);
select pg_temp.state('evt-a4-1', :'c', 'sub_a4_c', 'monthly', 'trialing', false, now() + interval '7 days');
select pg_temp.charge('evt-a4-2', 'paid', :'c', 'pi_a4_c', 149, 'monthly', 'sub_a4_c');
select pg_temp.expect((select count(*) from public.analytics_outbox where user_id = :'c') = 0,
  'A4. Con analytics apagado se encoló un evento');
select pg_temp.switch(true);
select pg_temp.state('evt-a3-1', :'d', 'sub_a3_d', 'monthly', 'trialing', false, now() + interval '7 days');
select pg_temp.charge('evt-a3-2', 'paid', :'d', 'pi_a3_d', 149, 'monthly', 'sub_a3_d');
select pg_temp.state('evt-a3-3', :'d', 'sub_a3_d', 'monthly', 'active', true);
select pg_temp.charge('evt-a3-4', 'refunded', :'d', 'pi_a3_d', 149, 'monthly', 'sub_a3_d');
select pg_temp.expect((select count(*) from public.payments where user_id = :'d') >= 1 and (select count(*) from public.analytics_outbox where user_id = :'d') = 0,
  'A3. Sin el permiso se encoló un evento');
-- Una persona sin fila en analytics_subjects tampoco
select pg_temp.state('evt-a3-5', :'e', 'sub_a3_e', 'annual', 'trialing', false, now() + interval '7 days');
select pg_temp.expect((select count(*) from public.analytics_outbox where user_id = :'e') = 0 and not exists (select 1 from public.analytics_subjects where user_id = :'e'),
  'A3. Sin ID ni permiso se encoló un evento o se creó un ID');

-- ===================================================================== A5. Con los dos, cada cambio encola su evento
-- b da el permiso y sigue la vida de una suscripción: prueba, primer cobro, segundo cobro, cancelación
-- programada, cancelación, reembolso
begin;
select pg_temp.as_user(:'b');
select public.set_analytics_consent(true);
commit;
select analytics_id as id_b from public.analytics_subjects where user_id = :'b' \gset
select pg_temp.state('evt-a5-1', :'b', 'sub_a5_b', 'founder', 'trialing', false, now() + interval '7 days');
select pg_temp.expect(pg_temp.events_of(:'b') = '[{"event":"trial_started","properties":{"plan":"founder"}}]'::jsonb,
  'A5. La prueba debía encolar trial_started con el plan');
select pg_temp.charge('evt-a5-2', 'paid', :'b', 'pi_a5_b1', 79, 'founder', 'sub_a5_b');
select pg_temp.expect(
  pg_temp.events_of(:'b') @> '[{"event":"trial_converted","properties":{"plan":"founder"}}]'::jsonb
  and pg_temp.events_of(:'b') @> '[{"event":"payment_succeeded","properties":{"plan":"founder","purpose":"subscription","method":"card","first":true}}]'::jsonb
  and jsonb_array_length(pg_temp.events_of(:'b')) = 3,
  'A5. El primer cobro debía encolar trial_converted y payment_succeeded con first en true');
select pg_temp.charge('evt-a5-3', 'paid', :'b', 'pi_a5_b2', 79, 'founder', 'sub_a5_b');
select pg_temp.expect(
  (select count(*) from public.analytics_outbox where user_id = :'b' and event = 'payment_succeeded') = 2
  and (select properties ->> 'first' from public.analytics_outbox where user_id = :'b' and event = 'payment_succeeded'
         order by created_at desc, occurred_at desc limit 1) is not null
  and (select count(*) from public.analytics_outbox where user_id = :'b' and event = 'payment_succeeded' and properties @> '{"first":false}') = 1
  and (select count(*) from public.analytics_outbox where user_id = :'b' and event = 'trial_converted') = 1,
  'A5. El segundo cobro debía llevar first en false y no convertir la prueba otra vez');
select pg_temp.state('evt-a5-4', :'b', 'sub_a5_b', 'founder', 'active', true);
select pg_temp.expect(pg_temp.events_of(:'b') @> '[{"event":"subscription_cancel_scheduled","properties":{"plan":"founder"}}]'::jsonb,
  'A5. Cancelar al final del periodo debía encolar subscription_cancel_scheduled');
select pg_temp.state('evt-a5-5', :'b', 'sub_a5_b', 'founder', 'canceled', true);
select pg_temp.expect(pg_temp.events_of(:'b') @> '[{"event":"subscription_canceled","properties":{"plan":"founder"}}]'::jsonb,
  'A5. Cancelar una suscripción activa debía encolar subscription_canceled');
select pg_temp.charge('evt-a5-6', 'refunded', :'b', 'pi_a5_b2', 79, 'founder', 'sub_a5_b');
select pg_temp.expect(pg_temp.events_of(:'b') @> '[{"event":"refund_issued","properties":{"purpose":"subscription"}}]'::jsonb,
  'A5. Un reembolso debía encolar refund_issued con su propósito');
-- Cada fila lleva el ID del alumno, su hora, queda en cola y no trae arroba
select pg_temp.expect(
  (select bool_and(analytics_id::text = :'id_b' and status = 'queued' and occurred_at <= now() + interval '1 minute'
                   and strpos(properties::text, '@') = 0) from public.analytics_outbox where user_id = :'b'),
  'A5. Las filas no llevan el ID del alumno o traen una arroba');
-- Sin repetir: aplicar el mismo reembolso otra vez no encola otro
select pg_temp.charge('evt-a5-7', 'refunded', :'b', 'pi_a5_b2', 79, 'founder', 'sub_a5_b');
select pg_temp.expect((select count(*) from public.analytics_outbox where user_id = :'b' and event = 'refund_issued') = 1,
  'A5. Un reembolso repetido encoló otro evento');

-- La prueba que se cancela, y el cambio de plan. f tiene el permiso
begin;
select pg_temp.as_user(:'f');
select public.set_analytics_consent(true);
commit;
select pg_temp.state('evt-a5-8', :'f', 'sub_a5_f', 'monthly', 'trialing', false, now() + interval '7 days');
select pg_temp.state('evt-a5-9', :'f', 'sub_a5_f', 'monthly', 'canceled', true);
select pg_temp.expect(
  pg_temp.events_of(:'f') @> '[{"event":"trial_canceled","properties":{"plan":"monthly"}}]'::jsonb
  and not pg_temp.events_of(:'f') @> '[{"event":"subscription_canceled"}]'::jsonb,
  'A5. Cancelar una prueba debía encolar trial_canceled y no subscription_canceled');
-- g paga sin prueba, cambia de plan y se reembolsa un pase
begin;
select pg_temp.as_user(:'g');
select public.set_analytics_consent(true);
commit;
select pg_temp.charge('evt-a5-10', 'paid', :'g', 'pi_a5_g1', 149, 'monthly', 'sub_a5_g');
select pg_temp.expect(
  pg_temp.events_of(:'g') = '[{"event":"payment_succeeded","properties":{"plan":"monthly","purpose":"subscription","method":"card","first":true}}]'::jsonb,
  'A5. Un primer cobro sin prueba solo debía encolar payment_succeeded');
update public.subscriptions set plan = 'annual' where user_id = :'g';
select pg_temp.expect(pg_temp.events_of(:'g') @> '[{"event":"plan_changed","properties":{"from_plan":"monthly","to_plan":"annual"}}]'::jsonb,
  'A5. Cambiar de plan debía encolar plan_changed con los dos planes');
update public.subscriptions set current_period_end = now() + interval '40 days' where user_id = :'g';
select pg_temp.expect((select count(*) from public.analytics_outbox where user_id = :'g' and event = 'plan_changed') = 1,
  'A5. Cambiar otra columna encoló plan_changed');
-- Un pase de OXXO también es un pago, con su propósito y su método
insert into public.payments (user_id, provider, provider_payment_id, amount_mxn, status, purpose, plan, method, paid_at)
  values (:'g', 'stripe', 'pi_a5_g2', 149, 'paid', 'pass', 'monthly', 'oxxo', now());
select pg_temp.expect(
  exists (select 1 from public.analytics_outbox where user_id = :'g' and event = 'payment_succeeded'
          and properties @> '{"purpose":"pass","method":"oxxo","plan":"monthly","first":false}'),
  'A5. Un pase pagado debía encolar payment_succeeded con purpose pass');
-- Una factura de 0 pesos nunca cuenta como pago, ni como reembolso
insert into public.payments (user_id, provider, provider_payment_id, amount_mxn, status, purpose, plan, method, paid_at)
  values (:'g', 'stripe', 'in_a5_cero', 0, 'paid', 'subscription', 'monthly', 'card', now());
select pg_temp.expect((select count(*) from public.analytics_outbox where user_id = :'g' and event = 'payment_succeeded') = 2,
  'A5. La factura de 0 pesos contó como pago');
-- Un pago que no es paid no cuenta, y pasar de pendiente a pagado sí
insert into public.payments (user_id, provider, provider_payment_id, amount_mxn, status, purpose, plan, method)
  values (:'g', 'stripe', 'pi_a5_pend', 149, 'pending', 'pass', 'monthly', 'spei');
select pg_temp.expect((select count(*) from public.analytics_outbox where user_id = :'g' and event = 'payment_succeeded') = 2,
  'A5. Un pago pendiente contó como pago');
update public.payments set status = 'paid', paid_at = now() where provider_payment_id = 'pi_a5_pend';
select pg_temp.expect((select count(*) from public.analytics_outbox where user_id = :'g' and event = 'payment_succeeded') = 3,
  'A5. Pasar de pendiente a pagado debía contar');
update public.payments set admin_note = 'nota' where provider_payment_id = 'pi_a5_pend';
select pg_temp.expect((select count(*) from public.analytics_outbox where user_id = :'g' and event = 'payment_succeeded') = 3,
  'A5. Cambiar otra columna de un pago ya pagado contó otra vez');
-- Un plan gratis o desconocido no encola eventos de plan
update public.subscriptions set plan = 'free' where user_id = :'g';
select pg_temp.expect((select count(*) from public.analytics_outbox where user_id = :'g' and event = 'plan_changed') = 1,
  'A5. Pasar a free encoló plan_changed');

-- ===================================================================== A2. El permiso y el ID
-- b ya tiene eventos encolados: retirar el permiso los marca dropped y cambia el ID, sin borrar nada
select count(*) as pending_b from public.analytics_outbox where user_id = :'b' \gset
select pg_temp.expect(:pending_b::int >= 6, 'A2. La prueba esperaba eventos pendientes de b');
update public.analytics_outbox set status = 'sent', sent_at = now() where user_id = :'b' and event = 'trial_started';
-- Lo de los demás alumnos (la cola de f y g, con permiso, y los ID de quienes no lo han dado) tiene que quedar
-- igual cuando b retira o vuelve a dar el permiso. Se toma la foto antes de tocar nada
create temp table a2_others_outbox as
  select user_id, status, count(*) as n from public.analytics_outbox where user_id <> :'b' group by 1, 2;
create temp table a2_others_subjects as
  select user_id, analytics_id, consent from public.analytics_subjects where user_id <> :'b';
select pg_temp.expect(
  (select count(*) from a2_others_outbox where status = 'queued' and user_id in (:'f', :'g')) = 2
  and (select count(*) from a2_others_subjects where consent and user_id in (:'f', :'g')) = 2
  and (select count(*) from a2_others_subjects where not consent) >= 1,
  'A2. La prueba esperaba eventos en cola de otros alumnos con permiso y otros alumnos sin permiso');
begin;
select pg_temp.as_user(:'b');
create temp table a2 as select public.set_analytics_consent(false) as r;
select pg_temp.expect(
  (select r ->> 'consent' = 'false' and r ->> 'analyticsId' <> :'id_b' from a2),
  'A2. Retirar el permiso debía apagarlo y cambiar el ID');
select pg_temp.expect(public.analytics_identity() = (select r from a2), 'A2. analytics_identity no devolvió el ID nuevo');
-- Repetirlo no cambia el ID otra vez
select pg_temp.expect(public.set_analytics_consent(false) = (select r from a2), 'A2. Retirar dos veces cambió el ID otra vez');
select pg_temp.is(pg_temp.fails_with('select public.set_analytics_consent(null)'), '22023', 'A2. Un permiso nulo debía rechazarse');
commit;
select pg_temp.expect(
  (select count(*) from public.analytics_outbox where user_id = :'b') = :pending_b::int
  and (select count(*) from public.analytics_outbox where user_id = :'b' and status = 'dropped') = :pending_b::int - 1
  and (select count(*) from public.analytics_outbox where user_id = :'b' and status = 'sent') = 1
  and not exists (select 1 from public.analytics_outbox where user_id = :'b' and status in ('queued', 'failed')),
  'A2. Retirar el permiso debía marcar dropped lo pendiente, conservar lo mandado y no borrar nada');
-- Retirar el permiso solo toca lo del alumno que lo retira: la cola y el ID de los demás siguen como estaban
select pg_temp.expect(
  not exists (
    (select * from a2_others_outbox except
      select user_id, status, count(*) from public.analytics_outbox where user_id <> :'b' group by 1, 2)
    union all
    (select user_id, status, count(*) from public.analytics_outbox where user_id <> :'b' group by 1, 2
      except select * from a2_others_outbox))
  and not exists (
    (select * from a2_others_subjects except
      select user_id, analytics_id, consent from public.analytics_subjects where user_id <> :'b')
    union all
    (select user_id, analytics_id, consent from public.analytics_subjects where user_id <> :'b'
      except select * from a2_others_subjects)),
  'A2. Retirar el permiso de b tocó la cola o el permiso de otro alumno');
-- Después de retirarlo ya no se encola, y dar el permiso otra vez conserva el ID nuevo
insert into public.payments (user_id, provider, provider_payment_id, amount_mxn, status, purpose, plan, method, paid_at)
  values (:'b', 'stripe', 'pi_a2_sin', 149, 'paid', 'subscription', 'monthly', 'card', now());
select pg_temp.expect((select count(*) from public.analytics_outbox where user_id = :'b') = :pending_b::int,
  'A2. Sin el permiso se encoló un evento');
select analytics_id as id_b2 from public.analytics_subjects where user_id = :'b' \gset
begin;
select pg_temp.as_user(:'b');
select pg_temp.expect(public.set_analytics_consent(true) = jsonb_build_object('analyticsId', :'id_b2'::uuid, 'consent', true),
  'A2. Dar el permiso otra vez debía conservar el ID nuevo');
commit;
-- Darlo otra vez tampoco toca a los demás: los que no lo han dado siguen sin él
select pg_temp.expect(
  not exists (
    (select * from a2_others_subjects except
      select user_id, analytics_id, consent from public.analytics_subjects where user_id <> :'b')
    union all
    (select user_id, analytics_id, consent from public.analytics_subjects where user_id <> :'b'
      except select * from a2_others_subjects)),
  'A2. Dar el permiso a b tocó el permiso o el ID de otro alumno');
insert into public.payments (user_id, provider, provider_payment_id, amount_mxn, status, purpose, plan, method, paid_at)
  values (:'b', 'stripe', 'pi_a2_b', 149, 'paid', 'subscription', 'monthly', 'card', now());
select pg_temp.expect(
  exists (select 1 from public.analytics_outbox where user_id = :'b' and analytics_id::text = :'id_b2' and event = 'payment_succeeded'),
  'A2. Con el permiso otra vez, lo nuevo debía llevar el ID nuevo');
select pg_temp.expect(
  (select count(*) from public.analytics_outbox where user_id = :'b' and analytics_id::text = :'id_b') = :pending_b::int,
  'A2. Lo de antes debía seguir con el ID de antes, sin unirse a lo nuevo');

-- ===================================================================== A6. Un error dentro del disparador no rompe el pago
begin;
-- Primero la cola entera rota: el update de la suscripción sigue funcionando
alter table public.analytics_outbox rename to analytics_outbox_rota;
update public.subscriptions set plan = 'annual', cancel_at_period_end = true where user_id = :'b';
select pg_temp.expect((select plan = 'annual' from public.subscriptions where user_id = :'b'),
  'A6. Con la cola rota el update de la suscripción falló');
rollback;
begin;
-- Después la función que encola lanzando un error: el pago se guarda igual
create or replace function public.analytics_enqueue(p_user uuid, p_event text, p_props jsonb, p_at timestamptz)
returns void language plpgsql as $$ begin raise exception 'error de prueba'; end $$;
insert into public.payments (user_id, provider, provider_payment_id, amount_mxn, status, purpose, plan, method, paid_at)
  values (:'g', 'stripe', 'pi_a6_g', 149, 'paid', 'subscription', 'monthly', 'card', now());
update public.payments set refunded_at = now(), status = 'refunded' where provider_payment_id = 'pi_a6_g';
update public.subscriptions set cancel_at_period_end = true where user_id = :'g';
select pg_temp.expect(
  (select status = 'refunded' from public.payments where provider_payment_id = 'pi_a6_g')
  and (select cancel_at_period_end from public.subscriptions where user_id = :'g'),
  'A6. Un error al encolar rompió el pago o la suscripción');
rollback;
-- Y los disparadores, sin su cuerpo seguro, tampoco rompen: una propiedad que no cabe se descarta
select public.analytics_enqueue(:'g', 'payment_succeeded', '{"plan":"Texto libre con espacios y mayúsculas"}', now());
select public.analytics_enqueue(:'g', 'payment_succeeded', '{"plan":{"anidado":"x"}}', now());
select public.analytics_enqueue(:'g', 'payment_succeeded', '{"plan":"monthly","nota":"ana@x.mx"}', now());
select public.analytics_enqueue(:'g', 'evento_inventado', '{}', now());
select public.analytics_enqueue(:'g', 'payment_succeeded', '[]', now());
select pg_temp.expect((select count(*) from public.analytics_outbox where user_id = :'g' and event = 'payment_succeeded') = 3,
  'A6. Se encoló una propiedad de texto libre, anidada, con arroba, un evento inventado o una lista');

-- ===================================================================== A7. Lo que cabe en la cola
select pg_temp.is(pg_temp.fails_with($q$insert into public.analytics_outbox (user_id, analytics_id, event, properties, occurred_at)
  values ('ba150000-0000-0000-0000-000000000107', gen_random_uuid(), 'payment_succeeded', '{"alias":"ana@x.mx"}', now())$q$),
  '23514', 'A7. La cola aceptó una arroba en las propiedades');
select pg_temp.is(pg_temp.fails_with($q$insert into public.analytics_outbox (user_id, analytics_id, event, properties, occurred_at)
  values ('ba150000-0000-0000-0000-000000000107', gen_random_uuid(), 'payment_succeeded', jsonb_build_object('x', repeat('a', 2500)), now())$q$),
  '23514', 'A7. La cola aceptó propiedades de 2 KB o más');
select pg_temp.is(pg_temp.fails_with($q$insert into public.analytics_outbox (user_id, analytics_id, event, occurred_at)
  values ('ba150000-0000-0000-0000-000000000107', gen_random_uuid(), 'evento_inventado', now())$q$),
  '23514', 'A7. La cola aceptó un evento fuera de la lista');
select pg_temp.is(pg_temp.fails_with($q$insert into public.analytics_outbox (user_id, analytics_id, event, occurred_at, status)
  values ('ba150000-0000-0000-0000-000000000107', gen_random_uuid(), 'trial_started', now(), 'enviando')$q$),
  '23514', 'A7. La cola aceptó un estado desconocido');
select pg_temp.is(pg_temp.fails_with($q$insert into public.analytics_outbox (user_id, analytics_id, event, occurred_at)
  values (gen_random_uuid(), gen_random_uuid(), 'trial_started', now())$q$),
  '23503', 'A7. La cola aceptó un alumno que no existe');
-- La lista de eventos es la de 1.7: ocho
select pg_temp.expect(
  (select regexp_count(pg_get_constraintdef(oid), '''[a-z_]+''') from pg_constraint
    where conrelid = 'public.analytics_outbox'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%trial_started%') = 8,
  'A7. La restricción de eventos no trae los ocho de 1.7');
select pg_temp.expect(public.analytics_props_ok('{}') and public.analytics_props_ok('{"plan":"monthly","first":true}')
  and not public.analytics_props_ok(null) and not public.analytics_props_ok('[]')
  and not public.analytics_props_ok('{"n":3}') and not public.analytics_props_ok('{"x":null}')
  and not public.analytics_props_ok('{"plan":"Monthly"}') and not public.analytics_props_ok('{"plan":"un plan"}')
  and not public.analytics_props_ok('{"plan":"monthly","otro":{"a":"b"}}'),
  'A7. analytics_props_ok aceptó lo que no es de una lista cerrada o un sí y no');

-- ===================================================================== A8. Las fichas de Cron contra Vault
-- Sin Vault ninguna ficha vale
select pg_temp.expect(
  not public.analytics_tick_ok(repeat('a', 64)) and not public.email_tick_ok(repeat('a', 64))
  and not public.analytics_tick_ok(null) and not public.email_tick_ok(null),
  'A8. Sin Vault una ficha valió');
-- Con una imitación de Vault (supabase/tests/stub_cron_vault.sql), dentro de una transacción que se deshace
begin;
\ir stub_cron_vault.sql
select vault.create_secret(repeat('c', 64), 'analytics_tick_secret', 'Ficha de prueba de la analítica');
select vault.create_secret(repeat('d', 64), 'email_tick_secret', 'Ficha de prueba de los correos');
select pg_temp.expect(
  public.analytics_tick_ok(repeat('c', 64)) and public.email_tick_ok(repeat('d', 64)),
  'A8. La ficha buena no valió contra Vault');
select pg_temp.expect(
  not public.analytics_tick_ok(repeat('d', 64)) and not public.email_tick_ok(repeat('c', 64))
  and not public.analytics_tick_ok(repeat('f', 64)) and not public.email_tick_ok(repeat('f', 64)),
  'A8. Una ficha equivocada o de la otra función valió');
select pg_temp.expect(
  not public.analytics_tick_ok(repeat('c', 31)) and not public.email_tick_ok(repeat('d', 31))
  and not public.analytics_tick_ok('') and not public.email_tick_ok('') and not public.analytics_tick_ok(null),
  'A8. Una ficha corta, vacía o nula valió');
-- Un secreto corto en Vault no abre nada
update vault.secrets set secret = 'corto' where name = 'analytics_tick_secret';
select pg_temp.expect(not public.analytics_tick_ok('corto') and not public.analytics_tick_ok(repeat('c', 64)),
  'A8. Un secreto corto en Vault abrió la función');
rollback;

-- ===================================================================== A9. Reclamar y cerrar
-- Se aparta lo que dejaron las pruebas de antes. Quedan los de g, f y b
update public.analytics_outbox set status = 'dropped' where status in ('queued', 'failed');
select pg_temp.switch(false);
insert into public.analytics_outbox (user_id, analytics_id, event, properties, occurred_at)
  select :'g'::uuid, analytics_id, 'trial_started', '{"plan":"monthly"}'::jsonb, now() - interval '2 minutes' from public.analytics_subjects where user_id = :'g'
  union all
  select :'g'::uuid, analytics_id, 'plan_changed', '{"from_plan":"monthly","to_plan":"annual"}'::jsonb, now() - interval '1 minute' from public.analytics_subjects where user_id = :'g'
  union all
  select :'f'::uuid, gen_random_uuid(), 'trial_started', '{"plan":"monthly"}'::jsonb, now() - interval '3 minutes';
-- Apagado no entrega nada
select pg_temp.is(public.claim_analytics_batch(100)::text, '[]', 'A9. Con analytics apagado no debía entregar nada');
select pg_temp.expect((select count(*) from public.analytics_outbox where status = 'queued') = 3, 'A9. Apagado marcó eventos');
select pg_temp.switch(true);
create temp table a9 as select public.claim_analytics_batch(100) as r;
-- Entrega los de g en orden, con su ID, y descarta el de f, cuyo ID ya no es el vigente
select pg_temp.expect(
  (select jsonb_array_length(r) = 2
     and r -> 0 ->> 'event' = 'trial_started' and r -> 1 ->> 'event' = 'plan_changed'
     and r -> 0 ->> 'analyticsId' = (select analytics_id::text from public.analytics_subjects where user_id = :'g')
     and r -> 1 -> 'properties' = '{"from_plan":"monthly","to_plan":"annual"}'::jsonb
     and (r -> 0 ->> 'id') ~ '^[0-9a-f-]{36}$' and (r -> 0 ->> 'occurredAt') is not null
   from a9),
  'A9. El reclamo no entregó los eventos de g en orden y con su ID');
select pg_temp.expect(
  (select status = 'dropped' from public.analytics_outbox where user_id = :'f' and status <> 'sent' and event = 'trial_started' and created_at >= now() - interval '1 minute' limit 1),
  'A9. Un evento con un ID que ya no es el vigente debía descartarse');
select pg_temp.expect(
  (select bool_and(attempts = 1 and send_after > now() + interval '9 minutes') from public.analytics_outbox
    where id in (select (e ->> 'id')::uuid from a9, jsonb_array_elements(a9.r) e)),
  'A9. Lo entregado debía quedar apartado y con un intento');
select pg_temp.is(public.claim_analytics_batch(100)::text, '[]', 'A9. Lo apartado no debía entregarse dos veces');
-- Cerrar: uno sent y otro failed. Un estado raro se rechaza
select public.finish_analytics_batch(array[(select (r -> 0 ->> 'id')::uuid from a9)], 'sent');
select public.finish_analytics_batch(array[(select (r -> 1 ->> 'id')::uuid from a9)], 'failed');
select pg_temp.expect(
  (select status = 'sent' and sent_at is not null from public.analytics_outbox where id = (select (r -> 0 ->> 'id')::uuid from a9))
  and (select status = 'failed' and send_after > now() from public.analytics_outbox where id = (select (r -> 1 ->> 'id')::uuid from a9)),
  'A9. Los eventos no se cerraron');
select public.finish_analytics_batch(array[(select (r -> 0 ->> 'id')::uuid from a9)], 'failed');
select pg_temp.is((select status from public.analytics_outbox where id = (select (r -> 0 ->> 'id')::uuid from a9)), 'sent',
  'A9. Un evento mandado cambió');
select pg_temp.is(pg_temp.fails_with($q$select public.finish_analytics_batch(array[gen_random_uuid()], 'perdido')$q$), '22023',
  'A9. Un estado desconocido debía rechazarse');
-- queued devuelve a la cola sin gastar el intento, para un problema de configuración
update public.analytics_outbox set status = 'failed', attempts = 2, send_after = now() - interval '1 minute'
  where id = (select (r -> 1 ->> 'id')::uuid from a9);
select public.finish_analytics_batch(array[(select (r -> 1 ->> 'id')::uuid from a9)], 'queued');
select pg_temp.expect(
  (select status = 'queued' and attempts = 1 and send_after > now() + interval '4 minutes' and send_after < now() + interval '6 minutes'
   from public.analytics_outbox where id = (select (r -> 1 ->> 'id')::uuid from a9)),
  'A9. queued debía devolver el evento a la cola sin gastar el intento y esperar 5 minutos');
select public.finish_analytics_batch(array[(select (r -> 1 ->> 'id')::uuid from a9)], 'failed');
select public.finish_analytics_batch(null, 'sent');
-- El fallido vuelve a salir más tarde, y no después de 5 intentos
update public.analytics_outbox set send_after = now() - interval '1 minute' where id = (select (r -> 1 ->> 'id')::uuid from a9);
create temp table a9b as select public.claim_analytics_batch(100) as r;
select pg_temp.expect((select jsonb_array_length(r) = 1 and r -> 0 ->> 'id' = (select r -> 1 ->> 'id' from a9) from a9b)
  and (select attempts = 2 from public.analytics_outbox where id = (select (r -> 1 ->> 'id')::uuid from a9)),
  'A9. El evento fallido debía reintentarse con dos intentos');
update public.analytics_outbox set status = 'failed', attempts = 5, send_after = now() - interval '1 minute' where id = (select (r -> 1 ->> 'id')::uuid from a9);
select pg_temp.is(public.claim_analytics_batch(100)::text, '[]', 'A9. Después de 5 intentos no debía volver a entregarse');
-- El límite acota, y vale entre 1 y 100
insert into public.analytics_outbox (user_id, analytics_id, event, properties, occurred_at)
  select :'g'::uuid, analytics_id, 'trial_started', '{"plan":"monthly"}'::jsonb, now() from public.analytics_subjects, generate_series(1, 5) where user_id = :'g';
select pg_temp.is((select jsonb_array_length(public.claim_analytics_batch(3)))::text, '3', 'A9. El límite de 3 debía entregar 3');
select pg_temp.is((select jsonb_array_length(public.claim_analytics_batch(0)))::text, '1', 'A9. El límite de 0 debía valer 1');
select pg_temp.is((select jsonb_array_length(public.claim_analytics_batch(null)))::text, '1', 'A9. Sin límite debía tomar lo que queda');

-- Se deja la analítica apagada, como en el proyecto real
select pg_temp.switch(false);

select 'TODAS LAS PRUEBAS DE LA ANALÍTICA PASARON' as resultado;
