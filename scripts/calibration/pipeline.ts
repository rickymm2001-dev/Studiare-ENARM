// La calibración nocturna de punta a punta (B14, 3.2 del plan de B14).
//
// Una corrida pasa por calibration_begin, la lectura del banco y de los alumnos con permiso en páginas,
// el cálculo con los motores puros de src/engines/calibration, la publicación de los resultados en las
// tablas de la corrida y calibration_finish, que en modo apply los aplica al catálogo en una sola
// transacción. Si algo falla en medio, la corrida se cierra como failed y el error sube con su clase y su
// código, nunca con su mensaje.
//
// Es la misma pipeline en la corrida real (calibrate.ts, con restStore.ts) y en el autotest (selftest.ts,
// con pgStore.ts). Solo habla con un CalibrationStore y con un Logger, así se prueba con una tienda en
// memoria. Todo lo que escribe son números y códigos (log.ts).
import { runCalibration } from '@/engines/calibration/run';
import type {
  ActivityRow,
  AnswerRow,
  CalibrationOutput,
  ExposureRow,
  MotiveRow,
} from '@/engines/calibration/types';
import { describeError, safeCounts, type Logger } from './log.ts';
import type { CalibrationStore } from './store.ts';
import {
  parseActivityPage,
  parseAnswersPage,
  parseBank,
  parseBegin,
  parseCount,
  parseExposuresPage,
  parseFinish,
  parseLabelPairs,
  parseMotivesPage,
  parseParity,
  parsePeople,
  type Page,
} from './wire.ts';

/** Filas por página de lectura. Las funciones de la base aceptan hasta 50,000 */
export const PAGE_SIZE = 20_000;
const ITEM_CHUNK = 5_000;
const OPTION_CHUNK = 20_000;
const COMPARISON_CHUNK = 2_000;
/** Más páginas que esto es un cursor que no avanza */
const MAX_PAGES = 5_000;

export interface PipelineOptions {
  trigger: 'schedule' | 'manual' | 'selftest';
  forceDryRun: boolean;
  /** Solo el número de la corrida de GitHub y el commit */
  runner: { runId?: string; sha?: string };
  log: Logger;
  /** Para las pruebas, que usan páginas chicas para ver la paginación */
  pageSize?: number;
}

export interface PipelineResult {
  status: 'ok' | 'partial' | 'failed' | 'skipped';
  /** Por qué se saltó o quedó parcial. Un código en minúsculas */
  reason: string | null;
  mode: 'dry_run' | 'apply' | null;
  runId: string | null;
  /** calibration_finish aplicó los resultados al catálogo */
  applied: boolean;
  /** Lo que se calculó y se publicó. null si la corrida se saltó */
  output: CalibrationOutput | null;
}

/** Un paso de la pipeline que falló, con el motivo que se guarda al cerrar la corrida */
class PipelineStepError extends Error {
  readonly reason: 'compute_error' | 'invalid_page' | 'store_error' | 'timeout';

  constructor(reason: PipelineStepError['reason'], cause: unknown) {
    super(`La pipeline falló en ${reason}`, { cause });
    this.name = 'PipelineStepError';
    this.reason = reason;
  }
}

/** Lee todas las páginas de una lista con cursor numérico, sin huecos ni repetidos */
async function readPages<T>(
  read: (after: number) => Promise<Page<T>>,
): Promise<{ rows: T[]; pages: number }> {
  const rows: T[] = [];
  let after = 0;
  for (let pages = 1; pages <= MAX_PAGES; pages += 1) {
    const page = await read(after);
    for (const row of page.rows) rows.push(row);
    if (page.done) return { rows, pages };
    if (page.next <= after) throw new RangeError('El cursor de la página no avanza');
    after = page.next;
  }
  throw new RangeError('Demasiadas páginas');
}

async function readActivity(
  store: CalibrationStore,
  run: string,
  size: number,
): Promise<{ rows: ActivityRow[]; pages: number }> {
  const rows: ActivityRow[] = [];
  let after: string | null = null;
  for (let pages = 1; pages <= MAX_PAGES; pages += 1) {
    const page = parseActivityPage(await store.activity(run, after, size));
    for (const row of page.rows) rows.push(row);
    if (page.done) return { rows, pages };
    if (page.next === null || page.next === after) {
      throw new RangeError('El cursor de la actividad no avanza');
    }
    after = page.next;
  }
  throw new RangeError('Demasiadas páginas');
}

function chunks<T>(rows: readonly T[], size: number): T[][] {
  const result: T[][] = [];
  for (let start = 0; start < rows.length; start += size)
    result.push(rows.slice(start, start + size));
  return result;
}

/** Qué clase de fallo fue, para el motivo con que se cierra la corrida */
function reasonOf(error: unknown): PipelineStepError['reason'] {
  if (error instanceof PipelineStepError) return error.reason;
  const summary = describeError(error);
  if (summary.errorClass === 'ZodError' || summary.errorClass === 'RangeError')
    return 'invalid_page';
  if (summary.errorCode === 'timeout' || summary.errorCode === '57014') return 'timeout';
  return 'store_error';
}

export async function runPipeline(
  store: CalibrationStore,
  options: PipelineOptions,
): Promise<PipelineResult> {
  const { log } = options;
  const size = options.pageSize ?? PAGE_SIZE;
  const begin = parseBegin(
    await store.begin({
      trigger: options.trigger,
      forceDryRun: options.forceDryRun,
      runner: options.runner,
    }),
  );
  if (begin.status === 'skipped') {
    log.log('skipped', { reason: begin.reason ?? 'unexpected' });
    return {
      status: 'skipped',
      reason: begin.reason,
      mode: null,
      runId: begin.runId,
      applied: false,
      output: null,
    };
  }
  log.log('run_begin', {
    mode: begin.mode,
    consenters: begin.consenters,
    asOfSeq: begin.asOfSeq ?? 0,
    thresholdsFallback: begin.thresholdsFallback,
  });

  const run = begin.runId;
  try {
    const bank = parseBank(await store.bank(run));
    log.log('bank_read', { items: bank.length });
    const people = parsePeople(await store.people(run));
    log.log('people_read', { people: people.length });

    const answers = await readPages<AnswerRow>(async (after) => {
      const page = parseAnswersPage(await store.answers(run, after, size));
      log.log('page_read', { kind: 'answers', rows: page.rows.length, dropped: page.dropped });
      return page;
    });
    const exposures = await readPages<ExposureRow>(async (after) => {
      const page = parseExposuresPage(await store.exposures(run, after, size));
      log.log('page_read', { kind: 'exposures', rows: page.rows.length });
      return page;
    });
    const motives = await readPages<MotiveRow>(async (after) => {
      const page = parseMotivesPage(await store.motives(run, after, size));
      log.log('page_read', { kind: 'motives', rows: page.rows.length });
      return page;
    });
    const activity = await readActivity(store, run, size);
    log.log('page_read', { kind: 'activity', rows: activity.rows.length, pages: activity.pages });
    const labelPairs = parseLabelPairs(await store.labelPairs(run));
    log.log('page_read', { kind: 'pairs', rows: labelPairs.length });

    let output: CalibrationOutput;
    try {
      output = runCalibration({
        asOfDay: begin.studyDay,
        settings: begin.settings,
        thresholds: begin.thresholds,
        bank,
        people,
        answers: answers.rows,
        exposures: exposures.rows,
        activity: activity.rows,
        motives: motives.rows,
        labelPairs,
      });
    } catch (error) {
      throw new PipelineStepError('compute_error', error);
    }
    log.log('computed', {
      itemRows: output.items.length,
      optionRows: output.options.length,
      cells: output.comparison.length,
      fatigueState: output.fatigue.state,
    });

    let itemsPublished = 0;
    for (const rows of chunks(output.items, ITEM_CHUNK)) {
      itemsPublished += parseCount(
        await store.publishItems(
          run,
          rows.map((item) => ({
            v: item.versionId,
            students: item.students,
            difficulty: item.difficulty,
            se: item.se,
            elo: item.elo,
            eloResponses: item.eloResponses,
            state: item.state,
            extreme: item.extreme,
            variantReady: item.variantReady,
          })),
        ),
      );
    }
    let optionsPublished = 0;
    for (const rows of chunks(output.options, OPTION_CHUNK)) {
      optionsPublished += parseCount(
        await store.publishOptions(
          run,
          rows.map((option) => ({
            v: option.versionId,
            o: option.optionId,
            exposures: option.exposures,
            choices: option.choices,
          })),
        ),
      );
    }
    await store.publishPopulation(run, output.population);
    let cellsPublished = 0;
    for (const rows of chunks(output.comparison, COMPARISON_CHUNK)) {
      cellsPublished += parseCount(
        await store.publishComparison(
          run,
          rows.map((cell) => ({
            cohort: cell.cohort,
            key: cell.key,
            metric: cell.metric,
            branch: cell.branch,
            students: cell.students,
            cuts: cell.cuts,
          })),
        ),
      );
    }
    const parity = parseParity(await store.publishAgreement(run, output.agreement));
    log.log('published', {
      items: itemsPublished,
      options: optionsPublished,
      cells: cellsPublished,
      parity,
    });

    const counts = safeCounts({
      ...output.counts,
      windowDays: begin.settings.thresholds.comparisonWindowDays,
      minGroupSize: begin.settings.thresholds.minGroupSize,
      answerPages: answers.pages,
      exposurePages: exposures.pages,
      motivePages: motives.pages,
      activityPages: activity.pages,
      itemsPublished,
      optionsPublished,
      cellsPublished,
      parity,
      thresholdsFallback: begin.thresholdsFallback,
    });
    const finish = parseFinish(await store.finish(run, 'ok', null, counts));
    log.log('finish', { status: finish.status, applied: finish.applied, mode: begin.mode });
    return {
      status: finish.status === 'failed' ? 'failed' : finish.status,
      reason: finish.status === 'partial' && !parity ? 'kappa_mismatch' : null,
      mode: begin.mode,
      runId: run,
      applied: finish.applied,
      output,
    };
  } catch (error) {
    const summary = describeError(error instanceof PipelineStepError ? error.cause : error);
    log.log('error', { ...summary, reason: reasonOf(error) });
    try {
      await store.finish(run, 'failed', reasonOf(error), {});
    } catch (closing) {
      log.log('error', { ...describeError(closing), reason: 'store_error' });
    }
    throw error;
  }
}
