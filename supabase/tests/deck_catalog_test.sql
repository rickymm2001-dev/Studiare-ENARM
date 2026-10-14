-- Pruebas del catálogo compartido de mazos (B11, migración 20261023000005, 6.1 del plan de B11), sobre
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
      'public.owner_confirm_deck_authorization(text, text)'] loop
    if not has_function_privilege('authenticated', f, 'execute') then raise exception 'FALLA DC0. authenticated no ejecuta %', f; end if;
    foreach r in array array['anon', 'service_role'] loop
      if has_function_privilege(r, f, 'execute') then raise exception 'FALLA DC0. % ejecuta %', r, f; end if;
    end loop;
  end loop;
  foreach f in array array['public.deck_catalog_path(text)', 'public.deck_catalog_expected(text, integer)',
      'public.deck_catalog_can_download()', 'public.deck_catalog_preview_ok(jsonb)', 'public.deck_catalog_part_max()',
      'public.deck_catalog_int(jsonb, bigint, bigint)', 'public.deck_catalog_manifest_ok(jsonb)'] loop
    foreach r in array array['anon', 'authenticated', 'service_role'] loop
      if has_function_privilege(r, f, 'execute') then raise exception 'FALLA DC0. % ejecuta %', r, f; end if;
    end loop;
  end loop;
  foreach f in array array['deck_catalog', 'deck_catalog_versions', 'deck_catalog_subjects', 'deck_catalog_downloads'] loop
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
select public.owner_confirm_deck_authorization('paco-gyo', '[Prueba] Autorización simulada');
commit;
select pg_temp.expect((select authorization_confirmed_by = :'owner' and authorization_confirmed_at is not null
  from public.deck_catalog where deck_key = 'paco-gyo'), 'DC3. No quedó la confirmación del dueño');
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
select pg_temp.expect((select authorization_confirmed_at is not null from public.deck_catalog where deck_key = 'paco-gyo'),
  'DC1. La misma nota perdió la confirmación');
begin;
select pg_temp.as_user(:'p1');
select pg_temp.expect(pg_temp.visible() = 6
  and not exists (select 1 from storage.objects where bucket_id = 'deck-catalog' and name like 'paco-gyo/v2/%'),
  'DC1. Leyó una versión en subida');
select pg_temp.expect(public.deck_catalog_list() -> 'decks' @> '[{"deckKey":"paco-gyo","version":1,"preview":[{"kind":"basic"}]}]',
  'DC1. La vista previa nueva salió antes de publicar');
select pg_temp.as_user(:'ad');
select pg_temp.expect(public.admin_deck_catalog_publish('paco-gyo', 2) = 'published', 'DC1. No publicó la versión 2');
select pg_temp.as_user(:'p1');
select pg_temp.expect(pg_temp.visible() = 2
  and (select array_agg(name order by name) from storage.objects where bucket_id = 'deck-catalog')
    = array['paco-gyo/v2/control-prenatal.json', 'studiare-urg/v1/control-prenatal.json'],
  'DC1. Después de publicar no lee solo la versión 2');
commit;
select pg_temp.expect((select array_agg(status order by version) from public.deck_catalog_versions where deck_key = 'paco-gyo')
  = array['retired', 'published'], 'DC1. La versión 1 no quedó retirada');

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
select pg_temp.expect(pg_temp.visible() = 1, 'DC1. Leyó un mazo retirado');
select pg_temp.as_user(:'m1');
select pg_temp.expect(pg_temp.fails_with('select public.admin_deck_catalog_overview()') = '42501'
  and pg_temp.fails_with('select public.admin_deck_catalog_retire(''paco-gyo'')') = '42501', 'DC1. Una médica usó funciones del admin');
commit;

-- ===================================================================== DC4. Lista y bajadas
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
begin;
select pg_temp.as_user(:'p1');
select pg_temp.expect((public.delete_my_data() ->> 'deck_downloads')::int = 2, 'DC5. Borrar mis datos no quitó las bajadas');
commit;
select pg_temp.expect(not exists (select 1 from public.deck_catalog_downloads where user_id = :'p1'), 'DC5. Quedaron bajadas');

select 'TODAS LAS PRUEBAS DEL CATALOGO DE MAZOS PASARON' as resultado;
