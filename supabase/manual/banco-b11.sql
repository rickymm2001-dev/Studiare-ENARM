-- Banco en la nube (B11 del plan del cambio). La pieza con delete que el conector no aplica sin una
-- confirmación humana (D-113). Pégalo completo en SQL Editor, New query, Run, después de aplicar las
-- migraciones 20261023000001 a 20261023000006 y después de ejecutar-en-sql-editor.sql, que trae otra
-- versión de delete_my_data. Es repetible, así que pegarlo dos veces no hace daño.
-- Con un token válido de Supabase no lo pegas tú. Lo aplica npm run deploy:supabase -- --plan b11
-- (docs/DESPLIEGUE.md).
--
-- Con B15 trae la versión final de delete_my_data (v4), igual a la Sección con delete de
-- 20261029000004_delete_my_data_v4.sql y a supabase/manual/ia-b12.sql. La herramienta de despliegue
-- exige que un archivo manual traiga cada función igual a la última migración que la define, así que
-- este archivo sigue a esa migración. Parte de la versión de B11, que es la de la Sección con delete de
-- 20261023000005_deck_catalog.sql, suma lo de la IA real (B12, v3) y al final lo de B15 (v4). Quita los
-- trabajos de IA y las generaciones de días anteriores, que existen desde 20261026000001 y 20261026000002, y los
-- recordatorios por correo, la foto de tarjetas vencidas y el ID de analítica de 20261029000001 y
-- 20261029000002. Esos delete van con execute y solo si la tabla existe (to_regclass), así que aplicar el plan
-- b11 solo, sin el b12 ni el b15, deja Borrar mis datos funcionando: cuenta cero en lo que falta
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
  -- Los mazos que bajó del catálogo, menos las bajadas de las últimas 24 horas, que cuentan para el tope de
  -- bajadas del día (BK012). Lo que ya guardó en su dispositivo lo quita la app
  delete from public.deck_catalog_downloads
    where user_id = v_user and created_at < now() - interval '24 hours';
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

-- Comprobación. La columna debe salir en true. Además de las lecturas del banco, revisa que conserve las bajadas
-- de las últimas 24 horas
select
  position('bank_reads' in pg_get_functiondef('public.delete_my_data()'::regprocedure)) > 0
  and position('created_at < now() - interval ''24 hours''' in pg_get_functiondef('public.delete_my_data()'::regprocedure)) > 0
    as borrar_mis_datos_b11;
