-- Datos y modelo del alumno, parte 2. El corredor de la calibración nocturna (B14 del plan del cambio, PC
-- 5.5, 1.8 a 1.9, 3.2 a 3.5, 3.8 a 3.11 y 3.15 del plan de B14).
--
-- Cómo corre. La calibración corre en GitHub Actions con los mismos motores de la app (respuestas 85 a 88).
-- La base solo exporta páginas compactas y recibe resultados. Estas funciones son la única puerta. Son
-- security definer con search_path fijo, sin execute para la API ni para public, y solo las ejecuta la llave
-- secreta dedicada, que Supabase asocia al rol service_role. Una corrida pasa por calibration_begin,
-- calibration_bank y calibration_people, las páginas de calibration_answers, calibration_exposures,
-- calibration_activity y calibration_motives, calibration_label_pairs, las cinco calibration_publish_* y al
-- final calibration_finish
--
-- Reglas que se hacen cumplir aquí
--   - Una corrida a la vez, por el índice único de calibration_runs, y una que lleva más de 3 horas en
--     curso pasa a interrupted. enabled en false da skipped con disabled y no lee nada. Forzar dry_run gana
--     al modo apply del ajuste, y nunca al revés
--   - Al corredor solo viajan seudónimos de esa corrida, ids del banco, claves de la taxonomía, números y la
--     especialidad objetivo. Nunca texto de preguntas, alias, correos ni ids de cuenta. Las funciones de
--     exportación nunca devuelven texto del banco. Solo versiones aprobadas del banco, sin las de la demo
--   - Una respuesta cuenta solo si el alumno pidió esa versión al servidor, es decir, si hay un bank_reads suyo
--     de esa versión ese día de estudio o antes. Lo que inventa un cliente sin pedir la pregunta no entra. El
--     acierto no se toma de lo que sube el cliente, sale de la opción que eligió y de cuál es la correcta
--   - Los payload de la bitácora los escribe cualquier alumno con su sesión, así que cada campo se lee solo si
--     tiene la forma esperada. Un evento mal formado se deja fuera, no tira la corrida
--   - Las funciones de exportación, las que guardan filas y la que cierra y aplica llevan statement_timeout
--     de 50 s. Por la API, el rol de servicio hereda 8 s y lo más que se puede configurar es 60. Las
--     páginas son de hasta 20,000 filas
--   - Una corrida se publica completa o no se publica. Los resultados se guardan aparte en las tablas de la
--     corrida y calibration_finish los aplica en una sola transacción, solo en modo apply y con estado ok o
--     partial. Al cerrar, en cualquier modo, borra la sal y pone finished_at
--   - Un seudónimo es el hash de una sal que vive solo en calibration_runs y se pone en null al cerrar
--   - Ninguna celda de comparación sale con menos de minGroupSize alumnos, que nunca baja de 30
--   - Aplicar. calibration_finish escribe calibration en question_catalog solo para la versión publicada y
--     solo sube el seq cuando algo cambia de verdad, el estado, la dificultad se mueve 0.10 o más, el error
--     estándar 0.05 o más, la marca de extrema, o la variante queda lista para el examen. Así las apps no bajan
--     el catálogo entero cada noche. Pone exam_eligible en true en las variantes listas y nunca lo regresa a
--     false. Llama a upsert_distractor_stats de B11 con las opciones de las versiones publicadas y deja un
--     correo distractor_flags por médico con marcas nuevas esa noche, con las claves de las preguntas y sin
--     texto ni alumnos. B15 lo envía. Apunta model_publication a la corrida
--
-- Es idempotente, no quita ni borra nada de lo que ya existe y no edita las migraciones anteriores (D-113).
-- Va después de 20261028000001_model_core.sql

-- ===================================================================== Tipo de correo
-- El resumen de opciones que casi nadie elige, al médico que revisa. La plantilla vive en
-- supabase/functions/_shared/email.ts y B15 lo envía
insert into public.email_kinds (kind, description) values
  ('distractor_flags', 'Opciones que casi nadie elige en preguntas que revisa el médico, una vez al día (B14)')
  on conflict (kind) do nothing;

-- ===================================================================== Ayudas internas
-- Palabras de un texto, como las cuenta la app. Solo se cuentan, el texto nunca sale
create or replace function public.calibration_words(p_text text) returns integer
language sql immutable set search_path = public, pg_temp as $$
  select case when btrim(coalesce(p_text, '')) = '' then 0
    else cardinality(regexp_split_to_array(btrim(p_text), '\s+')) end
$$;

-- El día de estudio de un instante, con corte a las 4 a. m. de Mérida
create or replace function public.calibration_study_day(p_at timestamptz) returns date
language sql immutable set search_path = public, pg_temp as $$
  select ((p_at at time zone 'America/Merida') - interval '4 hours')::date
$$;

-- La corrida en curso. Lanza si no existe o ya cerró, porque sin su sal los seudónimos no se pueden dar
create or replace function public.calibration_run_row(p_run uuid) returns public.calibration_runs
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_run public.calibration_runs%rowtype;
begin
  select * into v_run from public.calibration_runs where id = p_run;
  if not found or v_run.status <> 'running' then
    raise exception 'La corrida no está en curso' using errcode = '22023';
  end if;
  return v_run;
end;
$$;

-- El acuerdo de los pares de etiquetas cerradas de B11, con la misma fórmula que bias_agreement_summary
-- (que pide sesión y por eso no se puede llamar desde el corredor) y los mismos pares que
-- editor_label_pairs. Devuelve los pares, el acuerdo observado, el esperado por azar y kappa
create or replace function public.calibration_label_kappa()
returns table (pairs integer, observed numeric, expected numeric, kappa numeric)
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_pairs integer;
  v_observed numeric;
  v_expected numeric;
  v_kappa numeric;
begin
  select count(*), avg(case when l.author_tag = l.tag then 1 else 0 end) into v_pairs, v_observed
    from public.bias_labels l
    join public.questions q on q.id = l.question_version_id
    where l.author_tag is not null and l.locked_at is not null and q.author_id is distinct from l.labeler_id;
  if v_pairs > 0 then
    with p as (
      select l.author_tag, l.tag from public.bias_labels l
      join public.questions q on q.id = l.question_version_id
      where l.author_tag is not null and l.locked_at is not null and q.author_id is distinct from l.labeler_id
    )
    select sum((a.n::numeric / v_pairs) * (coalesce(b.n, 0)::numeric / v_pairs)) into v_expected
      from (select author_tag as category, count(*) as n from p group by author_tag) a
      left join (select tag as category, count(*) as n from p group by tag) b on b.category = a.category;
    if 1 - v_expected >= 1e-12 then
      v_kappa := (v_observed - v_expected) / (1 - v_expected);
    end if;
  end if;
  return query select v_pairs, v_observed, v_expected, v_kappa;
end;
$$;

-- ===================================================================== Empezar una corrida
-- Crea la corrida con su corte (el seq más alto de la bitácora en este momento), su día de estudio, su sal
-- y su modo, y devuelve los ajustes. Si la calibración está apagada o ya hay una corrida en curso, deja una
-- corrida skipped con su motivo y no lee nada. p_runner solo conserva el número de la corrida de GitHub
-- (runId) y el commit (sha). Devuelve runId, status, reason, mode, studyDay, asOfSeq, settings y counts
create or replace function public.calibration_begin(p_trigger text, p_force_dry_run boolean, p_runner jsonb)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_settings jsonb;
  v_runner jsonb := '{}'::jsonb;
  v_reason text;
  v_mode text;
  v_day date := public.study_day();
  v_cut bigint;
  v_run uuid;
  v_consenters integer;
begin
  if p_trigger is null or p_trigger not in ('schedule', 'manual', 'selftest') then
    raise exception 'Disparador de la calibración desconocido' using errcode = '22023';
  end if;
  if jsonb_typeof(p_runner) = 'object' then
    if (p_runner ->> 'runId') ~ '^[0-9]{1,20}$' then
      v_runner := v_runner || jsonb_build_object('runId', p_runner ->> 'runId');
    end if;
    if (p_runner ->> 'sha') ~ '^[0-9a-f]{7,64}$' then
      v_runner := v_runner || jsonb_build_object('sha', p_runner ->> 'sha');
    end if;
  end if;

  -- Una corrida que lleva más de 3 horas en curso se dio por perdida
  update public.calibration_runs
    set status = 'interrupted', reason = 'timeout', finished_at = now(), salt = null
    where status = 'running' and started_at < now() - interval '3 hours';

  v_settings := public.model_settings_json();
  v_reason := case
    when not exists (select 1 from public.platform_settings where key = 'model_settings') then 'not_configured'
    when (v_settings #>> '{calibration,enabled}') <> 'true' then 'disabled'
    when exists (select 1 from public.calibration_runs where status = 'running') then 'running'
  end;
  if v_reason is not null then
    insert into public.calibration_runs (run_trigger, mode, status, reason, study_day, runner, finished_at)
      values (p_trigger, 'dry_run', 'skipped', v_reason, v_day, v_runner, now())
      returning id into v_run;
    return jsonb_build_object('runId', v_run, 'status', 'skipped', 'reason', v_reason, 'mode', 'dry_run',
      'studyDay', to_char(v_day, 'YYYY-MM-DD'), 'asOfSeq', null, 'settings', null, 'counts', '{}'::jsonb);
  end if;

  v_mode := case
    when coalesce(p_force_dry_run, false) or (v_settings #>> '{calibration,mode}') <> 'apply' then 'dry_run'
    else 'apply' end;
  select coalesce(max(seq), 0) into v_cut from public.events;
  begin
    insert into public.calibration_runs (run_trigger, mode, status, as_of_seq, study_day, salt, runner)
      values (
        p_trigger, v_mode, 'running', v_cut, v_day,
        decode(replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), 'hex'), v_runner
      )
      returning id into v_run;
  exception when unique_violation then
    -- Otra llamada empezó una corrida entre la revisión y el insert
    insert into public.calibration_runs (run_trigger, mode, status, reason, study_day, runner, finished_at)
      values (p_trigger, 'dry_run', 'skipped', 'running', v_day, v_runner, now())
      returning id into v_run;
    return jsonb_build_object('runId', v_run, 'status', 'skipped', 'reason', 'running', 'mode', 'dry_run',
      'studyDay', to_char(v_day, 'YYYY-MM-DD'), 'asOfSeq', null, 'settings', null, 'counts', '{}'::jsonb);
  end;
  select count(*) into v_consenters from public.calibration_consenters(v_cut);
  update public.calibration_runs set counts = jsonb_build_object('consenters', v_consenters) where id = v_run;

  return jsonb_build_object(
    'runId', v_run, 'status', 'running', 'reason', null, 'mode', v_mode,
    'studyDay', to_char(v_day, 'YYYY-MM-DD'), 'asOfSeq', v_cut,
    'settings', jsonb_build_object(
      'model', v_settings,
      -- Los umbrales que el admin cambió, solo grupos con números. La app los suma a los de fábrica
      'thresholds', coalesce((
        select jsonb_object_agg(g.key, (
          select coalesce(jsonb_object_agg(f.key, f.value), '{}'::jsonb)
          from jsonb_each(g.value) f where jsonb_typeof(f.value) = 'number'))
        from public.platform_settings s, jsonb_each(s.value -> 'thresholds') g
        where s.key = 'admin_overrides' and jsonb_typeof(s.value -> 'thresholds') = 'object'
          and jsonb_typeof(g.value) = 'object'
      ), '{}'::jsonb)
    ),
    'counts', jsonb_build_object('consenters', v_consenters)
  );
end;
$$;

-- ===================================================================== Exportar
-- El banco de la corrida, sin texto. Las versiones aprobadas con su rama, su tema, su idioma, la dificultad
-- del médico, el número de palabras del caso, la viñeta y la pregunta, su set canónico (ids estables), sus
-- opciones con su id estable, si es la correcta, su etiqueta de sesgo y sus palabras, y la calibración que
-- leen hoy los alumnos (prev). Nunca el enunciado, las opciones, la explicación ni las justificaciones
create or replace function public.calibration_bank(p_run uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp set statement_timeout = '50s' as $$
declare
  v_run public.calibration_runs%rowtype := public.calibration_run_row(p_run);
  v_published uuid;
begin
  select run_id into v_published from public.model_publication where id;
  return jsonb_build_object('items', coalesce((
    select jsonb_agg(s.item order by s.item ->> 'v')
    from (
      select jsonb_build_object(
        'v', q.id,
        'vUlid', public.uuid_to_ulid(q.id),
        'q', q.question_id,
        'branch', q.branch,
        'topic', q.topic,
        'subtopic', coalesce(q.subtopic, ''),
        'lang', q.language,
        'physician', coalesce(q.difficulty, 3),
        'variantOf', q.variant_of,
        'words', public.calibration_words(c.vignette) + public.calibration_words(q.body ->> 'vignette')
          + public.calibration_words(q.body ->> 'prompt'),
        'current', coalesce(r.published_version_id = q.id, false),
        'canonical', (
          select coalesce(jsonb_agg(coalesce(o.option_id, o.id) order by coalesce(o.option_id, o.id)), '[]'::jsonb)
          from public.question_options o
          where o.question_version_id = q.id and o.id = any (q.canonical_option_ids)),
        'options', (
          select coalesce(jsonb_agg(jsonb_build_object(
            'o', coalesce(o.option_id, o.id),
            'ovUlid', public.uuid_to_ulid(o.id),
            'correct', o.is_correct,
            'tag', case when o.is_correct then null else o.bias_tag end,
            'w', public.calibration_words(o.text)
          ) order by o.position nulls last, o.id), '[]'::jsonb)
          from public.question_options o where o.question_version_id = q.id),
        'prev', (
          select jsonb_build_object('d', ic.difficulty, 'se', ic.se, 'st', ic.state)
          from public.item_calibrations ic where ic.run_id = v_published and ic.version_id = q.id)
      ) as item
      from public.questions q
      join public.bank_questions r on r.question_id = q.question_id
      left join public.clinical_cases c on c.id = q.case_id
      where q.editorial_status = 'approved' and not q.is_demo
    ) s
  ), '[]'::jsonb));
end;
$$;

-- Los alumnos con permiso vigente al corte, con su seudónimo y su especialidad objetivo. Nada más de la
-- cuenta. Sin especialidad elegida, o con Todavía no lo decido, va null
create or replace function public.calibration_people(p_run uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp set statement_timeout = '50s' as $$
declare
  v_run public.calibration_runs%rowtype := public.calibration_run_row(p_run);
begin
  return jsonb_build_object('people', coalesce((
    select jsonb_agg(jsonb_build_array(s.person, s.specialty) order by s.person)
    from (
      select public.calibration_hash(v_run.salt, u.user_id::text) as person,
             case when a.target_specialty is null or a.target_specialty = 'undecided' then null
                  else a.target_specialty end as specialty
      from public.calibration_consenters(v_run.as_of_seq) u
      left join public.private_accounts a on a.user_id = u.user_id
    ) s
  ), '[]'::jsonb));
end;
$$;

-- Una página de respuestas, en orden de seq, de los alumnos con permiso. Cada fila es seudónimo, sesión
-- seudónima, uuid de la versión, uuid estable de la opción elegida, acierto (1 o 0), tipo de sesión
-- (practice, exam, challenge o null), días de estudio antes del corte, minuto de la sesión, milisegundos,
-- confianza, cambios de respuesta y seq. next es el último seq revisado, done si no hay más después y
-- dropped cuántos eventos de la página se dejaron fuera por no cumplir la defensa contra datos falsos o
-- por venir mal formados
create or replace function public.calibration_answers(
  p_run uuid, p_after bigint default 0, p_limit integer default 20000
) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp set statement_timeout = '50s' as $$
declare
  v_run public.calibration_runs%rowtype := public.calibration_run_row(p_run);
  v_after bigint := greatest(coalesce(p_after, 0), 0);
  v_limit integer := least(greatest(coalesce(p_limit, 20000), 1), 50000);
  v_rows jsonb;
  v_next bigint;
  v_raw integer;
begin
  with consenters as materialized (
    select user_id from public.calibration_consenters(v_run.as_of_seq)
  ),
  bank as materialized (
    select q.id as version_id, q.question_id, public.uuid_to_ulid(q.id) as vulid
    from public.questions q join public.bank_questions r on r.question_id = q.question_id
    where q.editorial_status = 'approved' and not q.is_demo
  ),
  opts as materialized (
    select public.uuid_to_ulid(o.id) as oulid, o.question_version_id as version_id,
           coalesce(o.option_id, o.id) as stable_id, o.is_correct
    from public.question_options o join bank b on b.version_id = o.question_version_id
  ),
  page as materialized (
    select e.seq, e.user_id, e.session_id, e.at, e.payload
    from public.events e
    where e.type = 'question_answered' and e.seq > v_after and e.seq <= v_run.as_of_seq
      and e.user_id in (select user_id from consenters)
    order by e.seq
    limit v_limit
  ),
  kept as (
    select p.seq, p.user_id, p.session_id, p.at, p.payload, b.version_id, o.stable_id, o.is_correct,
           ss.started_at, ss.kind
    from page p
    join bank b on b.vulid = upper(p.payload ->> 'questionVersionId')
    join opts o on o.version_id = b.version_id and o.oulid = upper(p.payload ->> 'optionVersionId')
    left join lateral (
      select s.at as started_at, s.payload ->> 'kind' as kind
      from public.events s
      where s.user_id = p.user_id and s.type = 'session_started' and s.session_id = p.session_id
        and s.seq <= p.seq
      order by s.seq desc
      limit 1
    ) ss on p.session_id is not null
    where exists (
      select 1 from public.bank_reads br
      where br.user_id = p.user_id and br.question_id = b.question_id and br.version_id = b.version_id
        and br.day <= public.calibration_study_day(p.at)
    )
  )
  select
    (select coalesce(jsonb_agg(jsonb_build_array(
        public.calibration_hash(v_run.salt, k.user_id::text),
        case when k.session_id is null then null
             else public.calibration_hash(v_run.salt, k.user_id::text || ':' || k.session_id) end,
        k.version_id,
        k.stable_id,
        case when k.is_correct then 1 else 0 end,
        case when k.kind in ('practice', 'exam', 'challenge') then k.kind else null end,
        greatest(0, v_run.study_day - public.calibration_study_day(k.at)),
        case when k.started_at is null then null
             else least(greatest(round(extract(epoch from (k.at - k.started_at)) / 60), 0), 1440)::integer end,
        case when jsonb_typeof(k.payload -> 'msToAnswer') = 'number'
             then least(greatest(round((k.payload ->> 'msToAnswer')::numeric), 0), 86400000)::bigint end,
        case when k.payload ->> 'confidence' in ('guessed', 'unsure', 'sure') then k.payload ->> 'confidence' end,
        case when jsonb_typeof(k.payload -> 'changeCount') = 'number'
             then least(greatest(floor((k.payload ->> 'changeCount')::numeric), 0), 50)::integer else 0 end,
        k.seq
      ) order by k.seq), '[]'::jsonb) from kept k),
    (select max(seq) from page),
    (select count(*) from page)
  into v_rows, v_next, v_raw;

  return jsonb_build_object(
    'rows', v_rows,
    'next', coalesce(v_next, v_after),
    'done', not exists (
      select 1 from public.events e
      where e.type = 'question_answered' and e.seq > coalesce(v_next, v_after) and e.seq <= v_run.as_of_seq
        and e.user_id in (select user_id from public.calibration_consenters(v_run.as_of_seq))
    ),
    'dropped', v_raw - jsonb_array_length(v_rows)
  );
end;
$$;

-- Una página de pantallas de opciones (question_shown) de los alumnos con permiso. Cada fila es seudónimo,
-- uuid de la versión, los ids estables de las opciones mostradas en el orden de su posición y seq
create or replace function public.calibration_exposures(
  p_run uuid, p_after bigint default 0, p_limit integer default 20000
) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp set statement_timeout = '50s' as $$
declare
  v_run public.calibration_runs%rowtype := public.calibration_run_row(p_run);
  v_after bigint := greatest(coalesce(p_after, 0), 0);
  v_limit integer := least(greatest(coalesce(p_limit, 20000), 1), 50000);
  v_rows jsonb;
  v_next bigint;
begin
  with consenters as materialized (
    select user_id from public.calibration_consenters(v_run.as_of_seq)
  ),
  bank as materialized (
    select q.id as version_id, public.uuid_to_ulid(q.id) as vulid
    from public.questions q join public.bank_questions r on r.question_id = q.question_id
    where q.editorial_status = 'approved' and not q.is_demo
  ),
  opts as materialized (
    select public.uuid_to_ulid(o.id) as oulid, o.question_version_id as version_id,
           coalesce(o.option_id, o.id) as stable_id
    from public.question_options o join bank b on b.version_id = o.question_version_id
  ),
  page as materialized (
    select e.seq, e.user_id, e.payload
    from public.events e
    where e.type = 'question_shown' and e.seq > v_after and e.seq <= v_run.as_of_seq
      and e.user_id in (select user_id from consenters)
    order by e.seq
    limit v_limit
  ),
  kept as (
    select p.seq, p.user_id, b.version_id, so.shown
    from page p
    join bank b on b.vulid = upper(p.payload ->> 'questionVersionId')
    cross join lateral (
      select jsonb_agg(oo.stable_id order by
          case when (s ->> 'position') ~ '^[0-9]{1,2}$' then (s ->> 'position')::integer else 99 end,
          oo.stable_id) as shown
      from jsonb_array_elements(
        case when jsonb_typeof(p.payload -> 'shownOptions') = 'array' then p.payload -> 'shownOptions'
             else '[]'::jsonb end) s
      join opts oo on oo.version_id = b.version_id and oo.oulid = upper(s ->> 'optionVersionId')
    ) so
    where so.shown is not null
  )
  select
    (select coalesce(jsonb_agg(jsonb_build_array(
        public.calibration_hash(v_run.salt, k.user_id::text), k.version_id, k.shown, k.seq
      ) order by k.seq), '[]'::jsonb) from kept k),
    (select max(seq) from page)
  into v_rows, v_next;

  return jsonb_build_object(
    'rows', v_rows,
    'next', coalesce(v_next, v_after),
    'done', not exists (
      select 1 from public.events e
      where e.type = 'question_shown' and e.seq > coalesce(v_next, v_after) and e.seq <= v_run.as_of_seq
        and e.user_id in (select user_id from public.calibration_consenters(v_run.as_of_seq))
    )
  );
end;
$$;

-- Repasos y respuestas por alumno y día de estudio, solo dentro de la ventana de la comparación, los
-- comparisonWindowDays días completos anteriores al corte. Cada fila es seudónimo, días antes del corte,
-- repasos y respuestas de ese día. La página sigue el orden de seudónimo y días. p_after es el next de la
-- página anterior, con la forma seudónimo:días
create or replace function public.calibration_activity(
  p_run uuid, p_after text default null, p_limit integer default 20000
) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp set statement_timeout = '50s' as $$
declare
  v_run public.calibration_runs%rowtype := public.calibration_run_row(p_run);
  v_limit integer := least(greatest(coalesce(p_limit, 20000), 1), 50000);
  v_window integer := (public.model_settings_json() #>> '{thresholds,comparisonWindowDays}')::integer;
  v_from timestamptz := ((v_run.study_day - v_window)::timestamp + interval '4 hours') at time zone 'America/Merida';
  v_to timestamptz := (v_run.study_day::timestamp + interval '4 hours') at time zone 'America/Merida';
  v_after_person text;
  v_after_days integer;
  v_rows jsonb;
  v_last_person text;
  v_last_days integer;
  v_fetched integer;
begin
  if p_after is not null and p_after <> '' then
    if p_after !~ '^[0-9a-f]{16}:[0-9]{1,3}$' then
      raise exception 'Cursor de actividad inválido' using errcode = '22023';
    end if;
    v_after_person := split_part(p_after, ':', 1);
    v_after_days := split_part(p_after, ':', 2)::integer;
  end if;

  -- Se piden limit + 1 filas. La de más solo sirve para saber si hay otra página
  with consenters as materialized (
    select user_id from public.calibration_consenters(v_run.as_of_seq)
  ),
  daily as (
    select public.calibration_hash(v_run.salt, e.user_id::text) as person,
           v_run.study_day - public.calibration_study_day(e.at) as days,
           count(*) filter (where e.type = 'card_reviewed') as reviews,
           count(*) filter (where e.type = 'question_answered') as answers
    from public.events e
    where e.user_id in (select user_id from consenters)
      and e.type in ('card_reviewed', 'question_answered')
      and e.seq <= v_run.as_of_seq
      and e.at >= v_from and e.at < v_to
    group by 1, 2
  ),
  fetched as materialized (
    select d.person, d.days, d.reviews, d.answers
    from daily d
    where v_after_person is null or (d.person, d.days) > (v_after_person, v_after_days)
    order by d.person, d.days
    limit v_limit + 1
  ),
  page as (
    select f.person, f.days, f.reviews, f.answers from fetched f order by f.person, f.days limit v_limit
  )
  select
    (select coalesce(jsonb_agg(jsonb_build_array(p.person, p.days, p.reviews, p.answers)
        order by p.person, p.days), '[]'::jsonb) from page p),
    (select p.person from page p order by p.person desc, p.days desc limit 1),
    (select p.days from page p order by p.person desc, p.days desc limit 1),
    (select count(*) from fetched)
  into v_rows, v_last_person, v_last_days, v_fetched;

  return jsonb_build_object(
    'rows', v_rows,
    'next', case when v_last_person is null then p_after else v_last_person || ':' || v_last_days end,
    'done', v_fetched <= v_limit
  );
end;
$$;

-- Una página de motivos de error (cause_reported) de los alumnos con permiso, en orden de seq. Cada fila es
-- seudónimo, días antes del corte, rama de la pregunta, el motivo guardado y 1 si el error cayó en el
-- último tercio de una sesión larga (más de fatigueMinSessionMinutes minutos y 6 respuestas o más), 0 si
-- no. Solo motivos de preguntas del banco y de la lista cerrada de motivos y causas, nunca texto
create or replace function public.calibration_motives(
  p_run uuid, p_after bigint default 0, p_limit integer default 20000
) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp set statement_timeout = '50s' as $$
declare
  v_run public.calibration_runs%rowtype := public.calibration_run_row(p_run);
  v_after bigint := greatest(coalesce(p_after, 0), 0);
  v_limit integer := least(greatest(coalesce(p_limit, 20000), 1), 50000);
  v_minutes numeric := public.bank_threshold('behavior', 'fatigueMinSessionMinutes', 30);
  v_rows jsonb;
  v_next bigint;
begin
  with consenters as materialized (
    select user_id from public.calibration_consenters(v_run.as_of_seq)
  ),
  bank as materialized (
    select q.id as version_id, q.question_id, q.branch, q.version, public.uuid_to_ulid(q.id) as vulid
    from public.questions q join public.bank_questions r on r.question_id = q.question_id
    where q.editorial_status = 'approved' and not q.is_demo
  ),
  by_question as materialized (
    select distinct on (b.question_id) b.question_id, public.uuid_to_ulid(b.question_id) as qulid, b.branch,
           (select array_agg(b2.vulid) from bank b2 where b2.question_id = b.question_id) as vulids
    from bank b order by b.question_id, b.version desc
  ),
  page as materialized (
    select e.seq, e.user_id, e.at, e.payload
    from public.events e
    where e.type = 'cause_reported' and e.seq > v_after and e.seq <= v_run.as_of_seq
      and e.user_id in (select user_id from consenters)
    order by e.seq
    limit v_limit
  ),
  reports as (
    select p.seq, p.user_id, p.at, p.payload ->> 'cause' as cause, q.branch, q.vulids
    from page p
    join by_question q on q.qulid = upper(p.payload ->> 'targetId')
                       or upper(p.payload ->> 'targetId') = any (q.vulids)
    where p.payload ->> 'targetKind' = 'question'
      and p.payload ->> 'cause' in (
        'knowledge', 'time', 'misinterpretation', 'superficial_reading', 'anxiety', 'overconfidence', 'fatigue',
        'not_studied', 'forgot', 'confused', 'misread', 'missed_detail', 'rushed_or_tired', 'changed_answer', 'other')
  ),
  placed as (
    select r.*, att.session_id, att.seq as attempt_seq, sess.started_at
    from reports r
    left join lateral (
      select a.session_id, a.seq
      from public.events a
      where a.user_id = r.user_id and a.type = 'question_answered' and a.seq < r.seq
        and upper(a.payload ->> 'questionVersionId') = any (r.vulids)
      order by a.seq desc
      limit 1
    ) att on true
    left join lateral (
      select s.at as started_at
      from public.events s
      where s.user_id = r.user_id and s.type = 'session_started' and s.session_id = att.session_id
        and s.seq <= att.seq
      order by s.seq desc
      limit 1
    ) sess on att.session_id is not null
  ),
  flagged as (
    select p.seq, p.user_id, p.at, p.cause, p.branch,
           coalesce((
             select count(*) >= 6
                    and max(extract(epoch from (a2.at - p.started_at)) / 60) > v_minutes
                    and count(*) filter (where a2.seq <= p.attempt_seq) > count(*) - floor(count(*) / 3.0)
             from public.events a2
             where a2.user_id = p.user_id and a2.type = 'question_answered' and a2.session_id = p.session_id
               and a2.seq <= v_run.as_of_seq
           ), false) as last_third
    from placed p
    where p.started_at is not null
    union all
    select p.seq, p.user_id, p.at, p.cause, p.branch, false from placed p where p.started_at is null
  )
  select
    (select coalesce(jsonb_agg(jsonb_build_array(
        public.calibration_hash(v_run.salt, f.user_id::text),
        greatest(0, v_run.study_day - public.calibration_study_day(f.at)),
        f.branch,
        f.cause,
        case when f.last_third then 1 else 0 end
      ) order by f.seq), '[]'::jsonb) from flagged f),
    (select max(seq) from page)
  into v_rows, v_next;

  return jsonb_build_object(
    'rows', v_rows,
    'next', coalesce(v_next, v_after),
    'done', not exists (
      select 1 from public.events e
      where e.type = 'cause_reported' and e.seq > coalesce(v_next, v_after) and e.seq <= v_run.as_of_seq
        and e.user_id in (select user_id from public.calibration_consenters(v_run.as_of_seq))
    )
  );
end;
$$;

-- Los pares de etiquetas cerradas de B11, un distractor por par, con el id estable de la opción y las
-- etiquetas del autor y del revisor. Nunca quiénes son los médicos
create or replace function public.calibration_label_pairs(p_run uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp set statement_timeout = '50s' as $$
declare
  v_run public.calibration_runs%rowtype := public.calibration_run_row(p_run);
begin
  return jsonb_build_object('pairs', coalesce((
    select jsonb_agg(jsonb_build_array(l.option_id, l.author_tag, l.tag) order by l.labeled_at, l.option_id)
    from public.bias_labels l
    join public.questions q on q.id = l.question_version_id
    where l.author_tag is not null and l.locked_at is not null and q.author_id is distinct from l.labeler_id
  ), '[]'::jsonb));
end;
$$;

-- ===================================================================== Publicar los resultados
-- Cada función guarda en las tablas de la corrida, por páginas, y es segura de repetir: lo que ya estaba
-- se queda. Nada se aplica al catálogo hasta calibration_finish. Una fila mal formada rechaza la página
-- completa con 22023

-- Una fila por versión con al menos un alumno. {v, students, difficulty, se, elo, eloResponses, state,
-- extreme, variantReady}. Devuelve cuántas filas guardó
create or replace function public.calibration_publish_items(p_run uuid, p_rows jsonb) returns integer
language plpgsql security definer set search_path = public, pg_temp set statement_timeout = '50s' as $$
declare
  v_run public.calibration_runs%rowtype := public.calibration_run_row(p_run);
  v_count integer;
begin
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 5000 then
    raise exception 'Se esperaba una lista de hasta 5000 filas' using errcode = '22023';
  end if;
  begin
    insert into public.item_calibrations
      (run_id, version_id, question_id, students, difficulty, se, elo, elo_responses, state, extreme, variant_ready)
    select p_run, r.v, q.question_id, r.students, r.difficulty, r.se, r.elo, coalesce(r."eloResponses", 0),
           r.state, coalesce(r.extreme, false), r."variantReady"
    from jsonb_to_recordset(p_rows) as r(
      v uuid, students integer, difficulty numeric, se numeric, elo numeric, "eloResponses" integer,
      state text, extreme boolean, "variantReady" boolean)
    join public.questions q on q.id = r.v
    on conflict (run_id, version_id) do nothing;
    get diagnostics v_count = row_count;
  exception when invalid_text_representation or numeric_value_out_of_range or check_violation
      or not_null_violation or invalid_parameter_value or datatype_mismatch then
    raise exception 'Una fila de dificultad es inválida' using errcode = '22023';
  end;
  return v_count;
end;
$$;

-- Exposiciones y elecciones por opción. {v, o, exposures, choices}. Devuelve cuántas filas guardó
create or replace function public.calibration_publish_options(p_run uuid, p_rows jsonb) returns integer
language plpgsql security definer set search_path = public, pg_temp set statement_timeout = '50s' as $$
declare
  v_run public.calibration_runs%rowtype := public.calibration_run_row(p_run);
  v_count integer;
begin
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 20000 then
    raise exception 'Se esperaba una lista de hasta 20000 filas' using errcode = '22023';
  end if;
  begin
    insert into public.option_calibrations (run_id, version_id, option_id, exposures, choices)
    select p_run, r.v, r.o, r.exposures, r.choices
    from jsonb_to_recordset(p_rows) as r(v uuid, o uuid, exposures integer, choices integer)
    join public.questions q on q.id = r.v
    on conflict (run_id, version_id, option_id) do nothing;
    get diagnostics v_count = row_count;
  exception when invalid_text_representation or numeric_value_out_of_range or check_violation
      or not_null_violation or invalid_parameter_value or datatype_mismatch then
    raise exception 'Una fila de opciones es inválida' using errcode = '22023';
  end;
  return v_count;
end;
$$;

-- La población de la noche. Un objeto con solo números, códigos y llaves de la taxonomía. Una cadena que no
-- sea un código, o una llave con espacios, rechaza todo
create or replace function public.calibration_publish_population(p_run uuid, p_data jsonb) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_run public.calibration_runs%rowtype := public.calibration_run_row(p_run);
begin
  if jsonb_typeof(p_data) <> 'object' or not public.model_json_numeric_only(p_data) then
    raise exception 'La población solo lleva números, códigos y llaves' using errcode = '22023';
  end if;
  insert into public.population_snapshots (run_id, data) values (p_run, p_data)
    on conflict (run_id) do nothing;
end;
$$;

-- Las celdas de la comparación. {cohort, key, metric, branch, students, cuts}. Se rechaza con 22023 una
-- fila con cortes y menos de minGroupSize alumnos, con otro número de cortes que 19, con cortes que bajan o
-- con valores que no son números finitos. Con menos alumnos se guarda con cuts null. Devuelve cuántas guardó
create or replace function public.calibration_publish_comparison(p_run uuid, p_rows jsonb) returns integer
language plpgsql security definer set search_path = public, pg_temp set statement_timeout = '50s' as $$
declare
  v_run public.calibration_runs%rowtype := public.calibration_run_row(p_run);
  v_min integer := (public.model_settings_json() #>> '{thresholds,minGroupSize}')::integer;
  v_row jsonb;
  v_cuts numeric[];
  v_value jsonb;
  v_count integer := 0;
  v_rows integer;
begin
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 2000 then
    raise exception 'Se esperaba una lista de hasta 2000 celdas' using errcode = '22023';
  end if;
  for v_row in select value from jsonb_array_elements(p_rows) loop
    if jsonb_typeof(v_row) <> 'object' then
      raise exception 'Una celda de comparación no es un objeto' using errcode = '22023';
    end if;
    v_cuts := null;
    if jsonb_typeof(v_row -> 'cuts') = 'array' then
      if jsonb_array_length(v_row -> 'cuts') <> 19 then
        raise exception 'Una celda debe traer 19 cortes' using errcode = '22023';
      end if;
      for v_value in select value from jsonb_array_elements(v_row -> 'cuts') loop
        if jsonb_typeof(v_value) <> 'number' then
          raise exception 'Los cortes deben ser números finitos' using errcode = '22023';
        end if;
      end loop;
      select array_agg((value #>> '{}')::numeric order by ordinality) into v_cuts
        from jsonb_array_elements(v_row -> 'cuts') with ordinality;
      if exists (
        select 1 from generate_subscripts(v_cuts, 1) i where i > 1 and v_cuts[i] < v_cuts[i - 1]
      ) then
        raise exception 'Los cortes no pueden bajar' using errcode = '22023';
      end if;
      if jsonb_typeof(v_row -> 'students') <> 'number' or (v_row ->> 'students')::numeric < v_min then
        raise exception 'Una celda con cortes necesita al menos % alumnos', v_min using errcode = '22023';
      end if;
    elsif v_row -> 'cuts' is not null and jsonb_typeof(v_row -> 'cuts') <> 'null' then
      raise exception 'Los cortes deben ser una lista o null' using errcode = '22023';
    end if;
    begin
      insert into public.comparison_cells (run_id, cohort, cohort_key, metric, branch, students, cuts)
      values (
        p_run, v_row ->> 'cohort', v_row ->> 'key', v_row ->> 'metric', v_row ->> 'branch',
        (v_row ->> 'students')::integer, v_cuts)
      on conflict (run_id, cohort, cohort_key, metric, branch) do nothing;
      get diagnostics v_rows = row_count;
    exception when invalid_text_representation or numeric_value_out_of_range or check_violation
        or not_null_violation or invalid_parameter_value then
      raise exception 'Una celda de comparación es inválida' using errcode = '22023';
    end;
    v_count := v_count + v_rows;
  end loop;
  return v_count;
end;
$$;

-- El acuerdo del etiquetado de la noche. {pairs, kappa, observed, expected, byTag}. Compara el kappa de la
-- noche con el que calcula la base con los mismos pares, como bias_agreement_summary de B11, y guarda
-- parity. Si difieren en más de 1e-6 (o los pares no coinciden) la paridad es falsa y calibration_finish
-- deja la corrida en partial. Devuelve { parity }
create or replace function public.calibration_publish_agreement(p_run uuid, p_data jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_run public.calibration_runs%rowtype := public.calibration_run_row(p_run);
  v_sql record;
  v_kappa numeric;
  v_pairs integer;
  v_parity boolean;
begin
  if jsonb_typeof(p_data) <> 'object' then
    raise exception 'El acuerdo debe ser un objeto' using errcode = '22023';
  end if;
  if p_data -> 'byTag' is not null and jsonb_typeof(p_data -> 'byTag') not in ('object', 'null') then
    raise exception 'byTag debe ser un objeto' using errcode = '22023';
  end if;
  if p_data -> 'byTag' is not null and not public.model_json_numeric_only(p_data -> 'byTag') then
    raise exception 'byTag solo lleva números y llaves' using errcode = '22023';
  end if;
  begin
    v_pairs := (p_data ->> 'pairs')::integer;
    v_kappa := case when jsonb_typeof(p_data -> 'kappa') = 'number' then (p_data ->> 'kappa')::numeric end;
  exception when invalid_text_representation or numeric_value_out_of_range then
    raise exception 'El acuerdo trae números inválidos' using errcode = '22023';
  end;
  if v_pairs is null or v_pairs < 0 then
    raise exception 'El acuerdo necesita sus pares' using errcode = '22023';
  end if;
  select * into v_sql from public.calibration_label_kappa();
  v_parity := v_pairs = v_sql.pairs
    and ((v_kappa is null and v_sql.kappa is null)
         or (v_kappa is not null and v_sql.kappa is not null and abs(v_kappa - v_sql.kappa) <= 0.000001));
  insert into public.agreement_snapshots (run_id, pairs, kappa, observed, expected, by_tag, sql_kappa, parity)
  values (
    p_run, v_pairs, v_kappa,
    case when jsonb_typeof(p_data -> 'observed') = 'number' then (p_data ->> 'observed')::numeric end,
    case when jsonb_typeof(p_data -> 'expected') = 'number' then (p_data ->> 'expected')::numeric end,
    coalesce(case when jsonb_typeof(p_data -> 'byTag') = 'object' then p_data -> 'byTag' end, '{}'::jsonb),
    v_sql.kappa, v_parity)
  on conflict (run_id) do nothing;
  return jsonb_build_object('parity', v_parity);
end;
$$;

-- ===================================================================== Aplicar
-- Lo que calibration_finish hace en modo apply, dentro de su transacción (1.8 y 3.5). Devuelve conteos
-- 1. calibration en question_catalog para la versión publicada de cada pregunta de la corrida, con seq
--    nuevo solo si el cambio importa
-- 2. exam_eligible en true en las variantes listas, con seq nuevo. Nunca lo regresa a false
-- 3. upsert_distractor_stats de B11 con las opciones de las versiones publicadas
-- 4. un correo distractor_flags por médico con marcas nuevas esa noche
-- 5. model_publication apunta a la corrida
create or replace function public.calibration_apply(p_run uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_run public.calibration_runs%rowtype;
  v_catalog integer := 0;
  v_eligible integer := 0;
  v_touched integer := 0;
  v_new integer := 0;
  v_emails integer := 0;
  v_rows jsonb;
  v_before uuid[];
  v_mail record;
begin
  select * into v_run from public.calibration_runs where id = p_run;
  if not found then
    raise exception 'La corrida no existe' using errcode = '22023';
  end if;

  -- El candado del seq del catálogo, antes de pedir números, como bank_publish (B11), así el orden en que
  -- se confirman es el orden del seq y catalog_changes no se salta una fila
  perform pg_advisory_xact_lock(hashtextextended('bank-catalog-seq', 0));
  with change as (
    select c.question_id, ic.version_id, ic.state, ic.difficulty, ic.se, ic.students, ic.elo, ic.extreme,
           (
             c.calibration is null
             or c.calibration ->> 'versionId' is distinct from ic.version_id::text
             or c.calibration ->> 'state' is distinct from ic.state
             or coalesce((c.calibration ->> 'extreme')::boolean, false) is distinct from ic.extreme
             or (c.calibration ->> 'difficulty' is null) <> (ic.difficulty is null)
             or abs(coalesce((c.calibration ->> 'difficulty')::numeric, 0) - coalesce(ic.difficulty, 0)) >= 0.10
             or (c.calibration ->> 'se' is null) <> (ic.se is null)
             or abs(coalesce((c.calibration ->> 'se')::numeric, 0) - coalesce(ic.se, 0)) >= 0.05
           ) as material,
           (ic.variant_ready is true and c.variant_of is not null and not c.exam_eligible) as eligible
    from public.item_calibrations ic
    join public.question_catalog c
      on c.question_id = ic.question_id and c.version_id = ic.version_id and c.status = 'published'
    where ic.run_id = p_run
  ),
  moved as (
    update public.question_catalog c set
      calibration = case when ch.material then jsonb_build_object(
        'versionId', ch.version_id, 'state', ch.state, 'difficulty', ch.difficulty, 'se', ch.se,
        'students', ch.students, 'elo', ch.elo, 'extreme', ch.extreme,
        'studyDay', to_char(v_run.study_day, 'YYYY-MM-DD')) else c.calibration end,
      exam_eligible = c.exam_eligible or ch.eligible,
      seq = nextval('public.bank_catalog_seq'),
      updated_at = now()
    from change ch
    where c.question_id = ch.question_id and (ch.material or ch.eligible)
    returning ch.material, ch.eligible
  )
  select count(*) filter (where material), count(*) filter (where eligible)
    into v_catalog, v_eligible from moved;

  -- Las opciones de las versiones publicadas van a la cola de distractores de B11, que aplica los
  -- umbrales del admin y conserva el estado de las marcas ya atendidas. Las marcas que ya existían se
  -- anotan antes, así las de esta noche son las que no estaban
  select coalesce(array_agg(id), '{}'::uuid[]) into v_before
    from public.distractor_flags where source = 'calibration';
  select jsonb_agg(jsonb_build_object(
      'questionVersionId', oc.version_id, 'optionId', oc.option_id,
      'exposures', oc.exposures, 'choices', oc.choices))
    into v_rows
    from public.option_calibrations oc
    join public.question_catalog c on c.version_id = oc.version_id and c.status = 'published'
    where oc.run_id = p_run;
  if v_rows is not null then
    v_touched := public.upsert_distractor_stats(v_rows);
  end if;

  select count(*) into v_new
    from public.distractor_flags where source = 'calibration' and id <> all (v_before);
  for v_mail in
    select public.bank_assigned_physician(f.question_id) as physician, count(*) as flags,
           (array_agg(distinct public.bank_question_key(f.question_id)
              order by public.bank_question_key(f.question_id)))[1:10] as keys
    from public.distractor_flags f
    where f.source = 'calibration' and f.id <> all (v_before)
    group by 1
  loop
    continue when v_mail.physician is null;
    if public.enqueue_email(
      v_mail.physician, null, 'distractor_flags',
      'distractor_flags:' || v_mail.physician::text || ':' || to_char(v_run.study_day, 'YYYY-MM-DD'),
      jsonb_build_object('flags', v_mail.flags, 'questionKeys', to_jsonb(v_mail.keys))
    ) then
      v_emails := v_emails + 1;
    end if;
  end loop;

  insert into public.model_publication (id, run_id, published_at) values (true, p_run, now())
    on conflict (id) do update set run_id = excluded.run_id, published_at = excluded.published_at;

  return jsonb_build_object(
    'catalogUpdated', v_catalog, 'examEligible', v_eligible, 'flagsTouched', v_touched,
    'flagsNew', v_new, 'emailsQueued', v_emails);
end;
$$;

-- ===================================================================== Cerrar la corrida
-- Cierra la corrida con su estado (ok, partial o failed), un motivo en minúsculas y sus conteos, que solo
-- pueden ser números y códigos. En modo apply y con estado ok o partial aplica todo con calibration_apply en
-- esta misma transacción. En dry_run solo cierra. En los dos modos borra la sal y pone finished_at. Un
-- acuerdo con paridad falsa deja la corrida en partial con el motivo kappa_mismatch. Devuelve status,
-- applied y los conteos de lo aplicado
create or replace function public.calibration_finish(
  p_run uuid, p_status text, p_reason text, p_counts jsonb
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp set statement_timeout = '50s' as $$
declare
  v_run public.calibration_runs%rowtype;
  v_status text := p_status;
  v_reason text := p_reason;
  v_applied jsonb := '{}'::jsonb;
  v_do_apply boolean;
begin
  if p_status is null or p_status not in ('ok', 'partial', 'failed') then
    raise exception 'Estado de la corrida desconocido' using errcode = '22023';
  end if;
  if p_reason is not null and p_reason !~ '^[a-z_]{1,40}$' then
    raise exception 'El motivo debe ser un código en minúsculas' using errcode = '22023';
  end if;
  if p_counts is not null and (jsonb_typeof(p_counts) <> 'object' or not public.model_json_numeric_only(p_counts)) then
    raise exception 'Los conteos solo llevan números y códigos' using errcode = '22023';
  end if;

  select * into v_run from public.calibration_runs where id = p_run for update;
  if not found or v_run.status <> 'running' then
    raise exception 'La corrida no está en curso' using errcode = '22023';
  end if;

  if v_status = 'ok' and exists (select 1 from public.agreement_snapshots where run_id = p_run and not parity) then
    v_status := 'partial';
    v_reason := coalesce(v_reason, 'kappa_mismatch');
  end if;

  v_do_apply := v_run.mode = 'apply' and v_status in ('ok', 'partial');
  if v_do_apply then
    v_applied := public.calibration_apply(p_run);
  end if;

  update public.calibration_runs set
    status = v_status,
    reason = v_reason,
    counts = counts || coalesce(p_counts, '{}'::jsonb) || v_applied,
    salt = null,
    finished_at = now(),
    applied_at = case when v_do_apply then now() else null end
  where id = p_run;

  return jsonb_build_object('status', v_status, 'applied', v_do_apply, 'counts', v_applied);
end;
$$;

-- ===================================================================== Permisos
-- Ayudas internas, sin execute para nadie de la API
revoke all on function public.calibration_words(text) from public, anon, authenticated, service_role;
revoke all on function public.calibration_study_day(timestamptz) from public, anon, authenticated, service_role;
revoke all on function public.calibration_run_row(uuid) from public, anon, authenticated, service_role;
revoke all on function public.calibration_label_kappa() from public, anon, authenticated, service_role;
revoke all on function public.calibration_apply(uuid) from public, anon, authenticated, service_role;
-- Del corredor, solo con la llave de servicio
revoke all on function public.calibration_begin(text, boolean, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.calibration_begin(text, boolean, jsonb) to service_role;
revoke all on function public.calibration_bank(uuid) from public, anon, authenticated, service_role;
grant execute on function public.calibration_bank(uuid) to service_role;
revoke all on function public.calibration_people(uuid) from public, anon, authenticated, service_role;
grant execute on function public.calibration_people(uuid) to service_role;
revoke all on function public.calibration_answers(uuid, bigint, integer) from public, anon, authenticated, service_role;
grant execute on function public.calibration_answers(uuid, bigint, integer) to service_role;
revoke all on function public.calibration_exposures(uuid, bigint, integer) from public, anon, authenticated, service_role;
grant execute on function public.calibration_exposures(uuid, bigint, integer) to service_role;
revoke all on function public.calibration_activity(uuid, text, integer) from public, anon, authenticated, service_role;
grant execute on function public.calibration_activity(uuid, text, integer) to service_role;
revoke all on function public.calibration_motives(uuid, bigint, integer) from public, anon, authenticated, service_role;
grant execute on function public.calibration_motives(uuid, bigint, integer) to service_role;
revoke all on function public.calibration_label_pairs(uuid) from public, anon, authenticated, service_role;
grant execute on function public.calibration_label_pairs(uuid) to service_role;
revoke all on function public.calibration_publish_items(uuid, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.calibration_publish_items(uuid, jsonb) to service_role;
revoke all on function public.calibration_publish_options(uuid, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.calibration_publish_options(uuid, jsonb) to service_role;
revoke all on function public.calibration_publish_population(uuid, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.calibration_publish_population(uuid, jsonb) to service_role;
revoke all on function public.calibration_publish_comparison(uuid, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.calibration_publish_comparison(uuid, jsonb) to service_role;
revoke all on function public.calibration_publish_agreement(uuid, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.calibration_publish_agreement(uuid, jsonb) to service_role;
revoke all on function public.calibration_finish(uuid, text, text, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.calibration_finish(uuid, text, text, jsonb) to service_role;
