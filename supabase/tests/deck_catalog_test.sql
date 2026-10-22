-- Pruebas del catálogo compartido de mazos (B11, migración 20261023000005, 6.1 del plan de B11) y de lo que
-- agrega 20261024000001 (acceso gratis por mazo, confirmación por versión y topes por alumno, DC6), sobre
-- stub_storage.sql. Usuarios propios que empiezan con dd, con los cinco tipos (sin sesión, Gratis, de
-- pago, médico y admin) y el dueño. Los mazos y sus notas son simulados.
\set ON_ERROR_STOP on
\ir bank_helpers.sql

\set f1 'dd000000-0000-0000-0000-0000000000f1'
\set p1 'dd000000-0000-0000-0000-0000000000a1'
\set p2 'dd000000-0000-0000-0000-0000000000a2'
\set p3 'dd000000-0000-0000-0000-0000000000a3'
\set p4 'dd000000-0000-0000-0000-0000000000a4'
\set m1 'dd000000-0000-0000-0000-0000000000d1'
\set ad 'dd000000-0000-0000-0000-0000000000e1'

insert into auth.users (id, email, raw_user_meta_data) values
  (:'f1', 'dd-f1@x.mx', '{"alias":"Gratis DD"}'),
  (:'p1', 'dd-p1@x.mx', '{"alias":"Pago DD"}'),
  (:'p2', 'dd-p2@x.mx', '{"alias":"Pago desplazado DD"}'),
  (:'p3', 'dd-p3@x.mx', '{"alias":"Prueba DD"}'),
  (:'p4', 'dd-p4@x.mx', '{"alias":"Pase DD"}'),
  (:'m1', 'dd-m1@x.mx', '{"alias":"Médica DD"}'),
  (:'ad', 'dd-ad@x.mx', '{"alias":"Admin DD"}');
update public.user_roles set role = 'physician' where user_id = :'m1';
update public.user_roles set role = 'admin' where user_id = :'ad';
select user_id::text as owner from public.user_roles where role = 'owner' \gset
insert into public.subscriptions (user_id, plan, status, provider, current_period_end) values
  (:'p1', 'monthly', 'active', 'stripe', now() + interval '20 days'),
  (:'p2', 'annual', 'active', 'stripe', now() + interval '200 days');
-- La prueba gratis y el pase cuentan como plan de pago (B10)
insert into public.subscriptions (user_id, plan, status, provider, current_period_end) values
  (:'p3', 'founder', 'trialing', 'stripe', now() + interval '5 days');
insert into public.plan_passes (user_id, plan, provider, provider_payment_id, method, starts_at, ends_at)
  values (:'p4', 'annual', 'stripe', 'pi_dd_pass', 'spei', now() - interval '1 day', now() + interval '364 days');
select pg_temp.expect(public.user_plan(:'p1') = 'monthly' and public.user_plan(:'f1') = 'free'
  and public.user_plan(:'p3') = 'founder' and public.user_plan(:'p4') = 'annual', 'DC0. Los planes de B10');

-- El manifiesto de un mazo simulado. Un submazo chico sin imágenes y otro de más de 5 MB con imágenes
create or replace function pg_temp.manifest(
  p_key text, p_license text default 'third_party', p_note text default '[Prueba] Autorización simulada',
  p_preview jsonb default '[{"kind":"basic","front":"[Prueba] Frente","back":"[Prueba] Reverso"}]'
) returns jsonb language sql as $$
  select jsonb_build_object(
    'deckKey', p_key, 'name', '[Prueba] Mazo ' || p_key, 'description', '[Prueba] Mazo simulado',
    'author', 'Autor simulado', 'license', p_license, 'authorizationNote', p_note,
    'subjects', jsonb_build_array(
      jsonb_build_object('subjectKey', 'control-prenatal', 'name', '[Prueba] Control prenatal',
        'branch', 'obstetrics_gynecology', 'topic', null, 'notes', 12, 'cards', 14, 'jsonBytes', 1200,
        'mediaBytes', 0, 'mediaParts', 0, 'sha256', repeat('a', 64)),
      jsonb_build_object('subjectKey', 'preeclampsia', 'name', '[Prueba] Preeclampsia',
        'branch', null, 'topic', null, 'notes', 300, 'cards', 320, 'jsonBytes', 6000000,
        'mediaBytes', 7000000, 'mediaParts', 2, 'sha256', repeat('b', 64))),
    'preview', p_preview)
$$;

-- Sube un archivo con la sesión de quien llama, como lo hace la API de Storage
create or replace function pg_temp.upload(p_name text, p_size bigint) returns boolean language plpgsql as $$
begin
  insert into storage.objects (bucket_id, name, metadata)
    values ('deck-catalog', p_name, jsonb_build_object('size', p_size, 'mimetype', 'application/json'));
  return true;
exception when insufficient_privilege then
  return false;
end $$;

-- El detail del error con el que falla una sentencia, o null si no falla
create or replace function pg_temp.fails_detail(stmt text) returns text language plpgsql as $$
declare
  v_detail text;
begin
  execute stmt;
  return null;
exception when others then
  get stacked diagnostics v_detail = pg_exception_detail;
  return v_detail;
end $$;

create or replace function pg_temp.visible() returns bigint language sql as $$
  select count(*) from storage.objects where bucket_id = 'deck-catalog'
$$;

-- ===================================================================== DC0. Bucket, políticas y permisos
select pg_temp.expect((select not public and file_size_limit = 6000000
    and allowed_mime_types = array['application/json', 'application/zip']
  from storage.buckets where id = 'deck-catalog'), 'DC0. El bucket no es privado de 6 MB con JSON y ZIP');
select pg_temp.expect((select array_agg(policyname::text || ':' || cmd order by policyname) from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and policyname like 'deck_catalog%')
  = array['deck_catalog_insert:INSERT', 'deck_catalog_select:SELECT'], 'DC0. Las políticas no son solo leer y subir');
do $$
declare
  f text;
  r text;
begin
  foreach f in array array['public.deck_catalog_list()', 'public.record_deck_download(text, integer, text, bigint)',
      'public.deck_catalog_can_read(text)', 'public.deck_catalog_can_write(text)',
      'public.admin_deck_catalog_register(jsonb)', 'public.admin_deck_catalog_publish(text, integer)',
      'public.admin_deck_catalog_retire(text)', 'public.admin_deck_catalog_overview()',
      'public.owner_confirm_deck_authorization(text, text)', 'public.owner_confirm_deck_version(text, text, integer)',
      'public.admin_deck_catalog_set_free_access(text, boolean)'] loop
    if not has_function_privilege('authenticated', f, 'execute') then raise exception 'FALLA DC0. authenticated no ejecuta %', f; end if;
    foreach r in array array['anon', 'service_role'] loop
      if has_function_privilege(r, f, 'execute') then raise exception 'FALLA DC0. % ejecuta %', r, f; end if;
    end loop;
  end loop;
  foreach f in array array['public.deck_catalog_path(text)', 'public.deck_catalog_expected(text, integer)',
      'public.deck_catalog_can_download()', 'public.deck_catalog_preview_ok(jsonb)', 'public.deck_catalog_part_max()',
      'public.deck_catalog_int(jsonb, bigint, bigint)', 'public.deck_catalog_manifest_ok(jsonb)',
      'public.deck_catalog_can_download_deck(text)', 'public.deck_catalog_license_ok(text, timestamptz, integer, integer)',
      'public.deck_catalog_confirmation_sync()', 'public.platform_quota(text)'] loop
    foreach r in array array['anon', 'authenticated', 'service_role'] loop
      if has_function_privilege(r, f, 'execute') then raise exception 'FALLA DC0. % ejecuta %', r, f; end if;
    end loop;
  end loop;
  foreach f in array array['deck_catalog', 'deck_catalog_versions', 'deck_catalog_subjects', 'deck_catalog_downloads',
      'platform_quota_settings'] loop
    foreach r in array array['anon', 'authenticated', 'service_role'] loop
      if has_table_privilege(r, 'public.' || f, 'select') or has_table_privilege(r, 'public.' || f, 'insert') then
        raise exception 'FALLA DC0. % tiene permisos sobre %', r, f;
      end if;
    end loop;
  end loop;
end $$;
-- Las rutas
select pg_temp.expect((select row(deck_key, version, subject_key, kind, part)::text from public.deck_catalog_path('paco-gyo/v12/sub-1.part-3.json'))
  = '(paco-gyo,12,sub-1,json_part,3)', 'DC0. Ruta de un .json partido');
select pg_temp.expect((select kind || part from public.deck_catalog_path('paco-gyo/v1/sub.media-2.zip')) = 'media2'
  and (select kind from public.deck_catalog_path('paco-gyo/v1/sub.json')) = 'json'
  and not exists (select 1 from public.deck_catalog_path('paco-gyo/v1/../x.json'))
  and not exists (select 1 from public.deck_catalog_path('Paco/v1/sub.json'))
  and not exists (select 1 from public.deck_catalog_path('paco-gyo/v0/sub.json')), 'DC0. Rutas raras');

-- ===================================================================== DC2. Registrar y subir
begin;
select pg_temp.as_user(:'m1');
select pg_temp.expect(pg_temp.fails_with(format('select public.admin_deck_catalog_register(%L)', pg_temp.manifest('paco-gyo'))) = '42501',
  'DC2. Una médica registró un mazo');
select pg_temp.as_user(:'f1');
select pg_temp.expect(pg_temp.fails_with(format('select public.admin_deck_catalog_register(%L)', pg_temp.manifest('paco-gyo'))) = '42501',
  'DC2. Un alumno registró un mazo');
select pg_temp.as_user(null);
select pg_temp.expect(pg_temp.fails_with(format('select public.admin_deck_catalog_register(%L)', pg_temp.manifest('paco-gyo'))) = '28000',
  'DC2. Sin sesión registró un mazo');
rollback;

begin;
select pg_temp.as_user(:'ad');
-- Manifiestos que no pasan
select pg_temp.expect(pg_temp.fails_with(format('select public.admin_deck_catalog_register(%L)', m)) = '22023',
  'DC2. Pasó un manifiesto malo ' || left(m::text, 60))
from (values
  (pg_temp.manifest('paco-gyo', 'third_party', null)),
  (pg_temp.manifest('paco-gyo', 'third_party', '   ')),
  (pg_temp.manifest('Paco GyO')),
  (pg_temp.manifest('paco-gyo', 'robado')),
  (pg_temp.manifest('paco-gyo', 'own', null, '[{"kind":"basic","front":"<img src=x.png>","back":""}]')),
  (pg_temp.manifest('paco-gyo', 'own', null, '[{"kind":"basic","front":"x","back":"","extra":1}]')),
  (pg_temp.manifest('paco-gyo', 'own', null, '[1, 2]')),
  (pg_temp.manifest('paco-gyo', 'own', null, '[{"kind":"cloze","text":"x","extra":""},{"kind":"cloze","text":"x","extra":""},{"kind":"cloze","text":"x","extra":""},{"kind":"cloze","text":"x","extra":""},{"kind":"cloze","text":"x","extra":""},{"kind":"cloze","text":"x","extra":""}]')),
  (pg_temp.manifest('paco-gyo') || '{"subjects":{}}'),
  (pg_temp.manifest('paco-gyo') || '{"subjects":[]}'),
  (pg_temp.manifest('paco-gyo') || jsonb_build_object('subjects', jsonb_build_array(
    pg_temp.manifest('paco-gyo') -> 'subjects' -> 0, pg_temp.manifest('paco-gyo') -> 'subjects' -> 0))),
  (jsonb_set(pg_temp.manifest('paco-gyo'), '{subjects,0,notes}', '1.5')),
  (jsonb_set(pg_temp.manifest('paco-gyo'), '{subjects,0,notes}', '"12"')),
  (jsonb_set(pg_temp.manifest('paco-gyo'), '{subjects,0,mediaBytes}', '10')),
  (jsonb_set(pg_temp.manifest('paco-gyo'), '{subjects,1,mediaParts}', '0')),
  (jsonb_set(pg_temp.manifest('paco-gyo'), '{subjects,0,branch}', '"otra_rama"')),
  (jsonb_set(pg_temp.manifest('paco-gyo'), '{subjects,0,topic}', '"neonatology"')),
  (jsonb_set(pg_temp.manifest('paco-gyo'), '{subjects,0,sha256}', '"abc"')),
  ('[]'::jsonb),
  ('"x"'::jsonb)) as t(m);
-- Uno bueno da la versión 1 en subida con las rutas de cada archivo
select public.admin_deck_catalog_register(pg_temp.manifest('paco-gyo')) as reg1 \gset
select pg_temp.expect((:'reg1')::jsonb @> '{"deckKey":"paco-gyo","version":1,"status":"uploading"}'
  and (select array_agg(f ->> 'path' order by f ->> 'path') from jsonb_array_elements((:'reg1')::jsonb -> 'files') f)
    = array['paco-gyo/v1/control-prenatal.json', 'paco-gyo/v1/preeclampsia.media-1.zip',
      'paco-gyo/v1/preeclampsia.media-2.zip', 'paco-gyo/v1/preeclampsia.part-1.json', 'paco-gyo/v1/preeclampsia.part-2.json']
  and (:'reg1')::jsonb -> 'files' @> '[{"path":"paco-gyo/v1/preeclampsia.media-1.zip","contentType":"application/zip","subjectKey":"preeclampsia"}]',
  'DC2. El registro no dio la versión 1 con sus cinco rutas');
-- El admin sube solo a la carpeta de la versión en subida y solo archivos esperados
select pg_temp.expect(pg_temp.upload('paco-gyo/v1/control-prenatal.json', 1200), 'DC2. El admin no pudo subir');
select pg_temp.expect(not pg_temp.upload('paco-gyo/v1/otro.json', 10), 'DC2. Subió un archivo que no está en el manifiesto');
select pg_temp.expect(not pg_temp.upload('paco-gyo/v1/preeclampsia.json', 10), 'DC2. Subió el .json entero de un submazo partido');
select pg_temp.expect(not pg_temp.upload('paco-gyo/v1/preeclampsia.media-3.zip', 10), 'DC2. Subió un paquete de más');
select pg_temp.expect(not pg_temp.upload('paco-gyo/v2/control-prenatal.json', 10), 'DC2. Subió a una versión que no existe');
-- El admin no lee lo que sube mientras la versión no se publique, y no hay política de update
select pg_temp.expect(pg_temp.visible() = 0, 'DC2. El admin leyó una versión en subida');
update storage.objects set metadata = '{"size":1}' where bucket_id = 'deck-catalog';
commit;
select pg_temp.expect((select metadata ->> 'size' from storage.objects where name = 'paco-gyo/v1/control-prenatal.json') = '1200',
  'DC2. Alguien cambió un archivo subido');

begin;
select pg_temp.as_user(:'m1');
select pg_temp.expect(not pg_temp.upload('paco-gyo/v1/preeclampsia.part-1.json', 5000000), 'DC2. Una médica subió');
select pg_temp.as_user(:'p1');
select pg_temp.expect(not pg_temp.upload('paco-gyo/v1/preeclampsia.part-1.json', 5000000), 'DC2. Un alumno de pago subió');
rollback;

-- ===================================================================== DC3. Publicar
begin;
select pg_temp.as_user(:'ad');
select pg_temp.expect(pg_temp.fails_with('select public.admin_deck_catalog_publish(''paco-gyo'', 1)') = 'BK011',
  'DC3. Publicó sin todos los archivos');
select pg_temp.expect(pg_temp.upload('paco-gyo/v1/preeclampsia.part-1.json', 5000000)
  and pg_temp.upload('paco-gyo/v1/preeclampsia.part-2.json', 1000000)
  and pg_temp.upload('paco-gyo/v1/preeclampsia.media-1.zip', 5000000)
  and pg_temp.upload('paco-gyo/v1/preeclampsia.media-2.zip', 2000000), 'DC3. No subió el resto');
-- De terceros sin la confirmación del dueño
select pg_temp.expect(pg_temp.fails_with('select public.admin_deck_catalog_publish(''paco-gyo'', 1)') = 'BK010',
  'DC3. Publicó un mazo de terceros sin confirmar');
select pg_temp.expect(pg_temp.fails_with('select public.owner_confirm_deck_authorization(''paco-gyo'', ''[Prueba] Confirmo'')') = '42501',
  'DC3. El admin confirmó la autorización');
select pg_temp.expect(pg_temp.fails_with('select public.admin_deck_catalog_publish(''paco-gyo'', 9)') = '22023',
  'DC3. Publicó una versión que no existe');
commit;
begin;
select pg_temp.as_user(:'m1');
select pg_temp.expect(pg_temp.fails_with('select public.owner_confirm_deck_authorization(''paco-gyo'', ''[Prueba] Confirmo'')') = '42501',
  'DC3. Una médica confirmó la autorización');
select pg_temp.expect(pg_temp.fails_with('select public.admin_deck_catalog_publish(''paco-gyo'', 1)') = '42501',
  'DC3. Una médica publicó');
select pg_temp.as_user(:'owner');
select pg_temp.expect(pg_temp.fails_with('select public.owner_confirm_deck_authorization(''paco-gyo'', ''  '')') = '22023',
  'DC3. El dueño confirmó sin nota');
select pg_temp.expect(pg_temp.fails_with('select public.owner_confirm_deck_authorization(''no-existe'', ''[Prueba] Nota'')') = '22023',
  'DC3. Confirmó un mazo que no existe');
select public.owner_confirm_deck_authorization('paco-gyo', '[Prueba] Contrato firmado el 12 de octubre');
commit;
select pg_temp.expect((select authorization_confirmed_by = :'owner' and authorization_confirmed_at is not null
  from public.deck_catalog where deck_key = 'paco-gyo'), 'DC3. No quedó la confirmación del dueño');
-- La nota del dueño va aparte y la del admin no se toca
select pg_temp.expect((select authorization_confirmed_note = '[Prueba] Contrato firmado el 12 de octubre'
    and authorization_note = '[Prueba] Autorización simulada' from public.deck_catalog where deck_key = 'paco-gyo'),
  'DC3. La nota del dueño pisó la del admin');
-- Un paquete o una parte con otro tamaño que el del manifiesto. Solo el superusuario cambia el archivo
update storage.objects set metadata = metadata || '{"size":1999999}' where name = 'paco-gyo/v1/preeclampsia.media-2.zip';
begin;
select pg_temp.as_user(:'ad');
select pg_temp.expect(pg_temp.fails_with('select public.admin_deck_catalog_publish(''paco-gyo'', 1)') = 'BK011',
  'DC3. Publicó con un paquete de otro tamaño');
commit;
update storage.objects set metadata = metadata || '{"size":2000000}' where name = 'paco-gyo/v1/preeclampsia.media-2.zip';
update storage.objects set metadata = metadata - 'size' where name = 'paco-gyo/v1/preeclampsia.part-2.json';
begin;
select pg_temp.as_user(:'ad');
select pg_temp.expect(pg_temp.fails_with('select public.admin_deck_catalog_publish(''paco-gyo'', 1)') = 'BK011',
  'DC3. Publicó con una parte sin tamaño');
commit;
update storage.objects set metadata = metadata || '{"size":1000000}' where name = 'paco-gyo/v1/preeclampsia.part-2.json';
begin;
select pg_temp.as_user(:'ad');
select pg_temp.expect(public.admin_deck_catalog_publish('paco-gyo', 1) = 'published', 'DC3. No publicó');
select pg_temp.expect(public.admin_deck_catalog_publish('paco-gyo', 1) = 'already_published', 'DC3. Publicar dos veces');
-- Un mazo propio no pide confirmación
select public.admin_deck_catalog_register(pg_temp.manifest('studiare-urg', 'own', null) || jsonb_build_object('subjects',
  jsonb_build_array(pg_temp.manifest('x') -> 'subjects' -> 0))) as reg2 \gset
select pg_temp.expect(pg_temp.upload('studiare-urg/v1/control-prenatal.json', 1200), 'DC3. No subió el mazo propio');
select pg_temp.expect(public.admin_deck_catalog_publish('studiare-urg', 1) = 'published', 'DC3. No publicó el mazo propio');
commit;
select pg_temp.expect((select status = 'published' and published_version = 1
    and preview = '[{"kind":"basic","front":"[Prueba] Frente","back":"[Prueba] Reverso"}]'
  from public.deck_catalog where deck_key = 'paco-gyo')
  and (select status from public.deck_catalog_versions where deck_key = 'paco-gyo' and version = 1) = 'published',
  'DC3. El mazo no quedó publicado con su vista previa');

-- ===================================================================== DC1. Lectura
begin;
select pg_temp.as_user(:'p1');
select pg_temp.expect(pg_temp.visible() = 6, 'DC1. El alumno de pago no ve los seis archivos publicados');
select pg_temp.as_user(:'m1');
select pg_temp.expect(pg_temp.visible() = 6, 'DC1. La médica no ve los archivos publicados');
select pg_temp.as_user(:'f1');
select pg_temp.expect(pg_temp.visible() = 0, 'DC1. Gratis leyó archivos del catálogo');
select pg_temp.as_anon();
select pg_temp.expect(pg_temp.visible() = 0, 'DC1. Sin sesión leyó archivos del catálogo');
rollback;
-- El dispositivo desplazado no lee
begin;
select pg_temp.as_user(:'p2', 'ses-a');
select public.claim_device('dd-dev-a', 'Chrome');
commit;
begin;
select pg_temp.as_user(:'p2', 'ses-b');
select public.claim_device('dd-dev-b', 'Safari');
commit;
begin;
select pg_temp.as_user(:'p2', 'ses-a');
select pg_temp.expect(pg_temp.visible() = 0, 'DC1. El dispositivo desplazado leyó archivos');
select pg_temp.expect(pg_temp.fails_with('select public.deck_catalog_list()') = '42501', 'DC1. El desplazado vio la lista');
select pg_temp.expect(pg_temp.fails_with('select public.record_deck_download(''paco-gyo'', 1, ''preeclampsia'', 10)') = '42501',
  'DC1. El desplazado registró una bajada');
select pg_temp.as_user(:'p2', 'ses-b');
select pg_temp.expect(pg_temp.visible() = 6, 'DC1. El dispositivo activo no leyó');
rollback;

-- Una versión nueva en subida no se lee hasta publicarse. Con la misma nota conserva la confirmación
begin;
select pg_temp.as_user(:'ad');
select public.admin_deck_catalog_register(pg_temp.manifest('paco-gyo', 'third_party', '[Prueba] Autorización simulada',
  '[{"kind":"cloze","text":"[Prueba] {{c1::Nueva}}","extra":""}]') || jsonb_build_object('subjects',
  jsonb_build_array(pg_temp.manifest('x') -> 'subjects' -> 0))) ->> 'version' as v2 \gset
select pg_temp.expect(:'v2' = '2' and pg_temp.upload('paco-gyo/v2/control-prenatal.json', 1200), 'DC1. No registró ni subió la versión 2');
commit;
select pg_temp.expect((select authorization_confirmed_at is not null and authorization_confirmed_version = 1
  from public.deck_catalog where deck_key = 'paco-gyo'),
  'DC1. La misma nota perdió la confirmación de la versión 1 o la dio por buena para la 2');
begin;
select pg_temp.as_user(:'p1');
select pg_temp.expect(pg_temp.visible() = 6
  and not exists (select 1 from storage.objects where bucket_id = 'deck-catalog' and name like 'paco-gyo/v2/%'),
  'DC1. Leyó una versión en subida');
select pg_temp.expect(public.deck_catalog_list() -> 'decks' @> '[{"deckKey":"paco-gyo","version":1,"preview":[{"kind":"basic"}]}]',
  'DC1. La vista previa nueva salió antes de publicar');
-- La versión nueva no sale sin que el dueño la confirme, y mientras tanto la 1 sigue a la vista
select pg_temp.as_user(:'ad');
select pg_temp.expect(pg_temp.fails_with('select public.admin_deck_catalog_publish(''paco-gyo'', 2)') = 'BK010',
  'DC1. Publicó la versión 2 de un mazo de terceros sin que el dueño la confirmara');
select pg_temp.as_user(:'owner');
-- Confirma justo la versión que ve. Una que ya no es la más nueva, o que no existe, se rechaza con BK002
select pg_temp.expect(pg_temp.fails_with('select public.owner_confirm_deck_version(''paco-gyo'', ''[Prueba] Contrato'', 1)') = 'BK002'
  and pg_temp.fails_with('select public.owner_confirm_deck_version(''paco-gyo'', ''[Prueba] Contrato'', 3)') = 'BK002',
  'DC1. El dueño confirmó una versión que no es la más nueva');
select pg_temp.expect(pg_temp.fails_with('select public.owner_confirm_deck_version(''no-existe'', ''[Prueba] Contrato'', 1)') = '22023'
  and pg_temp.fails_with('select public.owner_confirm_deck_version(''paco-gyo'', ''  '', 2)') = '22023',
  'DC1. El dueño confirmó un mazo que no existe o sin nota');
select pg_temp.expect(public.admin_deck_catalog_overview() @> '[{"deckKey":"paco-gyo","authorizationConfirmedVersion":1}]',
  'DC1. Un rechazo cambió la confirmación');
select public.owner_confirm_deck_version('paco-gyo', '[Prueba] Contrato firmado el 12 de octubre', 2);
select pg_temp.as_user(:'ad');
select pg_temp.expect(pg_temp.fails_with('select public.owner_confirm_deck_version(''paco-gyo'', ''[Prueba] Contrato'', 2)') = '42501',
  'DC1. El admin confirmó con versión');
select pg_temp.expect(public.admin_deck_catalog_publish('paco-gyo', 2) = 'published', 'DC1. No publicó la versión 2');
select pg_temp.as_user(:'p1');
select pg_temp.expect(pg_temp.visible() = 2
  and (select array_agg(name order by name) from storage.objects where bucket_id = 'deck-catalog')
    = array['paco-gyo/v2/control-prenatal.json', 'studiare-urg/v1/control-prenatal.json'],
  'DC1. Después de publicar no lee solo la versión 2');
commit;
select pg_temp.expect((select array_agg(status order by version) from public.deck_catalog_versions where deck_key = 'paco-gyo')
  = array['retired', 'published'], 'DC1. La versión 1 no quedó retirada');
select pg_temp.expect((select authorization_confirmed_version from public.deck_catalog where deck_key = 'paco-gyo') = 2,
  'DC1. La confirmación del dueño no quedó en la versión más nueva');

-- Otra nota pide confirmar de nuevo
begin;
select pg_temp.as_user(:'ad');
select public.admin_deck_catalog_register(pg_temp.manifest('paco-gyo', 'third_party', '[Prueba] Otra nota') || jsonb_build_object('subjects',
  jsonb_build_array(pg_temp.manifest('x') -> 'subjects' -> 0))) ->> 'version' as v3 \gset
select pg_temp.expect(pg_temp.upload('paco-gyo/v3/control-prenatal.json', 1200), 'DC1. No subió la versión 3');
select pg_temp.expect(pg_temp.fails_with('select public.admin_deck_catalog_publish(''paco-gyo'', 3)') = 'BK010',
  'DC1. Otra nota no pidió confirmar otra vez');
-- Registrar otra vez deja retirada la versión que se quedó en subida
select public.admin_deck_catalog_register(pg_temp.manifest('paco-gyo', 'third_party', '[Prueba] Otra nota') || jsonb_build_object('subjects',
  jsonb_build_array(pg_temp.manifest('x') -> 'subjects' -> 0))) ->> 'version' as v4 \gset
select pg_temp.expect(:'v4' = '4' and pg_temp.fails_with('select public.admin_deck_catalog_publish(''paco-gyo'', 3)') = '22023'
  and not public.deck_catalog_can_write('paco-gyo/v3/control-prenatal.json')
  and public.deck_catalog_can_write('paco-gyo/v4/control-prenatal.json'), 'DC1. La versión abandonada siguió abierta');
-- Retirar un mazo lo saca de la lectura y de la lista
select pg_temp.expect(public.admin_deck_catalog_retire('studiare-urg') = 'retired'
  and public.admin_deck_catalog_retire('studiare-urg') = 'already_retired', 'DC1. No retiró el mazo propio');
select pg_temp.expect(pg_temp.fails_with('select public.admin_deck_catalog_retire(''no-existe'')') = '22023', 'DC1. Retiró un mazo que no existe');
select pg_temp.expect(public.admin_deck_catalog_overview() @> '[{"deckKey":"paco-gyo","publishedVersion":2,"versions":[{"version":4,"status":"uploading","files":1,"uploaded":0},{"version":2,"status":"published","files":1,"uploaded":1}]}]',
  'DC1. El resumen del admin');
select pg_temp.as_user(:'p1');
-- paco-gyo es de terceros y su nota nueva espera al dueño, así que tampoco se lee (M1 de la revisión)
select pg_temp.expect(not exists (select 1 from storage.objects where bucket_id = 'deck-catalog' and name like 'studiare-urg/%'),
  'DC1. Leyó un mazo retirado');
select pg_temp.expect(pg_temp.visible() = 0, 'DC1. Leyó un mazo de terceros que espera la confirmación del dueño');
select pg_temp.expect(not (public.deck_catalog_list() -> 'decks' @> '[{"deckKey":"paco-gyo"}]'),
  'DC1. La lista mostró un mazo de terceros que espera la confirmación del dueño');
select pg_temp.as_user(:'m1');
select pg_temp.expect(pg_temp.fails_with('select public.admin_deck_catalog_overview()') = '42501'
  and pg_temp.fails_with('select public.admin_deck_catalog_retire(''paco-gyo'')') = '42501', 'DC1. Una médica usó funciones del admin');
commit;

-- Solo el dueño pasa un mazo de terceros a propio, porque uno propio se publica sin su confirmación
-- (A1 de la revisión)
begin;
select pg_temp.as_user(:'ad');
select pg_temp.expect(pg_temp.fails_with('select public.admin_deck_catalog_register(pg_temp.manifest(''paco-gyo'', ''own'', null))') = '42501',
  'DC2. El admin pasó un mazo de terceros a propio');
select pg_temp.expect(pg_temp.fails_detail('select public.admin_deck_catalog_register(pg_temp.manifest(''paco-gyo'', ''own'', null))')
  = 'license_owner_only', 'DC2. El 42501 no dice license_owner_only para la pantalla');
select pg_temp.expect(public.admin_deck_catalog_overview() @> '[{"deckKey":"paco-gyo","license":"third_party"}]',
  'DC2. El mazo dejó de ser de terceros');
select pg_temp.as_user(:'owner');
select pg_temp.expect((public.admin_deck_catalog_register(pg_temp.manifest('paco-gyo', 'own', null)) ->> 'status') = 'uploading',
  'DC2. El dueño no pudo registrarlo como propio');
select pg_temp.expect(public.admin_deck_catalog_overview() @> '[{"deckKey":"paco-gyo","license":"own"}]',
  'DC2. El dueño no pudo pasarlo a propio');
rollback;

-- ===================================================================== DC4. Lista y bajadas
-- El dueño confirma la nota nueva y paco-gyo vuelve a la lista
begin;
select pg_temp.as_user(:'owner');
select public.owner_confirm_deck_authorization('paco-gyo', '[Prueba] Confirmé con el correo del autor');
commit;
-- El dueño escribió otra nota que la del admin y cada una quedó en su columna
select pg_temp.expect((select authorization_note = '[Prueba] Otra nota'
    and authorization_confirmed_note = '[Prueba] Confirmé con el correo del autor'
  from public.deck_catalog where deck_key = 'paco-gyo'), 'DC4. La nota del dueño reemplazó a la del admin');
begin;
select pg_temp.as_user(:'f1');
select public.deck_catalog_list() as free_list \gset
select pg_temp.expect((:'free_list')::jsonb ->> 'canDownload' = 'false'
  and jsonb_array_length((:'free_list')::jsonb -> 'decks') = 1
  and (:'free_list')::jsonb -> 'decks' -> 0 @> '{"deckKey":"paco-gyo","version":2,"notes":12,"cards":14,"bytes":1200,"author":"Autor simulado"}'
  and (:'free_list')::jsonb -> 'decks' -> 0 -> 'subjects' = '[{"subjectKey":"control-prenatal","name":"[Prueba] Control prenatal","branch":"obstetrics_gynecology","topic":null,"notes":12,"cards":14,"bytes":1200,"mediaParts":0,"sha256":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}]'
  and (:'free_list')::jsonb -> 'decks' -> 0 -> 'preview' = '[{"kind":"cloze","text":"[Prueba] {{c1::Nueva}}","extra":""}]',
  'DC4. Gratis no ve la lista con la vista previa y sin bajar');
select pg_temp.expect(pg_temp.fails_with('select public.record_deck_download(''paco-gyo'', 2, ''control-prenatal'', 1200)') = '42501',
  'DC4. Gratis registró una bajada');
select pg_temp.as_user(:'p1');
select pg_temp.expect(public.deck_catalog_list() ->> 'canDownload' = 'true', 'DC4. El de pago no puede bajar');
select public.record_deck_download('paco-gyo', 2, 'control-prenatal', 1200);
select public.record_deck_download('paco-gyo', 1, 'preeclampsia', 13000000);
select pg_temp.expect(pg_temp.fails_with('select public.record_deck_download(''paco-gyo'', 2, ''preeclampsia'', 10)') = '22023'
  and pg_temp.fails_with('select public.record_deck_download(''paco-gyo'', 4, ''control-prenatal'', 10)') = '22023'
  and pg_temp.fails_with('select public.record_deck_download(''paco-gyo'', 2, ''control-prenatal'', -1)') = '22023',
  'DC4. Registró una bajada que no existe');
select pg_temp.as_user(:'p3');
select pg_temp.expect(public.deck_catalog_list() ->> 'canDownload' = 'true' and pg_temp.visible() = 1, 'DC4. La prueba gratis no puede bajar');
select pg_temp.as_user(:'p4');
select pg_temp.expect(public.deck_catalog_list() ->> 'canDownload' = 'true' and pg_temp.visible() = 1, 'DC4. El pase no puede bajar');
select pg_temp.as_user(:'m1');
select pg_temp.expect(public.deck_catalog_list() ->> 'canDownload' = 'true', 'DC4. La médica no puede bajar');
select pg_temp.as_user(null);
select pg_temp.expect(pg_temp.fails_with('select public.deck_catalog_list()') = '28000', 'DC4. Sin sesión vio la lista');
select pg_temp.as_anon();
select pg_temp.expect(pg_temp.fails_with('select public.deck_catalog_list()') = '42501', 'DC4. anon vio la lista');
commit;
select pg_temp.expect((select count(*) from public.deck_catalog_downloads where user_id = :'p1') = 2, 'DC4. No quedaron las dos bajadas');

-- ===================================================================== DC5. Borrar mis datos
-- Las bajadas de las últimas 24 horas se conservan, porque cuentan para el tope del día (BK012) y borrar los datos no
-- debe reiniciarlo
begin;
select pg_temp.as_user(:'p1');
select pg_temp.expect((public.delete_my_data() ->> 'deck_downloads')::int = 0, 'DC5. Borrar mis datos quitó bajadas de hoy');
commit;
select pg_temp.expect((select count(*) from public.deck_catalog_downloads where user_id = :'p1') = 2, 'DC5. Se perdieron bajadas de hoy');
update public.deck_catalog_downloads set created_at = now() - interval '25 hours'
  where user_id = :'p1' and subject_key = 'control-prenatal';
begin;
select pg_temp.as_user(:'p1');
select pg_temp.expect((public.delete_my_data() ->> 'deck_downloads')::int = 1, 'DC5. Borrar mis datos no quitó la bajada de hace 25 horas');
commit;
select pg_temp.expect((select array_agg(subject_key) from public.deck_catalog_downloads where user_id = :'p1') = array['preeclampsia'],
  'DC5. No quedó solo la bajada de hoy');
-- Con tope de una bajada por día, borrar los datos no deja bajar otra
update public.platform_quota_settings set value = 1 where key = 'deck_downloads_per_day';
begin;
select pg_temp.as_user(:'p1');
select public.delete_my_data();
select pg_temp.expect(pg_temp.fails_with('select public.record_deck_download(''paco-gyo'', 2, ''control-prenatal'', 1200)') = 'BK012',
  'DC5. Borrar mis datos reinició el tope de bajadas');
commit;
update public.platform_quota_settings set value = 500 where key = 'deck_downloads_per_day';
update public.deck_catalog_downloads set created_at = now() - interval '25 hours' where user_id = :'p1';
begin;
select pg_temp.as_user(:'p1');
select pg_temp.expect((public.delete_my_data() ->> 'deck_downloads')::int = 1, 'DC5. Borrar mis datos no quitó la última bajada vieja');
commit;
select pg_temp.expect(not exists (select 1 from public.deck_catalog_downloads where user_id = :'p1'), 'DC5. Quedaron bajadas');

-- ===================================================================== DC6. Acceso gratis por mazo, versión confirmada y topes
-- paco-gyo es de terceros con la versión 4 en subida y confirmada. Lo publicado es la versión 2
begin;
select pg_temp.as_user(:'m1');
select pg_temp.expect(pg_temp.fails_with('select public.admin_deck_catalog_set_free_access(''paco-gyo'', true)') = '42501',
  'DC6. Una médica abrió un mazo en Gratis');
select pg_temp.as_user(:'f1');
select pg_temp.expect(pg_temp.fails_with('select public.admin_deck_catalog_set_free_access(''paco-gyo'', true)') = '42501',
  'DC6. Un alumno de Gratis abrió un mazo en Gratis');
select pg_temp.as_user(:'ad');
select pg_temp.expect(pg_temp.fails_with('select public.admin_deck_catalog_set_free_access(''no-existe'', true)') = '22023'
  and pg_temp.fails_with('select public.admin_deck_catalog_set_free_access(''paco-gyo'', null)') = '22023',
  'DC6. Abrió un mazo que no existe o sin decir si va abierto');
select pg_temp.expect(public.admin_deck_catalog_overview() @> '[{"deckKey":"paco-gyo","freeAccess":false}]',
  'DC6. El resumen del admin no dice que el mazo va cerrado en Gratis');
rollback;

-- Cerrado en Gratis. Un mazo propio publicado que nadie abrió
begin;
select pg_temp.as_user(:'ad');
select public.admin_deck_catalog_register(pg_temp.manifest('cerrado-gratis', 'own', null) || jsonb_build_object('subjects',
  jsonb_build_array(pg_temp.manifest('x') -> 'subjects' -> 0))) ->> 'version' as vc \gset
select pg_temp.expect(pg_temp.upload('cerrado-gratis/v1/control-prenatal.json', 1200)
  and public.admin_deck_catalog_publish('cerrado-gratis', 1) = 'published', 'DC6. No publicó el mazo cerrado');
commit;

begin;
select pg_temp.as_user(:'f1');
select public.deck_catalog_list() as list_closed \gset
select pg_temp.expect((:'list_closed')::jsonb ->> 'canDownload' = 'false'
  and (select bool_and((d ->> 'canDownload')::boolean = false) from jsonb_array_elements((:'list_closed')::jsonb -> 'decks') d),
  'DC6. Gratis puede bajar un mazo que nadie abrió');
select pg_temp.expect(pg_temp.visible() = 0, 'DC6. Gratis leyó un archivo de un mazo cerrado');
rollback;

-- El admin abre paco-gyo. Gratis baja ese mazo y no el cerrado
begin;
select pg_temp.as_user(:'ad');
select pg_temp.expect(public.admin_deck_catalog_set_free_access('paco-gyo', true) = 'free', 'DC6. No abrió el mazo');
select pg_temp.expect(public.admin_deck_catalog_overview() @> '[{"deckKey":"paco-gyo","freeAccess":true}]',
  'DC6. El resumen no dice que el mazo va abierto');
commit;

begin;
select pg_temp.as_user(:'f1');
select public.deck_catalog_list() as list_open \gset
select pg_temp.expect((:'list_open')::jsonb ->> 'canDownload' = 'false'
  and (select (d ->> 'canDownload')::boolean from jsonb_array_elements((:'list_open')::jsonb -> 'decks') d
       where d ->> 'deckKey' = 'paco-gyo') is true
  and (select (d ->> 'canDownload')::boolean from jsonb_array_elements((:'list_open')::jsonb -> 'decks') d
       where d ->> 'deckKey' = 'cerrado-gratis') is false,
  'DC6. La lista de Gratis no abrió solo el mazo que el admin abrió');
select pg_temp.expect((select array_agg(name order by name) from storage.objects where bucket_id = 'deck-catalog')
  = array['paco-gyo/v2/control-prenatal.json'], 'DC6. Gratis no lee solo los archivos del mazo abierto');
select public.record_deck_download('paco-gyo', 2, 'control-prenatal', 1200);
select pg_temp.expect(pg_temp.fails_with('select public.record_deck_download(''cerrado-gratis'', 1, ''control-prenatal'', 1200)') = '42501',
  'DC6. Gratis registró una bajada de un mazo cerrado');
-- Los bytes no pasan de lo que declara el submazo
select pg_temp.expect(pg_temp.fails_with('select public.record_deck_download(''paco-gyo'', 2, ''control-prenatal'', 1201)') = '22023',
  'DC6. Registró más bytes de los que tiene el submazo');
select pg_temp.as_user(null);
select pg_temp.expect(pg_temp.fails_with('select public.deck_catalog_list()') = '28000', 'DC6. Sin sesión vio la lista');
rollback;

-- La decisión por mazo para una cuenta sin sesión, de Gratis, de pago y con el mazo retirado o sin publicar
begin;
select pg_temp.as_user(:'f1');
reset role;
select pg_temp.expect(public.deck_catalog_can_download_deck('paco-gyo')
  and not public.deck_catalog_can_download_deck('cerrado-gratis')
  and not public.deck_catalog_can_download_deck('no-existe'), 'DC6. can_download_deck de Gratis');
select pg_temp.as_user(:'p1');
reset role;
select pg_temp.expect(public.deck_catalog_can_download_deck('cerrado-gratis') and public.deck_catalog_can_download_deck('paco-gyo'),
  'DC6. can_download_deck de pago');
select pg_temp.as_user(null);
reset role;
select pg_temp.expect(not public.deck_catalog_can_download_deck('paco-gyo'), 'DC6. Sin sesión puede bajar un mazo abierto');
rollback;
-- Un mazo retirado no se baja aunque haya quedado abierto
begin;
select pg_temp.as_user(:'ad');
select public.admin_deck_catalog_set_free_access('studiare-urg', true);
select pg_temp.as_user(:'f1');
reset role;
select pg_temp.expect(not public.deck_catalog_can_download_deck('studiare-urg'), 'DC6. Gratis puede bajar un mazo retirado');
rollback;

-- Una versión nueva de un mazo abierto de terceros espera al dueño y la publicada sigue a la vista
begin;
select pg_temp.as_user(:'ad');
select public.admin_deck_catalog_register(pg_temp.manifest('paco-gyo', 'third_party', '[Prueba] Otra nota') || jsonb_build_object('subjects',
  jsonb_build_array(pg_temp.manifest('x') -> 'subjects' -> 0))) ->> 'version' as v5 \gset
select pg_temp.expect(:'v5' = '5' and pg_temp.upload('paco-gyo/v5/control-prenatal.json', 1200), 'DC6. No registró ni subió la versión 5');
select pg_temp.expect(pg_temp.fails_with('select public.admin_deck_catalog_publish(''paco-gyo'', 5)') = 'BK010',
  'DC6. Publicó la versión 5 sin que el dueño la confirmara');
select pg_temp.expect(public.admin_deck_catalog_overview() @> '[{"deckKey":"paco-gyo","authorizationConfirmedVersion":4,"pendingConfirmationVersion":5}]',
  'DC6. El resumen no dice que la versión 5 espera la confirmación');
select pg_temp.as_user(:'f1');
select pg_temp.expect(public.deck_catalog_list() -> 'decks' @> '[{"deckKey":"paco-gyo","version":2,"canDownload":true}]'
  and pg_temp.visible() = 1, 'DC6. La versión 2 dejó de verse mientras la 5 espera al dueño');
select pg_temp.as_user(:'owner');
select public.owner_confirm_deck_version('paco-gyo', '[Prueba] Confirmé la versión 5', 5);
select pg_temp.as_user(:'ad');
select pg_temp.expect(public.admin_deck_catalog_publish('paco-gyo', 5) = 'published', 'DC6. No publicó la versión 5 confirmada');
select pg_temp.expect(public.admin_deck_catalog_overview() @> '[{"deckKey":"paco-gyo","authorizationConfirmedVersion":5,"pendingConfirmationVersion":null}]',
  'DC6. La versión 5 sigue pendiente después de publicarse');
select pg_temp.as_user(:'f1');
select pg_temp.expect(public.deck_catalog_list() -> 'decks' @> '[{"deckKey":"paco-gyo","version":5,"canDownload":true}]',
  'DC6. Gratis no ve la versión 5');
commit;

-- Otra nota quita la confirmación entera. Ni la lista ni Storage muestran el mazo abierto
begin;
select pg_temp.as_user(:'ad');
select public.admin_deck_catalog_register(pg_temp.manifest('paco-gyo', 'third_party', '[Prueba] Nota que cambia')) ->> 'version' as v6 \gset
select pg_temp.expect(public.admin_deck_catalog_overview()
  @> '[{"deckKey":"paco-gyo","authorizationConfirmedAt":null,"authorizationConfirmedVersion":null}]',
  'DC6. Otra nota no quitó la confirmación y su versión');
select pg_temp.as_user(:'f1');
select pg_temp.expect(not (public.deck_catalog_list() -> 'decks' @> '[{"deckKey":"paco-gyo"}]') and pg_temp.visible() = 0,
  'DC6. Gratis vio un mazo abierto cuya confirmación se perdió');
select pg_temp.expect(pg_temp.fails_with('select public.record_deck_download(''paco-gyo'', 5, ''control-prenatal'', 1200)') = '42501',
  'DC6. Gratis registró una bajada de un mazo sin confirmación');
rollback;

-- Cerrar el mazo otra vez. Gratis deja de bajarlo
begin;
select pg_temp.as_user(:'ad');
select pg_temp.expect(public.admin_deck_catalog_set_free_access('paco-gyo', false) = 'paid', 'DC6. No cerró el mazo');
select pg_temp.as_user(:'f1');
select pg_temp.expect(public.deck_catalog_list() -> 'decks' @> '[{"deckKey":"paco-gyo","canDownload":false}]'
  and pg_temp.visible() = 0, 'DC6. Gratis sigue bajando un mazo que se cerró');
rollback;

-- Topes de bajadas por alumno. Con un tope de dos, la tercera en 24 horas se rechaza
update public.platform_quota_settings set value = 2 where key = 'deck_downloads_per_day';
begin;
select pg_temp.as_user(:'p3');
select public.record_deck_download('paco-gyo', 5, 'control-prenatal', 1200);
select public.record_deck_download('paco-gyo', 5, 'control-prenatal', 1200);
select pg_temp.expect(pg_temp.fails_with('select public.record_deck_download(''paco-gyo'', 5, ''control-prenatal'', 1200)') = 'BK012',
  'DC6. Pasó el tope de bajadas del día');
select pg_temp.as_user(:'p4');
select pg_temp.expect(pg_temp.fails_with('select public.record_deck_download(''paco-gyo'', 5, ''control-prenatal'', 1200)') is null,
  'DC6. El tope de un alumno frenó a otro');
commit;
select pg_temp.expect((select count(*) from public.deck_catalog_downloads where user_id = :'p3') = 2, 'DC6. Quedaron más de dos bajadas');
-- Las bajadas de hace más de un día ya no cuentan
update public.deck_catalog_downloads set created_at = now() - interval '25 hours' where user_id = :'p3';
begin;
select pg_temp.as_user(:'p3');
select pg_temp.expect(pg_temp.fails_with('select public.record_deck_download(''paco-gyo'', 5, ''control-prenatal'', 1200)') is null,
  'DC6. Una bajada de hace 25 horas siguió contando');
commit;
-- Sin fila el tope vuelve al de fábrica, y con la fila vuelve a lo que diga
delete from public.platform_quota_settings where key = 'deck_downloads_per_day';
select pg_temp.expect(public.platform_quota('deck_downloads_per_day') = 500 and public.platform_quota('sync_records') = 1500000
  and public.platform_quota('sync_bytes') = 1500000000 and public.platform_quota('sync_events') = 3000000
  and public.platform_quota('otro') is null, 'DC6. Los topes de fábrica no son los esperados');
insert into public.platform_quota_settings (key, value) values ('deck_downloads_per_day', 500);
select pg_temp.expect(public.platform_quota('deck_downloads_per_day') = 500, 'DC6. No quedó el tope de bajadas');
begin;
select pg_temp.as_user(:'p3');
select pg_temp.expect(pg_temp.fails_with('select public.platform_quota(''sync_records'')') = '42501', 'DC6. Una sesión leyó los topes');
rollback;
select pg_temp.expect((select count(*) from public.platform_quota_settings) = 4
  and (select value from public.platform_quota_settings where key = 'sync_events') = 3000000,
  'DC6. No quedaron los cuatro topes sembrados');
select pg_temp.expect(pg_temp.fails_with($q$ insert into public.platform_quota_settings (key, value) values ('otro', 1) $q$) = '23514'
  and pg_temp.fails_with($q$ update public.platform_quota_settings set value = -1 where key = 'sync_bytes' $q$) = '23514',
  'DC6. Los topes aceptaron una clave o un valor que no valen');

-- ===================================================================== DC7. Nota del dueño, confirmación con versión y cierre en Gratis
-- El escenario de la revisión. El dueño confirma con su nota, el admin registra una versión nueva con la nota original y
-- la confirmación sigue en pie. La nota del dueño va en su columna y la del admin no se toca
begin;
select pg_temp.as_user(:'ad');
select public.admin_deck_catalog_register(pg_temp.manifest('dueno-nota', 'third_party', '[Prueba] Nota del admin') || jsonb_build_object('subjects',
  jsonb_build_array(pg_temp.manifest('x') -> 'subjects' -> 0))) ->> 'version' as dv1 \gset
select pg_temp.expect(:'dv1' = '1' and pg_temp.upload('dueno-nota/v1/control-prenatal.json', 1200), 'DC7. No registró ni subió la versión 1');
select pg_temp.as_user(:'owner');
select public.owner_confirm_deck_version('dueno-nota', '[Prueba] Nota del dueño', 1);
select pg_temp.as_user(:'ad');
select pg_temp.expect(public.admin_deck_catalog_publish('dueno-nota', 1) = 'published', 'DC7. No publicó la versión 1');
commit;
select pg_temp.expect((select authorization_note = '[Prueba] Nota del admin' and authorization_confirmed_note = '[Prueba] Nota del dueño'
    and authorization_confirmed_version = 1 from public.deck_catalog where deck_key = 'dueno-nota'),
  'DC7. La nota del dueño y la del admin no quedaron cada una en su columna');

begin;
select pg_temp.as_user(:'ad');
select public.admin_deck_catalog_register(pg_temp.manifest('dueno-nota', 'third_party', '[Prueba] Nota del admin') || jsonb_build_object('subjects',
  jsonb_build_array(pg_temp.manifest('x') -> 'subjects' -> 0))) ->> 'version' as dv2 \gset
select pg_temp.expect(:'dv2' = '2', 'DC7. No registró la versión 2');
select pg_temp.expect(public.admin_deck_catalog_overview()
  @> '[{"deckKey":"dueno-nota","authorizationNote":"[Prueba] Nota del admin","authorizationConfirmedNote":"[Prueba] Nota del dueño","authorizationConfirmedVersion":1,"pendingConfirmationVersion":2}]',
  'DC7. Registrar la versión 2 con la nota original del admin perdió la confirmación o la nota del dueño');
select pg_temp.as_user(:'p1');
select pg_temp.expect(public.deck_catalog_list() -> 'decks' @> '[{"deckKey":"dueno-nota","version":1}]',
  'DC7. La versión publicada dejó de verse mientras la 2 espera al dueño');
commit;

-- La llamada sin versión confirma la más nueva
begin;
select pg_temp.as_user(:'owner');
select public.owner_confirm_deck_authorization('dueno-nota', '[Prueba] Nota del dueño otra vez');
commit;
select pg_temp.expect((select authorization_confirmed_version = 2 and authorization_confirmed_note = '[Prueba] Nota del dueño otra vez'
    and authorization_note = '[Prueba] Nota del admin' from public.deck_catalog where deck_key = 'dueno-nota'),
  'DC7. La llamada sin versión no confirmó la más nueva');

-- Cambiar la nota del admin quita la confirmación y la nota del dueño
begin;
select pg_temp.as_user(:'ad');
select public.admin_deck_catalog_register(pg_temp.manifest('dueno-nota', 'third_party', '[Prueba] Nota nueva del admin') || jsonb_build_object('subjects',
  jsonb_build_array(pg_temp.manifest('x') -> 'subjects' -> 0))) ->> 'version' as dv3 \gset
select pg_temp.expect(:'dv3' = '3', 'DC7. No registró la versión 3');
select pg_temp.expect(public.admin_deck_catalog_overview()
  @> '[{"deckKey":"dueno-nota","authorizationConfirmedAt":null,"authorizationConfirmedVersion":null,"authorizationConfirmedNote":null}]',
  'DC7. Otra nota del admin no quitó la confirmación y la nota del dueño');
commit;
-- Sin la nota del dueño tampoco se publica, aunque el admin tenga la suya
select pg_temp.expect((select authorization_confirmed_note is null and authorization_confirmed_by is null
  from public.deck_catalog where deck_key = 'dueno-nota'), 'DC7. Quedó la nota o el autor de una confirmación perdida');

-- El acceso gratis guarda quién y cuándo, retirar el mazo lo cierra y no se reabre solo con una versión nueva
begin;
select pg_temp.as_user(:'ad');
select pg_temp.expect(public.admin_deck_catalog_set_free_access('dueno-nota', true) = 'free', 'DC7. No abrió el mazo');
commit;
select pg_temp.expect((select free_access and free_access_changed_by = :'ad' and free_access_changed_at is not null
  from public.deck_catalog where deck_key = 'dueno-nota'), 'DC7. No guardó quién abrió el mazo');
select free_access_changed_at as opened_at from public.deck_catalog where deck_key = 'dueno-nota' \gset
begin;
select pg_temp.as_user(:'ad');
-- Dejarlo como está no es un cambio
select pg_temp.expect(public.admin_deck_catalog_set_free_access('dueno-nota', true) = 'free', 'DC7. No dejó el mazo abierto');
commit;
select pg_temp.expect((select free_access_changed_at = :'opened_at'::timestamptz from public.deck_catalog where deck_key = 'dueno-nota'),
  'DC7. Dejarlo como estaba cambió la fecha del cambio');
begin;
select pg_temp.as_user(:'owner');
select public.owner_confirm_deck_version('dueno-nota', '[Prueba] Nota del dueño de nuevo', 3);
select pg_temp.as_user(:'ad');
select pg_temp.expect(public.admin_deck_catalog_retire('dueno-nota') = 'retired', 'DC7. No retiró el mazo');
select pg_temp.expect(public.admin_deck_catalog_overview() @> '[{"deckKey":"dueno-nota","status":"retired","freeAccess":false}]',
  'DC7. Retirar el mazo no lo cerró en Gratis');
commit;
select pg_temp.expect((select not free_access and free_access_changed_by = :'ad' and free_access_changed_at >= :'opened_at'::timestamptz
  from public.deck_catalog where deck_key = 'dueno-nota'), 'DC7. No guardó quién cerró el mazo al retirarlo');
-- Reabierto estando retirado, retirar otra vez lo vuelve a cerrar
begin;
select pg_temp.as_user(:'ad');
select public.admin_deck_catalog_set_free_access('dueno-nota', true);
select pg_temp.expect(public.admin_deck_catalog_retire('dueno-nota') = 'already_retired', 'DC7. No dijo que el mazo ya estaba retirado');
commit;
select pg_temp.expect((select not free_access from public.deck_catalog where deck_key = 'dueno-nota'),
  'DC7. Retirar un mazo ya retirado no lo cerró en Gratis');

-- Lo que el dueño ya había confirmado antes de esta migración cubre las versiones publicadas y no las que siguen en
-- subida, y su nota pasa a su columna. Se arman dos mazos como los dejaba la versión anterior y se vuelve a correr
-- la migración
insert into public.deck_catalog (deck_key, name, author, license, authorization_note, authorization_confirmed_at, status, published_version)
  values ('legado-pub', '[Prueba] Legado publicado', 'Autor simulado', 'third_party', '[Prueba] Nota que escribió el dueño', now(), 'published', 1),
    ('legado-sub', '[Prueba] Legado sin publicar', 'Autor simulado', 'third_party', '[Prueba] Otra nota del dueño', now(), 'draft', null);
insert into public.deck_catalog_versions (deck_key, version, status) values
  ('legado-pub', 1, 'published'), ('legado-pub', 2, 'uploading'), ('legado-sub', 1, 'uploading');
select pg_temp.expect((select count(*) from public.deck_catalog
  where deck_key like 'legado-%' and authorization_confirmed_version is null and authorization_confirmed_note is null) = 2,
  'DC7. Los mazos de antes no se armaron sin versión ni nota');
\i :fixtures/../../supabase/migrations/20261024000001_catalog_free_access_and_caps.sql
select pg_temp.expect((select authorization_confirmed_version = 1 and authorization_confirmed_note = '[Prueba] Nota que escribió el dueño'
    from public.deck_catalog where deck_key = 'legado-pub'),
  'DC7. El relleno no confirmó solo la versión publicada ni copió la nota del dueño');
select pg_temp.expect((select authorization_confirmed_version is null and authorization_confirmed_note = '[Prueba] Otra nota del dueño'
    from public.deck_catalog where deck_key = 'legado-sub'),
  'DC7. El relleno confirmó una versión que no se publicó');
delete from public.deck_catalog_versions where deck_key like 'legado-%';
delete from public.deck_catalog where deck_key like 'legado-%';

select 'TODAS LAS PRUEBAS DEL CATALOGO DE MAZOS PASARON' as resultado;
