// Textos del plan de hoy de Inicio que no caben en t (V4-B10). Se importan directo, como los de la
// nube en src/i18n/cloudDecks.ts, en español de México con trato de tú.
export const homePlanText = {
  /** Cuando el tope diario del plan manda sobre lo que el alumno ajustó */
  capped: (limit: number) => `Tope de tu plan, ${limit.toLocaleString('es-MX')} preguntas al día.`,
} as const;
