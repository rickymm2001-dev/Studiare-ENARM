-- Fotos de perfil en Supabase Storage (B2 del plan del cambio, comentario 15).
--
-- Qué agrega
--   - El bucket privado avatars. Solo JPEG y hasta 400 KB por archivo, que es más de lo que el
--     navegador puede producir, porque la foto se recorta a 256 por 256 y el esquema local la limita
--     a unos 300 KB
--   - Cada alumno guarda una sola foto en su carpeta, <auth.uid()>/avatar.jpg. La sube, la
--     reemplaza, la borra y la lee solo él, desde su dispositivo activo, igual que private_accounts
--   - La leen también quienes comparten con él un grupo activo de Party (shares_group), desde su
--     dispositivo activo como con los perfiles, y los admins (is_admin). Nadie más, ni sin sesión.
--     20261017000001 quitó a los admins, como pide el plan
--   - Al borrarse una cuenta de auth.users, por borrar mi cuenta o desde el panel, se intenta quitar
--     su foto. Storage no lo deja hacer con SQL (ver Borrado de la cuenta), así que la app la quita
--     con la API antes de eliminar la cuenta. Una foto que quede queda inaccesible para todos, porque
--     las políticas dependen de un alumno y de un grupo que ya no existen
--
-- Qué no cambia
--   private_accounts.avatar sigue siendo jsonb. Con foto guarda
--   {"kind":"photo","path":"<uid>/avatar.jpg","hash":"<huella>"} y la app baja el archivo de Storage.
--   La foto nunca va en la fila. Las cuentas que todavía guardan {"kind":"generated",...} se ven como
--   iniciales en la app
--
-- Es idempotente. Se corre después de 20261015000001_plan_prices.sql. Las políticas se crean solo
-- si no existen, sin drop, y el bucket se actualiza si ya estaba

-- ===================================================================== Bucket
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('avatars', 'avatars', false, 400000, array['image/jpeg'])
  on conflict (id) do update
    set public = false, file_size_limit = 400000, allowed_mime_types = array['image/jpeg'];

-- ===================================================================== Dueño de una ruta
-- El alumno al que pertenece la carpeta de un objeto del bucket, o null si la ruta no tiene la forma
-- <uuid>/avatar.jpg. Lo usan las políticas, así que nunca falla con una ruta rara
create or replace function public.avatar_owner(object_name text) returns uuid
language sql immutable set search_path = public, pg_temp as $$
  select case
    when object_name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/avatar\.jpg$'
    then split_part(object_name, '/', 1)::uuid
  end
$$;
revoke all on function public.avatar_owner(text) from public;
grant execute on function public.avatar_owner(text) to anon, authenticated, service_role;

-- ===================================================================== Permisos por fila
-- La API de Storage lee y escribe storage.objects con el rol y el token de quien llama. Subir con
-- upsert necesita insert, select y update. Bajar necesita select. Borrar necesita select y delete
do $$
begin
  -- Leer. El dueño desde su dispositivo activo, sus compañeros de grupo desde el suyo, y los admins
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and policyname = 'avatars_select'
  ) then
    create policy avatars_select on storage.objects for select to authenticated
      using (
        bucket_id = 'avatars'
        and (
          (
            (public.avatar_owner(name) = auth.uid() or public.shares_group(public.avatar_owner(name)))
            and (select public.is_active_device())
          )
          or public.is_admin()
        )
      );
  end if;

  -- Subir. Solo a la propia carpeta y con el único nombre permitido
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and policyname = 'avatars_insert'
  ) then
    create policy avatars_insert on storage.objects for insert to authenticated
      with check (
        bucket_id = 'avatars'
        and name = auth.uid()::text || '/avatar.jpg'
        and (select public.is_active_device())
      );
  end if;

  -- Reemplazar. Solo la propia foto, y sigue siendo la propia
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and policyname = 'avatars_update'
  ) then
    create policy avatars_update on storage.objects for update to authenticated
      using (
        bucket_id = 'avatars'
        and public.avatar_owner(name) = auth.uid()
        and (select public.is_active_device())
      )
      with check (
        bucket_id = 'avatars'
        and name = auth.uid()::text || '/avatar.jpg'
        and (select public.is_active_device())
      );
  end if;

  -- Borrar. Solo la propia
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and policyname = 'avatars_delete'
  ) then
    create policy avatars_delete on storage.objects for delete to authenticated
      using (
        bucket_id = 'avatars'
        and public.avatar_owner(name) = auth.uid()
        and (select public.is_active_device())
      );
  end if;
end $$;

-- ===================================================================== Borrado de la cuenta
-- Solo un respaldo inofensivo. Supabase Storage tiene el disparador protect_objects_delete
-- (storage.protect_delete), que frena todo borrado de filas de storage.objects hecho con SQL para no
-- dejar archivos huérfanos en su almacén. Por eso aquí el borrado falla, queda un aviso en la bitácora
-- de Postgres y la cuenta se borra igual, porque darse de baja es un derecho del alumno. La foto la
-- quita la app con la API de Storage y la sesión del alumno antes de eliminar la cuenta
-- (20261017000001). security definer porque quien borra puede ser el servicio de Auth, que no tiene
-- permisos sobre storage.objects
create or replace function public.delete_user_avatar() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  begin
    delete from storage.objects
      where bucket_id = 'avatars' and name like (old.id::text || '/%');
  exception when others then
    raise warning 'No se pudo borrar la foto de perfil de la cuenta %. %', old.id, sqlerrm;
  end;
  return old;
end;
$$;
revoke all on function public.delete_user_avatar() from public, anon, authenticated, service_role;

do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'on_auth_user_deleted_avatar' and tgrelid = 'auth.users'::regclass
  ) then
    create trigger on_auth_user_deleted_avatar before delete on auth.users
      for each row execute function public.delete_user_avatar();
  end if;
end $$;
