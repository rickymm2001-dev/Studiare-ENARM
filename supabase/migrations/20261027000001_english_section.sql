-- Inglés médico (B13 del plan del cambio, respuesta 61, 1.6 y 1.7 del plan de B13). Un caso de lectura en
-- inglés es un caso seriado del banco, así que el servidor solo suma lo que pide un texto en inglés
--
-- Qué trae
--   - El tema medical_vocabulary con su subtema english_terms en bank_taxonomy. Solo lo usan las tarjetas del
--     mazo de vocabulario, para que Repasar y Conócete las agrupen dentro de Inglés médico. Ninguna pregunta
--     lo usa. tests/content/taxonomySeed.test.ts compara esta siembra, junto con la de
--     20261023000001_bank_taxonomy.sql, con src/demo/content/topic-taxonomy.json
--   - bank_passage_source_issue(refs). Lee la fuente del texto de las referencias de una versión y dice si
--     está bien (null), si falta o le falta el título, la licencia o el enlace (passage_source_missing) o si
--     su licencia no está en la lista (license_not_allowed). Es el espejo de parsePassageSource en
--     src/data/content/passageSource.ts, y supabase/tests/english_section_test.sql (EN9) compara las dos
--     sobre tests/fixtures/passage-sources.json. La fuente viaja como la primera referencia con la forma
--     fija Fuente del texto. título. licencia. enlace, así no se redefinen las siete funciones del contenido
--     de B11 (8.14 del plan de B13)
--   - bank_version_issues suma dos reglas al cuerpo de B11, sin cambiar su firma. language_branch_mismatch
--     (estructura) cuando la versión está en inglés fuera de Inglés médico o en español dentro de esa rama, y
--     el pendiente de la fuente del texto de las versiones en inglés. Van en el mismo orden que
--     src/data/content/questionRules.ts. bank_incomplete_of trata el primero como de estructura, así que no
--     entra a incomplete y la versión no se manda a revisión ni se aprueba
--
-- Nada cambia para una versión en español. Es idempotente, no lleva sentencias delete ni drop y no edita las
-- migraciones anteriores (D-113). create or replace con la misma firma no necesita drop. Va después de
-- 20261023000006_bank_sync_cron.sql y de las de B12, y se vuelve a correr al final de supabase/tests/run.sh
-- porque redefine funciones de B11

-- ===================================================================== Taxonomía
insert into public.bank_taxonomy (branch, topic, subtopic, section) values
  ('medical_english', 'medical_vocabulary', 'english_terms', 'english')
  on conflict (branch, topic, subtopic) do nothing;

-- ===================================================================== Fuente del texto
-- null si la fuente está bien. La primera referencia que empieza con Fuente del texto. (sin importar
-- mayúsculas ni espacios de más) se lee de derecha a izquierda. El último pedazo que empieza con http es el
-- enlace, la licencia es lo que sigue al último punto con espacio (o todo, si es el nombre exacto de una
-- licencia) y lo anterior es el título. Las licencias se reconocen solo por su nombre exacto, sin importar
-- mayúsculas y con o sin el acento de público. Solo el texto propio del equipo no pide título ni enlace
--
-- Los espacios son los mismos que en passageSource.ts (SPACE_CHARS), no los de \s ni [[:space:]], que
-- cambian con el motor y el idioma de la base. Son el espacio, la tabulación, el salto de línea, la
-- tabulación vertical, el salto de página, el retorno de carro, el espacio sin salto (U+00A0) y la marca de
-- orden de bytes (U+FEFF). Los dos últimos se escriben con sus bytes en octal, así son los mismos en una base
-- UTF8 y en la de pruebas locales, que es SQL_ASCII, y van como alternativas y no dentro de un corchete, para
-- que un solo byte de otro carácter no se tome por espacio. Antes se usaba \s, que en la base no cuenta el
-- espacio sin salto ni la marca de orden de bytes, y una referencia con uno de ellos era válida en la app y
-- no en la base (hallazgo 7 de la revisión)
create or replace function public.bank_passage_source_issue(p_refs jsonb) returns text
language plpgsql immutable set search_path = public, pg_temp as $$
declare
  v_spaces constant text := '(?:[ \t\n\v\f\r]|' || E'\302\240' || '|' || E'\357\273\277' || ')+';
  v_ref text;
  v_rest text;
  v_last text;
  v_url text := '';
  v_cut text[];
  v_title text;
  v_label text;
  v_license text;
begin
  select btrim(regexp_replace(coalesce(e.r ->> 'title', ''), v_spaces, ' ', 'g')) into v_ref
    from jsonb_array_elements(case when jsonb_typeof(p_refs) = 'array' then p_refs else '[]'::jsonb end)
         with ordinality as e (r, ord)
    where btrim(regexp_replace(coalesce(e.r ->> 'title', ''), v_spaces, ' ', 'g')) ~* '^fuente del texto\.( |$)'
    order by e.ord
    limit 1;
  if v_ref is null then
    return 'passage_source_missing';
  end if;
  -- Después de Fuente del texto. que mide 17 caracteres
  v_rest := btrim(substr(v_ref, 18));
  v_last := substring(v_rest from '[^ ]*$');
  if v_last ~* '^https?://' then
    v_url := v_last;
    v_rest := btrim(left(v_rest, length(v_rest) - length(v_last)));
  end if;
  v_rest := btrim(regexp_replace(v_rest, '\.$', ''));
  if v_rest = '' then
    return 'passage_source_missing';
  end if;
  v_cut := regexp_match(v_rest, '^(.*)\. (.*)$');
  if v_cut is null then
    -- Un solo pedazo. Si es el nombre de una licencia no hay título, y si no, es un título sin licencia
    v_title := '';
    v_label := v_rest;
  else
    v_title := btrim(v_cut[1]);
    v_label := btrim(v_cut[2]);
  end if;
  -- Los nombres exactos, sin importar mayúsculas y con o sin el acento de público. Con expresiones y no
  -- con lower y translate, para que den lo mismo en una base UTF8 y en la de pruebas locales
  v_label := btrim(regexp_replace(v_label, v_spaces, ' ', 'g'));
  v_license := case
    when v_label ~* '^texto propio del equipo studiare$' then 'team'
    when v_label ~* '^dominio p(ú|Ú|u)blico$' then 'public_domain'
    when v_label ~* '^cc0$' then 'cc0'
    when v_label ~* '^cc by$' then 'cc_by'
    when v_label ~* '^cc by-sa$' then 'cc_by_sa'
  end;
  if v_license is null then
    return case when v_cut is null then 'passage_source_missing' else 'license_not_allowed' end;
  end if;
  if v_license <> 'team' and (
    v_title = '' or v_url !~* '^https://[a-z0-9-]+(\.[a-z0-9-]+)+(:[0-9]+)?([/?#][^ ]*)?$'
  ) then
    return 'passage_source_missing';
  end if;
  return null;
end;
$$;

-- ===================================================================== Pendientes de una versión
-- El cuerpo de B11 (20261023000002_bank_core.sql) con las dos reglas del inglés. Espejo de
-- src/data/content/questionRules.ts, con los mismos códigos y el mismo orden. Primero la estructura,
-- después la tarea, la explicación, las referencias y la fuente del texto, y al final cada opción por
-- posición. Nunca marca un reactivo por imperfecto (D-080)
create or replace function public.bank_version_issues(p_version_id uuid) returns text[]
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_version public.questions%rowtype;
  v_issues text[] := '{}';
  v_count integer;
  v_correct integer;
  v_option record;
  v_letter text;
  v_source text;
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
  -- Inglés fuera de Inglés médico, o español dentro de esa rama (B13). Es de estructura y no se arregla
  -- con una celda
  if (v_version.language = 'en') <> exists (
    select 1 from public.bank_taxonomy t where t.branch = v_version.branch and t.section = 'english'
  ) then
    v_issues := array_append(v_issues, 'language_branch_mismatch');
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
  -- Una pregunta en inglés lleva su fuente del texto con una licencia aceptada, y la fuente ya cuenta
  -- como referencia (B13)
  if v_version.language = 'en' then
    v_source := public.bank_passage_source_issue(
      case when jsonb_typeof(v_version.body -> 'gpcRefs') = 'array' then v_version.body -> 'gpcRefs' else '[]'::jsonb end
    );
    if v_source is not null then
      v_issues := array_append(v_issues, v_source);
    end if;
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

-- Los pendientes que se completan en el Sheet o en el editor, sin los de estructura. El idioma que no va con
-- la rama es de estructura (B13)
create or replace function public.bank_incomplete_of(p_issues text[]) returns text[]
language sql immutable set search_path = public, pg_temp as $$
  select coalesce(array_agg(issue order by ord), '{}')
  from unnest(coalesce(p_issues, '{}')) with ordinality as i (issue, ord)
  where issue not in ('prompt_missing', 'options_count', 'correct_count', 'canonical_invalid', 'language_branch_mismatch')
$$;

-- ===================================================================== Permisos de las funciones
-- Todas son ayudas internas. Solo las llaman otras funciones del servidor
revoke all on function public.bank_passage_source_issue(jsonb) from public, anon, authenticated, service_role;
revoke all on function public.bank_version_issues(uuid) from public, anon, authenticated, service_role;
revoke all on function public.bank_incomplete_of(text[]) from public, anon, authenticated, service_role;
