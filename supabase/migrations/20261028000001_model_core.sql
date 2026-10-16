-- Datos y modelo del alumno, parte 1. Conversión de ids, índices de la bitácora, tablas de la calibración
-- nocturna, ajustes del modelo y quién cuenta como alumno con permiso (B14 del plan del cambio, PC B14 y
-- 5.5, 1.2 a 1.5 y 1.7 del plan de B14).
--
-- Reglas que se hacen cumplir aquí
--   - La calibración usa solo los datos de quien dio el permiso de mejora anónima al corte de esa noche.
--     La fuente es la bitácora en la nube, que ya sube cada consent_changed. No hace falta una tabla de
--     permisos ni otra llamada desde la app. calibration_consenters toma de cada alumno su último evento
--     de anonymized_improvement hasta el corte y lo cuenta si dice granted, si su noticeVersion es igual
--     o posterior a model_settings.calibration.minNoticeVersion (comparadas como texto, D-129) y si su rol
--     guardado es alumno. El equipo no entra aunque prenda el permiso
--   - Al corredor de GitHub solo viajan seudónimos de esa corrida, ids del banco, claves de la taxonomía,
--     números y la especialidad objetivo. El seudónimo es la primera parte de un hash sha256 del id con
--     una sal de 32 bytes que nace en calibration_begin y se pone en null al cerrar la corrida, así el
--     mismo alumno tiene otro seudónimo cada noche y nadie puede volver a ligarlo después. Se usa sha256 de
--     Postgres y no pgcrypto, porque Supabase instala pgcrypto en el esquema extensions y estas funciones
--     fijan search_path en public
--   - Las tablas nuevas nacen sin permisos para la API y sin políticas, como las del banco de B11. Solo las
--     tocan las funciones security definer. Las que guardan resultados solo se agregan, con el disparador
--     de B11 que frena toda edición, también la del superusuario
--   - Ninguna celda de comparación sale con menos de 30 alumnos. La restricción de comparison_cells lo
--     hace cumplir aunque el admin escriba menos en model_settings
--   - calibration_runs.counts solo acepta números y códigos, para que los registros del proceso y la
--     pantalla del admin nunca lleven texto de preguntas ni datos personales
--
-- Lo que trae. uuid_to_ulid y ulid_to_uuid, que dan el mismo resultado que src/data/cloud/cloudIds.ts
-- (tests/fixtures/ulid-uuid.json los compara), tres índices de events, las siete tablas, la siembra de
-- model_settings en platform_settings y las funciones model_setting, model_settings_json,
-- calibration_consenters, calibration_pseudonym y model_json_numeric_only
--
-- Es idempotente, no quita ni borra nada de lo que ya existe y no edita las migraciones anteriores
-- (D-113). Va después de la última migración de B12 y antes de las dos siguientes de B14. Crear índices en
-- events sin concurrently bloquea las escrituras mientras se crean. Antes de lanzar la tabla es chica

-- ===================================================================== Ids
-- Un uuid escrito como ULID de 26 caracteres, el mismo número de 128 bits. La bitácora guarda ULID y el
-- banco uuid. Mayúsculas, como las genera la app
create or replace function public.uuid_to_ulid(p_id uuid) returns text
language plpgsql immutable strict set search_path = public, pg_temp as $$
declare
  v_alphabet constant text := '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  v_bits text;
  v_out text := '';
  v_i integer;
begin
  -- 128 bits del uuid con dos ceros delante, que completan 26 grupos de 5 bits
  v_bits := '00' || (('x' || replace(p_id::text, '-', ''))::bit(128))::text;
  for v_i in 0 .. 25 loop
    v_out := v_out || substr(v_alphabet, (substr(v_bits, v_i * 5 + 1, 5)::bit(5))::integer + 1, 1);
  end loop;
  return v_out;
end;
$$;

-- El uuid de un ULID. null si no es un ULID, y también si empieza con una letra mayor que 7, porque no
-- cabe en 128 bits
create or replace function public.ulid_to_uuid(p_ulid text) returns uuid
language plpgsql immutable set search_path = public, pg_temp as $$
declare
  v_alphabet constant text := '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  v_upper text;
  v_bits text := '';
  v_i integer;
  v_hex text := '';
begin
  if p_ulid is null or p_ulid !~* '^[0-7][0-9A-HJKMNP-TV-Z]{25}$' then
    return null;
  end if;
  v_upper := upper(p_ulid);
  for v_i in 1 .. 26 loop
    v_bits := v_bits || ((strpos(v_alphabet, substr(v_upper, v_i, 1)) - 1)::bit(5))::text;
  end loop;
  -- 130 bits. Los dos primeros son ceros porque la primera letra va de 0 a 7
  for v_i in 0 .. 3 loop
    v_hex := v_hex || lpad(to_hex((substr(v_bits, 3 + v_i * 32, 32)::bit(32))::integer), 8, '0');
  end loop;
  return v_hex::uuid;
end;
$$;

-- ===================================================================== Índices de la bitácora
-- events_seq sirve para el corte de cada corrida y para bajar la bitácora en páginas por seq. El de los
-- permisos evita que calibration_consenters recorra toda la bitácora. El de las sesiones deja encontrar
-- el inicio de una sesión sin recorrer los eventos de cada pregunta
create index if not exists events_seq on public.events (seq);
create index if not exists events_consent_changed on public.events (user_id, at desc, seq desc)
  where type = 'consent_changed';
create index if not exists events_session_started on public.events (user_id, seq desc)
  where type = 'session_started';

-- ===================================================================== Solo números y códigos
-- true si todo lo que lleva un JSON son números, booleanos, nulos o códigos en minúsculas con guion
-- bajo, y todas sus llaves tienen forma de clave de la taxonomía (pediatrics/neonatology, * y parecidas).
-- Con esto la noche no puede guardar texto de preguntas ni datos personales por error
create or replace function public.model_json_numeric_only(p_value jsonb) returns boolean
language plpgsql immutable set search_path = public, pg_temp as $$
declare
  v_item record;
begin
  case jsonb_typeof(p_value)
    when 'number' then
      return true;
    when 'boolean' then
      return true;
    when 'null' then
      return true;
    when 'string' then
      return (p_value #>> '{}') ~ '^[a-z][a-z0-9_]{0,63}$';
    when 'array' then
      for v_item in select value from jsonb_array_elements(p_value) loop
        if not public.model_json_numeric_only(v_item.value) then
          return false;
        end if;
      end loop;
      return true;
    when 'object' then
      for v_item in select key, value from jsonb_each(p_value) loop
        if v_item.key !~ '^[A-Za-z0-9_./*:-]{1,64}$' or not public.model_json_numeric_only(v_item.value) then
          return false;
        end if;
      end loop;
      return true;
    else
      return false;
  end case;
end;
$$;

-- ===================================================================== Tablas
-- Una fila por corrida de la calibración nocturna, con su corte, su sal y sus conteos. La sal solo vive
-- aquí y calibration_finish la pone en null
create table if not exists public.calibration_runs (
  id uuid primary key default public.ulid_uuid(),
  run_trigger text not null check (run_trigger in ('schedule', 'manual', 'selftest')),
  mode text not null check (mode in ('dry_run', 'apply')),
  status text not null default 'running'
    check (status in ('running', 'ok', 'partial', 'failed', 'skipped', 'interrupted')),
  reason text check (reason ~ '^[a-z_]{1,40}$'),
  as_of timestamptz not null default now(),
  -- El corte de la bitácora, el seq más alto de events cuando empezó la corrida
  as_of_seq bigint,
  -- Día de estudio del corte, que cambia a las 4 a. m. de Mérida
  study_day date,
  salt bytea,
  -- Solo el número de la corrida de GitHub y el commit
  runner jsonb not null default '{}'::jsonb
    check (jsonb_typeof(runner) = 'object' and runner - 'runId' - 'sha' = '{}'::jsonb),
  -- Solo números y códigos
  counts jsonb not null default '{}'::jsonb
    check (jsonb_typeof(counts) = 'object' and public.model_json_numeric_only(counts)),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  applied_at timestamptz
);
-- Una sola corrida a la vez
create unique index if not exists calibration_runs_one_running
  on public.calibration_runs ((true)) where status = 'running';
create index if not exists calibration_runs_started on public.calibration_runs (started_at desc);

-- La dificultad de cada versión aprobada con respuestas, por corrida
create table if not exists public.item_calibrations (
  run_id uuid not null references public.calibration_runs (id),
  version_id uuid not null references public.questions (id),
  question_id uuid not null,
  -- Alumnos distintos con primer intento válido
  students integer not null check (students >= 0),
  -- Rasch en logits, ya enlazada a la escala de la corrida anterior
  difficulty numeric(6, 3),
  se numeric(6, 3),
  elo numeric(6, 3),
  elo_responses integer not null default 0 check (elo_responses >= 0),
  state text not null check (state in ('physician_estimate', 'provisional', 'calibrated')),
  -- Todos acertaron o todos fallaron, no hay estimación finita
  extreme boolean not null default false,
  -- Solo en preguntas con variant_of
  variant_ready boolean,
  primary key (run_id, version_id)
);

-- Exposiciones y elecciones de cada opción en el primer intento de cada alumno
create table if not exists public.option_calibrations (
  run_id uuid not null references public.calibration_runs (id),
  version_id uuid not null references public.questions (id),
  -- Id estable de la opción
  option_id uuid not null,
  exposures integer not null check (exposures >= 0),
  choices integer not null check (choices >= 0 and choices <= exposures),
  primary key (run_id, version_id, option_id)
);

-- Números con llaves de la taxonomía. Temas que más cuestan, sesgos, motivos, conducta y fatiga
create table if not exists public.population_snapshots (
  run_id uuid primary key references public.calibration_runs (id),
  data jsonb not null check (jsonb_typeof(data) = 'object' and public.model_json_numeric_only(data))
);

-- Los 19 cortes, del percentil 5 al 95, de cada grupo, métrica y rama. Nunca el mínimo ni el máximo
create table if not exists public.comparison_cells (
  run_id uuid not null references public.calibration_runs (id),
  cohort text not null check (cohort in ('all', 'specialty')),
  cohort_key text not null check (cohort_key ~ '^(\*|[a-z_]{2,48})$'),
  metric text not null check (metric in ('sim_accuracy', 'reviews', 'consistency')),
  branch text not null check (branch ~ '^(\*|[a-z_]{2,48})$'),
  students integer not null check (students >= 0),
  cuts numeric[] check (cuts is null or cardinality(cuts) = 19),
  primary key (run_id, cohort, cohort_key, metric, branch),
  check ((cohort = 'all' and cohort_key = '*') or (cohort = 'specialty' and cohort_key <> '*')),
  -- El piso de privacidad. No se configura
  check (cuts is null or students >= 30)
);

-- El acuerdo del etiquetado de cada noche, con la paridad contra bias_agreement_summary de B11
create table if not exists public.agreement_snapshots (
  run_id uuid primary key references public.calibration_runs (id),
  pairs integer not null check (pairs >= 0),
  kappa numeric(6, 4),
  observed numeric(6, 4),
  expected numeric(6, 4),
  by_tag jsonb not null default '{}'::jsonb
    check (jsonb_typeof(by_tag) = 'object' and public.model_json_numeric_only(by_tag)),
  sql_kappa numeric(6, 4),
  parity boolean not null
);

-- La corrida cuyos resultados leen los alumnos. Una sola fila
create table if not exists public.model_publication (
  id boolean primary key default true check (id),
  run_id uuid references public.calibration_runs (id),
  published_at timestamptz
);

-- Las tablas de resultados solo se agregan. El disparador de B11 frena toda edición, también la del
-- superusuario. El historial por noche se conserva
do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'item_calibrations', 'option_calibrations', 'population_snapshots', 'comparison_cells', 'agreement_snapshots'
  ] loop
    if not exists (
      select 1 from pg_trigger
      where tgname = v_table || '_append_only' and tgrelid = ('public.' || v_table)::regclass
    ) then
      execute format(
        'create trigger %I before update on public.%I for each row execute function public.forbid_bank_changes()',
        v_table || '_append_only', v_table
      );
    end if;
  end loop;
end $$;

alter table public.calibration_runs enable row level security;
alter table public.item_calibrations enable row level security;
alter table public.option_calibrations enable row level security;
alter table public.population_snapshots enable row level security;
alter table public.comparison_cells enable row level security;
alter table public.agreement_snapshots enable row level security;
alter table public.model_publication enable row level security;
revoke all on public.calibration_runs, public.item_calibrations, public.option_calibrations,
  public.population_snapshots, public.comparison_cells, public.agreement_snapshots, public.model_publication
  from public, anon, authenticated, service_role;

-- ===================================================================== Ajustes del modelo
-- model_settings se lee sin sesión, como todas las claves de platform_settings, y no trae nada secreto.
-- Lo escribe el admin con settings_write. La calibración nace apagada y en solo reporte. No pisa un valor
-- que el admin ya haya cambiado
insert into public.platform_settings (key, value) values (
  'model_settings',
  '{
    "calibration": {"enabled": false, "mode": "dry_run", "minNoticeVersion": "2026-10-15b"},
    "features": {"comparison": true, "adaptive": true},
    "thresholds": {
      "provisionalMaxSe": 0.5, "calibratedMaxSe": 0.3,
      "minGroupSize": 30, "comparisonWindowDays": 30, "minBranchAnswers": 20,
      "adaptiveMinItems": 50, "adaptiveTargetOffset": 0, "adaptiveExploreShare": 0.2,
      "maxDailyFirstAttempts": 400, "populationMinStudents": 30,
      "fatigue": {"minStudents": 30, "minSplitHalfKappa": 0.4, "minMotiveReports": 40}
    }
  }'::jsonb
) on conflict (key) do nothing;

-- Un número de model_settings por su ruta, o el de respaldo si falta, no es un número o no se lee
create or replace function public.model_setting(p_path text[], p_default numeric) returns numeric
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_value numeric;
begin
  select (value #>> p_path)::numeric into v_value from public.platform_settings where key = 'model_settings';
  return coalesce(v_value, p_default);
exception when others then
  return p_default;
end;
$$;

-- Los ajustes completos, con sus respaldos. Solo el booleano true prende la calibración y solo el booleano
-- false apaga una función, como las banderas. minGroupSize y populationMinStudents nunca bajan de 30
-- aunque el admin escriba menos, porque son la promesa de privacidad de la comparación (PC B14)
create or replace function public.model_settings_json() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_value jsonb;
  v_version text;
begin
  select value into v_value from public.platform_settings where key = 'model_settings';
  if v_value is null or jsonb_typeof(v_value) <> 'object' then
    v_value := '{}'::jsonb;
  end if;
  v_version := v_value #>> '{calibration,minNoticeVersion}';
  return jsonb_build_object(
    'calibration', jsonb_build_object(
      'enabled', coalesce(v_value #> '{calibration,enabled}' = 'true'::jsonb, false),
      'mode', case when v_value #>> '{calibration,mode}' = 'apply' then 'apply' else 'dry_run' end,
      'minNoticeVersion', case
        when v_version is null or char_length(v_version) not between 1 and 20 then '2026-10-15b'
        else v_version end
    ),
    'features', jsonb_build_object(
      'comparison', coalesce(v_value #> '{features,comparison}' <> 'false'::jsonb, true),
      'adaptive', coalesce(v_value #> '{features,adaptive}' <> 'false'::jsonb, true)
    ),
    'thresholds', jsonb_build_object(
      'provisionalMaxSe', public.model_setting('{thresholds,provisionalMaxSe}', 0.5),
      'calibratedMaxSe', public.model_setting('{thresholds,calibratedMaxSe}', 0.3),
      'minGroupSize', greatest(floor(public.model_setting('{thresholds,minGroupSize}', 30)), 30),
      'comparisonWindowDays',
        least(greatest(floor(public.model_setting('{thresholds,comparisonWindowDays}', 30)), 7), 90),
      'minBranchAnswers', greatest(floor(public.model_setting('{thresholds,minBranchAnswers}', 20)), 1),
      'adaptiveMinItems', greatest(floor(public.model_setting('{thresholds,adaptiveMinItems}', 50)), 5),
      'adaptiveTargetOffset', public.model_setting('{thresholds,adaptiveTargetOffset}', 0),
      'adaptiveExploreShare', public.model_setting('{thresholds,adaptiveExploreShare}', 0.2),
      'maxDailyFirstAttempts',
        greatest(floor(public.model_setting('{thresholds,maxDailyFirstAttempts}', 400)), 10),
      'populationMinStudents',
        greatest(floor(public.model_setting('{thresholds,populationMinStudents}', 30)), 30),
      'fatigue', jsonb_build_object(
        'minStudents', greatest(floor(public.model_setting('{thresholds,fatigue,minStudents}', 30)), 2),
        'minSplitHalfKappa', public.model_setting('{thresholds,fatigue,minSplitHalfKappa}', 0.4),
        'minMotiveReports', greatest(floor(public.model_setting('{thresholds,fatigue,minMotiveReports}', 40)), 2)
      )
    )
  );
end;
$$;

-- ===================================================================== Quién cuenta
-- Los alumnos con permiso de mejora anónima vigente al corte, por su id de cuenta. Solo la llaman las
-- funciones del corredor. Un permiso retirado, dado bajo un aviso anterior a minNoticeVersion, de un
-- médico, un admin o el dueño, o un evento posterior al corte, no cuenta
create or replace function public.calibration_consenters(p_as_of_seq bigint) returns table (user_id uuid)
language sql stable security definer set search_path = public, pg_temp as $$
  with latest as (
    select distinct on (e.user_id) e.user_id, e.payload
    from public.events e
    where e.type = 'consent_changed'
      and e.seq <= p_as_of_seq
      and e.payload ->> 'purpose' = 'anonymized_improvement'
    order by e.user_id, e.at desc, e.seq desc
  )
  select l.user_id
  from latest l
  where l.payload ->> 'status' = 'granted'
    and (l.payload ->> 'noticeVersion') collate "C"
      >= (public.model_settings_json() #>> '{calibration,minNoticeVersion}') collate "C"
    and coalesce((select r.role from public.user_roles r where r.user_id = l.user_id), 'student') = 'student'
$$;

-- ===================================================================== Seudónimos
-- La primera parte, de 16 caracteres hexadecimales, de un hash sha256 con la sal de la corrida. Es
-- inmutable para que Postgres la evalúe sin volver a leer la sal. Con la sal en null da null
create or replace function public.calibration_hash(p_salt bytea, p_value text) returns text
language sql immutable set search_path = public, pg_temp as $$
  select substr(encode(sha256(p_salt || convert_to(p_value, 'UTF8')), 'hex'), 1, 16)
$$;

-- El seudónimo de un id de cuenta en una corrida. Cambia en cada corrida y no se puede volver a ligar
-- cuando la corrida cierra y su sal se pone en null
create or replace function public.calibration_pseudonym(p_run uuid, p_id uuid) returns text
language sql stable security definer set search_path = public, pg_temp as $$
  select public.calibration_hash((select salt from public.calibration_runs where id = p_run), p_id::text)
$$;

-- ===================================================================== Permisos de las funciones
-- Todas son ayudas internas, sin execute para nadie de la API. Las llaman las funciones del corredor y de
-- los alumnos, que son security definer
revoke all on function public.uuid_to_ulid(uuid) from public, anon, authenticated, service_role;
revoke all on function public.ulid_to_uuid(text) from public, anon, authenticated, service_role;
revoke all on function public.model_json_numeric_only(jsonb) from public, anon, authenticated, service_role;
revoke all on function public.model_setting(text[], numeric) from public, anon, authenticated, service_role;
revoke all on function public.model_settings_json() from public, anon, authenticated, service_role;
revoke all on function public.calibration_consenters(bigint) from public, anon, authenticated, service_role;
revoke all on function public.calibration_hash(bytea, text) from public, anon, authenticated, service_role;
revoke all on function public.calibration_pseudonym(uuid, uuid) from public, anon, authenticated, service_role;
