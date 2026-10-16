-- IA real (B12 del plan del cambio). La pieza con delete que el conector no aplica sin una confirmación
-- humana (D-113). Pégalo completo en SQL Editor, New query, Run, después de aplicar las migraciones
-- 20261026000001 a 20261026000004. Es repetible, así que pegarlo dos veces no hace daño.
-- Es igual a la Sección con delete de 20261026000004_ai_delete_my_data.sql. Con un token válido de
-- Supabase no lo pegas tú. Lo aplica npm run deploy:supabase -- --plan b12 (docs/DESPLIEGUE.md).
--
-- Borrar mis datos v3. Parte de la versión final de B11 (supabase/manual/banco-b11.sql, con las lecturas
-- del banco del día en curso y los mazos bajados del catálogo) y agrega lo de la IA real. Quita todos los
-- trabajos de IA por lote del alumno (ai_jobs, con su entrada y su salida) y sus generaciones de tarjetas
-- de días anteriores (ai_generations). Conserva el uso de IA de hoy, sus generaciones de hoy y las
-- lecturas del día de estudio en curso, así borrar los datos no sirve para saltarse un límite (D-103).
-- Los delete de lo de la IA van con execute y solo si la tabla existe, así que la misma versión no se
-- rompe si solo se desplegó el plan b11.
-- Borrar mi cuenta no cambia, porque ai_jobs y ai_generations se van en cascada con la cuenta

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
  v_jobs bigint := 0;
  v_generations bigint := 0;
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
  -- Las tablas de la IA real existen desde las migraciones de B12. Si solo se desplegó el plan b11, no están,
  -- y como el delete va con execute esta función no se rompe por eso: cuenta cero (revisión del hallazgo 12)
  -- Los trabajos de IA por lote, con su entrada y su salida (B12). Un lote en curso ya no los encuentra
  if to_regclass('public.ai_jobs') is not null then
    execute 'delete from public.ai_jobs where user_id = $1' using v_user;
    get diagnostics v_jobs = row_count;
  end if;
  -- Las generaciones de tarjetas de días anteriores. Las de hoy cuentan para el tope del día
  if to_regclass('public.ai_generations') is not null then
    execute 'delete from public.ai_generations where user_id = $1 and day < public.ai_day()' using v_user;
    get diagnostics v_generations = row_count;
  end if;

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

-- Comprobación. La columna debe salir en true
select
  position('ai_jobs' in pg_get_functiondef('public.delete_my_data()'::regprocedure)) > 0
  and position('ai_generations' in pg_get_functiondef('public.delete_my_data()'::regprocedure)) > 0
    as borrar_mis_datos_b12;
