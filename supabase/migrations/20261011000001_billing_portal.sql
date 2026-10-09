-- Portal de facturación y reembolsos de Stripe (Fase G, G4, D-106).
--
-- Reglas que se hacen cumplir aquí y no en el navegador
--   - Para abrir el portal donde el alumno cancela o cambia su tarjeta, Stripe pide el id de su
--     cliente. billing_customers liga a cada alumno con el suyo. Lo escribe solo la función de avisos
--     de pago, con la llave de servicio, a partir de un pago que ya trae el id del alumno puesto por
--     nuestra propia función de cobro. Ni el navegador ni el admin lo leen ni lo escriben
--   - Un reembolso de Stripe llega con el cliente y no con el alumno. record/find resuelven de quién
--     es. El reembolso marca el pago como devuelto y quita el plan, igual que el de Mercado Pago
--   - Un reembolso completo de un cobro que había quedado en needs_refund, porque el cupo Fundador
--     se llenó, solo marca ese pago como devuelto. No quita un plan que el alumno no tenía por ese cobro
--
-- Es idempotente. Se corre después de 20261010000001_ai_hosted.sql. No edita las migraciones anteriores

-- ===================================================================== Clientes del procesador
create table if not exists public.billing_customers (
  user_id uuid primary key references auth.users (id) on delete cascade,
  provider text not null check (provider in ('stripe')),
  customer_id text not null check (btrim(customer_id) <> '' and char_length(customer_id) <= 200),
  updated_at timestamptz not null default now(),
  unique (provider, customer_id)
);
alter table public.billing_customers enable row level security;
-- Sin políticas y sin permisos. Solo el servidor con la llave de servicio las toca, por las funciones
revoke all on public.billing_customers from public, anon, authenticated;

-- Liga al alumno con su cliente. Si ya tenía otro, queda el más reciente. Si ese cliente era de otra
-- cuenta, no lo mueve, porque un cliente de Stripe no puede ser de dos alumnos
create or replace function public.record_billing_customer(p_provider text, p_customer_id text, p_user uuid)
returns text
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if p_provider <> 'stripe' then
    raise exception 'Procesador de pago desconocido' using errcode = '22023';
  end if;
  if p_customer_id is null or btrim(p_customer_id) = '' or char_length(p_customer_id) > 200 then
    raise exception 'Falta el cliente' using errcode = '22023';
  end if;
  if p_user is null or not exists (select 1 from auth.users where id = p_user) then
    return 'unknown_user';
  end if;
  if exists (
    select 1 from public.billing_customers
    where provider = p_provider and customer_id = p_customer_id and user_id <> p_user
  ) then
    return 'taken';
  end if;
  insert into public.billing_customers as b (user_id, provider, customer_id, updated_at)
    values (p_user, p_provider, p_customer_id, now())
    on conflict (user_id) do update
      set provider = excluded.provider, customer_id = excluded.customer_id, updated_at = now();
  return 'linked';
end;
$$;

create or replace function public.billing_customer_of_user(p_provider text, p_user uuid) returns text
language sql stable security definer set search_path = public, pg_temp as $$
  select customer_id from public.billing_customers where provider = p_provider and user_id = p_user
$$;

create or replace function public.billing_user_of_customer(p_provider text, p_customer_id text) returns uuid
language sql stable security definer set search_path = public, pg_temp as $$
  select user_id from public.billing_customers where provider = p_provider and customer_id = p_customer_id
$$;

revoke all on function public.record_billing_customer(text, text, uuid) from public, anon, authenticated, service_role;
revoke all on function public.billing_customer_of_user(text, uuid) from public, anon, authenticated, service_role;
revoke all on function public.billing_user_of_customer(text, text) from public, anon, authenticated, service_role;
grant execute on function public.record_billing_customer(text, text, uuid) to service_role;
grant execute on function public.billing_customer_of_user(text, uuid) to service_role;
grant execute on function public.billing_user_of_customer(text, text) to service_role;

-- ===================================================================== Avisos de pago
-- Igual que en 20261008000003_payments_referrals.sql, salvo la rama de reembolso. Stripe ya no liga un
-- cargo con su factura, así que un reembolso puede llegar sin el id del pago. Entonces se busca el
-- último pago del alumno con ese monto. Un reembolso que no encuentra pago igual quita el plan
create or replace function public.apply_payment_notice(
  p_provider text,
  p_event_id text,
  p_payload jsonb,
  p_kind text,
  p_user uuid,
  p_plan text,
  p_provider_payment_id text,
  p_provider_subscription_id text,
  p_amount_mxn numeric,
  p_period_end timestamptz
) returns text
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_inserted integer;
  v_total integer;
  v_taken integer;
  v_end timestamptz;
  v_payments integer;
  v_pay text;
  v_pay_status text;
begin
  if p_provider not in ('stripe', 'mercadopago') then
    raise exception 'Procesador de pago desconocido' using errcode = '22023';
  end if;
  if p_kind not in ('paid', 'failed', 'canceled', 'refunded') then
    raise exception 'Tipo de aviso desconocido' using errcode = '22023';
  end if;
  if p_event_id is null or btrim(p_event_id) = '' or char_length(p_event_id) > 200 then
    raise exception 'Falta el id del evento' using errcode = '22023';
  end if;

  -- Un aviso repetido se reconoce por su id y no se vuelve a aplicar
  insert into public.payment_webhook_events (provider, event_id, payload)
    values (p_provider, p_event_id, coalesce(p_payload, '{}'::jsonb))
    on conflict (provider, event_id) do nothing;
  get diagnostics v_inserted = row_count;
  if v_inserted = 0 then return 'duplicate'; end if;

  if p_user is null or not exists (select 1 from auth.users where id = p_user) then
    update public.payment_webhook_events set processed_at = now() where provider = p_provider and event_id = p_event_id;
    return 'unknown_user';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('pay:' || p_user::text, 0));

  if p_kind = 'paid' then
    if p_plan is null or p_plan not in ('founder', 'monthly', 'annual')
       or p_provider_payment_id is null or btrim(p_provider_payment_id) = ''
       or p_amount_mxn is null or p_amount_mxn <= 0 then
      update public.payment_webhook_events set processed_at = now() where provider = p_provider and event_id = p_event_id;
      return 'ignored';
    end if;

    if p_plan = 'founder' then
      -- El cupo se verifica aquí, con un candado, para que dos pagos a la vez no pasen del límite
      perform pg_advisory_xact_lock(hashtextextended('founder_seats', 0));
      select coalesce((value ->> 'total')::integer, 100) into v_total from public.platform_settings where key = 'founder_seats';
      v_total := coalesce(v_total, 100);
      select count(*) into v_taken from public.subscriptions where plan = 'founder';
      if v_taken >= v_total and not exists (select 1 from public.subscriptions where user_id = p_user and plan = 'founder') then
        -- Se cobró y no hay lugar. Queda asentado para devolverlo, sin activar nada
        insert into public.payments (user_id, provider, provider_payment_id, amount_mxn, status)
          values (p_user, p_provider, p_provider_payment_id, p_amount_mxn, 'needs_refund')
          on conflict (provider, provider_payment_id) do nothing;
        update public.payment_webhook_events set processed_at = now() where provider = p_provider and event_id = p_event_id;
        return 'founder_full';
      end if;
    end if;

    insert into public.payments (user_id, provider, provider_payment_id, amount_mxn, status)
      values (p_user, p_provider, p_provider_payment_id, p_amount_mxn, 'paid')
      on conflict (provider, provider_payment_id) do nothing;
    v_end := coalesce(
      p_period_end,
      now() + case p_plan when 'annual' then interval '1 year' else interval '1 month' end
    );
    insert into public.subscriptions as s (user_id, plan, status, provider, provider_subscription_id, current_period_end, updated_at)
      values (p_user, p_plan, 'active', p_provider, p_provider_subscription_id, v_end, now())
      on conflict (user_id) do update
        set plan = excluded.plan,
            status = 'active',
            provider = excluded.provider,
            provider_subscription_id = coalesce(excluded.provider_subscription_id, s.provider_subscription_id),
            current_period_end = greatest(excluded.current_period_end, coalesce(s.current_period_end, excluded.current_period_end)),
            updated_at = now();
    -- El primer pago verificado concreta el referido
    select count(*) into v_payments from public.payments where user_id = p_user and status = 'paid';
    if v_payments = 1 then
      perform public.complete_referral(p_user);
    end if;
  elsif p_kind = 'failed' then
    update public.subscriptions set status = 'past_due', updated_at = now()
      where user_id = p_user and provider = p_provider and status = 'active';
  elsif p_kind = 'canceled' then
    update public.subscriptions set status = 'canceled', updated_at = now()
      where user_id = p_user and provider = p_provider and status in ('active', 'past_due');
  else
    -- Reembolso. Primero el pago que dice el aviso. Si no viene o no existe, el último pago del
    -- alumno con ese monto que siga sin devolverse
    v_pay := null;
    if p_provider_payment_id is not null then
      select provider_payment_id, status into v_pay, v_pay_status from public.payments
        where provider = p_provider and provider_payment_id = p_provider_payment_id and user_id = p_user;
    end if;
    if v_pay is null then
      select provider_payment_id, status into v_pay, v_pay_status from public.payments
        where provider = p_provider and user_id = p_user and status in ('paid', 'needs_refund')
          and (p_amount_mxn is null or amount_mxn = p_amount_mxn)
        order by created_at desc, id desc
        limit 1;
    end if;
    if v_pay is not null then
      update public.payments set status = 'refunded'
        where provider = p_provider and provider_payment_id = v_pay and user_id = p_user;
    end if;
    -- Devolver un cobro que nunca activó nada no quita el plan que el alumno tenga por otro pago
    if v_pay_status is distinct from 'needs_refund' then
      update public.subscriptions
        set status = 'canceled', current_period_end = least(coalesce(current_period_end, now()), now()), updated_at = now()
        where user_id = p_user and provider = p_provider;
    end if;
  end if;

  update public.payment_webhook_events set processed_at = now() where provider = p_provider and event_id = p_event_id;
  return 'applied';
end;
$$;

revoke all on function public.apply_payment_notice(text, text, jsonb, text, uuid, text, text, text, numeric, timestamptz)
  from public, anon, authenticated, service_role;
grant execute on function public.apply_payment_notice(text, text, jsonb, text, uuid, text, text, text, numeric, timestamptz)
  to service_role;
