-- Party. Qué pasa con un grupo cuando quien lo administra borra su cuenta (B7 del plan del cambio).
--
-- Qué hace
--   Hasta ahora groups.owner_id borraba en cascada. Si quien creó un grupo borraba su cuenta, el grupo
--   se borraba para todos sus miembros, con sus retos y sus duelos. Con este archivo
--   - Antes de borrar la cuenta, cada grupo que administraba pasa al miembro activo más antiguo, el
--     que entró primero. Si ya no queda ningún otro miembro activo, el grupo se borra, porque nadie lo
--     usaría
--   - La llave foránea de owner_id cambia a on delete set null. Si algo se saltara el paso anterior,
--     el grupo se queda sin quien lo administre, pero no se borra para nadie. La app lo tolera, nadie
--     lo ve como suyo y los demás siguen usándolo
--
-- Por qué está aquí y no en una migración
--   Cambiar la regla de la llave pide quitarla y volverla a poner (drop constraint) y quitar el not
--   null de owner_id, y el paso de antes borra un grupo vacío. La herramienta con la que Claude
--   aplica migraciones pide una confirmación humana para toda sentencia con drop o delete, y en una
--   sesión en la nube no hay dónde darla. Va después de 20261018000001_party_cloud.sql
--
-- Cómo usarlo
--   Pega el archivo completo en Supabase, SQL Editor, y ejecútalo una vez. Es repetible, así que
--   correrlo dos veces no daña nada. Las pruebas SQL de supabase/tests lo corren dos veces.
--
-- Cómo comprobarlo
--   La consulta del final debe dar regla_al_borrar en n, owner_id_opcional en true y
--   disparador_activo en true. n es on delete set null. Si regla_al_borrar sale en c, sigue la regla
--   de antes y el archivo no se aplicó

begin;

-- ===================================================================== Llave foránea de owner_id
alter table public.groups alter column owner_id drop not null;

-- Se busca la llave por sus columnas y no por su nombre, por si en el proyecto se llama distinto. Solo
-- se cambia si todavía no es on delete set null, así correrlo otra vez no toca nada
do $$
declare
  r record;
begin
  for r in
    select c.conname
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
    where c.conrelid = 'public.groups'::regclass
      and c.contype = 'f'
      and c.confrelid = 'auth.users'::regclass
      and cardinality(c.conkey) = 1
      and a.attname = 'owner_id'
      and c.confdeltype <> 'n'
  loop
    execute format('alter table public.groups drop constraint %I', r.conname);
    execute format(
      'alter table public.groups add constraint %I foreign key (owner_id) references auth.users (id) on delete set null',
      r.conname
    );
  end loop;
end $$;

-- ===================================================================== Pasar el grupo al borrar la cuenta
-- Corre antes de borrar la fila de auth.users, por borrar mi cuenta o desde el panel, antes de
-- cualquier cascada, así el resultado no depende del orden en que Postgres las corre. security
-- definer porque quien borra puede ser el servicio de Auth, sin permisos sobre public.groups
create or replace function public.party_hand_over_groups() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  r record;
  v_heir uuid;
begin
  for r in select id from public.groups where owner_id = old.id for update loop
    select m.user_id into v_heir
      from public.memberships m
      where m.group_id = r.id and m.left_at is null and m.user_id <> old.id
      order by m.joined_at, m.user_id
      limit 1;
    if v_heir is null then
      delete from public.groups where id = r.id;
    else
      update public.groups set owner_id = v_heir where id = r.id;
    end if;
  end loop;
  return old;
end;
$$;
revoke all on function public.party_hand_over_groups() from public, anon, authenticated, service_role;

do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'on_auth_user_deleted_party' and tgrelid = 'auth.users'::regclass
  ) then
    create trigger on_auth_user_deleted_party before delete on auth.users
      for each row execute function public.party_hand_over_groups();
  end if;
end $$;

commit;

-- ===================================================================== Comprobación
select
  (select string_agg(c.confdeltype::text, ',')
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
    where c.conrelid = 'public.groups'::regclass and c.contype = 'f' and a.attname = 'owner_id') as regla_al_borrar,
  (select not attnotnull from pg_attribute
    where attrelid = 'public.groups'::regclass and attname = 'owner_id') as owner_id_opcional,
  exists (
    select 1 from pg_trigger
    where tgname = 'on_auth_user_deleted_party' and tgrelid = 'auth.users'::regclass and tgenabled <> 'D'
  ) as disparador_activo;
