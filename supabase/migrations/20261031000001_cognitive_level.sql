-- Nivel cognitivo de Bloom en el banco de la nube (V4-B5, D-144). Hasta aquí el nivel vivía solo en el
-- banco de este navegador. Ahora viaja con la versión, con el catálogo y con la columna opcional Nivel
-- cognitivo del Sheet, para que Simular y Progreso lo usen con las preguntas de la nube.
--
-- Reglas que se hacen cumplir aquí
--   - Es opcional y nunca se adivina. Una pregunta sin nivel queda en null, y solo cuentan los seis niveles
--     de Bloom (knowledge, comprehension, application, analysis, synthesis y evaluation). Cualquier otro
--     valor lanza 22023 al guardar una versión
--   - Es un dato de la versión, como la dificultad. Las versiones no se editan, así que cambiar el nivel
--     crea una versión nueva. Las filas anteriores quedan sin nivel y ninguna se vuelve a versionar
--   - El catálogo lo copia al publicar, igual que la dificultad, y bank_catalog_json lo manda como
--     cognitiveLevel, null si no hay. La app toma null o un valor que no conoce como sin nivel
--   - El editor lo manda en el borrador (cognitiveLevel) y lo recibe en cada versión. El Sheet lo trae en la
--     columna Nivel cognitivo, que no es obligatoria. La huella del contenido solo lo incluye cuando existe,
--     así las huellas de antes no cambian (src/data/content/contentHash.ts)
--
-- Va después de 20261030000002_survey_erase.sql porque bank_catalog_json se vuelve a definir en
-- 20261028000003_model_reads.sql y esta debe quedar con la última definición. Es idempotente, no lleva
-- sentencias delete ni drop y no edita las migraciones anteriores (D-113). Las funciones se reemplazan con
-- create or replace, así conservan sus permisos, y las pruebas de permisos no cambian

-- ===================================================================== Columnas
alter table public.questions
  add column if not exists cognitive_level text
    check (cognitive_level in ('knowledge', 'comprehension', 'application', 'analysis', 'synthesis', 'evaluation'));

alter table public.question_catalog
  add column if not exists cognitive_level text
    check (cognitive_level in ('knowledge', 'comprehension', 'application', 'analysis', 'synthesis', 'evaluation'));

-- ===================================================================== Guardar versiones
-- Valida el nivel cognitivo junto con el resto del contenido (3.4)
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
  -- El nivel cognitivo es opcional y nunca se adivina. Solo se admiten los seis de Bloom (V4-B5)
  if coalesce(p_content ->> 'cognitiveLevel', '') not in
     ('', 'knowledge', 'comprehension', 'application', 'analysis', 'synthesis', 'evaluation') then
    raise exception 'Nivel cognitivo desconocido' using errcode = '22023';
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

-- Crea una versión nueva con su nivel cognitivo, si lo trae (V4-B5)
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
    version_source, author_id, review_flags, cognitive_level
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
    coalesce(p_flags, '{}'), nullif(p_content ->> 'cognitiveLevel', '')
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

-- El borrador del editor lleva el nivel cognitivo a la forma interna
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
    'cognitiveLevel', p_draft ->> 'cognitiveLevel',
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

-- ===================================================================== Lo que ve el editor
-- Cada versión dice su nivel cognitivo, null si no lo tiene
create or replace function public.bank_version_json(p_version_id uuid, p_hide boolean) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'versionId', q.id, 'version', q.version, 'status', q.editorial_status, 'source', q.version_source,
    'author', public.bank_person(q.author_id),
    'createdAt', public.bank_iso(q.created_at), 'submittedAt', public.bank_iso(q.submitted_at),
    'decidedAt', public.bank_iso(q.decided_at),
    'branch', q.branch, 'topic', q.topic, 'subtopic', coalesce(q.subtopic, ''),
    'difficulty', coalesce(q.difficulty, 3), 'itemKinds', to_jsonb(q.item_kinds),
    'cognitiveLevel', q.cognitive_level,
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

-- ===================================================================== Publicar y lo que ve el alumno
-- Publicar copia el nivel cognitivo de la versión al catálogo
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
    language, status, seq, updated_at, cognitive_level
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
         q.language, 'published', nextval('public.bank_catalog_seq'), now(), q.cognitive_level
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
    cognitive_level = excluded.cognitive_level, seq = excluded.seq, updated_at = now();
  update public.bank_questions r
    set published_version_id = q.id, updated_at = now()
    from public.questions q
    where q.id = any (v_targets) and r.question_id = q.question_id;
  return 'published';
end;
$$;

-- La fila del catálogo con las llaves de CatalogRow, ahora con cognitiveLevel. Es la definición de
-- 20261028000003_model_reads.sql con esa llave más
create or replace function public.bank_catalog_json(c public.question_catalog) returns jsonb
language sql stable set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'questionId', c.question_id, 'versionId', c.version_id, 'version', c.version,
    'branch', c.branch, 'topic', c.topic, 'subtopic', c.subtopic, 'difficulty', c.difficulty,
    'itemKinds', to_jsonb(c.item_kinds), 'polarity', c.polarity, 'task', c.task, 'format', c.format,
    'caseId', c.case_id, 'caseOrder', c.case_order, 'caseSize', c.case_size, 'variantOf', c.variant_of,
    'examEligible', c.exam_eligible, 'distractorBiases', to_jsonb(c.distractor_biases),
    'optionCount', c.option_count, 'language', c.language, 'status', c.status, 'seq', c.seq,
    'cognitiveLevel', c.cognitive_level,
    'calibration', c.calibration
  )
$$;

-- El cuerpo de una versión con su nivel cognitivo
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
    'itemKinds', to_jsonb(q.item_kinds), 'cognitiveLevel', q.cognitive_level,
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

-- ===================================================================== Sheet
-- El renglón del Sheet (SyncQuestion) lleva cognitiveLevel si trae la columna
create or replace function public.bank_sheet_content(p_origin text, p_key text, p_question jsonb) returns jsonb
language sql immutable set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'branch', p_question ->> 'branch', 'topic', p_question ->> 'topic', 'subtopic', p_question ->> 'subtopic',
    'difficulty', p_question -> 'difficulty', 'itemKinds', coalesce(p_question -> 'itemKinds', '[]'::jsonb),
    'cognitiveLevel', p_question ->> 'cognitiveLevel',
    'polarity', p_question ->> 'polarity', 'task', p_question ->> 'task',
    'format', case
      when p_question ->> 'caseKey' is not null then 'serial_case'
      when btrim(coalesce(p_question ->> 'vignette', '')) = '' then 'direct'
      else 'clinical_case' end,
    'structureSource', case when coalesce((p_question ->> 'structureDeclared')::boolean, false) then 'physician' else 'auto' end,
    'language', coalesce(p_question ->> 'language', 'es'),
    'vignette', coalesce(p_question ->> 'vignette', ''), 'prompt', coalesce(p_question ->> 'prompt', ''),
    'explanation', coalesce(p_question ->> 'explanation', ''),
    'gpcRefs', coalesce((select jsonb_agg(jsonb_build_object('title', r, 'status', 'to_verify') order by ord)
      from jsonb_array_elements_text(coalesce(p_question -> 'refs', '[]'::jsonb)) with ordinality as x (r, ord)), '[]'::jsonb),
    'clues', '[]'::jsonb,
    'options', coalesce((select jsonb_agg(jsonb_build_object(
        'optionId', public.stable_bank_uuid(p_origin || '-opt', p_key || '|' || (o ->> 'letter')),
        'letter', o ->> 'letter', 'text', o ->> 'text', 'isCorrect', coalesce((o ->> 'correct')::boolean, false),
        'biasTag', o ->> 'bias', 'secondaryBiasTags', '[]'::jsonb, 'rationale', coalesce(o ->> 'rationale', ''),
        'canonical', coalesce(p_question -> 'canonical', '[]'::jsonb) ? (o ->> 'letter')) order by ord)
      from jsonb_array_elements(coalesce(p_question -> 'options', '[]'::jsonb)) with ordinality as x (o, ord)), '[]'::jsonb)
  )
$$;

-- El contenido de las versiones de la app para compararlas con su renglón, con el nivel cognitivo
create or replace function public.bank_sync_versions_content(p_version_ids uuid[]) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'versionId', q.id,
    'content', jsonb_build_object(
      'branch', q.branch, 'topic', q.topic, 'subtopic', coalesce(q.subtopic, ''),
      'difficulty', coalesce(q.difficulty, 3), 'itemKinds', to_jsonb(q.item_kinds),
      'cognitiveLevel', q.cognitive_level,
      'task', coalesce(q.task, ''), 'polarity', coalesce(q.polarity, 'affirmative'),
      'language', q.language,
      'vignette', coalesce(q.body ->> 'vignette', ''), 'prompt', coalesce(q.body ->> 'prompt', ''),
      'explanation', coalesce(q.body ->> 'explanation', ''),
      'refs', coalesce((select jsonb_agg(r ->> 'title' order by ord)
        from jsonb_array_elements(case when jsonb_typeof(q.body -> 'gpcRefs') = 'array' then q.body -> 'gpcRefs' else '[]'::jsonb end)
          with ordinality as x (r, ord)), '[]'::jsonb),
      'options', coalesce((select jsonb_agg(jsonb_build_object(
          'letter', o.letter, 'position', coalesce(o.position, 0), 'text', o.text, 'isCorrect', o.is_correct,
          'biasTag', o.bias_tag, 'rationale', o.rationale) order by o.position)
        from public.question_options o where o.question_version_id = q.id), '[]'::jsonb),
      'canonical', coalesce((select jsonb_agg(coalesce(o.letter, chr(65 + coalesce(o.position, 0))) order by o.position)
        from public.question_options o where o.question_version_id = q.id and o.id = any (q.canonical_option_ids)), '[]'::jsonb),
      'caseKey', c.case_key, 'caseOrder', q.case_order, 'caseVignette', c.vignette
    ))), '[]'::jsonb)
  from public.questions q
  left join public.clinical_cases c on c.id = q.case_id
  where q.id = any (coalesce(p_version_ids, '{}'))
$$;
