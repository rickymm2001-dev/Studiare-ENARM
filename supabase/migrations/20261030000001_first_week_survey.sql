-- Encuesta de los primeros días (B18 del plan del cambio, 2.1 a 2.5 del diseño).
--
-- A los 7 días de su cuenta, el alumno puede contestar siete preguntas cerradas y un comentario libre. Es un dato que
-- da a propósito, cada vez, y no depende de Medición de uso ni de Mejora con tus datos sin nombre. Con ella Ricardo
-- ve si los primeros alumnos entendieron cómo empezar, qué usaron y qué les frenó, antes de abrir el registro.
--
-- Qué agrega
--   - El ajuste survey_first_week en platform_settings, apagado. survey_setting lo lee y valida cada campo, y si
--     alguno no sirve usa el de fábrica
--   - survey_responses, una fila por cuenta y por encuesta, solo para agregar. El alumno queda ligado por user_id
--     (para borrar, para una sola respuesta y para la cascada), pero al equipo solo le llega un código al azar
--   - survey_answers_ok y survey_comment_ok, dos funciones puras que la tabla y submit_survey comparten, así que
--     lo que se acepta se define en un solo lugar. Una prueba de Vitest compara los ids de survey_answers_ok con
--     src/config/surveys.ts, en los dos sentidos
--   - forbid_survey_changes, que copia la regla de la bitácora (forbid_event_changes). Un cambio siempre falla y un
--     borrado solo pasa si lo hace delete_my_survey_response (marca app.erasing_user) o si la cuenta ya no existe
--   - Cuatro funciones del alumno, con sesión, dispositivo activo y rol de alumno revisados por dentro
--       my_survey_status      si la encuesta le toca, si ya la contestó y a cuántos días va su cuenta
--       submit_survey         la guarda, o dice por qué no (already, closed, invalid)
--       my_survey_response    lo propio, para Exportar mis datos
--     La cuarta, delete_my_survey_response, vive en 20261030000002_survey_erase.sql porque lleva un borrado y esta
--     migración queda sin delete ni drop (D-113), así que el conector de Supabase también la puede aplicar
--   - Dos funciones del equipo, que piden is_admin() (dueño o admin, con segundo factor cuando se pide). Un médico no
--     entra. Ninguna devuelve user_id, correo, alias ni fecha, solo el código, y ordenan por código
--       admin_survey_summary    cuántas cuentas cumplen el ajuste, cuántas contestaron y los conteos por opción
--       admin_survey_responses  las respuestas con su código, sin los días de la cuenta, hasta 200
--
-- Reglas que se hacen cumplir aquí
--   - La tabla tiene row level security, sin políticas y sin permisos para anon, authenticated ni service_role. Todo
--     pasa por las funciones
--   - El rol que cuenta es el guardado (assigned_app_role) y no el que da current_app_role, que para el equipo sin
--     segundo factor se ve como alumno. Un médico, un admin o el dueño nunca ven ni contestan la encuesta
--   - El comentario no puede parecer un correo ni un teléfono (survey_comment_ok), con una revisión que normaliza el
--     texto y quita los caracteres invisibles antes de mirar. Es un apoyo y no una garantía. La app también lo avisa
--     con las mismas reglas, pero la base es la que decide
--   - Los días que pasaron desde el alta se guardan en days_since_signup, para el análisis interno, y solo se los
--     devuelven a su dueña (my_survey_status y my_survey_response). Ninguna función del equipo los devuelve, porque con
--     5 personas "9 días de cuenta" más la fecha de alta que Usuarios ya muestra ligaría un código con una cuenta.
--     created_at queda en la fila, pero ninguna función del equipo lo devuelve ni ordena por él, así que el orden no
--     delata quién contestó primero
--
-- Que la sesión que mantiene el proyecto no lea los comentarios (CLAUDE.md, al LLM solo viajan IDs seudónimos y texto
-- del banco) es una regla de conducta (D-139) y no un control técnico. admin_survey_responses los devuelve a quien sea
-- dueño o admin con su sesión, y una conexión a la base como postgres, como la del conector con execute_sql, puede leer
-- la tabla. El control técnico real es que la sesión no usa la llave de admin de Ricardo para esta tabla y que a la
-- sesión solo se le pasa el resumen por conteos (admin_survey_summary), nunca la lista.
--
-- Es idempotente, no edita las migraciones anteriores y no lleva delete ni drop (D-113). Va después de
-- 20261029000004_delete_my_data_v4.sql

-- ===================================================================== Ajuste
-- Apagado. Se prende al final, justo antes de invitar a los primeros alumnos (docs/PRIMEROS_ALUMNOS.md).
--   enabled         true la prende. Solo el booleano true cuenta
--   id              qué encuesta es. Solo vale uno que la base conoce (first-week-v1), y cualquier otro usa ese, para que la
--                   franja nunca quede abierta con una encuesta que submit_survey no acepta. Una segunda encuesta, por
--                   ejemplo a los 30 días, no pide otra tabla, pero sí sumar su id a survey_answers_ok y a la lista de
--                   survey_setting, y a src/config/surveys.ts
--   delay_days      cuántos días espera la cuenta nueva, de 0 a 30. Con 0 se prueba sin esperar
--   accounts_until  una fecha AAAA-MM-DD. Las cuentas creadas ese día o después ya no la reciben
insert into public.platform_settings (key, value) values (
  'survey_first_week',
  '{"enabled":false,"id":"first-week-v1","delay_days":7,"accounts_until":null}'::jsonb
) on conflict (key) do nothing;

-- ===================================================================== Reglas de las respuestas
-- true si las respuestas son las de la encuesta que dice p_survey_id. Exige exactamente las siete llaves, con los
-- ids de src/config/surveys.ts y sus reglas. Pura, sin leer ninguna tabla. Los ids van en listas fijas para que la
-- prueba de Vitest los pueda comparar con los de la app
create or replace function public.survey_answers_ok(p_survey_id text, p_answers jsonb) returns boolean
language plpgsql immutable set search_path = public, pg_temp as $$
declare
  v_days constant text[] := array['d0', 'd1_2', 'd3_4', 'd5_6', 'd7'];
  v_used constant text[] := array['review', 'practice', 'exam', 'outlines', 'progress', 'party', 'tutor', 'import', 'none'];
  v_blockers constant text[] := array['unclear_start', 'error', 'slow', 'few_questions', 'not_like_exam', 'confusing_design', 'nothing'];
  v_recommend constant text[] := array['yes', 'maybe', 'no'];
  v_key text;
  v_list jsonb;
begin
  if p_survey_id is distinct from 'first-week-v1' then
    return false;
  end if;
  if p_answers is null or jsonb_typeof(p_answers) <> 'object' then
    return false;
  end if;
  -- Exactamente las siete llaves. Ni una de más ni una de menos
  if (select count(*) from jsonb_object_keys(p_answers)) <> 7
     or not (p_answers ?& array['days_used', 'used', 'clarity', 'ease', 'useful', 'blockers', 'recommend']) then
    return false;
  end if;

  -- Una sola opción, como texto de la lista
  if jsonb_typeof(p_answers -> 'days_used') <> 'string' or not ((p_answers ->> 'days_used') = any (v_days)) then
    return false;
  end if;
  if jsonb_typeof(p_answers -> 'recommend') <> 'string' or not ((p_answers ->> 'recommend') = any (v_recommend)) then
    return false;
  end if;

  -- Escalas de 1 a 5. Solo enteros: 3 sí, 3.0 y "3" no
  foreach v_key in array array['clarity', 'ease', 'useful'] loop
    if jsonb_typeof(p_answers -> v_key) <> 'number' or (p_answers -> v_key)::text !~ '^[1-5]$' then
      return false;
    end if;
  end loop;

  -- Varias opciones: una lista de textos de la lista, sin repetir. none excluye a las demás
  v_list := p_answers -> 'used';
  if jsonb_typeof(v_list) <> 'array' or jsonb_array_length(v_list) not between 1 and cardinality(v_used) then
    return false;
  end if;
  if exists (select 1 from jsonb_array_elements(v_list) e
             where jsonb_typeof(e) <> 'string' or not ((e #>> '{}') = any (v_used))) then
    return false;
  end if;
  if (select count(distinct e) from jsonb_array_elements_text(v_list) e) <> jsonb_array_length(v_list) then
    return false;
  end if;
  if v_list ? 'none' and jsonb_array_length(v_list) > 1 then
    return false;
  end if;

  -- Hasta tres motivos que frenaron. nothing excluye a los demás
  v_list := p_answers -> 'blockers';
  if jsonb_typeof(v_list) <> 'array' or jsonb_array_length(v_list) not between 1 and 3 then
    return false;
  end if;
  if exists (select 1 from jsonb_array_elements(v_list) e
             where jsonb_typeof(e) <> 'string' or not ((e #>> '{}') = any (v_blockers))) then
    return false;
  end if;
  if (select count(distinct e) from jsonb_array_elements_text(v_list) e) <> jsonb_array_length(v_list) then
    return false;
  end if;
  if v_list ? 'nothing' and jsonb_array_length(v_list) > 1 then
    return false;
  end if;
  return true;
end;
$$;

-- true si el comentario es de 1 a 500 caracteres y no parece traer un correo ni un teléfono. La app lo avisa antes de
-- enviar con las mismas reglas (src/config/surveys.ts, COMMENT_RULES), pero esta es la que decide. Es un apoyo y no una
-- garantía: atrapa las formas comunes y no sabe leer un nombre, un número escrito con palabras ni un correo dictado
-- ("ana punto lopez"). Antes de revisar se normaliza el texto (NFKC, que vuelve ＠ en @ y los dígitos de ancho completo
-- en dígitos) y se quitan los caracteres de ancho cero y de formato, así que una arroba escondida con uno de ellos se ve
-- igual. Después se rechaza
--   - cualquier arroba, también la de "ana @ gmail . com", que ya no tiene la forma de un correo
--   - "(at)", "[at]" y "{at}", con o sin espacios, y la palabra arroba entera
--   - un teléfono, que son diez dígitos o más con a lo mucho tres separadores entre uno y otro (espacio, paréntesis,
--     punto, guion, raya, guion bajo o punto medio), así que se atrapan "55 1234 5678", "(55) 1234-5678",
--     "+52 (55) 1234 5678", "55 - 1234 - 5678" y "55·1234·5678"
-- La longitud se revisa primero, para no normalizar ni buscar en un texto enorme. Una prueba compara estas expresiones
-- con las de la app, y los mismos casos de tests/fixtures/survey-comments.json corren aquí (first_week_survey_test.sql)
-- y en Vitest (src/config/surveys.test.ts). Pide una base UTF8, como la de Supabase, por normalize
create or replace function public.survey_comment_ok(p_comment text) returns boolean
language plpgsql immutable set search_path = public, pg_temp as $$
declare
  v_flat text;
begin
  if p_comment is null or char_length(p_comment) not between 1 and 500 then
    return false;
  end if;
  v_flat := regexp_replace(
    normalize(p_comment, nfkc),
    '[\u00AD\u034F\u061C\u115F\u1160\u17B4\u17B5\u180B-\u180F\u200B-\u200F\u202A-\u202E\u2060-\u206F\u3164\uFE00-\uFE0F\uFEFF\uFFA0]',
    '',
    'g');
  return position('@' in v_flat) = 0
    and v_flat !~* '[(\[{]\s*at\s*[)\]}]'
    and v_flat !~* '(^|[^a-z0-9_])arroba($|[^a-z0-9_])'
    and v_flat !~ '(\+?\d[\s().\u2013\u2014_\u00B7\u2022-]{0,3}){10,}';
end;
$$;

-- ===================================================================== Tabla
create table if not exists public.survey_responses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  survey_id text not null check (survey_id ~ '^[a-z0-9-]{3,40}$'),
  -- R y 6 caracteres hexadecimales al azar. No se deriva de la cuenta ni de la fecha
  respondent_code text not null check (respondent_code ~ '^R[0-9A-F]{6}$'),
  days_since_signup smallint not null check (days_since_signup between 0 and 400),
  answers jsonb not null check (public.survey_answers_ok(survey_id, answers)),
  comment text check (comment is null or public.survey_comment_ok(comment)),
  created_at timestamptz not null default now(),
  constraint survey_responses_one_per_user unique (user_id, survey_id),
  constraint survey_responses_code_unique unique (survey_id, respondent_code)
);
alter table public.survey_responses enable row level security;
revoke all on table public.survey_responses from public, anon, authenticated, service_role;

-- La encuesta solo se agrega, como la bitácora. Un cambio siempre falla. Un borrado solo pasa si lo hace
-- delete_my_survey_response para su dueño, o si la cuenta ya no existe (borrar la cuenta, o quitarla desde el panel
-- de Supabase, la arrastra en cascada)
create or replace function public.forbid_survey_changes() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if tg_op = 'DELETE' then
    if coalesce(current_setting('app.erasing_user', true), '') = old.user_id::text then
      return old;
    end if;
    if not exists (select 1 from auth.users where id = old.user_id) then
      return old;
    end if;
  end if;
  raise exception 'La encuesta solo se agrega' using errcode = '42501';
end;
$$;
revoke all on function public.forbid_survey_changes() from public, anon, authenticated, service_role;

do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'survey_responses_append_only' and tgrelid = 'public.survey_responses'::regclass
  ) then
    create trigger survey_responses_append_only before update or delete on public.survey_responses
      for each row execute function public.forbid_survey_changes();
  end if;
end $$;

-- ===================================================================== Ayudas internas
-- El ajuste con cada campo validado. Si alguno no sirve (otro tipo, fuera de rango, una fecha que no existe, un id que la
-- base no conoce) usa el de fábrica, así un valor mal escrito no deja la encuesta a medias ni abre una fecha que nadie
-- quiso. El id se compara con la lista de encuestas que survey_answers_ok sabe revisar: con otro, la franja saldría y
-- submit_survey diría que está cerrada, y nadie podría contestar
create or replace function public.survey_setting()
returns table (enabled boolean, id text, delay_days integer, accounts_until timestamptz)
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_known constant text[] := array['first-week-v1'];
  v_value jsonb;
begin
  select s.value into v_value from public.platform_settings s where s.key = 'survey_first_week';
  enabled := coalesce(v_value -> 'enabled' = 'true'::jsonb, false);
  id := 'first-week-v1';
  delay_days := 7;
  accounts_until := null;
  if jsonb_typeof(v_value) = 'object' then
    if jsonb_typeof(v_value -> 'id') = 'string' and (v_value ->> 'id') = any (v_known) then
      id := v_value ->> 'id';
    end if;
    if jsonb_typeof(v_value -> 'delay_days') = 'number' and (v_value -> 'delay_days')::text ~ '^([0-9]|[12][0-9]|30)$' then
      delay_days := (v_value ->> 'delay_days')::integer;
    end if;
    if jsonb_typeof(v_value -> 'accounts_until') = 'string' and (v_value ->> 'accounts_until') ~ '^\d{4}-\d{2}-\d{2}$' then
      begin
        -- El día empieza a la medianoche de la Ciudad de México, como el día de la IA
        accounts_until := ((v_value ->> 'accounts_until')::date)::timestamp at time zone 'America/Mexico_City';
      exception when others then
        accounts_until := null;
      end;
    end if;
  end if;
  return next;
end;
$$;

-- true si una cuenta creada en p_created ya esperó los días del ajuste y entra en el grupo (se creó antes de la fecha
-- límite, si la hay). Las dos preguntas de "le toca" y "cuántas cuentas cumplen" usan esta misma regla
create or replace function public.survey_waited(p_created timestamptz, p_delay integer, p_until timestamptz)
returns boolean
language sql stable set search_path = public, pg_temp as $$
  select p_created is not null
    and (p_until is null or p_created < p_until)
    and now() - p_created >= make_interval(days => p_delay)
$$;

-- Los días completos que lleva una cuenta, entre 0 y 400
create or replace function public.survey_days_since(p_created timestamptz) returns smallint
language sql stable set search_path = public, pg_temp as $$
  select least(400, greatest(0, floor(extract(epoch from (now() - p_created)) / 86400)))::smallint
$$;

-- Quien llama, con sesión y con el dispositivo activo de la cuenta
create or replace function public.survey_user() returns uuid
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'Hace falta iniciar sesión' using errcode = '28000';
  end if;
  if not public.is_active_device() then
    raise exception 'Este dispositivo no es el activo de la cuenta' using errcode = '42501';
  end if;
  return v_user;
end;
$$;

-- Un código al azar, R y 6 caracteres hexadecimales. Con pgcrypto si está en el esquema extensions, y si no con el
-- uuid al azar, que en Postgres 13 o más sale del generador seguro del servidor. La función que lo usa reintenta si
-- el código ya existe
create or replace function public.survey_new_code() returns text
language plpgsql volatile set search_path = public, pg_temp as $$
begin
  if to_regprocedure('extensions.gen_random_bytes(integer)') is not null then
    return 'R' || upper(encode(extensions.gen_random_bytes(3), 'hex'));
  end if;
  return 'R' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
end;
$$;

-- ===================================================================== Funciones del alumno
-- Si la encuesta le toca a quien llama. Sin permiso de medición, sin tocar nada del estudio. No devuelve error si es
-- del equipo, solo available en false
create or replace function public.my_survey_status() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_user uuid := public.survey_user();
  v_cfg record;
  v_created timestamptz;
  v_answered boolean;
begin
  select * into v_cfg from public.survey_setting();
  select u.created_at into v_created from auth.users u where u.id = v_user;
  v_answered := exists (
    select 1 from public.survey_responses r where r.user_id = v_user and r.survey_id = v_cfg.id
  );
  return jsonb_build_object(
    'available',
      v_cfg.enabled
      and not v_answered
      and public.assigned_app_role() = 'student'
      and public.survey_waited(v_created, v_cfg.delay_days, v_cfg.accounts_until),
    'answered', v_answered,
    'surveyId', v_cfg.id,
    'daysSinceSignup', coalesce(public.survey_days_since(v_created), 0)
  );
end;
$$;

-- Guarda la respuesta de quien llama. El servidor vuelve a revisar todo y la app no decide nada. Devuelve
-- { ok: true, code } o { ok: false, reason } con reason already (ya la contestó), closed (apagada, otra encuesta, no es
-- alumno, fuera del grupo o todavía no cumple los días) o invalid (respuestas o comentario que no cumplen)
create or replace function public.submit_survey(p_survey_id text, p_answers jsonb, p_comment text)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_user uuid := public.survey_user();
  v_cfg record;
  v_created timestamptz;
  v_comment text := nullif(btrim(coalesce(p_comment, '')), '');
  v_code text;
  v_constraint text;
  v_tries integer := 0;
begin
  select * into v_cfg from public.survey_setting();
  select u.created_at into v_created from auth.users u where u.id = v_user;
  if not v_cfg.enabled
     or p_survey_id is distinct from v_cfg.id
     or public.assigned_app_role() <> 'student'
     or not public.survey_waited(v_created, v_cfg.delay_days, v_cfg.accounts_until) then
    return jsonb_build_object('ok', false, 'reason', 'closed');
  end if;
  if exists (select 1 from public.survey_responses r where r.user_id = v_user and r.survey_id = v_cfg.id) then
    return jsonb_build_object('ok', false, 'reason', 'already');
  end if;
  if not public.survey_answers_ok(v_cfg.id, p_answers)
     or (v_comment is not null and not public.survey_comment_ok(v_comment)) then
    return jsonb_build_object('ok', false, 'reason', 'invalid');
  end if;

  loop
    v_code := public.survey_new_code();
    begin
      insert into public.survey_responses (user_id, survey_id, respondent_code, days_since_signup, answers, comment)
        values (v_user, v_cfg.id, v_code, public.survey_days_since(v_created), p_answers, v_comment);
      return jsonb_build_object('ok', true, 'code', v_code);
    exception when unique_violation then
      get stacked diagnostics v_constraint = constraint_name;
      -- Dos envíos a la vez de la misma cuenta. Gana el primero
      if v_constraint = 'survey_responses_one_per_user' then
        return jsonb_build_object('ok', false, 'reason', 'already');
      end if;
      -- El código ya existía. Se vuelve a sortear
      v_tries := v_tries + 1;
      if v_tries >= 20 then
        raise;
      end if;
    end;
  end loop;
end;
$$;

-- Lo propio, para Exportar mis datos. null si no contestó. Es la única función que devuelve la fecha, y solo a su
-- dueño
create or replace function public.my_survey_response() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_user uuid := public.survey_user();
begin
  return (
    select jsonb_build_object(
      'surveyId', r.survey_id,
      'code', r.respondent_code,
      'daysSinceSignup', r.days_since_signup,
      'answers', r.answers,
      'comment', r.comment,
      'answeredAt', r.created_at
    )
    from public.survey_responses r
    where r.user_id = v_user
    order by r.created_at desc
    limit 1
  );
end;
$$;

-- ===================================================================== Funciones del equipo
-- Conteos de la encuesta, sin quiénes. eligible son las cuentas de alumno con el correo confirmado que cumplen el
-- ajuste (se crearon antes de la fecha límite, si la hay, y ya esperaron los días), sin decir cuáles. questions trae,
-- por pregunta, cuántas respuestas marcaron cada opción, y comments cuántas dejaron comentario, sin el texto
create or replace function public.admin_survey_summary(p_survey_id text) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_cfg record;
  v_eligible bigint;
  v_answered bigint;
  v_comments bigint;
  v_questions jsonb;
begin
  if not public.is_admin() then
    raise exception 'Solo un administrador puede ver la encuesta' using errcode = '42501';
  end if;
  select * into v_cfg from public.survey_setting();
  select count(*) into v_eligible
    from auth.users u
    left join public.user_roles ur on ur.user_id = u.id
    where coalesce(ur.role, 'student'::public.app_role) = 'student'
      and u.email_confirmed_at is not null
      and public.survey_waited(u.created_at, v_cfg.delay_days, v_cfg.accounts_until);
  select count(*), count(r.comment) into v_answered, v_comments
    from public.survey_responses r where r.survey_id = p_survey_id;
  select coalesce(jsonb_object_agg(q.qid, q.counts), '{}'::jsonb) into v_questions
    from (
      select c.qid, jsonb_object_agg(c.val, c.n) as counts
      from (
        select p.qid, p.val, count(*)::integer as n
        from (
          select a.key as qid, e.val
          from public.survey_responses r
          cross join lateral jsonb_each(r.answers) a
          cross join lateral (
            select x as val
              from jsonb_array_elements_text(case when jsonb_typeof(a.value) = 'array' then a.value else '[]'::jsonb end) x
            union all
            select a.value #>> '{}' where jsonb_typeof(a.value) <> 'array'
          ) e
          where r.survey_id = p_survey_id
        ) p
        group by p.qid, p.val
      ) c
      group by c.qid
    ) q;
  return jsonb_build_object(
    'eligible', v_eligible,
    'answered', v_answered,
    'questions', v_questions,
    'comments', v_comments
  );
end;
$$;

-- Las respuestas, una por fila, con su código y sin nada que ligue a la persona, ni la fecha ni los días de la cuenta
-- (con la fecha de alta que ya ve el equipo en Usuarios, los días darían la cuenta). Ordenadas por código y no por
-- fecha, hasta 200
create or replace function public.admin_survey_responses(p_survey_id text)
returns table (code text, answers jsonb, comment text)
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not public.is_admin() then
    raise exception 'Solo un administrador puede ver la encuesta' using errcode = '42501';
  end if;
  return query
    select r.respondent_code, r.answers, r.comment
    from public.survey_responses r
    where r.survey_id = p_survey_id
    order by r.respondent_code
    limit 200;
end;
$$;

-- ===================================================================== Permisos
-- Ayudas puras, sin tocar ninguna tabla: nadie las llama desde la API
revoke all on function public.survey_answers_ok(text, jsonb) from public, anon, authenticated, service_role;
revoke all on function public.survey_comment_ok(text) from public, anon, authenticated, service_role;
revoke all on function public.survey_waited(timestamptz, integer, timestamptz) from public, anon, authenticated, service_role;
revoke all on function public.survey_days_since(timestamptz) from public, anon, authenticated, service_role;
revoke all on function public.survey_new_code() from public, anon, authenticated, service_role;
revoke all on function public.survey_setting() from public, anon, authenticated, service_role;
revoke all on function public.survey_user() from public, anon, authenticated, service_role;
-- Del alumno, con sesión y dispositivo activo
revoke all on function public.my_survey_status() from public, anon, authenticated, service_role;
grant execute on function public.my_survey_status() to authenticated;
revoke all on function public.submit_survey(text, jsonb, text) from public, anon, authenticated, service_role;
grant execute on function public.submit_survey(text, jsonb, text) to authenticated;
revoke all on function public.my_survey_response() from public, anon, authenticated, service_role;
grant execute on function public.my_survey_response() to authenticated;
-- Del equipo, con is_admin() por dentro
revoke all on function public.admin_survey_summary(text) from public, anon, authenticated, service_role;
grant execute on function public.admin_survey_summary(text) to authenticated;
revoke all on function public.admin_survey_responses(text) from public, anon, authenticated, service_role;
grant execute on function public.admin_survey_responses(text) to authenticated;
