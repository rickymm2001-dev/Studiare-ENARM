-- Barrera del dispositivo único por cuenta, del lado del servidor (acuerdo del equipo del 2026-10-07).
--
-- La migración 20261007000001_single_device.sql dejó el FRENO. El navegador reclama la cuenta con
-- claim_device y revisa si otro dispositivo ganó. Esa revisión corre en el cliente, así que alguien
-- que manipule su navegador se la salta. Esta migración hace cumplir la regla en la base de datos.
--
-- Cómo funciona
--   - claim_device guarda, junto con device_id, el session_id del token de acceso de quien reclama
--     (claim session_id de Supabase Auth, que se lee con auth.jwt() ->> 'session_id')
--   - is_active_device() dice si el token de quien llama es el del dispositivo ganador
--   - Las políticas de las tablas con datos del alumno exigen is_active_device(). Un dispositivo
--     desplazado conserva un token válido, pero la base ya no le deja leer ni escribir esos datos
--   - Gana el último en entrar, como en el freno. Entrar de nuevo desde el dispositivo anterior
--     le quita la cuenta al nuevo, con un tope de cambios (ver más abajo)
--
-- Tablas PROTEGIDAS (las políticas exigen is_active_device(), en lectura y escritura)
--   profiles            solo la escritura propia y ver perfiles de compañeros de grupo
--   private_accounts    lectura y escritura propias (datos personales)
--   subscriptions       lectura propia (el plan define los límites del alumno)
--   content_reports     reportes propios
--   decks               mazos propios (lectura y escritura). Los mazos públicos siguen visibles
--   notes, cards        escritura. La lectura hereda la de decks, porque sus políticas consultan decks
--   events              bitácora propia (agregar y leer)
--   groups, memberships, challenges   todo, son datos de grupo del alumno
--   ai_artifacts        borradores propios (leer y decidir)
--
-- Tablas NO protegidas, y por qué
--   user_roles, role_audit   el rol se lee al entrar, antes de reclamar la cuenta. No es contenido
--   profiles (lectura propia) el alias se lee al entrar, antes de reclamar. Es solo el seudónimo
--   device_sessions (lectura propia)  el dispositivo nuevo la lee para saber si ganó
--   privacy_acceptances      el aviso de privacidad se registra justo al entrar. Es un registro legal
--                            que no debe depender de quién tiene el dispositivo
--   payments                 historial que escribe el servidor con la llave secreta. Leerlo no da servicio
--   payment_webhook_events   sin políticas, solo el servidor
--   platform_settings, questions (aprobadas), question_options, clinical_cases, mazos públicos
--                            contenido compartido o configuración pública. Leerlo no es usar la cuenta
--   review_assignments, review_decisions   flujo de revisión médica. No son datos del alumno. Si más
--                            adelante se quiere un solo dispositivo para médicos, se suma aquí
--   device_claims            bitácora interna. Nadie la lee ni la escribe por la API
--   El registro de cuentas nuevas (handle_new_user) y la creación de roles no pasan por estas políticas
--
-- Reglas de is_active_device()
--   - Sin sesión (auth.uid() nulo) devuelve false
--   - Un administrador o el dueño siempre pasa (is_admin() mira la tabla de roles, no el token)
--   - Una cuenta sin fila en device_sessions pasa. Así no se bloquea a quien aún no corrió el cliente
--     nuevo, ni a quien acaba de registrarse y todavía no reclama
--   - Una fila sin session_id (reclamada antes de esta migración, o con un token sin ese claim) deja
--     pasar cualquier token de la cuenta. Es transitorio y se cierra solo cuando el cliente nuevo
--     reclama o confirma el dispositivo, porque esa llamada ya guarda el session_id
--   - Una fila con session_id solo deja pasar al token con ese mismo session_id. Un token sin
--     session_id NO pasa. Supabase firma siempre el claim en los tokens de acceso actuales. Un
--     token sin él es de un formato muy viejo o no sale del flujo normal de la app, y una cuenta
--     ya amarrada a una sesión no debe abrirse con él. Se renueva al volver a entrar
--
-- Límite de cambios
--   Un usuario puede tomar la cuenta desde un dispositivo DISTINTO como máximo 3 veces en 24 horas.
--   El primer reclamo de una cuenta y volver a reclamar desde el mismo device_id no cuentan. Los
--   valores viven en platform_settings, clave device_limits, con constantes de respaldo al inicio
--   de device_limit_status. Al pasarse, claim_device lanza el error DV001 con la hora en que puede
--   volver a intentarlo en DETAIL (UTC, formato ISO 8601).
--
-- Intentos rechazados
--   Una excepción deshace todo lo que la función escribió, incluida su propia bitácora. Por eso
--   claim_device no puede registrar su rechazo. El cliente llama enseguida a log_rejected_claim,
--   que solo escribe si el servidor confirma que ese reclamo se rechazaría ahora mismo. Si un
--   cliente no la llama, el rechazo no queda en la bitácora. Los cambios que sí ocurren siempre
--   quedan registrados por claim_device en la misma transacción
--
-- Es idempotente y se corre después de 20261007000001_single_device.sql. No edita esa migración

-- ===================================================================== Sesión del token
alter table public.device_sessions add column if not exists session_id text;
do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.device_sessions'::regclass and conname = 'device_sessions_session_id_check'
  ) then
    alter table public.device_sessions
      add constraint device_sessions_session_id_check check (session_id is null or session_id <> '');
  end if;
end $$;

-- ===================================================================== Límite configurable
-- No pisa un valor que el admin ya haya cambiado
insert into public.platform_settings (key, value)
  values ('device_limits', '{"maxChanges":3,"windowHours":24}')
  on conflict (key) do nothing;

-- ===================================================================== Bitácora de reclamos
-- Solo se agrega. Un reclamo por fila. Es el insumo para detectar cuentas compartidas.
-- kind, first (primer reclamo de la cuenta), switch (tomó la cuenta desde otro dispositivo),
-- refresh (mismo dispositivo con una sesión nueva) y release (un admin liberó la cuenta).
-- rejected solo aplica a switch, un cambio que el límite no dejó pasar
create table if not exists public.device_claims (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  -- En release es el dispositivo que se liberó, o vacío si la cuenta no tenía ninguno
  device_id text not null check (char_length(device_id) <= 80),
  label text not null default '' check (char_length(label) <= 80),
  claimed_at timestamptz not null default now(),
  kind text not null check (kind in ('first', 'switch', 'refresh', 'release')),
  rejected boolean not null default false,
  -- Quién liberó la cuenta. Sin llave foránea a propósito, para que borrar a un admin no edite filas
  actor_id uuid,
  check (not rejected or kind = 'switch'),
  check ((kind = 'release') = (actor_id is not null))
);
create index if not exists device_claims_user_at on public.device_claims (user_id, claimed_at desc);

-- Ni editar ni borrar, ni siquiera el admin. La única excepción es que se borre la cuenta entera,
-- porque entonces ya no existe el usuario y la llave foránea borra sus filas en cascada
create or replace function public.forbid_device_claim_changes() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if tg_op = 'DELETE' then
    if not exists (select 1 from auth.users where id = old.user_id) then return old; end if;
  end if;
  raise exception 'La bitácora de reclamos solo se agrega' using errcode = '42501';
end;
$$;
drop trigger if exists device_claims_append_only on public.device_claims;
create trigger device_claims_append_only before update or delete on public.device_claims
  for each row execute function public.forbid_device_claim_changes();
drop trigger if exists device_claims_no_truncate on public.device_claims;
create trigger device_claims_no_truncate before truncate on public.device_claims
  for each statement execute function public.forbid_device_claim_changes();

-- Sin permisos de tabla para la API y sin políticas. Solo las funciones de abajo, que corren con los
-- permisos de su dueño, la leen y la escriben. En Supabase las tablas nuevas nacen con permisos para
-- anon, authenticated y service_role, por eso se quitan de forma explícita
alter table public.device_claims enable row level security;
revoke all on public.device_claims from public, anon, authenticated, service_role;
revoke all on sequence public.device_claims_id_seq from public, anon, authenticated, service_role;

-- ===================================================================== Ayudas internas
-- Validación común de claim_device y log_rejected_claim. Nadie la llama desde la API
create or replace function public.assert_device_input(p_device_id text, p_label text) returns void
language plpgsql set search_path = public, pg_temp as $$
begin
  if p_device_id is null or btrim(p_device_id) = '' or char_length(p_device_id) > 80 then
    raise exception 'El id del dispositivo debe tener entre 1 y 80 caracteres' using errcode = '22023';
  end if;
  if p_label is not null and char_length(p_label) > 80 then
    raise exception 'La etiqueta del dispositivo no puede pasar de 80 caracteres' using errcode = '22023';
  end if;
end;
$$;

-- Si el usuario ya llegó al tope de cambios de dispositivo y a qué hora puede volver a intentarlo.
-- Cuenta solo los cambios aceptados (switch) dentro de la ventana, y desde la última liberación
-- que hizo un admin, para que liberar una cuenta reinicie el conteo
create or replace function public.device_limit_status(p_user uuid, out blocked boolean, out retry_at timestamptz)
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  -- Valores de respaldo si platform_settings no tiene device_limits o no se entiende
  default_max_changes constant int := 3;
  default_window_hours constant int := 24;
  cfg jsonb;
  max_changes int := default_max_changes;
  window_hours int := default_window_hours;
  raw numeric;
  window_start timestamptz;
  changes int;
  pivot timestamptz;
begin
  select value into cfg from public.platform_settings where key = 'device_limits';
  if jsonb_typeof(cfg -> 'maxChanges') = 'number' then
    raw := (cfg ->> 'maxChanges')::numeric;
    if raw = trunc(raw) and raw between 1 and 50 then max_changes := raw::int; end if;
  end if;
  if jsonb_typeof(cfg -> 'windowHours') = 'number' then
    raw := (cfg ->> 'windowHours')::numeric;
    if raw = trunc(raw) and raw between 1 and 168 then window_hours := raw::int; end if;
  end if;

  window_start := greatest(
    now() - make_interval(hours => window_hours),
    coalesce((select max(claimed_at) from public.device_claims where user_id = p_user and kind = 'release'),
             '-infinity'::timestamptz)
  );
  select count(*) into changes from public.device_claims
    where user_id = p_user and kind = 'switch' and not rejected and claimed_at > window_start;
  blocked := changes >= max_changes;
  retry_at := null;
  if blocked then
    -- Podrá volver a cambiar cuando salgan de la ventana los cambios que sobran
    select claimed_at into pivot from public.device_claims
      where user_id = p_user and kind = 'switch' and not rejected and claimed_at > window_start
      order by claimed_at, id offset (changes - max_changes) limit 1;
    retry_at := date_trunc('second', pivot + make_interval(hours => window_hours)) + interval '1 second';
  end if;
end;
$$;

-- ===================================================================== Dispositivo activo
-- true si el token de quien llama es el del dispositivo ganador. Las reglas están en el encabezado.
-- Stable para que Postgres la evalúe una vez por consulta cuando la política la envuelve en select
create or replace function public.is_active_device() returns boolean
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  uid uuid := auth.uid();
  held text;
  has_row boolean;
begin
  if uid is null then return false; end if;
  if public.is_admin() then return true; end if;
  select true, session_id into has_row, held from public.device_sessions where user_id = uid;
  if has_row is null then return true; end if;
  if held is null then return true; end if;
  return held = nullif(auth.jwt() ->> 'session_id', '');
end;
$$;

-- ===================================================================== Reclamar la cuenta
-- Reemplaza la versión del freno con la misma firma. Ahora guarda el session_id, registra el reclamo
-- y aplica el límite de cambios. Una sola transacción por llamada
create or replace function public.claim_device(p_device_id text, p_label text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  uid uuid := auth.uid();
  sid text := nullif(auth.jwt() ->> 'session_id', '');
  held public.device_sessions%rowtype;
  claim_kind text;
  limit_state record;
begin
  if uid is null then
    raise exception 'Se necesita una sesión para reclamar el dispositivo' using errcode = '42501';
  end if;
  perform public.assert_device_input(p_device_id, p_label);
  -- Dos reclamos a la vez de la misma cuenta esperan su turno, así el conteo del límite no se burla
  perform pg_advisory_xact_lock(hashtextextended('device:' || uid::text, 0));

  select * into held from public.device_sessions where user_id = uid;
  if not found then
    claim_kind := 'first';
  elsif held.device_id = p_device_id then
    claim_kind := 'refresh';
  else
    claim_kind := 'switch';
    select * into limit_state from public.device_limit_status(uid);
    if limit_state.blocked then
      raise exception 'Cambiaste de dispositivo demasiadas veces en poco tiempo'
        using errcode = 'DV001',
              detail = to_char(limit_state.retry_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
              hint = 'Vuelve a intentarlo a la hora indicada o pide ayuda para que liberen tu cuenta';
    end if;
  end if;

  insert into public.device_sessions (user_id, device_id, label, session_id, claimed_at)
    values (uid, p_device_id, coalesce(p_label, ''), sid, now())
    on conflict (user_id) do update
      set device_id = excluded.device_id, label = excluded.label,
          session_id = excluded.session_id, claimed_at = excluded.claimed_at;

  -- Volver a confirmar el mismo dispositivo con la misma sesión no cambia nada y no se registra
  if claim_kind <> 'refresh' or held.session_id is distinct from sid then
    insert into public.device_claims (user_id, device_id, label, claimed_at, kind)
      values (uid, p_device_id, coalesce(p_label, ''), clock_timestamp(), claim_kind);
  end if;
end;
$$;

-- Deja asentado un reclamo que el límite rechazó. claim_device no puede hacerlo porque su excepción
-- deshace sus escrituras (ver el encabezado). Solo escribe si el servidor confirma que ese reclamo
-- se rechazaría ahora mismo, y no repite el mismo rechazo en pocos minutos. Devuelve si escribió
create or replace function public.log_rejected_claim(p_device_id text, p_label text) returns boolean
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  uid uuid := auth.uid();
  dedupe_minutes constant int := 5;
  held public.device_sessions%rowtype;
  limit_state record;
begin
  if uid is null then
    raise exception 'Se necesita una sesión para registrar el reclamo' using errcode = '42501';
  end if;
  perform public.assert_device_input(p_device_id, p_label);
  perform pg_advisory_xact_lock(hashtextextended('device:' || uid::text, 0));

  select * into held from public.device_sessions where user_id = uid;
  if not found or held.device_id = p_device_id then return false; end if;
  select * into limit_state from public.device_limit_status(uid);
  if not limit_state.blocked then return false; end if;
  if exists (
    select 1 from public.device_claims
    where user_id = uid and device_id = p_device_id and rejected
      and claimed_at > now() - make_interval(mins => dedupe_minutes)
  ) then return false; end if;

  insert into public.device_claims (user_id, device_id, label, claimed_at, kind, rejected)
    values (uid, p_device_id, coalesce(p_label, ''), clock_timestamp(), 'switch', true);
  return true;
end;
$$;

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

-- Los últimos reclamos de una cuenta, del más reciente al más antiguo
create or replace function public.admin_device_claims(target uuid)
returns table (id bigint, device_id text, label text, claimed_at timestamptz, kind text, rejected boolean, actor_id uuid)
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  max_rows constant int := 50;
begin
  if not public.is_admin() then
    raise exception 'Solo un administrador puede ver los reclamos' using errcode = '42501';
  end if;
  return query
    select c.id, c.device_id, c.label, c.claimed_at, c.kind, c.rejected, c.actor_id
    from public.device_claims c
    where c.user_id = target
    order by c.claimed_at desc, c.id desc
    limit max_rows;
end;
$$;

-- ===================================================================== Permisos de las funciones
-- En Supabase anon recibe permiso de ejecución por defecto, por eso se le quita de forma explícita
-- además de quitárselo a public. Las ayudas internas no las ejecuta nadie por la API. Las funciones
-- del admin las ejecuta cualquier sesión iniciada, pero ellas mismas piden is_admin()
revoke all on function public.assert_device_input(text, text) from public, anon, authenticated, service_role;
revoke all on function public.device_limit_status(uuid) from public, anon, authenticated, service_role;
revoke all on function public.forbid_device_claim_changes() from public, anon, authenticated, service_role;
revoke all on function public.is_active_device() from public, anon, service_role;
grant execute on function public.is_active_device() to authenticated;
revoke all on function public.claim_device(text, text) from public, anon, service_role;
grant execute on function public.claim_device(text, text) to authenticated;
revoke all on function public.log_rejected_claim(text, text) from public, anon, service_role;
grant execute on function public.log_rejected_claim(text, text) to authenticated;
revoke all on function public.admin_release_device(uuid) from public, anon, service_role;
grant execute on function public.admin_release_device(uuid) to authenticated;
revoke all on function public.admin_device_claims(uuid) from public, anon, service_role;
grant execute on function public.admin_device_claims(uuid) to authenticated;

-- ===================================================================== Políticas
-- Cada alter policy conserva la regla original y le suma is_active_device(). Va envuelta en select
-- para que Postgres la evalúe una vez por consulta y no una vez por fila.
-- Los permisos aplicables a una misma operación se suman con "o", así que todas las políticas de una
-- tabla que dan acceso a datos propios llevan la condición. Si una la olvida, abre la puerta

-- Perfiles. Ver el propio sigue sin condición porque se lee al entrar. Ver a los compañeros de grupo
-- y escribir el propio sí la piden
alter policy profiles_select on public.profiles
  using (id = auth.uid() or (public.shares_group(id) and (select public.is_active_device())) or public.is_admin());
alter policy profiles_update on public.profiles
  using (id = auth.uid() and (select public.is_active_device()))
  with check (id = auth.uid() and (select public.is_active_device()));

-- Datos de cuenta
alter policy accounts_select on public.private_accounts
  using ((user_id = auth.uid() and (select public.is_active_device())) or public.is_admin());
alter policy accounts_update on public.private_accounts
  using (user_id = auth.uid() and (select public.is_active_device()))
  with check (user_id = auth.uid() and (select public.is_active_device()));

-- Suscripción propia
alter policy subscriptions_select on public.subscriptions
  using ((user_id = auth.uid() and (select public.is_active_device())) or public.is_admin());

-- Reportes de contenido
alter policy reports_insert on public.content_reports
  with check (reporter_id = auth.uid() and (select public.is_active_device()));
alter policy reports_select on public.content_reports
  using ((reporter_id = auth.uid() and (select public.is_active_device())) or public.is_admin());

-- Mazos. Los públicos se ven siempre. notes y cards consultan decks en sus políticas de lectura,
-- así que heredan esta regla. Su escritura la lleva explícita
alter policy decks_select on public.decks
  using (visibility = 'public' or (owner_id = auth.uid() and (select public.is_active_device())) or public.is_admin());
alter policy decks_own_write on public.decks
  using ((owner_id = auth.uid() or public.is_admin()) and (select public.is_active_device()))
  with check ((owner_id = auth.uid() or public.is_admin()) and (select public.is_active_device()));
alter policy notes_own_write on public.notes
  using (
    exists (select 1 from public.decks d where d.id = notes.deck_id and (d.owner_id = auth.uid() or public.is_admin()))
    and (select public.is_active_device())
  )
  with check (
    exists (select 1 from public.decks d where d.id = notes.deck_id and (d.owner_id = auth.uid() or public.is_admin()))
    and (select public.is_active_device())
  );
alter policy cards_own_write on public.cards
  using (
    exists (select 1 from public.decks d where d.id = cards.deck_id and (d.owner_id = auth.uid() or public.is_admin()))
    and (select public.is_active_device())
  )
  with check (
    exists (select 1 from public.decks d where d.id = cards.deck_id and (d.owner_id = auth.uid() or public.is_admin()))
    and (select public.is_active_device())
  );

-- Bitácora de estudio
alter policy events_insert on public.events
  with check (user_id = auth.uid() and (select public.is_active_device()));
alter policy events_select on public.events
  using (user_id = auth.uid() and (select public.is_active_device()));

-- Grupos
alter policy groups_select on public.groups
  using ((owner_id = auth.uid() or public.is_group_member(id)) and (select public.is_active_device()));
alter policy groups_insert on public.groups
  with check (owner_id = auth.uid() and (select public.is_active_device()));
alter policy memberships_select on public.memberships
  using ((user_id = auth.uid() or public.is_group_member(group_id)) and (select public.is_active_device()));
alter policy memberships_own on public.memberships
  with check (user_id = auth.uid() and (select public.is_active_device()));
alter policy memberships_leave on public.memberships
  using (user_id = auth.uid() and (select public.is_active_device()))
  with check (user_id = auth.uid() and (select public.is_active_device()));
alter policy challenges_select on public.challenges
  using (public.is_group_member(group_id) and (select public.is_active_device()));
alter policy challenges_insert on public.challenges
  with check (public.is_group_member(group_id) and (select public.is_active_device()));

-- Borradores de IA
alter policy ai_select on public.ai_artifacts
  using (user_id = auth.uid() and (select public.is_active_device()));
alter policy ai_decide on public.ai_artifacts
  using (user_id = auth.uid() and (select public.is_active_device()))
  with check (user_id = auth.uid() and (select public.is_active_device()));
