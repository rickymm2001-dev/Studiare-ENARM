-- Ayudas compartidas de las pruebas del banco en la nube (B11). Cada archivo de prueba del banco las
-- incluye con \ir. Son funciones de pg_temp, así que viven solo en la sesión de ese archivo. Todo el
-- texto que siembran dice [Prueba] y es simulado, nunca contenido médico.

-- Una sesión de Supabase con su usuario y, si se da, su session_id. aal es aal1 por omisión
create or replace function pg_temp.as_user(uid text, sid text default null, aal text default 'aal1')
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', '', true);
  -- Sin uid es un token sin sub, como una sesión rota. auth.uid() da null
  perform set_config(
    'request.jwt.claims',
    (jsonb_build_object('role', 'authenticated', 'aal', aal)
      || case when coalesce(uid, '') = '' then '{}'::jsonb else jsonb_build_object('sub', uid) end
      || case when sid is null then '{}'::jsonb else jsonb_build_object('session_id', sid) end)::text,
    true
  );
  execute 'set local role authenticated';
end $$;

-- La llave de servicio, como la usan las Edge Functions
create or replace function pg_temp.as_service() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  execute 'set local role service_role';
end $$;

create or replace function pg_temp.as_anon() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  execute 'set local role anon';
end $$;

create or replace function pg_temp.expect(ok boolean, msg text) returns void language plpgsql as $$
begin
  if not coalesce(ok, false) then raise exception 'FALLA %', msg; end if;
end $$;

-- El SQLSTATE con el que falla una sentencia, o null si no falla
create or replace function pg_temp.fails_with(stmt text) returns text language plpgsql as $$
begin
  execute stmt;
  return null;
exception when others then
  return sqlstate;
end $$;

create or replace function pg_temp.is_blocked(stmt text) returns boolean language plpgsql as $$
begin
  execute stmt;
  return false;
exception when insufficient_privilege then
  return true;
end $$;

-- El resultado de una consulta que devuelve jsonb
create or replace function pg_temp.j(stmt text) returns jsonb language plpgsql as $$
declare v jsonb;
begin
  execute stmt into v;
  return v;
end $$;

-- Prende o apaga una bandera de feature_flags, como lo hará Ricardo en Plataforma
create or replace function pg_temp.set_flag(p_name text, p_value boolean) returns void language sql as $$
  insert into public.platform_settings (key, value) values ('feature_flags', jsonb_build_object(p_name, p_value))
  on conflict (key) do update set value = public.platform_settings.value || jsonb_build_object(p_name, p_value)
$$;

-- Cambia un campo de un ajuste de platform_settings
create or replace function pg_temp.set_setting(p_key text, p_field text, p_value jsonb) returns void language sql as $$
  update public.platform_settings set value = value || jsonb_build_object(p_field, p_value) where key = p_key
$$;

-- El contenido simulado de una pregunta, en la forma interna de bank_insert_version
create or replace function pg_temp.bank_content(
  p_n integer, p_options integer default 4, p_branch text default 'pediatrics',
  p_topic text default 'neonatology', p_subtopic text default 'neonatal_jaundice',
  p_format text default 'clinical_case'
) returns jsonb language sql as $$
  select jsonb_build_object(
    'branch', p_branch, 'topic', p_topic, 'subtopic', p_subtopic, 'difficulty', (p_n % 5) + 1,
    'itemKinds', '[]'::jsonb, 'polarity', 'affirmative', 'task', 'diagnosis', 'format', p_format,
    'structureSource', 'physician', 'language', 'es',
    'vignette', '[Prueba] Caso simulado ' || p_n, 'prompt', '[Prueba] ¿Pregunta simulada ' || p_n || '?',
    'explanation', '[Prueba] Explicación simulada ' || p_n,
    'gpcRefs', jsonb_build_array(jsonb_build_object('title', '[Prueba] Guía simulada', 'status', 'to_verify')),
    'clues', '[]'::jsonb,
    'options', (
      select jsonb_agg(jsonb_build_object(
        'letter', chr(64 + i), 'text', '[Prueba] Opción ' || chr(64 + i), 'isCorrect', i = 1,
        'biasTag', case when i = 1 then null
          else (array['anchoring', 'premature_closure', 'framing_effect', 'availability_heuristic',
                      'omission_bias', 'belief_bias', 'information_bias', 'loss_aversion', 'complexity_bias'])[i - 1] end,
        'rationale', '[Prueba] Justificación ' || chr(64 + i), 'canonical', i <= 4
      ) order by i)
      from generate_series(1, p_options) i
    )
  )
$$;

-- Siembra una pregunta del banco como superusuario, con su registro. approved la publica con
-- bank_publish. Devuelve el id estable de la pregunta
create or replace function pg_temp.bank_seed(
  p_key text, p_status text default 'approved', p_case uuid default null, p_order integer default null,
  p_author uuid default null, p_options integer default 4
) returns uuid language plpgsql as $$
declare
  v_question uuid := public.stable_bank_uuid('test-q', p_key);
  v_version uuid;
begin
  v_version := public.bank_insert_version(
    v_question,
    pg_temp.bank_content(abs(hashtext(p_key)) % 1000, p_options,
      p_format => case when p_case is null then 'clinical_case' else 'serial_case' end),
    'sheet', p_author, p_case, p_order, null, '{}');
  insert into public.bank_questions (question_id, origin, source_key, latest_version_id)
    values (v_question, 'sheet', 'sheet:' || p_key, v_version)
    on conflict (question_id) do update set latest_version_id = excluded.latest_version_id, updated_at = now();
  if p_status <> 'draft' then
    update public.questions set editorial_status = p_status, decided_at = now() where id = v_version;
  end if;
  if p_status = 'approved' then
    perform public.bank_publish(v_question);
  end if;
  return v_question;
end $$;

-- La versión más reciente de una pregunta
create or replace function pg_temp.latest(p_question uuid) returns uuid language sql as $$
  select latest_version_id from public.bank_questions where question_id = p_question
$$;

-- Un caso clínico simulado
create or replace function pg_temp.bank_case(p_key text) returns uuid language plpgsql as $$
declare
  v_id uuid := public.stable_bank_uuid('test-case', p_key);
begin
  insert into public.clinical_cases (id, vignette, case_key) values (v_id, '[Prueba] Caso seriado simulado ' || p_key, p_key)
    on conflict (id) do nothing;
  return v_id;
end $$;

-- El borrador del editor (QuestionDraft con ids uuid) de una versión, para guardar otra encima.
-- p_changes se mezcla arriba, por ejemplo {"explanation": ""}
create or replace function pg_temp.draft_of(p_version uuid, p_changes jsonb default '{}') returns jsonb language sql as $$
  select jsonb_build_object(
    'vignette', coalesce(q.body ->> 'vignette', ''), 'prompt', q.body ->> 'prompt', 'branch', q.branch,
    'topic', q.topic, 'subtopic', q.subtopic,
    'structure', jsonb_build_object('polarity', q.polarity, 'task', q.task, 'format', q.format),
    'explanation', q.body ->> 'explanation', 'gpcRefs', q.body -> 'gpcRefs', 'physicianDifficulty', q.difficulty,
    'itemKinds', to_jsonb(q.item_kinds), 'clues', coalesce(q.body -> 'clues', '[]'::jsonb),
    'options', (
      select jsonb_agg(jsonb_build_object(
        'optionId', o.option_id, 'text', o.text, 'isCorrect', o.is_correct, 'biasTag', o.bias_tag,
        'secondaryBiasTags', to_jsonb(o.secondary_bias_tags), 'rationale', o.rationale,
        'canonical', o.id = any (q.canonical_option_ids)) order by o.position)
      from public.question_options o where o.question_version_id = q.id)
  ) || p_changes
  from public.questions q where q.id = p_version
$$;

-- Como el revisor, etiqueta a ciegas todos los distractores de la versión más reciente con p_tag. Lee
-- las opciones con editor_question, como la app. Devuelve la respuesta de la última etiqueta
create or replace function pg_temp.label_all(p_question uuid, p_tag text) returns jsonb language plpgsql as $$
declare
  v_question jsonb := public.editor_question(p_question);
  v_option jsonb;
  v_result jsonb;
begin
  for v_option in select * from jsonb_array_elements(v_question -> 'versions' -> 0 -> 'options') loop
    if not (v_option ->> 'isCorrect')::boolean then
      v_result := public.editor_label_option((v_question -> 'versions' -> 0 ->> 'versionId')::uuid,
        (v_option ->> 'optionId')::uuid, p_tag);
    end if;
  end loop;
  return v_result;
end $$;
