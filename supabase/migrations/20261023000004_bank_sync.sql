-- Banco en la nube, parte 4. Sincronización con el Google Sheet y la importación del admin (B11 del
-- plan del cambio, PC 7, 1.14 y sección 3 del plan de B11).
--
-- Cómo corre
--   La Edge Function bank-sync lee el Sheet, lo convierte y decide qué hacer con cada renglón. La base
--   guarda la corrida y aplica cada renglón con candado. Cron la llama cada hora con una ficha que vive
--   en Vault (20261023000006) y el admin con su sesión desde Banco y Sheet. La función se despliega sin
--   verificar JWT y verifica por su cuenta la ficha o la sesión
--
-- Reglas que se hacen cumplir aquí
--   - Una sola corrida a la vez (índice único sobre las que corren) y Sincronizar ahora no corre si la
--     anterior empezó hace menos de minIntervalSeconds. Las dos salen como skipped con su motivo
--   - bank_sync.enabled en false deja toda corrida en skipped con disabled. El Sheet de prueba siempre
--     va en solo reporte (8.27). Con fórmulas en la columna ID, la función baja a solo reporte (8.1)
--   - Solo reporte (dry_run) escribe nada más el reporte de renglones. Aplicar (apply) escribe
--     borradores, versiones, asignaciones y marcas, nunca aprueba, publica ni retira (3.5)
--   - Antes de escribir, bank_apply_row revisa con candado que la versión más reciente siga siendo la
--     que vio el planeador. Si alguien guardó en medio, es conflicto y no pisa nada
--   - Lo que desapareció del Sheet se marca y lo confirma el admin, sin borrar ni retirar (3.8)
--   - Ni la corrida ni el reporte de renglones guardan texto de preguntas, opciones, justificaciones,
--     explicaciones ni referencias. Solo códigos, columnas y valores de listas cerradas recortados a 60
--     caracteres (PC 7.3)
--   - Las funciones del servidor solo las ejecuta la llave de servicio. Las del admin piden is_admin
--
-- Es idempotente, no lleva sentencias delete ni drop y no edita las migraciones anteriores (D-113). Va
-- después de 20261023000003_bank_editorial.sql

-- ===================================================================== Corridas y renglones
create table if not exists public.bank_sync_runs (
  id uuid primary key default public.ulid_uuid(),
  -- En JSON sale como trigger
  run_trigger text not null check (run_trigger in ('cron', 'manual', 'import')),
  target text not null check (target in ('real', 'test', 'file')),
  mode text not null check (mode in ('dry_run', 'apply')),
  status text not null default 'running'
    check (status in ('running', 'ok', 'partial', 'failed', 'skipped', 'interrupted')),
  -- disabled, not_configured, too_soon, running, no_changes, id_formula, columns_missing o sheet_error
  reason text check (char_length(reason) <= 120),
  actor_id uuid references auth.users (id) on delete set null,
  -- Huella de todo el Sheet, para saltar corridas sin cambios
  sheet_hash text,
  counts jsonb not null default '{}',
  started_at timestamptz not null default now(),
  finished_at timestamptz
);
create unique index if not exists bank_sync_one_running on public.bank_sync_runs ((true)) where status = 'running';
create index if not exists bank_sync_runs_started on public.bank_sync_runs (started_at desc);

create table if not exists public.bank_sync_row_results (
  id bigint generated always as identity primary key,
  run_id uuid not null references public.bank_sync_runs (id) on delete cascade,
  -- null en las que desaparecieron del Sheet
  row_number integer,
  sheet_key text check (char_length(sheet_key) <= 60),
  outcome text not null check (outcome in
    ('created', 'versioned', 'converged', 'meta', 'conflict', 'rejected', 'missing')),
  incomplete text[] not null default '{}',
  notices text[] not null default '{}',
  -- [{code, column, value}]. value solo de listas cerradas, 60 caracteres
  problems jsonb not null default '[]',
  question_id uuid
);
create index if not exists bank_sync_row_results_run on public.bank_sync_row_results (run_id, row_number);

alter table public.bank_sync_runs enable row level security;
alter table public.bank_sync_row_results enable row level security;
revoke all on public.bank_sync_runs, public.bank_sync_row_results from public, anon, authenticated, service_role;
revoke all on sequence public.bank_sync_row_results_id_seq from public, anon, authenticated, service_role;

-- ===================================================================== Ajustes
-- bank_sync con sus valores de respaldo
create or replace function public.bank_sync_settings() returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select '{"enabled":false,"mode":"dry_run","tab":"Preguntas","maxRows":5000,"minIntervalSeconds":60,"idPattern":"^[A-Z]{2,4}-[0-9]{4,5}$"}'::jsonb
    || coalesce(
      (select value from public.platform_settings where key = 'bank_sync' and jsonb_typeof(value) = 'object'),
      '{}'::jsonb
    )
$$;

-- Un renglón del reporte, sin texto. Los valores de los problemas se recortan a 60 caracteres
create or replace function public.bank_sync_problems(p_problems jsonb) returns jsonb
language sql immutable set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(
    jsonb_strip_nulls(jsonb_build_object(
      'code', left(p ->> 'code', 40),
      'column', left(p ->> 'column', 60),
      'value', left(p ->> 'value', 60)))
    order by ord), '[]'::jsonb)
  from jsonb_array_elements(case when jsonb_typeof(p_problems) = 'array' then p_problems else '[]'::jsonb end)
    with ordinality as x (p, ord)
$$;

create or replace function public.bank_text_array(p_value jsonb) returns text[]
language sql immutable set search_path = public, pg_temp as $$
  select coalesce(array(select left(v, 60) from jsonb_array_elements_text(
    case when jsonb_typeof(p_value) = 'array' then p_value else '[]'::jsonb end) v), '{}')
$$;

-- ===================================================================== Quién puede pedirla
-- La ficha de Cron, que vive en Vault como bank_sync_cron_token. Sin Vault, o sin la ficha, false
create or replace function public.bank_sync_cron_ok(p_token text) returns boolean
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_secret text;
begin
  if p_token is null or char_length(p_token) < 32 or to_regclass('vault.decrypted_secrets') is null then
    return false;
  end if;
  execute 'select decrypted_secret from vault.decrypted_secrets where name = $1 limit 1'
    into v_secret using 'bank_sync_cron_token';
  return v_secret is not null and v_secret = p_token;
exception when others then
  return false;
end;
$$;

-- La llama bank-sync con la sesión del admin que pidió Sincronizar ahora. Devuelve su id
create or replace function public.admin_bank_sync_authorize() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform public.bank_require_admin();
  return jsonb_build_object('actorId', auth.uid());
end;
$$;

-- ===================================================================== Inicio y fin
-- Empieza una corrida, o la deja en skipped con su motivo. Devuelve lo que la función necesita para
-- planear, sin texto, con lo que la base sabe de cada ID del origen
create or replace function public.bank_sync_begin(p_trigger text, p_target text, p_actor uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_settings jsonb := public.bank_sync_settings();
  v_enabled boolean;
  v_interval integer;
  v_mode text;
  v_run uuid;
  v_reason text;
  v_origin text := case when p_trigger = 'import' then 'import' else 'sheet' end;
begin
  if p_trigger is null or p_trigger not in ('cron', 'manual', 'import')
     or p_target is null or p_target not in ('real', 'test', 'file') then
    raise exception 'Corrida desconocida' using errcode = '22023';
  end if;
  begin
    v_enabled := coalesce((v_settings ->> 'enabled')::boolean, false);
    v_interval := greatest(coalesce((v_settings ->> 'minIntervalSeconds')::integer, 60), 0);
  exception when others then
    v_enabled := false;
    v_interval := 60;
  end;
  v_mode := case
    when p_target = 'test' then 'dry_run'
    when p_trigger = 'import' then 'apply'
    when v_settings ->> 'mode' = 'apply' then 'apply'
    else 'dry_run' end;

  -- Una corrida que quedó colgada más de 15 minutos ya no corre
  update public.bank_sync_runs set status = 'interrupted', reason = 'stale', finished_at = now()
    where status = 'running' and started_at < now() - interval '15 minutes';
  if p_trigger <> 'import' and not v_enabled then
    v_reason := 'disabled';
  elsif exists (select 1 from public.bank_sync_runs where status = 'running') then
    v_reason := 'running';
  elsif p_trigger = 'manual' and exists (
    select 1 from public.bank_sync_runs
    where status <> 'skipped' and started_at > now() - make_interval(secs => v_interval)
  ) then
    v_reason := 'too_soon';
  end if;

  if v_reason is null then
    begin
      insert into public.bank_sync_runs (run_trigger, target, mode, status, actor_id)
        values (p_trigger, p_target, v_mode, 'running', p_actor)
        returning id into v_run;
    exception when unique_violation then
      v_reason := 'running';
    end;
  end if;
  if v_reason is not null then
    insert into public.bank_sync_runs (run_trigger, target, mode, status, reason, actor_id, finished_at)
      values (p_trigger, p_target, v_mode, 'skipped', v_reason, p_actor, now())
      returning id into v_run;
    return jsonb_build_object('runId', v_run, 'status', 'skipped', 'reason', v_reason, 'mode', v_mode,
      'target', p_target);
  end if;

  return jsonb_build_object(
    'runId', v_run, 'status', 'running', 'reason', null, 'mode', v_mode, 'target', p_target,
    'settings', jsonb_build_object(
      'tab', coalesce(v_settings ->> 'tab', 'Preguntas'),
      'maxRows', least(greatest(coalesce((v_settings ->> 'maxRows')::integer, 5000), 1), 40000),
      'idPattern', coalesce(v_settings ->> 'idPattern', '^[A-Z]{2,4}-[0-9]{4,5}$')),
    -- La huella para saltar una corrida de Cron sin cambios. Solo de una corrida que aplicó (no de solo
    -- reporte ni de una bajada a solo reporte por fórmulas en el ID), y ninguna si alguna pregunta pide la
    -- siguiente corrida o si cambiaron las claves de los médicos o los revisores por subespecialidad
    -- después de esa corrida, porque el mismo Sheet ya no da lo mismo (M4 de la revisión)
    'lastSheetHash', (
      select r.sheet_hash from public.bank_sync_runs r
      where r.target = p_target and r.status in ('ok', 'partial') and r.mode = 'apply'
        and r.reason is distinct from 'id_formula' and r.sheet_hash is not null
        and not exists (
          select 1 from public.bank_questions q where q.source_key like v_origin || ':%' and q.sheet_force_next)
        and not exists (select 1 from public.physician_codes c where c.set_at >= r.started_at)
        and not exists (select 1 from public.bank_topic_reviewers t where t.set_at >= r.started_at)
      order by r.started_at desc limit 1),
    'known', coalesce((
      select jsonb_agg(jsonb_build_object(
        'key', substring(r.source_key from char_length(v_origin) + 2),
        'questionId', r.question_id, 'rowHash', r.sheet_row_hash, 'metaHash', r.sheet_meta_hash,
        'latestVersionId', r.latest_version_id, 'latestSource', v.version_source,
        'appliedVersionId', r.sheet_applied_version_id, 'forceNext', r.sheet_force_next,
        'conflictRowHash', r.conflict_row_hash, 'status', r.status))
      from public.bank_questions r
      join public.questions v on v.id = r.latest_version_id
      where r.source_key like v_origin || ':%'
    ), '[]'::jsonb)
  );
end;
$$;

-- El contenido de versiones de la app para compararlas con su renglón (VersionContent de
-- src/data/content/contentHash.ts). Solo para la función, con la llave de servicio
create or replace function public.bank_sync_versions_content(p_version_ids uuid[]) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'versionId', q.id,
    'content', jsonb_build_object(
      'branch', q.branch, 'topic', q.topic, 'subtopic', coalesce(q.subtopic, ''),
      'difficulty', coalesce(q.difficulty, 3), 'itemKinds', to_jsonb(q.item_kinds),
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

-- El contenido de un renglón (SyncQuestion) a la forma interna de bank_insert_version. Las opciones
-- toman un id estable por su letra, así una opción que sigue en la letra conserva su etiqueta
create or replace function public.bank_sheet_content(p_origin text, p_key text, p_question jsonb) returns jsonb
language sql immutable set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'branch', p_question ->> 'branch', 'topic', p_question ->> 'topic', 'subtopic', p_question ->> 'subtopic',
    'difficulty', p_question -> 'difficulty', 'itemKinds', coalesce(p_question -> 'itemKinds', '[]'::jsonb),
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

-- Aplica un renglón ya planeado, o solo lo reporta. p_origin es sheet o import. Devuelve
-- {rowNumber, outcome, questionId}
create or replace function public.bank_apply_row(p_run uuid, p_origin text, p_row jsonb, p_apply boolean)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_key text := btrim(coalesce(p_row ->> 'key', ''));
  v_decision text := coalesce(p_row ->> 'decision', 'rejected');
  v_question jsonb := p_row -> 'question';
  v_meta jsonb := coalesce(p_row -> 'meta', '{}'::jsonb);
  v_notices text[] := public.bank_text_array(p_row -> 'notices');
  v_incomplete text[] := public.bank_text_array(p_row -> 'incomplete');
  v_problems jsonb := public.bank_sync_problems(p_row -> 'problems');
  v_question_id uuid;
  v_registry public.bank_questions%rowtype;
  v_author uuid;
  v_reviewer uuid;
  v_case uuid;
  v_version uuid;
  v_latest public.questions%rowtype;
  v_outcome text;
  v_flags text[];
  v_status text := v_meta ->> 'sheetStatus';
begin
  if v_key = '' or v_decision = 'rejected' then
    v_decision := 'rejected';
  else
    v_question_id := public.stable_bank_uuid(p_origin || '-q', v_key);
  end if;

  -- Autor y Revisor por la clave corta del médico. Una clave que no es de un médico solo avisa
  if v_decision <> 'rejected' then
    if v_meta ->> 'authorCode' is not null then
      select c.user_id into v_author from public.physician_codes c
        join public.user_roles r on r.user_id = c.user_id and r.role = 'physician'
        where c.code = v_meta ->> 'authorCode';
      if v_author is null and not 'author_unknown' = any (v_notices) then
        v_notices := array_append(v_notices, 'author_unknown');
      end if;
    end if;
    if v_meta ->> 'reviewerCode' is not null then
      select c.user_id into v_reviewer from public.physician_codes c
        join public.user_roles r on r.user_id = c.user_id and r.role = 'physician'
        where c.code = v_meta ->> 'reviewerCode';
      if v_reviewer is null and not 'reviewer_unknown' = any (v_notices) then
        v_notices := array_append(v_notices, 'reviewer_unknown');
      end if;
    end if;
    if v_author is not null and v_author = v_reviewer then
      v_reviewer := null;
      if not 'author_is_reviewer' = any (v_notices) then
        v_notices := array_append(v_notices, 'author_is_reviewer');
      end if;
    end if;
  end if;

  if v_decision <> 'rejected' and p_apply then
    perform pg_advisory_xact_lock(hashtextextended('bank-question:' || v_question_id::text, 0));
    select * into v_registry from public.bank_questions where question_id = v_question_id for update;
    -- Lo que vio el planeador tiene que seguir igual. Si alguien guardó en medio, es conflicto
    if (v_decision = 'create' and v_registry.question_id is not null)
       or (v_decision <> 'create' and (v_registry.question_id is null
           or v_registry.latest_version_id is distinct from nullif(p_row ->> 'expectLatestVersionId', '')::uuid)) then
      v_decision := case when v_registry.question_id is null then 'create' else 'conflict' end;
    end if;
    if v_decision in ('create', 'version') and jsonb_typeof(v_question) <> 'object' then
      v_decision := 'rejected';
    end if;
  end if;

  v_outcome := case v_decision
    when 'create' then 'created' when 'version' then 'versioned' when 'converged' then 'converged'
    when 'conflict' then 'conflict' when 'meta_only' then 'meta' else 'rejected' end;

  if p_apply and v_decision in ('create', 'version') then
    v_flags := array(select n from unnest(v_notices) n where n in ('topic_inferred', 'kind_control_check'));
    if v_question ->> 'caseKey' is not null then
      v_case := public.stable_bank_uuid(p_origin || '-case',
        upper(v_question ->> 'caseKey') || '|' || md5(coalesce(v_question ->> 'caseVignette', '')));
      insert into public.clinical_cases (id, vignette, case_key, content_hash)
        values (v_case, coalesce(v_question ->> 'caseVignette', ''), upper(v_question ->> 'caseKey'),
                md5(coalesce(v_question ->> 'caseVignette', '')))
        on conflict (id) do nothing;
    end if;
    v_version := public.bank_insert_version(
      v_question_id, public.bank_sheet_content(p_origin, v_key, v_question), p_origin, v_author, v_case,
      nullif(v_question ->> 'caseOrder', '')::integer, null, v_flags, v_incomplete);
    if v_decision = 'create' then
      insert into public.bank_questions (question_id, origin, source_key, latest_version_id, sheet_row_hash,
        sheet_meta_hash, sheet_applied_version_id, sheet_seen_at)
        values (v_question_id, p_origin, p_origin || ':' || v_key, v_version, p_row ->> 'rowHash',
          p_row ->> 'metaHash', v_version, now());
    else
      update public.bank_questions set latest_version_id = v_version, sheet_row_hash = p_row ->> 'rowHash',
        sheet_applied_version_id = v_version, sheet_force_next = false, conflict_since = null,
        conflict_row_hash = null, sheet_seen_at = now(), updated_at = now()
        where question_id = v_question_id;
    end if;
  elsif p_apply and v_decision = 'converged' then
    -- El médico copió al Sheet lo que corrigió en la app. Solo se guarda la huella
    update public.bank_questions set sheet_row_hash = p_row ->> 'rowHash', sheet_applied_version_id = latest_version_id,
      conflict_since = null, conflict_row_hash = null, sheet_force_next = false, sheet_seen_at = now(), updated_at = now()
      where question_id = v_question_id;
  elsif p_apply and v_decision = 'conflict' then
    update public.bank_questions set conflict_since = coalesce(conflict_since, now()),
      conflict_row_hash = p_row ->> 'rowHash', sheet_seen_at = now(), updated_at = now()
      where question_id = v_question_id;
  end if;

  -- Autor, Revisor y Estado, salvo en un conflicto, que espera a que alguien lo resuelva
  if p_apply and v_decision in ('create', 'version', 'converged', 'meta_only') then
    if v_author is not null then
      begin
        perform public.bank_assign(v_question_id, 'author', v_author, null);
      exception when sqlstate 'BK003' then
        if not 'author_is_reviewer' = any (v_notices) then v_notices := array_append(v_notices, 'author_is_reviewer'); end if;
      end;
    end if;
    -- Un revisor que el admin reasignó en la app no lo pisa el Sheet. La app gana y el reporte avisa
    -- con reviewer_differs (B7 de la revisión). Uno que vino del Sheet o del revisor por omisión sí cambia
    if v_reviewer is not null and exists (
      select 1 from public.review_assignments a
        join public.user_roles r on r.user_id = a.assigned_by and r.role in ('admin', 'owner')
        where a.question_id = v_question_id and a.role = 'reviewer' and a.revoked_at is null
          and a.physician_id <> v_reviewer
    ) then
      if not 'reviewer_differs' = any (v_notices) then v_notices := array_append(v_notices, 'reviewer_differs'); end if;
    elsif v_reviewer is not null then
      begin
        perform public.bank_assign(v_question_id, 'reviewer', v_reviewer, null);
      exception when sqlstate 'BK003' then
        if not 'author_is_reviewer' = any (v_notices) then v_notices := array_append(v_notices, 'author_is_reviewer'); end if;
      end;
    end if;
    update public.bank_questions set sheet_meta_hash = p_row ->> 'metaHash',
      sheet_status = case when v_status in ('draft', 'ready', 'retire') then v_status end,
      retire_requested_at = case when v_status = 'retire' then coalesce(retire_requested_at, now()) else retire_requested_at end,
      sheet_missing_since = null, sheet_seen_at = now(), updated_at = now()
      where question_id = v_question_id;
    if v_status = 'ready' then
      select q.* into v_latest from public.questions q
        join public.bank_questions r on r.latest_version_id = q.id where r.question_id = v_question_id;
      if v_latest.editorial_status = 'draft' then
        begin
          perform public.bank_send_to_review(v_latest.id, null);
        exception when sqlstate 'BK003' or sqlstate 'BK005' or sqlstate '22023' then
          v_notices := array_append(v_notices, 'not_ready');
        end;
      end if;
    end if;
  elsif not p_apply and v_decision <> 'rejected' and v_status = 'ready' and v_decision in ('create', 'version')
        and cardinality(v_incomplete) > 0 then
    -- En solo reporte se avisa lo que no podría ir a revisión por estar incompleto
    v_notices := array_append(v_notices, 'not_ready');
  end if;

  insert into public.bank_sync_row_results (run_id, row_number, sheet_key, outcome, incomplete, notices, problems, question_id)
    values (p_run, nullif(p_row ->> 'rowNumber', '')::integer, nullif(left(v_key, 60), ''), v_outcome,
            v_incomplete, v_notices, v_problems, v_question_id);
  return jsonb_build_object('rowNumber', (p_row ->> 'rowNumber')::integer, 'outcome', v_outcome, 'questionId', v_question_id);
end;
$$;

-- Aplica una tanda de renglones de una corrida que sigue corriendo. Cada renglón en su propio bloque,
-- así uno que falla no frena a los demás. p_force_dry_run baja la corrida a solo reporte, por ejemplo
-- con fórmulas en la columna ID, y nunca la sube
create or replace function public.bank_sync_apply(p_run uuid, p_rows jsonb, p_force_dry_run boolean default false)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_run public.bank_sync_runs%rowtype;
  v_row jsonb;
  v_results jsonb := '[]'::jsonb;
  v_result jsonb;
begin
  select * into v_run from public.bank_sync_runs where id = p_run for update;
  if not found or v_run.status <> 'running' then
    raise exception 'La corrida no está corriendo' using errcode = 'BK009';
  end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 500 then
    raise exception 'Se esperaba una lista de hasta 500 renglones' using errcode = '22023';
  end if;
  if coalesce(p_force_dry_run, false) and v_run.mode = 'apply' then
    update public.bank_sync_runs set mode = 'dry_run' where id = p_run;
    v_run.mode := 'dry_run';
  end if;
  for v_row in select * from jsonb_array_elements(p_rows) loop
    begin
      v_result := public.bank_apply_row(p_run, case when v_run.run_trigger = 'import' then 'import' else 'sheet' end,
        v_row, v_run.mode = 'apply');
    exception when others then
      -- Un renglón que la base no pudo guardar queda como rechazado, sin su texto
      insert into public.bank_sync_row_results (run_id, row_number, sheet_key, outcome, problems)
        values (p_run, nullif(v_row ->> 'rowNumber', '')::integer, nullif(left(btrim(coalesce(v_row ->> 'key', '')), 60), ''),
                'rejected', jsonb_build_array(jsonb_build_object('code', 'not_representable', 'column', left(sqlstate, 5))));
      v_result := jsonb_build_object('rowNumber', (v_row ->> 'rowNumber')::integer, 'outcome', 'rejected', 'questionId', null);
    end;
    v_results := v_results || jsonb_build_array(v_result);
  end loop;
  return v_results;
end;
$$;

-- Termina una corrida. Con el Sheet real, en apply y sin fallar, marca lo que desapareció del Sheet y
-- lo reporta como missing. En solo reporte solo lo reporta. Nunca borra ni retira (3.8)
create or replace function public.bank_sync_finish(
  p_run uuid, p_seen_keys text[], p_summary jsonb, p_status text, p_reason text
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_run public.bank_sync_runs%rowtype;
  v_missing integer := 0;
  v_counts jsonb;
begin
  if p_status is null or p_status not in ('ok', 'partial', 'failed', 'skipped', 'interrupted') then
    raise exception 'Estado de corrida desconocido' using errcode = '22023';
  end if;
  select * into v_run from public.bank_sync_runs where id = p_run for update;
  if not found then
    raise exception 'La corrida no existe' using errcode = '22023';
  end if;
  if v_run.status <> 'running' then
    return jsonb_build_object('runId', v_run.id, 'status', v_run.status, 'reason', v_run.reason, 'counts', v_run.counts);
  end if;
  if v_run.target = 'real' and v_run.run_trigger <> 'import' and p_status in ('ok', 'partial') then
    insert into public.bank_sync_row_results (run_id, row_number, sheet_key, outcome, question_id)
      select p_run, null, left(substring(r.source_key from 7), 60), 'missing', r.question_id
      from public.bank_questions r
      where r.source_key like 'sheet:%' and r.status = 'active'
        and not substring(r.source_key from 7) = any (coalesce(p_seen_keys, '{}'));
    get diagnostics v_missing = row_count;
    if v_run.mode = 'apply' then
      update public.bank_questions set sheet_missing_since = coalesce(sheet_missing_since, now()), updated_at = now()
        where source_key like 'sheet:%' and status = 'active'
          and not substring(source_key from 7) = any (coalesce(p_seen_keys, '{}'));
      update public.bank_questions set sheet_missing_since = null, sheet_seen_at = now()
        where source_key like 'sheet:%' and substring(source_key from 7) = any (coalesce(p_seen_keys, '{}'));
    end if;
  end if;
  -- Solo números en los conteos. La huella del Sheet va aparte
  select coalesce(jsonb_object_agg(key, value), '{}'::jsonb) into v_counts
    from jsonb_each(case when jsonb_typeof(p_summary) = 'object' then p_summary else '{}'::jsonb end)
    where jsonb_typeof(value) = 'number';
  v_counts := v_counts || jsonb_build_object('missing', v_missing);
  update public.bank_sync_runs set status = p_status, reason = left(p_reason, 120),
    sheet_hash = case when jsonb_typeof(p_summary -> 'sheetHash') = 'string' then left(p_summary ->> 'sheetHash', 64) end,
    counts = v_counts, finished_at = now()
    where id = p_run;
  return jsonb_build_object('runId', p_run, 'status', p_status, 'reason', p_reason, 'counts', v_counts);
end;
$$;

-- ===================================================================== Para el admin
create or replace function public.bank_sync_run_json(r public.bank_sync_runs) returns jsonb
language sql stable set search_path = public, pg_temp as $$
  select jsonb_build_object('id', r.id, 'trigger', r.run_trigger, 'target', r.target, 'mode', r.mode,
    'status', r.status, 'reason', r.reason, 'counts', r.counts, 'startedAt', public.bank_iso(r.started_at),
    'finishedAt', public.bank_iso(r.finished_at))
$$;

-- Las últimas corridas (SyncRunSummary)
create or replace function public.admin_bank_sync_runs(p_limit integer default 20) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform public.bank_require_admin();
  return coalesce((
    select jsonb_agg(public.bank_sync_run_json(r) order by r.started_at desc, r.id desc)
    from (select * from public.bank_sync_runs order by started_at desc, id desc
          limit least(greatest(coalesce(p_limit, 20), 1), 200)) r
  ), '[]'::jsonb);
end;
$$;

-- Los renglones de una corrida (SyncRowResult), por número de renglón y con los faltantes al final
create or replace function public.admin_bank_sync_rows(
  p_run uuid, p_outcome text default null, p_limit integer default 200, p_offset integer default 0
) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform public.bank_require_admin();
  return coalesce((
    select jsonb_agg(jsonb_build_object('rowNumber', x.row_number, 'sheetKey', x.sheet_key, 'outcome', x.outcome,
      'incomplete', to_jsonb(x.incomplete), 'notices', to_jsonb(x.notices), 'problems', x.problems,
      'questionId', x.question_id) order by x.row_number nulls last, x.id)
    from (
      select * from public.bank_sync_row_results
      where run_id = p_run and (p_outcome is null or outcome = p_outcome)
      order by row_number nulls last, id
      limit least(greatest(coalesce(p_limit, 200), 1), 5000) offset greatest(coalesce(p_offset, 0), 0)
    ) x
  ), '[]'::jsonb);
end;
$$;

-- La importación de la pantalla 22 con destino nube. Recibe los renglones que convirtió el navegador
-- con el mismo convertidor (SyncRowPayload), decide aquí contra lo que ya hay con prefijo import: y
-- aplica en una corrida import. Lo que ya se editó en la app queda como conflicto, sin pisarlo
create or replace function public.admin_bank_import(p_rows jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_begin jsonb;
  v_run uuid;
  v_row jsonb;
  v_registry public.bank_questions%rowtype;
  v_rows jsonb := '[]'::jsonb;
  v_results jsonb;
  v_unchanged integer := 0;
  v_decision text;
begin
  perform public.bank_require_admin();
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 500 then
    raise exception 'Se esperaba una lista de hasta 500 renglones' using errcode = '22023';
  end if;
  v_begin := public.bank_sync_begin('import', 'file', auth.uid());
  if v_begin ->> 'status' <> 'running' then
    raise exception 'Hay una sincronización en curso' using errcode = 'BK009';
  end if;
  v_run := (v_begin ->> 'runId')::uuid;
  for v_row in select * from jsonb_array_elements(p_rows) loop
    v_registry := null;
    if nullif(btrim(coalesce(v_row ->> 'key', '')), '') is not null then
      select * into v_registry from public.bank_questions
        where question_id = public.stable_bank_uuid('import-q', btrim(v_row ->> 'key'));
    end if;
    v_decision := case
      when v_row ->> 'decision' = 'rejected' or jsonb_typeof(v_row -> 'question') <> 'object' then 'rejected'
      when v_registry.question_id is null then 'create'
      when v_registry.sheet_row_hash = v_row ->> 'rowHash' and v_registry.sheet_meta_hash = v_row ->> 'metaHash' then 'unchanged'
      when v_registry.sheet_row_hash = v_row ->> 'rowHash' then 'meta_only'
      when v_registry.latest_version_id = v_registry.sheet_applied_version_id then 'version'
      else 'conflict' end;
    if v_decision = 'unchanged' then
      v_unchanged := v_unchanged + 1;
      continue;
    end if;
    v_rows := v_rows || jsonb_build_array(v_row || jsonb_build_object('decision', v_decision,
      'expectLatestVersionId', v_registry.latest_version_id));
  end loop;
  v_results := case when jsonb_array_length(v_rows) > 0 then public.bank_sync_apply(v_run, v_rows) else '[]'::jsonb end;
  return public.bank_sync_finish(v_run, null, jsonb_build_object(
    'read', jsonb_array_length(p_rows), 'unchanged', v_unchanged,
    'created', (select count(*) from jsonb_array_elements(v_results) r where r ->> 'outcome' = 'created'),
    'versioned', (select count(*) from jsonb_array_elements(v_results) r where r ->> 'outcome' = 'versioned'),
    'meta', (select count(*) from jsonb_array_elements(v_results) r where r ->> 'outcome' = 'meta'),
    'conflict', (select count(*) from jsonb_array_elements(v_results) r where r ->> 'outcome' = 'conflict'),
    'rejected', (select count(*) from jsonb_array_elements(v_results) r where r ->> 'outcome' = 'rejected')),
    case when exists (select 1 from jsonb_array_elements(v_results) r where r ->> 'outcome' in ('rejected', 'conflict'))
      then 'partial' else 'ok' end, null) || jsonb_build_object('rows', v_results);
end;
$$;

-- ===================================================================== Permisos de las funciones
revoke all on function public.bank_sync_settings() from public, anon, authenticated, service_role;
revoke all on function public.bank_sync_problems(jsonb) from public, anon, authenticated, service_role;
revoke all on function public.bank_text_array(jsonb) from public, anon, authenticated, service_role;
revoke all on function public.bank_sheet_content(text, text, jsonb) from public, anon, authenticated, service_role;
revoke all on function public.bank_apply_row(uuid, text, jsonb, boolean) from public, anon, authenticated, service_role;
revoke all on function public.bank_sync_run_json(public.bank_sync_runs) from public, anon, authenticated, service_role;
-- Del servidor, solo con la llave de servicio
revoke all on function public.bank_sync_cron_ok(text) from public, anon, authenticated, service_role;
grant execute on function public.bank_sync_cron_ok(text) to service_role;
revoke all on function public.bank_sync_begin(text, text, uuid) from public, anon, authenticated, service_role;
grant execute on function public.bank_sync_begin(text, text, uuid) to service_role;
revoke all on function public.bank_sync_versions_content(uuid[]) from public, anon, authenticated, service_role;
grant execute on function public.bank_sync_versions_content(uuid[]) to service_role;
revoke all on function public.bank_sync_apply(uuid, jsonb, boolean) from public, anon, authenticated, service_role;
grant execute on function public.bank_sync_apply(uuid, jsonb, boolean) to service_role;
revoke all on function public.bank_sync_finish(uuid, text[], jsonb, text, text) from public, anon, authenticated, service_role;
grant execute on function public.bank_sync_finish(uuid, text[], jsonb, text, text) to service_role;
-- Del admin, con su sesión
revoke all on function public.admin_bank_sync_authorize() from public, anon, authenticated, service_role;
grant execute on function public.admin_bank_sync_authorize() to authenticated;
revoke all on function public.admin_bank_sync_runs(integer) from public, anon, authenticated, service_role;
grant execute on function public.admin_bank_sync_runs(integer) to authenticated;
revoke all on function public.admin_bank_sync_rows(uuid, text, integer, integer) from public, anon, authenticated, service_role;
grant execute on function public.admin_bank_sync_rows(uuid, text, integer, integer) to authenticated;
revoke all on function public.admin_bank_import(jsonb) from public, anon, authenticated, service_role;
grant execute on function public.admin_bank_import(jsonb) to authenticated;
