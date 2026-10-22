// Textos del plan de hoy dentro de Repasar (V4-B10, fase 2). Se importan directo, como los de
// src/i18n/homePlan.ts, en español de México con trato de tú. Los nombres de las filas y el título son
// los del plan de Inicio (t.widgets.plan).
const minutes = (n: number) => `${n.toLocaleString('es-MX')} ${n === 1 ? 'minuto' : 'minutos'}`;

export const reviewPlanText = {
  needsMinutes:
    'Calibrando. Pon cuántos minutos estudias al día para saber si tus límites de hoy caben en tu tiempo.',
  goToMinutes: 'Poner mis minutos',
  /** Falta historial propio, así que no se avisa de nada con tiempos de referencia */
  historyUnit: 'repasos tuyos',
  over: (need: number, budget: number) =>
    `Si llegas a tus límites de hoy, las tarjetas piden unos ${minutes(need)} y tienes ${minutes(budget)} al día para ellas.`,
  overHint: 'Baja tus tarjetas nuevas o tus repasos, o sube tus minutos de estudio.',
  openSettings: 'Ajustes del repaso',
} as const;
