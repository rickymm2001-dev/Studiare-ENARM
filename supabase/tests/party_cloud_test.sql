-- Pruebas de Party en la nube (migración 20261018000001, B7 del plan del cambio). Corre al final sobre la
-- misma base, con usuarios propios. Cada bloque falla con un error si algo no cumple.
\set ON_ERROR_STOP on

-- ===================================================================== Ayudas de prueba
create or replace function pg_temp.as_user(uid text, sid text default null) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config(
    'request.jwt.claims',
    (jsonb_build_object('sub', uid, 'role', 'authenticated')
      || case when sid is null then '{}'::jsonb else jsonb_build_object('session_id', sid) end)::text,
    true
  );
  execute 'set local role authenticated';
end $$;

create or replace function pg_temp.as_anon() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  execute 'set local role anon';
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

create or replace function pg_temp.overview() returns jsonb language sql as $$
  select public.party_overview(pg_temp.week())
$$;

-- 20 ids de preguntas con forma de ULID
create or replace function pg_temp.questions(n integer default 20) returns text[] language sql as $$
  select array(select '01J' || lpad(i::text, 23, '0') from generate_series(1, n) i)
$$;

-- La semana se calcula antes de entrar como anon, que no puede llamar a study_day
select set_config('party.week', pg_temp.week()::text, false);

-- ===================================================================== Usuarios
-- Ana crea el grupo, Bruno entra con el código, Carla nunca entra, Diego prueba los topes y Elena
-- los códigos fallidos
insert into auth.users (id, email, raw_user_meta_data) values
  ('c7000000-0000-0000-0000-0000000000a1', 'ana.party@x.mx', '{"alias":"Ana"}'),
  ('c7000000-0000-0000-0000-0000000000b1', 'bruno.party@x.mx', '{"alias":"Bruno"}'),
  ('c7000000-0000-0000-0000-0000000000c1', 'carla.party@x.mx', '{"alias":"Carla"}'),
  ('c7000000-0000-0000-0000-0000000000d1', 'diego.party@x.mx', '{"alias":"Diego"}'),
  ('c7000000-0000-0000-0000-0000000000e1', 'elena.party@x.mx', '{"alias":"Elena"}');

-- ===================================================================== PC1. Crear un grupo
begin;
select pg_temp.as_user('c7000000-0000-0000-0000-0000000000a1');
select pg_temp.expect(
  pg_temp.fails_with($q$select public.party_create_group('   ')$q$) = '22023',
  'PC1. Un grupo sin nombre se creó'
);
select set_config('party.created', public.party_create_group('  Guardia de los jueves  ')::text, false);
commit;
select set_config('party.group', current_setting('party.created')::jsonb ->> 'groupId', false);
select set_config('party.code', current_setting('party.created')::jsonb ->> 'inviteCode', false);
select pg_temp.expect(
  (current_setting('party.created')::jsonb ->> 'status') = 'created',
  'PC1. No se creó el grupo'
);
select pg_temp.expect(
  current_setting('party.code') ~ '^[ABCDEFGHJKMNPQRSTUVWXYZ2-9]{6}$',
  'PC1. El código debe tener 6 caracteres sin 0, O, 1, I ni L'
);
select pg_temp.expect(
  (select name from public.groups where id = current_setting('party.group')::uuid) = 'Guardia de los jueves',
  'PC1. El nombre no se guardó recortado'
);
select pg_temp.expect(
  (select count(*) from public.memberships
    where group_id = current_setting('party.group')::uuid
      and user_id = 'c7000000-0000-0000-0000-0000000000a1' and left_at is null) = 1,
  'PC1. Quien crea el grupo no quedó dentro'
);

-- ===================================================================== PC2. La API solo escribe con funciones
begin;
select pg_temp.as_user('c7000000-0000-0000-0000-0000000000c1');
select pg_temp.expect(
  pg_temp.fails_with($q$insert into public.groups (name, invite_code, owner_id) values ('x', 'XYZ234', auth.uid())$q$) = '42501',
  'PC2. Se insertó un grupo sin la función'
);
select pg_temp.expect(
  pg_temp.fails_with(format(
    'insert into public.memberships (group_id, user_id) values (%L, auth.uid())', current_setting('party.group'))) = '42501',
  'PC2. Se entró a un grupo sin su código, con solo conocer su id'
);
select pg_temp.expect(
  pg_temp.fails_with(format(
    'update public.memberships set group_id = %L where user_id = auth.uid()', current_setting('party.group'))) = '42501',
  'PC2. Se movió una membresía a otro grupo'
);
select pg_temp.expect(
  pg_temp.fails_with(format(
    'insert into public.challenges (group_id, title, metric, target, starts_at, ends_at) values (%L, %L, %L, 1, now(), now())',
    current_setting('party.group'), 'x', 'cards')) = '42501',
  'PC2. Se insertó un reto sin la función'
);
select pg_temp.expect(
  pg_temp.fails_with(format(
    'insert into public.party_weekly_xp (group_id, user_id, week_start, xp) values (%L, %L, %L, 9999)',
    current_setting('party.group'), 'c7000000-0000-0000-0000-0000000000a1', pg_temp.week())) = '42501',
  'PC2. Se publicó XP a nombre de otra persona'
);
select pg_temp.expect(
  pg_temp.fails_with(format(
    'insert into public.party_duels (group_id, challenger_id, opponent_id, question_ids) values (%L, auth.uid(), %L, %L)',
    current_setting('party.group'), 'c7000000-0000-0000-0000-0000000000a1', '{Q1}')) = '42501',
  'PC2. Se insertó un duelo sin la función'
);
select pg_temp.expect(
  pg_temp.fails_with($q$delete from public.memberships$q$) = '42501',
  'PC2. Se borró una membresía directo'
);
rollback;

-- ===================================================================== PC3. Entrar con el código
begin;
select pg_temp.as_user('c7000000-0000-0000-0000-0000000000b1');
select pg_temp.expect((public.party_join_group('abc') ->> 'status') = 'invalid', 'PC3. Un código mal formado no se rechazó');
select pg_temp.expect((public.party_join_group('ZQZQ22') ->> 'status') = 'not_found', 'PC3. Un código que no existe no se rechazó');
select pg_temp.expect((select count(*) from public.groups) = 0, 'PC3. Un código malo dejó ver un grupo');
select pg_temp.expect((select count(*) from public.memberships) = 0, 'PC3. Un código malo dejó una membresía');
select pg_temp.expect(
  (public.party_join_group(' ' || lower(current_setting('party.code')) || ' ') ->> 'status') = 'joined',
  'PC3. No entró con el código en minúsculas y con espacios'
);
select pg_temp.expect(
  (public.party_join_group(current_setting('party.code')) ->> 'status') = 'already',
  'PC3. Entrar dos veces no avisó que ya estaba'
);
commit;
select pg_temp.expect(
  (select count(*) from public.memberships where group_id = current_setting('party.group')::uuid and left_at is null) = 2,
  'PC3. El grupo no quedó con dos miembros'
);

-- ===================================================================== PC4. Solo los miembros ven su grupo
begin;
select pg_temp.as_user('c7000000-0000-0000-0000-0000000000b1');
select pg_temp.expect((select count(*) from public.groups) = 1, 'PC4. Un miembro no ve su grupo');
select pg_temp.expect((select count(*) from public.memberships) = 2, 'PC4. Un miembro no ve a los miembros');
select pg_temp.expect(
  (select count(*) from public.profiles where alias in ('Ana', 'Bruno')) = 2,
  'PC4. Un miembro no ve el alias de su compañera'
);
select pg_temp.expect(jsonb_array_length(pg_temp.overview() -> 'groups') = 1, 'PC4. El resumen no trae el grupo');
select pg_temp.expect(
  (select string_agg(m ->> 'alias', ',' order by m ->> 'alias')
    from jsonb_array_elements(pg_temp.overview() -> 'groups' -> 0 -> 'members') m) = 'Ana,Bruno',
  'PC4. El resumen no trae a los dos miembros con su alias'
);
select pg_temp.expect(
  (select (m ->> 'isSelf')::boolean from jsonb_array_elements(pg_temp.overview() -> 'groups' -> 0 -> 'members') m
    where m ->> 'alias' = 'Bruno'),
  'PC4. El resumen no marca quién es quien llama'
);
rollback;

-- Quien no está en el grupo no ve nada
begin;
select pg_temp.as_user('c7000000-0000-0000-0000-0000000000c1');
select pg_temp.expect(
  (select count(*) from public.groups) + (select count(*) from public.memberships)
    + (select count(*) from public.challenges) + (select count(*) from public.party_weekly_xp)
    + (select count(*) from public.party_challenge_progress) + (select count(*) from public.party_duels)
    + (select count(*) from public.party_duel_results) = 0,
  'PC4. Alguien de fuera ve filas de Party'
);
select pg_temp.expect((select count(*) from public.profiles) = 1, 'PC4. Alguien de fuera ve perfiles ajenos');
select pg_temp.expect(pg_temp.overview() -> 'groups' = '[]'::jsonb, 'PC4. El resumen de alguien de fuera trae grupos');
rollback;

-- Sin sesión no se ve ni se llama nada
begin;
select pg_temp.as_anon();
select pg_temp.expect(pg_temp.fails_with('select count(*) from public.groups') = '42501', 'PC4. anon lee grupos');
select pg_temp.expect(pg_temp.fails_with('select count(*) from public.memberships') = '42501', 'PC4. anon lee membresías');
select pg_temp.expect(pg_temp.fails_with('select count(*) from public.challenges') = '42501', 'PC4. anon lee retos');
select pg_temp.expect(pg_temp.fails_with('select count(*) from public.party_weekly_xp') = '42501', 'PC4. anon lee el XP');
select pg_temp.expect(pg_temp.fails_with('select count(*) from public.party_duels') = '42501', 'PC4. anon lee duelos');
select pg_temp.expect(pg_temp.fails_with('select count(*) from public.party_duel_results') = '42501', 'PC4. anon lee resultados');
select pg_temp.expect((select count(*) from public.profiles) = 0, 'PC4. anon lee perfiles');
select pg_temp.expect(
  pg_temp.fails_with(format('select public.party_overview(%L)', current_setting('party.week'))) = '42501',
  'PC4. anon llamó al resumen'
);
select pg_temp.expect(
  pg_temp.fails_with(format('select public.party_join_group(%L)', current_setting('party.code'))) = '42501',
  'PC4. anon entró a un grupo'
);
rollback;

-- ===================================================================== PC5. Nadie lee el correo de otro alumno
begin;
select pg_temp.as_user('c7000000-0000-0000-0000-0000000000b1');
select pg_temp.expect((select count(*) from public.private_accounts) = 1, 'PC5. Un miembro ve cuentas ajenas');
select pg_temp.expect(
  (select count(*) from public.private_accounts where user_id = 'c7000000-0000-0000-0000-0000000000a1') = 0,
  'PC5. Un miembro lee la cuenta de su compañera'
);
select pg_temp.expect(pg_temp.fails_with('select email from auth.users') = '42501', 'PC5. Un alumno lee auth.users');
select pg_temp.expect(position('@' in pg_temp.overview()::text) = 0, 'PC5. El resumen trae un correo');
rollback;
begin;
select pg_temp.as_user('c7000000-0000-0000-0000-0000000000c1');
select pg_temp.expect(
  (select count(*) from public.private_accounts where user_id <> auth.uid()) = 0,
  'PC5. Alguien de fuera lee cuentas ajenas'
);
rollback;

-- ===================================================================== PC6. Cada quien publica solo su XP
begin;
select pg_temp.as_user('c7000000-0000-0000-0000-0000000000a1');
select pg_temp.expect(public.party_publish(pg_temp.week(), 120, '[]') = 1, 'PC6. Ana no publicó su XP');
select pg_temp.expect(public.party_publish(pg_temp.week(), 120, '[]') = 0, 'PC6. Publicar lo mismo cambió filas');
select pg_temp.expect(
  pg_temp.fails_with(format('select public.party_publish(%L, 1, %L)', pg_temp.week() + 1, '[]')) = '22023',
  'PC6. Se aceptó una semana que no empieza en lunes'
);
select pg_temp.expect(
  pg_temp.fails_with(format('select public.party_publish(%L, 1, %L)', pg_temp.week() - 28, '[]')) = '22023',
  'PC6. Se aceptó una semana lejana'
);
select pg_temp.expect(
  pg_temp.fails_with(format('select public.party_publish(%L, -5, %L)', pg_temp.week(), '[]')) = '22023',
  'PC6. Se aceptó un XP negativo'
);
select pg_temp.expect(
  pg_temp.fails_with(format('select public.party_overview(%L)', pg_temp.week() + 2)) = '22023',
  'PC6. El resumen aceptó una semana que no empieza en lunes'
);
commit;
begin;
select pg_temp.as_user('c7000000-0000-0000-0000-0000000000b1');
select public.party_publish(pg_temp.week(), 45, '[]');
select pg_temp.expect(
  pg_temp.fails_with($q$update public.party_weekly_xp set xp = 9999$q$) = '42501',
  'PC6. Un miembro cambió el XP publicado'
);
select pg_temp.expect(
  (select (m ->> 'weeklyXp')::integer from jsonb_array_elements(pg_temp.overview() -> 'groups' -> 0 -> 'members') m
    where m ->> 'alias' = 'Ana') = 120,
  'PC6. Bruno no ve el XP de Ana'
);
commit;
select pg_temp.expect(
  (select xp from public.party_weekly_xp where user_id = 'c7000000-0000-0000-0000-0000000000a1') = 120
  and (select xp from public.party_weekly_xp where user_id = 'c7000000-0000-0000-0000-0000000000b1') = 45,
  'PC6. Cada quien no quedó con su propio XP'
);
begin;
select pg_temp.as_user('c7000000-0000-0000-0000-0000000000c1');
select pg_temp.expect(public.party_publish(pg_temp.week(), 300, '[]') = 0, 'PC6. Alguien sin grupo publicó XP');
rollback;

-- ===================================================================== PC7. Retos del grupo
begin;
select pg_temp.as_user('c7000000-0000-0000-0000-0000000000a1');
select set_config(
  'party.challenge',
  public.party_create_challenge(current_setting('party.group')::uuid, ' Mil tarjetas ', 'cards', 1000) ->> 'challengeId',
  false
);
select pg_temp.expect(
  pg_temp.fails_with(format('select public.party_create_challenge(%L, %L, %L, 10)', current_setting('party.group'), 'x', 'accuracy')) = '22023',
  'PC7. Se creó un reto con una métrica que no existe'
);
select pg_temp.expect(
  pg_temp.fails_with(format('select public.party_create_challenge(%L, %L, %L, 0)', current_setting('party.group'), 'x', 'cards')) = '22023',
  'PC7. Se creó un reto con meta cero'
);
select pg_temp.expect(
  pg_temp.fails_with(format('select public.party_publish(%L, 1, %L)', pg_temp.week(), '[{"challengeId":"x","amount":1}]')) = '22023',
  'PC7. Se aceptó un aporte con un reto mal formado'
);
select pg_temp.expect(
  pg_temp.fails_with(format('select public.party_publish(%L, 1, %L)', pg_temp.week(), '[{"amount":1}]')) = '22023',
  'PC7. Se aceptó un aporte sin reto'
);
select pg_temp.expect(
  pg_temp.fails_with(format('select public.party_publish(%L, 1, %L)', pg_temp.week(),
    jsonb_build_array(jsonb_build_object('challengeId', current_setting('party.challenge'), 'amount', 1.5)))) = '22023',
  'PC7. Se aceptó un aporte con decimales'
);
commit;
select pg_temp.expect(
  (select title from public.challenges where id = current_setting('party.challenge')::uuid) = 'Mil tarjetas'
  and (select created_by from public.challenges where id = current_setting('party.challenge')::uuid)
      = 'c7000000-0000-0000-0000-0000000000a1',
  'PC7. El reto no quedó con su título recortado y su autora'
);
begin;
select pg_temp.as_user('c7000000-0000-0000-0000-0000000000b1');
select pg_temp.expect(
  public.party_publish(pg_temp.week(), 45,
    jsonb_build_array(jsonb_build_object('challengeId', current_setting('party.challenge'), 'amount', 30))) = 1,
  'PC7. Bruno no publicó su aporte'
);
commit;
begin;
select pg_temp.as_user('c7000000-0000-0000-0000-0000000000a1');
select public.party_publish(pg_temp.week(), 120,
  jsonb_build_array(jsonb_build_object('challengeId', current_setting('party.challenge'), 'amount', 50)));
select pg_temp.expect(
  (pg_temp.overview() -> 'groups' -> 0 -> 'challenges' -> 0 ->> 'total')::integer = 80
  and (pg_temp.overview() -> 'groups' -> 0 -> 'challenges' -> 0 ->> 'mine')::integer = 50,
  'PC7. El reto no suma los aportes del grupo o no dice el propio'
);
commit;
-- Alguien de fuera no crea retos en el grupo ni aporta a ellos
begin;
select pg_temp.as_user('c7000000-0000-0000-0000-0000000000c1');
select pg_temp.expect(
  pg_temp.fails_with(format('select public.party_create_challenge(%L, %L, %L, 10)', current_setting('party.group'), 'x', 'cards')) = 'PT002',
  'PC7. Alguien de fuera creó un reto en el grupo'
);
select pg_temp.expect(
  public.party_publish(pg_temp.week(), 0,
    jsonb_build_array(jsonb_build_object('challengeId', current_setting('party.challenge'), 'amount', 999))) = 0,
  'PC7. Alguien de fuera aportó a un reto del grupo'
);
commit;
select pg_temp.expect(
  (select count(*) from public.party_challenge_progress where user_id = 'c7000000-0000-0000-0000-0000000000c1') = 0,
  'PC7. Quedó un aporte de alguien de fuera'
);

-- ===================================================================== PC8. Duelos
begin;
select pg_temp.as_user('c7000000-0000-0000-0000-0000000000a1');
select set_config(
  'party.duel',
  public.party_create_duel(current_setting('party.group')::uuid, 'c7000000-0000-0000-0000-0000000000b1', pg_temp.questions()) ->> 'duelId',
  false
);
select pg_temp.expect(
  pg_temp.fails_with(format('select public.party_create_duel(%L, auth.uid(), %L)', current_setting('party.group'), pg_temp.questions())) = '22023',
  'PC8. Alguien se retó a sí mismo'
);
select pg_temp.expect(
  (public.party_create_duel(current_setting('party.group')::uuid, 'c7000000-0000-0000-0000-0000000000c1', pg_temp.questions()) ->> 'status') = 'rival_gone',
  'PC8. Se retó a alguien que no está en el grupo'
);
select pg_temp.expect(
  pg_temp.fails_with(format('select public.party_create_duel(%L, %L, %L)', current_setting('party.group'),
    'c7000000-0000-0000-0000-0000000000b1', '{Q1,Q1}')) = '22023',
  'PC8. Se aceptó un duelo con preguntas repetidas'
);
select pg_temp.expect(
  pg_temp.fails_with(format('select public.party_create_duel(%L, %L, %L)', current_setting('party.group'),
    'c7000000-0000-0000-0000-0000000000b1', pg_temp.questions(41))) = '22023',
  'PC8. Se aceptó un duelo de 41 preguntas'
);
commit;

-- Alguien de fuera no ve el duelo ni manda resultado
begin;
select pg_temp.as_user('c7000000-0000-0000-0000-0000000000c1');
select pg_temp.expect((select count(*) from public.party_duels) = 0, 'PC8. Alguien de fuera ve el duelo');
select pg_temp.expect(
  pg_temp.fails_with(format('select public.party_submit_duel_result(%L, 20, 1000)', current_setting('party.duel'))) = 'PT002',
  'PC8. Alguien de fuera mandó un resultado'
);
rollback;

-- Ana manda su resultado una sola vez
begin;
select pg_temp.as_user('c7000000-0000-0000-0000-0000000000a1');
select pg_temp.expect(
  public.party_submit_duel_result(current_setting('party.duel')::uuid, 14, 600000) = 'saved',
  'PC8. Ana no pudo mandar su resultado'
);
select pg_temp.expect(
  public.party_submit_duel_result(current_setting('party.duel')::uuid, 20, 1000) = 'already',
  'PC8. Un segundo resultado no avisó que ya estaba'
);
select pg_temp.expect(
  pg_temp.fails_with(format('select public.party_submit_duel_result(%L, 21, 1000)', current_setting('party.duel'))) = '22023',
  'PC8. Se aceptaron más aciertos que preguntas'
);
select pg_temp.expect(
  pg_temp.fails_with($q$update public.party_duel_results set correct = 20$q$) = '42501',
  'PC8. Se editó un resultado'
);
select pg_temp.expect(
  (select correct from public.party_duel_results where user_id = auth.uid()) = 14,
  'PC8. El primer resultado cambió'
);
commit;

-- Antes de jugar, Bruno ve el duelo pero no el resultado de Ana
begin;
select pg_temp.as_user('c7000000-0000-0000-0000-0000000000b1');
select pg_temp.expect((select count(*) from public.party_duels) = 1, 'PC8. El rival no ve el duelo');
select pg_temp.expect((select count(*) from public.party_duel_results) = 0, 'PC8. El rival ve el resultado antes de jugar');
select pg_temp.expect(
  (pg_temp.overview() -> 'groups' -> 0 -> 'duels' -> 0 -> 'rival') = 'null'::jsonb
  and jsonb_array_length(pg_temp.overview() -> 'groups' -> 0 -> 'duels' -> 0 -> 'questionIds') = 20,
  'PC8. El resumen del rival trae el resultado de Ana o no trae las 20 preguntas'
);
select pg_temp.expect(
  public.party_submit_duel_result(current_setting('party.duel')::uuid, 12, 500000) = 'saved',
  'PC8. Bruno no pudo mandar su resultado'
);
commit;

-- Con los dos resultados, los dos ven la comparación
begin;
select pg_temp.as_user('c7000000-0000-0000-0000-0000000000b1');
select pg_temp.expect(
  (pg_temp.overview() -> 'groups' -> 0 -> 'duels' -> 0 -> 'mine' ->> 'correct')::integer = 12
  and (pg_temp.overview() -> 'groups' -> 0 -> 'duels' -> 0 -> 'rival' ->> 'correct')::integer = 14
  and (pg_temp.overview() -> 'groups' -> 0 -> 'duels' -> 0 -> 'rival' ->> 'totalMs')::integer = 600000,
  'PC8. Bruno no ve los dos resultados'
);
rollback;
begin;
select pg_temp.as_user('c7000000-0000-0000-0000-0000000000a1');
select pg_temp.expect(
  (pg_temp.overview() -> 'groups' -> 0 -> 'duels' -> 0 -> 'rival' ->> 'correct')::integer = 12,
  'PC8. Ana no ve el resultado de Bruno'
);
rollback;
-- Ni el dueño de la base edita un resultado
select pg_temp.expect(
  pg_temp.fails_with($q$update public.party_duel_results set correct = 0$q$) = '42501',
  'PC8. Se editó un resultado fuera de la API'
);

-- ===================================================================== PC9. Topes
-- Grupo lleno, con 50 miembros
insert into auth.users (id, email, raw_user_meta_data)
  select ('c7100000-0000-0000-0000-' || lpad(to_hex(n), 12, '0'))::uuid, 'lleno' || n || '@x.mx', '{"alias":"Lleno"}'
  from generate_series(1, 50) n;
insert into public.groups (id, name, invite_code, owner_id)
  values ('c7100000-0000-0000-0000-0000000000ff', 'Grupo lleno', 'LLENO2', 'c7100000-0000-0000-0000-000000000001');
insert into public.memberships (group_id, user_id)
  select 'c7100000-0000-0000-0000-0000000000ff', ('c7100000-0000-0000-0000-' || lpad(to_hex(n), 12, '0'))::uuid
  from generate_series(1, 50) n;
begin;
select pg_temp.as_user('c7000000-0000-0000-0000-0000000000c1');
select pg_temp.expect((public.party_join_group('LLENO2') ->> 'status') = 'full', 'PC9. Se entró a un grupo lleno');
rollback;

-- Hasta 10 grupos activos por alumno
begin;
insert into public.groups (id, name, invite_code, owner_id)
  select ('c7200000-0000-0000-0000-' || lpad(to_hex(n), 12, '0'))::uuid, 'Grupo ' || n, 'TM' || lpad(n::text, 4, '0'),
         'c7000000-0000-0000-0000-0000000000a1'
  from generate_series(1, 10) n;
insert into public.memberships (group_id, user_id)
  select ('c7200000-0000-0000-0000-' || lpad(to_hex(n), 12, '0'))::uuid, 'c7000000-0000-0000-0000-0000000000d1'
  from generate_series(1, 10) n;
select pg_temp.as_user('c7000000-0000-0000-0000-0000000000d1');
select pg_temp.expect((public.party_create_group('Uno más') ->> 'status') = 'too_many', 'PC9. Se creó un grupo número 11');
select pg_temp.expect(
  (public.party_join_group(current_setting('party.code')) ->> 'status') = 'too_many',
  'PC9. Se entró a un grupo número 11'
);
rollback;

-- Hasta 5 grupos nuevos por día
begin;
select pg_temp.as_user('c7000000-0000-0000-0000-0000000000d1');
do $$ begin
  for i in 1..5 loop
    perform pg_temp.expect((public.party_create_group('Grupo ' || i) ->> 'status') = 'created', 'PC9. No se creó un grupo del día');
  end loop;
end $$;
select pg_temp.expect((public.party_create_group('Sexto') ->> 'status') = 'limit', 'PC9. Se creó un sexto grupo en el día');
rollback;

-- Hasta 10 retos activos por grupo y 10 duelos propios esperando al rival
begin;
select pg_temp.as_user('c7000000-0000-0000-0000-0000000000a1');
do $$ begin
  for i in 1..9 loop
    perform pg_temp.expect(
      (public.party_create_challenge(current_setting('party.group')::uuid, 'Reto ' || i, 'xp', 100) ->> 'status') = 'created',
      'PC9. No se creó un reto');
  end loop;
  for i in 1..10 loop
    perform pg_temp.expect(
      (public.party_create_duel(current_setting('party.group')::uuid, 'c7000000-0000-0000-0000-0000000000b1', pg_temp.questions()) ->> 'status') = 'created',
      'PC9. No se creó un duelo');
  end loop;
end $$;
select pg_temp.expect(
  (public.party_create_challenge(current_setting('party.group')::uuid, 'Once', 'xp', 100) ->> 'status') = 'limit',
  'PC9. Se creó un reto número 11'
);
select pg_temp.expect(
  (public.party_create_duel(current_setting('party.group')::uuid, 'c7000000-0000-0000-0000-0000000000b1', pg_temp.questions()) ->> 'status') = 'limit',
  'PC9. Se creó un duelo número 11 esperando al rival'
);
rollback;

-- ===================================================================== PC10. Códigos fallidos por hora
begin;
select pg_temp.as_user('c7000000-0000-0000-0000-0000000000e1');
do $$ begin
  for i in 1..10 loop
    perform pg_temp.expect(
      (public.party_join_group('ZQZQ' || lpad(i::text, 2, '0')) ->> 'status') = 'not_found',
      'PC10. Un código que no existe no se rechazó');
  end loop;
end $$;
select pg_temp.expect(
  (public.party_join_group(current_setting('party.code')) ->> 'status') = 'rate_limited',
  'PC10. Después de 10 códigos fallidos se siguió revisando el código'
);
select pg_temp.expect(
  pg_temp.fails_with('select count(*) from public.party_join_attempts') = '42501',
  'PC10. Un alumno lee los intentos fallidos'
);
commit;
select pg_temp.expect(
  (select count(*) from public.party_join_attempts where user_id = 'c7000000-0000-0000-0000-0000000000e1') = 10
  and (select count(*) from public.memberships where user_id = 'c7000000-0000-0000-0000-0000000000e1') = 0,
  'PC10. Los intentos no quedaron registrados o Elena entró al grupo'
);

-- ===================================================================== PC11. Salir quita el acceso
begin;
select pg_temp.as_user('c7000000-0000-0000-0000-0000000000b1');
select pg_temp.expect(public.party_leave_group(current_setting('party.group')::uuid), 'PC11. Bruno no pudo salir');
select pg_temp.expect(not public.party_leave_group(current_setting('party.group')::uuid), 'PC11. Salir dos veces dijo que salió');
commit;
begin;
select pg_temp.as_user('c7000000-0000-0000-0000-0000000000b1');
select pg_temp.expect(
  (select count(*) from public.groups) + (select count(*) from public.challenges)
    + (select count(*) from public.party_weekly_xp) + (select count(*) from public.party_challenge_progress)
    + (select count(*) from public.party_duels) + (select count(*) from public.party_duel_results) = 0,
  'PC11. Quien salió sigue viendo filas del grupo'
);
select pg_temp.expect(
  (select count(*) from public.memberships where user_id <> auth.uid()) = 0,
  'PC11. Quien salió sigue viendo a los miembros'
);
select pg_temp.expect((select count(*) from public.profiles) = 1, 'PC11. Quien salió sigue viendo el alias de su excompañera');
select pg_temp.expect(pg_temp.overview() -> 'groups' = '[]'::jsonb, 'PC11. El resumen de quien salió trae el grupo');
select pg_temp.expect(
  pg_temp.fails_with(format('select public.party_create_challenge(%L, %L, %L, 10)', current_setting('party.group'), 'x', 'cards')) = 'PT002',
  'PC11. Quien salió creó un reto'
);
rollback;
begin;
select pg_temp.as_user('c7000000-0000-0000-0000-0000000000a1');
select pg_temp.expect(
  jsonb_array_length(pg_temp.overview() -> 'groups' -> 0 -> 'members') = 1
  and (pg_temp.overview() -> 'groups' -> 0 -> 'challenges' -> 0 ->> 'total')::integer = 50,
  'PC11. El grupo sigue contando a quien salió'
);
select pg_temp.expect(
  (select count(*) from public.party_weekly_xp where user_id = 'c7000000-0000-0000-0000-0000000000b1') = 0,
  'PC11. Se sigue viendo el XP de quien salió'
);
select pg_temp.expect((select count(*) from public.profiles) = 1, 'PC11. Ana sigue viendo el alias de quien salió');
rollback;

-- Quien creó el grupo también pierde el acceso al salir
begin;
select pg_temp.as_user('c7000000-0000-0000-0000-0000000000a1');
select pg_temp.expect(public.party_leave_all() = 1, 'PC11. Ana no salió de su grupo');
select pg_temp.expect((select count(*) from public.groups) = 0, 'PC11. Quien creó el grupo lo sigue viendo al salir');
rollback;

-- Con el mismo código se vuelve a entrar
begin;
select pg_temp.as_user('c7000000-0000-0000-0000-0000000000b1');
select pg_temp.expect(
  (public.party_join_group(current_setting('party.code')) ->> 'status') = 'joined',
  'PC11. No se pudo volver a entrar con el código'
);
commit;
begin;
select pg_temp.as_user('c7000000-0000-0000-0000-0000000000b1');
select pg_temp.expect((select count(*) from public.groups) = 1, 'PC11. Quien volvió no ve el grupo');
rollback;

-- ===================================================================== PC12. Dispositivo desplazado
begin;
select pg_temp.as_user('c7000000-0000-0000-0000-0000000000b1', 'b-ses-1');
select public.claim_device('b-dev-1', 'Chrome en Windows');
commit;
begin;
select pg_temp.as_user('c7000000-0000-0000-0000-0000000000b1', 'b-ses-2');
select public.claim_device('b-dev-2', 'Safari en iOS');
commit;
begin;
select pg_temp.as_user('c7000000-0000-0000-0000-0000000000b1', 'b-ses-1');
select pg_temp.expect(
  (select count(*) from public.groups) + (select count(*) from public.party_duels)
    + (select count(*) from public.party_weekly_xp) = 0,
  'PC12. El dispositivo desplazado ve filas del grupo'
);
select pg_temp.expect(
  pg_temp.fails_with(format('select public.party_overview(%L)', pg_temp.week())) = '42501',
  'PC12. El dispositivo desplazado leyó el resumen'
);
select pg_temp.expect(
  pg_temp.fails_with(format('select public.party_publish(%L, 1, %L)', pg_temp.week(), '[]')) = '42501',
  'PC12. El dispositivo desplazado publicó XP'
);
select pg_temp.expect(
  pg_temp.fails_with(format('select public.party_leave_group(%L)', current_setting('party.group'))) = '42501',
  'PC12. El dispositivo desplazado salió del grupo'
);
rollback;
begin;
select pg_temp.as_user('c7000000-0000-0000-0000-0000000000b1', 'b-ses-2');
select pg_temp.expect(jsonb_array_length(pg_temp.overview() -> 'groups') = 1, 'PC12. El dispositivo activo no ve su grupo');
rollback;

-- ===================================================================== PC13. Permisos de funciones y tablas
do $$
declare
  f text;
begin
  foreach f in array array[
    'public.party_create_group(text)', 'public.party_join_group(text)', 'public.party_leave_group(uuid)',
    'public.party_leave_all()', 'public.party_publish(date, integer, jsonb)',
    'public.party_create_challenge(uuid, text, text, integer)', 'public.party_create_duel(uuid, uuid, text[])',
    'public.party_submit_duel_result(uuid, integer, integer)', 'public.party_overview(date)',
    'public.party_open()', 'public.party_caller(boolean)', 'public.party_has_duel_result(uuid)'] loop
    if has_function_privilege('anon', f, 'execute') then
      raise exception 'FALLA PC13. anon puede ejecutar %', f;
    end if;
    if not has_function_privilege('authenticated', f, 'execute') then
      raise exception 'FALLA PC13. Una sesión no puede ejecutar %', f;
    end if;
  end loop;
  foreach f in array array[
    'public.party_limit(text)', 'public.party_new_invite_code()', 'public.party_forbid_result_changes()'] loop
    if has_function_privilege('anon', f, 'execute') or has_function_privilege('authenticated', f, 'execute')
       or has_function_privilege('service_role', f, 'execute') then
      raise exception 'FALLA PC13. La ayuda interna % se puede ejecutar por la API', f;
    end if;
  end loop;
  foreach f in array array['public.groups', 'public.memberships', 'public.challenges',
    'public.party_weekly_xp', 'public.party_challenge_progress', 'public.party_duels', 'public.party_duel_results'] loop
    if has_table_privilege('authenticated', f, 'insert,update,delete,truncate') then
      raise exception 'FALLA PC13. Una sesión puede escribir directo en %', f;
    end if;
    if not has_table_privilege('authenticated', f, 'select') then
      raise exception 'FALLA PC13. Una sesión no puede leer %', f;
    end if;
    if has_table_privilege('anon', f, 'select,insert,update,delete') then
      raise exception 'FALLA PC13. anon tiene permisos sobre %', f;
    end if;
    if not (select relrowsecurity from pg_class where oid = f::regclass) then
      raise exception 'FALLA PC13. % no tiene permisos por fila', f;
    end if;
  end loop;
  if has_table_privilege('authenticated', 'public.party_join_attempts', 'select,insert,update,delete')
     or has_table_privilege('anon', 'public.party_join_attempts', 'select,insert,update,delete') then
    raise exception 'FALLA PC13. La API tiene permisos sobre party_join_attempts';
  end if;
end $$;

-- ===================================================================== PC14. Borrar mis datos se lleva lo de Party
begin;
select pg_temp.as_user('c7000000-0000-0000-0000-0000000000b1', 'b-ses-2');
select public.party_publish(pg_temp.week(), 45,
  jsonb_build_array(jsonb_build_object('challengeId', current_setting('party.challenge'), 'amount', 30)));
select public.delete_my_data();
commit;
select pg_temp.expect(
  (select count(*) from public.memberships where user_id = 'c7000000-0000-0000-0000-0000000000b1')
    + (select count(*) from public.party_weekly_xp where user_id = 'c7000000-0000-0000-0000-0000000000b1')
    + (select count(*) from public.party_challenge_progress where user_id = 'c7000000-0000-0000-0000-0000000000b1')
    + (select count(*) from public.party_duels
        where 'c7000000-0000-0000-0000-0000000000b1' in (challenger_id, opponent_id))
    + (select count(*) from public.party_duel_results where user_id = 'c7000000-0000-0000-0000-0000000000b1') = 0,
  'PC14. Borrar mis datos dejó filas de Party'
);
select pg_temp.expect(
  (select count(*) from public.memberships
    where user_id = 'c7000000-0000-0000-0000-0000000000a1' and left_at is null) = 1
  and (select count(*) from public.party_weekly_xp where user_id = 'c7000000-0000-0000-0000-0000000000a1') = 1,
  'PC14. Borrar los datos de Bruno tocó lo de Ana'
);

select 'TODAS LAS PRUEBAS DE PARTY EN LA NUBE PASARON' as resultado;
