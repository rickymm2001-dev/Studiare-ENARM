-- Referidos con el primer cobro (bloque B7 del plan del cambio, respuesta 77 y 4.3, D-080, D-096).
--
-- El mes gratis lo da el servidor cuando el referido se concreta. Hoy es con su primer pago
-- verificado. Con la prueba gratis que llega en B10, el primer pago es el primer cobro después de la
-- prueba, es decir, la primera factura pagada con monto mayor a cero. La factura de 0 pesos con la
-- que Stripe abre una prueba nunca concreta un referido.
--
-- Qué cambia
--   - complete_referral se cuida sola. Solo concreta si el referido ya tiene un cobro verificado de
--     más de 0 pesos, así ninguna otra ruta puede dar el mes antes de tiempo. Sigue dando un solo mes
--     por referido (subscription_grants.referral_id es único) y solo toca un referido pendiente, con
--     el renglón bloqueado
--   - apply_payment_notice la llama con cada cobro verificado de más de 0 pesos, en lugar de contar
--     los pagos con estado paid del alumno. Con el conteo, una fila de 0 pesos de una prueba le habría
--     gastado el turno al primer cobro. Lo demás es igual que en 20261011000001_billing_portal.sql
--   - redeem_referral_code solo rechaza como ya pagó a quien ya tuvo un cobro de más de 0 pesos, así
--     quien está en una prueba sin cobro todavía puede entrar con el código de quien lo invitó
--   - Un aviso repetido sigue sin aplicarse dos veces (payment_webhook_events) y el mismo cobro con
--     otro aviso, como checkout.session.completed e invoice.paid de la misma factura, no se cuenta dos
--     veces (payments es único por procesador y pago)
--   - Un reembolso completo del cobro que concretó el referido lo revierte. El referido guarda qué cobro
--     lo concretó, queda marcado con reverted_at, sin borrar ninguna fila, y el mes que ganó quien
--     invitó termina en ese momento. Los meses que venían encadenados después se recorren para no dejar
--     un hueco. Un referido revertido no se vuelve a concretar ni cuenta para el tope de meses
--   - Dos alumnos no se refieren entre sí. redeem_referral_code contesta circular si quien canjea ya
--     invitó a la dueña del código
--
-- Es idempotente y no toca datos. Agrega tres columnas a referrals, vacías en los referidos de antes.
-- Se corre después de 20261016000001_avatars.sql. No edita las migraciones anteriores

-- ===================================================================== Referidos revertidos
-- Qué cobro concretó el referido y cuándo lo revirtió un reembolso. status sigue en completed
alter table public.referrals add column if not exists completed_provider text;
alter table public.referrals add column if not exists completed_payment_id text;
alter table public.referrals add column if not exists reverted_at timestamptz;

-- ===================================================================== Concretar un referido
-- Marca el referido como concretado, con el cobro que lo concretó, y da el mes gratis al referente, una
-- sola vez. La llama apply_payment_notice con un cobro verificado. Nadie más
create or replace function public.complete_referral(p_referred uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_ref public.referrals%rowtype;
  v_days integer;
  v_max integer;
  v_start timestamptz;
  v_provider text;
  v_payment text;
begin
  select * into v_ref from public.referrals where referred_id = p_referred and status = 'pending' for update;
  if not found then return; end if;
  -- Solo un cobro verificado de más de 0 pesos concreta el referido. La factura de 0 de una prueba
  -- gratis no es un cobro. Mientras el referido sigue pendiente, el primero de esos cobros es el que
  -- acaba de llegar
  select p.provider, p.provider_payment_id into v_provider, v_payment
    from public.payments p
    where p.user_id = p_referred and p.status = 'paid' and p.amount_mxn > 0
    order by p.created_at, p.id
    limit 1;
  if v_payment is null then
    return;
  end if;
  update public.referrals
    set status = 'completed', completed_at = now(), completed_provider = v_provider,
        completed_payment_id = v_payment
    where id = v_ref.id;
  select coalesce((value ->> 'rewardDays')::integer, 30), coalesce((value ->> 'maxRewards')::integer, 12)
    into v_days, v_max from public.platform_settings where key = 'referral_rules';
  v_days := coalesce(v_days, 30);
  v_max := coalesce(v_max, 12);
  -- Los meses de referidos revertidos no cuentan para el tope
  if (
    select count(*) from public.subscription_grants g
    left join public.referrals r on r.id = g.referral_id
    where g.user_id = v_ref.referrer_id and g.kind = 'referral' and r.reverted_at is null
  ) >= v_max then
    return;
  end if;
  -- Los meses regalados se encadenan, no se enciman
  select coalesce(max(ends_at), now()) into v_start
    from public.subscription_grants where user_id = v_ref.referrer_id and ends_at > now();
  v_start := greatest(v_start, now());
  insert into public.subscription_grants (user_id, kind, referral_id, starts_at, ends_at)
    values (v_ref.referrer_id, 'referral', v_ref.id, v_start, v_start + make_interval(days => v_days))
    on conflict (referral_id) do nothing;
end;
$$;

revoke all on function public.complete_referral(uuid) from public, anon, authenticated, service_role;

-- ===================================================================== Revertir un referido
-- La llama apply_payment_notice con un reembolso completo de p_payment del alumno p_referred. Si ese
-- cobro es el que concretó su referido, el referido queda revertido y el mes que ganó quien invitó
-- termina ahora. Un mes que todavía no empezaba, porque iba encadenado, queda sin días. Los meses que
-- venían después se recorren hacia atrás lo que se quitó, para que no quede un hueco sin plan. Los
-- referidos concretados antes de esta migración no guardaron su cobro, y para ellos cuenta el primer
-- cobro de más de 0 pesos del referido con ese procesador
create or replace function public.revert_referral(p_referred uuid, p_provider text, p_payment text)
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_ref public.referrals%rowtype;
  v_first text;
  v_grant public.subscription_grants%rowtype;
  v_cut timestamptz := now();
  v_gap interval;
begin
  select * into v_ref from public.referrals
    where referred_id = p_referred and status = 'completed' and reverted_at is null
    for update;
  if not found then return; end if;
  if v_ref.completed_payment_id is not null then
    if v_ref.completed_provider is distinct from p_provider or v_ref.completed_payment_id <> p_payment then
      return;
    end if;
  else
    select provider_payment_id into v_first from public.payments
      where user_id = p_referred and provider = p_provider and amount_mxn > 0
        and status in ('paid', 'refunded')
      order by created_at, id
      limit 1;
    if v_first is distinct from p_payment then return; end if;
  end if;
  update public.referrals set reverted_at = v_cut where id = v_ref.id;

  select * into v_grant from public.subscription_grants where referral_id = v_ref.id for update;
  -- Sin mes porque ya tenía el tope, o un mes que ya terminó, no hay nada que quitar
  if not found or v_grant.ends_at <= v_cut then return; end if;
  update public.subscription_grants
    set starts_at = least(starts_at, v_cut - interval '1 microsecond'), ends_at = v_cut
    where id = v_grant.id;
  v_gap := v_grant.ends_at - greatest(v_grant.starts_at, v_cut);
  update public.subscription_grants
    set starts_at = starts_at - v_gap, ends_at = ends_at - v_gap
    where user_id = v_grant.user_id and id <> v_grant.id and starts_at >= v_grant.ends_at;
end;
$$;

revoke all on function public.revert_referral(uuid, text, text) from public, anon, authenticated, service_role;

-- ===================================================================== Canjear un código
-- Igual que en 20261008000003_payments_referrals.sql, salvo ya pagó, que ahora es un cobro de más de
-- 0 pesos, y circular, cuando quien canjea ya invitó a la dueña del código. Devuelve ok, invalid,
-- own, already, circular, too_late o already_paid
create or replace function public.redeem_referral_code(p_code text) returns text
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_referrer uuid;
  v_window integer;
  v_created timestamptz;
begin
  if v_uid is null then
    raise exception 'Hace falta iniciar sesión' using errcode = '28000';
  end if;
  if not public.is_active_device() then
    raise exception 'Este dispositivo no es el activo de la cuenta' using errcode = '42501';
  end if;
  select user_id into v_referrer from public.referral_codes where code = upper(btrim(coalesce(p_code, '')));
  if v_referrer is null then return 'invalid'; end if;
  if v_referrer = v_uid then return 'own'; end if;
  if exists (select 1 from public.referrals where referred_id = v_uid) then return 'already'; end if;
  -- Dos alumnos no se refieren entre sí. Si quien canjea ya invitó a la dueña del código, cada primer
  -- cobro le daría un mes al otro
  if exists (select 1 from public.referrals where referrer_id = v_uid and referred_id = v_referrer) then
    return 'circular';
  end if;
  -- Quien ya tuvo un cobro no puede entrar como referido nuevo. Una prueba sin cobro no cuenta
  if exists (select 1 from public.payments where user_id = v_uid and amount_mxn > 0) then return 'already_paid'; end if;
  select coalesce((value ->> 'redeemWindowDays')::integer, 14) into v_window from public.platform_settings where key = 'referral_rules';
  select created_at into v_created from auth.users where id = v_uid;
  if v_created < now() - make_interval(days => coalesce(v_window, 14)) then return 'too_late'; end if;
  insert into public.referrals (referrer_id, referred_id, code) values (v_referrer, v_uid, upper(btrim(p_code)))
    on conflict (referred_id) do nothing;
  return 'ok';
end;
$$;

revoke all on function public.redeem_referral_code(text) from public, anon, service_role;
grant execute on function public.redeem_referral_code(text) to authenticated;

-- ===================================================================== Resumen del referente
-- Igual que en 20261008000003_payments_referrals.sql, salvo que un referido revertido ya no cuenta
-- como concretado ni su mes como ganado. reverted dice cuántos se revirtieron
create or replace function public.my_referrals() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Hace falta iniciar sesión' using errcode = '28000';
  end if;
  if not public.is_active_device() then
    raise exception 'Este dispositivo no es el activo de la cuenta' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'pending', (select count(*) from public.referrals where referrer_id = v_uid and status = 'pending'),
    'completed', (
      select count(*) from public.referrals
      where referrer_id = v_uid and status = 'completed' and reverted_at is null
    ),
    'reverted', (select count(*) from public.referrals where referrer_id = v_uid and reverted_at is not null),
    'monthsEarned', (
      select count(*) from public.subscription_grants g
      left join public.referrals r on r.id = g.referral_id
      where g.user_id = v_uid and g.kind = 'referral' and r.reverted_at is null
    ),
    'grantedUntil', (select max(ends_at) from public.subscription_grants where user_id = v_uid and ends_at > now()),
    'referredBy', exists (select 1 from public.referrals where referred_id = v_uid)
  );
end;
$$;

revoke all on function public.my_referrals() from public, anon, service_role;
grant execute on function public.my_referrals() to authenticated;

-- ===================================================================== Avisos de pago
-- Igual que en 20261011000001_billing_portal.sql, salvo cómo se concreta el referido y que un reembolso
-- completo del cobro que lo concretó lo revierte
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
  v_pay text;
  v_pay_status text;
  v_pay_at timestamptz;
  v_pay_amount numeric;
  v_charged_at timestamptz;
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

    -- Un aviso tardío o repetido de un pago que ya se devolvió no vuelve a activar nada. Stripe
    -- reintenta durante días y no garantiza el orden
    if exists (
      select 1 from public.payments
      where provider = p_provider and provider_payment_id = p_provider_payment_id and status = 'refunded'
    ) then
      update public.payment_webhook_events set processed_at = now() where provider = p_provider and event_id = p_event_id;
      return 'ignored';
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
    -- El referido se concreta con el primer cobro verificado, el primer pago con monto mayor a cero.
    -- complete_referral solo concreta un referido pendiente y revisa ella misma que haya ese cobro, así
    -- que un segundo cobro, una renovación o el mismo cobro con otro aviso no dan otro mes. Antes se
    -- contaban los pagos con estado paid y concretaba el primero, y una fila de 0 pesos de una prueba
    -- gratis (B10) le habría gastado el turno al primer cobro de verdad
    if p_amount_mxn > 0 then
      perform public.complete_referral(p_user);
    end if;
  elsif p_kind = 'failed' then
    update public.subscriptions set status = 'past_due', updated_at = now()
      where user_id = p_user and provider = p_provider and status = 'active';
  elsif p_kind = 'canceled' then
    update public.subscriptions set status = 'canceled', updated_at = now()
      where user_id = p_user and provider = p_provider and status in ('active', 'past_due');
  else
    -- Reembolso. Primero el pago que dice el aviso. Si no viene o no existe, el pago del alumno con
    -- ese monto que siga sin devolverse y esté más cerca de la hora en que Stripe dice que se cobró
    -- (data.object.created, en segundos). Sin esa hora, el más reciente
    v_pay := null;
    v_pay_status := null;
    v_pay_at := null;
    v_pay_amount := null;
    if p_provider_payment_id is not null then
      select provider_payment_id, status, created_at, amount_mxn
        into v_pay, v_pay_status, v_pay_at, v_pay_amount from public.payments
        where provider = p_provider and provider_payment_id = p_provider_payment_id and user_id = p_user;
    end if;
    if v_pay is null then
      v_charged_at := case
        when (p_payload #>> '{data,object,created}') ~ '^[0-9]{9,11}$'
          then to_timestamp((p_payload #>> '{data,object,created}')::bigint)
      end;
      select provider_payment_id, status, created_at, amount_mxn
        into v_pay, v_pay_status, v_pay_at, v_pay_amount from public.payments
        where provider = p_provider and user_id = p_user and status in ('paid', 'needs_refund')
          and (p_amount_mxn is null or amount_mxn = p_amount_mxn)
        order by case when v_charged_at is null then 0 else abs(extract(epoch from created_at - v_charged_at)) end,
                 created_at desc, id desc
        limit 1;
    end if;
    if v_pay is not null then
      update public.payments set status = 'refunded'
        where provider = p_provider and provider_payment_id = v_pay and user_id = p_user;
      -- Un reembolso completo del cobro que concretó un referido lo revierte y termina el mes que ganó
      -- quien invitó. Solo llegan reembolsos completos, porque stripeRefundFromEvent ignora los
      -- parciales y en Mercado Pago refunded es la devolución total. El monto se revisa de todos modos
      if p_amount_mxn is null or p_amount_mxn >= v_pay_amount then
        perform public.revert_referral(p_user, p_provider, v_pay);
      end if;
    end if;
    -- Devolver un cobro que nunca activó nada, o uno viejo cuando hay un pago más reciente que sigue
    -- vigente, no quita el plan que el alumno tiene pagado
    if v_pay_status is distinct from 'needs_refund'
       and not (
         v_pay_at is not null and exists (
           select 1 from public.payments
           where user_id = p_user and provider = p_provider and status = 'paid' and created_at > v_pay_at
         )
       ) then
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
