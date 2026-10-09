/**
 * Acuerdo del etiquetado entre médicos (7.11).
 *
 * Qué hace. Elige al azar el 20% de las preguntas para doble etiquetado, calcula kappa de Cohen
 * global y por etiqueta con las opciones que tienen dos etiquetas, y decide si la interfaz del
 * alumno habla de sesgos o de trampas.
 * Entradas. IDs de pregunta y semilla para la muestra. Etiquetas por opción y médico.
 * Salidas. La muestra, kappa global y por etiqueta con intervalo, y el vocabulario.
 * Método. Muestra sin reemplazo con semilla. Por opción se usan los dos primeros médicos en orden
 * de ID. Kappa de stats/kappa. Con kappa global menor a 0.4, o sin kappa todavía, la interfaz dice
 * trampas, porque no se puede afirmar que los médicos coinciden en el sesgo (4.4). Con menos de 30
 * pares el acuerdo sigue calibrando aunque kappa salga alto, porque con pocos pares es ruido.
 * Umbrales. 20% de doble etiquetado, kappa de 0.4 y 30 opciones con dos etiquetas antes de fiarse
 * de kappa (J).
 */
import type { Thresholds } from '@/config/thresholds';
import { createRng } from './random';
import { cohenKappa, kappaByCategory, type KappaResult } from './stats/kappa';

export function selectDoubleLabelSample(
  questionIds: readonly string[],
  share: number,
  seed: string,
): string[] {
  if (share < 0 || share > 1)
    throw new RangeError(`La proporción debe estar entre 0 y 1. Llegó ${share}`);
  const unique = [...new Set(questionIds)].sort();
  const size = Math.ceil(unique.length * share);
  return createRng(seed).shuffle(unique).slice(0, size).sort();
}

export interface LabelRecord {
  optionId: string;
  physicianId: string;
  tag: string;
}

export interface AgreementReport {
  pairs: number;
  global: KappaResult | null;
  byTag: Record<string, KappaResult | null>;
  /** Palabra que usa la interfaz del alumno */
  vocabulary: 'bias' | 'trap';
  /** Todavía no hay pares suficientes para fiarse de kappa */
  calibrating: boolean;
}

export function computeAgreement(
  labels: readonly LabelRecord[],
  thresholds: Thresholds['bias'],
): AgreementReport {
  const byOption = new Map<string, LabelRecord[]>();
  for (const label of labels) {
    const list = byOption.get(label.optionId) ?? [];
    list.push(label);
    byOption.set(label.optionId, list);
  }
  const pairs: [string, string][] = [];
  for (const list of byOption.values()) {
    const physicians = [...new Map(list.map((label) => [label.physicianId, label])).values()].sort(
      (a, b) => a.physicianId.localeCompare(b.physicianId),
    );
    if (physicians.length >= 2)
      pairs.push([(physicians[0] as LabelRecord).tag, (physicians[1] as LabelRecord).tag]);
  }
  const global = cohenKappa(pairs);
  const calibrating = global === null || pairs.length < thresholds.minLabeledPairs;
  return {
    pairs: pairs.length,
    global,
    byTag: kappaByCategory(pairs),
    vocabulary:
      !calibrating && global.kappa >= thresholds.minKappaForBiasLanguage ? 'bias' : 'trap',
    calibrating,
  };
}
