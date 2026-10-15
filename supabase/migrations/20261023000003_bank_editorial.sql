-- Banco en la nube, parte 3. Flujo editorial, etiquetado a ciegas, reportes, distractores y pago a
-- médicos (B11 del plan del cambio, respuestas 57, 58, 64, 91 y 92, 1.7 a 1.10, 1.12, 1.13, 2.1, 4.1 a
-- 4.7 del plan de B11).
--
-- Reglas que se hacen cumplir aquí
--   - Todo lo editorial pasa por funciones editor_* y admin_*. El médico ve y edita solo lo que tiene
--     asignado como autor o revisor. El admin y el dueño ven todo, asignan, retiran y sincronizan, pero
--     no editan contenido ni aprueban. Para aprobar se necesita la cuenta de un médico (1.7)
--   - Las versiones no se editan. Guardar crea una versión nueva sobre la más reciente, con la versión
--     base al día (BK002). Solo se mueve la versión más reciente (D-099)
--   - Nada se publica solo. Publica únicamente la aprobación del revisor activo, distinto del autor de
--     esa versión (BK003), con las etiquetas a ciegas completas (BK004), sin pendientes (BK005) y con las
--     casillas confirmadas (BK008)
--   - Etiquetado a ciegas en cada revisión (respuesta 91, 8.9). Mientras el revisor no etiqueta todos los
--     distractores, editor_question le esconde la etiqueta del autor, las etiquetas secundarias y las
--     justificaciones de los distractores, también en la historia. Al completar, sus etiquetas se cierran
--     y ya no cambian, así ver la del autor no infla el acuerdo. La etiqueta del Sheet cuenta como la del
--     autor. Kappa de 0.4 en 30 pares para hablar de sesgos (bias_agreement_summary)
--   - review_decisions solo se agrega, una por versión y revisor. Es la base del pago por revisión. Un
--     disparador frena toda edición, también la del superusuario
--   - Un reporte de un alumno pasa por content_reports_guard aunque entre directo por la API. Llena la
--     pregunta, ignora el repetido abierto y frena al pasar de reportsPerDay al día (BK006). Encola el
--     correo al médico asignado con enqueue_email de B10, una vez por pregunta y día, sin datos del alumno
--     ni texto de la pregunta
--   - La cola de distractores que casi nadie elige la llena upsert_distractor_stats, solo con la llave de
--     servicio, con los umbrales del admin (B14 la llama)
--
-- Es idempotente, no lleva sentencias delete ni drop y no edita las migraciones anteriores (D-113). Va
-- después de 20261023000002_bank_core.sql

-- ===================================================================== Asignaciones
alter table public.review_assignments
  add column if not exists role text not null default 'reviewer' check (role in ('author', 'reviewer')),
  add column if not exists revoked_at timestamptz,
  add column if not exists revoked_by uuid references auth.users (id) on delete set null;
create unique index if not exists review_assignments_one_reviewer
  on public.review_assignments (question_id) where role = 'reviewer' and revoked_at is null;
create unique index if not exists review_assignments_one_author
  on public.review_assignments (question_id) where role = 'author' and revoked_at is null;

-- Revisor por omisión de cada subespecialidad, para lo que llega sin Revisor
create table if not exists public.bank_topic_reviewers (
  branch text not null,
  topic text not null,
  physician_id uuid not null references auth.users (id) on delete cascade,
  set_by uuid references auth.users (id) on delete set null,
  set_at timestamptz not null default now(),
  primary key (branch, topic)
);

-- Clave corta de cada médico para las columnas Autor y Revisor del Sheet. Sin correos en el Sheet
create table if not exists public.physician_codes (
  code text primary key check (code ~ '^[A-Z][A-Z0-9]{1,7}$'),
  user_id uuid not null unique references auth.users (id) on delete cascade,
  set_by uuid references auth.users (id) on delete set null,
  set_at timestamptz not null default now()
);

-- ===================================================================== Decisiones
alter table public.review_decisions
  add column if not exists question_id uuid,
  add column if not exists version integer,
  -- Casillas que confirmó el revisor al aprobar
  add column if not exists checks text[] not null default '{}';
create unique index if not exists review_decisions_one_per_version
  on public.review_decisions (question_version_id, physician_id);
create index if not exists review_decisions_physician_at
  on public.review_decisions (physician_id, decided_at);
do $$ begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'review_decisions_append_only' and tgrelid = 'public.review_decisions'::regclass
  ) then
    create trigger review_decisions_append_only before update on public.review_decisions
      for each row execute function public.forbid_bank_changes();
  end if;
end $$;

-- ===================================================================== Etiquetas a ciegas
create table if not exists public.bias_labels (
  -- Id estable de la opción. Una opción que sigue en la versión siguiente conserva su etiqueta
  option_id uuid not null,
  labeler_id uuid not null references auth.users (id) on delete cascade,
  question_version_id uuid not null references public.questions (id),
  tag text not null references public.bank_bias_tags (tag),
  -- La del autor en esa versión, guardada al etiquetar, así el par no cambia con otra versión
  author_tag text,
  source text not null default 'blind_review' check (source in ('blind_review')),
  labeled_at timestamptz not null default now(),
  -- Al completar los distractores de la versión ya no cambia
  locked_at timestamptz,
  primary key (option_id, labeler_id)
);

-- ===================================================================== Reportes de contenido
alter table public.content_reports
  add column if not exists question_id uuid,
  add column if not exists resolved_at timestamptz,
  add column if not exists resolved_by uuid references auth.users (id) on delete set null,
  add column if not exists notified_at timestamptz;
create index if not exists content_reports_question on public.content_reports (question_id, status);
create index if not exists content_reports_reporter_created on public.content_reports (reporter_id, created_at);

-- ===================================================================== Distractores
create table if not exists public.distractor_flags (
  id uuid primary key default public.ulid_uuid(),
  question_id uuid not null,
  option_id uuid not null,
  question_version_id uuid not null references public.questions (id),
  exposures integer not null check (exposures >= 0),
  choices integer not null check (choices >= 0),
  attraction numeric(6, 4) not null,
  source text not null check (source in ('calibration')),
  status text not null default 'open' check (status in ('open', 'edited', 'kept', 'dismissed')),
  flagged_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references auth.users (id) on delete set null,
  note text check (char_length(note) <= 500),
  unique (option_id, question_version_id)
);
create index if not exists distractor_flags_question on public.distractor_flags (question_id, status);

-- ===================================================================== Permisos de tablas
alter table public.bank_topic_reviewers enable row level security;
alter table public.physician_codes enable row level security;
alter table public.bias_labels enable row level security;
alter table public.distractor_flags enable row level security;
revoke all on public.bank_topic_reviewers, public.physician_codes, public.bias_labels, public.distractor_flags
  from public, anon, authenticated, service_role;

-- Defensa de más, por si alguien vuelve a dar permisos de tabla. Las preguntas y los casos solo los ve el
-- equipo. Un alumno los lee con fetch_questions. El médico cuenta con current_app_role, así que con
-- requireMfa (B9) también pide su segundo factor
alter policy questions_select on public.questions using (
  public.is_admin()
  or (
    public.current_app_role() = 'physician'
    and exists (
      select 1 from public.review_assignments ra
      where ra.question_id = questions.question_id and ra.physician_id = auth.uid() and ra.revoked_at is null
    )
  )
);
alter policy cases_select on public.clinical_cases using (
  public.is_admin()
  or (
    public.current_app_role() = 'physician'
    and exists (
      select 1 from public.questions q
      join public.review_assignments ra on ra.question_id = q.question_id
      where q.case_id = clinical_cases.id and ra.physician_id = auth.uid() and ra.revoked_at is null
    )
  )
);

-- ===================================================================== Ayudas internas
-- Rol del equipo de quien llama. Sin sesión 28000 y un alumno 42501. Con B9, current_app_role ya pide
-- segundo factor al equipo, así que sin aal2 cuenta como alumno
create or replace function public.bank_team_role() returns public.app_role
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_role public.app_role;
begin
  if auth.uid() is null then
    raise exception 'Hace falta iniciar sesión' using errcode = '28000';
  end if;
  v_role := public.current_app_role();
  if v_role = 'student' then
    raise exception 'Solo el equipo médico' using errcode = '42501';
  end if;
  return v_role;
end;
$$;

-- El médico activo de una pregunta con ese papel
create or replace function public.bank_assignee(p_question_id uuid, p_role text) returns uuid
language sql stable security definer set search_path = public, pg_temp as $$
  select physician_id from public.review_assignments
  where question_id = p_question_id and role = p_role and revoked_at is null
$$;

-- El médico asignado de una pregunta. Su revisor activo, si no su autor y si tampoco, nadie (8.6)
create or replace function public.bank_assigned_physician(p_question_id uuid) returns uuid
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(public.bank_assignee(p_question_id, 'reviewer'), public.bank_assignee(p_question_id, 'author'))
$$;

-- Si quien llama puede ver una pregunta. El admin todo, el médico lo asignado
create or replace function public.bank_can_see(p_question_id uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select public.is_admin() or exists (
    select 1 from public.review_assignments
    where question_id = p_question_id and physician_id = auth.uid() and revoked_at is null
  )
$$;

-- Una persona como la ve el equipo, con su alias y su clave del Sheet. Nunca el correo
create or replace function public.bank_person(p_user uuid) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select case when p_user is null then null else jsonb_build_object(
    'id', p_user,
    'alias', coalesce((select alias from public.profiles where id = p_user), ''),
    'code', (select code from public.physician_codes where user_id = p_user)
  ) end
$$;

-- La clave corta de una pregunta para el reporte y el correo. El ID del Sheet o 8 caracteres del id
create or replace function public.bank_question_key(p_question_id uuid) returns text
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(
    (select regexp_replace(source_key, '^[a-z_]+:', '') from public.bank_questions where question_id = p_question_id),
    left(p_question_id::text, 8)
  )
$$;

-- Estado de la revisión a ciegas de una versión para una persona (4.4)
create or replace function public.bank_review_state(p_version_id uuid, p_user uuid) returns text
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_version public.questions%rowtype;
begin
  select * into v_version from public.questions where id = p_version_id;
  if not found or v_version.editorial_status <> 'in_review'
     or public.bank_assignee(v_version.question_id, 'reviewer') is distinct from p_user then
    return 'none';
  end if;
  if exists (
    select 1 from public.question_options o
    where o.question_version_id = p_version_id and not o.is_correct
      and not exists (
        select 1 from public.bias_labels l
        where l.option_id = coalesce(o.option_id, o.id) and l.labeler_id = p_user and l.locked_at is not null
      )
  ) then
    return 'blind_pending';
  end if;
  return 'ready';
end;
$$;

-- Si el revisor activo todavía no ve lo del autor en una versión. Lo ve hasta tener cerradas sus
-- etiquetas a ciegas de cada distractor de esa versión, en cualquier estado, también en borrador (M5 de
-- la revisión). Para cualquier otra persona da false
create or replace function public.bank_reviewer_blind(p_version_id uuid, p_user uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((
    select public.bank_assignee(q.question_id, 'reviewer') = p_user
      and exists (
        select 1 from public.question_options o
        where o.question_version_id = q.id and not o.is_correct
          and not exists (
            select 1 from public.bias_labels l
            where l.option_id = coalesce(o.option_id, o.id) and l.labeler_id = p_user and l.locked_at is not null
          )
      )
    from public.questions q where q.id = p_version_id
  ), false)
$$;

-- Un renglón de editor_list (EditorListItem de src/data/bank/contracts.ts)
create or replace function public.bank_list_item(p_question_id uuid, p_user uuid) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'questionId', r.question_id,
    'sourceKey', r.source_key,
    'latestVersionId', v.id,
    'version', v.version,
    'status', v.editorial_status,
    'publishedVersion', (select p.version from public.questions p where p.id = r.published_version_id),
    'branch', v.branch, 'topic', v.topic, 'subtopic', coalesce(v.subtopic, ''),
    'difficulty', coalesce(v.difficulty, 3),
    'promptPreview', left(coalesce(v.body ->> 'prompt', ''), 140),
    'author', public.bank_person(public.bank_assignee(r.question_id, 'author')),
    'reviewer', public.bank_person(public.bank_assignee(r.question_id, 'reviewer')),
    'myRole', case
      when public.is_admin() then 'admin'
      when public.bank_assignee(r.question_id, 'reviewer') = p_user then 'reviewer'
      else 'author' end,
    'reviewState', public.bank_review_state(v.id, p_user),
    'incomplete', to_jsonb(v.incomplete),
    'flags', to_jsonb(v.review_flags),
    'openReports', (select count(*) from public.content_reports c where c.question_id = r.question_id and c.status = 'open'),
    'openDistractorFlags', (select count(*) from public.distractor_flags f where f.question_id = r.question_id and f.status = 'open'),
    'conflict', r.conflict_since is not null,
    'missing', r.sheet_missing_since is not null,
    'retireRequested', r.retire_requested_at is not null,
    'retired', r.status = 'retired',
    'updatedAt', public.bank_iso(r.updated_at)
  )
  from public.bank_questions r
  join public.questions v on v.id = r.latest_version_id
  where r.question_id = p_question_id
$$;

-- Una versión para el editor (EditorVersion). p_hide esconde lo del autor durante el paso a ciegas
create or replace function public.bank_version_json(p_version_id uuid, p_hide boolean) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'versionId', q.id, 'version', q.version, 'status', q.editorial_status, 'source', q.version_source,
    'author', public.bank_person(q.author_id),
    'createdAt', public.bank_iso(q.created_at), 'submittedAt', public.bank_iso(q.submitted_at),
    'decidedAt', public.bank_iso(q.decided_at),
    'branch', q.branch, 'topic', q.topic, 'subtopic', coalesce(q.subtopic, ''),
    'difficulty', coalesce(q.difficulty, 3), 'itemKinds', to_jsonb(q.item_kinds),
    'structure', jsonb_build_object(
      -- Vacía si no se detectó, para que el editor pida elegirla (task_undetected)
      'polarity', coalesce(q.polarity, 'affirmative'), 'task', coalesce(q.task, ''),
      'format', coalesce(q.format, 'direct'), 'source', coalesce(q.structure_source, 'auto')),
    'vignette', coalesce(q.body ->> 'vignette', ''), 'prompt', coalesce(q.body ->> 'prompt', ''),
    'explanation', coalesce(q.body ->> 'explanation', ''),
    'gpcRefs', case when jsonb_typeof(q.body -> 'gpcRefs') = 'array' then q.body -> 'gpcRefs' else '[]'::jsonb end,
    'clues', case when jsonb_typeof(q.body -> 'clues') = 'array' then q.body -> 'clues' else '[]'::jsonb end,
    'caseId', q.case_id, 'caseOrder', q.case_order, 'variantOf', q.variant_of,
    'canonicalOptionIds', to_jsonb(q.canonical_option_ids),
    'options', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', o.id, 'optionId', coalesce(o.option_id, o.id), 'letter', o.letter,
        'position', coalesce(o.position, 0), 'text', o.text, 'isCorrect', o.is_correct,
        'biasTag', case when p_hide and not o.is_correct then null else o.bias_tag end,
        'secondaryBiasTags', case when p_hide and not o.is_correct then '[]'::jsonb else to_jsonb(o.secondary_bias_tags) end,
        'rationale', case when p_hide and not o.is_correct then null else o.rationale end,
        'hidden', p_hide and not o.is_correct
      ) order by o.position nulls last, o.id)
      from public.question_options o where o.question_version_id = q.id
    ), '[]'::jsonb),
    'incomplete', to_jsonb(q.incomplete),
    'flags', to_jsonb(q.review_flags),
    'decisions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'physician', jsonb_build_object('id', d.physician_id,
          'alias', coalesce((select alias from public.profiles where id = d.physician_id), '')),
        'decision', d.decision, 'comment', d.comment, 'decidedAt', public.bank_iso(d.decided_at)
      ) order by d.decided_at)
      from public.review_decisions d where d.question_version_id = q.id
    ), '[]'::jsonb)
  )
  from public.questions q where q.id = p_version_id
$$;

-- Revisa que un contenido se pueda guardar como versión. No revisa lo que falta para aprobar, que es de
-- bank_version_issues. Lanza 22023 con lo que no se puede representar (3.4)
create or replace function public.bank_check_content(p_content jsonb) returns void
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_options jsonb := p_content -> 'options';
  v_option jsonb;
  v_kind text;
begin
  if jsonb_typeof(p_content) <> 'object' then
    raise exception 'El borrador no tiene la forma esperada' using errcode = '22023';
  end if;
  if not public.bank_taxonomy_has(p_content ->> 'branch', p_content ->> 'topic', p_content ->> 'subtopic') then
    raise exception 'Rama, subespecialidad o subtema fuera de la taxonomía' using errcode = '22023';
  end if;
  if coalesce((p_content ->> 'difficulty')::numeric, 0) not in (1, 2, 3, 4, 5) then
    raise exception 'La dificultad va del 1 al 5' using errcode = '22023';
  end if;
  if coalesce(p_content ->> 'polarity', '') not in ('affirmative', 'negative')
     -- Sin tarea entra como pendiente task_undetected (decisión de Ricardo en la revisión de B11)
     or coalesce(p_content ->> 'task', '') not in ('', 'diagnosis', 'next_step', 'initial_study', 'confirmatory_study',
       'initial_treatment', 'treatment_of_choice', 'mechanism', 'risk_factor', 'complication_prognosis',
       'prevention_screening', 'data_interpretation')
     or coalesce(p_content ->> 'format', '') not in ('clinical_case', 'direct', 'serial_case') then
    raise exception 'Estructura desconocida' using errcode = '22023';
  end if;
  if jsonb_typeof(p_content -> 'itemKinds') = 'array' then
    for v_kind in select jsonb_array_elements_text(p_content -> 'itemKinds') loop
      if v_kind not in ('inverse_resolution', 'incoherent', 'control', 'obscure_detail', 'patient_perspective') then
        raise exception 'Tipo de reactivo desconocido' using errcode = '22023';
      end if;
    end loop;
  end if;
  if char_length(coalesce(p_content ->> 'prompt', '')) > 1000
     or char_length(coalesce(p_content ->> 'vignette', '')) > 8000
     or char_length(coalesce(p_content ->> 'explanation', '')) > 4000 then
    raise exception 'Un texto pasa del límite del esquema' using errcode = '22023';
  end if;
  if jsonb_typeof(p_content -> 'gpcRefs') = 'array' and (
    jsonb_array_length(p_content -> 'gpcRefs') > 10
    or exists (select 1 from jsonb_array_elements(p_content -> 'gpcRefs') r where char_length(coalesce(r ->> 'title', '')) > 300)
  ) then
    raise exception 'Demasiadas referencias o una muy larga' using errcode = '22023';
  end if;
  if jsonb_typeof(p_content -> 'clues') = 'array' and jsonb_array_length(p_content -> 'clues') > 20 then
    raise exception 'Demasiados datos del caso' using errcode = '22023';
  end if;
  if jsonb_typeof(v_options) <> 'array' or jsonb_array_length(v_options) < 2 or jsonb_array_length(v_options) > 10 then
    raise exception 'Una pregunta lleva de 2 a 10 opciones para guardarse' using errcode = '22023';
  end if;
  for v_option in select * from jsonb_array_elements(v_options) loop
    if btrim(coalesce(v_option ->> 'text', '')) = '' or char_length(v_option ->> 'text') > 1000
       or char_length(coalesce(v_option ->> 'rationale', '')) > 1500 then
      raise exception 'Cada opción lleva texto y respeta los límites' using errcode = '22023';
    end if;
  end loop;
end;
$$;

-- Crea una versión nueva en borrador con sus opciones y devuelve su id. p_content es la forma interna
-- {branch, topic, subtopic, difficulty, itemKinds, polarity, task, format, structureSource, language,
-- vignette, prompt, explanation, gpcRefs, clues, options:[{optionId, letter, text, isCorrect, biasTag,
-- secondaryBiasTags, rationale, canonical}]}. Una opción sin optionId recibe uno nuevo. p_incomplete,
-- si viene, es lo que dijo el convertidor del Sheet. Si no, se calcula con bank_version_issues
create or replace function public.bank_insert_version(
  p_question_id uuid,
  p_content jsonb,
  p_source text,
  p_author uuid,
  p_case_id uuid,
  p_case_order integer,
  p_variant_of uuid,
  p_flags text[],
  p_incomplete text[] default null
) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_id uuid := public.ulid_uuid();
  v_version integer;
  v_canonical uuid[];
begin
  perform public.bank_check_content(p_content);
  select coalesce(max(version), 0) + 1 into v_version from public.questions where question_id = p_question_id;
  insert into public.questions (
    id, question_id, version, case_id, branch, topic, body, editorial_status, is_demo, subtopic,
    polarity, task, format, structure_source, difficulty, item_kinds, case_order, variant_of, language,
    version_source, author_id, review_flags
  ) values (
    v_id, p_question_id, v_version, p_case_id, p_content ->> 'branch', p_content ->> 'topic',
    jsonb_build_object(
      'vignette', coalesce(p_content ->> 'vignette', ''),
      'prompt', coalesce(p_content ->> 'prompt', ''),
      'explanation', coalesce(p_content ->> 'explanation', ''),
      'gpcRefs', case when jsonb_typeof(p_content -> 'gpcRefs') = 'array' then p_content -> 'gpcRefs' else '[]'::jsonb end,
      'clues', case when jsonb_typeof(p_content -> 'clues') = 'array' then p_content -> 'clues' else '[]'::jsonb end
    ),
    'draft', false, p_content ->> 'subtopic', p_content ->> 'polarity', nullif(p_content ->> 'task', ''),
    p_content ->> 'format', coalesce(p_content ->> 'structureSource', 'auto'), (p_content ->> 'difficulty')::smallint,
    coalesce(array(select jsonb_array_elements_text(
      case when jsonb_typeof(p_content -> 'itemKinds') = 'array' then p_content -> 'itemKinds' else '[]'::jsonb end)), '{}'),
    p_case_order, p_variant_of, coalesce(p_content ->> 'language', 'es'), p_source, p_author,
    coalesce(p_flags, '{}')
  );
  insert into public.question_options (
    id, question_version_id, option_id, position, letter, text, is_correct, bias_tag,
    secondary_bias_tags, rationale
  )
  select public.ulid_uuid(), v_id, coalesce(nullif(o.value ->> 'optionId', '')::uuid, public.ulid_uuid()),
         (o.ord - 1)::smallint, nullif(o.value ->> 'letter', ''), btrim(o.value ->> 'text'),
         coalesce((o.value ->> 'isCorrect')::boolean, false),
         case when coalesce((o.value ->> 'isCorrect')::boolean, false) then null else nullif(o.value ->> 'biasTag', '') end,
         case when coalesce((o.value ->> 'isCorrect')::boolean, false) or jsonb_typeof(o.value -> 'secondaryBiasTags') <> 'array'
           then '{}'::text[] else array(select jsonb_array_elements_text(o.value -> 'secondaryBiasTags')) end,
         btrim(coalesce(o.value ->> 'rationale', ''))
  from jsonb_array_elements(p_content -> 'options') with ordinality as o (value, ord);
  select array_agg(id order by position) into v_canonical
    from public.question_options
    where question_version_id = v_id
      and position in (
        select (o.ord - 1) from jsonb_array_elements(p_content -> 'options') with ordinality as o (value, ord)
        where coalesce((o.value ->> 'canonical')::boolean, false)
      );
  update public.questions set canonical_option_ids = coalesce(v_canonical, '{}') where id = v_id;
  if p_incomplete is null then
    perform public.bank_refresh_incomplete(v_id);
  else
    update public.questions set incomplete = p_incomplete where id = v_id;
  end if;
  return v_id;
end;
$$;

-- El borrador del editor (QuestionDraft de editorDraft.ts con ids uuid) a la forma interna. Las opciones
-- que ya existían en la pregunta conservan su id estable. Una que no es de la pregunta lanza 22023
create or replace function public.bank_draft_content(p_draft jsonb, p_question_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_option jsonb;
begin
  if jsonb_typeof(p_draft) <> 'object' or jsonb_typeof(p_draft -> 'options') <> 'array'
     or jsonb_typeof(p_draft -> 'structure') <> 'object' then
    raise exception 'El borrador no tiene la forma esperada' using errcode = '22023';
  end if;
  for v_option in select * from jsonb_array_elements(p_draft -> 'options') loop
    if nullif(v_option ->> 'optionId', '') is not null and (
      p_question_id is null or not exists (
        select 1 from public.question_options o join public.questions q on q.id = o.question_version_id
        where q.question_id = p_question_id and o.option_id = (v_option ->> 'optionId')::uuid
      )
    ) then
      raise exception 'Una opción no es de esta pregunta' using errcode = '22023';
    end if;
  end loop;
  return jsonb_build_object(
    'branch', p_draft ->> 'branch', 'topic', p_draft ->> 'topic', 'subtopic', p_draft ->> 'subtopic',
    'difficulty', p_draft -> 'physicianDifficulty', 'itemKinds', coalesce(p_draft -> 'itemKinds', '[]'::jsonb),
    'polarity', p_draft -> 'structure' ->> 'polarity', 'task', p_draft -> 'structure' ->> 'task',
    'format', p_draft -> 'structure' ->> 'format', 'structureSource', 'physician',
    'language', coalesce(p_draft ->> 'language', 'es'),
    'vignette', coalesce(p_draft ->> 'vignette', ''), 'prompt', coalesce(p_draft ->> 'prompt', ''),
    'explanation', coalesce(p_draft ->> 'explanation', ''),
    'gpcRefs', coalesce(p_draft -> 'gpcRefs', '[]'::jsonb), 'clues', coalesce(p_draft -> 'clues', '[]'::jsonb),
    'options', p_draft -> 'options'
  );
end;
$$;

-- Lo que devuelve guardar una versión
create or replace function public.bank_save_result(p_version_id uuid) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object('status', 'saved', 'questionId', question_id, 'versionId', id,
    'version', version, 'incomplete', to_jsonb(incomplete))
  from public.questions where id = p_version_id
$$;

-- Un umbral del admin (admin_overrides.thresholds) con su valor de respaldo
create or replace function public.bank_threshold(p_group text, p_field text, p_default numeric) returns numeric
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_value numeric;
begin
  select (value -> 'thresholds' -> p_group ->> p_field)::numeric into v_value
    from public.platform_settings where key = 'admin_overrides';
  return coalesce(v_value, p_default);
exception when others then
  return p_default;
end;
$$;

-- Asigna un papel a un médico en una pregunta. Quita al anterior de ese papel sin borrarlo. Un médico
-- no puede tener los dos papeles en la misma pregunta (BK003)
create or replace function public.bank_assign(p_question_id uuid, p_role text, p_physician uuid, p_by uuid)
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_current public.review_assignments%rowtype;
begin
  if p_physician is null then
    return;
  end if;
  select * into v_current from public.review_assignments where question_id = p_question_id and physician_id = p_physician;
  if found and v_current.revoked_at is null and v_current.role = p_role then
    return;
  end if;
  if found and v_current.revoked_at is null and v_current.role <> p_role then
    raise exception 'Autor y revisor tienen que ser distintos' using errcode = 'BK003';
  end if;
  update public.review_assignments set revoked_at = now(), revoked_by = p_by
    where question_id = p_question_id and role = p_role and revoked_at is null;
  insert into public.review_assignments (question_id, physician_id, assigned_by, assigned_at, role)
    values (p_question_id, p_physician, p_by, now(), p_role)
    on conflict (question_id, physician_id) do update set
      role = excluded.role, assigned_by = excluded.assigned_by, assigned_at = excluded.assigned_at,
      revoked_at = null, revoked_by = null;
end;
$$;

-- Manda a revisión la versión más reciente si está completa y tiene un revisor distinto de su autor. Si
-- el revisor activo escribió esa versión, la revisa el autor asignado, que cambia de papel con él. Sin
-- otro médico lanza BK003. Devuelve el revisor
create or replace function public.bank_send_to_review(p_version_id uuid, p_by uuid) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_version public.questions%rowtype;
  v_reviewer uuid;
  v_author uuid;
  v_default uuid;
  v_issues text[];
begin
  select * into v_version from public.questions where id = p_version_id for update;
  if exists (select 1 from public.review_decisions where question_version_id = p_version_id) then
    raise exception 'Ya se decidió sobre esta versión. Los cambios van en una versión nueva' using errcode = '22023';
  end if;
  v_issues := public.bank_version_issues(p_version_id);
  if cardinality(v_issues) > 0 then
    raise exception 'La versión tiene pendientes' using errcode = 'BK005', detail = array_to_string(v_issues, ',');
  end if;
  v_reviewer := public.bank_assignee(v_version.question_id, 'reviewer');
  v_author := public.bank_assignee(v_version.question_id, 'author');
  if v_reviewer is null then
    -- Solo si sigue siendo médico, como las claves del Sheet en bank_apply_row (B1 de la revisión)
    select t.physician_id into v_default from public.bank_topic_reviewers t
      join public.user_roles r on r.user_id = t.physician_id and r.role = 'physician'
      where t.branch = v_version.branch and t.topic = v_version.topic;
    if v_default is not null and v_default is distinct from v_version.author_id
       and v_default is distinct from v_author then
      perform public.bank_assign(v_version.question_id, 'reviewer', v_default, p_by);
      v_reviewer := v_default;
    end if;
  end if;
  if v_reviewer is not null and v_reviewer = v_version.author_id then
    -- El revisor editó la pregunta. La revisa el autor asignado, si es otro médico
    if v_author is null or v_author = v_version.author_id then
      raise exception 'Hace falta otro médico para revisar esta versión' using errcode = 'BK003';
    end if;
    update public.review_assignments set revoked_at = now()
      where question_id = v_version.question_id and physician_id = v_reviewer and revoked_at is null;
    update public.review_assignments set role = 'reviewer'
      where question_id = v_version.question_id and physician_id = v_author and revoked_at is null;
    update public.review_assignments set role = 'author', revoked_at = null, revoked_by = null
      where question_id = v_version.question_id and physician_id = v_reviewer;
    v_reviewer := v_author;
  end if;
  if v_reviewer is null then
    raise exception 'La pregunta no tiene revisor distinto del autor' using errcode = 'BK003';
  end if;
  update public.questions set editorial_status = 'in_review', submitted_at = now() where id = p_version_id;
  update public.bank_questions set updated_at = now() where question_id = v_version.question_id;
  return v_reviewer;
end;
$$;

-- ===================================================================== Funciones del alumno
-- Reporta un error en la versión que el alumno tenía a la vista. Solo motivos cerrados, sin texto libre
-- (8.30). El guardián de content_reports cuida el repetido y el tope del día
create or replace function public.report_question(p_version_id uuid, p_reason text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'Hace falta iniciar sesión' using errcode = '28000';
  end if;
  if not public.is_active_device() then
    raise exception 'Este dispositivo no es el activo de la cuenta' using errcode = '42501';
  end if;
  if p_reason is null or p_reason not in ('clinical_error', 'wrong_key', 'typo', 'outdated', 'other') then
    raise exception 'Motivo de reporte desconocido' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.questions q join public.bank_questions r on r.question_id = q.question_id
    where q.id = p_version_id
  ) then
    return jsonb_build_object('status', 'not_found', 'reportId', null);
  end if;
  begin
    insert into public.content_reports (reporter_id, target_kind, target_id, reason)
      values (v_uid, 'question', p_version_id, p_reason)
      returning id into v_id;
  exception when sqlstate 'BK006' then
    return jsonb_build_object('status', 'limit', 'reportId', null);
  end;
  return jsonb_build_object('status', case when v_id is null then 'duplicate' else 'created' end, 'reportId', v_id);
end;
$$;

-- El acuerdo global entre autor y revisor, para que todos los alumnos lean lo mismo. Con menos de
-- minLabeledPairs, o sin kappa definido, dice calibrando y trampas. Con kappa de minKappaForBiasLanguage
-- o más dice sesgos. Es la misma regla de computeAgreement (src/engines/agreement.ts) con los pares de
-- autor y revisor, y tests/content/kappaParity.test.ts revisa que den el mismo kappa
create or replace function public.bias_agreement_summary() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_min_pairs integer := public.bank_threshold('bias', 'minLabeledPairs', 30)::integer;
  v_min_kappa numeric := public.bank_threshold('bias', 'minKappaForBiasLanguage', 0.4);
  v_pairs integer;
  v_observed numeric;
  v_expected numeric;
  v_kappa numeric;
begin
  if auth.uid() is null then
    raise exception 'Hace falta iniciar sesión' using errcode = '28000';
  end if;
  -- Los mismos pares que editor_label_pairs. Sin los de quien etiquetó una versión que él escribió
  with pairs as (
    select l.author_tag, l.tag from public.bias_labels l
    join public.questions q on q.id = l.question_version_id
    where l.author_tag is not null and l.locked_at is not null and q.author_id is distinct from l.labeler_id
  )
  select count(*), avg(case when author_tag = tag then 1 else 0 end) into v_pairs, v_observed from pairs;
  if v_pairs > 0 then
    with pairs as (
      select l.author_tag, l.tag from public.bias_labels l
      join public.questions q on q.id = l.question_version_id
      where l.author_tag is not null and l.locked_at is not null and q.author_id is distinct from l.labeler_id
    )
    select sum((a.n::numeric / v_pairs) * (coalesce(b.n, 0)::numeric / v_pairs)) into v_expected
      from (select author_tag as category, count(*) as n from pairs group by author_tag) a
      left join (select tag as category, count(*) as n from pairs group by tag) b on b.category = a.category;
    if 1 - v_expected >= 1e-12 then
      v_kappa := (v_observed - v_expected) / (1 - v_expected);
    end if;
  end if;
  return jsonb_build_object(
    'pairs', v_pairs,
    'kappa', round(v_kappa, 6),
    'vocabulary', case when v_pairs >= v_min_pairs and v_kappa >= v_min_kappa then 'bias' else 'trap' end,
    'calibrating', v_pairs < v_min_pairs or v_kappa is null,
    'minPairs', v_min_pairs,
    'minKappa', v_min_kappa
  );
end;
$$;

-- ===================================================================== Disparadores de los reportes
-- Antes de guardar un reporte, aunque llegue directo por la API. Llena la pregunta desde la versión
-- reportada, ignora el repetido abierto (mismo alumno, versión y motivo) devolviendo null y frena con
-- BK006 al pasar de reportsPerDay en el día de estudio
create or replace function public.content_reports_guard() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_day_start timestamptz := (public.study_day()::timestamp + interval '4 hours') at time zone 'America/Merida';
begin
  if new.target_kind = 'question' then
    select question_id into new.question_id from public.questions where id = new.target_id;
  end if;
  if exists (
    select 1 from public.content_reports
    where reporter_id = new.reporter_id and target_id = new.target_id and reason = new.reason and status = 'open'
  ) then
    return null;
  end if;
  perform pg_advisory_xact_lock(hashtextextended('report:' || new.reporter_id::text, 0));
  if (select count(*) from public.content_reports where reporter_id = new.reporter_id and created_at >= v_day_start)
     >= public.bank_limit('reportsPerDay', 10) then
    raise exception 'Llegaste al tope de reportes de hoy' using errcode = 'BK006';
  end if;
  return new;
end;
$$;

-- Después de guardar un reporte de una pregunta del banco. Encola el correo al médico asignado, o al
-- equipo si no tiene, una vez por pregunta y día. Sin datos del alumno ni texto de la pregunta (4.6)
create or replace function public.content_reports_notify() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_physician uuid;
  v_open integer;
begin
  if new.question_id is null then
    return null;
  end if;
  v_physician := public.bank_assigned_physician(new.question_id);
  select count(*) into v_open from public.content_reports where question_id = new.question_id and status = 'open';
  if public.enqueue_email(
    v_physician,
    case when v_physician is null then 'team' end,
    'content_report',
    'content_report:' || new.question_id::text || ':' || to_char(public.study_day(), 'YYYY-MM-DD'),
    jsonb_build_object('questionKey', public.bank_question_key(new.question_id), 'reason', new.reason,
      'openReports', v_open)
  ) then
    update public.content_reports set notified_at = now() where id = new.id;
  end if;
  return null;
end;
$$;

do $$ begin
  if not exists (
    select 1 from pg_trigger where tgname = 'content_reports_guard' and tgrelid = 'public.content_reports'::regclass
  ) then
    create trigger content_reports_guard before insert on public.content_reports
      for each row execute function public.content_reports_guard();
  end if;
  if not exists (
    select 1 from pg_trigger where tgname = 'content_reports_notify' and tgrelid = 'public.content_reports'::regclass
  ) then
    create trigger content_reports_notify after insert on public.content_reports
      for each row execute function public.content_reports_notify();
  end if;
end $$;

-- ===================================================================== Funciones del editor
-- Lista del banco para el equipo. El médico ve lo que tiene asignado y el admin todo. Filtros de 4.2
create or replace function public.editor_list(
  p_filter jsonb default '{}', p_limit integer default 50, p_offset integer default 0
) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_role public.app_role := public.bank_team_role();
  v_view text := coalesce(p_filter ->> 'view', 'all');
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 500);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_total integer;
  v_items jsonb;
begin
  if v_view not in ('to_review', 'my_drafts', 'incomplete', 'reported', 'conflict', 'published', 'all') then
    raise exception 'Filtro desconocido' using errcode = '22023';
  end if;
  with visible as (
    select r.*, v.editorial_status, v.branch as v_branch, v.topic as v_topic, v.incomplete as v_incomplete
    from public.bank_questions r
    join public.questions v on v.id = r.latest_version_id
    where (v_role in ('admin', 'owner') or exists (
      select 1 from public.review_assignments ra
      where ra.question_id = r.question_id and ra.physician_id = v_uid and ra.revoked_at is null
    ))
    and (p_filter ->> 'branch' is null or v.branch = p_filter ->> 'branch')
    and (p_filter ->> 'topic' is null or v.topic = p_filter ->> 'topic')
    and (p_filter ->> 'status' is null or v.editorial_status = p_filter ->> 'status')
    and case v_view
      when 'to_review' then v.editorial_status = 'in_review' and public.bank_assignee(r.question_id, 'reviewer') = v_uid
      when 'my_drafts' then v.editorial_status = 'draft' and public.bank_assignee(r.question_id, 'author') = v_uid
      when 'incomplete' then cardinality(v.incomplete) > 0
      when 'reported' then exists (select 1 from public.content_reports c where c.question_id = r.question_id and c.status = 'open')
      when 'conflict' then r.conflict_since is not null
      when 'published' then r.published_version_id is not null
      else true end
  )
  select (select count(*) from visible),
         coalesce((select jsonb_agg(public.bank_list_item(page.question_id, v_uid) order by page.updated_at desc, page.question_id)
                   from (select question_id, updated_at from visible order by updated_at desc, question_id
                         limit v_limit offset v_offset) page), '[]'::jsonb)
    into v_total, v_items;
  return jsonb_build_object('total', v_total, 'items', v_items);
end;
$$;

-- Una pregunta completa para el editor (EditorQuestion). Durante el paso a ciegas, el revisor la ve sin
-- lo del autor en ninguna versión
create or replace function public.editor_question(p_question_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_role public.app_role := public.bank_team_role();
  v_registry public.bank_questions%rowtype;
  v_latest public.questions%rowtype;
  v_my_role text;
  v_state text;
  v_hide boolean;
begin
  select * into v_registry from public.bank_questions where question_id = p_question_id;
  if not found then
    raise exception 'La pregunta no existe' using errcode = '22023';
  end if;
  if not public.bank_can_see(p_question_id) then
    raise exception 'No tienes asignada esta pregunta' using errcode = 'BK007';
  end if;
  select * into v_latest from public.questions where id = v_registry.latest_version_id;
  v_my_role := case
    when v_role in ('admin', 'owner') then 'admin'
    when public.bank_assignee(p_question_id, 'reviewer') = v_uid then 'reviewer'
    when public.bank_assignee(p_question_id, 'author') = v_uid then 'author'
    else 'none' end;
  v_state := public.bank_review_state(v_latest.id, v_uid);
  v_hide := v_my_role = 'reviewer' and public.bank_reviewer_blind(v_latest.id, v_uid);
  return jsonb_build_object(
    'question', public.bank_list_item(p_question_id, v_uid),
    'versions', coalesce((
      select jsonb_agg(public.bank_version_json(q.id, v_hide) order by q.version desc)
      from public.questions q where q.question_id = p_question_id
    ), '[]'::jsonb),
    'case', case when v_latest.case_id is null then null else (
      select jsonb_build_object(
        'id', c.id, 'vignette', c.vignette,
        'members', coalesce((
          select jsonb_agg(jsonb_build_object('questionId', r.question_id, 'caseOrder', q.case_order,
            'status', q.editorial_status) order by q.case_order)
          from public.bank_questions r join public.questions q on q.id = r.latest_version_id
          where q.case_id = c.id
        ), '[]'::jsonb))
      from public.clinical_cases c where c.id = v_latest.case_id) end,
    'review', jsonb_build_object(
      'role', v_my_role,
      'state', v_state,
      'myLabels', coalesce((
        select jsonb_agg(jsonb_build_object('optionId', l.option_id, 'tag', l.tag, 'locked', l.locked_at is not null)
          order by o.position)
        from public.question_options o
        join public.bias_labels l on l.option_id = coalesce(o.option_id, o.id) and l.labeler_id = v_uid
        where o.question_version_id = v_latest.id
      ), '[]'::jsonb),
      'pendingOptionIds', case when v_my_role = 'reviewer' and v_state = 'blind_pending' then coalesce((
        select jsonb_agg(coalesce(o.option_id, o.id) order by o.position)
        from public.question_options o
        where o.question_version_id = v_latest.id and not o.is_correct
          and not exists (select 1 from public.bias_labels l
            where l.option_id = coalesce(o.option_id, o.id) and l.labeler_id = v_uid and l.locked_at is not null)
      ), '[]'::jsonb) else '[]'::jsonb end
    ),
    'reports', jsonb_build_object(
      'open', (select count(*) from public.content_reports where question_id = p_question_id and status = 'open'),
      'byReason', coalesce((
        select jsonb_object_agg(reason, n) from (
          select reason, count(*) as n from public.content_reports
          where question_id = p_question_id and status = 'open' group by reason
        ) s), '{}'::jsonb)
    ),
    'distractorFlags', coalesce((
      select jsonb_agg(jsonb_build_object('id', f.id, 'optionId', f.option_id, 'exposures', f.exposures,
        'choices', f.choices, 'attraction', f.attraction, 'status', f.status) order by f.flagged_at)
      from public.distractor_flags f where f.question_id = p_question_id
    ), '[]'::jsonb),
    'sync', jsonb_build_object(
      'origin', v_registry.origin, 'sourceKey', v_registry.source_key,
      'lastRunAt', public.bank_iso(v_registry.sheet_seen_at),
      'conflictSince', public.bank_iso(v_registry.conflict_since),
      'missingSince', public.bank_iso(v_registry.sheet_missing_since)
    )
  );
end;
$$;

-- Un médico crea una pregunta en la app, o la variante de una que ya existe (B12). Nace en borrador
-- con él como autor. El admin y el dueño no escriben contenido
create or replace function public.editor_create_question(p_draft jsonb, p_variant_of uuid default null)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_question uuid := public.ulid_uuid();
  v_version uuid;
begin
  if public.bank_team_role() <> 'physician' then
    raise exception 'Solo un médico escribe preguntas' using errcode = '42501';
  end if;
  if p_variant_of is not null and not exists (select 1 from public.bank_questions where question_id = p_variant_of) then
    raise exception 'La pregunta original no existe' using errcode = '22023';
  end if;
  v_version := public.bank_insert_version(
    v_question, public.bank_draft_content(p_draft, null),
    case when p_variant_of is null then 'app' else 'ai_variant' end,
    v_uid, null, null, p_variant_of, '{}');
  insert into public.bank_questions (question_id, origin, latest_version_id)
    values (v_question, case when p_variant_of is null then 'app' else 'ai_variant' end, v_version);
  perform public.bank_assign(v_question, 'author', v_uid, v_uid);
  return public.bank_save_result(v_version);
end;
$$;

-- Guarda una versión nueva sobre la más reciente. La versión base tiene que seguir siendo la más
-- reciente (BK002). Solo el autor o el revisor asignados (BK007)
create or replace function public.editor_save_version(
  p_question_id uuid, p_base_version_id uuid, p_draft jsonb
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_registry public.bank_questions%rowtype;
  v_base public.questions%rowtype;
  v_version uuid;
begin
  if public.bank_team_role() <> 'physician' then
    raise exception 'Solo un médico escribe preguntas' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('bank-question:' || p_question_id::text, 0));
  select * into v_registry from public.bank_questions where question_id = p_question_id for update;
  if not found then
    raise exception 'La pregunta no existe' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.review_assignments
    where question_id = p_question_id and physician_id = v_uid and revoked_at is null
  ) then
    raise exception 'No tienes asignada esta pregunta' using errcode = 'BK007';
  end if;
  if v_registry.latest_version_id is distinct from p_base_version_id then
    raise exception 'Alguien más guardó o sincronizó una versión nueva' using errcode = 'BK002';
  end if;
  -- El revisor no edita lo que todavía no ve. Primero etiqueta a ciegas (M5 de la revisión)
  if public.bank_reviewer_blind(p_base_version_id, v_uid) then
    raise exception 'Etiqueta a ciegas antes de editar' using errcode = 'BK004';
  end if;
  select * into v_base from public.questions where id = p_base_version_id;
  v_version := public.bank_insert_version(
    p_question_id, public.bank_draft_content(p_draft, p_question_id), 'app', v_uid,
    v_base.case_id, v_base.case_order, v_base.variant_of, '{}');
  update public.bank_questions set latest_version_id = v_version, updated_at = now() where question_id = p_question_id;
  return public.bank_save_result(v_version);
end;
$$;

-- Manda la versión más reciente a revisión
create or replace function public.editor_submit(p_version_id uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_version public.questions%rowtype;
  v_reviewer uuid;
begin
  if public.bank_team_role() <> 'physician' then
    raise exception 'Solo un médico manda preguntas a revisión' using errcode = '42501';
  end if;
  select * into v_version from public.questions where id = p_version_id;
  if not found then
    raise exception 'La versión no existe' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('bank-question:' || v_version.question_id::text, 0));
  if not exists (
    select 1 from public.review_assignments
    where question_id = v_version.question_id and physician_id = v_uid and revoked_at is null
  ) then
    raise exception 'No tienes asignada esta pregunta' using errcode = 'BK007';
  end if;
  if (select latest_version_id from public.bank_questions where question_id = v_version.question_id) <> p_version_id then
    raise exception 'Solo se manda la versión más reciente' using errcode = 'BK002';
  end if;
  if v_version.editorial_status <> 'draft' then
    raise exception 'Solo un borrador va a revisión' using errcode = '22023';
  end if;
  v_reviewer := public.bank_send_to_review(p_version_id, v_uid);
  return jsonb_build_object('status', 'in_review', 'versionId', p_version_id, 'reviewerId', v_reviewer);
end;
$$;

-- El revisor etiqueta a ciegas un distractor. Antes de completar puede cambiarla. Al completar todos,
-- sus etiquetas se cierran y ya ve la pregunta completa
create or replace function public.editor_label_option(p_version_id uuid, p_option_id uuid, p_tag text)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_version public.questions%rowtype;
  v_option public.question_options%rowtype;
  v_existing public.bias_labels%rowtype;
  v_total integer;
  v_done integer;
begin
  if public.bank_team_role() <> 'physician' then
    raise exception 'Solo un médico etiqueta' using errcode = '42501';
  end if;
  select * into v_version from public.questions where id = p_version_id;
  if not found or v_version.editorial_status <> 'in_review' then
    raise exception 'La versión no está en revisión' using errcode = '22023';
  end if;
  if public.bank_assignee(v_version.question_id, 'reviewer') is distinct from v_uid then
    raise exception 'No eres el revisor de esta pregunta' using errcode = 'BK007';
  end if;
  -- Quien escribió la versión no se etiqueta a sí mismo, aunque lo reasignen como revisor
  if v_version.author_id = v_uid then
    raise exception 'Autor y revisor tienen que ser distintos' using errcode = 'BK003';
  end if;
  select * into v_option from public.question_options
    where question_version_id = p_version_id and coalesce(option_id, id) = p_option_id and not is_correct;
  if not found then
    raise exception 'La opción no es un distractor de esta versión' using errcode = '22023';
  end if;
  if not exists (select 1 from public.bank_bias_tags where tag = p_tag) then
    raise exception 'Etiqueta desconocida' using errcode = '22023';
  end if;
  select * into v_existing from public.bias_labels where option_id = p_option_id and labeler_id = v_uid;
  if found and v_existing.locked_at is not null then
    raise exception 'La etiqueta ya está cerrada' using errcode = 'BK004';
  end if;
  insert into public.bias_labels (option_id, labeler_id, question_version_id, tag, author_tag, labeled_at)
    values (p_option_id, v_uid, p_version_id, p_tag, v_option.bias_tag, now())
    on conflict (option_id, labeler_id) do update set
      tag = excluded.tag, author_tag = excluded.author_tag, question_version_id = excluded.question_version_id,
      labeled_at = excluded.labeled_at;
  select count(*), count(l.option_id) into v_total, v_done
    from public.question_options o
    left join public.bias_labels l on l.option_id = coalesce(o.option_id, o.id) and l.labeler_id = v_uid
    where o.question_version_id = p_version_id and not o.is_correct;
  if v_done = v_total then
    update public.bias_labels set locked_at = now()
      where labeler_id = v_uid and locked_at is null and option_id in (
        select coalesce(option_id, id) from public.question_options
        where question_version_id = p_version_id and not is_correct);
  end if;
  return jsonb_build_object('done', v_done, 'total', v_total, 'revealed', v_done = v_total);
end;
$$;

-- El revisor decide sobre la versión en revisión. Aprobar publica la pregunta o la deja esperando a su
-- caso. Pedir cambios y rechazar piden comentario
create or replace function public.editor_decide(
  p_version_id uuid, p_decision text, p_comment text, p_checks text[]
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_version public.questions%rowtype;
  v_status text;
  v_published text;
  v_flag text;
begin
  if public.bank_team_role() <> 'physician' then
    raise exception 'Solo un médico revisor decide' using errcode = '42501';
  end if;
  if p_decision is null or p_decision not in ('approve', 'request_changes', 'reject') then
    raise exception 'Decisión desconocida' using errcode = '22023';
  end if;
  select * into v_version from public.questions where id = p_version_id;
  if not found then
    raise exception 'La versión no existe' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('bank-question:' || v_version.question_id::text, 0));
  if public.bank_assignee(v_version.question_id, 'reviewer') is distinct from v_uid then
    raise exception 'No eres el revisor de esta pregunta' using errcode = 'BK007';
  end if;
  if v_version.editorial_status <> 'in_review' then
    raise exception 'La versión no está en revisión' using errcode = '22023';
  end if;
  if (select latest_version_id from public.bank_questions where question_id = v_version.question_id) <> p_version_id then
    raise exception 'Ya hay una versión más reciente' using errcode = 'BK002';
  end if;
  if v_version.author_id = v_uid then
    raise exception 'Autor y revisor tienen que ser distintos' using errcode = 'BK003';
  end if;
  if p_decision <> 'approve' and btrim(coalesce(p_comment, '')) = '' then
    raise exception 'Pedir cambios o rechazar lleva comentario' using errcode = '22023';
  end if;
  if char_length(coalesce(p_comment, '')) > 2000 then
    raise exception 'El comentario es muy largo' using errcode = '22023';
  end if;
  if p_decision = 'approve' then
    if public.bank_review_state(p_version_id, v_uid) <> 'ready' then
      raise exception 'Falta etiquetar a ciegas' using errcode = 'BK004';
    end if;
    if cardinality(public.bank_version_issues(p_version_id)) > 0 then
      raise exception 'La versión tiene pendientes' using errcode = 'BK005';
    end if;
    foreach v_flag in array v_version.review_flags loop
      if not v_flag = any (coalesce(p_checks, '{}')) then
        raise exception 'Faltan casillas por confirmar' using errcode = 'BK008', detail = v_flag;
      end if;
    end loop;
  end if;
  insert into public.review_decisions (question_version_id, physician_id, decision, comment, decided_at, question_id, version, checks)
    values (p_version_id, v_uid, p_decision, nullif(btrim(coalesce(p_comment, '')), ''), now(),
            v_version.question_id, v_version.version, coalesce(p_checks, '{}'));
  v_status := case p_decision when 'approve' then 'approved' when 'request_changes' then 'draft' else 'rejected' end;
  update public.questions set editorial_status = v_status, decided_at = now() where id = p_version_id;
  update public.bank_questions set updated_at = now() where question_id = v_version.question_id;
  if p_decision = 'approve' then
    v_published := public.bank_publish(v_version.question_id);
  end if;
  return jsonb_build_object(
    'status', v_status,
    'published', coalesce(v_published = 'published', false),
    'waitingCase', coalesce(v_published = 'waiting_case', false)
  );
end;
$$;

-- Reportes de alumnos de lo asignado, o de todo para el admin. Sin datos del alumno
create or replace function public.editor_reports(
  p_status text default 'open', p_limit integer default 50, p_offset integer default 0
) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform public.bank_team_role();
  if p_status is not null and p_status not in ('open', 'resolved', 'dismissed', 'all') then
    raise exception 'Estado desconocido' using errcode = '22023';
  end if;
  return coalesce((
    select jsonb_agg(item order by created_at desc, id)
    from (
      select c.id, c.created_at, jsonb_build_object(
        'id', c.id, 'questionId', c.question_id, 'versionId', c.target_id,
        'version', (select version from public.questions where id = c.target_id),
        'questionKey', public.bank_question_key(c.question_id),
        'reason', c.reason, 'status', c.status, 'createdAt', public.bank_iso(c.created_at),
        'resolvedAt', public.bank_iso(c.resolved_at)) as item
      from public.content_reports c
      where c.question_id is not null and public.bank_can_see(c.question_id)
        and (coalesce(p_status, 'open') = 'all' or c.status = coalesce(p_status, 'open'))
      order by c.created_at desc, c.id
      limit least(greatest(coalesce(p_limit, 50), 1), 500) offset greatest(coalesce(p_offset, 0), 0)
    ) page
  ), '[]'::jsonb);
end;
$$;

-- Resuelve, descarta o reabre reportes de lo asignado. Devuelve cuántos cambió
create or replace function public.editor_set_report_status(p_report_ids uuid[], p_status text) returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_count integer;
begin
  perform public.bank_team_role();
  if p_status is null or p_status not in ('open', 'resolved', 'dismissed') then
    raise exception 'Estado desconocido' using errcode = '22023';
  end if;
  update public.content_reports c set
    status = p_status,
    resolved_at = case when p_status = 'open' then null else now() end,
    resolved_by = case when p_status = 'open' then null else v_uid end
  where c.id = any (coalesce(p_report_ids, '{}')) and c.question_id is not null
    and public.bank_can_see(c.question_id) and c.status <> p_status;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- La cola de distractores que casi nadie elige de lo asignado
create or replace function public.editor_distractor_queue(p_status text default 'open') returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform public.bank_team_role();
  if p_status is not null and p_status not in ('open', 'edited', 'kept', 'dismissed', 'all') then
    raise exception 'Estado desconocido' using errcode = '22023';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', f.id, 'questionId', f.question_id, 'questionKey', public.bank_question_key(f.question_id),
      'versionId', f.question_version_id, 'optionId', f.option_id, 'exposures', f.exposures,
      'choices', f.choices, 'attraction', f.attraction, 'status', f.status,
      'flaggedAt', public.bank_iso(f.flagged_at), 'resolvedAt', public.bank_iso(f.resolved_at), 'note', f.note
    ) order by f.flagged_at, f.id)
    from public.distractor_flags f
    where public.bank_can_see(f.question_id)
      and (coalesce(p_status, 'open') = 'all' or f.status = coalesce(p_status, 'open'))
  ), '[]'::jsonb);
end;
$$;

-- Atiende una marca de la cola. Editar la pregunta (edited), dejarla así (kept) o descartar (dismissed)
create or replace function public.editor_resolve_distractor(
  p_flag_id uuid, p_resolution text, p_note text default null
) returns text
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_question uuid;
begin
  perform public.bank_team_role();
  if p_resolution is null or p_resolution not in ('edited', 'kept', 'dismissed') then
    raise exception 'Resolución desconocida' using errcode = '22023';
  end if;
  if char_length(coalesce(p_note, '')) > 500 then
    raise exception 'La nota es muy larga' using errcode = '22023';
  end if;
  select question_id into v_question from public.distractor_flags where id = p_flag_id;
  if v_question is null then
    raise exception 'La marca no existe' using errcode = '22023';
  end if;
  if not public.bank_can_see(v_question) then
    raise exception 'No tienes asignada esta pregunta' using errcode = 'BK007';
  end if;
  update public.distractor_flags
    set status = p_resolution, resolved_at = now(), resolved_by = v_uid, note = nullif(btrim(coalesce(p_note, '')), '')
    where id = p_flag_id;
  return p_resolution;
end;
$$;

-- Los pares de etiquetas cerradas, sin texto, para el detalle del acuerdo en la app (computeAgreement)
create or replace function public.editor_label_pairs()
returns table (option_id uuid, author_tag text, reviewer_tag text, labeled_at timestamptz)
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform public.bank_team_role();
  return query
    select l.option_id, l.author_tag, l.tag, l.labeled_at
    from public.bias_labels l
    join public.questions q on q.id = l.question_version_id
    where l.author_tag is not null and l.locked_at is not null and q.author_id is distinct from l.labeler_id
    order by l.labeled_at, l.option_id;
end;
$$;

-- Las revisiones propias en un rango de días de Mérida, para la tarjeta Mis revisiones del mes
create or replace function public.editor_my_reviews(p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_result jsonb;
begin
  perform public.bank_team_role();
  if p_from is null or p_to is null or p_to < p_from then
    raise exception 'Rango de fechas inválido' using errcode = '22023';
  end if;
  select jsonb_build_object(
    'from', to_char(p_from, 'YYYY-MM-DD'), 'to', to_char(p_to, 'YYYY-MM-DD'),
    'approved', count(*) filter (where d.decision = 'approve'),
    'changesRequested', count(*) filter (where d.decision = 'request_changes'),
    'rejected', count(*) filter (where d.decision = 'reject'),
    -- Preguntas por mes, como reviewed de admin_review_report (pago por pregunta revisada)
    'reviewed', count(distinct (date_trunc('month', d.decided_at at time zone 'America/Merida'), q.question_id)),
    'distractorsResolved', (
      select count(*) from public.distractor_flags
      where resolved_by = v_uid and status <> 'open'
        and (resolved_at at time zone 'America/Merida')::date between p_from and p_to)
  ) into v_result
  from public.review_decisions d
  join public.questions q on q.id = d.question_version_id
  where d.physician_id = v_uid and (d.decided_at at time zone 'America/Merida')::date between p_from and p_to;
  return v_result;
end;
$$;

-- Resuelve un conflicto entre el Sheet y la app (3.5). keep_app deja como aplicada la huella del Sheet de
-- ese momento y lo ignora hasta que vuelva a cambiar. take_sheet hace que la siguiente corrida cree la
-- versión desde el renglón. Lo puede hacer el admin o un médico asignado
create or replace function public.editor_resolve_sync_conflict(p_question_id uuid, p_choice text) returns text
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_registry public.bank_questions%rowtype;
begin
  perform public.bank_team_role();
  if p_choice is null or p_choice not in ('keep_app', 'take_sheet') then
    raise exception 'Opción desconocida' using errcode = '22023';
  end if;
  if not public.bank_can_see(p_question_id) then
    raise exception 'No tienes asignada esta pregunta' using errcode = 'BK007';
  end if;
  select * into v_registry from public.bank_questions where question_id = p_question_id for update;
  if not found or v_registry.conflict_since is null then
    raise exception 'La pregunta no tiene conflicto' using errcode = '22023';
  end if;
  if p_choice = 'keep_app' then
    update public.bank_questions set sheet_row_hash = conflict_row_hash, conflict_since = null,
      conflict_row_hash = null, sheet_force_next = false, updated_at = now()
      where question_id = p_question_id;
  else
    update public.bank_questions set sheet_force_next = true, conflict_since = null, conflict_row_hash = null,
      updated_at = now()
      where question_id = p_question_id;
  end if;
  return p_choice;
end;
$$;

-- ===================================================================== Funciones del admin
create or replace function public.bank_require_admin() returns void
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is null then
    raise exception 'Hace falta iniciar sesión' using errcode = '28000';
  end if;
  if not public.is_admin() then
    raise exception 'Solo un administrador' using errcode = '42501';
  end if;
end;
$$;

-- Resumen del banco contra la meta para abrirlo (respuesta 56). Inglés aparte
create or replace function public.admin_bank_overview() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_goal integer;
begin
  perform public.bank_require_admin();
  begin
    select (value ->> 'approvedToOpen')::integer into v_goal from public.platform_settings where key = 'bank_goal';
  exception when others then
    v_goal := null;
  end;
  return jsonb_build_object(
    'goal', coalesce(v_goal, 300),
    'published', (select count(*) from public.question_catalog c join public.bank_taxonomy t
                    on t.branch = c.branch and t.topic = c.topic and t.subtopic = c.subtopic
                  where c.status = 'published' and t.section = 'clinical'),
    'englishPublished', (select count(*) from public.question_catalog c join public.bank_taxonomy t
                    on t.branch = c.branch and t.topic = c.topic and t.subtopic = c.subtopic
                  where c.status = 'published' and t.section = 'english'),
    'byBranch', coalesce((
      select jsonb_agg(jsonb_build_object('branch', branch, 'published', n) order by branch)
      from (select branch, count(*) as n from public.question_catalog where status = 'published' group by branch) s
    ), '[]'::jsonb),
    'drafts', (select count(*) from public.bank_questions r join public.questions v on v.id = r.latest_version_id
               where r.status = 'active' and v.editorial_status = 'draft'),
    'incomplete', (select count(*) from public.bank_questions r join public.questions v on v.id = r.latest_version_id
               where r.status = 'active' and cardinality(v.incomplete) > 0),
    'inReview', (select count(*) from public.bank_questions r join public.questions v on v.id = r.latest_version_id
               where r.status = 'active' and v.editorial_status = 'in_review'),
    'conflicts', (select count(*) from public.bank_questions where conflict_since is not null),
    'missing', (select count(*) from public.bank_questions where sheet_missing_since is not null and status = 'active'),
    'retireRequested', (select count(*) from public.bank_questions where retire_requested_at is not null and status = 'active'),
    'retired', (select count(*) from public.bank_questions where status = 'retired'),
    'open', public.bank_open_for_students()
  );
end;
$$;

-- Asigna autor y revisor a varias preguntas. null deja el papel como está. Solo médicos (22023) y
-- distintos (BK003). Devuelve cuántas preguntas cambió
create or replace function public.admin_assign_questions(p_question_ids uuid[], p_author uuid, p_reviewer uuid)
returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_question uuid;
  v_count integer := 0;
begin
  perform public.bank_require_admin();
  if p_author is not null and p_author = p_reviewer then
    raise exception 'Autor y revisor tienen que ser distintos' using errcode = 'BK003';
  end if;
  if (p_author is not null and (select role from public.user_roles where user_id = p_author) is distinct from 'physician')
     or (p_reviewer is not null and (select role from public.user_roles where user_id = p_reviewer) is distinct from 'physician') then
    raise exception 'Solo una cuenta de médico puede ser autor o revisor' using errcode = '22023';
  end if;
  foreach v_question in array coalesce(p_question_ids, '{}') loop
    continue when not exists (select 1 from public.bank_questions where question_id = v_question);
    -- Primero se quita el papel que cambia de dueño, así el médico puede pasar de autor a revisor
    if p_author is not null and public.bank_assignee(v_question, 'reviewer') = p_author then
      update public.review_assignments set revoked_at = now(), revoked_by = v_uid
        where question_id = v_question and role = 'reviewer' and revoked_at is null;
    end if;
    if p_reviewer is not null and public.bank_assignee(v_question, 'author') = p_reviewer then
      update public.review_assignments set revoked_at = now(), revoked_by = v_uid
        where question_id = v_question and role = 'author' and revoked_at is null;
    end if;
    perform public.bank_assign(v_question, 'author', p_author, v_uid);
    perform public.bank_assign(v_question, 'reviewer', p_reviewer, v_uid);
    update public.bank_questions set updated_at = now() where question_id = v_question;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- Revisor por omisión de una subespecialidad, para lo que llega del Sheet sin Revisor
create or replace function public.admin_set_topic_reviewer(p_branch text, p_topic text, p_physician uuid)
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform public.bank_require_admin();
  if not exists (select 1 from public.bank_taxonomy where branch = p_branch and topic = p_topic) then
    raise exception 'Subespecialidad fuera de la taxonomía' using errcode = '22023';
  end if;
  if (select role from public.user_roles where user_id = p_physician) is distinct from 'physician' then
    raise exception 'Solo una cuenta de médico revisa' using errcode = '22023';
  end if;
  insert into public.bank_topic_reviewers (branch, topic, physician_id, set_by, set_at)
    values (p_branch, p_topic, p_physician, auth.uid(), now())
    on conflict (branch, topic) do update set physician_id = excluded.physician_id,
      set_by = excluded.set_by, set_at = excluded.set_at;
end;
$$;

-- Clave corta de un médico para el Sheet. ok, taken o not_physician
create or replace function public.admin_set_physician_code(p_user uuid, p_code text) returns text
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_code text := upper(btrim(coalesce(p_code, '')));
begin
  perform public.bank_require_admin();
  if v_code !~ '^[A-Z][A-Z0-9]{1,7}$' then
    raise exception 'La clave lleva de 2 a 8 letras o números y empieza con letra' using errcode = '22023';
  end if;
  if (select role from public.user_roles where user_id = p_user) is distinct from 'physician' then
    return 'not_physician';
  end if;
  if exists (select 1 from public.physician_codes where code = v_code and user_id <> p_user) then
    return 'taken';
  end if;
  insert into public.physician_codes (code, user_id, set_by, set_at)
    values (v_code, p_user, auth.uid(), now())
    on conflict (user_id) do update set code = excluded.code, set_by = excluded.set_by, set_at = excluded.set_at;
  return 'ok';
end;
$$;

-- Las claves del Sheet de cada médico y el revisor por omisión de cada subespecialidad, para verlos en
-- Usuarios y en Banco y Sheet (B1 de la revisión). Solo alias, nunca correos. active dice si el revisor
-- por omisión sigue siendo médico, porque si no bank_send_to_review no lo usa
create or replace function public.admin_bank_team() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform public.bank_require_admin();
  return jsonb_build_object(
    'codes', coalesce((
      select jsonb_agg(jsonb_build_object('userId', c.user_id, 'alias', coalesce(p.alias, ''), 'code', c.code)
        order by c.code)
      from public.physician_codes c left join public.profiles p on p.id = c.user_id
    ), '[]'::jsonb),
    'topicReviewers', coalesce((
      select jsonb_agg(jsonb_build_object('branch', t.branch, 'topic', t.topic, 'physicianId', t.physician_id,
          'alias', coalesce(p.alias, ''), 'active', coalesce(r.role = 'physician', false))
        order by t.branch, t.topic)
      from public.bank_topic_reviewers t
      left join public.profiles p on p.id = t.physician_id
      left join public.user_roles r on r.user_id = t.physician_id
    ), '[]'::jsonb)
  );
end;
$$;

-- Los topes del banco y la tarifa por revisión, para la sección Banco de Plataforma (B5 de la revisión).
-- Los topes van completos, los públicos de platform_settings y los privados de bank_private_settings
create or replace function public.admin_bank_settings() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform public.bank_require_admin();
  return jsonb_build_object('limits', public.bank_limits(), 'pay',
    jsonb_build_object('perReviewMxn', public.bank_pay_rate()));
end;
$$;

-- Guarda los topes y la tarifa. Cada campo va a su tabla, con los mismos rangos que la app
-- (BankLimitsSchema y PhysicianPaySchema de src/data/cloud/bankAdmin.ts)
create or replace function public.admin_save_bank_settings(p_limits jsonb, p_pay jsonb) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_field record;
  v_value numeric;
  v_rate jsonb := coalesce(p_pay -> 'perReviewMxn', 'null'::jsonb);
begin
  perform public.bank_require_admin();
  if jsonb_typeof(p_limits) is distinct from 'object' then
    raise exception 'Faltan los topes' using errcode = '22023';
  end if;
  for v_field in
    select * from (values ('perMinute', 1, 10000, true), ('perHour', 1, 100000, true),
      ('alertDaily', 1, 100000, true), ('alertWeekShare', 0.01, 1, false), ('reportsPerDay', 1, 1000, true),
      ('maxFetch', 1, 500, true)) as f(name, low, high, whole)
  loop
    if jsonb_typeof(p_limits -> v_field.name) is distinct from 'number' then
      raise exception 'Falta % o no es número', v_field.name using errcode = '22023';
    end if;
    v_value := (p_limits ->> v_field.name)::numeric;
    if v_value < v_field.low or v_value > v_field.high or (v_field.whole and v_value <> trunc(v_value)) then
      raise exception '% fuera de rango', v_field.name using errcode = '22023';
    end if;
  end loop;
  if jsonb_typeof(v_rate) not in ('null', 'number')
     or (jsonb_typeof(v_rate) = 'number' and ((v_rate #>> '{}')::numeric < 0 or (v_rate #>> '{}')::numeric > 100000)) then
    raise exception 'Tarifa fuera de rango' using errcode = '22023';
  end if;

  insert into public.platform_settings (key, value, updated_at)
    values ('bank_limits', jsonb_build_object('perMinute', p_limits -> 'perMinute',
      'reportsPerDay', p_limits -> 'reportsPerDay', 'maxFetch', p_limits -> 'maxFetch'), now())
    on conflict (key) do update set value = excluded.value, updated_at = excluded.updated_at;
  insert into public.bank_private_settings (key, value, updated_at, updated_by)
    values ('bank_limits', jsonb_build_object('perHour', p_limits -> 'perHour',
      'alertDaily', p_limits -> 'alertDaily', 'alertWeekShare', p_limits -> 'alertWeekShare'), now(), v_uid),
      ('physician_pay', jsonb_build_object('perReviewMxn', v_rate), now(), v_uid)
    on conflict (key) do update
      set value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by;
end;
$$;

-- Retira una pregunta entera. Los alumnos la dejan de recibir y conservan lo que ya bajaron
create or replace function public.admin_retire_question(p_question_id uuid, p_reason text) returns text
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform public.bank_require_admin();
  if char_length(coalesce(p_reason, '')) > 200 then
    raise exception 'El motivo es muy largo' using errcode = '22023';
  end if;
  update public.bank_questions set status = 'retired', retired_at = now(), retired_by = auth.uid(),
    retire_reason = nullif(btrim(coalesce(p_reason, '')), ''), retire_requested_at = null,
    sheet_missing_since = null, updated_at = now()
    where question_id = p_question_id and status = 'active';
  if not found then
    raise exception 'La pregunta no existe o ya está retirada' using errcode = '22023';
  end if;
  perform public.bank_catalog_retire(p_question_id);
  return 'retired';
end;
$$;

-- Devuelve una pregunta retirada. Si tenía versión publicada vuelve al catálogo con un seq nuevo
create or replace function public.admin_restore_question(p_question_id uuid) returns text
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform public.bank_require_admin();
  update public.bank_questions set status = 'active', retired_at = null, retired_by = null, retire_reason = null,
    updated_at = now()
    where question_id = p_question_id and status = 'retired';
  if not found then
    raise exception 'La pregunta no está retirada' using errcode = '22023';
  end if;
  if exists (select 1 from public.questions where question_id = p_question_id and editorial_status = 'approved') then
    perform public.bank_publish(p_question_id);
  end if;
  return 'restored';
end;
$$;

-- Confirma qué hacer con las preguntas que desaparecieron del Sheet o que piden Retirar (3.8)
create or replace function public.admin_confirm_missing(p_question_ids uuid[], p_action text) returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_question uuid;
  v_count integer := 0;
begin
  perform public.bank_require_admin();
  if p_action is null or p_action not in ('retire', 'keep') then
    raise exception 'Acción desconocida' using errcode = '22023';
  end if;
  foreach v_question in array coalesce(p_question_ids, '{}') loop
    continue when not exists (
      select 1 from public.bank_questions where question_id = v_question and status = 'active'
        and (sheet_missing_since is not null or retire_requested_at is not null));
    if p_action = 'retire' then
      perform public.admin_retire_question(v_question, null);
    else
      update public.bank_questions set sheet_missing_since = null, retire_requested_at = null, updated_at = now()
        where question_id = v_question;
    end if;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- Avisos de lectura con el alias del alumno, sin las preguntas (PC 4.10)
create or replace function public.admin_bank_read_alerts(p_limit integer default 50) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform public.bank_require_admin();
  return coalesce((
    select jsonb_agg(item order by created_at desc, id)
    from (
      select a.id, a.created_at, jsonb_build_object(
        'id', a.id, 'userId', a.user_id,
        'alias', coalesce((select alias from public.profiles where id = a.user_id), ''),
        'day', to_char(a.day, 'YYYY-MM-DD'), 'kind', a.kind, 'value', a.value,
        'createdAt', public.bank_iso(a.created_at), 'seenAt', public.bank_iso(a.seen_at)) as item
      from public.bank_read_alerts a
      order by a.created_at desc, a.id
      limit least(greatest(coalesce(p_limit, 50), 1), 500)
    ) page
  ), '[]'::jsonb);
end;
$$;

-- ===================================================================== Pago a médicos (respuesta 58)
-- Tarifa por revisión de physician_pay, en bank_private_settings (B5 de la revisión). null si Ricardo no
-- la puso
create or replace function public.bank_pay_rate() returns numeric
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_rate numeric;
begin
  select (value ->> 'perReviewMxn')::numeric into v_rate from public.bank_private_settings where key = 'physician_pay';
  return case when v_rate >= 0 then v_rate end;
exception when others then
  return null;
end;
$$;

-- Una fila por médico y mes, en hora de Mérida. approved, changes_requested y rejected cuentan cada
-- decisión del revisor sobre una versión. reviewed cuenta preguntas, así varias rondas sobre la misma
-- pregunta en el mes cuentan una vez (pago por pregunta revisada, respuesta 58). Los distractores
-- atendidos van aparte (8.7). El monto es reviewed por la tarifa, o null sin tarifa (8.8)
create or replace function public.admin_review_report(p_from date, p_to date)
returns table (month date, physician_id uuid, alias text, code text, approved bigint, changes_requested bigint,
               rejected bigint, reviewed bigint, distractors_resolved bigint, amount_mxn numeric)
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_rate numeric := public.bank_pay_rate();
begin
  perform public.bank_require_admin();
  if p_from is null or p_to is null or p_to < p_from then
    raise exception 'Rango de fechas inválido' using errcode = '22023';
  end if;
  return query
    with decided as (
      select date_trunc('month', d.decided_at at time zone 'America/Merida')::date as m, d.physician_id as p,
             count(*) filter (where d.decision = 'approve') as a,
             count(*) filter (where d.decision = 'request_changes') as c,
             count(*) filter (where d.decision = 'reject') as r,
             count(distinct q.question_id) as t
      from public.review_decisions d
      join public.questions q on q.id = d.question_version_id
      where (d.decided_at at time zone 'America/Merida')::date between p_from and p_to
      group by 1, 2
    ), flags as (
      select date_trunc('month', f.resolved_at at time zone 'America/Merida')::date as m, f.resolved_by as p,
             count(*) as n
      from public.distractor_flags f
      where f.resolved_by is not null and f.status <> 'open'
        and (f.resolved_at at time zone 'America/Merida')::date between p_from and p_to
      group by 1, 2
    )
    select coalesce(decided.m, flags.m), coalesce(decided.p, flags.p),
           coalesce(pr.alias, ''), pc.code,
           coalesce(decided.a, 0), coalesce(decided.c, 0), coalesce(decided.r, 0), coalesce(decided.t, 0),
           coalesce(flags.n, 0),
           case when v_rate is null then null else coalesce(decided.t, 0) * v_rate end
    from decided
    full join flags on flags.m = decided.m and flags.p is not distinct from decided.p
    left join public.profiles pr on pr.id = coalesce(decided.p, flags.p)
    left join public.physician_codes pc on pc.user_id = coalesce(decided.p, flags.p)
    order by 1, 3, 2;
end;
$$;

-- Una fila por decisión, para el CSV de detalle. counts marca la primera decisión del médico sobre cada
-- pregunta en el mes, la que paga. Las filas con counts cuadran con reviewed del resumen
create or replace function public.admin_review_report_detail(p_from date, p_to date, p_physician uuid default null)
returns table (decided_at timestamptz, month date, physician_id uuid, alias text, code text,
               question_key text, version integer, decision text, counts boolean)
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform public.bank_require_admin();
  if p_from is null or p_to is null or p_to < p_from then
    raise exception 'Rango de fechas inválido' using errcode = '22023';
  end if;
  return query
    select d.decided_at, date_trunc('month', d.decided_at at time zone 'America/Merida')::date,
           d.physician_id, coalesce(pr.alias, ''), pc.code,
           public.bank_question_key(q.question_id), q.version, d.decision,
           row_number() over (
             partition by d.physician_id, q.question_id, date_trunc('month', d.decided_at at time zone 'America/Merida')
             order by d.decided_at, d.id) = 1
    from public.review_decisions d
    join public.questions q on q.id = d.question_version_id
    left join public.profiles pr on pr.id = d.physician_id
    left join public.physician_codes pc on pc.user_id = d.physician_id
    where (d.decided_at at time zone 'America/Merida')::date between p_from and p_to
      and (p_physician is null or d.physician_id = p_physician)
    order by d.decided_at, d.id;
end;
$$;

-- ===================================================================== Datos de B14
-- Recibe las cifras que calcula B14 con los alumnos que dieron permiso (respuesta 87) y marca los
-- distractores que casi nadie elige, con al menos nonFunctionalExposures exposiciones y menos de
-- nonFunctionalRate de elecciones. Una marca ya atendida conserva su estado. Devuelve cuántas marcó o
-- actualizó. Solo con la llave de servicio
create or replace function public.upsert_distractor_stats(p_rows jsonb) returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_rate numeric := public.bank_threshold('sampling', 'nonFunctionalRate', 0.05);
  v_min integer := public.bank_threshold('sampling', 'nonFunctionalExposures', 100)::integer;
  v_row jsonb;
  v_option public.question_options%rowtype;
  v_question uuid;
  v_exposures integer;
  v_choices integer;
  v_count integer := 0;
begin
  if jsonb_typeof(p_rows) <> 'array' then
    raise exception 'Se esperaba una lista' using errcode = '22023';
  end if;
  for v_row in select * from jsonb_array_elements(p_rows) loop
    v_exposures := (v_row ->> 'exposures')::integer;
    v_choices := (v_row ->> 'choices')::integer;
    continue when v_exposures is null or v_choices is null or v_exposures < v_min or v_choices < 0
      or v_choices > v_exposures or v_choices::numeric / v_exposures >= v_rate;
    select o.* into v_option from public.question_options o
      where o.question_version_id = (v_row ->> 'questionVersionId')::uuid
        and coalesce(o.option_id, o.id) = (v_row ->> 'optionId')::uuid and not o.is_correct;
    continue when not found;
    select question_id into v_question from public.questions where id = v_option.question_version_id;
    insert into public.distractor_flags (question_id, option_id, question_version_id, exposures, choices, attraction, source)
      values (v_question, coalesce(v_option.option_id, v_option.id), v_option.question_version_id, v_exposures, v_choices,
              round(v_choices::numeric / v_exposures, 4), 'calibration')
      on conflict (option_id, question_version_id) do update set
        exposures = excluded.exposures, choices = excluded.choices, attraction = excluded.attraction;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- ===================================================================== Permisos de las funciones
-- Ayudas internas, sin execute para nadie de la API
revoke all on function public.bank_team_role() from public, anon, authenticated, service_role;
revoke all on function public.bank_assignee(uuid, text) from public, anon, authenticated, service_role;
revoke all on function public.bank_assigned_physician(uuid) from public, anon, authenticated, service_role;
revoke all on function public.bank_can_see(uuid) from public, anon, authenticated, service_role;
revoke all on function public.bank_person(uuid) from public, anon, authenticated, service_role;
revoke all on function public.bank_question_key(uuid) from public, anon, authenticated, service_role;
revoke all on function public.bank_review_state(uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function public.bank_reviewer_blind(uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function public.bank_list_item(uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function public.bank_version_json(uuid, boolean) from public, anon, authenticated, service_role;
revoke all on function public.bank_check_content(jsonb) from public, anon, authenticated, service_role;
revoke all on function public.bank_insert_version(uuid, jsonb, text, uuid, uuid, integer, uuid, text[], text[])
  from public, anon, authenticated, service_role;
revoke all on function public.bank_draft_content(jsonb, uuid) from public, anon, authenticated, service_role;
revoke all on function public.bank_save_result(uuid) from public, anon, authenticated, service_role;
revoke all on function public.bank_threshold(text, text, numeric) from public, anon, authenticated, service_role;
revoke all on function public.bank_assign(uuid, text, uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function public.bank_send_to_review(uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function public.bank_require_admin() from public, anon, authenticated, service_role;
revoke all on function public.bank_pay_rate() from public, anon, authenticated, service_role;
revoke all on function public.content_reports_guard() from public, anon, authenticated, service_role;
revoke all on function public.content_reports_notify() from public, anon, authenticated, service_role;
-- Del alumno, solo con sesión
revoke all on function public.report_question(uuid, text) from public, anon, authenticated, service_role;
grant execute on function public.report_question(uuid, text) to authenticated;
revoke all on function public.bias_agreement_summary() from public, anon, authenticated, service_role;
grant execute on function public.bias_agreement_summary() to authenticated;
-- Del equipo y del admin, con sesión. Revisan el rol por dentro
revoke all on function public.editor_list(jsonb, integer, integer) from public, anon, authenticated, service_role;
grant execute on function public.editor_list(jsonb, integer, integer) to authenticated;
revoke all on function public.editor_question(uuid) from public, anon, authenticated, service_role;
grant execute on function public.editor_question(uuid) to authenticated;
revoke all on function public.editor_create_question(jsonb, uuid) from public, anon, authenticated, service_role;
grant execute on function public.editor_create_question(jsonb, uuid) to authenticated;
revoke all on function public.editor_save_version(uuid, uuid, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.editor_save_version(uuid, uuid, jsonb) to authenticated;
revoke all on function public.editor_submit(uuid) from public, anon, authenticated, service_role;
grant execute on function public.editor_submit(uuid) to authenticated;
revoke all on function public.editor_label_option(uuid, uuid, text) from public, anon, authenticated, service_role;
grant execute on function public.editor_label_option(uuid, uuid, text) to authenticated;
revoke all on function public.editor_decide(uuid, text, text, text[]) from public, anon, authenticated, service_role;
grant execute on function public.editor_decide(uuid, text, text, text[]) to authenticated;
revoke all on function public.editor_reports(text, integer, integer) from public, anon, authenticated, service_role;
grant execute on function public.editor_reports(text, integer, integer) to authenticated;
revoke all on function public.editor_set_report_status(uuid[], text) from public, anon, authenticated, service_role;
grant execute on function public.editor_set_report_status(uuid[], text) to authenticated;
revoke all on function public.editor_distractor_queue(text) from public, anon, authenticated, service_role;
grant execute on function public.editor_distractor_queue(text) to authenticated;
revoke all on function public.editor_resolve_distractor(uuid, text, text) from public, anon, authenticated, service_role;
grant execute on function public.editor_resolve_distractor(uuid, text, text) to authenticated;
revoke all on function public.editor_label_pairs() from public, anon, authenticated, service_role;
grant execute on function public.editor_label_pairs() to authenticated;
revoke all on function public.editor_my_reviews(date, date) from public, anon, authenticated, service_role;
grant execute on function public.editor_my_reviews(date, date) to authenticated;
revoke all on function public.editor_resolve_sync_conflict(uuid, text) from public, anon, authenticated, service_role;
grant execute on function public.editor_resolve_sync_conflict(uuid, text) to authenticated;
revoke all on function public.admin_bank_overview() from public, anon, authenticated, service_role;
grant execute on function public.admin_bank_overview() to authenticated;
revoke all on function public.admin_assign_questions(uuid[], uuid, uuid) from public, anon, authenticated, service_role;
grant execute on function public.admin_assign_questions(uuid[], uuid, uuid) to authenticated;
revoke all on function public.admin_set_topic_reviewer(text, text, uuid) from public, anon, authenticated, service_role;
grant execute on function public.admin_set_topic_reviewer(text, text, uuid) to authenticated;
revoke all on function public.admin_set_physician_code(uuid, text) from public, anon, authenticated, service_role;
grant execute on function public.admin_set_physician_code(uuid, text) to authenticated;
revoke all on function public.admin_bank_team() from public, anon, authenticated, service_role;
grant execute on function public.admin_bank_team() to authenticated;
revoke all on function public.admin_bank_settings() from public, anon, authenticated, service_role;
grant execute on function public.admin_bank_settings() to authenticated;
revoke all on function public.admin_save_bank_settings(jsonb, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.admin_save_bank_settings(jsonb, jsonb) to authenticated;
revoke all on function public.admin_retire_question(uuid, text) from public, anon, authenticated, service_role;
grant execute on function public.admin_retire_question(uuid, text) to authenticated;
revoke all on function public.admin_restore_question(uuid) from public, anon, authenticated, service_role;
grant execute on function public.admin_restore_question(uuid) to authenticated;
revoke all on function public.admin_confirm_missing(uuid[], text) from public, anon, authenticated, service_role;
grant execute on function public.admin_confirm_missing(uuid[], text) to authenticated;
revoke all on function public.admin_bank_read_alerts(integer) from public, anon, authenticated, service_role;
grant execute on function public.admin_bank_read_alerts(integer) to authenticated;
revoke all on function public.admin_review_report(date, date) from public, anon, authenticated, service_role;
grant execute on function public.admin_review_report(date, date) to authenticated;
revoke all on function public.admin_review_report_detail(date, date, uuid) from public, anon, authenticated, service_role;
grant execute on function public.admin_review_report_detail(date, date, uuid) to authenticated;
-- Del servidor, solo con la llave de servicio
revoke all on function public.upsert_distractor_stats(jsonb) from public, anon, authenticated, service_role;
grant execute on function public.upsert_distractor_stats(jsonb) to service_role;
