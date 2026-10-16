// Las preguntas que ve un alumno (8.6, 7.8). Una variante reestructurada por IA nunca llega al alumno
// sin que un médico la apruebe, y no entra al puntaje del examen hasta que cada uno de sus
// distractores tenga las exposiciones mínimas. Las preguntas originales entran siempre.
// Desde B13 el banco se parte por sección. Lo que está en español va a practice y exam, que usan la
// práctica en español, los duelos y el planificador, y lo que está en inglés va aparte en english, para
// su práctica y la parte en inglés del examen. Así ningún lugar que pide solo español puede recibir un
// texto en inglés por un descuido (2.8 del plan de B13).
import { DEFAULT_THRESHOLDS } from '@/config/thresholds';
import type { DataApi } from '../context';
import type { Question } from '../schemas/bank';

type Api = Pick<DataApi, 'repos'>;

export interface StudentPool {
  /** Español. Para práctica, retos y planificador */
  practice: Question[];
  /** Español. Para el examen completo, que da puntaje */
  exam: Question[];
  /** Inglés médico (B13). Su práctica y la parte en inglés del examen */
  english: { practice: Question[]; exam: Question[] };
}

export const isVariant = (question: Question) => question.variantOf !== undefined;

export async function listStudentPool(
  api: Api,
  minExposures: number = DEFAULT_THRESHOLDS.sampling.variantExposuresForExam,
): Promise<StudentPool> {
  const latest = await api.repos.questions.listLatest();
  const practice = latest.filter(
    (question) => !isVariant(question) || question.editorialStatus === 'approved',
  );
  const exam: Question[] = [];
  for (const question of practice) {
    if (!isVariant(question) || (await variantCountsForExam(api, question, minExposures))) {
      exam.push(question);
    }
  }
  // El idioma de la pregunta dice su sección. Sin el campo es español, como todo lo de antes de B13
  const spanish = (question: Question) => question.language !== 'en';
  return {
    practice: practice.filter(spanish),
    exam: exam.filter(spanish),
    english: {
      practice: practice.filter((question) => !spanish(question)),
      exam: exam.filter((question) => !spanish(question)),
    },
  };
}

/** Cada distractor del set canónico de la variante ya fue mostrado las veces mínimas */
export async function variantCountsForExam(
  api: Api,
  question: Question,
  minExposures: number,
): Promise<boolean> {
  const [stats, options] = await Promise.all([
    api.repos.caches.itemStats.get(question.id),
    api.repos.options.listForQuestionVersion(question.id),
  ]);
  if (!stats) return false;
  const canonical = new Set(question.canonicalOptionIds);
  return options
    .filter((option) => canonical.has(option.id) && !option.isCorrect)
    .every((option) => (stats.optionStats[option.id]?.exposures ?? 0) >= minExposures);
}
