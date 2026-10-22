// Textos de la guía de métodos de estudio (V4-B4), en español de México con trato de tú. Son texto
// propio y fijo, no lo escribe la IA. Se integran en t desde es-MX.ts.

export const studyMethodsText = {
  studyMethods: {
    title: 'Métodos de estudio',
    intro:
      'Tres formas de estudiar que ya traen su herramienta en Studiare. Prueba la que mejor te quede, no tienes que usarlas todas.',
    methods: [
      {
        key: 'feynman',
        name: 'Técnica de Feynman',
        summary: 'Explicas el tema con tus palabras y ves dónde te trabas',
        steps: [
          'Elige un tema y ábrelo en un apunte nuevo.',
          'Explícalo con tus palabras, como si le hablaras a alguien que no sabe medicina.',
          'Marca las líneas donde te trabaste o usaste palabras que no entiendes bien.',
          'Regresa a tu fuente solo por esos huecos y vuelve tarjeta cada uno con el botón Tarjeta de la línea.',
        ],
        tool: 'En Apuntes, cada línea se vuelve tarjeta con un toque.',
      },
      {
        key: 'recall',
        name: 'Recall sprint',
        summary: 'Escribes de memoria lo que recuerdas y lo comparas con tu apunte',
        steps: [
          'Abre un apunte que ya hayas estudiado y toca Recall sprint.',
          'Tienes 3 minutos para escribir todo lo que recuerdes, sin ver el apunte.',
          'Se muestra tu apunte junto a lo que escribiste. Marca las líneas que te faltaron.',
          'Lo que te faltó se vuelve tarjeta para que lo repases.',
        ],
        tool: 'Recall sprint está dentro de cada apunte, en los planes de pago.',
      },
      {
        key: 'rhythm',
        name: 'Ritmo diario de la guía',
        summary: 'Cuántas tarjetas y preguntas al día, y cuándo hacer simuladores',
        steps: [
          'Tarjetas. Hasta 300 al día, con 50 nuevas entre ellas.',
          'Preguntas. Unas 50 al día, en bloques de 15 a 30 por la mañana, por la tarde y por la noche.',
          'Haz cada bloque de la misma especialidad y de los mismos temas.',
          'Los simuladores de todas las especialidades solo en las últimas semanas y solo los domingos, de 8 a 10 en total, para medir tus tiempos.',
        ],
        tool: 'En Ajustes del repaso puedes aplicar estas cifras con un toque.',
      },
    ],
  },
  recallSprint: {
    open: 'Recall sprint',
    title: (outline: string) => `Recall sprint de ${outline}`,
    writeIntro:
      'Escribe de memoria todo lo que recuerdes de este apunte, sin verlo. No importa el orden ni la ortografía.',
    writeLabel: 'Lo que recuerdo',
    writePlaceholder: 'Empieza a escribir…',
    timeLeft: (clock: string) => `Te quedan ${clock}`,
    done: 'Ya terminé',
    compareIntro:
      'Aquí está tu apunte junto a lo que escribiste. Marca las líneas que te faltaron.',
    yours: 'Lo que escribiste',
    nothingWritten: 'No escribiste nada. Está bien, marca lo que quieras reforzar.',
    outlineHeading: 'Tu apunte',
    missed: (line: string) => `Me faltó: ${line}`,
    alreadyCard: 'Ya tiene tarjeta',
    emptyOutline: 'Este apunte todavía no tiene líneas para comparar.',
    create: (n: number) =>
      n === 1 ? 'Crear 1 tarjeta con lo que me faltó' : `Crear ${n} tarjetas con lo que me faltó`,
    creating: 'Creando…',
    created: (n: number, skipped: number) =>
      `${n === 1 ? '1 tarjeta creada' : `${n} tarjetas creadas`} en el mazo del apunte.${skipped > 0 ? ` ${skipped === 1 ? '1 línea ya tenía' : `${skipped} líneas ya tenían`} tarjeta y no se repitió.` : ''}`,
    failed: 'No se pudieron crear las tarjetas. Intenta de nuevo.',
    close: 'Cerrar',
    limit: (n: number) => `Marca hasta ${n} líneas por sprint.`,
  },
} as const;
