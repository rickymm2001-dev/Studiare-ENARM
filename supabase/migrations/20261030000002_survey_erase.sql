-- Borrar mi respuesta de la encuesta de los primeros días (B18 del plan del cambio, 2.5 y 8.4 del diseño).
--
-- Es la cuarta función del alumno de 20261030000001_first_week_survey.sql. Va en su propia migración porque es la
-- única pieza que lleva un borrado, y así la primera migración queda sin delete ni drop (D-113) y el conector de
-- Supabase la puede aplicar sin una confirmación humana. Esta la aplica la herramienta de despliegue
-- (npm run deploy:supabase -- --plan b18), que manda el archivo tal cual, como con Borrar mis datos v4 de B15.
--
-- La encuesta se borra con esta función y no con delete_my_data (8.4), que no se toca. Borrar mis datos no la quita,
-- y el aviso de privacidad lo dice. Eliminar la cuenta sí la quita, en cascada. La función marca app.erasing_user
-- con la cuenta de quien llama, que es lo que deja pasar el borrado a forbid_survey_changes, y quita todas las
-- respuestas de esa cuenta. Devuelve true si había algo que quitar. Pide sesión y dispositivo activo, no el rol de
-- alumno, porque quien ya no es alumno también puede quitar lo que contestó.
--
-- Es idempotente y no edita las migraciones anteriores. Va después de 20261030000001_first_week_survey.sql

create or replace function public.delete_my_survey_response() returns boolean
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_user uuid := public.survey_user();
  v_rows integer;
begin
  perform set_config('app.erasing_user', v_user::text, true);
  delete from public.survey_responses where user_id = v_user;
  get diagnostics v_rows = row_count;
  perform set_config('app.erasing_user', '', true);
  return v_rows > 0;
end;
$$;
revoke all on function public.delete_my_survey_response() from public, anon, authenticated, service_role;
grant execute on function public.delete_my_survey_response() to authenticated;

-- Comprobación. Las columnas deben salir como las pide el plan
select
  (select count(*) from pg_tables where schemaname = 'public' and tablename = 'survey_responses') as tabla_de_encuesta,
  (select relrowsecurity from pg_class where oid = 'public.survey_responses'::regclass) as tabla_con_seguridad_por_fila,
  not has_table_privilege('anon', 'public.survey_responses', 'select,insert,update,delete')
    and not has_table_privilege('authenticated', 'public.survey_responses', 'select,insert,update,delete')
    and not has_table_privilege('service_role', 'public.survey_responses', 'select,insert,update,delete') as tabla_sin_permisos_directos,
  (select count(*) from pg_trigger
    where tgrelid = 'public.survey_responses'::regclass and tgname = 'survey_responses_append_only') as solo_se_agrega,
  has_function_privilege('authenticated', 'public.my_survey_status()', 'execute') as alumno_ve_su_estado,
  has_function_privilege('authenticated', 'public.submit_survey(text, jsonb, text)', 'execute') as alumno_contesta,
  has_function_privilege('authenticated', 'public.my_survey_response()', 'execute') as alumno_exporta,
  has_function_privilege('authenticated', 'public.delete_my_survey_response()', 'execute') as alumno_borra_la_suya,
  has_function_privilege('authenticated', 'public.admin_survey_summary(text)', 'execute') as equipo_ve_conteos,
  has_function_privilege('authenticated', 'public.admin_survey_responses(text)', 'execute') as equipo_ve_respuestas,
  has_function_privilege('anon', 'public.my_survey_status()', 'execute')
    or has_function_privilege('anon', 'public.submit_survey(text, jsonb, text)', 'execute')
    or has_function_privilege('anon', 'public.admin_survey_summary(text)', 'execute') as anonimo_entra,
  has_function_privilege('service_role', 'public.admin_survey_responses(text)', 'execute') as llave_lee_respuestas,
  exists (select 1 from public.platform_settings where key = 'survey_first_week') as ajuste_sembrado;
