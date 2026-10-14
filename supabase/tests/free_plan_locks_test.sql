-- Pruebas del plan Gratis en el servidor (migración 20261021000001, B8 del plan del cambio, respuesta
-- 20, 4.3 y 4.25). Party y los apuntes de la nube se cierran según el plan de quien llama, con un
-- alumno Gratis, uno de pago, uno con un mes regalado por referido, otros con el plan cancelado o con
-- un cobro fallido que sigue vigente, otros con el plan o el mes ya vencidos y alguien sin sesión. Los
-- referidos, salir de un grupo, exportar lo propio y borrar mis datos siguen abiertos en Gratis. Corre
-- al final sobre la misma base, con usuarios propios. Cada bloque falla con un error si algo no cumple.
\set ON_ERROR_STOP on

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

-- Un apunte como lo sube el navegador. Con borrado, la marca va también dentro de data
create or replace function pg_temp.outline(
  p_id text, p_title text, p_updated timestamptz, p_deleted timestamptz default null
) returns jsonb language sql as $$
  select jsonb_build_object(
    'kind', 'outline',
    'id', p_id,
    'updatedAt', p_updated,
    'deletedAt', p_deleted,
    'data', jsonb_build_object('id', p_id, 'ownerId', '$self', 'title', p_title, 'nodes', '[]'::jsonb,
      'updatedAt', p_updated)
      || case when p_deleted is null then '{}'::jsonb else jsonb_build_object('deletedAt', p_deleted) end
  )
$$;

-- Un mazo propio, que se sincroniza en cualquier plan
create or replace function pg_temp.deck(p_id text, p_updated timestamptz) returns jsonb language sql as $$
  select jsonb_build_object(
    'kind', 'deck', 'id', p_id, 'updatedAt', p_updated, 'deletedAt', null,
    'data', jsonb_build_object('id', p_id, 'ownerId', '$self', 'name', 'Mi mazo', 'updatedAt', p_updated)
  )
$$;

-- ===================================================================== Usuarios
-- G Gratis, P de pago, R con un mes regalado por referido, C con el plan cancelado y D con un cobro
-- fallido que siguen dentro del periodo pagado, V con el plan vencido y M con el mes regalado vencido
insert into auth.users (id, email, raw_user_meta_data) values
  ('b8000000-0000-0000-0000-000000000001', 'g.b8@x.mx', '{"alias":"Gratis"}'),
  ('b8000000-0000-0000-0000-000000000002', 'p.b8@x.mx', '{"alias":"Paga"}'),
  ('b8000000-0000-0000-0000-000000000003', 'r.b8@x.mx', '{"alias":"Regalo"}'),
  ('b8000000-0000-0000-0000-000000000004', 'c.b8@x.mx', '{"alias":"Cancela"}'),
  ('b8000000-0000-0000-0000-000000000005', 'd.b8@x.mx', '{"alias":"Debe"}'),
  ('b8000000-0000-0000-0000-000000000006', 'v.b8@x.mx', '{"alias":"Vencido"}'),
  ('b8000000-0000-0000-0000-000000000007', 'm.b8@x.mx', '{"alias":"Mes vencido"}');
-- Como las dejaría un aviso de pago ya aplicado o un referido ya concretado
insert into public.subscriptions (user_id, plan, status, provider, current_period_end) values
  ('b8000000-0000-0000-0000-000000000002', 'monthly', 'active', 'stripe', now() + interval '20 days'),
  ('b8000000-0000-0000-0000-000000000004', 'annual', 'canceled', 'stripe', now() + interval '20 days'),
  ('b8000000-0000-0000-0000-000000000005', 'founder', 'past_due', 'stripe', now() + interval '2 days'),
  ('b8000000-0000-0000-0000-000000000006', 'monthly', 'canceled', 'stripe', now() - interval '1 day');
insert into public.subscription_grants (user_id, kind, starts_at, ends_at) values
  ('b8000000-0000-0000-0000-000000000003', 'referral', now() - interval '1 day', now() + interval '29 days'),
  ('b8000000-0000-0000-0000-000000000007', 'referral', now() - interval '31 days', now() - interval '1 day');

-- ===================================================================== FL1. Qué cuenta como plan de pago
-- party_open usa la misma regla que my_plan. Un plan vigente o un mes regalado abre Party, aunque el
-- plan esté cancelado o con un cobro fallido mientras no termine su periodo
do $$
declare
  r record;
begin
  for r in
    select * from (values
      ('b8000000-0000-0000-0000-000000000001', false, 'free', 'Gratis'),
      ('b8000000-0000-0000-0000-000000000002', true, 'monthly', 'de pago'),
      ('b8000000-0000-0000-0000-000000000003', true, 'monthly', 'con mes regalado'),
      ('b8000000-0000-0000-0000-000000000004', true, 'annual', 'cancelado y vigente'),
      ('b8000000-0000-0000-0000-000000000005', true, 'founder', 'con cobro fallido y vigente'),
      ('b8000000-0000-0000-0000-000000000006', false, 'free', 'vencido'),
      ('b8000000-0000-0000-0000-000000000007', false, 'free', 'con el mes regalado vencido')
    ) as v(uid, open, plan, who)
  loop
    perform pg_temp.as_user(r.uid);
    if public.party_open() is distinct from r.open then
      raise exception 'FALLA FL1. party_open de alguien % no es %', r.who, r.open;
    end if;
    if (public.my_plan() ->> 'plan') <> r.plan then
      raise exception 'FALLA FL1. my_plan de alguien % no es %', r.who, r.plan;
    end if;
    reset role;
  end loop;
end $$;

begin;
select pg_temp.as_anon();
select pg_temp.expect(pg_temp.fails_with('select public.party_open()') = '42501', 'FL1. anon llamó party_open');
rollback;

-- ===================================================================== FL2. La regla del plan es interna
-- Nadie la ejecuta por la API, ni la de quien llama ni la de otro alumno
do $$
declare
  f text;
begin
  foreach f in array array['public.caller_has_paid_plan()', 'public.has_paid_plan(uuid)'] loop
    if has_function_privilege('anon', f, 'execute')
       or has_function_privilege('authenticated', f, 'execute')
       or has_function_privilege('service_role', f, 'execute')
       or exists (
         select 1 from pg_proc p
         where p.oid = f::regprocedure
           and (p.proacl is null or exists (select 1 from aclexplode(p.proacl) a where a.grantee = 0))
       ) then
      raise exception 'FALLA FL2. % debe ser una ayuda interna', f;
    end if;
  end loop;
end $$;
begin;
select pg_temp.as_user('b8000000-0000-0000-0000-000000000002');
select pg_temp.expect(
  pg_temp.fails_with('select public.caller_has_paid_plan()') = '42501'
  and pg_temp.fails_with($q$select public.has_paid_plan('b8000000-0000-0000-0000-000000000001')$q$) = '42501',
  'FL2. Una sesión llamó a una ayuda interna del plan'
);
rollback;

-- ===================================================================== FL3. Quien paga crea el grupo y el mes regalado también entra
begin;
select pg_temp.as_user('b8000000-0000-0000-0000-000000000002');
select set_config('fl.created', public.party_create_group('Guardia B8')::text, false);
commit;
select set_config('fl.group', current_setting('fl.created')::jsonb ->> 'groupId', false);
select set_config('fl.code', current_setting('fl.created')::jsonb ->> 'inviteCode', false);
select pg_temp.expect(
  (current_setting('fl.created')::jsonb ->> 'status') = 'created',
  'FL3. Quien paga no pudo crear un grupo'
);
begin;
select pg_temp.as_user('b8000000-0000-0000-0000-000000000003');
select pg_temp.expect(
  (public.party_join_group(current_setting('fl.code')) ->> 'status') = 'joined',
  'FL3. Quien tiene un mes regalado no pudo entrar con el código'
);
select pg_temp.expect((select count(*) from public.groups) = 1, 'FL3. Quien tiene un mes regalado no ve el grupo');
select pg_temp.expect(
  (select count(*) from public.profiles where alias in ('Paga', 'Regalo')) = 2,
  'FL3. Quien tiene un mes regalado no ve el alias de su compañera'
);
select pg_temp.expect(public.party_publish(pg_temp.week(), 40, '[]') = 1, 'FL3. Quien tiene un mes regalado no publicó su XP');
commit;
begin;
select pg_temp.as_user('b8000000-0000-0000-0000-000000000002');
select set_config(
  'fl.challenge',
  public.party_create_challenge(current_setting('fl.group')::uuid, 'Cien tarjetas', 'cards', 100) ->> 'challengeId',
  false
);
select set_config(
  'fl.duel',
  public.party_create_duel(
    current_setting('fl.group')::uuid, 'b8000000-0000-0000-0000-000000000003',
    array['01J00000000000000000000001', '01J00000000000000000000002']
  ) ->> 'duelId',
  false
);
commit;
select pg_temp.expect(
  current_setting('fl.challenge') <> '' and current_setting('fl.duel') <> '',
  'FL3. Quien paga no pudo crear el reto o el duelo'
);

-- ===================================================================== FL4. Gratis no usa ninguna función de Party
-- Cada función de Party contesta PT001 antes de tocar nada, salvo salir y exportar lo propio
begin;
select pg_temp.as_user('b8000000-0000-0000-0000-000000000001');
do $$
declare
  stmt text;
begin
  foreach stmt in array array[
    'select public.party_create_group(''Grupo de Gratis'')',
    format('select public.party_join_group(%L)', current_setting('fl.code')),
    format('select public.party_overview(%L)', pg_temp.week()),
    format('select public.party_publish(%L, 10, %L)', pg_temp.week(), '[]'),
    format('select public.party_create_challenge(%L, %L, %L, 10)', current_setting('fl.group'), 'x', 'cards'),
    format('select public.party_delete_challenge(%L)', current_setting('fl.challenge')),
    format('select public.party_create_duel(%L, %L, %L)', current_setting('fl.group'),
      'b8000000-0000-0000-0000-000000000002', '{01J00000000000000000000009}'),
    format('select public.party_start_duel(%L)', current_setting('fl.duel')),
    format('select public.party_submit_duel_result(%L, 1, 60000)', current_setting('fl.duel')),
    format('select public.party_rotate_code(%L)', current_setting('fl.group')),
    format('select public.party_remove_member(%L, %L)', current_setting('fl.group'),
      'b8000000-0000-0000-0000-000000000003')
  ] loop
    if pg_temp.fails_with(stmt) is distinct from 'PT001' then
      raise exception 'FALLA FL4. En Gratis no contestó PT001: %', stmt;
    end if;
  end loop;
end $$;
commit;
-- Nada quedó a su nombre, ni un intento fallido de código
select pg_temp.expect(
  (select count(*) from public.groups where owner_id = 'b8000000-0000-0000-0000-000000000001')
    + (select count(*) from public.memberships where user_id = 'b8000000-0000-0000-0000-000000000001')
    + (select count(*) from public.party_join_attempts where user_id = 'b8000000-0000-0000-0000-000000000001') = 0,
  'FL4. Gratis dejó filas de Party'
);
select pg_temp.expect(
  (select invite_code from public.groups where id = current_setting('fl.group')::uuid) = current_setting('fl.code')
  and (select deleted_at from public.challenges where id = current_setting('fl.challenge')::uuid) is null,
  'FL4. Gratis cambió el código o borró el reto'
);

-- El plan vencido y el mes regalado vencido son Gratis
begin;
select pg_temp.as_user('b8000000-0000-0000-0000-000000000006');
select pg_temp.expect(
  pg_temp.fails_with(format('select public.party_join_group(%L)', current_setting('fl.code'))) = 'PT001',
  'FL4. Con el plan vencido se entró a un grupo'
);
rollback;
begin;
select pg_temp.as_user('b8000000-0000-0000-0000-000000000007');
select pg_temp.expect(
  pg_temp.fails_with('select public.party_create_group(''Mes vencido'')') = 'PT001',
  'FL4. Con el mes regalado vencido se creó un grupo'
);
rollback;

-- ===================================================================== FL5. Quien pasa a Gratis no ve su grupo
-- G estaba en el grupo de cuando pagaba. Su membresía sigue, pero las políticas ya no le enseñan nada
insert into public.memberships (group_id, user_id)
  values (current_setting('fl.group')::uuid, 'b8000000-0000-0000-0000-000000000001');
insert into public.party_weekly_xp (group_id, user_id, week_start, xp)
  values (current_setting('fl.group')::uuid, 'b8000000-0000-0000-0000-000000000001', pg_temp.week(), 25);
begin;
select pg_temp.as_user('b8000000-0000-0000-0000-000000000001');
select pg_temp.expect(
  (select count(*) from public.groups) + (select count(*) from public.challenges)
    + (select count(*) from public.party_weekly_xp) + (select count(*) from public.party_challenge_progress)
    + (select count(*) from public.party_duels) + (select count(*) from public.party_duel_results) = 0,
  'FL5. En Gratis se ven filas del grupo'
);
select pg_temp.expect(
  (select count(*) from public.memberships where user_id <> auth.uid()) = 0,
  'FL5. En Gratis se ven los demás miembros'
);
select pg_temp.expect((select count(*) from public.memberships) = 1, 'FL5. En Gratis no se ve la membresía propia');
select pg_temp.expect((select count(*) from public.profiles) = 1, 'FL5. En Gratis se ven perfiles de compañeros');
rollback;
-- Sus compañeros con plan lo siguen viendo con su alias y su última cifra hasta que sale
begin;
select pg_temp.as_user('b8000000-0000-0000-0000-000000000002');
select pg_temp.expect(
  (select count(*) from jsonb_array_elements(public.party_overview(pg_temp.week()) -> 'groups' -> 0 -> 'members') m
    where m ->> 'alias' = 'Gratis' and (m ->> 'weeklyXp')::integer = 25) = 1,
  'FL5. Quien paga dejó de ver a su compañero que pasó a Gratis'
);
rollback;

-- ===================================================================== FL6. En Gratis se sale y se exporta lo propio
begin;
select pg_temp.as_user('b8000000-0000-0000-0000-000000000001');
select pg_temp.expect(
  jsonb_array_length(public.party_export_mine() -> 'memberships') = 1
  and (public.party_export_mine() -> 'memberships' -> 0 ->> 'groupId') = current_setting('fl.group')
  and (public.party_export_mine() -> 'weeklyXp' -> 0 ->> 'xp')::integer = 25,
  'FL6. En Gratis no se exportó lo propio de Party'
);
select pg_temp.expect(
  public.party_leave_group(current_setting('fl.group')::uuid),
  'FL6. En Gratis no se pudo salir del grupo'
);
select pg_temp.expect(public.party_leave_all() = 0, 'FL6. Salir de todos dijo que seguía en otro grupo');
commit;
begin;
select pg_temp.as_user('b8000000-0000-0000-0000-000000000002');
select pg_temp.expect(
  (select count(*) from jsonb_array_elements(public.party_overview(pg_temp.week()) -> 'groups' -> 0 -> 'members') m
    where m ->> 'alias' = 'Gratis') = 0,
  'FL6. Quien salió en Gratis sigue en la tabla del grupo'
);
rollback;

-- ===================================================================== FL7. El mes regalado cierra Party al terminar
update public.subscription_grants set ends_at = now() - interval '1 minute'
  where user_id = 'b8000000-0000-0000-0000-000000000003';
begin;
select pg_temp.as_user('b8000000-0000-0000-0000-000000000003');
select pg_temp.expect(not public.party_open(), 'FL7. Con el mes regalado terminado Party sigue abierta');
select pg_temp.expect((select count(*) from public.groups) = 0, 'FL7. Con el mes regalado terminado se ve el grupo');
select pg_temp.expect(
  pg_temp.fails_with(format('select public.party_overview(%L)', pg_temp.week())) = 'PT001',
  'FL7. Con el mes regalado terminado se leyó el resumen'
);
rollback;
update public.subscription_grants set ends_at = now() + interval '29 days'
  where user_id = 'b8000000-0000-0000-0000-000000000003';

-- ===================================================================== FL8. Los referidos siguen abiertos en Gratis (4.3)
begin;
select pg_temp.as_user('b8000000-0000-0000-0000-000000000002');
select set_config('fl.pcode', public.my_referral_code(), false);
commit;
begin;
select pg_temp.as_user('b8000000-0000-0000-0000-000000000001');
select pg_temp.expect(public.my_referral_code() ~ '^[A-Z0-9]{8}$', 'FL8. En Gratis no se obtuvo el código propio');
select pg_temp.expect(
  (public.my_referrals() ->> 'pending')::integer = 0 and not (public.my_referrals() ->> 'referredBy')::boolean,
  'FL8. En Gratis no se leyó el resumen de referidos'
);
select pg_temp.expect(
  public.redeem_referral_code(current_setting('fl.pcode')) = 'ok',
  'FL8. En Gratis no se pudo canjear el código de quien invitó'
);
commit;
select pg_temp.expect(
  exists (
    select 1 from public.referrals
    where referrer_id = 'b8000000-0000-0000-0000-000000000002'
      and referred_id = 'b8000000-0000-0000-0000-000000000001' and status = 'pending'
  ),
  'FL8. El referido de Gratis no quedó pendiente'
);

-- ===================================================================== FL9. Apuntes en la nube con un plan de pago
begin;
select pg_temp.as_user('b8000000-0000-0000-0000-000000000002');
select pg_temp.expect(
  public.sync_push_records(jsonb_build_array(pg_temp.outline('fl-apunte-p', 'Asma', now() - interval '1 hour'))) = 1,
  'FL9. Quien paga no subió su apunte'
);
select pg_temp.expect(
  public.sync_push_records(jsonb_build_array(pg_temp.outline('fl-apunte-p', 'Asma grave', now() - interval '30 minutes'))) = 1,
  'FL9. Quien paga no cambió su apunte'
);
commit;
begin;
select pg_temp.as_user('b8000000-0000-0000-0000-000000000003');
select pg_temp.expect(
  public.sync_push_records(jsonb_build_array(pg_temp.outline('fl-apunte-r', 'EPOC', now() - interval '1 hour'))) = 1,
  'FL9. Quien tiene un mes regalado no subió su apunte'
);
commit;
select pg_temp.expect(
  (select data ->> 'title' from public.sync_records
    where user_id = 'b8000000-0000-0000-0000-000000000002' and kind = 'outline' and record_id = 'fl-apunte-p') = 'Asma grave',
  'FL9. El cambio de quien paga no quedó en la nube'
);

-- ===================================================================== FL10. Apuntes en la nube en Gratis
-- Un apunte que G subió cuando pagaba, como lo dejó la sincronización
insert into public.sync_records (user_id, kind, record_id, data, updated_at, deleted_at, server_seq)
  select 'b8000000-0000-0000-0000-000000000001', 'outline', 'fl-apunte-g',
         (pg_temp.outline('fl-apunte-g', 'Cardio', now() - interval '2 days')) -> 'data',
         now() - interval '2 days', null, nextval('public.sync_records_seq');
select set_config('fl.seq',
  (select server_seq::text from public.sync_records where record_id = 'fl-apunte-g'), false);

begin;
select pg_temp.as_user('b8000000-0000-0000-0000-000000000001');
-- Un apunte nuevo no entra, pero el mazo del mismo lote sí, sin error
select pg_temp.expect(
  public.sync_push_records(jsonb_build_array(
    pg_temp.outline('fl-apunte-nuevo', 'Nuevo', now() - interval '1 hour'),
    pg_temp.deck('fl-mazo-g', now() - interval '1 hour'))) = 1,
  'FL10. En Gratis el lote con un apunte nuevo no guardó solo el mazo'
);
-- Cambiar el que ya estaba no entra
select pg_temp.expect(
  public.sync_push_records(jsonb_build_array(pg_temp.outline('fl-apunte-g', 'Cardio editado', now() - interval '1 hour'))) = 0,
  'FL10. En Gratis se cambió un apunte'
);
-- Una marca de borrado de un apunte que no está en la nube no crea nada
select pg_temp.expect(
  public.sync_push_records(jsonb_build_array(
    pg_temp.outline('fl-apunte-fantasma', 'Fantasma', now() - interval '40 minutes', now() - interval '40 minutes'))) = 0,
  'FL10. En Gratis una marca de borrado creó un apunte'
);
commit;
select pg_temp.expect(
  (select count(*) from public.sync_records
    where user_id = 'b8000000-0000-0000-0000-000000000001' and kind = 'outline') = 1
  and (select data ->> 'title' from public.sync_records where record_id = 'fl-apunte-g') = 'Cardio'
  and (select deleted_at from public.sync_records where record_id = 'fl-apunte-g') is null
  and (select count(*) from public.sync_records
        where user_id = 'b8000000-0000-0000-0000-000000000001' and kind = 'deck' and record_id = 'fl-mazo-g') = 1,
  'FL10. En Gratis la nube no quedó con el apunte de antes sin cambios y el mazo nuevo'
);

-- Una marca de borrado que no es una fecha no entra. Ni infinita, ni posterior al cambio, ni texto
begin;
select pg_temp.as_user('b8000000-0000-0000-0000-000000000001');
select pg_temp.expect(
  pg_temp.fails_with(format('select public.sync_push_records(%L)', jsonb_build_array(
    jsonb_set(pg_temp.outline('fl-apunte-g', 'Cardio', now() - interval '30 minutes', now() - interval '30 minutes'),
      '{deletedAt}', '"infinity"')))) = '22023',
  'FL10. En Gratis entró una marca de borrado infinita'
);
select pg_temp.expect(
  pg_temp.fails_with(format('select public.sync_push_records(%L)', jsonb_build_array(
    jsonb_set(pg_temp.outline('fl-apunte-g', 'Cardio', now() - interval '30 minutes', now() - interval '30 minutes'),
      '{deletedAt}', to_jsonb(now() - interval '5 minutes'))))) = '22023',
  'FL10. En Gratis entró una marca de borrado posterior al cambio'
);
select pg_temp.expect(
  pg_temp.fails_with(format('select public.sync_push_records(%L)', jsonb_build_array(
    jsonb_set(pg_temp.outline('fl-apunte-g', 'Cardio', now() - interval '30 minutes', now() - interval '30 minutes'),
      '{deletedAt}', '"mañana"')))) is not null,
  'FL10. En Gratis entró una marca de borrado que no es una fecha'
);
rollback;
select pg_temp.expect(
  (select deleted_at is null and data ->> 'title' = 'Cardio' from public.sync_records where record_id = 'fl-apunte-g'),
  'FL10. Una marca de borrado inválida cambió el apunte'
);

-- Borrar sí. La marca queda sobre lo que ya tenía la nube, con solo sus dos fechas dentro de data, así
-- marcar un apunte como borrado no sirve para subir contenido nuevo. Una marca más vieja no cambia nada
begin;
select pg_temp.as_user('b8000000-0000-0000-0000-000000000001');
select set_config('fl.deleted', to_char((now() - interval '10 minutes') at time zone 'UTC',
  'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'), false);
select pg_temp.expect(
  public.sync_push_records(jsonb_build_array(
    jsonb_set(
      pg_temp.outline('fl-apunte-g', 'Contenido a escondidas', current_setting('fl.deleted')::timestamptz,
        current_setting('fl.deleted')::timestamptz),
      '{data,nodes}',
      jsonb_build_array(jsonb_build_object('id', 'n1', 'text', repeat('Texto nuevo ', 2000), 'children', '[]'::jsonb))
    ))) = 1,
  'FL10. En Gratis no se pudo borrar un apunte'
);
select pg_temp.expect(
  (select data ->> 'title' = 'Cardio' and data -> 'nodes' = '[]'::jsonb
     and data ->> 'deletedAt' = current_setting('fl.deleted')
     and data ->> 'updatedAt' = current_setting('fl.deleted')
     and data ->> 'deletedAt' ~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$'
     and deleted_at = current_setting('fl.deleted')::timestamptz
     and updated_at = current_setting('fl.deleted')::timestamptz
   from public.sync_records where record_id = 'fl-apunte-g'),
  'FL10. La marca de borrado en Gratis guardó lo que mandó el navegador o no dejó sus fechas'
);
select pg_temp.expect(
  public.sync_push_records(jsonb_build_array(
    pg_temp.outline('fl-apunte-g', 'Cardio', now() - interval '20 minutes', now() - interval '20 minutes'))) = 0,
  'FL10. Una marca de borrado más vieja cambió el apunte'
);
-- Revivirlo es un cambio, así que tampoco entra
select pg_temp.expect(
  public.sync_push_records(jsonb_build_array(pg_temp.outline('fl-apunte-g', 'Cardio', now() - interval '5 minutes'))) = 0,
  'FL10. En Gratis se revivió un apunte borrado'
);
-- Leer lo propio sigue igual
select pg_temp.expect(
  (select count(*) from public.sync_records where kind = 'outline') = 1
  and (select deleted_at is not null and data ? 'deletedAt' from public.sync_records where record_id = 'fl-apunte-g'),
  'FL10. En Gratis no se lee el apunte borrado con su marca'
);
commit;
select pg_temp.expect(
  (select server_seq > current_setting('fl.seq')::bigint from public.sync_records where record_id = 'fl-apunte-g'),
  'FL10. El borrado no avanzó el contador, así que otro dispositivo no se entera'
);

-- Con el plan vencido tampoco entra un apunte nuevo
begin;
select pg_temp.as_user('b8000000-0000-0000-0000-000000000006');
select pg_temp.expect(
  public.sync_push_records(jsonb_build_array(pg_temp.outline('fl-apunte-v', 'Renal', now() - interval '1 hour'))) = 0,
  'FL10. Con el plan vencido entró un apunte'
);
rollback;

-- Sin sesión no se sube nada
begin;
select pg_temp.as_anon();
select pg_temp.expect(
  pg_temp.fails_with(format('select public.sync_push_records(%L)',
    jsonb_build_array(pg_temp.outline('fl-anon', 'Anónimo', now())))) = '42501',
  'FL10. anon subió un apunte'
);
rollback;

-- ===================================================================== FL11. Borrar mis datos en Gratis se lleva los apuntes
begin;
select pg_temp.as_user('b8000000-0000-0000-0000-000000000001');
select public.delete_my_data();
commit;
select pg_temp.expect(
  (select count(*) from public.sync_records where user_id = 'b8000000-0000-0000-0000-000000000001') = 0,
  'FL11. Borrar mis datos en Gratis dejó registros en la nube'
);

-- ===================================================================== FL14. El rol no abre Party
-- Un admin y un médico sin plan de pago tampoco entran a Party, aunque sigan en un grupo de cuando
-- pagaban. El admin sigue viendo los perfiles por ser admin, pero no el grupo
insert into auth.users (id, email, raw_user_meta_data) values
  ('b8100000-0000-0000-0000-000000000001', 'admin.b8@x.mx', '{"alias":"Admin sin plan"}'),
  ('b8100000-0000-0000-0000-000000000002', 'medico.b8@x.mx', '{"alias":"Médico sin plan"}'),
  ('b8100000-0000-0000-0000-000000000003', 'dueno.b8@x.mx', '{"alias":"Dueño con plan"}');
insert into public.user_roles (user_id, role) values
  ('b8100000-0000-0000-0000-000000000001', 'admin'),
  ('b8100000-0000-0000-0000-000000000002', 'physician')
  on conflict (user_id) do update set role = excluded.role;
insert into public.subscriptions (user_id, plan, status, provider, current_period_end) values
  ('b8100000-0000-0000-0000-000000000003', 'monthly', 'active', 'stripe', now() + interval '20 days');
insert into public.groups (id, name, invite_code, owner_id) values
  ('b8100000-0000-0000-0000-0000000000a1', 'Roles B8', 'RLSB82', 'b8100000-0000-0000-0000-000000000003');
insert into public.memberships (group_id, user_id) values
  ('b8100000-0000-0000-0000-0000000000a1', 'b8100000-0000-0000-0000-000000000003'),
  ('b8100000-0000-0000-0000-0000000000a1', 'b8100000-0000-0000-0000-000000000001'),
  ('b8100000-0000-0000-0000-0000000000a1', 'b8100000-0000-0000-0000-000000000002');
insert into public.challenges (id, group_id, title, metric, target, starts_at, ends_at, created_by) values
  ('b8100000-0000-0000-0000-0000000000c1', 'b8100000-0000-0000-0000-0000000000a1', 'Reto de roles', 'cards', 10,
   now(), now() + interval '7 days', 'b8100000-0000-0000-0000-000000000003');
do $$
declare
  who text;
  stmt text;
begin
  foreach who in array array['b8100000-0000-0000-0000-000000000001', 'b8100000-0000-0000-0000-000000000002'] loop
    perform pg_temp.as_user(who);
    if public.party_open() then
      raise exception 'FALLA FL14. Party está abierta para % sin plan', who;
    end if;
    foreach stmt in array array[
      'select public.party_create_group(''Grupo por rol'')',
      format('select public.party_overview(%L)', pg_temp.week()),
      format('select public.party_create_challenge(%L, %L, %L, 10)', 'b8100000-0000-0000-0000-0000000000a1', 'x', 'cards'),
      format('select public.party_rotate_code(%L)', 'b8100000-0000-0000-0000-0000000000a1')
    ] loop
      if pg_temp.fails_with(stmt) is distinct from 'PT001' then
        raise exception 'FALLA FL14. % sin plan no contestó PT001: %', who, stmt;
      end if;
    end loop;
    if (select count(*) from public.groups) + (select count(*) from public.challenges) > 0
       or (select count(*) from public.memberships) <> 1 then
      raise exception 'FALLA FL14. % sin plan ve el grupo o a sus miembros', who;
    end if;
    reset role;
  end loop;
end $$;
-- Con un plan de pago el admin entra como cualquiera
insert into public.subscriptions (user_id, plan, status, provider, current_period_end) values
  ('b8100000-0000-0000-0000-000000000001', 'annual', 'active', 'stripe', now() + interval '200 days');
begin;
select pg_temp.as_user('b8100000-0000-0000-0000-000000000001');
select pg_temp.expect(
  public.party_open() and (select count(*) from public.groups) = 1 and (select count(*) from public.challenges) = 1,
  'FL14. El admin con plan de pago no ve su grupo'
);
rollback;

-- ===================================================================== FL15. La foto de un compañero en Gratis
-- El médico sigue en Gratis y en el grupo. No ve la foto del dueño, que paga, y el dueño sí ve la
-- suya mientras siga en el grupo, como su alias. Al salir deja de verse
insert into storage.objects (bucket_id, name, owner, owner_id, metadata) values
  ('avatars', 'b8100000-0000-0000-0000-000000000002/avatar.jpg', 'b8100000-0000-0000-0000-000000000002',
   'b8100000-0000-0000-0000-000000000002', '{"mimetype":"image/jpeg","size":1}'),
  ('avatars', 'b8100000-0000-0000-0000-000000000003/avatar.jpg', 'b8100000-0000-0000-0000-000000000003',
   'b8100000-0000-0000-0000-000000000003', '{"mimetype":"image/jpeg","size":1}');
begin;
select pg_temp.as_user('b8100000-0000-0000-0000-000000000002');
select pg_temp.expect(
  (select array_agg(name order by name) from storage.objects where bucket_id = 'avatars')
    = array['b8100000-0000-0000-0000-000000000002/avatar.jpg'],
  'FL15. En Gratis se ve la foto de un compañero o no la propia'
);
rollback;
begin;
select pg_temp.as_user('b8100000-0000-0000-0000-000000000003');
select pg_temp.expect(
  (select count(*) from storage.objects where bucket_id = 'avatars'
     and name like 'b8100000-0000-0000-0000-00000000000_/avatar.jpg') = 2,
  'FL15. Quien paga no ve la foto del compañero que pasó a Gratis'
);
rollback;
begin;
select pg_temp.as_user('b8100000-0000-0000-0000-000000000002');
select pg_temp.expect(public.party_leave_all() = 1, 'FL15. El médico en Gratis no pudo salir del grupo');
commit;
begin;
select pg_temp.as_user('b8100000-0000-0000-0000-000000000003');
select pg_temp.expect(
  (select count(*) from storage.objects where bucket_id = 'avatars'
     and name = 'b8100000-0000-0000-0000-000000000002/avatar.jpg') = 0,
  'FL15. Se sigue viendo la foto de quien salió del grupo'
);
rollback;

-- ===================================================================== FL12. Permisos de las funciones
do $$
declare
  f text;
begin
  foreach f in array array[
    'public.party_open()', 'public.sync_push_records(jsonb)', 'public.party_leave_group(uuid)',
    'public.party_leave_all()', 'public.party_export_mine()', 'public.my_referral_code()',
    'public.redeem_referral_code(text)', 'public.my_referrals()', 'public.my_plan()'] loop
    if has_function_privilege('anon', f, 'execute') then
      raise exception 'FALLA FL12. anon puede ejecutar %', f;
    end if;
    if not has_function_privilege('authenticated', f, 'execute') then
      raise exception 'FALLA FL12. Una sesión no puede ejecutar %', f;
    end if;
  end loop;
end $$;

-- ===================================================================== FL13. La comprobación de docs/SUPABASE.md
select pg_temp.expect(
  not has_function_privilege('authenticated', 'public.caller_has_paid_plan()', 'execute')
  and not has_function_privilege('anon', 'public.caller_has_paid_plan()', 'execute')
  and has_function_privilege('authenticated', 'public.party_open()', 'execute')
  and position('caller_has_paid_plan' in pg_get_functiondef('public.party_open()'::regprocedure)) > 0
  and position('v_outlines_open' in pg_get_functiondef('public.sync_push_records(jsonb)'::regprocedure)) > 0,
  'FL13. La consulta de comprobación de docs/SUPABASE.md no da lo esperado'
);

select 'TODAS LAS PRUEBAS DEL PLAN GRATIS EN EL SERVIDOR PASARON' as resultado;
