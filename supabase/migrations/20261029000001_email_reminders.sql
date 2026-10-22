-- Recordatorios de repaso por correo y envío de toda la cola (B15 del plan del cambio, 3 del diseño).
--
-- B10 dejó la cola email_outbox y decide qué correo toca. Esta migración suma lo que falta para mandarlos
-- de verdad con la función send-emails (Resend) y para el recordatorio diario de repaso.
--
-- Qué agrega
--   - Un solo interruptor de envío, email_delivery { enabled, paused }, en platform_settings. Nace con el
--     valor de billing_emails.enabled (que en el proyecto real está apagado) y desde aquí manda él. paused
--     lista tipos de correo detenidos, por ejemplo daily_review_reminder, sin frenar los demás.
--     billing_emails queda sin uso, porque quitarlo pediría borrar (8.13)
--   - review_reminder_prefs, los ajustes de recordatorio de cada alumno. Todo nace apagado. Lleva su zona,
--     su hora en punto de las 5 a las 23 (evita el corte del día de estudio a las 4), sus días de la semana
--     (0 es domingo) y una ficha de baja aleatoria que cambia al volver a prender
--   - review_due_snapshots, la foto de cuántas tarjetas vencen que sube la app. Las tarjetas de los mazos
--     precargados no viajan a la nube, así que el servidor no las puede contar. Solo fechas y números
--   - enqueue_review_reminders, que Cron corre cada 15 minutos (20261029000003). Encola un recordatorio por
--     alumno y día local. Con Solo si tengo pendientes y el conteo en cero no encola y marca el día
--   - claim_email_batch v2, con la misma firma. Lee email_delivery, salta los tipos en pausa y marca
--     skipped con el motivo stale lo que ya no tiene sentido mandar, para que prender el envío no mande
--     correos viejos de golpe (8.14). release_email devuelve a la cola, sin gastar intento, lo que no se
--     alcanzó a mandar por el límite de Resend
--   - email_recipients, que resuelve correo, alias y ficha de baja con la llave de servicio. El correo de la
--     cola nunca se guarda en la cola. email_unsubscribe, la baja de un clic. email_tick_ok, que compara
--     la ficha de Cron contra Vault. admin_email_overview, los conteos por tipo y estado para el admin
--
-- Reglas que se hacen cumplir aquí y no en el navegador
--   - Todo apagado de fábrica. Sin email_delivery prendido no sale ni se encola un solo recordatorio
--   - Ninguna fila de la cola lleva un correo (la restricción de B10 lo rechaza). El de destino se resuelve
--     al enviar, y solo de una cuenta con el correo confirmado
--   - Las tablas nuevas tienen row level security, sin políticas y sin permisos de tabla para la API. Solo
--     las funciones con security definer las tocan
--   - Las funciones del alumno piden sesión y dispositivo activo. Las del servidor solo las ejecuta la llave
--     de servicio. admin_email_overview pide is_admin, que desde B9 también pide el segundo factor
--
-- Borrar mis datos (delete_my_data) debe quitar lo nuevo que guarda datos del alumno. Eso lleva delete, y
-- esta migración no lleva delete ni drop (D-113), así que va aparte en delete_my_data v4
-- (20261029000004_delete_my_data_v4.sql, la única de B15 con delete, como la de B12). Borrar la cuenta lo
-- quita todo en cascada
--
-- Es idempotente y no edita las migraciones anteriores. Va después de 20261028000003 y de
-- 20261022000001_billing_emails.sql, de donde sale la cola. No lleva delete ni drop

-- ===================================================================== Interruptor de envío
-- El valor de billing_emails.enabled, si existe. Después, el de fábrica, apagado
insert into public.platform_settings (key, value)
  select 'email_delivery',
         jsonb_build_object('enabled', coalesce((value ->> 'enabled')::boolean, false), 'paused', '[]'::jsonb)
  from public.platform_settings where key = 'billing_emails'
  on conflict (key) do nothing;
insert into public.platform_settings (key, value) values ('email_delivery', '{"enabled":false,"paused":[]}')
  on conflict (key) do nothing;

-- ===================================================================== Ayudas internas
-- Una ficha aleatoria de 36 caracteres hexadecimales. Con pgcrypto si está en el esquema extensions, y
-- si no con dos uuid al azar, que en Postgres 13 o más salen del generador seguro del servidor
create or replace function public.email_new_token() returns text
language plpgsql volatile set search_path = public, pg_temp as $$
begin
  if to_regprocedure('extensions.gen_random_bytes(integer)') is not null then
    return encode(extensions.gen_random_bytes(18), 'hex');
  end if;
  return substr(replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), 1, 36);
end;
$$;

-- Si el envío está prendido y el tipo no está en pausa. Lo usan el encolado y el reclamo
create or replace function public.email_delivery_on(p_kind text) returns boolean
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_value jsonb;
begin
  select value into v_value from public.platform_settings where key = 'email_delivery';
  if v_value is null or v_value -> 'enabled' is distinct from 'true'::jsonb then
    return false;
  end if;
  if jsonb_typeof(v_value -> 'paused') = 'array' and (v_value -> 'paused') ? p_kind then
    return false;
  end if;
  return true;
end;
$$;

-- Una fecha de los datos de un correo, o null si falta o no se lee. Para saber si ya pasó
create or replace function public.email_data_time(p_data jsonb, p_field text) returns timestamptz
language plpgsql stable set search_path = public, pg_temp as $$
begin
  return (p_data ->> p_field)::timestamptz;
exception when others then
  return null;
end;
$$;

-- Diario si están los siete días, Lunes a viernes si son esos cinco y Días que elijas en otro caso. Los
-- días se guardan sin repetir y en orden
create or replace function public.reminder_frequency_of(p_days smallint[]) returns text
language sql immutable set search_path = public, pg_temp as $$
  select case
    when p_days = '{0,1,2,3,4,5,6}'::smallint[] then 'daily'
    when p_days = '{1,2,3,4,5}'::smallint[] then 'weekdays'
    else 'custom'
  end
$$;

-- Quien llama, con sesión y con el dispositivo activo de la cuenta
create or replace function public.engagement_user() returns uuid
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'Hace falta iniciar sesión' using errcode = '28000';
  end if;
  if not public.is_active_device() then
    raise exception 'Este dispositivo no es el activo de la cuenta' using errcode = '42501';
  end if;
  return v_user;
end;
$$;

-- ===================================================================== Tablas
create table if not exists public.review_reminder_prefs (
  user_id uuid primary key references auth.users (id) on delete cascade,
  enabled boolean not null default false,
  hour smallint not null default 20 check (hour between 5 and 23),
  days smallint[] not null default '{0,1,2,3,4,5,6}' check (cardinality(days) between 1 and 7),  -- 0 es domingo
  only_when_due boolean not null default true,
  time_zone text not null default 'America/Merida',
  unsubscribe_token text not null unique default public.email_new_token(),
  unsubscribed_at timestamptz,
  last_enqueued_on date,
  updated_at timestamptz not null default now()
);
create index if not exists review_reminder_prefs_hour on public.review_reminder_prefs (hour) where enabled;

create table if not exists public.review_due_snapshots (
  user_id uuid primary key references auth.users (id) on delete cascade,
  computed_at timestamptz not null,
  time_zone text not null,
  days jsonb not null check (jsonb_typeof(days) = 'array' and jsonb_array_length(days) <= 14),
  new_available integer not null default 0 check (new_available between 0 and 100000),
  received_at timestamptz not null default now()
);

alter table public.review_reminder_prefs enable row level security;
alter table public.review_due_snapshots enable row level security;
revoke all on public.review_reminder_prefs, public.review_due_snapshots from public, anon, authenticated, service_role;

-- ===================================================================== Ajustes del alumno
-- Los ajustes de recordatorio con la forma que lee la app (7.5 del plan de B15)
create or replace function public.reminder_prefs_json(p_user uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_row public.review_reminder_prefs;
  v_zone text;
begin
  select * into v_row from public.review_reminder_prefs where user_id = p_user;
  if not found then
    -- Sin ajustes guardados, la zona del perfil si es una que la base conoce
    select z.name into v_zone
      from public.profiles p join pg_catalog.pg_timezone_names z on z.name = p.time_zone
      where p.id = p_user;
    return jsonb_build_object(
      'available', true, 'enabled', false, 'hour', 20, 'days', jsonb_build_array(0, 1, 2, 3, 4, 5, 6),
      'frequency', 'daily', 'onlyWhenDue', true, 'timeZone', coalesce(v_zone, 'America/Merida'),
      'unsubscribed', false
    );
  end if;
  return jsonb_build_object(
    'available', true, 'enabled', v_row.enabled, 'hour', v_row.hour, 'days', to_jsonb(v_row.days),
    'frequency', public.reminder_frequency_of(v_row.days), 'onlyWhenDue', v_row.only_when_due,
    'timeZone', v_row.time_zone, 'unsubscribed', v_row.unsubscribed_at is not null
  );
end;
$$;

create or replace function public.my_reminder_prefs() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  return public.reminder_prefs_json(public.engagement_user());
end;
$$;

-- Guarda los ajustes. Valida la hora, los días, la zona y los booleanos. Prender de nuevo, o prender tras
-- una baja, cambia la ficha de baja y quita la baja
create or replace function public.set_reminder_prefs(
  p_enabled boolean,
  p_hour integer,
  p_days integer[],
  p_only_when_due boolean,
  p_time_zone text
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_user uuid := public.engagement_user();
  v_days smallint[];
begin
  if p_enabled is null or p_only_when_due is null then
    raise exception 'Faltan los datos del recordatorio' using errcode = '22023';
  end if;
  if p_hour is null or p_hour not between 5 and 23 then
    raise exception 'La hora va de las 5 a las 23' using errcode = '22023';
  end if;
  if p_days is null or cardinality(p_days) not between 1 and 14
     or exists (select 1 from unnest(p_days) d where d is null or d not between 0 and 6) then
    raise exception 'Los días van de 0 a 6' using errcode = '22023';
  end if;
  if p_time_zone is null or not exists (select 1 from pg_catalog.pg_timezone_names where name = p_time_zone) then
    raise exception 'Esa zona horaria no existe' using errcode = '22023';
  end if;
  v_days := array(select distinct d::smallint from unnest(p_days) d order by 1);

  insert into public.review_reminder_prefs as r (user_id, enabled, hour, days, only_when_due, time_zone)
    values (v_user, p_enabled, p_hour, v_days, p_only_when_due, p_time_zone)
    on conflict (user_id) do update set
      enabled = excluded.enabled,
      hour = excluded.hour,
      days = excluded.days,
      only_when_due = excluded.only_when_due,
      time_zone = excluded.time_zone,
      unsubscribe_token = case
        when excluded.enabled and (not r.enabled or r.unsubscribed_at is not null) then public.email_new_token()
        else r.unsubscribe_token
      end,
      unsubscribed_at = case when excluded.enabled then null else r.unsubscribed_at end,
      updated_at = now();
  return public.reminder_prefs_json(v_user);
end;
$$;

-- La foto de cuántas tarjetas vencen cada día, de hoy y los 13 siguientes. Solo fechas y números. Una
-- clave que no sea de la forma, una fecha mala o un conteo fuera de rango la rechazan
create or replace function public.put_due_snapshot(p_snapshot jsonb) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_user uuid := public.engagement_user();
  v_computed timestamptz;
  v_zone text;
  v_new integer;
  v_days jsonb := '[]'::jsonb;
  v_item jsonb;
  v_day date;
  v_due integer;
begin
  if p_snapshot is null or jsonb_typeof(p_snapshot) <> 'object'
     or exists (select 1 from jsonb_object_keys(p_snapshot) k where k not in ('computedAt', 'timeZone', 'days', 'newAvailable')) then
    raise exception 'La foto de tarjetas vencidas no es válida' using errcode = '22023';
  end if;
  begin
    if jsonb_typeof(p_snapshot -> 'computedAt') is distinct from 'string'
       or jsonb_typeof(p_snapshot -> 'timeZone') is distinct from 'string'
       or jsonb_typeof(p_snapshot -> 'days') is distinct from 'array'
       or jsonb_typeof(p_snapshot -> 'newAvailable') is distinct from 'number' then
      raise exception 'forma' using errcode = '22023';
    end if;
    v_computed := (p_snapshot ->> 'computedAt')::timestamptz;
    v_zone := p_snapshot ->> 'timeZone';
    v_new := (p_snapshot ->> 'newAvailable')::integer;
    if jsonb_array_length(p_snapshot -> 'days') > 14 then
      raise exception 'forma' using errcode = '22023';
    end if;
    for v_item in select value from jsonb_array_elements(p_snapshot -> 'days') loop
      if jsonb_typeof(v_item) is distinct from 'object' or jsonb_typeof(v_item -> 'day') is distinct from 'string'
         or jsonb_typeof(v_item -> 'due') is distinct from 'number'
         or exists (select 1 from jsonb_object_keys(v_item) k where k not in ('day', 'due')) then
        raise exception 'forma' using errcode = '22023';
      end if;
      v_day := (v_item ->> 'day')::date;
      v_due := (v_item ->> 'due')::integer;
      if v_due not between 0 and 100000 or (v_item ->> 'day') !~ '^\d{4}-\d{2}-\d{2}$' then
        raise exception 'forma' using errcode = '22023';
      end if;
      v_days := v_days || jsonb_build_array(jsonb_build_object('day', v_day, 'due', v_due));
    end loop;
  exception when others then
    raise exception 'La foto de tarjetas vencidas no es válida' using errcode = '22023';
  end;
  if v_new not between 0 and 100000
     or not exists (select 1 from pg_catalog.pg_timezone_names where name = v_zone)
     or v_computed > now() + interval '1 day' then
    raise exception 'La foto de tarjetas vencidas no es válida' using errcode = '22023';
  end if;

  insert into public.review_due_snapshots (user_id, computed_at, time_zone, days, new_available, received_at)
    values (v_user, v_computed, v_zone, v_days, v_new, now())
    on conflict (user_id) do update set
      computed_at = excluded.computed_at, time_zone = excluded.time_zone, days = excluded.days,
      new_available = excluded.new_available, received_at = excluded.received_at;
end;
$$;

-- ===================================================================== Encolar los recordatorios
-- Hace el trabajo con la hora que se le da, para probarlo con el reloj fijado. La que llama Cron es
-- enqueue_review_reminders, que le pasa now(). Encola a quien lo tiene prendido y sin baja, cuya hora local es
-- la de ahora, cuyo día local está en sus días y que no tiene recordatorio hoy. Con el envío apagado o el
-- tipo en pausa no encola nada. Devuelve cuántos encoló
create or replace function public.enqueue_review_reminders_at(p_now timestamptz) returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_row record;
  v_local timestamp;
  v_day date;
  v_due integer;
  v_new integer;
  v_snapshot record;
  v_count integer := 0;
begin
  if not public.email_delivery_on('daily_review_reminder') then
    return 0;
  end if;
  for v_row in
    select p.user_id, p.hour, p.days, p.only_when_due, p.time_zone, p.last_enqueued_on
    from public.review_reminder_prefs p
    where p.enabled and p.unsubscribed_at is null
  loop
    begin
      v_local := p_now at time zone v_row.time_zone;
      v_day := v_local::date;
      -- Su hora en punto, un día de su lista y sin recordatorio de hoy
      if extract(hour from v_local)::integer <> v_row.hour
         or not (extract(dow from v_local)::smallint = any (v_row.days))
         or v_row.last_enqueued_on = v_day then
        continue;
      end if;

      -- La foto de vencidas. Sin foto, o con una de más de 14 días, el correo va sin número
      v_due := null;
      v_new := 0;
      select s.computed_at, s.days, s.new_available into v_snapshot
        from public.review_due_snapshots s where s.user_id = v_row.user_id;
      if found and v_snapshot.computed_at > p_now - interval '14 days' then
        select (e ->> 'due')::integer into v_due
          from jsonb_array_elements(v_snapshot.days) e where e ->> 'day' = v_day::text limit 1;
        v_new := v_snapshot.new_available;
      end if;

      -- Solo si tengo pendientes y el conteo es 0. No se manda y el día queda marcado
      if v_row.only_when_due and v_due = 0 then
        update public.review_reminder_prefs set last_enqueued_on = v_day where user_id = v_row.user_id;
        continue;
      end if;

      if public.enqueue_email(
        v_row.user_id, null, 'daily_review_reminder',
        'daily_review_reminder:' || v_row.user_id::text || ':' || v_day::text,
        jsonb_build_object('due', v_due, 'newAvailable', v_new, 'day', v_day::text)
      ) then
        v_count := v_count + 1;
      end if;
      update public.review_reminder_prefs set last_enqueued_on = v_day where user_id = v_row.user_id;
    exception when others then
      -- Una zona o una foto rara de un alumno no frena a los demás. Sin datos de nadie
      raise warning 'enqueue_review_reminders: un alumno se saltó (%)', sqlstate;
    end;
  end loop;
  return v_count;
end;
$$;

create or replace function public.enqueue_review_reminders() returns integer
language sql security definer set search_path = public, pg_temp as $$
  select public.enqueue_review_reminders_at(now())
$$;

-- ===================================================================== Reclamar y soltar
-- Entrega hasta p_limit correos listos para mandar y los aparta 10 minutos, así dos envíos a la vez no
-- mandan el mismo. Sube attempts. Toma los que esperan y los fallidos con menos de 5 intentos. Con
-- email_delivery apagado no entrega nada. Salta los tipos en pausa. Antes marca skipped, con el motivo
-- stale, lo que ya no tiene sentido mandar (un recordatorio de hace más de 6 horas, un fin de prueba o un
-- pase con la fecha ya pasada), así prender el envío no manda correos viejos de golpe. La misma firma que
-- la de B10 (20261022000001), que leía billing_emails
create or replace function public.claim_email_batch(p_limit integer default 20)
returns setof public.email_outbox
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_value jsonb;
  v_paused text[] := '{}';
begin
  select value into v_value from public.platform_settings where key = 'email_delivery';
  if v_value is null or v_value -> 'enabled' is distinct from 'true'::jsonb then
    return;
  end if;
  if jsonb_typeof(v_value -> 'paused') = 'array' then
    select coalesce(array_agg(item), '{}') into v_paused from jsonb_array_elements_text(v_value -> 'paused') item;
  end if;

  update public.email_outbox o
    set status = 'skipped', last_error = 'stale'
    where o.status in ('queued', 'failed') and o.send_after <= now() and o.kind <> all (v_paused)
      and (
        (o.kind = 'daily_review_reminder' and o.created_at < now() - interval '6 hours')
        or (o.kind = 'trial_ending' and public.email_data_time(o.data, 'trialEnd') < now())
        or (o.kind = 'pass_expiring' and public.email_data_time(o.data, 'passEnd') < now())
      );

  return query
    update public.email_outbox o
      set attempts = o.attempts + 1, send_after = now() + interval '10 minutes'
      where o.id in (
        select q.id from public.email_outbox q
        where q.status in ('queued', 'failed') and q.attempts < 5 and q.send_after <= now()
          and q.kind <> all (v_paused)
        order by q.send_after, q.created_at
        limit least(greatest(coalesce(p_limit, 20), 1), 100)
        for update skip locked
      )
      returning o.*;
end;
$$;

-- Devuelve a la cola, sin gastar el intento, un correo que se reclamó y no se alcanzó a mandar, por ejemplo
-- porque Resend contestó 429. Un correo ya cerrado no cambia
create or replace function public.release_email(p_id uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update public.email_outbox
    set attempts = greatest(attempts - 1, 0), send_after = now()
    where id = p_id and status in ('queued', 'failed');
end;
$$;

-- ===================================================================== Destinatario
-- Resuelve a quién va cada correo reclamado, solo con la llave de servicio. El correo de un alumno o médico
-- sale de su cuenta, y el del equipo son los de los administradores y el dueño. Solo cuentas con el correo
-- confirmado. La ficha de baja solo la trae el recordatorio, y solo de quien lo tiene prendido y sin baja,
-- así un recordatorio de alguien que ya no lo quiere se salta
create or replace function public.email_recipients(p_ids uuid[])
returns table (id uuid, emails text[], alias text, unsubscribe_token text)
language sql stable security definer set search_path = public, pg_temp as $$
  select
    o.id,
    case
      when o.recipient_user is not null then coalesce(
        (select array_agg(u.email) from auth.users u
          where u.id = o.recipient_user and coalesce(u.email, '') <> '' and u.email_confirmed_at is not null),
        '{}'::text[])
      else coalesce(
        (select array_agg(distinct u.email) from public.user_roles r join auth.users u on u.id = r.user_id
          where r.role in ('owner', 'admin') and coalesce(u.email, '') <> '' and u.email_confirmed_at is not null),
        '{}'::text[])
    end,
    (select p.alias from public.profiles p where p.id = o.recipient_user),
    case when o.kind = 'daily_review_reminder' then
      (select r.unsubscribe_token from public.review_reminder_prefs r
        where r.user_id = o.recipient_user and r.enabled and r.unsubscribed_at is null)
    end
  from public.email_outbox o
  where o.id = any (coalesce(p_ids, '{}'::uuid[]))
$$;

-- ===================================================================== Baja de un clic
-- Apaga el recordatorio de quien tiene esa ficha y marca la baja. Devuelve done, already si ya estaba dada
-- de baja o invalid si la ficha no existe o no tiene la forma. La función email-unsubscribe responde 200 en
-- blanco al correo de Gmail o Yahoo sin importar el resultado, para no revelar nada
create or replace function public.email_unsubscribe(p_token text) returns text
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_user uuid;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{36}$' then
    return 'invalid';
  end if;
  update public.review_reminder_prefs
    set enabled = false, unsubscribed_at = now(), updated_at = now()
    where unsubscribe_token = p_token and unsubscribed_at is null
    returning user_id into v_user;
  if found then
    return 'done';
  end if;
  if exists (select 1 from public.review_reminder_prefs where unsubscribe_token = p_token) then
    return 'already';
  end if;
  return 'invalid';
end;
$$;

-- ===================================================================== Ficha de Cron
-- La ficha email_tick que manda Cron contra el secreto email_tick_secret de Vault. Lee Vault al llamarse, así
-- esta migración corre aunque Vault no exista, como en la base de las pruebas
create or replace function public.email_tick_ok(p_token text) returns boolean
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_secret text;
begin
  if p_token is null or char_length(p_token) < 32 or to_regclass('vault.decrypted_secrets') is null then
    return false;
  end if;
  execute 'select decrypted_secret from vault.decrypted_secrets where name = $1 limit 1'
    into v_secret using 'email_tick_secret';
  return v_secret is not null and char_length(v_secret) >= 32 and v_secret = p_token;
exception when others then
  return false;
end;
$$;

-- ===================================================================== Conteos para el admin
-- Cuántos correos hay por tipo y estado en los últimos días. Trae todos los tipos de email_kinds, también
-- los que están en cero, para poder pausarlos. Sin destinatarios ni datos
create or replace function public.admin_email_overview(p_days integer default 7) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_days integer := least(greatest(coalesce(p_days, 7), 1), 90);
begin
  if auth.uid() is null then
    raise exception 'Hace falta iniciar sesión' using errcode = '28000';
  end if;
  if not public.is_admin() then
    raise exception 'Solo un administrador puede ver los correos' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'days', v_days,
    'kinds', coalesce((
      select jsonb_agg(jsonb_build_object(
        'kind', k.kind,
        'queued', coalesce(c.queued, 0), 'sent', coalesce(c.sent, 0),
        'skipped', coalesce(c.skipped, 0), 'failed', coalesce(c.failed, 0)
      ) order by k.kind)
      from public.email_kinds k
      left join (
        select o.kind,
               count(*) filter (where o.status = 'queued') as queued,
               count(*) filter (where o.status = 'sent') as sent,
               count(*) filter (where o.status = 'skipped') as skipped,
               count(*) filter (where o.status = 'failed') as failed
        from public.email_outbox o
        where o.created_at >= now() - make_interval(days => v_days)
        group by o.kind
      ) c on c.kind = k.kind
    ), '[]'::jsonb)
  );
end;
$$;

-- ===================================================================== Permisos de las funciones
-- Las ayudas internas no las ejecuta nadie de la API. Las del alumno piden sesión. Las del servidor solo las
-- ejecuta la llave de servicio. La del admin revisa el rol por dentro
revoke all on function public.email_new_token() from public, anon, authenticated, service_role;
revoke all on function public.email_delivery_on(text) from public, anon, authenticated, service_role;
revoke all on function public.email_data_time(jsonb, text) from public, anon, authenticated, service_role;
revoke all on function public.reminder_frequency_of(smallint[]) from public, anon, authenticated, service_role;
revoke all on function public.engagement_user() from public, anon, authenticated, service_role;
revoke all on function public.reminder_prefs_json(uuid) from public, anon, authenticated, service_role;
revoke all on function public.enqueue_review_reminders_at(timestamptz) from public, anon, authenticated, service_role;
-- Del alumno, con sesión y dispositivo activo
revoke all on function public.my_reminder_prefs() from public, anon, authenticated, service_role;
grant execute on function public.my_reminder_prefs() to authenticated;
revoke all on function public.set_reminder_prefs(boolean, integer, integer[], boolean, text) from public, anon, authenticated, service_role;
grant execute on function public.set_reminder_prefs(boolean, integer, integer[], boolean, text) to authenticated;
revoke all on function public.put_due_snapshot(jsonb) from public, anon, authenticated, service_role;
grant execute on function public.put_due_snapshot(jsonb) to authenticated;
-- Del servidor, solo con la llave de servicio
revoke all on function public.enqueue_review_reminders() from public, anon, authenticated, service_role;
grant execute on function public.enqueue_review_reminders() to service_role;
revoke all on function public.email_recipients(uuid[]) from public, anon, authenticated, service_role;
grant execute on function public.email_recipients(uuid[]) to service_role;
revoke all on function public.claim_email_batch(integer) from public, anon, authenticated, service_role;
grant execute on function public.claim_email_batch(integer) to service_role;
revoke all on function public.release_email(uuid) from public, anon, authenticated, service_role;
grant execute on function public.release_email(uuid) to service_role;
revoke all on function public.email_unsubscribe(text) from public, anon, authenticated, service_role;
grant execute on function public.email_unsubscribe(text) to service_role;
revoke all on function public.email_tick_ok(text) from public, anon, authenticated, service_role;
grant execute on function public.email_tick_ok(text) to service_role;
-- Del admin con segundo factor
revoke all on function public.admin_email_overview(integer) from public, anon, authenticated, service_role;
grant execute on function public.admin_email_overview(integer) to authenticated;
