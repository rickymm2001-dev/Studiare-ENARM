-- Permisos de funciones y tablas que la primera migración dejó más abiertos de lo necesario
-- (Fase J, D-113). Los encontró el chequeo de seguridad de Supabase al conectar el proyecto real.
--
-- Por qué pasaba
--   En Supabase, toda función nueva en public nace con permiso de ejecución para anon y authenticated.
--   La primera migración le quitó el permiso a public pero no a anon, así que cualquier persona con la
--   llave pública podía llamar a estas funciones por la API (/rest/v1/rpc/...). Ninguna era un hueco
--   abierto, porque cada una revisa por dentro quién la llama. Aun así no tienen por qué estar expuestas.
--
-- Qué cambia
--   set_user_role        solo una sesión iniciada. Por dentro sigue pidiendo que quien llama sea admin o dueño
--   handle_new_user      nadie. Es un trigger de auth.users y el trigger no necesita permiso de ejecución
--   forbid_event_changes nadie. Es un trigger de events y tampoco lo necesita
--   payment_webhook_events  sin permisos de tabla para la API. Ya no tenía políticas, así que no se leía,
--                        pero ahora tampoco se puede ni intentar. Solo apply_payment_notice la escribe
--   ai_day, ai_check_engine  fijan search_path. Las creó la migración de IA alojada sin fijarlo y el
--                        chequeo de Supabase lo marca. Solo las ejecuta el servicio, pero no cuesta nada
--
-- Qué no cambia y por qué
--   current_app_role, is_admin, is_group_member y shares_group siguen abiertas a anon. Las políticas de
--   varias tablas las llaman con el rol de quien consulta, y quitárselas a anon cambiaría un resultado
--   vacío por un error de permisos. Solo contestan sobre quien llama y no devuelven datos de nadie más
--
-- Es idempotente. Se corre después de 20261013000001_admin_users.sql. No edita las migraciones anteriores

revoke all on function public.set_user_role(uuid, public.app_role) from public, anon, service_role;
grant execute on function public.set_user_role(uuid, public.app_role) to authenticated;

revoke all on function public.handle_new_user() from public, anon, authenticated, service_role;
revoke all on function public.forbid_event_changes() from public, anon, authenticated, service_role;

revoke all on public.payment_webhook_events from public, anon, authenticated;

alter function public.ai_day() set search_path = public, pg_temp;
alter function public.ai_check_engine(text) set search_path = public, pg_temp;
