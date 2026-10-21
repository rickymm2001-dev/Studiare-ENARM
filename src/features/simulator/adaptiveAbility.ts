// La habilidad del alumno para el modo adaptativo (B14, 4.5 del plan). Sale de sus primeras respuestas a
// las preguntas cuya dificultad ya viene de las respuestas de otros alumnos, con el mismo estimador del
// modelo del alumno (src/engines/adaptive.ts), así lo que elige Simular y lo que dice Progreso salen de la
// misma cuenta. Con pocas respuestas queda cerca de 0, así funciona desde el primer día.
import { isMeasured, poolDifficulty } from '@/data/bank/calibration';
import type { PoolQuestion } from '@/data/bank/questionSource';
import type { AppEvent } from '@/data/schemas/events';
import { estimateAbility, type AbilityEstimate, type AbilityResponse } from '@/engines/adaptive';

type Known = Pick<PoolQuestion, 'id' | 'physicianDifficulty' | 'effectiveDifficulty'>;

/**
 * La habilidad con lo que contestó. Cada versión cuenta una vez, con su primera respuesta, y solo si la
 * versión sigue en el pool con una dificultad medida. Una respuesta a una versión que ya no se publica no
 * se puede ubicar en la escala de hoy y no entra
 */
export function abilityFromEvents(
  events: readonly AppEvent[],
  pool: readonly Known[],
): AbilityEstimate {
  const measured = new Map<string, number>();
  for (const question of pool) {
    const difficulty = poolDifficulty(question);
    if (isMeasured(difficulty.source)) measured.set(question.id, difficulty.logit);
  }
  const seen = new Set<string>();
  const responses: AbilityResponse[] = [];
  for (const event of events) {
    if (event.type !== 'question_answered') continue;
    const { questionVersionId, correct } = event.payload;
    if (seen.has(questionVersionId)) continue;
    seen.add(questionVersionId);
    const difficulty = measured.get(questionVersionId);
    if (difficulty !== undefined) responses.push({ difficulty, correct });
  }
  return estimateAbility(responses);
}
