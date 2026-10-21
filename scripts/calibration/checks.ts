// Comprobaciones del autotest de la calibración (B14, 8.3 del plan de B14). Cada una compara lo que la
// pipeline publicó en la base temporal con una cuenta independiente: un recuento directo en SQL de las
// exposiciones, las métricas de la comparación calculadas con el motor sobre los datos simulados, la
// verdad del generador y la lista de quién debía entrar. Todo lo que devuelven son números.
import {
  COMPARISON_METRICS,
  distributionCuts,
  studentMetrics,
  type ComparisonFact,
} from '@/engines/comparison';
import { calibrateItems } from '@/engines/calibration/items';
import type { BankItemRow, FirstAttempt } from '@/engines/calibration/types';
import { FACTORY_MODEL_SETTINGS } from '@/config/modelSettings';
import { FACTORY_THRESHOLDS } from '@/config/thresholds';
import { createRng } from '@/engines/random';
import { pearson, regressionSlope } from '@/engines/stats/correlation';
import { daysBetween, studyDayOf } from '@/engines/studyDay';
import { SIM_TIME_ZONE } from '@/demo/generator/simulate';
import type { PgSql } from './pgStore.ts';
import { uuidOf, type SeededStudent, type Universe } from './seed.ts';

type Row = Record<string, unknown>;
async function rowsOf(sql: PgSql, text: string, params: unknown[] = []): Promise<Row[]> {
  const rows = await sql.unsafe<Row[]>(text, params as never);
  return rows;
}

/** Una huella del catálogo, para ver si algo cambió. Incluye el seq, la calibración y exam_eligible */
export async function catalogDigest(sql: PgSql): Promise<string> {
  const [row] = await rowsOf(
    sql,
    `select md5(string_agg(question_id::text || '|' || seq::text || '|' || coalesce(calibration::text, '') || '|' || exam_eligible::text,
                           ',' order by question_id)) as digest,
            coalesce(max(seq), 0)::text as max_seq
     from public.question_catalog`,
  );
  return `${String(row?.digest)}:${String(row?.max_seq)}`;
}

export async function countOf(sql: PgSql, text: string, params: unknown[] = []): Promise<number> {
  const [row] = await rowsOf(sql, text, params);
  return Number(row?.n ?? 0);
}

// ===================================================================== Dificultad contra la verdad
export async function difficultyCorrelations(
  sql: PgSql,
  universe: Universe,
  run: string,
): Promise<{ rasch: number; elo: number; items: number; calibrated: number; provisional: number }> {
  const truth = new Map(
    universe.bank.questions.map((entry) => [
      uuidOf(entry.question.id),
      universe.cohort.difficulties[entry.key] ?? 0,
    ]),
  );
  const rows = await rowsOf(
    sql,
    `select version_id::text as version, difficulty::float8 as difficulty, elo::float8 as elo, state, extreme
     from public.item_calibrations where run_id = $1::uuid`,
    [run],
  );
  const rasch = rows.filter((row) => row.difficulty !== null && row.extreme !== true);
  const elo = rows.filter((row) => row.elo !== null);
  return {
    rasch: pearson(
      rasch.map((row) => truth.get(String(row.version)) ?? 0),
      rasch.map((row) => Number(row.difficulty)),
    ),
    elo: pearson(
      elo.map((row) => truth.get(String(row.version)) ?? 0),
      elo.map((row) => Number(row.elo)),
    ),
    items: rows.length,
    calibrated: rows.filter((row) => row.state === 'calibrated').length,
    provisional: rows.filter((row) => row.state === 'provisional').length,
  };
}

// ===================================================================== Dificultad con datos ralos
/** Una versión mínima del banco. calibrateItems solo mira su id, su pregunta y la dificultad del médico */
const sparseBankRow = (index: number): BankItemRow => ({
  versionId: `ralo-v${index}`,
  questionId: `ralo-q${index}`,
  branch: 'pediatrics',
  topic: 'neonatology',
  subtopic: 'neonatal_jaundice',
  language: 'es',
  physician: 3,
  variantOf: null,
  words: 60,
  current: true,
  canonical: [],
  options: [],
  previous: null,
});

/**
 * La pendiente de la dificultad publicada contra la verdadera cuando cada alumno contesta una parte chica
 * del banco, que es el caso real y el que el universo del autotest (alumnos que contestan casi todo) no
 * ve. El sesgo de JML crece con las respuestas por alumno y no con el tamaño del banco, así que con datos
 * densos no hay sesgo y la correlación sale alta aunque la escala quede inflada (revisión de B14,
 * hallazgo 3). Simula con semilla, pasa por calibrateItems, el mismo motor de la noche, y promedia las
 * semillas para no depender de una sola muestra. 1 es una escala fiel
 */
export function sparseRaschSlope(
  seeds: readonly string[],
  size = { persons: 1500, items: 60, minAnswers: 5, maxAnswers: 20 },
): { slope: number; perPerson: number } {
  const bank = Array.from({ length: size.items }, (_, index) => sparseBankRow(index));
  const slopes: number[] = [];
  let answers = 0;
  for (const seed of seeds) {
    const rng = createRng(`ralo|${seed}`);
    const truth = bank.map(() => rng.normal(0, 1));
    const attempts: FirstAttempt[] = [];
    for (let person = 0; person < size.persons; person += 1) {
      const ability = rng.normal(0, 1);
      const count = rng.int(size.minAnswers, size.maxAnswers);
      for (const index of rng.shuffle(bank.map((_, position) => position)).slice(0, count)) {
        const item = bank[index] as BankItemRow;
        attempts.push({
          person: `ralo-p${person}`,
          questionId: item.questionId,
          versionId: item.versionId,
          optionId: 'o',
          correct: rng.chance(1 / (1 + Math.exp(-(ability - (truth[index] as number))))),
          daysBefore: 3,
          seq: attempts.length + 1,
          exposed: null,
        });
      }
    }
    answers += attempts.length;
    const { items } = calibrateItems({
      attempts,
      bank: new Map(bank.map((item) => [item.versionId, item])),
      thresholds: FACTORY_THRESHOLDS,
      settings: FACTORY_MODEL_SETTINGS,
    });
    const estimated = items.filter((item) => item.difficulty !== null);
    slopes.push(
      regressionSlope(
        estimated.map(
          (item) => truth[bank.findIndex((row) => row.versionId === item.versionId)] as number,
        ),
        estimated.map((item) => item.difficulty as number),
      ),
    );
  }
  return {
    slope: slopes.reduce((sum, value) => sum + value, 0) / slopes.length,
    perPerson: answers / (seeds.length * size.persons),
  };
}

// ===================================================================== Recuento directo en SQL
export interface OptionTally {
  version: string;
  option: string;
  exposures: number;
  choices: number;
}

/**
 * Las exposiciones y elecciones de cada opción, contadas directo de la bitácora con SQL y sin pasar por
 * las funciones de exportación ni por los motores. Primer intento de cada alumno con permiso en cada
 * pregunta, con lectura previa en bank_reads, la última pantalla de opciones antes de la respuesta y sin
 * las respuestas más rápidas que la lectura plausible
 */
export async function recountOptions(
  sql: PgSql,
  run: string,
  maxWordsPerSecond: number,
): Promise<OptionTally[]> {
  const rows = await rowsOf(
    sql,
    `with cut as (select as_of_seq from public.calibration_runs where id = $1::uuid),
     consenters as materialized (select user_id from public.calibration_consenters((select as_of_seq from cut))),
     bank as materialized (
       select q.id as version_id, q.question_id, public.uuid_to_ulid(q.id) as vulid,
              public.calibration_words(c.vignette) + public.calibration_words(q.body ->> 'vignette')
                + public.calibration_words(q.body ->> 'prompt') as words
       from public.questions q
       join public.bank_questions r on r.question_id = q.question_id
       left join public.clinical_cases c on c.id = q.case_id
       where q.editorial_status = 'approved' and not q.is_demo),
     opts as materialized (
       select public.uuid_to_ulid(o.id) as oulid, o.question_version_id as version_id,
              coalesce(o.option_id, o.id) as stable_id, public.calibration_words(o.text) as w
       from public.question_options o join bank b on b.version_id = o.question_version_id),
     ans as materialized (
       select e.seq, e.user_id, e.at, b.version_id, b.question_id, b.words, o.stable_id as chosen,
              case when jsonb_typeof(e.payload -> 'msToAnswer') = 'number'
                   then least(greatest(round((e.payload ->> 'msToAnswer')::numeric), 0), 86400000) end as ms
       from public.events e
       join consenters c on c.user_id = e.user_id
       join bank b on b.vulid = upper(e.payload ->> 'questionVersionId')
       join opts o on o.version_id = b.version_id and o.oulid = upper(e.payload ->> 'optionVersionId')
       where e.type = 'question_answered' and e.seq <= (select as_of_seq from cut)
         and exists (
           select 1 from public.bank_reads br
           where br.user_id = e.user_id and br.question_id = b.question_id and br.version_id = b.version_id
             and br.day <= public.calibration_study_day(e.at))),
     first as materialized (
       select distinct on (user_id, question_id) *
       from ans order by user_id, question_id, public.calibration_study_day(at), seq),
     screen as materialized (
       select f.user_id, f.version_id, f.seq, f.ms, f.words, f.chosen, sh.payload
       from first f
       left join lateral (
         select s.payload from public.events s
         where s.user_id = f.user_id and s.type = 'question_shown' and s.seq < f.seq
           and upper(s.payload ->> 'questionVersionId') = public.uuid_to_ulid(f.version_id)
         order by s.seq desc limit 1) sh on true),
     shown as materialized (
       select sc.user_id, sc.version_id, sc.seq, sc.ms, sc.words, sc.chosen, oo.stable_id, oo.w
       from screen sc
       cross join lateral jsonb_array_elements(
         case when jsonb_typeof(sc.payload -> 'shownOptions') = 'array' then sc.payload -> 'shownOptions'
              else '[]'::jsonb end) s
       join opts oo on oo.version_id = sc.version_id and oo.oulid = upper(s ->> 'optionVersionId')),
     valid as (
       select sh.version_id, sh.stable_id, sh.chosen, sh.ms,
              sh.words + sum(sh.w) over (partition by sh.user_id, sh.version_id, sh.seq) as total_words,
              bool_or(sh.stable_id = sh.chosen) over (partition by sh.user_id, sh.version_id, sh.seq) as has_chosen
       from shown sh)
     select version_id::text as version, stable_id::text as option,
            count(*)::int as exposures, (count(*) filter (where stable_id = chosen))::int as choices
     from valid
     where has_chosen and ms >= (greatest(total_words, 1)::numeric / $2::numeric) * 1000
     group by 1, 2 order by 1, 2`,
    [run, maxWordsPerSecond],
  );
  return rows.map((row) => ({
    version: String(row.version),
    option: String(row.option),
    exposures: Number(row.exposures),
    choices: Number(row.choices),
  }));
}

export async function storedOptions(sql: PgSql, run: string): Promise<OptionTally[]> {
  const rows = await rowsOf(
    sql,
    `select version_id::text as version, option_id::text as option, exposures, choices
     from public.option_calibrations where run_id = $1::uuid order by 1, 2`,
    [run],
  );
  return rows.map((row) => ({
    version: String(row.version),
    option: String(row.option),
    exposures: Number(row.exposures),
    choices: Number(row.choices),
  }));
}

/** Cuántas filas difieren entre dos recuentos, contando las que están en uno y no en el otro */
export function tallyDifferences(a: readonly OptionTally[], b: readonly OptionTally[]): number {
  const key = (row: OptionTally) => `${row.version}|${row.option}`;
  const left = new Map(a.map((row) => [key(row), row]));
  const right = new Map(b.map((row) => [key(row), row]));
  let differences = 0;
  for (const [name, row] of left) {
    const other = right.get(name);
    if (other === undefined) differences += 1;
    else if (other.exposures !== row.exposures || other.choices !== row.choices) differences += 1;
  }
  for (const name of right.keys()) if (!left.has(name)) differences += 1;
  return differences;
}

/** Las marcas de distractores que deben existir según un recuento: 100 exposiciones o más y menos de 5% */
export function expectedFlags(
  tallies: readonly OptionTally[],
  correct: ReadonlySet<string>,
  minExposures: number,
  rate: number,
): Set<string> {
  return new Set(
    tallies
      .filter(
        (row) =>
          !correct.has(row.option) &&
          row.exposures >= minExposures &&
          row.choices / row.exposures < rate,
      )
      .map((row) => `${row.version}|${row.option}`),
  );
}

export async function storedFlags(sql: PgSql): Promise<Set<string>> {
  const rows = await rowsOf(
    sql,
    `select question_version_id::text as version, option_id::text as option
     from public.distractor_flags where source = 'calibration'`,
  );
  return new Set(rows.map((row) => `${String(row.version)}|${String(row.option)}`));
}

/** Variantes que deben estar listas según un recuento: cada distractor canónico con las exposiciones */
export function expectedReadyVariants(
  universe: Universe,
  tallies: readonly OptionTally[],
  minExposures: number,
): Set<string> {
  const exposures = new Map(tallies.map((row) => [`${row.version}|${row.option}`, row.exposures]));
  const ready = new Set<string>();
  for (const version of [...universe.variants.ready, ...universe.variants.notReady]) {
    const entry = universe.bank.questions.find(
      (candidate) => uuidOf(candidate.question.id) === version,
    );
    if (!entry) continue;
    const canonical = new Set(entry.question.canonicalOptionIds);
    const distractors = entry.options.filter((o) => canonical.has(o.id) && !o.isCorrect);
    if (
      distractors.length > 0 &&
      distractors.every(
        (o) => (exposures.get(`${version}|${uuidOf(o.optionId)}`) ?? 0) >= minExposures,
      )
    ) {
      ready.add(version);
    }
  }
  return ready;
}

// ===================================================================== Comparación con la verdad
export interface ExpectedCell {
  students: number;
  cuts: number[] | null;
}

/**
 * Las celdas que deben salir para un grupo de alumnos, calculadas con el motor de la comparación sobre
 * los datos simulados y no sobre lo que exportó la base. Una celda por métrica y rama
 */
export function expectedCells(
  universe: Universe,
  members: readonly SeededStudent[],
  settings: { windowDays: number; minBranchAnswers: number; minGroupSize: number },
): Map<string, ExpectedCell> {
  const byMetric = new Map<string, number[]>();
  for (const student of members) {
    const sim = universe.cohort.students[student.index];
    if (!sim) continue;
    const facts: ComparisonFact[] = sim.history.responses.map((response) => ({
      day: studyDayOf(new Date(response.at), SIM_TIME_ZONE),
      kind: 'answer',
      branch: response.branch,
      correct: response.correct,
      sessionKind: 'practice',
    }));
    for (const [day, count] of universe.reviews.get(student.index) ?? []) {
      facts.push({ day, kind: 'review', count });
    }
    const metrics = studentMetrics(facts, {
      asOfDay: universe.today,
      windowDays: settings.windowDays,
      minBranchAnswers: settings.minBranchAnswers,
    });
    for (const metric of COMPARISON_METRICS) {
      for (const [branch, value] of Object.entries(metrics[metric])) {
        if (typeof value !== 'number') continue;
        const key = `${metric}|${branch}`;
        byMetric.set(key, [...(byMetric.get(key) ?? []), value]);
      }
    }
  }
  const cells = new Map<string, ExpectedCell>();
  for (const [key, values] of byMetric) {
    const metric = key.split('|')[0] as (typeof COMPARISON_METRICS)[number];
    cells.set(key, {
      students: values.length,
      cuts: values.length >= settings.minGroupSize ? distributionCuts(values, metric) : null,
    });
  }
  return cells;
}

/** Las celdas guardadas de un grupo en una corrida, con la misma llave que expectedCells */
export async function storedCells(
  sql: PgSql,
  run: string,
  cohort: 'all' | 'specialty',
  key: string,
): Promise<Map<string, ExpectedCell>> {
  const rows = await rowsOf(
    sql,
    `select metric, branch, students, cuts::float8[] as cuts
     from public.comparison_cells where run_id = $1::uuid and cohort = $2 and cohort_key = $3`,
    [run, cohort, key],
  );
  return new Map(
    rows.map((row) => [
      `${String(row.metric)}|${String(row.branch)}`,
      {
        students: Number(row.students),
        cuts: row.cuts === null ? null : (row.cuts as unknown[]).map(Number),
      },
    ]),
  );
}

/** Cuántas celdas difieren entre lo esperado y lo guardado, en alumnos o en cortes */
export function cellDifferences(
  expected: ReadonlyMap<string, ExpectedCell>,
  stored: ReadonlyMap<string, ExpectedCell>,
): number {
  let differences = 0;
  const names = new Set([...expected.keys(), ...stored.keys()]);
  for (const name of names) {
    const a = expected.get(name);
    const b = stored.get(name);
    if (a === undefined || b === undefined) {
      differences += 1;
      continue;
    }
    if (a.students !== b.students || (a.cuts === null) !== (b.cuts === null)) {
      differences += 1;
      continue;
    }
    if (
      a.cuts &&
      b.cuts &&
      a.cuts.some((cut, index) => Math.abs(cut - (b.cuts?.[index] ?? Number.NaN)) > 1e-9)
    ) {
      differences += 1;
    }
  }
  return differences;
}

// ===================================================================== Quién entró
export interface Spied {
  runId: string;
  /** seudónimo de cada alumno sembrado, leído de la sal mientras la corrida estaba abierta */
  pseudonyms: Map<string, string>;
  people: Set<string>;
  answers: { persons: Set<string>; rows: number; dropped: number };
  exposures: Set<string>;
  motives: Set<string>;
}

/** Cuántos seudónimos hay en un conjunto que no deberían estar, según la lista de alumnos válidos */
export function intruders(found: ReadonlySet<string>, allowed: ReadonlySet<string>): number {
  let count = 0;
  for (const person of found) if (!allowed.has(person)) count += 1;
  return count;
}

export const daysAgo = (day: string, asOf: string): number => daysBetween(day, asOf);

/** Busca cualquiera de los textos en un conjunto de líneas. Devuelve cuántas líneas lo contienen */
export function linesWithSecrets(lines: readonly string[], secrets: readonly string[]): number {
  return lines.filter((line) => secrets.some((secret) => secret !== '' && line.includes(secret)))
    .length;
}
