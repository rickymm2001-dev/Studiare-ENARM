-- Pruebas de Party con miembros en Gratis (migración 20261021000002, B8 del plan del cambio, respuesta
-- 20 y 4.3). Los duelos que esperan a un rival sin Party abierta no cuentan para el tope, contra un mismo
-- rival sí hay tope, modera el miembro activo más antiguo con Party abierta mientras quien administra no
-- la tenga, quien está en Gratis sigue contando en el cupo de 50 y las políticas revisan el plan una vez
-- por consulta y no una vez por fila. Corre al final sobre la misma base, con usuarios propios. Cada
-- bloque falla con un error si algo no cumple.
\set ON_ERROR_STOP on
-- Para contar cuántas veces se llama a user_plan en una consulta (PM8)
set track_functions = 'all';

-- ===================================================================== Ayudas de prueba
create or replace function pg_temp.as_user(uid text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', uid, 'role', 'authenticated')::text,
    true
  );
  execute 'set local role authenticated';
end $$;

create or replace function pg_temp.expect(ok boolean, msg text) returns void language plpgsql as $$
begin
  if not coalesce(ok, false) then raise exception 'FALLA %', msg; end if;
end $$;

-- el sqlstate con que falla una sentencia, o null si no falla
create or replace function pg_temp.fails_with(stmt text) returns text language plpgsql as $$
begin
  execute stmt;
  return null;
exception when others then
  return sqlstate;
end $$;

-- El lunes de la semana de estudio de hoy, como lo calcula el navegador
create or replace function pg_temp.week() returns date language sql as $$
  select public.study_day() - (extract(isodow from public.study_day())::integer - 1)
$$;

-- isOwner del grupo en el resumen de quien llama
create or replace function pg_temp.moderates(p_group text) returns boolean language sql as $$
  select (g ->> 'isOwner')::boolean
  from jsonb_array_elements(public.party_overview(pg_temp.week()) -> 'groups') g
  where g ->> 'id' = p_group
$$;

-- Un duelo de una pregunta contra el rival. Devuelve su status
create or replace function pg_temp.duel(p_group text, p_rival text, p_question text) returns text
language sql as $$
  select public.party_create_duel(p_group::uuid, p_rival::uuid, array[p_question]) ->> 'status'
$$;

-- Cuántas veces se llamó a user_plan al correr la sentencia, en esta transacción
create or replace function pg_temp.plan_calls(stmt text) returns bigint language plpgsql as $$
declare
  v_before bigint := coalesce(pg_stat_get_xact_function_calls('public.user_plan(uuid)'::regprocedure), 0);
begin
  execute stmt;
  return coalesce(pg_stat_get_xact_function_calls('public.user_plan(uuid)'::regprocedure), 0) - v_before;
end $$;

-- Plan de pago vigente o vencido, como lo dejaría un aviso de pago
create or replace function pg_temp.pay(uid text) returns void language sql as $$
  insert into public.subscriptions (user_id, plan, status, provider, current_period_end)
    values (uid::uuid, 'monthly', 'active', 'stripe', now() + interval '20 days')
  on conflict (user_id) do update
    set plan = 'monthly', status = 'active', current_period_end = now() + interval '20 days'
$$;
create or replace function pg_temp.expire(uid text) returns void language sql as $$
  update public.subscriptions
    set status = 'canceled', current_period_end = now() - interval '1 day'
    where user_id = uid::uuid
$$;

-- ===================================================================== Usuarios
-- Olga administra Guardia PM. Fede está en Gratis y entró antes que Alma y Beto, que pagan como Olga
insert into auth.users (id, email, raw_user_meta_data) values
  ('b8200000-0000-0000-0000-000000000001', 'olga.pm@x.mx', '{"alias":"Olga"}'),
  ('b8200000-0000-0000-0000-000000000002', 'fede.pm@x.mx', '{"alias":"Fede"}'),
  ('b8200000-0000-0000-0000-000000000003', 'alma.pm@x.mx', '{"alias":"Alma"}'),
  ('b8200000-0000-0000-0000-000000000004', 'beto.pm@x.mx', '{"alias":"Beto"}');
select pg_temp.pay('b8200000-0000-0000-0000-000000000001');
select pg_temp.pay('b8200000-0000-0000-0000-000000000003');
select pg_temp.pay('b8200000-0000-0000-0000-000000000004');
insert into public.groups (id, name, invite_code, owner_id) values
  ('b8200000-0000-0000-0000-0000000000a1', 'Guardia PM', 'PMGRD2', 'b8200000-0000-0000-0000-000000000001');
insert into public.memberships (group_id, user_id, joined_at) values
  ('b8200000-0000-0000-0000-0000000000a1', 'b8200000-0000-0000-0000-000000000001', now() - interval '4 days'),
  ('b8200000-0000-0000-0000-0000000000a1', 'b8200000-0000-0000-0000-000000000002', now() - interval '3 days'),
  ('b8200000-0000-0000-0000-0000000000a1', 'b8200000-0000-0000-0000-000000000003', now() - interval '2 days'),
  ('b8200000-0000-0000-0000-0000000000a1', 'b8200000-0000-0000-0000-000000000004', now() - interval '1 day');

-- ===================================================================== PM1. Permisos de las ayudas
-- Nadie pregunta por la API por el plan de otra persona ni por quién modera un grupo ajeno
do $$
declare
  f text;
begin
  foreach f in array array['public.party_open_for(uuid)', 'public.party_moderator(uuid)',
                           'public.has_paid_plan(uuid)'] loop
    if has_function_privilege('anon', f, 'execute')
       or has_function_privilege('authenticated', f, 'execute')
       or has_function_privilege('service_role', f, 'execute')
       or exists (
         select 1 from pg_proc p
         where p.oid = f::regprocedure
           and (p.proacl is null or exists (select 1 from aclexplode(p.proacl) a where a.grantee = 0))
       ) then
      raise exception 'FALLA PM1. % debe ser una ayuda interna', f;
    end if;
  end loop;
  -- Las que llaman las políticas y party_overview con los permisos de quien consulta
  foreach f in array array['public.party_member_of(uuid)', 'public.party_shares_group(uuid)',
                           'public.party_moderates(uuid)'] loop
    if has_function_privilege('anon', f, 'execute') then
      raise exception 'FALLA PM1. anon puede ejecutar %', f;
    end if;
    if not has_function_privilege('authenticated', f, 'execute') then
      raise exception 'FALLA PM1. Una sesión no puede ejecutar %', f;
    end if;
  end loop;
end $$;
begin;
select pg_temp.as_user('b8200000-0000-0000-0000-000000000003');
select pg_temp.expect(
  pg_temp.fails_with($q$select public.party_moderator('b8200000-0000-0000-0000-0000000000a1')$q$) = '42501'
  and pg_temp.fails_with($q$select public.party_open_for('b8200000-0000-0000-0000-000000000002')$q$) = '42501',
  'PM1. Una sesión preguntó quién modera o el plan de otra persona'
);
rollback;

-- ===================================================================== PM2. Las políticas revisan el plan una vez por consulta
-- El plan va en (select party_open()) y la membresía de cada fila en party_member_of o
-- party_shares_group, sin is_group_member ni shares_group, que revisan el plan en cada fila
do $$
declare
  r record;
  v_found integer := 0;
begin
  for r in
    select policyname, qual from pg_policies
    where schemaname = 'public'
      and policyname in ('groups_select', 'challenges_select', 'memberships_select', 'party_weekly_xp_select',
                         'party_challenge_progress_select', 'party_duels_select', 'profiles_select')
  loop
    v_found := v_found + 1;
    if r.qual !~ 'SELECT (public\.)?party_open\(\)' then
      raise exception 'FALLA PM2. % no revisa el plan una vez por consulta: %', r.policyname, r.qual;
    end if;
    if r.qual ~ '(^|[^_])(is_group_member|shares_group)\(' then
      raise exception 'FALLA PM2. % revisa el plan en cada fila: %', r.policyname, r.qual;
    end if;
    if r.qual !~ 'party_(member_of|shares_group)\(' then
      raise exception 'FALLA PM2. % no revisa la membresía: %', r.policyname, r.qual;
    end if;
  end loop;
  if v_found <> 7 then
    raise exception 'FALLA PM2. Faltan políticas de Party, hay %', v_found;
  end if;
end $$;

-- Las reglas no cambian. Quien está en Gratis solo ve su membresía y su perfil, quien paga ve el grupo
begin;
select pg_temp.as_user('b8200000-0000-0000-0000-000000000002');
select pg_temp.expect(
  (select count(*) from public.groups) = 0
  and (select count(*) from public.memberships) = 1
  and (select count(*) from public.profiles) = 1,
  'PM2. En Gratis se ve algo del grupo además de lo propio'
);
rollback;
begin;
select pg_temp.as_user('b8200000-0000-0000-0000-000000000003');
select pg_temp.expect(
  (select count(*) from public.groups) = 1
  and (select count(*) from public.memberships) = 4
  and (select count(*) from public.profiles where alias in ('Olga', 'Fede', 'Alma', 'Beto')) = 4,
  'PM2. Quien paga no ve su grupo, sus miembros o sus alias'
);
rollback;

-- ===================================================================== PM3. Duelos contra un rival en Gratis
-- Olga reta 10 veces a Fede, que está en Gratis y no puede jugar. Contra él ya no se espera otro, pero
-- esos 10 no le estorban para retar a Alma
begin;
select pg_temp.as_user('b8200000-0000-0000-0000-000000000001');
do $$
begin
  for i in 1..10 loop
    if pg_temp.duel('b8200000-0000-0000-0000-0000000000a1', 'b8200000-0000-0000-0000-000000000002',
                    'PM3-F-' || i) <> 'created' then
      raise exception 'FALLA PM3. Olga no pudo retar a Fede la vez %', i;
    end if;
  end loop;
end $$;
select pg_temp.expect(
  pg_temp.duel('b8200000-0000-0000-0000-0000000000a1', 'b8200000-0000-0000-0000-000000000002', 'PM3-F-11') = 'limit',
  'PM3. Contra un mismo rival en Gratis se crearon duelos sin tope'
);
select pg_temp.expect(
  pg_temp.duel('b8200000-0000-0000-0000-0000000000a1', 'b8200000-0000-0000-0000-000000000003', 'PM3-A-1') = 'created',
  'PM3. Los duelos que esperan a un rival en Gratis contaron para el tope'
);
commit;
-- Fede no los puede jugar mientras siga en Gratis
begin;
select pg_temp.as_user('b8200000-0000-0000-0000-000000000002');
select pg_temp.expect(
  pg_temp.fails_with(format('select public.party_start_duel(%L)',
    (select id from public.party_duels where opponent_id = 'b8200000-0000-0000-0000-000000000002' limit 1))) = 'PT001',
  'PM3. Quien está en Gratis empezó un duelo'
);
rollback;
-- Cuando Fede vuelve a pagar, sus duelos cuentan otra vez para el tope, porque ya los puede jugar
select pg_temp.pay('b8200000-0000-0000-0000-000000000002');
begin;
select pg_temp.as_user('b8200000-0000-0000-0000-000000000001');
select pg_temp.expect(
  pg_temp.duel('b8200000-0000-0000-0000-0000000000a1', 'b8200000-0000-0000-0000-000000000004', 'PM3-B-1') = 'limit',
  'PM3. Con el rival de vuelta en un plan de pago sus duelos no contaron para el tope'
);
rollback;
select pg_temp.expire('b8200000-0000-0000-0000-000000000002');

-- ===================================================================== PM4. Quien administra con plan modera
begin;
select pg_temp.as_user('b8200000-0000-0000-0000-000000000001');
select pg_temp.expect(pg_temp.moderates('b8200000-0000-0000-0000-0000000000a1'), 'PM4. Olga no aparece como quien modera');
rollback;
begin;
select pg_temp.as_user('b8200000-0000-0000-0000-000000000003');
select pg_temp.expect(not pg_temp.moderates('b8200000-0000-0000-0000-0000000000a1'), 'PM4. Alma aparece como quien modera');
select pg_temp.expect(
  pg_temp.fails_with($q$select public.party_rotate_code('b8200000-0000-0000-0000-0000000000a1')$q$) = 'PT005',
  'PM4. Alma cambió el código con Olga al frente'
);
rollback;
-- Beto crea un reto, que después borra quien modere
begin;
select pg_temp.as_user('b8200000-0000-0000-0000-000000000004');
select set_config('pm.challenge', public.party_create_challenge(
  'b8200000-0000-0000-0000-0000000000a1', 'Reto de Beto', 'cards', 50) ->> 'challengeId', false);
commit;

-- ===================================================================== PM5. Quien administra pasa a Gratis
-- Modera Alma, la más antigua con Party abierta. Fede entró antes, pero está en Gratis
select pg_temp.expire('b8200000-0000-0000-0000-000000000001');
begin;
select pg_temp.as_user('b8200000-0000-0000-0000-000000000001');
select pg_temp.expect(
  pg_temp.fails_with($q$select public.party_rotate_code('b8200000-0000-0000-0000-0000000000a1')$q$) = 'PT001',
  'PM5. Olga en Gratis cambió el código'
);
rollback;
begin;
select pg_temp.as_user('b8200000-0000-0000-0000-000000000004');
select pg_temp.expect(not pg_temp.moderates('b8200000-0000-0000-0000-0000000000a1'), 'PM5. Beto aparece como quien modera');
select pg_temp.expect(
  pg_temp.fails_with($q$select public.party_rotate_code('b8200000-0000-0000-0000-0000000000a1')$q$) = 'PT005'
  and pg_temp.fails_with($q$select public.party_remove_member('b8200000-0000-0000-0000-0000000000a1',
    'b8200000-0000-0000-0000-000000000002')$q$) = 'PT005',
  'PM5. Beto moderó sin ser el más antiguo con Party abierta'
);
rollback;
begin;
select pg_temp.as_user('b8200000-0000-0000-0000-000000000003');
select pg_temp.expect(pg_temp.moderates('b8200000-0000-0000-0000-0000000000a1'), 'PM5. Alma no aparece como quien modera');
select pg_temp.expect(
  (public.party_rotate_code('b8200000-0000-0000-0000-0000000000a1') ->> 'status') = 'rotated',
  'PM5. Alma no pudo cambiar el código'
);
select pg_temp.expect(
  public.party_delete_challenge(current_setting('pm.challenge')::uuid),
  'PM5. Alma no pudo borrar el reto de Beto'
);
-- Quien está en Gratis sigue en el grupo hasta que sale o lo quitan
select pg_temp.expect(
  public.party_remove_member('b8200000-0000-0000-0000-0000000000a1', 'b8200000-0000-0000-0000-000000000002'),
  'PM5. Alma no pudo quitar a Fede, que está en Gratis'
);
-- También a quien administra, si está en Gratis. Sigue moderando Alma
select pg_temp.expect(
  public.party_remove_member('b8200000-0000-0000-0000-0000000000a1', 'b8200000-0000-0000-0000-000000000001'),
  'PM5. Alma no pudo quitar a Olga'
);
select set_config('pm.code', (select invite_code from public.groups where id = 'b8200000-0000-0000-0000-0000000000a1'), false);
commit;
select pg_temp.expect(
  (select owner_id from public.groups where id = 'b8200000-0000-0000-0000-0000000000a1') = 'b8200000-0000-0000-0000-000000000001'
  and (select deleted_by from public.challenges where id = current_setting('pm.challenge')::uuid)
    = 'b8200000-0000-0000-0000-000000000003',
  'PM5. Cambió quien administra el grupo o el reto no quedó borrado por Alma'
);

-- ===================================================================== PM6. Quien administra vuelve
-- Con plan de pago pero fuera del grupo, sigue moderando Alma. Al volver a entrar con el código, Olga
select pg_temp.pay('b8200000-0000-0000-0000-000000000001');
begin;
select pg_temp.as_user('b8200000-0000-0000-0000-000000000003');
select pg_temp.expect(pg_temp.moderates('b8200000-0000-0000-0000-0000000000a1'), 'PM6. Alma dejó de moderar antes de que Olga volviera');
rollback;
begin;
select pg_temp.as_user('b8200000-0000-0000-0000-000000000001');
select pg_temp.expect(
  (public.party_join_group(current_setting('pm.code')) ->> 'status') = 'joined',
  'PM6. Olga no pudo volver a entrar'
);
select pg_temp.expect(pg_temp.moderates('b8200000-0000-0000-0000-0000000000a1'), 'PM6. Olga no modera al volver');
commit;
begin;
select pg_temp.as_user('b8200000-0000-0000-0000-000000000003');
select pg_temp.expect(not pg_temp.moderates('b8200000-0000-0000-0000-0000000000a1'), 'PM6. Alma sigue moderando con Olga de vuelta');
select pg_temp.expect(
  pg_temp.fails_with($q$select public.party_rotate_code('b8200000-0000-0000-0000-0000000000a1')$q$) = 'PT005',
  'PM6. Alma cambió el código con Olga de vuelta'
);
rollback;

-- ===================================================================== PM7. Quien está en Gratis cuenta en el cupo de 50
-- Llena PM tiene a Alma y 49 alumnos en Gratis. Beto, que paga, ya no cabe
insert into auth.users (id, email)
  select ('b8210000-0000-0000-0000-' || lpad(i::text, 12, '0'))::uuid, 'gratis' || i || '.pm@x.mx'
  from generate_series(1, 49) i;
insert into public.groups (id, name, invite_code, owner_id) values
  ('b8200000-0000-0000-0000-0000000000a2', 'Llena PM', 'PMLLN2', 'b8200000-0000-0000-0000-000000000003');
insert into public.memberships (group_id, user_id)
  select 'b8200000-0000-0000-0000-0000000000a2'::uuid, ('b8210000-0000-0000-0000-' || lpad(i::text, 12, '0'))::uuid
  from generate_series(1, 49) i
  union all
  select 'b8200000-0000-0000-0000-0000000000a2'::uuid, 'b8200000-0000-0000-0000-000000000003'::uuid;
begin;
select pg_temp.as_user('b8200000-0000-0000-0000-000000000004');
select pg_temp.expect(
  (public.party_join_group('PMLLN2') ->> 'status') = 'full',
  'PM7. Los miembros en Gratis no contaron en el cupo de 50'
);
rollback;

-- ===================================================================== PM8. El plan se revisa una vez por consulta
-- Las veces que el resumen llama a user_plan no crecen con los miembros, sus alias ni su XP. Antes cada
-- fila de cada política lo llamaba. El resumen solo lee, así que las dos transacciones se confirman para
-- conservar las cifras
begin;
select pg_temp.as_user('b8200000-0000-0000-0000-000000000004');
select set_config('pm.small', pg_temp.plan_calls(format('select public.party_overview(%L)', pg_temp.week()))::text, false);
commit;
begin;
select pg_temp.as_user('b8200000-0000-0000-0000-000000000003');
select set_config('pm.big', pg_temp.plan_calls(format('select public.party_overview(%L)', pg_temp.week()))::text, false);
select pg_temp.expect(
  (select jsonb_array_length(g -> 'members')
    from jsonb_array_elements(public.party_overview(pg_temp.week()) -> 'groups') g
    where g ->> 'name' = 'Llena PM') = 50,
  'PM8. El resumen no trae a los 50 miembros de Llena PM'
);
commit;
select pg_temp.expect(
  current_setting('pm.big')::integer <= 2 * current_setting('pm.small')::integer + 2,
  format('PM8. user_plan pasó de %s llamadas con un grupo de 4 a %s con otro de 50 más', current_setting('pm.small'),
    current_setting('pm.big'))
);

-- ===================================================================== PM9. La comprobación de docs/SUPABASE.md
select pg_temp.expect(
  not has_function_privilege('authenticated', 'public.party_moderator(uuid)', 'execute')
  and not has_function_privilege('authenticated', 'public.party_open_for(uuid)', 'execute')
  and has_function_privilege('authenticated', 'public.party_member_of(uuid)', 'execute')
  and position('party_moderator' in pg_get_functiondef('public.party_assert_owner(uuid, uuid)'::regprocedure)) > 0
  and position('party_open_for' in pg_get_functiondef('public.party_create_duel(uuid, uuid, text[])'::regprocedure)) > 0
  and (select qual from pg_policies where schemaname = 'public' and policyname = 'groups_select')
    like '%party_open()%',
  'PM9. La consulta de comprobación de docs/SUPABASE.md no da lo esperado'
);

select 'TODAS LAS PRUEBAS DE PARTY CON MIEMBROS EN GRATIS PASARON' as resultado;
