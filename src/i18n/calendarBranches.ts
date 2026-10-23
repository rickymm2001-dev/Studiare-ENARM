// Textos de elegir las ramas del plan del Calendario y su orden (V4-B10, fase 2). Se importan directo,
// como los de src/i18n/homePlan.ts, en español de México con trato de tú.
export const calendarBranchesText = {
  title: 'Ramas del plan',
  summary: (n: number) => `${n.toLocaleString('es-MX')} ${n === 1 ? 'rama' : 'ramas'}`,
  hint: 'Marca las ramas que quieres estudiar, una por semana, y súbelas o bájalas para cambiar el orden. El plan se recalcula solo.',
  listLabel: 'Ramas del plan, en el orden en que se estudian',
  moveUp: (name: string) => `Subir ${name}`,
  moveDown: (name: string) => `Bajar ${name}`,
  position: (n: number) => `Lugar ${n}`,
  atLeastOne: 'Deja al menos una rama en el plan.',
  saved: 'Guardado. El plan ya usa este orden.',
  saveFailed: 'No se pudo guardar. Intenta de nuevo.',
} as const;
