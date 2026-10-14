-- Cuentas y acceso (B9 del plan del cambio, respuestas 22, 26, 29, 30, 45 y 52).
--
-- Qué agrega
--   - Registro solo con invitación hasta el lanzamiento (respuesta 52). signup_invitations guarda los
--     correos invitados y solo el dueño y los admins la leen y la escriben. before_user_created_hook es
--     la función del gancho Before User Created de Supabase Auth, que corre antes de crear cualquier
--     usuario, con el enlace o el código del correo y con Google. Rechaza el alta si el correo no está
--     invitado y el registro sigue cerrado, con la forma de error que documenta Supabase. La clave
--     registration_open de platform_settings nace en false y en true abre el registro para todos el día
--     del lanzamiento. Las cuentas que ya existen no pasan por el gancho, así que no cambian. El gancho
--     se activa en el panel de Supabase, Authentication, Hooks (docs/SUPABASE.md)
--   - Segundo factor para médicos, admins y dueño (respuesta 30). current_app_role, y con ella is_admin
--     y todas las políticas y funciones que las usan, dan el rol del equipo solo a una sesión aal2
--     cuando el servidor lo pide. Lo pide la bandera requireMfa de la clave feature_flags, la misma que
--     lee la app para pedir el alta del factor, así que se prende o se apaga sin otra migración. Solo el
--     booleano true la prende, igual que en la app. Sin la bandera o con otro valor queda apagado. El
--     alumno no cambia en nada, porque su rol ya es alumno. assigned_app_role es el rol guardado, sin
--     esa condición, para las reglas que protegen en lugar de dar permisos
--   - La política assignments_select cambia para que el médico que lee sus asignaciones también cuente
--     con el rol con segundo factor. Sigue en la lista abierta a propósito de device_barrier_test.sql
--   - El disparador user_roles_protect_owner impide que el dueño se borre a sí mismo con borrar mi
--     cuenta, también cuando su sesión todavía no tiene el segundo factor y current_app_role lo ve
--     como alumno
--   - Restablecer el segundo factor. authorize_mfa_reset la llama la función admin-reset-mfa con la
--     sesión de quien la pide. Solo el dueño, con su segundo factor si se pide, y nunca para sí mismo.
--     Deja constancia en mfa_resets. Los factores los borra la función con la API de administración
--   - Cómo nos conociste (respuesta 22). signup_sources guarda la respuesta opcional del registro, una
--     por cuenta, sin permisos de tabla para la API. La escribe record_signup_source y el admin solo ve
--     conteos con admin_signup_source_counts y admin_influencer_code_counts. Nunca va a la analítica
--   - private_accounts gana details_changed_at, cuándo guardó el alumno sus datos opcionales, para que
--     entre sus dispositivos gane la versión más reciente y un dispositivo nuevo no borre lo de la nube
--     (H29), y adult_confirmed_at, cuándo confirmó que tiene 18 años o más (pregunta 45). Esa fecha, una
--     vez puesta, ya no se borra
--
-- Ninguna política nueva usa auth.uid(), así que la cuenta de políticas con la barrera del dispositivo
-- único no cambia (device_barrier_test.sql, B11). Es idempotente. Las políticas y los disparadores nuevos
-- se crean solo si no existen, sin drop

-- ===================================================================== Rol con segundo factor
-- El rol que guarda user_roles, sin la condición del segundo factor. Solo para reglas que protegen
create or replace function public.assigned_app_role() returns public.app_role
language sql stable security definer set search_path = public as $$
  select coalesce((select role from public.user_roles where user_id = auth.uid()), 'student'::public.app_role)
$$;

-- Si el servidor pide segundo factor al equipo. Es la bandera requireMfa de feature_flags, la misma que
-- lee la app. Solo el booleano true la prende, como en la app, que con un valor que no es booleano
-- descarta todas las banderas y no pide el código. Así la app y la base nunca piden cosas distintas. Sin
-- la clave, sin la bandera o con cualquier otro valor, como "true" en texto o 1, queda apagada
create or replace function public.staff_mfa_required() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select value -> 'requireMfa' from public.platform_settings where key = 'feature_flags') = 'true'::jsonb,
    false
  )
$$;

-- Rol con el que cuenta cada política y cada función. Médico, admin o dueño solo con sesión aal2 cuando
-- el servidor pide segundo factor. Sin él cuenta como alumno, así que no ve ni hace nada del equipo
-- hasta verificar su código. El alumno no pasa por la revisión del factor
create or replace function public.current_app_role() returns public.app_role
language sql stable security definer set search_path = public as $$
  select case
    when r.role = 'student' then r.role
    when not public.staff_mfa_required() then r.role
    when coalesce(auth.jwt() ->> 'aal', '') = 'aal2' then r.role
    else 'student'::public.app_role
  end
  from (select public.assigned_app_role() as role) r
$$;

revoke all on function public.assigned_app_role() from public, anon, authenticated, service_role;
revoke all on function public.staff_mfa_required() from public, anon, authenticated, service_role;

-- Las asignaciones del médico también piden el rol con su segundo factor. questions_select las lee con
-- los permisos de quien consulta, así que sin el factor tampoco ve los borradores que le asignaron. Con
-- la bandera apagada no cambia nada para el médico, y una asignación vieja de alguien que ya no es del
-- equipo deja de verse
alter policy assignments_select on public.review_assignments
  using (
    (physician_id = auth.uid() and public.current_app_role() in ('physician', 'admin', 'owner'))
    or public.is_admin()
  );

-- El dueño no se borra a sí mismo. delete_my_account ya lo revisa con current_app_role, pero sin el
-- segundo factor esa función lo ve como alumno. Este freno mira el rol guardado y solo actúa en el
-- borrado que hacen delete_my_data y delete_my_account, que marcan app.erasing_user. Borrar desde el
-- panel de Supabase sigue igual
create or replace function public.protect_owner_erasure() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if old.role = 'owner'
     and coalesce(current_setting('app.erasing_user', true), '') = old.user_id::text then
    raise exception 'El dueño no puede borrar su propia cuenta' using errcode = '42501';
  end if;
  return old;
end;
$$;
revoke all on function public.protect_owner_erasure() from public, anon, authenticated, service_role;

do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'user_roles_protect_owner' and tgrelid = 'public.user_roles'::regclass
  ) then
    create trigger user_roles_protect_owner before delete on public.user_roles
      for each row execute function public.protect_owner_erasure();
  end if;
end $$;

-- ===================================================================== Restablecer el segundo factor
-- Bitácora de cada restablecimiento. Solo se agrega desde authorize_mfa_reset. La API no la lee ni la
-- escribe
create table if not exists public.mfa_resets (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  reset_by uuid references auth.users (id) on delete set null,
  requested_at timestamptz not null default now()
);
alter table public.mfa_resets enable row level security;
revoke all on table public.mfa_resets from anon, authenticated;

-- La llama admin-reset-mfa con la sesión de quien pide, antes de borrar los factores con la llave de
-- servicio. Falla si no es el dueño (con su segundo factor cuando se pide), si es su propia cuenta o si
-- la cuenta no existe. Si pasa, deja constancia
create or replace function public.authorize_mfa_reset(p_target uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_caller uuid := auth.uid();
begin
  if v_caller is null then
    raise exception 'Hace falta iniciar sesión' using errcode = '28000';
  end if;
  if public.current_app_role() <> 'owner' then
    raise exception 'Solo el dueño restablece el segundo factor' using errcode = '42501';
  end if;
  if p_target is null or p_target = v_caller then
    raise exception 'El dueño no restablece su propio segundo factor desde la app' using errcode = '42501';
  end if;
  if not exists (select 1 from public.user_roles where user_id = p_target) then
    raise exception 'No existe esa cuenta' using errcode = 'P0002';
  end if;
  insert into public.mfa_resets (user_id, reset_by) values (p_target, v_caller);
end;
$$;
revoke all on function public.authorize_mfa_reset(uuid) from public, anon, authenticated, service_role;
grant execute on function public.authorize_mfa_reset(uuid) to authenticated;

-- ===================================================================== Invitaciones
create table if not exists public.signup_invitations (
  email text primary key
    check (char_length(email) <= 254 and email = lower(btrim(email)) and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  invited_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.signup_invitations enable row level security;
revoke all on table public.signup_invitations from anon, authenticated;
grant select, insert, delete on table public.signup_invitations to authenticated;

-- El correo se guarda en minúsculas y sin espacios, y quién invitó y cuándo los pone la base
create or replace function public.stamp_signup_invitation() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  new.email := lower(btrim(new.email));
  new.invited_by := auth.uid();
  new.created_at := now();
  return new;
end;
$$;
revoke all on function public.stamp_signup_invitation() from public, anon, authenticated, service_role;

do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'signup_invitations_stamp' and tgrelid = 'public.signup_invitations'::regclass
  ) then
    create trigger signup_invitations_stamp before insert on public.signup_invitations
      for each row execute function public.stamp_signup_invitation();
  end if;

  -- Solo el dueño y los admins, con su segundo factor si se pide, leen, invitan y quitan
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'signup_invitations' and policyname = 'invitations_admin_select'
  ) then
    create policy invitations_admin_select on public.signup_invitations for select to authenticated
      using (public.is_admin());
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'signup_invitations' and policyname = 'invitations_admin_insert'
  ) then
    create policy invitations_admin_insert on public.signup_invitations for insert to authenticated
      with check (public.is_admin());
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'signup_invitations' and policyname = 'invitations_admin_delete'
  ) then
    create policy invitations_admin_delete on public.signup_invitations for delete to authenticated
      using (public.is_admin());
  end if;
end $$;

-- Las invitaciones con la marca de si ese correo ya creó su cuenta. Solo el dueño y los admins. Pedir el
-- código ya crea la fila en auth.users, así que cuenta solo quien confirmó su correo con el enlace, con
-- el código o con Google
create or replace function public.admin_list_invitations()
returns table (email text, invited_at timestamptz, registered boolean)
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not public.is_admin() then
    raise exception 'Solo un administrador puede ver las invitaciones' using errcode = '42501';
  end if;
  return query
    select i.email, i.created_at,
           exists (
             select 1 from auth.users u
             where lower(u.email) = i.email and u.email_confirmed_at is not null
           )
    from public.signup_invitations i
    order by i.created_at desc, i.email
    limit 500;
end;
$$;
revoke all on function public.admin_list_invitations() from public, anon, authenticated, service_role;
grant execute on function public.admin_list_invitations() to authenticated;

-- Registro cerrado hasta el lanzamiento. Con true, cualquiera crea su cuenta
insert into public.platform_settings (key, value) values ('registration_open', 'false'::jsonb)
  on conflict (key) do nothing;

-- ===================================================================== Gancho Before User Created
-- Supabase Auth la llama con el rol supabase_auth_admin antes de crear un usuario, con el evento que
-- documenta (user.email, user.app_metadata.provider y lo demás). {} deja crear la cuenta. Un objeto con
-- error la rechaza y su mensaje llega a la app, que busca la marca invitation_required. Lee solo la
-- configuración y las invitaciones
create or replace function public.before_user_created_hook(event jsonb) returns jsonb
language plpgsql stable set search_path = public, pg_temp as $$
declare
  v_email text := lower(btrim(coalesce(event -> 'user' ->> 'email', '')));
begin
  if coalesce((select value = 'true'::jsonb from public.platform_settings where key = 'registration_open'), false) then
    return '{}'::jsonb;
  end if;
  if v_email <> '' and exists (select 1 from public.signup_invitations where email = v_email) then
    return '{}'::jsonb;
  end if;
  return jsonb_build_object('error', jsonb_build_object(
    'http_code', 403,
    'message', 'Studiare está abierto solo con invitación y este correo no tiene una (invitation_required)'
  ));
end;
$$;

-- Lo que pide la documentación del gancho. Solo Auth lo ejecuta, y lee lo que necesita con políticas
-- propias para su rol
grant usage on schema public to supabase_auth_admin;
revoke all on function public.before_user_created_hook(jsonb) from public, anon, authenticated, service_role;
grant execute on function public.before_user_created_hook(jsonb) to supabase_auth_admin;
grant select on table public.signup_invitations to supabase_auth_admin;
grant select on table public.platform_settings to supabase_auth_admin;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'signup_invitations' and policyname = 'invitations_auth_hook_read'
  ) then
    create policy invitations_auth_hook_read on public.signup_invitations for select to supabase_auth_admin
      using (true);
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'platform_settings' and policyname = 'settings_auth_hook_read'
  ) then
    create policy settings_auth_hook_read on public.platform_settings for select to supabase_auth_admin
      using (true);
  end if;
end $$;

-- ===================================================================== Cómo nos conociste
create table if not exists public.signup_sources (
  user_id uuid primary key references auth.users (id) on delete cascade,
  channel text not null check (channel in (
    'instagram', 'tiktok', 'facebook', 'youtube', 'influencer', 'friend', 'google', 'university', 'other'
  )),
  influencer_code text check (influencer_code ~ '^[A-Z0-9_-]{2,32}$'),
  answered_at timestamptz not null default now()
);
alter table public.signup_sources enable row level security;
revoke all on table public.signup_sources from anon, authenticated;

-- Guarda la respuesta del alumno que llama, desde su dispositivo activo. La primera gana. Devuelve true
-- si la guardó y false si ya había una. El canal y el código los valida la tabla
create or replace function public.record_signup_source(p_channel text, p_influencer_code text default null)
returns boolean
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_user uuid := auth.uid();
  v_rows integer;
begin
  if v_user is null then
    raise exception 'Hace falta iniciar sesión' using errcode = '28000';
  end if;
  if not public.is_active_device() then
    raise exception 'Este dispositivo no es el activo de la cuenta' using errcode = '42501';
  end if;
  insert into public.signup_sources (user_id, channel, influencer_code)
    values (v_user, p_channel, nullif(upper(btrim(coalesce(p_influencer_code, ''))), ''))
    on conflict (user_id) do nothing;
  get diagnostics v_rows = row_count;
  return v_rows > 0;
end;
$$;
revoke all on function public.record_signup_source(text, text) from public, anon, authenticated, service_role;
grant execute on function public.record_signup_source(text, text) to authenticated;

-- Conteos por canal. Nunca filas sueltas
create or replace function public.admin_signup_source_counts()
returns table (channel text, total bigint)
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not public.is_admin() then
    raise exception 'Solo un administrador puede ver de dónde llegan los alumnos' using errcode = '42501';
  end if;
  return query
    select s.channel, count(*)::bigint
    from public.signup_sources s
    group by s.channel
    order by count(*) desc, s.channel;
end;
$$;
revoke all on function public.admin_signup_source_counts() from public, anon, authenticated, service_role;
grant execute on function public.admin_signup_source_counts() to authenticated;

-- Conteos por código de influencer
create or replace function public.admin_influencer_code_counts()
returns table (code text, total bigint)
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not public.is_admin() then
    raise exception 'Solo un administrador puede ver de dónde llegan los alumnos' using errcode = '42501';
  end if;
  return query
    select s.influencer_code, count(*)::bigint
    from public.signup_sources s
    where s.influencer_code is not null
    group by s.influencer_code
    order by count(*) desc, s.influencer_code
    limit 200;
end;
$$;
revoke all on function public.admin_influencer_code_counts() from public, anon, authenticated, service_role;
grant execute on function public.admin_influencer_code_counts() to authenticated;

-- ===================================================================== Datos de la cuenta
alter table public.private_accounts add column if not exists details_changed_at timestamptz;
alter table public.private_accounts add column if not exists adult_confirmed_at timestamptz;

-- La confirmación de mayoría de edad se guarda una vez y se queda con la primera fecha
create or replace function public.keep_adult_confirmation() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  new.adult_confirmed_at := coalesce(old.adult_confirmed_at, new.adult_confirmed_at);
  return new;
end;
$$;
revoke all on function public.keep_adult_confirmation() from public, anon, authenticated, service_role;

do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'private_accounts_keep_adult' and tgrelid = 'public.private_accounts'::regclass
  ) then
    create trigger private_accounts_keep_adult before update on public.private_accounts
      for each row execute function public.keep_adult_confirmation();
  end if;
end $$;
