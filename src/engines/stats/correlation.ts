/**
 * Correlación de Pearson.
 *
 * Qué hace. Mide qué tan lineal es la relación entre dos listas de números. La usa la prueba de
 * recuperación de parámetros (14.2) para comparar dificultades y habilidades verdaderas contra las
 * estimadas.
 * Entradas. Dos listas del mismo largo, con al menos 2 valores.
 * Salidas. r entre −1 y 1. NaN si alguna lista no varía.
 * Método. Covarianza entre el producto de desviaciones estándar, con medias centradas.
 * Umbrales. Ninguno.
 */
export function pearson(xs: readonly number[], ys: readonly number[]): number {
  if (xs.length !== ys.length || xs.length < 2) {
    throw new RangeError('Se necesitan dos listas del mismo largo con al menos 2 valores');
  }
  const n = xs.length;
  const meanX = xs.reduce((sum, value) => sum + value, 0) / n;
  const meanY = ys.reduce((sum, value) => sum + value, 0) / n;
  let covariance = 0;
  let varianceX = 0;
  let varianceY = 0;
  for (let index = 0; index < n; index += 1) {
    const dx = (xs[index] as number) - meanX;
    const dy = (ys[index] as number) - meanY;
    covariance += dx * dy;
    varianceX += dx * dx;
    varianceY += dy * dy;
  }
  if (varianceX === 0 || varianceY === 0) return Number.NaN;
  return covariance / Math.sqrt(varianceX * varianceY);
}
