// Cómo le va al alumno según la dificultad de la pregunta (7.7, pantalla 10). Agrupa sus respuestas
// por la dificultad que estimó el médico, con los mismos grupos del filtro de Simular, y cada grupo
// muestra calibrando hasta tener respuestas suficientes para que su exactitud diga algo. La
// dificultad de cada pregunta se calibra con las respuestas de toda la población, no con las de un
// solo alumno, así que aquí solo se usa la del médico.
import { DIFFICULTY_GROUPS, difficultyGroupOf, type DifficultyGroup } from '../shared/difficulty';

export interface DifficultyRow {
  group: DifficultyGroup;
  total: number;
  correct: number;
  /** null mientras el grupo calibra */
  accuracy: number | null;
  /** Respuestas que faltan para mostrar la exactitud. 0 cuando ya se muestra */
  responsesNeeded: number;
}

export function difficultyRows(input: {
  /** Respuestas con la dificultad que estimó el médico, de 1 a 5 */
  responses: readonly { level: number; correct: boolean }[];
  /** Respuestas por grupo para mostrar su exactitud */
  minResponses: number;
}): DifficultyRow[] {
  const tally = new Map(DIFFICULTY_GROUPS.map((group) => [group, { total: 0, correct: 0 }]));
  for (const response of input.responses) {
    if (!Number.isInteger(response.level) || response.level < 1 || response.level > 5) continue;
    const entry = tally.get(difficultyGroupOf(response.level));
    if (!entry) continue;
    entry.total += 1;
    if (response.correct) entry.correct += 1;
  }
  return DIFFICULTY_GROUPS.map((group) => {
    const { total, correct } = tally.get(group) ?? { total: 0, correct: 0 };
    const ready = total > 0 && total >= input.minResponses;
    return {
      group,
      total,
      correct,
      accuracy: ready ? correct / total : null,
      responsesNeeded: ready ? 0 : Math.max(input.minResponses - total, 1),
    };
  });
}
