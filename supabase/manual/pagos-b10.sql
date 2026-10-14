-- Piezas de la migración 20261022000002_billing_plans.sql que se pegan a mano en el SQL Editor de
-- Supabase (B10 del plan del cambio, 1.11 y 8.12 del diseño).
--
-- Por qué existe
--   La herramienta con la que Claude aplica migraciones pide una confirmación humana para toda sentencia
--   con drop o delete, y en una sesión en la nube no hay dónde darla (D-113). La migración de B10 lleva
--   dos piezas así, marcadas como Sección con drop y Sección con delete. Aquí están las dos, iguales a
--   las de la migración.
--
-- Cómo usarlo
--   Aplica primero las tres migraciones de B10 (20261022000001 a 20261022000003). Si el conector no pudo
--   con estas dos piezas, pega este archivo completo en Supabase, SQL Editor, y ejecútalo una vez. Es
--   repetible, así que correrlo dos veces no daña nada. La consulta del final dice si quedó.
--
-- Qué pasa si no se corre
--   Sin la pieza 1 la base rechaza el plan Fundador anual y la prueba gratis (estado trialing), así que
--   un aviso de Stripe de una prueba fallaría y Stripe lo reintentaría. Sin la pieza 2 borrar la cuenta
--   sigue con el freno de antes, que no mira la prueba ni Mercado Pago.

-- ################ 1. Planes y estados que acepta subscriptions
alter table public.subscriptions drop constraint if exists subscriptions_plan_check;
alter table public.subscriptions add constraint subscriptions_plan_check
  check (plan in ('free', 'founder', 'founder_annual', 'monthly', 'annual'));
alter table public.subscriptions drop constraint if exists subscriptions_status_check;
alter table public.subscriptions add constraint subscriptions_status_check
  check (status in ('trialing', 'active', 'past_due', 'canceled'));

-- ################ 2. Borrar mi cuenta con el freno de B10
-- Pide cancelar antes una suscripción de Stripe o de Mercado Pago en prueba, activa o con cobro fallido
-- (8.20). Una cancelada al final del periodo sí se puede. El freno lo decide
-- billing_blocks_account_deletion, de la migración 20261022000002
create or replace function public.delete_my_account() returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'Hace falta iniciar sesión' using errcode = '28000';
  end if;
  if not public.is_active_device() then
    raise exception 'Este dispositivo no es el activo de la cuenta' using errcode = '42501';
  end if;
  if public.current_app_role() = 'owner' then
    raise exception 'El dueño no puede borrar su propia cuenta' using errcode = '42501';
  end if;
  if public.billing_blocks_account_deletion(v_user) then
    raise exception 'Cancela tu suscripción antes de eliminar tu cuenta' using errcode = 'FR002';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('sync:' || v_user::text, 0));
  perform set_config('app.erasing_user', v_user::text, true);
  delete from auth.users where id = v_user;
  perform set_config('app.erasing_user', '', true);
end;
$$;

revoke all on function public.delete_my_account() from public, anon, authenticated, service_role;
grant execute on function public.delete_my_account() to authenticated;

-- Comprobación. Las tres columnas deben salir en true
select
  (select pg_get_constraintdef(oid) like '%founder_annual%'
     from pg_constraint where conname = 'subscriptions_plan_check') as plan_fundador_anual,
  (select pg_get_constraintdef(oid) like '%trialing%'
     from pg_constraint where conname = 'subscriptions_status_check') as estado_prueba,
  position('billing_blocks_account_deletion' in pg_get_functiondef('public.delete_my_account()'::regprocedure)) > 0
    as borrar_cuenta_b10;
