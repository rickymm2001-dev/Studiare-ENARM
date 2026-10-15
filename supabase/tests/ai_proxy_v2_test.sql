-- Pruebas del libro de IA v2 (B12, migración 20261026000001). Corre al final sobre la misma base, con
-- usuarios propios. Cada bloque falla con un error si algo no cumple.
--   W. ai_whoami. Sesión, dispositivo, plan (pago, prueba, pase, referido, Gratis) y rol con segundo factor
--   A. ai_admit_v2 con cada límite, ai_release_v2 y ai_settle_v2 con cada columna, y la reserva del
--      peor costo al admitir (A5), que impide que varias llamadas a la vez se salten un tope
--   R. admin_ai_cost_report, solo para admin
--   P. Permisos
\set ON_ERROR_STOP on

create or replace function pg_temp.as_user(uid text, sid text default null, aal text default 'aal2')
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claim', '', true);
  perform set_config('request.jwt.claims', (jsonb_build_object('sub', uid, 'role', 'authenticated', 'aal', aal)
    || case when sid is null then '{}'::jsonb else jsonb_build_object('session_id', sid) end)::text, true);
  execute 'set local role authenticated';
end $$;

create or replace function pg_temp.expect(ok boolean, msg text) returns void language plpgsql as $$
begin
  if not coalesce(ok, false) then raise exception 'FALLA %', msg; end if;
end $$;

create or replace function pg_temp.fails_with(stmt text) returns text language plpgsql as $$
begin
  execute stmt;
  return null;
exception when others then
  return sqlstate;
end $$;

-- Admite con límites amplios, salvo lo que se cambie
create or replace function pg_temp.admit(
  p_user uuid, p_engine text default 'forgetting', p_staff boolean default false,
  p_per_student integer default 100, p_budget numeric default 1000, p_share numeric default 1,
  p_user_budget numeric default 1000, p_generation text default null,
  p_max_generations integer default 20, p_max_sections integer default 12,
  p_reserve numeric default 0
) returns text language sql as $$
  select public.ai_admit_v2(p_user, p_engine, p_staff, p_per_student, p_budget, p_share, p_user_budget,
    p_generation, p_max_generations, p_max_sections, p_reserve)
$$;

create or replace function pg_temp.settle(
  p_user uuid, p_engine text, p_cost numeric, p_real boolean default true, p_mode text default 'sync',
  p_outcome text default 'ok', p_job uuid default null, p_reserved numeric default 0
) returns void language sql as $$
  select public.ai_settle_v2(p_user, p_engine, 'claude-haiku-5-5', p_real, p_outcome in ('ok', 'retried_ok'),
    p_cost, 1000, 200, 300, 40, 800, p_mode, p_outcome, 'forgetting.base.v1',
    case when p_outcome = 'refused' then 'bio' else null end, p_job, p_reserved)
$$;

-- ===================================================================== Usuarios
-- 01 pago mensual, 02 prueba del anual Fundador, 03 pase anual, 04 mes regalado, 05 Gratis,
-- 06 médica Gratis, 07 admin, 08 alumna con dispositivo, 09 alumna para el libro, 10 a 12 alumnas
-- para la reserva del peor costo
insert into auth.users (id, email, raw_user_meta_data) values
  ('c1200000-0000-0000-0000-000000000001', 'c12-pago@x.mx', '{"alias":"Pago"}'),
  ('c1200000-0000-0000-0000-000000000002', 'c12-prueba@x.mx', '{"alias":"Prueba"}'),
  ('c1200000-0000-0000-0000-000000000003', 'c12-pase@x.mx', '{"alias":"Pase"}'),
  ('c1200000-0000-0000-0000-000000000004', 'c12-referido@x.mx', '{"alias":"Referido"}'),
  ('c1200000-0000-0000-0000-000000000005', 'c12-gratis@x.mx', '{"alias":"Gratis"}'),
  ('c1200000-0000-0000-0000-000000000006', 'c12-medica@x.mx', '{"alias":"Médica"}'),
  ('c1200000-0000-0000-0000-000000000007', 'c12-admin@x.mx', '{"alias":"Admin"}'),
  ('c1200000-0000-0000-0000-000000000008', 'c12-dispositivo@x.mx', '{"alias":"Dispositivo"}'),
  ('c1200000-0000-0000-0000-000000000009', 'c12-libro@x.mx', '{"alias":"Libro"}'),
  ('c1200000-0000-0000-0000-000000000010', 'c12-reserva-a@x.mx', '{"alias":"Reserva A"}'),
  ('c1200000-0000-0000-0000-000000000011', 'c12-reserva-b@x.mx', '{"alias":"Reserva B"}'),
  ('c1200000-0000-0000-0000-000000000012', 'c12-reserva-c@x.mx', '{"alias":"Reserva C"}');
update public.user_roles set role = 'physician' where user_id = 'c1200000-0000-0000-0000-000000000006';
update public.user_roles set role = 'admin' where user_id = 'c1200000-0000-0000-0000-000000000007';
insert into public.subscriptions (user_id, plan, status, provider, provider_subscription_id, current_period_end) values
  ('c1200000-0000-0000-0000-000000000001', 'monthly', 'active', 'stripe', 'sub_c12_01', now() + interval '20 days'),
  ('c1200000-0000-0000-0000-000000000002', 'founder_annual', 'trialing', 'stripe', 'sub_c12_02', now() + interval '7 days'),
  ('c1200000-0000-0000-0000-000000000008', 'monthly', 'active', 'stripe', 'sub_c12_08', now() + interval '20 days');
insert into public.plan_passes (user_id, plan, provider, provider_payment_id, method, starts_at, ends_at) values
  ('c1200000-0000-0000-0000-000000000003', 'annual', 'mercadopago', 'pay_c12_03', 'oxxo',
   now() - interval '1 day', now() + interval '300 days');
insert into public.subscription_grants (user_id, kind, starts_at, ends_at) values
  ('c1200000-0000-0000-0000-000000000004', 'admin', now() - interval '1 day', now() + interval '20 days');
insert into public.device_sessions (user_id, device_id, label, session_id) values
  ('c1200000-0000-0000-0000-000000000008', 'dev-c12', 'Chrome en Windows', 'sesion-c12-a');

-- ===================================================================== W1. Quién llama
begin;
set local role anon;
select pg_temp.expect(pg_temp.fails_with($q$select public.ai_whoami()$q$) = '42501', 'W1. anon pudo llamar a ai_whoami');
rollback;
begin;
set local role authenticated;
select pg_temp.expect(pg_temp.fails_with($q$select public.ai_whoami()$q$) = '28000', 'W1. Sin sesión ai_whoami no dio 28000');
rollback;

-- Pago, prueba del anual Fundador, pase y mes regalado cuentan como pago. Gratis no. El equipo dice su rol
do $$
declare
  v_case record;
  v_who jsonb;
begin
  for v_case in select * from (values
    ('c1200000-0000-0000-0000-000000000001', 'student', true),
    ('c1200000-0000-0000-0000-000000000002', 'student', true),
    ('c1200000-0000-0000-0000-000000000003', 'student', true),
    ('c1200000-0000-0000-0000-000000000004', 'student', true),
    ('c1200000-0000-0000-0000-000000000005', 'student', false),
    ('c1200000-0000-0000-0000-000000000006', 'physician', false),
    ('c1200000-0000-0000-0000-000000000007', 'admin', false)
  ) as t(uid, role, paid) loop
    perform pg_temp.as_user(v_case.uid);
    v_who := public.ai_whoami();
    reset role;
    if v_who <> jsonb_build_object('userId', v_case.uid, 'role', v_case.role, 'paid', v_case.paid) then
      raise exception 'FALLA W1. ai_whoami de % dio %', v_case.uid, v_who;
    end if;
  end loop;
end $$;

-- ===================================================================== W2. Dispositivo desplazado
begin;
select pg_temp.as_user('c1200000-0000-0000-0000-000000000008', 'sesion-c12-b');
select pg_temp.expect(pg_temp.fails_with($q$select public.ai_whoami()$q$) = '42501',
  'W2. Un dispositivo que ya no es el activo usó ai_whoami');
rollback;
begin;
select pg_temp.as_user('c1200000-0000-0000-0000-000000000008', 'sesion-c12-a');
select pg_temp.expect((public.ai_whoami() ->> 'paid')::boolean, 'W2. El dispositivo activo no pasó');
rollback;

-- ===================================================================== W3. El rol del equipo pide segundo factor
begin;
insert into public.platform_settings (key, value) values ('feature_flags', '{"requireMfa": true}')
  on conflict (key) do update set value = public.platform_settings.value || '{"requireMfa": true}'::jsonb;
select pg_temp.as_user('c1200000-0000-0000-0000-000000000006', null, 'aal1');
select pg_temp.expect(public.ai_whoami() ->> 'role' = 'student', 'W3. Sin segundo factor la médica siguió siendo médica');
reset role;
select pg_temp.as_user('c1200000-0000-0000-0000-000000000006', null, 'aal2');
select pg_temp.expect(public.ai_whoami() ->> 'role' = 'physician', 'W3. Con segundo factor la médica no fue médica');
rollback;

-- ===================================================================== A1. Llamadas por alumno y motor
\set u9 'c1200000-0000-0000-0000-000000000009'
\set u1 'c1200000-0000-0000-0000-000000000001'
select pg_temp.expect(pg_temp.admit(:'u9', p_per_student => 2) = 'ok', 'A1. Primer uso');
select pg_temp.expect(pg_temp.admit(:'u9', p_per_student => 2) = 'ok', 'A1. Segundo uso');
select pg_temp.expect(pg_temp.admit(:'u9', p_per_student => 2) = 'student_limit', 'A1. El tercero pasó el límite');
select pg_temp.expect(pg_temp.admit(:'u9', 'bias_tips', p_per_student => 2) = 'ok', 'A1. Otro motor no tuvo su cupo');
select pg_temp.expect(pg_temp.admit(:'u9', 'restructure', true, 1) = 'ok', 'A1. Primera reestructurada del equipo');
select pg_temp.expect(pg_temp.admit(:'u9', 'restructure', true, 1) = 'student_limit',
  'A1. El límite de llamadas no fue también del equipo');

-- ===================================================================== A2. Generaciones de tarjetas
do $$
declare
  i integer;
begin
  for i in 1..20 loop
    if pg_temp.admit('c1200000-0000-0000-0000-000000000001', 'flashcards',
         p_generation => 'generacion-' || lpad(i::text, 3, '0')) <> 'ok' then
      raise exception 'FALLA A2. La generación % no pasó', i;
    end if;
  end loop;
end $$;
select pg_temp.expect(pg_temp.admit(:'u1', 'flashcards', p_generation => 'generacion-021') = 'generation_limit',
  'A2. La generación 21 pasó');
select pg_temp.expect(pg_temp.admit(:'u1', 'flashcards', p_generation => 'generacion-001') = 'ok',
  'A2. Una generación abierta no siguió');
do $$
declare
  i integer;
  v_result text;
begin
  -- generacion-001 ya lleva 2 llamadas. Llega a 14 y la 15 no pasa
  for i in 3..14 loop
    v_result := pg_temp.admit('c1200000-0000-0000-0000-000000000001', 'flashcards', p_generation => 'generacion-001');
    if v_result <> 'ok' then raise exception 'FALLA A2. La llamada % de la generación dio %', i, v_result; end if;
  end loop;
end $$;
select pg_temp.expect(pg_temp.admit(:'u1', 'flashcards', p_generation => 'generacion-001') = 'generation_limit',
  'A2. La llamada 15 de una generación pasó');
-- Devolver el cupo devuelve la sección y nunca baja de cero
select public.ai_release_v2(:'u1', 'flashcards', 'generacion-001');
select pg_temp.expect((select calls from public.ai_generations where day = public.ai_day() and user_id = :'u1'
  and generation_ref = 'generacion-001') = 13, 'A2. No se devolvió la sección');
select pg_temp.expect(pg_temp.admit(:'u1', 'flashcards', p_generation => 'generacion-001') = 'ok',
  'A2. Con la sección devuelta no pasó');
select public.ai_release_v2(:'u9', 'weekly_report', null);
select pg_temp.expect(coalesce((select min(calls) from public.ai_usage_day where user_id = :'u9'), 0) >= 0,
  'A2. El conteo quedó en negativo');
select pg_temp.expect(pg_temp.fails_with($q$select pg_temp.admit('c1200000-0000-0000-0000-000000000001', 'flashcards', p_generation => 'no vale')$q$) = '22023',
  'A2. Aceptó una generación con otra forma');

-- ===================================================================== A3. Presupuesto, cuota del motor y tope del alumno
-- El gasto de hoy ya trae lo de otras pruebas. Se mide contra lo que hay
select coalesce((select spent_usd from public.ai_spend_day where day = public.ai_day()), 0) as spent \gset
select pg_temp.expect(pg_temp.admit(:'u9', 'weekly_report', p_budget => :spent) = 'budget_exceeded',
  'A3. Con el presupuesto agotado dejó pasar');
select pg_temp.settle(:'u1', 'weekly_report', 0.2);
select pg_temp.expect(pg_temp.admit(:'u9', 'weekly_report', p_budget => :spent + 10, p_share => 0.001) = 'budget_exceeded',
  'A3. Con la cuota del motor agotada dejó pasar');
select pg_temp.expect(pg_temp.admit(:'u9', 'weekly_report', p_budget => :spent + 10, p_share => 0.1) = 'ok',
  'A3. Con cuota de sobra no dejó pasar');
select pg_temp.expect(pg_temp.admit(:'u1', 'bias_tips', p_user_budget => 0.2) = 'budget_exceeded',
  'A3. La alumna pasó su tope en dólares');
select pg_temp.expect(pg_temp.admit(:'u1', 'bias_tips', true, p_user_budget => 0.2) = 'ok',
  'A3. El equipo tuvo tope en dólares por persona');
select pg_temp.expect(pg_temp.fails_with($q$select pg_temp.admit('c1200000-0000-0000-0000-000000000001', p_share => -1)$q$) = '22023',
  'A3. Aceptó una cuota negativa');

-- ===================================================================== A4. Asentar con cada columna
select count(*) as log_before from public.ai_call_log \gset
select pg_temp.settle(:'u9', 'forgetting', 0.0001, p_mode => 'batch', p_outcome => 'refused',
  p_job => 'c1200000-0000-0000-0000-0000000000aa');
select pg_temp.settle(:'u9', 'forgetting', 9.99, false);
select pg_temp.expect((select count(*) from public.ai_call_log) = :log_before + 2, 'A4. No dejó un renglón por llamada');
select pg_temp.expect(exists (
  select 1 from public.ai_call_log
  where user_id = :'u9' and mode = 'batch' and outcome = 'refused' and refusal_category = 'bio'
    and cache_read_tokens = 300 and cache_write_tokens = 40 and prompt_version = 'forgetting.base.v1'
    and job_id = 'c1200000-0000-0000-0000-0000000000aa' and cost_usd = 0.0001 and real and not ok
), 'A4. El renglón no guardó las columnas nuevas');
select pg_temp.expect(exists (
  select 1 from public.ai_call_log where user_id = :'u9' and not real and cost_usd = 0
), 'A4. Lo simulado guardó costo');
select pg_temp.expect((select cost_usd from public.ai_usage_day where day = public.ai_day()
  and user_id = :'u9' and engine = 'forgetting') = 0.0001, 'A4. El gasto real no llegó al tope de la alumna');
select pg_temp.expect((select cost_usd from public.ai_usage_day where day = public.ai_day()
  and user_id = :'u1' and engine = 'weekly_report' and calls = 0) = 0.2,
  'A4. Un gasto sin llamada de hoy, como un lote, no quedó en su tope');
select pg_temp.expect(pg_temp.fails_with($q$select pg_temp.settle('c1200000-0000-0000-0000-000000000009', 'forgetting', 0, p_mode => 'nocturno')$q$) = '22023',
  'A4. Aceptó un modo que no existe');
select pg_temp.expect(pg_temp.fails_with($q$select pg_temp.settle('c1200000-0000-0000-0000-000000000009', 'forgetting', 0, p_outcome => 'chisme')$q$) = '22023',
  'A4. Aceptó un resultado que no existe');
select pg_temp.expect(pg_temp.fails_with($q$insert into public.ai_call_log (engine, ok, real, mode) values ('forgetting', true, true, 'otro')$q$) = '23514',
  'A4. La tabla aceptó un modo que no existe');

-- ===================================================================== A5. Reserva del peor costo al admitir
-- Antes del arreglo el gasto solo entraba al asentar, y 60 llamadas a la vez pasaban todas el tope porque
-- ninguna había gastado todavía. Ahora cada llamada reserva su peor costo (p_reserve) y las tres
-- comparaciones suman lo asentado más lo reservado por lo que está en vuelo. Estas llamadas, una tras
-- otra sin asentar, son lo que ve una llamada nueva mientras las anteriores siguen en vuelo
\set ra 'c1200000-0000-0000-0000-000000000010'
\set rb 'c1200000-0000-0000-0000-000000000011'
\set rc 'c1200000-0000-0000-0000-000000000012'

-- Tope del alumno. Con 0.13 de reserva y 0.30 de tope pasan 3 llamadas en vuelo y la cuarta no. La
-- reserva de la llamada que entra no cuenta para ella, así el tope sigue siendo blando por una sola llamada
select pg_temp.expect(pg_temp.admit(:'ra', 'flashcards', p_user_budget => 0.3, p_reserve => 0.13) = 'ok', 'A5. Primera en vuelo');
select pg_temp.expect(pg_temp.admit(:'ra', 'flashcards', p_user_budget => 0.3, p_reserve => 0.13) = 'ok', 'A5. Segunda en vuelo');
select pg_temp.expect(pg_temp.admit(:'ra', 'flashcards', p_user_budget => 0.3, p_reserve => 0.13) = 'ok', 'A5. Tercera en vuelo');
select pg_temp.expect(pg_temp.admit(:'ra', 'flashcards', p_user_budget => 0.3, p_reserve => 0.13) = 'budget_exceeded',
  'A5. La cuarta llamada en vuelo pasó el tope del alumno aunque nada se había asentado');
select pg_temp.expect(pg_temp.admit(:'ra', 'bias_tips', p_user_budget => 0.3, p_reserve => 0.01) = 'budget_exceeded',
  'A5. El tope del alumno suma lo reservado en todos sus motores');
select pg_temp.expect((select reserved_usd from public.ai_usage_day where day = public.ai_day() and user_id = :'ra'
  and engine = 'flashcards') = 0.39 and (select calls from public.ai_usage_day where day = public.ai_day()
  and user_id = :'ra' and engine = 'flashcards') = 3, 'A5. La reserva o las llamadas no quedaron como se esperaba');
select pg_temp.expect((select reserved_since is not null from public.ai_usage_day where day = public.ai_day()
  and user_id = :'ra' and engine = 'flashcards'), 'A5. Falta la hora de la reserva');
-- El equipo no tiene tope por persona, aunque tenga lo mismo en vuelo
select pg_temp.expect(pg_temp.admit(:'ra', 'flashcards', true, p_user_budget => 0.3, p_reserve => 0.13) = 'ok',
  'A5. El equipo tuvo tope en dólares por persona al reservar');
-- Con el equipo hay cuatro en vuelo (0.52). Devolver el cupo devuelve la reserva y deja pasar otra llamada
select public.ai_release_v2(:'ra', 'flashcards', null, 0.13);
select public.ai_release_v2(:'ra', 'flashcards', null, 0.13);
select pg_temp.expect((select reserved_usd from public.ai_usage_day where day = public.ai_day() and user_id = :'ra'
  and engine = 'flashcards') = 0.26, 'A5. Liberar no devolvió la reserva');
select pg_temp.expect(pg_temp.admit(:'ra', 'flashcards', p_user_budget => 0.3, p_reserve => 0.13) = 'ok',
  'A5. Con la reserva devuelta no pasó otra llamada');
select pg_temp.expect(pg_temp.admit(:'ra', 'flashcards', p_user_budget => 0.3, p_reserve => 0.13) = 'budget_exceeded',
  'A5. Con tres en vuelo seguía pasando');
-- Asentar cambia la reserva por el costo real. Una llamada que costó 0.018 deja de bloquear 0.13
select pg_temp.settle(:'ra', 'flashcards', 0.018, p_reserved => 0.13);
select pg_temp.expect((select reserved_usd from public.ai_usage_day where day = public.ai_day() and user_id = :'ra'
  and engine = 'flashcards') = 0.26 and (select cost_usd from public.ai_usage_day where day = public.ai_day()
  and user_id = :'ra' and engine = 'flashcards') = 0.018, 'A5. Asentar no cambió la reserva por el costo real');
select pg_temp.expect(pg_temp.admit(:'ra', 'flashcards', p_user_budget => 0.3, p_reserve => 0.13) = 'ok',
  'A5. Con 0.018 asentados y 0.26 en vuelo no pasó una llamada');
select pg_temp.expect(pg_temp.admit(:'ra', 'flashcards', p_user_budget => 0.3, p_reserve => 0.13) = 'budget_exceeded',
  'A5. Tres en vuelo y 0.018 asentados pasaron el tope de 0.3');
select pg_temp.settle(:'ra', 'flashcards', 0.018, p_reserved => 0.13);
select pg_temp.settle(:'ra', 'flashcards', 0.018, p_reserved => 0.13);
select pg_temp.settle(:'ra', 'flashcards', 0.018, p_reserved => 0.13);
select pg_temp.expect((select reserved_usd = 0 and reserved_since is null and cost_usd = 0.072 from public.ai_usage_day
  where day = public.ai_day() and user_id = :'ra' and engine = 'flashcards'),
  'A5. Al asentar todo, la reserva no volvió a cero o el costo no suma');
-- Devolver de más nunca deja la reserva en negativo
select public.ai_release_v2(:'ra', 'flashcards', null, 5);
select pg_temp.expect((select min(reserved_usd) from public.ai_usage_day where user_id = :'ra') = 0,
  'A5. La reserva quedó en negativo');

-- Una llamada tras otra gasta lo mismo que sin reservar. Con tope de 0.1 y 0.03 por llamada pasan 4
do $$
declare
  i integer;
  v_ok integer := 0;
begin
  for i in 1..10 loop
    if pg_temp.admit('c1200000-0000-0000-0000-000000000011', 'bias_tips', p_user_budget => 0.1, p_reserve => 0.5) = 'ok' then
      v_ok := v_ok + 1;
      perform pg_temp.settle('c1200000-0000-0000-0000-000000000011', 'bias_tips', 0.03, p_reserved => 0.5);
    end if;
  end loop;
  if v_ok <> 4 then raise exception 'FALLA A5. Una a una pasaron % llamadas y eran 4', v_ok; end if;
end $$;

-- El presupuesto del día y la cuota del motor suman lo reservado por todos los alumnos
select coalesce((select spent_usd from public.ai_spend_day where day = public.ai_day()), 0) as spent \gset
select pg_temp.expect(pg_temp.admit(:'rb', 'weekly_report', p_budget => :spent + 1, p_reserve => 0.6) = 'ok', 'A5. Total, primera');
select pg_temp.expect(pg_temp.admit(:'rc', 'weekly_report', p_budget => :spent + 1, p_reserve => 0.6) = 'ok',
  'A5. Total, otra alumna con 0.6 en vuelo y un presupuesto de 1');
select pg_temp.expect(pg_temp.admit(:'ra', 'weekly_report', p_budget => :spent + 1, p_reserve => 0.6) = 'budget_exceeded',
  'A5. El presupuesto del día no sumó la reserva de todas las alumnas');
select pg_temp.expect(pg_temp.admit(:'ra', 'forgetting', true, p_budget => :spent + 1, p_reserve => 0.6) = 'budget_exceeded',
  'A5. El presupuesto total no frenó a otro motor');
select public.ai_release_v2(:'rb', 'weekly_report', null, 0.6);
select public.ai_release_v2(:'rc', 'weekly_report', null, 0.6);
select pg_temp.expect(pg_temp.admit(:'ra', 'weekly_report', p_budget => :spent + 1, p_reserve => 0.6) = 'ok',
  'A5. Con todo devuelto no pasó');
select public.ai_release_v2(:'ra', 'weekly_report', null, 0.6);
-- Cuota del motor: 1 dólar de cuota, y otro motor sigue pasando
select pg_temp.expect(pg_temp.admit(:'rb', 'restructure', true, p_budget => 10, p_share => 0.1, p_reserve => 0.6) = 'ok', 'A5. Cuota, primera');
select pg_temp.expect(pg_temp.admit(:'rc', 'restructure', true, p_budget => 10, p_share => 0.1, p_reserve => 0.6) = 'ok', 'A5. Cuota, segunda');
select pg_temp.expect(pg_temp.admit(:'ra', 'restructure', true, p_budget => 10, p_share => 0.1, p_reserve => 0.6) = 'budget_exceeded',
  'A5. La cuota del motor no sumó la reserva de todas');
select pg_temp.expect(pg_temp.admit(:'ra', 'bias_tips', true, p_budget => 10, p_share => 0.1, p_reserve => 0.6) = 'ok',
  'A5. La cuota de un motor frenó a otro');
select public.ai_release_v2(:'ra', 'bias_tips', null, 0.6);
select public.ai_release_v2(:'rb', 'restructure', null, 0.6);
select public.ai_release_v2(:'rc', 'restructure', null, 0.6);

-- Lo huérfano vence a los 5 minutos. Una llamada que murió deja su reserva, y una alumna distinta la
-- ve hasta que pasan 5 minutos. Con 4 minutos sigue contando
select pg_temp.expect(pg_temp.admit(:'rc', 'flashcards', p_user_budget => 0.3, p_reserve => 0.4) = 'ok', 'A5. Llamada que va a morir');
update public.ai_usage_day set reserved_since = now() - interval '4 minutes'
  where day = public.ai_day() and user_id = :'rc' and engine = 'flashcards';
select pg_temp.expect(pg_temp.admit(:'rc', 'flashcards', p_user_budget => 0.3, p_reserve => 0.01) = 'budget_exceeded',
  'A5. Una reserva de 4 minutos dejó de contar');
select pg_temp.expect((select reserved_usd from public.ai_usage_day where day = public.ai_day() and user_id = :'rc'
  and engine = 'flashcards') = 0.4, 'A5. Una reserva de 4 minutos se borró');
update public.ai_usage_day set reserved_since = now() - interval '6 minutes'
  where day = public.ai_day() and user_id = :'rc' and engine = 'flashcards';
-- Quien la ve vencer puede ser otra alumna: el presupuesto es de todas
select pg_temp.expect(pg_temp.admit(:'rb', 'flashcards', p_user_budget => 0.3, p_reserve => 0.01) = 'ok',
  'A5. Otra alumna no pudo admitir con una reserva vencida de otra');
select pg_temp.expect((select reserved_usd = 0 and reserved_since is null from public.ai_usage_day
  where day = public.ai_day() and user_id = :'rc' and engine = 'flashcards'), 'A5. La reserva vencida no se puso en cero');
select pg_temp.expect(pg_temp.admit(:'rc', 'flashcards', p_user_budget => 0.3, p_reserve => 0.4) = 'ok',
  'A5. La alumna de la reserva vencida no pudo volver a usar la IA');
-- Una reserva nueva sobre una vencida empieza su propia hora
select pg_temp.expect((select reserved_usd = 0.4 and reserved_since > now() - interval '1 minute' from public.ai_usage_day
  where day = public.ai_day() and user_id = :'rc' and engine = 'flashcards'), 'A5. La reserva nueva no empezó su hora');
select public.ai_release_v2(:'rc', 'flashcards', null, 0.4);
select public.ai_release_v2(:'rb', 'flashcards', null, 0.01);

-- Sumar sobre algo en vuelo conserva la hora de la primera reserva, y sin reserva no la toca
select pg_temp.admit(:'rb', 'weekly_report', p_reserve => 0.1);
update public.ai_usage_day set reserved_since = now() - interval '2 minutes'
  where day = public.ai_day() and user_id = :'rb' and engine = 'weekly_report';
select pg_temp.admit(:'rb', 'weekly_report', p_reserve => 0.1);
select pg_temp.admit(:'rb', 'weekly_report', p_reserve => 0);
select pg_temp.expect((select reserved_usd = 0.2 and reserved_since < now() - interval '1 minute' from public.ai_usage_day
  where day = public.ai_day() and user_id = :'rb' and engine = 'weekly_report'), 'A5. La hora de la primera reserva cambió');
select pg_temp.settle(:'rb', 'weekly_report', 0, p_reserved => 0.2);
-- Un asiento de lote no reserva ni devuelve nada
select pg_temp.admit(:'rb', 'weekly_report', p_reserve => 0.1);
select pg_temp.settle(:'rb', 'weekly_report', 0.001, p_mode => 'batch', p_job => 'c1200000-0000-0000-0000-0000000000ab');
select pg_temp.expect((select reserved_usd from public.ai_usage_day where day = public.ai_day() and user_id = :'rb'
  and engine = 'weekly_report') = 0.1, 'A5. Un asiento de lote tocó la reserva de una llamada en vuelo');
select public.ai_release_v2(:'rb', 'weekly_report', null, 0.1);

-- Una reserva negativa no vale, y la tabla no deja un estado a medias
select pg_temp.expect(pg_temp.fails_with($q$select pg_temp.admit('c1200000-0000-0000-0000-000000000010', p_reserve => -0.1)$q$) = '22023',
  'A5. Aceptó una reserva negativa');
select pg_temp.expect(pg_temp.fails_with($q$update public.ai_usage_day set reserved_usd = 1, reserved_since = null where user_id = 'c1200000-0000-0000-0000-000000000010'$q$) = '23514',
  'A5. La tabla aceptó una reserva sin hora');
select pg_temp.expect(pg_temp.fails_with($q$update public.ai_usage_day set reserved_usd = -1 where user_id = 'c1200000-0000-0000-0000-000000000010'$q$) = '23514',
  'A5. La tabla aceptó una reserva negativa');

-- ===================================================================== R1. Reporte de costos
begin;
select pg_temp.as_user('c1200000-0000-0000-0000-000000000009');
select pg_temp.expect(pg_temp.fails_with($q$select public.admin_ai_cost_report(current_date, current_date)$q$) = '42501',
  'R1. Una alumna vio el costo de la IA');
rollback;
begin;
select pg_temp.as_user('c1200000-0000-0000-0000-000000000006');
select pg_temp.expect(pg_temp.fails_with($q$select public.admin_ai_cost_report(current_date, current_date)$q$) = '42501',
  'R1. Una médica vio el costo de la IA');
rollback;
select public.ai_day() as today \gset
begin;
select pg_temp.as_user('c1200000-0000-0000-0000-000000000007');
select public.admin_ai_cost_report(:'today', :'today') as report \gset
select pg_temp.expect((:'report'::jsonb ->> 'totalUsd')::numeric >= 0.2001
  and (:'report'::jsonb -> 'byMode' -> 'batch' ->> 'costUsd')::numeric >= 0.0001
  and (:'report'::jsonb -> 'byOutcome' ->> 'refused')::integer >= 1
  and (:'report'::jsonb -> 'byEngine' -> 'weekly_report' ->> 'costUsd')::numeric >= 0.2
  and (:'report'::jsonb ->> 'paidStudentsToday')::integer >= 5
  and (:'report'::jsonb ->> 'students')::integer >= 2
  and (:'report'::jsonb -> 'perStudentMonthlyUsd' ->> 'p90')::numeric
      >= (:'report'::jsonb -> 'perStudentMonthlyUsd' ->> 'p50')::numeric,
  'R1. El reporte no coincide con lo asentado');
select pg_temp.expect(pg_temp.fails_with($q$select public.admin_ai_cost_report(current_date, current_date - 1)$q$) = '22023'
  and pg_temp.fails_with($q$select public.admin_ai_cost_report(current_date - 400, current_date)$q$) = '22023',
  'R1. Aceptó un periodo al revés o de más de un año');
rollback;
-- Con segundo factor encendido, el admin sin él no ve el reporte
begin;
insert into public.platform_settings (key, value) values ('feature_flags', '{"requireMfa": true}')
  on conflict (key) do update set value = public.platform_settings.value || '{"requireMfa": true}'::jsonb;
select pg_temp.as_user('c1200000-0000-0000-0000-000000000007', null, 'aal1');
select pg_temp.expect(pg_temp.fails_with($q$select public.admin_ai_cost_report(current_date, current_date)$q$) = '42501',
  'R1. El admin sin segundo factor vio el costo');
rollback;

-- ===================================================================== P1. Permisos
begin;
select pg_temp.as_user('c1200000-0000-0000-0000-000000000007');
select pg_temp.expect(pg_temp.fails_with($q$select pg_temp.admit('c1200000-0000-0000-0000-000000000007')$q$) = '42501',
  'P1. Un admin llamó a ai_admit_v2 con la API');
select pg_temp.expect(pg_temp.fails_with($q$select public.ai_release_v2('c1200000-0000-0000-0000-000000000007', 'forgetting', null)$q$) = '42501',
  'P1. Un admin devolvió cupo con la API');
select pg_temp.expect(pg_temp.fails_with($q$select pg_temp.settle('c1200000-0000-0000-0000-000000000007', 'forgetting', 0)$q$) = '42501',
  'P1. Un admin asentó gasto con la API');
select pg_temp.expect(pg_temp.fails_with($q$select * from public.ai_generations$q$) = '42501',
  'P1. Un admin leyó ai_generations');
rollback;
select pg_temp.expect(
  has_function_privilege('service_role', 'public.ai_admit_v2(uuid, text, boolean, integer, numeric, numeric, numeric, text, integer, integer, numeric)', 'execute')
  and has_function_privilege('service_role', 'public.ai_release_v2(uuid, text, text, numeric)', 'execute')
  and has_function_privilege('service_role', 'public.ai_settle_v2(uuid, text, text, boolean, boolean, numeric, integer, integer, integer, integer, integer, text, text, text, text, uuid, numeric)', 'execute')
  and not has_function_privilege('anon', 'public.ai_whoami()', 'execute')
  and has_function_privilege('authenticated', 'public.ai_whoami()', 'execute')
  and not has_function_privilege('service_role', 'public.ai_whoami()', 'execute')
  and not has_function_privilege('anon', 'public.admin_ai_cost_report(date, date)', 'execute')
  and not has_table_privilege('authenticated', 'public.ai_generations', 'select,insert,update,delete'),
  'P1. Los permisos del libro v2 no son los esperados');

select 'TODAS LAS PRUEBAS DEL LIBRO DE IA V2 PASARON' as resultado;
