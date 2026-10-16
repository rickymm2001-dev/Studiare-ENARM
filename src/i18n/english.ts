// Textos del módulo de Inglés médico (B13 del plan del cambio, respuesta 61). Aquí viven la tarjeta de
// práctica en Simular, la lectura con el texto en inglés y su fuente, el tiempo sugerido, la parte en
// inglés del examen completo, el corte por sección de los resultados y las cifras de Progreso. Español de
// México con trato de tú y sin signos de dos puntos ni de exclamación. No cuelga de t en es-MX.ts: lo
// importan las pantallas que lo usan, que cargan por ruta, y así no pesa en el JavaScript inicial, que
// está al límite de los 300 KB (14.4), igual que cloudBankScreens.ts.
import { ENARM_FORMAT } from '@/config/exam';

const plural = (n: number, one: string, many: string) =>
  `${n.toLocaleString('es-MX')} ${n === 1 ? one : many}`;

/** Segundos como 4:30, el mismo formato del reloj de la pregunta */
const clockOf = (seconds: number) => {
  const total = Math.max(0, Math.round(seconds));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
};

/** Un lapso dicho con palabras, como 40 segundos o 2 min 10 s */
const spanOf = (seconds: number) => {
  const total = Math.max(0, Math.round(seconds));
  if (total < 60) return plural(total, 'segundo', 'segundos');
  const rest = total % 60;
  return rest === 0 ? `${Math.floor(total / 60)} min` : `${Math.floor(total / 60)} min ${rest} s`;
};

/**
 * Lo que dicen la tarjeta de Simular y la de Progreso mientras no hay textos de lectura publicados. No
 * promete vocabulario ni manda a los mazos, porque el mazo de vocabulario puede no existir todavía
 */
const NO_TEXTS = 'Todavía no hay textos de lectura. Los agregan los médicos.';

export const englishText = {
  name: 'Inglés médico',
  /** Unidad de lo que cuenta la parte en inglés, para el estado calibrando */
  itemsUnit: 'reactivos de inglés',

  // Tarjeta de Inglés médico en Simular (2.1)
  practice: {
    title: 'Inglés médico',
    intro: (n: number = ENARM_FORMAT.english) =>
      `Casos de lectura en inglés, como los ${n} del ENARM. Lees un texto y contestas las preguntas que trae. Va aparte de tu práctica en español.`,
    texts: (n: number) => plural(n, 'texto', 'textos'),
    suggested: (seconds: number) => `${seconds} s sugeridos por reactivo`,
    none: {
      title: 'Sin textos',
      body: NO_TEXTS,
    },
    waiting: (cases: number, needed: number) =>
      `Ya hay ${plural(cases, 'texto', 'textos')}. La práctica abre cuando haya ${needed}.`,
    countLabel: 'Textos',
    countOption: (n: number) => String(n),
    start: 'Empezar práctica de inglés',
    fewer: (asked: number, available: number) =>
      `Pediste ${plural(asked, 'texto', 'textos')} y hay ${available.toLocaleString('es-MX')}, así que la práctica será de ${available.toLocaleString('es-MX')}.`,
    // Gratis. Un texto se abre completo o no se abre
    limitReached: 'Llegaste al límite de preguntas de hoy del plan Gratis.',
    limitUsedByExam:
      'Tu examen sin terminar tiene apartadas las preguntas que te quedaban hoy en el plan Gratis.',
    goToOpenExam: 'Ir a mi examen',
    noFit: (left: number, smallest: number) =>
      `Te quedan ${plural(left, 'pregunta', 'preguntas')} hoy en el plan Gratis y el texto más corto trae ${plural(smallest, 'pregunta', 'preguntas')}. Un texto se abre completo o no se abre.`,
    limitedTo: (left: number, texts: number) =>
      `Con las ${plural(left, 'pregunta', 'preguntas')} que te quedan hoy, la práctica será de hasta ${plural(texts, 'texto completo', 'textos completos')}.`,
    startError: 'No se pudo empezar la práctica de inglés. Intenta de nuevo.',
  },

  // Pregunta en inglés, retroalimentación y revisión (2.3 y 2.5)
  reading: {
    label: 'Texto en inglés',
    show: 'Ver el texto',
    hide: 'Ocultar el texto',
    position: (n: number, of: number) => `Pregunta ${n} de ${of} de este texto`,
    sourceLabel: 'Fuente del texto',
    newTab: 'se abre en otra pestaña',
    suggested: (seconds: number) => `Tiempo sugerido para este texto ${clockOf(seconds)}`,
    onText: (seconds: number) => `Llevas ${clockOf(seconds)} en este texto`,
    over: (seconds: number) => `Vas ${spanOf(seconds)} arriba del tiempo sugerido`,
    overAnnounce: 'Pasaste el tiempo sugerido para este texto.',
  },

  // Parte en inglés del examen completo (3.1 a 3.7)
  exam: {
    include: 'Incluir la parte en inglés',
    includeHint:
      'Casos de lectura en inglés, como en el ENARM. Quítala para un examen solo en español.',
    composition: (clinical: number, english: number) =>
      `${clinical.toLocaleString('es-MX')} en español y ${english.toLocaleString('es-MX')} en inglés`,
    /** Con la parte en inglés incluida pero sin textos, el examen corre solo en español */
    onlySpanish: 'Todavía no hay textos en inglés. El examen será solo en español.',
    /** Hay menos reactivos de inglés que los que pide el examen */
    missing: (have: number, wanted: number) =>
      `Solo hay ${plural(have, 'reactivo', 'reactivos')} de inglés de los ${wanted.toLocaleString('es-MX')} que trae el examen real. Tu examen llevará ${have.toLocaleString('es-MX')} y el español no los rellena.`,
    navigatorTag: 'Inglés',
  },

  // Resultados del examen por sección (3.6)
  results: {
    sectionsTitle: 'Por sección',
    sectionsHint: `El examen real trae ${ENARM_FORMAT.clinical} reactivos en español y ${ENARM_FORMAT.english} en inglés.`,
    sections: { clinical: 'Español', english: 'Inglés' },
    tally: (name: string, correct: number, total: number) =>
      `${name} ${correct.toLocaleString('es-MX')} de ${total.toLocaleString('es-MX')}`,
    detail: (answered: number, blank: number) =>
      `${plural(answered, 'contestado', 'contestados')} · ${blank.toLocaleString('es-MX')} en blanco`,
    average: (seconds: number) => `${seconds} s por reactivo contestado`,
    sectionLabel: (name: string, correct: number, total: number, blank: number) =>
      `${name}. ${correct} de ${total} correctas, ${blank} en blanco`,
    aside: 'Inglés médico va aparte de las siete ramas.',
    none: 'Este examen no trajo reactivos de inglés.',
  },

  // Tarjeta de Inglés médico en Progreso (2.7)
  progress: {
    title: 'Inglés médico',
    description: 'Tus casos de lectura en inglés, aparte de las ramas.',
    texts: (n: number) => `${plural(n, 'texto', 'textos')} con respuestas`,
    calibrating: (need: number, have: number) =>
      `Contesta ${need.toLocaleString('es-MX')} reactivos de inglés para ver tus cifras. Llevas ${have.toLocaleString('es-MX')}.`,
    accuracyLabel: 'Aciertos',
    accuracy: (percent: number, low: number, high: number) =>
      `${percent}% (entre ${low}% y ${high}%)`,
    accuracyCaption: (correct: number, answered: number) =>
      `${correct.toLocaleString('es-MX')} de ${answered.toLocaleString('es-MX')} correctas`,
    paceLabel: 'Ritmo',
    pace: (median: number) => `${median} s por reactivo`,
    paceCaption: (suggested: number) => `Sugerido ${suggested} s`,
    paceAbove: (diff: number) => `${plural(diff, 'segundo', 'segundos')} arriba de lo sugerido`,
    paceBelow: (diff: number) => `${plural(diff, 'segundo', 'segundos')} abajo de lo sugerido`,
    paceOn: 'Justo en lo sugerido',
    textsLabel: 'Textos',
    textsCaption: 'con respuestas',
    intervalNote:
      'El porcentaje es una estimación con un intervalo de 95%. Con más respuestas el intervalo se angosta.',
    statsLabel: 'Cifras de inglés médico',
    goPractice: 'Practicar inglés',
    noTexts: NO_TEXTS,
  },
} as const;
