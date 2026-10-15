#!/usr/bin/env bash
# Pruebas con varias conexiones a Postgres a la vez. Las demás pruebas SQL corren en una sola sesión, y
# lo que protege el candado por día del libro de IA (ai_admit_v2) solo se ve con sesiones distintas. Lo
# carga run.sh, que pone psql_run, $work, $here y $bin. Corre al final, sobre la misma base y con
# usuarios propios. Cada bloque termina el script con un error si algo no cumple.
#   C1. Seis conexiones piden a la vez 10 llamadas con reserva de la misma alumna (revisión del hallazgo 1)

conc_fail() {
  echo "FALLA $1" >&2
  exit 1
}

run_concurrency_tests() {
  local out="$work/concurrencia"
  local go pid_a oks
  local pids=()
  mkdir -p "$out"
  psql_run <<'SQL'
insert into auth.users (id, email, raw_user_meta_data) values
  ('c1500000-0000-0000-0000-000000000001', 'c15-admision@x.mx', '{"alias":"Admisión"}');
SQL

  # ---------------------------------------------------------------- C1. Admisión a la vez
  # Tope de 0.30 por alumna y 0.13 de reserva por llamada. Nadie asienta nada, como las llamadas en vuelo.
  # Sin la reserva pasarían las 60. Con ella pasan 3, las que entran mientras lo reservado no llega al tope
  go="$(date -u -d '+2 seconds' '+%Y-%m-%d %H:%M:%S.%6N+00')"
  for session in 1 2 3 4 5 6; do
    {
      echo "select pg_sleep_until('$go'::timestamptz);"
      for _ in $(seq 10); do
        echo "select public.ai_admit_v2('c1500000-0000-0000-0000-000000000001', 'flashcards', false, 1000, 1000, 1, 0.3, null, 20, 12, 0.13);"
      done
    } | psql_run -At >"$out/admision_$session.out" &
    pids+=("$!")
  done
  for pid_a in "${pids[@]}"; do wait "$pid_a"; done
  oks="$(cat "$out"/admision_*.out | grep -c '^ok$' || true)"
  [ "$oks" = "3" ] || conc_fail "C1. Pasaron $oks de 60 llamadas a la vez y debían pasar 3"
  [ "$(cat "$out"/admision_*.out | grep -c '^budget_exceeded$' || true)" = "57" ] ||
    conc_fail "C1. Las demás no recibieron budget_exceeded"
  psql_run -At -c "select reserved_usd = 0.39 and calls = 3 from public.ai_usage_day where user_id = 'c1500000-0000-0000-0000-000000000001' and engine = 'flashcards'" |
    grep -qx t || conc_fail "C1. La reserva o las llamadas no quedaron en 0.39 y 3"
  echo "C1. De 60 llamadas a la vez desde 6 conexiones pasaron $oks, las que caben bajo el tope"
}
