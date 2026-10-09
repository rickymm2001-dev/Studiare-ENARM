-- Registro de errores del navegador (Fase G, G5, D-107).
--
-- Reglas que se hacen cumplir aquí y no en el navegador
--   - No se guarda quién fue. La tabla no tiene usuario, ni correo, ni IP. Solo qué falló, en qué
--     pantalla, en qué versión de la app y cuántas veces. El navegador ya quita correos, ids y números
--     largos del texto antes de mandarlo, y aquí se vuelve a recortar y limpiar
--   - Lo puede mandar cualquiera, incluso sin sesión, porque un error puede ocurrir antes de entrar.
--     Para que no sirva de basurero hay un tope de filas distintas por día. Pasado el tope, los errores
--     nuevos se descartan y los que ya estaban solo suman su conteo
--   - Solo un admin o el dueño los lee. Nadie los edita desde la app
--   - Se guardan 14 días. Al primer reporte de cada día se borra lo anterior
--
-- Es idempotente. Se corre después de 20261011000001_billing_portal.sql. No edita las migraciones anteriores

create table if not exists public.client_errors (
  day date not null,
  fingerprint text not null check (char_length(fingerprint) between 8 and 64),
  kind text not null check (kind in ('error', 'rejection', 'render')),
  message text not null check (char_length(message) <= 300),
  stack text check (stack is null or char_length(stack) <= 1500),
  screen text not null check (char_length(screen) <= 80),
  version text not null check (char_length(version) <= 40),
  occurrences integer not null default 1 check (occurrences >= 1),
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  primary key (day, fingerprint)
);
alter table public.client_errors enable row level security;
revoke all on public.client_errors from public, anon, authenticated;
grant select on public.client_errors to authenticated;
drop policy if exists client_errors_admin_read on public.client_errors;
create policy client_errors_admin_read on public.client_errors for select to authenticated
  using (public.is_admin());

-- Cuántas filas distintas se aceptan por día y cuántos días se conservan
create or replace function public.client_errors_daily_cap() returns integer
language sql immutable set search_path = public, pg_temp as $$ select 500 $$;
create or replace function public.client_errors_keep_days() returns integer
language sql immutable set search_path = public, pg_temp as $$ select 14 $$;

-- Devuelve recorded, counted, full o invalid. Nunca lanza por datos raros, para que un error al
-- reportar un error no cause otro
create or replace function public.report_client_error(
  p_fingerprint text,
  p_kind text,
  p_message text,
  p_stack text,
  p_screen text,
  p_version text
) returns text
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_day date := (now() at time zone 'UTC')::date;
  v_message text;
  v_stack text;
  v_screen text;
  v_version text;
begin
  if p_kind is null or p_kind not in ('error', 'rejection', 'render')
     or p_fingerprint is null or p_fingerprint !~ '^[0-9a-f]{8,64}$' then
    return 'invalid';
  end if;
  v_message := left(btrim(regexp_replace(coalesce(p_message, ''), '[[:cntrl:]]+', ' ', 'g')), 300);
  v_stack := left(regexp_replace(coalesce(p_stack, ''), '[^[:print:]' || chr(10) || ']+', ' ', 'g'), 1500);
  v_screen := left(regexp_replace(coalesce(p_screen, ''), '[[:cntrl:]]+', ' ', 'g'), 80);
  v_version := left(regexp_replace(coalesce(p_version, ''), '[[:cntrl:]]+', ' ', 'g'), 40);
  if v_message = '' then return 'invalid'; end if;

  -- El primer reporte del día limpia lo viejo
  if not exists (select 1 from public.client_errors where day = v_day) then
    delete from public.client_errors where day < v_day - public.client_errors_keep_days();
  end if;

  update public.client_errors set occurrences = occurrences + 1, last_seen = now()
    where day = v_day and fingerprint = p_fingerprint;
  if found then return 'counted'; end if;

  if (select count(*) from public.client_errors where day = v_day) >= public.client_errors_daily_cap() then
    return 'full';
  end if;
  insert into public.client_errors (day, fingerprint, kind, message, stack, screen, version)
    values (v_day, p_fingerprint, p_kind, v_message, nullif(v_stack, ''), v_screen, v_version)
    on conflict (day, fingerprint) do update
      set occurrences = public.client_errors.occurrences + 1, last_seen = now();
  return 'recorded';
exception when others then
  return 'invalid';
end;
$$;

revoke all on function public.report_client_error(text, text, text, text, text, text) from public, anon, authenticated, service_role;
grant execute on function public.report_client_error(text, text, text, text, text, text) to anon, authenticated;
revoke all on function public.client_errors_daily_cap() from public, anon, authenticated, service_role;
revoke all on function public.client_errors_keep_days() from public, anon, authenticated, service_role;
