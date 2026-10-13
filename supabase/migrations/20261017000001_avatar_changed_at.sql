-- Foto de perfil, ajustes de la revisión independiente de B2 (comentario 15).
--
-- Qué cambia
--   - private_accounts.avatar_changed_at. Cuándo eligió el alumno su foto o sus iniciales, con la hora
--     del dispositivo donde guardó Tus datos. Entre sus dispositivos gana la elección más reciente, ya
--     sea bajar, subir o quitar la foto, y un dispositivo con una copia vieja ya no impone la suya.
--     null en las filas de antes, que no la conocen. La escribe solo el alumno desde su dispositivo
--     activo, con los permisos de tabla que ya tiene private_accounts y la política accounts_update.
--     La tabla no tiene permisos por columna, así que la columna nueva no necesita otro grant
--   - avatars_select ya no deja pasar a los admins. La foto la ven solo el alumno y quienes comparten
--     con él un grupo activo de Party, desde su dispositivo activo, como pide el plan. Un admin que
--     comparte grupo con el alumno la ve como compañero, no como admin. Se cambia con alter policy,
--     sin quitar la política, así no hay un momento sin regla
--
-- Lo que no cambia y por qué
--   El disparador de respaldo de 20261016000001 sigue en auth.users, pero en el proyecto real no
--   alcanza a quitar la foto. Supabase Storage frena todo borrado de filas de storage.objects hecho con
--   SQL, para no dejar archivos huérfanos en su almacén, así que el respaldo solo deja un aviso en la
--   bitácora de Postgres y la cuenta se borra igual. La app quita la foto con la API de Storage y la
--   sesión del alumno antes de eliminar la cuenta. Las cuentas que se borren desde el panel de
--   Supabase dejan su foto huérfana hasta que exista una limpieza programada con la API (pendiente)
--
-- Es idempotente. Se corre después de 20261016000001_avatars.sql

-- ===================================================================== Fecha de la elección
alter table public.private_accounts add column if not exists avatar_changed_at timestamptz;

comment on column public.private_accounts.avatar_changed_at is
  'Cuándo eligió el alumno su foto o sus iniciales, con la hora de su dispositivo. Entre sus '
  'dispositivos gana la elección más reciente. null en las filas de antes de B2';

-- ===================================================================== Quién ve la foto
-- El dueño y sus compañeros de un grupo activo de Party, los dos desde su dispositivo activo
do $$
begin
  if exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and policyname = 'avatars_select'
  ) then
    alter policy avatars_select on storage.objects
      using (
        bucket_id = 'avatars'
        and (public.avatar_owner(name) = auth.uid() or public.shares_group(public.avatar_owner(name)))
        and (select public.is_active_device())
      );
  else
    create policy avatars_select on storage.objects for select to authenticated
      using (
        bucket_id = 'avatars'
        and (public.avatar_owner(name) = auth.uid() or public.shares_group(public.avatar_owner(name)))
        and (select public.is_active_device())
      );
  end if;
end $$;
