/**
 * Distribución normal estándar.
 *
 * Qué hace. Calcula la función de distribución acumulada (Φ) y su inversa (cuantil), que usan los
 * intervalos de Wilson, la calibración de beta-binomial y el puntaje z de tiempos.
 * Entradas. Un valor z o una probabilidad p entre 0 y 1, sin incluirlos.
 * Salidas. Φ(z) o el z tal que Φ(z) = p.
 * Método. Cuantil con el algoritmo de Acklam, error relativo menor a 1.2e-9. Φ con la función de
 * error complementaria de Numerical Recipes (aproximación de Chebyshev, error menor a 1.2e-7).
 * Umbrales. Ninguno.
 */

/** z de dos colas para 95%, Φ⁻¹(0.975) */
export const Z_95 = 1.959963984540054;

/** Función de error complementaria. Numerical Recipes, error fraccional menor a 1.2e-7 */
function erfc(x: number): number {
  const z = Math.abs(x);
  const t = 1 / (1 + 0.5 * z);
  const r =
    t *
    Math.exp(
      -z * z -
        1.26551223 +
        t *
          (1.00002368 +
            t *
              (0.37409196 +
                t *
                  (0.09678418 +
                    t *
                      (-0.18628806 +
                        t *
                          (0.27886807 +
                            t *
                              (-1.13520398 +
                                t * (1.48851587 + t * (-0.82215223 + t * 0.17087277)))))))),
    );
  return x >= 0 ? r : 2 - r;
}

/** Φ(z), probabilidad acumulada de la normal estándar */
export function normalCdf(z: number): number {
  return 0.5 * erfc(-z / Math.SQRT2);
}

// Coeficientes del algoritmo de Peter Acklam
const A = [
  -3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2,
  -3.066479806614716e1, 2.506628277459239,
];
const B = [
  -5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1,
  -1.328068155288572e1,
];
const C = [
  -7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734,
  4.374664141464968, 2.938163982698783,
];
const D = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];

function poly(coefficients: readonly number[], x: number): number {
  return coefficients.reduce((acc, c) => acc * x + c, 0);
}

/** Φ⁻¹(p). Lanza error fuera de (0, 1) */
export function normalQuantile(p: number): number {
  if (!(p > 0 && p < 1))
    throw new RangeError(`p debe estar entre 0 y 1, sin incluirlos. Llegó ${p}`);
  const low = 0.02425;
  let x: number;
  if (p < low) {
    const q = Math.sqrt(-2 * Math.log(p));
    x = poly(C, q) / (poly(D, q) * q + 1);
  } else if (p <= 1 - low) {
    const q = p - 0.5;
    const r = q * q;
    x = (poly(A, r) * q) / (poly(B, r) * r + 1);
  } else {
    const q = Math.sqrt(-2 * Math.log(1 - p));
    x = -poly(C, q) / (poly(D, q) * q + 1);
  }
  return x;
}

/** z de dos colas para un nivel de confianza, por ejemplo 0.95 da 1.96 */
export function zForConfidence(level: number): number {
  if (level === 0.95) return Z_95;
  return normalQuantile(1 - (1 - level) / 2);
}
