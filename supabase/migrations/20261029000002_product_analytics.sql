-- Analítica de producto con PostHog: el ID seudónimo y la cola de eventos de dinero (B15 del plan del cambio,
-- 1.3 y 1.7 a 1.10 del diseño).
--
-- La verdad del dinero vive en el webhook de pagos (B10), no en el navegador. Esta migración deja que la base
-- encole, con el permiso del alumno, los eventos de cobro y suscripción para que la función analytics-flush
-- los mande a PostHog, aunque el alumno no abra la app.
--
-- Qué agrega
--   - El interruptor analytics { enabled } en platform_settings, apagado. Con él apagado nada se encola
--   - analytics_subjects, una fila por alumno con su ID seudónimo aleatorio (analytics_id) y si dio el
--     permiso Medición de uso (consent). El ID no se deriva del id de la cuenta y vale igual en todos los
--     dispositivos. Al retirar el permiso cambia por otro, así lo que se mida si vuelve a darlo no se une
--     con lo anterior (8.7)
--   - analytics_outbox, la cola de eventos de dinero. Solo eventos de una lista cerrada con propiedades que
--     son valores cortos de listas cerradas o sí y no, sin arroba. Nunca texto del alumno
--   - analytics_identity y set_analytics_consent, que usa la app con sesión y dispositivo activo
--   - analytics_enqueue, que decide si se encola, y los disparadores de subscriptions y payments. Los
--     disparadores nunca hacen fallar un pago: todo va dentro de un bloque que atrapa cualquier excepción
--   - claim_analytics_batch y finish_analytics_batch, que usa la función analytics-flush con la llave de
--     servicio. analytics_tick_ok compara la ficha de Cron contra Vault
--
-- Eventos y cuándo salen (1.7)
--   trial_started                  la suscripción pasa a trialing
--   trial_converted                el primer cobro convierte la prueba (de trialing a active con
--                                  first_charge_at, también si el estado active llegó antes que el cobro)
--   trial_canceled                 de trialing a canceled
--   subscription_cancel_scheduled  cancel_at_period_end pasa a true
--   subscription_canceled          de active o past_due a canceled
--   plan_changed                   cambia el plan pagado
--   payment_succeeded              un pago pasa a paid con monto mayor a 0. La factura de 0 pesos de la prueba
--                                  nunca cuenta como pago, igual que en los referidos (D-126)
--   refund_issued                  refunded_at se llena
--
-- Reglas que se hacen cumplir aquí
--   - Sin el permiso del alumno, o con analytics apagado, ningún cambio de subscriptions ni de payments encola
--   - Retirar el permiso marca dropped lo pendiente con un update y cambia el ID. Nunca borra. Borrar mis
--     datos quita todo lo del alumno en delete_my_data v4 (20261029000004), y borrar la cuenta lo quita
--     en cascada
--   - Las dos tablas tienen row level security, sin políticas y sin permisos de tabla para la API
--
-- Se aparta de 1.10 en una columna, send_after en analytics_outbox, para que dos envíos a la vez no tomen
-- los mismos eventos (apartar 10 minutos) y para espaciar los reintentos, igual que email_outbox.
--
-- Es idempotente, no edita las migraciones anteriores y no lleva delete ni drop (D-113). Va después de
-- 20261029000001_email_reminders.sql

-- ===================================================================== Interruptor
insert into public.platform_settings (key, value) values ('analytics', '{"enabled":false}')
  on conflict (key) do nothing;

-- ===================================================================== Tablas
create table if not exists public.analytics_subjects (
  user_id uuid primary key references auth.users (id) on delete cascade,
  analytics_id uuid not null unique default gen_random_uuid(),
  consent boolean not null default false,
  decided_at timestamptz not null default now()
);

create table if not exists public.analytics_outbox (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  analytics_id uuid not null,                     -- el ID que tenía al encolar
  event text not null check (event in ('trial_started', 'trial_converted', 'trial_canceled',
    'payment_succeeded', 'subscription_cancel_scheduled', 'subscription_canceled', 'plan_changed',
    'refund_issued')),
  properties jsonb not null default '{}'::jsonb
    check (strpos(properties::text, '@') = 0 and pg_column_size(properties) < 2000),
  occurred_at timestamptz not null,
  status text not null default 'queued' check (status in ('queued', 'sent', 'dropped', 'failed')),
  attempts integer not null default 0,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  send_after timestamptz not null default now()
);
create index if not exists analytics_outbox_queue on public.analytics_outbox (status, send_after);
create index if not exists analytics_outbox_user on public.analytics_outbox (user_id);

alter table public.analytics_subjects enable row level security;
alter table public.analytics_outbox enable row level security;
revoke all on public.analytics_subjects, public.analytics_outbox from public, anon, authenticated, service_role;

-- ===================================================================== Ayudas internas
-- Una propiedad de un evento de dinero cabe si es un valor corto de una lista cerrada (letras minúsculas y
-- guion bajo) o un sí y no. Cualquier otra cosa, como un texto libre, no se encola
create or replace function public.analytics_props_ok(p_props jsonb) returns boolean
language sql immutable set search_path = public, pg_temp as $$
  select p_props is not null and jsonb_typeof(p_props) = 'object'
    and not exists (
      select 1 from jsonb_each(p_props) e
      where not (
        jsonb_typeof(e.value) = 'boolean'
        or (jsonb_typeof(e.value) = 'string' and (e.value #>> '{}') ~ '^[a-z][a-z_]{0,23}$')
      )
    )
$$;

-- Encola un evento de dinero. Solo si analytics está prendido y el alumno dio el permiso. Quien la llama
-- es un disparador, y esta función nunca lanza por un dato raro: lo descarta
create or replace function public.analytics_enqueue(p_user uuid, p_event text, p_props jsonb, p_at timestamptz)
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_id uuid;
begin
  if coalesce((select value -> 'enabled' = 'true'::jsonb from public.platform_settings where key = 'analytics'), false) is not true then
    return;
  end if;
  select analytics_id into v_id from public.analytics_subjects where user_id = p_user and consent;
  if v_id is null or not public.analytics_props_ok(coalesce(p_props, '{}'::jsonb)) then
    return;
  end if;
  insert into public.analytics_outbox (user_id, analytics_id, event, properties, occurred_at)
    values (p_user, v_id, p_event, coalesce(p_props, '{}'::jsonb), coalesce(p_at, now()));
exception when others then
  -- Un evento perdido es mejor que un pago que falla
  return;
end;
$$;

-- ===================================================================== Identidad y permiso del alumno
-- El ID seudónimo del alumno, que crea la primera vez. Es el distinct_id de PostHog
create or replace function public.analytics_identity() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_user uuid := public.engagement_user();
  v_row public.analytics_subjects;
begin
  insert into public.analytics_subjects (user_id) values (v_user) on conflict (user_id) do nothing;
  select * into v_row from public.analytics_subjects where user_id = v_user;
  return jsonb_build_object('analyticsId', v_row.analytics_id, 'consent', v_row.consent);
end;
$$;

-- La app avisa cada vez que cambia el permiso Medición de uso. Darlo conserva el ID. Retirarlo marca
-- dropped lo pendiente con un update, cambia el ID y no borra nada
create or replace function public.set_analytics_consent(p_granted boolean) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_user uuid := public.engagement_user();
  v_row public.analytics_subjects;
begin
  if p_granted is null then
    raise exception 'Falta decir si das el permiso' using errcode = '22023';
  end if;
  insert into public.analytics_subjects (user_id) values (v_user) on conflict (user_id) do nothing;
  select * into v_row from public.analytics_subjects where user_id = v_user for update;
  if v_row.consent is distinct from p_granted then
    if p_granted then
      update public.analytics_subjects set consent = true, decided_at = now() where user_id = v_user
        returning * into v_row;
    else
      update public.analytics_outbox set status = 'dropped'
        where user_id = v_user and status in ('queued', 'failed');
      update public.analytics_subjects set consent = false, analytics_id = gen_random_uuid(), decided_at = now()
        where user_id = v_user returning * into v_row;
    end if;
  end if;
  return jsonb_build_object('analyticsId', v_row.analytics_id, 'consent', v_row.consent);
end;
$$;

-- ===================================================================== Disparadores del dinero
-- Todo va dentro de un bloque que atrapa cualquier excepción: medir nunca hace fallar un pago ni una
-- suscripción
create or replace function public.analytics_on_subscription() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_paid constant text[] := array['founder', 'founder_annual', 'monthly', 'annual'];
begin
  begin
    if new.plan = any (v_paid) then
      if new.status = 'trialing' and (tg_op = 'INSERT' or old.status is distinct from 'trialing') then
        perform public.analytics_enqueue(new.user_id, 'trial_started', jsonb_build_object('plan', new.plan), now());
      end if;
      if tg_op = 'UPDATE' then
        -- El primer cobro convierte la prueba. Cuenta también si el estado active llegó antes que el cobro
        if new.status = 'active' and new.first_charge_at is not null and old.first_charge_at is null
           and (old.status = 'trialing' or old.trial_ends_at is not null) then
          perform public.analytics_enqueue(new.user_id, 'trial_converted', jsonb_build_object('plan', new.plan), now());
        end if;
        if old.status = 'trialing' and new.status = 'canceled' then
          perform public.analytics_enqueue(new.user_id, 'trial_canceled', jsonb_build_object('plan', new.plan), now());
        end if;
        if not old.cancel_at_period_end and new.cancel_at_period_end then
          perform public.analytics_enqueue(new.user_id, 'subscription_cancel_scheduled', jsonb_build_object('plan', new.plan), now());
        end if;
        if old.status in ('active', 'past_due') and new.status = 'canceled' then
          perform public.analytics_enqueue(new.user_id, 'subscription_canceled', jsonb_build_object('plan', new.plan), now());
        end if;
        if old.plan = any (v_paid) and old.plan is distinct from new.plan then
          perform public.analytics_enqueue(
            new.user_id, 'plan_changed', jsonb_build_object('from_plan', old.plan, 'to_plan', new.plan), now());
        end if;
      end if;
    end if;
  exception when others then
    null;
  end;
  return new;
end;
$$;

create or replace function public.analytics_on_payment() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_props jsonb;
  v_first boolean;
begin
  begin
    v_props := jsonb_strip_nulls(jsonb_build_object(
      'plan', new.plan, 'purpose', new.purpose, 'method', new.method));
    -- Un pago que pasa a paid, con monto. La factura de 0 pesos de la prueba nunca cuenta
    if new.status = 'paid' and coalesce(new.amount_mxn, 0) > 0 and (tg_op = 'INSERT' or old.status is distinct from 'paid') then
      -- El primero es el primer cobro de la persona, sin contar el mismo
      select not exists (
        select 1 from public.payments p
        where p.user_id = new.user_id and p.id <> new.id and coalesce(p.amount_mxn, 0) > 0
          and p.status in ('paid', 'refunded')
      ) into v_first;
      perform public.analytics_enqueue(
        new.user_id, 'payment_succeeded', v_props || jsonb_build_object('first', coalesce(v_first, false)),
        coalesce(new.paid_at, now()));
    end if;
    if tg_op = 'UPDATE' and old.refunded_at is null and new.refunded_at is not null then
      perform public.analytics_enqueue(
        new.user_id, 'refund_issued', jsonb_strip_nulls(jsonb_build_object('purpose', new.purpose)), new.refunded_at);
    end if;
  exception when others then
    null;
  end;
  return new;
end;
$$;

create or replace trigger subscriptions_analytics after insert or update on public.subscriptions
  for each row execute function public.analytics_on_subscription();
create or replace trigger payments_analytics after insert or update on public.payments
  for each row execute function public.analytics_on_payment();

-- ===================================================================== Envío a PostHog
-- Toma hasta p_limit eventos listos y los aparta 10 minutos, así dos envíos a la vez no mandan los mismos.
-- Sube attempts. Solo con analytics prendido. Antes marca dropped lo de quien ya no tiene el permiso o cambió
-- de ID, por si algo quedó pendiente. Devuelve una lista JSON, vacía si no hay nada
create or replace function public.claim_analytics_batch(p_limit integer default 100) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_result jsonb;
begin
  if coalesce((select value -> 'enabled' = 'true'::jsonb from public.platform_settings where key = 'analytics'), false) is not true then
    return '[]'::jsonb;
  end if;
  update public.analytics_outbox o set status = 'dropped'
    where o.status in ('queued', 'failed')
      and not exists (select 1 from public.analytics_subjects s
                      where s.user_id = o.user_id and s.consent and s.analytics_id = o.analytics_id);
  with taken as (
    update public.analytics_outbox o
      set attempts = o.attempts + 1, send_after = now() + interval '10 minutes'
      where o.id in (
        select q.id from public.analytics_outbox q
        where q.status in ('queued', 'failed') and q.attempts < 5 and q.send_after <= now()
        order by q.send_after, q.created_at
        limit least(greatest(coalesce(p_limit, 100), 1), 100)
        for update skip locked
      )
      returning o.id, o.analytics_id, o.event, o.properties, o.occurred_at, o.created_at
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', t.id, 'analyticsId', t.analytics_id, 'event', t.event, 'properties', t.properties,
           'occurredAt', t.occurred_at) order by t.occurred_at, t.created_at), '[]'::jsonb)
    into v_result from taken t;
  return v_result;
end;
$$;

-- Cierra los eventos después de intentar mandarlos. sent y dropped son finales. failed los deja para otro
-- intento más tarde, hasta 5. queued los devuelve a la cola sin gastar el intento, para cuando el problema es
-- de la configuración (una llave que PostHog rechaza) y no de los eventos, y se reintentan en 5 minutos. Un
-- evento ya mandado no cambia
create or replace function public.finish_analytics_batch(p_ids uuid[], p_status text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if p_status is null or p_status not in ('sent', 'dropped', 'failed', 'queued') then
    raise exception 'Estado de evento desconocido' using errcode = '22023';
  end if;
  update public.analytics_outbox
    set status = p_status,
        sent_at = case when p_status = 'sent' then now() else sent_at end,
        attempts = case when p_status = 'queued' then greatest(attempts - 1, 0) else attempts end,
        send_after = case
          when p_status = 'failed' then now() + make_interval(mins => 15 * greatest(attempts, 1))
          when p_status = 'queued' then now() + interval '5 minutes'
          else send_after
        end
    where id = any (coalesce(p_ids, '{}'::uuid[])) and status in ('queued', 'failed');
end;
$$;

-- La ficha analytics_tick que manda Cron contra el secreto analytics_tick_secret de Vault. Lee Vault al
-- llamarse, así esta migración corre aunque Vault no exista, como en la base de las pruebas
create or replace function public.analytics_tick_ok(p_token text) returns boolean
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_secret text;
begin
  if p_token is null or char_length(p_token) < 32 or to_regclass('vault.decrypted_secrets') is null then
    return false;
  end if;
  execute 'select decrypted_secret from vault.decrypted_secrets where name = $1 limit 1'
    into v_secret using 'analytics_tick_secret';
  return v_secret is not null and char_length(v_secret) >= 32 and v_secret = p_token;
exception when others then
  return false;
end;
$$;

-- ===================================================================== Permisos de las funciones
-- Las internas no las ejecuta nadie de la API. Las del alumno piden sesión y dispositivo activo. Las del
-- servidor solo las ejecuta la llave de servicio
revoke all on function public.analytics_props_ok(jsonb) from public, anon, authenticated, service_role;
revoke all on function public.analytics_enqueue(uuid, text, jsonb, timestamptz) from public, anon, authenticated, service_role;
revoke all on function public.analytics_on_subscription() from public, anon, authenticated, service_role;
revoke all on function public.analytics_on_payment() from public, anon, authenticated, service_role;
-- Del alumno
revoke all on function public.analytics_identity() from public, anon, authenticated, service_role;
grant execute on function public.analytics_identity() to authenticated;
revoke all on function public.set_analytics_consent(boolean) from public, anon, authenticated, service_role;
grant execute on function public.set_analytics_consent(boolean) to authenticated;
-- Del servidor
revoke all on function public.claim_analytics_batch(integer) from public, anon, authenticated, service_role;
grant execute on function public.claim_analytics_batch(integer) to service_role;
revoke all on function public.finish_analytics_batch(uuid[], text) from public, anon, authenticated, service_role;
grant execute on function public.finish_analytics_batch(uuid[], text) to service_role;
revoke all on function public.analytics_tick_ok(text) from public, anon, authenticated, service_role;
grant execute on function public.analytics_tick_ok(text) to service_role;
