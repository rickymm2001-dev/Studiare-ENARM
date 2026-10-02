/**
 * Intervalo de Wilson para una proporción.
 *
 * Qué hace. Da el intervalo de confianza de una proporción observada, por ejemplo la atracción de
 * un alumno hacia los distractores de un sesgo (7.4). Se porta bien con pocos datos y con
 * proporciones cerca de 0 o de 1, a diferencia del intervalo de Wald.
 * Entradas. Éxitos k y ensayos n enteros con 0 ≤ k ≤ n, y el nivel de confianza.
 * Salidas. Estimación k/n, límite inferior y superior. Con n = 0 devuelve el intervalo [0, 1].
 * Método. Wilson (1927) sin corrección de continuidad, el método 3 de Newcombe (1998).
 * Umbrales. Ninguno. El nivel por defecto es 95%.
 */
import { zForConfidence } from './normal';

export interface ProportionInterval {
  estimate: number;
  lower: number;
  upper: number;
}

export function wilsonInterval(
  successes: number,
  trials: number,
  level = 0.95,
): ProportionInterval {
  if (!Number.isInteger(successes) || !Number.isInteger(trials)) {
    throw new RangeError('Éxitos y ensayos deben ser enteros');
  }
  if (trials < 0 || successes < 0 || successes > trials) {
    throw new RangeError(`Se necesita 0 ≤ éxitos ≤ ensayos. Llegó ${successes} de ${trials}`);
  }
  if (trials === 0) return { estimate: 0, lower: 0, upper: 1 };
  const z = zForConfidence(level);
  const p = successes / trials;
  const z2 = z * z;
  const denominator = 1 + z2 / trials;
  const center = (p + z2 / (2 * trials)) / denominator;
  const halfWidth =
    (z * Math.sqrt((p * (1 - p)) / trials + z2 / (4 * trials * trials))) / denominator;
  return {
    estimate: p,
    lower: Math.max(0, center - halfWidth),
    upper: Math.min(1, center + halfWidth),
  };
}
