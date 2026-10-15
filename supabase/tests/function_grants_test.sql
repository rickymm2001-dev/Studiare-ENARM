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

-- ===================================================================== G6. Inglés médico (B13)
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
  'G6. Las funciones internas de Inglés médico no deben ser ejecutables por la API'
);

select 'TODAS LAS PRUEBAS DE PERMISOS DE FUNCIONES PASARON' as resultado;
