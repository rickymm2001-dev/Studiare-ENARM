// Ritmo real de una sesión de repaso, para la frase de Esta sesión (D-150). Sin React. Los minutos
// que faltan salen del tiempo activo medido entre lo ya calificado, y solo cuando hay repasos
// suficientes para que no sea ruido. Mientras tanto no se dice ninguna cifra.

/** Con menos repasos el ritmo es ruido, así que la estimación espera a tener estos */
export const MIN_REVIEWS_TO_ESTIMATE = 3;

/** Minutos que faltan a este ritmo, o null mientras no hay repasos suficientes para estimar */
export function estimateRemainingMinutes(input: {
  /** Milisegundos activos de estudio en la sesión */
  activeMs: number;
  /** Tarjetas ya calificadas */
  reviewed: number;
  /** Tarjetas que faltan, con la de ahora incluida */
  remaining: number;
}): number | null {
  if (input.reviewed < MIN_REVIEWS_TO_ESTIMATE) return null;
  const perCardMs = input.activeMs / input.reviewed;
  return Math.round((input.remaining * perCardMs) / 60000);
}
