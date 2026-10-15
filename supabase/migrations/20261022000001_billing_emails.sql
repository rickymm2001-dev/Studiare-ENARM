-- Cola de correos de pagos (B10 del plan del cambio, 4.1 y 4.2 del diseño).
--
-- B10 decide qué correo toca y cuándo, y lo deja en esta cola. Mandarlo es de B15, que agrega la
-- función send-emails con Resend y la agenda con pg_cron. Mientras tanto nada sale de la base.
--
-- Reglas que se hacen cumplir aquí
--   - Cada correo tiene una clave para no repetirlo (dedupe_key). Encolar dos veces el mismo correo no
--     crea una segunda fila, así un aviso repetido de la pasarela no manda dos correos
--   - La fila guarda solo lo que hace falta para escribir el texto, fechas, montos y plan. Nunca el
--     correo del destinatario, que B15 resuelve al enviar con la llave de servicio, ni datos fiscales.
--     Una restricción rechaza cualquier dato con arroba
--   - El destinatario es un alumno (recipient_user) o el equipo (recipient_role team), nunca los dos.
--     Si el alumno borra su cuenta, sus correos pendientes se van con ella
--   - billing_emails.enabled en false mantiene todo en la cola. claim_email_batch no entrega nada así
--   - Solo el servidor con la llave de servicio toca la cola. La tabla no tiene políticas y la API no
--     tiene permisos sobre ella
--   - Los tipos de correo viven en la tabla email_kinds y la cola los referencia con una llave foránea.
--     Un tipo nuevo es solo un insert en email_kinds, sin drop, así lo puede aplicar el conector (D-113)
--
-- Tipos sembrados
--   trial_ending           3 días antes de que termine la prueba gratis (note_trial_will_end, 20261022000002)
--   pass_expiring          cuando el último pase vence en passReminderDays o menos (enqueue_pass_expiry_reminders)
--   invoice_requested      al equipo con cada solicitud de factura (request_invoice, 20261022000003)
--   content_report         al médico cuando llega un reporte de error de un alumno (lo encola B11)
--   daily_review_reminder  el aviso diario de repaso (lo encola B15)
--
-- Va antes que 20261022000002 y 20261022000003 porque las dos encolan correos. Es idempotente, no
-- lleva sentencias delete ni drop y no edita las migraciones anteriores

-- ===================================================================== Reglas de pagos
-- trialDays en 0 apaga la prueba desde el servidor. guaranteeDays es la garantía desde el primer cobro.
-- oxxoExpiresDays son los días que vale una ficha OXXO. passReminderDays, cuántos días antes de que
-- venza el último pase se avisa. Las leen esta migración y las dos que siguen
insert into public.platform_settings (key, value) values
  ('billing_rules', '{"trialDays":7,"guaranteeDays":7,"oxxoExpiresDays":3,"passReminderDays":3}'),
  ('billing_emails', '{"enabled":false}')
  on conflict (key) do nothing;

-- Un número de billing_rules, o el de respaldo si falta o no se lee. Ayuda interna
create or replace function public.billing_rule(p_field text, p_default integer) returns integer
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_value integer;
begin
  select (value ->> p_field)::integer into v_value from public.platform_settings where key = 'billing_rules';
  return coalesce(v_value, p_default);
exception when others then
  return p_default;
end;
$$;

-- ===================================================================== Tipos de correo
-- Un tipo nuevo se agrega con un insert, sin tocar la cola ni sus restricciones
create table if not exists public.email_kinds (
  kind text primary key check (kind ~ '^[a-z][a-z0-9_]{1,62}$'),
  description text not null check (char_length(description) between 1 and 200),
  created_at timestamptz not null default now()
);
insert into public.email_kinds (kind, description) values
  ('trial_ending', 'Fin de la prueba gratis, 3 días antes (B10)'),
  ('pass_expiring', 'Pase de un solo pago por vencer (B10)'),
  ('invoice_requested', 'Solicitud de factura nueva, al equipo (B10)'),
  ('content_report', 'Reporte de error de un alumno, al médico que revisa (B11)'),
  ('daily_review_reminder', 'Aviso diario de repaso (B15)')
  on conflict (kind) do nothing;

alter table public.email_kinds enable row level security;
revoke all on public.email_kinds from public, anon, authenticated, service_role;

-- ===================================================================== Cola
create table if not exists public.email_outbox (
  id uuid primary key default gen_random_uuid(),
  recipient_user uuid references auth.users (id) on delete cascade,
  recipient_role text check (recipient_role in ('team')),
  kind text not null references public.email_kinds (kind),
  dedupe_key text not null unique check (char_length(dedupe_key) between 1 and 200),
  -- Sin correos, sin RFC, solo fechas, montos y plan
  data jsonb not null default '{}'::jsonb check (strpos(data::text, '@') = 0),
  status text not null default 'queued' check (status in ('queued', 'sent', 'skipped', 'failed')),
  attempts integer not null default 0,
  last_error text check (char_length(last_error) <= 500),
  send_after timestamptz not null default now(),
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  check ((recipient_user is null) <> (recipient_role is null))
);
create index if not exists email_outbox_queue on public.email_outbox (status, send_after);
create index if not exists email_outbox_user on public.email_outbox (recipient_user)
  where recipient_user is not null;

alter table public.email_outbox enable row level security;
revoke all on public.email_outbox from public, anon, authenticated, service_role;

-- ===================================================================== Encolar
-- Deja un correo en la cola. Devuelve false si ya existía uno con esa clave o si el alumno ya no existe.
-- La llaman las funciones del servidor que deciden cada correo
create or replace function public.enqueue_email(
  p_user uuid,
  p_role text,
  p_kind text,
  p_dedupe_key text,
  p_data jsonb,
  p_send_after timestamptz default now()
) returns boolean
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_rows integer;
begin
  if (p_user is null) = (p_role is null) then
    raise exception 'El correo va a un alumno o al equipo' using errcode = '22023';
  end if;
  if p_kind is null or not exists (select 1 from public.email_kinds where kind = p_kind) then
    raise exception 'Tipo de correo desconocido' using errcode = '22023';
  end if;
  if p_dedupe_key is null or btrim(p_dedupe_key) = '' or char_length(p_dedupe_key) > 200 then
    raise exception 'Falta la clave del correo' using errcode = '22023';
  end if;
  if p_user is not null and not exists (select 1 from auth.users where id = p_user) then
    return false;
  end if;
  insert into public.email_outbox (recipient_user, recipient_role, kind, dedupe_key, data, send_after)
    values (p_user, p_role, p_kind, p_dedupe_key, coalesce(p_data, '{}'::jsonb), coalesce(p_send_after, now()))
    on conflict (dedupe_key) do nothing;
  get diagnostics v_rows = row_count;
  return v_rows > 0;
end;
$$;

-- Encola pass_expiring para cada alumno sin suscripción vigente cuyo último pase activo vence en
-- passReminderDays o menos. Una vez por fecha de fin, así pagar otro periodo y llegar al nuevo fin avisa
-- otra vez. Devuelve cuántos encoló. B15 la agenda una vez al día. Los pases viven en plan_passes, que
-- crea 20261022000002
create or replace function public.enqueue_pass_expiry_reminders() returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_days integer := public.billing_rule('passReminderDays', 3);
  v_row record;
  v_count integer := 0;
begin
  for v_row in
    select distinct on (p.user_id) p.user_id, p.ends_at, p.plan
    from public.plan_passes p
    where p.status = 'active' and p.ends_at > now()
    order by p.user_id, p.ends_at desc
  loop
    if v_row.ends_at > now() + make_interval(days => greatest(v_days, 0)) then
      continue;
    end if;
    -- Con una suscripción vigente el pase no es lo que lo deja estudiar
    if exists (
      select 1 from public.subscriptions s
      where s.user_id = v_row.user_id and s.plan <> 'free'
        and s.status in ('trialing', 'active', 'past_due', 'canceled')
        and ((s.status in ('trialing', 'active') and s.current_period_end is null) or s.current_period_end > now())
    ) then
      continue;
    end if;
    if public.enqueue_email(
      v_row.user_id, null, 'pass_expiring',
      'pass_expiring:' || v_row.user_id::text || ':'
        || to_char(v_row.ends_at at time zone 'America/Mexico_City', 'YYYY-MM-DD'),
      jsonb_build_object('passEnd', v_row.ends_at, 'plan', v_row.plan)
    ) then
      v_count := v_count + 1;
    end if;
  end loop;
  return v_count;
end;
$$;

-- ===================================================================== Mandar (B15)
-- Entrega hasta p_limit correos listos para mandar y los aparta 10 minutos, así dos envíos a la vez no
-- mandan el mismo. Sube attempts. Toma los que esperan y los fallidos con menos de 5 intentos. Con
-- billing_emails.enabled en false no entrega nada
create or replace function public.claim_email_batch(p_limit integer default 20)
returns setof public.email_outbox
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_enabled boolean;
begin
  select coalesce((value ->> 'enabled')::boolean, false) into v_enabled
    from public.platform_settings where key = 'billing_emails';
  if not coalesce(v_enabled, false) then
    return;
  end if;
  return query
    update public.email_outbox o
      set attempts = o.attempts + 1, send_after = now() + interval '10 minutes'
      where o.id in (
        select q.id from public.email_outbox q
        where q.status in ('queued', 'failed') and q.attempts < 5 and q.send_after <= now()
        order by q.send_after, q.created_at
        limit least(greatest(coalesce(p_limit, 20), 1), 100)
        for update skip locked
      )
      returning o.*;
end;
$$;

-- Cierra un correo después de intentar mandarlo. sent y skipped son finales. failed guarda el motivo y
-- lo deja listo para otro intento más tarde, hasta 5. Un correo ya mandado no cambia
create or replace function public.finish_email(p_id uuid, p_status text, p_error text default null)
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if p_status is null or p_status not in ('sent', 'skipped', 'failed') then
    raise exception 'Estado de correo desconocido' using errcode = '22023';
  end if;
  update public.email_outbox
    set status = p_status,
        sent_at = case when p_status = 'sent' then now() else sent_at end,
        last_error = case when p_status = 'sent' then null else left(p_error, 500) end,
        send_after = case when p_status = 'failed' then now() + make_interval(mins => 15 * attempts) else send_after end
    where id = p_id and status <> 'sent';
end;
$$;

-- ===================================================================== Permisos de las funciones
-- billing_rule es una ayuda interna. Las demás solo las ejecuta el servidor con la llave de servicio
revoke all on function public.billing_rule(text, integer) from public, anon, authenticated, service_role;
revoke all on function public.enqueue_email(uuid, text, text, text, jsonb, timestamptz) from public, anon, authenticated, service_role;
grant execute on function public.enqueue_email(uuid, text, text, text, jsonb, timestamptz) to service_role;
revoke all on function public.enqueue_pass_expiry_reminders() from public, anon, authenticated, service_role;
grant execute on function public.enqueue_pass_expiry_reminders() to service_role;
revoke all on function public.claim_email_batch(integer) from public, anon, authenticated, service_role;
grant execute on function public.claim_email_batch(integer) to service_role;
revoke all on function public.finish_email(uuid, text, text) from public, anon, authenticated, service_role;
grant execute on function public.finish_email(uuid, text, text) to service_role;
