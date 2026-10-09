-- Pagos, plan Gratis y referidos, del lado del servidor (Fase P bloques 5, 10 y 11, D-080, D-087, D-096).
--
-- Reglas que se hacen cumplir aquí y no en el navegador
--   - Solo el servidor activa una suscripción. apply_payment_notice la llama la función de avisos de
--     pago con la llave de servicio, después de verificar la firma del aviso. Un aviso con el mismo id
--     de evento no se aplica dos veces, y un pago con el mismo id de pago tampoco se cuenta dos veces
--   - El plan Fundador tiene un cupo (platform_settings, founder_seats). Se verifica al cobrar, dentro
--     de la misma transacción que activa la suscripción, con un candado para que dos pagos a la vez no
--     pasen del cupo. Quien ya es Fundador conserva su lugar al renovar
--   - El plan Gratis tiene un tope diario de preguntas. grant_question_access cuenta las preguntas
--     distintas que el alumno abrió en su día de estudio (corte a las 4 a. m., hora de Mérida) y la
--     política de questions solo deja leer a un alumno Gratis las que ya abrió hoy. Manipular el
--     navegador no cambia nada
--   - El mes gratis por referido lo da solo el servidor, una sola vez por referido, cuando el referido
--     hace su primer pago verificado (recomendación de D-080). Quedan tope de meses por alumno y
--     ventana para canjear el código, ambos en platform_settings
--   - El plan efectivo de un alumno (user_plan) es el de su suscripción vigente y, si no la tiene, el
--     mensual mientras dure un mes regalado. Nadie lee el plan de otra persona
--
-- Es idempotente. Se corre después de 20261008000001_device_barrier.sql y 20261008000002_sync.sql. No
-- edita las migraciones anteriores

-- ===================================================================== Planes
alter table public.subscriptions drop constraint if exists subscriptions_plan_check;
alter table public.subscriptions
  add constraint subscriptions_plan_check check (plan in ('free', 'founder', 'monthly', 'annual'));

-- Precios de D-087 y reglas nuevas. No pisa un valor que el admin ya haya cambiado
update public.platform_settings
  set value = '{"free":{"priceMxn":0,"dailyQuestions":20},"founder":{"priceMxn":79},"monthly":{"priceMxn":150},"annual":{"priceMxn":1200}}'::jsonb,
      updated_at = now()
  where key = 'plans'
    and value = '{"free":{"priceMxn":0,"dailyQuestions":20},"monthly":{"priceMxn":249},"annual":{"priceMxn":1990}}'::jsonb;
insert into public.platform_settings (key, value) values
  ('founder_seats', '{"total":100}'),
  ('referral_rules', '{"rewardDays":30,"maxRewards":12,"redeemWindowDays":14}')
  on conflict (key) do nothing;

-- ===================================================================== Referidos y meses regalados
create table if not exists public.referral_codes (
  user_id uuid primary key references auth.users (id) on delete cascade,
  code text not null unique check (code ~ '^[A-Z0-9]{8}$'),
  created_at timestamptz not null default now()
);

create table if not exists public.referrals (
  id uuid primary key default gen_random_uuid(),
  referrer_id uuid not null references auth.users (id) on delete cascade,
  -- Un alumno solo puede ser referido una vez
  referred_id uuid not null unique references auth.users (id) on delete cascade,
  code text not null,
  status text not null default 'pending' check (status in ('pending', 'completed')),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  check (referrer_id <> referred_id)
);
create index if not exists referrals_referrer on public.referrals (referrer_id);

create table if not exists public.subscription_grants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('referral', 'admin')),
  -- Un referido da un solo mes gratis
  referral_id uuid unique references public.referrals (id) on delete set null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index if not exists subscription_grants_user on public.subscription_grants (user_id, ends_at);

-- ===================================================================== Preguntas abiertas por el plan Gratis
create table if not exists public.question_grants (
  user_id uuid not null references auth.users (id) on delete cascade,
  question_id uuid not null references public.questions (id) on delete cascade,
  day date not null,
  created_at timestamptz not null default now(),
  primary key (user_id, question_id, day)
);

-- Sin permisos de escritura para la API. Se lee con la política y se escribe con las funciones
alter table public.referral_codes enable row level security;
alter table public.referrals enable row level security;
alter table public.subscription_grants enable row level security;
alter table public.question_grants enable row level security;
revoke all on public.referral_codes, public.referrals, public.subscription_grants, public.question_grants
  from public, anon, authenticated, service_role;
grant select on public.referral_codes, public.referrals, public.subscription_grants to authenticated;

drop policy if exists referral_codes_select on public.referral_codes;
create policy referral_codes_select on public.referral_codes for select to authenticated
  using (user_id = auth.uid() and (select public.is_active_device()));
drop policy if exists referrals_select on public.referrals;
create policy referrals_select on public.referrals for select to authenticated
  using ((referrer_id = auth.uid() or referred_id = auth.uid()) and (select public.is_active_device()));
drop policy if exists subscription_grants_select on public.subscription_grants;
create policy subscription_grants_select on public.subscription_grants for select to authenticated
  using (user_id = auth.uid() and (select public.is_active_device()));

-- ===================================================================== Plan efectivo
-- El plan de pago vigente, o el mensual mientras dure un mes regalado, o free. El acceso lo marca el
-- fin del periodo ya pagado. Una suscripción cancelada o con un cobro fallido lo conserva hasta
-- entonces. Solo la llaman otras funciones del servidor
create or replace function public.user_plan(p_user uuid) returns text
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_plan text;
begin
  select s.plan into v_plan
  from public.subscriptions s
  where s.user_id = p_user
    and s.plan <> 'free'
    and s.status in ('active', 'past_due', 'canceled')
    and ((s.status = 'active' and s.current_period_end is null) or s.current_period_end > now());
  if v_plan is not null then return v_plan; end if;
  if exists (
    select 1 from public.subscription_grants g
    where g.user_id = p_user and g.starts_at <= now() and g.ends_at > now()
  ) then
    return 'monthly';
  end if;
  return 'free';
end;
$$;

-- El plan de quien llama, con la fecha hasta la que vale y de dónde viene. Es lo que lee la app
create or replace function public.my_plan() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_plan text;
  v_sub record;
  v_grant timestamptz;
begin
  if v_uid is null then
    raise exception 'Hace falta iniciar sesión' using errcode = '28000';
  end if;
  if not public.is_active_device() then
    raise exception 'Este dispositivo no es el activo de la cuenta' using errcode = '42501';
  end if;
  v_plan := public.user_plan(v_uid);
  select * into v_sub from public.subscriptions where user_id = v_uid;
  select max(ends_at) into v_grant from public.subscription_grants where user_id = v_uid and ends_at > now();
  return jsonb_build_object(
    'plan', v_plan,
    'source', case
      when v_plan = 'free' then 'none'
      when v_sub.user_id is not null and v_sub.plan = v_plan and v_sub.status in ('active', 'past_due', 'canceled')
        and (v_sub.current_period_end is null or v_sub.current_period_end > now()) then 'payment'
      else 'referral'
    end,
    'status', coalesce(v_sub.status, 'none'),
    'provider', v_sub.provider,
    'periodEnd', case
      when v_plan = 'free' then null
      when v_sub.user_id is not null and v_sub.plan = v_plan then v_sub.current_period_end
      else v_grant
    end
  );
end;
$$;

-- ===================================================================== Tope del plan Gratis
-- El día de estudio de México corta a las 4 a. m.
create or replace function public.study_day() returns date
language sql stable set search_path = public, pg_temp as $$
  select ((now() at time zone 'America/Merida') - interval '4 hours')::date
$$;

create or replace function public.free_daily_questions() returns integer
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((select (value -> 'free' ->> 'dailyQuestions')::integer from public.platform_settings where key = 'plans'), 20)
$$;

-- Si quien llama puede leer la pregunta. Médicos y administradores siempre. Los planes de pago
-- siempre. El alumno Gratis solo las que ya abrió hoy
create or replace function public.can_access_question(p_question uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select case
    when auth.uid() is null then false
    when public.current_app_role() <> 'student' then true
    when public.user_plan(auth.uid()) <> 'free' then true
    else exists (
      select 1 from public.question_grants g
      where g.user_id = auth.uid() and g.question_id = p_question and g.day = public.study_day()
    )
  end
$$;

-- Abre una pregunta para el alumno. Vuelve a abrir una que ya abrió hoy sin gastar cupo. Cuando el
-- alumno Gratis ya abrió su tope de preguntas distintas del día, lanza FR001
create or replace function public.grant_question_access(p_question uuid) returns boolean
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_count integer;
begin
  if v_uid is null then
    raise exception 'Hace falta iniciar sesión' using errcode = '28000';
  end if;
  if not public.is_active_device() then
    raise exception 'Este dispositivo no es el activo de la cuenta' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.questions q where q.id = p_question and (q.editorial_status = 'approved' or q.is_demo)
  ) then
    return false;
  end if;
  if public.current_app_role() <> 'student' or public.user_plan(v_uid) <> 'free' then
    return true;
  end if;
  perform pg_advisory_xact_lock(hashtextextended('qgrant:' || v_uid::text, 0));
  if exists (
    select 1 from public.question_grants g
    where g.user_id = v_uid and g.question_id = p_question and g.day = public.study_day()
  ) then
    return true;
  end if;
  select count(*) into v_count from public.question_grants g where g.user_id = v_uid and g.day = public.study_day();
  if v_count >= public.free_daily_questions() then
    raise exception 'Llegaste al límite de preguntas de hoy' using errcode = 'FR001';
  end if;
  insert into public.question_grants (user_id, question_id, day) values (v_uid, p_question, public.study_day());
  return true;
end;
$$;

-- Un alumno solo lee las preguntas que el plan le deja abrir. Médicos con lo asignado y
-- administradores no cambian
alter policy questions_select on public.questions using (
  public.is_admin()
  or exists (
    select 1 from public.review_assignments ra
    where ra.question_id = questions.question_id and ra.physician_id = auth.uid()
  )
  or ((editorial_status = 'approved' or is_demo) and public.can_access_question(questions.id))
);

-- ===================================================================== Referidos
create or replace function public.my_referral_code() returns text
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_code text;
begin
  if v_uid is null then
    raise exception 'Hace falta iniciar sesión' using errcode = '28000';
  end if;
  if not public.is_active_device() then
    raise exception 'Este dispositivo no es el activo de la cuenta' using errcode = '42501';
  end if;
  select code into v_code from public.referral_codes where user_id = v_uid;
  if v_code is not null then return v_code; end if;
  loop
    -- Hexadecimal sin 0 ni 1, para que no se confundan con la O y la I al dictarlo
    v_code := upper(substr(translate(md5(gen_random_uuid()::text || clock_timestamp()::text), '01', 'GH'), 1, 8));
    begin
      insert into public.referral_codes (user_id, code) values (v_uid, v_code)
        on conflict (user_id) do nothing;
      select code into v_code from public.referral_codes where user_id = v_uid;
      return v_code;
    exception when unique_violation then
      -- Otro alumno tenía ese código. Se prueba con otro
      null;
    end;
  end loop;
end;
$$;

-- Canjea el código de otro alumno. Devuelve ok, invalid, own, already, too_late o already_paid
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
  -- Quien ya pagó o ya tuvo un plan de pago no puede entrar como referido nuevo
  if exists (select 1 from public.payments where user_id = v_uid) then return 'already_paid'; end if;
  select coalesce((value ->> 'redeemWindowDays')::integer, 14) into v_window from public.platform_settings where key = 'referral_rules';
  select created_at into v_created from auth.users where id = v_uid;
  if v_created < now() - make_interval(days => coalesce(v_window, 14)) then return 'too_late'; end if;
  insert into public.referrals (referrer_id, referred_id, code) values (v_referrer, v_uid, upper(btrim(p_code)))
    on conflict (referred_id) do nothing;
  return 'ok';
end;
$$;

-- El resumen de quien llama como referente
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
    'completed', (select count(*) from public.referrals where referrer_id = v_uid and status = 'completed'),
    'monthsEarned', (select count(*) from public.subscription_grants where user_id = v_uid and kind = 'referral'),
    'grantedUntil', (select max(ends_at) from public.subscription_grants where user_id = v_uid and ends_at > now()),
    'referredBy', exists (select 1 from public.referrals where referred_id = v_uid)
  );
end;
$$;

-- Marca el referido como concretado y da el mes gratis al referente, una sola vez. La llama
-- apply_payment_notice con el primer pago verificado. Nadie más
create or replace function public.complete_referral(p_referred uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_ref public.referrals%rowtype;
  v_days integer;
  v_max integer;
  v_start timestamptz;
  v_grant uuid;
begin
  select * into v_ref from public.referrals where referred_id = p_referred and status = 'pending' for update;
  if not found then return; end if;
  update public.referrals set status = 'completed', completed_at = now() where id = v_ref.id;
  select coalesce((value ->> 'rewardDays')::integer, 30), coalesce((value ->> 'maxRewards')::integer, 12)
    into v_days, v_max from public.platform_settings where key = 'referral_rules';
  v_days := coalesce(v_days, 30);
  v_max := coalesce(v_max, 12);
  if (select count(*) from public.subscription_grants where user_id = v_ref.referrer_id and kind = 'referral') >= v_max then
    return;
  end if;
  -- Los meses regalados se encadenan, no se encimen
  select coalesce(max(ends_at), now()) into v_start
    from public.subscription_grants where user_id = v_ref.referrer_id and ends_at > now();
  v_start := greatest(v_start, now());
  insert into public.subscription_grants (user_id, kind, referral_id, starts_at, ends_at)
    values (v_ref.referrer_id, 'referral', v_ref.id, v_start, v_start + make_interval(days => v_days))
    returning id into v_grant;
end;
$$;

-- ===================================================================== Avisos de pago
-- La única puerta para activar o cambiar una suscripción. La llama la función de avisos de pago
-- con la llave de servicio, ya con la firma del aviso verificada. Devuelve applied, duplicate,
-- founder_full, unknown_user o ignored
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
    update public.payments set status = 'refunded'
      where provider = p_provider and provider_payment_id = p_provider_payment_id and user_id = p_user;
    update public.subscriptions
      set status = 'canceled', current_period_end = least(coalesce(current_period_end, now()), now()), updated_at = now()
      where user_id = p_user and provider = p_provider;
  end if;

  update public.payment_webhook_events set processed_at = now() where provider = p_provider and event_id = p_event_id;
  return 'applied';
end;
$$;

-- ===================================================================== Permisos de las funciones
-- user_plan, complete_referral y apply_payment_notice no las ejecuta ninguna sesión de la app
revoke all on function public.user_plan(uuid) from public, anon, authenticated, service_role;
revoke all on function public.complete_referral(uuid) from public, anon, authenticated, service_role;
revoke all on function public.free_daily_questions() from public, anon, service_role;
grant execute on function public.free_daily_questions() to authenticated;
revoke all on function public.apply_payment_notice(text, text, jsonb, text, uuid, text, text, text, numeric, timestamptz)
  from public, anon, authenticated, service_role;
grant execute on function public.apply_payment_notice(text, text, jsonb, text, uuid, text, text, text, numeric, timestamptz)
  to service_role;
revoke all on function public.study_day() from public, anon, service_role;
grant execute on function public.study_day() to authenticated;
revoke all on function public.can_access_question(uuid) from public, anon, service_role;
grant execute on function public.can_access_question(uuid) to authenticated;
revoke all on function public.my_plan() from public, anon, service_role;
grant execute on function public.my_plan() to authenticated;
revoke all on function public.grant_question_access(uuid) from public, anon, service_role;
grant execute on function public.grant_question_access(uuid) to authenticated;
revoke all on function public.my_referral_code() from public, anon, service_role;
grant execute on function public.my_referral_code() to authenticated;
revoke all on function public.redeem_referral_code(text) from public, anon, service_role;
grant execute on function public.redeem_referral_code(text) to authenticated;
revoke all on function public.my_referrals() from public, anon, service_role;
grant execute on function public.my_referrals() to authenticated;
