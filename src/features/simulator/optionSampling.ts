// Opciones que se muestran en una pregunta del simulador (7.8). En una práctica libre salen variadas
// con una semilla que sale de la sesión, o dirigidas a las trampas que más atrapan al alumno si lo
// pidió (D-080). En un duelo salen del set canónico que marcó el médico, con una semilla que sale
// del duelo y siempre las mismas 4, así los dos jugadores ven exactamente lo mismo sin importar su
// sesión ni cuántas opciones prefiere ver en su práctica. En la práctica y en el examen la correcta
// se reparte parejo entre las posiciones.
import { DUEL_OPTIONS } from '@/engines/party';
import { sampleOptions, type SampleResult, type SamplerOption } from '@/engines/sampler';

/**
 * Cuántas veces cayó la correcta en cada posición, para que el muestreo reparta las siguientes
 * parejo (7.8). Las posiciones fuera de rango no cuentan
 */
export function correctPositionCounts(positions: Iterable<number>, size: number): number[] {
  const counts = Array.from({ length: size }, () => 0);
  for (const position of positions) {
    if (Number.isInteger(position) && position >= 0 && position < size) {
      counts[position] = (counts[position] ?? 0) + 1;
    }
  }
  return counts;
}

export function sampleForQuestion(input: {
  options: readonly SamplerOption[];
  canonicalOptionIds: readonly string[];
  questionId: string;
  sessionId: string;
  /** El duelo que se juega. null en una práctica libre */
  duelId: string | null;
  /** Opciones que prefiere ver el alumno en su práctica */
  optionsShown: number;
  /**
   * Trampas a las que el alumno pidió dirigir las opciones, de la que más lo atrapa a la que
   * menos. Vacío o ausente es el muestreo variado. No aplica a un duelo
   */
  targetTags?: readonly string[];
  /** Veces que la correcta cayó en cada posición en esta práctica. No aplica a un duelo */
  correctPositionCounts?: readonly number[];
}): SampleResult {
  const { options, canonicalOptionIds, questionId } = input;
  if (input.duelId !== null) {
    return sampleOptions({
      options,
      canonicalOptionIds,
      mode: 'canonical',
      count: DUEL_OPTIONS,
      seed: `${input.duelId}|${questionId}`.slice(0, 64),
    });
  }
  const targetTags = input.targetTags ?? [];
  const targeted = targetTags.length > 0;
  const shown = Math.min(input.optionsShown, options.length);
  return sampleOptions({
    options,
    canonicalOptionIds,
    mode: targeted ? 'targeted' : 'diverse',
    count: input.optionsShown,
    seed: `${input.sessionId}|${questionId}`.slice(0, 64),
    // Dirigido sube las trampas del alumno, pero no llena todo con ellas. La mitad de los
    // distractores, para que la pregunta siga pareciéndose a la del examen
    ...(targeted ? { targetTags, maxTargeted: Math.ceil((shown - 1) / 2) } : {}),
    ...(input.correctPositionCounts ? { correctPositionCounts: input.correctPositionCounts } : {}),
  });
}
