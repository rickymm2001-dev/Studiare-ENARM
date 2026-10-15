-- Facturas a pedido (B10 del plan del cambio, respuesta 12, 3.2 del diseño).
--
-- El alumno pide en Perfil la factura (CFDI) de un pago con sus datos fiscales. La factura la emite
-- Ricardo a mano en su sistema, y aquí solo vive la solicitud con su estado.
--
-- Reglas que se hacen cumplir aquí y no en el navegador
--   - Solo se pide factura de un pago propio, pagado y mayor a 0, y una sola vez por pago mientras la
--     solicitud no esté rechazada (IV002 e IV003)
--   - Cada dato se revisa y se normaliza aquí, aunque la app ya lo haya revisado. RFC y razón social en
--     mayúsculas y sin espacios de más. Un dato que no pasa responde IV001 con el campo en detail
--   - Régimen fiscal y uso del CFDI salen de los catálogos del SAT. Que el uso sea compatible con el
--     régimen lo revisa quien emite (8.23)
--   - El alumno lee solo sus solicitudes desde su dispositivo activo. Solo el admin las ve todas y las
--     marca emitidas o rechazadas. Nadie las escribe por la API, solo con estas funciones
--   - Los datos fiscales son datos personales. Se borran con la cuenta. El correo al equipo no lleva
--     RFC ni datos fiscales, solo el monto
--
-- Es idempotente. Se corre después de 20261022000002_billing_plans.sql. No lleva sentencias delete ni
-- drop y no edita las migraciones anteriores

-- ===================================================================== Tabla
create table if not exists public.invoice_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  payment_id uuid references public.payments (id) on delete set null,
  rfc text not null check (rfc ~ '^[A-ZÑ&]{3,4}[0-9]{6}[A-Z0-9]{3}$'),
  legal_name text not null check (char_length(btrim(legal_name)) between 1 and 254),
  tax_regime text not null check (tax_regime in ('601', '603', '605', '606', '607', '608', '610', '611',
    '612', '614', '615', '616', '620', '621', '622', '623', '624', '625', '626')),
  postal_code text not null check (postal_code ~ '^[0-9]{5}$'),
  cfdi_use text not null check (cfdi_use in ('G01', 'G02', 'G03', 'I01', 'I02', 'I03', 'I04', 'I05', 'I06',
    'I07', 'I08', 'D01', 'D02', 'D03', 'D04', 'D05', 'D06', 'D07', 'D08', 'D09', 'D10', 'S01', 'CP01', 'CN01')),
  email text not null check (char_length(email) <= 254 and email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  status text not null default 'pending' check (status in ('pending', 'issued', 'rejected')),
  admin_note text check (char_length(admin_note) <= 500),
  handled_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  issued_at timestamptz
);
-- Una solicitud viva por pago. Una rechazada deja pedirla otra vez
create unique index if not exists invoice_requests_payment on public.invoice_requests (payment_id)
  where status <> 'rejected';
create index if not exists invoice_requests_status on public.invoice_requests (status, created_at desc);
create index if not exists invoice_requests_user on public.invoice_requests (user_id, created_at desc);

alter table public.invoice_requests enable row level security;
revoke all on public.invoice_requests from public, anon, authenticated, service_role;
grant select on public.invoice_requests to authenticated;
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'invoice_requests' and policyname = 'invoice_requests_select'
  ) then
    create policy invoice_requests_select on public.invoice_requests for select to authenticated
      using ((user_id = auth.uid() and (select public.is_active_device())) or public.is_admin());
  end if;
end $$;

-- ===================================================================== Pedir factura
-- El alumno, con sesión y su dispositivo activo. Devuelve el id de la solicitud
--   IV001 dato inválido, con el nombre del campo en detail (payment, rfc, legal_name, tax_regime,
--         postal_code, cfdi_use o email)
--   IV002 el pago no es tuyo, no está pagado o es de 0
--   IV003 ya hay una solicitud de ese pago
create or replace function public.request_invoice(
  p_payment uuid,
  p_rfc text,
  p_legal_name text,
  p_tax_regime text,
  p_postal_code text,
  p_cfdi_use text,
  p_email text
) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_rfc text := upper(regexp_replace(coalesce(p_rfc, ''), '[[:space:]-]', '', 'g'));
  v_name text := upper(btrim(regexp_replace(coalesce(p_legal_name, ''), '[[:space:]]+', ' ', 'g')));
  v_regime text := btrim(coalesce(p_tax_regime, ''));
  v_postal text := btrim(coalesce(p_postal_code, ''));
  v_use text := upper(btrim(coalesce(p_cfdi_use, '')));
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_amount numeric;
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'Hace falta iniciar sesión' using errcode = '28000';
  end if;
  if not public.is_active_device() then
    raise exception 'Este dispositivo no es el activo de la cuenta' using errcode = '42501';
  end if;
  if p_payment is null then
    raise exception 'Elige el pago' using errcode = 'IV001', detail = 'payment';
  end if;
  if v_rfc !~ '^[A-ZÑ&]{3,4}[0-9]{6}[A-Z0-9]{3}$' then
    raise exception 'Revisa el RFC' using errcode = 'IV001', detail = 'rfc';
  end if;
  if char_length(v_name) not between 1 and 254 then
    raise exception 'Revisa la razón social' using errcode = 'IV001', detail = 'legal_name';
  end if;
  if v_regime not in ('601', '603', '605', '606', '607', '608', '610', '611', '612', '614', '615', '616',
                      '620', '621', '622', '623', '624', '625', '626') then
    raise exception 'Revisa el régimen fiscal' using errcode = 'IV001', detail = 'tax_regime';
  end if;
  if v_postal !~ '^[0-9]{5}$' then
    raise exception 'Revisa el código postal' using errcode = 'IV001', detail = 'postal_code';
  end if;
  if v_use not in ('G01', 'G02', 'G03', 'I01', 'I02', 'I03', 'I04', 'I05', 'I06', 'I07', 'I08', 'D01',
                   'D02', 'D03', 'D04', 'D05', 'D06', 'D07', 'D08', 'D09', 'D10', 'S01', 'CP01', 'CN01') then
    raise exception 'Revisa el uso del CFDI' using errcode = 'IV001', detail = 'cfdi_use';
  end if;
  if char_length(v_email) > 254 or v_email !~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'Revisa el correo' using errcode = 'IV001', detail = 'email';
  end if;

  select amount_mxn into v_amount from public.payments
    where id = p_payment and user_id = v_uid and status = 'paid' and amount_mxn > 0;
  if v_amount is null then
    raise exception 'Ese pago no se puede facturar' using errcode = 'IV002';
  end if;
  -- Dos solicitudes a la vez del mismo pago esperan su turno
  perform pg_advisory_xact_lock(hashtextextended('invoice:' || p_payment::text, 0));
  if exists (
    select 1 from public.invoice_requests where payment_id = p_payment and status <> 'rejected'
  ) then
    raise exception 'Ya pediste factura de este pago' using errcode = 'IV003';
  end if;

  insert into public.invoice_requests (user_id, payment_id, rfc, legal_name, tax_regime, postal_code, cfdi_use, email)
    values (v_uid, p_payment, v_rfc, v_name, v_regime, v_postal, v_use, v_email)
    returning id into v_id;
  -- Aviso al equipo, sin RFC ni datos fiscales (4.1)
  perform public.enqueue_email(
    null, 'team', 'invoice_requested', 'invoice_requested:' || v_id::text,
    jsonb_build_object('requestId', v_id, 'amountMxn', v_amount)
  );
  return v_id;
end;
$$;

-- ===================================================================== Admin
-- Las solicitudes con el alias y el correo de la cuenta, el pago y los datos fiscales. Tope de 100 por
-- página. p_status filtra por estado
create or replace function public.admin_invoice_requests(
  p_status text default null,
  p_limit integer default 50,
  p_offset integer default 0
) returns table (
  id uuid,
  user_id uuid,
  alias text,
  account_email text,
  payment_id uuid,
  amount_mxn numeric,
  paid_at timestamptz,
  plan text,
  method text,
  rfc text,
  legal_name text,
  tax_regime text,
  postal_code text,
  cfdi_use text,
  email text,
  status text,
  admin_note text,
  created_at timestamptz,
  issued_at timestamptz,
  total bigint
)
language plpgsql stable security definer set search_path = public, pg_temp as $$
#variable_conflict use_column
begin
  if auth.uid() is null then
    raise exception 'Hace falta iniciar sesión' using errcode = '28000';
  end if;
  if not public.is_admin() then
    raise exception 'Solo un administrador puede ver las solicitudes de factura' using errcode = '42501';
  end if;
  return query
    select r.id, r.user_id, pr.alias, a.email, r.payment_id, p.amount_mxn, p.paid_at, p.plan, p.method,
           r.rfc, r.legal_name, r.tax_regime, r.postal_code, r.cfdi_use, r.email, r.status, r.admin_note,
           r.created_at, r.issued_at, count(*) over ()
    from public.invoice_requests r
    left join public.profiles pr on pr.id = r.user_id
    left join public.private_accounts a on a.user_id = r.user_id
    left join public.payments p on p.id = r.payment_id
    where p_status is null or r.status = p_status
    order by r.created_at desc, r.id
    limit least(greatest(coalesce(p_limit, 50), 1), 100) offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

-- Marca una solicitud como emitida, rechazada o de nuevo pendiente, con una nota opcional y quién lo hizo
create or replace function public.admin_set_invoice_status(p_id uuid, p_status text, p_note text default null)
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is null then
    raise exception 'Hace falta iniciar sesión' using errcode = '28000';
  end if;
  if not public.is_admin() then
    raise exception 'Solo un administrador puede cambiar una solicitud de factura' using errcode = '42501';
  end if;
  if p_status is null or p_status not in ('pending', 'issued', 'rejected') then
    raise exception 'Estado de factura desconocido' using errcode = '22023';
  end if;
  if p_note is not null and char_length(btrim(p_note)) > 500 then
    raise exception 'La nota tiene hasta 500 caracteres' using errcode = '22023';
  end if;
  begin
    update public.invoice_requests
      set status = p_status,
          admin_note = nullif(btrim(coalesce(p_note, '')), ''),
          handled_by = auth.uid(),
          issued_at = case when p_status = 'issued' then coalesce(issued_at, now()) end,
          updated_at = now()
      where id = p_id;
  exception when unique_violation then
    -- Volver a pendiente una rechazada cuando ese pago ya tiene otra solicitud viva
    raise exception 'Ya hay otra solicitud de ese pago' using errcode = 'IV003';
  end;
  if not found then
    raise exception 'No existe esa solicitud' using errcode = '22023';
  end if;
end;
$$;

-- ===================================================================== Permisos de las funciones
revoke all on function public.request_invoice(uuid, text, text, text, text, text, text) from public, anon, service_role;
grant execute on function public.request_invoice(uuid, text, text, text, text, text, text) to authenticated;
revoke all on function public.admin_invoice_requests(text, integer, integer) from public, anon, service_role;
grant execute on function public.admin_invoice_requests(text, integer, integer) to authenticated;
revoke all on function public.admin_set_invoice_status(uuid, text, text) from public, anon, service_role;
grant execute on function public.admin_set_invoice_status(uuid, text, text) to authenticated;
