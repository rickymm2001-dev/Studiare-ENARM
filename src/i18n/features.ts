// Textos de las pantallas del alumno de la Fase C, en español de México con trato de tú (4.9).
// Se integran en t desde es-MX.ts.

export const branchNames: Record<string, string> = {
  internal_medicine: 'Medicina interna',
  pediatrics: 'Pediatría',
  obstetrics_gynecology: 'Ginecología y obstetricia',
  general_surgery: 'Cirugía general',
};

const plural = (n: number, one: string, many: string) =>
  `${n.toLocaleString('es-MX')} ${n === 1 ? one : many}`;

export const featureText = {
  plural,
  branchNames,
  session: {
    signedOutTitle: 'Entra para continuar',
    signedOutBody: 'Elige tu perfil o crea uno nuevo. Todo se guarda solo en este dispositivo.',
    goToWelcome: 'Ir a la bienvenida',
    demoEmptyTitle: 'La demostración está vacía',
    demoEmptyBody:
      'Genera los datos de demostración desde Perfil para ver esta pantalla con datos simulados.',
    goToProfile: 'Ir a Perfil',
    signOut: 'Cerrar sesión',
    simulatedLogin:
      'Inicio de sesión simulado. En el prototipo no hay contraseña ni servidor. En producción entrarás con tu cuenta.',
  },
  onboarding: {
    signInTitle: 'Entrar',
    signInDescription: 'Perfiles guardados en este dispositivo.',
    signInAs: (alias: string) => `Entrar como ${alias}`,
    examOn: (date: string) => `ENARM el ${date}`,
    noExamDate: 'Sin fecha de ENARM',
    createTitle: 'Crear tu perfil',
    createDescription: 'Lo puedes cambiar después en Perfil.',
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
    goalMetrics: { cards: 'Tarjetas', questions: 'Preguntas', focusMinutes: 'Minutos de enfoque' },
    privacyTitle: 'Aviso de privacidad (simulado)',
    privacyBody:
      'Tus datos viven en este dispositivo. Al LLM solo viajan IDs seudónimos y texto del banco, nunca tu nombre ni tu correo. Puedes exportar o borrar tus datos cuando quieras. Este aviso es un ejemplo del prototipo.',
    privacyAccept: 'Leí y acepto el aviso de privacidad',
    privacyError: 'Necesitas aceptar el aviso para continuar.',
    consentsTitle: 'Consentimientos por finalidad',
    consentsDescription: 'Son opcionales y los puedes cambiar en Perfil.',
    consents: {
      party: ['Party', 'Compartir alias, XP, nivel y racha con tus grupos.'],
      ai_analysis: [
        'Análisis con IA',
        'Usar tus errores para hipótesis del tutor, con IDs seudónimos.',
      ],
      anonymized_improvement: [
        'Mejora anónima',
        'Usar tus datos anonimizados para mejorar el banco.',
      ],
    },
    create: 'Crear perfil y empezar',
    creating: 'Creando…',
    demoNote: 'En la demostración entras como el alumno de demostración.',
    goHome: 'Ir al inicio',
  },
  home: {
    greeting: (alias: string) => `Hola, ${alias}`,
    edit: 'Editar tablero',
    doneEditing: 'Listo',
    presetLabel: 'Acomodo predefinido',
    presets: {
      essential: 'Esencial',
      analytic: 'Analítico',
      competitive: 'Competitivo',
      custom: 'Personalizado',
    },
    addLabel: 'Agregar widget',
    add: 'Agregar',
    moveUp: (name: string) => `Subir ${name}`,
    moveDown: (name: string) => `Bajar ${name}`,
    remove: (name: string) => `Quitar ${name}`,
    settings: (name: string) => `Ajustes de ${name}`,
    empty: 'Tu tablero está vacío. Agrega un widget o elige un acomodo.',
    comingSoon: 'Este widget llega en una fase siguiente.',
  },
  widgets: {
    names: {
      heatmap: 'Heatmap de estudio',
      pomodoro: 'Pomodoro',
      streak: 'Racha',
      level_xp: 'Nivel y XP',
      today: 'Para hoy',
      weak_topics: 'Temas débiles',
      exam_countdown: 'Cuenta regresiva al ENARM',
      bias_pattern: 'Patrón de sesgo',
      future_load: 'Carga futura',
      daily_goal: 'Meta diaria',
      party_challenge: 'Reto de Party',
      latest_hypothesis: 'Última hipótesis del tutor',
    },
    heatmap: {
      range: 'Rango',
      days: (n: number) => `${n} días`,
      metric: 'Métrica',
      metrics: { cards: 'Tarjetas', questions: 'Preguntas', focusMinutes: 'Minutos de enfoque' },
      summary: (active: number, total: number, sum: number, metric: string) =>
        `${active} de ${total} días con actividad. ${sum.toLocaleString('es-MX')} ${metric} en total.`,
      cell: (day: string, value: number, metric: string) => `${day}, ${value} ${metric}`,
      less: 'Menos',
      more: 'Más',
    },
    streak: {
      current: (n: number) => plural(n, 'día', 'días'),
      best: (n: number) => `Récord ${plural(n, 'día', 'días')}`,
      freezes: (n: number) => `${plural(n, 'congelador', 'congeladores')} guardados`,
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
    },
    countdown: {
      days: (n: number) => plural(n, 'día', 'días'),
      until: (date: string) => `para el ENARM del ${date}`,
      today: 'El ENARM es hoy. Mucho éxito',
      past: 'La fecha del ENARM ya pasó. Actualízala en Perfil',
      noDate: 'Agrega la fecha del ENARM en Perfil para ver la cuenta regresiva.',
    },
    goal: {
      progress: (done: number, goal: number, metric: string) => `${done} de ${goal} ${metric}`,
      metricNames: {
        cards: 'tarjetas',
        questions: 'preguntas',
        focusMinutes: 'minutos de enfoque',
      },
      met: 'Meta cumplida',
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
    remaining: (time: string, phase: string) => `${time} restantes de ${phase}`,
    finished: (phase: string) => `Terminó ${phase.toLowerCase()}`,
    next: (phase: string) => `Sigue ${phase.toLowerCase()}`,
    focusToday: (minutes: number) => `${minutes} minutos de enfoque hoy`,
    settings: 'Ajustes del Pomodoro',
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
    save: 'Guardar ajustes',
    saved: 'Ajustes guardados',
  },
} as const;
