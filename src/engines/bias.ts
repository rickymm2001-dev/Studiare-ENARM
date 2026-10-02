/**
 * Análisis por sesgo (7.4) e indicadores de conducta de sesgo (D-042).
 *
 * Qué hace. Mide qué tanto atraen al alumno los distractores de cada etiqueta de sesgo y lo
 * compara con la población. Solo habla de un patrón probable cuando hay datos suficientes y el
 * límite inferior de su intervalo supera la línea base. Además mide con señales de conducta los
 * sesgos que describen cómo responde el alumno, como sobreconfianza o fatiga de decisión.
 * Entradas. Por pregunta mostrada, qué etiquetas había entre los distractores visibles y qué
 * etiqueta tenía la opción elegida si falló. La línea base de la población por etiqueta, con su
 * fuente (real o alumnos simulados). Para la conducta, hechos de cada respuesta.
 * Salidas. Por etiqueta, exposición, elecciones, atracción con Wilson, línea base y estado
 * (calibrando con cuántos errores faltan, patrón probable o sin patrón). Lo mismo por indicador
 * de conducta. El vocabulario (sesgo o trampa) lo decide el motor agreement según kappa.
 * Método
 *   - Atracción hacia S = veces que eligió un distractor S / veces que tuvo al menos uno a la vista
 *   - Patrón probable si hay al menos 40 errores con etiqueta y el límite inferior de Wilson de 95%
 *     supera la línea base. Solo cuenta la etiqueta primaria de cada distractor (D-029)
 *   - Indicadores de conducta. Cada uno es una proporción k/n con su propia línea base y una
 *     dirección. Patrón probable si el intervalo de Wilson queda del lado de la dirección
 *   - Variante propuesta tras la recuperación de 14.2 (D-051), con la opción method. En lugar de
 *     elecciones entre exposiciones, mide qué parte de sus errores con S a la vista fue a S, y la
 *     línea base se calcula igual. Así un alumno que se equivoca mucho no parece atraído por todas
 *     las etiquetas. Con familywise, el nivel del intervalo se corrige por Bonferroni según cuántas
 *     etiquetas se evalúan. Por defecto el motor sigue el método de 7.4 hasta que Ricardo decida
 * Umbrales. 40 errores con etiqueta (J). Mínimos por indicador de conducta (J).
 */
import type { Thresholds } from '@/config/thresholds';
import { wilsonInterval } from './stats/wilson';

export interface BiasExposure {
  /** Etiquetas primarias de los distractores visibles en esa pregunta */
  visibleTags: readonly string[];
  /** Etiqueta de la opción elegida si fue un error. null si acertó */
  chosenTag: string | null;
}

/**
 * exposure. Atracción de 7.4, elecciones de S entre las preguntas con S a la vista.
 * error_share. Parte de los errores con S a la vista que fue a S (D-051)
 */
export type BiasMethod = 'exposure' | 'error_share';

export interface Baseline {
  attraction: Readonly<Record<string, number>>;
  /** Método con que se calculó. exposure si falta */
  method?: BiasMethod;
  /** La línea base viene de alumnos simulados mientras no haya población real (7.4) */
  source: 'real' | 'simulated';
}

export type PatternStatus =
  | { kind: 'calibrating'; needed: number; unit: 'tagged_errors' | 'responses' | 'sessions' }
  | { kind: 'pattern' }
  | { kind: 'no_pattern' };

export interface TagAnalysis {
  tag: string;
  exposures: number;
  choices: number;
  attraction: number;
  lower: number;
  upper: number;
  baseline: number | null;
  status: PatternStatus;
}

export interface BiasAnalysis {
  taggedErrors: number;
  tags: TagAnalysis[];
  baselineSource: Baseline['source'];
  /** Etiquetas con patrón probable, de mayor a menor diferencia contra la línea base */
  patterns: string[];
}

/** Cuenta exposiciones y elecciones por etiqueta según el método */
function countByTag(
  exposures: readonly BiasExposure[],
  method: BiasMethod,
): Map<string, { exposures: number; choices: number }> {
  const counts = new Map<string, { exposures: number; choices: number }>();
  for (const exposure of exposures) {
    // En error_share solo cuentan las preguntas falladas
    if (method === 'error_share' && exposure.chosenTag === null) continue;
    for (const tag of new Set(exposure.visibleTags)) {
      const entry = counts.get(tag) ?? { exposures: 0, choices: 0 };
      entry.exposures += 1;
      counts.set(tag, entry);
    }
    if (exposure.chosenTag !== null) {
      const entry = counts.get(exposure.chosenTag) ?? { exposures: 0, choices: 0 };
      entry.choices += 1;
      counts.set(exposure.chosenTag, entry);
    }
  }
  return counts;
}

export function analyzeBias(input: {
  exposures: readonly BiasExposure[];
  baseline: Baseline;
  thresholds: Thresholds['bias'];
  /** exposure por defecto (7.4). error_share es la variante propuesta (D-051) */
  method?: BiasMethod;
  /** Corrige el nivel del intervalo por el número de etiquetas evaluadas (Bonferroni, D-051) */
  familywise?: boolean;
}): BiasAnalysis {
  const method = input.method ?? 'exposure';
  if ((input.baseline.method ?? 'exposure') !== method) {
    throw new RangeError('La línea base se calculó con otro método');
  }
  const counts = countByTag(input.exposures, method);
  const taggedErrors = input.exposures.filter((exposure) => exposure.chosenTag !== null).length;
  const missing = Math.max(0, input.thresholds.minTaggedErrors - taggedErrors);
  // Una cola de 2.5% en el método de 7.4. Con familywise se reparte entre las etiquetas
  const level = input.familywise ? 1 - 0.05 / Math.max(counts.size, 1) : 0.95;
  const tags = [...counts.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([tag, { exposures, choices }]): TagAnalysis => {
      const interval = wilsonInterval(Math.min(choices, exposures), exposures, level);
      const baseline = input.baseline.attraction[tag] ?? null;
      let status: PatternStatus;
      if (missing > 0) status = { kind: 'calibrating', needed: missing, unit: 'tagged_errors' };
      else if (baseline !== null && interval.lower > baseline) status = { kind: 'pattern' };
      else status = { kind: 'no_pattern' };
      return {
        tag,
        exposures,
        choices,
        attraction: interval.estimate,
        lower: interval.lower,
        upper: interval.upper,
        baseline,
        status,
      };
    });
  const patterns = tags
    .filter((tag) => tag.status.kind === 'pattern')
    .sort((a, b) => b.lower - (b.baseline ?? 0) - (a.lower - (a.baseline ?? 0)))
    .map((tag) => tag.tag);
  return { taggedErrors, tags, baselineSource: input.baseline.source, patterns };
}

/** Atracción de la población por etiqueta, para usarla como línea base */
export function populationBaseline(
  students: readonly (readonly BiasExposure[])[],
  source: Baseline['source'],
  method: BiasMethod = 'exposure',
): Baseline {
  const counts = countByTag(students.flat(), method);
  const attraction: Record<string, number> = {};
  for (const [tag, { exposures, choices }] of counts)
    attraction[tag] = exposures === 0 ? 0 : choices / exposures;
  return { attraction, source, method };
}

/** Hechos de una respuesta que usan los indicadores de conducta */
export interface ResponseFacts {
  sessionId: string;
  /** Orden dentro de la sesión, desde 0 */
  order: number;
  correct: boolean;
  confidence: 'guessed' | 'unsure' | 'sure';
  /** Posición elegida y posición de la correcta, desde 0, y cuántas opciones había */
  chosenPosition: number;
  correctPosition: number;
  shownCount: number;
  /** Si la primera opción que marcó era la correcta */
  firstChoiceCorrect: boolean;
  /** Cambió su respuesta al menos una vez */
  changed: boolean;
  /** Puntaje z del tiempo. null si su ritmo personal sigue calibrando */
  timeZ: number | null;
}

export type BehaviorIndicatorKey =
  | 'overconfidence_effect'
  | 'serial_position_effect'
  | 'status_quo_bias'
  | 'sunk_cost_fallacy'
  | 'gamblers_fallacy'
  | 'clustering_illusion'
  | 'zeigarnik_effect';

export interface IndicatorCount {
  k: number;
  n: number;
}

export interface BehaviorIndicator {
  key: BehaviorIndicatorKey;
  k: number;
  n: number;
  rate: number;
  lower: number;
  upper: number;
  baseline: number;
  status: PatternStatus;
}

/** Mínimo de casos por indicador para dejar de calibrar (J) */
export const MIN_INDICATOR_CASES = 30;

/**
 * Cuenta cada indicador de conducta (D-042). Las definiciones son un juicio de diseño (J) y quedan
 * pendientes de revisión médica
 *   - Sobreconfianza. Errores entre las respuestas con Seguro
 *   - Posición serial. Errores en los que eligió la primera o la última opción
 *   - Statu quo. Primera elección incorrecta, sin Seguro, que no cambió
 *   - Costo hundido. Respuestas que tardaron más de 2 desviaciones sobre su ritmo
 *   - Falacia del apostador. Errores cuando la correcta cayó en la misma posición que en la anterior
 *   - Ilusión de agrupamiento. Elegir la misma posición que eligió en la pregunta anterior
 *   - Zeigarnik. Errores justo después de una pregunta que lo atoró (cambió o tardó mucho)
 */
export function countBehaviorIndicators(
  facts: readonly ResponseFacts[],
): Record<BehaviorIndicatorKey, IndicatorCount> {
  const counts: Record<BehaviorIndicatorKey, IndicatorCount> = {
    overconfidence_effect: { k: 0, n: 0 },
    serial_position_effect: { k: 0, n: 0 },
    status_quo_bias: { k: 0, n: 0 },
    sunk_cost_fallacy: { k: 0, n: 0 },
    gamblers_fallacy: { k: 0, n: 0 },
    clustering_illusion: { k: 0, n: 0 },
    zeigarnik_effect: { k: 0, n: 0 },
  };
  const bySession = new Map<string, ResponseFacts[]>();
  for (const fact of facts) {
    const list = bySession.get(fact.sessionId) ?? [];
    list.push(fact);
    bySession.set(fact.sessionId, list);
  }
  for (const list of bySession.values()) {
    const ordered = [...list].sort((a, b) => a.order - b.order);
    ordered.forEach((fact, index) => {
      if (fact.confidence === 'sure') {
        counts.overconfidence_effect.n += 1;
        if (!fact.correct) counts.overconfidence_effect.k += 1;
      }
      if (!fact.correct) {
        counts.serial_position_effect.n += 1;
        if (fact.chosenPosition === 0 || fact.chosenPosition === fact.shownCount - 1)
          counts.serial_position_effect.k += 1;
      }
      if (!fact.firstChoiceCorrect && fact.confidence !== 'sure') {
        counts.status_quo_bias.n += 1;
        if (!fact.changed) counts.status_quo_bias.k += 1;
      }
      if (fact.timeZ !== null) {
        counts.sunk_cost_fallacy.n += 1;
        if (fact.timeZ > 2) counts.sunk_cost_fallacy.k += 1;
      }
      const previous = index > 0 ? (ordered[index - 1] as ResponseFacts) : null;
      if (previous) {
        if (fact.correctPosition === previous.correctPosition) {
          counts.gamblers_fallacy.n += 1;
          if (!fact.correct) counts.gamblers_fallacy.k += 1;
        }
        counts.clustering_illusion.n += 1;
        if (fact.chosenPosition === previous.chosenPosition) counts.clustering_illusion.k += 1;
        const stuck = previous.changed || (previous.timeZ !== null && previous.timeZ > 1.5);
        if (stuck) {
          counts.zeigarnik_effect.n += 1;
          if (!fact.correct) counts.zeigarnik_effect.k += 1;
        }
      }
    });
  }
  return counts;
}

/** Patrón probable si el intervalo de Wilson queda arriba de la línea base */
export function evaluateIndicator(
  key: BehaviorIndicatorKey,
  count: IndicatorCount,
  baseline: number,
  minCases = MIN_INDICATOR_CASES,
): BehaviorIndicator {
  const interval = wilsonInterval(count.k, count.n);
  const status: PatternStatus =
    count.n < minCases
      ? { kind: 'calibrating', needed: minCases - count.n, unit: 'responses' }
      : interval.lower > baseline
        ? { kind: 'pattern' }
        : { kind: 'no_pattern' };
  return {
    key,
    ...count,
    rate: interval.estimate,
    lower: interval.lower,
    upper: interval.upper,
    baseline,
    status,
  };
}

/**
 * Línea base de los indicadores para un alumno. Para la falacia del apostador y Zeigarnik se usa
 * su propia tasa de error en el resto de las preguntas, para no confundir el efecto con su nivel.
 * Para los demás se usa la tasa de la población
 */
export function analyzeBehaviorBiases(input: {
  facts: readonly ResponseFacts[];
  populationRates: Readonly<Record<BehaviorIndicatorKey, number>>;
}): BehaviorIndicator[] {
  const counts = countBehaviorIndicators(input.facts);
  const errorRate =
    input.facts.length === 0
      ? 0
      : input.facts.filter((fact) => !fact.correct).length / input.facts.length;
  return (Object.keys(counts) as BehaviorIndicatorKey[]).map((key) => {
    const ownBaseline = key === 'gamblers_fallacy' || key === 'zeigarnik_effect';
    return evaluateIndicator(
      key,
      counts[key],
      ownBaseline ? errorRate : input.populationRates[key],
    );
  });
}

/** Tasas de la población para cada indicador, por ejemplo con los alumnos simulados */
export function populationIndicatorRates(
  students: readonly (readonly ResponseFacts[])[],
): Record<BehaviorIndicatorKey, number> {
  const totals = countBehaviorIndicators([]);
  for (const facts of students) {
    const counts = countBehaviorIndicators(facts);
    for (const key of Object.keys(totals) as BehaviorIndicatorKey[]) {
      totals[key].k += counts[key].k;
      totals[key].n += counts[key].n;
    }
  }
  const rates = {} as Record<BehaviorIndicatorKey, number>;
  for (const key of Object.keys(totals) as BehaviorIndicatorKey[]) {
    rates[key] = totals[key].n === 0 ? 0 : totals[key].k / totals[key].n;
  }
  return rates;
}
