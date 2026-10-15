#!/usr/bin/env bash
# Pruebas con varias conexiones a Postgres a la vez. Las demás pruebas SQL corren en una sola sesión, y
# lo que protegen el candado por día del libro de IA (ai_admit_v2) y el reclamo de la cola de lotes
# (ai_jobs_claim, con for update skip locked) solo se ve con sesiones distintas. Lo carga run.sh, que
# pone psql_run, $work, $here y $bin. Corre al final, sobre la misma base y con usuarios propios, y deja
# la cola de lotes sin trabajos pendientes. Cada bloque termina el script con un error si algo no cumple.
#   C1. Seis conexiones piden a la vez 10 llamadas con reserva de la misma alumna (revisión del hallazgo 1)
#   C2. Dos conexiones reclaman trabajos a la vez, una con su transacción abierta (revisión del hallazgo 14)

conc_fail() {
  echo "FALLA $1" >&2
  exit 1
}

run_concurrency_tests() {
  local out="$work/concurrencia"
  local go pid_a oks started elapsed
  local pids=()
  mkdir -p "$out"
  psql_run <<'SQL'
insert into auth.users (id, email, raw_user_meta_data) values
  ('c1500000-0000-0000-0000-000000000001', 'c15-admision@x.mx', '{"alias":"Admisión"}'),
  ('c1500000-0000-0000-0000-000000000002', 'c15-reclamo@x.mx', '{"alias":"Reclamo"}');
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

  # ---------------------------------------------------------------- C2. Reclamar sin dobles
  # La conexión A reclama 2 trabajos y mantiene su transacción abierta 3 segundos, con sus filas
  # bloqueadas. La B reclama 2 más en ese tiempo: con for update skip locked toma los otros 2 enseguida
  # y sin los de A. Sin skip locked esperaría a que A termine
  psql_run -o /dev/null <<'SQL'
update public.ai_jobs set status = 'failed', error = 'provider_error', input = null
  where status in ('queued', 'submitting');
select public.ai_job_enqueue('c1500000-0000-0000-0000-000000000002', 'forgetting', 'fgt_conc-reclamo-000' || n,
  '{"rule":"r"}'::jsonb, repeat('b', 64), 'forgetting.base.v1', 'claude-haiku-5-5', 12)
  from generate_series(1, 4) n;
SQL
  {
    echo "begin;"
    echo "select 'A', j ->> 'id' from jsonb_array_elements(public.ai_jobs_claim(2) -> 'jobs') j;"
    echo "select pg_sleep(3);"
    echo "commit;"
  } | psql_run -At >"$out/reclamo_a.out" &
  pid_a="$!"
  sleep 1
  started="$(date +%s.%N)"
  echo "select 'B', j ->> 'id' from jsonb_array_elements(public.ai_jobs_claim(2) -> 'jobs') j;" |
    psql_run -At >"$out/reclamo_b.out"
  elapsed="$(awk -v a="$started" -v b="$(date +%s.%N)" 'BEGIN { printf "%.2f", b - a }')"
  wait "$pid_a"
  [ "$(grep -c '^A|' "$out/reclamo_a.out" || true)" = "2" ] || conc_fail "C2. La conexión A no reclamó 2 trabajos"
  [ "$(grep -c '^B|' "$out/reclamo_b.out" || true)" = "2" ] || conc_fail "C2. La conexión B no reclamó 2 trabajos"
  [ "$(cat "$out"/reclamo_a.out "$out"/reclamo_b.out | cut -d'|' -f2 | sort -u | grep -c . || true)" = "4" ] ||
    conc_fail "C2. Dos conexiones reclamaron el mismo trabajo"
  awk -v e="$elapsed" 'BEGIN { exit !(e < 2.0) }' ||
    conc_fail "C2. La conexión B esperó $elapsed s a que A terminara, no se saltó sus filas"
  psql_run -At -c "select count(*) = 4 and count(distinct claim_id) = 2 from public.ai_jobs where job_key like 'fgt_conc-reclamo-%' and status = 'submitting'" |
    grep -qx t || conc_fail "C2. Los 4 trabajos no quedaron en 2 reclamos"
  echo "C2. Dos conexiones reclamaron 2 y 2 trabajos distintos, y B no esperó a A ($elapsed s)"
}
