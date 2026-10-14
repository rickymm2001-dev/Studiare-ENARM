-- Pagos completos (B10 del plan del cambio, respuestas 1, 2 y 7 a 21, secciones 1 y 2 del diseño).
--
-- Qué agrega
--   - Prueba gratis de 7 días con tarjeta (estado trialing), una por persona. Cuenta como plan vigente.
--     La prueba usada queda en trial_history con la huella del correo y sobrevive al borrado de la cuenta
--   - Fundador anual (founder_annual, 749 al año) que comparte los 100 lugares con el Fundador mensual.
--     Los lugares viven en founder_seats. Se aparta al empezar la prueba y se confirma con el primer
--     cobro. Se libera si la suscripción termina sin cobro o si se devuelve completo su único cobro
--   - Pases de un solo pago (OXXO y SPEI) de 1 mes o 1 año, que se suman desde la fecha de fin
--   - Cambio de plan por Price ID, cancelación al final del periodo y cambio programado
--   - Códigos de descuento guardados en payments y contados para el admin
--   - Acciones con la pasarela (billing_actions) que decide la base y ejecuta la función de avisos,
--     como cancelar en Stripe una prueba repetida o una suscripción reembolsada
--
-- Reglas que se hacen cumplir aquí y no en el navegador
--   - La regla de qué plan tiene cada quien vive solo aquí, en user_plan, my_plan y checkout_context.
--     Las funciones y la app leen el resultado y no la repiten
--   - La pasarela es la fuente del estado de cada suscripción. La base guarda la foto más reciente y
--     descarta un aviso de estado más viejo que el último aplicado (state_at)
--   - Ningún aviso cambia algo dos veces. Los eventos se reconocen por id en payment_webhook_events y
--     los cobros por pasarela y cobro en payments. Un pase es único por pasarela y cobro
--   - Una suscripción vigente nunca se reemplaza por otra. Una segunda suscripción o una segunda prueba
--     se marcan, su cobro queda para devolverse y la base deja la acción de cancelarla
--   - El acceso de una suscripción llega hasta lo que se pagó. Un aviso de estado no alarga el periodo,
--     solo la prueba y los cobros lo hacen, así un cobro fallido no regala otro periodo
--   - Las funciones de servidor solo las ejecuta la llave de servicio. Las de la app piden sesión y el
--     dispositivo activo. Las del admin piden is_admin, que con B9 también pide el segundo factor
--
-- Sección con drop. Las dos restricciones de subscriptions se cambian con drop y add, y delete_my_account
-- lleva su delete de siempre. Las dos piezas también están en supabase/manual/pagos-b10.sql para pegarlas
-- a mano si el conector pide confirmación (D-113, 8.12)
--
-- Es idempotente. Se corre después de 20261022000001_billing_emails.sql. No edita las migraciones
-- anteriores. Si alguien vuelve a correr 20261008000003, 20261011000001 o 20261019000001, hay que
-- correr esta otra vez después, porque esas traen otras versiones de user_plan, my_plan,
-- apply_payment_notice y delete_my_account

-- ===================================================================== Columnas nuevas
alter table public.subscriptions
  add column if not exists price_id text,
  add column if not exists trial_ends_at timestamptz,
  add column if not exists cancel_at_period_end boolean not null default false,
  -- Bajada de plan programada en el portal para el fin del periodo
  add column if not exists scheduled_change boolean not null default false,
  -- Código con el que se contrató, en mayúsculas
  add column if not exists promotion_code text check (promotion_code ~ '^[A-Z0-9-]{2,40}$'),
  -- Primer cobro mayor a 0, desde el que cuenta la garantía
  add column if not exists first_charge_at timestamptz,
  -- Hora del último aviso de estado aplicado
  add column if not exists state_at timestamptz,
  add column if not exists issue text check (issue in ('founder_full', 'trial_duplicate', 'second_subscription')),
  add column if not exists issue_at timestamptz;

alter table public.payments
  add column if not exists purpose text check (purpose in ('subscription', 'pass')),
  add column if not exists plan text check (plan in ('founder', 'founder_annual', 'monthly', 'annual')),
  add column if not exists method text check (method in ('card', 'oxxo', 'spei', 'mercadopago')),
  add column if not exists payment_intent_id text,
  add column if not exists provider_subscription_id text,
  add column if not exists discount_mxn numeric(10, 2),
  add column if not exists promotion_code text check (promotion_code ~ '^[A-Z0-9-]{2,40}$'),
  add column if not exists paid_at timestamptz,
  -- Vencimiento de la ficha OXXO, o la hora en que venció
  add column if not exists expires_at timestamptz,
  add column if not exists refunded_at timestamptz,
  add column if not exists admin_note text check (char_length(admin_note) <= 500);
create index if not exists payments_user_status on public.payments (user_id, status);
create index if not exists payments_intent on public.payments (provider, payment_intent_id)
  where payment_intent_id is not null;
-- Los cobros de antes no tenían hora de pago. Es la de su fila
update public.payments set paid_at = created_at
  where paid_at is null and status in ('paid', 'refunded', 'needs_refund');

-- Lo que devolvió la función con cada aviso, para revisarlo a mano
alter table public.payment_webhook_events add column if not exists result text;

-- ===================================================================== Sección con drop
-- También va en supabase/manual/pagos-b10.sql. Acepta el Fundador anual y el estado de prueba
alter table public.subscriptions drop constraint if exists subscriptions_plan_check;
alter table public.subscriptions add constraint subscriptions_plan_check
  check (plan in ('free', 'founder', 'founder_annual', 'monthly', 'annual'));
alter table public.subscriptions drop constraint if exists subscriptions_status_check;
alter table public.subscriptions add constraint subscriptions_status_check
  check (status in ('trialing', 'active', 'past_due', 'canceled'));
-- ===================================================================== Fin de la sección con drop

-- ===================================================================== Configuración
-- El precio del Fundador anual. No pisa un valor que el admin ya haya cambiado
update public.platform_settings
  set value = '{"free":{"priceMxn":0,"dailyQuestions":20},"founder":{"priceMxn":79},"founder_annual":{"priceMxn":749},"monthly":{"priceMxn":149},"annual":{"priceMxn":1499}}'::jsonb,
      updated_at = now()
  where key = 'plans'
    and value = '{"free":{"priceMxn":0,"dailyQuestions":20},"founder":{"priceMxn":79},"monthly":{"priceMxn":149},"annual":{"priceMxn":1499}}'::jsonb;

-- ===================================================================== Tablas nuevas
-- Lugares Fundador. Uno por persona, compartido entre founder y founder_annual. Sin dueño, porque se
-- borró la cuenta, sigue contando
create table if not exists public.founder_seats (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users (id) on delete set null,
  plan text not null check (plan in ('founder', 'founder_annual')),
  status text not null check (status in ('held', 'confirmed', 'released')),
  provider text not null check (provider in ('stripe', 'mercadopago')),
  provider_subscription_id text,
  held_at timestamptz not null default now(),
  confirmed_at timestamptz,
  released_at timestamptz,
  updated_at timestamptz not null default now()
);
create index if not exists founder_seats_subscription on public.founder_seats (provider, provider_subscription_id);

-- Pruebas gratis. Una por cuenta y una por correo normalizado
create table if not exists public.trial_claims (
  user_id uuid primary key references auth.users (id) on delete cascade,
  email_key text not null,
  provider text not null check (provider in ('stripe', 'mercadopago')),
  provider_subscription_id text not null,
  plan text not null check (plan in ('founder', 'founder_annual', 'monthly', 'annual')),
  status text not null check (status in ('started', 'converted', 'canceled', 'voided')),
  promotion_code text,
  started_at timestamptz not null default now(),
  ends_at timestamptz,
  converted_at timestamptz,
  canceled_at timestamptz,
  updated_at timestamptz not null default now()
);
create unique index if not exists trial_claims_email_key on public.trial_claims (email_key)
  where status <> 'voided';
create index if not exists trial_claims_subscription on public.trial_claims (provider, provider_subscription_id);

-- Pruebas usadas, para siempre. Una fila por suscripción que empezó una prueba que cuenta. trial_claims se
-- borra con la cuenta, así que sin esta tabla el mismo correo volvería a tener prueba al abrir otra cuenta.
-- Sobrevive al borrado (user_id queda en null) y no guarda el correo, solo la huella SHA-256 de su clave
-- normalizada (trial_key_hash). Solo se agrega. Ninguna función la cambia ni la borra, salvo la limpieza
-- manual de las cuentas de prueba
create table if not exists public.trial_history (
  id uuid primary key default gen_random_uuid(),
  email_hash text not null,
  user_id uuid references auth.users (id) on delete set null,
  provider text not null check (provider in ('stripe', 'mercadopago')),
  provider_subscription_id text not null,
  started_at timestamptz not null default now(),
  unique (provider, provider_subscription_id)
);
create index if not exists trial_history_email on public.trial_history (email_hash);

-- Pases de un solo pago
create table if not exists public.plan_passes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  plan text not null check (plan in ('monthly', 'annual')),
  provider text not null check (provider in ('stripe', 'mercadopago')),
  provider_payment_id text not null,
  method text not null check (method in ('oxxo', 'spei', 'mercadopago')),
  starts_at timestamptz not null,
  ends_at timestamptz not null check (ends_at > starts_at),
  status text not null default 'active' check (status in ('active', 'refunded')),
  created_at timestamptz not null default now(),
  unique (provider, provider_payment_id)
);
create index if not exists plan_passes_user on public.plan_passes (user_id, ends_at);

-- Acciones con la pasarela que decide la base y ejecuta la función de avisos, con reintento
create table if not exists public.billing_actions (
  id uuid primary key default gen_random_uuid(),
  -- De quién es la suscripción, para el admin y para limpiar los pagos de prueba
  user_id uuid references auth.users (id) on delete set null,
  provider text not null check (provider in ('stripe', 'mercadopago')),
  kind text not null check (kind in ('cancel_subscription')),
  -- Id de la suscripción en la pasarela
  target text not null,
  reason text not null check (reason in ('trial_duplicate', 'second_subscription', 'founder_full', 'refund')),
  status text not null default 'pending' check (status in ('pending', 'done', 'failed')),
  attempts integer not null default 0,
  last_error text check (char_length(last_error) <= 500),
  created_at timestamptz not null default now(),
  -- La última vez que una función la tomó. Dos avisos a la vez no la ejecutan dos veces
  claimed_at timestamptz,
  done_at timestamptz,
  unique (provider, kind, target)
);
create index if not exists billing_actions_user on public.billing_actions (user_id);

-- Permisos por fila. Los pases propios con la barrera del dispositivo. Lo demás solo el servidor
alter table public.plan_passes enable row level security;
alter table public.founder_seats enable row level security;
alter table public.trial_claims enable row level security;
alter table public.billing_actions enable row level security;
alter table public.trial_history enable row level security;
revoke all on public.plan_passes, public.founder_seats, public.trial_claims, public.billing_actions,
  public.trial_history
  from public, anon, authenticated, service_role;
grant select on public.plan_passes to authenticated;
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'plan_passes' and policyname = 'plan_passes_select'
  ) then
    create policy plan_passes_select on public.plan_passes for select to authenticated
      using ((user_id = auth.uid() and (select public.is_active_device())) or public.is_admin());
  end if;
end $$;

-- Los Fundadores de antes ya tienen su lugar. Se rellena una vez y no pisa lo que ya exista
insert into public.founder_seats (user_id, plan, status, provider, provider_subscription_id, held_at, confirmed_at, updated_at)
  select s.user_id, 'founder', 'confirmed', coalesce(s.provider, 'stripe'), s.provider_subscription_id,
         s.updated_at, s.updated_at, now()
  from public.subscriptions s
  where s.plan = 'founder'
  on conflict (user_id) do nothing;

-- ===================================================================== Ayudas internas
-- Un código de descuento en mayúsculas, o null si no tiene la forma que acepta payments
create or replace function public.billing_promo_code(p_code text) returns text
language sql immutable set search_path = public, pg_temp as $$
  select case when upper(btrim(p_code)) ~ '^[A-Z0-9-]{2,40}$' then upper(btrim(p_code)) end
$$;

-- Si una suscripción guardada sigue vigente. trialing, active, past_due o canceled con el fin del
-- periodo pagado por delante, o sin fecha con trialing o active
create or replace function public.billing_in_force(p_plan text, p_status text, p_end timestamptz)
returns boolean
language sql stable set search_path = public, pg_temp as $$
  select coalesce(
    p_plan <> 'free'
      and p_status in ('trialing', 'active', 'past_due', 'canceled')
      and ((p_status in ('trialing', 'active') and p_end is null) or p_end > now()),
    false
  )
$$;

-- Registra un aviso. false si ya se había recibido, así nada se aplica dos veces
create or replace function public.billing_register_event(p_provider text, p_event_id text, p_payload jsonb)
returns boolean
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_rows integer;
begin
  if p_provider is null or p_provider not in ('stripe', 'mercadopago') then
    raise exception 'Procesador de pago desconocido' using errcode = '22023';
  end if;
  if p_event_id is null or btrim(p_event_id) = '' or char_length(p_event_id) > 200 then
    raise exception 'Falta el id del evento' using errcode = '22023';
  end if;
  insert into public.payment_webhook_events (provider, event_id, payload)
    values (p_provider, p_event_id, coalesce(p_payload, '{}'::jsonb))
    on conflict (provider, event_id) do nothing;
  get diagnostics v_rows = row_count;
  return v_rows > 0;
end;
$$;

-- Marca el aviso como procesado con su resultado y lo devuelve
create or replace function public.billing_event_done(p_provider text, p_event_id text, p_result text)
returns text
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update public.payment_webhook_events set processed_at = now(), result = p_result
    where provider = p_provider and event_id = p_event_id;
  return p_result;
end;
$$;

-- Deja la acción de cancelar una suscripción en la pasarela. Una vez por suscripción
create or replace function public.billing_queue_cancel(p_user uuid, p_provider text, p_target text, p_reason text)
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if p_target is null or btrim(p_target) = '' then return; end if;
  insert into public.billing_actions (user_id, provider, kind, target, reason)
    values (p_user, p_provider, 'cancel_subscription', p_target, p_reason)
    on conflict (provider, kind, target) do nothing;
end;
$$;

-- Deja el aviso para el alumno en su fila de suscripción. Sin fila crea una vacía, en Gratis y cancelada,
-- que no da acceso y que toma la próxima suscripción
create or replace function public.billing_mark_issue(p_user uuid, p_issue text, p_provider text)
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into public.subscriptions as s (user_id, plan, status, provider, current_period_end, issue, issue_at, updated_at)
    values (p_user, 'free', 'canceled', p_provider, now(), p_issue, now(), now())
    on conflict (user_id) do update set issue = excluded.issue, issue_at = now(), updated_at = now();
end;
$$;

-- Total de lugares Fundador. 100 si no está configurado o no se lee
create or replace function public.founder_seats_total() returns integer
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(
    (select case when (value ->> 'total') ~ '^[0-9]+$' then (value ->> 'total')::integer end
       from public.platform_settings where key = 'founder_seats'),
    100
  )
$$;

-- Lugares ocupados, apartados por una prueba o confirmados por un cobro. Quien los cuenta para decidir
-- toma antes el candado founder_seats
create or replace function public.founder_seats_taken() returns integer
language sql stable security definer set search_path = public, pg_temp as $$
  select count(*)::integer from public.founder_seats where status in ('held', 'confirmed')
$$;

-- La promoción sigue abierta salvo que founder_seats diga "open":false (8.21)
create or replace function public.founder_promo_open() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(
    (select (value -> 'open') is distinct from 'false'::jsonb
       from public.platform_settings where key = 'founder_seats'),
    true
  )
$$;

-- Aparta o confirma el lugar Fundador del alumno para una suscripción, con el candado del cupo. Quien ya
-- tiene su lugar lo conserva y lo mueve a esta suscripción. Devuelve false si ya no hay lugar
create or replace function public.billing_take_seat(
  p_user uuid, p_plan text, p_status text, p_provider text, p_subscription_id text
) returns boolean
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_seat public.founder_seats%rowtype;
begin
  perform pg_advisory_xact_lock(hashtextextended('founder_seats', 0));
  select * into v_seat from public.founder_seats where user_id = p_user for update;
  if found and v_seat.status in ('held', 'confirmed') then
    update public.founder_seats
      set provider = p_provider,
          provider_subscription_id = coalesce(p_subscription_id, provider_subscription_id),
          status = case when p_status = 'confirmed' or status = 'confirmed' then 'confirmed' else 'held' end,
          confirmed_at = case when p_status = 'confirmed' and status = 'held' then now() else confirmed_at end,
          updated_at = now()
      where id = v_seat.id;
    return true;
  end if;
  if public.founder_seats_taken() >= public.founder_seats_total() then
    return false;
  end if;
  insert into public.founder_seats as f (user_id, plan, status, provider, provider_subscription_id, held_at, confirmed_at, updated_at)
    values (p_user, p_plan, p_status, p_provider, p_subscription_id, now(),
            case when p_status = 'confirmed' then now() end, now())
    on conflict (user_id) do update
      set plan = excluded.plan, status = excluded.status, provider = excluded.provider,
          provider_subscription_id = excluded.provider_subscription_id, held_at = now(),
          confirmed_at = excluded.confirmed_at, released_at = null, updated_at = now();
  return true;
end;
$$;

-- Al terminar una suscripción, su prueba queda usada (canceled) y su lugar apartado sin cobro se libera
create or replace function public.billing_close_subscription(p_provider text, p_subscription_id text)
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update public.trial_claims set status = 'canceled', canceled_at = now(), updated_at = now()
    where provider = p_provider and provider_subscription_id = p_subscription_id and status = 'started';
  update public.founder_seats set status = 'released', released_at = now(), updated_at = now()
    where provider = p_provider and provider_subscription_id = p_subscription_id and status = 'held';
end;
$$;

-- La clave de una prueba por correo. Minúsculas, sin el sufijo +algo y, en gmail.com y googlemail.com,
-- sin puntos y con dominio gmail.com. null si no parece un correo
create or replace function public.trial_email_key(p_email text) returns text
language plpgsql immutable set search_path = public, pg_temp as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_local text;
  v_domain text;
begin
  v_local := substring(v_email from '^(.*)@[^@]*$');
  v_domain := substring(v_email from '@([^@]*)$');
  if v_local is null or v_local = '' or v_domain is null or v_domain = '' then
    return null;
  end if;
  v_local := split_part(v_local, '+', 1);
  if v_domain in ('gmail.com', 'googlemail.com') then
    v_local := replace(v_local, '.', '');
    v_domain := 'gmail.com';
  end if;
  return v_local || '@' || v_domain;
end;
$$;

-- La clave de la cuenta. Sin un correo que se entienda, la cuenta misma
create or replace function public.trial_account_key(p_user uuid) returns text
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(public.trial_email_key((select email from auth.users where id = p_user)), 'id:' || p_user::text)
$$;

-- La huella de la clave de una cuenta, que es lo único que guarda trial_history. sha256 viene con Postgres
-- desde la versión 11, sin extensiones
create or replace function public.trial_key_hash(p_key text) returns text
language sql immutable set search_path = public, pg_temp as $$
  select encode(sha256(convert_to(p_key, 'UTF8')), 'hex')
$$;

-- Las pruebas que ya contaban antes de trial_history quedan también ahí. No pisa lo que ya exista
insert into public.trial_history (email_hash, user_id, provider, provider_subscription_id, started_at)
  select public.trial_key_hash(t.email_key), t.user_id, t.provider, t.provider_subscription_id, t.started_at
  from public.trial_claims t
  where t.status in ('started', 'converted', 'canceled')
  on conflict (provider, provider_subscription_id) do nothing;

-- Si la cuenta ya usó su prueba, si otra cuenta con el mismo correo normalizado ya la usó, también una
-- cuenta ya borrada (trial_history), o si la cuenta ya tuvo un cobro mayor a 0. Una prueba anulada por
-- cupo lleno (voided) no cuenta
create or replace function public.trial_already_used(p_user uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
      select 1 from public.trial_claims t
      where t.user_id = p_user and t.status in ('started', 'converted', 'canceled')
    )
    or exists (
      select 1 from public.trial_claims t
      where t.email_key = public.trial_account_key(p_user) and t.user_id <> p_user
        and t.status in ('started', 'converted', 'canceled')
    )
    or exists (
      select 1 from public.trial_history h
      where h.email_hash = public.trial_key_hash(public.trial_account_key(p_user))
    )
    or exists (
      select 1 from public.payments p
      where p.user_id = p_user and p.status in ('paid', 'refunded', 'needs_refund') and p.amount_mxn > 0
    )
$$;

-- Si a la cuenta le toca la prueba gratis. trialDays en 0 la apaga para todos
create or replace function public.trial_available(p_user uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select public.billing_rule('trialDays', 7) > 0 and not public.trial_already_used(p_user)
$$;

-- ===================================================================== Plan efectivo
-- El plan de pago vigente (también en prueba), o el de un pase activo, o el mensual mientras dure un mes
-- regalado, o free. Todo lo que usa user_plan hereda la prueba y los pases. Solo la llaman otras
-- funciones del servidor
create or replace function public.user_plan(p_user uuid) returns text
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_plan text;
begin
  select s.plan into v_plan
  from public.subscriptions s
  where s.user_id = p_user and public.billing_in_force(s.plan, s.status, s.current_period_end);
  if v_plan is not null then return v_plan; end if;
  -- Pase activo que cubre ahora. El anual si alguno lo es
  select case when bool_or(p.plan = 'annual') then 'annual' else 'monthly' end into v_plan
  from public.plan_passes p
  where p.user_id = p_user and p.status = 'active' and p.starts_at <= now() and p.ends_at > now()
  having count(*) > 0;
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

-- El plan de quien llama, con todo lo que la app necesita para explicarlo (my_plan v2, 1.8 del diseño).
-- Los cinco campos de antes conservan su sentido
create or replace function public.my_plan() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_plan text;
  v_sub public.subscriptions%rowtype;
  v_sub_live boolean;
  v_pass_now boolean;
  v_pass_end timestamptz;
  v_grant timestamptz;
  v_source text;
  v_period_end timestamptz;
  v_guarantee timestamptz;
  v_guarantee_days integer := public.billing_rule('guaranteeDays', 7);
  v_pending jsonb;
  v_issue text;
begin
  if v_uid is null then
    raise exception 'Hace falta iniciar sesión' using errcode = '28000';
  end if;
  if not public.is_active_device() then
    raise exception 'Este dispositivo no es el activo de la cuenta' using errcode = '42501';
  end if;
  v_plan := public.user_plan(v_uid);
  select * into v_sub from public.subscriptions where user_id = v_uid;
  v_sub_live := found and public.billing_in_force(v_sub.plan, v_sub.status, v_sub.current_period_end);
  select max(ends_at) into v_pass_end from public.plan_passes
    where user_id = v_uid and status = 'active' and ends_at > now();
  v_pass_now := exists (
    select 1 from public.plan_passes
    where user_id = v_uid and status = 'active' and starts_at <= now() and ends_at > now()
  );
  select max(ends_at) into v_grant from public.subscription_grants where user_id = v_uid and ends_at > now();

  v_source := case
    when v_plan = 'free' then 'none'
    when v_sub_live and v_sub.plan = v_plan then 'payment'
    when v_pass_now then 'pass'
    else 'referral'
  end;
  v_period_end := case v_source
    when 'payment' then v_sub.current_period_end
    when 'pass' then v_pass_end
    when 'referral' then v_grant
  end;

  -- La garantía cuenta desde el primer cobro de la suscripción, o desde el pago del último pase
  if v_source = 'payment' and v_sub.first_charge_at is not null then
    v_guarantee := v_sub.first_charge_at + make_interval(days => v_guarantee_days);
  elsif v_source = 'pass' then
    select max(p.paid_at) + make_interval(days => v_guarantee_days) into v_guarantee
      from public.payments p where p.user_id = v_uid and p.purpose = 'pass' and p.status = 'paid';
  end if;
  if v_guarantee is not null and v_guarantee <= now() then
    v_guarantee := null;
  end if;

  -- El cobro pendiente más reciente. Una ficha OXXO hasta que vence, lo demás 7 días (8.27)
  select jsonb_build_object(
      'method', p.method, 'plan', p.plan, 'amountMxn', p.amount_mxn,
      'expiresAt', p.expires_at, 'createdAt', p.created_at
    ) into v_pending
    from public.payments p
    where p.user_id = v_uid and p.status = 'pending' and p.purpose = 'pass'
      and case when p.method = 'oxxo' and p.expires_at is not null then p.expires_at > now()
               else p.created_at > now() - interval '7 days' end
    order by p.created_at desc
    limit 1;

  -- Un aviso dura 72 horas. Una ficha vencida deja de avisarse si después hubo otra o un pago
  if v_sub.issue is not null and v_sub.issue_at > now() - interval '72 hours' then
    v_issue := v_sub.issue;
  elsif exists (
    select 1 from public.payments p
    where p.user_id = v_uid and p.purpose = 'pass' and p.status = 'expired'
      and coalesce(p.expires_at, p.created_at) > now() - interval '72 hours'
      and not exists (
        select 1 from public.payments q
        where q.user_id = v_uid and q.purpose = 'pass' and q.status in ('pending', 'paid')
          and q.created_at > p.created_at
      )
  ) then
    v_issue := 'voucher_expired';
  end if;

  return jsonb_build_object(
    'plan', v_plan,
    'source', v_source,
    'status', coalesce(v_sub.status, 'none'),
    'provider', v_sub.provider,
    'periodEnd', v_period_end,
    'trialEnd', case when v_sub_live and v_sub.status = 'trialing' then v_sub.trial_ends_at end,
    'cancelAtPeriodEnd', v_sub_live and v_sub.cancel_at_period_end,
    'scheduledChange', v_sub_live and v_sub.scheduled_change,
    'passEnd', v_pass_end,
    'trialAvailable', public.trial_available(v_uid),
    'guaranteeUntil', v_guarantee,
    'pendingPayment', v_pending,
    'issue', v_issue
  );
end;
$$;

-- Lo que create-checkout y create-portal-session necesitan saber del alumno antes de abrir un pago o el
-- portal. Solo el servidor. inForce sigue la regla de user_plan sin los meses regalados, que dejan pagar
create or replace function public.checkout_context(p_user uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_sub public.subscriptions%rowtype;
  v_has_row boolean;
  v_live boolean;
  v_pass_end timestamptz;
  v_left integer;
begin
  if p_user is null then
    raise exception 'Falta el alumno' using errcode = '22023';
  end if;
  select * into v_sub from public.subscriptions where user_id = p_user;
  v_has_row := found;
  v_live := v_has_row and public.billing_in_force(v_sub.plan, v_sub.status, v_sub.current_period_end);
  select max(ends_at) into v_pass_end from public.plan_passes
    where user_id = p_user and status = 'active' and ends_at > now();
  v_left := greatest(public.founder_seats_total() - public.founder_seats_taken(), 0);
  return jsonb_build_object(
    'inForce', case when v_live then 'subscription' when v_pass_end is not null then 'pass' end,
    'subscription', case when v_has_row then jsonb_build_object(
      'plan', v_sub.plan,
      'status', v_sub.status,
      'provider', v_sub.provider,
      'subscriptionId', v_sub.provider_subscription_id,
      'periodEnd', v_sub.current_period_end,
      'cancelAtPeriodEnd', v_sub.cancel_at_period_end
    ) end,
    'passEnd', v_pass_end,
    'trialAvailable', public.trial_available(p_user),
    'trialDays', greatest(public.billing_rule('trialDays', 7), 0),
    'founderOpen', public.founder_promo_open() and v_left > 0,
    'founderSeatsLeft', v_left,
    -- Quien pagó un Fundador y canceló pierde el precio (respuesta 17)
    'founderLost', exists (
        select 1 from public.founder_seats where user_id = p_user and status = 'confirmed'
      ) and not (v_live and v_sub.plan in ('founder', 'founder_annual')),
    'oxxoExpiresDays', least(greatest(public.billing_rule('oxxoExpiresDays', 3), 1), 7),
    'customerId', (
      select customer_id from public.billing_customers where user_id = p_user and provider = 'stripe'
    )
  );
end;
$$;

-- No se puede borrar la cuenta con una suscripción vigente que la pasarela seguiría cobrando, de Stripe o
-- de Mercado Pago, en prueba, activa o con cobro fallido, salvo que ya esté cancelada al final del periodo
create or replace function public.billing_blocks_account_deletion(p_user uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.subscriptions s
    where s.user_id = p_user and s.provider in ('stripe', 'mercadopago')
      and s.status in ('trialing', 'active', 'past_due') and not s.cancel_at_period_end
      and (s.current_period_end is null or s.current_period_end > now())
  )
$$;

-- ===================================================================== Disparador del lugar Fundador
-- Una suscripción Fundador sin lugar lo recibe, apartado en la prueba y confirmado en lo demás. Así el
-- camino de antes (apply_payment_notice) y una fila puesta a mano cuentan igual. Nunca cambia un lugar
-- que ya existe, porque eso lo deciden apply_subscription_state y apply_charge
create or replace function public.subscriptions_sync_founder_seat() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.plan in ('founder', 'founder_annual') then
    insert into public.founder_seats (user_id, plan, status, provider, provider_subscription_id, held_at, confirmed_at, updated_at)
      values (new.user_id, new.plan, case when new.status = 'trialing' then 'held' else 'confirmed' end,
              coalesce(new.provider, 'stripe'), new.provider_subscription_id, now(),
              case when new.status = 'trialing' then null else now() end, now())
      on conflict (user_id) do nothing;
  end if;
  return null;
end;
$$;

create or replace trigger subscriptions_sync_founder_seat
  after insert or update of plan, status on public.subscriptions
  for each row execute function public.subscriptions_sync_founder_seat();

-- Al borrarse una cuenta su lugar queda sin dueño (on delete set null). Uno confirmado sigue contando
-- (respuesta 17), pero uno apartado por una prueba que nunca cobró se libera en el acto. Si no, la prueba
-- cancelada de quien borró su cuenta dejaría el lugar ocupado para siempre
create or replace function public.founder_seats_release_orphan() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.user_id is null and old.user_id is not null and new.status = 'held' then
    new.status := 'released';
    new.released_at := now();
    new.updated_at := now();
  end if;
  return new;
end;
$$;

create or replace trigger founder_seats_release_orphan
  before update of user_id on public.founder_seats
  for each row execute function public.founder_seats_release_orphan();

-- ===================================================================== Devolver un cobro
-- Lo que pasa cuando se devuelve un cobro, por el aviso de la pasarela o porque el admin lo marca. El
-- cobro queda refunded. Un pase deja de contar. Un cobro de suscripción quita el acceso como hoy (D-106) y
-- deja la acción de cancelarla en la pasarela (8.6), salvo que nunca haya activado nada o que haya un
-- cobro más reciente. Si era el único cobro de un Fundador, el lugar se libera (8.5). Un reembolso
-- completo revierte el referido que haya concretado (B7). Quien llama ya tomó el candado del alumno
create or replace function public.billing_refund_payment(p_payment uuid, p_full boolean, p_note text)
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_pay public.payments%rowtype;
  v_sub public.subscriptions%rowtype;
  v_plan text;
  v_target text;
  v_has_sub boolean;
begin
  select * into v_pay from public.payments where id = p_payment for update;
  if not found or v_pay.status = 'refunded' then return; end if;
  update public.payments
    set status = 'refunded', refunded_at = now(), admin_note = coalesce(left(p_note, 500), admin_note)
    where id = v_pay.id;
  if p_full then
    perform public.revert_referral(v_pay.user_id, v_pay.provider, v_pay.provider_payment_id);
  end if;

  if v_pay.purpose = 'pass' then
    update public.plan_passes set status = 'refunded'
      where provider = v_pay.provider and provider_payment_id = v_pay.provider_payment_id;
    return;
  end if;
  -- Un cobro que nunca activó nada, como el de un segundo plan o el de un cupo lleno
  if v_pay.status = 'needs_refund' then return; end if;
  -- Un cobro viejo no quita el plan si hay uno más reciente que sigue pagado
  if exists (
    select 1 from public.payments p
    where p.user_id = v_pay.user_id and p.provider = v_pay.provider and p.status = 'paid'
      and coalesce(p.purpose, 'subscription') = 'subscription' and p.created_at > v_pay.created_at
  ) then
    return;
  end if;

  select * into v_sub from public.subscriptions where user_id = v_pay.user_id for update;
  v_has_sub := found;
  v_plan := v_pay.plan;
  if v_has_sub and v_sub.provider = v_pay.provider then
    update public.subscriptions
      set status = 'canceled', current_period_end = least(coalesce(current_period_end, now()), now()),
          updated_at = now()
      where user_id = v_pay.user_id;
    v_target := coalesce(v_pay.provider_subscription_id, v_sub.provider_subscription_id);
    perform public.billing_queue_cancel(v_pay.user_id, v_pay.provider, v_target, 'refund');
    v_plan := coalesce(v_plan, v_sub.plan);
  end if;

  -- El único cobro de un Fundador. Esa persona nunca se quedó como Fundador
  if v_plan in ('founder', 'founder_annual') and not exists (
    select 1 from public.payments p
    where p.user_id = v_pay.user_id and p.id <> v_pay.id and p.amount_mxn > 0
      and p.status in ('paid', 'refunded') and coalesce(p.purpose, 'subscription') = 'subscription'
      and (v_pay.provider_subscription_id is null or p.provider_subscription_id is null
           or p.provider_subscription_id = v_pay.provider_subscription_id)
  ) then
    update public.founder_seats set status = 'released', released_at = now(), updated_at = now()
      where user_id = v_pay.user_id and status in ('held', 'confirmed');
  end if;
end;
$$;

-- ===================================================================== Estado de una suscripción
-- La única puerta para cambiar el estado de una suscripción. La llama la función de avisos de cada
-- pasarela con la llave de servicio, ya con la firma verificada. p_status es trialing, active, past_due,
-- canceled (sin más renovaciones, vale hasta el fin pagado) o ended (terminó ahora). p_plan sale del
-- Price ID y null si no se reconoce. Devuelve applied, duplicate, stale, unknown_user, ignored,
-- trial_duplicate, second_subscription o founder_full
create or replace function public.apply_subscription_state(
  p_provider text,
  p_event_id text,
  p_event_at timestamptz,
  p_payload jsonb,
  p_user uuid,
  p_subscription_id text,
  p_plan text,
  p_status text,
  p_period_end timestamptz,
  p_trial_end timestamptz,
  p_cancel_at_period_end boolean,
  p_scheduled_change boolean,
  p_price_id text,
  p_promotion_code text
) returns text
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_at timestamptz := coalesce(p_event_at, now());
  v_code text := public.billing_promo_code(p_promotion_code);
  v_plan text := case when p_plan in ('founder', 'founder_annual', 'monthly', 'annual') then p_plan end;
  v_sub public.subscriptions%rowtype;
  v_has_row boolean;
  v_same boolean;
  v_live boolean;
  v_result text;
  v_end timestamptz;
  v_price_changed boolean;
begin
  if p_status is null or p_status not in ('trialing', 'active', 'past_due', 'canceled', 'ended') then
    raise exception 'Estado de suscripción desconocido' using errcode = '22023';
  end if;
  if p_subscription_id is null or btrim(p_subscription_id) = '' or char_length(p_subscription_id) > 200 then
    raise exception 'Falta la suscripción' using errcode = '22023';
  end if;
  if not public.billing_register_event(p_provider, p_event_id, p_payload) then
    return 'duplicate';
  end if;
  if p_user is null or not exists (select 1 from auth.users where id = p_user) then
    -- La cuenta ya no existe, por ejemplo porque se borró con la prueba cancelada. El fin de su
    -- suscripción igual cierra su prueba y libera su lugar apartado, que siguen por su id de suscripción
    if p_status = 'ended' then
      perform public.billing_close_subscription(p_provider, p_subscription_id);
    end if;
    return public.billing_event_done(p_provider, p_event_id, 'unknown_user');
  end if;
  perform pg_advisory_xact_lock(hashtextextended('pay:' || p_user::text, 0));

  -- Una suscripción que la base mandó cancelar (prueba repetida, segunda suscripción o cupo lleno) ya no
  -- cambia nada del alumno. Al terminar solo se cierra su prueba y su lugar
  if exists (
    select 1 from public.billing_actions a
    where a.provider = p_provider and a.kind = 'cancel_subscription' and a.target = p_subscription_id
      and a.reason in ('trial_duplicate', 'second_subscription', 'founder_full')
  ) then
    if p_status = 'ended' then
      perform public.billing_close_subscription(p_provider, p_subscription_id);
    end if;
    return public.billing_event_done(p_provider, p_event_id, 'ignored');
  end if;

  select * into v_sub from public.subscriptions where user_id = p_user for update;
  v_has_row := found;
  v_same := coalesce(v_has_row and v_sub.plan <> 'free' and v_sub.provider = p_provider
    and v_sub.provider_subscription_id = p_subscription_id, false);
  v_live := v_has_row and public.billing_in_force(v_sub.plan, v_sub.status, v_sub.current_period_end);

  if v_same and v_sub.state_at is not null and v_at < v_sub.state_at then
    return public.billing_event_done(p_provider, p_event_id, 'stale');
  end if;

  if not v_same then
    if p_status = 'ended' then
      perform public.billing_close_subscription(p_provider, p_subscription_id);
    end if;
    if v_live then
      -- Nunca se reemplaza una suscripción vigente por otra. Una nueva que sigue viva es un segundo
      -- cobro que D-118 no alcanzó a frenar, por ejemplo con dos pestañas a la vez
      if p_status in ('trialing', 'active', 'past_due') then
        v_result := case when p_status = 'trialing' then 'trial_duplicate' else 'second_subscription' end;
        perform public.billing_queue_cancel(p_user, p_provider, p_subscription_id, v_result);
        perform public.billing_mark_issue(p_user, v_result, p_provider);
        return public.billing_event_done(p_provider, p_event_id, v_result);
      end if;
      -- Una vieja que termina no cambia la vigente
      return public.billing_event_done(p_provider, p_event_id, 'ignored');
    end if;
    -- Una suscripción nueva sin un plan que se reconozca no se puede guardar
    if v_plan is null then
      return public.billing_event_done(p_provider, p_event_id, 'ignored');
    end if;
    -- Empieza una prueba. Una por persona (1.6)
    if p_status = 'trialing' then
      perform pg_advisory_xact_lock(hashtextextended('trial:' || public.trial_account_key(p_user), 0));
      if public.trial_already_used(p_user) then
        perform public.billing_queue_cancel(p_user, p_provider, p_subscription_id, 'trial_duplicate');
        perform public.billing_mark_issue(p_user, 'trial_duplicate', p_provider);
        return public.billing_event_done(p_provider, p_event_id, 'trial_duplicate');
      end if;
    end if;
    -- Una suscripción Fundador nueva necesita lugar (1.5). Se aparta con el candado del cupo, también sin
    -- prueba, y el primer cobro lo confirma. Así ningún camino pasa del cupo
    if v_plan in ('founder', 'founder_annual') and p_status in ('trialing', 'active', 'past_due')
       and not public.billing_take_seat(p_user, v_plan, 'held', p_provider, p_subscription_id) then
      -- Sin lugar. Una prueba queda anulada y no cuenta, la suscripción se cancela y su cobro, si lo hubo,
      -- queda para devolverse. El alumno decide si sigue con el precio regular (8.16)
      if p_status = 'trialing' then
        insert into public.trial_claims as t (user_id, email_key, provider, provider_subscription_id, plan, status, promotion_code, ends_at, updated_at)
          values (p_user, public.trial_account_key(p_user), p_provider, p_subscription_id, v_plan, 'voided', v_code, p_trial_end, now())
          on conflict (user_id) do update
            set email_key = excluded.email_key, provider = excluded.provider,
                provider_subscription_id = excluded.provider_subscription_id, plan = excluded.plan,
                status = 'voided', promotion_code = excluded.promotion_code, started_at = now(),
                ends_at = excluded.ends_at, converted_at = null, canceled_at = null, updated_at = now()
            where t.status = 'voided';
      end if;
      perform public.billing_queue_cancel(p_user, p_provider, p_subscription_id, 'founder_full');
      perform public.billing_mark_issue(p_user, 'founder_full', p_provider);
      return public.billing_event_done(p_provider, p_event_id, 'founder_full');
    end if;
    if p_status = 'trialing' then
      insert into public.trial_claims as t (user_id, email_key, provider, provider_subscription_id, plan, status, promotion_code, ends_at, updated_at)
        values (p_user, public.trial_account_key(p_user), p_provider, p_subscription_id, v_plan, 'started', v_code, p_trial_end, now())
        on conflict (user_id) do update
          set email_key = excluded.email_key, provider = excluded.provider,
              provider_subscription_id = excluded.provider_subscription_id, plan = excluded.plan,
              status = 'started', promotion_code = excluded.promotion_code, started_at = now(),
              ends_at = excluded.ends_at, converted_at = null, canceled_at = null, updated_at = now()
          where t.status = 'voided';
      -- La prueba queda usada para siempre, también si después se borra la cuenta
      insert into public.trial_history (email_hash, user_id, provider, provider_subscription_id)
        values (public.trial_key_hash(public.trial_account_key(p_user)), p_user, p_provider, p_subscription_id)
        on conflict (provider, provider_subscription_id) do nothing;
    end if;
  end if;

  -- Hasta dónde llega el acceso. La prueba hasta su fin. Lo pagado lo alargan los cobros (apply_charge) y
  -- no los avisos de estado, así un cobro fallido no regala el periodo. Al terminar se recorta
  if v_same then
    v_plan := coalesce(v_plan, v_sub.plan);
  end if;
  v_end := case
    when p_status = 'trialing' then coalesce(
      p_trial_end, p_period_end, case when v_same then v_sub.current_period_end end,
      now() + make_interval(days => greatest(public.billing_rule('trialDays', 7), 1)))
    when p_status = 'ended' then least(
      coalesce(case when v_same then v_sub.current_period_end end, p_period_end, now()), v_at, now())
    when v_same then coalesce(v_sub.current_period_end, p_period_end, now())
    else coalesce(p_period_end, now())
  end;
  v_price_changed := v_same and p_price_id is not null and v_sub.price_id is distinct from p_price_id;

  insert into public.subscriptions as s (
    user_id, plan, status, provider, provider_subscription_id, current_period_end, price_id,
    trial_ends_at, cancel_at_period_end, scheduled_change, promotion_code, first_charge_at, state_at,
    issue, issue_at, updated_at
  ) values (
    p_user, v_plan, case when p_status = 'ended' then 'canceled' else p_status end, p_provider,
    p_subscription_id, v_end, p_price_id, p_trial_end, coalesce(p_cancel_at_period_end, false),
    coalesce(p_scheduled_change, false), v_code, null, v_at, null, null, now()
  )
  on conflict (user_id) do update set
    plan = excluded.plan,
    status = excluded.status,
    provider = excluded.provider,
    provider_subscription_id = excluded.provider_subscription_id,
    current_period_end = excluded.current_period_end,
    price_id = coalesce(excluded.price_id, case when v_same then s.price_id end),
    trial_ends_at = coalesce(excluded.trial_ends_at, case when v_same then s.trial_ends_at end),
    cancel_at_period_end = excluded.cancel_at_period_end,
    -- El cambio programado se limpia solo cuando cambia el Price ID
    scheduled_change = excluded.scheduled_change and not v_price_changed,
    promotion_code = coalesce(excluded.promotion_code, case when v_same then s.promotion_code end),
    first_charge_at = case when v_same then s.first_charge_at end,
    state_at = excluded.state_at,
    issue = case when v_same then s.issue end,
    issue_at = case when v_same then s.issue_at end,
    updated_at = now();

  if p_status = 'ended' then
    perform public.billing_close_subscription(p_provider, p_subscription_id);
  end if;
  return public.billing_event_done(p_provider, p_event_id, 'applied');
end;
$$;

-- ===================================================================== Cobros
-- La única puerta para registrar un cobro. La llama la función de avisos de cada pasarela con la llave de
-- servicio, ya con la firma verificada. p_kind es paid, pending (ficha o datos de transferencia
-- generados), failed, expired (ficha vencida) o refunded. Devuelve applied, duplicate, ignored,
-- unknown_user o founder_full
create or replace function public.apply_charge(
  p_provider text,
  p_event_id text,
  p_payload jsonb,
  p_kind text,
  p_user uuid,
  p_purpose text,
  p_plan text,
  p_method text,
  p_provider_payment_id text,
  p_payment_intent_id text,
  p_provider_subscription_id text,
  p_amount_mxn numeric,
  p_discount_mxn numeric,
  p_promotion_code text,
  p_period_end timestamptz,
  p_expires_at timestamptz
) returns text
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_code text := public.billing_promo_code(p_promotion_code);
  v_plan text := case when p_plan in ('founder', 'founder_annual', 'monthly', 'annual') then p_plan end;
  v_method text := case when p_method in ('card', 'oxxo', 'spei', 'mercadopago') then p_method end;
  v_discount numeric := case when p_discount_mxn > 0 then p_discount_mxn end;
  v_sub public.subscriptions%rowtype;
  v_has_row boolean;
  v_same boolean;
  v_live boolean;
  v_rows integer;
  v_end timestamptz;
  v_start timestamptz;
  v_pay public.payments%rowtype;
  v_charged_at timestamptz;
begin
  if p_kind is null or p_kind not in ('paid', 'pending', 'failed', 'expired', 'refunded') then
    raise exception 'Tipo de cobro desconocido' using errcode = '22023';
  end if;
  if p_purpose is null or p_purpose not in ('subscription', 'pass') then
    raise exception 'Falta para qué es el cobro' using errcode = '22023';
  end if;
  if not public.billing_register_event(p_provider, p_event_id, p_payload) then
    return 'duplicate';
  end if;
  if p_user is null or not exists (select 1 from auth.users where id = p_user) then
    return public.billing_event_done(p_provider, p_event_id, 'unknown_user');
  end if;
  perform pg_advisory_xact_lock(hashtextextended('pay:' || p_user::text, 0));

  -- ------------------------------------------------------------------- Pagado
  if p_kind = 'paid' then
    if p_provider_payment_id is null or btrim(p_provider_payment_id) = ''
       or p_amount_mxn is null or p_amount_mxn <= 0 then
      return public.billing_event_done(p_provider, p_event_id, 'ignored');
    end if;
    -- Un aviso tardío o repetido de un cobro que ya se devolvió no vuelve a activar nada
    if exists (
      select 1 from public.payments
      where provider = p_provider and provider_payment_id = p_provider_payment_id and status = 'refunded'
    ) then
      return public.billing_event_done(p_provider, p_event_id, 'ignored');
    end if;

    select * into v_sub from public.subscriptions where user_id = p_user for update;
    v_has_row := found;
    v_live := v_has_row and public.billing_in_force(v_sub.plan, v_sub.status, v_sub.current_period_end);

    if p_purpose = 'pass' then
      if coalesce(v_plan, '') not in ('monthly', 'annual') then
        return public.billing_event_done(p_provider, p_event_id, 'ignored');
      end if;
      -- Con una suscripción vigente un pase no suma nada. Queda para devolverse
      if v_live then
        insert into public.payments (user_id, provider, provider_payment_id, amount_mxn, status, purpose, plan, method,
                                     payment_intent_id, discount_mxn, promotion_code, paid_at)
          values (p_user, p_provider, p_provider_payment_id, p_amount_mxn, 'needs_refund', 'pass', v_plan, v_method,
                  p_payment_intent_id, v_discount, v_code, now())
          on conflict (provider, provider_payment_id) do update
            set status = 'needs_refund', paid_at = now(), amount_mxn = excluded.amount_mxn
            where payments.status in ('pending', 'expired');
        return public.billing_event_done(p_provider, p_event_id, 'applied');
      end if;
      -- El pendiente del mismo cobro pasa a pagado y conserva su código. Si no existía, se crea
      insert into public.payments (user_id, provider, provider_payment_id, amount_mxn, status, purpose, plan, method,
                                   payment_intent_id, discount_mxn, promotion_code, paid_at)
        values (p_user, p_provider, p_provider_payment_id, p_amount_mxn, 'paid', 'pass', v_plan, v_method,
                p_payment_intent_id, v_discount, v_code, now())
        on conflict (provider, provider_payment_id) do update
          set status = 'paid', paid_at = now(), amount_mxn = excluded.amount_mxn,
              plan = coalesce(payments.plan, excluded.plan), method = coalesce(payments.method, excluded.method),
              payment_intent_id = coalesce(payments.payment_intent_id, excluded.payment_intent_id),
              discount_mxn = coalesce(excluded.discount_mxn, payments.discount_mxn),
              promotion_code = coalesce(payments.promotion_code, excluded.promotion_code)
          where payments.status in ('pending', 'expired');
      -- El pase se suma desde el fin del último pase activo (1.7). Un aviso repetido no suma dos veces
      select max(ends_at) into v_start from public.plan_passes where user_id = p_user and status = 'active';
      v_start := greatest(coalesce(v_start, now()), now());
      insert into public.plan_passes (user_id, plan, provider, provider_payment_id, method, starts_at, ends_at)
        values (p_user, v_plan, p_provider, p_provider_payment_id, coalesce(v_method, 'mercadopago'), v_start,
                v_start + case when v_plan = 'annual' then interval '1 year' else interval '1 month' end)
        on conflict (provider, provider_payment_id) do nothing;
      perform public.complete_referral(p_user);
      return public.billing_event_done(p_provider, p_event_id, 'applied');
    end if;

    -- Cobro de una suscripción que la base mandó cancelar. Nunca activa nada y queda para devolverse
    if exists (
      select 1 from public.billing_actions a
      where a.provider = p_provider and a.kind = 'cancel_subscription' and a.target = p_provider_subscription_id
        and a.reason in ('trial_duplicate', 'second_subscription', 'founder_full')
    ) then
      insert into public.payments (user_id, provider, provider_payment_id, amount_mxn, status, purpose, plan, method,
                                   payment_intent_id, provider_subscription_id, discount_mxn, promotion_code, paid_at)
        values (p_user, p_provider, p_provider_payment_id, p_amount_mxn, 'needs_refund', 'subscription', v_plan,
                coalesce(v_method, 'card'), p_payment_intent_id, p_provider_subscription_id, v_discount, v_code, now())
        on conflict (provider, provider_payment_id) do nothing;
      return public.billing_event_done(p_provider, p_event_id, 'applied');
    end if;

    v_same := coalesce(v_has_row and v_sub.plan <> 'free' and v_sub.provider = p_provider
      and (p_provider_subscription_id is null or v_sub.provider_subscription_id is null
           or v_sub.provider_subscription_id = p_provider_subscription_id), false);
    -- Un cobro de otra suscripción mientras la del alumno sigue vigente es un segundo plan
    if v_live and not v_same then
      insert into public.payments (user_id, provider, provider_payment_id, amount_mxn, status, purpose, plan, method,
                                   payment_intent_id, provider_subscription_id, discount_mxn, promotion_code, paid_at)
        values (p_user, p_provider, p_provider_payment_id, p_amount_mxn, 'needs_refund', 'subscription', v_plan,
                coalesce(v_method, 'card'), p_payment_intent_id, p_provider_subscription_id, v_discount, v_code, now())
        on conflict (provider, provider_payment_id) do nothing;
      perform public.billing_queue_cancel(p_user, p_provider, p_provider_subscription_id, 'second_subscription');
      perform public.billing_mark_issue(p_user, 'second_subscription', p_provider);
      return public.billing_event_done(p_provider, p_event_id, 'applied');
    end if;

    -- El plan de la misma suscripción lo decide su Price ID (apply_subscription_state). El cobro del
    -- prorrateo no lo regresa al plan de la metadata
    v_plan := case when v_same then v_sub.plan else v_plan end;
    if v_plan is null then
      return public.billing_event_done(p_provider, p_event_id, 'ignored');
    end if;
    if v_plan in ('founder', 'founder_annual')
       and not public.billing_take_seat(p_user, v_plan, 'confirmed', p_provider,
                                        coalesce(p_provider_subscription_id, v_sub.provider_subscription_id)) then
      -- Se cobró y no hay lugar. Queda para devolverse y la suscripción se cancela para que no vuelva a cobrar
      insert into public.payments (user_id, provider, provider_payment_id, amount_mxn, status, purpose, plan, method,
                                   payment_intent_id, provider_subscription_id, discount_mxn, promotion_code, paid_at)
        values (p_user, p_provider, p_provider_payment_id, p_amount_mxn, 'needs_refund', 'subscription', v_plan,
                coalesce(v_method, 'card'), p_payment_intent_id, p_provider_subscription_id, v_discount, v_code, now())
        on conflict (provider, provider_payment_id) do nothing;
      perform public.billing_queue_cancel(p_user, p_provider, p_provider_subscription_id, 'founder_full');
      perform public.billing_mark_issue(p_user, 'founder_full', p_provider);
      return public.billing_event_done(p_provider, p_event_id, 'founder_full');
    end if;

    -- Sin código en el aviso, un cobro con descuento lleva el código con que se contrató
    insert into public.payments (user_id, provider, provider_payment_id, amount_mxn, status, purpose, plan, method,
                                 payment_intent_id, provider_subscription_id, discount_mxn, promotion_code, paid_at)
      values (p_user, p_provider, p_provider_payment_id, p_amount_mxn, 'paid', 'subscription', v_plan,
              coalesce(v_method, case when p_provider = 'mercadopago' then 'mercadopago' else 'card' end),
              p_payment_intent_id, coalesce(p_provider_subscription_id, case when v_same then v_sub.provider_subscription_id end),
              v_discount,
              coalesce(v_code, case when v_discount is not null and v_same then v_sub.promotion_code end), now())
      on conflict (provider, provider_payment_id) do nothing;
    get diagnostics v_rows = row_count;

    v_end := coalesce(
      p_period_end,
      now() + case when v_plan in ('annual', 'founder_annual') then interval '1 year' else interval '1 month' end
    );
    if v_same then
      update public.subscriptions
        set status = case when status in ('trialing', 'past_due') then 'active' else status end,
            provider_subscription_id = coalesce(provider_subscription_id, p_provider_subscription_id),
            current_period_end = greatest(v_end, coalesce(current_period_end, v_end)),
            first_charge_at = coalesce(first_charge_at, now()),
            updated_at = now()
        where user_id = p_user;
    else
      -- La fila no existe o es de una suscripción que ya terminó. La toma esta, como antes de B10
      insert into public.subscriptions as s (
        user_id, plan, status, provider, provider_subscription_id, current_period_end, first_charge_at,
        promotion_code, updated_at
      ) values (
        p_user, v_plan, 'active', p_provider, p_provider_subscription_id, v_end, now(), v_code, now()
      )
      on conflict (user_id) do update set
        plan = excluded.plan, status = 'active', provider = excluded.provider,
        provider_subscription_id = excluded.provider_subscription_id,
        current_period_end = excluded.current_period_end, first_charge_at = now(), price_id = null,
        trial_ends_at = null, cancel_at_period_end = false, scheduled_change = false,
        promotion_code = excluded.promotion_code, state_at = null, issue = null, issue_at = null,
        updated_at = now();
    end if;
    -- El primer cobro convierte la prueba
    if v_rows > 0 then
      update public.trial_claims set status = 'converted', converted_at = now(), updated_at = now()
        where user_id = p_user and status = 'started'
          and (p_provider_subscription_id is null or provider_subscription_id = p_provider_subscription_id);
    end if;
    -- El referido se concreta con el primer cobro mayor a 0. complete_referral se cuida sola (B7)
    perform public.complete_referral(p_user);
    return public.billing_event_done(p_provider, p_event_id, 'applied');
  end if;

  -- ------------------------------------------------------------------- Ficha o transferencia generada
  if p_kind = 'pending' then
    if p_purpose <> 'pass' or coalesce(v_plan, '') not in ('monthly', 'annual')
       or p_provider_payment_id is null or btrim(p_provider_payment_id) = ''
       or p_amount_mxn is null or p_amount_mxn <= 0 then
      return public.billing_event_done(p_provider, p_event_id, 'ignored');
    end if;
    insert into public.payments (user_id, provider, provider_payment_id, amount_mxn, status, purpose, plan, method,
                                 payment_intent_id, discount_mxn, promotion_code, expires_at)
      values (p_user, p_provider, p_provider_payment_id, p_amount_mxn, 'pending', 'pass', v_plan, v_method,
              p_payment_intent_id, v_discount, v_code, p_expires_at)
      on conflict (provider, provider_payment_id) do nothing;
    return public.billing_event_done(p_provider, p_event_id, 'applied');
  end if;

  -- ------------------------------------------------------------------- Ficha vencida
  if p_kind = 'expired' then
    if p_provider_payment_id is null or btrim(p_provider_payment_id) = '' then
      return public.billing_event_done(p_provider, p_event_id, 'ignored');
    end if;
    update public.payments set status = 'expired', expires_at = least(coalesce(expires_at, now()), now())
      where provider = p_provider and provider_payment_id = p_provider_payment_id and user_id = p_user
        and status = 'pending';
    get diagnostics v_rows = row_count;
    -- Si el vencimiento llegó antes que la ficha, queda asentado igual
    if v_rows = 0 and p_amount_mxn is not null and v_plan in ('monthly', 'annual') then
      insert into public.payments (user_id, provider, provider_payment_id, amount_mxn, status, purpose, plan, method,
                                   payment_intent_id, discount_mxn, promotion_code, expires_at)
        values (p_user, p_provider, p_provider_payment_id, p_amount_mxn, 'expired', 'pass', v_plan, v_method,
                p_payment_intent_id, v_discount, v_code, now())
        on conflict (provider, provider_payment_id) do nothing;
    end if;
    return public.billing_event_done(p_provider, p_event_id, 'applied');
  end if;

  -- ------------------------------------------------------------------- Cobro fallido
  if p_kind = 'failed' then
    update public.subscriptions set status = 'past_due', updated_at = now()
      where user_id = p_user and provider = p_provider and status in ('active', 'trialing')
        and (p_provider_subscription_id is null or provider_subscription_id is null
             or provider_subscription_id = p_provider_subscription_id);
    return public.billing_event_done(p_provider, p_event_id, 'applied');
  end if;

  -- ------------------------------------------------------------------- Reembolso completo
  -- Primero el cobro que dice el aviso, después por su PaymentIntent y si no el cobro del alumno con ese
  -- monto que siga sin devolverse y esté más cerca de la hora del cargo (data.object.created), como hoy
  if p_provider_payment_id is not null then
    select * into v_pay from public.payments
      where provider = p_provider and provider_payment_id = p_provider_payment_id and user_id = p_user;
  end if;
  if v_pay.id is null and p_payment_intent_id is not null then
    select * into v_pay from public.payments
      where provider = p_provider and payment_intent_id = p_payment_intent_id and user_id = p_user
      order by created_at desc limit 1;
  end if;
  if v_pay.id is null then
    v_charged_at := case
      when (p_payload #>> '{data,object,created}') ~ '^[0-9]{9,11}$'
        then to_timestamp((p_payload #>> '{data,object,created}')::bigint)
    end;
    select * into v_pay from public.payments
      where provider = p_provider and user_id = p_user and status in ('paid', 'needs_refund')
        and (p_amount_mxn is null or amount_mxn = p_amount_mxn)
      order by case when v_charged_at is null then 0 else abs(extract(epoch from created_at - v_charged_at)) end,
               created_at desc, id desc
      limit 1;
  end if;
  if v_pay.id is not null then
    perform public.billing_refund_payment(v_pay.id, p_amount_mxn is null or p_amount_mxn >= v_pay.amount_mxn, null);
  else
    -- Un reembolso que no encuentra su cobro igual quita el plan de esa pasarela, como hoy
    update public.subscriptions
      set status = 'canceled', current_period_end = least(coalesce(current_period_end, now()), now()), updated_at = now()
      where user_id = p_user and provider = p_provider and plan <> 'free';
  end if;
  return public.billing_event_done(p_provider, p_event_id, 'applied');
end;
$$;

-- ===================================================================== Correo de fin de la prueba
-- customer.subscription.trial_will_end, 3 días antes. Encola trial_ending si la suscripción sigue en
-- prueba y sin cancelar. Devuelve queued, skipped, duplicate o unknown_user
create or replace function public.note_trial_will_end(
  p_provider text,
  p_event_id text,
  p_payload jsonb,
  p_user uuid,
  p_subscription_id text,
  p_trial_end timestamptz
) returns text
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_sub public.subscriptions%rowtype;
  v_end timestamptz;
begin
  if not public.billing_register_event(p_provider, p_event_id, p_payload) then
    return 'duplicate';
  end if;
  if p_user is null or not exists (select 1 from auth.users where id = p_user) then
    return public.billing_event_done(p_provider, p_event_id, 'unknown_user');
  end if;
  perform pg_advisory_xact_lock(hashtextextended('pay:' || p_user::text, 0));
  select * into v_sub from public.subscriptions where user_id = p_user;
  if not found or v_sub.provider is distinct from p_provider
     or v_sub.provider_subscription_id is distinct from p_subscription_id
     or v_sub.status <> 'trialing' or v_sub.cancel_at_period_end then
    return public.billing_event_done(p_provider, p_event_id, 'skipped');
  end if;
  v_end := coalesce(p_trial_end, v_sub.trial_ends_at, v_sub.current_period_end);
  perform public.enqueue_email(
    p_user, null, 'trial_ending',
    'trial_ending:' || p_subscription_id || ':' || to_char(v_end at time zone 'America/Mexico_City', 'YYYY-MM-DD'),
    jsonb_build_object(
      'trialEnd', v_end,
      'plan', v_sub.plan,
      'amountMxn', coalesce(
        (select (value -> v_sub.plan ->> 'priceMxn')::numeric from public.platform_settings where key = 'plans'),
        case v_sub.plan when 'founder' then 79 when 'founder_annual' then 749 when 'monthly' then 149 else 1499 end
      ),
      'promotionCode', v_sub.promotion_code
    )
  );
  return public.billing_event_done(p_provider, p_event_id, 'queued');
end;
$$;

-- ===================================================================== Acciones con la pasarela
-- Entrega hasta p_limit acciones por ejecutar, de una pasarela o de todas, y sube sus intentos. Toma las
-- pendientes y las fallidas con menos de 5 intentos que nadie tomó en los últimos 2 minutos
create or replace function public.claim_billing_actions(p_limit integer default 5, p_provider text default null)
returns setof public.billing_actions
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  return query
    update public.billing_actions a
      set attempts = a.attempts + 1, claimed_at = now()
      where a.id in (
        select b.id from public.billing_actions b
        where b.status in ('pending', 'failed') and b.attempts < 5
          and (p_provider is null or b.provider = p_provider)
          and (b.claimed_at is null or b.claimed_at < now() - interval '2 minutes')
        order by b.created_at
        limit least(greatest(coalesce(p_limit, 5), 1), 20)
        for update skip locked
      )
      returning a.*;
end;
$$;

-- Cierra una acción. Sin éxito queda failed con su motivo y se reintenta en el siguiente aviso
create or replace function public.finish_billing_action(p_id uuid, p_ok boolean, p_error text default null)
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update public.billing_actions
    set status = case when p_ok then 'done' else 'failed' end,
        done_at = case when p_ok then now() end,
        last_error = case when p_ok then null else left(coalesce(p_error, 'Sin motivo'), 500) end
    where id = p_id and status <> 'done';
end;
$$;

-- ===================================================================== Avisos de la forma anterior
-- Igual que en 20261019000001_referral_first_charge.sql, con la misma firma y el mismo comportamiento,
-- incluido el reembolso con revert_referral. Cambia que el cupo Fundador se cuenta con founder_seats (el
-- lugar se aparta o se confirma con billing_take_seat) y que un cobro no pisa el plan de una suscripción
-- vigente con ese provider_subscription_id, porque ese plan lo decide su Price ID. Lo usa el aviso de
-- Mercado Pago mientras no pase a apply_charge
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
  if not public.billing_register_event(p_provider, p_event_id, p_payload) then
    return 'duplicate';
  end if;

  if p_user is null or not exists (select 1 from auth.users where id = p_user) then
    return public.billing_event_done(p_provider, p_event_id, 'unknown_user');
  end if;
  perform pg_advisory_xact_lock(hashtextextended('pay:' || p_user::text, 0));

  if p_kind = 'paid' then
    if p_plan is null or p_plan not in ('founder', 'founder_annual', 'monthly', 'annual')
       or p_provider_payment_id is null or btrim(p_provider_payment_id) = ''
       or p_amount_mxn is null or p_amount_mxn <= 0 then
      return public.billing_event_done(p_provider, p_event_id, 'ignored');
    end if;

    -- Un aviso tardío o repetido de un pago que ya se devolvió no vuelve a activar nada. Stripe
    -- reintenta durante días y no garantiza el orden. Va antes del lugar Fundador, para no apartar uno
    if exists (
      select 1 from public.payments
      where provider = p_provider and provider_payment_id = p_provider_payment_id and status = 'refunded'
    ) then
      return public.billing_event_done(p_provider, p_event_id, 'ignored');
    end if;

    if p_plan in ('founder', 'founder_annual')
       and not public.billing_take_seat(p_user, p_plan, 'confirmed', p_provider, p_provider_subscription_id) then
      -- Se cobró y no hay lugar. Queda asentado para devolverlo, sin activar nada
      insert into public.payments (user_id, provider, provider_payment_id, amount_mxn, status, paid_at)
        values (p_user, p_provider, p_provider_payment_id, p_amount_mxn, 'needs_refund', now())
        on conflict (provider, provider_payment_id) do nothing;
      return public.billing_event_done(p_provider, p_event_id, 'founder_full');
    end if;

    insert into public.payments (user_id, provider, provider_payment_id, amount_mxn, status, paid_at)
      values (p_user, p_provider, p_provider_payment_id, p_amount_mxn, 'paid', now())
      on conflict (provider, provider_payment_id) do nothing;
    v_end := coalesce(
      p_period_end,
      now() + case when p_plan in ('annual', 'founder_annual') then interval '1 year' else interval '1 month' end
    );
    insert into public.subscriptions as s (user_id, plan, status, provider, provider_subscription_id, current_period_end, updated_at)
      values (p_user, p_plan, 'active', p_provider, p_provider_subscription_id, v_end, now())
      on conflict (user_id) do update
        set plan = case
              when public.billing_in_force(s.plan, s.status, s.current_period_end)
                and s.provider_subscription_id = excluded.provider_subscription_id then s.plan
              else excluded.plan
            end,
            status = 'active',
            provider = excluded.provider,
            provider_subscription_id = coalesce(excluded.provider_subscription_id, s.provider_subscription_id),
            current_period_end = greatest(excluded.current_period_end, coalesce(s.current_period_end, excluded.current_period_end)),
            updated_at = now();
    -- El referido se concreta con el primer cobro verificado de más de 0 pesos (B7)
    if p_amount_mxn > 0 then
      perform public.complete_referral(p_user);
    end if;
  elsif p_kind = 'failed' then
    update public.subscriptions set status = 'past_due', updated_at = now()
      where user_id = p_user and provider = p_provider and status in ('active', 'trialing');
  elsif p_kind = 'canceled' then
    update public.subscriptions set status = 'canceled', updated_at = now()
      where user_id = p_user and provider = p_provider and status in ('active', 'past_due', 'trialing');
  else
    -- Reembolso. Primero el pago que dice el aviso. Si no viene o no existe, el pago del alumno con
    -- ese monto que siga sin devolverse y esté más cerca de la hora en que la pasarela dice que se cobró
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
      update public.payments set status = 'refunded', refunded_at = coalesce(refunded_at, now())
        where provider = p_provider and provider_payment_id = v_pay and user_id = p_user;
      -- Un reembolso completo del cobro que concretó un referido lo revierte (B7)
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

  return public.billing_event_done(p_provider, p_event_id, 'applied');
end;
$$;

-- ===================================================================== Admin, Pagos
-- Resumen para la pantalla Admin, Pagos
create or replace function public.admin_billing_summary() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_invoices bigint := 0;
begin
  if auth.uid() is null then
    raise exception 'Hace falta iniciar sesión' using errcode = '28000';
  end if;
  if not public.is_admin() then
    raise exception 'Solo un administrador puede ver los pagos' using errcode = '42501';
  end if;
  -- Las solicitudes de factura llegan con 20261022000003
  if to_regclass('public.invoice_requests') is not null then
    execute 'select count(*) from public.invoice_requests where status = ''pending''' into v_invoices;
  end if;
  return jsonb_build_object(
    'founder', jsonb_build_object(
      'total', public.founder_seats_total(),
      'held', (select count(*) from public.founder_seats where status = 'held'),
      'confirmed', (select count(*) from public.founder_seats where status = 'confirmed'),
      'open', public.founder_promo_open()
    ),
    'activeTrials', (
      select count(*) from public.subscriptions s
      where s.status = 'trialing' and public.billing_in_force(s.plan, s.status, s.current_period_end)
    ),
    'activePasses', (
      select count(*) from public.plan_passes
      where status = 'active' and starts_at <= now() and ends_at > now()
    ),
    'needsRefund', (select count(*) from public.payments where status = 'needs_refund'),
    'pendingActions', (select count(*) from public.billing_actions where status = 'pending'),
    'failedActions', (select count(*) from public.billing_actions where status = 'failed'),
    'pendingInvoices', v_invoices
  );
end;
$$;

-- Los cobros más recientes, con el alias del alumno y nada más de su cuenta. Tope de 100 por página
create or replace function public.admin_recent_payments(p_limit integer default 50, p_offset integer default 0)
returns table (
  id uuid,
  user_id uuid,
  alias text,
  plan text,
  purpose text,
  method text,
  provider text,
  amount_mxn numeric,
  discount_mxn numeric,
  promotion_code text,
  status text,
  paid_at timestamptz,
  created_at timestamptz,
  total bigint
)
language plpgsql stable security definer set search_path = public, pg_temp as $$
#variable_conflict use_column
begin
  if auth.uid() is null then
    raise exception 'Hace falta iniciar sesión' using errcode = '28000';
  end if;
  if not public.is_admin() then
    raise exception 'Solo un administrador puede ver los pagos' using errcode = '42501';
  end if;
  return query
    select p.id, p.user_id, pr.alias, p.plan, coalesce(p.purpose, 'subscription'), p.method, p.provider,
           p.amount_mxn, p.discount_mxn, p.promotion_code, p.status, p.paid_at, p.created_at,
           count(*) over ()
    from public.payments p
    left join public.profiles pr on pr.id = p.user_id
    order by p.created_at desc, p.id
    limit least(greatest(coalesce(p_limit, 50), 1), 100) offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

-- El admin marca como devuelto un cobro que la pasarela no reembolsa, como OXXO, que se devuelve por
-- transferencia (8.7). Hace lo mismo que un reembolso completo y guarda la nota, que el alumno también
-- ve. Devuelve refunded o already_refunded
create or replace function public.admin_mark_payment_refunded(p_payment uuid, p_note text) returns text
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_pay public.payments%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Hace falta iniciar sesión' using errcode = '28000';
  end if;
  if not public.is_admin() then
    raise exception 'Solo un administrador puede marcar pagos' using errcode = '42501';
  end if;
  if p_note is null or btrim(p_note) = '' or char_length(btrim(p_note)) > 500 then
    raise exception 'Escribe una nota de hasta 500 caracteres' using errcode = '22023';
  end if;
  select * into v_pay from public.payments where id = p_payment;
  if not found then
    raise exception 'No existe ese pago' using errcode = '22023';
  end if;
  if v_pay.status = 'refunded' then
    return 'already_refunded';
  end if;
  if v_pay.status not in ('paid', 'needs_refund') then
    raise exception 'Ese pago no se cobró' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('pay:' || v_pay.user_id::text, 0));
  perform public.billing_refund_payment(v_pay.id, true, btrim(p_note));
  return 'refunded';
end;
$$;

-- Por código de descuento, en mayúsculas. Pruebas iniciadas, cobros pagados mayores a 0, alumnos que
-- pagaron e ingreso
create or replace function public.admin_promotion_code_stats()
returns table (code text, trials bigint, payments bigint, paying_users bigint, revenue_mxn numeric)
language plpgsql stable security definer set search_path = public, pg_temp as $$
#variable_conflict use_column
begin
  if auth.uid() is null then
    raise exception 'Hace falta iniciar sesión' using errcode = '28000';
  end if;
  if not public.is_admin() then
    raise exception 'Solo un administrador puede ver los códigos' using errcode = '42501';
  end if;
  return query
    with codes as (
      select upper(t.promotion_code) as code from public.trial_claims t
        where t.promotion_code is not null and t.status <> 'voided'
      union
      select upper(p.promotion_code) from public.payments p where p.promotion_code is not null
    ),
    paid as (
      select upper(p.promotion_code) as code, p.user_id, p.amount_mxn from public.payments p
      where p.promotion_code is not null and p.status = 'paid' and p.amount_mxn > 0
    )
    select c.code,
           (select count(*) from public.trial_claims t
             where upper(t.promotion_code) = c.code and t.status <> 'voided'),
           (select count(*) from paid where paid.code = c.code),
           (select count(distinct paid.user_id) from paid where paid.code = c.code),
           (select coalesce(sum(paid.amount_mxn), 0) from paid where paid.code = c.code)
    from codes c
    order by 3 desc, 1;
end;
$$;

-- ===================================================================== Borrar mi cuenta. Sección con delete
-- Igual que en 20261011000001_billing_portal.sql, salvo el freno, que ahora decide
-- billing_blocks_account_deletion. Pide cancelar antes una suscripción de Stripe o de Mercado Pago en
-- prueba, activa o con cobro fallido (8.20). Una cancelada al final del periodo sí se puede. También va en
-- supabase/manual/pagos-b10.sql
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
-- ===================================================================== Fin de la sección con delete

-- ===================================================================== Permisos de las funciones
-- Ayudas internas. No las ejecuta nadie por la API
revoke all on function public.billing_promo_code(text) from public, anon, authenticated, service_role;
revoke all on function public.billing_in_force(text, text, timestamptz) from public, anon, authenticated, service_role;
revoke all on function public.billing_register_event(text, text, jsonb) from public, anon, authenticated, service_role;
revoke all on function public.billing_event_done(text, text, text) from public, anon, authenticated, service_role;
revoke all on function public.billing_queue_cancel(uuid, text, text, text) from public, anon, authenticated, service_role;
revoke all on function public.billing_mark_issue(uuid, text, text) from public, anon, authenticated, service_role;
revoke all on function public.founder_seats_total() from public, anon, authenticated, service_role;
revoke all on function public.founder_seats_taken() from public, anon, authenticated, service_role;
revoke all on function public.founder_promo_open() from public, anon, authenticated, service_role;
revoke all on function public.billing_take_seat(uuid, text, text, text, text) from public, anon, authenticated, service_role;
revoke all on function public.billing_close_subscription(text, text) from public, anon, authenticated, service_role;
revoke all on function public.trial_email_key(text) from public, anon, authenticated, service_role;
revoke all on function public.trial_key_hash(text) from public, anon, authenticated, service_role;
revoke all on function public.founder_seats_release_orphan() from public, anon, authenticated, service_role;
revoke all on function public.trial_account_key(uuid) from public, anon, authenticated, service_role;
revoke all on function public.trial_already_used(uuid) from public, anon, authenticated, service_role;
revoke all on function public.trial_available(uuid) from public, anon, authenticated, service_role;
revoke all on function public.user_plan(uuid) from public, anon, authenticated, service_role;
revoke all on function public.billing_blocks_account_deletion(uuid) from public, anon, authenticated, service_role;
revoke all on function public.subscriptions_sync_founder_seat() from public, anon, authenticated, service_role;
revoke all on function public.billing_refund_payment(uuid, boolean, text) from public, anon, authenticated, service_role;

-- La app, con sesión. Las del admin revisan el rol por dentro
revoke all on function public.my_plan() from public, anon, service_role;
grant execute on function public.my_plan() to authenticated;
revoke all on function public.delete_my_account() from public, anon, authenticated, service_role;
grant execute on function public.delete_my_account() to authenticated;
revoke all on function public.admin_billing_summary() from public, anon, service_role;
grant execute on function public.admin_billing_summary() to authenticated;
revoke all on function public.admin_recent_payments(integer, integer) from public, anon, service_role;
grant execute on function public.admin_recent_payments(integer, integer) to authenticated;
revoke all on function public.admin_mark_payment_refunded(uuid, text) from public, anon, service_role;
grant execute on function public.admin_mark_payment_refunded(uuid, text) to authenticated;
revoke all on function public.admin_promotion_code_stats() from public, anon, service_role;
grant execute on function public.admin_promotion_code_stats() to authenticated;

-- El servidor, con la llave de servicio
revoke all on function public.checkout_context(uuid) from public, anon, authenticated, service_role;
grant execute on function public.checkout_context(uuid) to service_role;
revoke all on function public.apply_charge(text, text, jsonb, text, uuid, text, text, text, text, text, text, numeric, numeric, text, timestamptz, timestamptz)
  from public, anon, authenticated, service_role;
grant execute on function public.apply_charge(text, text, jsonb, text, uuid, text, text, text, text, text, text, numeric, numeric, text, timestamptz, timestamptz)
  to service_role;
revoke all on function public.apply_subscription_state(text, text, timestamptz, jsonb, uuid, text, text, text, timestamptz, timestamptz, boolean, boolean, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.apply_subscription_state(text, text, timestamptz, jsonb, uuid, text, text, text, timestamptz, timestamptz, boolean, boolean, text, text)
  to service_role;
revoke all on function public.note_trial_will_end(text, text, jsonb, uuid, text, timestamptz) from public, anon, authenticated, service_role;
grant execute on function public.note_trial_will_end(text, text, jsonb, uuid, text, timestamptz) to service_role;
revoke all on function public.claim_billing_actions(integer, text) from public, anon, authenticated, service_role;
grant execute on function public.claim_billing_actions(integer, text) to service_role;
revoke all on function public.finish_billing_action(uuid, boolean, text) from public, anon, authenticated, service_role;
grant execute on function public.finish_billing_action(uuid, boolean, text) to service_role;
revoke all on function public.apply_payment_notice(text, text, jsonb, text, uuid, text, text, text, numeric, timestamptz)
  from public, anon, authenticated, service_role;
grant execute on function public.apply_payment_notice(text, text, jsonb, text, uuid, text, text, text, numeric, timestamptz)
  to service_role;
