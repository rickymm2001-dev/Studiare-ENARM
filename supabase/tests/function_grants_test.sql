-- Pruebas de los permisos de funciones y tablas (migración 20261014000001). Corre al final sobre la
-- misma base, con usuarios propios. Cada bloque falla con un error si algo no cumple.
\set ON_ERROR_STOP on

create or replace function pg_temp.expect(ok boolean, msg text) returns void language plpgsql as $$
begin
  if not coalesce(ok, false) then raise exception 'FALLA %', msg; end if;
end $$;

-- ===================================================================== G1. set_user_role
select pg_temp.expect(
  not has_function_privilege('anon', 'public.set_user_role(uuid, public.app_role)', 'execute')
  and not has_function_privilege('service_role', 'public.set_user_role(uuid, public.app_role)', 'execute')
  and has_function_privilege('authenticated', 'public.set_user_role(uuid, public.app_role)', 'execute'),
  'G1. set_user_role solo debe ejecutarla una sesión iniciada'
);

-- Un anónimo ni siquiera llega al cuerpo de la función
begin;
set local role anon;
do $$ begin
  begin
    perform public.set_user_role('00000000-0000-0000-0000-0000000000f1', 'admin');
    raise exception 'FALLA G1. Un anónimo llamó a set_user_role';
  exception when insufficient_privilege then null; end;
end $$;
rollback;

-- ===================================================================== G2. Funciones de trigger
select pg_temp.expect(
  not has_function_privilege('anon', 'public.handle_new_user()', 'execute')
  and not has_function_privilege('authenticated', 'public.handle_new_user()', 'execute')
  and not has_function_privilege('service_role', 'public.handle_new_user()', 'execute')
  and not has_function_privilege('anon', 'public.forbid_event_changes()', 'execute')
  and not has_function_privilege('authenticated', 'public.forbid_event_changes()', 'execute')
  and not has_function_privilege('service_role', 'public.forbid_event_changes()', 'execute'),
  'G2. Las funciones de trigger no deben ser ejecutables por la API'
);

-- Sin permiso de ejecución, el alta de una cuenta sigue creando perfil, rol y datos de cuenta
insert into auth.users (id, email, raw_user_meta_data)
  values ('9f000000-0000-0000-0000-000000000001', 'g2@x.mx', '{"alias":"Alta sin permiso"}');
select pg_temp.expect(
  (select alias from public.profiles where id = '9f000000-0000-0000-0000-000000000001') = 'Alta sin permiso'
  and (select role from public.user_roles where user_id = '9f000000-0000-0000-0000-000000000001') = 'student'
  and (select email from public.private_accounts where user_id = '9f000000-0000-0000-0000-000000000001') = 'g2@x.mx',
  'G2. El alta de una cuenta ya no crea perfil, rol y datos de cuenta'
);

-- ===================================================================== G3. Avisos de pago
select pg_temp.expect(
  not has_table_privilege('anon', 'public.payment_webhook_events', 'select,insert,update,delete')
  and not has_table_privilege('authenticated', 'public.payment_webhook_events', 'select,insert,update,delete'),
  'G3. payment_webhook_events no debe tener permisos de tabla para la API'
);
-- Una sentencia aparte para leer: la subconsulta no ve lo que la función escribe en la misma sentencia
select pg_temp.expect(
  public.apply_payment_notice('stripe', 'evt_g3_1', '{}'::jsonb, 'failed',
    '9f000000-0000-0000-0000-000000000001', null, null, null, null, null) = 'applied',
  'G3. apply_payment_notice no aplicó el aviso'
);
select pg_temp.expect(
  (select processed_at is not null from public.payment_webhook_events where event_id = 'evt_g3_1'),
  'G3. apply_payment_notice ya no puede escribir el aviso'
);

-- ===================================================================== G4. search_path fijo
select pg_temp.expect(
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in ('ai_day', 'ai_check_engine')
      and exists (select 1 from unnest(p.proconfig) c where c like 'search_path=%')) = 2,
  'G4. ai_day y ai_check_engine deben fijar search_path'
);
select pg_temp.expect(public.ai_day() = (now() at time zone 'America/Mexico_City')::date,
  'G4. ai_day cambió de resultado al fijar search_path');

-- ===================================================================== G5. Banco en la nube (B11)
-- Toda función del banco nace sin execute para public y para anon. Cada archivo de prueba del banco
-- revisa además quién sí la ejecuta (bank_core_test, bank_editorial_test, bank_sync_test y
-- deck_catalog_test)
do $$
declare
  r record;
  n integer := 0;
begin
  for r in
    select p.oid::regprocedure::text as f, p.proacl
    from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
    where ns.nspname = 'public' and (
      p.proname ~ '^(bank_|editor_|deck_catalog_|admin_bank_|admin_deck_catalog_|admin_review_report)'
      or p.proname in ('ulid_uuid', 'stable_bank_uuid', 'catalog_changes', 'fetch_questions', 'report_question',
        'bias_agreement_summary', 'record_deck_download', 'upsert_distractor_stats', 'party_duels_check_questions',
        'content_reports_guard', 'content_reports_notify', 'forbid_bank_changes', 'admin_assign_questions',
        'admin_set_topic_reviewer', 'admin_set_physician_code', 'admin_retire_question', 'admin_restore_question',
        'admin_confirm_missing', 'owner_confirm_deck_authorization'))
  loop
    n := n + 1;
    if r.proacl is null or exists (select 1 from aclexplode(r.proacl) a where a.grantee = 0) then
      raise exception 'FALLA G5. public puede ejecutar %', r.f;
    end if;
    if has_function_privilege('anon', r.f, 'execute') then
      raise exception 'FALLA G5. anon puede ejecutar %', r.f;
    end if;
  end loop;
  if n < 60 then
    raise exception 'FALLA G5. Se esperaban más de 60 funciones del banco y hay %', n;
  end if;
end $$;

-- ===================================================================== G6. IA real (B12)
-- Ninguna función de la IA queda para public ni para anon. La sesión del alumno solo llama a ai_whoami
-- y a las de la compuerta, que revisan el rol por dentro. El libro de gastos, la cola de lotes y el
-- secreto del reloj son solo de service_role. Las auxiliares no las ejecuta nadie de la API
do $$
declare
  r record;
  n integer := 0;
  v_session constant text[] := array['ai_whoami', 'ai_gate_my_items', 'ai_gate_my_samples', 'ai_gate_review',
    'admin_ai_gate_sample_create', 'admin_ai_gate_samples', 'admin_ai_gate_progress', 'admin_ai_gate_close',
    'admin_ai_gate_set', 'admin_ai_pause', 'admin_ai_cost_report'];
  v_service constant text[] := array['ai_admit_v2', 'ai_release_v2', 'ai_settle_v2', 'ai_usage_summary_v2',
    'ai_job_enqueue', 'ai_job_status', 'ai_jobs_claim', 'ai_jobs_submitted', 'ai_jobs_unclaim', 'ai_jobs_stale',
    'ai_batches_due', 'ai_jobs_pending', 'ai_job_requeue', 'ai_batch_mark', 'ai_job_finish', 'ai_jobs_scrub',
    'ai_tick_lease_take', 'ai_tick_secret_ok'];
  v_internal constant text[] := array['ai_job_row_json', 'ai_job_stored_json', 'ai_gate_write', 'ai_gate_now',
    'ai_gate_assert_reviewer', 'ai_gate_verdict', 'ai_gate_guard', 'ai_gate_min_items'];
begin
  for r in
    select p.oid::regprocedure::text as f, p.proname::text as name, p.proacl
    from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
    where ns.nspname = 'public' and p.proname = any (v_session || v_service || v_internal)
  loop
    n := n + 1;
    if r.proacl is null or exists (select 1 from aclexplode(r.proacl) a where a.grantee = 0) then
      raise exception 'FALLA G6. public puede ejecutar %', r.f;
    end if;
    if has_function_privilege('anon', r.f, 'execute') then
      raise exception 'FALLA G6. anon puede ejecutar %', r.f;
    end if;
    if has_function_privilege('authenticated', r.f, 'execute') <> (r.name = any (v_session)) then
      raise exception 'FALLA G6. authenticated tiene un permiso equivocado en %', r.f;
    end if;
    if has_function_privilege('service_role', r.f, 'execute') <> (r.name = any (v_service)) then
      raise exception 'FALLA G6. service_role tiene un permiso equivocado en %', r.f;
    end if;
  end loop;
  if n <> cardinality(v_session || v_service || v_internal) then
    raise exception 'FALLA G6. Se esperaban % funciones de la IA y hay %', cardinality(v_session || v_service || v_internal), n;
  end if;
end $$;

-- ===================================================================== G7. Inglés médico (B13)
-- La función que lee la fuente del texto es interna, como las demás del banco, y las dos que redefine
-- 20261027000001 conservan los permisos de B11. G5 ya revisa que public y anon no ejecuten ninguna
select pg_temp.expect(
  to_regprocedure('public.bank_passage_source_issue(jsonb)') is not null
  and not has_function_privilege('authenticated', 'public.bank_passage_source_issue(jsonb)', 'execute')
  and not has_function_privilege('service_role', 'public.bank_passage_source_issue(jsonb)', 'execute')
  and not has_function_privilege('authenticated', 'public.bank_version_issues(uuid)', 'execute')
  and not has_function_privilege('service_role', 'public.bank_version_issues(uuid)', 'execute')
  and not has_function_privilege('authenticated', 'public.bank_incomplete_of(text[])', 'execute')
  and not has_function_privilege('service_role', 'public.bank_incomplete_of(text[])', 'execute'),
  'G7. Las funciones internas de Inglés médico no deben ser ejecutables por la API'
);

-- ===================================================================== G8. Calibración y modelo (B14)
-- Ninguna función de la calibración queda para public ni para anon. El corredor nocturno solo lo ejecuta
-- service_role. La app y las pantallas del equipo llaman a las cuatro de lectura, que revisan sesión,
-- dispositivo y rol por dentro. Las auxiliares no las ejecuta nadie de la API. Las tablas nuevas no dan
-- permisos de tabla a nadie de la API, ni a service_role
do $$
declare
  r record;
  n integer := 0;
  v_session constant text[] := array['comparison_snapshot', 'population_baselines', 'editor_agreement_history',
    'admin_calibration_runs'];
  v_service constant text[] := array['calibration_begin', 'calibration_bank', 'calibration_people', 'calibration_answers',
    'calibration_exposures', 'calibration_activity', 'calibration_motives', 'calibration_label_pairs',
    'calibration_publish_items', 'calibration_publish_options', 'calibration_publish_population',
    'calibration_publish_comparison', 'calibration_publish_agreement', 'calibration_finish'];
  v_internal constant text[] := array['uuid_to_ulid', 'ulid_to_uuid', 'model_json_numeric_only', 'model_setting',
    'model_settings_json', 'calibration_consenters', 'calibration_hash', 'calibration_pseudonym', 'calibration_apply',
    'calibration_words', 'calibration_study_day', 'calibration_run_row', 'calibration_label_kappa',
    'model_population_filter', 'model_population_fatigue'];
  v_table text;
begin
  for r in
    select p.oid::regprocedure::text as f, p.proname::text as name, p.proacl
    from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
    where ns.nspname = 'public' and p.proname = any (v_session || v_service || v_internal)
  loop
    n := n + 1;
    if r.proacl is null or exists (select 1 from aclexplode(r.proacl) a where a.grantee = 0) then
      raise exception 'FALLA G8. public puede ejecutar %', r.f;
    end if;
    if has_function_privilege('anon', r.f, 'execute') then
      raise exception 'FALLA G8. anon puede ejecutar %', r.f;
    end if;
    if has_function_privilege('authenticated', r.f, 'execute') <> (r.name = any (v_session)) then
      raise exception 'FALLA G8. authenticated tiene un permiso equivocado en %', r.f;
    end if;
    if has_function_privilege('service_role', r.f, 'execute') <> (r.name = any (v_service)) then
      raise exception 'FALLA G8. service_role tiene un permiso equivocado en %', r.f;
    end if;
    if not (select prosecdef from pg_proc where oid = r.f::regprocedure) and r.name = any (v_session || v_service) then
      raise exception 'FALLA G8. % no es security definer', r.f;
    end if;
  end loop;
  if n <> cardinality(v_session || v_service || v_internal) then
    raise exception 'FALLA G8. Se esperaban % funciones de la calibración y hay %', cardinality(v_session || v_service || v_internal), n;
  end if;
  -- Ninguna función calibration_* queda fuera de las listas
  if exists (
    select 1 from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
    where ns.nspname = 'public' and p.proname like 'calibration\_%'
      and not p.proname = any (v_session || v_service || v_internal)
  ) then
    raise exception 'FALLA G8. Hay una función calibration_ que esta prueba no conoce';
  end if;
  foreach v_table in array array['calibration_runs', 'item_calibrations', 'option_calibrations', 'population_snapshots',
    'comparison_cells', 'agreement_snapshots', 'model_publication'] loop
    if has_table_privilege('anon', 'public.' || v_table, 'select,insert,update,delete')
       or has_table_privilege('authenticated', 'public.' || v_table, 'select,insert,update,delete')
       or has_table_privilege('service_role', 'public.' || v_table, 'select,insert,update,delete')
       or not (select relrowsecurity from pg_class where oid = ('public.' || v_table)::regclass) then
      raise exception 'FALLA G8. % tiene permisos de tabla para la API o no tiene RLS', v_table;
    end if;
  end loop;
end $$;

-- ===================================================================== G9. Recordatorios y envío de correos (B15)
-- Ninguna función de los recordatorios y del envío queda para public ni para anon. La app llama a las del
-- alumno, que piden sesión y dispositivo activo por dentro, y la del admin revisa el rol. El envío de correos
-- usa las del servidor con la llave de servicio. Las auxiliares no las ejecuta nadie de la API. Las dos tablas
-- nuevas no dan permisos de tabla a nadie de la API, ni a service_role, y tienen RLS
do $$
declare
  r record;
  n integer := 0;
  v_session constant text[] := array[
    'my_reminder_prefs', 'set_reminder_prefs', 'put_due_snapshot', 'admin_email_overview'];
  v_service constant text[] := array[
    'enqueue_review_reminders', 'email_recipients', 'claim_email_batch', 'release_email',
    'email_unsubscribe', 'email_tick_ok'];
  v_internal constant text[] := array[
    'email_new_token', 'email_delivery_on', 'email_data_time', 'reminder_frequency_of', 'engagement_user',
    'reminder_prefs_json', 'enqueue_review_reminders_at'];
  v_table text;
begin
  for r in
    select p.oid::regprocedure::text as f, p.proname::text as name, p.proacl, p.prosecdef
    from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
    where ns.nspname = 'public' and p.proname = any (v_session || v_service || v_internal)
  loop
    n := n + 1;
    if r.proacl is null or exists (select 1 from aclexplode(r.proacl) a where a.grantee = 0) then
      raise exception 'FALLA G9. public puede ejecutar %', r.f;
    end if;
    if has_function_privilege('anon', r.f, 'execute') then
      raise exception 'FALLA G9. anon puede ejecutar %', r.f;
    end if;
    if has_function_privilege('authenticated', r.f, 'execute') <> (r.name = any (v_session)) then
      raise exception 'FALLA G9. authenticated tiene un permiso equivocado en %', r.f;
    end if;
    if has_function_privilege('service_role', r.f, 'execute') <> (r.name = any (v_service)) then
      raise exception 'FALLA G9. service_role tiene un permiso equivocado en %', r.f;
    end if;
    if not r.prosecdef and r.name = any (v_session || v_service) then
      raise exception 'FALLA G9. % no es security definer', r.f;
    end if;
    if r.prosecdef and not exists (
      select 1 from pg_proc q, unnest(q.proconfig) c where q.oid = r.f::regprocedure and c like 'search_path=%') then
      raise exception 'FALLA G9. % no fija search_path', r.f;
    end if;
  end loop;
  if n <> cardinality(v_session || v_service || v_internal) then
    raise exception 'FALLA G9. Se esperaban % funciones y hay %', cardinality(v_session || v_service || v_internal), n;
  end if;
  -- Ninguna función con un nombre de esta parte queda fuera de las listas
  if exists (
    select 1 from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
    where ns.nspname = 'public' and p.proname ~ '^(email_[nd]|email_recipients|email_unsubscribe|email_tick|reminder_|my_reminder|set_reminder|put_due|release_email|claim_email|enqueue_review|admin_email|engagement_)'
      and not p.proname = any (v_session || v_service || v_internal)
  ) then
    raise exception 'FALLA G9. Hay una función que esta prueba no conoce';
  end if;
  foreach v_table in array array['review_reminder_prefs', 'review_due_snapshots'] loop
    if has_table_privilege('anon', 'public.' || v_table, 'select,insert,update,delete')
       or has_table_privilege('authenticated', 'public.' || v_table, 'select,insert,update,delete')
       or has_table_privilege('service_role', 'public.' || v_table, 'select,insert,update,delete')
       or not (select relrowsecurity from pg_class where oid = ('public.' || v_table)::regclass) then
      raise exception 'FALLA G9. % tiene permisos de tabla para la API o no tiene RLS', v_table;
    end if;
  end loop;
end $$;

-- ===================================================================== G10. Analítica de producto (B15)
-- Lo mismo para la analítica. La app llama a analytics_identity y set_analytics_consent. analytics-flush usa
-- las del servidor. Los disparadores del dinero y el que decide si se encola son internos. Las dos tablas
-- nuevas no dan permisos de tabla a nadie de la API y tienen RLS
do $$
declare
  r record;
  n integer := 0;
  v_session constant text[] := array[
    'analytics_identity', 'set_analytics_consent'];
  v_service constant text[] := array[
    'claim_analytics_batch', 'finish_analytics_batch', 'analytics_tick_ok'];
  v_internal constant text[] := array[
    'analytics_props_ok', 'analytics_enqueue', 'analytics_on_subscription', 'analytics_on_payment'];
  v_table text;
begin
  for r in
    select p.oid::regprocedure::text as f, p.proname::text as name, p.proacl, p.prosecdef
    from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
    where ns.nspname = 'public' and p.proname = any (v_session || v_service || v_internal)
  loop
    n := n + 1;
    if r.proacl is null or exists (select 1 from aclexplode(r.proacl) a where a.grantee = 0) then
      raise exception 'FALLA G10. public puede ejecutar %', r.f;
    end if;
    if has_function_privilege('anon', r.f, 'execute') then
      raise exception 'FALLA G10. anon puede ejecutar %', r.f;
    end if;
    if has_function_privilege('authenticated', r.f, 'execute') <> (r.name = any (v_session)) then
      raise exception 'FALLA G10. authenticated tiene un permiso equivocado en %', r.f;
    end if;
    if has_function_privilege('service_role', r.f, 'execute') <> (r.name = any (v_service)) then
      raise exception 'FALLA G10. service_role tiene un permiso equivocado en %', r.f;
    end if;
    if not r.prosecdef and r.name = any (v_session || v_service) then
      raise exception 'FALLA G10. % no es security definer', r.f;
    end if;
    if r.prosecdef and not exists (
      select 1 from pg_proc q, unnest(q.proconfig) c where q.oid = r.f::regprocedure and c like 'search_path=%') then
      raise exception 'FALLA G10. % no fija search_path', r.f;
    end if;
  end loop;
  if n <> cardinality(v_session || v_service || v_internal) then
    raise exception 'FALLA G10. Se esperaban % funciones y hay %', cardinality(v_session || v_service || v_internal), n;
  end if;
  -- Ninguna función con un nombre de esta parte queda fuera de las listas
  if exists (
    select 1 from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
    where ns.nspname = 'public' and p.proname ~ '^(analytics_(props|enqueue|on_|tick|identity)|claim_analytics|finish_analytics|set_analytics)'
      and not p.proname = any (v_session || v_service || v_internal)
  ) then
    raise exception 'FALLA G10. Hay una función que esta prueba no conoce';
  end if;
  foreach v_table in array array['analytics_subjects', 'analytics_outbox'] loop
    if has_table_privilege('anon', 'public.' || v_table, 'select,insert,update,delete')
       or has_table_privilege('authenticated', 'public.' || v_table, 'select,insert,update,delete')
       or has_table_privilege('service_role', 'public.' || v_table, 'select,insert,update,delete')
       or not (select relrowsecurity from pg_class where oid = ('public.' || v_table)::regclass) then
      raise exception 'FALLA G10. % tiene permisos de tabla para la API o no tiene RLS', v_table;
    end if;
  end loop;
end $$;

-- ===================================================================== G11. Ayudas de Cron (B15)
-- Las dos ayudas con las que los trabajos de Cron deciden si hay algo que mandar las ejecuta solo Cron, que
-- corre como el dueño de la base. Nadie de la API las ejecuta
do $$
declare
  v_fn text;
begin
  foreach v_fn in array array['public.email_has_ready()', 'public.analytics_has_ready()'] loop
    if to_regprocedure(v_fn) is null
       or has_function_privilege('anon', v_fn, 'execute') or has_function_privilege('authenticated', v_fn, 'execute')
       or has_function_privilege('service_role', v_fn, 'execute')
       or exists (select 1 from pg_proc p, aclexplode(coalesce(p.proacl, '{}')) a
                  where p.oid = to_regprocedure(v_fn) and a.grantee = 0)
       or not (select prosecdef from pg_proc where oid = to_regprocedure(v_fn))
       or not exists (select 1 from pg_proc q, unnest(q.proconfig) c where q.oid = to_regprocedure(v_fn) and c like 'search_path=%') then
      raise exception 'FALLA G11. % no es una ayuda interna con security definer y search_path fijo', v_fn;
    end if;
  end loop;
end $$;

select 'TODAS LAS PRUEBAS DE PERMISOS DE FUNCIONES PASARON' as resultado;
