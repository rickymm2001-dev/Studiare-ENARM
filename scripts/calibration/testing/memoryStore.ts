// Una base en memoria para probar la pipeline de la calibración sin Postgres (B14, 3.14 del plan de
// B14). Responde con las mismas formas que las funciones calibration_* (1.9), en páginas por seq, y
// anota lo que la pipeline le publica. Los ids ya vienen como uuid y los seudónimos como 16 caracteres
// hexadecimales, que es lo que valida wire.ts. wireInput convierte la entrada simulada de
// tests/calibration/simulated.ts a esa forma.
import type { CalibrationInput } from '@/engines/calibration/types';
import { ulidToUuid } from '@/data/cloud/cloudIds';
import { StoreError, type BeginArgs, type CalibrationStore, type RpcMethod } from '../store.ts';

const hex16 = (n: number) => n.toString(16).padStart(16, '0');

/** Convierte una entrada con ULID y seudónimos cortos a la forma que valida wire.ts */
export function wireInput(input: CalibrationInput): CalibrationInput {
  const uuid = (id: string) => ulidToUuid(id) ?? id;
  const persons = new Map<string, string>();
  const sessions = new Map<string, string>();
  const person = (value: string) => {
    let mapped = persons.get(value);
    if (!mapped) {
      mapped = hex16(persons.size + 1);
      persons.set(value, mapped);
    }
    return mapped;
  };
  const session = (value: string) => {
    let mapped = sessions.get(value);
    if (!mapped) {
      mapped = hex16(0xabc000 + sessions.size);
      sessions.set(value, mapped);
    }
    return mapped;
  };
  return {
    ...input,
    bank: input.bank.map((item) => ({
      ...item,
      versionId: uuid(item.versionId),
      questionId: uuid(item.questionId),
      variantOf: item.variantOf === null ? null : uuid(item.variantOf),
      canonical: item.canonical.map(uuid),
      options: item.options.map((option) => ({ ...option, id: uuid(option.id) })),
    })),
    people: input.people.map((row) => ({ ...row, person: person(row.person) })),
    answers: input.answers.map((row) => ({
      ...row,
      person: person(row.person),
      session: row.session === null ? null : session(row.session),
      versionId: uuid(row.versionId),
      optionId: uuid(row.optionId),
    })),
    exposures: input.exposures.map((row) => ({
      ...row,
      person: person(row.person),
      versionId: uuid(row.versionId),
      options: row.options.map(uuid),
    })),
    activity: input.activity.map((row) => ({ ...row, person: person(row.person) })),
    motives: input.motives.map((row) => ({ ...row, person: person(row.person) })),
    labelPairs: input.labelPairs.map((row, index) => ({
      ...row,
      optionId: ulidToUuid(`0${String(index).padStart(25, '0')}`) ?? row.optionId,
    })),
  };
}

export interface MemoryStoreOptions {
  mode?: 'dry_run' | 'apply';
  /** begin responde skipped con este motivo */
  skip?: string;
  /** La función que falla con este SQLSTATE */
  failAt?: { method: RpcMethod; code: string };
  /** answers devuelve un cursor que no avanza */
  stuckCursor?: boolean;
  /** Filas que se quedan fuera de answers por la defensa de la base */
  dropped?: number;
  /** Cambios del admin a los umbrales, como los manda calibration_begin */
  thresholds?: Record<string, Record<string, number>>;
  /** El estado con que responde finish, por omisión el que se le pide */
  finishAs?: 'ok' | 'partial';
}

export interface MemoryStore extends CalibrationStore {
  /** Los métodos que la pipeline llamó, en orden */
  calls: RpcMethod[];
  begins: BeginArgs[];
  /** Cuántas filas pidió en cada página de answers */
  answerLimits: number[];
  published: {
    items: Record<string, unknown>[];
    options: Record<string, unknown>[];
    population: unknown;
    comparison: Record<string, unknown>[];
    agreement: unknown;
  };
  finished: {
    status: string;
    reason: string | null;
    counts: Record<string, unknown>;
  } | null;
  finishCalls: number;
}

const RUN = '0b1c2d3e-4f50-4a61-8b72-93a4b5c6d7e8';

export function memoryStore(
  input: CalibrationInput,
  options: MemoryStoreOptions = {},
): MemoryStore {
  const configured = options.mode ?? 'apply';
  // El modo de la corrida en curso, que puede ser dry_run aunque el ajuste diga apply
  let mode: 'dry_run' | 'apply' = configured;
  const maxSeq = Math.max(
    0,
    ...input.answers.map((row) => row.seq),
    ...input.exposures.map((row) => row.seq),
  );
  const store: MemoryStore = {
    calls: [],
    begins: [],
    answerLimits: [],
    published: { items: [], options: [], population: null, comparison: [], agreement: null },
    finished: null,
    finishCalls: 0,
    begin(args) {
      store.calls.push('begin');
      store.begins.push(args);
      if (options.skip) {
        return Promise.resolve({
          runId: RUN,
          status: 'skipped',
          reason: options.skip,
          mode: 'dry_run',
          studyDay: input.asOfDay,
          asOfSeq: null,
          settings: null,
          counts: {},
        });
      }
      mode = args.forceDryRun ? 'dry_run' : configured;
      return Promise.resolve({
        runId: RUN,
        status: 'running',
        reason: null,
        mode,
        studyDay: input.asOfDay,
        asOfSeq: maxSeq,
        settings: { model: input.settings, thresholds: options.thresholds ?? {} },
        counts: { consenters: input.people.length },
      });
    },
    bank: (run) =>
      step('bank', run, () => ({
        items: input.bank.map((item) => ({
          v: item.versionId,
          vUlid: 'X'.repeat(26),
          q: item.questionId,
          branch: item.branch,
          topic: item.topic,
          subtopic: item.subtopic,
          lang: item.language,
          physician: item.physician,
          variantOf: item.variantOf,
          words: item.words,
          current: item.current,
          canonical: item.canonical,
          options: item.options.map((option) => ({
            o: option.id,
            ovUlid: 'X'.repeat(26),
            correct: option.correct,
            tag: option.tag,
            w: option.words,
          })),
          prev: item.previous
            ? { d: item.previous.difficulty, se: item.previous.se, st: item.previous.state }
            : null,
        })),
      })),
    people: (run) =>
      step('people', run, () => ({
        people: input.people.map((row) => [row.person, row.specialty]),
      })),
    answers: (run, after, limit) => {
      store.answerLimits.push(limit);
      return step('answers', run, () => {
        const rows = input.answers.filter((row) => row.seq > after).sort((a, b) => a.seq - b.seq);
        const page = rows.slice(0, limit);
        const last = page.at(-1)?.seq ?? after;
        return {
          rows: page.map((row) => [
            row.person,
            row.session,
            row.versionId,
            row.optionId,
            row.correct ? 1 : 0,
            row.sessionKind,
            row.daysBefore,
            row.minute,
            row.ms,
            row.confidence,
            row.changes,
            row.seq,
          ]),
          next: options.stuckCursor ? after : last,
          done: options.stuckCursor ? false : rows.length <= limit,
          dropped: options.dropped ?? 0,
        };
      });
    },
    exposures: (run, after, limit) =>
      step('exposures', run, () => {
        const rows = input.exposures.filter((row) => row.seq > after).sort((a, b) => a.seq - b.seq);
        const page = rows.slice(0, limit);
        return {
          rows: page.map((row) => [row.person, row.versionId, row.options, row.seq]),
          next: page.at(-1)?.seq ?? after,
          done: rows.length <= limit,
        };
      }),
    activity: (run, after, limit) =>
      step('activity', run, () => {
        const sorted = [...input.activity].sort(
          (a, b) => a.person.localeCompare(b.person) || a.daysBefore - b.daysBefore,
        );
        const cursor = (row: { person: string; daysBefore: number }) =>
          `${row.person}:${row.daysBefore}`;
        const rows = after === null ? sorted : sorted.filter((row) => cursor(row) > after);
        const page = rows.slice(0, limit);
        const last = page.at(-1);
        return {
          rows: page.map((row) => [row.person, row.daysBefore, row.reviews, row.answers]),
          next: last ? cursor(last) : after,
          done: rows.length <= limit,
        };
      }),
    motives: (run, after, limit) =>
      step('motives', run, () => {
        // Los motivos no traen seq propio. La prueba los pagina por posición
        const rows = input.motives.slice(after);
        const page = rows.slice(0, limit);
        return {
          rows: page.map((row) => [
            row.person,
            row.daysBefore,
            row.branch,
            row.motive,
            row.lastThird ? 1 : 0,
          ]),
          next: after + page.length,
          done: rows.length <= limit,
        };
      }),
    labelPairs: (run) =>
      step('labelPairs', run, () => ({
        pairs: input.labelPairs.map((row) => [row.optionId, row.authorTag, row.reviewerTag]),
      })),
    publishItems: (run, rows) =>
      step('publishItems', run, () => {
        store.published.items.push(...(rows as Record<string, unknown>[]));
        return rows.length;
      }),
    publishOptions: (run, rows) =>
      step('publishOptions', run, () => {
        store.published.options.push(...(rows as Record<string, unknown>[]));
        return rows.length;
      }),
    publishPopulation: (run, data) =>
      step('publishPopulation', run, () => {
        store.published.population = data;
        return null;
      }),
    publishComparison: (run, rows) =>
      step('publishComparison', run, () => {
        store.published.comparison.push(...(rows as Record<string, unknown>[]));
        return rows.length;
      }),
    publishAgreement: (run, data) =>
      step('publishAgreement', run, () => {
        store.published.agreement = data;
        return { parity: true };
      }),
    finish: (run, status, reason, counts) => {
      store.finishCalls += 1;
      return step('finish', run, () => {
        store.finished = { status, reason, counts: { ...counts } };
        const applied = mode === 'apply' && status !== 'failed';
        return {
          status: options.finishAs && status !== 'failed' ? options.finishAs : status,
          applied,
          counts: {},
        };
      });
    },
  };

  function step(method: RpcMethod, run: string, work: () => unknown): Promise<unknown> {
    store.calls.push(method);
    if (run !== RUN) return Promise.reject(new StoreError(method, { code: '22023' }));
    if (options.failAt?.method === method) {
      return Promise.reject(new StoreError(method, { code: options.failAt.code }));
    }
    return Promise.resolve(work());
  }
  return store;
}
