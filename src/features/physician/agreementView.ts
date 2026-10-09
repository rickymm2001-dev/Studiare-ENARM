// Lo que muestra la pantalla de acuerdo del etiquetado (19, 7.11). Qué preguntas están en la muestra
// de doble etiquetado, cuáles le faltan a un médico y cómo va el acuerdo. Sin React ni Dexie.
import { DEFAULT_THRESHOLDS } from '@/config/thresholds';
import type { BiasLabel, Option, Question } from '@/data/schemas/bank';
import { DOUBLE_LABEL_SEED } from '@/data/usecases/labeling';
import {
  computeAgreement,
  selectDoubleLabelSample,
  type AgreementReport,
} from '@/engines/agreement';

export interface QueueItem {
  question: Question;
  /** Distractores de esta versión, en el orden en que se guardaron */
  options: Option[];
  /** Cuántos ya etiquetó este médico */
  done: number;
}

export interface AgreementView {
  /** Preguntas de la muestra de doble etiquetado, por su ID estable */
  sampleSize: number;
  /** Total de distractores de la muestra */
  sampleOptions: number;
  /** Distractores que este médico ya etiquetó, sobre los de la muestra que le tocan */
  mine: { done: number; total: number };
  /** Preguntas de la muestra que a este médico le faltan, con su avance */
  pending: QueueItem[];
  report: AgreementReport;
}

export interface AgreementInput {
  questions: readonly Question[];
  /** Opciones de las preguntas de la muestra. Las demás preguntas no hace falta cargarlas */
  optionsByQuestion: ReadonlyMap<string, readonly Option[]>;
  labels: readonly BiasLabel[];
  /** El médico que mira. null para admin y dueño, que solo ven el tablero */
  physicianId: string | null;
  /** Preguntas (por ID estable) que este médico puede ver. null si ve todas */
  allowed: ReadonlySet<string> | null;
  share?: number;
}

/**
 * Las preguntas de la muestra de doble etiquetado, por su ID estable. Se toma de todo el banco y no
 * de lo que ve cada médico, así todos etiquetan las mismas preguntas y los pares existen. Una
 * pregunta con al menos dos opciones tiene al menos un distractor
 */
export function sampleQuestionIds(
  questions: readonly Question[],
  share: number = DEFAULT_THRESHOLDS.bias.doubleLabelShare,
): string[] {
  return selectDoubleLabelSample(
    questions
      .filter((question) => question.canonicalOptionIds.length >= 2)
      .map((q) => q.questionId),
    share,
    DOUBLE_LABEL_SEED,
  );
}

export function buildAgreementView(input: AgreementInput): AgreementView {
  const { questions, labels } = input;
  const sampleIds = sampleQuestionIds(questions, input.share);
  const byStableId = new Map(questions.map((question) => [question.questionId, question]));

  const myLabels = new Set(
    labels
      .filter((label) => label.physicianId === input.physicianId)
      .map((label) => label.optionId),
  );
  const pending: QueueItem[] = [];
  let sampleOptions = 0;
  let mineTotal = 0;
  let mineDone = 0;
  for (const stableId of sampleIds) {
    const question = byStableId.get(stableId);
    if (!question) continue;
    const distractors = (input.optionsByQuestion.get(question.id) ?? []).filter(
      (option) => !option.isCorrect,
    );
    sampleOptions += distractors.length;
    if (input.physicianId === null) continue;
    if (input.allowed && !input.allowed.has(stableId)) continue;
    const done = distractors.filter((option) => myLabels.has(option.optionId)).length;
    mineTotal += distractors.length;
    mineDone += done;
    if (done < distractors.length) pending.push({ question, options: distractors, done });
  }

  return {
    sampleSize: sampleIds.length,
    sampleOptions,
    mine: { done: mineDone, total: mineTotal },
    pending,
    report: computeAgreement(
      labels.map((label) => ({
        optionId: label.optionId,
        physicianId: label.physicianId,
        tag: label.biasTag,
      })),
      DEFAULT_THRESHOLDS.bias,
    ),
  };
}
