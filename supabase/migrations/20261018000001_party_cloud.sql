-- Party en la nube (B7 del plan del cambio, respuestas 69 y 77, 4.3 y 4.14).
--
-- Qué cambia
--   Hasta ahora Party corría completa en el navegador, con seis compañeros simulados y un rival de
--   duelo simulado. Desde aquí los grupos son reales. Se entra con un código o con un enlace que lo
--   lleva, la tabla de la semana muestra el alias y el XP de cada miembro, hay retos del grupo y los
--   duelos son entre dos alumnos reales que contestan las mismas preguntas cuando cada uno puede. Lo
--   simulado se queda solo en la base de demostración del navegador
--
-- Qué se comparte y con quién
--   - Solo los miembros activos de un grupo lo ven, con el alias y el XP de la semana de cada miembro.
--     El alias sale de profiles, que deja ver la fila a quien comparte un grupo (shares_group). Por
--     columnas la API solo lee id y alias de cualquier perfil, así un compañero no ve la zona horaria,
--     los ajustes ni la fecha de alta. La foto de perfil, si el alumno subió una, también la ven sus
--     compañeros (20261016000001_avatars.sql), y el permiso de Party lo dice
--   - Nadie lee el correo de otro alumno. private_accounts conserva su política de siempre, la fila
--     propia o el admin, y nada de esta migración la lee ni la expone
--   - Cada miembro publica su propio XP de la semana y su aporte a los retos. Los calcula su navegador
--     con su bitácora, que el grupo nunca ve, solo estas cifras. Las funciones escriben siempre a
--     nombre de quien llama, así que nadie publica por otro. Los aportes y el XP de quien ya no es
--     miembro activo dejan de verse
--   - En un duelo cada participante manda su resultado una sola vez, con sus aciertos y su tiempo. El
--     del rival solo se ve después de mandar el propio, así nadie juega sabiendo cuánto sacó el otro
--   - Salir de un grupo quita el acceso en el acto. Borrar mis datos borra las membresías, y con ellas,
--     en cascada, el XP publicado, los aportes y los duelos de esa persona. party_export_mine le
--     devuelve a cada quien sus propias filas de Party para Exportar mis datos
--
-- Duelos de un solo intento
--   El duelo se empieza con party_start_duel, que deja el inicio en el servidor, uno por participante.
--   party_submit_duel_result solo acepta el resultado de quien ya lo empezó. Así nadie juega, ve las
--   respuestas en la retroalimentación y vuelve a empezar. El navegador cuenta la primera sesión que
--   empezó y las preguntas sin contestar como incorrectas
--
-- Cifras con tope (PT004)
--   Las cifras las manda el navegador de cada quien, así que el servidor rechaza las imposibles. Un
--   duelo pide al menos 3 segundos por acierto, el XP de la semana llega hasta 50,000 y el aporte a un
--   reto no pasa de su meta. Con el tope de 1,500 XP diarios por volumen y la racha, una semana real
--   queda muy por debajo
--
-- Moderación
--   Quien administra el grupo, owner_id, cambia el código de invitación (party_rotate_code), quita a
--   un miembro (party_remove_member) y borra retos. Un reto lo borra también quien lo creó
--   (party_delete_challenge). Borrar un reto lo marca con deleted_at y no borra la fila, así esta
--   migración sigue sin sentencias delete. Si quien administra borra su cuenta, el grupo pasa al
--   miembro activo más antiguo, y solo se borra si ya no queda nadie. Eso cambia una llave foránea y
--   vive en supabase/manual/party-dueno-al-borrar-cuenta.sql, que se pega a mano
--
-- Códigos de error propios
--   PT001 Party cerrada para la cuenta, PT002 no es miembro o no participa, PT003 el duelo no se ha
--   empezado, PT004 cifras imposibles y PT005 solo quien administra el grupo, o quien creó el reto
--
-- Por qué las escrituras pasan por funciones
--   La primera migración dejaba insertar membresías directo. Con eso alguien podía entrar a un grupo
--   sin su código con solo conocer su id, volver a uno del que salió o mover su membresía a otro grupo
--   con un update. Ahora la API solo lee groups, memberships y challenges, y toda escritura pasa por
--   funciones que validan el código, los límites y la membresía. Las políticas de escritura de la
--   primera migración se quedan, pero sin el permiso de tabla ya no abren nada
--
-- Un solo lugar para el plan (B8)
--   party_open() dice si Party está abierta para quien llama. La usan is_group_member y shares_group,
--   que son las que revisan las políticas, y todas las funciones de Party. Hoy basta con tener sesión.
--   B8 agrega ahí la condición del plan, porque Party se cierra en Gratis (4.3), y con eso se cierran
--   a la vez las lecturas y las escrituras. Salir de un grupo no la pide, para que siempre se pueda
--
-- Límites (party_limit), contra el abuso y no contra el estudio
--   - 50 miembros por grupo y 10 grupos activos por alumno. 5 grupos nuevos al día por alumno
--   - 10 códigos fallidos por hora por alumno. Pasado el tope, party_join_group contesta rate_limited
--     sin revisar el código, así adivinar códigos no sirve. Los intentos fallidos quedan en
--     party_join_attempts, que nadie lee por la API
--   - 10 retos activos por grupo y 10 duelos propios esperando al rival
--
-- Banco de los duelos
--   Quien reta elige las preguntas en su navegador, del banco que tienen los dos, y quedan fijas en el
--   duelo. Hoy ese banco es el de demostración, igual en todos los navegadores. Con el banco real en la
--   nube (B11) la elección pasa al servidor, que conoce el banco y el plan de cada quien
--
-- Es idempotente y no lleva sentencias delete ni drop, así se aplica con el conector (docs/SUPABASE.md).
-- Se corre después de 20261016000001_avatars.sql. No edita las migraciones anteriores

-- ===================================================================== Retos del grupo
-- challenges nació sin autor. Queda vacío si esa persona borra su cuenta
alter table public.challenges
  add column if not exists created_by uuid references auth.users (id) on delete set null;
-- Un reto borrado queda marcado y deja de verse. Sus aportes se quedan ocultos con él
alter table public.challenges add column if not exists deleted_at timestamptz;
alter table public.challenges
  add column if not exists deleted_by uuid references auth.users (id) on delete set null;
-- Para que los aportes apunten al reto y a su grupo a la vez, sin poder mezclar grupos
create unique index if not exists challenges_id_group on public.challenges (id, group_id);
create index if not exists challenges_group_ends on public.challenges (group_id, ends_at desc);
create index if not exists challenges_created_by on public.challenges (created_by);
create index if not exists challenges_deleted_by on public.challenges (deleted_by) where deleted_by is not null;
create index if not exists memberships_user_active on public.memberships (user_id) where left_at is null;
create index if not exists groups_owner_created on public.groups (owner_id, created_at desc);

-- ===================================================================== XP de la semana
-- Una fila por grupo, miembro y semana. Cada miembro la publica en todos sus grupos activos
create table if not exists public.party_weekly_xp (
  group_id uuid not null,
  user_id uuid not null,
  -- Lunes de la semana de estudio de quien publica. La semana empieza el lunes a las 4 a. m.
  week_start date not null check (extract(isodow from week_start) = 1),
  xp integer not null check (xp between 0 and 1000000),
  updated_at timestamptz not null default now(),
  primary key (group_id, user_id, week_start),
  -- Borrar la membresía, como hace borrar mis datos, se lleva las cifras
  foreign key (group_id, user_id) references public.memberships (group_id, user_id) on delete cascade
);

-- ===================================================================== Aportes a los retos
create table if not exists public.party_challenge_progress (
  challenge_id uuid not null,
  group_id uuid not null,
  user_id uuid not null,
  -- Tarjetas, preguntas o XP desde que empezó el reto, según su métrica
  amount integer not null check (amount between 0 and 1000000),
  updated_at timestamptz not null default now(),
  primary key (challenge_id, user_id),
  foreign key (challenge_id, group_id) references public.challenges (id, group_id) on delete cascade,
  foreign key (group_id, user_id) references public.memberships (group_id, user_id) on delete cascade
);
create index if not exists party_challenge_progress_member
  on public.party_challenge_progress (group_id, user_id);

-- ===================================================================== Duelos
create table if not exists public.party_duels (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  challenger_id uuid not null,
  opponent_id uuid not null,
  -- Las preguntas que contestan los dos, en orden, fijadas al crear el duelo
  question_ids text[] not null check (cardinality(question_ids) between 1 and 40),
  created_at timestamptz not null default now(),
  check (challenger_id <> opponent_id),
  foreign key (group_id, challenger_id) references public.memberships (group_id, user_id) on delete cascade,
  foreign key (group_id, opponent_id) references public.memberships (group_id, user_id) on delete cascade
);
create index if not exists party_duels_challenger on public.party_duels (group_id, challenger_id);
create index if not exists party_duels_opponent on public.party_duels (group_id, opponent_id);
create index if not exists party_duels_group_created on public.party_duels (group_id, created_at desc);

-- Lo que sacó cada participante. Se manda una vez y no se edita
create table if not exists public.party_duel_results (
  duel_id uuid not null references public.party_duels (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  correct integer not null check (correct >= 0),
  -- Las preguntas del duelo. Las que no contestó cuentan como incorrectas
  answered integer not null check (answered between 1 and 40),
  -- Suma de lo que tardó en contestar, sin lo que leyó de la retroalimentación. Hasta 24 horas
  total_ms integer not null check (total_ms between 0 and 86400000),
  finished_at timestamptz not null default now(),
  primary key (duel_id, user_id),
  check (correct <= answered)
);
create index if not exists party_duel_results_user on public.party_duel_results (user_id);

-- Cuándo empezó cada participante su duelo. Uno por participante y no se edita. Sin él no se acepta
-- el resultado, y con él la app ya no ofrece jugar otra vez
create table if not exists public.party_duel_starts (
  duel_id uuid not null references public.party_duels (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  started_at timestamptz not null default now(),
  primary key (duel_id, user_id)
);
create index if not exists party_duel_starts_user on public.party_duel_starts (user_id);

-- El inicio y el resultado de un duelo se registran una sola vez
create or replace function public.party_forbid_result_changes() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  raise exception 'El inicio y el resultado de un duelo se registran una sola vez' using errcode = '42501';
end;
$$;
create or replace trigger party_duel_results_once before update on public.party_duel_results
  for each row execute function public.party_forbid_result_changes();
create or replace trigger party_duel_starts_once before update on public.party_duel_starts
  for each row execute function public.party_forbid_result_changes();

-- ===================================================================== Intentos fallidos de entrar
-- Solo se agrega. Un renglón por código que no abrió ningún grupo. Lo lee party_join_group para su tope
create table if not exists public.party_join_attempts (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  attempted_at timestamptz not null default now()
);
create index if not exists party_join_attempts_user_at
  on public.party_join_attempts (user_id, attempted_at desc);

-- ===================================================================== Permisos de tabla
-- En Supabase las tablas nacen con todos los permisos para anon, authenticated y service_role. La API
-- solo lee lo de Party, con las políticas de abajo, y escribe con las funciones
alter table public.party_weekly_xp enable row level security;
alter table public.party_challenge_progress enable row level security;
alter table public.party_duels enable row level security;
alter table public.party_duel_results enable row level security;
alter table public.party_duel_starts enable row level security;
alter table public.party_join_attempts enable row level security;

revoke all on public.groups, public.memberships, public.challenges from anon, authenticated;
grant select on public.groups, public.memberships, public.challenges to authenticated;
revoke all on public.party_weekly_xp, public.party_challenge_progress, public.party_duels,
  public.party_duel_results, public.party_duel_starts, public.party_join_attempts
  from public, anon, authenticated, service_role;
grant select on public.party_weekly_xp, public.party_challenge_progress, public.party_duels,
  public.party_duel_results, public.party_duel_starts to authenticated;
revoke all on sequence public.party_join_attempts_id_seq from public, anon, authenticated, service_role;

-- ===================================================================== Perfiles de los compañeros
-- profiles_select deja ver la fila de quien comparte un grupo. Por columnas, la API solo lee id y
-- alias de cualquier perfil, el propio incluido, que es lo único que la app lee. La zona horaria, los
-- ajustes y la fecha de alta no salen por la API. Las funciones del servidor que los usan, como la
-- lista de usuarios del admin, corren como su dueño y no cambian. Escribir el alias propio sigue igual
revoke select on public.profiles from anon, authenticated;
grant select (id, alias) on public.profiles to authenticated;

-- ===================================================================== Un solo lugar para el plan
-- Party abierta para quien llama. B8 del plan del cambio agrega aquí la condición del plan, porque
-- Party se cierra en Gratis (4.3), por ejemplo con
--   select auth.uid() is not null and public.user_plan(auth.uid()) <> 'free'
-- Con ese cambio quedan cerradas de una vez las políticas de grupos, miembros, retos, duelos y
-- perfiles de compañeros (por is_group_member y shares_group) y todas las funciones de Party
create or replace function public.party_open() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select auth.uid() is not null
$$;

-- Las dos revisiones de membresía que usan las políticas. Pasan por party_open
create or replace function public.is_group_member(target_group uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select public.party_open() and exists (
    select 1 from public.memberships
    where group_id = target_group and user_id = auth.uid() and left_at is null
  )
$$;

-- Si dos alumnos comparten un grupo activo. Sin recursión en los permisos de memberships
create or replace function public.shares_group(other uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select public.party_open() and exists (
    select 1 from public.memberships mine
    join public.memberships theirs on theirs.group_id = mine.group_id
    where mine.user_id = auth.uid() and theirs.user_id = other
      and mine.left_at is null and theirs.left_at is null
  )
$$;

-- Quién llama a una función de Party. Pide sesión y el dispositivo activo, como el resto de los datos
-- del alumno, y que Party esté abierta, salvo para salir de un grupo
create or replace function public.party_caller(p_require_open boolean default true) returns uuid
language plpgsql stable set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Hace falta iniciar sesión' using errcode = '28000';
  end if;
  if not public.is_active_device() then
    raise exception 'Este dispositivo no es el activo de la cuenta' using errcode = '42501';
  end if;
  if p_require_open and not public.party_open() then
    raise exception 'Party no está abierta para tu cuenta' using errcode = 'PT001';
  end if;
  return v_uid;
end;
$$;

-- Los topes de Party, en un solo lugar. Los dos últimos son las cifras imposibles (PT004). El
-- navegador usa los mismos números en src/data/cloud/party.ts (PARTY_CAPS)
create or replace function public.party_limit(p_name text) returns integer
language sql immutable set search_path = public, pg_temp as $$
  select case p_name
    when 'members_per_group' then 50
    when 'groups_per_member' then 10
    when 'groups_created_per_day' then 5
    when 'join_failures_per_hour' then 10
    when 'open_challenges_per_group' then 10
    when 'waiting_duels_per_member' then 10
    when 'weekly_xp' then 50000
    when 'duel_ms_per_correct' then 3000
  end
$$;

-- Código de 6 caracteres sin 0, O, 1, I ni L, para que no se confundan al dictarlo (D-047). El azar
-- sale de gen_random_uuid, que no depende de pgcrypto ni del esquema donde Supabase la instala. Los
-- primeros seis bytes de un uuid v4 son todos aleatorios
create or replace function public.party_new_invite_code() returns text
language plpgsql volatile set search_path = public, pg_temp as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  bytes bytea := uuid_send(gen_random_uuid());
  code text := '';
begin
  for i in 0..5 loop
    code := code || substr(alphabet, (get_byte(bytes, i) % char_length(alphabet)) + 1, 1);
  end loop;
  return code;
end;
$$;

-- Si quien llama ya mandó su resultado de ese duelo. La usa la política de los resultados, así el
-- del rival solo se ve después del propio, sin que la política se consulte a sí misma
create or replace function public.party_has_duel_result(p_duel uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.party_duel_results
    where duel_id = p_duel and user_id = auth.uid()
  )
$$;

-- ===================================================================== Políticas
-- Cada una pide is_active_device(), como las demás tablas con datos del alumno (20261008000001)
alter policy groups_select on public.groups
  using (public.is_group_member(id) and (select public.is_active_device()));
-- Un reto borrado deja de verse
alter policy challenges_select on public.challenges
  using (public.is_group_member(group_id) and deleted_at is null and (select public.is_active_device()));

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'party_weekly_xp' and policyname = 'party_weekly_xp_select'
  ) then
    -- El XP de quien ya salió del grupo deja de verse
    create policy party_weekly_xp_select on public.party_weekly_xp for select to authenticated
      using (
        public.is_group_member(group_id)
        and exists (
          select 1 from public.memberships m
          where m.group_id = party_weekly_xp.group_id and m.user_id = party_weekly_xp.user_id
            and m.left_at is null
        )
        and (select public.is_active_device())
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'party_challenge_progress'
      and policyname = 'party_challenge_progress_select'
  ) then
    -- Como el XP, el aporte de quien ya salió del grupo deja de verse. El de un reto borrado también
    create policy party_challenge_progress_select on public.party_challenge_progress for select
      to authenticated
      using (
        public.is_group_member(group_id)
        and exists (
          select 1 from public.memberships m
          where m.group_id = party_challenge_progress.group_id
            and m.user_id = party_challenge_progress.user_id
            and m.left_at is null
        )
        and exists (
          select 1 from public.challenges c
          where c.id = party_challenge_progress.challenge_id and c.deleted_at is null
        )
        and (select public.is_active_device())
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'party_duel_starts' and policyname = 'party_duel_starts_select'
  ) then
    -- Cada quien ve solo su propio inicio, de un duelo que todavía ve
    create policy party_duel_starts_select on public.party_duel_starts for select to authenticated
      using (
        user_id = (select auth.uid())
        and exists (select 1 from public.party_duels d where d.id = party_duel_starts.duel_id)
        and (select public.is_active_device())
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'party_duels' and policyname = 'party_duels_select'
  ) then
    -- Un duelo lo ven sus dos participantes mientras sigan en el grupo
    create policy party_duels_select on public.party_duels for select to authenticated
      using (
        (challenger_id = (select auth.uid()) or opponent_id = (select auth.uid()))
        and public.is_group_member(group_id)
        and (select public.is_active_device())
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'party_duel_results'
      and policyname = 'party_duel_results_select'
  ) then
    -- El resultado propio siempre. El del rival solo después de mandar el propio. En los dos casos
    -- hace falta ver el duelo, así que también rige la política de party_duels
    create policy party_duel_results_select on public.party_duel_results for select to authenticated
      using (
        (user_id = (select auth.uid()) or public.party_has_duel_result(duel_id))
        and exists (select 1 from public.party_duels d where d.id = party_duel_results.duel_id)
        and (select public.is_active_device())
      );
  end if;
end $$;

-- ===================================================================== Grupos
-- Crea un grupo con un código nuevo y mete a quien lo crea. Devuelve
--   {status: created, groupId, inviteCode}, {status: too_many} con 10 grupos activos o
--   {status: limit} con 5 grupos creados en el último día
create or replace function public.party_create_group(p_name text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := public.party_caller();
  v_name text := btrim(coalesce(p_name, ''));
  v_group uuid;
  v_code text;
begin
  if char_length(v_name) not between 1 and 60 then
    raise exception 'El nombre del grupo debe tener entre 1 y 60 caracteres' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('party:' || v_uid::text, 0));
  if (select count(*) from public.memberships where user_id = v_uid and left_at is null)
       >= public.party_limit('groups_per_member') then
    return jsonb_build_object('status', 'too_many');
  end if;
  if (select count(*) from public.groups where owner_id = v_uid and created_at > now() - interval '1 day')
       >= public.party_limit('groups_created_per_day') then
    return jsonb_build_object('status', 'limit');
  end if;
  loop
    v_code := public.party_new_invite_code();
    begin
      insert into public.groups (name, invite_code, owner_id)
        values (v_name, v_code, v_uid)
        returning id into v_group;
      exit;
    exception when unique_violation then
      -- Otro grupo tenía ese código. Se prueba con otro
      null;
    end;
  end loop;
  insert into public.memberships (group_id, user_id) values (v_group, v_uid);
  return jsonb_build_object('status', 'created', 'groupId', v_group, 'inviteCode', v_code);
end;
$$;

-- Entra a un grupo con su código, en mayúsculas o minúsculas. Devuelve {status, groupId} con joined o
-- already, y {status} con invalid, not_found, full, too_many o rate_limited. Quien salió vuelve a
-- entrar con el mismo código. Los códigos que no abren ningún grupo cuentan para el tope por hora
create or replace function public.party_join_group(p_code text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := public.party_caller();
  v_code text := upper(btrim(coalesce(p_code, '')));
  v_group uuid;
  v_left timestamptz;
  v_member boolean;
begin
  perform pg_advisory_xact_lock(hashtextextended('party:' || v_uid::text, 0));
  if (select count(*) from public.party_join_attempts
        where user_id = v_uid and attempted_at > now() - interval '1 hour')
       >= public.party_limit('join_failures_per_hour') then
    return jsonb_build_object('status', 'rate_limited');
  end if;
  if v_code !~ '^[A-Z0-9]{6}$' then
    insert into public.party_join_attempts (user_id) values (v_uid);
    return jsonb_build_object('status', 'invalid');
  end if;
  select id into v_group from public.groups where invite_code = v_code;
  if v_group is null then
    insert into public.party_join_attempts (user_id) values (v_uid);
    return jsonb_build_object('status', 'not_found');
  end if;
  -- El cupo se cuenta con un candado por grupo, así dos que entran a la vez no lo pasan
  perform pg_advisory_xact_lock(hashtextextended('party-group:' || v_group::text, 0));
  select true, left_at into v_member, v_left
    from public.memberships where group_id = v_group and user_id = v_uid;
  if v_member and v_left is null then
    return jsonb_build_object('status', 'already', 'groupId', v_group);
  end if;
  if (select count(*) from public.memberships where user_id = v_uid and left_at is null)
       >= public.party_limit('groups_per_member') then
    return jsonb_build_object('status', 'too_many');
  end if;
  if (select count(*) from public.memberships where group_id = v_group and left_at is null)
       >= public.party_limit('members_per_group') then
    return jsonb_build_object('status', 'full');
  end if;
  insert into public.memberships (group_id, user_id) values (v_group, v_uid)
    on conflict (group_id, user_id) do update set left_at = null, joined_at = now();
  return jsonb_build_object('status', 'joined', 'groupId', v_group);
end;
$$;

-- Sale de un grupo. Devuelve true si estaba dentro. No pide que Party esté abierta
create or replace function public.party_leave_group(p_group uuid) returns boolean
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := public.party_caller(false);
begin
  update public.memberships set left_at = now()
    where group_id = p_group and user_id = v_uid and left_at is null;
  return found;
end;
$$;

-- Sale de todos sus grupos. Es lo que pasa al retirar el permiso de Party. Devuelve de cuántos salió
create or replace function public.party_leave_all() returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := public.party_caller(false);
  v_count integer;
begin
  update public.memberships set left_at = now() where user_id = v_uid and left_at is null;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- ===================================================================== Moderación
-- Si quien llama administra el grupo y sigue en él. Lo piden las funciones de moderación
create or replace function public.party_assert_owner(p_group uuid, p_uid uuid) returns void
language plpgsql stable set search_path = public, pg_temp as $$
begin
  if not public.is_group_member(p_group) then
    raise exception 'No eres miembro de ese grupo' using errcode = 'PT002';
  end if;
  if not exists (select 1 from public.groups where id = p_group and owner_id = p_uid) then
    raise exception 'Solo quien administra el grupo puede hacer esto' using errcode = 'PT005';
  end if;
end;
$$;

-- Cambia el código de invitación. El código y el enlace de antes dejan de servir y quien ya está en
-- el grupo se queda. Devuelve {status: rotated, inviteCode}
create or replace function public.party_rotate_code(p_group uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := public.party_caller();
  v_code text;
begin
  perform public.party_assert_owner(p_group, v_uid);
  loop
    v_code := public.party_new_invite_code();
    -- Tiene que ser otro código, aunque salga el mismo por azar
    continue when v_code = (select invite_code from public.groups where id = p_group);
    begin
      update public.groups set invite_code = v_code where id = p_group;
      exit;
    exception when unique_violation then
      -- Otro grupo tenía ese código. Se prueba con otro
      null;
    end;
  end loop;
  return jsonb_build_object('status', 'rotated', 'inviteCode', v_code);
end;
$$;

-- Quita a un miembro del grupo. Deja de ver el grupo en el acto, como si saliera. Con el código puede
-- volver a entrar, por eso la app sugiere cambiarlo. Quien administra no se quita a sí mismo, para eso
-- está salir del grupo. Devuelve true si estaba dentro
create or replace function public.party_remove_member(p_group uuid, p_member uuid) returns boolean
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := public.party_caller();
begin
  perform public.party_assert_owner(p_group, v_uid);
  if p_member is null or p_member = v_uid then
    raise exception 'Para irte del grupo usa salir del grupo' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('party-group:' || p_group::text, 0));
  update public.memberships set left_at = now()
    where group_id = p_group and user_id = p_member and left_at is null;
  return found;
end;
$$;

-- ===================================================================== Cifras de cada quien
-- Publica el XP de la semana de quien llama en todos sus grupos activos y su aporte a los retos que
-- siguen abiertos. p_progress es un arreglo de hasta 50 {challengeId, amount}. Un reto de un grupo
-- donde no está, que ya terminó hace más de un día o que se borró se ignora. Devuelve cuántas filas
-- cambiaron. La semana tiene que ser un lunes cercano a la semana de estudio del servidor. Un XP de
-- la semana arriba del tope o un aporte más grande que la meta del reto se rechazan con PT004
create or replace function public.party_publish(p_week_start date, p_xp integer, p_progress jsonb)
returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := public.party_caller();
  v_today date := public.study_day();
  v_week date := v_today - (extract(isodow from v_today)::integer - 1);
  v_items jsonb := coalesce(p_progress, '[]'::jsonb);
  v_item jsonb;
  v_amount numeric;
  v_challenge uuid;
  v_group uuid;
  v_target numeric;
  v_rows integer := 0;
  v_changed integer;
begin
  if p_week_start is null or extract(isodow from p_week_start) <> 1
     or p_week_start not between v_week - 7 and v_week + 7 then
    raise exception 'La semana no es válida' using errcode = '22023';
  end if;
  if p_xp is null or p_xp < 0 then
    raise exception 'El XP no es válido' using errcode = '22023';
  end if;
  if p_xp > public.party_limit('weekly_xp') then
    raise exception 'El XP de la semana pasa del tope de %', public.party_limit('weekly_xp')
      using errcode = 'PT004';
  end if;
  if jsonb_typeof(v_items) <> 'array' or jsonb_array_length(v_items) > 50 then
    raise exception 'Se esperaba un arreglo de hasta 50 aportes' using errcode = '22023';
  end if;

  insert into public.party_weekly_xp as w (group_id, user_id, week_start, xp, updated_at)
    select m.group_id, v_uid, p_week_start, p_xp, now()
    from public.memberships m
    where m.user_id = v_uid and m.left_at is null
  on conflict (group_id, user_id, week_start) do update
    set xp = excluded.xp, updated_at = excluded.updated_at
    where w.xp is distinct from excluded.xp;
  get diagnostics v_changed = row_count;
  v_rows := v_rows + v_changed;

  for v_item in select value from jsonb_array_elements(v_items) loop
    -- Un campo que falta da null, y null no pasa
    if not coalesce(
      jsonb_typeof(v_item) = 'object'
      and jsonb_typeof(v_item -> 'challengeId') = 'string'
      and (v_item ->> 'challengeId') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      and jsonb_typeof(v_item -> 'amount') = 'number', false) then
      raise exception 'Aporte inválido' using errcode = '22023';
    end if;
    v_amount := (v_item ->> 'amount')::numeric;
    if not coalesce(v_amount = trunc(v_amount) and v_amount between 0 and 1000000, false) then
      raise exception 'Aporte inválido' using errcode = '22023';
    end if;
    -- Sin fila, las tres variables quedan vacías y el aporte se ignora
    select c.id, c.group_id, c.target into v_challenge, v_group, v_target
      from public.challenges c
      join public.memberships m on m.group_id = c.group_id and m.user_id = v_uid and m.left_at is null
      where c.id = (v_item ->> 'challengeId')::uuid and c.ends_at > now() - interval '1 day'
        and c.deleted_at is null;
    if v_challenge is null then
      continue;
    end if;
    -- Nadie aporta más que la meta de todo el grupo
    if v_amount > v_target then
      raise exception 'El aporte pasa de la meta del reto' using errcode = 'PT004';
    end if;
    insert into public.party_challenge_progress as p (challenge_id, group_id, user_id, amount, updated_at)
      values (v_challenge, v_group, v_uid, v_amount::integer, now())
    on conflict (challenge_id, user_id) do update
      set amount = excluded.amount, updated_at = excluded.updated_at
      where p.amount is distinct from excluded.amount;
    get diagnostics v_changed = row_count;
    v_rows := v_rows + v_changed;
  end loop;
  return v_rows;
end;
$$;

-- ===================================================================== Retos
-- Un reto colectivo de 7 días. metric es cards, questions o xp y target la meta del grupo. Devuelve
-- {status: created, challengeId} o {status: limit} con 10 retos activos en el grupo
create or replace function public.party_create_challenge(
  p_group uuid,
  p_title text,
  p_metric text,
  p_target integer
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := public.party_caller();
  v_title text := btrim(coalesce(p_title, ''));
  v_id uuid;
begin
  if not public.is_group_member(p_group) then
    raise exception 'No eres miembro de ese grupo' using errcode = 'PT002';
  end if;
  if char_length(v_title) not between 1 and 80
     or p_metric is null or p_metric not in ('cards', 'questions', 'xp')
     or p_target is null or p_target not between 1 and 1000000 then
    raise exception 'El reto no es válido' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('party-group:' || p_group::text, 0));
  if (select count(*) from public.challenges
        where group_id = p_group and ends_at > now() and deleted_at is null)
       >= public.party_limit('open_challenges_per_group') then
    return jsonb_build_object('status', 'limit');
  end if;
  insert into public.challenges (group_id, title, metric, target, starts_at, ends_at, created_by)
    values (p_group, v_title, p_metric, p_target, now(), now() + interval '7 days', v_uid)
    returning id into v_id;
  return jsonb_build_object('status', 'created', 'challengeId', v_id);
end;
$$;

-- Borra un reto del grupo. Lo puede borrar quien administra el grupo o quien lo creó, mientras sigan
-- en el grupo. El reto queda marcado y deja de verse con sus aportes. Devuelve true si lo borró y
-- false si ya estaba borrado
create or replace function public.party_delete_challenge(p_challenge uuid) returns boolean
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := public.party_caller();
  v_challenge public.challenges%rowtype;
begin
  select * into v_challenge from public.challenges where id = p_challenge;
  if not found or not public.is_group_member(v_challenge.group_id) then
    raise exception 'No eres miembro de ese grupo' using errcode = 'PT002';
  end if;
  if v_challenge.created_by is distinct from v_uid and not exists (
    select 1 from public.groups where id = v_challenge.group_id and owner_id = v_uid
  ) then
    raise exception 'Solo quien administra el grupo o quien creó el reto puede borrarlo'
      using errcode = 'PT005';
  end if;
  update public.challenges set deleted_at = now(), deleted_by = v_uid
    where id = p_challenge and deleted_at is null;
  return found;
end;
$$;

-- ===================================================================== Duelos
-- Reta a otro miembro del grupo con las preguntas que eligió quien reta, entre 1 y 40 ids distintos
-- del banco. Devuelve {status: created, duelId}, {status: rival_gone} si el rival ya no está en el
-- grupo o {status: limit} con 10 duelos propios esperando al rival
create or replace function public.party_create_duel(
  p_group uuid,
  p_opponent uuid,
  p_question_ids text[]
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := public.party_caller();
  v_id uuid;
begin
  if not public.is_group_member(p_group) then
    raise exception 'No eres miembro de ese grupo' using errcode = 'PT002';
  end if;
  if p_opponent is null or p_opponent = v_uid then
    raise exception 'Elige a otro miembro del grupo' using errcode = '22023';
  end if;
  if p_question_ids is null
     or cardinality(p_question_ids) not between 1 and 40
     or exists (select 1 from unnest(p_question_ids) q where q is null or q !~ '^[0-9A-Za-z-]{1,64}$')
     or (select count(distinct q) from unnest(p_question_ids) q) <> cardinality(p_question_ids) then
    raise exception 'Las preguntas del duelo no son válidas' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.memberships
    where group_id = p_group and user_id = p_opponent and left_at is null
  ) then
    return jsonb_build_object('status', 'rival_gone');
  end if;
  perform pg_advisory_xact_lock(hashtextextended('party:' || v_uid::text, 0));
  if (
    select count(*) from public.party_duels d
    where d.challenger_id = v_uid
      and not exists (
        select 1 from public.party_duel_results r where r.duel_id = d.id and r.user_id = d.opponent_id
      )
      and exists (
        select 1 from public.memberships m
        where m.group_id = d.group_id and m.user_id = d.opponent_id and m.left_at is null
      )
  ) >= public.party_limit('waiting_duels_per_member') then
    return jsonb_build_object('status', 'limit');
  end if;
  insert into public.party_duels (group_id, challenger_id, opponent_id, question_ids)
    values (p_group, v_uid, p_opponent, p_question_ids)
    returning id into v_id;
  return jsonb_build_object('status', 'created', 'duelId', v_id);
end;
$$;

-- Empieza el duelo de quien llama. Queda registrado una sola vez y desde ahí cuenta su intento, aunque
-- no lo termine. Devuelve started la primera vez y already si ya lo había empezado
create or replace function public.party_start_duel(p_duel uuid) returns text
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := public.party_caller();
  v_duel public.party_duels%rowtype;
  v_rows integer;
begin
  select * into v_duel from public.party_duels where id = p_duel;
  if not found or v_uid not in (v_duel.challenger_id, v_duel.opponent_id)
     or not public.is_group_member(v_duel.group_id) then
    raise exception 'No participas en ese duelo' using errcode = 'PT002';
  end if;
  insert into public.party_duel_starts (duel_id, user_id) values (p_duel, v_uid)
    on conflict (duel_id, user_id) do nothing;
  get diagnostics v_rows = row_count;
  return case when v_rows = 1 then 'started' else 'already' end;
end;
$$;

-- Manda el resultado propio de un duelo, una sola vez, después de empezarlo con party_start_duel
-- (PT003 si no). answered son las preguntas del duelo. Pide al menos 3 segundos por acierto (PT004).
-- El piso va por acierto y no por pregunta, porque las que no contestó cuentan como incorrectas sin
-- sumar tiempo. Devuelve saved, o already si ya lo había mandado, sin cambiar el primero
create or replace function public.party_submit_duel_result(
  p_duel uuid,
  p_correct integer,
  p_total_ms integer
) returns text
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := public.party_caller();
  v_duel public.party_duels%rowtype;
  v_answered integer;
  v_rows integer;
begin
  select * into v_duel from public.party_duels where id = p_duel;
  if not found or v_uid not in (v_duel.challenger_id, v_duel.opponent_id)
     or not public.is_group_member(v_duel.group_id) then
    raise exception 'No participas en ese duelo' using errcode = 'PT002';
  end if;
  v_answered := cardinality(v_duel.question_ids);
  if p_correct is null or p_correct not between 0 and v_answered
     or p_total_ms is null or p_total_ms not between 0 and 86400000 then
    raise exception 'El resultado no es válido' using errcode = '22023';
  end if;
  if not exists (select 1 from public.party_duel_starts where duel_id = p_duel and user_id = v_uid) then
    raise exception 'Primero empieza el duelo' using errcode = 'PT003';
  end if;
  if p_total_ms < p_correct * public.party_limit('duel_ms_per_correct') then
    raise exception 'El tiempo no alcanza para tantos aciertos' using errcode = 'PT004';
  end if;
  insert into public.party_duel_results (duel_id, user_id, correct, answered, total_ms)
    values (p_duel, v_uid, p_correct, v_answered, p_total_ms)
    on conflict (duel_id, user_id) do nothing;
  get diagnostics v_rows = row_count;
  return case when v_rows = 1 then 'saved' else 'already' end;
end;
$$;

-- ===================================================================== Lo que ve el alumno
-- Sus grupos activos con sus miembros (alias y XP de la semana p_week_start), sus retos activos o
-- terminados en los últimos 7 días con el total del grupo y su propio aporte, y los duelos donde
-- participa, con la hora en que él lo empezó. Corre con los permisos de quien llama, así lo que
-- devuelve es exactamente lo que las políticas le dejan ver, sin repetir las reglas aquí. Un grupo
-- puede quedar sin quien lo administre (owner_id vacío) y entonces isOwner es false para todos
create or replace function public.party_overview(p_week_start date) returns jsonb
language plpgsql stable set search_path = public, pg_temp as $$
declare
  v_uid uuid := public.party_caller();
  v_groups jsonb;
begin
  if p_week_start is null or extract(isodow from p_week_start) <> 1 then
    raise exception 'La semana no es válida' using errcode = '22023';
  end if;
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', g.id,
      'name', g.name,
      'inviteCode', g.invite_code,
      'isOwner', coalesce(g.owner_id = v_uid, false),
      'joinedAt', mine.joined_at,
      'members', (
        select coalesce(jsonb_agg(
          jsonb_build_object(
            'userId', m.user_id,
            'alias', coalesce(p.alias, 'Alumno'),
            'isSelf', m.user_id = v_uid,
            'weeklyXp', coalesce(w.xp, 0),
            'joinedAt', m.joined_at
          ) order by m.joined_at, m.user_id), '[]'::jsonb)
        from public.memberships m
        left join public.profiles p on p.id = m.user_id
        left join public.party_weekly_xp w
          on w.group_id = m.group_id and w.user_id = m.user_id and w.week_start = p_week_start
        where m.group_id = g.id and m.left_at is null
      ),
      'challenges', (
        select coalesce(jsonb_agg(
          jsonb_build_object(
            'id', c.id,
            'title', c.title,
            'metric', c.metric,
            'target', c.target,
            'startsAt', c.starts_at,
            'endsAt', c.ends_at,
            'createdBySelf', coalesce(c.created_by = v_uid, false),
            'total', coalesce((
              select sum(pr.amount)
              from public.party_challenge_progress pr
              join public.memberships pm
                on pm.group_id = pr.group_id and pm.user_id = pr.user_id and pm.left_at is null
              where pr.challenge_id = c.id
            ), 0),
            'mine', (
              select pr.amount from public.party_challenge_progress pr
              where pr.challenge_id = c.id and pr.user_id = v_uid
            )
          ) order by c.starts_at desc, c.id), '[]'::jsonb)
        from (
          select * from public.challenges
          where group_id = g.id and ends_at > now() - interval '7 days' and deleted_at is null
          order by starts_at desc
          limit 20
        ) c
      ),
      'duels', (
        select coalesce(jsonb_agg(
          jsonb_build_object(
            'id', d.id,
            'challengerId', d.challenger_id,
            'opponentId', d.opponent_id,
            'questionIds', to_jsonb(d.question_ids),
            'createdAt', d.created_at,
            -- Cuándo lo empezó quien llama. Con esto la app ya no ofrece jugarlo otra vez
            'startedAt', (
              select s.started_at from public.party_duel_starts s
              where s.duel_id = d.id and s.user_id = v_uid
            ),
            'mine', (
              select jsonb_build_object(
                'correct', r.correct, 'answered', r.answered, 'totalMs', r.total_ms,
                'finishedAt', r.finished_at)
              from public.party_duel_results r
              where r.duel_id = d.id and r.user_id = v_uid
            ),
            'rival', (
              select jsonb_build_object(
                'correct', r.correct, 'answered', r.answered, 'totalMs', r.total_ms,
                'finishedAt', r.finished_at)
              from public.party_duel_results r
              where r.duel_id = d.id and r.user_id <> v_uid
            )
          ) order by d.created_at desc, d.id), '[]'::jsonb)
        from (
          select * from public.party_duels
          where group_id = g.id
          order by created_at desc
          limit 20
        ) d
      )
    ) order by mine.joined_at, g.id), '[]'::jsonb)
  into v_groups
  from public.memberships mine
  join public.groups g on g.id = mine.group_id
  where mine.user_id = v_uid and mine.left_at is null;

  return jsonb_build_object('weekStart', p_week_start, 'groups', v_groups);
end;
$$;

-- ===================================================================== Exportar mis datos
-- Las filas de Party de quien llama, para Exportar mis datos. Sus membresías, también las de grupos de
-- los que salió, el XP que publicó, sus aportes, los retos que creó y sus duelos con su inicio y su
-- resultado. De los demás no trae nada, ni el id del rival ni su resultado. El nombre del grupo solo va
-- si sigue en él, como en Party. No pide que Party esté abierta, porque ver los datos propios es un
-- derecho del alumno con cualquier plan
create or replace function public.party_export_mine() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := public.party_caller(false);
begin
  return jsonb_build_object(
    'memberships', coalesce((
      select jsonb_agg(jsonb_build_object(
        'groupId', m.group_id,
        'groupName', case when m.left_at is null then g.name end,
        'isOwner', coalesce(g.owner_id = v_uid, false),
        'joinedAt', m.joined_at,
        'leftAt', m.left_at
      ) order by m.joined_at, m.group_id)
      from public.memberships m
      left join public.groups g on g.id = m.group_id
      where m.user_id = v_uid
    ), '[]'::jsonb),
    'weeklyXp', coalesce((
      select jsonb_agg(jsonb_build_object(
        'groupId', w.group_id,
        'weekStart', w.week_start,
        'xp', w.xp,
        'updatedAt', w.updated_at
      ) order by w.week_start, w.group_id)
      from public.party_weekly_xp w
      where w.user_id = v_uid
    ), '[]'::jsonb),
    'challengeContributions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'challengeId', p.challenge_id,
        'groupId', p.group_id,
        'amount', p.amount,
        'updatedAt', p.updated_at
      ) order by p.updated_at, p.challenge_id)
      from public.party_challenge_progress p
      where p.user_id = v_uid
    ), '[]'::jsonb),
    'challengesCreated', coalesce((
      select jsonb_agg(jsonb_build_object(
        'challengeId', c.id,
        'groupId', c.group_id,
        'title', c.title,
        'metric', c.metric,
        'target', c.target,
        'startsAt', c.starts_at,
        'endsAt', c.ends_at,
        'deletedAt', c.deleted_at
      ) order by c.starts_at, c.id)
      from public.challenges c
      where c.created_by = v_uid
    ), '[]'::jsonb),
    'duels', coalesce((
      select jsonb_agg(jsonb_build_object(
        'duelId', d.id,
        'groupId', d.group_id,
        'role', case when d.challenger_id = v_uid then 'challenger' else 'opponent' end,
        'questionCount', cardinality(d.question_ids),
        'createdAt', d.created_at,
        'startedAt', s.started_at,
        'result', case when r.duel_id is null then null else jsonb_build_object(
          'correct', r.correct, 'answered', r.answered, 'totalMs', r.total_ms,
          'finishedAt', r.finished_at) end
      ) order by d.created_at, d.id)
      from public.party_duels d
      left join public.party_duel_starts s on s.duel_id = d.id and s.user_id = v_uid
      left join public.party_duel_results r on r.duel_id = d.id and r.user_id = v_uid
      where v_uid in (d.challenger_id, d.opponent_id)
    ), '[]'::jsonb)
  );
end;
$$;

-- ===================================================================== Permisos de las funciones
-- En Supabase anon recibe permiso de ejecución por defecto, por eso se le quita de forma explícita.
-- Las ayudas internas no las ejecuta nadie por la API. party_open, party_caller y
-- party_has_duel_result sí las ejecuta una sesión, porque las llaman party_overview y las políticas
-- con los permisos de quien consulta. Solo contestan sobre quien llama
revoke all on function public.party_forbid_result_changes() from public, anon, authenticated, service_role;
revoke all on function public.party_limit(text) from public, anon, authenticated, service_role;
revoke all on function public.party_new_invite_code() from public, anon, authenticated, service_role;
revoke all on function public.party_assert_owner(uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function public.party_open() from public, anon, service_role;
grant execute on function public.party_open() to authenticated;
revoke all on function public.party_caller(boolean) from public, anon, service_role;
grant execute on function public.party_caller(boolean) to authenticated;
revoke all on function public.party_has_duel_result(uuid) from public, anon, service_role;
grant execute on function public.party_has_duel_result(uuid) to authenticated;
revoke all on function public.party_create_group(text) from public, anon, service_role;
grant execute on function public.party_create_group(text) to authenticated;
revoke all on function public.party_join_group(text) from public, anon, service_role;
grant execute on function public.party_join_group(text) to authenticated;
revoke all on function public.party_leave_group(uuid) from public, anon, service_role;
grant execute on function public.party_leave_group(uuid) to authenticated;
revoke all on function public.party_leave_all() from public, anon, service_role;
grant execute on function public.party_leave_all() to authenticated;
revoke all on function public.party_publish(date, integer, jsonb) from public, anon, service_role;
grant execute on function public.party_publish(date, integer, jsonb) to authenticated;
revoke all on function public.party_create_challenge(uuid, text, text, integer) from public, anon, service_role;
grant execute on function public.party_create_challenge(uuid, text, text, integer) to authenticated;
revoke all on function public.party_create_duel(uuid, uuid, text[]) from public, anon, service_role;
grant execute on function public.party_create_duel(uuid, uuid, text[]) to authenticated;
revoke all on function public.party_submit_duel_result(uuid, integer, integer) from public, anon, service_role;
grant execute on function public.party_submit_duel_result(uuid, integer, integer) to authenticated;
revoke all on function public.party_start_duel(uuid) from public, anon, service_role;
grant execute on function public.party_start_duel(uuid) to authenticated;
revoke all on function public.party_rotate_code(uuid) from public, anon, service_role;
grant execute on function public.party_rotate_code(uuid) to authenticated;
revoke all on function public.party_remove_member(uuid, uuid) from public, anon, service_role;
grant execute on function public.party_remove_member(uuid, uuid) to authenticated;
revoke all on function public.party_delete_challenge(uuid) from public, anon, service_role;
grant execute on function public.party_delete_challenge(uuid) to authenticated;
revoke all on function public.party_overview(date) from public, anon, service_role;
grant execute on function public.party_overview(date) to authenticated;
revoke all on function public.party_export_mine() from public, anon, service_role;
grant execute on function public.party_export_mine() to authenticated;
