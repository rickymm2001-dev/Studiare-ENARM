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

select 'TODAS LAS PRUEBAS DE PERMISOS DE FUNCIONES PASARON' as resultado;
