// Textos de Configuración en una sola página, de Editar perfil y de Ajustes del repaso (B3 del plan
// del cambio, comentarios 4, 5, 6 y 16). Español de México con trato de tú. Se integran en
// t.settingsPage desde es-MX.ts.

export const settingsPageText = {
  // Las tres secciones de la página, cada una con su subtítulo y su línea divisoria
  sections: {
    profile: 'Perfil',
    appearance: 'Apariencia',
    privacy: 'Privacidad',
  },
  // Sin sesión solo queda Apariencia y esta frase
  signedOut: {
    body: 'Entra a tu cuenta para ver tu perfil, tu plan y tu privacidad.',
  },
  // Con la base de demostración vacía no hay alumno que mostrar
  demoEmpty: {
    body: 'Genera los datos de demostración en la pantalla Datos de demostración del admin para ver esta pantalla con datos simulados.',
    link: 'Ir a Datos de demostración',
  },
  plan: {
    title: 'Tu plan',
    price: (price: string, period: string) => `${price} ${period}`,
    simulated: 'Lo contrataste con el pago simulado, que no cobra nada.',
    paidUntil: (date: string) => `Tu periodo pagado va hasta el ${date}.`,
    referralUntil: (date: string) => `Tu mes gratis por referido termina el ${date}.`,
    change: 'Cambiar tu plan',
  },
  profile: {
    title: 'Tus datos',
    description:
      'Tu alias y tu foto se ven en Party. Lo demás es opcional y solo nos ayuda a ajustar tu plan.',
    edit: 'Editar perfil',
    save: 'Guardar',
    saving: 'Guardando…',
    cancel: 'Cancelar',
    saved: 'Guardamos tu perfil.',
    canceled: 'No cambió nada. Tu perfil sigue como estaba.',
    failed: 'No pudimos guardar tu perfil. Inténtalo de nuevo.',
    notSet: 'Sin dato',
    noEmail: 'Sin correo',
    examDate: 'Fecha de tu ENARM',
    examDateValue: (date: string, provisional: boolean) =>
      provisional ? `${date}, fecha provisional` : date,
    examDateHint: 'La fija la CIFRHS y es la misma para todos los alumnos.',
    demoNote: 'El alumno de demostración no tiene correo ni datos de cuenta.',
    emailNeeded: 'Escribe tu correo para guardar tu foto y tus datos de cuenta.',
  },
  session: {
    title: 'Tu sesión',
    open: (alias: string, device: string) =>
      `Sesión abierta como ${alias} en este dispositivo, ${device}.`,
    demo: 'Estás viendo al alumno de demostración. No hay una sesión que cerrar.',
  },
  // Aviso al salir de Configuración con cambios del perfil sin guardar (comentario 16)
  unsaved: {
    title: 'Tienes cambios sin guardar',
    body: 'Si sales ahora, se pierden los cambios de tu perfil.',
    stay: 'Seguir editando',
    leave: 'Salir sin guardar',
  },
  privacy: {
    scoreInProgress:
      'Tu puntaje oficial del ENARM se guarda en Progreso y solo con el permiso de mejora anónima.',
    goToProgress: 'Ir a Progreso',
  },
  officialScore: {
    turnOn: 'Activar la mejora anónima en Privacidad',
  },
  // Panel con todos los ajustes que se guardan del repaso, en Repasar (comentario 4)
  reviewSettings: {
    open: 'Ajustes del repaso',
    title: 'Ajustes del repaso',
    description:
      'Tus metas del día, cómo estudias, el repaso avanzado, la carga diaria y el Pomodoro. Valen para todos tus repasos.',
    close: 'Cerrar ajustes del repaso',
    limits: (newCards: number, reviews: number) =>
      `Cada día entran ${newCards.toLocaleString('es-MX')} nuevas y hasta ${reviews.toLocaleString('es-MX')} repasos.`,
    limitsUnlimited: (reviews: number) =>
      `Cada día entran todas las nuevas y hasta ${reviews.toLocaleString('es-MX')} repasos.`,
    changeLimits: 'Cambiar en Ajustes del repaso',
  },
  // Lo que pasó de Configuración a Datos de demostración del admin (5.4 del plan del cambio)
  demoTools: {
    off: {
      title: 'Las herramientas de demostración están apagadas',
      description:
        'En este entorno no se puede cambiar a la base de demostración ni generar datos simulados.',
    },
  },
} as const;
