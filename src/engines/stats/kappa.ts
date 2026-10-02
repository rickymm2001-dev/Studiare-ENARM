/**
 * Kappa de Cohen para dos médicos que etiquetan las mismas opciones.
 *
 * Qué hace. Mide el acuerdo entre dos etiquetadores más allá del azar (7.11). Global con todas
 * las etiquetas y por etiqueta, tratando cada una como sí o no.
 * Entradas. Pares de etiquetas [médico A, médico B] de las mismas opciones.
 * Salidas. Kappa, acuerdo observado, acuerdo esperado por azar, error estándar e intervalo de
 * confianza. null cuando kappa no está definido, por ejemplo si ambos usaron siempre la misma
 * etiqueta (el acuerdo esperado es 1).
 * Método. κ = (po − pe) / (1 − pe). Error estándar asintótico de Fleiss, Cohen y Everitt (1969),
 * que vale fuera de la hipótesis nula y sirve para el intervalo. Intervalo normal recortado a
 * [−1, 1].
 * Umbrales. La interfaz habla de trampas y no de sesgos con kappa global menor a 0.4 (4.4, J).
 * Ese corte lo aplica el motor agreement, no esta función.
 */
import { zForConfidence } from './normal';

export interface KappaResult {
  kappa: number;
  observedAgreement: number;
  expectedAgreement: number;
  standardError: number;
  lower: number;
  upper: number;
  n: number;
}

export function cohenKappa(
  pairs: readonly (readonly [string, string])[],
  level = 0.95,
): KappaResult | null {
  const n = pairs.length;
  if (n === 0) return null;
  const categories = [...new Set(pairs.flat())].sort();
  const k = categories.length;
  const index = new Map(categories.map((category, position) => [category, position]));
  // Tabla de proporciones p[i][j] aplanada en k·k celdas, i del médico A y j del médico B.
  // Todas las categorías y celdas existen por construcción, por eso se leen sin respaldo
  const table = new Array<number>(k * k).fill(0);
  for (const [a, b] of pairs) {
    const position = (index.get(a) as number) * k + (index.get(b) as number);
    table[position] = (table[position] as number) + 1 / n;
  }
  const cell = (i: number, j: number) => table[i * k + j] as number;
  const rowTotals = categories.map((_, i) =>
    categories.reduce((sum, __, j) => sum + cell(i, j), 0),
  );
  const colTotals = categories.map((_, j) =>
    categories.reduce((sum, __, i) => sum + cell(i, j), 0),
  );
  const row = (i: number) => rowTotals[i] as number;
  const col = (j: number) => colTotals[j] as number;

  const po = categories.reduce((sum, _, i) => sum + cell(i, i), 0);
  const pe = categories.reduce((sum, _, i) => sum + row(i) * col(i), 0);
  if (1 - pe < 1e-12) return null;
  const kappa = (po - pe) / (1 - pe);

  // Varianza asintótica de Fleiss, Cohen y Everitt (1969)
  let diagonalTerm = 0;
  for (let i = 0; i < k; i += 1) {
    diagonalTerm += cell(i, i) * (1 - (row(i) + col(i)) * (1 - kappa)) ** 2;
  }
  let offDiagonalTerm = 0;
  for (let i = 0; i < k; i += 1) {
    for (let j = 0; j < k; j += 1) {
      if (i !== j) offDiagonalTerm += cell(i, j) * (col(i) + row(j)) ** 2;
    }
  }
  const variance =
    (diagonalTerm + (1 - kappa) ** 2 * offDiagonalTerm - (kappa - pe * (1 - kappa)) ** 2) /
    (n * (1 - pe) ** 2);
  const standardError = Math.sqrt(Math.max(variance, 0));
  const z = zForConfidence(level);
  return {
    kappa,
    observedAgreement: po,
    expectedAgreement: pe,
    standardError,
    lower: Math.max(-1, kappa - z * standardError),
    upper: Math.min(1, kappa + z * standardError),
    n,
  };
}

/** Kappa de cada etiqueta, tratándola como sí o no frente a todas las demás */
export function kappaByCategory(
  pairs: readonly (readonly [string, string])[],
  level = 0.95,
): Record<string, KappaResult | null> {
  const categories = [...new Set(pairs.flat())].sort();
  const result: Record<string, KappaResult | null> = {};
  for (const category of categories) {
    const binary = pairs.map(
      ([a, b]) => [a === category ? 'si' : 'no', b === category ? 'si' : 'no'] as const,
    );
    result[category] = cohenKappa(binary, level);
  }
  return result;
}
