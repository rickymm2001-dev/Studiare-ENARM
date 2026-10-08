// Textos del examen completo (pantallas 8 y 9) y de su tarjeta en Simular, en español de México con
// trato de tú (4.9). Se integran en t desde es-MX.ts.
import { plural } from './features';

const minutesOf = (ms: number) => Math.max(1, Math.round(ms / 60_000));

export const examText = {
  // Opciones que se pueden descartar, en la práctica y en el examen
  choice: {
    optionsHint:
      'Descartar lo que sabes que no es te acerca a la respuesta. Tus descartes no cambian tu respuesta.',
    discard: 'Descartar',
    restore: 'Volver a incluir',
    discardedLabel: 'Descartada',
    discardOption: (letter: string) => `Descartar la opción ${letter}`,
    restoreOption: (letter: string) => `Volver a incluir la opción ${letter}`,
  },
  exam: {
    // Tarjeta en Simular
    cardTitle: 'Examen completo',
    cardIntro:
      'Un simulacro con tiempo total y sin respuestas hasta el final. Puedes ir y volver entre preguntas, marcar las que quieras revisar y descartar opciones, como en el examen real.',
    size: 'Preguntas',
    sizeOption: (n: number) => String(n),
    timeTotal: (ms: number) => {
      const minutes = minutesOf(ms);
      return minutes < 60
        ? `Tiempo total ${minutes} min`
        : `Tiempo total ${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')} min`;
    },
    shortfall: (requested: number, available: number) =>
      `El banco tiene ${plural(available, 'pregunta elegible', 'preguntas elegibles')}, así que el examen de ${requested} será de ${available}.`,
    fullLocked: 'El examen de 280 preguntas es parte de los planes de pago.',
    limitedTo: (n: number) =>
      `En el plan Gratis este examen se limita a ${plural(n, 'pregunta', 'preguntas')}, las que te quedan hoy.`,
    settings: 'Ajustes del examen',
    settingsSummary: 'Resaltado, confianza y alarmas',
    highlight: 'Resaltar negaciones en la pregunta',
    askConfidence: 'Preguntarme mi confianza en cada respuesta',
    askConfidenceHint: 'Apagado se parece más al examen real.',
    alerts: 'Alarmas de tiempo y de ritmo',
    alertsHint: 'Avisos a la mitad, con 10, 5 y 1 minuto, y si vas atrasado.',
    start: 'Empezar examen',
    starting: 'Armando tu examen…',
    startError: 'No se pudo armar el examen. Intenta de nuevo.',
    inProgressTitle: 'Tienes un examen en curso',
    inProgressBody: (answered: number, total: number, remainingMs: number) =>
      `Llevas ${answered} de ${total} contestadas y te quedan ${minutesOf(remainingMs)} min.`,
    resume: 'Seguir con el examen',
    finishNow: 'Terminar y ver resultados',
    lastTitle: 'Tu último examen',
    lastBody: (correct: number, total: number) => `${correct} de ${total} correctas.`,
    lastBodyUnscored: (answered: number, total: number) =>
      `Contestaste ${answered} de ${total} preguntas.`,
    seeResults: 'Ver resultados',
    unsavedTitle: 'Falta guardar tu último examen',
    unsavedBody:
      'Ya terminó, pero sus respuestas todavía no quedaron en tu historial. Entra a los resultados para guardarlas antes de empezar otro examen.',
    saveAndSee: 'Guardar y ver resultados',

    // Pantalla del examen
    progress: (n: number, of: number) => `Pregunta ${n} de ${of}`,
    answeredCount: (answered: number, total: number) => `Contestadas ${answered} de ${total}`,
    timeLeft: 'Tiempo restante',
    timeLeftValue: (time: string) => `Tiempo restante ${time}`,
    previous: 'Anterior',
    // Atajos de teclado. Se ven solo donde hay teclado (D-087)
    keys: {
      choose: 'eligen',
      shift: 'Mayús',
      letter: 'la letra',
      discard: 'descarta',
      next: 'sigue',
      previous: 'regresa',
      mark: 'marca',
    },
    next: 'Siguiente',
    mark: 'Marcar para revisar',
    unmark: 'Quitar marca',
    marked: 'Marcada para revisar',
    finish: 'Terminar examen',
    confidenceOptional: '¿Qué tan seguro estás? (opcional)',
    stuck: (time: string) =>
      `Llevas ${time} en esta pregunta, más del doble de tu ritmo. Elige la opción más probable, márcala para revisar y sigue.`,
    dismiss: 'Cerrar aviso',
    navigatorTitle: 'Ir a una pregunta',
    navigatorSummary: (answered: number, marked: number) =>
      marked > 0
        ? `${plural(answered, 'contestada', 'contestadas')} · ${plural(marked, 'marcada', 'marcadas')}`
        : plural(answered, 'contestada', 'contestadas'),
    legend: {
      answered: 'Contestada',
      marked: 'Marcada',
      blank: 'En blanco',
      current: 'Actual',
    },
    goToQuestion: (n: number, status: string) => `Pregunta ${n}, ${status}`,
    status: {
      answered: 'contestada',
      blank: 'en blanco',
      marked: 'marcada para revisar',
      current: 'actual',
    },
    noActive: 'No hay un examen en curso.',
    goSetup: 'Configurar examen',
    loading: 'Cargando tu examen…',

    // Avisos de tiempo
    alert: {
      halfway: (answered: number, total: number) =>
        `Va la mitad del tiempo. Llevas ${answered} de ${total} contestadas.`,
      quarter: (ms: number) => `Queda un cuarto del tiempo, unos ${minutesOf(ms)} minutos.`,
      minutes: (n: number) => (n === 1 ? 'Queda 1 minuto.' : `Quedan ${n} minutos.`),
      behind: (behindBy: number, seconds: number, unanswered: number) =>
        `Vas ${plural(behindBy, 'pregunta', 'preguntas')} atrás del ritmo. Para terminar a tiempo te convienen unos ${seconds} segundos por pregunta en las ${unanswered} que faltan.`,
      timeUp: 'Se acabó el tiempo.',
    },

    // Confirmar el fin
    finishTitle: 'Terminar el examen',
    finishBody: (answered: number, blank: number, marked: number) =>
      `Contestaste ${answered}. ${blank > 0 ? `Dejarías ${plural(blank, 'pregunta', 'preguntas')} en blanco. ` : ''}${marked > 0 ? `Tienes ${plural(marked, 'marcada', 'marcadas')} para revisar.` : ''}`.trim(),
    finishKeep: 'Seguir con el examen',
    finishConfirm: 'Terminar y ver resultados',
    goFirstBlank: 'Ir a la primera en blanco',
    goFirstMarked: 'Ir a la primera marcada',
    close: 'Cerrar',
  },
  examResults: {
    saving: 'Guardando tus respuestas…',
    saveError: 'No se pudieron guardar todas tus respuestas. Lo que ya se guardó no se repite.',
    retry: 'Reintentar',
    ended: {
      completed: 'Terminaste el examen.',
      time_up: 'Se acabó el tiempo. Lo que quedó sin contestar cuenta en blanco.',
      abandoned: 'Terminaste el examen antes de tiempo.',
    },
    summaryTitle: 'Tu examen',
    statsLabel: 'Cifras del examen',
    accuracyLabel: 'Aciertos',
    accuracy: (correct: number, total: number) => `${correct} de ${total} correctas`,
    answered: 'Contestadas',
    blank: 'En blanco',
    marked: 'Marcadas',
    time: (used: string, total: string) => `Tiempo ${used} de ${total}`,
    perQuestion: (seconds: number) => `${seconds} s por pregunta contestada`,
    xp: (xp: number) => `+${xp.toLocaleString('es-MX')} XP`,
    notPrediction:
      'Este resultado describe lo que hiciste en este examen. No predice tu puntaje del ENARM, y con pocas preguntas por tema es solo una pista.',
    shortfall: (requested: number, total: number) =>
      `Pediste ${requested} preguntas y el banco solo tenía ${total} elegibles.`,

    branchesTitle: 'Por rama',
    topicsTitle: 'Por tema',
    topicsHint: 'Solo los temas con al menos 2 preguntas en este examen.',
    tally: (correct: number, answered: number, total: number) =>
      `${correct} de ${total} · ${answered} contestadas`,
    structureTitle: 'Por estructura de pregunta',
    polarity: { affirmative: 'Afirmativas', negative: 'Negativas o de excepción' },
    taskTitle: 'Por tipo de tarea',
    structureCalibrating:
      'La comparación entre afirmativas y negativas necesita más preguntas de cada tipo para ser confiable. Mira Progreso para ver tu patrón acumulado.',
    structureUnit: 'preguntas de cada tipo',
    trapsTitle: 'Trampas en las que caíste',
    trapsNone: 'No caíste en ninguna trampa etiquetada. O no fallaste, o fallaste sin etiqueta.',
    trapCount: (n: number) => plural(n, 'vez', 'veces'),
    kindsTitle: 'Reactivos raros',
    kindsIntro:
      'El ENARM trae preguntas incómodas a propósito. Aquí ves cómo te fue en cada tipo, aparte del resto.',
    kinds: {
      inverse_resolution: [
        'Resolución inversa',
        'Casos casi iguales que solo se separan por el tratamiento.',
      ],
      incoherent: ['Con incoherencias', 'Casos con datos que no cuadran entre sí, a propósito.'],
      control: ['De control', 'Miden tu atención. Tienen respuesta clara si lees con cuidado.'],
      obscure_detail: ['Datos oscuros', 'Preguntan un dato muy específico que casi no se estudia.'],
      patient_perspective: [
        'Desde el paciente',
        'Escritos como los contaría el paciente, sin términos médicos.',
      ],
    } as Record<string, [string, string]>,
    eliminationTitle: 'Tus descartes',
    eliminationNone:
      'No descartaste opciones. Hacerlo te ayuda a elegir mejor cuando dudas, aunque no estés seguro de la correcta.',
    eliminationBody: (questions: number, options: number) =>
      `Descartaste ${plural(options, 'opción', 'opciones')} en ${plural(questions, 'pregunta', 'preguntas')}.`,
    eliminationCorrect: (n: number) =>
      `${plural(n, 'vez descartaste', 'veces descartaste')} la opción correcta. Es la forma más cara de equivocarse. Revisa esas con calma abajo.`,
    eliminationClean: 'Ninguna de tus opciones descartadas era la correcta.',
    errorsTitle: 'Tus errores y el repaso',
    errorsSent: (n: number) =>
      n === 0
        ? 'Tus errores de este examen ya estaban en tu repaso.'
        : `${plural(n, 'error pasó', 'errores pasaron')} a tu repaso en Mis errores.`,
    errorsOff:
      'Tus errores no pasan al repaso porque lo apagaste en tus ajustes. Puedes volver a encenderlo en Cuenta.',
    errorsNone: 'No tuviste errores que mandar al repaso.',
    reviewNow: 'Repasar ahora',
    readTitle: 'Cómo leer este resultado',
    readBody:
      'Un examen difícil no es un veredicto. En el ENARM de verdad habrá preguntas que no sabes. Lo que se entrena aquí es qué haces con ellas, descartar lo falso, elegir lo más probable y seguir avanzando. Lo que fallaste ya es la lista de lo que más te conviene repasar.',

    reviewTitle: 'Revisión pregunta por pregunta',
    filter: { all: 'Todas', missed: 'Falladas', blank: 'En blanco', marked: 'Marcadas' },
    filterLabel: 'Mostrar',
    questionN: (n: number) => `Pregunta ${n}`,
    outcome: { correct: 'Correcta', missed: 'Fallada', blank: 'En blanco' },
    yourAnswer: 'Tu respuesta',
    correctAnswer: 'Respuesta correcta',
    discarded: 'Descartada',
    discardedCorrect: 'Descartaste la correcta',
    markedForReview: 'La marcaste',
    timeOn: (seconds: number) => `${seconds} s`,
    explanation: 'Explicación',
    noMatches: 'No hay preguntas con este filtro.',
    anotherExam: 'Otro examen',
    goHome: 'Ir a Inicio',
    noExam: 'No hay un examen para mostrar.',
  },
};
