// Autotest de la calibración nocturna (B14, 3.13 y 8.3 del plan de B14). Lo corre scripts/calibration/
// selftest.sh con el Postgres temporal ya migrado, después de empaquetar este archivo con Vite. Siembra un
// universo simulado (seed.ts), corre la misma pipeline de producción con el transporte de Postgres
// (pgStore.ts) y revisa las metas de 8.3 con cuentas independientes (checks.ts). Escribe una tabla de
// números y códigos, a la salida y al resumen del paso de GitHub, y termina en 1 si una meta no se cumple.
//
// Uso: node dist-calibration/selftest.mjs {carpeta del socket} {puerto}
// Escenarios en la misma base
//   1. dry. Una corrida forzada a solo reporte no cambia nada
//   2. full. La corrida completa en apply, con 300 alumnos y 90 días
//   3. repeat. La misma noche otra vez da lo mismo y el seq no sube
//   4. small. Se retira el permiso a todos menos 60 y se corre de nuevo
import { appendFileSync } from 'node:fs';
import postgres from 'postgres';
import { FACTORY_THRESHOLDS } from '@/config/thresholds';
import { topicTaxonomy } from '@/demo/content';
import { simItemsFrom } from '@/demo/generator/cohort';
import { computeRecovery } from '@/demo/generator/recovery';
import {
  catalogDigest,
  cellDifferences,
  countOf,
  difficultyCorrelations,
  expectedCells,
  expectedFlags,
  expectedReadyVariants,
  intruders,
  linesWithSecrets,
  recountOptions,
  sparseRaschSlope,
  storedCells,
  storedFlags,
  storedOptions,
  tallyDifferences,
  type Spied,
} from './checks.ts';
import { createLogger, describeError } from './log.ts';
import { createPgStore, type PgSql } from './pgStore.ts';
import { runPipeline, type PipelineResult } from './pipeline.ts';
import {
  revokeAllExcept,
  seedUniverse,
  uuidOf,
  type SeededStudent,
  type Universe,
} from './seed.ts';
import type { CalibrationStore } from './store.ts';

const SEED = 'calibracion-ci-1';
// Para depurar en local se pueden bajar con SELFTEST_SIZE y SELFTEST_DAYS, y SELFTEST_ONLY=seed deja la
// base sembrada y se detiene. El CI no define ninguna y corre el escenario completo de 3.13
const SIZE = Number(process.env.SELFTEST_SIZE ?? 300);
const DAYS = Number(process.env.SELFTEST_DAYS ?? 90);
const KEPT = 60;

interface Goal {
  label: string;
  target: string;
  value: string;
  ok: boolean;
}

const goals: Goal[] = [];
const round = (value: number) =>
  Number.isInteger(value) ? value : Math.round(value * 1000) / 1000;
const goal = (label: string, target: string, value: number | string, ok: boolean) => {
  goals.push({
    label,
    target,
    value: typeof value === 'number' ? String(round(value)) : value,
    ok,
  });
};

const lines: string[] = [];
const out = (line: string) => {
  lines.push(line);
  console.log(line);
};
const log = createLogger(out);

/** El almacén del autotest, que además anota quién entró a cada página, con los seudónimos de la sal */
function spy(inner: CalibrationStore, sql: PgSql, universe: Universe) {
  let current: Spied | null = null;
  const need = (): Spied => {
    if (!current) throw new RangeError('La corrida no ha empezado');
    return current;
  };
  const store: CalibrationStore = {
    ...inner,
    begin: async (args) => {
      const result = (await inner.begin(args)) as { runId: string; status: string };
      if (result.status === 'running') {
        const rows = (await sql.unsafe(
          `select id::text as id, public.calibration_pseudonym($1::uuid, id) as person
           from auth.users where id = any($2::uuid[])`,
          [result.runId, universe.students.map((student) => student.userId)] as never,
        )) as unknown as { id: string; person: string }[];
        current = {
          runId: result.runId,
          pseudonyms: new Map(rows.map((row) => [row.id, row.person])),
          people: new Set(),
          answers: { persons: new Set(), rows: 0, dropped: 0 },
          exposures: new Set(),
          motives: new Set(),
        };
      }
      return result;
    },
    people: async (run) => {
      const result = (await inner.people(run)) as { people: [string, unknown][] };
      for (const [person] of result.people) need().people.add(person);
      return result;
    },
    answers: async (run, after, limit) => {
      const result = (await inner.answers(run, after, limit)) as {
        rows: string[][];
        dropped: number;
      };
      const spied = need();
      for (const row of result.rows) spied.answers.persons.add(row[0] as string);
      spied.answers.rows += result.rows.length;
      spied.answers.dropped += result.dropped;
      return result;
    },
    exposures: async (run, after, limit) => {
      const result = (await inner.exposures(run, after, limit)) as { rows: string[][] };
      for (const row of result.rows) need().exposures.add(row[0] as string);
      return result;
    },
    motives: async (run, after, limit) => {
      const result = (await inner.motives(run, after, limit)) as { rows: string[][] };
      for (const row of result.rows) need().motives.add(row[0] as string);
      return result;
    },
  };
  return { store, spied: need };
}

/** La corrida publicada y cuándo, como texto, para ver si algo la movió */
async function readPublication(sql: PgSql): Promise<string> {
  const rows = (await sql.unsafe(
    `select coalesce(run_id::text, '') || '|' || coalesce(published_at::text, '') as value from public.model_publication`,
  )) as unknown as { value: string }[];
  return rows.map((row) => row.value).join(',');
}

async function itemSnapshot(sql: PgSql, run: string) {
  const rows = (await sql.unsafe(
    `select version_id::text as version, state, difficulty::float8 as difficulty
     from public.item_calibrations where run_id = $1::uuid`,
    [run] as never,
  )) as unknown as { version: string; state: string; difficulty: number | null }[];
  return new Map(
    rows.map((row) => [row.version, { state: row.state, difficulty: row.difficulty }]),
  );
}

async function cellSnapshot(sql: PgSql, run: string) {
  const rows = (await sql.unsafe(
    `select cohort || '|' || cohort_key || '|' || metric || '|' || branch as key,
            students::text || ':' || coalesce(cuts::text, '') as value
     from public.comparison_cells where run_id = $1::uuid`,
    [run] as never,
  )) as unknown as { key: string; value: string }[];
  return new Map(rows.map((row) => [row.key, row.value]));
}

async function main(socketDir: string, port: number): Promise<number> {
  const started = performance.now();
  const elapsed = () => Math.round(performance.now() - started);
  const sql = postgres({
    host: socketDir,
    port,
    username: 'postgres',
    database: 'postgres',
    max: 4,
    onnotice: () => undefined,
  });
  const mark = `ZQX${Math.random().toString(36).slice(2, 10).toUpperCase()}`;
  try {
    log.log('selftest_start', { students: SIZE, days: DAYS });
    const universe = await seedUniverse(sql, { seed: SEED, size: SIZE, days: DAYS, mark });
    log.log('selftest_step', { step: 'seed', events: universe.events, ms: elapsed() });
    if (process.env.SELFTEST_ONLY === 'seed') return 0;
    await sql.unsafe(
      `update public.platform_settings
       set value = jsonb_set(jsonb_set(value, '{calibration,enabled}', 'true'), '{calibration,mode}', '"apply"')
       where key = 'model_settings'`,
    );

    const { store, spied } = spy(createPgStore(sql), sql, universe);
    const run = async (forceDryRun: boolean): Promise<PipelineResult & { spied: Spied }> => {
      const result = await runPipeline(store, {
        trigger: 'selftest',
        forceDryRun,
        runner: { runId: '1', sha: 'abcdef0' },
        log,
      });
      return { ...result, spied: spied() };
    };

    // ------------------------------------------------------------ 1. full
    const full = await run(false);
    log.log('selftest_step', { step: 'full', ms: elapsed() });
    const fullRun = full.runId as string;
    const students = universe.students;
    const valid = (student: SeededStudent) =>
      student.consent === 'granted' && student.role === 'student';
    const pseudonymOf = (student: SeededStudent, spiedRun: Spied) =>
      spiedRun.pseudonyms.get(student.userId) as string;
    const expectedPeople = new Set(students.filter(valid).map((s) => pseudonymOf(s, full.spied)));
    const allowedAnswers = new Set(
      students.filter((s) => valid(s) && !s.forger).map((s) => pseudonymOf(s, full.spied)),
    );
    const missing = [...expectedPeople].filter((person) => !full.spied.people.has(person)).length;
    const extra = [...full.spied.people].filter((person) => !expectedPeople.has(person)).length;
    goal(
      'Alumnos que entran, exactamente los de permiso vigente',
      '0 de más y 0 de menos',
      `${extra} de más y ${missing} de menos`,
      extra === 0 && missing === 0 && full.spied.people.size > 200,
    );
    const leaked =
      intruders(full.spied.answers.persons, allowedAnswers) +
      intruders(full.spied.exposures, allowedAnswers) +
      intruders(full.spied.motives, allowedAnswers);
    goal(
      'Filas de quien retiró el permiso, del equipo o de quien inventa respuestas',
      '0 filas',
      leaked,
      leaked === 0 && full.spied.answers.dropped >= universe.forgedAnswers,
    );

    const corr = await difficultyCorrelations(sql, universe, fullRun);
    goal(
      'Rasch publicada contra la dificultad verdadera',
      'correlación de 0.90 o más',
      corr.rasch,
      corr.rasch >= 0.9,
    );
    // El universo sembrado es denso (casi todos contestan casi todo) y no ve el sesgo de JML. Con pocas
    // respuestas por alumno, como en producción, la pendiente delata una escala inflada (hallazgo 3)
    const sparse = sparseRaschSlope(['a', 'b', 'c']);
    goal(
      'Rasch con datos ralos (5 a 20 respuestas por alumno), pendiente contra la verdadera',
      'de 0.9 a 1.05',
      `${round(sparse.slope)} con ${round(sparse.perPerson)} respuestas por alumno`,
      sparse.slope >= 0.9 && sparse.slope <= 1.05,
    );
    goal(
      'Elo contra la dificultad verdadera',
      'correlación de 0.80 o más',
      corr.elo,
      corr.elo >= 0.8,
    );
    goal(
      'Preguntas calibradas en el escenario completo',
      'al menos 1',
      corr.calibrated,
      corr.calibrated >= 1,
    );

    // Distractores contra un recuento directo en SQL
    const recount = await recountOptions(
      sql,
      fullRun,
      FACTORY_THRESHOLDS.behavior.maxWordsPerSecond,
    );
    const stored = await storedOptions(sql, fullRun);
    const differences = tallyDifferences(recount, stored);
    goal(
      'Exposiciones y elecciones por opción contra un recuento en SQL',
      '0 diferencias',
      `${differences} con ${stored.length} opciones`,
      differences === 0 && stored.length > 1000,
    );
    const correct = new Set(
      universe.bank.questions.flatMap((entry) =>
        entry.options.filter((option) => option.isCorrect).map((option) => uuidOf(option.optionId)),
      ),
    );
    const expectedMarks = expectedFlags(
      recount,
      correct,
      FACTORY_THRESHOLDS.sampling.nonFunctionalExposures,
      FACTORY_THRESHOLDS.sampling.nonFunctionalRate,
    );
    const marks = await storedFlags(sql);
    const markDifferences =
      [...expectedMarks].filter((item) => !marks.has(item)).length +
      [...marks].filter((item) => !expectedMarks.has(item)).length;
    goal(
      'Marcas de distractores contra un recuento en SQL',
      '0 diferencias',
      `${markDifferences} con ${expectedMarks.size} marcas`,
      markDifferences === 0 && expectedMarks.size > 0,
    );

    // Variantes
    const readyExpected = expectedReadyVariants(
      universe,
      recount,
      FACTORY_THRESHOLDS.sampling.variantExposuresForExam,
    );
    const variantRows = (await sql.unsafe(
      `select version_id::text as version, exam_eligible from public.question_catalog where variant_of is not null`,
    )) as unknown as { version: string; exam_eligible: boolean }[];
    const variantDifferences = variantRows.filter(
      (row) => row.exam_eligible !== readyExpected.has(row.version),
    ).length;
    goal(
      'Variantes en el examen solo con 200 exposiciones por distractor canónico',
      '0 diferencias',
      `${variantDifferences} con ${readyExpected.size} listas de ${variantRows.length}`,
      variantDifferences === 0 && readyExpected.size > 0 && variantRows.length > readyExpected.size,
    );

    // Comparación contra el motor sobre los datos simulados
    const settings = { windowDays: 30, minBranchAnswers: 20, minGroupSize: 30 };
    const members = students.filter((s) => valid(s) && !s.forger);
    const specialtyOf = (key: string) => members.filter((s) => s.specialty === key);
    const surgeryStored = await storedCells(sql, fullRun, 'specialty', 'general_surgery');
    const surgeryDiff = cellDifferences(
      expectedCells(universe, specialtyOf('general_surgery'), settings),
      surgeryStored,
    );
    const surgeryAccuracy = surgeryStored.get('sim_accuracy|*');
    goal(
      'Celda de cirugía general con 40, lista y con los cortes del motor',
      '40 alumnos y 0 diferencias',
      `${surgeryAccuracy?.students ?? 0} alumnos y ${surgeryDiff} diferencias`,
      surgeryAccuracy?.students === 40 && surgeryAccuracy.cuts?.length === 19 && surgeryDiff === 0,
    );
    const allDiff = cellDifferences(
      expectedCells(universe, members, settings),
      await storedCells(sql, fullRun, 'all', '*'),
    );
    goal(
      'Celdas de Todos contra el motor sobre los datos simulados',
      '0 diferencias',
      allDiff,
      allDiff === 0,
    );
    const pediatrics = await storedCells(sql, fullRun, 'specialty', 'pediatrics');
    const pediatricsBad = [...pediatrics.values()].filter(
      (cell) => cell.cuts !== null || cell.students !== 12,
    ).length;
    goal(
      'Celda de pediatría con 12, calibrando y sin cortes',
      'todas con 12 y sin cortes',
      `${pediatrics.size} celdas y ${pediatricsBad} mal`,
      pediatrics.size > 0 && pediatricsBad === 0,
    );

    // Fatiga contra la verdad y detector validado
    const recovery = computeRecovery(universe.cohort, simItemsFrom(universe.bank), topicTaxonomy);
    const noticeable =
      recovery.fatigueNoticeable.seeded === 0
        ? 0
        : recovery.fatigueNoticeable.trend / recovery.fatigueNoticeable.seeded;
    goal('Fatiga apreciable detectada', '80% o más', noticeable, noticeable >= 0.8);
    goal(
      'Marcados con fatiga sin tenerla',
      '10% o menos',
      recovery.fatigueTrend.falsePositiveRate,
      recovery.fatigueTrend.falsePositiveRate <= 0.1,
    );
    const [population] = (await sql.unsafe(
      `select data #>> '{fatigue,state}' as state from public.population_snapshots where run_id = $1::uuid`,
      [fullRun] as never,
    )) as unknown as { state: string }[];
    goal(
      'Detector de fatiga en la cohorte con fatiga',
      'validated',
      population?.state ?? 'sin dato',
      population?.state === 'validated',
    );

    // Acuerdo del etiquetado
    const [agreement] = (await sql.unsafe(
      `select pairs, parity from public.agreement_snapshots where run_id = $1::uuid`,
      [fullRun] as never,
    )) as unknown as { pairs: number; parity: boolean }[];
    goal(
      'Kappa de la noche contra bias_agreement_summary',
      'paridad con 60 pares',
      agreement?.parity ? `paridad con ${agreement.pairs} pares` : 'sin paridad',
      agreement?.parity === true && agreement.pairs === 60,
    );
    const [publication] = (await sql.unsafe(
      `select run_id::text as run from public.model_publication where id`,
    )) as unknown as { run: string }[];
    goal(
      'La publicación apunta a la corrida completa',
      'sí',
      publication?.run === fullRun ? 'sí' : 'no',
      publication?.run === fullRun && full.status === 'ok' && full.applied,
    );

    // ------------------------------------------------------------ 2. small
    // Se retira el permiso a todos menos 60. Primero una corrida forzada a dry_run, que no debe cambiar
    // nada aunque con estos 60 alumnos todas las preguntas pasarían de calibradas a provisionales
    const keep = new Set<string>();
    const pick = (key: string | null, count: number) => {
      for (const student of members
        .filter((s) => s.specialty === key && !keep.has(s.userId))
        .slice(0, count)) {
        keep.add(student.userId);
      }
    };
    pick('general_surgery', 20);
    pick('pediatrics', 12);
    pick(null, KEPT - keep.size);
    await revokeAllExcept(sql, universe, keep);

    const digestBefore = await catalogDigest(sql);
    const flagsBefore = await countOf(sql, `select count(*) as n from public.distractor_flags`);
    const publicationBefore = await readPublication(sql);
    const dry = await run(true);
    log.log('selftest_step', { step: 'dry', ms: elapsed() });
    const dryRun = dry.runId as string;
    const wouldChange = await countOf(
      sql,
      `select count(*) as n
       from public.item_calibrations ic
       join public.question_catalog c on c.version_id = ic.version_id
       where ic.run_id = $1::uuid and (c.calibration ->> 'state') is distinct from ic.state`,
      [dryRun],
    );
    const dryChanges =
      Number(digestBefore !== (await catalogDigest(sql))) +
      Number(
        flagsBefore !== (await countOf(sql, `select count(*) as n from public.distractor_flags`)),
      ) +
      Number(publicationBefore !== (await readPublication(sql)));
    goal(
      'dry_run deja el catálogo, las marcas y la publicación como estaban',
      'sin cambios aunque habría cambiado algo',
      `${dryChanges} cambios y ${wouldChange} preguntas habrían cambiado`,
      dry.status === 'ok' &&
        dry.mode === 'dry_run' &&
        !dry.applied &&
        dryChanges === 0 &&
        wouldChange > 0,
    );

    const small = await run(false);
    log.log('selftest_step', { step: 'small', ms: elapsed() });
    const smallRun = small.runId as string;
    const digestSmall = await catalogDigest(sql);
    goal(
      'Una corrida en apply sí cambia el catálogo',
      'cambia',
      digestSmall === digestBefore ? 'sin cambios' : 'cambia',
      small.status === 'ok' && small.applied && digestSmall !== digestBefore,
    );
    const keptPeople = new Set(
      students.filter((s) => keep.has(s.userId)).map((s) => pseudonymOf(s, small.spied)),
    );
    const smallMissing = [...keptPeople].filter((person) => !small.spied.people.has(person)).length;
    const smallExtra = [...small.spied.people].filter((person) => !keptPeople.has(person)).length;
    const smallLeak =
      intruders(small.spied.answers.persons, keptPeople) +
      intruders(small.spied.exposures, keptPeople) +
      intruders(small.spied.motives, keptPeople);
    goal(
      'Retirar el permiso saca al alumno de la noche',
      `solo ${KEPT} alumnos y 0 filas de los demás`,
      `${small.spied.people.size} alumnos, ${smallExtra + smallMissing} fuera de lugar y ${smallLeak} filas`,
      small.spied.people.size === KEPT && smallExtra === 0 && smallMissing === 0 && smallLeak === 0,
    );
    const smallCorr = await difficultyCorrelations(sql, universe, smallRun);
    goal(
      'Con 60 alumnos hay preguntas provisionales y ninguna calibrada',
      '1 provisional o más y 0 calibradas',
      `${smallCorr.provisional} provisionales y ${smallCorr.calibrated} calibradas`,
      smallCorr.provisional >= 1 && smallCorr.calibrated === 0,
    );
    const [smallSpecialty] = (await sql.unsafe(
      `select count(*)::int as cells, (count(*) filter (where cuts is not null))::int as with_cuts
       from public.comparison_cells where run_id = $1::uuid and cohort = 'specialty'`,
      [smallRun] as never,
    )) as unknown as { cells: number; with_cuts: number }[];
    goal(
      'Con 60 alumnos las celdas de especialidad calibran sin cortes',
      '0 con cortes',
      `${smallSpecialty?.with_cuts ?? 0} de ${smallSpecialty?.cells ?? 0}`,
      (smallSpecialty?.cells ?? 0) > 0 && smallSpecialty?.with_cuts === 0,
    );
    const smallAll = await storedCells(sql, smallRun, 'all', '*');
    const smallAccuracy = smallAll.get('sim_accuracy|*');
    goal(
      'Con 60 alumnos la celda de Todos sigue lista',
      'lista con 19 cortes',
      smallAccuracy?.cuts ? `lista con ${smallAccuracy.students} alumnos` : 'sin cortes',
      (smallAccuracy?.students ?? 0) >= 30 && smallAccuracy?.cuts?.length === 19,
    );

    // ------------------------------------------------------------ 3. repeat
    const firstItems = await itemSnapshot(sql, smallRun);
    const firstCells = await cellSnapshot(sql, smallRun);
    const again = await run(false);
    log.log('selftest_step', { step: 'repeat', ms: elapsed() });
    const secondItems = await itemSnapshot(sql, again.runId as string);
    const secondCells = await cellSnapshot(sql, again.runId as string);
    const itemDiffs = [...firstItems].filter(([version, a]) => {
      const b = secondItems.get(version);
      if (b === undefined) return true;
      return a.state !== b.state || Math.abs((a.difficulty ?? 0) - (b.difficulty ?? 0)) > 0.002;
    }).length;
    const cellDiffs =
      [...firstCells].filter(([key, value]) => secondCells.get(key) !== value).length +
      Math.abs(firstCells.size - secondCells.size);
    const sameCatalog = (await catalogDigest(sql)) === digestSmall;
    goal(
      'Repetir la noche da lo mismo y el seq no sube',
      '0 diferencias y el mismo catálogo',
      `${itemDiffs} preguntas, ${cellDiffs} celdas y catálogo ${sameCatalog ? 'igual' : 'distinto'}`,
      itemDiffs === 0 && cellDiffs === 0 && sameCatalog && again.status === 'ok',
    );

    // ------------------------------------------------------------ Registros sin marcas
    const runRows = (await sql.unsafe(
      `select (counts::text || runner::text || coalesce(reason, '')) as text from public.calibration_runs`,
    )) as unknown as { text: string }[];
    const populations = (await sql.unsafe(
      `select data::text as text from public.population_snapshots`,
    )) as unknown as { text: string }[];
    const noAt = universe.secrets.filter((secret) => secret !== '@');
    const leaks =
      linesWithSecrets(lines, universe.secrets) +
      linesWithSecrets(
        runRows.map((row) => row.text),
        noAt,
      ) +
      linesWithSecrets(
        populations.map((row) => row.text),
        noAt,
      );
    goal(
      'Registros, conteos y población sin marcas, alias, correos, ids, llaves ni arrobas',
      '0 líneas',
      leaks,
      leaks === 0,
    );

    return finish(elapsed());
  } finally {
    await sql.end({ timeout: 5 });
  }
}

/** Imprime la tabla de números y la manda al resumen del paso. Devuelve el código de salida */
function finish(elapsedMs: number): number {
  const failed = goals.filter((item) => !item.ok);
  const table = [
    '| Medida | Meta | Resultado | |',
    '|---|---|---|---|',
    ...goals.map(
      (item) =>
        `| ${item.label} | ${item.target} | ${item.value} | ${item.ok ? 'cumple' : 'NO CUMPLE'} |`,
    ),
  ];
  for (const line of table) console.log(line);
  const summary = process.env.GITHUB_STEP_SUMMARY;
  if (summary) {
    appendFileSync(
      summary,
      `## Autotest de la calibración nocturna\n\n${table.join('\n')}\n\nTiempo total ${Math.round(elapsedMs / 1000)} s\n`,
    );
  }
  log.log('selftest_done', { goals: goals.length, failed: failed.length, ms: elapsedMs });
  return failed.length === 0 ? 0 : 1;
}

const [socketDir, portText] = process.argv.slice(2);
if (process.argv[1]?.endsWith('selftest.mjs') || process.argv[1]?.endsWith('selftest.ts')) {
  if (!socketDir || !/^[0-9]{2,5}$/.test(portText ?? '')) {
    console.error('Uso: node dist-calibration/selftest.mjs {carpeta del socket} {puerto}');
    process.exitCode = 2;
  } else {
    try {
      process.exitCode = await main(socketDir, Number(portText));
    } catch (error) {
      log.log('error', { ...describeError(error), reason: 'unexpected' });
      // Para depurar en local. El CI no define esta variable y el registro público no lleva mensajes
      if (process.env.SELFTEST_VERBOSE === '1') console.error(error);
      process.exitCode = 1;
    }
  }
}
