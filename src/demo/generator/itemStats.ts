// Estadísticas de las preguntas de la demostración (B14, 4.4 y 4.7 del plan de B14). La demostración no
// tiene nube ni calibración nocturna, así que la dificultad de cada pregunta sale de la cohorte de alumnos
// simulados, con los mismos motores de la noche (calibrateItems, con los estados de PC 5.5), y se guarda en
// itemStatsCache al sembrar. Con eso Simular, Progreso y el modo adaptativo de la demostración enseñan lo
// mismo que enseñarán con alumnos reales: preguntas con la dificultad estimada por el médico, provisionales
// o calibradas. Todo es simulado y nunca se mezcla con datos reales, porque vive en la base de la demo.
// Función pura. No hay reloj ni azar. Con la misma cohorte sale siempre lo mismo.
//
// Qué cuenta. El primer intento de cada alumno simulado en cada pregunta, en orden del tiempo, como cuenta
// la noche. Las exposiciones y las elecciones de cada opción salen de la pantalla de opciones que vio.
import { FACTORY_MODEL_SETTINGS } from '@/config/modelSettings';
import { DEFAULT_THRESHOLDS } from '@/config/thresholds';
import type { ItemStatsCache } from '@/data/schemas/caches';
import { calibrateItems } from '@/engines/calibration/items';
import type { BankItemRow, FirstAttempt } from '@/engines/calibration/types';
import { physicianToLogit } from '@/engines/difficulty';
import type { DemoBank } from '../content/bank';
import type { SimStudent } from './cohort';

export interface ItemStatsInput {
  /** La cohorte, con las respuestas de cada alumno simulado */
  students: readonly Pick<SimStudent, 'userId' | 'history'>[];
  bank: DemoBank;
  /** Cuándo se calcularon, en ISO UTC. Fijo, para que la misma cohorte dé siempre lo mismo */
  at: string;
}

/** Una fila por pregunta que algún alumno simulado contestó. Sin respuestas no hay fila */
export function buildItemStats(input: ItemStatsInput): ItemStatsCache[] {
  const { bank } = input;

  // El primer intento de cada alumno en cada pregunta, en orden del tiempo
  const firsts: { person: string; response: SimStudent['history']['responses'][number] }[] = [];
  for (const student of input.students) {
    const seen = new Set<string>();
    const ordered = [...student.history.responses].sort((a, b) => a.at.localeCompare(b.at));
    for (const response of ordered) {
      if (seen.has(response.versionId)) continue;
      seen.add(response.versionId);
      firsts.push({ person: student.userId, response });
    }
  }
  firsts.sort(
    (a, b) => a.response.at.localeCompare(b.response.at) || a.person.localeCompare(b.person),
  );
  const attempts: FirstAttempt[] = firsts.map(({ person, response }, seq) => ({
    person,
    questionId: response.versionId,
    versionId: response.versionId,
    optionId: response.chosenOptionId,
    correct: response.correct,
    daysBefore: 0,
    seq,
    exposed: response.shown.map((option) => option.optionId),
  }));

  // Las filas del banco que necesita la noche, solo con lo que la dificultad usa
  const rows = new Map<string, BankItemRow>(
    bank.questions.map((entry) => [
      entry.question.id,
      {
        versionId: entry.question.id,
        questionId: entry.question.questionId,
        branch: entry.question.branch,
        topic: entry.question.topic,
        subtopic: entry.question.subtopic,
        language: entry.question.language ?? 'es',
        physician: entry.question.physicianDifficulty,
        variantOf: entry.question.variantOf ?? null,
        words: entry.stemWords,
        current: true,
        canonical: entry.question.canonicalOptionIds,
        options: entry.options.map((option) => ({
          id: option.id,
          correct: option.isCorrect,
          tag: option.biasTag,
          words: entry.optionWords[option.id] ?? 1,
        })),
        previous: null,
      },
    ]),
  );
  const { items } = calibrateItems({
    attempts,
    bank: rows,
    thresholds: DEFAULT_THRESHOLDS,
    settings: FACTORY_MODEL_SETTINGS,
  });

  // Aciertos y elecciones por opción, de los mismos primeros intentos
  interface OptionTally {
    exposures: number;
    choices: number;
  }
  const tallies = new Map<string, { correct: number; options: Map<string, OptionTally> }>();
  for (const attempt of attempts) {
    const tally = tallies.get(attempt.versionId) ?? {
      correct: 0,
      options: new Map<string, OptionTally>(),
    };
    if (attempt.correct) tally.correct += 1;
    for (const optionId of attempt.exposed ?? []) {
      const option = tally.options.get(optionId) ?? { exposures: 0, choices: 0 };
      option.exposures += 1;
      tally.options.set(optionId, option);
    }
    if (attempt.exposed?.includes(attempt.optionId) === true) {
      const option = tally.options.get(attempt.optionId) ?? { exposures: 0, choices: 0 };
      option.choices += 1;
      tally.options.set(attempt.optionId, option);
    }
    tallies.set(attempt.versionId, tally);
  }

  return items.map((item): ItemStatsCache => {
    const tally = tallies.get(item.versionId);
    const physician = rows.get(item.versionId)?.physician ?? 3;
    return {
      questionVersionId: item.versionId,
      responses: item.students,
      correct: tally?.correct ?? 0,
      eloDifficulty: item.elo ?? physicianToLogit(physician),
      raschDifficulty: item.difficulty,
      calibration: item.state,
      optionStats: Object.fromEntries(tally?.options ?? []),
      updatedAt: input.at,
    };
  });
}
