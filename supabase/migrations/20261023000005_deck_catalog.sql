-- Catálogo compartido de mazos en Supabase Storage (B11, 1.15 y 4.8 del plan de B11, respuestas 46, 47
-- y 49, PC 4.21 y PC 4.25).
--
-- Qué agrega
--   - El bucket privado deck-catalog, solo JSON y ZIP y hasta 6 MB por archivo. Cada versión de un mazo
--     vive en su propia carpeta, <mazo>/v<n>/, así nunca se sobrescribe un archivo que la CDN ya guardó
--       <mazo>/v<n>/<submazo>.json              las notas saneadas del submazo, hasta 5 MB
--       <mazo>/v<n>/<submazo>.part-<k>.json     el .json partido, si el submazo pasa de 5 MB
--       <mazo>/v<n>/<submazo>.media-<k>.zip     las imágenes, en paquetes de hasta 5 MB
--   - Las tablas deck_catalog, deck_catalog_versions, deck_catalog_subjects y deck_catalog_downloads,
--     sin permisos de tabla ni políticas. Todo pasa por funciones
--   - Las políticas deck_catalog_select y deck_catalog_insert sobre storage.objects, creadas solo si no
--     existen. Bajar pide plan de pago o rol del equipo, dispositivo activo y la versión publicada.
--     Subir pide admin y una versión en subida. No hay políticas de update ni de borrado
--   - Funciones del alumno (deck_catalog_list y record_deck_download), del admin (registrar, publicar y
--     retirar) y del dueño (confirmar la autorización de un mazo de terceros)
--
-- Licencias. Un mazo propio (own) se publica cuando están sus archivos. Uno de terceros (third_party)
-- necesita la nota de su autorización escrita y que el dueño la confirme. Sin eso, publicar responde
-- BK010. Si el admin cambia la licencia o la nota, la confirmación se pierde y el dueño vuelve a revisar.
--
-- Es idempotente y no lleva delete ni drop (D-113). Se corre después de 20261023000004_bank_sync.sql.

-- ===================================================================== Bucket
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('deck-catalog', 'deck-catalog', false, 6000000, array['application/json', 'application/zip'])
  on conflict (id) do update
    set public = false, file_size_limit = 6000000, allowed_mime_types = array['application/json', 'application/zip'];

-- ===================================================================== Tablas
create table if not exists public.deck_catalog (
  deck_key text primary key check (deck_key ~ '^[a-z0-9-]{3,48}$'),
  name text not null check (char_length(name) between 1 and 120),
  description text not null default '' check (char_length(description) <= 1000),
  author text not null check (char_length(author) between 1 and 80),
  license text not null check (license in ('own', 'third_party')),
  authorization_note text check (char_length(authorization_note) <= 500),
  authorization_confirmed_at timestamptz,
  authorization_confirmed_by uuid references auth.users (id) on delete set null,
  status text not null default 'draft' check (status in ('draft', 'published', 'retired')),
  published_version integer,
  preview jsonb not null default '[]',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.deck_catalog_versions (
  deck_key text not null references public.deck_catalog (deck_key),
  version integer not null check (version >= 1),
  status text not null default 'uploading' check (status in ('uploading', 'published', 'retired')),
  -- La vista previa de esta versión. Pasa al mazo al publicar, así Gratis no ve una que no salió
  preview jsonb not null default '[]',
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  published_at timestamptz,
  primary key (deck_key, version)
);

create table if not exists public.deck_catalog_subjects (
  deck_key text not null,
  version integer not null,
  subject_key text not null check (subject_key ~ '^[a-z0-9-]{1,64}$'),
  name text not null check (char_length(name) between 1 and 120),
  branch text,
  topic text,
  notes integer not null check (notes >= 1),
  cards integer not null check (cards >= 1),
  json_bytes bigint not null check (json_bytes >= 1),
  media_bytes bigint not null check (media_bytes >= 0),
  media_parts smallint not null default 0 check (media_parts between 0 and 999),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  primary key (deck_key, version, subject_key),
  foreign key (deck_key, version) references public.deck_catalog_versions (deck_key, version)
);

create table if not exists public.deck_catalog_downloads (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  deck_key text not null,
  version integer not null,
  subject_key text not null,
  bytes bigint not null check (bytes >= 0),
  created_at timestamptz not null default now()
);
create index if not exists deck_catalog_downloads_user on public.deck_catalog_downloads (user_id, created_at);

alter table public.deck_catalog enable row level security;
alter table public.deck_catalog_versions enable row level security;
alter table public.deck_catalog_subjects enable row level security;
alter table public.deck_catalog_downloads enable row level security;
revoke all on table public.deck_catalog from public, anon, authenticated, service_role;
revoke all on table public.deck_catalog_versions from public, anon, authenticated, service_role;
revoke all on table public.deck_catalog_subjects from public, anon, authenticated, service_role;
revoke all on table public.deck_catalog_downloads from public, anon, authenticated, service_role;
revoke all on sequence public.deck_catalog_downloads_id_seq from public, anon, authenticated, service_role;

-- ===================================================================== Rutas
-- Tope de cada archivo, igual que DECK_PART_MAX_BYTES de src/data/schemas/deckCatalog.ts
create or replace function public.deck_catalog_part_max() returns bigint
language sql immutable set search_path = public, pg_temp as $$
  select 5000000::bigint
$$;

-- Las partes de una ruta del bucket, o null si no tiene ninguna de las tres formas. Nunca falla
create or replace function public.deck_catalog_path(p_name text)
returns table (deck_key text, version integer, subject_key text, kind text, part integer)
language sql immutable set search_path = public, pg_temp as $$
  select m[1], m[2]::integer, m[3],
    case when m[4] = 'json' then 'json' when m[5] is not null then 'json_part' else 'media' end,
    coalesce(m[5], m[6])::integer
  from regexp_match(
    p_name,
    '^([a-z0-9-]{3,48})/v([1-9][0-9]{0,5})/([a-z0-9-]{1,64})\.(json|part-([1-9][0-9]{0,2})\.json|media-([1-9][0-9]{0,2})\.zip)$'
  ) as m
  where m is not null
$$;

-- Los archivos que tiene que tener una versión. El .json va entero hasta 5 MB y partido arriba de eso
create or replace function public.deck_catalog_expected(p_deck_key text, p_version integer)
returns table (subject_key text, path text, content_type text)
language sql stable security definer set search_path = public, pg_temp as $$
  select s.subject_key, s.deck_key || '/v' || s.version || '/' || s.subject_key || '.json', 'application/json'
    from public.deck_catalog_subjects s
    where s.deck_key = p_deck_key and s.version = p_version and s.json_bytes <= public.deck_catalog_part_max()
  union all
  select s.subject_key, s.deck_key || '/v' || s.version || '/' || s.subject_key || '.part-' || k || '.json',
      'application/json'
    from public.deck_catalog_subjects s
    cross join lateral generate_series(1, ceil(s.json_bytes::numeric / public.deck_catalog_part_max())::integer) k
    where s.deck_key = p_deck_key and s.version = p_version and s.json_bytes > public.deck_catalog_part_max()
  union all
  select s.subject_key, s.deck_key || '/v' || s.version || '/' || s.subject_key || '.media-' || k || '.zip',
      'application/zip'
    from public.deck_catalog_subjects s
    cross join lateral generate_series(1, s.media_parts) k
    where s.deck_key = p_deck_key and s.version = p_version
$$;

-- ===================================================================== Quién lee y quién sube
-- Plan de pago o rol del equipo. Gratis solo ve la lista y la vista previa
create or replace function public.deck_catalog_can_download() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select auth.uid() is not null
    and (public.current_app_role() <> 'student' or public.user_plan(auth.uid()) <> 'free')
$$;

-- La usa la política deck_catalog_select. Plan de pago o equipo, dispositivo activo y un archivo de la
-- versión publicada de un mazo publicado
create or replace function public.deck_catalog_can_read(p_object_name text) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((
    select public.deck_catalog_can_download() and public.is_active_device()
      and exists (
        select 1 from public.deck_catalog_expected(p.deck_key, p.version) e where e.path = p_object_name
      )
      and exists (
        select 1 from public.deck_catalog d
        join public.deck_catalog_versions v on v.deck_key = d.deck_key and v.version = d.published_version
        where d.deck_key = p.deck_key and d.status = 'published' and v.version = p.version and v.status = 'published'
      )
    from public.deck_catalog_path(p_object_name) p
  ), false)
$$;

-- La usa la política deck_catalog_insert. Solo el admin, con segundo factor desde B9 por
-- current_app_role, y solo un archivo esperado de una versión en subida
create or replace function public.deck_catalog_can_write(p_object_name text) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((
    select public.is_admin()
      and exists (
        select 1 from public.deck_catalog_versions v
        where v.deck_key = p.deck_key and v.version = p.version and v.status = 'uploading'
      )
      and exists (
        select 1 from public.deck_catalog_expected(p.deck_key, p.version) e where e.path = p_object_name
      )
    from public.deck_catalog_path(p_object_name) p
  ), false)
$$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and policyname = 'deck_catalog_select'
  ) then
    create policy deck_catalog_select on storage.objects for select to authenticated
      using (bucket_id = 'deck-catalog' and public.deck_catalog_can_read(name));
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and policyname = 'deck_catalog_insert'
  ) then
    create policy deck_catalog_insert on storage.objects for insert to authenticated
      with check (bucket_id = 'deck-catalog' and public.deck_catalog_can_write(name));
  end if;
end $$;

-- ===================================================================== Del alumno
-- Una vista previa sin imágenes, como DeckPreviewNoteSchema. Revisa paso por paso para no fallar con
-- una forma rara
create or replace function public.deck_catalog_preview_ok(p_preview jsonb) returns boolean
language plpgsql immutable set search_path = public, pg_temp as $$
declare
  n jsonb;
begin
  if p_preview is null or jsonb_typeof(p_preview) <> 'array' or jsonb_array_length(p_preview) > 5 then
    return false;
  end if;
  for n in select * from jsonb_array_elements(p_preview) loop
    if jsonb_typeof(n) <> 'object' or (select count(*) from jsonb_object_keys(n)) <> 3
       or n::text ~* '<img|<audio|<video|\[sound:' then
      return false;
    end if;
    if n ->> 'kind' = 'basic' then
      if jsonb_typeof(n -> 'front') is distinct from 'string' or jsonb_typeof(n -> 'back') is distinct from 'string'
         or char_length(n ->> 'front') not between 1 and 4000 or char_length(n ->> 'back') > 4000 then
        return false;
      end if;
    elsif n ->> 'kind' = 'cloze' then
      if jsonb_typeof(n -> 'text') is distinct from 'string' or jsonb_typeof(n -> 'extra') is distinct from 'string'
         or char_length(n ->> 'text') not between 1 and 4000 or char_length(n ->> 'extra') > 4000 then
        return false;
      end if;
    else
      return false;
    end if;
  end loop;
  return true;
end;
$$;

-- Un número entero de jsonb dentro de un rango, sin fallar con otra forma
create or replace function public.deck_catalog_int(p_value jsonb, p_min bigint, p_max bigint) returns boolean
language sql immutable set search_path = public, pg_temp as $$
  select case
    when jsonb_typeof(p_value) is distinct from 'number' or p_value::text !~ '^-?[0-9]{1,15}$' then false
    else p_value::text::bigint between p_min and p_max
  end
$$;

-- El manifiesto del admin, como DeckManifestSchema. Revisa paso por paso para no fallar con una forma rara
create or replace function public.deck_catalog_manifest_ok(p_manifest jsonb) returns boolean
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_subject jsonb;
  v_keys text[] := '{}';
  v_license text;
  v_note text;
begin
  if p_manifest is null or jsonb_typeof(p_manifest) <> 'object' then
    return false;
  end if;
  v_license := p_manifest ->> 'license';
  v_note := nullif(btrim(coalesce(p_manifest ->> 'authorizationNote', '')), '');
  if coalesce(p_manifest ->> 'deckKey', '') !~ '^[a-z0-9-]{3,48}$'
     or char_length(coalesce(p_manifest ->> 'name', '')) not between 1 and 120
     or char_length(coalesce(p_manifest ->> 'description', '')) > 1000
     or char_length(coalesce(p_manifest ->> 'author', '')) not between 1 and 80
     or coalesce(v_license, '') not in ('own', 'third_party')
     or char_length(coalesce(v_note, '')) > 500
     or (v_license = 'third_party' and v_note is null)
     or not public.deck_catalog_preview_ok(coalesce(p_manifest -> 'preview', '[]'::jsonb))
     or jsonb_typeof(p_manifest -> 'subjects') is distinct from 'array' then
    return false;
  end if;
  if jsonb_array_length(p_manifest -> 'subjects') not between 1 and 200 then
    return false;
  end if;
  for v_subject in select * from jsonb_array_elements(p_manifest -> 'subjects') loop
    if jsonb_typeof(v_subject) <> 'object' then
      return false;
    end if;
    if coalesce(v_subject ->> 'subjectKey', '') !~ '^[a-z0-9-]{1,64}$'
       or v_subject ->> 'subjectKey' = any (v_keys)
       or char_length(coalesce(v_subject ->> 'name', '')) not between 1 and 120
       or not public.deck_catalog_int(v_subject -> 'notes', 1, 1000000)
       or not public.deck_catalog_int(v_subject -> 'cards', 1, 1000000)
       or not public.deck_catalog_int(v_subject -> 'jsonBytes', 1, 1000000000)
       or not public.deck_catalog_int(v_subject -> 'mediaBytes', 0, 5000000000)
       or not public.deck_catalog_int(v_subject -> 'mediaParts', 0, 999)
       or ((v_subject ->> 'mediaParts') = '0') <> ((v_subject ->> 'mediaBytes') = '0')
       or coalesce(v_subject ->> 'sha256', '') !~ '^[0-9a-f]{64}$'
       or jsonb_typeof(coalesce(v_subject -> 'branch', 'null')) not in ('string', 'null')
       or jsonb_typeof(coalesce(v_subject -> 'topic', 'null')) not in ('string', 'null')
       or (jsonb_typeof(v_subject -> 'branch') = 'string' and not exists (
             select 1 from public.bank_taxonomy t where t.branch = v_subject ->> 'branch'))
       or (jsonb_typeof(v_subject -> 'topic') = 'string' and not exists (
             select 1 from public.bank_taxonomy t
             where t.branch = v_subject ->> 'branch' and t.topic = v_subject ->> 'topic')) then
      return false;
    end if;
    v_keys := array_append(v_keys, v_subject ->> 'subjectKey');
  end loop;
  return true;
end;
$$;

-- Los mazos publicados con sus submazos y tamaños. Gratis los ve con canDownload false y la vista previa
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
      where d.status = 'published' and d.published_version is not null), '[]'::jsonb)
  );
end;
$$;

-- Deja constancia de una bajada de un submazo. Solo de pago o del equipo, de una versión que existe
create or replace function public.record_deck_download(
  p_deck_key text, p_version integer, p_subject_key text, p_bytes bigint
) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is null then
    raise exception 'Hace falta iniciar sesión' using errcode = '28000';
  end if;
  if not public.is_active_device() or not public.deck_catalog_can_download() then
    raise exception 'Bajar mazos del catálogo es de los planes de pago' using errcode = '42501';
  end if;
  if p_bytes is null or p_bytes < 0 or p_bytes > 2000000000 or not exists (
    select 1 from public.deck_catalog_subjects s
    join public.deck_catalog_versions v on v.deck_key = s.deck_key and v.version = s.version
    where s.deck_key = p_deck_key and s.version = p_version and s.subject_key = p_subject_key
      and v.status in ('published', 'retired')
  ) then
    raise exception 'Ese submazo no existe en el catálogo' using errcode = '22023';
  end if;
  insert into public.deck_catalog_downloads (user_id, deck_key, version, subject_key, bytes)
    values (auth.uid(), p_deck_key, p_version, p_subject_key, p_bytes);
end;
$$;

-- ===================================================================== Del admin
-- Revisa el manifiesto como DeckManifestSchema, crea la versión en subida y devuelve dónde subir cada
-- archivo. Una versión anterior que se quedó en subida pasa a retirada, así solo hay una abierta
create or replace function public.admin_deck_catalog_register(p_manifest jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_key text := p_manifest ->> 'deckKey';
  v_license text := p_manifest ->> 'license';
  v_note text := nullif(btrim(coalesce(p_manifest ->> 'authorizationNote', '')), '');
  v_version integer;
begin
  perform public.bank_require_admin();
  if not public.deck_catalog_manifest_ok(p_manifest) then
    raise exception 'El manifiesto del mazo no es válido' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('deck-catalog:' || v_key, 0));
  insert into public.deck_catalog as d (deck_key, name, description, author, license, authorization_note)
    values (v_key, p_manifest ->> 'name', coalesce(p_manifest ->> 'description', ''), p_manifest ->> 'author',
      v_license, v_note)
    on conflict (deck_key) do update set
      name = excluded.name, description = excluded.description, author = excluded.author,
      license = excluded.license, authorization_note = excluded.authorization_note,
      -- Otra licencia u otra nota piden que el dueño vuelva a confirmar
      authorization_confirmed_at = case
        when d.license = excluded.license and d.authorization_note is not distinct from excluded.authorization_note
        then d.authorization_confirmed_at end,
      authorization_confirmed_by = case
        when d.license = excluded.license and d.authorization_note is not distinct from excluded.authorization_note
        then d.authorization_confirmed_by end,
      updated_at = now();
  update public.deck_catalog_versions set status = 'retired' where deck_key = v_key and status = 'uploading';
  select coalesce(max(version), 0) + 1 into v_version from public.deck_catalog_versions where deck_key = v_key;
  insert into public.deck_catalog_versions (deck_key, version, preview, created_by)
    values (v_key, v_version, coalesce(p_manifest -> 'preview', '[]'::jsonb), auth.uid());
  insert into public.deck_catalog_subjects
      (deck_key, version, subject_key, name, branch, topic, notes, cards, json_bytes, media_bytes, media_parts, sha256)
    select v_key, v_version, s ->> 'subjectKey', s ->> 'name', s ->> 'branch', s ->> 'topic',
      (s ->> 'notes')::integer, (s ->> 'cards')::integer, (s ->> 'jsonBytes')::bigint, (s ->> 'mediaBytes')::bigint,
      (s ->> 'mediaParts')::smallint, s ->> 'sha256'
    from jsonb_array_elements(p_manifest -> 'subjects') s;
  return jsonb_build_object(
    'deckKey', v_key,
    'version', v_version,
    'status', 'uploading',
    'files', (
      select jsonb_agg(jsonb_build_object('subjectKey', e.subject_key, 'path', e.path, 'contentType', e.content_type)
        order by e.subject_key, e.path)
      from public.deck_catalog_expected(v_key, v_version) e
    )
  );
end;
$$;

-- Publica una versión en subida. Revisa que cada archivo esperado esté en Storage con el tamaño del
-- manifiesto (BK011) y después la autorización (BK010). La versión publicada antes pasa a retirada
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
     and (v_deck.authorization_note is null or v_deck.authorization_confirmed_at is null) then
    raise exception 'El dueño no ha confirmado la autorización del mazo' using errcode = 'BK010';
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

-- Saca un mazo del catálogo. Quien ya lo bajó lo conserva. Una versión nueva lo vuelve a publicar
create or replace function public.admin_deck_catalog_retire(p_deck_key text) returns text
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_status text;
begin
  perform public.bank_require_admin();
  select status into v_status from public.deck_catalog where deck_key = p_deck_key for update;
  if v_status is null then
    raise exception 'Ese mazo no existe' using errcode = '22023';
  end if;
  if v_status = 'retired' then
    return 'already_retired';
  end if;
  update public.deck_catalog_versions set status = 'retired'
    where deck_key = p_deck_key and status in ('published', 'uploading');
  update public.deck_catalog set status = 'retired', updated_at = now() where deck_key = p_deck_key;
  return 'retired';
end;
$$;

-- Solo el dueño confirma la autorización escrita de un mazo de terceros, con la nota de quién autorizó,
-- cuándo y dónde vive el documento (respuestas 46 y 49)
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
  update public.deck_catalog set authorization_note = v_note, authorization_confirmed_at = now(),
      authorization_confirmed_by = auth.uid(), updated_at = now()
    where deck_key = p_deck_key and license = 'third_party';
  if not found then
    raise exception 'Ese mazo no existe o no es de terceros' using errcode = '22023';
  end if;
end;
$$;

-- El catálogo completo para la pantalla del admin, también borradores, versiones en subida y retirados
create or replace function public.admin_deck_catalog_overview() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform public.bank_require_admin();
  return coalesce((
    select jsonb_agg(jsonb_build_object(
        'deckKey', d.deck_key, 'name', d.name, 'author', d.author, 'description', d.description,
        'license', d.license, 'authorizationNote', d.authorization_note,
        'authorizationConfirmedAt', public.bank_iso(d.authorization_confirmed_at),
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

-- ===================================================================== Permisos de funciones
revoke all on function public.deck_catalog_part_max() from public, anon, authenticated, service_role;
revoke all on function public.deck_catalog_path(text) from public, anon, authenticated, service_role;
revoke all on function public.deck_catalog_expected(text, integer) from public, anon, authenticated, service_role;
revoke all on function public.deck_catalog_can_download() from public, anon, authenticated, service_role;
revoke all on function public.deck_catalog_preview_ok(jsonb) from public, anon, authenticated, service_role;
revoke all on function public.deck_catalog_int(jsonb, bigint, bigint) from public, anon, authenticated, service_role;
revoke all on function public.deck_catalog_manifest_ok(jsonb) from public, anon, authenticated, service_role;
-- Las políticas de Storage las evalúan con el rol de quien llama
revoke all on function public.deck_catalog_can_read(text) from public, anon, authenticated, service_role;
grant execute on function public.deck_catalog_can_read(text) to authenticated;
revoke all on function public.deck_catalog_can_write(text) from public, anon, authenticated, service_role;
grant execute on function public.deck_catalog_can_write(text) to authenticated;
revoke all on function public.deck_catalog_list() from public, anon, authenticated, service_role;
grant execute on function public.deck_catalog_list() to authenticated;
revoke all on function public.record_deck_download(text, integer, text, bigint) from public, anon, authenticated, service_role;
grant execute on function public.record_deck_download(text, integer, text, bigint) to authenticated;
revoke all on function public.admin_deck_catalog_register(jsonb) from public, anon, authenticated, service_role;
grant execute on function public.admin_deck_catalog_register(jsonb) to authenticated;
revoke all on function public.admin_deck_catalog_publish(text, integer) from public, anon, authenticated, service_role;
grant execute on function public.admin_deck_catalog_publish(text, integer) to authenticated;
revoke all on function public.admin_deck_catalog_retire(text) from public, anon, authenticated, service_role;
grant execute on function public.admin_deck_catalog_retire(text) to authenticated;
revoke all on function public.admin_deck_catalog_overview() from public, anon, authenticated, service_role;
grant execute on function public.admin_deck_catalog_overview() to authenticated;
revoke all on function public.owner_confirm_deck_authorization(text, text) from public, anon, authenticated, service_role;
grant execute on function public.owner_confirm_deck_authorization(text, text) to authenticated;
