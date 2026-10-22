// Textos de Cómo es el examen (V4-B5), en español de México con trato de tú. Las cifras salen de la
// convocatoria de la CIFRHS y de los comunicados de la Secretaría de Salud (sección 6 del plan V3).
// Lo que dicen quienes ya lo presentaron se dice como tal, no como un dato oficial. Se integran en t
// desde es-MX.ts.
export const examGuideText = {
  examGuide: {
    title: 'Cómo es el examen',
    summary: 'Estructura, niveles de complejidad y lo que cuentan quienes ya lo presentaron',
    structureTitle: 'Estructura',
    structure: [
      'Son 280 reactivos en formato de casos clínicos. 250 son en español y 30 de comprensión de textos en inglés.',
      'Cada caso trae dos o tres preguntas, y cada pregunta tiene una sola respuesta correcta.',
      'Se explora Medicina interna, Pediatría, Ginecología y obstetricia, Cirugía general, Salud pública, Urgencias y Medicina familiar.',
      'La convocatoria no publica cuánto pesa cada rama. Los pesos que usa la app son provisionales y los puede cambiar el administrador.',
    ],
    levelsTitle: 'Niveles de complejidad',
    levelsIntro:
      'La complejidad de un reactivo la define el nivel cognitivo que hace falta para elegir la respuesta, con la taxonomía de Bloom.',
    levels: [
      {
        group: 'Bajo',
        detail: 'Conocimiento y comprensión. Recordar un dato o explicarlo con tus palabras.',
      },
      {
        group: 'Medio',
        detail: 'Aplicación y análisis. Usar lo que sabes en un caso y separar lo que importa.',
      },
      {
        group: 'Alto',
        detail: 'Síntesis y evaluación. Integrar varios datos y juzgar cuál es la mejor conducta.',
      },
    ],
    levelsNote:
      'No todas las preguntas del banco traen su nivel todavía. Las que no lo traen no se cuentan en ninguno, porque nunca se adivina.',
    feelTitle: 'Lo que cuentan quienes ya lo presentaron',
    feelIntro: 'No es un dato oficial, es lo que más se repite entre quienes lo han presentado.',
    feel: [
      'Las preguntas suelen ser largas y a veces están mal redactadas.',
      'A veces no queda claro qué se quiere responder con la pregunta.',
      'Las imágenes de radiografías o de laboratorio pueden verse con mala calidad.',
      'Las respuestas se marcan en una hoja, rellenando alveolos como en una hoja de Ceneval.',
    ],
    practiceNote:
      'Por eso el simulador de Studiare no es perfecto a propósito. Incluye casos largos, datos oscuros y hasta la hoja de respuestas, para que no te sorprendan el día del examen.',
  },
  answerSheet: {
    title: 'Hoja de respuestas',
    hint: 'Llena aquí el alveolo de tu respuesta, como en la hoja del examen. Las opciones de la pregunta solo se leen. Una pregunta se puede llenar después de verla.',
    listLabel: 'Alveolos de todas las preguntas',
    rowLabel: (number: number) => `Pregunta ${number}`,
    bubble: (number: number, letter: string) => `Pregunta ${number}, opción ${letter}`,
    goTo: (number: number) => `Ir a la pregunta ${number}`,
    marked: 'Marcada',
    // Texto de la opción del examen y de las opciones de solo lectura
    optionLabel: 'Usar hoja de respuestas',
    optionHint:
      'Las respuestas se llenan en una hoja aparte, como en el examen real, y no tocando la opción. Entrena el llenado y el error de renglón.',
    readOnlyOption: (letter: string) => `Opción ${letter}`,
    readOnlyNote: 'Responde en la hoja de respuestas.',
  },
  // Filtro de nivel cognitivo en Simular y su tarjeta en Progreso (V4-B5)
  cognitive: {
    label: 'Nivel cognitivo',
    options: { all: 'Todos', low: 'Bajo', medium: 'Medio', high: 'Alto' },
    none: 'Todavía ninguna pregunta del banco trae su nivel cognitivo. Lo agregan los médicos.',
    some: (withLevel: number, total: number) =>
      `${withLevel.toLocaleString('es-MX')} de ${total.toLocaleString('es-MX')} preguntas traen su nivel.`,
    progressTitle: 'Según el nivel cognitivo',
    progressHint:
      'Tu exactitud en preguntas de nivel bajo (conocer y comprender), medio (aplicar y analizar) y alto (sintetizar y evaluar), con la taxonomía de Bloom. Las preguntas que todavía no traen su nivel no cuentan.',
    groups: { low: 'Bajo', medium: 'Medio', high: 'Alto' },
    calibrating: (needed: number) =>
      `Calibrando. Faltan ${needed.toLocaleString('es-MX')} respuestas con nivel para mostrarlo.`,
    of: (correct: number, total: number) => `${correct} de ${total} correctas`,
    editor: 'Nivel cognitivo (Bloom)',
    editorHint:
      'Opcional. Si no lo pones, la pregunta queda sin nivel. No se deduce de la dificultad.',
    editorNone: 'Sin nivel',
    levels: {
      knowledge: 'Conocimiento',
      comprehension: 'Comprensión',
      application: 'Aplicación',
      analysis: 'Análisis',
      synthesis: 'Síntesis',
      evaluation: 'Evaluación',
    },
  },
} as const;
