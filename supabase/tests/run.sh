#!/usr/bin/env bash
# Prueba el esquema de Supabase en un Postgres local temporal (D-069). Uso: npm run test:sql
# Necesita los binarios de PostgreSQL 15 o más reciente. No toca ninguna base existente.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
bin="${PG_BIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
work="$(mktemp -d)"
port="${PG_TEST_PORT:-54329}"
run_as=()
if [ "$(id -u)" = "0" ]; then
  chown postgres "$work"
  run_as=(runuser -u postgres --)
fi
cleanup() { "${run_as[@]}" "$bin/pg_ctl" -D "$work/data" stop -m immediate >/dev/null 2>&1 || true; rm -rf "$work"; }
trap cleanup EXIT
"${run_as[@]}" "$bin/initdb" -D "$work/data" -A trust -U postgres >/dev/null
"${run_as[@]}" "$bin/pg_ctl" -D "$work/data" -o "-p $port -k $work -c listen_addresses=''" -l "$work/log" start >/dev/null
psql_run() { "${run_as[@]}" "$bin/psql" -h "$work" -p "$port" -U postgres -d postgres -v ON_ERROR_STOP=1 -q "$@"; }
psql_run -f "$here/stub_auth.sql"
psql_run -f "$here/stub_storage.sql"
for migration in "$here"/../migrations/*.sql; do psql_run -f "$migration"; done
psql_run -f "$here/grants.sql"
# Las migraciones que siguen al freno son idempotentes. Se corren otra vez, por su nombre, la de la foto
# de perfil de B2, las dos de B7, las dos del plan Gratis de B8, la de cuentas y acceso de B9, las tres de
# pagos de B10, las del banco en la nube de B11 y las tres de la IA real de B12, para comprobarlo. Van en
# el orden del proyecto real. Las de B8 vuelven a cerrar Party y los apuntes de la nube que la de Party de
# B7 deja abiertos. La de B9 lleva una versión menor que las de B8, pero en el proyecto real se aplica
# después de ellas, así que va después para probar ese orden y que no pise party_open, sync_push_records
# ni user_plan. Las de B10 van después porque 20261019000001 trae otra versión de apply_payment_notice.
# Las de B11 van después porque cierran las tablas del banco y el tope viejo de preguntas que dejaron las
# anteriores. Las de B12 van al final. Se nombran para que una migración nueva de otro bloque no saque a
# ninguna de la lista
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
  20261026000003_ai_gate; do
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
# La de B11 trae otra versión de delete_my_data, así que va después de ejecutar-en-sql-editor.sql
psql_run -f "$here/../manual/banco-b11.sql"
psql_run -f "$here/../manual/banco-b11.sql"
# Con B12 la pieza 4 de ejecutar-en-sql-editor.sql es la versión final de delete_my_data, con lo de B11 y
# los trabajos de IA, así que se pega otra vez después de banco-b11.sql, como dice su encabezado
psql_run -f "$here/../manual/ejecutar-en-sql-editor.sql"
psql_run -f "$here/../manual/ejecutar-en-sql-editor.sql"
psql_run -f "$here/rls_test.sql"
psql_run -f "$here/device_barrier_test.sql"
psql_run -f "$here/sync_test.sql"
psql_run -f "$here/payments_test.sql"
psql_run -f "$here/referral_first_charge_test.sql"
psql_run -f "$here/privacy_test.sql"
psql_run -f "$here/ai_hosted_test.sql"
psql_run -f "$here/settings_test.sql"
psql_run -f "$here/billing_portal_test.sql"
psql_run -f "$here/client_errors_test.sql"
psql_run -f "$here/admin_users_test.sql"
psql_run -f "$here/function_grants_test.sql"
psql_run -f "$here/plan_prices_test.sql"
psql_run -f "$here/avatars_test.sql"
psql_run -f "$here/party_cloud_test.sql"
psql_run -f "$here/free_plan_locks_test.sql"
psql_run -f "$here/free_plan_party_moderation_test.sql"
psql_run -f "$here/accounts_b9_test.sql"
psql_run -f "$here/billing_emails_test.sql"
psql_run -f "$here/billing_plans_test.sql"
psql_run -f "$here/invoice_requests_test.sql"
psql_run -f "$here/bank_core_test.sql"
psql_run -f "$here/bank_editorial_test.sql"
psql_run -f "$here/physician_pay_test.sql"
psql_run -f "$here/bank_sync_test.sql"
psql_run -f "$here/deck_catalog_test.sql"
psql_run -f "$here/ai_proxy_v2_test.sql"
psql_run -f "$here/ai_jobs_test.sql"
psql_run -f "$here/ai_gate_test.sql"
