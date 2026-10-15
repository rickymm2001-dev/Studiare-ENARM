-- IA real, Borrar mis datos con los trabajos de IA (B12, 6.5 del plan de B12).
--
-- Qué hace
--   - delete_my_data v3 parte de la versión final de B11 (20261023000005_deck_catalog.sql, con las
--     lecturas del banco del día en curso y los mazos bajados del catálogo) y agrega lo de la IA real.
--     Quita todos los trabajos de IA por lote del alumno (ai_jobs, con su entrada y su salida) y sus
--     generaciones de tarjetas de días anteriores (ai_generations). Conserva el uso de IA de hoy, sus
--     generaciones de hoy y las lecturas del día de estudio en curso, así borrar los datos no sirve
--     para saltarse un límite (D-103)
--   - delete_my_account no cambia, porque ai_jobs y ai_generations se van en cascada con la cuenta
--
-- Es una Sección con delete, así que el conector de Supabase no la aplica sin una confirmación humana
-- (D-113). Va igual en supabase/manual/ia-b12.sql, que la herramienta de despliegue aplica con el plan
-- b12 (docs/DESPLIEGUE.md) y que se puede pegar a mano en el SQL Editor. Las tres migraciones de B12
-- anteriores no llevan delete ni drop, y esta es la única que sí. Es idempotente y no edita las
-- migraciones anteriores. Va después de 20261026000001_ai_proxy_v2.sql, que crea ai_generations, y de
-- 20261026000002_ai_jobs.sql, que crea ai_jobs

-- ===================================================================== Borrar mis datos. Sección con delete
-- Es la fuente de la versión de B12. Igual en supabase/manual/ia-b12.sql, en la pieza 4 de
-- supabase/manual/ejecutar-en-sql-editor.sql y en supabase/manual/banco-b11.sql
create or replace function public.delete_my_data() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_user uuid := auth.uid();
  v_events bigint;
  v_records bigint;
  v_artifacts bigint;
  v_reports bigint;
  v_groups bigint;
  v_decks bigint;
  v_ai bigint;
  v_reads bigint;
  v_downloads bigint;
  v_jobs bigint;
  v_generations bigint;
begin
  if v_user is null then
    raise exception 'Hace falta iniciar sesión' using errcode = '28000';
  end if;
  if not public.is_active_device() then
    raise exception 'Este dispositivo no es el activo de la cuenta' using errcode = '42501';
  end if;

  -- Una subida a medias no debe revivir lo que se está borrando
  perform pg_advisory_xact_lock(hashtextextended('sync:' || v_user::text, 0));
  perform set_config('app.erasing_user', v_user::text, true);

  delete from public.events where user_id = v_user;
  get diagnostics v_events = row_count;
  delete from public.sync_records where user_id = v_user;
  get diagnostics v_records = row_count;
  delete from public.ai_artifacts where user_id = v_user;
  get diagnostics v_artifacts = row_count;
  delete from public.content_reports where reporter_id = v_user;
  get diagnostics v_reports = row_count;
  delete from public.memberships where user_id = v_user;
  get diagnostics v_groups = row_count;
  -- Los mazos guardados en la tabla vieja arrastran sus notas y tarjetas
  delete from public.decks where owner_id = v_user;
  get diagnostics v_decks = row_count;
  -- El uso y la bitácora de la IA. Sin el uso de hoy, borrar datos no sirve para saltarse el límite
  -- diario, así que el uso de hoy se conserva y solo se quita lo anterior
  delete from public.ai_usage_day where user_id = v_user and day < public.ai_day();
  get diagnostics v_ai = row_count;
  delete from public.ai_call_log where user_id = v_user;
  -- Las lecturas del banco, menos las del día de estudio en curso, que cuentan para el tope de Gratis
  delete from public.bank_reads where user_id = v_user and day < public.study_day();
  get diagnostics v_reads = row_count;
  -- Los mazos que bajó del catálogo. Lo que ya guardó en su dispositivo lo quita la app
  delete from public.deck_catalog_downloads where user_id = v_user;
  get diagnostics v_downloads = row_count;
  -- Los trabajos de IA por lote, con su entrada y su salida (B12). Un lote en curso ya no los encuentra
  delete from public.ai_jobs where user_id = v_user;
  get diagnostics v_jobs = row_count;
  -- Las generaciones de tarjetas de días anteriores. Las de hoy cuentan para el tope del día
  delete from public.ai_generations where user_id = v_user and day < public.ai_day();
  get diagnostics v_generations = row_count;

  perform set_config('app.erasing_user', '', true);
  return jsonb_build_object(
    'events', v_events,
    'records', v_records,
    'artifacts', v_artifacts,
    'reports', v_reports,
    'memberships', v_groups,
    'decks', v_decks,
    'ai_usage', v_ai,
    'bank_reads', v_reads,
    'deck_downloads', v_downloads,
    'ai_jobs', v_jobs,
    'ai_generations', v_generations
  );
end;
$$;
revoke all on function public.delete_my_data() from public, anon, authenticated, service_role;
grant execute on function public.delete_my_data() to authenticated;
-- ===================================================================== Fin de la sección con delete
