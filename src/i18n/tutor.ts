// Textos del tutor sin IA (pantalla 11, 8.2 a 8.5), en español de México con trato de tú (4.9). Las
// hipótesis son plantillas por regla con el área que salió de los datos. La IA de la Fase D llenará
// los mismos espacios con su propio texto. Se integran en t desde es-MX.ts.
import { plural } from './features';

type TutorRule =
  | 'persistent_lapse'
  | 'list_card'
  | 'interference'
  | 'high_confidence_error'
  | 'misreading'
  | 'fatigue'
  | 'rushing'
  | 'foundation_gap';

interface RuleText {
  title: string;
  hypothesis: (area: string) => string;
  message: string;
}

const rules: Record<TutorRule, RuleText> = {
  persistent_lapse: {
    title: 'Tarjetas que se te siguen olvidando',
    hypothesis: (area) =>
      `En ${area} hay tarjetas que olvidas aunque ya las repasaste varias veces. Creo que su texto no te está ayudando a recordarlas.`,
    message:
      'Lee con calma la explicación de esas tarjetas y reescríbelas con tus palabras. Si traen mucho, divídelas en tarjetas más pequeñas.',
  },
  list_card: {
    title: 'Tarjetas que enumeran demasiado',
    hypothesis: (area) =>
      `En ${area} fallas tarjetas cuya respuesta es una lista larga. Creo que recordar la lista completa de una vez es demasiado.`,
    message:
      'Divide cada lista en varias tarjetas o usa huecos para pedir una parte a la vez. Cada una se vuelve más fácil de recordar.',
  },
  interference: {
    title: 'Confundes cosas parecidas',
    hypothesis: (area) =>
      `En ${area} eliges la respuesta de otra pregunta parecida. Creo que dos ideas se te están mezclando.`,
    message:
      'Haz una tarjeta de contraste que ponga las dos lado a lado y repásala hasta que la diferencia salga sola.',
  },
  high_confidence_error: {
    title: 'Fallas con mucha seguridad',
    hypothesis: (area) =>
      `En ${area} fallas cuando estás seguro. Creo que hay una idea que tienes mal grabada.`,
    message:
      'Lee la explicación con calma y vuelve a la pregunta pronto, antes de que la idea errónea se afiance. Corregirla ahora te ahorra errores después.',
  },
  misreading: {
    title: 'Lees mal algunas preguntas',
    hypothesis: (area) =>
      `En ${area} fallas preguntas, sobre todo con negaciones, que podrías acertar leyendo con más calma. Creo que no es falta de conocimiento.`,
    message:
      'Enciende el resaltado de negaciones y di en voz baja qué te piden antes de ver las opciones. Unas preguntas con negación bastan para tomar el hábito.',
  },
  fatigue: {
    title: 'Fallas más cuando llevas mucho rato',
    hypothesis: (area) =>
      `En ${area} tus errores se juntan al final de las sesiones largas. Creo que el cansancio te está costando respuestas.`,
    message:
      'Haz una pausa a la mitad de las sesiones largas o usa un Pomodoro más corto. Estudiar menos tiempo seguido suele rendir más.',
  },
  rushing: {
    title: 'Contestas más rápido de lo que se puede leer',
    hypothesis: (area) =>
      `En ${area} fallas preguntas que contestaste casi al instante. Creo que la prisa te hace saltarte datos del caso.`,
    message:
      'Baja el ritmo en las preguntas largas y lee el caso completo antes de mirar las opciones. Unos segundos más suelen bastar.',
  },
  foundation_gap: {
    title: 'Te falta una base',
    hypothesis: (area) =>
      `Tus errores en ${area} vienen de un tema base que también dominas poco. Creo que primero conviene afirmar esa base.`,
    message:
      'Practica primero el tema base y luego regresa a este. Con la base firme, lo demás se acomoda.',
  },
};

export const tutorText = {
  tutor: {
    stats: {
      label: 'Tu tutor en cifras',
      hypotheses: 'Hipótesis',
      hypothesesCaption: 'por revisar',
      forming: 'Patrones',
      formingCaption: 'en formación',
      errors: 'Errores',
      errorsCaption: 'en tus tarjetas',
    },
    intro:
      'Tu tutor revisa tus errores de los últimos 14 días y busca patrones. Lo que ves son hipótesis con su evidencia y no verdades. Dile si te sirven.',
    howItWorks:
      'Estas hipótesis salen de reglas fijas aplicadas a tus propios errores. Si enciendes el análisis con IA, la IA solo redacta la explicación con esos mismos errores. Nunca agrega datos médicos nuevos.',
    rules,
    hypothesesTitle: 'Hipótesis del tutor',
    confirmedBadge: 'Confirmada',
    confidence: { low: 'Confianza baja', medium: 'Confianza media' },
    findings: (n: number) => `${plural(n, 'hallazgo', 'hallazgos')} en 14 días`,
    showEvidence: 'Ver evidencia',
    hideEvidence: 'Ocultar evidencia',
    evidenceTitle: 'Los errores que la forman',
    evidenceKind: { question: 'Pregunta', card: 'Tarjeta' },
    evidenceConfused: (other: string) => `La confundiste con ${other}`,
    evidenceMissing: 'Ya no está en tu banco',
    causeMismatch: (mismatches: number, total: number) =>
      `En ${mismatches} de ${plural(total, 'caso', 'casos')} en que dijiste la causa, no coincidía con lo que apuntan las señales.`,
    helpful: 'Me sirve',
    notHelpful: 'No me ayuda',
    answered: {
      approved: 'Marcaste que te sirve. Gracias.',
      rejected: 'Marcaste que no te ayuda. No te la vuelvo a mostrar.',
    },
    moreTitle: (n: number) => (n === 1 ? 'Otra hipótesis' : `Otras ${n} hipótesis`),
    moreHint: 'Con menos hallazgos',
    dismissedTitle: (n: number) => `Hipótesis que descartaste (${n})`,
    reopen: 'Volver a mostrarla',
    actionsTitle: 'Qué puedes hacer',
    actions: {
      create_contrast_card: 'Crear tarjeta de contraste',
      split_card: 'Ir a Mazos para dividir la tarjeta',
      review_explanation: 'Repasar las explicaciones',
      subtopic_simulator: 'Practicar este tema',
      enable_highlight: 'Encender el resaltado de negaciones',
      suggest_break: 'Poner pausas más cortas',
    },
    actionDone: {
      enable_highlight:
        'Listo. El resaltado de negaciones quedó encendido en práctica y en examen.',
      suggest_break: (focus: number, rest: number) =>
        `Listo. Tu Pomodoro quedó en ${focus} minutos de enfoque y ${rest} de descanso. Lo cambias en Configuración.`,
      create_contrast_card: (n: number) =>
        n === 0
          ? 'Esas tarjetas de contraste ya estaban en Mis errores.'
          : `Listo. Creé ${plural(n, 'tarjeta de contraste', 'tarjetas de contraste')} en Mis errores.`,
    },
    actionFailed: 'No se pudo aplicar la acción. Intenta de nuevo.',
    practiceBase: 'Practicar el tema base',
    formingTitle: 'Posibles patrones',
    formingHint:
      'Todavía no son hipótesis. Un patrón se confirma con 5 hallazgos del mismo tipo en 14 días.',
    formingRow: (title: string, area: string, have: number, need: number) =>
      `${title} en ${area}. Llevas ${have} de ${need} hallazgos.`,
    calibratingTitle: 'Calibrando',
    calibrating: (errors: number) =>
      errors === 0
        ? 'Calibrando. Todavía no tienes errores en los últimos 14 días, así que no hay patrones que buscar.'
        : `Calibrando. Llevas ${plural(errors, 'error', 'errores')} en los últimos 14 días y todavía ninguna regla se repite 5 veces en el mismo tema.`,
    loading: 'Revisando tus errores…',

    report: {
      title: 'Tu resumen',
      hint: 'Un resumen con plantilla fija, armado con todos tus números hasta hoy. Las secciones que todavía calibran no aparecen. El informe de cada semana llega con la IA en la siguiente fase.',
      calibrating: (have: number, need: number) =>
        `Calibrando. El resumen aparece al juntar ${need} respuestas y llevas ${have}.`,
      priorities: 'Tus prioridades',
      noPriorities: 'Por ahora nada es urgente. Sigue con tu práctica y tu repaso.',
      habit: 'Un hábito',
      challenge: 'Un reto',
      challengeTopic: (topic: string) => `Practica 10 preguntas de ${topic}`,
      challengeTopicText:
        'Sin ver la explicación hasta terminar la serie. Al final revisa qué descartaste y por qué.',
      challengeNegation: 'Practica 10 preguntas con negación',
      challengeNegationText:
        'Antes de ver las opciones di en voz baja qué te piden. Es el hábito que más rinde ahí.',
      go: 'Ir',
      unit: 'respuestas',
    },

    biasTips: {
      title: 'Consejos por trampa',
      hint: 'Aparecen cuando una trampa ya se repite en tus errores. Son borradores pendientes de revisión médica.',
      draftLabel: 'Borrador pendiente de revisión médica',
      unit: 'errores con trampa etiquetada',
      none: 'Ninguna trampa se repite lo bastante en tus errores como para darte un consejo.',
    },

    ai: {
      title: 'Análisis con IA',
      freePlan:
        'El análisis con IA es de los planes de pago. Mientras tanto tu tutor usa plantillas fijas.',
      seePlans: 'Ver planes',
      off: 'Está apagado y tu tutor usa plantillas fijas. Si lo enciendes, la IA redacta la explicación de tus hipótesis, tu informe y tus consejos con tus mismos errores. A la IA solo viajan IDs seudónimos y texto del banco, nunca tu nombre ni tu correo.',
      turnOn: 'Encender análisis con IA',
      turningOn: 'Encendiendo…',
      on: 'Encendido. Lo que redacta la IA va en borrador, con la etiqueta de que ningún médico lo ha validado, y se actualiza cada 7 días.',
      turnOff: 'Apagar en Perfil',
      working: 'Redactando tus explicaciones…',
      offline: 'Sin conexión. Tu tutor sigue con plantillas fijas.',
      notice: (message: string) => `No se pudo usar la IA ahora. ${message}`,
      written: {
        real: 'Redactado por IA',
        mock: 'Redactado por IA simulada',
        template: 'Redactado con respuestas fijas de demostración',
      },
      draft: 'Borrador, no validado por médico',
      noEvidence:
        'La IA no encontró evidencia suficiente para añadir una lectura, así que se queda la explicación base.',
    },

    drafts: {
      title: 'Tarjetas en borrador',
      body: 'Las tarjetas que genera la IA a partir de tus textos y PDF llegan siempre en borrador, con la frase que las respalda. Tú las apruebas, las editas o las descartas.',
      meanwhile:
        'Mientras tanto, cada pregunta que fallas ya pasa a Mis errores para que la repases.',
      mine: (n: number) => `Tienes ${plural(n, 'tarjeta', 'tarjetas')} en Mis errores`,
      go: 'Repasar mis errores',
    },
  },
};
