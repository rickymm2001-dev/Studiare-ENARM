/**
 * Celdas de la comparación que publica la noche (B14, 3.9 y 5 del plan de B14).
 *
 * Qué hace. Con las respuestas y la actividad de los alumnos con permiso arma, para el grupo Todos y
 * para cada especialidad objetivo, los 19 cortes de cada métrica y rama. Usa src/engines/comparison.ts,
 * el mismo motor con el que el navegador calcula tu percentil, así las dos cuentas son la misma.
 * Entradas. Los alumnos con su especialidad, sus respuestas y repasos de la ventana y el banco.
 * Salidas. Una celda por grupo, métrica y rama con al menos un alumno con datos. Con minGroupSize
 * alumnos o más lleva sus 19 cortes. Con menos queda calibrando, sin cortes, y solo dice cuántos hay.
 * Método
 *   - Las métricas de cada alumno salen de studentMetrics con la ventana de model_settings
 *   - Solo cuentan las respuestas que la base validó (con lectura previa en bank_reads) y los repasos
 *     que cuenta la base, recortados a lo posible por día
 *   - Nunca se publica el mínimo ni el máximo. Una celda con menos de 30 alumnos nunca lleva cortes,
 *     aunque el admin escriba menos en model_settings (el piso es de 30 en el esquema y en la base)
 * Umbrales. minGroupSize, comparisonWindowDays y minBranchAnswers de model_settings.thresholds.
 */
import { MIN_PRIVACY_GROUP, type ModelSettings } from '@/config/modelSettings';
import type { ComparisonMetric } from '@/data/model/contracts';
import {
  COMPARISON_METRICS,
  TOTAL_BRANCH,
  distributionCuts,
  studentMetrics,
  type ComparisonFact,
  type StudentMetrics,
} from '@/engines/comparison';
import { addDays } from '@/engines/studyDay';
import type { ActivityRow, AnswerRow, BankItemRow, ComparisonCellResult, PersonRow } from './types';

const byBranch = (a: string, b: string) =>
  a === b ? 0 : a === TOTAL_BRANCH ? -1 : b === TOTAL_BRANCH ? 1 : a.localeCompare(b);

export function buildComparisonCells(input: {
  asOfDay: string;
  people: readonly PersonRow[];
  answers: readonly AnswerRow[];
  activity: readonly ActivityRow[];
  bank: ReadonlyMap<string, BankItemRow>;
  settings: Pick<ModelSettings, 'thresholds'>;
}): {
  cells: ComparisonCellResult[];
  counts: { cellsReady: number; cellsCalibrating: number; comparisonStudents: number };
} {
  const { thresholds } = input.settings;
  // El piso de privacidad vale aunque llegue un ajuste más bajo
  const minGroupSize = Math.max(thresholds.minGroupSize, MIN_PRIVACY_GROUP);
  const facts = new Map<string, ComparisonFact[]>();
  const factsOf = (person: string) => {
    let list = facts.get(person);
    if (!list) {
      list = [];
      facts.set(person, list);
    }
    return list;
  };
  for (const answer of input.answers) {
    if (answer.daysBefore < 1 || answer.daysBefore > thresholds.comparisonWindowDays) continue;
    const item = input.bank.get(answer.versionId);
    if (!item) continue;
    factsOf(answer.person).push({
      day: addDays(input.asOfDay, -answer.daysBefore),
      kind: 'answer',
      branch: item.branch,
      correct: answer.correct,
      sessionKind: answer.sessionKind,
    });
  }
  for (const row of input.activity) {
    if (row.reviews <= 0) continue;
    factsOf(row.person).push({
      day: addDays(input.asOfDay, -row.daysBefore),
      kind: 'review',
      count: row.reviews,
    });
  }

  const metrics = new Map<string, StudentMetrics>();
  for (const person of input.people) {
    metrics.set(
      person.person,
      studentMetrics(facts.get(person.person) ?? [], {
        asOfDay: input.asOfDay,
        windowDays: thresholds.comparisonWindowDays,
        minBranchAnswers: thresholds.minBranchAnswers,
      }),
    );
  }

  const cohorts: { cohort: 'all' | 'specialty'; key: string; persons: readonly string[] }[] = [
    { cohort: 'all', key: '*', persons: input.people.map((person) => person.person) },
  ];
  const bySpecialty = new Map<string, string[]>();
  for (const person of input.people) {
    if (person.specialty === null) continue;
    const list = bySpecialty.get(person.specialty) ?? [];
    list.push(person.person);
    bySpecialty.set(person.specialty, list);
  }
  for (const key of [...bySpecialty.keys()].sort()) {
    cohorts.push({ cohort: 'specialty', key, persons: bySpecialty.get(key) ?? [] });
  }

  const cells: ComparisonCellResult[] = [];
  let ready = 0;
  let calibrating = 0;
  for (const group of cohorts) {
    for (const metric of COMPARISON_METRICS) {
      const branches = new Set<string>();
      for (const person of group.persons) {
        for (const branch of Object.keys(metrics.get(person)?.[metric] ?? {})) branches.add(branch);
      }
      for (const branch of [...branches].sort(byBranch)) {
        const values = group.persons.flatMap((person) => {
          const value = metrics.get(person)?.[metric][branch];
          return typeof value === 'number' ? [value] : [];
        });
        if (values.length === 0) continue;
        const enough = values.length >= minGroupSize;
        cells.push({
          cohort: group.cohort,
          key: group.key,
          metric: metric satisfies ComparisonMetric,
          branch,
          students: values.length,
          cuts: enough ? distributionCuts(values, metric) : null,
        });
        if (enough) ready += 1;
        else calibrating += 1;
      }
    }
  }
  return {
    cells,
    counts: {
      cellsReady: ready,
      cellsCalibrating: calibrating,
      comparisonStudents: input.people.length,
    },
  };
}
