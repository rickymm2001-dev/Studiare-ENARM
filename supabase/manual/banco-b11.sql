-- Banco en la nube (B11 del plan del cambio). La pieza con delete que el conector no aplica sin una
-- confirmación humana (D-113). Pégalo completo en SQL Editor, New query, Run, después de aplicar las
-- migraciones 20261023000001 a 20261023000006 y después de ejecutar-en-sql-editor.sql, que trae otra
-- versión de delete_my_data. Es repetible, así que pegarlo dos veces no hace daño.
-- Con un token válido de Supabase no lo pegas tú. Lo aplica npm run deploy:supabase -- --plan b11
-- (docs/DESPLIEGUE.md).
--
-- Con B12 trae la versión final de delete_my_data (v3), igual a la Sección con delete de
-- 20261026000004_ai_delete_my_data.sql y a supabase/manual/ia-b12.sql. La herramienta de despliegue
-- exige que un archivo manual traiga cada función igual a la última migración que la define, así que
-- este archivo sigue a esa migración. Parte de la versión de B11, que es la de la Sección con delete de
-- 20261023000005_deck_catalog.sql, y suma al final lo de la IA real. Quita los trabajos de IA y las
-- generaciones de días anteriores, que existen desde 20261026000001 y 20261026000002. Sin esas dos
-- migraciones Borrar mis datos falla hasta que se apliquen, así que el plan b11 y el b12 van seguidos
--
-- Borrar mis datos y la bitácora de lecturas (8.24). bank_reads es un dato del alumno y también el
-- contador de su tope de Gratis. Borrar mis datos quita todas sus lecturas menos las del día de estudio
-- en curso, así nadie reinicia su tope de 20 preguntas borrando sus datos. Borrar la cuenta las quita
-- todas en cascada. También quita la bitácora de mazos bajados del catálogo (deck_catalog_downloads), que
-- no cuenta para ningún tope. Lo demás es igual a la versión de 20261010000001_ai_hosted.sql
--
-- La migración 20261023000003 ya trae content_report en email_kinds desde B10
-- (20261022000001_billing_emails.sql), así que este archivo no cambia esa restricción.

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

-- Comprobación. La columna debe salir en true
select
  position('bank_reads' in pg_get_functiondef('public.delete_my_data()'::regprocedure)) > 0
    as borrar_mis_datos_b11;
