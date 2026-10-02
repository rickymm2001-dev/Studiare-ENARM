/**
 * Sesiones e intercalado (7.2).
 *
 * Qué hace. Arma una sesión de repaso con repasos vencidos, tarjetas nuevas, errores recientes del
 * simulador y retos, en proporciones configurables, del tamaño que cabe en el tiempo disponible,
 * e intercala por tema.
 * Entradas. Candidatos de cada tipo con su subtema y su retrievability, minutos disponibles,
 * segundos estimados por tipo, proporciones, pares confusables (de las reglas de interferencia de
 * 7.9) y semilla.
 * Salidas. La lista ordenada de la sesión y cuántos candidatos quedaron fuera por tiempo.
 * Método
 *   - Vencidas por retrievability de menor a mayor. Las demás en el orden en que llegan
 *   - Cupo por tipo según las proporciones y el tiempo. Si un tipo no llena su cupo, el tiempo
 *     sobrante pasa a los demás
 *   - Intercalado. En cada lugar se elige un candidato que no sea el tercero seguido del mismo
 *     subtema ni confusable con el anterior. Entre los válidos se prefiere el subtema con más
 *     elementos pendientes y luego la prioridad. Si un camino se atora, se retrocede, con un tope
 *     de 20,000 pasos. Si no hay orden válido, un voraz rompe la regla lo menos posible. Así las
 *     reglas se cumplen siempre que sea posible
 * Umbrales. Máximo 2 seguidos del mismo subtema. Segundos por tipo y proporciones por defecto (J).
 */
import { createRng } from './random';

export type SessionItemKind = 'due' | 'new' | 'error' | 'challenge';

export interface SessionCandidate {
  id: string;
  kind: SessionItemKind;
  subtopic: string;
  /** Solo en vencidas. Menor retrievability, mayor prioridad */
  retrievability?: number;
}

export interface SessionPlanInput {
  candidates: readonly SessionCandidate[];
  minutesAvailable: number;
  /** Proporción del tiempo para cada tipo. Se normaliza para que sume 1 */
  mix?: Readonly<Record<SessionItemKind, number>>;
  secondsPerItem?: Readonly<Record<SessionItemKind, number>>;
  /** Pares de IDs que se confunden y no deben ir seguidos */
  confusablePairs?: readonly (readonly [string, string])[];
  seed: string;
  maxSameSubtopicInARow?: number;
}

export interface SessionPlan {
  items: SessionCandidate[];
  /** Candidatos que no cupieron en el tiempo */
  leftOut: number;
  estimatedMinutes: number;
}

/** Valores por defecto (J) */
export const DEFAULT_MIX: Record<SessionItemKind, number> = {
  due: 0.6,
  new: 0.2,
  error: 0.15,
  challenge: 0.05,
};
export const DEFAULT_SECONDS: Record<SessionItemKind, number> = {
  due: 15,
  new: 40,
  error: 75,
  challenge: 90,
};

const KINDS: readonly SessionItemKind[] = ['due', 'new', 'error', 'challenge'];

function selectByTime(input: SessionPlanInput): { selected: SessionCandidate[]; seconds: number } {
  const mixRaw = input.mix ?? DEFAULT_MIX;
  const seconds = input.secondsPerItem ?? DEFAULT_SECONDS;
  const totalMix = KINDS.reduce((sum, kind) => sum + Math.max(0, mixRaw[kind]), 0) || 1;
  const budget = Math.max(0, input.minutesAvailable) * 60;

  const byKind = new Map<SessionItemKind, SessionCandidate[]>();
  for (const kind of KINDS) byKind.set(kind, []);
  for (const candidate of input.candidates) byKind.get(candidate.kind)?.push(candidate);
  byKind
    .get('due')
    ?.sort((a, b) => (a.retrievability ?? 0) - (b.retrievability ?? 0) || a.id.localeCompare(b.id));

  const taken = new Map<SessionItemKind, number>(KINDS.map((kind) => [kind, 0]));
  let used = 0;
  // Primera vuelta con cupos por proporción
  for (const kind of KINDS) {
    const quota = (budget * Math.max(0, mixRaw[kind])) / totalMix;
    const available = byKind.get(kind)?.length ?? 0;
    const count = Math.min(available, Math.floor(quota / seconds[kind]));
    taken.set(kind, count);
    used += count * seconds[kind];
  }
  // Segunda vuelta. El tiempo que sobró se reparte en el mismo orden de prioridad
  let progress = true;
  while (progress) {
    progress = false;
    for (const kind of KINDS) {
      const count = taken.get(kind) ?? 0;
      const available = byKind.get(kind)?.length ?? 0;
      if (count < available && used + seconds[kind] <= budget) {
        taken.set(kind, count + 1);
        used += seconds[kind];
        progress = true;
      }
    }
  }
  const selected = KINDS.flatMap((kind) => (byKind.get(kind) ?? []).slice(0, taken.get(kind) ?? 0));
  return { selected, seconds: used };
}

export function planSession(input: SessionPlanInput): SessionPlan {
  const maxRun = input.maxSameSubtopicInARow ?? 2;
  const rng = createRng(input.seed);
  const { selected, seconds } = selectByTime(input);

  // Prioridad base. Intercala tipos de forma proporcional y desempata con la semilla
  const kindTotals = new Map<SessionItemKind, number>();
  for (const item of selected) kindTotals.set(item.kind, (kindTotals.get(item.kind) ?? 0) + 1);
  const rank = new Map<string, number>();
  const kindPositions = new Map<SessionItemKind, number>();
  selected.forEach((item) => {
    const position = kindPositions.get(item.kind) ?? 0;
    kindPositions.set(item.kind, position + 1);
    rank.set(item.id, (position + rng.next() * 0.01) / (kindTotals.get(item.kind) as number));
  });

  const confusable = new Set(
    (input.confusablePairs ?? []).flatMap(([a, b]) => [`${a}|${b}`, `${b}|${a}`]),
  );
  const ordered = [...selected].sort((a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0));

  const violates = (result: readonly SessionCandidate[], candidate: SessionCandidate) => {
    const previous = result.at(-1);
    if (previous && confusable.has(`${previous.id}|${candidate.id}`)) return true;
    if (result.length < maxRun) return false;
    return result.slice(-maxRun).every((item) => item.subtopic === candidate.subtopic);
  };

  /** Candidatos en orden de preferencia. Más pendientes de su subtema primero, luego prioridad */
  const preference = (remaining: readonly SessionCandidate[]) => {
    const pending = new Map<string, number>();
    for (const item of remaining) pending.set(item.subtopic, (pending.get(item.subtopic) ?? 0) + 1);
    return remaining
      .map((candidate, index) => ({
        candidate,
        score: (pending.get(candidate.subtopic) as number) * 1000 - index,
      }))
      .sort((a, b) => b.score - a.score)
      .map(({ candidate }) => candidate);
  };

  // Búsqueda con retroceso y un tope de pasos. Encuentra un orden válido si existe y no es raro
  const STEP_LIMIT = 20000;
  let steps = 0;
  const search = (result: SessionCandidate[], remaining: readonly SessionCandidate[]): boolean => {
    if (remaining.length === 0) return true;
    for (const candidate of preference(remaining)) {
      if (violates(result, candidate)) continue;
      steps += 1;
      if (steps > STEP_LIMIT) return false;
      result.push(candidate);
      if (
        search(
          result,
          remaining.filter((item) => item !== candidate),
        )
      )
        return true;
      result.pop();
    }
    return false;
  };

  let result: SessionCandidate[] = [];
  if (!search(result, ordered)) {
    // Sin orden válido, o muy difícil de hallar. Un voraz rompe la regla lo menos posible
    result = [];
    const remaining = [...ordered];
    while (remaining.length > 0) {
      const options = preference(remaining);
      const chosen = options.find((candidate) => !violates(result, candidate)) ?? options[0];
      if (!chosen) break;
      result.push(chosen);
      remaining.splice(remaining.indexOf(chosen), 1);
    }
  }

  return {
    items: result,
    leftOut: input.candidates.length - selected.length,
    estimatedMinutes: seconds / 60,
  };
}

/** Revisa las reglas de intercalado en una lista. Lo usan las pruebas y la interfaz de depuración */
export function interleavingViolations(
  items: readonly Pick<SessionCandidate, 'id' | 'subtopic'>[],
  confusablePairs: readonly (readonly [string, string])[] = [],
  maxRun = 2,
): number {
  const confusable = new Set(confusablePairs.flatMap(([a, b]) => [`${a}|${b}`, `${b}|${a}`]));
  let violations = 0;
  let run = 0;
  items.forEach((item, index) => {
    const previous = index > 0 ? items[index - 1] : undefined;
    run = previous?.subtopic === item.subtopic ? run + 1 : 1;
    if (run > maxRun) violations += 1;
    if (previous && confusable.has(`${previous.id}|${item.id}`)) violations += 1;
  });
  return violations;
}
