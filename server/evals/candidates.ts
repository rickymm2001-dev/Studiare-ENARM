// Candidatos de modelo para npm run eval-ai (B12, 4.1 del plan). Cada uno es un modelo con su
// esfuerzo y su razonamiento. La escalera de cada motor dice cuáles se prueban. Se ordenan por el
// costo que se mide por llamada, no por su nombre. Opus 5.5 solo entra si nada más barato pasa.
import { AI_ENGINES, type AiEngine } from '../../src/engines/aiContracts.ts';
import type { ModelChoice } from '../../supabase/functions/_shared/ai/config.ts';

export const CANDIDATE_NAMES = [
  'haiku55-off',
  'haiku55-low',
  'haiku55-medium',
  'sonnet55-low',
  'opus55-low',
  'haiku45',
] as const;
export type CandidateName = (typeof CANDIDATE_NAMES)[number];

export interface Candidate {
  /** Uno de CANDIDATE_NAMES, o openai:<modelo> en la comparación con OpenAI (4.5) */
  name: string;
  id: string;
  effort: ModelChoice['effort'];
  thinking: ModelChoice['thinking'];
  /** Solo se corre en un motor si ningún otro candidato de su escalera pasó las compuertas (4.1) */
  onlyIfNonePass: boolean;
  note: string;
}

export const CANDIDATES: Readonly<Record<CandidateName, Candidate>> = {
  'haiku55-off': {
    name: 'haiku55-off',
    id: 'claude-haiku-5-5',
    effort: 'low',
    thinking: 'off',
    onlyIfNonePass: false,
    note: 'Haiku 5.5 sin razonamiento, esfuerzo low',
  },
  'haiku55-low': {
    name: 'haiku55-low',
    id: 'claude-haiku-5-5',
    effort: 'low',
    thinking: 'adaptive',
    onlyIfNonePass: false,
    note: 'Haiku 5.5 con razonamiento adaptativo, esfuerzo low',
  },
  'haiku55-medium': {
    name: 'haiku55-medium',
    id: 'claude-haiku-5-5',
    effort: 'medium',
    thinking: 'adaptive',
    onlyIfNonePass: false,
    note: 'Haiku 5.5 con razonamiento adaptativo, esfuerzo medium',
  },
  'sonnet55-low': {
    name: 'sonnet55-low',
    id: 'claude-sonnet-5-5',
    effort: 'low',
    thinking: 'adaptive',
    onlyIfNonePass: false,
    note: 'Sonnet 5.5 con razonamiento adaptativo, esfuerzo low',
  },
  'opus55-low': {
    name: 'opus55-low',
    id: 'claude-opus-5-5',
    effort: 'low',
    thinking: 'adaptive',
    onlyIfNonePass: true,
    note: 'Opus 5.5 con esfuerzo low, solo si nada más barato pasa',
  },
  haiku45: {
    name: 'haiku45',
    id: 'claude-haiku-4-5',
    effort: null,
    thinking: null,
    onlyIfNonePass: false,
    note: 'Haiku 4.5, la referencia de la configuración de hoy',
  },
};

/** Escalera de cada motor (4.1). Haiku 4.5 va en el Tutor como referencia de hoy */
export const ENGINE_LADDERS: Readonly<Record<AiEngine, readonly CandidateName[]>> = {
  forgetting: ['haiku55-off', 'haiku55-low', 'haiku55-medium', 'sonnet55-low', 'haiku45'],
  weekly_report: ['haiku55-off', 'haiku55-low', 'haiku55-medium', 'sonnet55-low', 'haiku45'],
  bias_tips: ['haiku55-off', 'haiku55-low', 'haiku55-medium', 'sonnet55-low', 'haiku45'],
  flashcards: ['haiku55-low', 'haiku55-medium', 'sonnet55-low', 'opus55-low'],
  restructure: ['haiku55-medium', 'sonnet55-low', 'opus55-low'],
};

/**
 * Tope de tokens de salida de cada motor en las evaluaciones. El razonamiento cuenta dentro, así que
 * es mayor que el de hoy para no medir cortes que solo son del tope. Lo elegido se aplica con este
 * tope en DEFAULT_CONFIG (contrato C4)
 */
export const ENGINE_MAX_TOKENS: Readonly<Record<AiEngine, number>> = {
  forgetting: 2000,
  weekly_report: 2000,
  flashcards: 8000,
  bias_tips: 1500,
  restructure: 6000,
};

export function modelChoiceOf(candidate: Candidate, engine: AiEngine): ModelChoice {
  return {
    id: candidate.id,
    effort: candidate.effort,
    thinking: candidate.thinking,
    maxTokens: ENGINE_MAX_TOKENS[engine],
  };
}

/** Lee --candidates=a,b. Sin la bandera son todos. Falla con los nombres que no existen */
export function parseCandidateNames(value: string | undefined): CandidateName[] {
  if (value === undefined) return [...CANDIDATE_NAMES];
  const names = value
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean);
  const unknown = names.filter((name) => !(CANDIDATE_NAMES as readonly string[]).includes(name));
  if (unknown.length > 0 || names.length === 0) {
    throw new Error(
      `Candidato desconocido ${unknown.join(', ') || '(vacío)'}. Los candidatos son ${CANDIDATE_NAMES.join(', ')}.`,
    );
  }
  return names as CandidateName[];
}

/**
 * Los candidatos que se prueban en cada motor, con el filtro de --candidates. Con un filtro explícito
 * también corre Opus, porque alguien lo pidió por nombre
 */
export function ladderFor(
  engine: AiEngine,
  only: readonly CandidateName[] | null,
): readonly Candidate[] {
  return ENGINE_LADDERS[engine]
    .filter((name) => only === null || only.includes(name))
    .map((name) => CANDIDATES[name]);
}

/** Los modelos distintos de un grupo de candidatos, para revisar que la cuenta los tenga */
export function modelIdsOf(candidates: readonly Candidate[]): string[] {
  return [...new Set(candidates.map((candidate) => candidate.id))];
}

export const ALL_LADDER_CANDIDATES: readonly Candidate[] = [
  ...new Set(AI_ENGINES.flatMap((engine) => ENGINE_LADDERS[engine])),
].map((name) => CANDIDATES[name]);
