// Qué preguntas se pueden reestructurar con IA (B12, 3.2 y 5.3). Solo las marcadas. Una pregunta está
// marcada si tiene un reporte de error abierto o un distractor no funcional, el que casi nadie elige
// (menos de 5% con 100 exposiciones, src/engines/distractors.ts). La IA no recorre el banco por su
// cuenta. Propone variantes para la cola del médico en las preguntas que ya piden atención, y nunca
// reemplaza la original (D-099). Sin React ni Dexie.
import { DEFAULT_THRESHOLDS, type Thresholds } from '@/config/thresholds';
import { uuidToUlid } from '@/data/cloud/cloudIds';
import type { EditorDistractorFlag, EditorReportRow } from '@/data/editorial/editorialRepo';

export const MARK_REASONS = ['open_report', 'non_functional_distractor'] as const;
export type MarkReason = (typeof MARK_REASONS)[number];

/**
 * El id de una pregunta para compararlo entre el banco local, con ULID, y la nube, con uuid. Los dos
 * son el mismo número de 128 bits, así que se pasa todo a ULID en mayúsculas
 */
export function comparableQuestionId(id: string): string {
  return (uuidToUlid(id) ?? id).toUpperCase();
}

export interface MarkInput {
  reports: readonly Pick<EditorReportRow, 'questionId' | 'status'>[];
  distractors: readonly Pick<
    EditorDistractorFlag,
    'questionId' | 'status' | 'exposures' | 'attraction'
  >[];
  /** Los umbrales de muestreo. Por omisión los del admin, 5% con 100 exposiciones */
  thresholds?: Pick<Thresholds['sampling'], 'nonFunctionalRate' | 'nonFunctionalExposures'>;
}

/** Un distractor sigue sin funcionar si nadie lo ha atendido y casi nadie lo elige con exposiciones de sobra */
export function isNonFunctional(
  flag: MarkInput['distractors'][number],
  thresholds: NonNullable<MarkInput['thresholds']>,
): boolean {
  return (
    flag.status === 'open' &&
    flag.exposures >= thresholds.nonFunctionalExposures &&
    flag.attraction < thresholds.nonFunctionalRate
  );
}

/** Los motivos por los que cada pregunta está marcada, por su id comparable. Las no marcadas no aparecen */
export function restructureMarks(input: MarkInput): Map<string, MarkReason[]> {
  const thresholds = input.thresholds ?? DEFAULT_THRESHOLDS.sampling;
  const marks = new Map<string, MarkReason[]>();
  const add = (questionId: string, reason: MarkReason) => {
    const key = comparableQuestionId(questionId);
    const reasons = marks.get(key) ?? [];
    if (!reasons.includes(reason)) marks.set(key, [...reasons, reason]);
  };
  for (const report of input.reports) {
    if (report.status === 'open') add(report.questionId, 'open_report');
  }
  for (const flag of input.distractors) {
    if (isNonFunctional(flag, thresholds)) add(flag.questionId, 'non_functional_distractor');
  }
  return marks;
}

export type RestructureMarks = ReadonlyMap<string, readonly MarkReason[]>;

/** Si la pregunta está marcada, con cualquiera de sus dos ids */
export const isMarked = (marks: RestructureMarks, questionId: string): boolean =>
  marks.has(comparableQuestionId(questionId));

/** Por qué está marcada. Vacío si no lo está */
export const marksOf = (marks: RestructureMarks, questionId: string): readonly MarkReason[] =>
  marks.get(comparableQuestionId(questionId)) ?? [];
