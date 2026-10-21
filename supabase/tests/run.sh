#!/usr/bin/env bash
# Prueba el esquema de Supabase en un Postgres local temporal (D-069). Uso: npm run test:sql
# Necesita los binarios de PostgreSQL 15 o más reciente. No toca ninguna base existente.
# Levantar y migrar la base temporal vive en lib/db.sh, que también usa npm run calibration:selftest
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=supabase/tests/lib/db.sh
source "$here/lib/db.sh"
trap pg_cleanup EXIT
pg_start
pg_migrate
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
# La prueba de Inglés médico compara la función SQL de la fuente del texto con passageSource.ts sobre la misma
# lista de casos, y psql la lee de esta ruta
export PASSAGE_SOURCES_FILE="$here/../../tests/fixtures/passage-sources.json"
psql_run -f "$here/english_section_test.sql"
psql_run -f "$here/ai_proxy_v2_test.sql"
psql_run -f "$here/ai_jobs_test.sql"
psql_run -f "$here/ai_gate_test.sql"
psql_run -f "$here/calibration_test.sql"
psql_run -f "$here/model_reads_test.sql"
# Lo que protegen el candado por día del libro de IA y el reclamo de la cola de lotes solo se ve con varias
# conexiones a la vez. Va al final porque deja la cola de lotes sin trabajos pendientes
# shellcheck source=supabase/tests/concurrency.sh
source "$here/concurrency.sh"
run_concurrency_tests
