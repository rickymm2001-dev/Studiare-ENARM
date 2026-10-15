// Tiempo sugerido de un texto de lectura en inglés y cuánto se pasó el alumno (B13, 2.3 del plan de B13).
// El tiempo sugerido de un texto es el número de preguntas del caso por los segundos sugeridos de cada
// reactivo. Es una guía para entrenar la presión del examen y nunca detiene nada. Sin React.

/** Milisegundos sugeridos para un texto con esas preguntas */
export function suggestedMsForText(items: number, secondsPerItem: number): number {
  return Math.max(0, Math.round(items)) * Math.max(0, secondsPerItem) * 1000;
}

/**
 * Cuántos segundos enteros lleva de más sobre el tiempo sugerido. 0 mientras no se pasa. Si el texto no
 * tiene hora de inicio (startedAt en 0) todavía no hay con qué medir y tampoco se avisa
 */
export function secondsOverSuggested(input: {
  startedAt: number;
  now: number;
  suggestedMs: number;
}): number {
  if (input.startedAt <= 0 || input.suggestedMs <= 0) return 0;
  const over = input.now - input.startedAt - input.suggestedMs;
  return over > 0 ? Math.floor(over / 1000) : 0;
}

/** Segundos que lleva el alumno en el texto, para decirlo junto al tiempo sugerido */
export function secondsOnText(input: { startedAt: number; now: number }): number {
  return input.startedAt <= 0 ? 0 : Math.max(0, Math.floor((input.now - input.startedAt) / 1000));
}

/**
 * El inicio del texto después de una pausa. Lo que el alumno pasó leyendo la retroalimentación de una
 * pregunta no es tiempo de leer el texto, así que el inicio se recorre lo mismo que duró la pausa y el
 * tiempo sugerido solo mide lo que contestó. Sin hora de inicio (0) no hay nada que recorrer
 */
export function textStartAfterPause(startedAt: number, pausedMs: number): number {
  return startedAt <= 0 ? startedAt : startedAt + Math.max(0, Math.round(pausedMs));
}
