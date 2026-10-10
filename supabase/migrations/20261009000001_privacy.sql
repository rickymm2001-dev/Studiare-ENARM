-- Privacidad del alumno (D-101, Fase E bloque E6).
--
-- Qué resuelve
--   Borrar mis datos y borrar mi cuenta, con la copia de la nube incluida. Hasta ahora los dos
--   quedaban a medias por una regla de la propia base. La bitácora de estudio (events) solo se
--   agrega, y su freno rechazaba también el borrado en cascada que dispara quitar a un usuario de
--   auth.users. Un alumno con una sola respuesta registrada no se podía dar de baja.
--
-- Cómo se resuelve sin abrir la bitácora
--   El freno sigue rechazando toda edición y todo borrado, salvo el borrado de las filas de UN
--   usuario mientras una de las dos funciones de abajo lo está borrando, o en cascada cuando el
--   usuario ya no existe en auth.users (por ejemplo, si un administrador lo quita desde el panel de
--   Supabase). Como events apunta a auth.users, nadie puede borrar la bitácora de quien sigue vivo. Esas funciones marcan la
--   transacción con app.erasing_user, que solo vale hasta el final de ella. Ni el navegador ni la
--   API pueden marcarla, porque no ejecutan SQL propio y set_config no está expuesta como función
--   pública. Quien borra a un usuario borra sus filas, nunca las de otro
--
-- Qué hace cada función
--   delete_my_data()      borra la copia en la nube del estudio del alumno. La bitácora, los
--                         registros sincronizados (mazos, notas, tarjetas, apuntes e Inicio), los
--                         borradores de IA, sus reportes de contenido, su paso por grupos de Party
--                         y sus mazos guardados. Conserva la cuenta, el perfil, el plan y los pagos
--   delete_my_account()   borra la cuenta completa con todo lo anterior, sus pagos y sus
--                         referidos, y libera su correo. El dueño no se puede dar de baja a sí mismo
--
-- Quién puede usarlas
--   Solo una persona con sesión y desde el dispositivo activo de su cuenta (is_active_device), como
--   el resto de sus datos. Anon no puede ni llamarlas
--
-- Lo que no se borra y por qué
--   Los pagos que ya cobró cada pasarela viven también en Stripe y en Mercado Pago, y el SAT pide
--   conservar las facturas. Aquí se borra la copia de la plataforma. Quien pida lo contrario habla
--   con la pasarela
--
-- Es idempotente. No edita las migraciones anteriores

-- ===================================================================== Freno de la bitácora
create or replace function public.forbid_event_changes() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if tg_op = 'DELETE' then
    -- Solo el borrado de las filas del usuario que una función de borrado está dando de baja
    if coalesce(current_setting('app.erasing_user', true), '') = old.user_id::text then
      return old;
    end if;
    -- O el borrado en cascada de un usuario que ya no existe, por ejemplo cuando un administrador lo
    -- quita desde el panel de Supabase. Las filas de events apuntan a auth.users, así que no hay
    -- forma de borrar la bitácora de alguien que sigue existiendo
    if not exists (select 1 from auth.users where id = old.user_id) then
      return old;
    end if;
  end if;
  raise exception 'La bitácora solo se agrega' using errcode = '42501';
end;
$$;

-- ===================================================================== Llaves sin cascada
-- Las columnas que solo dicen quién hizo algo (updated_by, changed_by, assigned_by) y la de quien
-- decidió una revisión no tenían regla al quitar al usuario, y eso impedía borrar a un médico o a
-- un admin. Pasan a null, que conserva el historial sin el nombre de la persona
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

-- ===================================================================== Borrar mis datos
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

  perform set_config('app.erasing_user', '', true);
  return jsonb_build_object(
    'events', v_events,
    'records', v_records,
    'artifacts', v_artifacts,
    'reports', v_reports,
    'memberships', v_groups,
    'decks', v_decks
  );
end;
$$;

-- ===================================================================== Borrar mi cuenta
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

  perform pg_advisory_xact_lock(hashtextextended('sync:' || v_user::text, 0));
  perform set_config('app.erasing_user', v_user::text, true);
  -- Todo lo del usuario cuelga de auth.users con on delete cascade, incluida la bitácora, que ahora
  -- el freno deja pasar solo en esta transacción
  delete from auth.users where id = v_user;
  perform set_config('app.erasing_user', '', true);
end;
$$;

-- ===================================================================== Permisos
revoke all on function public.delete_my_data() from public, anon, authenticated, service_role;
revoke all on function public.delete_my_account() from public, anon, authenticated, service_role;
grant execute on function public.delete_my_data() to authenticated;
grant execute on function public.delete_my_account() to authenticated;
