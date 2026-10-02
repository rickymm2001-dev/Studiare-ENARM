/**
 * Muestreo de opciones (7.8).
 *
 * Qué hace. De las hasta 10 opciones de una pregunta elige las que se muestran (4 por defecto),
 * siempre con la correcta, sin repetir, y las baraja con una semilla que se guarda en el evento.
 * Entradas. Opciones con su etiqueta, set canónico, modo, cuántas mostrar, semilla y, según el
 * modo, los sets que el alumno ya vio, la etiqueta que más lo atrae o las exposiciones de cada
 * opción. Para balancear la posición de la correcta, cuántas veces cayó en cada posición.
 * Salidas. Las opciones en orden con su posición, la posición de la correcta y si el set es el
 * canónico o una variante.
 * Método por modo
 *   - Canónico para el examen completo. El set que marcó el médico
 *   - Diverso para práctica. Maximiza etiquetas distintas y evita repetirle al alumno un set ya visto
 *   - Dirigido para retos. Incluye al menos un distractor de la etiqueta que más atrae al alumno
 *   - Estratificado para calibrar. Elige los distractores con menos exposiciones
 *   La correcta va a la posición menos usada hasta ahora (empates por semilla) y el resto se baraja.
 * Umbrales. Una variante entra al puntaje del examen solo con 200 exposiciones por distractor (J).
 */
import { createRng, type Rng } from './random';

export type SamplingMode = 'canonical' | 'diverse' | 'targeted' | 'stratified';

export interface SamplerOption {
  /** ID de la versión de la opción */
  id: string;
  isCorrect: boolean;
  biasTag: string | null;
}

export interface SampleRequest {
  options: readonly SamplerOption[];
  canonicalOptionIds: readonly string[];
  mode: SamplingMode;
  /** Opciones a mostrar, 4 por defecto (D-011) */
  count: number;
  seed: string;
  /** Sets que este alumno ya vio de esta pregunta, para el modo diverso */
  seenSets?: readonly (readonly string[])[];
  /** Etiqueta que más atrae al alumno, para el modo dirigido */
  targetTag?: string | null;
  /** Exposiciones de cada opción en la población, para el modo estratificado */
  exposures?: Readonly<Record<string, number>>;
  /** Veces que la correcta cayó en cada posición en esta sesión, para balancear */
  correctPositionCounts?: readonly number[];
}

export interface SampledOption {
  optionId: string;
  position: number;
}

export interface SampleResult {
  shown: SampledOption[];
  correctPosition: number;
  mode: SamplingMode;
  seed: string;
  isCanonicalSet: boolean;
}

function sameSet(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((id) => b.includes(id));
}

function correctOf(options: readonly SamplerOption[]): SamplerOption {
  const correct = options.filter((option) => option.isCorrect);
  if (correct.length !== 1) {
    throw new RangeError(
      `Cada pregunta tiene exactamente una correcta. Llegaron ${correct.length}`,
    );
  }
  return correct[0] as SamplerOption;
}

/** Distractores con etiquetas tan variadas como se pueda. Prefiere etiquetas que no ha visto */
function pickDiverse(
  distractors: readonly SamplerOption[],
  needed: number,
  rng: Rng,
  seenTags: ReadonlySet<string>,
): SamplerOption[] {
  const pool = rng.shuffle(distractors);
  const chosen: SamplerOption[] = [];
  const usedTags = new Set<string>();
  const score = (option: SamplerOption) => {
    const tag = option.biasTag ?? '';
    return (usedTags.has(tag) ? 2 : 0) + (seenTags.has(tag) ? 1 : 0);
  };
  while (chosen.length < needed && pool.length > 0) {
    pool.sort((a, b) => score(a) - score(b));
    const next = pool.shift() as SamplerOption;
    chosen.push(next);
    usedTags.add(next.biasTag ?? '');
  }
  return chosen;
}

function chooseDistractors(
  request: SampleRequest,
  rng: Rng,
  distractors: readonly SamplerOption[],
  needed: number,
): SamplerOption[] {
  switch (request.mode) {
    case 'canonical': {
      const canonical = distractors.filter((option) =>
        request.canonicalOptionIds.includes(option.id),
      );
      const rest = rng.shuffle(
        distractors.filter((option) => !request.canonicalOptionIds.includes(option.id)),
      );
      return [...canonical, ...rest].slice(0, needed);
    }
    case 'stratified': {
      const exposures = request.exposures ?? {};
      const shuffled = rng.shuffle(distractors);
      return shuffled
        .map((option, order) => ({ option, order, exposure: exposures[option.id] ?? 0 }))
        .sort((a, b) => a.exposure - b.exposure || a.order - b.order)
        .slice(0, needed)
        .map(({ option }) => option);
    }
    case 'targeted': {
      const targets = distractors.filter(
        (option) => option.biasTag !== null && option.biasTag === request.targetTag,
      );
      if (targets.length === 0) return pickDiverse(distractors, needed, rng, new Set());
      const anchor = rng.pick(targets);
      const rest = pickDiverse(
        distractors.filter((option) => option.id !== anchor.id),
        needed - 1,
        rng,
        new Set([anchor.biasTag ?? '']),
      );
      return [anchor, ...rest];
    }
    case 'diverse': {
      const seenSets = request.seenSets ?? [];
      const tagOf = new Map(distractors.map((option) => [option.id, option.biasTag ?? '']));
      const seenTags = new Set(
        seenSets.flat().flatMap((id) => (tagOf.has(id) ? [tagOf.get(id) as string] : [])),
      );
      const correctId = correctOf(request.options).id;
      // Varios intentos para no repetir un set ya visto. Si todos se vieron, se acepta el último
      let attempt = pickDiverse(distractors, needed, rng, seenTags);
      for (let tries = 1; tries < 12; tries += 1) {
        const candidate = [correctId, ...attempt.map((option) => option.id)];
        if (!seenSets.some((set) => sameSet(set, candidate))) break;
        attempt = pickDiverse(distractors, needed, rng, new Set());
      }
      return attempt;
    }
  }
}

/** Posición de la correcta, la menos usada hasta ahora. Empates por semilla */
function correctPositionFor(count: number, rng: Rng, counts?: readonly number[]): number {
  const usage = Array.from({ length: count }, (_, position) => counts?.[position] ?? 0);
  const least = Math.min(...usage);
  const candidates = usage.flatMap((value, position) => (value === least ? [position] : []));
  return rng.pick(candidates);
}

export function sampleOptions(request: SampleRequest): SampleResult {
  if (!Number.isInteger(request.count) || request.count < 2) {
    throw new RangeError(`Se muestran al menos 2 opciones. Llegó ${request.count}`);
  }
  const ids = request.options.map((option) => option.id);
  if (new Set(ids).size !== ids.length)
    throw new RangeError('Hay opciones repetidas en la pregunta');
  const rng = createRng(`${request.seed}|${request.mode}`);
  const correct = correctOf(request.options);
  const distractors = request.options.filter((option) => !option.isCorrect);
  const count = Math.min(request.count, request.options.length);
  const chosen = chooseDistractors(request, rng, distractors, count - 1);

  const correctPosition = correctPositionFor(count, rng, request.correctPositionCounts);
  const others = rng.shuffle(chosen);
  const ordered: SamplerOption[] = [];
  for (let position = 0; position < count; position += 1) {
    ordered.push(position === correctPosition ? correct : (others.shift() as SamplerOption));
  }
  const shownIds = ordered.map((option) => option.id);
  return {
    shown: ordered.map((option, position) => ({ optionId: option.id, position })),
    correctPosition,
    mode: request.mode,
    seed: request.seed,
    isCanonicalSet: sameSet(shownIds, request.canonicalOptionIds),
  };
}

/**
 * Si un set mostrado puede contar para el puntaje del examen completo (7.8). El canónico siempre.
 * Una variante solo si cada uno de sus distractores ya tiene las exposiciones mínimas
 */
export function countsForExamScore(input: {
  shownOptionIds: readonly string[];
  canonicalOptionIds: readonly string[];
  correctOptionId: string;
  exposures: Readonly<Record<string, number>>;
  minExposuresPerDistractor: number;
}): boolean {
  if (sameSet(input.shownOptionIds, input.canonicalOptionIds)) return true;
  return input.shownOptionIds
    .filter((id) => id !== input.correctOptionId)
    .every((id) => (input.exposures[id] ?? 0) >= input.minExposuresPerDistractor);
}
