-- Borrar mis datos con lo de los recordatorios y la analítica (B15 del plan del cambio, 3.8 y 1.3).
--
-- Qué hace
--   - delete_my_data v4 parte de la versión final de B12 (20261026000004_ai_delete_my_data.sql, con las
--     lecturas del banco del día en curso, los mazos bajados del catálogo y los trabajos de IA) y agrega lo
--     que B15 guarda del alumno. Quita sus recordatorios de repaso por correo con la ficha de baja
--     (review_reminder_prefs), la foto de tarjetas vencidas (review_due_snapshots), los recordatorios que
--     seguían por mandarse (solo daily_review_reminder en cola o fallidos) y su ID seudónimo de la analítica
--     con su permiso y los eventos de dinero que seguían en la cola (analytics_subjects y analytics_outbox).
--     Quien vuelva a dar el permiso de Medición de uso empieza con un ID nuevo
--   - Los correos de cobro que siguen pendientes (fin de prueba, pase por vencer) no se tocan, porque la
--     cuenta y el plan se quedan. Conserva el uso de IA de hoy, sus generaciones de hoy y las lecturas del día
--     de estudio en curso, así borrar los datos no sirve para saltarse un límite (D-103)
--   - Los delete de lo de la IA y de B15 van con execute y solo si la tabla existe (to_regclass), como en la
--     v3, así la función no se rompe si falta alguna migración
--   - delete_my_account no cambia, porque todo lo de B15 se va en cascada con la cuenta
--
-- Es una Sección con delete, así que el conector de Supabase no la aplica sin una confirmación humana
-- (D-113). Va igual en supabase/manual/banco-b11.sql, supabase/manual/ia-b12.sql y en la pieza 4 de
-- supabase/manual/ejecutar-en-sql-editor.sql, que la herramienta de despliegue aplica con los planes b11, b12
-- y b15 (docs/DESPLIEGUE.md) y que se pueden pegar a mano en el SQL Editor. La herramienta exige que cada
-- archivo manual traiga las funciones igual a la última migración que las define, así que los tres siguen a
-- esta. Las tres migraciones de B15 anteriores no llevan delete ni drop, y esta es la única que sí, como pasó
-- con 20261026000004 en B12. Es idempotente y no edita las migraciones anteriores. Va después de
-- 20261029000001_email_reminders.sql y 20261029000002_product_analytics.sql, que crean las tablas

-- ===================================================================== Borrar mis datos. Sección con delete
-- Es la fuente de la versión de B15. Igual en supabase/manual/ia-b12.sql, en la pieza 4 de
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
  v_jobs bigint := 0;
  v_generations bigint := 0;
  v_reminders bigint := 0;
  v_snapshots bigint := 0;
  v_analytics bigint := 0;
  v_pending bigint := 0;
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
  -- Lo de B15. Como lo de la IA, solo si las tablas existen, para que no se rompa si falta una migración
  -- Los recordatorios de repaso por correo, con su ficha de baja, y la foto de tarjetas vencidas
  if to_regclass('public.review_reminder_prefs') is not null then
    execute 'delete from public.review_reminder_prefs where user_id = $1' using v_user;
    get diagnostics v_reminders = row_count;
  end if;
  if to_regclass('public.review_due_snapshots') is not null then
    execute 'delete from public.review_due_snapshots where user_id = $1' using v_user;
    get diagnostics v_snapshots = row_count;
  end if;
  -- Los recordatorios que seguían por mandarse. Los correos de cobro no, porque la cuenta y el plan se quedan
  if to_regclass('public.email_outbox') is not null then
    execute $q$delete from public.email_outbox
      where recipient_user = $1 and kind = 'daily_review_reminder' and status in ('queued', 'failed')$q$ using v_user;
    get diagnostics v_pending = row_count;
  end if;
  -- El ID seudónimo de la analítica con su permiso y los eventos de dinero que seguían en la cola. Quien
  -- vuelva a dar el permiso empieza con un ID nuevo
  if to_regclass('public.analytics_outbox') is not null then
    execute 'delete from public.analytics_outbox where user_id = $1' using v_user;
  end if;
  if to_regclass('public.analytics_subjects') is not null then
    execute 'delete from public.analytics_subjects where user_id = $1' using v_user;
    get diagnostics v_analytics = row_count;
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
    'ai_generations', v_generations,
    'reminder_prefs', v_reminders,
    'due_snapshots', v_snapshots,
    'pending_reminders', v_pending,
    'analytics_ids', v_analytics
  );
end;
$$;
revoke all on function public.delete_my_data() from public, anon, authenticated, service_role;
grant execute on function public.delete_my_data() to authenticated;
-- ===================================================================== Fin de la sección con delete

-- Lo que revisa el plan b15 (deploy/b15.json) al terminar y cada vez que se vuelve a correr. Son hechos que no
-- cambian con el tiempo, así que el plan se puede repetir. Si el envío de correos y la analítica están
-- encendidos, los trabajos de Cron y las fichas de Vault se leen aparte, con la segunda consulta de
-- docs/SUPABASE.md, sección Recordatorios, analítica y alertas (B15).
-- Comprobación. Las columnas deben salir como las pide el plan
select
  (select count(*) from pg_tables where schemaname = 'public'
     and tablename in ('review_reminder_prefs', 'review_due_snapshots', 'analytics_subjects', 'analytics_outbox')) as tablas_de_b15,
  (select bool_and(relrowsecurity) from pg_class where oid in (
     'public.review_reminder_prefs'::regclass, 'public.review_due_snapshots'::regclass,
     'public.analytics_subjects'::regclass, 'public.analytics_outbox'::regclass)) as tablas_con_seguridad_por_fila,
  has_function_privilege('authenticated', 'public.set_reminder_prefs(boolean, integer, integer[], boolean, text)', 'execute') as alumno_guarda_recordatorios,
  has_function_privilege('anon', 'public.set_reminder_prefs(boolean, integer, integer[], boolean, text)', 'execute') as anonimo_guarda_recordatorios,
  has_function_privilege('authenticated', 'public.claim_email_batch(integer)', 'execute') as alumno_reclama_correos,
  has_function_privilege('service_role', 'public.claim_email_batch(integer)', 'execute') as llave_reclama_correos,
  has_function_privilege('service_role', 'public.email_unsubscribe(text)', 'execute') as llave_da_de_baja,
  has_function_privilege('authenticated', 'public.analytics_identity()', 'execute') as alumno_pide_su_id,
  has_function_privilege('authenticated', 'public.claim_analytics_batch(integer)', 'execute') as alumno_reclama_eventos,
  (select count(*) from public.platform_settings where key in ('email_delivery', 'analytics')) = 2 as interruptores_sembrados,
  position('review_reminder_prefs' in pg_get_functiondef('public.delete_my_data()'::regprocedure)) > 0 as borrar_mis_datos_b15;
