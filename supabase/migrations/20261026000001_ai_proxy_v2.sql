-- IA real, libro del día v2 (B12, 6.1 del plan de B12).
--
-- Qué agrega
--   - ai_whoami, la única RPC con la que la Edge Function ai-proxy sabe quién llama. Va con el token
--     del alumno. Revisa el dispositivo activo y devuelve el rol de current_app_role, que con la
--     bandera requireMfa solo da el rol del equipo con segundo factor (B9), y paid como user_plan
--     distinto de free, que incluye la prueba gratis, los pases y el mes de referido (B10)
--   - ai_usage_day.cost_usd, el gasto real de cada alumno en el día, para su tope en dólares, y
--     reserved_usd con reserved_since, lo que reservan sus llamadas en vuelo
--   - ai_generations, las generaciones de tarjetas de cada alumno por día y sus secciones
--   - Columnas nuevas de ai_call_log, sin texto. Modo (al momento o por lote), resultado, tokens de
--     caché, versión del prompt, categoría de una negativa del modelo y el trabajo por lote
--   - ai_admit_v2, ai_release_v2 y ai_settle_v2, con firma nueva para no borrar las de D-103, que se
--     quedan sin uso. ai_usage_summary_v2 va en 20261026000002, porque lee la cola de lotes
--   - admin_ai_cost_report, el costo de la nube por motor, por modo y por alumno para el admin
--
-- Cómo cuenta (2.4)
--   El día es el de México. ai_admit_v2 toma el mismo candado por día que ai_admit y revisa, en
--   orden, las llamadas del alumno por motor, sus generaciones de tarjetas (distintas al día hasta
--   p_max_generations y llamadas por generación hasta p_max_sections más 2 reintentos), el
--   presupuesto total, la cuota del motor (p_budget por p_engine_share) y, si no es del equipo, su
--   tope en dólares. Las mismas reglas que DayLedger de supabase/functions/_shared/ai/ledger.ts
--
-- Reserva al admitir (revisión independiente, hallazgo 1)
--   El gasto solo entra cuando la llamada termina, así que 60 llamadas a la vez pasaban todas el tope
--   del alumno porque ninguna había gastado todavía. Ahora ai_admit_v2 recibe p_reserve, el peor costo
--   de la llamada (todos sus intentos, con la entrada completa y la salida llena hasta max_tokens), y lo
--   guarda en ai_usage_day.reserved_usd del alumno y del motor. Las tres comparaciones suman lo
--   asentado más lo reservado por lo que está en vuelo, sin contar la reserva de la llamada que entra,
--   así el tope sigue siendo blando por una sola llamada y quien manda de una en una gasta lo mismo
--   que antes. El presupuesto del día y la cuota del motor suman las reservas de todos los alumnos
--   leyendo ai_usage_day, que es la única fuente, sin una copia en ai_spend_day que se pueda desfasar.
--   ai_settle_v2 y ai_release_v2 reciben p_reserved y la devuelven siempre que se asienta o se libera
--   la llamada. Los lotes no reservan: su costo lo cuenta el ciclo como inFlightUsd (p_reserve 0)
--
--   Lo reservado huérfano, de una llamada que murió antes de asentarse (la plataforma corta una
--   función, un reinicio), vence a los 5 minutos: reserved_since guarda la hora de la primera reserva
--   desde que el alumno y el motor quedaron sin nada en vuelo, y ai_admit_v2 pone en cero, antes de
--   comparar, lo que lleva más de 5 minutos. Una petición dura 120 s como máximo, así que ninguna
--   llamada viva pierde su reserva. Igual que RESERVATION_TTL_MS de ledger.ts
--
-- Quién las usa
--   ai_whoami la llama el alumno con su token. Las del libro, solo la función con la llave de
--   servicio. admin_ai_cost_report, un admin con su segundo factor. Nadie con llave pública lee ni
--   escribe las tablas de la IA, y nada aquí guarda un nombre, un correo o el texto de un alumno
--
-- Es idempotente, no lleva delete ni drop y no edita las migraciones anteriores (D-113). Va después
-- de 20261023000006_bank_sync_cron.sql

-- ===================================================================== Quién llama
create or replace function public.ai_whoami() returns jsonb
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
    'userId', v_uid,
    'role', public.current_app_role()::text,
    'paid', public.user_plan(v_uid) <> 'free'
  );
end;
$$;

-- ===================================================================== Tablas
alter table public.ai_usage_day
  add column if not exists cost_usd numeric(14, 6) not null default 0;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'ai_usage_day_cost_usd_check'
      and conrelid = 'public.ai_usage_day'::regclass
  ) then
    alter table public.ai_usage_day add constraint ai_usage_day_cost_usd_check check (cost_usd >= 0);
  end if;
end $$;

-- Lo que reservan las llamadas en vuelo del alumno en este motor (ai_admit_v2) y desde cuándo. Sin
-- nada en vuelo, reserved_usd es 0 y reserved_since es null
alter table public.ai_usage_day
  add column if not exists reserved_usd numeric(14, 6) not null default 0,
  add column if not exists reserved_since timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'ai_usage_day_reserved_check'
      and conrelid = 'public.ai_usage_day'::regclass
  ) then
    alter table public.ai_usage_day add constraint ai_usage_day_reserved_check
      check (reserved_usd >= 0 and ((reserved_usd > 0) = (reserved_since is not null)));
  end if;
end $$;
-- Solo las filas con algo reservado, que casi siempre son pocas. Es lo que suma ai_admit_v2
create index if not exists ai_usage_day_reserved on public.ai_usage_day (day, engine)
  where reserved_usd > 0;

create table if not exists public.ai_generations (
  day date not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  generation_ref text not null check (generation_ref ~ '^[A-Za-z0-9_-]{8,64}$'),
  calls integer not null default 0 check (calls >= 0),
  primary key (day, user_id, generation_ref)
);

alter table public.ai_call_log
  add column if not exists mode text,
  add column if not exists outcome text,
  add column if not exists cache_read_tokens integer,
  add column if not exists cache_write_tokens integer,
  add column if not exists prompt_version text,
  add column if not exists refusal_category text,
  add column if not exists job_id uuid;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'ai_call_log_v2_check'
                 and conrelid = 'public.ai_call_log'::regclass) then
    alter table public.ai_call_log add constraint ai_call_log_v2_check check (
      (mode is null or mode in ('sync', 'batch'))
      and (outcome is null or outcome in
        ('ok', 'retried_ok', 'invalid_output', 'provider_error', 'rate_limited', 'refused', 'org_limit'))
      and (cache_read_tokens is null or cache_read_tokens >= 0)
      and (cache_write_tokens is null or cache_write_tokens >= 0)
      and (prompt_version is null or char_length(prompt_version) <= 40)
      and (refusal_category is null or char_length(refusal_category) <= 40)
    );
  end if;
end $$;
create index if not exists ai_call_log_job on public.ai_call_log (job_id) where job_id is not null;

alter table public.ai_generations enable row level security;
revoke all on public.ai_generations from anon, authenticated;

-- ===================================================================== Admitir una llamada
-- Devuelve ok, student_limit, generation_limit o budget_exceeded. Cuenta la llamada desde ahora y
-- reserva p_reserve, su peor costo en dólares, hasta que se asiente o se devuelva
create or replace function public.ai_admit_v2(
  p_user uuid, p_engine text, p_staff boolean, p_per_student integer,
  p_budget numeric, p_engine_share numeric, p_user_budget numeric,
  p_generation text, p_max_generations integer, p_max_sections integer,
  p_reserve numeric default 0
) returns text
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_day date := public.ai_day();
  v_reserve numeric := round(coalesce(p_reserve, 0), 6);
  v_calls integer;
  v_generation integer;
  v_open integer;
  v_spent numeric;
  v_engine_spent numeric;
  v_user_spent numeric;
  v_reserved numeric;
  v_engine_reserved numeric;
  v_user_reserved numeric;
begin
  perform public.ai_check_engine(p_engine);
  if p_user is null
     or coalesce(p_per_student, 0) < 1
     or coalesce(p_budget, -1) < 0
     or coalesce(p_engine_share, -1) < 0
     or coalesce(p_user_budget, -1) < 0
     or coalesce(p_max_generations, 0) < 1
     or coalesce(p_max_sections, 0) < 1
     or (p_generation is not null and p_generation !~ '^[A-Za-z0-9_-]{8,64}$')
     or v_reserve < 0 then
    raise exception 'Límites no válidos' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('ai:' || v_day::text, 0));

  -- Lo reservado por una llamada que murió antes de asentarse vence a los 5 minutos
  update public.ai_usage_day set reserved_usd = 0, reserved_since = null
    where day = v_day and reserved_usd > 0 and reserved_since <= now() - interval '5 minutes';

  select calls into v_calls from public.ai_usage_day
    where day = v_day and user_id = p_user and engine = p_engine;
  if coalesce(v_calls, 0) >= p_per_student then
    return 'student_limit';
  end if;

  if p_generation is not null then
    select calls into v_generation from public.ai_generations
      where day = v_day and user_id = p_user and generation_ref = p_generation;
    select count(*) into v_open from public.ai_generations
      where day = v_day and user_id = p_user and calls > 0;
    if (coalesce(v_generation, 0) = 0 and v_open >= p_max_generations)
       or coalesce(v_generation, 0) >= p_max_sections + 2 then
      return 'generation_limit';
    end if;
  end if;

  -- Lo asentado más lo reservado por lo que está en vuelo. La reserva de esta llamada entra después
  select spent_usd, coalesce((cost_by_engine ->> p_engine)::numeric, 0)
    into v_spent, v_engine_spent
    from public.ai_spend_day where day = v_day;
  select coalesce(sum(reserved_usd), 0), coalesce(sum(reserved_usd) filter (where engine = p_engine), 0)
    into v_reserved, v_engine_reserved
    from public.ai_usage_day where day = v_day and reserved_usd > 0;
  if coalesce(v_spent, 0) + v_reserved >= p_budget
     or coalesce(v_engine_spent, 0) + v_engine_reserved >= p_budget * p_engine_share then
    return 'budget_exceeded';
  end if;
  if not coalesce(p_staff, false) then
    select coalesce(sum(cost_usd), 0), coalesce(sum(reserved_usd), 0) into v_user_spent, v_user_reserved
      from public.ai_usage_day where day = v_day and user_id = p_user;
    if v_user_spent + v_user_reserved >= p_user_budget then
      return 'budget_exceeded';
    end if;
  end if;

  -- reserved_since es la hora de la primera reserva desde que el alumno y el motor quedaron sin nada en vuelo
  insert into public.ai_usage_day (day, user_id, engine, calls, reserved_usd, reserved_since)
    values (v_day, p_user, p_engine, 1, v_reserve, case when v_reserve > 0 then now() end)
    on conflict (day, user_id, engine) do update set
      calls = public.ai_usage_day.calls + 1,
      reserved_usd = public.ai_usage_day.reserved_usd + v_reserve,
      reserved_since = case
        when v_reserve = 0 or public.ai_usage_day.reserved_usd > 0 then public.ai_usage_day.reserved_since
        else now()
      end;
  if p_generation is not null then
    insert into public.ai_generations (day, user_id, generation_ref, calls)
      values (v_day, p_user, p_generation, 1)
      on conflict (day, user_id, generation_ref)
      do update set calls = public.ai_generations.calls + 1;
  end if;
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
-- Cuando la función falló antes de pedir al modelo. También la sección de la generación y la reserva
-- (p_reserved, la misma con la que se admitió la llamada). Nunca baja de cero
create or replace function public.ai_release_v2(
  p_user uuid, p_engine text, p_generation text, p_reserved numeric default 0
) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_day date := public.ai_day();
  v_reserved numeric := round(greatest(coalesce(p_reserved, 0), 0), 6);
begin
  perform public.ai_check_engine(p_engine);
  perform pg_advisory_xact_lock(hashtextextended('ai:' || v_day::text, 0));
  update public.ai_usage_day set calls = calls - 1
    where day = v_day and user_id = p_user and engine = p_engine and calls > 0;
  if v_reserved > 0 then
    update public.ai_usage_day set
        reserved_usd = greatest(reserved_usd - v_reserved, 0),
        reserved_since = case when reserved_usd > v_reserved then reserved_since else null end
      where day = v_day and user_id = p_user and engine = p_engine and reserved_usd > 0;
  end if;
  if p_generation is not null then
    update public.ai_generations set calls = calls - 1
      where day = v_day and user_id = p_user and generation_ref = p_generation and calls > 0;
  end if;
  update public.ai_spend_day set calls_by_engine = jsonb_set(
      calls_by_engine,
      array[p_engine],
      to_jsonb(greatest(coalesce((calls_by_engine ->> p_engine)::integer, 0) - 1, 0))
    )
    where day = v_day;
end;
$$;

-- ===================================================================== Asentar el gasto
-- Suma el gasto real al presupuesto, a la cuota del motor y al tope del alumno, devuelve lo que
-- reservó la llamada (p_reserved, 0 en los lotes) y deja su renglón en la bitácora, también cuando la
-- llamada falló. Solo el gasto real cuenta. Nunca guarda texto
create or replace function public.ai_settle_v2(
  p_user uuid, p_engine text, p_model text, p_real boolean, p_ok boolean, p_cost numeric,
  p_input integer, p_output integer, p_cache_read integer, p_cache_write integer,
  p_latency integer, p_mode text, p_outcome text, p_prompt_version text,
  p_refusal text, p_job uuid, p_reserved numeric default 0
) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_day date := public.ai_day();
  v_cost numeric := case when coalesce(p_real, false) then greatest(coalesce(p_cost, 0), 0) else 0 end;
  v_reserved numeric := round(greatest(coalesce(p_reserved, 0), 0), 6);
begin
  perform public.ai_check_engine(p_engine);
  if p_mode is null or p_mode not in ('sync', 'batch')
     or p_outcome is null or p_outcome not in
       ('ok', 'retried_ok', 'invalid_output', 'provider_error', 'rate_limited', 'refused', 'org_limit') then
    raise exception 'Renglón de bitácora no válido' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('ai:' || v_day::text, 0));
  if v_cost > 0 then
    insert into public.ai_spend_day (day, spent_usd, cost_by_engine)
      values (v_day, v_cost, jsonb_build_object(p_engine, v_cost))
      on conflict (day) do update set
        spent_usd = public.ai_spend_day.spent_usd + v_cost,
        cost_by_engine = jsonb_set(
          public.ai_spend_day.cost_by_engine,
          array[p_engine],
          to_jsonb(coalesce((public.ai_spend_day.cost_by_engine ->> p_engine)::numeric, 0) + v_cost)
        );
    if p_user is not null then
      insert into public.ai_usage_day (day, user_id, engine, calls, cost_usd)
        values (v_day, p_user, p_engine, 0, v_cost)
        on conflict (day, user_id, engine)
        do update set cost_usd = public.ai_usage_day.cost_usd + v_cost;
    end if;
  end if;
  if p_user is not null and v_reserved > 0 then
    update public.ai_usage_day set
        reserved_usd = greatest(reserved_usd - v_reserved, 0),
        reserved_since = case when reserved_usd > v_reserved then reserved_since else null end
      where day = v_day and user_id = p_user and engine = p_engine and reserved_usd > 0;
  end if;
  insert into public.ai_call_log (
    user_id, engine, model, ok, real, input_tokens, output_tokens, cost_usd, latency_ms,
    mode, outcome, cache_read_tokens, cache_write_tokens, prompt_version, refusal_category, job_id
  ) values (
    p_user, p_engine, left(p_model, 80), coalesce(p_ok, false), coalesce(p_real, false),
    greatest(p_input, 0), greatest(p_output, 0), v_cost, greatest(p_latency, 0),
    p_mode, p_outcome, greatest(p_cache_read, 0), greatest(p_cache_write, 0),
    left(p_prompt_version, 40), left(p_refusal, 40), p_job
  );
end;
$$;

-- ===================================================================== Reporte de costos del admin
-- El costo de la nube entre dos días de México. Total, por motor, por modo y por resultado, los
-- alumnos distintos, el costo por alumno al mes (media, p50 y p90, solo alumnos, sin el equipo) y los
-- alumnos de pago de hoy. Hasta un año por consulta. Sin nombres ni correos, solo números
create or replace function public.admin_ai_cost_report(p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_months numeric;
  v_report jsonb;
begin
  if not public.is_admin() then
    raise exception 'Solo un administrador ve el costo de la IA' using errcode = '42501';
  end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 366 then
    raise exception 'El periodo va de una fecha a otra, de hasta un año' using errcode = '22023';
  end if;
  v_months := (p_to - p_from + 1)::numeric / 30;

  with rows_ as (
    select
      l.user_id,
      l.engine,
      coalesce(l.mode, 'sync') as mode,
      coalesce(l.outcome, case when l.ok then 'ok' else 'provider_error' end) as outcome,
      l.cost_usd as cost
    from public.ai_call_log l
    where (l.at at time zone 'America/Mexico_City')::date between p_from and p_to
  ),
  per_student as (
    select r.user_id, sum(r.cost) / v_months as monthly
    from rows_ r
    left join public.user_roles ur on ur.user_id = r.user_id
    where r.user_id is not null and coalesce(ur.role, 'student') = 'student'
    group by r.user_id
  )
  select jsonb_build_object(
    'from', p_from::text,
    'to', p_to::text,
    'calls', (select count(*) from rows_),
    'totalUsd', (select coalesce(sum(cost), 0) from rows_),
    'byEngine', (
      select coalesce(jsonb_object_agg(engine, jsonb_build_object('calls', calls, 'costUsd', cost)), '{}'::jsonb)
      from (select engine, count(*) as calls, sum(cost) as cost from rows_ group by engine) e
    ),
    'byMode', (
      select coalesce(jsonb_object_agg(mode, jsonb_build_object('calls', calls, 'costUsd', cost)), '{}'::jsonb)
      from (select mode, count(*) as calls, sum(cost) as cost from rows_ group by mode) m
    ),
    'byOutcome', (
      select coalesce(jsonb_object_agg(outcome, calls), '{}'::jsonb)
      from (select outcome, count(*) as calls from rows_ group by outcome) o
    ),
    'users', (select count(distinct user_id) from rows_ where user_id is not null),
    'students', (select count(*) from per_student),
    'perStudentMonthlyUsd', (
      select jsonb_build_object(
        'mean', round(coalesce(avg(monthly), 0)::numeric, 6),
        'p50', round(coalesce(percentile_cont(0.5) within group (order by monthly), 0)::numeric, 6),
        'p90', round(coalesce(percentile_cont(0.9) within group (order by monthly), 0)::numeric, 6)
      )
      from per_student
    ),
    'paidStudentsToday', (
      select count(*) from auth.users u
      left join public.user_roles ur on ur.user_id = u.id
      where coalesce(ur.role, 'student') = 'student' and public.user_plan(u.id) <> 'free'
    )
  ) into v_report;
  return v_report;
end;
$$;

-- ===================================================================== Permisos
-- ai_whoami y el reporte con sesión, que revisan por dentro. El libro, solo con la llave de servicio
revoke all on function public.ai_whoami() from public, anon, authenticated, service_role;
grant execute on function public.ai_whoami() to authenticated;

revoke all on function public.ai_admit_v2(uuid, text, boolean, integer, numeric, numeric, numeric, text, integer, integer, numeric)
  from public, anon, authenticated, service_role;
grant execute on function public.ai_admit_v2(uuid, text, boolean, integer, numeric, numeric, numeric, text, integer, integer, numeric)
  to service_role;

revoke all on function public.ai_release_v2(uuid, text, text, numeric) from public, anon, authenticated, service_role;
grant execute on function public.ai_release_v2(uuid, text, text, numeric) to service_role;

revoke all on function public.ai_settle_v2(uuid, text, text, boolean, boolean, numeric, integer, integer, integer, integer, integer, text, text, text, text, uuid, numeric)
  from public, anon, authenticated, service_role;
grant execute on function public.ai_settle_v2(uuid, text, text, boolean, boolean, numeric, integer, integer, integer, integer, integer, text, text, text, text, uuid, numeric)
  to service_role;

revoke all on function public.admin_ai_cost_report(date, date) from public, anon, authenticated, service_role;
grant execute on function public.admin_ai_cost_report(date, date) to authenticated;
