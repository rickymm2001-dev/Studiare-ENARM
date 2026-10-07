// Opciones que se muestran en una pregunta del simulador (7.8). En una práctica libre salen variadas
// con una semilla que sale de la sesión. En un duelo salen del set canónico que marcó el médico, con
// una semilla que sale del duelo y siempre las mismas 4, así los dos jugadores ven exactamente lo mismo
// sin importar su sesión ni cuántas opciones prefiere ver en su práctica.
import { DUEL_OPTIONS } from '@/engines/party';
import { sampleOptions, type SampleResult, type SamplerOption } from '@/engines/sampler';

export function sampleForQuestion(input: {
  options: readonly SamplerOption[];
  canonicalOptionIds: readonly string[];
  questionId: string;
  sessionId: string;
  /** El duelo que se juega. null en una práctica libre */
  duelId: string | null;
  /** Opciones que prefiere ver el alumno en su práctica */
  optionsShown: number;
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
  return sampleOptions({
    options,
    canonicalOptionIds,
    mode: 'diverse',
    count: input.optionsShown,
    seed: `${input.sessionId}|${questionId}`.slice(0, 64),
  });
}
