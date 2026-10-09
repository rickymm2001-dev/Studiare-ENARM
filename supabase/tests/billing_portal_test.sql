-- Pruebas del portal de facturación y los reembolsos de Stripe (migración 20261011000001). Corre
-- después de settings_test.sql sobre la misma base, con usuarios propios. Cada bloque falla con un
-- error si algo no cumple.
\set ON_ERROR_STOP on

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

create or replace function pg_temp.is_blocked(stmt text) returns boolean language plpgsql as $$
begin
  execute stmt;
  return false;
exception when insufficient_privilege then
  return true;
end $$;

-- ===================================================================== Usuarios
insert into auth.users (id, email, raw_user_meta_data) values
  ('91000000-0000-0000-0000-000000000001', 'b1@x.mx', '{"alias":"Uno"}'),
  ('91000000-0000-0000-0000-000000000002', 'b2@x.mx', '{"alias":"Dos"}'),
  ('91000000-0000-0000-0000-000000000003', 'b3@x.mx', '{"alias":"Tres"}'),
  ('91000000-0000-0000-0000-000000000004', 'b4@x.mx', '{"alias":"Cuatro"}');

-- ===================================================================== C1. Ligar al alumno con su cliente
select pg_temp.expect(
  public.record_billing_customer('stripe', 'cus_uno', '91000000-0000-0000-0000-000000000001') = 'linked',
  'C1. No ligó al alumno con su cliente'
);
select pg_temp.expect(
  public.billing_customer_of_user('stripe', '91000000-0000-0000-0000-000000000001') = 'cus_uno'
  and public.billing_user_of_customer('stripe', 'cus_uno') = '91000000-0000-0000-0000-000000000001',
  'C1. No encontró al cliente en las dos direcciones'
);
-- Repetir el mismo aviso no duplica nada
select pg_temp.expect(
  public.record_billing_customer('stripe', 'cus_uno', '91000000-0000-0000-0000-000000000001') = 'linked'
  and (select count(*) from public.billing_customers where user_id = '91000000-0000-0000-0000-000000000001') = 1,
  'C1. Repetir el aviso duplicó la fila'
);
-- Si el alumno paga con otro cliente, queda el más reciente
select public.record_billing_customer('stripe', 'cus_uno_b', '91000000-0000-0000-0000-000000000001');
select pg_temp.expect(
  public.billing_customer_of_user('stripe', '91000000-0000-0000-0000-000000000001') = 'cus_uno_b'
  and public.billing_user_of_customer('stripe', 'cus_uno') is null,
  'C1. El cliente nuevo no reemplazó al anterior'
);

-- ===================================================================== C2. Un cliente no es de dos alumnos
select pg_temp.expect(
  public.record_billing_customer('stripe', 'cus_uno_b', '91000000-0000-0000-0000-000000000002') = 'taken',
  'C2. Un cliente se ligó a dos alumnos'
);
select pg_temp.expect(
  public.billing_user_of_customer('stripe', 'cus_uno_b') = '91000000-0000-0000-0000-000000000001'
  and public.billing_customer_of_user('stripe', '91000000-0000-0000-0000-000000000002') is null,
  'C2. El cliente cambió de dueño'
);
select pg_temp.expect(
  public.record_billing_customer('stripe', 'cus_fantasma', '91000000-0000-0000-0000-0000000000ff') = 'unknown_user',
  'C2. Ligó un cliente a una cuenta que no existe'
);
select pg_temp.expect(
  (select count(*) from public.billing_customers where customer_id = 'cus_fantasma') = 0,
  'C2. Quedó la fila de una cuenta que no existe'
);

-- ===================================================================== C3. Entradas que no valen
do $$
begin
  begin
    perform public.record_billing_customer('paypal', 'cus_x', '91000000-0000-0000-0000-000000000001');
    raise exception 'FALLA C3. Aceptó un procesador desconocido';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.record_billing_customer('stripe', '  ', '91000000-0000-0000-0000-000000000001');
    raise exception 'FALLA C3. Aceptó un cliente vacío';
  exception when invalid_parameter_value then null;
  end;
end $$;

-- ===================================================================== C4. Nadie de la app lo toca
begin;
select pg_temp.as_user('91000000-0000-0000-0000-000000000001');
select pg_temp.expect(pg_temp.is_blocked('select * from public.billing_customers'), 'C4. Un alumno leyó billing_customers');
select pg_temp.expect(pg_temp.is_blocked($q$insert into public.billing_customers (user_id, provider, customer_id) values ('91000000-0000-0000-0000-000000000001','stripe','cus_pirata')$q$), 'C4. Un alumno escribió billing_customers');
select pg_temp.expect(pg_temp.is_blocked($q$select public.billing_customer_of_user('stripe','91000000-0000-0000-0000-000000000001')$q$), 'C4. Un alumno ejecutó billing_customer_of_user');
select pg_temp.expect(pg_temp.is_blocked($q$select public.record_billing_customer('stripe','cus_pirata','91000000-0000-0000-0000-000000000001')$q$), 'C4. Un alumno ejecutó record_billing_customer');
select pg_temp.expect(pg_temp.is_blocked($q$select public.billing_user_of_customer('stripe','cus_uno_b')$q$), 'C4. Un alumno ejecutó billing_user_of_customer');
rollback;
begin;
set local role anon;
select pg_temp.expect(pg_temp.is_blocked('select * from public.billing_customers'), 'C4. anon leyó billing_customers');
select pg_temp.expect(pg_temp.is_blocked($q$select public.billing_user_of_customer('stripe','cus_uno_b')$q$), 'C4. anon ejecutó billing_user_of_customer');
rollback;
select pg_temp.expect(
  has_function_privilege('service_role', 'public.record_billing_customer(text, text, uuid)', 'execute')
  and has_function_privilege('service_role', 'public.billing_customer_of_user(text, uuid)', 'execute')
  and has_function_privilege('service_role', 'public.billing_user_of_customer(text, text)', 'execute'),
  'C4. El servicio no puede usar las funciones del portal'
);

-- ===================================================================== C5. Reembolso de Stripe sin id de pago
-- El alumno 1 paga el mensual. El reembolso llega con el monto y sin el id de la factura
select pg_temp.expect(
  public.apply_payment_notice('stripe', 'evt-pay-1', '{}', 'paid', '91000000-0000-0000-0000-000000000001', 'monthly', 'in_uno', 'sub_uno', 150, null) = 'applied',
  'C5. No aplicó el pago'
);
select pg_temp.expect(
  (select status from public.subscriptions where user_id = '91000000-0000-0000-0000-000000000001') = 'active',
  'C5. El pago no activó el plan'
);
select pg_temp.expect(
  public.apply_payment_notice('stripe', 'evt-ref-1', '{}', 'refunded', '91000000-0000-0000-0000-000000000001', null, null, null, 150, null) = 'applied',
  'C5. No aplicó el reembolso'
);
select pg_temp.expect(
  (select status from public.payments where provider = 'stripe' and provider_payment_id = 'in_uno') = 'refunded',
  'C5. El reembolso no marcó el pago como devuelto'
);
select pg_temp.expect(
  (select status from public.subscriptions where user_id = '91000000-0000-0000-0000-000000000001') = 'canceled',
  'C5. El reembolso no quitó el plan'
);
-- El mismo aviso otra vez no hace nada
select pg_temp.expect(
  public.apply_payment_notice('stripe', 'evt-ref-1', '{}', 'refunded', '91000000-0000-0000-0000-000000000001', null, null, null, 150, null) = 'duplicate',
  'C5. Aplicó dos veces el mismo reembolso'
);

-- ===================================================================== C6. Se devuelve el pago más reciente de ese monto
select public.apply_payment_notice('stripe', 'evt-pay-2a', '{}', 'paid', '91000000-0000-0000-0000-000000000002', 'monthly', 'in_dos_a', 'sub_dos', 150, null);
update public.payments set created_at = now() - interval '40 days' where provider_payment_id = 'in_dos_a';
select public.apply_payment_notice('stripe', 'evt-pay-2b', '{}', 'paid', '91000000-0000-0000-0000-000000000002', 'monthly', 'in_dos_b', 'sub_dos', 150, null);
select public.apply_payment_notice('stripe', 'evt-ref-2', '{}', 'refunded', '91000000-0000-0000-0000-000000000002', null, null, null, 150, null);
select pg_temp.expect(
  (select status from public.payments where provider_payment_id = 'in_dos_b') = 'refunded'
  and (select status from public.payments where provider_payment_id = 'in_dos_a') = 'paid',
  'C6. Devolvió el pago equivocado'
);

-- ===================================================================== C7. Con el id de pago, se usa ese
select public.apply_payment_notice('mercadopago', 'mp-pay-3', '{}', 'paid', '91000000-0000-0000-0000-000000000003', 'monthly', 'mp_tres', null, 150, null);
select pg_temp.expect(
  public.apply_payment_notice('mercadopago', 'mp-ref-3', '{}', 'refunded', '91000000-0000-0000-0000-000000000003', null, 'mp_tres', null, 150, null) = 'applied',
  'C7. No aplicó el reembolso de Mercado Pago'
);
select pg_temp.expect(
  (select status from public.payments where provider_payment_id = 'mp_tres') = 'refunded'
  and (select status from public.subscriptions where user_id = '91000000-0000-0000-0000-000000000003') = 'canceled',
  'C7. El reembolso de Mercado Pago dejó de funcionar'
);

-- ===================================================================== C8. Devolver un cobro sin plan no quita el plan
-- El alumno 4 tiene el mensual activo y un cobro de Fundador que quedó por devolver
select public.apply_payment_notice('stripe', 'evt-pay-4', '{}', 'paid', '91000000-0000-0000-0000-000000000004', 'monthly', 'in_cuatro', 'sub_cuatro', 150, null);
insert into public.payments (user_id, provider, provider_payment_id, amount_mxn, status)
  values ('91000000-0000-0000-0000-000000000004', 'stripe', 'in_cuatro_fundador', 79, 'needs_refund');
select public.apply_payment_notice('stripe', 'evt-ref-4', '{}', 'refunded', '91000000-0000-0000-0000-000000000004', null, null, null, 79, null);
select pg_temp.expect(
  (select status from public.payments where provider_payment_id = 'in_cuatro_fundador') = 'refunded',
  'C8. No marcó como devuelto el cobro por devolver'
);
select pg_temp.expect(
  (select status from public.subscriptions where user_id = '91000000-0000-0000-0000-000000000004') = 'active'
  and (select status from public.payments where provider_payment_id = 'in_cuatro') = 'paid',
  'C8. Devolver un cobro sin plan quitó el plan que sí se pagó'
);

-- ===================================================================== C9. Un reembolso sin pago que coincida
-- No hay nada que marcar, pero el plan se quita igual, porque Stripe ya devolvió dinero a esa cuenta
select public.apply_payment_notice('stripe', 'evt-ref-4b', '{}', 'refunded', '91000000-0000-0000-0000-000000000004', null, null, null, 999, null);
select pg_temp.expect(
  (select count(*) from public.payments where user_id = '91000000-0000-0000-0000-000000000004' and status = 'refunded') = 1
  and (select status from public.subscriptions where user_id = '91000000-0000-0000-0000-000000000004') = 'canceled',
  'C9. Un reembolso sin pago que coincida se aplicó mal'
);

-- ===================================================================== C10. Al eliminar la cuenta se va el cliente
select pg_temp.expect(
  (select count(*) from public.billing_customers where user_id = '91000000-0000-0000-0000-000000000001') = 1,
  'C10. Falta el cliente antes de eliminar la cuenta'
);
begin;
select pg_temp.as_user('91000000-0000-0000-0000-000000000001');
select public.delete_my_account();
commit;
select pg_temp.expect(
  (select count(*) from public.billing_customers where user_id = '91000000-0000-0000-0000-000000000001') = 0,
  'C10. Quedó el cliente de una cuenta eliminada'
);

select 'TODAS LAS PRUEBAS DEL PORTAL DE FACTURACION PASARON' as resultado;
