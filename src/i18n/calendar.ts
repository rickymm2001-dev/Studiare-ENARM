// Textos de Calendario (V4-B6), en español de México con trato de tú. Se integran en t desde es-MX.ts.
export const calendarText = {
  calendar: {
    prev: 'Mes anterior',
    next: 'Mes siguiente',
    today: 'Hoy',
    gridLabel: (month: string) => `Calendario de ${month}`,
    weekdays: ['L', 'M', 'M', 'J', 'V', 'S', 'D'],
    weekdaysLong: ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'],
    weekColumn: 'Semana',
    done: (n: number) => (n === 1 ? '1 hecha' : `${n.toLocaleString('es-MX')} hechas`),
    forecast: (n: number) => `~${n.toLocaleString('es-MX')} por repasar`,
    simulatorShort: 'Sim.',
    examShort: 'ENARM',
    // Lo mismo dicho completo, para el nombre accesible de cada día. Las notas cortas de arriba
    // son para la vista y un lector de pantalla las leería como abreviaturas o símbolos
    doneLong: (n: number) =>
      n === 1 ? '1 tarjeta hecha' : `${n.toLocaleString('es-MX')} tarjetas hechas`,
    forecastLong: (n: number) =>
      n === 1
        ? '1 tarjeta por repasar en la proyección'
        : `${n.toLocaleString('es-MX')} tarjetas por repasar en la proyección`,
    simulatorLong: 'Domingo de simulador completo',
    examLong: 'Día del ENARM',
    cellLabel: (day: string, notes: readonly string[]) =>
      notes.length === 0 ? day : `${day}. ${notes.join('. ')}`,
    legend:
      'Los días pasados muestran las tarjetas que hiciste. Los que vienen muestran lo que se proyecta con tu repaso de hoy, que cambia si repasas más o menos.',
    detailTitle: (day: string) => day,
    detailDone: (cards: number, questions: number, minutes: number) =>
      `Hiciste ${cards.toLocaleString('es-MX')} tarjetas, ${questions.toLocaleString('es-MX')} preguntas y ${minutes.toLocaleString('es-MX')} minutos de estudio.`,
    detailForecast: (reviews: number, news: number) =>
      `Se proyectan ${reviews.toLocaleString('es-MX')} repasos y ${news.toLocaleString('es-MX')} tarjetas nuevas.`,
    detailNothingPast: 'No registraste actividad este día.',
    detailNothingToday: 'Todavía no registras actividad hoy.',
    detailNoLoad: 'No hay carga proyectada este día.',
    detailNoDecks: 'Todavía no sigues mazos, así que no hay carga proyectada.',
    detailBeyond: (days: number) =>
      `La proyección de repasos llega a ${days.toLocaleString('es-MX')} días, así que este día todavía no tiene carga.`,
    detailWeek: (branch: string) => `Esta semana te enfocas en ${branch}.`,
    detailSimulator: (n: number, total: number) =>
      `Domingo de simulador completo ${n} de ${total}.`,
    detailExam: 'Día de tu ENARM.',
    countdown: (days: number) =>
      days === 0
        ? 'Tu ENARM es hoy.'
        : days === 1
          ? 'Falta 1 día para tu ENARM.'
          : `Faltan ${days.toLocaleString('es-MX')} días para tu ENARM.`,
    heatmapLink: 'Ver día por día en el Calendario',
    // Una rama de los ajustes que no está en el catálogo se llama así, y nunca con su clave cruda
    unknownBranch: 'Otra rama',
    provisionalDate:
      'La fecha del ENARM es provisional hasta que se publique la convocatoria. El plan se recalcula solo cuando cambie.',
    plan: {
      title: 'Plan por semanas hasta el examen',
      hint: 'Cada semana te enfocas en una rama, para hacer tus bloques de preguntas siempre de la misma especialidad. Los simuladores de todas las especialidades llegan al final y solo en domingo.',
      week: (start: string, end: string, branch: string) => `${start} al ${end}. ${branch}`,
      simulator: (n: number, total: number) => `Simulador completo ${n} de ${total}`,
      exam: 'Semana del examen',
      empty: 'No hay semanas que planear antes de la fecha de tu examen.',
      // En Gratis no hay examen completo, así que los domingos de simulador se dicen de pago
      simulatorPaid:
        'El simulador completo es de los planes de pago. En Gratis haces simulacros más cortos, de una especialidad.',
      showAll: (n: number) => `Ver las ${n.toLocaleString('es-MX')} semanas`,
      showLess: 'Ver menos',
      export: 'Llevar el plan a mi calendario (.ics)',
      exportHint: 'Se baja un archivo que abren Google Calendar, Apple Calendario y Outlook.',
      eventWeek: (branch: string) => `Studiare. Semana de ${branch}`,
      eventSimulator: (n: number, total: number) => `Studiare. Simulador completo ${n} de ${total}`,
      eventExam: 'ENARM',
      fileName: 'studiare-plan-de-estudio.ics',
    },
    tips: {
      title: 'Consejos de la guía',
      items: [
        'Haz de 15 a 30 preguntas en la mañana, otras en la tarde y otras en la noche.',
        'Haz cada bloque de la misma especialidad y de los mismos temas.',
        'No hagas simuladores de todas las especialidades hasta las últimas semanas, y solo los domingos. De 8 a 10 bastan para medir tus tiempos.',
        'Apunta tus tarjetas del día a unas 300, con 50 nuevas, y tus preguntas a unas 50.',
      ],
    },
  },
} as const;
