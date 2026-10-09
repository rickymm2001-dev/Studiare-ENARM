-- IA alojada (D-103, Fase G bloque G1).
--
-- Qué resuelve
--   El proxy de IA local lleva su libro del día en un archivo, y eso solo sirve en una computadora.
--   Un proxy alojado puede reiniciarse, correr en más de una copia y atender a muchos alumnos, así
--   que los límites por alumno, el presupuesto diario y la bitácora de costos viven aquí, en la base
--
-- Qué guarda
--   ai_usage_day   llamadas por día, alumno y motor. Es lo que cuenta el límite por alumno
--   ai_spend_day   gasto real y llamadas por día y motor. Es lo que cuenta el presupuesto
--   ai_call_log    una fila por llamada, sin texto ni respuestas, solo motor, modelo, tokens y costo
--   ai_config      la configuración de los motores que cambia el admin. Una sola fila
--
-- Quién las usa
--   Solo el servidor del proxy, con la llave de servicio. Ni el navegador ni un alumno pueden leer
--   ni escribir estas tablas ni llamar a estas funciones. Nadie manda a la IA ni guarda aquí un
--   nombre, un correo o el texto de un alumno
--
-- Cómo cuenta
--   El día es el de México. ai_admit toma un candado por día, así que dos peticiones a la vez no se
--   saltan un límite. Cuenta la llamada desde ahora, y ai_release la devuelve si el servidor falló
--   antes de pedir al modelo. ai_settle suma el gasto real, que es el único que cuenta contra el
--   presupuesto. Las respuestas simuladas no gastan
--
-- Borrar mis datos
--   delete_my_data se vuelve a definir aquí para que también quite el uso y la bitácora de IA del
--   alumno. Delete_my_account ya los quita por la llave foránea
--
-- Es idempotente. Se corre después de 20261009000001_privacy.sql. No edita las migraciones anteriores

-- ===================================================================== Tablas
create table if not exists public.ai_usage_day (
  day date not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  engine text not null check (engine in ('forgetting', 'weekly_report', 'flashcards', 'bias_tips', 'restructure')),
  calls integer not null default 0 check (calls >= 0),
  primary key (day, user_id, engine)
);

create table if not exists public.ai_spend_day (
  day date primary key,
  spent_usd numeric(14, 6) not null default 0 check (spent_usd >= 0),
  calls_by_engine jsonb not null default '{}'::jsonb,
  cost_by_engine jsonb not null default '{}'::jsonb
);

create table if not exists public.ai_call_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  user_id uuid references auth.users (id) on delete set null,
  engine text not null check (engine in ('forgetting', 'weekly_report', 'flashcards', 'bias_tips', 'restructure')),
  model text,
  ok boolean not null,
  real boolean not null,
  input_tokens integer check (input_tokens is null or input_tokens >= 0),
  output_tokens integer check (output_tokens is null or output_tokens >= 0),
  cost_usd numeric(14, 6) not null default 0 check (cost_usd >= 0),
  latency_ms integer check (latency_ms is null or latency_ms >= 0)
);
create index if not exists ai_call_log_at on public.ai_call_log (at desc);
create index if not exists ai_call_log_user on public.ai_call_log (user_id, at desc);

-- La configuración de los motores (modelos, precios y límites) que cambia el admin desde la
-- pantalla 25. Una sola fila. No va en platform_settings porque esa tabla la lee cualquiera
create table if not exists public.ai_config (
  id boolean primary key default true check (id),
  value jsonb not null,
  updated_at timestamptz not null default now()
);

-- Sin políticas, con la seguridad por fila encendida, nadie con llave pública las lee ni las escribe
alter table public.ai_usage_day enable row level security;
alter table public.ai_spend_day enable row level security;
alter table public.ai_call_log enable row level security;
alter table public.ai_config enable row level security;
revoke all on public.ai_usage_day, public.ai_spend_day, public.ai_call_log, public.ai_config
  from anon, authenticated;

-- ===================================================================== Día de la IA
create or replace function public.ai_day() returns date
language sql stable as $$
  select (now() at time zone 'America/Mexico_City')::date
$$;

create or replace function public.ai_check_engine(p_engine text) returns void
language plpgsql immutable as $$
begin
  if p_engine is null or p_engine not in ('forgetting', 'weekly_report', 'flashcards', 'bias_tips', 'restructure') then
    raise exception 'Motor de IA desconocido' using errcode = '22023';
  end if;
end;
$$;

-- ===================================================================== Admitir una llamada
-- Devuelve ok, student_limit o budget_exceeded. Cuenta la llamada desde ahora
create or replace function public.ai_admit(
  p_user uuid, p_engine text, p_per_student integer, p_budget numeric
) returns text
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_day date := public.ai_day();
  v_calls integer;
  v_spent numeric;
begin
  perform public.ai_check_engine(p_engine);
  if p_user is null or p_per_student < 1 or p_budget < 0 then
    raise exception 'Límites no válidos' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('ai:' || v_day::text, 0));

  select calls into v_calls from public.ai_usage_day
    where day = v_day and user_id = p_user and engine = p_engine;
  if coalesce(v_calls, 0) >= p_per_student then
    return 'student_limit';
  end if;
  select spent_usd into v_spent from public.ai_spend_day where day = v_day;
  if coalesce(v_spent, 0) >= p_budget then
    return 'budget_exceeded';
  end if;

  insert into public.ai_usage_day (day, user_id, engine, calls) values (v_day, p_user, p_engine, 1)
    on conflict (day, user_id, engine) do update set calls = public.ai_usage_day.calls + 1;
  insert into public.ai_spend_day (day, calls_by_engine) values (v_day, jsonb_build_object(p_engine, 1))
    on conflict (day) do update set calls_by_engine = jsonb_set(
      public.ai_spend_day.calls_by_engine,
      array[p_engine],
      to_jsonb(coalesce((public.ai_spend_day.calls_by_engine ->> p_engine)::integer, 0) + 1)
    );
  return 'ok';
end;
$$;

-- ===================================================================== Devolver el cupo
-- Cuando el servidor falló antes de pedir al modelo y la llamada no llegó a hacerse
create or replace function public.ai_release(p_user uuid, p_engine text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_day date := public.ai_day();
begin
  perform public.ai_check_engine(p_engine);
  perform pg_advisory_xact_lock(hashtextextended('ai:' || v_day::text, 0));
  update public.ai_usage_day set calls = calls - 1
    where day = v_day and user_id = p_user and engine = p_engine and calls > 0;
  update public.ai_spend_day set calls_by_engine = jsonb_set(
      calls_by_engine,
      array[p_engine],
      to_jsonb(greatest(coalesce((calls_by_engine ->> p_engine)::integer, 0) - 1, 0))
    )
    where day = v_day;
end;
$$;

-- ===================================================================== Asentar el gasto
-- Suma el gasto real al presupuesto y deja una fila en la bitácora. Solo el gasto real cuenta
create or replace function public.ai_settle(
  p_user uuid, p_engine text, p_model text, p_real boolean, p_ok boolean,
  p_cost numeric, p_input integer, p_output integer, p_latency integer
) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_day date := public.ai_day();
  v_cost numeric := greatest(coalesce(p_cost, 0), 0);
begin
  perform public.ai_check_engine(p_engine);
  perform pg_advisory_xact_lock(hashtextextended('ai:' || v_day::text, 0));
  if p_real and v_cost > 0 then
    insert into public.ai_spend_day (day, spent_usd, cost_by_engine)
      values (v_day, v_cost, jsonb_build_object(p_engine, v_cost))
      on conflict (day) do update set
        spent_usd = public.ai_spend_day.spent_usd + v_cost,
        cost_by_engine = jsonb_set(
          public.ai_spend_day.cost_by_engine,
          array[p_engine],
          to_jsonb(coalesce((public.ai_spend_day.cost_by_engine ->> p_engine)::numeric, 0) + v_cost)
        );
  end if;
  insert into public.ai_call_log (user_id, engine, model, ok, real, input_tokens, output_tokens, cost_usd, latency_ms)
    values (p_user, p_engine, p_model, coalesce(p_ok, false), coalesce(p_real, false),
            p_input, p_output, case when p_real then v_cost else 0 end, p_latency);
end;
$$;

-- ===================================================================== Resumen del día
-- Lo que lee la pantalla de costos del admin. Mismo formato que el libro local del proxy
create or replace function public.ai_usage_summary() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_day date := public.ai_day();
  v_calls bigint;
  v_students bigint;
  v_spend record;
  v_by jsonb := '{}'::jsonb;
  v_engine text;
begin
  select coalesce(sum(calls), 0), count(distinct user_id) into v_calls, v_students
    from public.ai_usage_day where day = v_day;
  select * into v_spend from public.ai_spend_day where day = v_day;
  for v_engine in select unnest(array['forgetting', 'weekly_report', 'flashcards', 'bias_tips', 'restructure']) loop
    if v_spend.day is not null and (
      v_spend.calls_by_engine ? v_engine or v_spend.cost_by_engine ? v_engine
    ) then
      v_by := v_by || jsonb_build_object(v_engine, jsonb_build_object(
        'calls', coalesce((v_spend.calls_by_engine ->> v_engine)::integer, 0),
        'costUsd', coalesce((v_spend.cost_by_engine ->> v_engine)::numeric, 0)
      ));
    end if;
  end loop;
  return jsonb_build_object(
    'day', v_day::text,
    'calls', v_calls,
    'students', v_students,
    'spentUsd', coalesce(v_spend.spent_usd, 0),
    'byEngine', v_by
  );
end;
$$;

-- ===================================================================== Permisos
-- Solo el servidor del proxy, con la llave de servicio
revoke all on function public.ai_day() from public, anon, authenticated;
revoke all on function public.ai_check_engine(text) from public, anon, authenticated;
revoke all on function public.ai_admit(uuid, text, integer, numeric) from public, anon, authenticated;
revoke all on function public.ai_release(uuid, text) from public, anon, authenticated;
revoke all on function public.ai_settle(uuid, text, text, boolean, boolean, numeric, integer, integer, integer)
  from public, anon, authenticated;
revoke all on function public.ai_usage_summary() from public, anon, authenticated;
grant execute on function public.ai_day() to service_role;
grant execute on function public.ai_check_engine(text) to service_role;
grant execute on function public.ai_admit(uuid, text, integer, numeric) to service_role;
grant execute on function public.ai_release(uuid, text) to service_role;
grant execute on function public.ai_settle(uuid, text, text, boolean, boolean, numeric, integer, integer, integer)
  to service_role;
grant execute on function public.ai_usage_summary() to service_role;

-- ===================================================================== Borrar mis datos
-- Igual que en la migración de privacidad, y además quita el uso y la bitácora de IA del alumno
create or replace function public.delete_my_data() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_user uuid := auth.uid();
  v_events bigint;
  v_records bigint;
  v_artifacts bigint;
  v_reports bigint;
  v_groups bigint;
  v_decks bigint;
  v_ai bigint;
begin
  if v_user is null then
    raise exception 'Hace falta iniciar sesión' using errcode = '28000';
  end if;
  if not public.is_active_device() then
    raise exception 'Este dispositivo no es el activo de la cuenta' using errcode = '42501';
  end if;

  -- Una subida a medias no debe revivir lo que se está borrando
  perform pg_advisory_xact_lock(hashtextextended('sync:' || v_user::text, 0));
  perform set_config('app.erasing_user', v_user::text, true);

  delete from public.events where user_id = v_user;
  get diagnostics v_events = row_count;
  delete from public.sync_records where user_id = v_user;
  get diagnostics v_records = row_count;
  delete from public.ai_artifacts where user_id = v_user;
  get diagnostics v_artifacts = row_count;
  delete from public.content_reports where reporter_id = v_user;
  get diagnostics v_reports = row_count;
  delete from public.memberships where user_id = v_user;
  get diagnostics v_groups = row_count;
  -- Los mazos guardados en la tabla vieja arrastran sus notas y tarjetas
  delete from public.decks where owner_id = v_user;
  get diagnostics v_decks = row_count;
  -- El uso y la bitácora de la IA. Sin el uso de hoy, borrar datos no sirve para saltarse el límite
  -- diario, así que el uso de hoy se conserva y solo se quita lo anterior
  delete from public.ai_usage_day where user_id = v_user and day < public.ai_day();
  get diagnostics v_ai = row_count;
  delete from public.ai_call_log where user_id = v_user;

  perform set_config('app.erasing_user', '', true);
  return jsonb_build_object(
    'events', v_events,
    'records', v_records,
    'artifacts', v_artifacts,
    'reports', v_reports,
    'memberships', v_groups,
    'decks', v_decks,
    'ai_usage', v_ai
  );
end;
$$;
revoke all on function public.delete_my_data() from public, anon, authenticated, service_role;
grant execute on function public.delete_my_data() to authenticated;
