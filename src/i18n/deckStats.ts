// Textos de la pantalla de mazo que completan las estadísticas de V4-B3. Sanguijuelas, última vez que
// se estudió el mazo, los botones de qué hacer con él y la tarjeta que lista los mazos que el alumno
// sigue con sus cifras. Van aparte de t para que solo los cargue la pantalla Mazos y no el JavaScript
// inicial. Español de México con trato de tú.
const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

export const deckStatsText = {
  leeches: 'Sanguijuelas',
  leechesHint: (lapses: number) =>
    `Tarjetas que olvidaste ${lapses.toLocaleString('es-MX')} veces o más`,
  leechesCalibrating:
    'Aparecen cuando repasas el mazo y una tarjeta se te olvida varias veces. Todavía no hay repasos.',
  leechesNone: 'Ninguna por ahora.',
  leechesValue: (n: number) => `${n.toLocaleString('es-MX')} ${plural(n, 'tarjeta', 'tarjetas')}`,
  seeLeeches: 'Verlas en Buscar tarjetas',
  lastStudied: 'Última vez que lo estudiaste',
  lastStudiedValue: (daysAgo: number) =>
    daysAgo === 0 ? 'Hoy' : daysAgo === 1 ? 'Ayer' : `Hace ${daysAgo.toLocaleString('es-MX')} días`,
  neverStudied: 'Todavía no lo estudias.',
  actions: {
    label: (deckName: string) => `Qué hacer con ${deckName}`,
    review: 'Repasar este mazo',
    topic: 'Estudiar un tema',
    search: 'Buscar tarjetas de este mazo',
  },
  list: {
    title: 'Tus mazos en cifras',
    description:
      'Cuántas tarjetas tocan hoy, qué tan bien las recuerdas y cuáles se te olvidan una y otra vez en cada mazo que sigues o creaste.',
    cards: (n: number) => `${n.toLocaleString('es-MX')} ${plural(n, 'tarjeta', 'tarjetas')}`,
  },
} as const;
