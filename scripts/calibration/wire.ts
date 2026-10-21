// Lo que devuelven las funciones calibration_*, validado y convertido a los tipos de los motores
// (B14, 1.9 y 3.14 del plan de B14). Los transportes (restStore.ts y pgStore.ts) no miran la forma de lo
// que reciben. Aquí se revisa cada página con zod antes de que un motor la use, así una función que
// cambia de forma, o una fila rota, falla con un ZodError y no con un resultado equivocado.
//
// Los ids del banco llegan como uuid en minúsculas y los seudónimos como 16 caracteres hexadecimales.
import { z } from 'zod';
import { readModelSettings, type ModelSettings } from '@/config/modelSettings';
import { FACTORY_THRESHOLDS, mergeThresholds, type Thresholds } from '@/config/thresholds';
import type {
  ActivityRow,
  AnswerRow,
  BankItemRow,
  ExposureRow,
  LabelPairRow,
  MotiveRow,
  PersonRow,
} from '@/engines/calibration/types';

const UUID = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
const PERSON = z.string().regex(/^[0-9a-f]{16}$/);
const DAY = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const COUNT = z.number().int().nonnegative();
const STATE = z.enum(['physician_estimate', 'provisional', 'calibrated']);

// ===================================================================== calibration_begin
const BeginSchema = z.object({
  runId: UUID,
  status: z.enum(['running', 'skipped']),
  reason: z.string().max(40).nullable(),
  mode: z.enum(['dry_run', 'apply']),
  studyDay: DAY,
  asOfSeq: COUNT.nullable(),
  settings: z
    .object({
      model: z.unknown(),
      thresholds: z.record(z.string(), z.record(z.string(), z.number())),
    })
    .nullable(),
  counts: z.record(z.string(), z.number()),
});

export interface BeginResult {
  runId: string;
  status: 'running' | 'skipped';
  reason: string | null;
  mode: 'dry_run' | 'apply';
  studyDay: string;
  asOfSeq: number | null;
  /** Los ajustes del modelo, con sus respaldos y el piso de 30 */
  settings: ModelSettings;
  /** Los umbrales de fábrica con los cambios del admin encima */
  thresholds: Thresholds;
  /** Los cambios del admin eran inválidos y se usaron los de fábrica */
  thresholdsFallback: boolean;
  consenters: number;
}

export function parseBegin(raw: unknown): BeginResult {
  const begin = BeginSchema.parse(raw);
  const merged = mergeThresholds(FACTORY_THRESHOLDS, begin.settings?.thresholds ?? {});
  return {
    runId: begin.runId,
    status: begin.status,
    reason: begin.reason,
    mode: begin.mode,
    studyDay: begin.studyDay,
    asOfSeq: begin.asOfSeq,
    settings: readModelSettings(begin.settings?.model),
    thresholds: merged.ok ? merged.value : FACTORY_THRESHOLDS,
    thresholdsFallback: !merged.ok,
    consenters: begin.counts.consenters ?? 0,
  };
}

// ===================================================================== calibration_bank
const BankSchema = z.object({
  items: z.array(
    z.object({
      v: UUID,
      q: UUID,
      branch: z.string().min(1).max(80),
      topic: z.string().min(1).max(120),
      subtopic: z.string().max(160),
      lang: z.enum(['es', 'en']),
      physician: z.number().min(1).max(5),
      variantOf: UUID.nullable(),
      words: COUNT,
      current: z.boolean(),
      canonical: z.array(UUID),
      options: z.array(
        z.object({
          o: UUID,
          correct: z.boolean(),
          tag: z.string().max(80).nullable(),
          w: COUNT,
        }),
      ),
      prev: z.object({ d: z.number().nullable(), se: z.number().nullable(), st: STATE }).nullable(),
    }),
  ),
});

export function parseBank(raw: unknown): BankItemRow[] {
  return BankSchema.parse(raw).items.map((item) => ({
    versionId: item.v,
    questionId: item.q,
    branch: item.branch,
    topic: item.topic,
    subtopic: item.subtopic,
    language: item.lang,
    physician: item.physician,
    variantOf: item.variantOf,
    words: item.words,
    current: item.current,
    canonical: item.canonical,
    options: item.options.map((option) => ({
      id: option.o,
      correct: option.correct,
      tag: option.tag,
      words: option.w,
    })),
    previous: item.prev ? { difficulty: item.prev.d, se: item.prev.se, state: item.prev.st } : null,
  }));
}

// ===================================================================== calibration_people
const PeopleSchema = z.object({
  people: z.array(z.tuple([PERSON, z.string().min(1).max(80).nullable()])),
});

export function parsePeople(raw: unknown): PersonRow[] {
  return PeopleSchema.parse(raw).people.map(([person, specialty]) => ({ person, specialty }));
}

// ===================================================================== Páginas
export interface Page<T> {
  rows: T[];
  /** El cursor para pedir la siguiente página */
  next: number;
  done: boolean;
}

const AnswerTuple = z.tuple([
  PERSON,
  PERSON.nullable(),
  UUID,
  UUID,
  z.union([z.literal(0), z.literal(1)]),
  z.enum(['practice', 'exam', 'challenge']).nullable(),
  COUNT,
  COUNT.nullable(),
  COUNT.nullable(),
  z.enum(['guessed', 'unsure', 'sure']).nullable(),
  COUNT,
  COUNT,
]);
const AnswersPageSchema = z.object({
  rows: z.array(AnswerTuple),
  next: COUNT,
  done: z.boolean(),
  dropped: COUNT,
});

export function parseAnswersPage(raw: unknown): Page<AnswerRow> & { dropped: number } {
  const page = AnswersPageSchema.parse(raw);
  return {
    rows: page.rows.map(
      ([
        person,
        session,
        versionId,
        optionId,
        correct,
        sessionKind,
        daysBefore,
        minute,
        ms,
        confidence,
        changes,
        seq,
      ]) => ({
        person,
        session,
        versionId,
        optionId,
        correct: correct === 1,
        sessionKind,
        daysBefore,
        minute,
        ms,
        confidence,
        changes,
        seq,
      }),
    ),
    next: page.next,
    done: page.done,
    dropped: page.dropped,
  };
}

const ExposuresPageSchema = z.object({
  rows: z.array(z.tuple([PERSON, UUID, z.array(UUID).min(1), COUNT])),
  next: COUNT,
  done: z.boolean(),
});

export function parseExposuresPage(raw: unknown): Page<ExposureRow> {
  const page = ExposuresPageSchema.parse(raw);
  return {
    rows: page.rows.map(([person, versionId, options, seq]) => ({
      person,
      versionId,
      options,
      seq,
    })),
    next: page.next,
    done: page.done,
  };
}

const MotivesPageSchema = z.object({
  rows: z.array(
    z.tuple([
      PERSON,
      COUNT,
      z.string().min(1).max(80).nullable(),
      z.string().min(1).max(40),
      z.union([z.literal(0), z.literal(1)]),
    ]),
  ),
  next: COUNT,
  done: z.boolean(),
});

export function parseMotivesPage(raw: unknown): Page<MotiveRow> {
  const page = MotivesPageSchema.parse(raw);
  return {
    rows: page.rows.map(([person, daysBefore, branch, motive, lastThird]) => ({
      person,
      daysBefore,
      branch,
      motive,
      lastThird: lastThird === 1,
    })),
    next: page.next,
    done: page.done,
  };
}

const ActivityPageSchema = z.object({
  rows: z.array(z.tuple([PERSON, COUNT, COUNT, COUNT])),
  /** El cursor de la actividad es texto, seudónimo y días. null si la página salió vacía */
  next: z.string().max(40).nullable(),
  done: z.boolean(),
});

export function parseActivityPage(raw: unknown): {
  rows: ActivityRow[];
  next: string | null;
  done: boolean;
} {
  const page = ActivityPageSchema.parse(raw);
  return {
    rows: page.rows.map(([person, daysBefore, reviews, answers]) => ({
      person,
      daysBefore,
      reviews,
      answers,
    })),
    next: page.next,
    done: page.done,
  };
}

// ===================================================================== calibration_label_pairs
const PairsSchema = z.object({
  pairs: z.array(z.tuple([UUID, z.string().min(1).max(80), z.string().min(1).max(80)])),
});

export function parseLabelPairs(raw: unknown): LabelPairRow[] {
  return PairsSchema.parse(raw).pairs.map(([optionId, authorTag, reviewerTag]) => ({
    optionId,
    authorTag,
    reviewerTag,
  }));
}

// ===================================================================== Publicación y cierre
const CountSchema = z.number().int().nonnegative();
export const parseCount = (raw: unknown): number => CountSchema.parse(raw);

export function parseParity(raw: unknown): boolean {
  return z.object({ parity: z.boolean() }).parse(raw).parity;
}

const FinishSchema = z.object({
  status: z.enum(['ok', 'partial', 'failed']),
  applied: z.boolean(),
  counts: z.record(z.string(), z.number()),
});

export interface FinishResult {
  status: 'ok' | 'partial' | 'failed';
  applied: boolean;
  counts: Record<string, number>;
}

export function parseFinish(raw: unknown): FinishResult {
  return FinishSchema.parse(raw);
}
