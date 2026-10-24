// Textos de las pantallas del alumno de la Fase C, en español de México con trato de tú (4.9).
// Se integran en t desde es-MX.ts.
import { deviceLimitText } from './device';
import { plural } from './plural';
import { headerStatsText, levelLadderText, otherDeviceText } from './shell';
import { causeNames, insightText } from './insights';
import { landingText } from './landing';
import { legalText } from './legal';

export const branchNames: Record<string, string> = {
  internal_medicine: 'Medicina interna',
  pediatrics: 'Pediatría',
  obstetrics_gynecology: 'Ginecología y obstetricia',
  general_surgery: 'Cirugía general',
  family_medicine: 'Medicina familiar',
  emergency_medicine: 'Urgencias',
  public_health: 'Salud pública',
  medical_english: 'Inglés médico',
};

export { plural };

/** Un nombre a media frase. Baja solo la primera letra y respeta siglas como IA (H18 de B2) */
const midSentence = (name: string) =>
  /^\p{Lu}{2}/u.test(name) ? name : `${name.charAt(0).toLocaleLowerCase('es-MX')}${name.slice(1)}`;

export const featureText = {
  plural,
  branchNames,
  session: {
    signedOutTitle: 'Entra para continuar',
    signedOutBody: 'Elige tu perfil o crea uno nuevo. Todo se guarda solo en este dispositivo.',
    goToWelcome: 'Ir a la bienvenida',
    demoEmptyTitle: 'La demostración está vacía',
    signOut: 'Cerrar sesión',
    simulatedLogin:
      'Inicio de sesión simulado. Sin la nube conectada no hay contraseña ni servidor, y entras con la cuenta de este navegador.',
  },
  onboarding: {
    intro: 'Crea tu cuenta en un minuto o entra con tu correo.',
    tabs: 'Crear cuenta o entrar',
    createTab: 'Crear cuenta',
    loginTab: 'Ya tengo cuenta',
    signInTitle: 'Entrar',
    signInDescription: 'Escribe el correo con el que creaste tu cuenta.',
    signIn: 'Entrar',
    noAccount: 'No encontramos una cuenta con ese correo en este navegador.',
    legacyTitle: 'Perfiles de este navegador creados antes de las cuentas con correo',
    signInAs: (alias: string) => `Entrar como ${alias}`,
    examOn: (date: string) => `ENARM el ${date}`,
    noExamDate: 'Sin fecha de ENARM',
    createTitle: 'Crea tu cuenta',
    createDescription:
      'Tu alias y tus datos los cambias después en Configuración, y tu meta diaria en Ajustes del repaso, en Repasar.',
    alias: 'Alias',
    aliasHint: 'Así te verán en Party. No uses tu nombre completo.',
    aliasError: 'Escribe un alias de 1 a 40 caracteres.',
    examDate: 'Fecha del ENARM',
    examDateHint: 'Si todavía no la sabes, déjala vacía.',
    dailyMinutes: 'Minutos de estudio al día',
    minutes: (n: number) => `${n} minutos`,
    branches: 'Ramas que estudias',
    branchesError: 'Elige al menos una rama.',
    goalMetric: 'Meta diaria para tu racha',
    goalValue: 'Cantidad',
    goalMetrics: { cards: 'Tarjetas', questions: 'Preguntas', focusMinutes: 'Minutos de estudio' },
    privacyTitle: 'Aviso de privacidad y términos',
    privacyBody: legalText.onboarding.summary,
    privacyAccept: legalText.onboarding.accept,
    privacyError: 'Necesitas aceptar el aviso para continuar.',
    create: 'Crear cuenta y empezar',
    creating: 'Creando…',
    demoNote: 'En la demostración entras como el alumno de demostración.',
    goHome: 'Ir al inicio',
    // La bienvenida al estilo de la portada (D-150). Panel marino a la izquierda y el formulario al lado
    backToLanding: 'Volver a la portada',
    haveAccount: '¿Ya tienes cuenta?',
    enterHere: 'Entra aquí',
    noAccountCreate: 'Crear mi cuenta',
    panel: {
      kicker: 'Bienvenida',
      titleLead: 'Prepárate para el',
      titleExam: (year: number) => `ENARM ${String(year)}`,
      lead: 'Entrena la forma en que contestas, no solo lo que sabes.',
      benefits: [
        'Repaso espaciado con FSRS que decide qué repasar y cuándo',
        'Simuladores imperfectos a propósito, como el examen real',
        'El sesgo que te atrapa en cada distractor, con nombre y apellido',
      ],
      privacy:
        'Tus datos viven en este dispositivo. Al Party y a la IA solo viaja tu alias, nunca tu nombre ni tu correo.',
    },
    // El mismo panel en Ya tengo cuenta, con dos cifras reales de este navegador si hay datos
    loginPanel: {
      kicker: 'Qué bueno verte',
      titleLead: 'Sigue donde',
      titleTail: 'te quedaste',
      lead: 'Tu racha, tus tarjetas y tus simuladores te esperan en este dispositivo.',
      daysToExam: 'Faltan para el ENARM',
      days: (n: number) => plural(n, 'día', 'días'),
      dueToday: 'Repasos que te esperan hoy',
      privacy:
        'Tu correo solo sirve para entrar y para tus recibos. Nunca se comparte ni viaja a la IA.',
    },
  },
  home: {
    greeting: (alias: string) => `Hola, ${alias}`,
    // El saludo concuerda con el sexo que el alumno declaró. Sin dato se usa una forma neutra
    welcome: (alias: string, sex: 'female' | 'male' | 'other' | 'undisclosed' | null) =>
      sex === 'female'
        ? `Bienvenida, ${alias}`
        : sex === 'male'
          ? `Bienvenido, ${alias}`
          : `Te damos la bienvenida, ${alias}`,
    reviewsTitle: 'Tus repasos',
    simulatorsTitle: 'Tus simuladores',
    topicsTitle: 'Temas por reforzar',
    dueTitle: 'Tienes…',
    dueCaption: (n: number) => (n === 1 ? 'Tarjeta vencida' : 'Tarjetas vencidas'),
    dueLabel: (n: number) => plural(n, 'tarjeta vencida', 'tarjetas vencidas'),
    nothingDue: 'Nada vencido por ahora. Aprende tarjetas nuevas o practica preguntas.',
    load: {
      title: 'Carga de repaso',
      average: (n: number) =>
        `Este mes hiciste ${plural(n, 'repaso', 'repasos')} en promedio por día.`,
      averageNone: 'Este mes todavía no repasas tarjetas.',
      linkBefore: 'Da clic ',
      link: 'aquí',
      linkLabel: 'Ver tu carga completa en Progreso',
      linkAfter: ' para ver tu carga completa.',
      empty:
        'Cuando repases tus primeras tarjetas verás aquí cuántos repasos tenías programados y cuántos hiciste cada mes.',
      scheduled: 'Programados',
      done: 'Realizados',
      month: 'Mes',
      chartLabel: 'Repasos programados y realizados por mes',
      point: (month: string, scheduled: number, done: number | null) =>
        done === null
          ? `${month}, ${plural(scheduled, 'repaso programado', 'repasos programados')}`
          : `${month}, ${plural(scheduled, 'repaso programado', 'repasos programados')} y ${plural(done, 'realizado', 'realizados')}`,
      notYet: 'Todavía no llega',
      // La tarjeta de cifra del rediseño (D-150). El promedio del mes va como cifra grande
      averageCaption: 'al día en promedio este mes',
      seeAll: 'Ver la carga completa en Progreso',
    },
    plan: {
      title: 'Tu plan',
      change: 'Cambiar de plan',
      upgrade: 'Mejorar tu plan',
    },
    // El héroe de Inicio con la fecha y los botones (D-150)
    lead: (due: number, questions: number) =>
      `Hoy toca ${plural(due, 'repaso', 'repasos')} y ${plural(questions, 'pregunta', 'preguntas')}. Vamos con calma.`,
    startReviews: 'Empezar repasos',
    customize: 'Personalizar',
    dateLabel: (date: string) => `Hoy es ${date}`,
    asideLabel: 'Tu plan y tus retos',
    // Estado de las tarjetas en anillo concéntrico (D-150)
    cards: {
      title: 'Estado de tus tarjetas',
      active: 'Tarjetas activas',
      upToDate: 'Al día',
      due: 'Vencidas',
      forgotten: 'Olvidadas',
      label: (active: number, upToDate: number, due: number, forgotten: number) =>
        `${plural(active, 'tarjeta activa', 'tarjetas activas')}. Al día ${upToDate.toLocaleString('es-MX')}, vencidas ${due.toLocaleString('es-MX')}, olvidadas ${forgotten.toLocaleString('es-MX')}`,
    },
    // Meta de hoy en anillos, con el plan de hoy adentro (D-150)
    goal: {
      title: 'Meta de hoy',
      ofDay: 'del día',
      percent: (n: number) => `${n.toLocaleString('es-MX')} %`,
      row: (name: string, done: number, target: number) =>
        `${name} ${done.toLocaleString('es-MX')} de ${target.toLocaleString('es-MX')}`,
      label: (percent: number, rows: string) => `Meta de hoy al ${percent} por ciento. ${rows}`,
    },
    // Pulso de estudio en medidor (D-150)
    pulse: {
      title: 'Pulso de estudio',
      outOf: '/100',
      label: (score: number) => `Pulso de estudio ${score} de 100`,
      states: { good: 'Vas bien', near: 'Cerca de la meta', low: 'Hay que ajustar' },
      parts: (c: number, cMax: number, a: number, aMax: number, r: number, rMax: number) =>
        `Constancia ${c} de ${cMax}, aciertos ${a} de ${aMax} y retención ${r} de ${rMax} puntos.`,
      breakdown: 'Ver el desglose',
      units: {
        activeDays: 'días con actividad de los últimos 14',
        answered: 'preguntas contestadas en 30 días',
        reviews: 'repasos en 30 días',
      },
      calibratingNote: (days: number, answered: number, reviews: number) =>
        `Para medir tu pulso faltan ${plural(days, 'día con actividad', 'días con actividad')}, ${plural(answered, 'pregunta', 'preguntas')} y ${plural(reviews, 'repaso', 'repasos')}.`,
    },
    simulateTopics: 'Simular estos temas',
    // Indicadores clave. Cada uno calibra con su umbral y nunca inventa la cifra (D-150)
    indicators: {
      title: 'Indicadores clave',
      seeAll: 'Ver todos en Progreso',
      missing: (n: number, unit: string) =>
        `Faltan ${n.toLocaleString('es-MX')} ${unit} para medirlo`,
      retention: {
        title: 'Retención',
        states: { good: 'Óptima', near: 'Cerca de la meta', low: 'Por debajo de la meta' },
        note: (goal: number) => `Meta de FSRS en ${goal} %`,
        unit: 'repasos',
        chartLabel: (weeks: number) => `Retención por semana de las últimas ${weeks} semanas`,
      },
      accuracy: {
        title: 'Aciertos',
        states: { good: 'En la meta', near: 'Cerca de la meta', low: 'Por debajo de la meta' },
        ticks: ['40 %', '70 %, meta', '100 %'] as const,
        label: (percent: number) => `Aciertos del ${percent} por ciento, con meta de 70`,
        unit: 'preguntas',
      },
      pace: {
        title: 'Tiempo por pregunta',
        states: { good: 'Óptimo', near: 'Un poco lento', low: 'Lento' },
        ticks: (pace: number) => ['40 s', `${pace} s, ritmo ENARM`, '120 s'] as const,
        label: (seconds: number, pace: number) =>
          `${seconds} segundos por pregunta, con ritmo ENARM de ${pace}`,
        unit: 'preguntas',
      },
      fatigue: {
        title: 'Fatiga',
        states: { signal: 'Señal de fatiga', none: 'Sin señal clara' },
        unit: 'puntos',
        note: (sessions: number) =>
          `Cambio de aciertos en el último tercio de ${plural(sessions, 'sesión larga', 'sesiones largas')}`,
        calibratingNote: 'Llega con las sesiones largas, de más de 30 minutos',
        calibratingUnit: 'sesiones largas',
      },
    },
    // Tarjetas por rama en dona, o por mazo cuando una tarjeta no tiene rama (D-150)
    branches: {
      title: 'Tarjetas por rama',
      byDeck: 'Tarjetas por mazo',
      center: 'Tarjetas',
      label: (total: number, parts: string) => `${plural(total, 'tarjeta', 'tarjetas')}. ${parts}`,
      part: (name: string, percent: number) => `${name} ${percent} por ciento`,
      empty: 'Sigue un mazo para ver aquí tus tarjetas por rama.',
    },
    // Preguntas por día, esta semana en barras contra la pasada en línea (D-150)
    questions: {
      title: 'Preguntas por día',
      more: (n: number) => `${n.toLocaleString('es-MX')} más`,
      fewer: (n: number) => `${n.toLocaleString('es-MX')} menos`,
      same: 'igual',
      caption: (average: number) =>
        `que la semana pasada · promedio de ${average.toLocaleString('es-MX')} al día`,
      weekdays: ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'] as const,
      thisWeek: 'Esta semana',
      lastWeek: 'Semana pasada',
      tableCaption: 'Preguntas por día de la semana',
    },
    yearTitle: 'Tu año de estudio',
    // Frases para la meta diaria. Una por día, la misma todo el día
    quotes: [
      { text: 'Caminante, no hay camino, se hace camino al andar.', author: 'Antonio Machado' },
      { text: 'La vida es breve y el arte es largo.', author: 'Hipócrates' },
      { text: 'No es que tengamos poco tiempo, es que perdemos mucho.', author: 'Séneca' },
      { text: 'Gota a gota se llena el vaso.', author: 'Refrán popular' },
      { text: 'Poco a poco se anda lejos.', author: 'Refrán popular' },
    ],
  },
  widgets: {
    party: {
      empty: 'Aún no estás en un grupo.',
      go: 'Ir a Party',
      rank: (rank: number, of: number) => `Lugar ${rank} de ${of}`,
      duelsPending: (n: number) => `${plural(n, 'duelo espera', 'duelos esperan')} tu turno`,
    },
    names: {
      heatmap: 'Heatmap de estudio',
      pomodoro: 'Pomodoro',
      streak: 'Racha',
      level_xp: 'Nivel y XP',
      today: 'Para hoy',
      weak_topics: 'Temas débiles',
      exam_countdown: 'Cuenta regresiva (retirada)',
      bias_pattern: 'Patrón de trampa',
      future_load: 'Carga futura',
      daily_goal: 'Meta diaria',
      party_challenge: 'Reto de Party',
      latest_hypothesis: 'Última hipótesis del tutor',
      missions: 'Misiones de hoy',
    },
    heatmap: {
      range: 'Rango',
      auto: 'Desde que empezaste',
      days: (n: number) => `${n} días`,
      metric: 'Métrica',
      metrics: { cards: 'Tarjetas', questions: 'Preguntas', focusMinutes: 'Minutos de estudio' },
      summary: (active: number, total: number, sum: number, metric: string) =>
        `${active} de ${total} días con actividad. ${sum.toLocaleString('es-MX')} ${metric} en total.`,
      cell: (day: string, value: number, metric: string) => `${day}, ${value} ${metric}`,
      /** El detalle de un día que se toca (V4-B3) */
      detail: (day: string, cards: number, questions: number, minutes: number) =>
        `${day}. ${cards.toLocaleString('es-MX')} tarjetas, ${questions.toLocaleString('es-MX')} preguntas y ${minutes.toLocaleString('es-MX')} minutos de estudio.`,
      /** Inicial de cada día, de lunes a domingo, a la izquierda de las filas */
      weekdays: ['L', 'M', 'M', 'J', 'V', 'S', 'D'],
      less: 'Menos',
      more: 'Más',
    },
    streak: {
      current: (n: number) => plural(n, 'día', 'días'),
      best: (n: number) => `Récord ${plural(n, 'día', 'días')}`,
      freezes: (n: number) => plural(n, 'congelador guardado', 'congeladores guardados'),
      todayMet: 'Ya cumpliste la meta de hoy',
      todayPending: 'Todavía no cumples la meta de hoy',
    },
    level: {
      level: (n: number) => `Nivel ${n}`,
      progress: (into: number, next: number) =>
        `${into.toLocaleString('es-MX')} de ${next.toLocaleString('es-MX')} XP para el siguiente nivel`,
      total: (xp: number) => `${xp.toLocaleString('es-MX')} XP en total`,
      weekly: (xp: number) => `${xp.toLocaleString('es-MX')} XP esta semana`,
    },
    today: {
      due: (n: number) => plural(n, 'tarjeta vencida', 'tarjetas vencidas'),
      done: (cards: number, questions: number) =>
        `Hoy llevas ${plural(cards, 'tarjeta', 'tarjetas')} y ${plural(questions, 'pregunta', 'preguntas')}`,
      errors: (n: number) => plural(n, 'error para repasar', 'errores para repasar'),
      review: 'Repasar',
      simulate: 'Simular',
      nothingDue:
        'Nada vencido por ahora. Aprende tarjetas nuevas en Repasar o practica preguntas en Simular.',
    },
    goal: {
      progress: (done: number, goal: number, metric: string) => `${done} de ${goal} ${metric}`,
      ratio: (done: number, goal: number) => `${done} de ${goal}`,
      metricNames: {
        cards: 'tarjetas',
        questions: 'preguntas',
        focusMinutes: 'minutos de estudio',
      },
      met: 'Meta cumplida',
    },
    // Plan de hoy dentro de la meta diaria. Las tres cifras de la guía (V4-B4)
    plan: {
      title: 'Plan de hoy',
      rows: { cards: 'Tarjetas', newCards: 'Nuevas', questions: 'Preguntas' },
      label: (row: string, done: number, target: number) =>
        `${row}, ${done.toLocaleString('es-MX')} de ${target.toLocaleString('es-MX')}`,
      change: 'Cambiar',
    },
    // Widgets de análisis. Dicen lo mismo que Progreso y el tutor, en chico (9.1)
    weakTopics: {
      hint: 'Los temas con menor dominio estimado, de los que ya hay respuestas suficientes.',
      unit: 'respuestas en un tema',
      none: 'Ningún tema está por debajo de 60% de dominio. Sigue con tu práctica.',
      noneInBranch: 'Ningún tema de esta rama está por debajo de 60% de dominio.',
      practice: (topic: string) => `Practicar ${topic}`,
      seeAll: 'Ver todos los temas',
      settings: {
        count: 'Cuántos temas',
        countOption: (n: number) => `${n} temas`,
        branch: 'Rama',
        allBranches: 'Todas las ramas',
      },
    },
    biasPattern: {
      hint: 'Los tipos de distractor que más te atraen cuando fallas.',
      unit: 'errores con trampa etiquetada',
      pattern: 'Patrón',
      none: 'Ningún tipo de distractor se destaca todavía en tus errores.',
      row: (name: string, share: number) =>
        `${name}. Lo eliges ${Math.round(share * 100)}% de las veces que aparece al fallar`,
      seeAll: 'Ver tu perfil completo',
    },
    futureLoad: {
      empty: 'Todavía no sigues ningún mazo, así que no hay carga que proyectar.',
      goToDecks: 'Ir a Mazos',
      summary: (average: number, peak: string) =>
        `${plural(average, 'repaso', 'repasos')} por día en promedio. Día más cargado ${peak}.`,
      seeAll: 'Ver la carga completa',
      settings: { days: 'Periodo', daysOption: (n: number) => `${n} días` },
    },
    latestHypothesis: {
      forming: 'Posible patrón',
      helpful: 'Dijiste que te sirve',
      open: 'Abrir el tutor',
    },
  },
  pomodoro: {
    phases: { focus: 'Enfoque', short_break: 'Descanso corto', long_break: 'Descanso largo' },
    cycle: (n: number, of: number) => `Ciclo ${n} de ${of}`,
    start: 'Iniciar',
    pause: 'Pausar',
    resume: 'Continuar',
    stop: 'Detener',
    skip: 'Saltar al siguiente',
    // La tarjeta del Pomodoro en Repasar (D-150). Reiniciar vuelve la fase al principio sin arrancarla
    // y Configurar abre sus ajustes dentro de Ajustes del repaso
    reset: 'Reiniciar',
    configure: 'Configurar',
    ofFocus: (minutes: number, breakMinutes: number) =>
      `de ${minutes} min. Luego ${breakMinutes} de descanso.`,
    ofBreak: (minutes: number, focusMinutes: number) =>
      `de ${minutes} min de descanso. Luego ${focusMinutes} de enfoque.`,
    remaining: (time: string, phase: string) => `${time} restantes de ${phase}`,
    finished: (phase: string) => `Terminó ${phase.toLowerCase()}`,
    next: (phase: string) => `Sigue ${phase.toLowerCase()}`,
    focusToday: (minutes: number) => `${minutes} minutos de enfoque hoy`,
    settings: 'Ajustes del Pomodoro',
    label: 'Pomodoro',
    show: (time: string, phase: string) => `Mostrar Pomodoro, ${time} restantes de ${phase}`,
    minimize: 'Minimizar Pomodoro',
    dismiss: 'Cerrar aviso',
    breakTip: 'Levántate, toma agua y descansa la vista',
    focusTip: 'Cuando estés listo, sigue estudiando',
    startBreak: 'Empezar descanso',
    startFocus: 'Seguir estudiando',
    focusMinutes: 'Enfoque (minutos)',
    shortBreakMinutes: 'Descanso corto (minutos)',
    longBreakMinutes: 'Descanso largo (minutos)',
    cyclesBeforeLong: 'Ciclos antes del descanso largo',
    sound: 'Sonido al terminar',
    notifications: 'Notificación del navegador',
    notificationsHint:
      'Solo si el navegador lo permite. En iPhone funciona si agregaste la página a tu pantalla de inicio.',
    notificationsDenied:
      'El navegador no dio permiso para notificaciones. El aviso dentro de la página sigue activo.',
    save: 'Guardar cambios',
    saved: 'Ajustes guardados',
  },
  settings: {
    save: 'Guardar',
    saved: 'Guardado',
    // Configuración al estilo de la portada (D-150). Título del héroe, la zona horaria de solo
    // lectura en Perfil y la tarjeta Carga diaria, que solo lee lo guardado en Ajustes del repaso
    heroTitle: 'Tu cuenta y tu forma de estudiar',
    timeZone: 'Zona horaria',
    dailyLoadCard: {
      reviews: 'Repasos al día',
      newCards: 'Tarjetas nuevas',
      questions: 'Preguntas al día',
      unlimited: 'Sin límite',
      freeNote: (limit: number) =>
        `El plan Gratis permite hasta ${String(limit)} preguntas al día. Con un plan de pago no hay tope.`,
    },
    goalsTitle: 'Metas y repaso',
    saveChanges: 'Guardar cambios',
    unsaved: 'Tienes cambios sin guardar.',
    discard: 'Descartar',
    discarded: 'Volvimos a lo que tenías guardado.',
    dailyTitle: 'Metas del día',
    advanced: 'Opciones avanzadas del repaso',
    advancedSummary: (retention: number, maxDays: number | null) =>
      `Retención ${retention}% · ${maxDays === null ? 'sin tope' : `tope de ${maxDays} días`}`,
    studyOptionsTitle: 'Al estudiar',
    retention: 'Retención deseada',
    retentionHint:
      'Qué tanto quieres recordar cada tarjeta. 90% es lo recomendado por los creadores de FSRS. Más alto da repasos más seguidos. Entre 80% y 97%.',
    maxInterval: 'Intervalo máximo con Bien',
    maxIntervalHint:
      'Una tarjeta que calificas Bien no se va más lejos que esto, así la vuelves a ver antes del examen. Difícil y Fácil se mueven en la misma proporción.',
    spacingTitle: 'Qué tan lejos sale cada botón',
    spacingHint:
      'Ajusta cuánto tarda en volver una tarjeta según cómo la calificaste. 100% (con estrella) es lo que calcula FSRS y es lo recomendado.',
    spacingLabels: { hard: 'Difícil', good: 'Bien', easy: 'Fácil' },
    spacingOption: (percent: number) =>
      percent === 100 ? '100% ★' : percent < 100 ? `${percent}% antes` : `${percent}% después`,
    resetRecommended: 'Volver a lo recomendado',
    maxIntervalOption: (days: number | null) =>
      days === null ? 'Sin tope, FSRS puro' : days === 21 ? '21 días, recomendado' : `${days} días`,
    newCardsPerDay: 'Tarjetas nuevas por día',
    reviewsPerDay: 'Repasos máximos por día',
    questionsPerDay: 'Preguntas por día (0 la apaga)',
    // Las cifras de la guía en un toque (V4-B4)
    guidePlanTitle: 'Plan de la guía',
    guidePlanBody:
      '300 tarjetas al día con 50 nuevas entre ellas, y 50 preguntas. Son 250 repasos, 50 nuevas y 50 preguntas. Se aplican al guardar.',
    guidePlanApply: 'Usar el plan de la guía',
    guidePlanActive: 'Ya usas el plan de la guía.',
    unlimitedNewCards: 'Sin límite de tarjetas nuevas',
    unlimitedNewCardsHint:
      'Con muchas nuevas juntas, los repasos de los días siguientes se acumulan como una avalancha. Úsalo solo si sabes cuánto tiempo tienes.',
    cardTimerTitle: 'Temporizador de tarjeta',
    cardTimerEnabled: 'Mostrar un tiempo sugerido por tarjeta',
    cardTimerHint:
      'Apagado por defecto. Solo avisa cuánto tiempo conviene tardar y no califica nada. Lo que se guarda en cada paso, ver la respuesta y calificar, nunca pasa de 2 minutos.',
    cardTimerSeconds: 'Tiempo sugerido',
    cardTimerSecondsOption: (seconds: number) => `${seconds} segundos`,
    cardTimerAutoReveal: 'Mostrar la respuesta sola cuando se acabe el tiempo',
    easyDaysTitle: 'Días fáciles',
    easyDaysHint:
      'Elige los días de la semana en que quieres menos repasos. Al programar el siguiente repaso de una tarjeta, se mueve unos días para evitarlos. Solo cambia lo que programes desde ahora y la memoria de cada tarjeta no se toca. Si marcas varios días seguidos como casi ninguno, los días de al lado se cargan más.',
    easyDaysSummary: (count: number) =>
      count === 0
        ? 'Todos los días normales'
        : count === 1
          ? '1 día fácil'
          : `${count} días fáciles`,
    easyLevels: { normal: 'Normal', reduced: 'Menos repasos', minimum: 'Casi ninguno' },
    weekdays: {
      mon: 'Lunes',
      tue: 'Martes',
      wed: 'Miércoles',
      thu: 'Jueves',
      fri: 'Viernes',
      sat: 'Sábado',
      sun: 'Domingo',
    },
    studyTitle: 'Estudio',
    cardConfidenceStep: 'Preguntar qué tan seguro estoy antes de ver la respuesta o de responder',
    cardConfidenceStepHint:
      'Está apagado para estudiar más rápido. Si lo enciendes, Progreso puede avisarte cuando fallas con mucha seguridad.',
    practiceFeedback: 'Retroalimentación de la práctica',
    practiceFeedbackOptions: {
      end: 'Al final de la sesión',
      each: 'Después de cada pregunta',
    },
    negationHighlightPractice: 'Resaltar negaciones en práctica',
    negationHighlightExam: 'Resaltar negaciones en examen completo',
    errorsToReview: 'Mandar mis errores de preguntas al repaso',
    optionsShown: 'Opciones por pregunta',
    pomodoroTitle: 'Pomodoro',
    // Consentimientos y puntaje oficial voluntario (Fase E bloque E6, D-101)
    privacy: {
      consentsTitle: 'Tus consentimientos',
      consentsDescription:
        'Aceptaste el aviso de privacidad al crear tu perfil. Aquí das o retiras cada permiso cuando quieras, y cada cambio queda en tu bitácora.',
      consentSaved: 'Guardamos tu decisión.',
      consentError: 'No pudimos guardar el cambio. Inténtalo de nuevo.',
      scoreTitle: 'Puntaje oficial del ENARM',
      scoreDescription:
        'Es voluntario. Sirve para comparar, con datos reales, si lo que estudiaste se parece al examen. Studiare no lo usa para predecir tu puntaje ni lo muestra a otras personas. Solo se guarda con el permiso Mejora con tus datos sin nombre.',
      scoreNeedsConsent:
        'Para guardar tu puntaje, activa antes la mejora con tus datos sin nombre en tus consentimientos.',
      year: 'Año de la convocatoria',
      score: 'Puntaje obtenido',
      scoreHint: 'De 0 a 100, con hasta dos decimales.',
      saveScore: 'Guardar puntaje',
      removeScore: 'Quitar mi puntaje',
      current: (year: number, score: number) =>
        `Tienes guardado un puntaje de ${String(score)} en la convocatoria ${String(year)}.`,
      none: 'Todavía no guardas ningún puntaje.',
      scoreSaved: 'Guardamos tu puntaje.',
      scoreRemoved: 'Quitamos tu puntaje oficial.',
      scoreErrors: {
        invalid_year: 'Escribe un año entre 2000 y 2100.',
        invalid_score: 'El puntaje va de 0 a 100.',
        no_consent: 'Activa antes la mejora con tus datos sin nombre.',
      },
    },
    exportTitle: 'Exportar mis datos',
    exportDescription:
      'Descarga tu perfil, consentimientos, bitácora y tablero en un archivo JSON. Con tu cuenta en la nube incluye también lo tuyo de Party, tus grupos, tu XP publicado, tus aportes a los retos y tus duelos.',
    export: 'Descargar mis datos',
    deleteTitle: 'Borrar mis datos',
    deleteDescription:
      'Elimina por completo la base de Mi cuenta en este dispositivo. No se puede deshacer.',
    delete: 'Borrar todos mis datos',
    deleteConfirm: 'Sí, borrar todo',
    deleteConfirmText:
      'Se borran todos los perfiles y su historial de Mi cuenta. La demostración no se toca.',
    // Con la cuenta en la nube conectada. Borrar los datos también quita la copia de allá (D-101)
    deleteCloudNote:
      'Como tienes tu cuenta en la nube conectada, también se borra tu copia allá, con tu bitácora, tarjetas, apuntes y grupos. Tu correo y tu plan se quedan.',
    deleteCloudChecking:
      'Estamos comprobando tu cuenta en la nube. Espera unos segundos para borrar, así se borra también tu copia allá.',
    deleteSignedOutNote:
      'No tienes la sesión de la nube abierta, así que solo se borra este dispositivo y tu copia en la nube se queda. Entra con tu correo antes si quieres borrarla también.',
    deleteCloudUnknownNote:
      'No pudimos comprobar tu cuenta en la nube, así que solo se borra este dispositivo y tu copia allá se queda. Entra con conexión si quieres borrarla también.',
    deleteCloudConfirmText:
      'Se borran los perfiles y el historial de este dispositivo y tu copia en la nube. No se puede deshacer.',
    deleting: 'Borrando…',
    eraseErrors: {
      local:
        'Se borró tu copia en la nube, pero no se pudo borrar este dispositivo. Inténtalo otra vez.',
      not_active_device:
        'Este no es el dispositivo activo de tu cuenta. Abre Studiare en el dispositivo donde usaste tu cuenta por última vez, o entra aquí de nuevo para tomarla.',
      owner: 'La cuenta del dueño de la plataforma no se puede borrar desde aquí.',
      active_subscription:
        'Tienes una suscripción con tarjeta activa. Cancélala primero en Suscripción, Administrar suscripción, porque eliminar la cuenta no detiene los cobros. No se borró nada.',
      physician_reviews:
        'Tu cuenta tiene revisiones registradas para pagos. Pide a Ricardo que la cierre. No se borró nada.',
      no_session: 'Tu sesión en la nube venció. Entra otra vez con tu correo.',
      network: 'No hay conexión con el servidor. No se borró nada. Inténtalo de nuevo.',
      unknown: 'El servidor no pudo borrar tus datos. No se borró nada. Inténtalo más tarde.',
    },
    accountDeleteTitle: 'Eliminar mi cuenta',
    accountDeleteDescription:
      'Quita tu cuenta en la nube con tu correo, tu bitácora, tu plan, tus pagos en Studiare y tus referidos, y borra los datos de este dispositivo. Tu correo queda libre para registrarte otra vez. No se puede deshacer.',
    accountDeletePayments:
      'Los cobros que ya hizo la pasarela de pagos se conservan allá, porque la ley pide guardar las facturas. Para pedir que los quiten, habla con la pasarela. Si pagas una suscripción con tarjeta, cancélala antes en Suscripción, Administrar suscripción, porque eliminar la cuenta no detiene los cobros.',
    accountDeleteExportHint:
      'Antes de eliminar, descarga tus datos con el botón de arriba. Después de eliminar no se pueden recuperar.',
    accountDeleteConfirmLabel: 'Para confirmar, escribe ELIMINAR',
    accountDeleteWord: 'ELIMINAR',
    accountDeleteAction: 'Eliminar mi cuenta para siempre',
    cancel: 'Cancelar',
    deleted: 'Tus datos se borraron.',
  },
  billing: {
    simulatedNotice:
      'Pagos simulados. En esta demostración no se cobra nada ni se piden datos de tarjeta.',
    // Los textos con la cuenta en la nube viven en billingCloud.ts y solo los bajan las pantallas que
    // los usan, que se cargan en diferido, así no pesan en el JavaScript inicial (B10, 5.6)
    current: (plan: string) => `Tu plan actual es ${plan}.`,
    stats: {
      plan: 'Plan',
      daily: 'Preguntas',
      dailyCaption: 'por día',
      unlimited: 'sin límite',
    },
    plans: {
      free: 'Gratis',
      founder: 'Mensual Fundador',
      founder_annual: 'Anual Fundador',
      monthly: 'Mensual',
      annual: 'Anual',
    },
    // Lo lee un lector de pantalla, que no anuncia el tachado
    regularPrice: 'Precio regular',
    promoPrice: 'Precio Fundador',
    periods: {
      free: 'para siempre',
      founder: 'al mes, de por vida',
      founder_annual: 'al año, de por vida',
      monthly: 'al mes',
      annual: 'al año',
    },
    // Con la prueba gratis el lugar se aparta al empezarla (4.6). Sin ella, al primer cobro
    founderNote: (seats: number) =>
      `Precio Fundador para los primeros ${seats}. No sube mientras conserves tu suscripción. Tu lugar se aparta al empezar tu prueba.`,
    founderNoteNoTrial: (seats: number) =>
      `Precio Fundador para los primeros ${seats}. No sube mientras conserves tu suscripción. Tu lugar se confirma al pagar.`,
    taxIncluded: 'IVA incluido.',
    // Con centavos solo cuando los hay, como un cobro con código de descuento
    price: (mxn: number) =>
      mxn === 0
        ? '$0'
        : `$${mxn.toLocaleString('es-MX', {
            minimumFractionDigits: Number.isInteger(mxn) ? 0 : 2,
            maximumFractionDigits: 2,
          })} MXN`,
    access: {
      dailyQuestions: (n: number | null) =>
        n === null ? 'Preguntas sin límite' : `${n} preguntas al día`,
      fullExam: 'Examen completo',
      aiTutor: 'Tutor con IA',
      // Apuntes y el catálogo también se comparan en la tabla de planes (B8 del plan del cambio)
      outlines: 'Apuntes que se vuelven tarjetas',
      deckCatalog: 'Mazos precargados del catálogo',
      // El mismo nombre que su candado y su tarjeta en Mazos (B8)
      importDecks: 'Subir tus mazos',
      party: 'Party con tus amigos',
    },
    included: 'Incluido',
    notIncluded: 'No incluido',
    comingSoon: 'Próximamente',
    featureNames: {
      explore: 'Buscar tarjetas',
      outlines: 'Apuntes en esquema',
      aiCards: 'Tarjetas con IA',
      overdueTools: 'Herramientas de atrasos',
      guideProfile: 'Perfil guía',
      newPerDaySuggestion: 'Sugerencia de tarjetas nuevas',
      easyDays: 'Días fáciles',
      cardTimer: 'Temporizador de tarjeta',
    },
    featureLocked: (name: string) => `Tu plan no incluye ${midSentence(name)}.`,
    featureSeePlans: 'Ver planes',
    // El botón de los candados de Gratis cuando ya existe la prueba gratis (B10, bandera freeTrial)
    freeTrialCta: 'Prueba 7 días gratis',
    savings: (percent: number) => `Ahorras ${percent}% contra 12 meses al precio regular`,
    founderSavings: (percent: number) => `Ahorras ${percent}% contra 12 meses del Fundador mensual`,
    // La línea de la prueba en la portada, con la bandera freeTrial (B10, 3.4)
    trialLine: 'Prueba 7 días gratis con tarjeta',
    choose: (plan: string) => `Elegir ${plan}`,
    currentPlan: 'Plan actual',
    checkoutTitle: 'Checkout simulado',
    checkoutSummary: (plan: string, price: string, period: string) =>
      `${plan}, ${price} ${period}.`,
    confirm: 'Confirmar pago simulado',
    back: 'Volver a los planes',
    processing: 'Procesando…',
    receiptTitle: 'Recibo simulado',
    receiptFolio: (id: string) => `Folio ${id}`,
    receiptLine: (plan: string, price: string, date: string) => `${plan} · ${price} · ${date}`,
    receiptSimulated: 'SIMULADO. Sin cobro real.',
    cancel: 'Cancelar suscripción',
    canceled: 'Tu suscripción quedó cancelada. Vuelves al plan Gratis.',
    receiptsTitle: 'Recibos',
    noReceipts: 'Todavía no tienes recibos.',
  },
  // Apuntes en esquema (D-092). Una línea con una marca se vuelve tarjeta
  notes: {
    loading: 'Cargando tus apuntes…',
    summary: {
      label: 'Tus apuntes en cifras',
      pages: 'Apuntes',
      pagesCaption: 'escritos',
      lines: 'Líneas',
      linesCaption: 'en total',
      cards: 'Tarjetas',
      cardsCaption: 'que salen de ellos',
    },
    listTitle: 'Tus apuntes',
    listLabel: 'Lista de apuntes',
    empty:
      'Todavía no tienes apuntes. Crea el primero y escribe una marca en una línea para que se vuelva tarjeta.',
    createTitle: 'Nuevo apunte',
    createBody:
      'Cada apunte tiene su propio mazo dentro de Apuntes, así sus tarjetas entran al repaso y a Buscar tarjetas.',
    titleLabel: 'Título del apunte',
    create: 'Crear apunte',
    creating: 'Creando…',
    titleEmpty: 'Escribe un título para el apunte.',
    titleTaken: 'Ya tienes un apunte con ese título.',
    createError: 'No se pudo crear el apunte. Intenta de nuevo.',
    open: (title: string) => `Abrir el apunte ${title}`,
    pageMeta: (lines: number, cards: number) =>
      `${plural(lines, 'línea', 'líneas')} · ${plural(cards, 'tarjeta', 'tarjetas')}`,
    back: 'Todos los apuntes',
    missingTitle: 'No encontramos ese apunte',
    missingBody: 'Puede que lo hayas borrado. Vuelve a la lista para elegir otro.',
    renameLabel: 'Título',
    rename: 'Cambiar título',
    renamed: 'Título cambiado.',
    renameError: 'No se pudo cambiar el título.',
    editorLabel: 'Esquema del apunte',
    // Atajos de teclado, se ven solo donde hay teclado
    keys: {
      shift: 'Mayús',
      indent: 'mete un nivel,',
      outdent: 'lo saca,',
      enter: 'crea una línea,',
      move: 'mueven la línea.',
      arrows: 'y flechas',
      escape: 'y luego',
      leave: 'sale del esquema.',
    },
    lineLabel: (n: number, level: number) => `Línea ${n}, nivel ${level}`,
    linePlaceholder: 'Escribe aquí',
    toolbar: {
      label: 'Herramientas de la línea',
      outdent: 'Sacar un nivel',
      indent: 'Meter un nivel',
      up: 'Subir',
      down: 'Bajar',
      card: 'Pregunta y respuesta',
      reverse: 'Con inversa',
      hole: 'Hueco',
      link: 'Enlace',
      tag: 'Etiqueta',
      remove: 'Borrar línea',
      add: 'Línea nueva',
    },
    badges: {
      basic: 'Tarjeta',
      basic_reverse: 'Tarjeta doble',
      cloze: (n: number) => plural(n, 'hueco', 'huecos'),
    },
    problems: {
      empty_front: 'Falta la pregunta',
      empty_back: 'Falta la respuesta',
      no_cloze: 'Falta el hueco',
      unclosed_cloze: 'Hueco sin cerrar',
      too_long: 'Demasiado largo',
    },
    collapse: (text: string) => `Ocultar lo que cuelga de ${text}`,
    expand: (text: string) => `Mostrar lo que cuelga de ${text}`,
    emptyLine: 'línea vacía',
    save: {
      saved: 'Guardado',
      saving: 'Guardando…',
      dirty: 'Cambios sin guardar',
      error: 'No se pudo guardar. Tus cambios siguen aquí.',
      retry: 'Reintentar',
      now: 'Guardar ahora',
    },
    tagsLabel: 'Etiquetas del apunte',
    tagsHint:
      'Separadas por espacio. Las heredan todas las tarjetas y los niveles van con ::, como cardio::infarto.',
    help: {
      title: 'Cómo escribir',
      summary: 'Marcas para crear tarjetas',
      items: [
        ['Pregunta :: Respuesta', 'crea una tarjeta de pregunta y respuesta.'],
        ['Término ;; Definición', 'crea la tarjeta y también su inversa.'],
        ['La {{metformina}} baja la glucosa', 'crea una tarjeta con hueco por cada par de llaves.'],
        ['#cardio::infarto', 'pone una etiqueta. Las líneas de abajo la heredan.'],
        ['[[Otro apunte]]', 'enlaza a otro apunte por su título.'],
      ] as readonly (readonly [string, string])[],
      keys: 'Tab mete un nivel, Mayús y Tab lo sacan, Enter crea una línea, Alt y flechas mueven la línea. Esc y luego Tab sale del esquema.',
      unfinished:
        'Una línea con marca incompleta no cambia la última tarjeta buena. Quitar la marca borra la tarjeta.',
    },
    links: {
      title: 'Enlaces',
      open: (title: string) => `Abrir ${title}`,
      missing: (title: string) => `Crear el apunte ${title}`,
      missingHint: (title: string) => `${title} todavía no existe`,
      backlinks: 'Apuntes que enlazan aquí',
      none: 'Este apunte no enlaza a otros todavía.',
      noBacklinks: 'Ningún otro apunte enlaza aquí.',
    },
    remove: {
      button: 'Borrar apunte',
      confirm: (title: string) => `¿Borrar "${title}" con todas sus tarjetas?`,
      yes: 'Sí, borrar',
      no: 'Cancelar',
      error: 'No se pudo borrar el apunte.',
    },
  },
  // Importar y exportar tarjetas (D-093)
  importer: {
    title: 'Sube tu mazo',
    intro:
      'Trae tus tarjetas de otra app o de un archivo. Aceptamos paquetes .apkg de Anki, CSV y TSV (Quizlet), Excel (.xlsx), Word (.docx) y esquemas en Markdown (.md) u OPML, que exportan Obsidian, Notion, Logseq, Roam y Dynalist. Tu mazo queda privado y las tarjetas empiezan como nuevas.',
    fileLabel: 'Archivo para importar',
    fileHint: 'Hasta 600 MB en un paquete y 50 MB en una hoja o un documento.',
    // El botón propio que reemplaza al del navegador, que sale en inglés (H07 de la revisión de B2)
    chooseFile: 'Elegir archivo',
    noFileChosen: 'Ningún archivo elegido',
    reading: 'Leyendo tu archivo…',
    readError: 'No se pudo leer el archivo.',
    errors: {
      too_large: 'El archivo pesa más de lo permitido o contiene demasiado al descomprimirse.',
      too_many_files: 'El paquete tiene más archivos de los permitidos.',
      unsafe_path: 'El paquete tiene rutas que no son seguras, así que no se importó.',
      corrupt: 'El archivo está dañado o no se pudo abrir.',
      unsupported:
        'Ese tipo de archivo no se puede importar. Usa .apkg, CSV, Excel (.xlsx), Word (.docx), Markdown (.md) u OPML.',
      no_collection: 'El paquete no trae una colección de Anki.',
      empty: 'El archivo no trae tarjetas.',
      too_slow:
        'El archivo tardó demasiado en leerse y se canceló. Prueba con uno más chico o divídelo en partes.',
    } as Record<string, string>,
    previewTitle: 'Esto es lo que vamos a importar',
    previewSource: (source: string, file: string) => `${source} · ${file}`,
    sources: {
      apkg: 'Paquete de Anki',
      csv: 'Texto con columnas',
      xlsx: 'Excel',
      docx: 'Word',
      markdown: 'Esquema en Markdown',
      opml: 'Esquema OPML',
    },
    kinds: { basic: 'Pregunta y respuesta', basic_reverse: 'Con inversa', cloze: 'Con huecos' },
    summary: (notes: number, decks: number) =>
      `${plural(notes, 'nota', 'notas')} en ${plural(decks, 'mazo', 'mazos')}`,
    warnings: {
      media_skipped: (n: number) =>
        `${plural(n, 'imagen o audio', 'imágenes o audios')} no se importan todavía.`,
      image_occlusion: (n: number) =>
        `${plural(n, 'nota de oclusión de imagen', 'notas de oclusión de imagen')} se importan como pregunta y respuesta, sin la máscara.`,
      extra_templates: (n: number) =>
        `${plural(n, 'nota con más de dos plantillas', 'notas con más de dos plantillas')} se importan como pregunta y respuesta.`,
      extra_columns: (n: number) =>
        `${plural(n, 'columna sin uso', 'columnas sin uso')}. Los campos de más de una nota de Anki van al reverso.`,
      deck_too_deep: (n: number) =>
        `${plural(n, 'nota está', 'notas están')} en mazos de demasiados niveles y se acomodan en el último nivel permitido.`,
      revlog_ignored: (n: number) =>
        `Los ${n.toLocaleString('es-MX')} repasos del archivo no se importan. Todas las tarjetas empiezan como nuevas.`,
      unclosed_code_fence: () =>
        'El archivo termina con un bloque de código sin cerrar, y lo que venía después no se importó. Cierra el bloque y vuelve a subirlo.',
    } as Record<string, (n: number) => string>,
    rowErrors: {
      empty_front: 'sin frente',
      empty_back: 'sin reverso',
      cloze_without_holes: 'cloze sin huecos',
      too_long: 'demasiado largo',
      too_many_notes: 'pasa el máximo de notas por archivo',
    } as Record<string, string>,
    rowErrorsTitle: (n: number) =>
      plural(n, 'fila no se puede importar', 'filas no se pueden importar'),
    rowError: (position: number | null, reason: string) =>
      position === null ? reason : `Fila ${position}, ${reason}`,
    moreErrors: (n: number) => `y ${plural(n, 'más', 'más')}`,
    sample: 'Así se ven las primeras',
    deckName: 'Nombre de tu mazo importado',
    deckNameHint:
      'Si ya tienes un mazo importado con este nombre, las tarjetas nuevas se suman a él.',
    rights: 'Tengo derecho a usar este contenido',
    rightsHint: 'Solo importa material tuyo o que tengas permiso de usar.',
    rightsRequired: 'Confirma que tienes derecho a usar este contenido.',
    nameRequired: 'Escribe un nombre para el mazo.',
    import: (n: number) => `Importar ${plural(n, 'nota', 'notas')}`,
    importing: 'Importando…',
    cancel: 'Elegir otro archivo',
    saveError:
      'No se pudo guardar la importación. Lo que ya se guardó no se repite al intentar de nuevo.',
    nothing: 'No hay nada que importar. Revisa las filas con problemas.',
    doneTitle: 'Importación lista',
    done: (notes: number, cards: number) =>
      `${plural(notes, 'nota importada', 'notas importadas')} con ${plural(cards, 'tarjeta', 'tarjetas')}.`,
    doneDuplicates: (n: number) =>
      `${plural(n, 'nota ya estaba y se omitió', 'notas ya estaban y se omitieron')}.`,
    doneRepaired: (n: number) =>
      `${plural(n, 'tarjeta faltante se completó', 'tarjetas faltantes se completaron')}.`,
    doneRejected: (n: number) => `${plural(n, 'fila quedó fuera', 'filas quedaron fuera')}.`,
    again: 'Importar otro archivo',
    help: {
      title: 'Cómo preparar tu archivo',
      summary: 'Columnas, encabezados y marcas',
      items: [
        'En CSV y Excel, la primera fila puede ser el encabezado. Entendemos Frente, Reverso, Texto, Extra, Etiquetas, Mazo, Tipo e ID, también en inglés.',
        'Sin encabezado, la columna 1 es el frente, la 2 el reverso y la 3 las etiquetas.',
        'Un CSV de Anki con sus líneas que empiezan con # también se entiende, con el tipo de nota, el mazo y el identificador.',
        'En Word, cada fila de una tabla con dos columnas o más es una tarjeta, y los párrafos con Pregunta :: Respuesta, Término ;; Definición o {{huecos}} también. Los títulos pasan a etiquetas.',
        'Con un identificador por fila, volver a importar el mismo archivo no duplica nada.',
      ],
    },
  },
  exporter: {
    title: 'Exporta tus tarjetas',
    intro:
      'Descarga lo que creaste o importaste en un CSV con encabezados y un identificador por nota. Si lo vuelves a importar no se duplica, y Anki lo entiende.',
    deckLabel: 'Qué exportar',
    all: 'Todos mis mazos',
    button: 'Descargar CSV',
    working: 'Preparando…',
    done: (notes: number, file: string) =>
      `${plural(notes, 'nota exportada', 'notas exportadas')} en ${file}.`,
    empty: 'No hay notas tuyas para exportar todavía.',
    error: 'No se pudo preparar el archivo. Intenta de nuevo.',
    noDecks: 'Crea o importa un mazo para poder exportarlo.',
  },
  // Tarjetas con IA desde un texto o PDF del alumno (D-085)
  aiCards: {
    title: 'Crea tarjetas con IA',
    intro:
      'Pega un texto o sube un PDF. La IA propone tarjetas y cada una trae la frase exacta de tu material que la respalda. Todo queda en borrador y sin validar por un médico hasta que lo revises.',
    modes: {
      template: 'IA simulada. Las tarjetas salen de reglas y no de un modelo de IA.',
      real: 'IA conectada.',
    },
    left: (n: number, perDay: number) =>
      n === 0
        ? `Ya usaste tus ${perDay} generaciones de hoy. Vuelven mañana a las 4 a. m.`
        : `Te quedan ${plural(n, 'generación', 'generaciones')} hoy de ${perDay}.`,
    textLabel: 'Texto de tu material',
    textHint:
      'Pega apuntes, un resumen o un fragmento de guía. Los datos personales se ocultan antes de procesarlo.',
    fileLabel: 'O sube un PDF o un archivo de texto',
    fileHint: 'Un PDF debe tener texto que se pueda seleccionar. Los escaneados todavía no.',
    chooseFile: 'Elegir archivo',
    noFileChosen: 'Ningún archivo elegido',
    sourceName: 'Nombre de la fuente',
    sourceNameHint: 'Se guarda en cada tarjeta para que sepas de dónde salió.',
    defaultSource: 'Texto pegado',
    readingFile: 'Leyendo el archivo…',
    fileErrors: {
      too_large: 'El PDF pesa demasiado o tiene demasiadas páginas.',
      corrupt: 'El archivo está dañado o no se pudo leer.',
      no_text:
        'Este PDF no tiene texto que se pueda seleccionar, probablemente es un escaneo. Todavía no lo sabemos leer.',
      empty: 'El archivo no trae texto.',
    } as Record<string, string>,
    pdfTruncated: 'El PDF era muy largo y se leyó solo una parte.',
    generate: 'Generar tarjetas',
    generating: 'Generando…',
    textRequired: 'Escribe o pega un texto, o sube un archivo.',
    textTooShort: 'El texto es muy corto para proponer tarjetas.',
    limitReached: 'Ya usaste tus generaciones de hoy.',
    error: 'No se pudieron generar las tarjetas. Intenta de nuevo.',
    resultTitle: 'Tarjetas propuestas',
    resultSummary: (n: number, sections: number) =>
      `${plural(n, 'tarjeta propuesta', 'tarjetas propuestas')} de ${plural(sections, 'sección', 'secciones')}.`,
    scrubbed: (n: number) =>
      `Se ocultaron ${plural(n, 'dato personal', 'datos personales')} antes de procesar el texto.`,
    rejected: (n: number) =>
      `${plural(n, 'propuesta se descartó', 'propuestas se descartaron')} porque no pasaron la revisión contra tu texto. No se te muestran.`,
    cut: (n: number) =>
      `Se procesaron solo las primeras ${plural(n, 'sección', 'secciones')} del texto.`,
    fellBack: 'La IA no respondió y se usó el modo simulado.',
    nothing:
      'No salieron tarjetas de este texto. Prueba con un texto más largo y con datos concretos, como definiciones, dosis o criterios.',
    draftLabel: 'Borrador, no validada por médico',
    kinds: { basic: 'Pregunta y respuesta', cloze: 'Con huecos' },
    quote: 'Frase de tu material que la respalda',
    front: 'Frente',
    back: 'Reverso',
    section: (title: string) => `Sección ${title}`,
    duplicate: 'Ya tienes una tarjeta igual o muy parecida.',
    select: (n: number) => `Elegir la tarjeta ${n}`,
    selectAll: 'Elegir todas',
    selectNone: 'Quitar todas',
    edit: 'Editar',
    editedIssues: 'Tu edición agrega algo que la frase no dice. Revísalo.',
    save: (n: number) => `Guardar ${plural(n, 'tarjeta', 'tarjetas')} en borrador`,
    saving: 'Guardando…',
    saveError: 'No se pudieron guardar las tarjetas. Intenta de nuevo.',
    savedTitle: 'Tarjetas guardadas',
    saved: (n: number, flagged: number) =>
      flagged > 0
        ? `${plural(n, 'tarjeta guardada', 'tarjetas guardadas')} en Tarjetas con IA, ${plural(flagged, 'con señal de controversia', 'con señal de controversia')}.`
        : `${plural(n, 'tarjeta guardada', 'tarjetas guardadas')} en Tarjetas con IA.`,
    again: 'Generar con otro texto',
    seeInExplore: 'Verlas en Buscar tarjetas',
    rules:
      'La IA nunca cambia tu texto ni corrige. Si algo le parece dudoso lo señala con una explicación y fuentes, y tú decides.',
  },
  // Señal de controversia de la IA (D-085)
  controversy: {
    title: 'La IA marcó una posible controversia',
    simulated: 'Señal del modo simulado',
    notChanged: 'La IA no cambió esta tarjeta. Solo la señala para que la revises.',
    sources: 'Revisa en',
    verify: 'Ya lo verifiqué',
    verified: 'Señal quitada. Quedó registrado que la verificaste.',
    edit: 'Editar la tarjeta',
    error: 'No se pudo quitar la señal. Intenta de nuevo.',
    badge: 'Con señal de la IA',
    editHint: 'Si editas la tarjeta, la señal también se quita.',
  },
  decks: {
    emptyBranches: (names: string) => `Todavía sin mazos en ${names}.`,
    preloadedTitle: 'Mazos precargados',
    preloadedDescription: 'Mazos de muestra que puedes seguir o dejar.',
    author: (name: string) => `De ${name}, compartido con su autorización`,
    summary: {
      label: 'Tus mazos en cifras',
      followed: 'Mazos',
      followedCaption: 'que sigues',
      seen: 'Vistas',
      seenCaption: 'tarjetas',
      total: 'Tarjetas',
      totalCaption: 'en tus mazos',
    },
    stats: (notes: number, media: number) =>
      `${plural(notes, 'nota', 'notas')} · ${plural(media, 'imagen', 'imágenes')}`,
    progress: (studied: number, total: number) =>
      `${studied.toLocaleString('es-MX')} de ${total.toLocaleString('es-MX')} tarjetas vistas`,
    follow: 'Seguir mazo',
    following: 'Siguiendo',
    unfollow: 'Dejar de seguir',
    adding: 'Agregando…',
    loading: 'Cargando mazos…',
    noDecksInBranch: 'Sin mazos todavía en esta rama.',
    topicsTitle: 'Temas del mazo',
    yoursTitle: 'Tus mazos',
    importTitle: 'Sube tu mazo',
    importBody:
      'Pronto podrás subir tus mazos desde otras apps de tarjetas, Word, Excel o CSV. Tus mazos serán privados.',
    parentLabel: 'Dentro de',
    topLevel: 'Primer nivel',
    inside: (path: string) => `Dentro de ${path}`,
    organize: 'Organizar',
    organizeLabel: (name: string) => `Organizar el mazo ${name}`,
    renameLabel: 'Nuevo nombre del mazo',
    rename: 'Cambiar nombre',
    renamed: 'Nombre cambiado.',
    moveLabel: 'Mover dentro de',
    move: 'Mover mazo',
    moved: 'Mazo movido.',
    moveErrors: {
      missing: 'Ese mazo ya no existe.',
      self: 'Un mazo no puede ir dentro de sí mismo.',
      cycle: 'No puedes meter un mazo dentro de uno de sus propios submazos.',
      too_deep: 'Ya son demasiados niveles de mazos.',
    },
    organizeError: 'No se pudo guardar el cambio. Intenta de nuevo.',
    createTitle: 'Crear mazo',
    createBody: 'Escribe tus propias tarjetas. Son privadas y solo las ves tú.',
    nameLabel: 'Nombre del mazo',
    createButton: 'Crear mazo',
    creating: 'Creando…',
    nameError: 'Escribe un nombre para el mazo.',
    createError: 'No se pudo crear el mazo. Intenta de nuevo.',
    editCards: 'Editar tarjetas',
    deleteDeck: 'Eliminar mazo',
    confirmDelete: (name: string) => `¿Eliminar ${name} con todas sus tarjetas?`,
    confirmDeleteOutlines: (n: number) =>
      n === 1
        ? 'Hay un apunte en este mazo. El apunte no se borra, pero sus tarjetas sí. Después pásalo a otro mazo desde el apunte y las tarjetas regresan.'
        : `Hay ${String(n)} apuntes en este mazo. Los apuntes no se borran, pero sus tarjetas sí. Después pásalos a otro mazo desde cada apunte y las tarjetas regresan.`,
    confirmDeleteYes: 'Sí, eliminar',
    confirmDeleteNo: 'Cancelar',
    deleteError: 'No se pudo eliminar el mazo. Intenta de nuevo.',
    editor: {
      title: (name: string) => `Tarjetas de ${name}`,
      description:
        'Agrega, edita o borra las tarjetas de este mazo. Aparecen en Repasar al guardarlas.',
      close: 'Cerrar',
      kind: 'Tipo de tarjeta',
      basic: 'Básica',
      basicReverse: 'Básica con tarjeta inversa',
      cloze: 'Con huecos (cloze)',
      // Cada tipo con un ejemplo, para que se entienda sin haber usado Anki (V4-B3). Los ejemplos no son
      // de medicina a propósito, porque ningún texto médico sale sin la validación de un médico
      kindHelp: {
        basic:
          'Una pregunta y su respuesta. Genera una carta. Por ejemplo, ¿Qué es la repetición espaciada? Repasar justo antes de olvidar.',
        basic_reverse:
          'Un frente y un reverso. Genera dos cartas, una que pregunta el frente y otra que pregunta el reverso. Sirve para lo que quieres reconocer en los dos sentidos, como un término y su definición.',
        cloze:
          'Un texto con huecos que se ocultan al repasar. Genera una carta por cada número de hueco. Por ejemplo, Studiare usa {{c1::repetición espaciada}} para decidir {{c2::cuándo}} repasas cada tarjeta.',
      },
      front: 'Pregunta',
      back: 'Respuesta',
      reverseFront: 'Frente',
      reverseBack: 'Reverso',
      text: 'Texto con huecos',
      clozeHint:
        'Pon cada respuesta entre llaves, como {{c1::respuesta}}, y una pista al final, como {{c1::respuesta::pista}}. Un hueco puede ir dentro de otro, por ejemplo {{c1::El {{c2::ventrículo izquierdo}} bombea a la aorta}}. En la carta c1 se oculta todo el hueco y en la c2 solo el ventrículo izquierdo.',
      extra: 'Nota extra (opcional)',
      add: 'Agregar tarjeta',
      save: 'Guardar tarjeta',
      saveChanges: 'Guardar cambios',
      cancel: 'Cancelar',
      saved: 'Tarjeta guardada.',
      saveError: 'No se pudo guardar la tarjeta. Intenta de nuevo.',
      listTitle: (n: number) => (n === 1 ? '1 tarjeta' : `${n.toLocaleString('es-MX')} tarjetas`),
      empty: 'Este mazo todavía no tiene tarjetas.',
      edit: 'Editar',
      delete: 'Borrar',
      editNote: (preview: string) => `Editar la tarjeta ${preview}`,
      deleteNote: (preview: string) => `Borrar la tarjeta ${preview}`,
      cards: (n: number) => (n === 1 ? '1 carta' : `${n} cartas`),
      errors: {
        empty_front: 'Escribe la pregunta.',
        empty_back: 'Escribe la respuesta.',
        empty_text: 'Escribe el texto de la tarjeta.',
        no_cloze: 'Agrega al menos un hueco, como {{c1::respuesta}}.',
        unclosed_cloze:
          'Un hueco no está completo. Cada uno lleva la forma {{c1::respuesta}}, con su respuesta y sus dos llaves de cierre.',
        too_long: 'El texto es demasiado largo. Divídelo en dos tarjetas.',
      },
    },
    yourCards: (n: number) => (n === 1 ? '1 tarjeta' : `${n.toLocaleString('es-MX')} tarjetas`),
  },
  planner: {
    noDecksBody: 'Sin mazos el plan solo trae práctica de preguntas. Sigue uno para sumar repasos.',
    limitNote: (limit: number) =>
      `Tu plan Gratis deja ${limit} preguntas al día, así que el bloque de práctica se recortó a lo que te permite.`,
    overloadTitle: 'Tu carga no cabe en tu tiempo',
    overloadBody: (needed: number, available: number) =>
      `Los próximos 7 días piden en promedio ${needed} min al día y tienes ${available}. Elige un ajuste.`,
    reduceNew: (value: number, effect: number) =>
      `Baja las tarjetas nuevas a ${value} por día. Libera unos ${effect} min al día.`,
    raiseMinutes: (value: number, effect: number) =>
      `Sube tu tiempo a ${value} min al día. Son ${effect} min más que ahora.`,
    apply: 'Aplicar',
    applied: 'Listo, el plan ya usa ese cambio.',
    minutesTitle: 'Tu tiempo al día',
    minutesMeasured: (days: number, average: number) =>
      `Usamos tu promedio real de ${plural(days, 'día', 'días')} de estudio, ${average} min al día.`,
    minutesDeclared: (minutes: number) => `Usamos los ${minutes} min que declaraste.`,
    minutesRealAverage: (days: number, average: number) =>
      `Tu promedio real de ${plural(days, 'día', 'días')} de estudio es ${average} min.`,
    minutesRealSoon: 'Si no declaras minutos, con 3 días de estudio usaremos tu promedio real.',
    minutesProvisional: (minutes: number) =>
      `Mientras calibramos, el plan usa ${minutes} min al día. Puedes poner los tuyos aquí.`,
    minutesUnit: 'días de estudio',
    minutesLabel: 'Minutos que puedes estudiar al día',
    minutesSave: 'Guardar',
    minutesSaved: 'Guardado',
    minutesUseReal: 'Usar mi promedio real',
    minutesError: 'Escribe un número entre 5 y 720.',
    weekTitle: 'Esta semana',
    today: 'Hoy',
    tomorrow: 'Mañana',
    reviewsShort: (n: number) => plural(n, 'repaso', 'repasos'),
    newShort: (n: number) => plural(n, 'nueva', 'nuevas'),
    questionsShort: (n: number) => plural(n, 'pregunta', 'preguntas'),
    challengeShort: 'reto',
    emptyDay: 'Sin carga',
    dayMinutes: (planned: number, available: number) => `${planned} de ${available} min`,
  },
  review: {
    noDecksTitle: 'Todavía no sigues ningún mazo',
    noDecksBody: 'Sigue un mazo precargado para empezar a repasar.',
    goToDecks: 'Ir a Mazos',
    allSuspendedTitle: 'Todas tus tarjetas están suspendidas',
    allSuspendedBody:
      'No hay nada que repasar porque suspendiste todas las tarjetas de tus mazos. Reanúdalas desde Buscar tarjetas.',
    goToExplore: 'Ir a Buscar tarjetas',
    doneTitle: 'Terminaste por hoy',
    doneBody: (cards: number, xp: number) =>
      `Repasaste ${plural(cards, 'tarjeta', 'tarjetas')} y ganaste ${xp.toLocaleString('es-MX')} XP.`,
    nothingDue:
      'No tienes tarjetas pendientes por ahora. Vuelve mañana o sube tu límite de tarjetas nuevas al elegir qué repasar.',
    remaining: (reviews: number, fresh: number) =>
      `Quedan ${plural(reviews, 'repaso', 'repasos')} y ${plural(fresh, 'nueva', 'nuevas')}`,
    newCard: 'Nueva',
    reviewCard: 'Repaso',
    confidenceQuestion: '¿Qué tan seguro estás antes de ver la respuesta?',
    confidence: { dont_know: 'No lo sé', unsure: 'Dudo', sure: 'Seguro' },
    show: 'Mostrar respuesta',
    rateQuestion: '¿Qué tan bien la recordaste?',
    ratings: { again: 'Otra vez', hard: 'Difícil', good: 'Bien', easy: 'Fácil' },
    interval: (text: string) => `en ${text}`,
    minutes: (n: number) => `${n} min`,
    hours: (n: number) => `${n} h`,
    days: (n: number) => (n === 1 ? '1 día' : `${n} días`),
    causeQuestion: '¿Por qué crees que fallaste?',
    // Los siete motivos de Ricardo, en su orden (B5, 4.23 del plan del cambio)
    causes: causeNames,
    skipCause: 'Omitir',
    // Atajos de teclado. Se ven solo donde hay teclado (D-087)
    keys: {
      space: 'Espacio',
      show: 'muestra la respuesta',
      rate: 'califican',
      good: 'es Bien',
      cause: 'eligen el motivo',
      skip: 'omite',
      confidence: 'eligen tu seguridad',
    },
    finish: 'Terminar sesión',
    xpGained: (xp: number) => `+${xp} XP`,
    deck: (name: string) => `Mazo ${name}`,
    errorCard: 'Error de pregunta',
    // La sesión de repaso al estilo de la portada (D-150). Avance arriba, la tarjeta en crema y a un
    // lado lo que llevas, el Pomodoro y las acciones sobre la tarjeta
    progress: (n: number, of: number) =>
      `Tarjeta ${n.toLocaleString('es-MX')} de ${of.toLocaleString('es-MX')}`,
    progressLabel: 'Avance de la sesión',
    overdueSince: (days: number) => `Vencida hace ${plural(days, 'día', 'días')}`,
    answer: 'Respuesta',
    // La frase literal que respalda una tarjeta generada (4.1), con su título si lo trae
    sourceBank: 'Fuente del banco.',
    sourceLabel: 'Fuente.',
    sessionStats: {
      title: 'Esta sesión',
      done: 'hechas',
      good: 'bien',
      again: 'otra vez',
      elapsed: (minutes: number) =>
        minutes < 1
          ? 'Llevas menos de un minuto.'
          : `Llevas ${plural(minutes, 'minuto', 'minutos')}.`,
      estimate: (minutes: number) =>
        minutes < 1
          ? 'A este ritmo terminas en menos de un minuto.'
          : `A este ritmo terminas en ${minutes.toLocaleString('es-MX')} más.`,
    },
    actions: {
      title: 'Acciones',
      edit: 'Editar esta tarjeta',
      outline: 'Ver el apunte del tema',
    },
    // Tres contadores como en Anki. Siempre con texto, nunca solo con color (D-085, fila 8)
    counters: {
      label: 'Lo que falta de la sesión',
      new: 'Nuevas',
      learning: 'Aprendizaje',
      review: 'Programadas',
      current: 'La tarjeta de ahora cuenta aquí',
    },
    timer: {
      label: 'Tiempo sugerido',
      left: (seconds: number) => `${seconds} s`,
      expired: 'Se acabó el tiempo sugerido. Contesta con lo que recuerdes.',
    },
    leech: {
      badge: 'Sanguijuela',
      title: 'Esta tarjeta es una sanguijuela',
      body: (lapses: number) =>
        `La olvidaste ${plural(lapses, 'vez', 'veces')}. Seguir repasándola así gasta tiempo sin enseñarte. Conviene cambiarla.`,
      suggestionsTitle: 'Qué puedes hacer',
      suggestions: {
        split: 'Divídela en tarjetas más chicas, una sola idea en cada una.',
        shorten: 'Acórtala y deja solo el dato que quieres recordar.',
        context: 'Dale más contexto al hueco para que se entienda qué se pregunta.',
        rewrite:
          'Reescríbela con tus palabras, o agrégale un ejemplo o una imagen que la haga fácil de recordar.',
      },
      suspend: 'Suspender',
      edit: 'Editar tarjeta',
      keep: 'Seguir con ella',
      suspended: 'Tarjeta suspendida. La reanudas desde Buscar tarjetas.',
      cannotEdit:
        'Esta tarjeta no es de un mazo hecho por ti y no se edita desde aquí. Puedes suspenderla o seguir con ella.',
      keys: {
        suspend: 'suspende',
        edit: 'edita',
        keep: 'sigue',
      },
    },
  },
  // Tarjetas que salen de las preguntas falladas (7.1). El texto sale del banco, aquí solo van las
  // etiquetas que lo acompañan
  errorCards: {
    deckName: 'Mis errores',
    deckDescription: 'Las preguntas que fallaste en práctica y en examen, listas para repasar.',
    correctAnswer: 'Respuesta correcta',
    yourChoice: 'Elegiste',
    leftBlank: 'La dejaste en blanco.',
    whyAttracts: 'Por qué atrae',
    contrastTitle: 'Distingue estas dos respuestas',
    contrastAsk: '¿Qué las diferencia?',
  },
  simulator: {
    setupTitle: 'Configura tu práctica',
    stats: {
      label: 'Preguntas para tu práctica',
      available: 'Disponibles',
      availableCaption: 'con estos filtros',
      today: 'Hoy',
      todayCaption: 'te quedan en tu plan',
      unlimited: 'Sin límite',
      bank: 'Banco',
      bankCaption: 'preguntas en total',
    },
    bankNote: (n: number) => `Banco de demostración con ${plural(n, 'pregunta', 'preguntas')}.`,
    branches: 'Ramas',
    difficulty: 'Dificultad',
    difficulties: {
      all: 'Todas',
      easy: 'Fácil (1 a 2)',
      medium: 'Media (3)',
      hard: 'Difícil (4 a 5)',
    },
    structure: 'Estructura',
    structures: {
      all: 'Todas',
      negative: 'Solo negativas o de excepción',
      affirmative: 'Solo afirmativas',
    },
    count: 'Preguntas',
    available: (n: number) =>
      `${plural(n, 'pregunta disponible', 'preguntas disponibles')} con estos filtros`,
    limit: (left: number) =>
      `Te quedan ${plural(left, 'pregunta', 'preguntas')} hoy en el plan Gratis`,
    limitReached: 'Llegaste al límite de preguntas de hoy del plan Gratis.',
    limitUsedByExam:
      'Tu examen sin terminar tiene apartadas las preguntas que te quedaban hoy en el plan Gratis.',
    goToOpenExam: 'Ir a mi examen',
    seePlans: 'Ver planes',
    start: 'Empezar simulador',
    preparing: 'Preparando el banco…',
    noQuestions: 'No hay preguntas con estos filtros.',
    progress: (n: number, of: number) => `Pregunta ${n} de ${of}`,
    caseLabel: 'Caso clínico',
    options: 'Opciones',
    confidenceQuestion: '¿Qué tan seguro estás?',
    confidence: { guessed: 'Adiviné', unsure: 'Dudé', sure: 'Seguro' },
    answer: 'Responder',
    answerAndNext: 'Responder y seguir',
    answerAndFinish: 'Responder y ver el resumen',
    // Atajos de teclado. Se ven solo donde hay teclado (D-087)
    keys: {
      choose: 'eligen',
      shift: 'Mayús',
      letter: 'la letra',
      discard: 'descarta',
      answer: 'responde',
      doubleClick: 'Un doble clic en una opción también responde.',
      next: 'sigue',
    },
    elapsed: (time: string) => `Tiempo ${time}`,
    correct: 'Correcto',
    incorrect: 'Incorrecto',
    yourAnswer: 'Tu respuesta',
    correctAnswer: 'Respuesta correcta',
    whyAttracts: 'Por qué atrae esta opción',
    biasLabel: (name: string) => `Trampa probable. ${name}`,
    explanation: 'Explicación',
    references: 'Referencias, por verificar',
    next: 'Siguiente pregunta',
    finish: 'Ver resumen',
    report: 'Reportar un error en esta pregunta',
    reported: 'Gracias. Tu reporte quedó guardado para revisión médica.',
    reportReasons: {
      clinical_error: 'Error clínico',
      wrong_key: 'La respuesta marcada no es la correcta',
      typo: 'Errata',
      outdated: 'Información desactualizada',
      other: 'Otro',
    },
    sendReport: 'Enviar reporte',
    review: 'Tus respuestas',
    reviewHintEnd:
      'Aquí está la retroalimentación de cada pregunta. Abre una para ver la explicación, por qué atraía la opción que elegiste y qué podías descartar. Las falladas ya están abiertas.',
    reviewHintEach: 'Abre una pregunta para volver a ver su retroalimentación.',
    reviewFilter: 'Qué preguntas ver',
    reviewFilters: { all: 'Todas', failed: 'Falladas' },
    byConfidence: 'Exactitud según tu confianza',
    abandon: 'Terminar ahora',
    noActive: 'No hay una práctica en curso.',
    goSetup: 'Configurar práctica',
    summaryTitle: 'Resumen de la sesión',
    summaryLabels: {
      accuracy: 'Aciertos',
      xp: 'XP',
      xpCaption: 'ganados',
      time: 'Tiempo',
      timeCaption: 'total',
    },
    summaryAccuracy: (correct: number, total: number) => `${correct} de ${total} correctas`,
    summaryXp: (xp: number) => `${xp.toLocaleString('es-MX')} XP ganados`,
    summaryTime: (time: string) => `Tiempo total ${time}`,
    summaryErrors: (n: number) =>
      `${plural(n, 'error pasó', 'errores pasaron')} a tu repaso en Mis errores`,
    sentToReview: 'Esta pregunta pasó a tu repaso en Mis errores.',
    again: 'Otra práctica',
    discardReview: {
      title: 'Qué podías descartar',
      hint: 'Aunque no sepas la respuesta, descartar lo que sabes que no es te acerca a ella.',
      discardedCorrect:
        'Descartaste la respuesta correcta. Antes de tachar una opción, busca por qué sería incorrecta.',
      allDiscarded: 'Descartaste todas las opciones incorrectas. Así se llega a la respuesta.',
      someDiscarded: (done: number, total: number) =>
        `Descartaste ${done} de ${total} opciones incorrectas. Estas eran las que se podían tachar.`,
      noneDiscarded: 'No descartaste ninguna. Estas se podían tachar, y cada una dice por qué.',
      youDiscarded: 'La descartaste',
    },
    targeted: {
      label: 'Dirigir las opciones a mis trampas',
      hint: (names: string) =>
        `Sube las opciones con las trampas que más te atrapan, ${names}. Nunca llena toda la pregunta con ellas.`,
      unit: 'errores con trampa etiquetada',
      calibrating:
        'Se activa cuando tus errores ya muestran qué trampas te atrapan más. Mientras tanto las opciones salen variadas.',
      none: 'Ninguna trampa se destaca todavía en tus errores, así que las opciones salen variadas.',
      loading: 'Revisando tus errores…',
    },
    // Armar el simulador como en el diseño de D-150. Un solo formulario con el modo, las ramas, las
    // preguntas y el tiempo, el lateral con lo que entrena y las últimas sesiones
    hero: {
      title: 'Arma tu simulador',
      lead: 'Como el examen real, con preguntas imperfectas a propósito y la presión del reloj.',
    },
    mode: {
      legend: 'Modo',
      practice: 'Práctica',
      practiceEach: 'Retroalimentación después de cada pregunta.',
      practiceEnd: 'Retroalimentación al final de la sesión.',
      exam: 'Examen',
      examDescription: 'Todo al final, con reloj y avisos de tiempo.',
      targeted: 'Dirigido',
      targetedDescription: 'Más preguntas con los sesgos que te atrapan.',
    },
    branchesExam:
      'El examen reparte las preguntas con los pesos del ENARM por rama, así que aquí las ramas no se eligen.',
    branchChip: (branch: string, on: number, of: number) =>
      `${branch}, ${on} de ${of} subespecialidades`,
    moreFilters: 'Subespecialidades y filtros',
    moreSettings: 'Más ajustes',
    freeNote: (limit: number, left: number) =>
      `El plan Gratis permite ${plural(limit, 'pregunta', 'preguntas')} al día. Hoy te ${left === 1 ? 'queda' : 'quedan'} ${left}.`,
    time: {
      legend: 'Tiempo',
      none: 'Sin reloj',
      enarm: 'Ritmo ENARM',
      noneNote:
        'La práctica no lleva reloj. Se mide tu tiempo en cada pregunta y lo ves en el resumen. El reloj va con el modo Examen.',
      enarmNote: (seconds: number) =>
        `Ritmo ENARM da ${seconds} segundos por pregunta, con reloj y avisos de tiempo.`,
    },
    summary: (questions: number, branches: number, minutes: number | null) =>
      `${plural(questions, 'pregunta', 'preguntas')} · ${plural(branches, 'rama', 'ramas')} · ${minutes === null ? 'sin reloj' : plural(minutes, 'minuto', 'minutos')}`,
    trains: {
      title: 'Con qué te entrena este simulador',
      targeted: (name: string) =>
        `Más opciones con ${midSentence(name)}, la trampa que más te atrapa`,
      targetedCalibrating: (have: number, need: number) =>
        `Las opciones dirigidas a tus trampas se activan con ${need} errores con trampa etiquetada. Llevas ${have}.`,
      targetedNone: 'Ninguna trampa se destaca todavía, así que las opciones salen variadas',
      feedbackEach: 'Retroalimentación después de cada pregunta, para corregir al momento',
      feedbackEnd: 'Retroalimentación al final, para sostener la concentración como en el examen',
      adaptive: 'Preguntas cerca de tu nivel, elegidas con la dificultad calibrada',
      discard: 'Descartar opciones con Mayús y la letra, para contestar aun lo que no sabes',
      clock: (seconds: number) => `Reloj con el ritmo del ENARM, ${seconds} segundos por pregunta`,
      alerts: 'Avisos a la mitad, con 10, 5 y 1 minuto, y si vas atrasado',
      noAlerts: 'Sin avisos de tiempo, solo el reloj, como lo pediste',
      imperfect: 'Reactivos con datos oscuros y de control, como en el examen',
    },
    recent: {
      title: 'Últimas sesiones',
      empty: 'Todavía no hay sesiones. La primera aparece aquí cuando la termines.',
      item: (mode: string, items: number) => `${mode} · ${plural(items, 'pregunta', 'preguntas')}`,
      meta: (day: string, minutes: number) => `${day} · ${plural(minutes, 'minuto', 'minutos')}`,
      modes: {
        practice: 'Práctica',
        targeted: 'Dirigido',
        exam: 'Examen',
        challenge: 'Duelo',
      },
      yesterday: 'Ayer',
      unscored: 'Sin calificar',
      accuracy: (correct: number, items: number) => `${correct} de ${items} correctas`,
      seeAll: 'Ver todas en Progreso',
    },
  },
  appearance: {
    title: 'Apariencia',
    description: 'Hazla tuya. Ves los cambios al momento y se quedan cuando guardas.',
    font: 'Fuente de lectura',
    sample: 'Así se verá tu texto',
    fonts: {
      jakarta: ['Moderna', 'La de Studiare, clara y amable'],
      atkinson: ['Hiperlegible', 'Diseñada para leer sin confundir letras'],
      lexend: ['Lectura fácil', 'Más espacio entre letras, cansa menos'],
      serif: ['Clásica', 'Con serifas, como un libro de texto'],
    },
    size: 'Tamaño del texto',
    sizes: { sm: 'Chico', md: 'Normal', lg: 'Grande', xl: 'Muy grande' },
    motion: 'Movimiento y sonido',
    animations: 'Animaciones',
    animationsHint: 'Si tu sistema pide reducir movimiento, se respetará siempre.',
    confetti: 'Confeti al ganar',
    sounds: 'Sonidos al ganar y del Pomodoro',
    tryIt: 'Probar celebración',
    save: 'Guardar cambios',
    discard: 'Descartar cambios',
    unsaved: 'Tienes cambios sin guardar.',
    saved: 'Apariencia guardada.',
    discarded: 'Volvimos a lo que tenías guardado.',
  },
  admin: {
    stats: {
      label: 'Cuentas por rol',
      students: 'Alumnos',
      physicians: 'Médicos',
      staff: 'Equipo',
    },
    notice:
      'Sin la nube conectada trabajas sobre las cuentas de este navegador. Con Supabase estas mismas reglas las aplica el servidor y cada cambio queda en la bitácora de auditoría.',
    role: 'Rol',
    noEmail: 'Sin correo',
    roleChanged: (alias: string, role: string) => `${alias} ahora es ${role}.`,
    denied: {
      not_admin: 'Solo un admin o el dueño pueden cambiar roles.',
      self: 'Nadie cambia su propio rol.',
      owner_not_assignable: 'El rol de dueño no se asigna desde la app.',
      cannot_remove_owner: 'Nadie puede quitar al dueño.',
      only_owner_manages_admins: 'Solo el dueño nombra o quita admins.',
    },
    // Con la cuenta de la nube conectada la lista son las cuentas reales de Supabase (D-108)
    cloud: {
      notice:
        'Estas son las cuentas reales de Supabase. Cada cambio de rol lo aplica el servidor con sus reglas y queda en la bitácora de auditoría. Nombrar o quitar admins es solo del dueño.',
      search: 'Buscar por alias o correo',
      searchAction: 'Buscar',
      roleFilter: 'Filtrar por rol',
      roleOf: (alias: string) => `Rol de ${alias}`,
      allRoles: 'Todos los roles',
      count: (n: number) => `${n.toLocaleString('es-MX')} cuentas`,
      pageOf: (page: number, pages: number) => `Página ${page} de ${pages}`,
      previous: 'Anterior',
      next: 'Siguiente',
      loading: 'Cargando las cuentas…',
      empty: 'Ninguna cuenta coincide con esa búsqueda.',
      joined: (date: string) => `Se registró el ${date}`,
      plan: (plan: string) => `Plan ${plan}`,
      assignmentsNote:
        'Asignar preguntas a un médico llega cuando el banco viva en la nube. Hasta entonces las asignaciones solo existen en el navegador donde se hicieron.',
      errors: {
        not_admin:
          'Tu cuenta no es admin ni dueño en el servidor, así que no puede ver las cuentas.',
        no_session: 'Tu sesión en la nube venció. Entra otra vez con tu correo.',
        network: 'No hay conexión con el servidor. Inténtalo de nuevo.',
        unknown:
          'El servidor no pudo contestar. Puede faltar aplicar la novena migración de Supabase.',
      },
      roleErrors: {
        no_session: 'Tu sesión en la nube venció. Entra otra vez con tu correo.',
        network: 'No hay conexión con el servidor. No se cambió nada.',
        unknown: 'El servidor no pudo cambiar el rol. No se cambió nada.',
      },
    },
    assignedCount: (n: number) =>
      n === 0 ? 'Sin preguntas asignadas' : `${n.toLocaleString('es-MX')} preguntas asignadas`,
    assign: 'Asignar preguntas',
    assignTitle: (alias: string) => `Qué revisa ${alias}`,
    assignHint:
      'Elige subespecialidades. Se le asignan todas sus preguntas y solo verá esas en su banco.',
    saveAssignment: 'Guardar asignación',
    assigned: (alias: string, added: number, removed: number) =>
      `Asignación de ${alias} guardada. ${added} nuevas y ${removed} retiradas.`,
  },
  landing: landingText,
  account: {
    email: 'Correo electrónico',
    emailHint:
      'Con él entras a tu cuenta y te llegan tus recibos. Nunca se comparte ni viaja a la IA.',
    emailError: 'Escribe un correo válido, por ejemplo nombre@correo.com.',
    emailTaken: 'Ya hay una cuenta con ese correo en este navegador. Entra con él.',
    detailsTitle: 'Cuéntanos de ti',
    detailsHint: 'Todo es opcional. Nos ayuda a ajustar tu plan y a mejorar Studiare.',
    preferNot: 'Prefiero no decir',
    birthYear: 'Año de nacimiento',
    sex: 'Sexo',
    sexes: { female: 'Mujer', male: 'Hombre', other: 'Otro', undisclosed: 'Prefiero no decir' },
    state: 'Estado donde vives',
    situation: 'Situación actual',
    situations: {
      internship: 'Internado',
      social_service: 'Servicio social',
      graduated: 'Ya me titulé',
      working: 'Trabajo como médico general',
      other: 'Otra',
    },
    attempt: 'Intento en el ENARM',
    attempts: (n: number) => (n === 1 ? 'Primera vez' : n === 5 ? '5 o más' : `Intento ${n}`),
    targetSpecialty: 'Especialidad que buscas',
    avatarTitle: 'Foto de perfil',
    avatarInitials: 'Usar mis iniciales',
    avatarPhoto: 'Mi foto',
    uploadPhoto: 'Subir foto',
    avatarChangePhoto: 'Cambiar foto',
    avatarNote:
      'La foto se recorta en círculo y se guarda en un espacio privado de tu cuenta en la nube. La ves tú y, mientras compartan un grupo activo de Party, tus compañeros. Se borra al eliminar tu cuenta.',
    avatarLoading: 'Abriendo la foto…',
    avatarOpenError: 'No pudimos abrir esa imagen. Prueba con una foto JPG o PNG.',
    avatarTooBig: 'No pudimos reducir la foto lo suficiente. Prueba con otra más sencilla.',
    // Recorte circular antes de guardar (B2 del plan del cambio, comentario 15)
    avatarCrop: {
      title: 'Encuadra tu foto',
      hint: 'Arrastra la foto para encuadrarla y usa el control para acercarla.',
      preview: 'Vista previa de tu foto. Muévela con las flechas del teclado',
      zoom: 'Acercar',
      zoomValue: (zoom: number) => `${zoom.toFixed(1)} veces`,
      move: 'Mover la foto',
      moveUp: 'Mover hacia arriba',
      moveDown: 'Mover hacia abajo',
      moveLeft: 'Mover a la izquierda',
      moveRight: 'Mover a la derecha',
      use: 'Usar foto',
      cancel: 'Cancelar',
    },
    noAccount:
      'Este perfil se creó antes de las cuentas con correo. Agrega tu correo para guardar tus datos.',
  },
  progress: {
    description:
      'Cómo vas por rama troncal y por subespecialidad. Cada número aparece cuando hay respuestas suficientes para que sea confiable.',
    questions: 'Preguntas respondidas',
    accuracy: 'Exactitud',
    cards: 'Tarjetas repasadas',
    minutes: 'Minutos de estudio',
    trunksHint: 'Tu dominio estimado en cada rama, a partir de tus respuestas.',
    topicsHint:
      'Verde desde 75%, ámbar de 60% a 74% y rojo abajo de 60%. Mientras calibra se ven tus preguntas y tarjetas.',
    branchCounts: (questions: number, cards: number) =>
      `${questions.toLocaleString('es-MX')} preguntas · ${cards.toLocaleString('es-MX')} tarjetas`,
    topicCounts: (questions: number, cards: number) => `${questions} preg · ${cards} tarj`,
    mastery: (percent: number) => `Dominio estimado de ${percent}%`,
    calibrating: (missing: number) =>
      `Calibrando, faltan unas ${missing.toLocaleString('es-MX')} respuestas`,
    statsLabel: 'Tus cifras',
    statShort: {
      questions: 'Preguntas',
      accuracy: 'Exactitud',
      cards: 'Tarjetas',
      minutes: 'Minutos',
    },
    statRest: { questions: 'respondidas', cards: 'repasadas', minutes: 'de estudio' },
    masteryLabel: 'Dominio estimado',
    focusTitle: (n: number) =>
      n === 0
        ? 'Tus focos de la semana'
        : n === 1
          ? 'Tu foco de la semana'
          : `Tus ${n} focos de la semana`,
    focusCalibrating: (have: number, need: number) =>
      `Calibrando. Tus focos aparecen al juntar ${need} respuestas y llevas ${have}.`,
    focusKinds: { technique: 'Técnica', topic: 'Tema' },
    weakTopic: (percent: number) =>
      `Tu dominio estimado es de ${percent}%. Practica preguntas de este tema para subirlo.`,
    practice: 'Practicar',
    reviewNow: 'Repasar',
    showEmpty: (n: number) => `Mostrar las que no tienen datos (${n})`,
    hideEmpty: 'Ocultar las que no tienen datos',
    emptyHidden: (n: number) =>
      plural(n, 'subespecialidad sin datos todavía', 'subespecialidades sin datos todavía'),
    difficultyTitle: 'Según la dificultad',
    difficultyOf: (correct: number, total: number) =>
      `${correct.toLocaleString('es-MX')} de ${total.toLocaleString('es-MX')} correctas`,
    difficultyCalibrating: (missing: number) =>
      `Calibrando, faltan ${plural(missing, 'respuesta', 'respuestas')} en este grupo`,
    futureLoad: {
      title: 'Carga futura',
      hint: 'Cuántos repasos y tarjetas nuevas te tocan, con tu configuración de hoy. Supone que contestas Bien en cada repaso y que empiezas tus tarjetas nuevas al ritmo de tu límite diario.',
      horizonLabel: 'Periodo',
      horizon: (days: number) => `${days} días`,
      average: 'Repasos por día en promedio',
      peak: 'Día más cargado',
      peakValue: (day: string, total: number) =>
        `${day} con ${plural(total, 'tarjeta', 'tarjetas')}`,
      total: 'Repasos en el periodo',
      newCards: 'Tarjetas nuevas en el periodo',
      chart: (days: number, average: number, peak: string) =>
        `Carga de los próximos ${days} días. ${average} repasos por día en promedio y el día más cargado es ${peak}.`,
      chartEmpty: (days: number) => `Sin carga en los próximos ${days} días.`,
      reviews: 'Repasos',
      fresh: 'Nuevas',
      weeks: 'Ver por semana',
      week: (start: string) => `Semana del ${start}`,
      empty: 'Todavía no sigues ningún mazo, así que no hay carga que proyectar.',
      goToDecks: 'Ir a Mazos',
    },
    // La pantalla rediseñada (D-150). El título va en el contenido con su kicker
    kicker: 'Progreso',
    title: 'Cómo vas',
    moreTitle: 'Más de tu progreso',
    summary: {
      label: 'Tus cifras recientes',
      accuracy: 'Aciertos',
      accuracyDelta: (points: number) => `${Math.abs(points)} pts`,
      accuracyTrendLabel: (days: number) =>
        `Aciertos de cada día con respuestas, últimos ${days} días`,
      retention: 'Retención',
      retentionGoal: (percent: number) => `meta ${percent} %`,
      questions: 'Preguntas',
      questionsCaption: 'en 30 días',
      questionsDelta: (percent: number) => `${Math.abs(percent)} %`,
      questionsBarsLabel: (days: number, total: number) =>
        `Preguntas de cada uno de los últimos ${days} días, ${total.toLocaleString('es-MX')} en total`,
      streak: 'Racha',
      streakDays: (days: number) => plural(days, 'día', 'días'),
      streakBest: (days: number) => `Tu mejor racha es de ${days.toLocaleString('es-MX')}`,
      streakBarsLabel: (days: number) =>
        `Tarjetas y preguntas de cada uno de los últimos ${days} días`,
      calibrating: 'Calibrando',
      calibratingAnswers: (have: number, need: number) =>
        `Llevas ${have.toLocaleString('es-MX')} de ${need.toLocaleString('es-MX')} respuestas en 30 días.`,
      calibratingReviews: (have: number, need: number) =>
        `Llevas ${have.toLocaleString('es-MX')} de ${need.toLocaleString('es-MX')} repasos de tarjetas maduras.`,
    },
    branchAccuracy: {
      title: 'Aciertos por rama',
      bar: (branch: string, percent: number) => `${branch}, dominio estimado de ${percent} %`,
      calibrating: (branch: string, have: number, need: number) =>
        `${branch}, calibrando con ${have} de ${need} respuestas`,
      hint: 'El dominio estimado de cada rama con tus respuestas. Una rama con pocas preguntas todavía se mueve mucho.',
      fewest: (branch: string, answered: number) =>
        `${branch} es la rama con menos preguntas contestadas, ${answered.toLocaleString('es-MX')}.`,
      empty: 'Tus ramas aparecen aquí cuando contestes tus primeras preguntas.',
    },
    pulse: {
      title: 'Pulso de estudio',
      label: (score: number) => `Pulso de estudio ${score} de 100`,
      calibratingLabel: 'Pulso de estudio calibrando',
      of100: '/100',
      tone: { good: 'Vas bien', near: 'Vas regular', low: 'Hay que empujar' },
      toneHint: {
        good: 'Repasos al día, aciertos arriba y ritmo estable.',
        near: 'Alguna de las tres partes flaquea. Mira cuál suma menos.',
        low: 'Las tres partes van bajas. Vuelve al ritmo con sesiones cortas y diarias.',
      },
      part: (name: string, max: number) => `${name}, ${max} puntos`,
      parts: { consistency: 'Constancia', accuracy: 'Aciertos', retention: 'Retención' },
      calibratingHint: 'Resume tu constancia, tus aciertos y tu retención de los últimos días.',
      needed: (activeDays: number, answered: number, reviews: number) => {
        const parts = [
          activeDays > 0 ? plural(activeDays, 'día con actividad', 'días con actividad') : null,
          answered > 0 ? plural(answered, 'pregunta', 'preguntas') : null,
          reviews > 0 ? plural(reviews, 'repaso', 'repasos') : null,
        ].filter((part): part is string => part !== null);
        return `Faltan ${parts.join(', ')}.`;
      },
    },
    radar: {
      title: 'Tu perfil por rama',
      label: (now: string, before: string | null, target: number) =>
        `Radar con el dominio estimado por rama. ${now}${before ? ` Hace un mes, ${before}` : ''} La meta está en ${target} por ciento.`,
      point: (branch: string, percent: number) => `${branch} ${percent}`,
      you: 'Tú, ahora',
      before: 'Hace un mes',
      target: (percent: number) => `Meta ${percent} %`,
      calibrating: (ready: number, need: number) =>
        `Calibrando. El radar aparece con ${need} ramas listas y llevas ${ready}.`,
      short: {
        internal_medicine: 'Med. interna',
        pediatrics: 'Pediatría',
        obstetrics_gynecology: 'Ginecología',
        general_surgery: 'Cirugía',
        family_medicine: 'Familiar',
        emergency_medicine: 'Urgencias',
      } as Record<string, string>,
    },
    weekday: {
      title: 'Preguntas por día',
      caption: 'Preguntas por día de la semana',
      thisWeek: 'Esta semana',
      lastWeek: 'Semana pasada',
      more: (n: number) => `${n.toLocaleString('es-MX')} más`,
      fewer: (n: number) => `${n.toLocaleString('es-MX')} menos`,
      same: 'Igual',
      compare: (average: number) =>
        `que la semana pasada · promedio de ${average.toLocaleString('es-MX')} al día`,
      days: ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'],
    },
    indicators: {
      title: 'Indicadores clave',
      calibrating: 'Calibrando',
      names: {
        retention: 'Retención',
        accuracy: 'Aciertos',
        pace: 'Tiempo por pregunta',
        confidence: 'Confianza calibrada',
        fatigue: 'Fatiga',
        changes: 'Cambios de respuesta',
      },
      states: {
        optimal: 'Óptima',
        optimalM: 'Óptimo',
        near: 'Cerca de la meta',
        below: 'Por debajo de la meta',
        slow: 'Algo lento',
        verySlow: 'Lento',
        calibrated: 'Bien',
        overconfident: 'Sobreconfianza',
        underconfident: 'Te falta confianza',
        noSignal: 'Sin señal',
        likely: 'Probable',
        watch: 'A vigilar',
        harmful: 'Te perjudican',
      },
      notes: {
        retention: (percent: number) => `Meta de FSRS en ${percent} %`,
        accuracy: (percent: number) => `Meta en ${percent} %`,
        pace: (seconds: number) => `Ritmo ENARM, ${seconds} s`,
        confidence: (nominal: number) => `Con Seguro deberías acertar ${nominal} %`,
        fatigue: (sessions: number) =>
          `Caída del último tercio en ${plural(sessions, 'sesión larga', 'sesiones largas')}`,
        fatigueUnvalidated: 'El detector aún se valida con los datos de todos',
        changes: (worse: number, total: number) =>
          `${worse.toLocaleString('es-MX')} de ${total.toLocaleString('es-MX')} cambios empeoraron`,
      },
      units: { percent: '%', seconds: 's', points: 'pts' },
      bar: (name: string, value: string) => `${name}, ${value}`,
    },
    biases: {
      title: { bias: 'Sesgos que te atrapan', trap: 'Trampas que te atrapan' },
      pattern: 'Patrón',
      seeAll: 'Ver tu perfil completo abajo',
    },
    weakTopics: {
      title: 'Temas por reforzar',
      simulate: 'Simular estos temas',
      practice: (topic: string) => `Practicar ${topic}`,
    },
    sessions: {
      title: 'Últimas sesiones',
      columns: {
        name: 'Sesión',
        mode: 'Modo',
        date: 'Fecha',
        state: 'Estado',
        score: 'Aciertos',
      },
      modes: { review: 'Repaso', practice: 'Práctica', exam: 'Examen', challenge: 'Reto' },
      name: (kind: 'review' | 'practice' | 'exam' | 'challenge', items: number | null) => {
        const mode = { review: 'Repaso', practice: 'Práctica', exam: 'Examen', challenge: 'Reto' }[
          kind
        ];
        if (items === null) return mode;
        return `${mode} de ${plural(items, kind === 'review' ? 'tarjeta' : 'pregunta', kind === 'review' ? 'tarjetas' : 'preguntas')}`;
      },
      states: { completed: 'Terminada', abandoned: 'Abandonada', open: 'Sin cerrar' },
      empty: 'Tus sesiones aparecen aquí cuando termines tu primer repaso o práctica.',
      seeResults: 'Ver los resultados del examen',
    },
  },
  topicPicker: {
    trunks: 'Ramas troncales',
    subspecialties: 'Subespecialidades',
    all: 'Seleccionar todo',
    none: 'Quitar todo',
    selected: (n: number, of: number) => `${n} de ${of} subespecialidades`,
    questions: (n: number) => `${n.toLocaleString('es-MX')} preguntas`,
    noQuestions: 'Sin preguntas todavía',
    of: (n: number, of: number) => `${n} de ${of}`,
    toggle: (branch: string, n: number, of: number) =>
      `Ver las subespecialidades de ${branch}, ${n} de ${of} marcadas`,
    title: 'Ramas y subespecialidades',
  },
  // Atrasos y fechas de repaso (D-085, fila 5). Solo cambian la fecha, la memoria de la tarjeta no
  overdue: {
    title: 'Atrasos y fechas de repaso',
    summary: (overdue: number) =>
      overdue === 0 ? 'Sin atrasos' : plural(overdue, 'atrasada', 'atrasadas'),
    recoveryTitle: (n: number) => `Tienes ${plural(n, 'tarjeta atrasada', 'tarjetas atrasadas')}`,
    recoveryBody:
      'Se juntaron repasos de días anteriores. Repartirlos en varios días evita una avalancha. Tus tarjetas no pierden lo aprendido, solo cambia el día en que las ves.',
    noOverdue: 'No tienes tarjetas atrasadas.',
    // Las cuatro herramientas van de la más segura a la más arriesgada, con su etiqueta (V4-B3)
    orderNote: 'Van de la más segura a la más arriesgada. Empieza por la primera.',
    risk: {
      safe: 'Seguro',
      care: 'Con cuidado',
      last: 'Último recurso',
      free: 'Si te sobra tiempo',
    },
    spreadBody:
      'Reparte las vencidas en varios días, las más olvidadas primero. No pierdes nada y no se acumula una avalancha.',
    safeTitle: 'Posponer solo lo que aguanta',
    safeBody:
      'Mueve las tarjetas que, para ese día, todavía recordarías casi igual de bien. Las que se olvidarían más se quedan para que las repases hoy.',
    safeCount: (safe: number, total: number) =>
      total === 0
        ? 'No hay tarjetas que venzan hoy ni antes.'
        : `${safe.toLocaleString('es-MX')} de ${total.toLocaleString('es-MX')} se pueden posponer sin daño.`,
    safeButton: (n: number) => `Posponer ${plural(n, 'tarjeta', 'tarjetas')} sin daño`,
    memoryNote:
      'La memoria de cada tarjeta no cambia, solo su fecha. En su próximo repaso se toma en cuenta el tiempo que pasó.',
    spreadTitle: 'Repartir los atrasos',
    spreadDays: 'Repartir entre',
    spreadDaysOption: (n: number) => (n === 1 ? '1 día, solo hoy' : `${n} días`),
    spreadPreview: 'Así quedarían',
    previewDay: (label: string, count: number) => `${label} ${count.toLocaleString('es-MX')}`,
    today: 'Hoy',
    overCapacity:
      'Son más de las que caben con tu límite de repasos por día. Se reparten parejo de todos modos.',
    noDays: 'Ya no hay días antes de tu examen para repartir.',
    spreadButton: (n: number) => `Repartir ${plural(n, 'tarjeta', 'tarjetas')}`,
    postponeTitle: 'Posponer todo, sin elegir',
    postponeWarning:
      'Mueve todas las tarjetas de hoy y las atrasadas, también las que se olvidarían más. En su próximo repaso las verás más difíciles y fallarás más. Úsalo solo si no hay de otra, por ejemplo antes de un viaje.',
    postponeConfirm: 'Entiendo que algunas tarjetas se van a olvidar más',
    postponeBody: (n: number) =>
      n === 0
        ? 'No hay tarjetas que venzan hoy ni antes.'
        : `${plural(n, 'tarjeta vence', 'tarjetas vencen')} hoy o antes.`,
    postponeDays: 'Posponer',
    postponeOption: (n: number) => (n === 1 ? '1 día' : `${n} días`),
    postponeButton: (n: number) => `Posponer ${plural(n, 'tarjeta', 'tarjetas')}`,
    advanceTitle: 'Adelantar repasos',
    advanceBody: (n: number) =>
      n === 0
        ? 'No hay repasos programados para los próximos días.'
        : `Hay ${plural(n, 'repaso programado', 'repasos programados')} para los próximos días.`,
    advanceCount: 'Cuántos traer a hoy',
    advanceButton: (n: number) => `Adelantar ${plural(n, 'repaso', 'repasos')}`,
    undoTitle: 'Deshacer',
    undoBody: (kind: 'spread' | 'postpone' | 'advance', cards: number) =>
      `El último cambio fue ${{ spread: 'repartir', postpone: 'posponer', advance: 'adelantar' }[kind]} ${plural(cards, 'tarjeta', 'tarjetas')}. Las que ya repasaste desde entonces no se tocan.`,
    undoButton: 'Deshacer el último cambio',
    working: 'Moviendo fechas…',
    done: {
      spread: (n: number) => `${plural(n, 'tarjeta repartida', 'tarjetas repartidas')}.`,
      postpone: (n: number) => `${plural(n, 'tarjeta pospuesta', 'tarjetas pospuestas')}.`,
      advance: (n: number) => `${plural(n, 'repaso adelantado', 'repasos adelantados')}.`,
      undo: (n: number) =>
        `${plural(n, 'tarjeta regresada', 'tarjetas regresadas')} a su fecha de antes.`,
      nothing: 'No hubo nada que mover.',
    },
    error: 'No se pudieron mover las fechas. Intenta de nuevo.',
  },
  // Estadísticas de un mazo que se sigue (V4-B3)
  deckStats: {
    title: 'Estadísticas del mazo',
    summary: (due: number, total: number) =>
      `${due.toLocaleString('es-MX')} ${due === 1 ? 'toca' : 'tocan'} hoy de ${total.toLocaleString('es-MX')}`,
    fresh: 'Nuevas',
    learning: 'Aprendiendo',
    review: 'En repaso',
    mature: 'Maduras',
    matureHint: 'En repaso con 21 días o más de intervalo',
    dueToday: 'Tocan hoy',
    overdue: 'Atrasadas',
    retention: 'Retención estimada',
    retentionValue: (value: number) => `${Math.round(value * 100)}%`,
    retentionHint:
      'Qué tanto recordarías hoy, en promedio, las tarjetas que ya repasas. Es una estimación del modelo de memoria, no una predicción de tu puntaje.',
    calibrating: (needed: number) =>
      `Faltan ${needed.toLocaleString('es-MX')} tarjetas en repaso para estimarla.`,
    intervals: 'Intervalos de las tarjetas en repaso',
    buckets: {
      under1: 'Menos de 1 día',
      d1to6: '1 a 6 días',
      d7to20: '7 a 20 días',
      d21to59: '21 a 59 días',
      d60to179: '60 a 179 días',
      d180plus: '180 días o más',
    },
  },
  // Carga diaria. Perfil guía y tarjetas nuevas por día (D-085, fila 6)
  dailyLoad: {
    title: 'Carga diaria',
    guideTitle: 'Perfil guía',
    guideBody:
      'Con un toque dejas tu repaso como lo recomienda la guía de Anki. Retención de 90% y repasos que nunca pasan de tu examen.',
    guideAlready: 'Ya usas el perfil guía.',
    guideFields: {
      desiredRetention: 'Retención',
      maxIntervalDays: 'Intervalo máximo',
      spacing: 'Botones',
    },
    guideChange: (field: string, from: string, to: string) => `${field} pasa de ${from} a ${to}`,
    guideApply: 'Aplicar perfil guía',
    guideApplied: 'Listo, aplicamos el perfil guía.',
    // Distinto del campo Tarjetas nuevas por día, que desde B3 vive en el mismo panel
    suggestionTitle: 'Sugerencia de tarjetas nuevas',
    calculate: 'Calcular cuántas nuevas me convienen',
    unlimitedOn:
      'Tus tarjetas nuevas están sin límite. Entran todas las que haya cada día y los repasos de los días siguientes pueden juntarse.',
    needsMinutes:
      'Para calcular cuántas nuevas aguantas necesitamos saber cuántos minutos estudias al día.',
    goToPlan: 'Poner mis minutos en Progreso',
    noNewCards: 'No tienes tarjetas nuevas por ahora.',
    suggested: (n: number) =>
      `Te sugerimos ${plural(n, 'tarjeta nueva', 'tarjetas nuevas')} por día.`,
    basis: (budget: number) =>
      `Con ${plural(Math.round(budget), 'minuto', 'minutos')} al día para tarjetas, que es la mitad de tu tiempo de estudio.`,
    measuredNote: 'Calculado con tu ritmo real de repaso.',
    calibratingUnit: 'repasos tuyos',
    referenceTimes: 'Mientras tanto calculamos con tiempos de referencia y no con tu ritmo.',
    backlogOver:
      'Con los atrasos de ahora ya pasas el tiempo que tienes. Reparte los atrasos antes de sumar nuevas.',
    peak: (minutes: number, day: string) =>
      `El día más pesado sería ${day.toLowerCase()}, con unos ${Math.round(minutes)} minutos de tarjetas.`,
    use: (n: number) => `Usar ${n}`,
    applied: 'Listo, guardamos tu nuevo límite de tarjetas nuevas.',
    current: (n: number) => `Hoy tienes ${n} por día.`,
  },
  reviewSetup: {
    title: 'Qué quieres repasar',
    hint: 'Elige el modo, tus mazos y las ramas o subespecialidades. Tu avance se guarda en cada tarjeta, así que puedes cambiar cuando quieras.',
    mode: 'Modo',
    modes: {
      today: 'Lo que toca hoy',
      due: 'Solo vencidas',
      new: 'Solo nuevas',
      topic: 'Estudiar un tema',
    },
    // Estudiar un tema es aparte de lo que toca hoy (V4-B3)
    topicHint:
      'Estudias todas las tarjetas que elegiste, también las que no te tocan hoy y las nuevas, hasta 200 por sesión. Es adicional a tu repaso del día y no gasta tus tarjetas nuevas ni tus repasos de hoy. Lo que califiques sí cuenta para tu memoria.',
    decks: 'Mazos',
    cards: (n: number) => `${n.toLocaleString('es-MX')} en total`,
    filters: 'Mazos y temas',
    filtersSummary: (decks: number, topics: number, of: number) =>
      `${plural(decks, 'mazo', 'mazos')} · ${topics} de ${of} temas`,
    untagged: 'Incluir tarjetas sin subespecialidad',
    untaggedHint: 'Algunas notas no traen su subespecialidad. Entran con su mazo si lo marcaste.',
    start: (n: number) =>
      n === 0 ? 'Nada por repasar' : `Repasar ${plural(n, 'tarjeta', 'tarjetas')}`,
    nothing: 'Con esta selección no hay tarjetas para hoy. Prueba otro modo o más temas.',
    change: 'Cambiar mazo o tema',
    other: 'Repasar otros temas',
    addDeck: 'Agregar mazo',
    countersLabel: 'Lo que toca con esta selección',
    leeches: (n: number) =>
      n === 1
        ? 'Tienes 1 sanguijuela, una tarjeta que olvidas una y otra vez.'
        : `Tienes ${n.toLocaleString('es-MX')} sanguijuelas, tarjetas que olvidas una y otra vez.`,
    seeLeeches: 'Revisarlas en Buscar tarjetas',
  },
  studyPause: {
    title: 'Estudio pausado',
    body: (minutes: number) =>
      `No vimos actividad en un rato, así que pausamos tu tiempo. Llevas ${plural(minutes, 'minuto', 'minutos')} de estudio en esta sesión.`,
    resume: 'Reanudar',
    finish: 'Finalizar sesión',
  },
  levelLadder: levelLadderText,
  headerStats: headerStatsText,
  party: {
    privacy:
      'En un grupo compartes tu alias, tu XP, tu nivel y tu racha. En un duelo, además, cuántas aciertas y cuánto tardas en esas preguntas. Nunca tu exactitud por tema, tus sesgos ni tu conducta de estudio. Por ahora los grupos viven en este navegador.',
    createTitle: 'Crear un grupo',
    createHint: 'Aún no estás en ningún grupo. Crea uno o únete con un código.',
    groupName: 'Nombre del grupo',
    withFriends: 'Agregar compañeros simulados para probar la tabla y los retos',
    create: 'Crear grupo',
    joinTitle: 'Unirte con un código',
    joinHint: 'El código tiene 6 caracteres. Sin servidor, solo funciona con grupos creados aquí.',
    code: 'Código de invitación',
    join: 'Unirme',
    joinResults: {
      joined: 'Listo, ya estás en el grupo.',
      already: 'Ya estás en ese grupo.',
      not_found: 'No hay un grupo con ese código en este navegador.',
      invalid: 'El código tiene 6 letras o números, sin 0, O, 1, I ni L.',
      full: 'Ese grupo ya tiene 50 miembros.',
    },
    inviteCode: 'Código',
    copy: 'Copiar',
    copied: 'Copiado',
    leaderboard: 'Tabla de la semana',
    weekNote: 'XP desde el lunes a las 4 a. m. Se reinicia cada semana.',
    alias: 'Alias',
    level: 'Nivel',
    streak: 'Racha',
    weeklyXp: 'XP',
    you: 'tú',
    simulated: 'simulado',
    challenges: 'Retos del grupo',
    noChallenges: 'Todavía no hay retos.',
    progress: (total: number, target: number, unit: string) =>
      `${total.toLocaleString('es-MX')} de ${target.toLocaleString('es-MX')} ${unit}`,
    metrics: { cards: 'tarjetas', questions: 'preguntas', xp: 'XP', accuracy: 'preguntas' },
    claim: 'Reclamar 100 XP',
    claimed: 'Reto cumplido. Ya sumaste tus 100 XP.',
    needOwnContribution:
      'Tus compañeros simulados ya cumplieron la meta, pero tú todavía no aportas nada. Estudia algo y vuelve a reclamar tus 100 XP.',
    oneClaimPerDay: 'Hoy ya reclamaste el premio de un reto. El de este lo reclamas mañana.',
    newChallenge: 'Nuevo reto',
    challengeTitle: 'Nombre del reto',
    metric: 'Qué cuenta',
    target: 'Meta',
    createChallenge: 'Crear reto',
    cancel: 'Cancelar',
    leave: 'Salir del grupo',
    duel: {
      newButton: 'Retar a un compañero',
      rival: 'Compañero',
      noRivals:
        'Un duelo necesita un compañero. Crea el grupo con compañeros simulados para probarlo. Con personas reales llegará con la versión en línea.',
      create: 'Crear duelo',
      noQuestions: 'El banco todavía no tiene preguntas para armar un duelo.',
      createFailed: 'No se pudo crear el duelo. Intenta de nuevo.',
      title: (alias: string) => `Duelo contra ${alias}`,
      rules: (n: number) =>
        `Las mismas ${plural(n, 'pregunta', 'preguntas')} para los dos. Gana quien acierte más y, si empatan, quien tarde menos.`,
      oneTry: 'Es un solo intento. Las preguntas que no contestes cuentan como incorrectas.',
      rivalPlayed: 'Tu compañero ya jugó. Juega tus preguntas para ver quién ganó.',
      play: 'Jugar mi duelo',
      needQuestions: (n: number, left: number) =>
        `Este duelo pide ${plural(n, 'pregunta', 'preguntas')} y hoy te quedan ${left} en el plan Gratis.`,
      seePlans: 'Ver planes',
      result: 'Resultado del duelo',
      player: 'Jugador',
      hits: 'Aciertos',
      time: 'Tiempo',
      hitsOf: (correct: number, total: number) => `${correct} de ${total}`,
      you: 'Tú',
      verdicts: {
        win_accuracy: 'Ganaste por exactitud.',
        win_time: 'Ganaste por tiempo. Empataron en aciertos.',
        lose_accuracy: 'Perdiste por exactitud.',
        lose_time: 'Perdiste por tiempo. Empataron en aciertos.',
        draw: 'Empate. Mismos aciertos y mismo tiempo.',
      },
      seeResult: 'Ver el resultado del duelo',
    },
  },
  cloud: {
    loginNote:
      'Tu cuenta se guarda en la nube. Entras con un enlace o un código que te llega al correo, sin contraseña.',
    signInDescription:
      'Escribe tu correo y te enviamos un enlace y un código para entrar. Abre el enlace en este dispositivo o escribe aquí el código.',
    sendLink: 'Enviarme el enlace',
    sentTitle: 'Revisa tu correo',
    sentBody: (email: string) =>
      `Te enviamos un correo a ${email} con un enlace y un código. Si lo abres en este dispositivo, usa el enlace. Si lo abres en otro, como tu teléfono, escribe aquí el código. Si no lo ves, revisa la carpeta de spam.`,
    failedTitle: 'No pudimos enviar el enlace',
    failedBody: 'Intenta de nuevo en unos minutos. Tu cuenta ya quedó guardada en este navegador.',
    rateLimited:
      'Se enviaron demasiados enlaces en poco tiempo. Espera unos minutos e intenta de nuevo.',
    continue: 'Empezar a estudiar',
    continueLocal: 'Seguir en este navegador',
    retry: 'Usar otro correo',
    // Código del mismo correo, para entrar en un dispositivo distinto del que abrió el correo (D-115)
    code: {
      formLabel: 'Entrar con el código del correo',
      label: 'Código del correo',
      hint: 'Viene en el mismo correo, debajo del enlace. Úsalo si abriste el correo en otro dispositivo.',
      submit: 'Entrar con el código',
      verifying: 'Revisando el código…',
      verified: 'Código correcto. Conectando tu cuenta…',
      format: 'Escribe el código de 6 a 10 dígitos que viene en el correo.',
      errors: {
        invalid:
          'El código no es válido o ya venció. Usa el del correo más reciente o pide uno nuevo.',
        rate_limited: 'Hiciste demasiados intentos. Espera unos minutos e intenta de nuevo.',
        failed: 'No pudimos revisar el código. Revisa tu conexión e intenta de nuevo.',
      },
    },
    statusTitle: 'Cuenta en la nube',
    linked: (email: string) => `Conectada como ${email}.`,
    notLinked:
      'Aún no confirmas tu correo. Entra con el enlace o el código que te enviamos para guardar tu cuenta en la nube.',
    checking: 'Revisando tu cuenta en la nube…',
    error: 'No pudimos conectar con la nube. Tu avance sigue guardado en este navegador.',
    roleFromCloud: 'Tu rol viene de tu cuenta en la nube y solo un administrador lo puede cambiar.',
    // Dispositivo único por cuenta. Aparece cuando otro dispositivo entró y esta sesión se cerró
    otherDevice: otherDeviceText,
    // Aparece cuando el servidor no dejó cambiar de dispositivo por el límite de cambios al día
    deviceLimit: deviceLimitText,
    // Sincronización entre dispositivos (D-095). Se muestra con la cuenta en la nube conectada
    sync: {
      title: 'Sincronización entre dispositivos',
      scope:
        'Se sincronizan tus mazos propios, notas, tarjetas, apuntes, la distribución de tu Inicio y tu historial de repaso. Lo precargado viene con la app y tu apariencia es de cada dispositivo.',
      never: 'Todavía no se ha sincronizado en este navegador.',
      running: 'Sincronizando…',
      ok: (when: string) => `Todo al día. Última sincronización ${when}.`,
      okChanges: (pulled: number, pushed: number) =>
        `Se bajaron ${String(pulled)} y se subieron ${String(pushed)} cambios.`,
      rejected: (count: number) =>
        count === 1
          ? 'Un registro de la nube no se guardó porque no se pudo validar.'
          : `${String(count)} registros de la nube no se guardaron porque no se pudieron validar.`,
      network:
        'No hay conexión con la nube. Tus cambios siguen en este navegador y se subirán cuando vuelva la conexión.',
      auth: 'Tu sesión venció. Entra de nuevo con tu correo para seguir sincronizando.',
      device: 'Otro dispositivo tiene tu cuenta en este momento, así que aquí no se sincroniza.',
      server: 'La nube respondió con un error. Se vuelve a intentar en unos minutos.',
      local: 'Algo falló al guardar en este navegador. Se vuelve a intentar en unos minutos.',
      clock:
        'La nube rechazó cambios con una fecha en el futuro. Activa la fecha y hora automáticas de este dispositivo.',
      quota:
        'Tu cuenta llegó al límite de lo que se guarda en la nube. Tus cambios siguen en este navegador. Borra mazos o apuntes que ya no uses, o escribe a soporte, para seguir sincronizando.',
      clockSkew: (minutes: number) =>
        `La hora de este dispositivo difiere ${String(minutes)} minutos de la de la nube. Activa la fecha y hora automáticas para poder sincronizar.`,
      lastWas: (when: string) => `La última sincronización buena fue ${when}.`,
      syncNow: 'Sincronizar ahora',
    },
  },
  // Misiones de hoy en Inicio (Fase P bloque 6, 4.12 del plan del cambio). Logros, sus insignias, sus
  // ligas y las misiones de la semana se quitaron en B3 (comentario 14)
  missions: {
    progress: (current: number, target: number) => `${current} de ${target}`,
    done: 'Cumplida',
    titles: {
      dailyCards: (n: number) => `Repasa ${plural(n, 'tarjeta', 'tarjetas')}`,
      dailyQuestions: (n: number) => `Responde ${plural(n, 'pregunta', 'preguntas')}`,
      dailyMinutes: (n: number) => `Estudia ${plural(n, 'minuto', 'minutos')}`,
    },
  },
  // Referidos con mes gratis (Fase P bloque 11)
  referrals: {
    needsCloud:
      'Los referidos necesitan tu cuenta en la nube, porque el mes gratis lo da el servidor. Entra con tu correo para usarlos.',
    yourCode: 'Tu código',
    copy: 'Copiar código',
    copied: 'Código copiado',
    pending: (n: number) => plural(n, 'referido pendiente', 'referidos pendientes'),
    completed: (n: number) => plural(n, 'referido concretado', 'referidos concretados'),
    months: (n: number) => plural(n, 'mes gratis ganado', 'meses gratis ganados'),
    until: (date: string) => `Tu mes gratis vale hasta el ${date}.`,
    redeemTitle: 'Tengo un código',
    redeemLabel: 'Código de quien te invitó',
    redeem: 'Canjear código',
    redeemed: 'Listo. Cuando hagas tu primer pago, quien te invitó gana su mes gratis.',
    alreadyReferred: 'Ya canjeaste el código de quien te invitó.',
    results: {
      invalid: 'Ese código no existe. Revísalo.',
      own: 'No puedes canjear tu propio código.',
      already: 'Ya canjeaste un código antes.',
      circular:
        'Esa persona entró con tu código, así que no puedes entrar con el suyo. Dos compañeros no se invitan entre sí.',
      too_late: 'Ya pasó el tiempo para canjear un código con esta cuenta.',
      already_paid: 'Ya hiciste un pago, así que no puedes entrar como referido.',
      failed: 'No pudimos canjear el código. Intenta de nuevo en unos minutos.',
    },
    loadFailed: 'No pudimos cargar tus referidos. Intenta de nuevo en unos minutos.',
  },
  insights: insightText,
} as const;
