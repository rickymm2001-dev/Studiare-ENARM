#!/usr/bin/env bash
# Autotest de la calibración nocturna (B14, 3.13 y 8.3 del plan de B14). Levanta un Postgres temporal con
# lib/db.sh, lo migra como el proyecto real, empaqueta la calibración con Vite en dist-calibration, corre
# dist-calibration/selftest.mjs contra esa base y la apaga. Sin Docker, igual que npm run test:sql, y corre
# igual en la sesión que en el CI. No toca ninguna base que ya exista. Necesita los binarios de PostgreSQL
# 15 o más reciente. Uso: npm run calibration:selftest
set -euo pipefail
script_dir="$(cd "$(dirname "$0")" && pwd)"
root="$(cd "$script_dir/../.." && pwd)"
# lib/db.sh espera en here la carpeta supabase/tests
here="$root/supabase/tests"
# Un puerto propio, distinto del de npm run test:sql, para poder correr los dos a la vez
export PG_TEST_PORT="${PG_TEST_PORT:-54502}"
# shellcheck source=supabase/tests/lib/db.sh
source "$here/lib/db.sh"
trap pg_cleanup EXIT

cd "$root"
npm run calibration:build --silent
pg_start
# El detalle de las migraciones solo se muestra si fallan. El registro del CI es público
migrate_log="$(mktemp)"
if ! pg_migrate >"$migrate_log" 2>&1; then
  cat "$migrate_log"
  rm -f "$migrate_log"
  exit 1
fi
rm -f "$migrate_log"
node dist-calibration/selftest.mjs "$work" "$port"
