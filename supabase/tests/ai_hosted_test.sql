-- Pruebas del libro de IA alojado (migración 20261010000001). Corre después de privacy_test.sql
-- sobre la misma base, con usuarios propios. Cada bloque falla con un error si algo no cumple.
\set ON_ERROR_STOP on

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

-- ===================================================================== Usuarios
insert into auth.users (id, email, raw_user_meta_data) values
  ('f0000000-0000-0000-0000-000000000001', 'a1@x.mx', '{"alias":"Uno"}'),
  ('f0000000-0000-0000-0000-000000000002', 'a2@x.mx', '{"alias":"Dos"}');

-- ===================================================================== A1. Límite por alumno y por motor
-- Dos usos permitidos. El tercero se rechaza y no gasta cupo. Otro motor y otro alumno van aparte
select pg_temp.expect(public.ai_admit('f0000000-0000-0000-0000-000000000001', 'forgetting', 2, 5) = 'ok', 'A1. Primer uso');
select pg_temp.expect(public.ai_admit('f0000000-0000-0000-0000-000000000001', 'forgetting', 2, 5) = 'ok', 'A1. Segundo uso');
select pg_temp.expect(public.ai_admit('f0000000-0000-0000-0000-000000000001', 'forgetting', 2, 5) = 'student_limit', 'A1. Tercer uso pasó el límite');
select pg_temp.expect(public.ai_admit('f0000000-0000-0000-0000-000000000001', 'bias_tips', 2, 5) = 'ok', 'A1. Otro motor tiene su propio cupo');
select pg_temp.expect(public.ai_admit('f0000000-0000-0000-0000-000000000002', 'forgetting', 2, 5) = 'ok', 'A1. Otro alumno tiene su propio cupo');
select pg_temp.expect(
  (select calls from public.ai_usage_day where day = public.ai_day() and user_id = 'f0000000-0000-0000-0000-000000000001' and engine = 'forgetting') = 2,
  'A1. El rechazo gastó cupo'
);

-- ===================================================================== A2. Devolver el cupo
select public.ai_release('f0000000-0000-0000-0000-000000000001', 'forgetting');
select pg_temp.expect(
  (select calls from public.ai_usage_day where day = public.ai_day() and user_id = 'f0000000-0000-0000-0000-000000000001' and engine = 'forgetting') = 1,
  'A2. No se devolvió el cupo'
);
select pg_temp.expect(public.ai_admit('f0000000-0000-0000-0000-000000000001', 'forgetting', 2, 5) = 'ok', 'A2. Con el cupo devuelto se puede usar otra vez');
-- Devolver de más no deja el conteo en negativo
select public.ai_release('f0000000-0000-0000-0000-000000000002', 'weekly_report');
select public.ai_release('f0000000-0000-0000-0000-000000000002', 'weekly_report');
select pg_temp.expect(
  coalesce((select min(calls) from public.ai_usage_day where user_id = 'f0000000-0000-0000-0000-000000000002'), 0) >= 0,
  'A2. El conteo quedó en negativo'
);

-- ===================================================================== A3. Presupuesto del día
-- Solo el gasto real cuenta. Uno simulado no gasta aunque traiga costo
select public.ai_settle('f0000000-0000-0000-0000-000000000001', 'forgetting', 'mock', false, true, 9.99, 10, 10, 5);
select pg_temp.expect(
  coalesce((select spent_usd from public.ai_spend_day where day = public.ai_day()), 0) = 0,
  'A3. Una llamada simulada gastó presupuesto'
);
select public.ai_settle('f0000000-0000-0000-0000-000000000001', 'forgetting', 'claude-haiku-4-5', true, true, 1.25, 1200, 300, 800);
select public.ai_settle('f0000000-0000-0000-0000-000000000002', 'bias_tips', 'claude-haiku-4-5', true, false, 0.5, 900, 0, 400);
select pg_temp.expect(
  (select spent_usd from public.ai_spend_day where day = public.ai_day()) = 1.75,
  'A3. El gasto real no suma lo que debe'
);
select pg_temp.expect(public.ai_admit('f0000000-0000-0000-0000-000000000002', 'restructure', 5, 1.75) = 'budget_exceeded', 'A3. Con el presupuesto agotado dejó pasar');
select pg_temp.expect(public.ai_admit('f0000000-0000-0000-0000-000000000002', 'restructure', 5, 2) = 'ok', 'A3. Con presupuesto de sobra no dejó pasar');
select pg_temp.expect((select count(*) from public.ai_call_log) = 3, 'A3. La bitácora no tiene una fila por llamada asentada');
select pg_temp.expect(
  (select cost_usd from public.ai_call_log where model = 'mock') = 0,
  'A3. La bitácora guardó costo de una llamada simulada'
);

-- ===================================================================== A4. Resumen del día
select pg_temp.expect(
  (public.ai_usage_summary() ->> 'day') = public.ai_day()::text
  and (public.ai_usage_summary() ->> 'spentUsd')::numeric = 1.75
  and (public.ai_usage_summary() ->> 'students')::int = 2
  and (public.ai_usage_summary() -> 'byEngine' -> 'forgetting' ->> 'costUsd')::numeric = 1.25
  and (public.ai_usage_summary() -> 'byEngine' -> 'forgetting' ->> 'calls')::int >= 1,
  'A4. El resumen no coincide con lo asentado'
);

-- ===================================================================== A5. Entradas no válidas
select pg_temp.expect(pg_temp.fails_with($q$select public.ai_admit('f0000000-0000-0000-0000-000000000001', 'chat_libre', 2, 5)$q$) = '22023', 'A5. Aceptó un motor que no existe');
select pg_temp.expect(pg_temp.fails_with($q$select public.ai_admit('f0000000-0000-0000-0000-000000000001', 'forgetting', 0, 5)$q$) = '22023', 'A5. Aceptó un límite de cero');
select pg_temp.expect(pg_temp.fails_with($q$select public.ai_admit(null, 'forgetting', 2, 5)$q$) = '22023', 'A5. Aceptó un alumno vacío');

-- ===================================================================== A6. Ni un alumno ni anon tocan el libro
begin;
select pg_temp.as_user('f0000000-0000-0000-0000-000000000001');
select pg_temp.expect(
  pg_temp.fails_with($q$select public.ai_admit('f0000000-0000-0000-0000-000000000001', 'forgetting', 99, 99)$q$) = '42501',
  'A6. Un alumno pudo llamar a ai_admit'
);
select pg_temp.expect(
  pg_temp.fails_with($q$select public.ai_settle('f0000000-0000-0000-0000-000000000001', 'forgetting', 'x', true, true, 0, 0, 0, 0)$q$) = '42501',
  'A6. Un alumno pudo llamar a ai_settle'
);
select pg_temp.expect(pg_temp.fails_with($q$select public.ai_usage_summary()$q$) = '42501', 'A6. Un alumno pudo leer el resumen');
select pg_temp.expect(pg_temp.fails_with($q$select * from public.ai_usage_day$q$) = '42501', 'A6. Un alumno pudo leer el uso');
select pg_temp.expect(pg_temp.fails_with($q$select * from public.ai_call_log$q$) = '42501', 'A6. Un alumno pudo leer la bitácora');
select pg_temp.expect(pg_temp.fails_with($q$update public.ai_spend_day set spent_usd = 0$q$) = '42501', 'A6. Un alumno pudo borrar el gasto del día');
select pg_temp.expect(pg_temp.fails_with($q$select * from public.ai_config$q$) = '42501', 'A6. Un alumno pudo leer la configuración de la IA');
select pg_temp.expect(pg_temp.fails_with($q$insert into public.ai_config (value) values ('{}')$q$) = '42501', 'A6. Un alumno pudo escribir la configuración de la IA');
rollback;
begin;
set local role anon;
select pg_temp.expect(pg_temp.fails_with($q$select public.ai_usage_summary()$q$) = '42501', 'A6. Anon pudo leer el resumen');
select pg_temp.expect(pg_temp.fails_with($q$select * from public.ai_spend_day$q$) = '42501', 'A6. Anon pudo leer el gasto');
rollback;
select pg_temp.expect(has_function_privilege('service_role', 'public.ai_admit(uuid, text, integer, numeric)', 'execute'), 'A6. El servicio no puede admitir');
select pg_temp.expect(not has_function_privilege('authenticated', 'public.ai_release(uuid, text)', 'execute'), 'A6. Un alumno puede devolver cupo');

-- ===================================================================== A7. Borrar mis datos y la IA
-- Quita lo anterior a hoy y la bitácora, pero conserva el uso de hoy para que no sirva de truco
insert into public.ai_usage_day (day, user_id, engine, calls)
  values (public.ai_day() - 3, 'f0000000-0000-0000-0000-000000000001', 'flashcards', 7);
begin;
select pg_temp.as_user('f0000000-0000-0000-0000-000000000001');
select public.delete_my_data();
commit;
select pg_temp.expect(
  (select count(*) from public.ai_usage_day where user_id = 'f0000000-0000-0000-0000-000000000001' and day < public.ai_day()) = 0,
  'A7. Quedó el uso de días anteriores'
);
select pg_temp.expect(
  (select count(*) from public.ai_usage_day where user_id = 'f0000000-0000-0000-0000-000000000001' and day = public.ai_day()) >= 1,
  'A7. Borrar los datos reinició el límite de hoy'
);
select pg_temp.expect(
  (select count(*) from public.ai_call_log where user_id = 'f0000000-0000-0000-0000-000000000001') = 0,
  'A7. Quedó la bitácora de IA del alumno'
);
select pg_temp.expect(
  (select count(*) from public.ai_call_log where user_id = 'f0000000-0000-0000-0000-000000000002') = 1,
  'A7. Se borró la bitácora de otro alumno'
);

-- ===================================================================== A8. Eliminar la cuenta
begin;
select pg_temp.as_user('f0000000-0000-0000-0000-000000000002');
select public.delete_my_account();
commit;
select pg_temp.expect(
  (select count(*) from public.ai_usage_day where user_id = 'f0000000-0000-0000-0000-000000000002') = 0,
  'A8. Quedó el uso de la cuenta eliminada'
);
select pg_temp.expect(
  (select count(*) from public.ai_call_log where user_id = 'f0000000-0000-0000-0000-000000000002') = 0
  and (select count(*) from public.ai_call_log where user_id is null) >= 1,
  'A8. La bitácora debe quedar sin el usuario y no con él'
);

select 'TODAS LAS PRUEBAS DE IA ALOJADA PASARON' as resultado;
