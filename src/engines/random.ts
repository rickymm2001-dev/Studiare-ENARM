/**
 * Azar con semilla.
 *
 * Qué hace. Da números aleatorios reproducibles. Los motores nunca usan Math.random, reciben una
 * semilla y con la misma semilla dan siempre el mismo resultado (7.2, 7.8, 11.2).
 * Entradas. Una semilla de texto o número.
 * Salidas. Un generador con next (uniforme en [0, 1)), int, pick, shuffle, normal, gamma y beta.
 * Método. Hash cyrb128 de la semilla y generador sfc32, ambos de dominio público. Normal con
 * Box-Muller, gamma con Marsaglia y Tsang (2000) y beta como cociente de gammas.
 * Umbrales. Ninguno.
 */

export interface Rng {
  /** Uniforme en [0, 1) */
  next(): number;
  /** Entero uniforme entre min y max, ambos incluidos */
  int(min: number, max: number): number;
  /** Un elemento al azar. Falla si la lista está vacía */
  pick<T>(items: readonly T[]): T;
  /** Copia barajada con Fisher-Yates */
  shuffle<T>(items: readonly T[]): T[];
  /** Normal con media y desviación estándar */
  normal(mean?: number, sd?: number): number;
  /** Gamma con forma k y escala 1 */
  gamma(shape: number): number;
  /** Beta(a, b) */
  beta(a: number, b: number): number;
  /** true con probabilidad p */
  chance(p: number): boolean;
}

function cyrb128(text: string): [number, number, number, number] {
  let h1 = 1779033703;
  let h2 = 3144134277;
  let h3 = 1013904242;
  let h4 = 2773480762;
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    h1 = h2 ^ Math.imul(h1 ^ code, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ code, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ code, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ code, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  h1 ^= h2 ^ h3 ^ h4;
  h2 ^= h1;
  h3 ^= h1;
  h4 ^= h1;
  return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0];
}

export function createRng(seed: string | number): Rng {
  let [a, b, c, d] = cyrb128(String(seed));
  const next = (): number => {
    a >>>= 0;
    b >>>= 0;
    c >>>= 0;
    d >>>= 0;
    let t = (a + b) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    d = (d + 1) | 0;
    t = (t + d) | 0;
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
  // Se descartan los primeros valores para mezclar bien semillas parecidas
  for (let warmup = 0; warmup < 15; warmup += 1) next();

  const rng: Rng = {
    next,
    int(min, max) {
      if (!Number.isInteger(min) || !Number.isInteger(max) || max < min) {
        throw new RangeError(`Rango inválido ${min} a ${max}`);
      }
      return min + Math.floor(next() * (max - min + 1));
    },
    pick(items) {
      if (items.length === 0) throw new RangeError('No se puede elegir de una lista vacía');
      return items[Math.floor(next() * items.length)] as (typeof items)[number];
    },
    shuffle(items) {
      const copy = [...items];
      for (let index = copy.length - 1; index > 0; index -= 1) {
        const other = Math.floor(next() * (index + 1));
        [copy[index], copy[other]] = [
          copy[other] as (typeof copy)[number],
          copy[index] as (typeof copy)[number],
        ];
      }
      return copy;
    },
    normal(mean = 0, sd = 1) {
      let u = 0;
      while (u === 0) u = next();
      const v = next();
      return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    },
    gamma(shape) {
      if (!(shape > 0))
        throw new RangeError(`La forma de la gamma debe ser positiva. Llegó ${shape}`);
      if (shape < 1) {
        // Truco de Marsaglia y Tsang para forma menor a 1
        return rng.gamma(shape + 1) * next() ** (1 / shape);
      }
      const d3 = shape - 1 / 3;
      const c3 = 1 / Math.sqrt(9 * d3);
      for (;;) {
        let x: number;
        let v: number;
        do {
          x = rng.normal();
          v = 1 + c3 * x;
        } while (v <= 0);
        v = v * v * v;
        const u = next();
        if (u < 1 - 0.0331 * x ** 4) return d3 * v;
        if (Math.log(u) < 0.5 * x * x + d3 * (1 - v + Math.log(v))) return d3 * v;
      }
    },
    beta(alpha, betaParameter) {
      const x = rng.gamma(alpha);
      const y = rng.gamma(betaParameter);
      return x / (x + y);
    },
    chance(p) {
      return next() < p;
    },
  };
  return rng;
}
