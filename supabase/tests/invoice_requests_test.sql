-- Pruebas de las facturas a pedido (migración 20261022000003, B10 del plan del cambio, 3.2 del diseño).
-- Corre después de las demás sobre la misma base, con usuarios propios. Cada bloque falla con un error
-- si algo no cumple. La base local de prueba es SQL_ASCII con locale C, así que los datos van sin acentos
-- ni Ñ. En Supabase la base es UTF8 y upper() y el RFC con Ñ funcionan igual que con letras simples.
--   F1 cada dato con IV001, F2 pagos que no se facturan con IV002, F3 solicitud y su correo al equipo,
--   F4 repetida con IV003, F5 el admin, F6 quién ve qué
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

create or replace function pg_temp.expect(ok boolean, msg text) returns void language plpgsql as $$
begin
  if not coalesce(ok, false) then raise exception 'FALLA %', msg; end if;
end $$;

create or replace function pg_temp.is(actual text, expected text, msg text) returns void language plpgsql as $$
begin
  if actual is distinct from expected then
    raise exception 'FALLA % (salió %, se esperaba %)', msg, coalesce(actual, 'null'), coalesce(expected, 'null');
  end if;
end $$;

create or replace function pg_temp.is_blocked(stmt text) returns boolean language plpgsql as $$
begin
  execute stmt;
  return false;
exception when insufficient_privilege then
  return true;
end $$;

-- El código del error y su detail, como los ve la app
create or replace function pg_temp.fails_with(stmt text) returns text language plpgsql as $$
declare
  v_detail text;
begin
  execute stmt;
  return null;
exception when others then
  get stacked diagnostics v_detail = pg_exception_detail;
  return sqlstate || case when coalesce(v_detail, '') <> '' then ':' || v_detail else '' end;
end $$;

-- Pide factura como el alumno, con datos buenos salvo lo que se cambie
create or replace function pg_temp.ask(
  p_payment text,
  p_rfc text default 'XAXX010101000',
  p_name text default 'Ana Pérez López',
  p_regime text default '612',
  p_postal text default '97000',
  p_use text default 'G03',
  p_email text default 'ana@ba.mx'
) returns text language sql as $$
  select format('select public.request_invoice(%L, %L, %L, %L, %L, %L, %L)',
    p_payment, p_rfc, p_name, p_regime, p_postal, p_use, p_email)
$$;

-- ===================================================================== Usuarios y pagos
\set f1 'ba300000-0000-0000-0000-000000000001'
\set f2 'ba300000-0000-0000-0000-000000000002'
\set fadm 'ba300000-0000-0000-0000-0000000000ad'
\set pay_ok 'ba3a0000-0000-0000-0000-000000000001'
\set pay_otro 'ba3a0000-0000-0000-0000-000000000002'
\set pay_pendiente 'ba3a0000-0000-0000-0000-000000000003'
\set pay_devuelto 'ba3a0000-0000-0000-0000-000000000004'
\set pay_cero 'ba3a0000-0000-0000-0000-000000000005'
\set pay_ajeno 'ba3a0000-0000-0000-0000-000000000006'
insert into auth.users (id, email, raw_user_meta_data) values
  (:'f1', 'f1@ba.mx', '{"alias":"Factura"}'),
  (:'f2', 'f2@ba.mx', '{"alias":"Otra persona"}'),
  (:'fadm', 'fadm@ba.mx', '{"alias":"Admin facturas"}');
update public.user_roles set role = 'admin' where user_id = :'fadm';
insert into public.payments (id, user_id, provider, provider_payment_id, amount_mxn, status, purpose, plan, method, paid_at) values
  (:'pay_ok', :'f1', 'stripe', 'in_f_ok', 149, 'paid', 'subscription', 'monthly', 'card', now()),
  (:'pay_otro', :'f1', 'stripe', 'pi_f_otro', 1499, 'paid', 'pass', 'annual', 'spei', now()),
  (:'pay_pendiente', :'f1', 'stripe', 'pi_f_pend', 149, 'pending', 'pass', 'monthly', 'oxxo', null),
  (:'pay_devuelto', :'f1', 'stripe', 'in_f_dev', 149, 'refunded', 'subscription', 'monthly', 'card', now()),
  (:'pay_cero', :'f1', 'stripe', 'in_f_cero', 0, 'paid', 'subscription', 'monthly', 'card', now()),
  (:'pay_ajeno', :'f2', 'stripe', 'in_f_ajeno', 149, 'paid', 'subscription', 'monthly', 'card', now());

-- ===================================================================== F1. Cada dato con IV001
begin;
select pg_temp.as_user(:'f1');
select pg_temp.expect(
  pg_temp.fails_with($q$select public.request_invoice(null, 'XAXX010101000', 'Ana', '612', '97000', 'G03', 'ana@ba.mx')$q$) = 'IV001:payment'
  and pg_temp.fails_with(pg_temp.ask(:'pay_ok', p_rfc => 'XAXX01010100')) = 'IV001:rfc'
  and pg_temp.fails_with(pg_temp.ask(:'pay_ok', p_rfc => '1AXX010101000')) = 'IV001:rfc'
  and pg_temp.fails_with(pg_temp.ask(:'pay_ok', p_name => '   ')) = 'IV001:legal_name'
  and pg_temp.fails_with(pg_temp.ask(:'pay_ok', p_name => repeat('A', 255))) = 'IV001:legal_name'
  and pg_temp.fails_with(pg_temp.ask(:'pay_ok', p_regime => '999')) = 'IV001:tax_regime'
  and pg_temp.fails_with(pg_temp.ask(:'pay_ok', p_postal => '9700')) = 'IV001:postal_code'
  and pg_temp.fails_with(pg_temp.ask(:'pay_ok', p_postal => '97OOO')) = 'IV001:postal_code'
  and pg_temp.fails_with(pg_temp.ask(:'pay_ok', p_use => 'X99')) = 'IV001:cfdi_use'
  and pg_temp.fails_with(pg_temp.ask(:'pay_ok', p_email => 'ana-sin-arroba')) = 'IV001:email'
  and pg_temp.fails_with(pg_temp.ask(:'pay_ok', p_email => 'ana@ba')) = 'IV001:email',
  'F1. Cada dato inválido debía responder IV001 con su campo'
);
rollback;

-- ===================================================================== F2. Pagos que no se facturan
begin;
select pg_temp.as_user(:'f1');
select pg_temp.expect(
  pg_temp.fails_with(pg_temp.ask(:'pay_ajeno')) = 'IV002'
  and pg_temp.fails_with(pg_temp.ask(:'pay_pendiente')) = 'IV002'
  and pg_temp.fails_with(pg_temp.ask(:'pay_devuelto')) = 'IV002'
  and pg_temp.fails_with(pg_temp.ask(:'pay_cero')) = 'IV002'
  and pg_temp.fails_with(pg_temp.ask('ba3a0000-0000-0000-0000-0000000000ff')) = 'IV002',
  'F2. Un pago ajeno, pendiente, devuelto, de 0 o que no existe debía responder IV002'
);
rollback;

-- ===================================================================== F3. Solicitud y su correo al equipo
begin;
select pg_temp.as_user(:'f1');
create temp table f3_id as
  select public.request_invoice(:'pay_ok', ' xaxx-010101-000 ', '  ana   perez  lopez ', ' 612 ', ' 97000 ', 'g03', ' Ana@BA.mx ') as id;
commit;
select pg_temp.expect(
  (select rfc = 'XAXX010101000' and legal_name = 'ANA PEREZ LOPEZ' and tax_regime = '612' and postal_code = '97000'
      and cfdi_use = 'G03' and email = 'ana@ba.mx' and status = 'pending' and user_id = :'f1'
   from public.invoice_requests where id = (select id from f3_id)),
  'F3. La solicitud debía guardarse normalizada y pendiente'
);
select pg_temp.expect(
  (select recipient_role = 'team' and recipient_user is null and status = 'queued'
      and (data ->> 'amountMxn')::numeric = 149 and data ->> 'requestId' = (select id::text from f3_id)
      and not (data ? 'rfc') and strpos(data::text, 'XAXX') = 0
   from public.email_outbox where kind = 'invoice_requested' and dedupe_key = 'invoice_requested:' || (select id::text from f3_id)),
  'F3. Debía encolarse el aviso al equipo sin datos fiscales'
);

-- ===================================================================== F4. Repetida
begin;
select pg_temp.as_user(:'f1');
select pg_temp.is(pg_temp.fails_with(pg_temp.ask(:'pay_ok')), 'IV003', 'F4. Pedir dos veces la factura del mismo pago debía responder IV003');
commit;

-- ===================================================================== F5. El admin
begin;
select pg_temp.as_user(:'fadm');
select pg_temp.expect(
  (select count(*) from public.admin_invoice_requests('pending') r
    where r.id = (select id from f3_id) and r.alias = 'Factura' and r.account_email = 'f1@ba.mx'
      and r.amount_mxn = 149 and r.plan = 'monthly' and r.method = 'card' and r.rfc = 'XAXX010101000'
      and r.total >= 1) = 1
  and (select count(*) from public.admin_invoice_requests('issued') r where r.id = (select id from f3_id)) = 0,
  'F5. La lista del admin no traía la solicitud con su pago'
);
select public.admin_set_invoice_status((select id from f3_id), 'rejected', 'El RFC no coincide con la constancia');
commit;
select pg_temp.expect(
  (select status = 'rejected' and admin_note = 'El RFC no coincide con la constancia' and handled_by = :'fadm'
      and issued_at is null
   from public.invoice_requests where id = (select id from f3_id)),
  'F5. El rechazo no quedó con su nota y quién lo hizo'
);
-- Con la rechazada se puede pedir otra del mismo pago
begin;
select pg_temp.as_user(:'f1');
create temp table f5_id as select public.request_invoice(:'pay_ok', 'PELA800101AB1', 'Ana Pérez', '605', '97000', 'D10', 'ana@ba.mx') as id;
commit;
begin;
select pg_temp.as_user(:'fadm');
select public.admin_set_invoice_status((select id from f5_id), 'issued');
-- Volver a pendiente la rechazada choca con la emitida del mismo pago
select pg_temp.is(pg_temp.fails_with($q$select public.admin_set_invoice_status((select id from f3_id), 'pending')$q$), 'IV003',
  'F5. Dos solicitudes vivas del mismo pago debían rechazarse');
select pg_temp.expect(
  pg_temp.fails_with($q$select public.admin_set_invoice_status((select id from f5_id), 'perdida')$q$) = '22023'
  and pg_temp.fails_with($q$select public.admin_set_invoice_status(gen_random_uuid(), 'issued')$q$) = '22023'
  and pg_temp.fails_with(format('select public.admin_set_invoice_status(%L, %L, %L)', (select id from f5_id), 'issued', repeat('x', 501))) = '22023',
  'F5. Un estado desconocido, una solicitud que no existe o una nota larga debían rechazarse'
);
commit;
select pg_temp.expect(
  (select status = 'issued' and issued_at is not null and admin_note is null from public.invoice_requests where id = (select id from f5_id)),
  'F5. La emitida no quedó con su fecha'
);

-- ===================================================================== F6. Quién ve qué
-- El alumno ve las suyas y nadie más las ve, salvo el admin
begin;
select pg_temp.as_user(:'f1', 'ses-f1-a');
select public.claim_device('dev-f1-a', 'Chrome');
select pg_temp.expect(
  (select count(*) from public.invoice_requests) = 2
  and (select count(*) from public.invoice_requests where status = 'issued') = 1
  and pg_temp.is_blocked($q$insert into public.invoice_requests (user_id, rfc, legal_name, tax_regime, postal_code, cfdi_use, email) values (auth.uid(), 'XAXX010101000', 'X', '612', '97000', 'G03', 'x@ba.mx')$q$)
  and pg_temp.is_blocked($q$update public.invoice_requests set status = 'issued'$q$)
  and pg_temp.fails_with('select * from public.admin_invoice_requests()') = '42501'
  and pg_temp.fails_with($q$select public.admin_set_invoice_status(gen_random_uuid(), 'issued')$q$) = '42501',
  'F6. El alumno debía ver solo sus solicitudes y no cambiarlas'
);
commit;
begin;
select pg_temp.as_user(:'f2');
select pg_temp.is((select count(*) from public.invoice_requests)::text, '0', 'F6. Otra persona vio solicitudes ajenas');
commit;
-- Un dispositivo desplazado no las ve ni pide otra
begin;
select pg_temp.as_user(:'f1', 'ses-f1-b');
select public.claim_device('dev-f1-b', 'Safari');
commit;
begin;
select pg_temp.as_user(:'f1', 'ses-f1-a');
select pg_temp.expect(
  (select count(*) from public.invoice_requests) = 0
  and pg_temp.fails_with(pg_temp.ask(:'pay_otro')) = '42501',
  'F6. El dispositivo desplazado vio o pidió facturas'
);
commit;
begin;
set local role anon;
select pg_temp.expect(
  pg_temp.is_blocked('select * from public.invoice_requests')
  and pg_temp.is_blocked(pg_temp.ask(:'pay_otro'))
  and pg_temp.is_blocked('select * from public.admin_invoice_requests()'),
  'F6. anon llegó a las facturas'
);
rollback;
-- Los datos fiscales se van con la cuenta
delete from auth.users where id = :'f1';
select pg_temp.is((select count(*) from public.invoice_requests where id in ((select id from f3_id), (select id from f5_id)))::text, '0',
  'F6. Las solicitudes debían borrarse con la cuenta');

select 'TODAS LAS PRUEBAS DE FACTURAS A PEDIDO PASARON' as resultado;
