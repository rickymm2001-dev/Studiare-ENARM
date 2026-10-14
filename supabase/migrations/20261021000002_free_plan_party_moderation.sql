-- Party con miembros en Gratis (B8 del plan del cambio, respuesta 20 y 4.3, ajustes de la revisión
-- independiente). Quien pasa a Gratis sigue en sus grupos hasta que sale o lo quitan, y cuenta en el
-- cupo de 50, pero ya no juega ni modera. Esta migración evita que estorbe a sus compañeros con plan y
-- baja el costo de revisar el plan en las políticas.
--
-- Qué cambia
--   - Duelos. Los que esperan a un rival sin Party abierta ya no cuentan para el tope de 10 duelos
--     propios esperando, porque ese rival no los puede contestar mientras siga en Gratis. Para que eso
--     no sirva para crear duelos sin fin, contra un mismo rival se esperan a lo más 10, tenga o no Party
--     abierta. Retar a quien está en Gratis se puede, y el duelo espera hasta que vuelva a tener plan
--   - Moderación. Modera el grupo quien lo administra (owner_id) mientras siga en él con Party abierta.
--     Si no, modera el miembro activo más antiguo que sí la tenga, hasta que quien administra vuelva.
--     Cambiar el código, quitar miembros y borrar retos ajenos (party_rotate_code, party_remove_member
--     y party_delete_challenge) piden a quien modera, y party_overview lo marca con isOwner, que es lo
--     que lee la app para mostrar esas acciones. owner_id no cambia. Un grupo sin quien lo administre,
--     porque borró su cuenta antes del disparador de supabase/manual/party-dueno-al-borrar-cuenta.sql,
--     sigue sin quien lo modere, como en B7
--   - Las políticas de Party revisan el plan una vez por consulta, con (select public.party_open()), y la
--     membresía de cada fila con party_member_of y party_shares_group, que no miran el plan. Antes cada
--     fila llamaba a user_plan por medio de is_group_member y shares_group, que siguen igual para las
--     funciones de Party y para la foto de perfil de los compañeros
--   - is_group_member y shares_group ya no las ejecuta anon ni public. El asesor de seguridad de Supabase
--     las marcaba como ejecutables sin sesión. 20261014000001 las dejó abiertas a anon porque las
--     políticas las llamaban con el rol de quien consulta, pero después de esta migración solo las llaman
--     challenges_insert y avatars_select, las dos para authenticated, y las funciones de Party, que corren
--     como su dueño. Un anónimo nunca evalúa esas políticas, así que no cambia un resultado vacío por un
--     error. authenticated las conserva porque las políticas sí se las piden
--
-- Lo que se sabe del plan de otra persona
--   Nadie lo lee. Quien modera en lugar de quien administra sabe que este no tiene Party abierta, y quien
--   reta puede notar que un duelo no contó para su tope. Es lo mínimo que piden las dos reglas
--
-- Es idempotente y no lleva sentencias delete ni drop, así se aplica con el conector (docs/SUPABASE.md).
-- Se corre después de 20261021000001_free_plan_locks.sql, que trae has_paid_plan. No edita las
-- migraciones anteriores. Si alguien vuelve a correr 20261008000001, 20261018000001 o 20261021000001,
-- hay que correr esta otra vez después, porque esas traen las versiones anteriores de las políticas y de
-- las funciones de Party. Con esas versiones Party sigue cerrada en Gratis, solo que más lenta

-- ===================================================================== Party abierta para otro alumno
-- La regla de party_open, pero para otro alumno, como el rival de un duelo o un miembro del grupo. Ayuda
-- interna. Nadie la ejecuta por la API, así nadie pregunta por el plan de otra persona
create or replace function public.party_open_for(p_user uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select public.has_paid_plan(p_user)
$$;

-- ===================================================================== Membresía sin el plan
-- Las políticas revisan el plan una sola vez por consulta con (select public.party_open()) y la
-- membresía de cada fila con estas dos, que no lo miran. Como is_group_member y shares_group, contestan
-- solo si quien llama está en el grupo o comparte uno activo con esa persona. Las ejecutan las sesiones,
-- porque las políticas las llaman con los permisos de quien consulta
create or replace function public.party_member_of(p_group uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.memberships
    where group_id = p_group and user_id = auth.uid() and left_at is null
  )
$$;

create or replace function public.party_shares_group(p_other uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.memberships mine
    join public.memberships theirs on theirs.group_id = mine.group_id
    where mine.user_id = auth.uid() and theirs.user_id = p_other
      and mine.left_at is null and theirs.left_at is null
  )
$$;

-- Las de siempre, con el plan, para las funciones de Party y la foto de perfil. La membresía sale de
-- las dos de arriba, así la consulta vive en un solo lugar
create or replace function public.is_group_member(target_group uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select public.party_open() and public.party_member_of(target_group)
$$;

create or replace function public.shares_group(other uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select public.party_open() and public.party_shares_group(other)
$$;

-- ===================================================================== Políticas
-- Las mismas reglas de 20261018000001 y 20261008000001, con el plan revisado una vez por consulta. Cada
-- una sigue pidiendo el dispositivo activo
alter policy groups_select on public.groups
  using (
    (select public.party_open()) and public.party_member_of(id) and (select public.is_active_device())
  );

-- Un reto borrado deja de verse
alter policy challenges_select on public.challenges
  using (
    (select public.party_open()) and public.party_member_of(group_id) and deleted_at is null
    and (select public.is_active_device())
  );

-- Las membresías propias se ven con cualquier plan, así quien pasa a Gratis sabe en qué grupos sigue y
-- puede salir. Las de los compañeros, solo con Party abierta
alter policy memberships_select on public.memberships
  using (
    (
      user_id = (select auth.uid())
      or ((select public.party_open()) and public.party_member_of(group_id))
    )
    and (select public.is_active_device())
  );

-- El XP de quien ya salió del grupo deja de verse
alter policy party_weekly_xp_select on public.party_weekly_xp
  using (
    (select public.party_open()) and public.party_member_of(group_id)
    and exists (
      select 1 from public.memberships m
      where m.group_id = party_weekly_xp.group_id and m.user_id = party_weekly_xp.user_id
        and m.left_at is null
    )
    and (select public.is_active_device())
  );

-- Como el XP, el aporte de quien ya salió del grupo deja de verse. El de un reto borrado también
alter policy party_challenge_progress_select on public.party_challenge_progress
  using (
    (select public.party_open()) and public.party_member_of(group_id)
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

-- Un duelo lo ven sus dos participantes mientras sigan en el grupo. Los inicios y los resultados
-- consultan esta tabla en sus políticas, así que heredan la regla
alter policy party_duels_select on public.party_duels
  using (
    (challenger_id = (select auth.uid()) or opponent_id = (select auth.uid()))
    and (select public.party_open()) and public.party_member_of(group_id)
    and (select public.is_active_device())
  );

-- El perfil propio se ve siempre. El alias de los compañeros, solo con Party abierta
alter policy profiles_select on public.profiles
  using (
    id = (select auth.uid())
    or (
      (select public.party_open()) and public.party_shares_group(id) and (select public.is_active_device())
    )
    or (select public.is_admin())
  );

-- ===================================================================== Quién modera un grupo
-- Quien administra el grupo (owner_id) mientras siga en él con Party abierta. Si no, el miembro activo
-- más antiguo que sí la tenga, hasta que quien administra vuelva. null si nadie puede o si el grupo no
-- tiene quien lo administre (B7). El plan de cada miembro se revisa en orden de antigüedad y solo hasta
-- encontrar a quien modere. Ayuda interna
create or replace function public.party_moderator(p_group uuid) returns uuid
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_owner uuid;
  v_member uuid;
begin
  select owner_id into v_owner from public.groups where id = p_group;
  if v_owner is null then
    return null;
  end if;
  if exists (
    select 1 from public.memberships
    where group_id = p_group and user_id = v_owner and left_at is null
  ) and public.party_open_for(v_owner) then
    return v_owner;
  end if;
  for v_member in
    select m.user_id from public.memberships m
    where m.group_id = p_group and m.left_at is null and m.user_id <> v_owner
    order by m.joined_at, m.user_id
  loop
    if public.party_open_for(v_member) then
      return v_member;
    end if;
  end loop;
  return null;
end;
$$;

-- Si quien llama modera el grupo. Contesta solo sobre quien llama. La usa party_overview, que corre con
-- los permisos de quien consulta, para marcar isOwner
create or replace function public.party_moderates(p_group uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select auth.uid() is not null and public.party_moderator(p_group) is not distinct from auth.uid()
$$;

-- Si quien llama modera el grupo y sigue en él. La piden party_rotate_code y party_remove_member. El
-- nombre viene de B7, cuando solo moderaba quien administra el grupo
create or replace function public.party_assert_owner(p_group uuid, p_uid uuid) returns void
language plpgsql stable set search_path = public, pg_temp as $$
begin
  if not public.is_group_member(p_group) then
    raise exception 'No eres miembro de ese grupo' using errcode = 'PT002';
  end if;
  if public.party_moderator(p_group) is distinct from p_uid then
    raise exception 'Solo quien administra el grupo puede hacer esto' using errcode = 'PT005';
  end if;
end;
$$;

-- Borra un reto del grupo. Lo puede borrar quien modera el grupo o quien lo creó, mientras sigan en el
-- grupo. El reto queda marcado y deja de verse con sus aportes. Devuelve true si lo borró y false si ya
-- estaba borrado
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
  if v_challenge.created_by is distinct from v_uid
     and public.party_moderator(v_challenge.group_id) is distinct from v_uid then
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
-- grupo o {status: limit} con 10 duelos propios esperando a rivales que los pueden jugar, o con 10
-- esperando a ese mismo rival
create or replace function public.party_create_duel(
  p_group uuid,
  p_opponent uuid,
  p_question_ids text[]
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := public.party_caller();
  v_id uuid;
  v_same_rival bigint;
  v_can_play bigint;
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
  -- Los duelos propios que esperan al rival, que sigue en el grupo y no ha mandado su resultado, por
  -- rival. El plan de cada rival se revisa una vez
  with waiting as (
    select d.opponent_id, count(*) as duels
    from public.party_duels d
    where d.challenger_id = v_uid
      and not exists (
        select 1 from public.party_duel_results r where r.duel_id = d.id and r.user_id = d.opponent_id
      )
      and exists (
        select 1 from public.memberships m
        where m.group_id = d.group_id and m.user_id = d.opponent_id and m.left_at is null
      )
    group by d.opponent_id
  )
  select
    coalesce(sum(duels) filter (where opponent_id = p_opponent), 0),
    coalesce(sum(duels) filter (where public.party_open_for(opponent_id)), 0)
  into v_same_rival, v_can_play
  from waiting;
  -- El tope cuenta solo a los rivales con Party abierta, que son los que pueden jugar. Contra un mismo
  -- rival, tenga o no Party abierta, también hay tope, así nadie crea duelos sin fin contra quien está
  -- en Gratis
  if v_can_play >= public.party_limit('waiting_duels_per_member')
     or v_same_rival >= public.party_limit('waiting_duels_per_member') then
    return jsonb_build_object('status', 'limit');
  end if;
  insert into public.party_duels (group_id, challenger_id, opponent_id, question_ids)
    values (p_group, v_uid, p_opponent, p_question_ids)
    returning id into v_id;
  return jsonb_build_object('status', 'created', 'duelId', v_id);
end;
$$;

-- ===================================================================== Lo que ve el alumno
-- Igual que en 20261018000001, salvo isOwner, que ahora dice si quien llama modera el grupo
-- (party_moderates). Sus grupos activos con sus miembros (alias y XP de la semana p_week_start), sus
-- retos activos o terminados en los últimos 7 días con el total del grupo y su propio aporte, y los
-- duelos donde participa, con la hora en que él lo empezó. Corre con los permisos de quien llama, así lo
-- que devuelve es exactamente lo que las políticas le dejan ver, sin repetir las reglas aquí
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
      'isOwner', public.party_moderates(g.id),
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

-- ===================================================================== Permisos de las funciones
-- party_open_for y party_moderator son ayudas internas y no las ejecuta nadie por la API, así nadie
-- pregunta por el plan de otra persona ni por quién modera un grupo ajeno. party_member_of,
-- party_shares_group y party_moderates las ejecutan las sesiones, porque las llaman las políticas y
-- party_overview con los permisos de quien consulta, y solo contestan sobre quien llama. Las demás,
-- como en 20261018000001
revoke all on function public.party_open_for(uuid) from public, anon, authenticated, service_role;
revoke all on function public.party_moderator(uuid) from public, anon, authenticated, service_role;
revoke all on function public.party_assert_owner(uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function public.party_member_of(uuid) from public, anon, service_role;
grant execute on function public.party_member_of(uuid) to authenticated;
revoke all on function public.party_shares_group(uuid) from public, anon, service_role;
grant execute on function public.party_shares_group(uuid) to authenticated;
revoke all on function public.party_moderates(uuid) from public, anon, service_role;
grant execute on function public.party_moderates(uuid) to authenticated;
revoke all on function public.party_delete_challenge(uuid) from public, anon, service_role;
grant execute on function public.party_delete_challenge(uuid) to authenticated;
revoke all on function public.party_create_duel(uuid, uuid, text[]) from public, anon, service_role;
grant execute on function public.party_create_duel(uuid, uuid, text[]) to authenticated;
revoke all on function public.party_overview(date) from public, anon, service_role;
grant execute on function public.party_overview(date) to authenticated;
-- Las dos de siempre se cierran a anon y a public. Las sesiones las conservan porque challenges_insert y
-- avatars_select las llaman con los permisos de quien consulta
revoke execute on function public.is_group_member(uuid) from public, anon;
grant execute on function public.is_group_member(uuid) to authenticated;
revoke execute on function public.shares_group(uuid) from public, anon;
grant execute on function public.shares_group(uuid) to authenticated;
