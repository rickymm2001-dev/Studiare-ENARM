-- Plan Gratis en el servidor (B8 del plan del cambio, respuestas 18, 19 y 20, 4.3 y 4.25).
--
-- Qué se cierra en Gratis
--   - Party en la nube. Grupos, tabla de la semana, retos y duelos son de los planes de pago
--     (respuesta 20, 4.3). party_open(), el lugar que dejó B7 para el plan (20261018000001), ahora
--     pide un plan de pago vigente. Con eso se cierran de una vez las lecturas de las políticas, porque
--     is_group_member y shares_group pasan por ella, incluidos los perfiles y las fotos de los
--     compañeros, y todas las funciones party_* que piden Party abierta con party_caller().
--     20261021000002_free_plan_party_moderation.sql pone party_open directo en las políticas, para que
--     el plan se revise una vez por consulta y no una vez por fila
--   - Los apuntes que viajan a la nube, los registros outline de sync_records. La API no tiene permiso
--     de escribir en sync_records y la única puerta es sync_push_records, así que el candado va ahí,
--     registro por registro según su tipo. En Gratis un apunte nuevo o un cambio a uno que ya estaba
--     se ignoran sin tumbar la subida, que también trae los mazos y las tarjetas del alumno. La app
--     anota que dejó apuntes sin subir y los manda todos otra vez con el primer plan de pago
--     (outlinesPending en src/data/sync/runSync.ts), así no se pierde nada de lo que escribió. La
--     marca de borrado de un apunte que ya está en la nube sí se guarda, sobre lo que ya tenía la nube
--     y con solo sus dos fechas. Leer los propios sigue igual (sync_records_select) y Borrar mis datos
--     los quita todos. Son datos del alumno y sus derechos ARCO no dependen del plan
--
-- Qué sigue abierto en Gratis
--   - Los referidos (4.3). my_referral_code, redeem_referral_code y my_referrals no revisan el plan, y
--     la tarjeta Invita y gana un mes vive en Party y en Configuración
--   - Salir de un grupo o de todos (party_leave_group, party_leave_all) y exportar lo propio de Party
--     (party_export_mine). Piden sesión y el dispositivo activo, pero no Party abierta, así nadie queda
--     atrapado en un grupo ni sin sus datos
--   - Los mazos, notas y tarjetas propios en la nube, porque en Gratis se crean mazos a mano. Subir
--     mazos de otras apps y seguir mazos nuevos del catálogo se cierran en la app. Un mazo subido se
--     guarda igual que uno hecho a mano, y el catálogo viaja dentro de la app hasta que llegue el banco
--     en la nube (B11)
--   - my_plan, con el que la app sabe qué plan tiene el alumno
--
-- Qué cuenta como plan de pago
--   El mismo plan efectivo que la app lee con my_plan, el de user_plan. Una suscripción de pago
--   vigente, también cancelada o con un cobro fallido mientras no termine el periodo pagado, o un mes
--   regalado por referido mientras dure. Cuando B10 sume la prueba gratis (estado trialing) en
--   user_plan, estas reglas la heredan sin cambiar aquí. No mira el rol, así que un médico o un admin
--   sin plan de pago tampoco entra a Party
--
-- Lo que ven los compañeros de quien pasa a Gratis
--   Sigue en sus grupos hasta que sale. Sus compañeros con plan lo siguen viendo con su alias y la
--   última cifra que publicó, como a quien dejó de estudiar. Nadie lee el plan de otra persona. Quien
--   está en Gratis no ve nada del grupo y puede salir cuando quiera
--
-- El tope de 20 preguntas al día ya lo cuenta grant_question_access para las preguntas de la nube y
-- pasa del todo al servidor con el banco en la nube (B11).
--
-- Es idempotente y no lleva sentencias delete ni drop, así se aplica con el conector (docs/SUPABASE.md).
-- Se corre después de 20261019000001_referral_first_charge.sql y no depende de 20261020000001 (B9).
-- No edita las migraciones anteriores. Si alguien vuelve a correr 20261018000001 o 20261008000002,
-- hay que correr esta otra vez después, porque esas dos traen las versiones abiertas de party_open y de
-- sync_push_records. 20261021000002_free_plan_party_moderation.sql va después de esta y usa
-- has_paid_plan

-- ===================================================================== Plan de pago
-- true si el alumno tiene un plan de pago vigente o un mes regalado por referido, con la misma regla
-- que my_plan. Es el único lugar de esa regla. Ayuda interna. La llaman caller_has_paid_plan y las
-- revisiones de Party sobre otro miembro (20261021000002), que corren con los permisos de su dueño,
-- así que ninguna sesión la ejecuta por la API
create or replace function public.has_paid_plan(p_user uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select p_user is not null and public.user_plan(p_user) <> 'free'
$$;

-- Lo mismo para quien llama. Ayuda interna. Solo la llaman party_open y sync_push_records
create or replace function public.caller_has_paid_plan() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select public.has_paid_plan(auth.uid())
$$;

-- ===================================================================== Party
-- Party abierta para quien llama, solo con un plan de pago (respuesta 20, 4.3). La usan is_group_member,
-- shares_group y party_caller, así que se cierran a la vez las políticas de grupos, miembros, retos,
-- duelos, perfiles y fotos de compañeros y todas las funciones de Party, salvo las de salir y exportar
create or replace function public.party_open() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select public.caller_has_paid_plan()
$$;

-- ===================================================================== Apuntes en la nube
-- Igual que en 20261008000002_sync.sql, salvo los apuntes en Gratis. Recibe un arreglo de hasta 500
-- registros {kind, id, updatedAt, deletedAt, data}. Devuelve cuántos cambió de verdad. Un registro más
-- viejo o igual al que ya hay no cambia nada
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
  return v_changed;
end;
$$;

-- ===================================================================== Permisos de las funciones
-- has_paid_plan y caller_has_paid_plan son ayudas internas y no las ejecuta nadie por la API.
-- party_open la siguen ejecutando las sesiones, porque la llaman las políticas con los permisos de
-- quien consulta. sync_push_records igual que antes, solo una sesión iniciada
revoke all on function public.has_paid_plan(uuid) from public, anon, authenticated, service_role;
revoke all on function public.caller_has_paid_plan() from public, anon, authenticated, service_role;
revoke all on function public.party_open() from public, anon, service_role;
grant execute on function public.party_open() to authenticated;
revoke all on function public.sync_push_records(jsonb) from public, anon, service_role;
grant execute on function public.sync_push_records(jsonb) to authenticated;
