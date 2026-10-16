#!/usr/bin/env bash
# Funciones compartidas para levantar y migrar el Postgres temporal de las pruebas (D-069). Las cargan
# con source supabase/tests/run.sh (npm run test:sql) y scripts/calibration/selftest.sh (npm run
# calibration:selftest, B14 3.13). Corren igual en la sesión y en el CI, sin Docker. No tocan ninguna
# base que ya exista. Necesitan los binarios de PostgreSQL 15 o más reciente.
#
# El que carga este archivo define here, la carpeta supabase/tests. Antes de pg_start puede poner
# PG_TEST_PORT (54329 si falta) y PG_BIN. Las funciones dejan estas variables para quien las use
# bin, work, port y run_as. psql_run corre psql contra la base temporal, como superusuario. fixtures es
# una variable de psql con la carpeta tests/fixtures, para leer archivos con \set x `cat :'fixtures'/...`

# Levanta un Postgres temporal con un socket de Unix en su carpeta de trabajo y sin puerto de red
pg_start() {
  bin="${PG_BIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
  work="$(mktemp -d)"
  port="${PG_TEST_PORT:-54329}"
  run_as=()
  if [ "$(id -u)" = "0" ]; then
    chown postgres "$work"
    run_as=(runuser -u postgres --)
  fi
  "${run_as[@]}" "$bin/initdb" -D "$work/data" -A trust -U postgres >/dev/null
  "${run_as[@]}" "$bin/pg_ctl" -D "$work/data" -o "-p $port -k $work -c listen_addresses=''" -l "$work/log" start >/dev/null
}

# Apaga el Postgres temporal y quita su carpeta. Se usa con trap pg_cleanup EXIT
pg_cleanup() {
  "${run_as[@]}" "$bin/pg_ctl" -D "$work/data" stop -m immediate >/dev/null 2>&1 || true
  rm -rf "$work"
}

psql_run() {
  "${run_as[@]}" "$bin/psql" -h "$work" -p "$port" -U postgres -d postgres -v ON_ERROR_STOP=1 -q \
    -v fixtures="$here/../../tests/fixtures" "$@"
}

# Deja la base como el proyecto real. Los stubs de Supabase, todas las migraciones en orden, los permisos,
# las que se vuelven a correr y los archivos manuales
pg_migrate() {
  psql_run -f "$here/stub_auth.sql"
  psql_run -f "$here/stub_storage.sql"
  for migration in "$here"/../migrations/*.sql; do psql_run -f "$migration"; done
  psql_run -f "$here/grants.sql"
  # Las migraciones que siguen al freno son idempotentes. Se corren otra vez, por su nombre, la de la foto
  # de perfil de B2, las dos de B7, las dos del plan Gratis de B8, la de cuentas y acceso de B9, las tres de
  # pagos de B10, las del banco en la nube de B11, las cuatro de la IA real de B12 y la de Inglés médico de B13,
  # para comprobarlo. Van en
  # el orden del proyecto real. Las de B8 vuelven a cerrar Party y los apuntes de la nube que la de Party de
  # B7 deja abiertos. La de B9 lleva una versión menor que las de B8, pero en el proyecto real se aplica
  # después de ellas, así que va después para probar ese orden y que no pise party_open, sync_push_records
  # ni user_plan. Las de B10 van después porque 20261019000001 trae otra versión de apply_payment_notice.
  # Las de B11 van después porque cierran las tablas del banco y el tope viejo de preguntas que dejaron las
  # anteriores. Las de B12 van al final y las de B14 después de ellas, porque la tercera de B14 redefine
  # bank_catalog_json de B11 con la llave calibration. Se nombran para que una migración nueva de otro
  # bloque no saque a ninguna de la lista
  for name in \
    20261017000001_avatar_changed_at \
    20261018000001_party_cloud \
    20261019000001_referral_first_charge \
    20261021000001_free_plan_locks \
    20261021000002_free_plan_party_moderation \
    20261020000001_accounts_access \
    20261022000001_billing_emails \
    20261022000002_billing_plans \
    20261022000003_invoice_requests \
    20261023000001_bank_taxonomy \
    20261023000002_bank_core \
    20261023000003_bank_editorial \
    20261023000004_bank_sync \
    20261023000005_deck_catalog \
    20261023000006_bank_sync_cron \
    20261026000001_ai_proxy_v2 \
    20261026000002_ai_jobs \
    20261026000003_ai_gate \
    20261026000004_ai_delete_my_data \
    20261027000001_english_section \
    20261028000001_model_core \
    20261028000002_calibration_job \
    20261028000003_model_reads; do
    psql_run -f "$here/../migrations/$name.sql"
  done
  # Las piezas con delete o drop que se pegan a mano en el proyecto real también tienen que correr limpias
  # y repetirse sin daño sobre una base ya migrada. ejecutar-en-sql-editor.sql ya trae las piezas de B10,
  # así que pegarlo otra vez no deshace los pagos de B10
  psql_run -f "$here/../manual/ejecutar-en-sql-editor.sql"
  psql_run -f "$here/../manual/ejecutar-en-sql-editor.sql"
  psql_run -f "$here/../manual/party-dueno-al-borrar-cuenta.sql"
  psql_run -f "$here/../manual/party-dueno-al-borrar-cuenta.sql"
  psql_run -f "$here/../manual/pagos-b10.sql"
  psql_run -f "$here/../manual/pagos-b10.sql"
  # Con B12, banco-b11.sql, la pieza 4 de ejecutar-en-sql-editor.sql, ia-b12.sql y la Sección con delete de
  # 20261026000004_ai_delete_my_data.sql traen la misma versión final de delete_my_data (v3), con lo de B11
  # y los trabajos de IA. Se pegan en cualquier orden y se repiten sin daño. ia-b12.sql va al final
  psql_run -f "$here/../manual/banco-b11.sql"
  psql_run -f "$here/../manual/banco-b11.sql"
  psql_run -f "$here/../manual/ejecutar-en-sql-editor.sql"
  psql_run -f "$here/../manual/ejecutar-en-sql-editor.sql"
  psql_run -f "$here/../manual/ia-b12.sql"
  psql_run -f "$here/../manual/ia-b12.sql"
}
