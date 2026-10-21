// Cómo vas frente a otros, sin pintar nada (B14, 5 del plan de B14). Junta lo que la calibración nocturna
// publicó, que son los 19 cortes de cada grupo, con lo que el propio alumno ya hizo en los mismos días, y
// dice en qué percentil queda en cada métrica o por qué todavía no se puede decir. El percentil lo calcula
// el navegador con el mismo motor que armó los cortes (src/engines/comparison.ts), así tus datos no viajan
// para compararte. Cada fila está lista, o calibra porque al grupo le faltan alumnos, o calibra porque al
// alumno le falta actividad. Lo de aquí es de lo que ya pasó. Nunca hay un puntaje, una probabilidad ni un
// lugar en una lista (5.5).
import type {
  ComparisonCell,
  ComparisonCohort,
  ComparisonMetric,
  ComparisonSnapshot,
} from '@/data/model/contracts';
import type { Question } from '@/data/schemas/bank';
import type { AppEvent } from '@/data/schemas/events';
import {
  COMPARISON_METRICS,
  TOTAL_BRANCH,
  percentileFromCuts,
  studentMetrics,
  type ComparisonFact,
  type PercentileResult,
} from '@/engines/comparison';
import { addDays, daysBetween, studyDayOf } from '@/engines/studyDay';
import { CALIBRATION_TIME_ZONE } from '../model/dayWords';

// ===================================================================== Lo que hizo el alumno

type SessionKind = NonNullable<ComparisonFact['sessionKind']>;

/**
 * Los hechos de su bitácora que cuenta la comparación: cada respuesta con su rama y el tipo de su sesión, y
 * cada repaso. Una respuesta a una pregunta que ya no está en el banco no cuenta. El día de estudio se corta
 * en la zona de la calibración (Mérida) y no en la del evento, porque la foto de la noche y su ventana de 30
 * días cuentan así, y un alumno de otra zona tiene eventos en la franja de 1 a 2 horas que caerían en otro día
 */
export function comparisonFactsFrom(
  events: readonly AppEvent[],
  questions: ReadonlyMap<string, Pick<Question, 'branch'>>,
): ComparisonFact[] {
  const kindOf = new Map<string, SessionKind>();
  for (const event of events) {
    if (event.type === 'session_started' && event.sessionId && event.payload.kind !== 'review') {
      kindOf.set(event.sessionId, event.payload.kind);
    }
  }
  const facts: ComparisonFact[] = [];
  for (const event of events) {
    if (event.type === 'card_reviewed') {
      facts.push({ day: studyDayOf(new Date(event.at), CALIBRATION_TIME_ZONE), kind: 'review' });
    } else if (event.type === 'question_answered') {
      const question = questions.get(event.payload.questionVersionId);
      if (!question) continue;
      facts.push({
        day: studyDayOf(new Date(event.at), CALIBRATION_TIME_ZONE),
        kind: 'answer',
        branch: question.branch,
        correct: event.payload.correct,
        sessionKind: (event.sessionId ? kindOf.get(event.sessionId) : undefined) ?? null,
      });
    }
  }
  return facts;
}

/** Cuántas respuestas de simulador lleva en cada rama dentro de la ventana, para decir cuántas le faltan */
function simulatorAnswers(
  facts: readonly ComparisonFact[],
  asOfDay: string,
  windowDays: number,
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const fact of facts) {
    const offset = daysBetween(fact.day, asOfDay);
    if (fact.kind !== 'answer' || offset < 1 || offset > windowDays) continue;
    if (fact.sessionKind !== 'practice' && fact.sessionKind !== 'exam') continue;
    for (const key of [TOTAL_BRANCH, fact.branch ?? TOTAL_BRANCH]) {
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  return counts;
}

// ===================================================================== La vista

export type ComparisonRow =
  | {
      kind: 'ready';
      metric: ComparisonMetric;
      branch: string;
      /** Alumnos con datos en el grupo */
      students: number;
      value: number;
      percentile: PercentileResult;
    }
  | {
      kind: 'group_calibrating';
      metric: ComparisonMetric;
      branch: string;
      students: number;
      /** Alumnos con datos que le faltan al grupo para poder comparar */
      missing: number;
    }
  | {
      kind: 'own_calibrating';
      metric: ComparisonMetric;
      branch: string;
      /** Lo que lleva el alumno y lo que pide entrar. Solo en el acierto por rama */
      have: number | null;
      need: number | null;
    };

export interface ComparisonView {
  cohort: ComparisonCohort;
  /** Primero el total y las ramas en el orden de la taxonomía, después repasos y constancia */
  rows: ComparisonRow[];
}

export interface ComparisonViewInput {
  snapshot: ComparisonSnapshot;
  cohort: ComparisonCohort;
  facts: readonly ComparisonFact[];
  /** Respuestas de simulador en una rama para entrar a la comparación de esa rama */
  minBranchAnswers: number;
  /** Las ramas de la taxonomía en su orden. Una rama que no está aquí no se pinta */
  branchOrder: readonly string[];
}

const METRIC_ORDER = new Map(COMPARISON_METRICS.map((metric, index) => [metric, index]));

/**
 * Las filas de un grupo. Una fila por celda que publicó la noche en ese grupo, con el percentil del alumno
 * si la celda está lista y él tiene datos, y si no, por qué todavía calibra
 */
export function buildComparisonView(input: ComparisonViewInput): ComparisonView {
  const { snapshot, cohort } = input;
  const asOfDay = snapshot.studyDay;
  if (!snapshot.available || asOfDay === null) return { cohort, rows: [] };
  const mine = studentMetrics(input.facts, {
    asOfDay,
    windowDays: snapshot.windowDays,
    minBranchAnswers: input.minBranchAnswers,
  });
  const answers = simulatorAnswers(input.facts, asOfDay, snapshot.windowDays);
  const branchRank = new Map(input.branchOrder.map((branch, index) => [branch, index]));
  const rank = (cell: ComparisonCell) =>
    (METRIC_ORDER.get(cell.metric) ?? 99) * 1000 +
    (cell.branch === TOTAL_BRANCH ? 0 : (branchRank.get(cell.branch) ?? 999) + 1);

  const rows = snapshot.cells
    .filter(
      (cell) =>
        cell.cohort === cohort &&
        (cell.branch === TOTAL_BRANCH || branchRank.has(cell.branch)) &&
        // Una métrica de repasos o de constancia solo existe para el total
        (cell.metric === 'sim_accuracy' || cell.branch === TOTAL_BRANCH),
    )
    .sort((a, b) => rank(a) - rank(b))
    .map((cell): ComparisonRow => {
      const base = { metric: cell.metric, branch: cell.branch };
      if (cell.state !== 'ready' || cell.cuts === null) {
        return {
          kind: 'group_calibrating',
          ...base,
          students: cell.students,
          missing: Math.max(snapshot.minGroupSize - cell.students, 0),
        };
      }
      const value = mine[cell.metric][cell.branch];
      if (value === null || value === undefined) {
        const accuracy = cell.metric === 'sim_accuracy';
        return {
          kind: 'own_calibrating',
          ...base,
          have: accuracy ? (answers.get(cell.branch) ?? 0) : null,
          need: accuracy ? input.minBranchAnswers : null,
        };
      }
      return {
        kind: 'ready',
        ...base,
        students: cell.students,
        value,
        percentile: percentileFromCuts(value, cell.cuts),
      };
    });
  return { cohort, rows };
}

/** El día de la noche que calculó la foto: el día de estudio del corte menos uno. null sin foto */
export function nightOf(snapshot: Pick<ComparisonSnapshot, 'studyDay'>): string | null {
  return snapshot.studyDay === null ? null : addDays(snapshot.studyDay, -1);
}
