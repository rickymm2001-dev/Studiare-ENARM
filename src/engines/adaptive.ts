/**
 * Modo adaptativo (B14, 4.5 del plan de B14, respuesta 89 y E 7.7).
 *
 * Qué hace. Estima la habilidad del alumno con sus respuestas a preguntas de dificultad conocida y elige
 * las preguntas de una práctica cerca de ese nivel. El mismo estimador alimenta el modelo del alumno
 * (la habilidad que ve Progreso) y la elección de Simular, así las dos dicen lo mismo. El modo no da
 * acceso a más preguntas que el plan. Solo cambia cuáles se eligen de las que ya le tocan.
 * Entradas. Las respuestas con la dificultad efectiva de cada pregunta en logits (src/data/bank/
 * calibration.ts), las preguntas elegibles, el nivel objetivo y una semilla.
 * Salidas. La habilidad con su error estándar, si el modo está disponible en lo que el alumno eligió, y
 * la lista de preguntas de la sesión.
 * Método
 *   - Habilidad. Estimado a posteriori esperado (EAP) con una normal de media 0 y desviación 1 como
 *     previa y una cuadratura de 41 puntos de -4 a 4 sobre el modelo de Rasch. El error estándar es la
 *     desviación de la posterior. Con pocas respuestas se queda cerca de 0, así funciona desde el primer
 *     día y mejora sola
 *   - Disponibilidad. Lo que el alumno eligió debe tener al menos adaptiveMinItems preguntas en
 *     provisional o calibrada. Si no, dice calibrando y cuántas hay
 *   - Elección. pickAdaptive con objetivo en la habilidad más adaptiveTargetOffset. Una parte de la
 *     sesión, adaptiveExploreShare, va a preguntas que todavía calibran, por su dificultad del médico
 *     cercana al objetivo, para que también junten respuestas. Los casos seriados entran completos, o
 *     no entran. Con la misma semilla sale siempre la misma sesión
 * Umbrales. 50 preguntas, desplazamiento 0 y 20% de exploración (J), de model_settings.thresholds.
 */
import type { AdaptiveAvailability, CalibrationState } from '@/data/model/contracts';
import { groupCaseUnits, type CaseMember } from './caseUnits';
import { pickAdaptive, probabilityCorrect } from './difficulty';
import { createRng } from './random';

/** Puntos de la cuadratura y rango de la habilidad que cubre (J) */
export const ABILITY_POINTS = 41;
export const ABILITY_RANGE = 4;

export interface AbilityResponse {
  /** Dificultad efectiva de la pregunta en logits */
  difficulty: number;
  correct: boolean;
}

export interface AbilityEstimate {
  /** Habilidad en logits, en la misma escala que la dificultad */
  theta: number;
  /** Error estándar. Es 1 sin respuestas y baja con cada una */
  se: number;
  /** Respuestas que entraron */
  responses: number;
}

const GRID = Array.from(
  { length: ABILITY_POINTS },
  (_, index) => -ABILITY_RANGE + (2 * ABILITY_RANGE * index) / (ABILITY_POINTS - 1),
);
const LOG_PRIOR = GRID.map((theta) => -0.5 * theta * theta);

/**
 * Habilidad por EAP sobre una previa normal estándar. Una respuesta con una dificultad que no es un número
 * finito no entra. Es determinista y no depende del orden de las respuestas
 */
export function estimateAbility(responses: readonly AbilityResponse[]): AbilityEstimate {
  // En un orden fijo, porque sumar decimales en otro orden cambia el último dígito y el resultado debe ser
  // el mismo en cualquier dispositivo
  const usable = responses
    .filter((response) => Number.isFinite(response.difficulty))
    .sort((a, b) => a.difficulty - b.difficulty || Number(a.correct) - Number(b.correct));
  const logPosterior = GRID.map((theta, index) => {
    let total = LOG_PRIOR[index] ?? 0;
    for (const response of usable) {
      const p = probabilityCorrect(theta, response.difficulty);
      // p nunca es 0 ni 1 con |theta - difficulty| < 700, pero se acota para no tener -Infinity
      total += Math.log(Math.min(1 - 1e-12, Math.max(1e-12, response.correct ? p : 1 - p)));
    }
    return total;
  });
  const top = Math.max(...logPosterior);
  const weights = logPosterior.map((value) => Math.exp(value - top));
  const sum = weights.reduce((acc, weight) => acc + weight, 0);
  const mean = weights.reduce((acc, weight, index) => acc + weight * (GRID[index] ?? 0), 0) / sum;
  const variance =
    weights.reduce((acc, weight, index) => acc + weight * ((GRID[index] ?? 0) - mean) ** 2, 0) /
    sum;
  return { theta: mean, se: Math.sqrt(variance), responses: usable.length };
}

const MEASURED: ReadonlySet<CalibrationState> = new Set(['provisional', 'calibrated']);

/** Si la dificultad sale de las respuestas de los alumnos y no del médico */
export const isMeasuredState = (state: CalibrationState) => MEASURED.has(state);

/**
 * Si el modo adaptativo se puede ofrecer en lo que el alumno eligió. Recibe el estado de calibración de
 * cada pregunta elegible. Con menos de needed calibradas dice calibrando y cuántas hay
 */
export function adaptiveAvailability(
  states: readonly CalibrationState[],
  needed: number,
): AdaptiveAvailability {
  const calibratedInScope = states.filter(isMeasuredState).length;
  return { available: calibratedInScope >= needed, calibratedInScope, needed };
}

/** Una pregunta elegible para el modo adaptativo */
export interface AdaptiveItem extends CaseMember {
  /** Dificultad efectiva en logits. La de Rasch si ya está medida y si no la del médico */
  difficulty: number;
  /** Su dificultad sale de las respuestas de los alumnos y ya no necesita juntar más */
  measured: boolean;
}

export interface AdaptiveOptions {
  /** Habilidad del alumno en logits */
  ability: number;
  /** Logits que se suman a la habilidad para fijar el nivel que se busca (J, 0) */
  targetOffset: number;
  /** Parte de la sesión para preguntas que todavía calibran, de 0 a 1 (J, 0.2) */
  exploreShare: number;
  /** Preguntas que se piden. Los casos seriados no se parten, así que puede salir menos */
  count: number;
  seed: string;
}

interface Unit<T> {
  key: string;
  members: T[];
  difficulty: number;
  measured: boolean;
}

const average = (values: readonly number[]) =>
  values.reduce((sum, value) => sum + value, 0) / Math.max(values.length, 1);

/**
 * Elige la sesión. Un caso seriado es una unidad con la dificultad media de sus preguntas, y entra entero o
 * no entra. De las unidades ya medidas se eligen las más cercanas al objetivo, con azar entre las
 * cercanas para no repetir siempre las mismas, y de las que todavía calibran, una parte de la sesión. Si
 * un grupo se queda corto, el otro lo completa. El resultado va barajado y cada caso en su orden
 */
export function pickAdaptiveSession<T extends AdaptiveItem>(
  items: readonly T[],
  options: AdaptiveOptions,
): T[] {
  const count = Math.max(0, Math.floor(options.count));
  if (count === 0 || items.length === 0) return [];
  const target = options.ability + options.targetOffset;
  const share = Math.min(1, Math.max(0, options.exploreShare));
  const rng = createRng(`adaptive|${options.seed}`);

  const units: Unit<T>[] = groupCaseUnits(items).map((members) => ({
    key: members[0]?.caseId ? `case:${members[0].caseId}` : `question:${members[0]?.id ?? ''}`,
    members,
    difficulty: average(members.map((member) => member.difficulty)),
    measured: members.every((member) => member.measured),
  }));
  const byKey = new Map(units.map((unit) => [unit.key, unit]));

  const chosen: Unit<T>[] = [];
  const taken = new Set<string>();
  let used = 0;
  /** Suma unidades de la lista hasta llenar el cupo, sin partir ninguna ni pasar de count */
  const fill = (candidates: readonly Unit<T>[], budget: number) => {
    let spent = 0;
    for (const unit of candidates) {
      if (taken.has(unit.key)) continue;
      if (spent + unit.members.length > budget || used + unit.members.length > count) continue;
      chosen.push(unit);
      taken.add(unit.key);
      spent += unit.members.length;
      used += unit.members.length;
    }
  };
  /** Las unidades de un grupo, las cercanas al objetivo barajadas primero y luego el resto por cercanía */
  const ordered = (group: readonly Unit<T>[], budget: number): Unit<T>[] => {
    if (group.length === 0 || budget === 0) return [];
    const near = pickAdaptive({
      items: group.map((unit) => ({ id: unit.key, difficulty: unit.difficulty })),
      ability: target,
      count: Math.min(group.length, budget),
      rng,
    });
    const rest = [...group]
      .sort(
        (a, b) =>
          Math.abs(a.difficulty - target) - Math.abs(b.difficulty - target) ||
          (a.key < b.key ? -1 : a.key > b.key ? 1 : 0),
      )
      .map((unit) => ({ id: unit.key }));
    return [...near, ...rest].flatMap((entry) => {
      const unit = byKey.get(entry.id);
      return unit ? [unit] : [];
    });
  };

  const measured = units.filter((unit) => unit.measured);
  const calibrating = units.filter((unit) => !unit.measured);
  const exploreBudget = Math.round(count * share);
  fill(ordered(calibrating, exploreBudget), exploreBudget);
  fill(ordered(measured, count - used), count - used);
  // Si faltó de uno de los grupos, el otro completa lo que pida el cupo
  if (used < count) fill(ordered(measured, count - used), count - used);
  if (used < count) fill(ordered(calibrating, count - used), count - used);

  return rng.shuffle(chosen).flatMap((unit) => unit.members);
}
