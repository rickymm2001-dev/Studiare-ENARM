-- Limpieza de la prueba de pagos (plan del cambio V3, bloque B0, respuestas 1 y 2 de Ricardo).
--
-- Qué hace
--   Borra las filas de pago de prueba de las dos cuentas de prueba de Ricardo en subscriptions,
--   payments y billing_customers. Hace falta porque el cupo Fundador cuenta toda fila con plan
--   founder, también las canceladas, y porque un cliente de prueba de Stripe no existe en modo real y
--   rompería el pago cuando se cambie a las llaves reales. Las cuentas en sí no se tocan.
--
-- Cuándo correrlo
--   Después de cancelar en Stripe las suscripciones de esas dos cuentas (Customers, la cuenta,
--   Cancel subscription, Immediately, con reembolso del último pago) y de ver que los avisos de Stripe
--   ya llegaron a payment_webhook_events. Los avisos de cancelación y de reembolso que lleguen después
--   solo actualizan filas, así que sin filas no hacen nada. Un cobro nuevo sí volvería a crear filas, por
--   eso primero se cancela en Stripe y después se corre esto.
--
-- Por qué está aquí y no lo hizo Claude
--   La herramienta con la que Claude escribe en la base pide una confirmación humana para toda
--   sentencia con delete, y en una sesión en la nube no hay dónde darla. Pega el archivo completo en
--   Supabase, SQL Editor, y ejecútalo una vez. Es repetible.
--
-- Los dos IDs son los de las cuentas de prueba (empiezan con af63865e y 7ab06582).

begin;

delete from public.payments
  where user_id in ('af63865e-1152-457e-b3fd-697acbd2fbd5', '7ab06582-5d4b-4990-819a-b65b531f94ed');

delete from public.subscriptions
  where user_id in ('af63865e-1152-457e-b3fd-697acbd2fbd5', '7ab06582-5d4b-4990-819a-b65b531f94ed');

delete from public.billing_customers
  where user_id in ('af63865e-1152-457e-b3fd-697acbd2fbd5', '7ab06582-5d4b-4990-819a-b65b531f94ed');

commit;

-- Comprobación. Las tres cuentas deben dar 0 y founder_tomados debe bajar en consecuencia.
select
  (select count(*) from public.payments
    where user_id in ('af63865e-1152-457e-b3fd-697acbd2fbd5', '7ab06582-5d4b-4990-819a-b65b531f94ed')) as pagos,
  (select count(*) from public.subscriptions
    where user_id in ('af63865e-1152-457e-b3fd-697acbd2fbd5', '7ab06582-5d4b-4990-819a-b65b531f94ed')) as suscripciones,
  (select count(*) from public.billing_customers
    where user_id in ('af63865e-1152-457e-b3fd-697acbd2fbd5', '7ab06582-5d4b-4990-819a-b65b531f94ed')) as clientes,
  (select count(*) from public.subscriptions where plan = 'founder') as founder_tomados;
