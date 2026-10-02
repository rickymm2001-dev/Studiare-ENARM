/**
 * Distribución beta.
 *
 * Qué hace. Calcula la función acumulada de la beta (función beta incompleta regularizada) y sus
 * cuantiles, que dan los intervalos creíbles del modelo beta-binomial (7.3 y 7.5).
 * Entradas. x entre 0 y 1, parámetros a y b positivos, probabilidad p entre 0 y 1.
 * Salidas. I_x(a, b) o el x tal que I_x(a, b) = p.
 * Método. Logaritmo de la función gamma con la aproximación de Lanczos (g = 7, 9 términos) y
 * fracción continua de Lentz para la beta incompleta, como en Numerical Recipes. El cuantil se
 * busca por bisección hasta una tolerancia de 1e-12, que es lento en teoría pero exacto y estable.
 * Umbrales. Ninguno.
 */

const LANCZOS = [
  0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
  -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6,
  1.5056327351493116e-7,
];

export function logGamma(x: number): number {
  if (x < 0.5) {
    // Fórmula de reflexión
    return Math.log(Math.PI / Math.sin(Math.PI * x)) - logGamma(1 - x);
  }
  const shifted = x - 1;
  const sum = LANCZOS.reduce(
    (acc, coefficient, index) =>
      index === 0 ? coefficient : acc + coefficient / (shifted + index),
    0,
  );
  const t = shifted + 7.5;
  return 0.5 * Math.log(2 * Math.PI) + (shifted + 0.5) * Math.log(t) - t + Math.log(sum);
}

/** Evita dividir entre cero en el algoritmo de Lentz */
function guard(value: number): number {
  return Math.abs(value) < 1e-300 ? 1e-300 : value;
}

/** Fracción continua de la beta incompleta, algoritmo de Lentz modificado */
function betaContinuedFraction(x: number, a: number, b: number): number {
  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;
  let c = 1;
  let d = 1 / guard(1 - (qab * x) / qap);
  let h = d;
  for (let m = 1; m <= 1000; m += 1) {
    const m2 = 2 * m;
    const even = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 / guard(1 + even * d);
    c = guard(1 + even / c);
    h *= d * c;
    const odd = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 / guard(1 + odd * d);
    c = guard(1 + odd / c);
    const delta = d * c;
    h *= delta;
    if (Math.abs(delta - 1) < 1e-15) break;
  }
  return h;
}

function assertParameters(a: number, b: number): void {
  if (!(a > 0 && b > 0 && Number.isFinite(a) && Number.isFinite(b))) {
    throw new RangeError(`Los parámetros de la beta deben ser positivos. Llegó a=${a}, b=${b}`);
  }
}

/** I_x(a, b), la probabilidad acumulada de una Beta(a, b) en x */
export function betaCdf(x: number, a: number, b: number): number {
  assertParameters(a, b);
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const logFront =
    logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log(1 - x);
  const front = Math.exp(logFront);
  // La fracción continua converge rápido de un lado. Del otro se usa la simetría
  if (x < (a + 1) / (a + b + 2)) return (front * betaContinuedFraction(x, a, b)) / a;
  return 1 - (front * betaContinuedFraction(1 - x, b, a)) / b;
}

/** El x tal que I_x(a, b) = p */
export function betaQuantile(p: number, a: number, b: number): number {
  assertParameters(a, b);
  if (!(p >= 0 && p <= 1)) throw new RangeError(`p debe estar entre 0 y 1. Llegó ${p}`);
  if (p === 0) return 0;
  if (p === 1) return 1;
  let low = 0;
  let high = 1;
  for (let iteration = 0; iteration < 200 && high - low > 1e-12; iteration += 1) {
    const middle = (low + high) / 2;
    if (betaCdf(middle, a, b) < p) low = middle;
    else high = middle;
  }
  return (low + high) / 2;
}

/** Intervalo creíble de colas iguales de una Beta(a, b) */
export function betaInterval(
  a: number,
  b: number,
  level = 0.95,
): { mean: number; lower: number; upper: number } {
  const tail = (1 - level) / 2;
  return {
    mean: a / (a + b),
    lower: betaQuantile(tail, a, b),
    upper: betaQuantile(1 - tail, a, b),
  };
}
