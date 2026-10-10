-- Usuarios reales para el admin y el dueño (Fase H, D-108).
--
-- La pantalla Usuarios solo veía los perfiles del navegador, así que con la nube conectada no podía
-- nombrar a un médico de verdad. Esta migración le da la lista de cuentas de Supabase. Cambiar el rol
-- ya lo hace set_user_role, que no se toca.
--
-- Reglas que se hacen cumplir aquí y no en el navegador
--   - Solo un admin o el dueño llama a admin_list_users. Cualquier otra persona recibe 42501 y anon ni
--     siquiera puede ejecutarla
--   - Devuelve lo que hace falta para decidir un rol y nada más. Alias, correo, rol, plan, fecha de
--     alta y el total de cuentas que cumplen el filtro. No devuelve datos de cuenta, ni pagos, ni
--     estudio
--   - El tamaño de la página tiene tope de 100, para que no sirva de descarga masiva de correos
--
-- Es idempotente. Se corre después de 20261012000001_client_errors.sql. No edita las migraciones anteriores

create or replace function public.admin_list_users(
  p_query text default null,
  p_role text default null,
  p_limit integer default 50,
  p_offset integer default 0
) returns table (
  user_id uuid,
  alias text,
  email text,
  role text,
  plan text,
  created_at timestamptz,
  total bigint
)
language plpgsql stable security definer set search_path = public, pg_temp as $$
#variable_conflict use_column
declare
  v_like text;
  v_role public.app_role;
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 100);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
begin
  if auth.uid() is null then
    raise exception 'Hace falta iniciar sesión' using errcode = '28000';
  end if;
  if not public.is_admin() then
    raise exception 'Solo un administrador puede ver los usuarios' using errcode = '42501';
  end if;
  -- Los comodines del texto buscado se buscan tal cual
  if p_query is not null and btrim(p_query) <> '' then
    v_like := '%' || replace(replace(replace(btrim(p_query), '\', '\\'), '%', '\%'), '_', '\_') || '%';
  end if;
  if p_role in ('student', 'physician', 'admin', 'owner') then
    v_role := p_role::public.app_role;
  end if;
  return query
    select
      p.id,
      p.alias,
      a.email,
      coalesce(r.role, 'student'::public.app_role)::text,
      public.user_plan(p.id),
      p.created_at,
      count(*) over ()
    from public.profiles p
    left join public.private_accounts a on a.user_id = p.id
    left join public.user_roles r on r.user_id = p.id
    where (v_role is null or coalesce(r.role, 'student'::public.app_role) = v_role)
      and (v_like is null or p.alias ilike v_like or a.email ilike v_like)
    order by
      case coalesce(r.role, 'student'::public.app_role)
        when 'owner' then 0 when 'admin' then 1 when 'physician' then 2 else 3
      end,
      p.created_at desc,
      p.id
    limit v_limit offset v_offset;
end;
$$;

revoke all on function public.admin_list_users(text, text, integer, integer) from public, anon, service_role;
grant execute on function public.admin_list_users(text, text, integer, integer) to authenticated;
