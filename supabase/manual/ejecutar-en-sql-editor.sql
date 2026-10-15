-- Piezas de las migraciones 3 a 9 que se pegan a mano en el SQL Editor de Supabase (2026-10-10).
--
-- Por qué existen
--   Al conectar el proyecto real, la herramienta con la que Claude aplica migraciones pide una
--   confirmación humana para toda sentencia con delete o drop, y en una sesión en la nube no hay donde
--   darla. Se aplicó con ella todo lo demás. Aquí quedan las seis piezas que sí tienen delete o drop,
--   copiadas tal cual de supabase/migrations.
--
-- Cómo usarlo
--   Pega el archivo completo en Supabase, SQL Editor, y ejecútalo una vez. Es idempotente, así que
--   correrlo dos veces no daña nada. Luego corre la consulta de comprobación de docs/SUPABASE.md, sección
--   Proyecto real conectado.
--
-- Qué pasa si no se corre
--   Sin la pieza 2 no se puede activar el plan Fundador, porque la tabla de suscripciones sigue sin
--   aceptarlo. Sin las piezas 4 y 5 no funcionan borrar mis datos ni borrar mi cuenta. Sin la 1 un admin no
--   puede liberar el dispositivo de un alumno. Sin la 6 no se guardan los errores del navegador.
--
-- Es una foto de esa fecha, salvo las piezas 2 y 5, que se pusieron al día con B10 (2026-10-14), y la
-- pieza 4, que se puso al día con B12 (2026-10-15). Si se vuelve a pegar después de B10 no deshace la
-- restricción de planes ni el freno de borrar la cuenta. Con B10 la pieza 5 pide
-- billing_blocks_account_deletion, de la migración 20261022000002. Con B12 la pieza 4 es la versión final
-- de borrar mis datos (v3), con lo de banco-b11.sql y los trabajos de IA, igual a la Sección con delete
-- de 20261026000004_ai_delete_my_data.sql, a supabase/manual/ia-b12.sql y a banco-b11.sql. Este archivo
-- se pega después de las migraciones de B12. Si una migración cambia después, este archivo no se
-- actualiza solo. Las migraciones de supabase/migrations siguen siendo la fuente.

-- ################ 1. Liberar la cuenta de un alumno (device_barrier)
-- ===================================================================== Funciones del admin
-- Libera la cuenta de un alumno. Borra su fila de device_sessions, así el primer dispositivo que
-- reclame se queda con ella, y reinicia el conteo del límite. Registra quién lo hizo.
-- Devuelve true si la cuenta tenía un dispositivo
create or replace function public.admin_release_device(target uuid) returns boolean
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  released public.device_sessions%rowtype;
begin
  if not public.is_admin() then
    raise exception 'Solo un administrador puede liberar una cuenta' using errcode = '42501';
  end if;
  if target is null or not exists (select 1 from auth.users where id = target) then
    raise exception 'No existe esa cuenta' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('device:' || target::text, 0));

  delete from public.device_sessions where user_id = target returning * into released;
  insert into public.device_claims (user_id, device_id, label, claimed_at, kind, actor_id)
    values (target, coalesce(released.device_id, ''), coalesce(released.label, ''),
            clock_timestamp(), 'release', auth.uid());
  return released.user_id is not null;
end;
$$;
revoke all on function public.admin_release_device(uuid) from public, anon, service_role;
grant execute on function public.admin_release_device(uuid) to authenticated;

-- ################ 2. Aceptar los planes Fundador y la prueba gratis (billing_plans de B10, versión final)
alter table public.subscriptions drop constraint if exists subscriptions_plan_check;
alter table public.subscriptions add constraint subscriptions_plan_check
  check (plan in ('free', 'founder', 'founder_annual', 'monthly', 'annual'));
alter table public.subscriptions drop constraint if exists subscriptions_status_check;
alter table public.subscriptions add constraint subscriptions_status_check
  check (status in ('trialing', 'active', 'past_due', 'canceled'));

-- ################ 3. Llaves foráneas para poder borrar médicos y admins (privacy)
do $$
declare
  r record;
begin
  for r in
    select c.conrelid::regclass as tbl, c.conname, a.attname, a.attnotnull
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
    where c.contype = 'f'
      and c.confrelid = 'auth.users'::regclass
      and c.confdeltype = 'a'
      and c.connamespace = 'public'::regnamespace
  loop
    execute format('alter table %s drop constraint %I', r.tbl, r.conname);
    if r.attnotnull then
      execute format('alter table %s alter column %I drop not null', r.tbl, r.attname);
    end if;
    execute format(
      'alter table %s add constraint %I foreign key (%I) references auth.users (id) on delete set null',
      r.tbl, r.conname, r.attname
    );
  end loop;
end $$;

-- ################ 4. Borrar mis datos (B12, v3, versión final, con lo de banco-b11.sql)
-- Lo de ai_hosted, más las lecturas del banco y los mazos bajados del catálogo de B11 (banco-b11.sql), más
-- los trabajos de IA por lote y las generaciones de tarjetas de días anteriores de B12. Conserva el uso de
-- IA de hoy, sus generaciones de hoy y las lecturas del día de estudio en curso, para que borrar los datos
-- no sirva para saltarse un límite. Los delete de lo de la IA van con execute y solo si la tabla existe.
-- Igual a 20261026000004_ai_delete_my_data.sql y a ia-b12.sql
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

-- ################ 5. Borrar mi cuenta (billing_plans de B10, versión final)
create or replace function public.delete_my_account() returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'Hace falta iniciar sesión' using errcode = '28000';
  end if;
  if not public.is_active_device() then
    raise exception 'Este dispositivo no es el activo de la cuenta' using errcode = '42501';
  end if;
  if public.current_app_role() = 'owner' then
    raise exception 'El dueño no puede borrar su propia cuenta' using errcode = '42501';
  end if;
  if public.billing_blocks_account_deletion(v_user) then
    raise exception 'Cancela tu suscripción antes de eliminar tu cuenta' using errcode = 'FR002';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('sync:' || v_user::text, 0));
  perform set_config('app.erasing_user', v_user::text, true);
  delete from auth.users where id = v_user;
  perform set_config('app.erasing_user', '', true);
end;
$$;

revoke all on function public.delete_my_account() from public, anon, authenticated, service_role;
grant execute on function public.delete_my_account() to authenticated;

-- ################ 6. Reporte de errores del navegador (client_errors)
create or replace function public.report_client_error(
  p_fingerprint text,
  p_kind text,
  p_message text,
  p_stack text,
  p_screen text,
  p_version text
) returns text
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_day date := (now() at time zone 'UTC')::date;
  v_message text;
  v_stack text;
  v_screen text;
  v_version text;
begin
  if p_kind is null or p_kind not in ('error', 'rejection', 'render')
     or p_fingerprint is null or p_fingerprint !~ '^[0-9a-f]{8,64}$' then
    return 'invalid';
  end if;
  v_message := left(btrim(regexp_replace(public.client_errors_scrub(p_message), '[[:cntrl:]]+', ' ', 'g')), 300);
  v_stack := left(regexp_replace(public.client_errors_scrub(p_stack), '[^[:print:]' || chr(10) || ']+', ' ', 'g'), 1500);
  v_screen := left(regexp_replace(public.client_errors_scrub(p_screen), '[[:cntrl:]]+', ' ', 'g'), 80);
  v_version := left(regexp_replace(coalesce(p_version, ''), '[[:cntrl:]]+', ' ', 'g'), 40);
  if v_message = '' then return 'invalid'; end if;

  -- El primer reporte del día limpia lo viejo
  if not exists (select 1 from public.client_errors where day = v_day) then
    delete from public.client_errors where day < v_day - public.client_errors_keep_days();
  end if;

  update public.client_errors set occurrences = occurrences + 1, last_seen = now()
    where day = v_day and fingerprint = p_fingerprint;
  if found then return 'counted'; end if;

  if (select count(*) from public.client_errors where day = v_day) >= public.client_errors_daily_cap() then
    return 'full';
  end if;
  insert into public.client_errors (day, fingerprint, kind, message, stack, screen, version)
    values (v_day, p_fingerprint, p_kind, v_message, nullif(v_stack, ''), v_screen, v_version)
    on conflict (day, fingerprint) do update
      set occurrences = public.client_errors.occurrences + 1, last_seen = now();
  return 'recorded';
exception when others then
  return 'invalid';
end;
$$;

revoke all on function public.report_client_error(text, text, text, text, text, text) from public, anon, authenticated, service_role;
grant execute on function public.report_client_error(text, text, text, text, text, text) to anon, authenticated;
