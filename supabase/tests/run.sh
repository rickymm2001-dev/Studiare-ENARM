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
# de perfil de B2, las dos de B7 y las dos del plan Gratis de B8, para comprobarlo. Van en este orden
# porque las de B8 vuelven a cerrar Party y los apuntes de la nube que la de Party de B7 deja abiertos.
# Se nombran para que una migración nueva de otro bloque no saque a ninguna de la lista
for name in \
  20261017000001_avatar_changed_at \
  20261018000001_party_cloud \
  20261019000001_referral_first_charge \
  20261021000001_free_plan_locks \
  20261021000002_free_plan_party_moderation; do
  psql_run -f "$here/../migrations/$name.sql"
done
# Las piezas con delete o drop que se pegan a mano en el proyecto real también tienen que correr limpias
# y repetirse sin daño sobre una base ya migrada
psql_run -f "$here/../manual/ejecutar-en-sql-editor.sql"
psql_run -f "$here/../manual/ejecutar-en-sql-editor.sql"
psql_run -f "$here/../manual/party-dueno-al-borrar-cuenta.sql"
psql_run -f "$here/../manual/party-dueno-al-borrar-cuenta.sql"
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
