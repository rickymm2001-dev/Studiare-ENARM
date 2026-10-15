-- IA real, cola de trabajos por lote (B12, 3.4 y 6.2 del plan de B12).
--
-- Qué agrega
--   - ai_jobs, una fila por trabajo de Message Batches (hipótesis de olvidos y, desde B14,
--     reestructuradas de noche). Guarda la entrada solo mientras hace falta y la salida 14 días
--   - ai_batches, los lotes mandados a Anthropic y su estado
--   - ai_tick_lease, el candado de un solo ciclo de lotes a la vez
--   - Las funciones de la cola que usa la Edge Function ai-batch y ai-proxy con la llave de servicio,
--     ai_usage_summary_v2 con los pendientes, y ai_tick_secret_ok, que compara el encabezado de
--     pg_cron contra el secreto ai_tick_secret de Vault
--
-- Reglas (las mismas que MemoryJobStore de supabase/functions/_shared/ai/testing/memory.ts)
--   - Encolar es idempotente. Un trabajo activo con la misma llave se devuelve tal cual. Uno listo
--     de menos de 7 días con la misma entrada, el mismo prompt y el mismo modelo se reusa sin costo,
--     también con otra llave, como otro dispositivo de la misma cuenta. Hasta p_max_pending activos
--   - attempts cuenta los envíos. invalid_output, expired y canceled tienen 2 intentos y errored 3.
--     Con el tope, el trabajo queda failed
--   - Un lote procesado devuelve a la cola, como expired, los trabajos que se quedaron sin resultado
--   - La limpieza no borra filas. Pone en null la entrada de lo terminado y la salida 14 días después
--     de entregada o fallida. Las filas se van con la cuenta, en cascada
--
-- Borrar mis datos con los trabajos va en la pieza 4 de supabase/manual/ejecutar-en-sql-editor.sql
-- (D-113). Ninguna tabla tiene políticas. Las lee y escribe solo la función con la llave de servicio
--
-- Es idempotente, no lleva delete ni drop y no edita las migraciones anteriores (D-113). Va después
-- de 20261026000001_ai_proxy_v2.sql

-- ===================================================================== Tablas
create table if not exists public.ai_jobs (
  id uuid primary key default gen_random_uuid(),
  -- El orden de creación, para elegir la más nueva de una llave aunque dos nazcan en el mismo instante
  seq bigint generated always as identity,
  -- null solo en una reestructurada de sistema (B14)
  user_id uuid references auth.users (id) on delete cascade,
  engine text not null check (engine in ('forgetting', 'restructure')),
  job_key text not null check (job_key ~ '^[a-z0-9_-]{8,64}$'),
  input jsonb,
  input_hash text not null check (input_hash ~ '^[0-9a-f]{64}$'),
  prompt_version text not null check (char_length(prompt_version) <= 40),
  model text not null check (char_length(model) <= 80),
  status text not null default 'queued'
    check (status in ('queued', 'submitting', 'submitted', 'ready', 'failed')),
  attempts integer not null default 0 check (attempts >= 0),
  issues text[] not null default '{}',
  claim_id uuid,
  claimed_at timestamptz,
  batch_id text,
  estimated_cost_usd numeric(14, 6),
  output jsonb,
  -- Lo que ve la app de la llamada (AiCallMetaSchema), sin texto
  meta jsonb,
  error text,
  cost_usd numeric(14, 6) not null default 0 check (cost_usd >= 0),
  created_at timestamptz not null default now(),
  submitted_at timestamptz,
  finished_at timestamptz,
  delivered_at timestamptz,
  check (user_id is not null or engine = 'restructure')
);
create unique index if not exists ai_jobs_active_key on public.ai_jobs (user_id, engine, job_key)
  where status in ('queued', 'submitting', 'submitted');
create index if not exists ai_jobs_user_key on public.ai_jobs (user_id, job_key, seq desc);
create index if not exists ai_jobs_queue on public.ai_jobs (status, created_at)
  where status in ('queued', 'submitting', 'submitted');
create index if not exists ai_jobs_batch on public.ai_jobs (batch_id) where batch_id is not null;

create table if not exists public.ai_batches (
  id text primary key check (char_length(id) between 1 and 200),
  status text not null check (status in ('in_progress', 'canceling', 'ended', 'processed')),
  request_count integer not null check (request_count >= 0),
  created_at timestamptz not null default now(),
  last_polled_at timestamptz,
  ended_at timestamptz,
  processed_at timestamptz,
  deleted_remote_at timestamptz
);

create table if not exists public.ai_tick_lease (
  id boolean primary key default true check (id),
  holder uuid,
  until timestamptz
);

alter table public.ai_jobs enable row level security;
alter table public.ai_batches enable row level security;
alter table public.ai_tick_lease enable row level security;
revoke all on public.ai_jobs, public.ai_batches, public.ai_tick_lease from anon, authenticated;

-- ===================================================================== Cómo se ven las filas
-- Un trabajo como lo devuelven ai_job_enqueue y ai_job_status (JobStatusRow del núcleo)
create or replace function public.ai_job_row_json(j public.ai_jobs) returns jsonb
language sql immutable set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'jobKey', j.job_key,
    'engine', j.engine,
    'status', j.status,
    'output', j.output,
    'meta', j.meta,
    'error', j.error,
    'queuedAt', to_char(j.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'readyAt', case when j.finished_at is null then null
      else to_char(j.finished_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') end
  )
$$;

-- Un trabajo listo para mandarse o para validarse contra su entrada (StoredJob del núcleo)
create or replace function public.ai_job_stored_json(j public.ai_jobs) returns jsonb
language sql immutable set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'id', j.id,
    'userId', j.user_id,
    'engine', j.engine,
    'jobKey', j.job_key,
    'input', j.input,
    'model', j.model,
    'promptVersion', j.prompt_version,
    'attempts', j.attempts,
    'issues', to_jsonb(j.issues)
  )
$$;

-- ===================================================================== Encolar
create or replace function public.ai_job_enqueue(
  p_user uuid, p_engine text, p_job_key text, p_input jsonb, p_input_hash text,
  p_prompt_version text, p_model text, p_max_pending integer
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_job public.ai_jobs%rowtype;
  v_ready public.ai_jobs%rowtype;
  v_pending integer;
begin
  if p_engine is null or p_engine not in ('forgetting', 'restructure')
     or p_job_key is null or p_job_key !~ '^[a-z0-9_-]{8,64}$'
     or p_input_hash is null or p_input_hash !~ '^[0-9a-f]{64}$'
     or p_prompt_version is null or p_model is null
     or coalesce(p_max_pending, 0) < 1
     or (p_user is null and p_engine <> 'restructure') then
    raise exception 'Trabajo de IA no válido' using errcode = '22023';
  end if;
  -- Dos peticiones a la vez del mismo alumno esperan su turno, así el tope no se burla
  perform pg_advisory_xact_lock(hashtextextended('aijob:' || coalesce(p_user::text, 'sistema'), 0));

  select * into v_job from public.ai_jobs
    where user_id is not distinct from p_user and engine = p_engine and job_key = p_job_key
      and status in ('queued', 'submitting', 'submitted');
  if found then
    return jsonb_build_object('outcome', 'existing', 'job', public.ai_job_row_json(v_job));
  end if;

  select * into v_ready from public.ai_jobs
    where user_id is not distinct from p_user and engine = p_engine and status = 'ready'
      and input_hash = p_input_hash and prompt_version = p_prompt_version and model = p_model
      and output is not null and finished_at > now() - interval '7 days'
    order by (job_key = p_job_key) desc, finished_at desc, seq desc
    limit 1;
  if found then
    if v_ready.job_key = p_job_key then
      return jsonb_build_object('outcome', 'reused', 'job', public.ai_job_row_json(v_ready));
    end if;
    -- Otra llave con la misma entrada, como otro dispositivo de la cuenta. Se copia la salida
    insert into public.ai_jobs (
      user_id, engine, job_key, input, input_hash, prompt_version, model, status, output, meta,
      cost_usd, finished_at
    ) values (
      p_user, p_engine, p_job_key, null, p_input_hash, p_prompt_version, p_model, 'ready',
      v_ready.output, v_ready.meta, 0, now()
    ) returning * into v_job;
    return jsonb_build_object('outcome', 'reused', 'job', public.ai_job_row_json(v_job));
  end if;

  select count(*) into v_pending from public.ai_jobs
    where user_id is not distinct from p_user and status in ('queued', 'submitting', 'submitted');
  if v_pending >= p_max_pending then
    return jsonb_build_object('outcome', 'too_many_pending', 'job', null);
  end if;

  insert into public.ai_jobs (user_id, engine, job_key, input, input_hash, prompt_version, model)
    values (p_user, p_engine, p_job_key, p_input, p_input_hash, p_prompt_version, p_model)
    returning * into v_job;
  return jsonb_build_object('outcome', 'queued', 'job', public.ai_job_row_json(v_job));
end;
$$;

-- ===================================================================== Estado para la app
-- La más nueva de cada llave del alumno. Marca como entregadas las terminadas
create or replace function public.ai_job_status(p_user uuid, p_job_keys text[]) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_found jsonb;
begin
  if p_user is null or coalesce(cardinality(p_job_keys), 0) > 20 then
    raise exception 'Consulta de trabajos no válida' using errcode = '22023';
  end if;
  with latest as (
    select distinct on (job_key) id
    from public.ai_jobs
    where user_id = p_user and job_key = any (coalesce(p_job_keys, '{}'))
    order by job_key, created_at desc, seq desc
  ),
  touched as (
    update public.ai_jobs j set delivered_at = now()
    from latest
    where j.id = latest.id and j.status in ('ready', 'failed') and j.delivered_at is null
    returning j.id
  )
  select coalesce(jsonb_agg(public.ai_job_row_json(j) order by j.job_key), '[]'::jsonb) into v_found
  from public.ai_jobs j join latest on latest.id = j.id;
  return v_found;
end;
$$;

-- ===================================================================== Reclamar y mandar
-- Pasa hasta p_limit trabajos de queued a submitting con un mismo claim_id, sin que dos ciclos tomen
-- el mismo
create or replace function public.ai_jobs_claim(p_limit integer) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_claim uuid := gen_random_uuid();
  v_jobs jsonb;
begin
  if coalesce(p_limit, 0) < 1 or p_limit > 100000 then
    raise exception 'Límite de reclamo no válido' using errcode = '22023';
  end if;
  with picked as (
    select id from public.ai_jobs
    where status = 'queued'
    order by created_at, seq
    limit p_limit
    for update skip locked
  ),
  claimed as (
    update public.ai_jobs j
      set status = 'submitting', claim_id = v_claim, claimed_at = now()
    from picked where j.id = picked.id
    returning j.*
  )
  select coalesce(jsonb_agg(public.ai_job_stored_json(c) order by c.created_at, c.seq), '[]'::jsonb)
    into v_jobs from claimed c;
  return jsonb_build_object('claimId', v_claim, 'jobs', v_jobs);
end;
$$;

-- El lote ya existe en Anthropic. Los trabajos del reclamo con estimación quedan submitted y cuentan
-- un intento. Los demás no cupieron en el presupuesto y vuelven a la cola sin contar intento
create or replace function public.ai_jobs_submitted(p_claim uuid, p_batch_id text, p_estimates jsonb)
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_count integer;
begin
  if p_claim is null or p_batch_id is null or p_estimates is null or jsonb_typeof(p_estimates) <> 'object' then
    raise exception 'Lote no válido' using errcode = '22023';
  end if;
  update public.ai_jobs
    set status = 'submitted', batch_id = p_batch_id, submitted_at = now(), attempts = attempts + 1,
        estimated_cost_usd = greatest((p_estimates ->> id::text)::numeric, 0)
    where claim_id = p_claim and status = 'submitting' and p_estimates ? id::text;
  get diagnostics v_count = row_count;
  update public.ai_jobs set status = 'queued', claim_id = null, claimed_at = null
    where claim_id = p_claim and status = 'submitting';
  insert into public.ai_batches (id, status, request_count)
    values (p_batch_id, 'in_progress', v_count)
    on conflict (id) do nothing;
end;
$$;

-- Crear el lote falló. Todo el reclamo vuelve a la cola sin contar intento
create or replace function public.ai_jobs_unclaim(p_claim uuid) returns void
language sql security definer set search_path = public, pg_temp as $$
  update public.ai_jobs set status = 'queued', claim_id = null, claimed_at = null
    where claim_id = p_claim and status = 'submitting';
$$;

-- Los reclamos que se quedaron en submitting, para reconocer su lote por custom_id
create or replace function public.ai_jobs_stale(p_min_minutes integer) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'claimId', claim_id,
      'claimedAt', to_char(claimed_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'jobIds', ids
    ) order by claimed_at), '[]'::jsonb)
  from (
    select claim_id, min(claimed_at) as claimed_at, jsonb_agg(id order by seq) as ids
    from public.ai_jobs
    where status = 'submitting' and claim_id is not null
      and claimed_at <= now() - make_interval(mins => greatest(coalesce(p_min_minutes, 0), 0))
    group by claim_id
  ) s;
$$;

-- ===================================================================== Sondear y recoger
-- Los lotes terminados sin procesar y los en curso que no se revisan hace p_min_minutes o más. A los
-- en curso les marca la consulta
create or replace function public.ai_batches_due(p_min_minutes integer) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_due jsonb;
begin
  with due as (
    select * from public.ai_batches
    where status = 'ended'
       or (status in ('in_progress', 'canceling')
           and coalesce(last_polled_at, created_at)
             <= now() - make_interval(mins => greatest(coalesce(p_min_minutes, 0), 0)))
    for update skip locked
  ),
  polled as (
    update public.ai_batches b set last_polled_at = now()
    from due where b.id = due.id and due.status <> 'ended'
    returning b.id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', id,
      'status', status,
      'requestCount', request_count,
      'createdAt', to_char(created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'lastPolledAt', case when last_polled_at is null then null
        else to_char(last_polled_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') end
    ) order by created_at), '[]'::jsonb)
    into v_due from due;
  return v_due;
end;
$$;

-- De esos ids, los que siguen esperando resultado en ese lote, con su entrada
create or replace function public.ai_jobs_pending(p_batch_id text, p_job_ids text[]) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(public.ai_job_stored_json(j) order by j.seq), '[]'::jsonb)
  from public.ai_jobs j
  where j.batch_id = p_batch_id and j.status = 'submitted'
    and j.id::text = any (coalesce(p_job_ids, '{}'));
$$;

-- Vuelve a la cola con lo que falló, o queda failed si ya no tiene intentos. Devuelve requeued o
-- failed. Solo toca un trabajo que espera resultado
create or replace function public.ai_job_requeue(p_job uuid, p_issues text[], p_reason text)
returns text
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_job public.ai_jobs%rowtype;
  v_cap integer;
begin
  v_cap := case p_reason
    when 'invalid_output' then 2 when 'errored' then 3 when 'expired' then 2 when 'canceled' then 2
  end;
  if v_cap is null then
    raise exception 'Motivo de reencolar no válido' using errcode = '22023';
  end if;
  select * into v_job from public.ai_jobs where id = p_job for update;
  if not found then
    return 'failed';
  end if;
  if v_job.status <> 'submitted' then
    return case when v_job.status = 'failed' then 'failed' else 'requeued' end;
  end if;
  if v_job.attempts >= v_cap then
    update public.ai_jobs
      set status = 'failed',
          error = case when p_reason = 'invalid_output' then 'invalid_output' else 'provider_error' end,
          finished_at = now(), input = null
      where id = p_job;
    return 'failed';
  end if;
  update public.ai_jobs
    set status = 'queued', issues = coalesce(p_issues, '{}'), claim_id = null, claimed_at = null,
        batch_id = null, submitted_at = null, estimated_cost_usd = null
    where id = p_job;
  return 'requeued';
end;
$$;

-- Cambia el estado de un lote. Con processed, lo que se quedó sin resultado vuelve como expired
create or replace function public.ai_batch_mark(p_batch_id text, p_status text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_job uuid;
begin
  if p_status is null or p_status not in ('in_progress', 'canceling', 'ended', 'processed') then
    raise exception 'Estado de lote no válido' using errcode = '22023';
  end if;
  update public.ai_batches
    set status = p_status,
        ended_at = case when p_status = 'ended' then coalesce(ended_at, now()) else ended_at end,
        processed_at = case when p_status = 'processed' then now() else processed_at end,
        deleted_remote_at = case when p_status = 'processed' then now() else deleted_remote_at end
    where id = p_batch_id;
  if p_status = 'processed' then
    for v_job in
      select id from public.ai_jobs where batch_id = p_batch_id and status = 'submitted' order by seq
    loop
      perform public.ai_job_requeue(v_job, array['El lote terminó sin resultado para este trabajo'], 'expired');
    end loop;
  end if;
end;
$$;

-- Guarda la salida o la falla y asienta su costo con mode batch. Solo una vez por trabajo
create or replace function public.ai_job_finish(
  p_job uuid, p_status text, p_output jsonb, p_error text, p_meta jsonb
) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_job public.ai_jobs%rowtype;
  v_real boolean := coalesce((p_meta ->> 'real')::boolean, false);
  v_cost numeric := case when coalesce((p_meta ->> 'real')::boolean, false)
    then greatest(coalesce((p_meta ->> 'costUsd')::numeric, 0), 0) else 0 end;
begin
  if p_status is null or p_status not in ('ready', 'failed')
     or (p_status = 'ready' and (p_output is null or p_meta -> 'callMeta' is null or jsonb_typeof(p_meta -> 'callMeta') <> 'object'))
     or (p_status = 'failed' and p_error is null) then
    raise exception 'Resultado de trabajo no válido' using errcode = '22023';
  end if;
  select * into v_job from public.ai_jobs where id = p_job for update;
  if not found or v_job.status <> 'submitted' then
    return;
  end if;
  update public.ai_jobs
    set status = p_status,
        output = case when p_status = 'ready' then p_output else null end,
        meta = case when p_status = 'ready' then p_meta -> 'callMeta' else null end,
        error = case when p_status = 'failed' then left(p_error, 40) else null end,
        cost_usd = v_cost,
        finished_at = now(),
        input = null
    where id = p_job;
  perform public.ai_settle_v2(
    v_job.user_id, v_job.engine, coalesce(p_meta ->> 'model', v_job.model), v_real,
    p_status = 'ready', v_cost,
    coalesce((p_meta ->> 'inputTokens')::integer, 0),
    coalesce((p_meta ->> 'outputTokens')::integer, 0),
    coalesce((p_meta ->> 'cacheReadTokens')::integer, 0),
    coalesce((p_meta ->> 'cacheWriteTokens')::integer, 0),
    coalesce((p_meta ->> 'latencyMs')::integer, 0),
    'batch',
    coalesce(p_meta ->> 'outcome', case when p_status = 'ready' then 'ok' else 'provider_error' end),
    coalesce(p_meta ->> 'promptVersion', v_job.prompt_version),
    p_meta ->> 'refusalCategory',
    v_job.id
  );
end;
$$;

-- ===================================================================== Limpieza sin borrar filas
create or replace function public.ai_jobs_scrub() returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_count integer;
begin
  update public.ai_jobs
    set input = case when status in ('ready', 'failed') then null else input end,
        output = case when coalesce(delivered_at, finished_at) < now() - interval '14 days' then null else output end
    where (status in ('ready', 'failed') and input is not null)
       or (output is not null and coalesce(delivered_at, finished_at) < now() - interval '14 days');
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- ===================================================================== Un solo ciclo a la vez
-- true si p_holder tomó el candado por p_seconds. Con 0 lo suelta
create or replace function public.ai_tick_lease_take(p_holder uuid, p_seconds integer) returns boolean
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if p_holder is null or p_seconds is null or p_seconds < 0 or p_seconds > 3600 then
    raise exception 'Candado no válido' using errcode = '22023';
  end if;
  insert into public.ai_tick_lease (id) values (true) on conflict (id) do nothing;
  update public.ai_tick_lease
    set holder = p_holder, until = now() + make_interval(secs => p_seconds)
    where id and (until is null or until <= now() or holder = p_holder);
  return found;
end;
$$;

-- El encabezado x-ai-tick de pg_cron contra el secreto ai_tick_secret de Vault. Lee Vault al
-- llamarse, así esta migración corre aunque Vault no exista, como en la base de las pruebas
create or replace function public.ai_tick_secret_ok(p_candidate text) returns boolean
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_secret text;
begin
  if p_candidate is null or char_length(p_candidate) < 32 or to_regclass('vault.decrypted_secrets') is null then
    return false;
  end if;
  execute 'select decrypted_secret from vault.decrypted_secrets where name = $1 limit 1'
    into v_secret using 'ai_tick_secret';
  return v_secret is not null and char_length(v_secret) >= 32 and v_secret = p_candidate;
end;
$$;

-- ===================================================================== Resumen del día v2
-- El de ai_usage_summary con los trabajos pendientes y el peor costo de lo que está en vuelo
create or replace function public.ai_usage_summary_v2() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_summary jsonb := public.ai_usage_summary();
begin
  return v_summary || jsonb_build_object(
    'pendingJobs', (select count(*) from public.ai_jobs where status in ('queued', 'submitting', 'submitted')),
    'inFlightUsd', (
      select coalesce(jsonb_object_agg(engine, cost), '{}'::jsonb)
      from (
        select engine, sum(coalesce(estimated_cost_usd, 0)) as cost
        from public.ai_jobs where status = 'submitted' group by engine
      ) f
    )
  );
end;
$$;

-- ===================================================================== Permisos
-- Todo solo con la llave de servicio. Las ayudas de forma no se exponen
do $$
declare
  v_sig text;
begin
  foreach v_sig in array array[
    'public.ai_job_row_json(public.ai_jobs)',
    'public.ai_job_stored_json(public.ai_jobs)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated, service_role', v_sig);
  end loop;
  foreach v_sig in array array[
    'public.ai_job_enqueue(uuid, text, text, jsonb, text, text, text, integer)',
    'public.ai_job_status(uuid, text[])',
    'public.ai_jobs_claim(integer)',
    'public.ai_jobs_submitted(uuid, text, jsonb)',
    'public.ai_jobs_unclaim(uuid)',
    'public.ai_jobs_stale(integer)',
    'public.ai_batches_due(integer)',
    'public.ai_jobs_pending(text, text[])',
    'public.ai_job_requeue(uuid, text[], text)',
    'public.ai_batch_mark(text, text)',
    'public.ai_job_finish(uuid, text, jsonb, text, jsonb)',
    'public.ai_jobs_scrub()',
    'public.ai_tick_lease_take(uuid, integer)',
    'public.ai_tick_secret_ok(text)',
    'public.ai_usage_summary_v2()'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated, service_role', v_sig);
    execute format('grant execute on function %s to service_role', v_sig);
  end loop;
end $$;
