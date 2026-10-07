-- Un solo dispositivo activo por cuenta (acuerdo del equipo del 2026-10-07). Evita que se comparta
-- una cuenta.
-- Gana el último dispositivo en entrar. Ese dispositivo reclama la cuenta con claim_device y el
-- anterior lo descubre la siguiente vez que revisa su fila, avisa al alumno y cierra su sesión.
-- Es un freno para el uso normal y no una barrera contra quien manipule su propio navegador.

-- ===================================================================== Dispositivo activo
create table public.device_sessions (
  user_id uuid primary key references auth.users (id) on delete cascade,
  -- Id aleatorio que cada navegador guarda en su almacenamiento local. No identifica a la persona
  device_id text not null check (char_length(device_id) between 1 and 80),
  -- Texto corto y legible como Chrome en Windows. Sin datos personales
  label text not null default '' check (char_length(label) <= 80),
  claimed_at timestamptz not null default now()
);

-- Reclamar la cuenta desde este dispositivo. Reemplaza al dispositivo anterior de quien llama.
-- Única puerta para escribir device_sessions desde la app
create or replace function public.claim_device(p_device_id text, p_label text) returns void
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Se necesita una sesión para reclamar el dispositivo' using errcode = '42501';
  end if;
  if p_device_id is null or btrim(p_device_id) = '' or char_length(p_device_id) > 80 then
    raise exception 'El id del dispositivo debe tener entre 1 y 80 caracteres' using errcode = '22023';
  end if;
  if p_label is not null and char_length(p_label) > 80 then
    raise exception 'La etiqueta del dispositivo no puede pasar de 80 caracteres' using errcode = '22023';
  end if;
  insert into public.device_sessions (user_id, device_id, label, claimed_at)
    values (uid, p_device_id, coalesce(p_label, ''), now())
    on conflict (user_id) do update
      set device_id = excluded.device_id, label = excluded.label, claimed_at = excluded.claimed_at;
end;
$$;

-- ===================================================================== Permisos por fila
alter table public.device_sessions enable row level security;

-- Cada quien lee solo su fila. Nadie la escribe directo, solo con claim_device. Ni el admin la ve
create policy device_sessions_select on public.device_sessions for select to authenticated
  using (user_id = auth.uid());

-- Solo una sesión iniciada llama a la función. En Supabase anon recibe permiso de ejecución por
-- defecto, por eso se le quita de forma explícita además de quitárselo a public
revoke all on function public.claim_device(text, text) from public, anon;
grant execute on function public.claim_device(text, text) to authenticated;
