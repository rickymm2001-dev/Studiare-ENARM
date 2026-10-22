/**
 * Nivel cognitivo de una pregunta, con la taxonomía de Bloom (V4-B5).
 *
 * Qué hace. El ENARM dice que la complejidad de un reactivo la define el nivel cognoscitivo que hace
 * falta para elegir la respuesta. Este módulo da los seis niveles, los agrupa en bajo, medio y alto y
 * arma las filas de Progreso con la exactitud del alumno en cada grupo.
 * Entradas. El nivel de cada pregunta contestada y si acertó.
 * Salidas. Una fila por grupo, con calibrando hasta tener respuestas suficientes.
 * Método
 *   - Seis niveles. Conocimiento y comprensión son nivel bajo. Aplicación y análisis son medio.
 *     Síntesis y evaluación son alto
 *   - El nivel es un dato aparte de la dificultad de 1 a 5. Una pregunta de memoria puede ser difícil
 *     y una de análisis puede ser fácil, así que no se deduce uno del otro
 *   - Una pregunta sin nivel no cuenta en ningún grupo. Nunca se adivina, solo lo pone el médico
 *   - Un grupo con menos de minResponses respuestas no da exactitud y dice cuántas faltan
 * Lo que no hace. No predice el puntaje del ENARM ni dice qué nivel es mejor
 */

export const COGNITIVE_LEVELS = [
  'knowledge',
  'comprehension',
  'application',
  'analysis',
  'synthesis',
  'evaluation',
] as const;
export type CognitiveLevel = (typeof COGNITIVE_LEVELS)[number];

export const COGNITIVE_GROUPS = ['low', 'medium', 'high'] as const;
export type CognitiveGroup = (typeof COGNITIVE_GROUPS)[number];

const GROUP_OF: Readonly<Record<CognitiveLevel, CognitiveGroup>> = {
  knowledge: 'low',
  comprehension: 'low',
  application: 'medium',
  analysis: 'medium',
  synthesis: 'high',
  evaluation: 'high',
};

export function cognitiveGroupOf(level: CognitiveLevel): CognitiveGroup {
  return GROUP_OF[level];
}

export function isCognitiveLevel(value: unknown): value is CognitiveLevel {
  return typeof value === 'string' && (COGNITIVE_LEVELS as readonly string[]).includes(value);
}

/** Los niveles de un grupo, para filtrar preguntas por grupo */
export function levelsOfGroup(group: CognitiveGroup): CognitiveLevel[] {
  return COGNITIVE_LEVELS.filter((level) => GROUP_OF[level] === group);
}

export interface CognitiveRow {
  group: CognitiveGroup;
  total: number;
  correct: number;
  /** 0 a 1, o null mientras calibra */
  accuracy: number | null;
  /** Respuestas que faltan para dar la exactitud, 0 si ya se da */
  responsesNeeded: number;
}

export function cognitiveRows(input: {
  responses: readonly { cognitiveLevel?: CognitiveLevel | undefined; correct: boolean }[];
  minResponses: number;
}): CognitiveRow[] {
  const tally = new Map(COGNITIVE_GROUPS.map((group) => [group, { total: 0, correct: 0 }]));
  for (const response of input.responses) {
    if (!isCognitiveLevel(response.cognitiveLevel)) continue;
    const entry = tally.get(cognitiveGroupOf(response.cognitiveLevel));
    if (!entry) continue;
    entry.total += 1;
    if (response.correct) entry.correct += 1;
  }
  return COGNITIVE_GROUPS.map((group) => {
    const { total, correct } = tally.get(group) ?? { total: 0, correct: 0 };
    const ready = total > 0 && total >= input.minResponses;
    return {
      group,
      total,
      correct,
      accuracy: ready ? correct / total : null,
      responsesNeeded: ready ? 0 : Math.max(1, input.minResponses - total),
    };
  });
}
