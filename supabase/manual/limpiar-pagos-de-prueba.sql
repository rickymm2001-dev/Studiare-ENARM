-- Limpieza de la prueba de pagos (plan del cambio V3, bloque B0, respuestas 1 y 2 de Ricardo, y B10).
--
-- Qué hace
--   Borra las filas de pago de prueba de las cuentas que se listan al final. Son las dos cuentas de
--   prueba de Ricardo y, desde B10, las cuentas de la corrida real en modo prueba. Limpia subscriptions,
--   payments, billing_customers y, desde B10, founder_seats, trial_claims, plan_passes, invoice_requests,
--   email_outbox y billing_actions. Hace falta porque el cupo Fundador cuenta los lugares apartados y
--   confirmados, porque una prueba gratis usada frena otra con el mismo correo y porque un cliente de
--   prueba de Stripe no existe en modo real y rompería el pago cuando se cambie a las llaves reales. Las
--   cuentas en sí no se tocan.
--
-- Cuándo correrlo
--   Después de cancelar en Stripe las suscripciones de esas cuentas (Customers, la cuenta, Cancel
--   subscription, Immediately, con reembolso del último pago) o de borrar sus relojes de prueba, y de ver
--   que los avisos de Stripe ya llegaron a payment_webhook_events. Los avisos que lleguen después solo
--   actualizan filas, así que sin filas no hacen nada. Un cobro nuevo sí volvería a crear filas, por eso
--   primero se cancela en Stripe y después se corre esto.
--
-- Por qué está aquí y no lo hizo Claude
--   La herramienta con la que Claude escribe en la base pide una confirmación humana para toda
--   sentencia con delete, y en una sesión en la nube no hay dónde darla. Pega el archivo completo en
--   Supabase, SQL Editor, y ejecútalo una vez. Es repetible.
--
-- Qué debe salir
--   Una fila con un resultado donde todo da 0, salvo founder_ocupados, que baja en consecuencia.

create or replace function pg_temp.limpiar_pagos_de_prueba(p_users uuid[]) returns jsonb
language plpgsql as $$
begin
  -- Las acciones con la pasarela son de esas cuentas o apuntan a sus suscripciones, así que van primero
  delete from public.billing_actions a
    where a.user_id = any (p_users) or a.target in (
      select s.provider_subscription_id from public.subscriptions s where s.user_id = any (p_users)
      union select t.provider_subscription_id from public.trial_claims t where t.user_id = any (p_users)
      union select f.provider_subscription_id from public.founder_seats f where f.user_id = any (p_users)
      union select p.provider_subscription_id from public.payments p where p.user_id = any (p_users)
    );
  delete from public.invoice_requests where user_id = any (p_users);
  delete from public.email_outbox where recipient_user = any (p_users);
  delete from public.plan_passes where user_id = any (p_users);
  delete from public.trial_claims where user_id = any (p_users);
  delete from public.founder_seats where user_id = any (p_users);
  delete from public.payments where user_id = any (p_users);
  delete from public.subscriptions where user_id = any (p_users);
  delete from public.billing_customers where user_id = any (p_users);
  return jsonb_build_object(
    'pagos', (select count(*) from public.payments where user_id = any (p_users)),
    'suscripciones', (select count(*) from public.subscriptions where user_id = any (p_users)),
    'clientes', (select count(*) from public.billing_customers where user_id = any (p_users)),
    'lugares', (select count(*) from public.founder_seats where user_id = any (p_users)),
    'pruebas', (select count(*) from public.trial_claims where user_id = any (p_users)),
    'pases', (select count(*) from public.plan_passes where user_id = any (p_users)),
    'facturas', (select count(*) from public.invoice_requests where user_id = any (p_users)),
    'correos', (select count(*) from public.email_outbox where recipient_user = any (p_users)),
    'founder_ocupados', (select count(*) from public.founder_seats where status in ('held', 'confirmed'))
  );
end;
$$;

-- Cuentas a limpiar. Las dos de prueba de Ricardo (empiezan con af63865e y 7ab06582) y después las de la
-- corrida real de B10, que la sesión agrega antes de pedirte que lo pegues
select pg_temp.limpiar_pagos_de_prueba(array[
  'af63865e-1152-457e-b3fd-697acbd2fbd5',
  '7ab06582-5d4b-4990-819a-b65b531f94ed'
  -- Corrida real de B10
]::uuid[]) as resultado;
