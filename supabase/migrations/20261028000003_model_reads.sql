-- Datos y modelo del alumno, parte 3. Lo que leen la app y las pantallas del equipo (B14 del plan del
-- cambio, 1.6, 1.7, 1.8, 1.9 y 5 del plan de B14).
--
-- Qué agrega
--   - bank_catalog_json suma la llave calibration (create or replace con la misma firma). Una fila sin
--     calibración queda igual que antes, sin la llave. Una app de antes de B14 la ignora, porque
--     catalogEntryOf solo copia los campos que conoce. catalog_changes no cambia
--   - comparison_snapshot, para cualquier alumno con sesión y dispositivo activo. Devuelve solo las celdas
--     de Todos y de la especialidad de quien pregunta, de la corrida publicada, y los cortes solo donde
--     hay minGroupSize alumnos o más, que nunca baja de 30. Quien no dio el permiso también la lee, porque
--     sus datos no entran a la comparación. Con la comparación apagada o sin publicación dice available
--     false
--   - population_baselines, con sesión y dispositivo activo. Los números de la población de la corrida
--     publicada. Quita al leer todo dato con menos de populationMinStudents alumnos (30 como mínimo),
--     aunque la corrida lo haya guardado
--   - editor_agreement_history, para médico, admin y dueño. Una línea por noche del acuerdo del etiquetado
--   - admin_calibration_runs, solo para el admin, con segundo factor si el servidor lo pide. Las corridas
--     recientes, la publicación y un resumen de lo que dejó la última noche
--
-- Todo lo que sale son números, códigos y claves de la taxonomía. Nada de texto de preguntas, alias,
-- correos ni cuentas. Las cuatro funciones son security definer con search_path fijo, sin execute para
-- anon, y solo ven lo que su rol permite por dentro.
--
-- Es idempotente, no quita ni borra nada de lo que ya existe y no edita las migraciones anteriores (D-113).
-- Va después de 20261028000002_calibration_job.sql

-- ===================================================================== Catálogo con calibración
-- La misma firma que la de 20261023000002_bank_core.sql, con una llave más cuando la fila ya tiene
-- calibración. Las funciones que la llaman (catalog_changes) no cambian
create or replace function public.bank_catalog_json(c public.question_catalog) returns jsonb
language sql stable set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'questionId', c.question_id, 'versionId', c.version_id, 'version', c.version,
    'branch', c.branch, 'topic', c.topic, 'subtopic', c.subtopic, 'difficulty', c.difficulty,
    'itemKinds', to_jsonb(c.item_kinds), 'polarity', c.polarity, 'task', c.task, 'format', c.format,
    'caseId', c.case_id, 'caseOrder', c.case_order, 'caseSize', c.case_size, 'variantOf', c.variant_of,
    'examEligible', c.exam_eligible, 'distractorBiases', to_jsonb(c.distractor_biases),
    'optionCount', c.option_count, 'language', c.language, 'status', c.status, 'seq', c.seq
  ) || case when c.calibration is null then '{}'::jsonb
            else jsonb_build_object('calibration', c.calibration) end
$$;

-- ===================================================================== Comparación
-- La foto de la última corrida aplicada, solo con lo que le toca a quien pregunta
create or replace function public.comparison_snapshot() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_settings jsonb := public.model_settings_json();
  v_min integer := greatest((v_settings #>> '{thresholds,minGroupSize}')::integer, 30);
  v_window integer := (v_settings #>> '{thresholds,comparisonWindowDays}')::integer;
  v_specialty text;
  v_run uuid;
  v_day date;
  v_counts jsonb;
  v_published timestamptz;
begin
  if v_uid is null then
    raise exception 'Hace falta iniciar sesión' using errcode = '28000';
  end if;
  if not public.is_active_device() then
    raise exception 'Este dispositivo no es el activo de la cuenta' using errcode = '42501';
  end if;
  select case when a.target_specialty is null or a.target_specialty = 'undecided' then null
              else a.target_specialty end
    into v_specialty
    from public.private_accounts a where a.user_id = v_uid;

  select r.id, r.study_day, r.counts, p.published_at into v_run, v_day, v_counts, v_published
    from public.model_publication p join public.calibration_runs r on r.id = p.run_id
    where p.id;
  if v_run is null or (v_settings #>> '{features,comparison}') <> 'true' then
    return jsonb_build_object(
      'available', false, 'runAt', null, 'studyDay', null, 'windowDays', v_window,
      'minGroupSize', v_min, 'specialty', v_specialty, 'cells', '[]'::jsonb);
  end if;

  -- La ventana con la que se hizo la foto, para que el navegador compare lo mismo
  if (v_counts ->> 'windowDays') ~ '^[0-9]{1,3}$' then
    v_window := (v_counts ->> 'windowDays')::integer;
  end if;

  return jsonb_build_object(
    'available', true,
    'runAt', public.bank_iso(v_published),
    'studyDay', to_char(v_day, 'YYYY-MM-DD'),
    'windowDays', v_window,
    'minGroupSize', v_min,
    'specialty', v_specialty,
    'cells', coalesce((
      select jsonb_agg(jsonb_build_object(
          'cohort', c.cohort, 'metric', c.metric, 'branch', c.branch, 'students', c.students,
          'state', case when c.cuts is not null and c.students >= v_min then 'ready' else 'calibrating' end,
          'cuts', case when c.cuts is not null and c.students >= v_min then to_jsonb(c.cuts) end
        ) order by c.cohort, c.metric, c.branch <> '*', c.branch)
      from public.comparison_cells c
      where c.run_id = v_run
        and (c.cohort = 'all' or (v_specialty is not null and c.cohort = 'specialty' and c.cohort_key = v_specialty))
    ), '[]'::jsonb)
  );
end;
$$;

-- ===================================================================== Población
-- Una pasada por un objeto de la población, dejando las entradas que llegan al mínimo de alumnos en el
-- campo p_field (students o reports). Lo que no tiene la forma esperada se descarta
create or replace function public.model_population_filter(p_object jsonb, p_field text, p_min integer)
returns jsonb
language sql immutable set search_path = public, pg_temp as $$
  select coalesce((
    select jsonb_object_agg(e.key, e.value)
    from jsonb_each(case when jsonb_typeof(p_object) = 'object' then p_object else '{}'::jsonb end) e
    where jsonb_typeof(e.value) = 'object' and jsonb_typeof(e.value -> p_field) = 'number'
      and (e.value ->> p_field)::numeric >= p_min
  ), '{}'::jsonb)
$$;

-- El estado del detector de fatiga como lo publica la noche, o calibrando si falta o viene mal
create or replace function public.model_population_fatigue(p_object jsonb) returns jsonb
language sql immutable set search_path = public, pg_temp as $$
  select case
    when jsonb_typeof(p_object) = 'object' and p_object ->> 'state' in ('calibrating', 'validated', 'not_valid')
      then jsonb_build_object(
        'state', p_object ->> 'state',
        'students', case when jsonb_typeof(p_object -> 'students') = 'number' then p_object -> 'students' else '0'::jsonb end,
        'longSessions', case when jsonb_typeof(p_object -> 'longSessions') = 'number' then p_object -> 'longSessions' else '0'::jsonb end)
    else jsonb_build_object('state', 'calibrating', 'students', 0, 'longSessions', 0) end
$$;

create or replace function public.population_baselines() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_min integer := greatest((public.model_settings_json() #>> '{thresholds,populationMinStudents}')::integer, 30);
  v_run uuid;
  v_published timestamptz;
  v_data jsonb;
begin
  if v_uid is null then
    raise exception 'Hace falta iniciar sesión' using errcode = '28000';
  end if;
  if not public.is_active_device() then
    raise exception 'Este dispositivo no es el activo de la cuenta' using errcode = '42501';
  end if;
  select p.run_id, p.published_at into v_run, v_published from public.model_publication p where p.id;
  select s.data into v_data from public.population_snapshots s where s.run_id = v_run;
  if v_run is null or v_data is null then
    return jsonb_build_object(
      'available', false, 'runAt', null, 'bias', '{}'::jsonb, 'motives', '{}'::jsonb, 'topics', '{}'::jsonb,
      'indicators', '{}'::jsonb, 'fatigue', public.model_population_fatigue(null));
  end if;
  return jsonb_build_object(
    'available', true,
    'runAt', public.bank_iso(v_published),
    'bias', public.model_population_filter(v_data -> 'bias', 'students', v_min),
    'motives', public.model_population_filter(v_data -> 'motives', 'reports', v_min),
    'topics', public.model_population_filter(v_data -> 'topics', 'students', v_min),
    'indicators', public.model_population_filter(v_data -> 'indicators', 'students', v_min),
    'fatigue', public.model_population_fatigue(v_data -> 'fatigue')
  );
end;
$$;

-- ===================================================================== Pantallas del equipo
-- El acuerdo del etiquetado, una línea por noche que terminó bien (ok o partial), la más reciente primero.
-- Lo ven el médico, el admin y el dueño. Son cifras de los pares de etiquetas, sin quiénes son los médicos
create or replace function public.editor_agreement_history(p_limit integer default 60) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 60), 1), 365);
begin
  perform public.bank_team_role();
  return jsonb_build_object('nights', coalesce((
    select jsonb_agg(jsonb_build_object(
        'studyDay', to_char(n.study_day, 'YYYY-MM-DD'), 'at', public.bank_iso(n.finished_at), 'pairs', n.pairs,
        'kappa', n.kappa, 'observed', n.observed, 'expected', n.expected, 'parity', n.parity
      ) order by n.study_day desc, n.finished_at desc, n.id desc)
    from (
      select r.id, r.study_day, r.finished_at, s.pairs, s.kappa, s.observed, s.expected, s.parity
      from public.agreement_snapshots s
      join public.calibration_runs r on r.id = s.run_id
      where r.status in ('ok', 'partial')
      order by r.study_day desc, r.finished_at desc, r.id desc
      limit v_limit
    ) n
  ), '[]'::jsonb));
end;
$$;

-- Las corridas recientes de la calibración, la corrida publicada y un resumen de la última noche que
-- terminó bien. Solo el admin
create or replace function public.admin_calibration_runs(p_limit integer default 30) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 30), 1), 200);
  v_min integer := greatest((public.model_settings_json() #>> '{thresholds,populationMinStudents}')::integer, 30);
  v_last uuid;
  v_last_at timestamptz;
  v_data jsonb;
  v_items jsonb;
  v_publication jsonb;
  v_agreement jsonb;
begin
  perform public.bank_require_admin();
  select r.id, r.finished_at into v_last, v_last_at
    from public.calibration_runs r where r.status in ('ok', 'partial')
    order by r.finished_at desc, r.id desc limit 1;
  select s.data into v_data from public.population_snapshots s where s.run_id = v_last;
  select jsonb_build_object('runId', p.run_id, 'at', public.bank_iso(p.published_at)) into v_publication
    from public.model_publication p where p.id and p.run_id is not null;
  select jsonb_build_object('kappa', a.kappa, 'parity', a.parity) into v_agreement
    from public.agreement_snapshots a where a.run_id = v_last;

  -- Las versiones publicadas por estado, de la última noche si las guardó y si no del catálogo de hoy
  if jsonb_typeof(v_data -> 'items') = 'object' then
    v_items := jsonb_build_object(
      'physician_estimate', case when jsonb_typeof(v_data #> '{items,physician_estimate}') = 'number' then v_data #> '{items,physician_estimate}' else '0'::jsonb end,
      'provisional', case when jsonb_typeof(v_data #> '{items,provisional}') = 'number' then v_data #> '{items,provisional}' else '0'::jsonb end,
      'calibrated', case when jsonb_typeof(v_data #> '{items,calibrated}') = 'number' then v_data #> '{items,calibrated}' else '0'::jsonb end);
  else
    select jsonb_build_object(
        'physician_estimate', count(*) filter (where s.state = 'physician_estimate'),
        'provisional', count(*) filter (where s.state = 'provisional'),
        'calibrated', count(*) filter (where s.state = 'calibrated'))
      into v_items
      from (
        select case when c.calibration ->> 'versionId' = c.version_id::text
                         and c.calibration ->> 'state' in ('provisional', 'calibrated')
                    then c.calibration ->> 'state' else 'physician_estimate' end as state
        from public.question_catalog c where c.status = 'published'
      ) s;
  end if;

  return jsonb_build_object(
    'lastOkAt', public.bank_iso(v_last_at),
    'publication', v_publication,
    'settings', public.model_settings_json(),
    'runs', coalesce((
      select jsonb_agg(jsonb_build_object(
          'id', r.id, 'trigger', r.run_trigger, 'mode', r.mode, 'status', r.status, 'reason', r.reason,
          'startedAt', public.bank_iso(r.started_at), 'finishedAt', public.bank_iso(r.finished_at),
          'runner', r.runner, 'counts', r.counts
        ) order by r.started_at desc, r.id desc)
      from (
        select * from public.calibration_runs order by started_at desc, id desc limit v_limit
      ) r
    ), '[]'::jsonb),
    'overview', jsonb_build_object(
      'items', v_items,
      'hardestTopics', coalesce((
        select jsonb_agg(jsonb_build_object('key', t.key, 'students', t.students, 'accuracy', t.accuracy)
                         order by t.accuracy, t.key)
        from (
          select e.key, (e.value ->> 'students')::numeric as students, (e.value ->> 'accuracy')::numeric as accuracy
          from jsonb_each(case when jsonb_typeof(v_data -> 'topics') = 'object' then v_data -> 'topics' else '{}'::jsonb end) e
          where jsonb_typeof(e.value) = 'object' and jsonb_typeof(e.value -> 'students') = 'number'
            and jsonb_typeof(e.value -> 'accuracy') = 'number' and (e.value ->> 'students')::numeric >= v_min
          order by (e.value ->> 'accuracy')::numeric, e.key
          limit 10
        ) t
      ), '[]'::jsonb),
      'motives', public.model_population_filter(v_data -> 'motives', 'reports', v_min),
      'fatigue', public.model_population_fatigue(v_data -> 'fatigue'),
      'agreement', v_agreement
    )
  );
end;
$$;

-- ===================================================================== Permisos
-- Las ayudas internas, sin execute para nadie de la API
revoke all on function public.model_population_filter(jsonb, text, integer) from public, anon, authenticated, service_role;
revoke all on function public.model_population_fatigue(jsonb) from public, anon, authenticated, service_role;
-- Del alumno, con sesión y dispositivo activo
revoke all on function public.comparison_snapshot() from public, anon, authenticated, service_role;
grant execute on function public.comparison_snapshot() to authenticated;
revoke all on function public.population_baselines() from public, anon, authenticated, service_role;
grant execute on function public.population_baselines() to authenticated;
-- Del equipo, que revisa su rol por dentro
revoke all on function public.editor_agreement_history(integer) from public, anon, authenticated, service_role;
grant execute on function public.editor_agreement_history(integer) to authenticated;
revoke all on function public.admin_calibration_runs(integer) from public, anon, authenticated, service_role;
grant execute on function public.admin_calibration_runs(integer) to authenticated;
