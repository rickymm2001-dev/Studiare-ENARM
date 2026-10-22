-- Acceso gratis por mazo, topes por alumno y confirmación del dueño ligada a la versión (fase 2 del plan
-- V4, auditoría de V4-B10). Sigue a 20261023000005_deck_catalog.sql y a 20261021000001_free_plan_locks.sql.
--
-- Qué agrega
--   - Acceso gratis por mazo. deck_catalog.free_access deja que el plan Gratis baje un mazo publicado
--     sin abrirle el resto del catálogo, como pidió Paco con Urgencias. Lo cambia el admin con
--     admin_deck_catalog_set_free_access y no depende de la clave de ningún mazo. deck_catalog_can_download_deck
--     decide por mazo y la usan deck_catalog_can_read (la política de Storage), record_deck_download y
--     deck_catalog_list, que además del canDownload de siempre devuelve el de cada mazo
--   - Topes por alumno en la tabla platform_quota_settings, sin permisos ni políticas, que cambia el
--     equipo con SQL. record_deck_download frena a más de deck_downloads_per_day bajadas en 24 horas
--     (BK012) y a los bytes que pasan de lo que declara el submazo. sync_push_records frena, con SY003,
--     una subida que dejaría a la cuenta con más de sync_records registros o sync_bytes bytes. Los
--     valores de fábrica sobran para un alumno real, porque el importador pasa de 50 mil notas con
--     IMPORT_LIMITS y el tope deja 12 veces eso en registros
--   - Confirmación por versión. deck_catalog.authorization_confirmed_version es la versión más alta
--     que el dueño confirmó. Publicar una versión de un mazo de terceros pide que esté confirmada, y
--     un mazo de terceros solo se lee o se lista si lo confirmado alcanza la versión publicada, así la
--     versión que ya estaba publicada sigue a la vista mientras la nueva espera al dueño. Cambiar la
--     licencia o la nota sigue quitando toda la confirmación
--
-- Es idempotente y no lleva drop ni delete (D-113). Corre en las dos pasadas de pg_migrate.

-- ===================================================================== Topes por alumno
create table if not exists public.platform_quota_settings (
  key text primary key check (key in ('sync_records', 'sync_bytes', 'deck_downloads_per_day')),
  value bigint not null check (value >= 0),
  updated_at timestamptz not null default now()
);
alter table public.platform_quota_settings enable row level security;
revoke all on table public.platform_quota_settings from public, anon, authenticated, service_role;
-- No pisa un valor que el equipo ya haya cambiado
insert into public.platform_quota_settings (key, value) values
  ('sync_records', 600000),
  ('sync_bytes', 400000000),
  ('deck_downloads_per_day', 500)
  on conflict (key) do nothing;

-- El tope vigente. Si falta la fila se usa el de fábrica, así borrar un ajuste nunca deja un tope en cero
create or replace function public.platform_quota(p_key text) returns bigint
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(
    (select q.value from public.platform_quota_settings q where q.key = p_key),
    case p_key
      when 'sync_records' then 600000::bigint
      when 'sync_bytes' then 400000000::bigint
      when 'deck_downloads_per_day' then 500::bigint
    end)
$$;
revoke all on function public.platform_quota(text) from public, anon, authenticated, service_role;

-- ===================================================================== Columnas del catálogo
alter table public.deck_catalog add column if not exists free_access boolean not null default false;
alter table public.deck_catalog add column if not exists authorization_confirmed_version integer
  check (authorization_confirmed_version >= 1);
-- Lo que el dueño ya había confirmado antes de esta migración cubre todas las versiones que existen. Sin
-- esto un mazo de terceros confirmado dejaría de verse
update public.deck_catalog d
  set authorization_confirmed_version = (
    select max(v.version) from public.deck_catalog_versions v where v.deck_key = d.deck_key)
  where d.license = 'third_party' and d.authorization_confirmed_at is not null
    and d.authorization_confirmed_version is null;

-- Sin confirmación no hay versión confirmada. admin_deck_catalog_register quita authorization_confirmed_at
-- cuando cambian la licencia o la nota, y esta regla arrastra la versión con ella
create or replace function public.deck_catalog_confirmation_sync() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if new.authorization_confirmed_at is null then
    new.authorization_confirmed_version := null;
  end if;
  return new;
end;
$$;
revoke all on function public.deck_catalog_confirmation_sync() from public, anon, authenticated, service_role;
create or replace trigger deck_catalog_confirmation_sync
  before insert or update on public.deck_catalog
  for each row execute function public.deck_catalog_confirmation_sync();

-- ===================================================================== Quién baja qué
-- La regla de licencia de una versión. Uno propio siempre. Uno de terceros solo si el dueño confirmó esa
-- versión o una más nueva
create or replace function public.deck_catalog_license_ok(
  p_license text, p_confirmed_at timestamptz, p_confirmed_version integer, p_version integer
) returns boolean
language sql immutable set search_path = public, pg_temp as $$
  select p_license = 'own'
    or (p_confirmed_at is not null and coalesce(p_confirmed_version, 0) >= coalesce(p_version, 1))
$$;
revoke all on function public.deck_catalog_license_ok(text, timestamptz, integer, integer)
  from public, anon, authenticated, service_role;

-- Quien baja todo el catálogo (plan de pago o equipo) baja cualquier mazo. Gratis solo baja los publicados
-- que el admin dejó abiertos y cuya licencia está en regla
create or replace function public.deck_catalog_can_download_deck(p_deck_key text) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select public.deck_catalog_can_download()
    or (auth.uid() is not null and exists (
      select 1 from public.deck_catalog d
      where d.deck_key = p_deck_key and d.status = 'published' and d.published_version is not null
        and d.free_access
        and public.deck_catalog_license_ok(
          d.license, d.authorization_confirmed_at, d.authorization_confirmed_version, d.published_version)
    ))
$$;
revoke all on function public.deck_catalog_can_download_deck(text) from public, anon, authenticated, service_role;

-- La usa la política deck_catalog_select. Quien puede bajar ese mazo, dispositivo activo y un archivo de
-- la versión publicada de un mazo publicado, propio o de terceros con esa versión confirmada
create or replace function public.deck_catalog_can_read(p_object_name text) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((
    select public.deck_catalog_can_download_deck(p.deck_key) and public.is_active_device()
      and exists (
        select 1 from public.deck_catalog_expected(p.deck_key, p.version) e where e.path = p_object_name
      )
      and exists (
        select 1 from public.deck_catalog d
        join public.deck_catalog_versions v on v.deck_key = d.deck_key and v.version = d.published_version
        where d.deck_key = p.deck_key and d.status = 'published' and v.version = p.version and v.status = 'published'
          and public.deck_catalog_license_ok(
            d.license, d.authorization_confirmed_at, d.authorization_confirmed_version, d.published_version)
      )
    from public.deck_catalog_path(p_object_name) p
  ), false)
$$;
revoke all on function public.deck_catalog_can_read(text) from public, anon, authenticated, service_role;
grant execute on function public.deck_catalog_can_read(text) to authenticated;

-- Los mazos publicados con sus submazos y tamaños. canDownload es el de todo el catálogo y cada mazo trae el
-- suyo, que en Gratis es verdadero solo en los que el admin dejó abiertos. Uno de terceros solo sale con su
-- versión publicada confirmada por el dueño
create or replace function public.deck_catalog_list() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is null then
    raise exception 'Hace falta iniciar sesión' using errcode = '28000';
  end if;
  if not public.is_active_device() then
    raise exception 'Este dispositivo no es el activo de la cuenta' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'canDownload', public.deck_catalog_can_download(),
    'decks', coalesce((
      select jsonb_agg(jsonb_build_object(
          'deckKey', d.deck_key, 'name', d.name, 'author', d.author, 'description', d.description,
          'version', d.published_version,
          'canDownload', public.deck_catalog_can_download_deck(d.deck_key),
          'notes', (select coalesce(sum(s.notes), 0) from public.deck_catalog_subjects s
                    where s.deck_key = d.deck_key and s.version = d.published_version),
          'cards', (select coalesce(sum(s.cards), 0) from public.deck_catalog_subjects s
                    where s.deck_key = d.deck_key and s.version = d.published_version),
          'bytes', (select coalesce(sum(s.json_bytes + s.media_bytes), 0) from public.deck_catalog_subjects s
                    where s.deck_key = d.deck_key and s.version = d.published_version),
          'subjects', coalesce((
            select jsonb_agg(jsonb_build_object(
                'subjectKey', s.subject_key, 'name', s.name, 'branch', s.branch, 'topic', s.topic,
                'notes', s.notes, 'cards', s.cards, 'bytes', s.json_bytes + s.media_bytes,
                'mediaParts', s.media_parts, 'sha256', s.sha256) order by s.name, s.subject_key)
            from public.deck_catalog_subjects s
            where s.deck_key = d.deck_key and s.version = d.published_version), '[]'::jsonb),
          'preview', d.preview) order by d.name, d.deck_key)
      from public.deck_catalog d
      where d.status = 'published' and d.published_version is not null
        and public.deck_catalog_license_ok(
          d.license, d.authorization_confirmed_at, d.authorization_confirmed_version, d.published_version)), '[]'::jsonb)
  );
end;
$$;
revoke all on function public.deck_catalog_list() from public, anon, authenticated, service_role;
grant execute on function public.deck_catalog_list() to authenticated;

-- Deja constancia de una bajada de un submazo. Solo de quien puede bajar ese mazo, de una versión que existe,
-- con los bytes que declara el submazo como tope y hasta deck_downloads_per_day bajadas por alumno en 24 horas
-- (BK012). Un alumno normal baja decenas de submazos al día, no cientos
create or replace function public.record_deck_download(
  p_deck_key text, p_version integer, p_subject_key text, p_bytes bigint
) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_declared bigint;
begin
  if auth.uid() is null then
    raise exception 'Hace falta iniciar sesión' using errcode = '28000';
  end if;
  if not public.is_active_device() or not public.deck_catalog_can_download_deck(p_deck_key) then
    raise exception 'Bajar mazos del catálogo es de los planes de pago' using errcode = '42501';
  end if;
  select s.json_bytes + s.media_bytes into v_declared
    from public.deck_catalog_subjects s
    join public.deck_catalog_versions v on v.deck_key = s.deck_key and v.version = s.version
    where s.deck_key = p_deck_key and s.version = p_version and s.subject_key = p_subject_key
      and v.status in ('published', 'retired');
  if v_declared is null or p_bytes is null or p_bytes < 0 or p_bytes > 2000000000 or p_bytes > v_declared then
    raise exception 'Ese submazo no existe en el catálogo' using errcode = '22023';
  end if;
  if (select count(*) from public.deck_catalog_downloads w
      where w.user_id = auth.uid() and w.created_at > now() - interval '24 hours')
     >= public.platform_quota('deck_downloads_per_day') then
    raise exception 'Llegaste al tope de bajadas del día' using errcode = 'BK012';
  end if;
  insert into public.deck_catalog_downloads (user_id, deck_key, version, subject_key, bytes)
    values (auth.uid(), p_deck_key, p_version, p_subject_key, p_bytes);
end;
$$;
revoke all on function public.record_deck_download(text, integer, text, bigint) from public, anon, authenticated, service_role;
grant execute on function public.record_deck_download(text, integer, text, bigint) to authenticated;

-- ===================================================================== Del admin
-- Deja un mazo abierto o cerrado para el plan Gratis. No cambia lo que ya bajó nadie. Responde free o paid
create or replace function public.admin_deck_catalog_set_free_access(p_deck_key text, p_free boolean) returns text
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform public.bank_require_admin();
  if p_free is null then
    raise exception 'Falta decir si el mazo va abierto en Gratis' using errcode = '22023';
  end if;
  update public.deck_catalog set free_access = p_free, updated_at = now() where deck_key = p_deck_key;
  if not found then
    raise exception 'Ese mazo no existe' using errcode = '22023';
  end if;
  return case when p_free then 'free' else 'paid' end;
end;
$$;
revoke all on function public.admin_deck_catalog_set_free_access(text, boolean) from public, anon, authenticated, service_role;
grant execute on function public.admin_deck_catalog_set_free_access(text, boolean) to authenticated;

-- Publica una versión en subida. Revisa que cada archivo esperado esté en Storage con el tamaño del
-- manifiesto (BK011) y después la autorización (BK010), que en un mazo de terceros pide el dueño confirmado
-- para esa versión. La versión publicada antes pasa a retirada
create or replace function public.admin_deck_catalog_publish(p_deck_key text, p_version integer) returns text
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_deck public.deck_catalog%rowtype;
  v_status text;
begin
  perform public.bank_require_admin();
  perform pg_advisory_xact_lock(hashtextextended('deck-catalog:' || coalesce(p_deck_key, ''), 0));
  select * into v_deck from public.deck_catalog where deck_key = p_deck_key for update;
  select status into v_status from public.deck_catalog_versions where deck_key = p_deck_key and version = p_version;
  if v_deck.deck_key is null or v_status is null then
    raise exception 'Esa versión del mazo no existe' using errcode = '22023';
  end if;
  if v_status = 'published' then
    return 'already_published';
  end if;
  if v_status <> 'uploading' then
    raise exception 'Esa versión ya no está en subida' using errcode = '22023';
  end if;
  -- Cada archivo esperado, y los tamaños del .json y de las imágenes como dice el manifiesto
  if exists (
    select 1 from public.deck_catalog_expected(p_deck_key, p_version) e
    where not exists (select 1 from storage.objects o where o.bucket_id = 'deck-catalog' and o.name = e.path)
  ) or exists (
    select 1 from public.deck_catalog_subjects s
    where s.deck_key = p_deck_key and s.version = p_version and (
      (select coalesce(sum((o.metadata ->> 'size')::bigint), -1)
         from public.deck_catalog_expected(p_deck_key, p_version) e
         join storage.objects o on o.bucket_id = 'deck-catalog' and o.name = e.path
         where e.subject_key = s.subject_key and e.content_type = 'application/json'
           and o.metadata ->> 'size' ~ '^[0-9]{1,12}$') <> s.json_bytes
      or (s.media_parts > 0 and (select coalesce(sum((o.metadata ->> 'size')::bigint), -1)
         from public.deck_catalog_expected(p_deck_key, p_version) e
         join storage.objects o on o.bucket_id = 'deck-catalog' and o.name = e.path
         where e.subject_key = s.subject_key and e.content_type = 'application/zip'
           and o.metadata ->> 'size' ~ '^[0-9]{1,12}$') <> s.media_bytes)
    )
  ) then
    raise exception 'Faltan archivos de la versión del mazo o no tienen el tamaño esperado' using errcode = 'BK011';
  end if;
  if v_deck.license = 'third_party'
     and (v_deck.authorization_note is null or v_deck.authorization_confirmed_at is null
       or coalesce(v_deck.authorization_confirmed_version, 0) < p_version) then
    raise exception 'El dueño no ha confirmado la autorización de esta versión del mazo' using errcode = 'BK010';
  end if;
  update public.deck_catalog_versions set status = 'retired'
    where deck_key = p_deck_key and status = 'published';
  update public.deck_catalog_versions set status = 'published', published_at = now()
    where deck_key = p_deck_key and version = p_version;
  update public.deck_catalog set status = 'published', published_version = p_version,
      preview = (select preview from public.deck_catalog_versions where deck_key = p_deck_key and version = p_version),
      updated_at = now()
    where deck_key = p_deck_key;
  return 'published';
end;
$$;
revoke all on function public.admin_deck_catalog_publish(text, integer) from public, anon, authenticated, service_role;
grant execute on function public.admin_deck_catalog_publish(text, integer) to authenticated;

-- Solo el dueño confirma la autorización escrita de un mazo de terceros, con la nota de quién autorizó,
-- cuándo y dónde vive el documento (respuestas 46 y 49). Confirma la versión más nueva que existe, la que
-- está esperando publicarse o la ya publicada, y la confirmación de una versión cubre las anteriores
create or replace function public.owner_confirm_deck_authorization(p_deck_key text, p_note text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if auth.uid() is null then
    raise exception 'Hace falta iniciar sesión' using errcode = '28000';
  end if;
  if public.current_app_role() <> 'owner' then
    raise exception 'Solo el dueño confirma autorizaciones' using errcode = '42501';
  end if;
  if v_note is null or char_length(v_note) > 500 then
    raise exception 'La nota de la autorización es obligatoria y de hasta 500 caracteres' using errcode = '22023';
  end if;
  update public.deck_catalog d set authorization_note = v_note, authorization_confirmed_at = now(),
      authorization_confirmed_by = auth.uid(), updated_at = now(),
      authorization_confirmed_version = greatest(
        coalesce(d.authorization_confirmed_version, 0),
        coalesce((select max(v.version) from public.deck_catalog_versions v where v.deck_key = d.deck_key), 1))
    where d.deck_key = p_deck_key and d.license = 'third_party';
  if not found then
    raise exception 'Ese mazo no existe o no es de terceros' using errcode = '22023';
  end if;
end;
$$;
revoke all on function public.owner_confirm_deck_authorization(text, text) from public, anon, authenticated, service_role;
grant execute on function public.owner_confirm_deck_authorization(text, text) to authenticated;

-- El catálogo completo para la pantalla del admin, también borradores, versiones en subida y retirados. Dice
-- si el mazo va abierto en Gratis y, en uno de terceros, qué versión está esperando la confirmación del dueño
create or replace function public.admin_deck_catalog_overview() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform public.bank_require_admin();
  return coalesce((
    select jsonb_agg(jsonb_build_object(
        'deckKey', d.deck_key, 'name', d.name, 'author', d.author, 'description', d.description,
        'license', d.license, 'authorizationNote', d.authorization_note,
        'authorizationConfirmedAt', public.bank_iso(d.authorization_confirmed_at),
        'authorizationConfirmedVersion', d.authorization_confirmed_version,
        'pendingConfirmationVersion', case when d.license = 'third_party' then (
          select max(v.version) from public.deck_catalog_versions v
          where v.deck_key = d.deck_key and v.status = 'uploading'
            and (d.authorization_confirmed_at is null or v.version > coalesce(d.authorization_confirmed_version, 0))
        ) end,
        'freeAccess', d.free_access,
        'status', d.status, 'publishedVersion', d.published_version,
        'versions', coalesce((
          select jsonb_agg(jsonb_build_object(
              'version', v.version, 'status', v.status, 'createdAt', public.bank_iso(v.created_at),
              'publishedAt', public.bank_iso(v.published_at),
              'files', (select count(*) from public.deck_catalog_expected(v.deck_key, v.version)),
              'uploaded', (select count(*) from public.deck_catalog_expected(v.deck_key, v.version) e
                           join storage.objects o on o.bucket_id = 'deck-catalog' and o.name = e.path))
              order by v.version desc)
          from public.deck_catalog_versions v where v.deck_key = d.deck_key), '[]'::jsonb),
        'downloads', (select count(*) from public.deck_catalog_downloads w where w.deck_key = d.deck_key))
        order by d.name, d.deck_key)
    from public.deck_catalog d), '[]'::jsonb);
end;
$$;
revoke all on function public.admin_deck_catalog_overview() from public, anon, authenticated, service_role;
grant execute on function public.admin_deck_catalog_overview() to authenticated;

-- ===================================================================== Cuota de sincronización
-- Igual que en 20261021000001_free_plan_locks.sql, salvo la cuota por alumno. Después de guardar una
-- subida que cambió algo se cuenta lo que la cuenta tiene en sync_records, con el tamaño guardado de cada
-- registro (pg_column_size, sin descomprimir). Si pasa de sync_records registros o de sync_bytes bytes se
-- rechaza la subida entera con SY003 y no queda nada de ella. Una subida que no cambia nada no cuenta, así
-- que quien ya pasó el tope sigue bajando, y los eventos tienen su propia puerta. El conteo es lineal en lo
-- que la cuenta tiene y el tope lo acota
create or replace function public.sync_push_records(p_records jsonb) returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_user uuid := auth.uid();
  v_rec jsonb;
  v_changed integer := 0;
  v_rows integer;
  v_updated timestamptz;
  v_deleted timestamptz;
  v_outlines_open boolean;
  v_used_records bigint;
  v_used_bytes bigint;
begin
  if v_user is null then
    raise exception 'Hace falta iniciar sesión' using errcode = '28000';
  end if;
  if not public.is_active_device() then
    raise exception 'Este dispositivo no es el activo de la cuenta' using errcode = '42501';
  end if;
  if p_records is null or jsonb_typeof(p_records) <> 'array' then
    raise exception 'Se esperaba un arreglo de registros' using errcode = '22023';
  end if;
  if jsonb_array_length(p_records) > 500 then
    raise exception 'Máximo 500 registros por subida' using errcode = '22023';
  end if;
  -- Apuntes es de los planes de pago (respuesta 20). El plan se revisa una vez por subida
  v_outlines_open := public.caller_has_paid_plan();

  perform pg_advisory_xact_lock(hashtextextended('sync:' || v_user::text, 0));

  for v_rec in select value from jsonb_array_elements(p_records) loop
    if jsonb_typeof(v_rec) <> 'object'
       or (v_rec ->> 'kind') is null
       or (v_rec ->> 'kind') not in ('deck', 'note', 'card', 'outline', 'widget_layout')
       or (v_rec ->> 'id') is null
       or char_length(v_rec ->> 'id') not between 1 and 64
       or jsonb_typeof(v_rec -> 'data') <> 'object'
       or octet_length((v_rec -> 'data')::text) > 262144 then
      raise exception 'Registro de sincronización inválido' using errcode = '22023';
    end if;
    v_updated := (v_rec ->> 'updatedAt')::timestamptz;
    v_deleted := nullif(v_rec ->> 'deletedAt', '')::timestamptz;
    if v_updated is null then
      raise exception 'Falta updatedAt' using errcode = '22023';
    end if;
    -- Una fecha en el futuro lejano ganaría todos los conflictos para siempre. Un navegador sano
    -- ya revisó su reloj contra sync_clock, así que esto solo frena a uno manipulado
    if v_updated > clock_timestamp() + interval '10 minutes' then
      raise exception 'updatedAt está en el futuro' using errcode = 'SY002';
    end if;

    if (v_rec ->> 'kind') = 'outline' and not v_outlines_open then
      -- En Gratis un apunte no se crea ni se cambia en la nube. Se ignora sin tumbar la subida, así
      -- los mazos y las tarjetas del mismo lote siguen llegando, y la app lo vuelve a mandar con el
      -- primer plan de pago. Borrar sí se puede. Al apunte que ya estaba se le pone la marca de borrado
      -- sobre lo que ya tenía la nube, con la fecha de borrado y la de cambio también dentro de data,
      -- porque es lo que leen los otros dispositivos. El resto de data que mande el navegador no se
      -- guarda. Una marca sin apunte en la nube no crea nada
      if v_deleted is null then
        continue;
      end if;
      -- La app borra con la misma fecha en las dos. Una marca infinita o posterior al cambio no es
      -- una fecha de borrado
      if not isfinite(v_deleted) or v_deleted > v_updated then
        raise exception 'La marca de borrado no es una fecha válida' using errcode = '22023';
      end if;
      update public.sync_records r
        set data = r.data || jsonb_build_object(
              'deletedAt', to_char(v_deleted at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
              'updatedAt', to_char(v_updated at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
            ),
            updated_at = v_updated,
            deleted_at = v_deleted,
            server_seq = nextval('public.sync_records_seq')
        where r.user_id = v_user and r.kind = 'outline' and r.record_id = v_rec ->> 'id'
          and v_updated > r.updated_at;
      get diagnostics v_rows = row_count;
      v_changed := v_changed + v_rows;
      continue;
    end if;

    insert into public.sync_records as r (user_id, kind, record_id, data, updated_at, deleted_at, server_seq)
    values (
      v_user, v_rec ->> 'kind', v_rec ->> 'id', v_rec -> 'data', v_updated, v_deleted,
      nextval('public.sync_records_seq')
    )
    on conflict (user_id, kind, record_id) do update
      set data = excluded.data,
          updated_at = excluded.updated_at,
          deleted_at = excluded.deleted_at,
          server_seq = excluded.server_seq
      where excluded.updated_at > r.updated_at;
    get diagnostics v_rows = row_count;
    v_changed := v_changed + v_rows;
  end loop;

  if v_changed > 0 then
    select count(*), coalesce(sum(pg_column_size(r.data)), 0) into v_used_records, v_used_bytes
      from public.sync_records r where r.user_id = v_user;
    if v_used_records > public.platform_quota('sync_records')
       or v_used_bytes > public.platform_quota('sync_bytes') then
      raise exception 'Se llenó el espacio de sincronización de la cuenta'
        using errcode = 'SY003', detail = format('records %s, bytes %s', v_used_records, v_used_bytes);
    end if;
  end if;
  return v_changed;
end;
$$;
revoke all on function public.sync_push_records(jsonb) from public, anon, service_role;
grant execute on function public.sync_push_records(jsonb) to authenticated;

-- Comprobación. Las columnas deben salir como las pide el plan
select
  (select count(*) from information_schema.columns
    where table_schema = 'public' and table_name = 'deck_catalog' and column_name in ('free_access', 'authorization_confirmed_version')) as columnas_del_catalogo,
  (select count(*) from public.platform_quota_settings) as topes_sembrados,
  not has_table_privilege('anon', 'public.platform_quota_settings', 'select,insert,update,delete')
    and not has_table_privilege('authenticated', 'public.platform_quota_settings', 'select,insert,update,delete')
    and not has_table_privilege('service_role', 'public.platform_quota_settings', 'select,insert,update,delete') as topes_sin_permisos_directos,
  (select count(*) from pg_trigger
    where tgrelid = 'public.deck_catalog'::regclass and tgname = 'deck_catalog_confirmation_sync') as confirmacion_ligada,
  has_function_privilege('authenticated', 'public.admin_deck_catalog_set_free_access(text, boolean)', 'execute') as admin_abre_mazos,
  has_function_privilege('anon', 'public.admin_deck_catalog_set_free_access(text, boolean)', 'execute') as anonimo_abre_mazos,
  has_function_privilege('authenticated', 'public.deck_catalog_can_download_deck(text)', 'execute') as api_decide_por_mazo,
  has_function_privilege('authenticated', 'public.platform_quota(text)', 'execute') as api_lee_topes,
  has_function_privilege('authenticated', 'public.sync_push_records(jsonb)', 'execute') as alumno_sube_registros;
