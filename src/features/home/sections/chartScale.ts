// Escala de la gráfica de carga de repaso de Inicio (D-116).

/** Pasos limpios para las marcas del eje. Abajo de 10 solo enteros, para no escribir medios repasos */
const STEPS = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];

/**
 * Un tope redondo arriba del máximo, partido en cuatro marcas limpias. Siempre es un entero que se
 * divide entre cuatro, así cada marca del eje es un número entero de repasos
 */
export function niceMax(value: number): number {
  if (value <= 4) return 4;
  const raw = value / 4;
  const power = 10 ** Math.floor(Math.log10(raw));
  const candidates = STEPS.map((factor) => factor * power).filter((step) => Number.isInteger(step));
  const step = candidates.find((candidate) => candidate >= raw) ?? 10 * power;
  return 4 * step;
}
