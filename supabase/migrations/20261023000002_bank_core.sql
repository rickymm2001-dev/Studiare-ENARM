-- Banco en la nube, parte 2. Versiones, registro por pregunta, catálogo sin texto y lectura del alumno
-- solo por función (B11 del plan del cambio, PC 5.1 y 5.2, 1.4 a 1.6, 1.11, 2.1 a 2.5 del plan de B11).
--
-- Reglas que se hacen cumplir aquí
--   - El catálogo (question_catalog) no lleva ni una palabra de texto. Lo leen todos los alumnos con
--     sesión cuando el banco está abierto, con catalog_changes. El cuerpo de una pregunta sale solo con
--     fetch_questions, que revisa sesión, dispositivo activo, plan y banco abierto
--   - Nadie de la API lee ni escribe las tablas del banco directo. questions, question_options,
--     clinical_cases, review_assignments y review_decisions pierden todos sus permisos de tabla, y las
--     tablas nuevas nacen sin permisos ni políticas, como device_claims. content_reports conserva solo
--     select e insert para authenticated, con sus políticas y la barrera del dispositivo
--   - Gratis abre 20 preguntas nuevas por día de estudio (corte a las 4 a. m. de Mérida), contadas en el
--     servidor en bank_reads por pregunta estable. Volver a abrir una pregunta el mismo día no gasta,
--     aunque haya salido otra versión. Un caso seriado se concede completo o no se concede. Lo que pasa
--     del tope sale en denied con daily_limit, sin error, para que la sesión arranque con lo concedido
--   - Los planes de pago no tienen tope, solo un freno de perMinute y perHour lecturas nuevas, con avisos
--     al admin en bank_read_alerts al pasar de alertDaily al día, de alertWeekShare del catálogo en 7
--     días y al topar el freno (PC 4.10). El equipo médico no tiene tope ni freno
--   - bank_reads y question_catalog solo cambian por estas funciones. bank_reads solo se agrega y un
--     disparador frena toda edición, también la del superusuario
--   - Las versiones no se editan. Publicar es bank_publish, que toma la versión aprobada más reciente.
--     Un caso seriado se publica completo o espera a sus otras preguntas
--   - Con cloudBank prendida, un duelo de Party solo lleva versiones aprobadas del banco
--     (party_duels_check_questions, 8.13)
--   - question_grants, grant_question_access y can_access_question quedan sin uso y sin execute para
--     authenticated, sin borrarlas
--
-- Es idempotente, no lleva sentencias delete ni drop y no edita las migraciones anteriores (D-113). Va
-- después de 20261023000001_bank_taxonomy.sql

-- ===================================================================== Versiones, opciones y casos
alter table public.questions
  add column if not exists subtopic text,
  add column if not exists polarity text check (polarity in ('affirmative', 'negative')),
  add column if not exists task text,
  add column if not exists format text check (format in ('clinical_case', 'direct', 'serial_case')),
  add column if not exists structure_source text check (structure_source in ('auto', 'physician')),
  add column if not exists difficulty smallint check (difficulty between 1 and 5),
  add column if not exists item_kinds text[] not null default '{}',
  add column if not exists case_order smallint check (case_order between 1 and 5),
  -- Id estable de la pregunta original de una variante reestructurada
  add column if not exists variant_of uuid,
  add column if not exists language text not null default 'es' check (language in ('es', 'en')),
  add column if not exists canonical_option_ids uuid[] not null default '{}',
  add column if not exists version_source text check (version_source in ('sheet', 'import', 'app', 'ai_variant')),
  add column if not exists author_id uuid references auth.users (id) on delete set null,
  -- Lo que falta para aprobar (3.4). Lo calcula bank_refresh_incomplete con bank_version_issues
  add column if not exists incomplete text[] not null default '{}',
  -- Casillas que el revisor confirma al aprobar, como topic_inferred y kind_control_check
  add column if not exists review_flags text[] not null default '{}',
  add column if not exists submitted_at timestamptz,
  add column if not exists decided_at timestamptz;
-- body queda con {vignette, prompt, explanation, gpcRefs:[{title,status}], clues:[{text,strength}]}

-- Una versión aprobada no puede tener pendientes
do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.questions'::regclass and conname = 'questions_approved_complete'
  ) then
    alter table public.questions
      add constraint questions_approved_complete check (editorial_status <> 'approved' or cardinality(incomplete) = 0);
  end if;
end $$;
create index if not exists questions_question_version on public.questions (question_id, version desc);
create index if not exists questions_case on public.questions (case_id) where case_id is not null;

alter table public.question_options
  -- Id estable de la opción entre versiones
  add column if not exists option_id uuid,
  add column if not exists position smallint check (position between 0 and 9),
  -- La letra de la columna del Sheet. null si la opción nació en la app
  add column if not exists letter text check (letter ~ '^[A-J]$'),
  add column if not exists secondary_bias_tags text[] not null default '{}';
create unique index if not exists question_options_version_position
  on public.question_options (question_version_id, position);
create unique index if not exists question_options_version_option
  on public.question_options (question_version_id, option_id);
-- bias_tag ya admite null. Un distractor sin etiqueta solo puede existir en un borrador incompleto.
-- rationale es not null. Si falta se guarda vacío y queda el pendiente rationale_missing

alter table public.clinical_cases
  -- La columna Caso del Sheet
  add column if not exists case_key text,
  add column if not exists content_hash text,
  add column if not exists created_by uuid references auth.users (id) on delete set null;

-- ===================================================================== Registro por pregunta
-- Una fila por pregunta estable. Lo que es de la pregunta y no de una versión
create table if not exists public.bank_questions (
  question_id uuid primary key,
  origin text not null check (origin in ('sheet', 'import', 'app', 'ai_variant')),
  -- sheet:GO-0001 o import:MI-0001. null si nació en la app
  source_key text unique,
  latest_version_id uuid not null references public.questions (id),
  published_version_id uuid references public.questions (id),
  status text not null default 'active' check (status in ('active', 'retired')),
  -- El Sheet dice Retirar o el renglón desapareció. El admin confirma
  retire_requested_at timestamptz,
  retired_at timestamptz,
  retired_by uuid references auth.users (id) on delete set null,
  retire_reason text check (char_length(retire_reason) <= 200),
  -- Estado de la sincronización (3.5). null en lo que no viene del Sheet
  sheet_row_hash text,
  sheet_meta_hash text,
  sheet_applied_version_id uuid references public.questions (id),
  sheet_status text check (sheet_status in ('draft', 'ready', 'retire')),
  sheet_missing_since timestamptz,
  sheet_seen_at timestamptz,
  conflict_since timestamptz,
  conflict_row_hash text,
  -- Usar la del Sheet en la siguiente corrida (editor_resolve_sync_conflict)
  sheet_force_next boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists bank_questions_updated on public.bank_questions (updated_at desc);

-- ===================================================================== Catálogo
-- Lo que leen todos los alumnos con sesión, sin una sola palabra de texto. Una fila por pregunta
-- publicada o retirada. seq sube con cada cambio, para bajar solo lo nuevo
create sequence if not exists public.bank_catalog_seq as bigint;
create table if not exists public.question_catalog (
  question_id uuid primary key references public.bank_questions (question_id),
  version_id uuid not null references public.questions (id),
  version integer not null,
  branch text not null,
  topic text not null,
  subtopic text not null,
  difficulty smallint not null,
  item_kinds text[] not null default '{}',
  polarity text not null,
  task text not null,
  format text not null,
  case_id uuid,
  case_order smallint,
  case_size smallint,
  variant_of uuid,
  -- Las variantes nacen fuera del examen hasta su umbral (B14)
  exam_eligible boolean not null default true,
  -- Etiquetas de los distractores sin decir cuál es cuál, para el muestreo dirigido (D-080)
  distractor_biases text[] not null default '{}',
  option_count smallint not null,
  language text not null default 'es',
  status text not null check (status in ('published', 'retired')),
  -- Reservado para la dificultad calibrada de B14
  calibration jsonb,
  seq bigint not null,
  updated_at timestamptz not null default now()
);
create index if not exists question_catalog_seq on public.question_catalog (seq);

-- ===================================================================== Lecturas del alumno
-- Bitácora que solo se agrega. Una fila por alumno, pregunta estable y día de estudio
create table if not exists public.bank_reads (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  question_id uuid not null,
  version_id uuid not null references public.questions (id),
  -- study_day(), con corte a las 4 a. m. de Mérida
  day date not null,
  -- Plan efectivo al leer, o el rol del equipo, para medir
  plan text not null,
  purpose text not null check (purpose in ('practice', 'exam', 'duel', 'review', 'other')),
  created_at timestamptz not null default now(),
  unique (user_id, question_id, day)
);
create index if not exists bank_reads_user_created on public.bank_reads (user_id, created_at desc);

-- Avisos al admin de volúmenes raros, sin bloquear (PC 4.10). Uno por alumno, día y tipo
create table if not exists public.bank_read_alerts (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  kind text not null check (kind in ('daily_volume', 'week_share', 'brake')),
  value numeric not null,
  created_at timestamptz not null default now(),
  seen_at timestamptz,
  unique (user_id, day, kind)
);

-- Frena toda edición de una tabla que solo se agrega, también la del superusuario. Si la edición es la
-- llave de review_decisions que pasa a null porque un médico borra su cuenta, responde 23503, así la app
-- dice que la cuenta tiene revisiones registradas para pagos y que la cierre el admin (8.33)
create or replace function public.forbid_bank_changes() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if tg_table_name = 'review_decisions' then
    if old.physician_id is not null and new.physician_id is null then
      raise exception 'La cuenta tiene revisiones registradas para pagos' using errcode = '23503';
    end if;
  end if;
  raise exception 'Esta tabla del banco solo se agrega' using errcode = '42501';
end;
$$;
do $$ begin
  if not exists (
    select 1 from pg_trigger where tgname = 'bank_reads_append_only' and tgrelid = 'public.bank_reads'::regclass
  ) then
    create trigger bank_reads_append_only before update on public.bank_reads
      for each row execute function public.forbid_bank_changes();
  end if;
end $$;

-- ===================================================================== Permisos de tablas
-- Las tablas nuevas, sin permisos ni políticas. Solo las tocan las funciones de abajo
alter table public.bank_questions enable row level security;
alter table public.question_catalog enable row level security;
alter table public.bank_reads enable row level security;
alter table public.bank_read_alerts enable row level security;
revoke all on public.bank_questions, public.question_catalog, public.bank_reads, public.bank_read_alerts
  from public, anon, authenticated, service_role;
revoke all on sequence public.bank_catalog_seq, public.bank_reads_id_seq, public.bank_read_alerts_id_seq
  from public, anon, authenticated, service_role;

-- Las tablas que ya existían pierden la lectura y la escritura directas (PC 5.2)
revoke all on public.questions, public.question_options, public.clinical_cases,
  public.review_assignments, public.review_decisions
  from public, anon, authenticated, service_role;
-- Los reportes conservan solo leer los propios y crear, con sus políticas y la barrera del dispositivo
revoke all on public.content_reports from public, anon, authenticated, service_role;
grant select, insert on public.content_reports to authenticated;

-- ===================================================================== Pendientes de una versión
-- Lo que le falta a una versión para aprobarse. Espejo de src/data/content/questionRules.ts, con los
-- mismos códigos y el mismo orden. Primero la estructura, después la tarea, la explicación y las
-- referencias, y al final cada opción por posición. Nunca marca un reactivo por imperfecto (D-080)
create or replace function public.bank_version_issues(p_version_id uuid) returns text[]
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_version public.questions%rowtype;
  v_issues text[] := '{}';
  v_count integer;
  v_correct integer;
  v_option record;
  v_letter text;
begin
  select * into v_version from public.questions where id = p_version_id;
  if not found then
    return null;
  end if;
  if btrim(coalesce(v_version.body ->> 'prompt', '')) = '' then
    v_issues := array_append(v_issues, 'prompt_missing');
  end if;
  select count(*), count(*) filter (where is_correct) into v_count, v_correct
    from public.question_options where question_version_id = p_version_id;
  if v_count < 4 or v_count > 10 then
    v_issues := array_append(v_issues, 'options_count');
  end if;
  if v_correct <> 1 then
    v_issues := array_append(v_issues, 'correct_count');
  end if;
  if not exists (
    select 1 from public.question_options
    where question_version_id = p_version_id and id = any (v_version.canonical_option_ids) and is_correct
  ) or not exists (
    select 1 from public.question_options
    where question_version_id = p_version_id and id = any (v_version.canonical_option_ids) and not is_correct
  ) then
    v_issues := array_append(v_issues, 'canonical_invalid');
  end if;
  -- Una versión del Sheet sin tarea detectada (decisión de Ricardo en la revisión de B11)
  if btrim(coalesce(v_version.task, '')) = '' then
    v_issues := array_append(v_issues, 'task_undetected');
  end if;
  if btrim(coalesce(v_version.body ->> 'explanation', '')) = '' then
    v_issues := array_append(v_issues, 'explanation_missing');
  end if;
  if not exists (
    select 1 from jsonb_array_elements(
      case when jsonb_typeof(v_version.body -> 'gpcRefs') = 'array' then v_version.body -> 'gpcRefs' else '[]'::jsonb end
    ) ref
    where btrim(coalesce(ref ->> 'title', '')) <> ''
  ) then
    v_issues := array_append(v_issues, 'references_missing');
  end if;
  for v_option in
    select * from public.question_options where question_version_id = p_version_id order by position nulls last, id
  loop
    v_letter := upper(coalesce(v_option.letter, chr(65 + coalesce(v_option.position, 0))));
    if btrim(coalesce(v_option.rationale, '')) = '' then
      v_issues := array_append(v_issues, 'rationale_missing:' || v_letter);
    end if;
    if not v_option.is_correct then
      if v_option.bias_tag is null or v_option.bias_tag = '' then
        v_issues := array_append(v_issues, 'bias_missing:' || v_letter);
      elsif not exists (select 1 from public.bank_bias_tags where tag = v_option.bias_tag) then
        v_issues := array_append(v_issues, 'bias_unknown:' || v_letter);
      end if;
    end if;
  end loop;
  return v_issues;
end;
$$;

-- Los pendientes que se completan en el Sheet o en el editor, sin los de estructura
create or replace function public.bank_incomplete_of(p_issues text[]) returns text[]
language sql immutable set search_path = public, pg_temp as $$
  select coalesce(array_agg(issue order by ord), '{}')
  from unnest(coalesce(p_issues, '{}')) with ordinality as i (issue, ord)
  where issue not in ('prompt_missing', 'options_count', 'correct_count', 'canonical_invalid')
$$;

-- Vuelve a calcular incomplete de una versión. La llaman las funciones que crean versiones
create or replace function public.bank_refresh_incomplete(p_version_id uuid) returns text[]
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_incomplete text[] := public.bank_incomplete_of(public.bank_version_issues(p_version_id));
begin
  update public.questions set incomplete = v_incomplete where id = p_version_id;
  return v_incomplete;
end;
$$;

-- ===================================================================== Publicar
-- Publica la versión aprobada más reciente de una pregunta. Un caso seriado se publica completo. Si
-- alguna de sus preguntas no tiene versión aprobada con ese mismo caso, nada cambia y responde
-- waiting_case. Devuelve published, waiting_case, retired o not_approved. Toma el candado del seq del
-- catálogo antes de pedir números, así el orden en que se confirman es el orden del seq y catalog_changes
-- no se salta una fila que otra transacción confirma con un seq menor después (M3 de la revisión)
create or replace function public.bank_publish(p_question_id uuid) returns text
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_registry public.bank_questions%rowtype;
  v_version public.questions%rowtype;
  v_members uuid[];
  v_member uuid;
  v_member_version uuid;
  v_targets uuid[] := '{}';
  v_size integer;
begin
  select * into v_registry from public.bank_questions where question_id = p_question_id for update;
  if not found then
    return 'not_approved';
  end if;
  if v_registry.status = 'retired' then
    return 'retired';
  end if;
  select * into v_version from public.questions
    where question_id = p_question_id and editorial_status = 'approved'
    order by version desc limit 1;
  if not found then
    return 'not_approved';
  end if;

  if v_version.case_id is null then
    v_targets := array[v_version.id];
  else
    -- Las preguntas del caso son las que tienen su versión más reciente en ese caso
    select array_agg(r.question_id) into v_members
      from public.bank_questions r
      join public.questions q on q.id = r.latest_version_id
      where q.case_id = v_version.case_id and r.status = 'active';
    v_members := coalesce(v_members, '{}') || case when p_question_id = any (coalesce(v_members, '{}')) then '{}'::uuid[] else array[p_question_id] end;
    foreach v_member in array v_members loop
      select id into v_member_version from public.questions
        where question_id = v_member and editorial_status = 'approved' and case_id = v_version.case_id
        order by version desc limit 1;
      if v_member_version is null then
        return 'waiting_case';
      end if;
      v_targets := array_append(v_targets, v_member_version);
      v_member_version := null;
    end loop;
  end if;

  v_size := case when v_version.case_id is null then null else cardinality(v_targets) end;
  perform pg_advisory_xact_lock(hashtextextended('bank-catalog-seq', 0));
  insert into public.question_catalog as c (
    question_id, version_id, version, branch, topic, subtopic, difficulty, item_kinds, polarity, task,
    format, case_id, case_order, case_size, variant_of, exam_eligible, distractor_biases, option_count,
    language, status, seq, updated_at
  )
  select q.question_id, q.id, q.version, q.branch, q.topic, coalesce(q.subtopic, ''),
         coalesce(q.difficulty, 3), q.item_kinds, coalesce(q.polarity, 'affirmative'),
         coalesce(q.task, 'diagnosis'), coalesce(q.format, 'direct'), q.case_id, q.case_order, v_size,
         q.variant_of, q.variant_of is null,
         coalesce((
           select array_agg(distinct o.bias_tag order by o.bias_tag) from public.question_options o
           where o.question_version_id = q.id and not o.is_correct and o.bias_tag is not null
         ), '{}'),
         (select count(*) from public.question_options o where o.question_version_id = q.id),
         q.language, 'published', nextval('public.bank_catalog_seq'), now()
  from public.questions q
  where q.id = any (v_targets)
  on conflict (question_id) do update set
    version_id = excluded.version_id, version = excluded.version, branch = excluded.branch,
    topic = excluded.topic, subtopic = excluded.subtopic, difficulty = excluded.difficulty,
    item_kinds = excluded.item_kinds, polarity = excluded.polarity, task = excluded.task,
    format = excluded.format, case_id = excluded.case_id, case_order = excluded.case_order,
    case_size = excluded.case_size, variant_of = excluded.variant_of,
    exam_eligible = excluded.exam_eligible, distractor_biases = excluded.distractor_biases,
    option_count = excluded.option_count, language = excluded.language, status = 'published',
    seq = excluded.seq, updated_at = now();
  update public.bank_questions r
    set published_version_id = q.id, updated_at = now()
    from public.questions q
    where q.id = any (v_targets) and r.question_id = q.question_id;
  return 'published';
end;
$$;

-- Saca una pregunta del catálogo para los alumnos. La app deja de elegirla y conserva lo que ya bajó.
-- Toma el mismo candado del seq que bank_publish
create or replace function public.bank_catalog_retire(p_question_id uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('bank-catalog-seq', 0));
  update public.question_catalog
    set status = 'retired', seq = nextval('public.bank_catalog_seq'), updated_at = now()
    where question_id = p_question_id and status <> 'retired';
end;
$$;

-- ===================================================================== JSON para el alumno
-- Una fila del catálogo con las llaves de src/data/bank/contracts.ts (CatalogRow)
create or replace function public.bank_catalog_json(c public.question_catalog) returns jsonb
language sql stable set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'questionId', c.question_id, 'versionId', c.version_id, 'version', c.version,
    'branch', c.branch, 'topic', c.topic, 'subtopic', c.subtopic, 'difficulty', c.difficulty,
    'itemKinds', to_jsonb(c.item_kinds), 'polarity', c.polarity, 'task', c.task, 'format', c.format,
    'caseId', c.case_id, 'caseOrder', c.case_order, 'caseSize', c.case_size, 'variantOf', c.variant_of,
    'examEligible', c.exam_eligible, 'distractorBiases', to_jsonb(c.distractor_biases),
    'optionCount', c.option_count, 'language', c.language, 'status', c.status, 'seq', c.seq
  )
$$;

-- El cuerpo de una versión con sus opciones, con las llaves de FetchedQuestion
create or replace function public.bank_body_json(p_version_id uuid) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'questionId', q.question_id, 'versionId', q.id, 'version', q.version,
    'branch', q.branch, 'topic', q.topic, 'subtopic', coalesce(q.subtopic, ''),
    'caseId', q.case_id, 'caseOrder', q.case_order,
    'vignette', coalesce(q.body ->> 'vignette', ''), 'prompt', coalesce(q.body ->> 'prompt', ''),
    'structure', jsonb_build_object(
      'polarity', coalesce(q.polarity, 'affirmative'), 'task', coalesce(q.task, 'diagnosis'),
      'format', coalesce(q.format, 'direct'), 'source', coalesce(q.structure_source, 'auto')),
    'explanation', coalesce(q.body ->> 'explanation', ''),
    'gpcRefs', case when jsonb_typeof(q.body -> 'gpcRefs') = 'array' then q.body -> 'gpcRefs' else '[]'::jsonb end,
    'itemKinds', to_jsonb(q.item_kinds),
    'clues', case when jsonb_typeof(q.body -> 'clues') = 'array' then q.body -> 'clues' else '[]'::jsonb end,
    'physicianDifficulty', coalesce(q.difficulty, 3), 'variantOf', q.variant_of,
    'canonicalOptionIds', to_jsonb(q.canonical_option_ids), 'language', q.language,
    'createdAt', public.bank_iso(q.created_at),
    'options', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', o.id, 'optionId', coalesce(o.option_id, o.id), 'position', coalesce(o.position, 0),
        'text', o.text, 'isCorrect', o.is_correct, 'biasTag', o.bias_tag,
        'secondaryBiasTags', to_jsonb(o.secondary_bias_tags), 'rationale', o.rationale
      ) order by o.position nulls last, o.id)
      from public.question_options o where o.question_version_id = q.id
    ), '[]'::jsonb)
  )
  from public.questions q where q.id = p_version_id
$$;

-- La cuota de un alumno, con las llaves de QuotaInfo. El equipo y los planes de pago no tienen tope
create or replace function public.bank_quota_json(
  p_user uuid, p_team boolean, p_plan text, p_open boolean, p_retry timestamptz
) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_day date := public.study_day();
  v_used integer;
  v_limit integer := case when not p_team and p_plan = 'free' then public.free_daily_questions() end;
begin
  select count(*) into v_used from public.bank_reads where user_id = p_user and day = v_day;
  return jsonb_build_object(
    'open', p_open,
    'plan', p_plan,
    'limit', v_limit,
    'used', v_used,
    'left', case when v_limit is null then null else greatest(v_limit - v_used, 0) end,
    'day', to_char(v_day, 'YYYY-MM-DD'),
    'resetsAt', public.bank_iso(((v_day + 1)::timestamp + interval '4 hours') at time zone 'America/Merida'),
    'brake', jsonb_build_object('retryAt', public.bank_iso(p_retry))
  );
end;
$$;

-- ===================================================================== Funciones del alumno
-- El catálogo desde un seq. Con el banco cerrado, open false y sin filas. El equipo lo lee siempre
create or replace function public.catalog_changes(p_since bigint default 0, p_limit integer default 1000)
returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_since bigint := greatest(coalesce(p_since, 0), 0);
  v_limit integer := least(greatest(coalesce(p_limit, 1000), 1), 1000);
  v_open boolean;
  v_rows jsonb;
  v_count integer;
  v_last bigint;
begin
  if v_uid is null then
    raise exception 'Hace falta iniciar sesión' using errcode = '28000';
  end if;
  if not public.is_active_device() then
    raise exception 'Este dispositivo no es el activo de la cuenta' using errcode = '42501';
  end if;
  v_open := public.current_app_role() <> 'student' or public.bank_open_for_students();
  if not v_open then
    return jsonb_build_object('open', false, 'rows', '[]'::jsonb, 'nextSince', v_since, 'done', true);
  end if;
  select coalesce(jsonb_agg(public.bank_catalog_json(c) order by c.seq), '[]'::jsonb), count(*), max(c.seq)
    into v_rows, v_count, v_last
    from (
      select * from public.question_catalog where seq > v_since order by seq limit v_limit
    ) c;
  return jsonb_build_object(
    'open', true,
    'rows', v_rows,
    'nextSince', coalesce(v_last, v_since),
    'done', not exists (select 1 from public.question_catalog where seq > coalesce(v_last, v_since))
  );
end;
$$;

-- La cuota del alumno sin pedir preguntas
create or replace function public.bank_quota() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_role public.app_role;
begin
  if v_uid is null then
    raise exception 'Hace falta iniciar sesión' using errcode = '28000';
  end if;
  if not public.is_active_device() then
    raise exception 'Este dispositivo no es el activo de la cuenta' using errcode = '42501';
  end if;
  v_role := public.current_app_role();
  return public.bank_quota_json(
    v_uid, v_role <> 'student',
    case when v_role <> 'student' then v_role::text else public.user_plan(v_uid) end,
    v_role <> 'student' or public.bank_open_for_students(), null
  );
end;
$$;

-- Los cuerpos de las preguntas que pide el alumno. p_question_ids son ids estables y devuelve la versión
-- publicada. p_version_ids son versiones exactas que alguna vez se aprobaron, para duelos e historia.
-- Lo que no se concede sale en denied con su motivo, sin lanzar error (2.6)
create or replace function public.fetch_questions(
  p_question_ids uuid[] default null,
  p_version_ids uuid[] default null,
  p_purpose text default 'practice'
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_role public.app_role;
  v_team boolean;
  v_plan text;
  v_open boolean;
  v_day date := public.study_day();
  v_ids uuid[] := '{}';
  v_versions uuid[] := '{}';
  v_questions uuid[] := '{}';
  v_cases uuid[] := '{}';
  v_reasons text[] := '{}';
  v_done boolean[] := '{}';
  v_granted uuid[] := '{}';
  v_denied jsonb := '[]'::jsonb;
  v_left integer;
  v_minute integer;
  v_hour integer;
  v_per_minute integer := public.bank_limit('perMinute', 300)::integer;
  v_per_hour integer := public.bank_limit('perHour', 900)::integer;
  v_retry timestamptz;
  v_braked boolean := false;
  v_id uuid;
  v_row record;
  v_index integer;
  v_other integer;
  v_unit integer[];
  v_new integer;
  v_total integer;
  v_published integer;
  v_distinct integer;
begin
  if v_uid is null then
    raise exception 'Hace falta iniciar sesión' using errcode = '28000';
  end if;
  if not public.is_active_device() then
    raise exception 'Este dispositivo no es el activo de la cuenta' using errcode = '42501';
  end if;
  if p_purpose is null or p_purpose not in ('practice', 'exam', 'duel', 'review', 'other') then
    raise exception 'Propósito de lectura desconocido' using errcode = '22023';
  end if;
  if coalesce(cardinality(p_question_ids), 0) + coalesce(cardinality(p_version_ids), 0)
     > public.bank_limit('maxFetch', 100) then
    raise exception 'Se piden demasiadas preguntas a la vez' using errcode = '22023';
  end if;
  v_role := public.current_app_role();
  v_team := v_role <> 'student';
  v_plan := case when v_team then v_role::text else public.user_plan(v_uid) end;
  v_open := v_team or public.bank_open_for_students();

  -- Qué versión corresponde a cada id pedido, en el orden pedido
  foreach v_id in array coalesce(p_question_ids, '{}') loop
    select r.question_id, r.status, r.published_version_id, q.case_id into v_row
      from public.bank_questions r
      left join public.questions q on q.id = r.published_version_id
      where r.question_id = v_id;
    v_ids := array_append(v_ids, v_id);
    v_questions := array_append(v_questions, v_row.question_id);
    v_versions := array_append(v_versions, v_row.published_version_id);
    v_cases := array_append(v_cases, v_row.case_id);
    v_reasons := array_append(v_reasons, case
      when not v_open then 'closed'
      when v_row.question_id is null or v_row.published_version_id is null then 'not_found'
      when v_row.status = 'retired' then 'retired' end);
    v_done := array_append(v_done, false);
    v_row := null;
  end loop;
  foreach v_id in array coalesce(p_version_ids, '{}') loop
    select q.id, q.question_id, q.case_id, q.editorial_status, r.status into v_row
      from public.questions q
      join public.bank_questions r on r.question_id = q.question_id
      where q.id = v_id;
    v_ids := array_append(v_ids, v_id);
    v_questions := array_append(v_questions, v_row.question_id);
    v_versions := array_append(v_versions, v_row.id);
    v_cases := array_append(v_cases, v_row.case_id);
    v_reasons := array_append(v_reasons, case
      when not v_open then 'closed'
      when v_row.id is null or v_row.editorial_status <> 'approved' then 'not_found'
      when v_row.status = 'retired' then 'retired' end);
    v_done := array_append(v_done, false);
    v_row := null;
  end loop;

  -- Un alumno a la vez por cuenta, así dos pestañas no se brincan el tope
  perform pg_advisory_xact_lock(hashtextextended('bank-read:' || v_uid::text, 0));
  if not v_team and v_plan = 'free' then
    select public.free_daily_questions() - count(*) into v_left
      from public.bank_reads where user_id = v_uid and day = v_day;
  end if;

  for v_index in 1 .. coalesce(array_length(v_ids, 1), 0) loop
    continue when v_done[v_index] or v_reasons[v_index] is not null;
    -- La unidad es la pregunta, o todo lo pedido de su caso seriado
    v_unit := array[v_index];
    if v_cases[v_index] is not null then
      for v_other in v_index + 1 .. array_length(v_ids, 1) loop
        if not v_done[v_other] and v_reasons[v_other] is null and v_cases[v_other] = v_cases[v_index] then
          v_unit := array_append(v_unit, v_other);
        end if;
      end loop;
    end if;
    -- Preguntas nuevas del día en la unidad. Lo ya abierto hoy no gasta
    select count(distinct q) into v_new
      from unnest(v_unit) as u (i)
      cross join lateral (select v_questions[u.i] as q) s
      where not exists (
        select 1 from public.bank_reads b where b.user_id = v_uid and b.question_id = s.q and b.day = v_day
      );
    if not v_team and v_plan = 'free' then
      if v_new > v_left then
        foreach v_other in array v_unit loop
          v_reasons[v_other] := 'daily_limit';
        end loop;
        continue;
      end if;
      v_left := v_left - v_new;
    elsif not v_team and v_new > 0 then
      select count(*) filter (where created_at > now() - interval '1 minute'),
             count(*) filter (where created_at > now() - interval '1 hour')
        into v_minute, v_hour
        from public.bank_reads where user_id = v_uid and created_at > now() - interval '1 hour';
      if v_minute + v_new > v_per_minute or v_hour + v_new > v_per_hour then
        v_braked := true;
        v_retry := greatest(
          coalesce(v_retry, now()),
          case when v_minute + v_new > v_per_minute then coalesce((
            select min(created_at) from public.bank_reads
            where user_id = v_uid and created_at > now() - interval '1 minute'), now()) + interval '1 minute' end,
          case when v_hour + v_new > v_per_hour then coalesce((
            select min(created_at) from public.bank_reads
            where user_id = v_uid and created_at > now() - interval '1 hour'), now()) + interval '1 hour' end
        );
        foreach v_other in array v_unit loop
          v_reasons[v_other] := 'brake';
        end loop;
        continue;
      end if;
    end if;
    foreach v_other in array v_unit loop
      v_done[v_other] := true;
      insert into public.bank_reads (user_id, question_id, version_id, day, plan, purpose)
        values (v_uid, v_questions[v_other], v_versions[v_other], v_day, v_plan, p_purpose)
        on conflict (user_id, question_id, day) do nothing;
      if not v_versions[v_other] = any (v_granted) then
        v_granted := array_append(v_granted, v_versions[v_other]);
      end if;
    end loop;
  end loop;

  for v_index in 1 .. coalesce(array_length(v_ids, 1), 0) loop
    if v_reasons[v_index] is not null then
      v_denied := v_denied || jsonb_build_array(jsonb_build_object('id', v_ids[v_index], 'reason', v_reasons[v_index]));
    end if;
  end loop;

  -- Avisos al admin, sin bloquear (PC 4.10). Solo de alumnos
  if not v_team then
    select count(*) into v_total from public.bank_reads where user_id = v_uid and day = v_day;
    if v_total >= public.bank_limit('alertDaily', 600) then
      insert into public.bank_read_alerts (user_id, day, kind, value)
        values (v_uid, v_day, 'daily_volume', v_total) on conflict (user_id, day, kind) do nothing;
    end if;
    select count(*) into v_published from public.question_catalog where status = 'published';
    if v_published > 0 then
      select count(distinct question_id) into v_distinct
        from public.bank_reads where user_id = v_uid and day > v_day - 7;
      if v_distinct::numeric / v_published > public.bank_limit('alertWeekShare', 0.5) then
        insert into public.bank_read_alerts (user_id, day, kind, value)
          values (v_uid, v_day, 'week_share', round(v_distinct::numeric / v_published, 4))
          on conflict (user_id, day, kind) do nothing;
      end if;
    end if;
    if v_braked then
      insert into public.bank_read_alerts (user_id, day, kind, value)
        values (v_uid, v_day, 'brake', coalesce(v_minute, 0)) on conflict (user_id, day, kind) do nothing;
    end if;
  end if;

  return jsonb_build_object(
    'questions', coalesce((
      select jsonb_agg(public.bank_body_json(g.id) order by g.ord)
      from unnest(v_granted) with ordinality as g (id, ord)
    ), '[]'::jsonb),
    'cases', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id, 'vignette', c.vignette, 'createdAt', public.bank_iso(c.created_at)) order by c.id)
      from public.clinical_cases c
      where c.id in (select q.case_id from public.questions q where q.id = any (v_granted))
    ), '[]'::jsonb),
    'denied', v_denied,
    'quota', public.bank_quota_json(v_uid, v_team, v_plan, v_open, case when v_braked then v_retry end)
  );
end;
$$;

-- ===================================================================== Duelos con el banco de la nube
-- Con cloudBank prendida, un duelo solo lleva versiones aprobadas del banco de la nube. Con la bandera
-- apagada acepta los ids de la demo, como hasta hoy (8.13)
create or replace function public.party_duels_check_questions() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_id text;
begin
  if not public.bank_open_for_students() then
    return new;
  end if;
  foreach v_id in array new.question_ids loop
    if v_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' or not exists (
      select 1 from public.questions q
      join public.bank_questions r on r.question_id = q.question_id
      where q.id = v_id::uuid and q.editorial_status = 'approved' and r.status = 'active'
    ) then
      raise exception 'El duelo solo lleva preguntas aprobadas del banco' using errcode = '22023';
    end if;
  end loop;
  return new;
end;
$$;
do $$ begin
  if not exists (
    select 1 from pg_trigger where tgname = 'party_duels_bank_questions' and tgrelid = 'public.party_duels'::regclass
  ) then
    create trigger party_duels_bank_questions before insert on public.party_duels
      for each row execute function public.party_duels_check_questions();
  end if;
end $$;

-- ===================================================================== Permisos de las funciones
-- Ayudas internas, sin execute para nadie de la API
revoke all on function public.forbid_bank_changes() from public, anon, authenticated, service_role;
revoke all on function public.bank_version_issues(uuid) from public, anon, authenticated, service_role;
revoke all on function public.bank_incomplete_of(text[]) from public, anon, authenticated, service_role;
revoke all on function public.bank_refresh_incomplete(uuid) from public, anon, authenticated, service_role;
revoke all on function public.bank_publish(uuid) from public, anon, authenticated, service_role;
revoke all on function public.bank_catalog_retire(uuid) from public, anon, authenticated, service_role;
revoke all on function public.bank_catalog_json(public.question_catalog) from public, anon, authenticated, service_role;
revoke all on function public.bank_body_json(uuid) from public, anon, authenticated, service_role;
revoke all on function public.bank_quota_json(uuid, boolean, text, boolean, timestamptz)
  from public, anon, authenticated, service_role;
revoke all on function public.party_duels_check_questions() from public, anon, authenticated, service_role;
-- Del alumno, solo con sesión
revoke all on function public.catalog_changes(bigint, integer) from public, anon, authenticated, service_role;
grant execute on function public.catalog_changes(bigint, integer) to authenticated;
revoke all on function public.bank_quota() from public, anon, authenticated, service_role;
grant execute on function public.bank_quota() to authenticated;
revoke all on function public.fetch_questions(uuid[], uuid[], text) from public, anon, authenticated, service_role;
grant execute on function public.fetch_questions(uuid[], uuid[], text) to authenticated;
-- El tope viejo queda sin uso (H07). No se borra, solo deja de estar expuesto
revoke all on function public.grant_question_access(uuid) from public, anon, authenticated, service_role;
revoke all on function public.can_access_question(uuid) from public, anon, authenticated, service_role;
