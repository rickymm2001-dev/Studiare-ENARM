// Resultados de un examen terminado (pantalla 9). Convierte el estado del examen y las preguntas
// que se usaron en lo que califica el motor exam. Sin React ni Dexie, para probarlo con datos
// armados a mano.
import {
  scoreExam,
  sectionOf,
  type ExamAnswer,
  type ExamQuestionInfo,
  type ExamScore,
  type ExamSection,
} from '@/engines/exam';
import type { QuestionBundle } from '../simulator/useQuestion';
import { answerOf, type ExamState } from './examState';

export type ExamBundles = ReadonlyMap<string, QuestionBundle>;

/** Las preguntas del examen en su orden. Una pregunta que no se pudo cargar se omite */
function bundlesInOrder(state: ExamState, bundles: ExamBundles) {
  return state.questionIds.flatMap((id) => {
    const bundle = bundles.get(id);
    return bundle ? [{ id, bundle }] : [];
  });
}

export function examInfos(state: ExamState, bundles: ExamBundles): ExamQuestionInfo[] {
  return bundlesInOrder(state, bundles).map(({ id, bundle: { question } }) => ({
    id,
    branch: question.branch,
    // La sección sale del idioma de la pregunta que quedó en el banco local (B13, 3.2)
    section: sectionOf(question),
    topic: question.topic,
    polarity: question.structure.polarity,
    task: question.structure.task,
    kinds: question.itemKinds ?? [],
  }));
}

export function examAnswers(state: ExamState, bundles: ExamBundles): ExamAnswer[] {
  return bundlesInOrder(state, bundles).map(({ id, bundle }) => {
    const answer = answerOf(state, id);
    const chosen = answer.optionId
      ? bundle.options.find((option) => option.id === answer.optionId)
      : undefined;
    const correctOption = bundle.options.find((option) => option.isCorrect);
    return {
      questionId: id,
      // Una opción que ya no existe se trata como en blanco
      optionId: chosen?.id ?? null,
      correct: chosen?.isCorrect === true,
      chosenBiasTag: chosen && !chosen.isCorrect ? chosen.biasTag : null,
      msSpent: answer.msSpent,
      marked: answer.marked,
      eliminatedCount: answer.eliminated.length,
      eliminatedCorrect: correctOption ? answer.eliminated.includes(correctOption.id) : false,
    };
  });
}

export function examScoreOf(state: ExamState, bundles: ExamBundles): ExamScore {
  return scoreExam({
    questions: examInfos(state, bundles),
    answers: examAnswers(state, bundles),
  });
}

export type ExamOutcome = 'correct' | 'missed' | 'blank';

export function examOutcome(answer: Pick<ExamAnswer, 'optionId' | 'correct'>): ExamOutcome {
  if (answer.optionId === null) return 'blank';
  return answer.correct ? 'correct' : 'missed';
}

/** Temas con al menos esta cantidad de preguntas entran al corte por tema, porque con una la cifra no dice nada */
export const MIN_QUESTIONS_PER_TOPIC = 2;

/** Cortes de un conjunto de preguntas, de los que más fallaron a los que menos */
export function rankedTallies(
  tallies: Readonly<Record<string, { total: number; answered: number; correct: number }>>,
  minTotal = 1,
) {
  return Object.entries(tallies)
    .filter(([, tally]) => tally.total >= minTotal)
    .map(([key, tally]) => ({ key, ...tally, missed: tally.answered - tally.correct }))
    .sort((a, b) => b.missed - a.missed || b.total - a.total || a.key.localeCompare(b.key));
}

export interface SectionRow {
  section: ExamSection;
  total: number;
  answered: number;
  correct: number;
  blank: number;
  /** Segundos medios por reactivo contestado. null si no contestó ninguno */
  averageSeconds: number | null;
}

/**
 * El corte por sección de un examen, como Español 180 de 250 e Inglés 22 de 30 (B13, 3.6). Solo salen las
 * secciones que tuvieron reactivos, primero la clínica. Un examen solo en español trae una fila
 */
export function sectionRows(score: ExamScore): SectionRow[] {
  return (['clinical', 'english'] as const).flatMap((section) => {
    const cut = score.bySection[section];
    return cut.total === 0
      ? []
      : [
          {
            section,
            total: cut.total,
            answered: cut.answered,
            correct: cut.correct,
            blank: cut.blank,
            averageSeconds:
              cut.averageMsPerAnswered === null
                ? null
                : Math.round(cut.averageMsPerAnswered / 1000),
          },
        ];
  });
}
