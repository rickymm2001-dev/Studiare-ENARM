// Textos del modo adaptativo de Simular (B14, 4.5 del plan). Fuera de t para que no entren al JavaScript
// inicial: solo los importa AdaptiveField, que vive en una pantalla diferida. Español de México con trato
// de tú, sin signos de exclamación y sin dos puntos en la prosa.
export const adaptiveTexts = {
  label: 'Adaptativo, cerca de tu nivel',
  hint: 'Elige preguntas cercanas a tu nivel y deja una parte para las que todavía juntan respuestas de otros alumnos. No cambia cuántas preguntas te toca abrir con tu plan.',
  /** Lo que cuenta la barra de calibrando */
  unit: 'preguntas calibradas',
  calibrating: (needed: number) =>
    `Se activa cuando lo que elegiste tiene al menos ${needed.toLocaleString('es-MX')} preguntas con dificultad calculada con las respuestas de otros alumnos. Mientras tanto las preguntas salen como siempre.`,
  loading: 'Revisando tu nivel…',
  /** Con el modo prendido, el nivel lo elige la app y no el filtro de dificultad */
  difficultyLocked: 'Con Adaptativo, el nivel lo elige la app según tus respuestas.',
} as const;
