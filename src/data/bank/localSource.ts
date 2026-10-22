// Fuente local de preguntas (B11, 5.1 del plan de B11). Es el banco de demostración de siempre, guardado
// en Dexie con ensureDemoBank al prepararla y elegido con listStudentPool. No hay nada que bajar ni cuota
// del servidor, así que ensureBodies solo revisa que las versiones estén en este navegador.
import type { DataApi } from '../context';
import type { Question } from '../schemas/bank';
import type { ItemStatsCache } from '../schemas/caches';
import { ensureDemoBank } from '../usecases/bank';
import { listStudentPool } from '../usecases/studentBank';
import { effectiveDifficultyFromStats } from './calibration';
import type { PoolQuestion, QuestionSource } from './questionSource';

type Api = Pick<DataApi, 'repos'>;

/**
 * La pregunta del banco local como la elige el pool. Con las estadísticas que calculó la cohorte simulada
 * (itemStatsCache, solo en la demostración) lleva su dificultad efectiva, y sin ellas se queda con la del
 * médico
 */
export function poolQuestionOf(
  question: Question,
  examEligible: boolean,
  stats?: ItemStatsCache,
): PoolQuestion {
  return {
    id: question.id,
    questionId: question.questionId,
    version: question.version,
    caseId: question.caseId,
    caseOrder: question.caseOrder,
    branch: question.branch,
    topic: question.topic,
    subtopic: question.subtopic,
    physicianDifficulty: question.physicianDifficulty,
    ...(question.itemKinds ? { itemKinds: question.itemKinds } : {}),
    ...(question.cognitiveLevel ? { cognitiveLevel: question.cognitiveLevel } : {}),
    ...(question.variantOf ? { variantOf: question.variantOf } : {}),
    isDemo: question.isDemo,
    structure: {
      polarity: question.structure.polarity,
      task: question.structure.task,
      format: question.structure.format,
    },
    examEligible,
    language: question.language ?? 'es',
    // El banco de demostración no lleva el resumen de sesgos. El muestreo dirigido usa las opciones
    distractorBiases: [],
    cached: true,
    ...(stats
      ? { effectiveDifficulty: effectiveDifficultyFromStats(question.physicianDifficulty, stats) }
      : {}),
  };
}

export function createLocalSource(api: Api): QuestionSource {
  return {
    kind: 'local',
    async prepare() {
      // Si guardar falla, la pantalla sigue con lo que haya en vez de quedarse cargando
      await ensureDemoBank(api).catch(() => 0);
      return 'ready';
    },
    async pool() {
      const { practice, exam, english } = await listStudentPool(api);
      const stats = new Map(
        (await api.repos.caches.itemStats.list()).map((row) => [row.questionVersionId, row]),
      );
      const forExam = new Set([...exam, ...english.exam].map((question) => question.id));
      const toPool = (question: Question) =>
        poolQuestionOf(question, forExam.has(question.id), stats.get(question.id));
      const examPool = (question: Question) =>
        poolQuestionOf(question, true, stats.get(question.id));
      return {
        practice: practice.map(toPool),
        exam: exam.map(examPool),
        english: {
          practice: english.practice.map(toPool),
          exam: english.exam.map(examPool),
        },
      };
    },
    async ensureBodies(versionIds) {
      const ids = [...new Set(versionIds)];
      const present = await Promise.all(ids.map((id) => api.repos.questions.get(id)));
      return {
        ready: ids.filter((_, index) => present[index] !== undefined),
        denied: ids
          .filter((_, index) => present[index] === undefined)
          .map((id) => ({ id, reason: 'not_found' as const })),
        quota: null,
        offline: false,
      };
    },
    quota: () => Promise.resolve(null),
    refresh: () => Promise.resolve(),
  };
}
