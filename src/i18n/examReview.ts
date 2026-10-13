// Textos de la revisión del examen y de la práctica (B5, comentarios 1 y 2 de Ricardo). Crear una
// tarjeta con una pregunta, los siete motivos de error y su reparto en Progreso y en el Tutor. Los
// nombres de los motivos viven en insights.ts, donde vivían las causas de antes, y t.review.causes
// los reusa. Se integra en t desde es-MX.ts como examReview.
import { plural } from './features';

export const examReviewText = {
  // Crear tarjeta con una pregunta (comentario 1)
  createCard: {
    button: 'Crear tarjeta',
    buttonLabel: (question: string) => `Crear tarjeta de la pregunta ${question}`,
    title: 'Crear tarjeta',
    description:
      'Se arma con el texto del banco. Revísala y cámbiala a tu gusto antes de guardarla.',
    close: 'Cerrar',
    deck: 'Mazo',
    chooseDeck: 'Elige un mazo',
    ownGroup: 'Tus mazos',
    preloadedGroup: 'Mazos precargados',
    newDeckOption: 'Nuevo mazo',
    newDeckName: 'Nombre del mazo nuevo',
    layerHint:
      'La tarjeta queda en tu capa de este mazo. Solo tú la ves y el mazo no cambia para nadie más.',
    noPreloaded: 'Para agregar tarjetas a un mazo precargado, primero síguelo en Mazos.',
    bankSource: 'Texto del banco, sin IA.',
    restoreBank: 'Volver al texto del banco',
    save: 'Guardar tarjeta',
    saving: 'Guardando…',
    saved: (deck: string) => `Listo. La tarjeta quedó en ${deck} y ya entra a Repasar.`,
    exists: (deck: string) =>
      `Esta pregunta ya tiene su tarjeta en ${deck}, así que no se duplicó.`,
    goReview: 'Ir a Repasar',
    // Los errores del texto de la tarjeta son los del editor de mazos, t.decks.editor.errors
    errors: {
      chooseDeck: 'Elige el mazo donde va la tarjeta.',
      deckName: 'Escribe el nombre del mazo nuevo.',
    },
    // Lo que va en la tarjeta además del texto del banco
    correctAnswer: 'Respuesta correcta',
    references: 'Referencia',
    // La capa del alumno en un mazo precargado (4.16 del plan del cambio)
    layerDeckName: 'Mis tarjetas',
    layerDeckDescription:
      'Tus tarjetas dentro de este mazo precargado. Solo tú las ves y el mazo no cambia para nadie más.',
  },
  // Sugerir con IA, el motor de tarjetas anclado a la pregunta (8.4)
  ai: {
    title: 'Sugerir con IA',
    hint: 'La IA propone tarjetas con la explicación de esta pregunta. Cada una cita la frase del banco que la respalda y queda en borrador, sin validar por un médico.',
    button: 'Sugerir con IA',
    generating: 'Pensando las tarjetas…',
    noExplanation:
      'Esta pregunta no tiene explicación en el banco, así que la IA no puede proponer tarjetas.',
    nothing:
      'La IA no encontró tarjetas que pudiera respaldar con la explicación. Usa el texto del banco.',
    error: 'No se pudo pedir la sugerencia. Intenta de nuevo.',
    proposalsTitle: 'Propuestas de la IA',
    use: 'Usar esta',
    useLabel: (n: number) => `Usar la propuesta ${n}`,
    using:
      'Estás usando una propuesta de la IA. Queda en borrador y sin validar por un médico hasta que la revises.',
    quote: 'Frase del banco que la respalda',
    // Nombre de la fuente que lleva la tarjeta, para que se sepa de dónde salió
    sourceTitle: (topic: string) => `Pregunta del banco de ${topic}`,
  },
  // Por qué fallaste (comentario 2)
  motives: {
    legend: '¿Por qué fallaste?',
    hint: 'Es opcional y lo puedes cambiar. Vale el último que marques.',
    saved: (motive: string) => `Marcaste ${motive}.`,
    error: 'No se pudo guardar el motivo. Intenta de nuevo.',
  },
  // El reparto en Progreso
  progress: {
    title: 'Por qué fallas, por rama',
    hint: 'Lo que marcaste en cada error, en la revisión de tus exámenes y prácticas o al fallar una tarjeta. Si lo cambiaste, cuenta el último.',
    empty: 'Todavía no marcas por qué fallas. Hazlo en la revisión de un examen o de una práctica.',
    total: (n: number) => plural(n, 'error con motivo', 'errores con motivo'),
    unit: 'errores con motivo',
    calibrating: 'Tu motivo principal aparece en Conócete cuando juntes suficientes.',
    count: (n: number, total: number) => `${n} de ${total}`,
    barLabel: (motive: string, n: number, total: number) => `${motive}, ${n} de ${total}`,
    noBranch: 'Sin rama',
  },
  // Los consejos por trampa del Tutor
  tutor: {
    tipMotive: (motive: string, n: number, total: number) =>
      `En estos errores marcaste sobre todo ${motive}, ${n} de ${total}.`,
  },
};
